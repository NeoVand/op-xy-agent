/**
 * axis: four feedback operators of one waveform, summed and highpassed. Three play the note,
 * detuned −9, −4 and +8 cents (the "lush" ensemble); op2 plays the ratio's multiple of it, +4 cents.
 * Evidence and how it was fitted: `docs/research/57-synth-engines.md` §3 (axis),
 * `research/device/axis_fit.py`.
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33, `2026-09-27-133356-axis`):
 * - every oscillator is y = sin(φ + a·y + b·y²), an operator feeding its own output back into its
 *   phase; all four play at one level ({@link OSCILLATOR_DB}), starting at phase 0 on each note
 *   (the same settings give the same waveform, sample for sample);
 * - tone sets the feedback ({@link FEEDBACK}): op2 most, the copies 0.75–0.9 of it. Each loop feeds
 *   back its last sample, so past ~1.25 it rings at half the sample rate (from tone ≈ 110 on
 *   op2, as on the device, where that ringing sits at 20–24 kHz and the audible band stays
 *   clean). It fades with the oscillator's pitch above ~500 Hz and is gone by 3.5 kHz
 *   ({@link BAND}): the device's own band limit;
 * - shape crossfades the feedback from y (a saw-like series) to y² (odd harmonics only, a
 *   square-like wave) ({@link SHAPE}), within 0.4 dB of every harmonic;
 * - ratio sets op2 at 0.5 + p times the note below the middle (p the ratio, 0–0.5), then at 1, 2,
 *   3, 4, 6, 8, 12, 16, 24, 32 in steps of 0.05 of the knob ({@link STEPS}), −1.4 to −15 dB above
 *   1 ({@link OP2_DB});
 * - the sum passes a one-pole highpass at {@link HIGHPASS_HZ} (so low notes sound thinner);
 * - tremolo dips the level from note-on: by half its depth at first, the swing fading in after
 *   {@link TREMOLO_DELAY}; depth to 0.54 at the middle, then 0.30 as the rate climbs from 5.2 to
 *   10.5 Hz ({@link TREMOLO}).
 *
 * Our model: the above, the tables fitted for our loop through its own spectra (a loop that feeds
 * back its last sample brightens less than the ideal y = sin(φ + β·y) at the same β); op2 fades
 * out before it could fold past Nyquist.
 */
import { OnePole, prewarp } from '../filters';
import { sin2pi } from '../sine';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

const cc = (values: readonly number[]) => values.map((v) => v / 127);
/** The knob positions the tables below were measured at: CC 0, 13, 25 … 127. */
const AT = cc([0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127]);

// Measured on the owner's device (2026-09-27).
/** The copies of the note (cents), and op2's offset from its ratio (cents). */
export const COPIES = [-9, -4, 8] as const;
export const OP2_CENTS = 4;
/**
 * Each oscillator's feedback over tone (at {@link AT}), for a loop that feeds back its last sample
 * at 48 kHz: the copies (−9, −4, +8 cents), then op2. The copies run at about 0.75, 0.9 and 0.82
 * of op2's.
 */
export const FEEDBACK = [
	[0.138, 0.241, 0.334, 0.433, 0.531, 0.628, 0.718, 0.815, 0.912, 1.001, 1.098],
	[0.167, 0.288, 0.401, 0.518, 0.635, 0.751, 0.859, 0.975, 1.09, 1.199, 1.319],
	[0.154, 0.264, 0.367, 0.476, 0.582, 0.69, 0.788, 0.896, 1.001, 1.102, 1.204],
	[0.207, 0.335, 0.449, 0.575, 0.695, 0.815, 0.926, 1.052, 1.178, 1.28, 1.44]
] as const;
/** The share of that feedback an oscillator keeps at its pitch (Hz): the device's band limit. */
export const BAND = {
	hz: [0, 441, 882, 1764, 2646, 3528],
	share: [1, 1, 0.946, 0.552, 0.14, 0]
} as const;
/** shape: the feedback's y and y² terms, as shares of tone's feedback, at {@link AT}. */
export const SHAPE = {
	y: [1, 0.99, 0.956, 0.877, 0.746, 0.596, 0.425, 0.252, 0.118, 0.028, 0],
	y2: [0, 0.03, 0.146, 0.341, 0.553, 0.712, 0.835, 0.924, 0.976, 0.994, 0.991]
} as const;
/** op2's multiple of the note above the middle of the ratio knob, a step every 0.05. */
export const STEPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32] as const;
/** op2's level at each step (dB); at 1 and below, the copies'. */
export const OP2_DB = [0, -1.36, -2.98, -4.45, -6.05, -7.8, -9.37, -11.28, -13.18, -15.28] as const;
/** Each oscillator's peak on the device (dBFS), and the highpass on their sum (Hz, one pole). */
export const OSCILLATOR_DB = -27.75;
export const HIGHPASS_HZ = 180;
/** Tremolo: its dip's depth (peak to peak) and rate (Hz) at {@link AT}. */
export const TREMOLO = {
	depth: [0, 0.12, 0.24, 0.34, 0.46, 0.54, 0.5, 0.46, 0.4, 0.36, 0.3],
	hz: [5.2, 5.2, 5.2, 5.2, 5.2, 5.2, 6.3, 7.3, 8.45, 9.3, 10.5]
} as const;
/** When the tremolo's swing starts after note-on, and how long it takes to reach full (s). */
export const TREMOLO_DELAY = 0.25;
export const TREMOLO_FADE = 0.3;

// Design constants.
/** op2 fades out between these rates (cycles a sample), before it could fold past Nyquist. */
const FOLD_FROM = 0.4;
const FOLD_TO = 0.45;
/** How long op2 takes to slide to a new ratio (s). */
const RATIO_GLIDE = 0.005;

const INV_TAU = 1 / (2 * Math.PI);

/** `values` at `x`, linearly between the points of `at`. */
function read(at: readonly number[], values: readonly number[], x: number): number {
	if (x <= at[0]) return values[0];
	const last = at.length - 1;
	if (x >= at[last]) return values[last];
	let i = 0;
	while (x > at[i + 1]) i++;
	return values[i] + ((values[i + 1] - values[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}

/** op2's multiple of the note for ratio `p` (0–1), before its +4 cents. */
export function axisRatio(p: number): number {
	if (p <= 0.5) return 0.5 + p;
	return STEPS[Math.min(STEPS.length - 1, Math.floor((p - 0.5) / 0.05))];
}

/** op2's gain at multiple `r` of the note: 1 up to 1, then the steps' levels, straight in octaves
 * between them (where a glide from one step to the next passes). */
function op2Gain(r: number): number {
	if (r <= 1) return 1;
	const octaves = Math.log2(r);
	let i = 0;
	while (i < STEPS.length - 2 && octaves > Math.log2(STEPS[i + 1])) i++;
	const from = Math.log2(STEPS[i]);
	const to = Math.log2(STEPS[i + 1]);
	const t = Math.min(1, (octaves - from) / (to - from));
	return Math.pow(10, (OP2_DB[i] + t * (OP2_DB[i + 1] - OP2_DB[i])) / 20);
}

/** The four oscillators: the three copies, then op2. */
const COUNT = 4;

export class AxisVoice implements EngineVoice {
	readonly #sr: number;
	readonly #smoothing: Smoothing;
	readonly #highpass: OnePole;
	readonly #phase = new Float64Array(COUNT);
	readonly #dt = new Float64Array(COUNT);
	readonly #y1 = new Float64Array(COUNT);
	/** Each oscillator's y and y² feedback, and op2's gain; the tremolo's depth. */
	readonly #a = Array.from({ length: COUNT }, () => new Ramp());
	readonly #b = Array.from({ length: COUNT }, () => new Ramp());
	readonly #op2 = new Ramp(1);
	readonly #depth = new Ramp();
	readonly #ramps = [...this.#a, ...this.#b, this.#op2, this.#depth];
	readonly #level: number;
	/** op2's rate: where it is and where it glides to (cycles a sample), its rate at a multiple of
	 * 1, and the feedback and shape it takes at tone and shape (before its band limit). */
	#op2Dt = 0;
	#op2Target = 0;
	#op2Unit = 0;
	#op2Beta = 0;
	#shapeY = 1;
	#shapeY2 = 0;
	readonly #ratioCoef: number;
	#lfo = 0;
	#rate = 0;
	/** Samples since note-on, for the tremolo's fade-in. */
	#age = 0;
	readonly #aNow = new Float64Array(COUNT);
	readonly #bNow = new Float64Array(COUNT);
	readonly #aStep = new Float64Array(COUNT);
	readonly #bStep = new Float64Array(COUNT);

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#highpass = new OnePole(prewarp(HIGHPASS_HZ, sampleRate));
		this.#level = Math.pow(10, (OSCILLATOR_DB + DEVICE_GAIN_DB) / 20);
		this.#ratioCoef = 1 - Math.exp(-1 / (RATIO_GLIDE * sampleRate));
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#phase.fill(0);
		this.#y1.fill(0);
		this.#highpass.reset();
		this.#lfo = 0;
		this.#age = 0;
		this.control(hz, params);
		this.#op2Dt = this.#op2Target;
		this.#followOp2(this.#op2Dt);
		for (const ramp of this.#ramps) ramp.jump(ramp.target);
	}

	control(hz: number, params: Float32Array): void {
		const tone = clamp01(params[0]);
		const p = clamp01(params[1]);
		const shape = clamp01(params[2]);
		const tremolo = clamp01(params[3]);
		const sr = this.#sr;
		const y = read(AT, SHAPE.y, shape);
		const y2 = read(AT, SHAPE.y2, shape);
		for (let j = 0; j < COPIES.length; j++) {
			const pitch = hz * Math.pow(2, COPIES[j] / 1200);
			this.#dt[j] = Math.min(pitch / sr, FOLD_TO);
			const beta = read(AT, FEEDBACK[j], tone) * read(BAND.hz, BAND.share, pitch);
			this.#a[j].target = beta * y;
			this.#b[j].target = beta * y2;
		}
		// op2's level and feedback follow the ratio it has glided to (render)
		this.#op2Unit = (hz * Math.pow(2, OP2_CENTS / 1200)) / sr;
		this.#op2Target = this.#op2Unit * axisRatio(p);
		this.#op2Beta = read(AT, FEEDBACK[3], tone);
		this.#shapeY = y;
		this.#shapeY2 = y2;
		this.#depth.target = read(AT, TREMOLO.depth, tremolo);
		this.#rate = read(AT, TREMOLO.hz, tremolo) / sr;
	}

	/** op2's level and feedback for rate `dt`: its step's level, its band limit, and its fade before
	 * it could fold back past Nyquist. */
	#followOp2(dt: number): void {
		const fold = Math.min(1, Math.max(0, (FOLD_TO - dt) / (FOLD_TO - FOLD_FROM)));
		this.#op2.target = op2Gain(dt / this.#op2Unit) * fold;
		const beta = this.#op2Beta * read(BAND.hz, BAND.share, dt * this.#sr);
		this.#a[3].target = beta * this.#shapeY;
		this.#b[3].target = beta * this.#shapeY2;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		// where op2's glide will be by the block's end, so its level and feedback move with it
		const glided = 1 - Math.pow(1 - this.#ratioCoef, n);
		this.#followOp2(this.#op2Dt + (this.#op2Target - this.#op2Dt) * glided);
		const c = this.#smoothing.coef(n);
		for (let j = 0; j < COUNT; j++) {
			this.#aNow[j] = this.#a[j].advance(c, n);
			this.#bNow[j] = this.#b[j].advance(c, n);
			this.#aStep[j] = this.#a[j].step;
			this.#bStep[j] = this.#b[j].step;
		}
		let op2 = this.#op2.advance(c, n);
		const dOp2 = this.#op2.step;
		let depth = this.#depth.advance(c, n);
		const dDepth = this.#depth.step;
		// the swing fades in after its delay; over a block it barely moves
		const seconds = this.#age / this.#sr;
		const swing = Math.min(1, Math.max(0, (seconds - TREMOLO_DELAY) / TREMOLO_FADE));
		this.#age += n;
		const phase = this.#phase;
		const dt = this.#dt;
		const y1 = this.#y1;
		const a = this.#aNow;
		const b = this.#bNow;
		const level = this.#level;
		const highpass = this.#highpass;
		for (let i = 0; i < n; i++) {
			this.#op2Dt += (this.#op2Target - this.#op2Dt) * this.#ratioCoef;
			dt[3] = Math.min(this.#op2Dt, FOLD_TO);
			op2 += dOp2;
			depth += dDepth;
			let sum = 0;
			for (let j = 0; j < COUNT; j++) {
				a[j] += this.#aStep[j];
				b[j] += this.#bStep[j];
				const last = y1[j];
				const y = sin2pi(phase[j] + (a[j] * last + b[j] * last * last) * INV_TAU);
				y1[j] = y;
				sum += j === 3 ? op2 * y : y;
				phase[j] += dt[j];
				if (phase[j] >= 1) phase[j] -= 1;
			}
			const lfo = sin2pi(this.#lfo);
			this.#lfo += this.#rate;
			if (this.#lfo >= 1) this.#lfo -= 1;
			const gain = 1 - depth * (0.5 + 0.5 * swing * lfo);
			const x = level * gain * sum;
			const out = x - highpass.process(x);
			left[i] = out;
			right[i] = out;
		}
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
