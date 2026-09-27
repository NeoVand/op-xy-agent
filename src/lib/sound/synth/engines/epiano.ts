/**
 * epiano: an FM electric piano, a carrier and a modulator at 1:1, with a decaying high partial for
 * the strike. The evidence and its sources are in `docs/research/57-synth-engines.md`; what TE, the
 * device's screen or several reviewers establish is marked [E], our inference [I].
 *
 * - [E] TE: from a nice electric piano to a filthy synth. Reviewers hear FM; TE's OP-Z e-piano was
 *   eight FM algorithms. axis and epiano presets alone share the same hidden values after P1–P4,
 *   which suggests one FM core under both.
 * - [E] By ear: tone modulates a sine carrier with an operator that itself turns saw-like as the
 *   knob rises (amount and shape together); texture morphs the carrier from sine towards a peaky
 *   triangle, adding grit; punch adds a fast-decaying, higher-pitched second oscillator; tine is
 *   how long the modulation takes to fall back to the pure carrier: held at 0, plucky when high.
 * - [I] Carrier: W(φ + I(t)·m / 2π), where W is texture's waveform and m the modulator, a sine at
 *   the note with the DX7's averaged self-feedback β = FEEDBACK_MAX·tone² (sine → saw).
 * - [I] Index: I(t) = INDEX_MAX · tone^1.2 · v · D(t), v from 0.5 (softest) to 1 (hardest);
 *   D(t) = e^(−t/τ), τ from tine on a log scale, TINE_SLOW → TINE_FAST, and no decay at tine 0.
 * - [I] Texture: sine → triangle ((2/π)·asin of the sine) over its first half; then the triangle
 *   grows peaky (|x|^1…2) and asymmetric like a pickup's curve (x / (1 − b·x)²), which brings the
 *   grit and some even harmonics. Each shape is stored as a band-limited table at equal RMS, so
 *   texture changes the tone, not the level.
 * - [I] Punch: punch² · v · sin(2π · PUNCH_RATIO · φ) · e^(−t/PUNCH_SECONDS) added to the carrier.
 * - [I] Level: 1:1 FM loses up to 4 dB around an index of 2 (sidebands below 0 Hz fold back onto
 *   the fundamental out of phase), which would make each note swell as its modulation decays. The
 *   carrier is lifted by the inverse of that loss, measured once over index × feedback.
 * - [I] Key scaling: the index shrinks where the FM spectrum would pass Nyquist (FM pianos scale
 *   their modulators down the keyboard likewise), so high notes stay clean at a cost in bite.
 */
import { DcBlocker } from '../filters';
import { sin2pi } from '../sine';
import { WaveTable } from '../wavetable';
import type { EngineVoice } from './index';

// Calibration: our estimates until the owner's device is measured (57-synth-engines.md).
/**
 * FM index (radians) at full tone and velocity, before key scaling. With the modulator's feedback
 * at 1, an index of 1.5 comes closest to a saw (harmonics near 1/2, 1/3, 1/4, …) and 2 is the
 * brightest; past that 1:1 FM folds back onto the fundamental and grows duller again.
 */
const INDEX_MAX = 2.2;
/** Tone's curve into the index: index ∝ tone^TONE_CURVE, a little gentler at the bottom. */
const TONE_CURVE = 1.2;
/**
 * Modulator self-feedback (radians) at full tone: 0 keeps it a sine, 1 makes it a saw. Past 1 the
 * feedback loop starts to jump between its two solutions and the modulator grows edges.
 */
const FEEDBACK_MAX = 1;
/** Share of the index (and of punch) left at the softest velocity; the hardest keeps all of it. */
const VELOCITY_FLOOR = 0.5;
/** Tine's decay time constants (seconds) just above 0 and at full; tine 0 holds the brightness. */
const TINE_SLOW = 8;
const TINE_FAST = 0.03;
/** Punch: the partial's ratio to the note, its decay time constant (s), its level at full. */
const PUNCH_RATIO = 7;
const PUNCH_SECONDS = 0.025;
const PUNCH_LEVEL = 0.5;
/** Output gain: about 0.27 RMS at the default M1 (80s) on a 220 Hz note. */
const LEVEL = 0.38;

// Design constants.
/** Smoothing of every continuous parameter (seconds): fast, but no zipper or click. */
const SMOOTH_SECONDS = 0.005;
/**
 * The FM spectrum's estimated top, 1 + I·S(β)·(1 + TAIL) harmonics, may reach this share of
 * Nyquist before the index is scaled down; TAIL covers the Bessel sidebands past the modulated
 * phase's top speed. Both measured to keep aliasing near −50 dB or below at 1–2 kHz.
 */
const BANDWIDTH = 0.8;
const TAIL = 0.5;
/** Texture's stored shapes, at texture 0, 1/8, …, 1 (the first half blends exactly). */
const TEXTURE_FRAMES = 9;
/** Samples per drawn shape before it is band-limited. */
const CYCLE = 4096;
/** How peaky the triangle grows (extra exponent) and how asymmetric (pickup curve) at full. */
const PEAK = 1;
const ASYMMETRY = 0.25;
/** Highest peak a shape may have at equal RMS (a unit sine's); peakier shapes give up level. */
const SHAPE_PEAK = 2;
/** The level compensation's grid: index 0…3 rad by 0.25, feedback 0…1 rad by 0.1. */
const LIFT_INDEX_STEP = 0.25;
const LIFT_INDEXES = 13;
const LIFT_FEEDBACK_STEP = 0.1;
const LIFT_FEEDBACKS = 11;
/** The most the compensation lifts. */
const LIFT_MAX = 2;
/** The output's peak budget: the lift gives way where it would push a shape's peak past it. */
const PEAK_BUDGET = 1.05;

/** texture's waveform at `t` (0–1) for one point of a sine, `s`. */
function shape(t: number, s: number): number {
	const tri = (2 / Math.PI) * Math.asin(s);
	if (t <= 0.5) return s + (tri - s) * 2 * t;
	const b = 2 * t - 1;
	const peaky = Math.sign(tri) * Math.abs(tri) ** (1 + PEAK * b);
	const bend = 1 - ASYMMETRY * b * peaky;
	return peaky / (bend * bend);
}

/** The carrier's shapes across texture, band-limited, and how high each one peaks. */
interface Carriers {
	readonly table: WaveTable;
	/** Each shape's peak (at most {@link SHAPE_PEAK}). */
	readonly peaks: Float32Array;
}

/**
 * Draws texture's shapes, each at the RMS of a unit sine (less where its peak would pass
 * {@link SHAPE_PEAK}), DC removed, and stores them band-limited.
 */
function buildCarriers(): Carriers {
	const cycles: Float32Array[] = [];
	const peaks = new Float32Array(TEXTURE_FRAMES);
	for (let f = 0; f < TEXTURE_FRAMES; f++) {
		const t = f / (TEXTURE_FRAMES - 1);
		const cycle = new Float32Array(CYCLE);
		let mean = 0;
		for (let i = 0; i < CYCLE; i++) {
			cycle[i] = shape(t, Math.sin((2 * Math.PI * i) / CYCLE));
			mean += cycle[i] / CYCLE;
		}
		let power = 0;
		let peak = 0;
		for (let i = 0; i < CYCLE; i++) {
			cycle[i] -= mean;
			power += (cycle[i] * cycle[i]) / CYCLE;
			peak = Math.max(peak, Math.abs(cycle[i]));
		}
		const gain = Math.min(Math.SQRT1_2 / Math.sqrt(power), SHAPE_PEAK / peak);
		for (let i = 0; i < CYCLE; i++) cycle[i] *= gain;
		cycles.push(cycle);
		peaks[f] = peak * gain;
	}
	return { table: WaveTable.fromCycles(cycles), peaks };
}

/**
 * The gain that brings a sine carrier under 1:1 modulation back to its unmodulated RMS, over the
 * index × feedback grid: each point runs the averaged-feedback modulator until it settles and
 * measures two cycles of the carrier (DC left out, as the voice's DC blocker removes it).
 */
function buildLift(): Float32Array {
	const lift = new Float32Array(LIFT_INDEXES * LIFT_FEEDBACKS);
	const n = 256;
	for (let b = 0; b < LIFT_FEEDBACKS; b++) {
		const beta = b * LIFT_FEEDBACK_STEP;
		for (let a = 0; a < LIFT_INDEXES; a++) {
			const index = a * LIFT_INDEX_STEP;
			let y1 = 0;
			let y2 = 0;
			let sum = 0;
			let sum2 = 0;
			for (let i = 0; i < 5 * n; i++) {
				const p = (2 * Math.PI * (i % n)) / n;
				const m = Math.sin(p + (beta * (y1 + y2)) / 2);
				y2 = y1;
				y1 = m;
				if (i < 3 * n) continue;
				const y = Math.sin(p + index * m);
				sum += y;
				sum2 += y * y;
			}
			const mean = sum / (2 * n);
			const power = sum2 / (2 * n) - mean * mean;
			lift[b * LIFT_INDEXES + a] = Math.min(LIFT_MAX, Math.sqrt(0.5 / power));
		}
	}
	return lift;
}

let carrierTables: Carriers | null = null;
let liftTable: Float32Array | null = null;

/** The shared carrier shapes (built on first use). */
function carriers(): Carriers {
	carrierTables ??= buildCarriers();
	return carrierTables;
}

/** The shared level compensation (built on first use). */
function lifts(): Float32Array {
	liftTable ??= buildLift();
	return liftTable;
}

/** The compensation for `index` and feedback `beta` (radians), bilinear on the grid. */
function liftAt(lift: Float32Array, index: number, beta: number): number {
	const x = Math.min(Math.max(index / LIFT_INDEX_STEP, 0), LIFT_INDEXES - 1.001);
	const y = Math.min(Math.max(beta / LIFT_FEEDBACK_STEP, 0), LIFT_FEEDBACKS - 1.001);
	const i = Math.floor(x);
	const j = Math.floor(y);
	const fx = x - i;
	const fy = y - j;
	const at = j * LIFT_INDEXES + i;
	const low = lift[at] + (lift[at + 1] - lift[at]) * fx;
	const high =
		lift[at + LIFT_INDEXES] + (lift[at + LIFT_INDEXES + 1] - lift[at + LIFT_INDEXES]) * fx;
	return low + (high - low) * fy;
}

/**
 * How much faster than the note the modulated carrier's phase can run, per radian of index, for
 * feedback `beta`: the modulator's steepest slope, fitted to the averaged-feedback operator
 * (1.4 at β 0.3, 4.4 at 0.8, 8.8 at 1, 15 at 1.2).
 */
function steepness(beta: number): number {
	const b2 = beta * beta;
	return 1 + beta + 1.5 * b2 + 5 * b2 * b2;
}

export class EpianoVoice implements EngineVoice {
	readonly #sr: number;
	readonly #table: WaveTable;
	readonly #peaks: Float32Array;
	readonly #lifts = lifts();
	readonly #dc: DcBlocker;
	/** Per-sample smoothing coefficient and the punch's per-sample decay. */
	readonly #smooth: number;
	readonly #punchDecay: number;
	#dt = 0;
	#phase = 0;
	/** The modulator's last two outputs (its feedback). */
	#y1 = 0;
	#y2 = 0;
	/** Index (cycles of phase per unit of modulator) before the tine decay, and its target. */
	#index = 0;
	#indexTarget = 0;
	/** Feedback (cycles per unit of the summed last two outputs) and its target. */
	#feedback = 0;
	#feedbackTarget = 0;
	/** The carrier's level compensation (it ramps to its next value over each block). */
	#lift = 1;
	/** Texture as a frame of the carrier table, and its target. */
	#texture = 0;
	#textureTarget = 0;
	/** Punch level (with velocity and a guard below Nyquist), its target, and its decay so far. */
	#punch = 0;
	#punchTarget = 0;
	#punchEnv = 1;
	/** The tine decay so far and its per-sample factor. */
	#tine = 1;
	#tineDecay = 1;
	/** Velocity's share of index and punch. */
	#velocity = 1;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		({ table: this.#table, peaks: this.#peaks } = carriers());
		this.#dc = new DcBlocker(sampleRate);
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#punchDecay = Math.exp(-1 / (PUNCH_SECONDS * sampleRate));
	}

	start(hz: number, velocity: number, params: Float32Array): void {
		const v = (Math.min(Math.max(velocity, 1), 127) - 1) / 126;
		this.#velocity = VELOCITY_FLOOR + (1 - VELOCITY_FLOOR) * v;
		this.#phase = 0;
		this.#y1 = 0;
		this.#y2 = 0;
		this.#tine = 1;
		this.#punchEnv = 1;
		this.#dc.reset();
		// a note starts where its parameters are, not gliding in from the last note's
		this.control(hz, params);
		this.#index = this.#indexTarget;
		this.#feedback = this.#feedbackTarget;
		this.#texture = this.#textureTarget;
		this.#punch = this.#punchTarget;
		this.#lift = this.#liftFor(this.#index, this.#feedback, this.#texture, this.#punch);
	}

	control(hz: number, params: Float32Array): void {
		const dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		this.#dt = dt;
		const tone = clamp01(params[0]);
		const texture = clamp01(params[1]);
		const punch = clamp01(params[2]);
		const tine = clamp01(params[3]);
		const beta = FEEDBACK_MAX * tone * tone;
		// key scaling: the estimated top of the spectrum stays below Nyquist
		const spread = steepness(beta) * (1 + TAIL);
		const room = Math.max(0, (BANDWIDTH * 0.5) / dt - 1) / spread;
		const index = Math.min(INDEX_MAX * Math.pow(tone, TONE_CURVE) * this.#velocity, room);
		this.#indexTarget = index / (2 * Math.PI);
		this.#feedbackTarget = beta / (4 * Math.PI);
		this.#textureTarget = texture * (TEXTURE_FRAMES - 1);
		// the partial fades out as it nears Nyquist instead of folding back
		const top = PUNCH_RATIO * dt;
		const guard = Math.min(1, Math.max(0, (0.45 - top) / 0.05));
		this.#punchTarget = PUNCH_LEVEL * punch * punch * this.#velocity * guard;
		this.#tineDecay =
			tine <= 0 ? 1 : Math.exp(-1 / (TINE_SLOW * Math.pow(TINE_FAST / TINE_SLOW, tine) * this.#sr));
	}

	/**
	 * The level compensation at index `depth` and `feedback` (both in the voice's cycle units),
	 * given way where it would push the shape at `texture` (with the strike, `punch`, on top) past
	 * the peak budget.
	 */
	#liftFor(depth: number, feedback: number, texture: number, punch: number): number {
		const f = Math.min(texture, TEXTURE_FRAMES - 1.001);
		const at = Math.floor(f);
		const shapePeak = this.#peaks[at] + (this.#peaks[at + 1] - this.#peaks[at]) * (f - at);
		const lift = liftAt(this.#lifts, 2 * Math.PI * depth, 4 * Math.PI * feedback);
		return Math.min(lift, (PEAK_BUDGET / LEVEL - punch) / shapePeak);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const table = this.#table;
		const dc = this.#dc;
		const k = this.#smooth;
		const dt = this.#dt;
		const tineDecay = this.#tineDecay;
		const punchDecay = this.#punchDecay;
		let phase = this.#phase;
		let y1 = this.#y1;
		let y2 = this.#y2;
		let index = this.#index;
		let feedback = this.#feedback;
		let lift = this.#lift;
		let texture = this.#texture;
		let punch = this.#punch;
		let punchEnv = this.#punchEnv;
		let tine = this.#tine;
		const indexTarget = this.#indexTarget;
		const feedbackTarget = this.#feedbackTarget;
		const textureTarget = this.#textureTarget;
		const punchTarget = this.#punchTarget;
		// the compensation for where the smoothing and decays will be at the end of this block,
		// reached in a straight line: it tracks the index without lagging behind it
		const settle = Math.pow(1 - k, n);
		const feedbackEnd = feedbackTarget + (feedback - feedbackTarget) * settle;
		const liftEnd = this.#liftFor(
			(indexTarget + (index - indexTarget) * settle) * tine * Math.pow(tineDecay, n),
			feedbackEnd,
			textureTarget + (texture - textureTarget) * settle,
			(punchTarget + (punch - punchTarget) * settle) * punchEnv * Math.pow(punchDecay, n)
		);
		const liftStep = (liftEnd - lift) / n;
		// the band limit's spread for the feedback the modulator has over this block (not its target)
		const beta = 4 * Math.PI * Math.max(feedback, feedbackEnd);
		const spread = 2 * Math.PI * steepness(beta) * (1 + TAIL);
		for (let i = 0; i < n; i++) {
			index += (indexTarget - index) * k;
			feedback += (feedbackTarget - feedback) * k;
			lift += liftStep;
			texture += (textureTarget - texture) * k;
			punch += (punchTarget - punch) * k;
			tine *= tineDecay;
			punchEnv *= punchDecay;
			const m = sin2pi(phase + feedback * (y1 + y2));
			y2 = y1;
			y1 = m;
			const depth = index * tine;
			// the carrier table's band limit follows how fast the modulated phase can run
			const carrier = table.read(texture, phase + depth * m, dt * (1 + depth * spread));
			const strike = punch * punchEnv * sin2pi(PUNCH_RATIO * phase);
			const y = dc.process(LEVEL * (lift * carrier + strike));
			left[i] = y;
			right[i] = y;
			phase += dt;
			if (phase >= 1) phase -= 1;
		}
		this.#phase = phase;
		this.#y1 = y1;
		this.#y2 = y2;
		this.#index = index;
		this.#feedback = feedback;
		this.#lift = liftEnd;
		this.#texture = texture;
		this.#punch = punch;
		// far below hearing: stop before the decays reach denormal numbers
		this.#punchEnv = punchEnv < 1e-9 ? 0 : punchEnv;
		this.#tine = tine < 1e-9 ? 0 : tine;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
