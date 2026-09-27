/**
 * hardsync: a saw hard-synced to the note, its own pitch swept from the note to three octaves up
 * (the moving formant of classic sync leads), a sub saw at the note, white noise, and a lowcut on
 * the saws. Evidence: `docs/research/57-synth-engines.md`, §3 (hardsync).
 *
 * Measured on the owner's device (2026-09-27, OS 1.1.33, `2026-09-27-133212-hardsync`):
 * - freq moves the synced saw linearly from the note to 8 × it: 1 + 7·freq (at CC 38 the third
 *   harmonic leads, at 51 the fourth, at 127 the eighth, a plain saw three octaves up); the same on
 *   A2 and A4;
 * - the sub is a saw at the note in phase with the synced one (at freq 0 the sum stays a pure saw),
 *   up to twice the synced saw's level at sub 1 ({@link SUB_LEVEL}), rising a little faster than
 *   in proportion ({@link SUB_CURVE});
 * - the lowcut filters the saws only: the noise passes untouched (flat, white) at every setting. It
 *   is one pole, its corner along {@link LOWCUT} from nothing at 0 to 8 kHz at 127 (fitted on the
 *   saw's first harmonics within 2 dB): the thin, tinny sound;
 * - the synced saw is −24.3 dBFS on average over freq and notes (simple's saw −18.9), scattered
 *   ±1 dB note to note; noise at 100 is white at −64 dBFS/Hz (−20.6 dBFS in all on the device's
 *   44.1 kHz audio).
 *
 * Our model:
 * - the master is a bare phase at the note; the slave, a band-limited saw at the note × the ratio,
 *   restarts at the exact fraction of a sample where the master wraps, so the pitch stays the
 *   note's while freq moves the formant; the sub is a second band-limited saw on the master's
 *   phase;
 * - the lowcut is a one-pole TPT highpass on the saws, gliding in octaves so a jump cannot click;
 *   noise joins after it, ∝ noise² (the curve is not measured yet);
 * - the slave stops rising at {@link SLAVE_TOP} × the sample rate (the device's aliases there: its
 *   synced saw at 14 kHz on A6 turns to noise); a one-pole lowpass at {@link LEAK_CUT} × the
 *   sample rate catches what the band-limited steps let through just past Nyquist;
 * - the soft ceiling of `guard.ts` stays as a guard; at the device's levels it is not reached.
 */
import { OnePole, prewarp } from '../filters';
import { Noise } from '../noise';
import { Phase, Saw } from '../oscillators';
import { DEVICE_GAIN_DB } from './device';
import { ceiling } from './guard';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

// Measured on the owner's device (2026-09-27).
/** The slave's ratio to the note at freq 1 (linear from 1 at freq 0). */
export const TOP_RATIO = 8;
/** The sub saw's level at sub 1, against the synced saw's, and its curve: SUB_LEVEL · sub^curve. */
export const SUB_LEVEL = 2;
export const SUB_CURVE = 0.8;
/** The lowcut's corner (Hz, one pole) at CC 0, 13, 25 … 127: read in octaves between them. */
export const LOWCUT = {
	at: [0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127].map((v) => v / 127),
	hz: [10, 101, 417, 712, 1023, 1888, 2757, 4028, 5006, 5334, 8165]
} as const;
/**
 * The saw's peak at freq 0: −24.1 dBFS RMS, which puts the synced saw at the device's average over
 * freq (−24.3 dBFS), played {@link DEVICE_GAIN_DB} louder.
 */
export const LEVEL = Math.sqrt(3) * Math.pow(10, (-24.1 + DEVICE_GAIN_DB) / 20);
/** Noise at noise 1: white at this density on the device (dBFS per hertz). */
export const NOISE_DENSITY_DB = -64;

/** The slave's highest rate, as a fraction of the sample rate (9.6 kHz at 48 kHz). */
export const SLAVE_TOP = 0.2;
/** The leakage lowpass's cutoff, as a fraction of the sample rate (20 kHz at 48 kHz). */
export const LEAK_CUT = 0.42;

/** The master's highest rate (cycles a sample). */
const TOP = 0.45;

export class HardsyncVoice implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	readonly #noise: Noise;
	readonly #master = new Phase();
	readonly #slave = new Saw();
	readonly #subSaw = new Saw();
	readonly #lowcut = new OnePole();
	readonly #leak: OnePole;
	readonly #sub = new Ramp();
	readonly #noiseLevel = new Ramp();
	/** The lowcut's cutoff, in octaves above 1 Hz (it glides in octaves). */
	readonly #cutoff = new Ramp();
	/** The cutoff the filter is set to now. */
	#at = NaN;
	#dt = 0;
	#dtSlave = 0;
	/** Uniform white noise's peak for the measured density at this sample rate. */
	readonly #noiseFull: number;

	constructor(sampleRate: number, seed: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#noise = new Noise(seed);
		this.#leak = new OnePole(prewarp(LEAK_CUT * sampleRate, sampleRate));
		// uniform noise of peak A has power A²/3, spread over sampleRate/2 hertz
		const density = Math.pow(10, (NOISE_DENSITY_DB + DEVICE_GAIN_DB) / 10);
		this.#noiseFull = Math.sqrt((3 * density * sampleRate) / 2);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#master.value = 0;
		this.#slave.reset();
		this.#subSaw.reset();
		this.#lowcut.reset();
		this.#leak.reset();
		this.#set(hz, params);
		this.#sub.jump(this.#sub.target);
		this.#noiseLevel.jump(this.#noiseLevel.target);
		this.#cutoff.jump(this.#cutoff.target);
	}

	control(hz: number, params: Float32Array): void {
		this.#set(hz, params);
	}

	/** Targets and rates for M1 `params` at `hz`. */
	#set(hz: number, params: Float32Array): void {
		this.#dt = Math.min(hz / this.#sampleRate, TOP);
		const ratio = 1 + (TOP_RATIO - 1) * params[0];
		this.#dtSlave = Math.max(this.#dt, Math.min(this.#dt * ratio, SLAVE_TOP));
		this.#sub.target = LEVEL * SUB_LEVEL * Math.pow(params[1], SUB_CURVE);
		const noise = params[2];
		this.#noiseLevel.target = this.#noiseFull * noise * noise;
		this.#cutoff.target = lowcutOctaves(params[3]);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const c = this.#smoothing.coef(n);
		let sub = this.#sub.advance(c, n);
		let noise = this.#noiseLevel.advance(c, n);
		const dSub = this.#sub.step;
		const dNoise = this.#noiseLevel.step;
		const withSub = !this.#sub.idle;
		const withNoise = !this.#noiseLevel.idle;
		this.#cutoff.advance(c, n);
		// the filter moves once a block (its coefficient costs a tan), in small gliding steps
		const cutoff = this.#cutoff.value;
		if (cutoff !== this.#at) {
			this.#at = cutoff;
			this.#lowcut.set(prewarp(Math.pow(2, cutoff), this.#sampleRate));
		}
		const master = this.#master;
		const slave = this.#slave;
		const subSaw = this.#subSaw;
		const lowcut = this.#lowcut;
		const leak = this.#leak;
		const white = this.#noise;
		const dt = this.#dt;
		const dtSlave = this.#dtSlave;
		for (let i = 0; i < n; i++) {
			sub += dSub;
			noise += dNoise;
			const wrap = master.step(dt);
			// the saws at their levels through the lowcut (its highpass: the input less the lowpass)
			let x = LEVEL * slave.next(dtSlave, wrap);
			if (withSub) x += sub * subSaw.next(dt, wrap);
			x -= lowcut.process(x);
			if (withNoise) x += noise * white.next();
			left[i] = right[i] = ceiling(leak.process(x));
		}
	}
}

/** The lowcut's corner at `x` (0–1), in octaves above 1 Hz, between the measured points. */
function lowcutOctaves(x: number): number {
	const { at, hz } = LOWCUT;
	if (x <= at[0]) return Math.log2(hz[0]);
	const last = at.length - 1;
	if (x >= at[last]) return Math.log2(hz[last]);
	let i = 0;
	while (x > at[i + 1]) i++;
	const t = (x - at[i]) / (at[i + 1] - at[i]);
	return Math.log2(hz[i]) + t * Math.log2(hz[i + 1] / hz[i]);
}
