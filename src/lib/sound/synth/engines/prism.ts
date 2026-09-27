/**
 * prism: two oscillators under one shape control, the second at one of nine musical ratios to the
 * first and a little detuned, spread across the stereo field. TE presents it as subtractive in
 * spirit (Moog-like basses), with supersaw and Reese sounds from detune plus stereo. Evidence and
 * open questions: `docs/research/57-synth-engines.md`, §3 (prism).
 *
 * Established [E]:
 * - two oscillators share one shape: saw at 0, square around the upper third, a narrower pulse at
 *   the top (the scope review sees the width skew there);
 * - ratio has nine fixed steps, shown on the device as oscillator 1 : oscillator 2 = 2:1, 1:1, 2:3,
 *   1:2, 1:3, 1:4, 1:6, 1:8, 1:12 (a reviewer hears it move in fifths and fourths);
 * - detune is small and moves oscillator 2;
 * - stereo 0 is mono; turned up it sounds wide and phasey, like a stereo phaser.
 *
 * Our model [I]:
 * - both oscillators are one band-limited saw/pulse blend, at half level each. Up to
 *   {@link SQUARE_AT}, shape morphs saw into square as saw − k·(the same saw half a cycle on) =
 *   (1 − k)·saw − k·square: even harmonics fade as 1 − k and odd ones grow as 1 + k, with no dip
 *   (a plain crossfade passes through a half-level saw). Above it the square narrows to
 *   {@link NARROWEST};
 * - ratio step ⌊p2·9⌋ sets oscillator 2 to oscillator 1 × {@link RATIOS}[step];
 * - detune raises oscillator 2 by up to {@link DETUNE_CENTS}, on a squared curve (fine near 0);
 * - stereo pans oscillator 1 left and 2 right (equal power, up to {@link STEREO_PAN}) and detunes a
 *   left and a right copy of each by ∓{@link STEREO_CENTS}, so it widens even at 1:1 with no
 *   detune. The right copies run only while stereo is up, taking the right channel over from the
 *   originals within a few milliseconds;
 * - phases restart with every note (the device's behaviour is unknown; this keeps attacks alike);
 * - the pulse's mean (2w − 1 per unit of pulse) is subtracted exactly: a DC filter would thump at
 *   the start of every note;
 * - a one-pole lowpass at {@link LEAK_CUT} × the sample rate (−0.7 dB at 15 kHz) catches what the
 *   band-limited steps let through just past Nyquist, which matters for oscillator 2 at high
 *   ratios: at 1:12 on a 1 kHz note its second harmonic sits right at Nyquist.
 *
 * Open: every factory prism preset transposes +12, so prism may sound an octave below the note on
 * the device. Not built in until a recording settles it.
 */
import { OnePole, prewarp } from '../filters';
import { ShapeOscillator, type ShapeMix } from '../oscillators';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

/** Oscillator 2's frequency over oscillator 1's at each ratio step [E, the device's screen]. */
export const RATIOS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12];

// Calibration [I]: starting values, awaiting measurement on the owner's device (57 §6).
/** Shape at which the saw has become a square; above it, the pulse narrows. */
export const SQUARE_AT = 0.8;
/** Pulse width at shape 1. */
export const NARROWEST = 0.27;
/** Oscillator 2's detune at detune 1, in cents (on a squared curve). */
export const DETUNE_CENTS = 30;
/** How far each oscillator pans off centre at stereo 1 (1 would be hard left and right). */
export const STEREO_PAN = 0.5;
/** The left copies' detune down and the right copies' up at stereo 1, in cents. */
export const STEREO_CENTS = 3;
/** Output level: RMS ≈ 0.28 per channel at the default M1 (two squares, 1:8). */
export const LEVEL = 0.4;

/** The leakage lowpass's cutoff, as a fraction of the sample rate (20 kHz at 48 kHz). */
export const LEAK_CUT = 0.42;
/** Oscillators fade out between these rates (cycles a sample): none of their harmonics is heard. */
const FADE_FROM = 0.3;
const TOP = 0.45;
/** Samples the right channel takes to move onto the stereo copies, or back off them. */
const TAKEOVER = 128;

/** An oscillator's level towards the top of the band: 1, fading to 0 at {@link TOP}. */
const fade = (dt: number): number => Math.min(1, Math.max(0, (TOP - dt) / (TOP - FADE_FROM)));

export class Prism implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	/** Oscillators 1 and 2 (the left channel, and the right in mono), and their right copies. */
	readonly #osc1 = new ShapeOscillator();
	readonly #osc2 = new ShapeOscillator();
	readonly #osc1r = new ShapeOscillator();
	readonly #osc2r = new ShapeOscillator();
	/** The blend all four play, updated sample by sample from the ramps below. */
	readonly #mix: ShapeMix = { sine: 0, triangle: 0, saw: 1, pulse: 0, width: 0.5 };
	readonly #saw = new Ramp(1);
	readonly #pulse = new Ramp();
	readonly #width = new Ramp(0.5);
	/** Each oscillator's level in each channel. */
	readonly #l1 = new Ramp();
	readonly #l2 = new Ramp();
	readonly #r1 = new Ramp();
	readonly #r2 = new Ramp();
	readonly #ramps = [this.#saw, this.#pulse, this.#width, this.#l1, this.#l2, this.#r1, this.#r2];
	#dt1 = 0;
	#dt2 = 0;
	#dt1r = 0;
	#dt2r = 0;
	/** Whether the right copies run, and how much of the right channel they make (0–1). */
	#copies = false;
	#share = 0;
	#shareTarget = 0;
	readonly #leakL: OnePole;
	readonly #leakR: OnePole;

	constructor(sampleRate: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		const g = prewarp(LEAK_CUT * sampleRate, sampleRate);
		this.#leakL = new OnePole(g);
		this.#leakR = new OnePole(g);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#osc1.reset();
		this.#osc2.reset();
		this.#osc1r.reset();
		this.#osc2r.reset();
		this.#leakL.reset();
		this.#leakR.reset();
		this.#copies = params[3] > 0;
		this.#share = this.#shareTarget = this.#copies ? 1 : 0;
		this.#set(hz, params);
		// the note begins at its own settings: nothing glides in
		for (const ramp of this.#ramps) ramp.jump(ramp.target);
	}

	control(hz: number, params: Float32Array): void {
		const wide = params[3] > 0;
		if (wide && !this.#copies) {
			// the copies start where the originals are, and the right channel crossfades onto them
			this.#osc1r.reset(this.#osc1.phase);
			this.#osc2r.reset(this.#osc2.phase);
			this.#copies = true;
		}
		this.#shareTarget = wide ? 1 : 0;
		this.#set(hz, params);
	}

	/** Targets and rates for M1 `params` at `hz`. */
	#set(hz: number, params: Float32Array): void {
		const shape = params[0];
		const k = Math.min(1, shape / SQUARE_AT);
		this.#saw.target = 1 - k;
		this.#pulse.target = -k;
		this.#width.target =
			shape <= SQUARE_AT ? 0.5 : 0.5 - ((0.5 - NARROWEST) * (shape - SQUARE_AT)) / (1 - SQUARE_AT);

		const dt = hz / this.#sampleRate;
		const step = Math.min(RATIOS.length - 1, Math.floor(params[1] * RATIOS.length));
		const detune = params[2];
		const dt2 = dt * RATIOS[step] * Math.pow(2, (DETUNE_CENTS * detune * detune) / 1200);
		const stereo = params[3];
		const spread = Math.pow(2, (STEREO_CENTS * stereo) / 1200);
		this.#dt1 = Math.min(dt / spread, TOP);
		this.#dt2 = Math.min(dt2 / spread, TOP);
		this.#dt1r = Math.min(dt * spread, TOP);
		this.#dt2r = Math.min(dt2 * spread, TOP);

		// equal-power pans with the centre at unity: oscillator 1 moves left, oscillator 2 right
		const angle = (Math.PI / 4) * (1 - STEREO_PAN * stereo);
		const near = Math.SQRT2 * Math.cos(angle);
		const far = Math.SQRT2 * Math.sin(angle);
		const half = LEVEL / 2;
		const g1 = half * fade(dt * spread);
		const g2 = half * fade(dt2 * spread);
		this.#l1.target = g1 * near;
		this.#r1.target = g1 * far;
		this.#l2.target = g2 * far;
		this.#r2.target = g2 * near;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const c = this.#smoothing.coef(n);
		let saw = this.#saw.advance(c, n);
		let pulse = this.#pulse.advance(c, n);
		let width = this.#width.advance(c, n);
		let l1 = this.#l1.advance(c, n);
		let l2 = this.#l2.advance(c, n);
		let r1 = this.#r1.advance(c, n);
		let r2 = this.#r2.advance(c, n);
		const dSaw = this.#saw.step;
		const dPulse = this.#pulse.step;
		const dWidth = this.#width.step;
		const dl1 = this.#l1.step;
		const dl2 = this.#l2.step;
		const dr1 = this.#r1.step;
		const dr2 = this.#r2.step;
		const m = this.#mix;
		const osc1 = this.#osc1;
		const osc2 = this.#osc2;
		const dt1 = this.#dt1;
		const dt2 = this.#dt2;
		const leakL = this.#leakL;
		const leakR = this.#leakR;

		if (!this.#copies) {
			for (let i = 0; i < n; i++) {
				saw += dSaw;
				pulse += dPulse;
				width += dWidth;
				l1 += dl1;
				l2 += dl2;
				r1 += dr1;
				r2 += dr2;
				m.saw = saw;
				m.pulse = pulse;
				m.width = width;
				const dc = pulse * (2 * width - 1);
				const a = osc1.next(dt1, m) - dc;
				const b = osc2.next(dt2, m) - dc;
				left[i] = leakL.process(l1 * a + l2 * b);
				right[i] = leakR.process(r1 * a + r2 * b);
			}
			return;
		}

		// stereo: the right channel is the copies, crossfaded from the originals while taking over
		const osc1r = this.#osc1r;
		const osc2r = this.#osc2r;
		const dt1r = this.#dt1r;
		const dt2r = this.#dt2r;
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
			l1 += dl1;
			l2 += dl2;
			r1 += dr1;
			r2 += dr2;
			share += dShare;
			m.saw = saw;
			m.pulse = pulse;
			m.width = width;
			const dc = pulse * (2 * width - 1);
			const a = osc1.next(dt1, m) - dc;
			const b = osc2.next(dt2, m) - dc;
			const ar = osc1r.next(dt1r, m) - dc;
			const br = osc2r.next(dt2r, m) - dc;
			left[i] = leakL.process(l1 * a + l2 * b);
			right[i] = leakR.process(r1 * (a + share * (ar - a)) + r2 * (b + share * (br - b)));
		}
		this.#share = shareEnd;
		// back to mono once the copies have handed the right channel back
		if (shareEnd === 0 && this.#shareTarget === 0) this.#copies = false;
	}
}
