/**
 * simple: one oscillator that morphs from saw to square, a pulse width for the square, white
 * noise, and a stereo spread that detunes a left and a right copy apart. Evidence and open
 * questions: `docs/research/57-synth-engines.md`, §3 (simple).
 *
 * Established [E]:
 * - shape goes from saw at 0 to square at 100 (four reviewers agree);
 * - pulse width does nothing while shape is at saw;
 * - the factory preset "big square" is shape 100 with PW 0, so PW 0 is the square;
 * - stereo spreads "the oscillators" (plural) and sounds like a stereo phaser;
 * - the raw engine is hot: square basses use preset volume 11–25 %.
 *
 * Our model [I]:
 * - shape k blends (1 − k)·saw − k·pulse. At PW 0 that is the saw minus k times itself half a
 *   cycle on, so even harmonics fade out as odd ones grow, with no dip in level. The width acts
 *   only on the pulse part (nothing at saw, as reviewers hear it), from 50 % at PW 0 down to
 *   0.5 − {@link PW_RANGE} at PW 99;
 * - the pulse's mean (2w − 1 per unit of pulse) is subtracted exactly, so narrow pulses carry no
 *   DC into the filter and the envelope;
 * - noise crossfades the oscillator into white noise, as measured on the device (2026-09-27, T1,
 *   docs/research/90-device-probe.md): the oscillator stays whole to about 60 %, then fades out and
 *   is gone at 100 %, while the noise rises so that the loudness barely changes
 *   ({@link NOISE_CURVE});
 * - stereo detunes the left copy down and the right copy up by {@link STEREO_CENTS} × stereo²: at
 *   0 they are the same oscillator (mono); up, they drift through each other's phase like a
 *   stereo phaser. The right copy runs only while stereo is up, taking the right channel over from
 *   the left oscillator within a few milliseconds;
 * - the phase restarts with every note; levels are normalized to our target, not the device's
 *   hot output (the preset volume and our core gain set the rest).
 */
import { Noise } from '../noise';
import { ShapeOscillator, type ShapeMix } from '../oscillators';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

// Measured on the owner's device (2026-09-27): pulse width and the noise crossfade.
/** How far PW 99 narrows the pulse from 50 %: width = 0.5 − PW_RANGE·pw (6 % at the end). */
export const PW_RANGE = 0.44;
/**
 * The noise crossfade, sampled at noise = 0, 0.1 … 1: the oscillator's gain, and the noise's
 * (uniform white noise, peak 1) relative to the oscillator's level. Read off the device's harmonic
 * and noise levels at CC steps of 13 on a saw: at 100 % the noise carries 1.5× the saw's power.
 */
export const NOISE_CURVE = {
	osc: [1, 1, 1, 1, 1, 1, 1, 0.84, 0.56, 0.28, 0],
	noise: [0, 0, 0.01, 0.03, 0.127, 0.23, 0.386, 0.643, 0.854, 1.045, 1.229]
} as const;
/** The left copy's detune down and the right copy's up at stereo 1, in cents (squared curve). */
export const STEREO_CENTS = 10;
/**
 * Output level: RMS ≈ 0.25 at the default M1 (shape and PW at 80: a narrow pulse with some saw).
 * It leaves room for the narrowest pulse, whose DC-free spike reaches 1.9, with full noise on top.
 */
export const LEVEL = 0.4;

/** The highest oscillator rate (cycles a sample), well clear of Nyquist. */
const TOP = 0.45;
/** Samples the right channel takes to move onto the right copy, or back off it. */
const TAKEOVER = 128;

export class SimpleVoice implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	readonly #noise: Noise;
	/** The oscillator (the left channel, and the right in mono) and its right copy. */
	readonly #osc = new ShapeOscillator();
	readonly #oscR = new ShapeOscillator();
	readonly #mix: ShapeMix = { sine: 0, triangle: 0, saw: 1, pulse: 0, width: 0.5 };
	readonly #saw = new Ramp(1);
	readonly #pulse = new Ramp();
	readonly #width = new Ramp(0.5);
	readonly #noiseLevel = new Ramp();
	/** The oscillator's share against the noise (the crossfade). */
	readonly #oscLevel = new Ramp(1);
	readonly #ramps = [this.#saw, this.#pulse, this.#width, this.#noiseLevel, this.#oscLevel];
	#dt = 0;
	#dtR = 0;
	/** Whether the right copy runs, and how much of the right channel it makes (0–1). */
	#copy = false;
	#share = 0;
	#shareTarget = 0;

	constructor(sampleRate: number, seed: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#noise = new Noise(seed);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#osc.reset();
		this.#oscR.reset();
		this.#copy = params[3] > 0;
		this.#share = this.#shareTarget = this.#copy ? 1 : 0;
		this.#set(hz, params);
		// the note begins at its own settings: nothing glides in
		for (const ramp of this.#ramps) ramp.jump(ramp.target);
	}

	control(hz: number, params: Float32Array): void {
		const wide = params[3] > 0;
		if (wide && !this.#copy) {
			// the copy starts where the oscillator is, and the right channel crossfades onto it
			this.#oscR.reset(this.#osc.phase);
			this.#copy = true;
		}
		this.#shareTarget = wide ? 1 : 0;
		this.#set(hz, params);
	}

	/** Targets and rates for M1 `params` at `hz`. */
	#set(hz: number, params: Float32Array): void {
		const k = params[0];
		const stereo = params[3];
		const spread = Math.pow(2, (STEREO_CENTS * stereo * stereo) / 1200);
		const dt = hz / this.#sampleRate;
		this.#dt = Math.min(dt / spread, TOP);
		this.#dtR = Math.min(dt * spread, TOP);
		this.#saw.target = LEVEL * (1 - k);
		this.#pulse.target = -LEVEL * k;
		// a sample wide at least, as the oscillator keeps it: then the mean we subtract is exact
		this.#width.target = Math.max(0.5 - PW_RANGE * params[1], this.#dtR);
		this.#oscLevel.target = curve(NOISE_CURVE.osc, params[2]);
		this.#noiseLevel.target = LEVEL * curve(NOISE_CURVE.noise, params[2]);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const c = this.#smoothing.coef(n);
		let saw = this.#saw.advance(c, n);
		let pulse = this.#pulse.advance(c, n);
		let width = this.#width.advance(c, n);
		let noise = this.#noiseLevel.advance(c, n);
		let gain = this.#oscLevel.advance(c, n);
		const dGain = this.#oscLevel.step;
		const dSaw = this.#saw.step;
		const dPulse = this.#pulse.step;
		const dWidth = this.#width.step;
		const dNoise = this.#noiseLevel.step;
		const quiet = this.#noiseLevel.idle;
		const m = this.#mix;
		const osc = this.#osc;
		const dt = this.#dt;
		const white = this.#noise;

		if (!this.#copy) {
			for (let i = 0; i < n; i++) {
				saw += dSaw;
				pulse += dPulse;
				width += dWidth;
				noise += dNoise;
				gain += dGain;
				m.saw = saw;
				m.pulse = pulse;
				m.width = width;
				let y = gain * (osc.next(dt, m) - pulse * (2 * width - 1));
				if (!quiet) y += noise * white.next();
				left[i] = right[i] = y;
			}
			return;
		}

		// stereo: the right channel is the copy, crossfaded from the oscillator while taking over
		const oscR = this.#oscR;
		const dtR = this.#dtR;
		let share = this.#share;
		const toward = this.#shareTarget;
		const shareEnd =
			toward > share
				? Math.min(toward, share + n / TAKEOVER)
				: Math.max(toward, share - n / TAKEOVER);
		const dShare = (shareEnd - share) / n;
		for (let i = 0; i < n; i++) {
			saw += dSaw;
			pulse += dPulse;
			width += dWidth;
			noise += dNoise;
			gain += dGain;
			share += dShare;
			m.saw = saw;
			m.pulse = pulse;
			m.width = width;
			const dc = pulse * (2 * width - 1);
			const a = gain * (osc.next(dt, m) - dc);
			const b = gain * (oscR.next(dtR, m) - dc);
			const hiss = quiet ? 0 : noise * white.next();
			left[i] = a + hiss;
			right[i] = a + share * (b - a) + hiss;
		}
		this.#share = shareEnd;
		// back to one oscillator once the copy has handed the right channel back
		if (shareEnd === 0 && toward === 0) this.#copy = false;
	}
}

/** A curve sampled at 0, 0.1 … 1, read at `x` (0–1) between its points. */
function curve(points: readonly number[], x: number): number {
	const at = Math.min(1, Math.max(0, x)) * (points.length - 1);
	const i = Math.min(points.length - 2, Math.floor(at));
	return points[i] + (points[i + 1] - points[i]) * (at - i);
}
