/**
 * prism: two oscillators under one shape control, the second at one of ten musical ratios to the
 * first and a little detuned, with stereo from a swept, detuned copy in each channel. TE presents
 * it as subtractive in spirit (Moog-like basses), with supersaw and Reese sounds from detune and
 * stereo. Evidence: `docs/research/57-synth-engines.md`, §3 (prism).
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33; `research/device/prism_fit.py`):
 * - shape, first half: saw → square as saw − k·(the saw half a cycle on), even harmonics fading as
 *   1 − k while odd ones grow as 1 + k (fitted within 0.05 dB), k reaching 1 at CC 64 along
 *   {@link BLEND}, the level falling 3.9 dB per unit of k so the square is only 0.9 dB louder;
 * - second half: each oscillator narrows its pulse, oscillator 2 first ({@link WIDTH2}: 0.5 → 0.113
 *   by CC 102) and oscillator 1 after ({@link WIDTH1}: from CC 89 to 0.115 at 127), with no level
 *   compensation (fitted within 0.06 dB);
 * - oscillator 2 plays 2.4 dB below oscillator 1 (the two in phase at 1:1), a little less at high
 *   ratios ({@link RATIO_DB}); both fade with their own pitch: −2.5 dB at 3.5 kHz, gone by 5.5 kHz;
 * - ratio: ten equal zones, 2:1 1:1 2:3 1:2 1:3 1:4 1:6 1:8 1:12 1:16 ({@link RATIOS});
 * - detune moves oscillator 2 up by as much as 15 cents ({@link DETUNE}, the same in cents on A2
 *   and A4);
 * - stereo: the device's swept copy ({@link StereoCopy}), not a pan of the two oscillators;
 * - prism sounds at the note (not an octave down), and its phases restart with every note.
 *
 * Our model plays each oscillator as the band-limited saw/pulse blend with its pulse's mean
 * subtracted exactly (a DC filter would thump at every note), and catches what the band-limited
 * steps let through near Nyquist with a one-pole lowpass at {@link LEAK_CUT} × the sample rate.
 */
import { OnePole, prewarp } from '../filters';
import { ShapeOscillator, type ShapeMix } from '../oscillators';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';
import { StereoCopy } from './stereo';

/** Oscillator 2's frequency over oscillator 1's in each of ratio's ten zones (the device's). */
export const RATIOS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

/** A curve through measured points: `at` (0–1, CC/127) and the value there. */
interface Curve {
	readonly at: readonly number[];
	readonly value: readonly number[];
}

const cc = (values: readonly number[]) => values.map((v) => v / 127);

// Measured on the owner's device (2026-09-27).
/** The blend k from saw (0) to square (1) over the first half of shape. */
export const BLEND: Curve = {
	at: cc([0, 13, 25, 38, 51, 64]),
	value: [0, 0.083, 0.275, 0.463, 0.654, 1]
};
/** The blend's level: this many dB per unit of k. */
export const BLEND_DB = -3.9;
/** Each oscillator's pulse width over the second half of shape. */
export const WIDTH1: Curve = {
	at: cc([64, 89, 102, 114, 127]),
	value: [0.5, 0.5, 0.47, 0.346, 0.115]
};
export const WIDTH2: Curve = {
	at: cc([64, 76, 89, 102, 127]),
	value: [0.5, 0.422, 0.238, 0.113, 0.113]
};
/** Oscillator 2's level against oscillator 1's at each ratio (dB). */
export const RATIO_DB: readonly number[] = [
	-2.2, -2.4, -2.7, -3.1, -3.4, -3.7, -3.9, -4.2, -4.5, -4.8
];
/** Oscillator 2's detune (cents) over detune. */
export const DETUNE: Curve = {
	at: cc([0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127]),
	value: [0, 0.9, 2, 4, 6, 7, 7.9, 10.1, 12.2, 13.2, 15]
};
/** Each oscillator's level against its pitch: a gentle one-pole-like fall, then gone by the top. */
const FALL_HZ = 4000;
const GONE_FROM_HZ = 4000;
const GONE_HZ = 5550;
/**
 * Oscillator 1's saw (peak) at shape 0: with oscillator 2 in phase at 1:1, −14.8 dBFS on the
 * device's USB audio, which our levels play {@link DEVICE_GAIN_DB} louder.
 */
const LEVEL =
	(Math.sqrt(3) * Math.pow(10, (-14.8 + DEVICE_GAIN_DB) / 20)) / (1 + Math.pow(10, -2.4 / 20));

/** The leakage lowpass's cutoff, as a fraction of the sample rate (20 kHz at 48 kHz). */
export const LEAK_CUT = 0.42;
/** Oscillators stop short of this rate (cycles a sample). */
const TOP = 0.45;

/** `curve` at `x`, linearly between its points (held beyond them). */
function read(curve: Curve, x: number): number {
	const { at, value } = curve;
	if (x <= at[0]) return value[0];
	const last = at.length - 1;
	if (x >= at[last]) return value[last];
	let i = 0;
	while (x > at[i + 1]) i++;
	return value[i] + ((value[i + 1] - value[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}

/** An oscillator's level at its own pitch `hz`. */
function pitchGain(hz: number): number {
	const gone = hz <= GONE_FROM_HZ ? 1 : Math.max(0, (GONE_HZ - hz) / (GONE_HZ - GONE_FROM_HZ));
	return gone / Math.hypot(1, hz / FALL_HZ);
}

export class PrismVoice implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	readonly #osc1 = new ShapeOscillator();
	readonly #osc2 = new ShapeOscillator();
	/** Each oscillator's blend, updated sample by sample from the ramps below. */
	readonly #mix1: ShapeMix = { sine: 0, triangle: 0, saw: 1, pulse: 0, width: 0.5 };
	readonly #mix2: ShapeMix = { sine: 0, triangle: 0, saw: 1, pulse: 0, width: 0.5 };
	readonly #saw = new Ramp(1);
	readonly #pulse = new Ramp();
	readonly #width1 = new Ramp(0.5);
	readonly #width2 = new Ramp(0.5);
	readonly #g1 = new Ramp();
	readonly #g2 = new Ramp();
	readonly #ramps = [this.#saw, this.#pulse, this.#width1, this.#width2, this.#g1, this.#g2];
	#dt1 = 0;
	#dt2 = 0;
	readonly #leak: OnePole;
	readonly #stereo: StereoCopy;

	constructor(sampleRate: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#leak = new OnePole(prewarp(LEAK_CUT * sampleRate, sampleRate));
		this.#stereo = new StereoCopy(sampleRate);
	}

	start(hz: number, _velocity: number, params: Float32Array, time = 0): void {
		this.#osc1.reset();
		this.#osc2.reset();
		this.#leak.reset();
		this.#stereo.start(params[3], time);
		this.#set(hz, params);
		// the note begins at its own settings: nothing glides in
		for (const ramp of this.#ramps) ramp.jump(ramp.target);
	}

	control(hz: number, params: Float32Array): void {
		this.#stereo.set(params[3]);
		this.#set(hz, params);
	}

	/** Targets and rates for M1 `params` at `hz`. */
	#set(hz: number, params: Float32Array): void {
		const shape = params[0];
		const k = read(BLEND, shape);
		const level = Math.pow(10, (BLEND_DB * k) / 20);
		this.#saw.target = level * (1 - k);
		this.#pulse.target = -level * k;
		this.#width1.target = read(WIDTH1, shape);
		this.#width2.target = read(WIDTH2, shape);

		const step = Math.min(RATIOS.length - 1, Math.floor(params[1] * RATIOS.length));
		const hz2 = hz * RATIOS[step] * Math.pow(2, read(DETUNE, params[2]) / 1200);
		this.#dt1 = Math.min(hz / this.#sampleRate, TOP);
		this.#dt2 = Math.min(hz2 / this.#sampleRate, TOP);
		this.#g1.target = LEVEL * pitchGain(hz);
		this.#g2.target = LEVEL * Math.pow(10, RATIO_DB[step] / 20) * pitchGain(hz2);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const c = this.#smoothing.coef(n);
		let saw = this.#saw.advance(c, n);
		let pulse = this.#pulse.advance(c, n);
		let width1 = this.#width1.advance(c, n);
		let width2 = this.#width2.advance(c, n);
		let g1 = this.#g1.advance(c, n);
		let g2 = this.#g2.advance(c, n);
		const dSaw = this.#saw.step;
		const dPulse = this.#pulse.step;
		const dWidth1 = this.#width1.step;
		const dWidth2 = this.#width2.step;
		const dg1 = this.#g1.step;
		const dg2 = this.#g2.step;
		const m1 = this.#mix1;
		const m2 = this.#mix2;
		const osc1 = this.#osc1;
		const osc2 = this.#osc2;
		const dt1 = this.#dt1;
		const dt2 = this.#dt2;
		const leak = this.#leak;
		for (let i = 0; i < n; i++) {
			saw += dSaw;
			pulse += dPulse;
			width1 += dWidth1;
			width2 += dWidth2;
			g1 += dg1;
			g2 += dg2;
			m1.saw = m2.saw = saw;
			m1.pulse = m2.pulse = pulse;
			// a sample wide at least, as the oscillator keeps it: then the mean subtracted is exact
			m1.width = Math.max(width1, dt1);
			m2.width = Math.max(width2, dt2);
			const a = osc1.next(dt1, m1) - pulse * (2 * m1.width - 1);
			const b = osc2.next(dt2, m2) - pulse * (2 * m2.width - 1);
			left[i] = leak.process(g1 * a + g2 * b);
		}
		this.#stereo.process(left, left, right, n);
	}
}
