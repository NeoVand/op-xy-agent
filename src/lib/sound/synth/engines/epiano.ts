/**
 * epiano: a sine carrier phase-modulated at 1:1 (tone) and at 4:1 (punch), shaped by a soft clipper
 * (texture), the 1:1 modulation falling away over the note (tine). Evidence and how it was fitted:
 * `docs/research/57-synth-engines.md` §3 (epiano), `research/device/epiano_fit.py`.
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33, `2026-09-27-132638-epiano`; velocity 100):
 * - everything at 0 is a pure sine, −17.9 dBFS on A2 and 2.9 dB lower on A4 (the level falls
 *   {@link LEVEL_PER_OCTAVE} dB an octave up the keyboard);
 * - tone is a 1:1 FM index with no modulator feedback (fitted within 0.1–0.9 dB): 5.9 × tone on A2
 *   ({@link TONE_INDEX}), less up the keyboard ({@link TONE_PER_OCTAVE}), capped at 3.05
 *   ({@link INDEX_MAX}) from about tone 64 up; FM's own level dip is left uncompensated;
 * - tine decays the 1:1 index in straight lines: after a short hold at low tine, fast down to 0.65
 *   of it, then slower to nothing, both rates rising with tine ({@link TINE}): at tine 127 the index
 *   is gone in 0.8 s, at 64 it takes 2 s;
 * - punch adds a modulator at 4 × the note (sidebands 3 and 5, then 7 and 9, in equal pairs), its
 *   index 1.7 · punch^2.95 on A2 ({@link PUNCH_INDEX}, {@link PUNCH_CURVE}), less up the keyboard,
 *   rising over its first 40 ms and then decaying on its own even at tine 0 (to 0.57 of it after a
 *   second: {@link PUNCH_DECAY});
 * - texture blends a soft clipper into the carrier at an unchanged level: 0.63 of atan(g · sine)
 *   (peak-normalized) with 0.37 of the sine (fitted within 0.3–0.8 dB), the clipped share rising
 *   to all of it at the very top on A2 ({@link DRIVE}); its drive g falls steeply up the keyboard
 *   (200 on A2 but 4.4 on A4 at texture 127);
 * - tone past about 76 no longer changes the spectrum but takes the level down, 1.3 dB by 127
 *   ({@link TONE_TOP_DB}).
 *
 * Our model plays the carrier from a band-limited table of clipper shapes (indexed by drive), read
 * at the modulated phase with a band limit that follows the phase's speed; the index also shrinks
 * where the FM spectrum would pass Nyquist. [I] Velocity scales both indexes, 0.5 at the softest,
 * 1 at 100 (where the device was measured); tine's decay applies to punch's modulator too.
 */
import { DcBlocker } from '../filters';
import { sin2pi } from '../sine';
import { WaveTable } from '../wavetable';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';

const cc = (values: readonly number[]) => values.map((v) => v / 127);
const STEPS = cc([0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127]);

// Measured on the owner's device (2026-09-27).
/** The pure sine's level on A2 (dBFS on the device) and its fall per octave up. */
export const SINE_DB = -17.9;
export const LEVEL_PER_OCTAVE = -1.45;
/** tone's 1:1 index on A2 per unit of tone, its factor per octave up, and the cap. */
export const TONE_INDEX = 5.88;
export const TONE_PER_OCTAVE = 0.904;
export const INDEX_MAX = 3.05;
/** tone's level past {@link TONE_TOP_FROM}: this many dB per unit of tone. */
export const TONE_TOP_FROM = 0.6;
export const TONE_TOP_DB = -3.2;
/**
 * tine's envelope on the index: a hold (s), then down at `fast` (per second, of the start) to
 * {@link TINE_BREAK}, then at `slow` to nothing.
 */
export const TINE = {
	at: STEPS,
	hold: [0, 0.2, 0.15, 0.075, 0.025, 0, 0, 0, 0, 0, 0],
	fast: [0, 0.257, 0.4, 0.86, 1.45, 2.24, 3, 3.7, 4.5, 5.2, 6],
	slow: [0, 0.04, 0.06, 0.13, 0.24, 0.34, 0.45, 0.57, 0.69, 0.8, 0.92]
} as const;
export const TINE_BREAK = 0.65;
/**
 * punch's 4:1 index on A2, PUNCH_INDEX · punch^PUNCH_CURVE; its factor per octave up; its rise and
 * its decay's time constant (seconds).
 */
export const PUNCH_RATIO = 4;
export const PUNCH_INDEX = 1.7;
export const PUNCH_CURVE = 2.95;
export const PUNCH_PER_OCTAVE = 0.857;
export const PUNCH_RISE = 0.04;
export const PUNCH_DECAY = 1.9;
/**
 * texture's clipper on A2 and A4 at CC 0, 13 … 127: its drive (read in log between the notes) and
 * its share against the sine (read linearly).
 */
export const DRIVE = {
	at: STEPS,
	a2: [0, 1.21, 2.15, 3.8, 6.95, 12.38, 19.38, 28.38, 27.66, 30.23, 41.06],
	a4: [0, 0.62, 0.89, 1.2, 1.51, 1.87, 2.22, 2.67, 3.19, 3.72, 4.37],
	wetA2: [0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.86, 1, 1],
	wetA4: [0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63, 0.63]
} as const;

// Design constants.
/** Velocity's share of the indexes at the softest (1 at velocity 100). */
const VELOCITY_FLOOR = 0.5;
/** Smoothing of every continuous parameter (seconds). */
const SMOOTH_SECONDS = 0.005;
/**
 * The FM spectrum's estimated top, 1 + I·(1 + TAIL) harmonics, may reach this share of Nyquist
 * before the index is scaled down (TAIL covers the Bessel sidebands past the phase's top speed).
 */
const BANDWIDTH = 0.8;
const TAIL = 0.5;
/** Orders of punch's sidebands past its index still loud enough to count (−50 dB at an index of 1). */
const PUNCH_TAIL = 1.5;
/** The clipper shapes: drive 0, then log-spaced from DRIVE_LOW to DRIVE_HIGH. */
const DRIVE_FRAMES = 25;
const DRIVE_LOW = 0.25;
const DRIVE_HIGH = 200;
const DRIVE_STEP = Math.log(DRIVE_HIGH / DRIVE_LOW) / (DRIVE_FRAMES - 2);
/** Samples per drawn shape before it is band-limited. */
const CYCLE = 4096;

/** `curve` values at `x`, linearly between points (held beyond them). */
function read(at: readonly number[], values: readonly number[], x: number): number {
	if (x <= at[0]) return values[0];
	const last = at.length - 1;
	if (x >= at[last]) return values[last];
	let i = 0;
	while (x > at[i + 1]) i++;
	return values[i] + ((values[i + 1] - values[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}

/** texture's clipper drive at texture `t` (0–1) on `note` (MIDI): log between A2 and A4. */
export function drive(t: number, note: number): number {
	const a2 = read(DRIVE.at, DRIVE.a2, t);
	const a4 = read(DRIVE.at, DRIVE.a4, t);
	if (a2 <= 0 || a4 <= 0) return 0;
	const g = a2 * Math.pow(a4 / a2, (note - 45) / 24);
	return Math.min(g, DRIVE_HIGH);
}

/** texture's clipped share at texture `t` on `note`: linear between A2 and A4, held beyond. */
export function wet(t: number, note: number): number {
	const a2 = read(DRIVE.at, DRIVE.wetA2, t);
	const a4 = read(DRIVE.at, DRIVE.wetA4, t);
	const x = Math.min(1, Math.max(0, (note - 45) / 24));
	return a2 + (a4 - a2) * x;
}

/** The frame of the shape table for drive `g`. */
function frameOf(g: number): number {
	if (g <= 0) return 0;
	if (g < DRIVE_LOW) return g / DRIVE_LOW;
	return Math.min(DRIVE_FRAMES - 1, 1 + Math.log(g / DRIVE_LOW) / DRIVE_STEP);
}

/**
 * The clipper's shapes, atan(g·sine) / atan(g) (peak 1), band-limited; with each shape's
 * fundamental and power, to keep the blend with the sine at a unit sine's RMS.
 */
interface Shapes {
	readonly table: WaveTable;
	readonly h1: Float32Array;
	readonly power: Float32Array;
}

function buildShapes(): Shapes {
	const cycles: Float32Array[] = [];
	const h1 = new Float32Array(DRIVE_FRAMES);
	const power = new Float32Array(DRIVE_FRAMES);
	for (let f = 0; f < DRIVE_FRAMES; f++) {
		const g = f === 0 ? 0 : DRIVE_LOW * Math.exp((f - 1) * DRIVE_STEP);
		const cycle = new Float32Array(CYCLE);
		const norm = g === 0 ? 1 : Math.atan(g);
		for (let i = 0; i < CYCLE; i++) {
			const s = Math.sin((2 * Math.PI * i) / CYCLE);
			cycle[i] = g === 0 ? s : Math.atan(g * s) / norm;
			h1[f] += (2 * cycle[i] * s) / CYCLE;
			power[f] += (cycle[i] * cycle[i]) / CYCLE;
		}
		cycles.push(cycle);
	}
	return { table: WaveTable.fromCycles(cycles), h1, power };
}

let shapeTable: Shapes | null = null;

/** The shared shapes (built on first use). */
function shapes(): Shapes {
	shapeTable ??= buildShapes();
	return shapeTable;
}

/** `values` at fractional `frame`, linearly between frames. */
function atFrame(values: Float32Array, frame: number): number {
	const i = Math.min(Math.floor(frame), values.length - 2);
	return values[i] + (values[i + 1] - values[i]) * (frame - i);
}

/** The sine's peak on A2: its RMS is the device's level, {@link DEVICE_GAIN_DB} louder. */
const LEVEL = Math.SQRT2 * Math.pow(10, (SINE_DB + DEVICE_GAIN_DB) / 20);

export class EpianoVoice implements EngineVoice {
	readonly #sr: number;
	readonly #shapes: Shapes;
	readonly #dc: DcBlocker;
	readonly #smooth: number;
	#dt = 0;
	#phase = 0;
	/** The note's level (its key scaling, and tone's top) and its target; velocity's share of the indexes. */
	#level = LEVEL;
	#levelTarget = LEVEL;
	#velocity = 1;
	/** The 1:1 index (cycles of phase per unit of modulator), before tine's envelope; its target. */
	#index = 0;
	#indexTarget = 0;
	/** The 4:1 index and its target; its rise and decay so far. */
	#punch = 0;
	#punchTarget = 0;
	#rise = 0;
	#fall = 1;
	readonly #riseStep: number;
	readonly #fallStep: number;
	/** The shape table's frame, the clipped share and the blend's gain, and their targets. */
	#frame = 0;
	#frameTarget = 0;
	#wet = 0;
	#wetTarget = 0;
	#gain = 1;
	#gainTarget = 1;
	/** tine's envelope: seconds into the note, where it is, and its settings. */
	#time = 0;
	#env = 1;
	#hold = 0;
	#fast = 0;
	#slow = 0;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		this.#shapes = shapes();
		this.#dc = new DcBlocker(sampleRate);
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#riseStep = 1 / (PUNCH_RISE * sampleRate);
		this.#fallStep = Math.exp(-1 / (PUNCH_DECAY * sampleRate));
	}

	start(hz: number, velocity: number, params: Float32Array): void {
		const v = Math.min(Math.max(velocity, 1), 127);
		this.#velocity = VELOCITY_FLOOR + ((1 - VELOCITY_FLOOR) * (v - 1)) / 99;
		this.#phase = 0;
		this.#time = 0;
		this.#env = 1;
		this.#rise = 0;
		this.#fall = 1;
		this.#dc.reset();
		this.control(hz, params);
		// a note starts where its parameters are
		this.#index = this.#indexTarget;
		this.#punch = this.#punchTarget;
		this.#frame = this.#frameTarget;
		this.#wet = this.#wetTarget;
		this.#gain = this.#gainTarget;
		this.#level = this.#levelTarget;
	}

	control(hz: number, params: Float32Array): void {
		const dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		this.#dt = dt;
		const octaves = Math.log2(hz / 110);
		const note = 45 + 12 * octaves;
		const tone = clamp01(params[0]);
		const top = TONE_TOP_DB * Math.max(0, tone - TONE_TOP_FROM);
		this.#levelTarget = LEVEL * Math.pow(10, (LEVEL_PER_OCTAVE * octaves + top) / 20);
		const texture = clamp01(params[1]);
		const punch = clamp01(params[2]);
		const tine = clamp01(params[3]);
		const toneIndex = Math.min(
			TONE_INDEX * tone * Math.pow(TONE_PER_OCTAVE, octaves) * this.#velocity,
			INDEX_MAX
		);
		const punchIndex =
			PUNCH_INDEX *
			Math.pow(punch, PUNCH_CURVE) *
			Math.pow(PUNCH_PER_OCTAVE, octaves) *
			this.#velocity;
		// the FM spectrum stays below Nyquist: the 1:1 modulation's reach first (its sidebands a
		// harmonic apart), then punch's in what is left (four harmonics apart, and a tail of
		// sidebands past its index that small indexes still reach)
		const highest = (BANDWIDTH * 0.5) / dt;
		const index = Math.min(toneIndex, Math.max(0, (highest - 1) / (1 + TAIL)));
		const room = highest - 1 - index * (1 + TAIL);
		const punchRoom = Math.max(0, (room / PUNCH_RATIO - PUNCH_TAIL) / (1 + TAIL));
		this.#indexTarget = index / (2 * Math.PI);
		this.#punchTarget = Math.min(punchIndex, punchRoom) / (2 * Math.PI);
		const frame = frameOf(drive(texture, note));
		const w = wet(texture, note);
		this.#frameTarget = frame;
		this.#wetTarget = w;
		// the blend (1 − w)·sine + w·shape at a unit sine's RMS
		const h1 = atFrame(this.#shapes.h1, frame);
		const power = atFrame(this.#shapes.power, frame);
		const blend = 0.5 * (1 - w) * (1 - w) + w * (1 - w) * h1 + w * w * power;
		this.#gainTarget = Math.SQRT1_2 / Math.sqrt(blend);
		this.#hold = read(TINE.at, TINE.hold, tine);
		this.#fast = read(TINE.at, TINE.fast, tine);
		this.#slow = read(TINE.at, TINE.slow, tine);
	}

	/**
	 * tine's envelope `seconds` on: after the hold, down at the fast rate to the break, then at the
	 * slow rate to nothing. Rates, not values, follow tine, so turning it never jumps.
	 */
	#advance(seconds: number): void {
		const start = this.#time;
		this.#time += seconds;
		let remaining = Math.min(seconds, this.#time - this.#hold);
		if (remaining <= 0 || start + seconds <= this.#hold) return;
		let env = this.#env;
		if (env > TINE_BREAK && this.#fast > 0) {
			const d = Math.min(remaining, (env - TINE_BREAK) / this.#fast);
			env -= this.#fast * d;
			remaining -= d;
		}
		if (env <= TINE_BREAK + 1e-9) env = Math.max(0, env - this.#slow * remaining);
		this.#env = env;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const table = this.#shapes.table;
		const dc = this.#dc;
		const k = this.#smooth;
		const dt = this.#dt;
		// the envelope moves in a straight line across each block
		const e0 = this.#env;
		this.#advance(n / this.#sr);
		const de = (this.#env - e0) / n;
		let env = e0;
		let phase = this.#phase;
		let index = this.#index;
		let punch = this.#punch;
		let frame = this.#frame;
		let w = this.#wet;
		let gain = this.#gain;
		let rise = this.#rise;
		let fall = this.#fall;
		const riseStep = this.#riseStep;
		const fallStep = this.#fallStep;
		const indexTarget = this.#indexTarget;
		const punchTarget = this.#punchTarget;
		const frameTarget = this.#frameTarget;
		const wetTarget = this.#wetTarget;
		const gainTarget = this.#gainTarget;
		const levelTarget = this.#levelTarget;
		let level = this.#level;
		for (let i = 0; i < n; i++) {
			index += (indexTarget - index) * k;
			punch += (punchTarget - punch) * k;
			frame += (frameTarget - frame) * k;
			w += (wetTarget - w) * k;
			gain += (gainTarget - gain) * k;
			level += (levelTarget - level) * k;
			env += de;
			if (rise < 1) rise = Math.min(1, rise + riseStep);
			fall *= fallStep;
			const a = index * env;
			const b = punch * env * rise * fall;
			const pm = a * sin2pi(phase) + b * sin2pi(PUNCH_RATIO * phase);
			// the table's band limit follows how fast the modulated phase can run
			const at = phase + pm;
			const shape = table.read(frame, at, dt * (1 + 2 * Math.PI * (a + PUNCH_RATIO * b)));
			const y = dc.process(level * gain * ((1 - w) * sin2pi(at) + w * shape));
			left[i] = y;
			right[i] = y;
			phase += dt;
			if (phase >= 1) phase -= 1;
		}
		this.#phase = phase;
		this.#index = index;
		this.#punch = punch;
		this.#frame = frame;
		this.#wet = w;
		this.#gain = gain;
		this.#level = level;
		this.#rise = rise;
		// far below hearing: stop before the decay reaches denormal numbers
		this.#fall = fall < 1e-9 ? 0 : fall;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
