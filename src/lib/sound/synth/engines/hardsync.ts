/**
 * hardsync: a saw hard-synced to the note, its own pitch swept over three octaves (the moving
 * formant of classic sync leads), a sub at the note, white noise, and a highpass on top of the
 * track's filter. Evidence and open questions: `docs/research/57-synth-engines.md`, §3 (hardsync).
 *
 * Established [E]:
 * - a saw slave hard-synced to a master, freq spanning about three octaves;
 * - the sub sits at the master's pitch; noise is white;
 * - lowcut is a highpass on top of M3 (TE's staff), the source of its thin, tinny sound;
 * - puny without the sub, and loud raw (presets sit at preset volume 24–48 %).
 *
 * Our model [I]:
 * - the master is a bare phase at the note; the slave, a band-limited saw at
 *   note × 2^({@link OCTAVES}·freq), restarts at the exact fraction of a sample where the master
 *   wraps, so the pitch stays the note's while freq moves the formant. Continuous, no steps;
 * - the sub is a sine read off the master's own phase, at the note rather than an octave below:
 *   "at the master's pitch" says so, and it gives the synced saw the fundamental it lacks without
 *   moving the pitch; it enters at {@link SUB_LEVEL} × sub;
 * - noise is white, at {@link NOISE_LEVEL} × noise²;
 * - lowcut is a two-pole (Butterworth) TPT highpass on the sum of all three, exponential from
 *   {@link LOWCUT_FROM} to {@link LOWCUT_TO}, gliding a few milliseconds so a jump cannot click. Even
 *   at 0 it clears the DC a synced saw carries;
 * - mono; levels are normalized to our target, not the device's hot output;
 * - the slave stops rising at {@link SLAVE_TOP} × the sample rate, which only notes above about
 *   1.2 kHz with freq near full reach: there Nyquist cuts the synced saw's series off near its
 *   formant, the few harmonics left line up at every reset and the peaks more than double;
 * - a one-pole lowpass at {@link LEAK_CUT} × the sample rate (−0.7 dB at 15 kHz) catches what the
 *   band-limited steps let through just past Nyquist (the slave's third harmonic, at freq 1 on a
 *   1 kHz note);
 * - the default barely touches the soft ceiling of `guard.ts` (a sample in ten thousand: its
 *   lowcut turns the saw's drops into one-sided spikes, so its peaks already sit near 1); the
 *   corners where a full sub and full noise meet the saw's peaks ease into it.
 */
import { OnePole, Svf, prewarp } from '../filters';
import { Noise } from '../noise';
import { Phase, Saw } from '../oscillators';
import { ceiling } from './guard';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

// Calibration [I]: starting values, awaiting measurement on the owner's device (57 §6).
/** The slave's range above the note at freq 1, in octaves. */
export const OCTAVES = 3;
/** The sub sine's amplitude at sub 1, against the saw's ±1. */
export const SUB_LEVEL = 0.8;
/** Noise at noise 1, against the saw's ±1 (uniform white noise, peak 1). */
export const NOISE_LEVEL = 0.4;
/** The lowcut's cutoff at 0 and at 1, in hertz (exponential between). */
export const LOWCUT_FROM = 20;
export const LOWCUT_TO = 3000;
/** Output level: RMS ≈ 0.22 at the default M1, where the lowcut thins the sound into spikes. */
export const LEVEL = 0.47;

/** The slave's highest rate, as a fraction of the sample rate (9.6 kHz at 48 kHz). */
export const SLAVE_TOP = 0.2;
/** The leakage lowpass's cutoff, as a fraction of the sample rate (20 kHz at 48 kHz). */
export const LEAK_CUT = 0.42;

const TAU = 2 * Math.PI;
/** The master's highest rate (cycles a sample). */
const TOP = 0.45;

export class Hardsync implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	readonly #noise: Noise;
	readonly #master = new Phase();
	readonly #slave = new Saw();
	readonly #lowcut = new Svf(0.5, Math.SQRT2);
	readonly #leak: OnePole;
	readonly #sub = new Ramp();
	readonly #noiseLevel = new Ramp();
	/** The lowcut's cutoff, in octaves above 1 Hz (it glides in octaves). */
	readonly #cutoff = new Ramp();
	/** The cutoff the filter is set to now. */
	#at = NaN;
	#dt = 0;
	#dtSlave = 0;

	constructor(sampleRate: number, seed: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#noise = new Noise(seed);
		this.#leak = new OnePole(prewarp(LEAK_CUT * sampleRate, sampleRate));
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#master.value = 0;
		this.#slave.reset();
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
		this.#dtSlave = Math.max(
			this.#dt,
			Math.min(this.#dt * Math.pow(2, OCTAVES * params[0]), SLAVE_TOP)
		);
		this.#sub.target = LEVEL * SUB_LEVEL * params[1];
		const noise = params[2];
		this.#noiseLevel.target = LEVEL * NOISE_LEVEL * noise * noise;
		this.#cutoff.target = Math.log2(LOWCUT_FROM) + Math.log2(LOWCUT_TO / LOWCUT_FROM) * params[3];
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
			this.#lowcut.set(prewarp(Math.pow(2, cutoff), this.#sampleRate), Math.SQRT2);
		}
		const master = this.#master;
		const slave = this.#slave;
		const lowcut = this.#lowcut;
		const leak = this.#leak;
		const white = this.#noise;
		const dt = this.#dt;
		const dtSlave = this.#dtSlave;
		for (let i = 0; i < n; i++) {
			sub += dSub;
			noise += dNoise;
			// the saw at the level, the sub and noise already scaled by theirs
			let x = LEVEL * slave.next(dtSlave, master.step(dt));
			if (withSub) x += sub * Math.sin(TAU * master.value);
			if (withNoise) x += noise * white.next();
			lowcut.process(x);
			left[i] = right[i] = ceiling(leak.process(lowcut.high));
		}
	}
}
