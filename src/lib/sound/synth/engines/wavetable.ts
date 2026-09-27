/**
 * wavetable: nine tables of band-limited frames scanned by position, the read's phase swung by a
 * sine (warp) whose rate slides below the note's (drift). Evidence and fits:
 * `docs/research/57-synth-engines.md` §3 (wavetable), `research/device/wavetable_fit.py`.
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33, `2026-09-27-131026-wavetable`):
 * - nine tables in alphabetical order, 32 frames each (crush 16), neighbouring frames crossfaded
 *   by position; switching tables keeps the position. Each table's rule is at its formula: the
 *   frames are our own formulas, fitted to the device's harmonics, not TE's data;
 * - each table's level on A1 ({@link TABLES}), and a one-pole lowpass at 8.3 kHz on the output
 *   ({@link ROLLOFF_HZ});
 * - warp is frequency modulation of the read by a sine: a phase swing of 0.15·warp cycles on A2
 *   with the sine at the note's rate, less higher up ({@link WARP_DEPTH}). The sine runs free, so
 *   every note meets it at its own phase and the timbre differs a little note to note, as on the
 *   device;
 * - drift slows the sine from the note's rate to half of it along an S-curve ({@link DRIFT_CURVE}):
 *   a slow wobble at first, inharmonic FM in the middle, a subharmonic at the top.
 *
 * Our model band-limits where the device does not: every frame is stored per half octave (the
 * shared {@link WaveTable}) and read at the level for the fastest the warp drives it, where the
 * device aliases at high warp.
 */
import { fft } from '../analysis';
import { OnePole, prewarp } from '../filters';
import { Noise } from '../noise';
import { sin2pi } from '../sine';
import { partialsOf, WaveTable, type Partials } from '../wavetable';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';

// Measured on the owner's device (2026-09-27); the tables themselves are our own formulas.
/** The device's top, the same on any note: a one-pole lowpass, −3 dB at 8.3 kHz and −9 dB at
 * 15 kHz (within 0.2 dB up to 18 kHz). */
const ROLLOFF_HZ = 8300;
/**
 * Warp's phase swing (cycles) at warp 1 with the sine at the note's rate, on A2 (110 Hz), and how
 * it falls up the keyboard: × (f/110)^−0.18 (0.117 on A4).
 */
const WARP_DEPTH = 0.15;
const WARP_KEY = -0.18;
/** Drift's S-curve: the sine's rate is the note's × (1 − s/2), s = ½(2·drift)^2.6 up to drift ½
 * and mirrored above. */
const DRIFT_CURVE = 2.6;

// Design constants.
/** Frames per table: the device's tables change one step per 1/31 of position, blending between. */
const FRAMES = 32;
/** Smoothing of every continuous parameter (seconds). */
const SMOOTH_SECONDS = 0.005;
/** A table change crossfades over this long (and waits for the last one to finish). */
const FADE_SECONDS = 0.02;
/** No frame may peak past this, whatever its level. */
const FRAME_PEAK = 1.1;
/** Harmonics a frame is described with (the richest stored level's). */
const HARMONICS = 512;
/** Levels were measured on A1, captured at 44.1 kHz: every harmonic below 22.05 kHz, through the
 * device's rolloff. */
const LEVEL_HZ = 55;
const LEVEL_RATE = 44100;
/** Samples per drawn cycle (basic's and crush's shapes). */
const CYCLE = 16384;

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

/** `count` harmonics of a function of the harmonic number (1-based). */
const series = (count: number, f: (h: number) => number) =>
	Float64Array.from({ length: count }, (_, i) => f(i + 1));

/** `values` at `x`, linearly between the points of `at`. */
function read(at: readonly number[], values: readonly number[], x: number): number {
	if (x <= at[0]) return values[0];
	const last = at.length - 1;
	if (x >= at[last]) return values[last];
	let i = 0;
	while (x > at[i + 1]) i++;
	return values[i] + ((values[i + 1] - values[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}

/** The partials of a cycle drawn by `shape` (0–1 phase in), sampled at the middle of each step. */
const drawn = (shape: (p: number) => number) =>
	partialsOf(
		Float32Array.from({ length: CYCLE }, (_, i) => shape((i + 0.5) / CYCLE)),
		HARMONICS
	);

/** Positions 0, 0.1 … 1: where the measured curves below were read. */
const TENTHS = Array.from({ length: 11 }, (_, i) => i / 10);

/** A rising saw's harmonics (buzz's and fractal's base). */
const saw = (h: number) => (2 / (Math.PI * h)) * (h % 2 ? 1 : -1);

/**
 * basic, in thirds: a triangle bent into a square, sign(t)·|t|^k with k = (1 − 3x)^1.2; the square
 * bent the same way into a falling saw, k = (3x − 1)^1.2; then the saw smooths into a sine by way of
 * a softer saw (harmonics at 1/h²), in the proportions (1 − m)^2.54, the rest and m^1.76 at the
 * fundamental (m = 3x − 2).
 */
const BASIC = { bend: 1.2, saw: 2.54, sine: 1.76 } as const;
const triangleAt = (p: number) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4);
const fallingSaw = (p: number) => 1 - 2 * p;
function basic(x: number): Partials {
	if (x < 2 / 3) {
		const k = Math.pow(Math.abs(1 - 3 * x), BASIC.bend);
		const base = x < 1 / 3 ? triangleAt : fallingSaw;
		return drawn((p) => {
			const t = base(p);
			return Math.sign(t) * Math.pow(Math.abs(t), k);
		});
	}
	const m = 3 * x - 2;
	const saw = Math.pow(1 - m, BASIC.saw);
	const sine = Math.pow(m, BASIC.sine);
	const soft = Math.max(0, 1 - saw - sine);
	return signed(series(HARMONICS, (h) => saw / h + soft / (h * h) + (h === 1 ? sine : 0)));
}

/**
 * buzz: a saw crossfading frame by frame into white noise, each frame its own (our seeded noise:
 * every harmonic a random complex amplitude). The saw falls from full to 5 % and the noise (per
 * harmonic, dB re the saw's fundamental) rises to −24 dB by the middle, as measured, at 0, 0.1 … 1.
 */
const BUZZ = {
	saw: [1, 0.983, 0.949, 0.924, 0.833, 0.614, 0.421, 0.2, 0.15, 0.1, 0.054],
	noise: [-60, -40.3, -37.7, -34.0, -29.2, -24.5, -23.5, -23.6, -23.6, -23.6, -24.0]
} as const;
function buzz(x: number): Partials {
	const random = new Noise(8191 + Math.round(x * (FRAMES - 1)));
	const sawLevel = read(TENTHS, BUZZ.saw, x);
	const noiseLevel = (2 / Math.PI) * Math.pow(10, read(TENTHS, BUZZ.noise, x) / 20);
	const amp = new Float32Array(HARMONICS);
	const phase = new Float32Array(HARMONICS);
	for (let h = 1; h <= HARMONICS; h++) {
		// a complex Gaussian of unit power: |z|² exponential, its angle uniform
		const r = noiseLevel * Math.sqrt(-Math.log(1 - 0.5 * (random.next() + 1)));
		const angle = Math.PI * random.next();
		const re = sawLevel * saw(h) + r * Math.cos(angle);
		const im = r * Math.sin(angle);
		amp[h - 1] = Math.hypot(re, im);
		phase[h - 1] = Math.atan2(im, re);
	}
	return { amp, phase };
}

/**
 * crush: 16 frames, each a sine rounded to steps of q = (0.2004 + 1.1282·x)² of its peak: 1/25 at
 * first (51 levels), past 1.7 at the last (three levels: a narrow pulse each half-cycle). The steps'
 * square roots are evenly spaced, as on the device.
 */
const CRUSH = { from: 0.2004, span: 1.1282 } as const;
function crush(x: number): Partials {
	const g = 1 / (CRUSH.from + CRUSH.span * x) ** 2;
	return drawn((p) => Math.round(g * Math.sin(2 * Math.PI * p)));
}

/**
 * drawbars: nine tonewheel-like tones at the Hammond drawbars' ratios (16′ at the note, 8′, 5⅓′,
 * 4′, 2⅔′, 2′, 1⅗′, 1⅓′, 1′), each a sine with odd overtones at 1.925·n^−2.64, everything in one
 * phase; the registration tilts from the low bars through all out (0.4–0.6) to the high ones (dB
 * re the loudest bar, at 0, 0.1 … 1).
 */
const DRAWBARS = {
	ratios: [1, 2, 3, 4, 6, 8, 10, 12, 16],
	db: [
		[0, -5.6, -11.7, -18.2, -25.1, -32.5, -39.4, -48.4, -57.4],
		[0, -3.2, -6.8, -10.8, -15.3, -20.2, -25.3, -31.3, -37.5],
		[0, -1.5, -3.3, -5.7, -8.4, -11.6, -15.2, -19.3, -23.8],
		[0, -0.1, -0.6, -1.5, -2.9, -4.7, -6.9, -9.6, -12.7],
		[-1.5, -0.6, -0.1, 0, -0.4, -1.2, -2.4, -4.1, -6.2],
		[-4.0, -2.3, -1.1, -0.3, 0, -0.1, -0.6, -1.6, -3.0],
		[-6.2, -4.1, -2.4, -1.2, -0.4, 0, -0.1, -0.6, -1.5],
		[-8.7, -6.1, -4.0, -2.4, -1.1, -0.4, 0, -0.1, -0.6],
		[-11.5, -8.6, -6.0, -4.0, -2.3, -1.1, -0.3, 0, -0.1],
		[-15.2, -11.8, -8.8, -6.2, -4.1, -2.4, -1.2, -0.4, 0],
		[-20.9, -16.7, -13.0, -9.8, -6.9, -4.5, -2.6, -1.1, 0]
	],
	overtone: 1.925,
	slope: 2.64
} as const;
function drawbars(x: number): Partials {
	const values = new Float64Array(HARMONICS);
	DRAWBARS.ratios.forEach((ratio, b) => {
		const column = DRAWBARS.db.map((row) => row[b]);
		const level = Math.pow(10, read(TENTHS, column, x) / 20);
		for (let n = 1; ratio * n <= HARMONICS; n += 2) {
			values[ratio * n - 1] +=
				level * (n === 1 ? 1 : DRAWBARS.overtone * Math.pow(n, -DRAWBARS.slope));
		}
	});
	return signed(values);
}

/** The first `count` partials of `partials` at `level(j)` on a sine (frame `count` has `count`). */
function adding(partials: readonly number[], level: (j: number) => number, count: number) {
	const values = new Float64Array(HARMONICS);
	values[0] = 1;
	for (let j = 0; j < Math.min(count, partials.length); j++) values[partials[j] - 1] = level(j);
	return signed(values);
}

/**
 * fibonacci: a sine joined, one per frame, by the Fibonacci numbers' harmonics, the jth at 1/(j + 1),
 * drawn as the device's are, on a 1024-point cycle: from 610 up they fold back (987 lands on 37,
 * 4181 on 85 …), 31 of them by the last frame.
 */
const FIBONACCI_CYCLE = 1024;
function fibonacci(x: number): Partials {
	const count = Math.round(x * (FRAMES - 1));
	const values = new Float64Array(HARMONICS);
	values[0] = 1;
	for (let j = 1, a = 1, b = 2; j <= count; j++, [a, b] = [b, (a + b) % FIBONACCI_CYCLE]) {
		// a sine at harmonic f of an n-point cycle is one at n − f turned over, past n/2
		const f = b % FIBONACCI_CYCLE;
		const h = f <= FIBONACCI_CYCLE / 2 ? f : FIBONACCI_CYCLE - f;
		if (h > 0 && h <= HARMONICS) values[h - 1] += (f <= FIBONACCI_CYCLE / 2 ? 1 : -1) / (j + 1);
	}
	return signed(values);
}

/** primes: a sine joined, one per frame, by the primes up to 127, each at a saw's level. */
const PRIMES = [
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
	101, 103, 107, 109, 113, 127
];
const primes = (x: number) => adding(PRIMES, (j) => 1 / PRIMES[j], Math.round(x * (FRAMES - 1)));

/**
 * fractal: saws at 1, 2, 4 … 256 times the note, the smaller saws' weights growing with position:
 * c₁ = −0.906x at twice the note, c₂·q^(j−2) at 2^j (c₂ = 0.878x − 0.794x², q = 0.9x).
 */
function fractal(x: number): Partials {
	const c1 = -0.906 * x;
	const c2 = 0.878 * x - 0.794 * x * x;
	const q = 0.9 * x;
	return signed(
		series(HARMONICS, (h) => {
			// saw(2^j·θ) adds 2^j·c_j of saw(θ)'s own amount to the harmonics 2^j divides
			let gain = 1;
			for (let j = 1; h % (1 << j) === 0; j++) {
				gain += (1 << j) * (j === 1 ? c1 : c2 * Math.pow(q, j - 2));
			}
			return saw(h) * gain;
		})
	);
}

/**
 * geometric: partials at the powers of ρ = 1 + 2x + 3x² (rounded, each at least one harmonic above
 * the last), the jth at 1/(j + 1)^(2 − x): at 0 every harmonic at 1/h² (a soft saw); at 1 the note,
 * 6, 36 and 216 times it at 1, ½, ⅓ and ¼.
 */
function geometric(x: number): Partials {
	const rho = 1 + 2 * x + 3 * x * x;
	const values = new Float64Array(HARMONICS);
	for (let j = 0, h = 0; ; j++) {
		h = Math.max(h + 1, Math.round(Math.pow(rho, j)));
		if (h > HARMONICS) break;
		values[h - 1] = Math.pow(j + 1, x - 2);
	}
	return signed(values);
}

/**
 * zap: a rising saw whose harmonics turn with position, the hth by x·(59.9h − 2.9h²/(1 + 0.0191h)^0.534)
 * degrees: a chirp (the turn grows as h² low down, more slowly higher up) that slides a sixth of a
 * cycle in time over the table (the part in h alone). Crossfading neighbouring frames, the
 * harmonics a half-turn apart cancel: on the device, and here, the 74th, 127th and 168th.
 */
const ZAP = { slide: 59.9, chirp: 2.9, knee: 0.0191, bend: 0.534 } as const;
function zap(x: number): Partials {
	const amp = Float32Array.from({ length: HARMONICS }, (_, i) => 2 / (Math.PI * (i + 1)));
	const phase = Float32Array.from({ length: HARMONICS }, (_, i) => {
		const h = i + 1;
		const turn = ZAP.slide * h - (ZAP.chirp * h * h) / Math.pow(1 + ZAP.knee * h, ZAP.bend);
		return ((h % 2 ? 0 : 180) + ((x * turn) % 360)) * (Math.PI / 180);
	});
	return { amp, phase };
}

/**
 * The tables in the device's order (alphabetical, as the device lists them), each with its level
 * over position: the RMS the device played on A1 (dBFS, flat or at 0, 0.1 … 1). The eighth is the
 * one never seen on screen; "primes" is our name for it.
 */
export const TABLES: readonly {
	readonly name: string;
	readonly frame: (x: number) => Partials;
	readonly db: number | readonly number[];
	readonly frames?: number;
	/** Every frame at the first one's gain (the frames' own mix sets the level), not each at `db`. */
	readonly shared?: boolean;
}[] = [
	{ name: 'basic', frame: basic, db: -16.5 },
	{
		name: 'buzz',
		frame: buzz,
		// the saw's level; the noise frames follow from the mix (5 dB down at the end, as measured)
		db: -23.9,
		shared: true
	},
	{ name: 'crush', frame: crush, db: -16.8, frames: 16 },
	{ name: 'drawbars', frame: drawbars, db: -20.0 },
	{ name: 'fibonacci', frame: fibonacci, db: -16.5 },
	{
		name: 'fractal',
		frame: fractal,
		db: [-18.1, -18.1, -17.9, -17.8, -18.2, -18.2, -17.9, -18.0, -17.8, -18.3, -19.1]
	},
	{
		name: 'geometric',
		frame: geometric,
		db: [-17.4, -17.8, -17.9, -18.1, -18.1, -19.1, -19.8, -21.8, -23.6, -26.4, -28.8]
	},
	{ name: 'primes', frame: primes, db: -15.2 },
	{ name: 'zap', frame: zap, db: -20.6 }
];

/** The rolloff's power gain at `hz` for a sample rate `sr` (a bilinear one-pole). */
function rolloffPower(hz: number, sr: number): number {
	const r = Math.tan((Math.PI * hz) / sr) / Math.tan((Math.PI * ROLLOFF_HZ) / sr);
	return 1 / (1 + r * r);
}

/** The gain that brings a frame to `db` dBFS on the device (plus our gain): its RMS as the device
 * plays it on A1. */
function gainFor(p: Partials, db: number): number {
	let power = 0;
	for (let h = 1; h <= p.amp.length && h * LEVEL_HZ < LEVEL_RATE / 2; h++) {
		power += 0.5 * p.amp[h - 1] ** 2 * rolloffPower(h * LEVEL_HZ, LEVEL_RATE);
	}
	return Math.pow(10, (db + DEVICE_GAIN_DB) / 20) / Math.sqrt(power);
}

/** A frame times `gain`, but never past {@link FRAME_PEAK}. */
function scaled(p: Partials, gain: number): Partials {
	// the frame as its richest level will store it, by inverse FFT, for its peak
	const n = 4 * HARMONICS;
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let h = 1; h <= Math.min(p.amp.length, HARMONICS); h++) {
		const a = p.amp[h - 1];
		const phi = p.phase?.[h - 1] ?? 0;
		// X[h] = −i·n·a/2·e^{iφ}: the inverse FFT gives a·sin(2πhk/n + φ)
		re[h] = (n / 2) * a * Math.sin(phi);
		im[h] = -(n / 2) * a * Math.cos(phi);
		re[n - h] = re[h];
		im[n - h] = -im[h];
	}
	fft(re, im, true);
	let top = 0;
	for (let i = 0; i < n; i++) top = Math.max(top, Math.abs(re[i]));
	const g = Math.min(gain, FRAME_PEAK / top);
	return { amp: Float32Array.from(p.amp, (a) => a * g), phase: p.phase };
}

const built: (WaveTable | undefined)[] = [];

/** Table `t`, built on first use and shared by every voice. */
function table(t: number): WaveTable {
	let w = built[t];
	if (!w) {
		const { frame, db, frames: count = FRAMES, shared = false } = TABLES[t];
		const level = (x: number) => (typeof db === 'number' ? db : read(TENTHS, db, x));
		const parts = Array.from({ length: count }, (_, f) => frame(f / (count - 1)));
		const first = gainFor(parts[0], level(0));
		const frames = parts.map((p, f) =>
			scaled(p, shared ? first : gainFor(p, level(f / (count - 1))))
		);
		w = WaveTable.fromPartials(frames);
		built[t] = w;
	}
	return w;
}

/** Drift's S-curve (0–1 in and out). */
function driftCurve(x: number): number {
	return x < 0.5 ? 0.5 * Math.pow(2 * x, DRIFT_CURVE) : 1 - 0.5 * Math.pow(2 - 2 * x, DRIFT_CURVE);
}

export class WavetableVoice implements EngineVoice {
	readonly #sr: number;
	readonly #smooth: number;
	readonly #fadeStep: number;
	#dt = 0;
	/** The note's phase and the warp's sine's (which runs free from note to note). */
	#phase = 0;
	#warpPhase: number;
	/** The table sounding, the one fading out (and how far the fade has come), and the target. */
	#table!: WaveTable;
	#from!: WaveTable;
	#index = 0;
	#fade = 1;
	#target = 0;
	/** Position (0–1, each table has its own frame count), warp's swing at the note's rate
	 * (cycles) and its sine's rate over the note's: smoothed. */
	#position = 0;
	#positionTarget = 0;
	#depth = 0;
	#depthTarget = 0;
	#ratio = 1;
	#ratioTarget = 1;
	/** The device's rolloff at the top. */
	readonly #rolloff = new OnePole();

	constructor(sampleRate: number, seed = 1) {
		this.#sr = sampleRate;
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#fadeStep = 1 / (FADE_SECONDS * sampleRate);
		this.#rolloff.set(prewarp(ROLLOFF_HZ, sampleRate));
		this.#warpPhase = 0.5 * (new Noise(seed).next() + 1);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#phase = 0;
		this.control(hz, params);
		// a note starts where its parameters are, not fading in from the last note's
		this.#index = this.#target;
		this.#table = this.#from = table(this.#target);
		this.#fade = 1;
		this.#position = this.#positionTarget;
		this.#depth = this.#depthTarget;
		this.#ratio = this.#ratioTarget;
		this.#rolloff.reset();
	}

	control(hz: number, params: Float32Array): void {
		this.#dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		this.#target = Math.min(TABLES.length - 1, Math.floor(clamp01(params[0]) * TABLES.length));
		this.#positionTarget = clamp01(params[1]);
		this.#depthTarget = WARP_DEPTH * clamp01(params[2]) * Math.pow(Math.max(hz, 1) / 110, WARP_KEY);
		this.#ratioTarget = 1 - 0.5 * driftCurve(clamp01(params[3]));
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
		const intoFrames = into.frames - 1;
		const fromFrames = from.frames - 1;
		const rolloff = this.#rolloff;
		const positionTo = this.#positionTarget;
		const depthTo = this.#depthTarget;
		const ratioTo = this.#ratioTarget;
		let fade = this.#fade;
		let phase = this.#phase;
		let warpPhase = this.#warpPhase;
		let position = this.#position;
		let depth = this.#depth;
		let ratio = this.#ratio;
		for (let i = 0; i < n; i++) {
			position += (positionTo - position) * k;
			depth += (depthTo - depth) * k;
			ratio += (ratioTo - ratio) * k;
			// frequency modulation: the deviation stays put, so the swing grows as the sine slows
			const read = phase + (depth / ratio) * sin2pi(warpPhase);
			// the read's fastest: the note plus the whole deviation
			const limit = dt * (1 + 2 * Math.PI * depth);
			let y = into.read(position * intoFrames, read, limit);
			if (fade < 1) {
				y = y * fade + from.read(position * fromFrames, read, limit) * (1 - fade);
				fade += fadeStep;
			}
			const out = rolloff.process(y);
			left[i] = out;
			right[i] = out;
			phase += dt;
			if (phase >= 1) phase -= 1;
			warpPhase += dt * ratio;
			if (warpPhase >= 1) warpPhase -= 1;
		}
		this.#fade = Math.min(fade, 1);
		this.#phase = phase;
		this.#warpPhase = warpPhase;
		this.#position = position;
		this.#depth = depth;
		this.#ratio = ratio;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
