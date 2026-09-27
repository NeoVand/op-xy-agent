/**
 * dissolve: two sine operators, each feeding its own output back into its phase (fm) and driven
 * into a hard clip (am), split apart in pitch (detune) and jittered by noise (swarm). Evidence and
 * how it was fitted: `docs/research/57-synth-engines.md` §3 (dissolve), `research/device/
 * dissolve_fit.py`.
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33, `2026-09-27-132921-dissolve`):
 * - everything at 0 is a pure sine, −14.2 dBFS on A2 and 1.5 dB lower an octave up
 *   ({@link LEVEL_PER_OCTAVE}): the two carriers in phase at the note;
 * - detune splits them to ±34.3 cents at full ({@link DETUNE_CENTS}), in proportion; the upper one
 *   plays 5 dB above the lower ({@link LOWER_DB});
 * - fm is each carrier's own feedback, y = sin(φ + β·y), with β = 0.686 · fm ({@link FEEDBACK}),
 *   the same on every note (fitted within 0.5–1.2 dB);
 * - am is a hard clip: y = clip(g · sin(φ + β·y)), the clipped output feeding back, with g from 1 to
 *   2 over am on A2 and to 1.73 on A4 ({@link CLIP}: within 0.4 dB of every harmonic; no level
 *   compensation, so it gets louder), in dB 0.63 dB less an octave up at full;
 * - swarm jitters each carrier's pitch with its own noise, fast (most of its motion within
 *   5–60 Hz), the spread's standard deviation 0.13 · swarm^1.6 of the note ({@link SWARM_SPREAD}),
 *   and the level falls by up to 6 dB (part of it the two carriers drifting apart).
 *
 * Our model: the above, run at twice the output's rate and halved by a {@link Decimator}, with the
 * clip anti-aliased by its antiderivative (ADAA) and the feedback averaged over the last two
 * outputs (as the DX7 does), so it cannot ring at half the rate. A clip inside a feedback loop can
 * jump (with β·g past 1 its equation has two answers), and at 1× its harmonics folded back to
 * −41 dB on 2 kHz notes; at 2× they stay under −60 dB. The jitter is white noise through a one-pole
 * lowpass at {@link JITTER_HZ}, per block.
 */
import { Decimator } from '../filters';
import { Noise } from '../noise';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

const cc = (values: readonly number[]) => values.map((v) => v / 127);

// Measured on the owner's device (2026-09-27).
/** The upper carrier's peak on A2 (dBFS on the device), and the level's fall per octave up. */
export const UPPER_DB = -15;
export const LEVEL_PER_OCTAVE = -1.5;
/** The lower carrier against the upper (dB). */
export const LOWER_DB = -5;
/** Each carrier's offset from the note at detune 1 (cents; linear). */
export const DETUNE_CENTS = 34.3;
/** The feedback β at fm 1 (linear). */
export const FEEDBACK = 0.686;
/** The clip's drive over am (at CC 0, 13 … 127) on A2 and on A4. */
export const CLIP = {
	at: cc([0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127]),
	a2: [1, 1.054, 1.109, 1.176, 1.251, 1.337, 1.426, 1.539, 1.671, 1.812, 1.997],
	a4: [1, 1.045, 1.091, 1.144, 1.204, 1.27, 1.337, 1.418, 1.51, 1.609, 1.727]
} as const;
/** swarm's pitch spread: its standard deviation over the note at swarm 1, and the curve to it. */
export const SWARM_SPREAD = 0.13;
export const SWARM_CURVE = 1.6;
/** The level swarm takes off at full (dB), besides the carriers drifting apart. */
export const SWARM_DB = -3;

// Design constants.
/** The jitter's lowpass (Hz, one pole): its motion reaches past 200 Hz, half of it below ~60 Hz. */
const JITTER_HZ = 50;
/** The highest carrier rate (cycles an output sample). */
const TOP = 0.45;

/** `values` at `x` (0–1), linearly between `at`'s points. */
function read(at: readonly number[], values: readonly number[], x: number): number {
	if (x <= at[0]) return values[0];
	const last = at.length - 1;
	if (x >= at[last]) return values[last];
	let i = 0;
	while (x > at[i + 1]) i++;
	return values[i] + ((values[i + 1] - values[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}

/** The clip's drive at `am` on a note at `hz`: A2's and A4's in dB, straight in octaves between
 * them and on beyond, never under 1 (no gain). */
export function clipDrive(am: number, hz: number): number {
	const a2 = Math.log(read(CLIP.at, CLIP.a2, am));
	const a4 = Math.log(read(CLIP.at, CLIP.a4, am));
	return Math.max(1, Math.exp(a2 + ((a4 - a2) * Math.log2(hz / 110)) / 2));
}

/** The hard clip's antiderivative: x²/2 inside ±1, |x| − ½ outside. */
function clipIntegral(x: number): number {
	const a = Math.abs(x);
	return a <= 1 ? 0.5 * x * x : a - 0.5;
}

/** One carrier: its phase (stepped at twice the output's rate), its feedback memory, its clip's
 * last input, and its jitter. */
class Carrier {
	phase = 0;
	dt = 0;
	y1 = 0;
	y2 = 0;
	x1 = 0;
	/** The jitter: white noise through a one-pole, and the rate multiplier per block. */
	readonly noise: Noise;
	lp1 = 0;
	bend = 1;

	constructor(seed: number) {
		this.noise = new Noise(seed);
	}

	reset(): void {
		this.phase = 0;
		this.y1 = this.y2 = this.x1 = 0;
		this.lp1 = 0;
		this.bend = 1;
	}
}

export class DissolveVoice implements EngineVoice {
	readonly #sr: number;
	readonly #smoothing: Smoothing;
	readonly #upper: Carrier;
	readonly #lower: Carrier;
	/** The jitter's one-pole coefficient per block, and its output's scale to unit deviation. */
	#jitterCoef = 0;
	#jitterNorm = 1;
	#blockSize = 0;
	readonly #feedback = new Ramp();
	readonly #drive = new Ramp(1);
	readonly #gainUpper = new Ramp();
	readonly #gainLower = new Ramp();
	readonly #ramps = [this.#feedback, this.#drive, this.#gainUpper, this.#gainLower];
	readonly #decimator = new Decimator();
	#hz = 0;
	#spread = 0;
	#cents = 0;

	constructor(sampleRate: number, seed: number) {
		this.#sr = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#upper = new Carrier(seed * 8 + 1);
		this.#lower = new Carrier(seed * 8 + 5);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#upper.reset();
		this.#lower.reset();
		this.#decimator.reset();
		this.control(hz, params);
		for (const ramp of this.#ramps) ramp.jump(ramp.target);
	}

	control(hz: number, params: Float32Array): void {
		this.#hz = hz;
		const swarm = clamp01(params[0]);
		const am = clamp01(params[1]);
		const fm = clamp01(params[2]);
		const detune = clamp01(params[3]);
		this.#feedback.target = FEEDBACK * fm;
		this.#drive.target = clipDrive(am, hz);
		this.#cents = DETUNE_CENTS * detune;
		this.#spread = SWARM_SPREAD * Math.pow(swarm, SWARM_CURVE);
		const octaves = Math.log2(hz / 110);
		const level = Math.pow(
			10,
			(UPPER_DB + DEVICE_GAIN_DB + LEVEL_PER_OCTAVE * octaves + SWARM_DB * swarm) / 20
		);
		this.#gainUpper.target = level;
		this.#gainLower.target = level * Math.pow(10, LOWER_DB / 20);
	}

	/** The jitter's coefficient for blocks of `n` samples (a one-pole at JITTER_HZ). */
	#jitterFor(n: number): void {
		if (n === this.#blockSize) return;
		this.#blockSize = n;
		const a = 1 - Math.exp((-2 * Math.PI * JITTER_HZ * n) / this.#sr);
		this.#jitterCoef = a;
		// a one-pole at coefficient a on unit-variance noise, one value a block: its variance,
		// taken numerically once
		let v1 = 0;
		let power = 0;
		const probe = new Noise(12345);
		for (let i = 0; i < 20000; i++) {
			v1 += a * (probe.next() * Math.sqrt(3) - v1);
			if (i > 2000) power += v1 * v1;
		}
		this.#jitterNorm = 1 / Math.sqrt(power / 17999);
	}

	/** One carrier's rate for the next block: the note, its detune, and its jitter. */
	#tune(c: Carrier, cents: number): void {
		const spread = this.#spread;
		let bend = 1;
		if (spread > 0) {
			const a = this.#jitterCoef;
			c.lp1 += a * (c.noise.next() * Math.sqrt(3) - c.lp1);
			bend = Math.max(0.1, 1 + spread * c.lp1 * this.#jitterNorm);
		}
		c.bend = bend;
		// each output sample is two steps
		c.dt = 0.5 * Math.min((this.#hz / this.#sr) * Math.pow(2, cents / 1200) * bend, TOP);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		this.#jitterFor(n);
		this.#tune(this.#upper, this.#cents);
		this.#tune(this.#lower, -this.#cents);
		const c = this.#smoothing.coef(n);
		let feedback = this.#feedback.advance(c, n);
		let drive = this.#drive.advance(c, n);
		let gu = this.#gainUpper.advance(c, n);
		let gl = this.#gainLower.advance(c, n);
		const dFeedback = this.#feedback.step;
		const dDrive = this.#drive.step;
		const dgu = this.#gainUpper.step;
		const dgl = this.#gainLower.step;
		const u = this.#upper;
		const l = this.#lower;
		for (let i = 0; i < n; i++) {
			feedback += dFeedback;
			drive += dDrive;
			gu += dgu;
			gl += dgl;
			const first =
				gu * this.#operator(u, feedback, drive) + gl * this.#operator(l, feedback, drive);
			const second =
				gu * this.#operator(u, feedback, drive) + gl * this.#operator(l, feedback, drive);
			const y = this.#decimator.process(first, second);
			left[i] = y;
			right[i] = y;
		}
	}

	/** One carrier's next sample: sin(φ + β·(its last two outputs)/2), driven into the clip. */
	#operator(c: Carrier, beta: number, drive: number): number {
		c.phase += c.dt;
		if (c.phase >= 1) c.phase -= 1;
		const x = drive * Math.sin(2 * Math.PI * c.phase + 0.5 * beta * (c.y1 + c.y2));
		// the clip, anti-aliased: the mean of the clipped signal between the last input and this one
		const dx = x - c.x1;
		const y =
			Math.abs(dx) > 1e-6
				? (clipIntegral(x) - clipIntegral(c.x1)) / dx
				: Math.max(-1, Math.min(1, 0.5 * (x + c.x1)));
		c.x1 = x;
		c.y2 = c.y1;
		c.y1 = y;
		return y;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
