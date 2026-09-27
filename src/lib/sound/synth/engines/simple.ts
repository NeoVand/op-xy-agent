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
 * - noise is white, at {@link NOISE_LEVEL} × noise²;
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

// Calibration [I]: starting values, awaiting measurement on the owner's device (57 §6).
/** How far PW 99 narrows the pulse from 50 %: width = 0.5 − PW_RANGE·pw. */
export const PW_RANGE = 0.45;
/** Noise at noise 1, relative to the oscillator (uniform white noise, peak 1). */
export const NOISE_LEVEL = 0.45;
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

export class Simple implements EngineVoice {
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
	readonly #ramps = [this.#saw, this.#pulse, this.#width, this.#noiseLevel];
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
		const noise = params[2];
		this.#noiseLevel.target = LEVEL * NOISE_LEVEL * noise * noise;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const c = this.#smoothing.coef(n);
		let saw = this.#saw.advance(c, n);
		let pulse = this.#pulse.advance(c, n);
		let width = this.#width.advance(c, n);
		let noise = this.#noiseLevel.advance(c, n);
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
				m.saw = saw;
				m.pulse = pulse;
				m.width = width;
				let y = osc.next(dt, m) - pulse * (2 * width - 1);
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
			share += dShare;
			m.saw = saw;
			m.pulse = pulse;
			m.width = width;
			const dc = pulse * (2 * width - 1);
			const a = osc.next(dt, m) - dc;
			const b = oscR.next(dtR, m) - dc;
			const hiss = quiet ? 0 : noise * white.next();
			left[i] = a + hiss;
			right[i] = a + share * (b - a) + hiss;
		}
		this.#share = shareEnd;
		// back to one oscillator once the copy has handed the right channel back
		if (shareEnd === 0 && toward === 0) this.#copy = false;
	}
}
