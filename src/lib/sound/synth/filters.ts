/**
 * Filters for the synth core, as topology-preserving transforms of their analog circuits
 * (Zavalishin, "The Art of VA Filter Design"): they stay stable and free of zipper noise while an
 * envelope or LFO sweeps them every sample. A state-variable filter (lowpass, bandpass, highpass;
 * the OP-XY's svf and z types) and a four-pole ladder with saturating feedback (its ladder type),
 * plus a one-pole and a DC blocker for the engines, and a decimator for engines that run at twice
 * the output's rate. Coefficients come from {@link prewarp}.
 */

import { LADDER_COMPENSATION, ladderFeedback } from './laws';

/** tan(π · hz / sampleRate), the prewarped gain every TPT filter here takes, capped below Nyquist. */
export function prewarp(hz: number, sampleRate: number): number {
	const f = Math.min(Math.max(hz, 5), sampleRate * 0.49);
	return Math.tan((Math.PI * f) / sampleRate);
}

/** A fast, smooth saturator close to tanh for |x| < 3, and ±1 beyond. */
export function softClip(x: number): number {
	if (x <= -3) return -1;
	if (x >= 3) return 1;
	const x2 = x * x;
	return (x * (27 + x2)) / (27 + 9 * x2);
}

/**
 * The two-pole state-variable filter (Simper's trapezoidal SVF). `k` is the damping, 1/Q: 2 is
 * two real poles, √2 Butterworth, towards 0 a sharp resonant peak.
 */
export class Svf {
	#ic1 = 0;
	#ic2 = 0;
	#k = Math.SQRT2;
	#a1 = 0;
	#a2 = 0;
	#a3 = 0;
	/** The last sample's three responses, for callers that want more than the lowpass. */
	low = 0;
	band = 0;
	high = 0;

	constructor(g = 0.5, k = Math.SQRT2) {
		this.set(g, k);
	}

	/** New coefficients (from {@link prewarp}) without clearing the state. */
	set(g: number, k: number): void {
		this.#k = k;
		this.#a1 = 1 / (1 + g * (g + k));
		this.#a2 = g * this.#a1;
		this.#a3 = g * this.#a2;
	}

	/** Filters one sample, setting {@link low}, {@link band} and {@link high}; returns the lowpass. */
	process(x: number): number {
		const v3 = x - this.#ic2;
		const v1 = this.#a1 * this.#ic1 + this.#a2 * v3;
		const v2 = this.#ic2 + this.#a2 * this.#ic1 + this.#a3 * v3;
		this.#ic1 = 2 * v1 - this.#ic1;
		this.#ic2 = 2 * v2 - this.#ic2;
		this.band = v1;
		this.low = v2;
		this.high = x - this.#k * v1 - v2;
		return v2;
	}

	reset(): void {
		this.#ic1 = 0;
		this.#ic2 = 0;
	}
}

/** The level the ladder's loop saturates towards: full-scale signals pass nearly clean. */
const LADDER_HEADROOM = 2;

/**
 * A four-pole (24 dB/octave) lowpass ladder: four one-pole stages in a loop, solved without a unit
 * delay, the feedback saturating so that it self-oscillates smoothly near `resonance` 1 instead of
 * blowing up. `compensation` restores some of the bass that resonance takes away (0–1; the owner's
 * unit keeps about a third of it, docs/research/60-sound-session.md §2).
 */
export class Ladder {
	readonly #s = new Float64Array(4);
	#G = 0.3;
	#beta = 0.7;
	#k = 0;
	compensation = LADDER_COMPENSATION;

	constructor(g = 0.5, resonance = 0) {
		this.set(g, resonance);
	}

	/** `g` from {@link prewarp}; `resonance` 0–1 (feedback 4·r^0.9, self-oscillating at the top). */
	set(g: number, resonance: number): void {
		this.#G = g / (1 + g);
		this.#beta = 1 / (1 + g);
		this.#k = ladderFeedback(resonance);
	}

	process(x: number): number {
		const s = this.#s;
		const G = this.#G;
		const b = this.#beta;
		const G2 = G * G;
		// the output the loop settles on (linear estimate), then the saturated input it implies
		const sum = G2 * G * b * s[0] + G2 * b * s[1] + G * b * s[2] + b * s[3];
		const G4 = G2 * G2;
		const input = x * (1 + this.#k * this.compensation);
		const estimate = (G4 * input + sum) / (1 + this.#k * G4);
		let u = LADDER_HEADROOM * softClip((input - this.#k * estimate) / LADDER_HEADROOM);
		for (let i = 0; i < 4; i++) {
			const v = (u - s[i]) * G;
			const y = v + s[i];
			s[i] = y + v;
			u = y;
		}
		return u;
	}

	reset(): void {
		this.#s.fill(0);
	}
}

/** A one-pole TPT filter: lowpass from {@link process}, highpass from `x − lowpass`. */
export class OnePole {
	#s = 0;
	#G = 0.5;

	constructor(g = 1) {
		this.set(g);
	}

	set(g: number): void {
		this.#G = g / (1 + g);
	}

	process(x: number): number {
		const v = (x - this.#s) * this.#G;
		const y = v + this.#s;
		this.#s = y + v;
		return y;
	}

	reset(): void {
		this.#s = 0;
	}
}

/** Removes DC (a first-order highpass around 5–10 Hz): y = x − x₁ + r·y₁. */
export class DcBlocker {
	#x1 = 0;
	#y1 = 0;
	readonly #r: number;

	constructor(sampleRate: number, hz = 8) {
		this.#r = 1 - (2 * Math.PI * hz) / sampleRate;
	}

	process(x: number): number {
		const y = x - this.#x1 + this.#r * this.#y1;
		this.#x1 = x;
		this.#y1 = y;
		return y;
	}

	reset(): void {
		this.#x1 = 0;
		this.#y1 = 0;
	}
}

/** A Kaiser-windowed sinc lowpass: `taps` taps, cut at `cutoff` of the rate, unity at DC. */
function kaiserLowpass(taps: number, cutoff: number, beta: number): Float64Array {
	// the zeroth-order modified Bessel function, by its series
	const i0 = (x: number) => {
		let sum = 1;
		let term = 1;
		for (let k = 1; k < 32; k++) {
			term *= (x / (2 * k)) ** 2;
			sum += term;
		}
		return sum;
	};
	const half = (taps - 1) / 2;
	const h = new Float64Array(taps);
	for (let i = 0; i < taps; i++) {
		const n = i - half;
		const r = n / half;
		h[i] =
			(Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)) *
			(i0(beta * Math.sqrt(1 - r * r)) / i0(beta));
	}
	const sum = h.reduce((a, b) => a + b, 0);
	return h.map((v) => v / sum);
}

/**
 * The decimator's lowpass, as fractions of the fast rate: flat within 0.01 dB to 0.1875 (18 kHz of
 * 96), −0.3 dB at 0.198 (19 kHz), and at least 62 dB down from 0.25 (the output's Nyquist), past
 * which anything would fold back into the audio. 64 taps, so no tap sits at the centre.
 */
const DECIMATOR = kaiserLowpass(64, 0.21875, 6);

/**
 * Halves the rate of an engine that runs at twice the output's (2× oversampling): {@link process}
 * takes two samples and gives one, through {@link DECIMATOR}'s lowpass (a 0.33 ms delay at 48 kHz).
 */
export class Decimator {
	/** The last 64 inputs, written twice over so a read never wraps. */
	readonly #history = new Float64Array(2 * DECIMATOR.length);
	#at = 0;

	process(a: number, b: number): number {
		const n = DECIMATOR.length;
		const history = this.#history;
		history[this.#at] = history[this.#at + n] = a;
		this.#at = this.#at + 1 === n ? 0 : this.#at + 1;
		history[this.#at] = history[this.#at + n] = b;
		this.#at = this.#at + 1 === n ? 0 : this.#at + 1;
		// oldest to newest from #at; the taps are symmetric, so pair them
		let sum = 0;
		for (let k = 0, from = this.#at, to = this.#at + n - 1; k < n / 2; k++, from++, to--) {
			sum += DECIMATOR[k] * (history[from] + history[to]);
		}
		return sum;
	}

	reset(): void {
		this.#history.fill(0);
		this.#at = 0;
	}
}
