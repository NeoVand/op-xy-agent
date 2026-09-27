/**
 * wavetable: nine tables of band-limited frames, scanned by position, bent by a phase-distorting
 * warp whose own phase can drift away from the note's. The evidence and its sources are in
 * `docs/research/57-synth-engines.md`; what TE, the device's screen or several reviewers establish
 * is marked [E], our inference [I].
 *
 * - [E] TE: nine tables; position scrolls through a table; warp reshapes the wave; drift pulls the
 *   warping away from the note's frequency, towards inharmonic sounds. Switching tables keeps the
 *   position; everything at 0 is a sine; positions blend smoothly.
 * - [E] Table names on the device's screen, with the wave at position 0: buzz (a saw, the default),
 *   zap (a saw), basic (triangle, then square, then sine across positions), geometric (a sine that
 *   gains harmonic ripples by position 74), fibonacci (a sine with denser ripples higher up),
 *   fractal (a saw made of smaller saws), crush (a stair-stepped sine) and drawbars (organ-like
 *   additive). The ninth was never seen.
 * - [E] Warp is drawn as a piecewise-linear phase distortion, its half-cycle point at about 0.49,
 *   0.38, 0.33 and 0.26 of the cycle at warp 0, 30, 40 and 62: PWM for any shape. Drift is LFO-like
 *   low down, FM-like in the middle and something else again at the top (a reviewer: a synced
 *   audio rate).
 * - [I] The tables are TE's content, so these are our own, built from formulas in the same
 *   families, 16 frames each. The ninth, "formant" (a resonance climbing the harmonics from a pure
 *   sine), comes first: it is the only order in which everything at 0 is a sine while buzz still
 *   starts on a saw. The eight seen tables follow in their order.
 * - [I] Warp: a second phase φw runs beside the note's φn; the table is read at
 *   φn + PD(φw) − φw, where PD(x) = x / 2d below the knee d = 0.5 − 0.41·warp and
 *   ½ + (x − d) / 2(1 − d) above it. With φw = φn this is plain phase distortion. The read speeds
 *   up by as much as 1/2d, so the band limit follows it; PD's two corners are rounded over a few
 *   samples (a sharp corner's harmonics fold back past Nyquist), which also softens the sharpest
 *   warps at high notes.
 * - [I] Drift: φw runs at the note × (1 + drift³): a slow sweep of the knee low down, an
 *   audio-rate clang in the middle, and at 1 twice the note, harmonic again. With warp at 0, PD is
 *   the identity and drift does nothing.
 */
import { fft } from '../analysis';
import { sin2pi } from '../sine';
import { partialsOf, WaveTable, type Partials } from '../wavetable';
import type { EngineVoice } from './index';

// Calibration: our estimates until the owner's device is measured (57-synth-engines.md).
/** The knee's travel: d = 0.5 − KNEE_TRAVEL·warp (fitted to the drawn half-cycle points). */
const KNEE_TRAVEL = 0.41;
/** Output gain: about 0.27 RMS at the default M1 (80s) on a 220 Hz note. */
const LEVEL = 0.55;

// Design constants.
/** Frames per table. */
const FRAMES = 16;
/** Smoothing of every continuous parameter (seconds). */
const SMOOTH_SECONDS = 0.005;
/** A table change crossfades over this long (and waits for the last one to finish). */
const FADE_SECONDS = 0.02;
/** Every frame's RMS before LEVEL (a unit sine's is 0.707) and the peak it may not pass. */
const FRAME_RMS = 0.5;
const FRAME_PEAK = 1.5;
/** Harmonics a frame is described with (the richest stored level's). */
const HARMONICS = 512;
/** Samples per drawn cycle. */
const CYCLE = 4096;
/**
 * Half the width of PD's rounded corners, in samples: the read's speed changes over about eight
 * samples instead of at once. A sharp corner's harmonics run on past Nyquist and fold back; these
 * stop short of it. At high notes the rounding takes a larger share of the cycle and softens the
 * sharpest warps: the key scaling that keeps them clean.
 */
const EDGE_SAMPLES = 4;
/**
 * A corner still spreads each harmonic around it; the band limit makes room for that spread by
 * counting this share of the speed's jump on top of the fastest speed.
 */
const EDGE_ROOM = 1;

/** Harmonic amplitudes in sine phase (a negative amplitude is the opposite phase). */
function signed(values: ArrayLike<number>): Partials {
	const amp = new Float32Array(values.length);
	const phase = new Float32Array(values.length);
	for (let i = 0; i < values.length; i++) {
		amp[i] = Math.abs(values[i]);
		phase[i] = values[i] < 0 ? Math.PI : 0;
	}
	return { amp, phase };
}

/** Amplitudes with one fixed phase per harmonic (Schroeder's spread), so blends never cancel. */
function spread(values: ArrayLike<number>): Partials {
	const amp = Float32Array.from(values, Math.abs);
	const phase = Float32Array.from(amp, (_, i) => (Math.PI * (i + 1) * (i + 1)) / 64);
	return { amp, phase };
}

/** `count` harmonics of a function of the harmonic number (1-based). */
const series = (count: number, f: (h: number) => number) =>
	Float64Array.from({ length: count }, (_, i) => f(i + 1));

/** 0 → 1 across [from, to]. */
const ramp = (x: number, from: number, to: number) =>
	Math.min(1, Math.max(0, (x - from) / (to - from)));

/** A drawn cycle from a function of phase (0–1). */
const draw = (f: (p: number) => number) =>
	partialsOf(Float32Array.from({ length: CYCLE }, (_, i) => f(i / CYCLE)));

/** A rising saw's harmonics: −2/(πh), all in one phase. */
const saw = (h: number) => -2 / (Math.PI * h);

/** Our ninth: a resonance climbing from the fundamental (a pure sine) to the 23rd harmonic. */
function formant(x: number): Partials {
	const centre = 1 + 22 * x ** 1.3;
	const width = 0.25 + 2.4 * x;
	return spread(
		series(64, (h) => Math.exp(-0.5 * ((h - centre) / width) ** 2) + (h === 1 ? 0.3 * x : 0))
	);
}

/** buzz: a saw, then a saw minus a shifted saw: a square, then a narrowing pulse. */
function buzz(x: number): Partials {
	const a = ramp(x, 0, 0.4);
	const w = 0.5 - 0.42 * ramp(x, 0.4, 1);
	const amp = new Float32Array(HARMONICS);
	const phase = new Float32Array(HARMONICS);
	for (let h = 1; h <= HARMONICS; h++) {
		// saw(φ) − a·saw(φ − w), harmonic by harmonic: (1 − a·e^(−2πihw)) times the saw's
		const re = 1 - a * Math.cos(2 * Math.PI * h * w);
		const im = a * Math.sin(2 * Math.PI * h * w);
		amp[h - 1] = (2 / (Math.PI * h)) * Math.hypot(re, im);
		phase[h - 1] = Math.PI + Math.atan2(im, re);
	}
	return { amp, phase };
}

/**
 * zap: a saw hard-synced to the note, its own rate climbing past six times it (ending between
 * whole numbers, where the note's fundamental would vanish into a plain saw an octave or more up).
 */
const zap = (x: number) => {
	const rate = 1 + 5.3 * x ** 1.5;
	return draw((p) => 2 * ((rate * p) % 1) - 1);
};

/** basic: triangle → square → sine. */
function basic(x: number): Partials {
	const tri = (h: number) => (h % 2 ? (8 / (Math.PI * h) ** 2) * (h % 4 === 1 ? 1 : -1) : 0);
	const square = (h: number) => (h % 2 ? 4 / (Math.PI * h) : 0);
	const sine = (h: number) => (h === 1 ? 1 : 0);
	return signed(
		series(HARMONICS, (h) =>
			x <= 0.5
				? tri(h) + (square(h) - tri(h)) * (x / 0.5)
				: square(h) + (sine(h) - square(h)) * ((x - 0.5) / 0.5)
		)
	);
}

/** geometric: a sine, joined one after another by harmonics 2, 4, 8, 16 and 32. */
function geometric(x: number): Partials {
	return signed(
		series(64, (h) => {
			if (h === 1) return 1;
			const j = Math.log2(h);
			if (!Number.isInteger(j)) return 0;
			return 0.7 * 0.8 ** (j - 1) * ramp(x, (j - 1) / 5, j / 5);
		})
	);
}

/** fibonacci: a sine, joined by harmonics 2, 3, 5, 8, 13, 21, 34 and 55, ever closer together. */
const FIBONACCI = [2, 3, 5, 8, 13, 21, 34, 55];
function fibonacci(x: number): Partials {
	return signed(
		series(64, (h) => {
			if (h === 1) return 1;
			const k = FIBONACCI.indexOf(h);
			if (k < 0) return 0;
			return (0.8 / Math.sqrt(k + 1)) * ramp(x, k / 8, (k + 1) / 8);
		})
	);
}

/** fractal: saws at 1, 2, 4, … 32 times the note, each `ratio` the size of the one before. */
function fractal(x: number): Partials {
	const ratio = 0.3 + 0.45 * x;
	return signed(
		series(HARMONICS, (h) => {
			// the saw at 2^j contributes to the harmonics 2^j divides, at its own 1/(h/2^j)
			let sum = 0;
			for (let j = 0, scale = 1; j <= 5 && h % (1 << j) === 0; j++, scale *= 2 * ratio) {
				sum += scale;
			}
			return saw(h) * sum;
		})
	);
}

/** crush: a sine held at 16 steps a cycle, then fewer, down to 2 (a square). */
const crush = (x: number) => {
	const steps = Math.max(2, Math.round(16 * 0.125 ** x));
	return draw((p) => Math.sin((2 * Math.PI * (Math.floor(p * steps) + 0.5)) / steps));
};

/** drawbars: 8′, 4′ and 2⅔′ at first, then 2′, 1⅓′, 1′ and 1⅗′ pulled out one by one. */
const DRAWBARS = [1, 2, 3, 4, 6, 8, 5];
function drawbars(x: number): Partials {
	const levels = [1, 0.6, 0.35, 0, 0, 0, 0];
	for (let k = 1; k < DRAWBARS.length; k++) {
		const pulled = ramp(x, (k - 1) / (DRAWBARS.length - 1), k / (DRAWBARS.length - 1));
		levels[k] = Math.max(levels[k], pulled);
	}
	const amp = new Float64Array(8);
	DRAWBARS.forEach((h, k) => (amp[h - 1] = levels[k] ** 1.5));
	return spread(amp);
}

/** The tables in the engine's order, with our names. */
export const TABLES: readonly { readonly name: string; readonly frame: (x: number) => Partials }[] =
	[
		{ name: 'formant', frame: formant },
		{ name: 'buzz', frame: buzz },
		{ name: 'zap', frame: zap },
		{ name: 'basic', frame: basic },
		{ name: 'geometric', frame: geometric },
		{ name: 'fibonacci', frame: fibonacci },
		{ name: 'fractal', frame: fractal },
		{ name: 'crush', frame: crush },
		{ name: 'drawbars', frame: drawbars }
	];

/** A frame at {@link FRAME_RMS}, or lower where its peak would pass {@link FRAME_PEAK}. */
function normalized(p: Partials): Partials {
	// the frame as its richest level will store it, by inverse FFT, for its peak
	const n = 4 * HARMONICS;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	let power = 0;
	for (let h = 1; h <= Math.min(p.amp.length, HARMONICS); h++) {
		const a = p.amp[h - 1];
		const phi = p.phase?.[h - 1] ?? 0;
		power += (a * a) / 2;
		// X[h] = −i·n·a/2·e^{iφ}: the inverse FFT gives a·sin(2πhk/n + φ)
		re[h] = (n / 2) * a * Math.sin(phi);
		im[h] = -(n / 2) * a * Math.cos(phi);
		re[n - h] = re[h];
		im[n - h] = -im[h];
	}
	fft(re, im, true);
	let top = 0;
	for (let i = 0; i < n; i++) top = Math.max(top, Math.abs(re[i]));
	const gain = Math.min(FRAME_RMS / Math.sqrt(power), FRAME_PEAK / top);
	return { amp: Float32Array.from(p.amp, (a) => a * gain), phase: p.phase };
}

const built: (WaveTable | undefined)[] = [];

/** Table `t`, built on first use and shared by every voice. */
function table(t: number): WaveTable {
	let w = built[t];
	if (!w) {
		const frames = Array.from({ length: FRAMES }, (_, f) =>
			normalized(TABLES[t].frame(f / (FRAMES - 1)))
		);
		w = WaveTable.fromPartials(frames);
		built[t] = w;
	}
	return w;
}

/**
 * The integral of a step rounded into a raised-cosine edge of half-width `tau`: 0 well before the
 * edge, `u` well after it, smooth between.
 */
function soft(u: number, tau: number): number {
	if (u <= -tau) return 0;
	if (u >= tau) return u;
	return 0.5 * (u + tau) - (tau / Math.PI) * sin2pi((u + tau) / (4 * tau));
}

/**
 * Warp's phase distortion at `x` (0–1) with its knee at `d`: slope `below` up to the knee and
 * `above` after it (so PD(d) = ½ and PD(1) = 1), each change of slope rounded over ±`tau`
 * (at most ¼). The slope is `above` plus (below − above) × a box from 0 to d with raised-cosine
 * edges; PD is its integral, one box per cycle, the neighbouring cycles' edges included.
 */
export function warpPd(x: number, d: number, below: number, above: number, tau: number): number {
	const box =
		soft(x, tau) -
		soft(0, tau) -
		soft(x - d, tau) +
		soft(-d, tau) +
		soft(x - 1, tau) -
		soft(x - 1 - d, tau);
	return above * x + (below - above) * box;
}

export class WavetableVoice implements EngineVoice {
	readonly #sr: number;
	readonly #smooth: number;
	readonly #fadeStep: number;
	#dt = 0;
	/** The note's phase and the warp's. */
	#phase = 0;
	#warpPhase = 0;
	/** The table sounding, the one fading out (and how far the fade has come), and the target. */
	#table!: WaveTable;
	#from!: WaveTable;
	#index = 0;
	#fade = 1;
	#target = 0;
	/** Position (a frame), knee, drift (δ): smoothed. */
	#frame = 0;
	#frameTarget = 0;
	#knee = 0.5;
	#kneeTarget = 0.5;
	#drift = 0;
	#driftTarget = 0;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#fadeStep = 1 / (FADE_SECONDS * sampleRate);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#phase = 0;
		this.#warpPhase = 0;
		this.control(hz, params);
		// a note starts where its parameters are, not fading in from the last note's
		this.#index = this.#target;
		this.#table = this.#from = table(this.#target);
		this.#fade = 1;
		this.#frame = this.#frameTarget;
		this.#knee = this.#kneeTarget;
		this.#drift = this.#driftTarget;
	}

	control(hz: number, params: Float32Array): void {
		this.#dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		this.#target = Math.min(TABLES.length - 1, Math.floor(clamp01(params[0]) * TABLES.length));
		this.#frameTarget = clamp01(params[1]) * (FRAMES - 1);
		this.#kneeTarget = 0.5 - KNEE_TRAVEL * clamp01(params[2]);
		const drift = clamp01(params[3]);
		this.#driftTarget = drift * drift * drift;
		// a new table waits until the last crossfade has finished (start() sets the first one)
		if (this.#table && this.#target !== this.#index && this.#fade >= 1) {
			this.#from = this.#table;
			this.#table = table(this.#target);
			this.#index = this.#target;
			this.#fade = 0;
		}
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const k = this.#smooth;
		const dt = this.#dt;
		const into = this.#table;
		const from = this.#from;
		const fadeStep = this.#fadeStep;
		let fade = this.#fade;
		let phase = this.#phase;
		let warpPhase = this.#warpPhase;
		let frame = this.#frame;
		let knee = this.#knee;
		let drift = this.#drift;
		const frameTarget = this.#frameTarget;
		const kneeTarget = this.#kneeTarget;
		const driftTarget = this.#driftTarget;
		for (let i = 0; i < n; i++) {
			frame += (frameTarget - frame) * k;
			knee += (kneeTarget - knee) * k;
			drift += (driftTarget - drift) * k;
			const dtw = dt * (1 + drift);
			const below = 0.5 / knee;
			const above = 0.5 / (1 - knee);
			// PD(φw) − φw added to the note's phase: plain phase distortion when φw = φn, and at
			// warp 0 (PD the identity) nothing at all, whatever the drift
			const pd =
				below - above < 1e-9
					? warpPhase
					: warpPd(warpPhase, knee, below, above, Math.min(0.25, EDGE_SAMPLES * dtw));
			const read = phase + pd - warpPhase;
			// the read runs at dt + (PD′ − 1)·dtw: band-limit for the faster of the two segments,
			// with room for the corners' spread
			const speed =
				Math.max(Math.abs(dt + (below - 1) * dtw), Math.abs(dt + (above - 1) * dtw)) +
				EDGE_ROOM * (below - above) * dtw;
			const limit = speed;
			let y = into.read(frame, read, limit);
			if (fade < 1) {
				y = y * fade + from.read(frame, read, limit) * (1 - fade);
				fade += fadeStep;
			}
			const out = LEVEL * y;
			left[i] = out;
			right[i] = out;
			phase += dt;
			if (phase >= 1) phase -= 1;
			warpPhase += dtw;
			if (warpPhase >= 1) warpPhase -= 1;
		}
		this.#fade = Math.min(fade, 1);
		this.#phase = phase;
		this.#warpPhase = warpPhase;
		this.#frame = frame;
		this.#knee = knee;
		this.#drift = drift;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
