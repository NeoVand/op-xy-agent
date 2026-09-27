/**
 * Oscillators for the synth core, one sample at a time: a phase that reports when it wraps (so
 * another oscillator can hard-sync to it at the exact fraction of a sample), a saw for stacks, a
 * shape oscillator that blends sine, triangle, saw and pulse in one band-limited output, and a sine
 * operator for FM. Frequencies are given as `dt`, cycles per sample (hertz / sample rate), below
 * one half.
 */
import { BlepBuffer, polyBlamp } from './blep';

const TAU = 2 * Math.PI;

/** No wrap this sample (what {@link Phase.step} and the oscillators return when none happened). */
export const NO_WRAP = -1;

/** A phase in [0, 1) advancing by `dt` a sample. */
export class Phase {
	value: number;

	constructor(start = 0) {
		this.value = start - Math.floor(start);
	}

	/**
	 * Advances one sample. Returns how long ago the phase wrapped, in samples (0 ≤ ago < 1), or
	 * {@link NO_WRAP}: what a hard-synced oscillator needs to restart at the same instant.
	 */
	step(dt: number): number {
		let p = this.value + dt;
		if (p >= 1) {
			p -= 1;
			this.value = p;
			return p / dt;
		}
		this.value = p;
		return NO_WRAP;
	}
}

/** A band-limited saw rising from −1 to 1, restartable by a master's wrap (hard sync). */
export class Saw {
	#p: number;
	readonly #blep = new BlepBuffer();

	constructor(phase = 0) {
		this.#p = phase - Math.floor(phase);
	}

	get phase(): number {
		return this.#p;
	}

	/**
	 * The next sample at `dt`. `sync`: how long ago the master wrapped this sample (samples), or
	 * {@link NO_WRAP}; the saw then restarts from −1 at that instant.
	 */
	next(dt: number, sync = NO_WRAP): number {
		let p = this.#p;
		if (sync >= 0) {
			// run up to the reset (wrapping on the way if it comes first), then restart from 0
			let at = p + dt * (1 - sync);
			if (at >= 1) {
				at -= 1;
				this.#blep.add(-2, at / dt + sync);
			}
			this.#blep.add(-2 * at, sync);
			p = dt * sync;
		} else {
			p += dt;
			if (p >= 1) {
				p -= 1;
				this.#blep.add(-2, p / dt);
			}
		}
		this.#p = p;
		return 2 * p - 1 + this.#blep.next();
	}

	reset(phase = 0): void {
		this.#p = phase - Math.floor(phase);
		this.#blep.clear();
	}
}

/** How much of each waveform a {@link ShapeOscillator} blends (any mix; usually summing to 1). */
export interface ShapeMix {
	sine: number;
	triangle: number;
	saw: number;
	pulse: number;
	/** Pulse width, the part of the cycle spent high: 0.5 is a square. */
	width: number;
}

/** The plain (not band-limited) value of a mix at phase `p`, with pulse width `w`. */
function naive(m: ShapeMix, w: number, p: number): number {
	let y = m.saw * (2 * p - 1) + m.pulse * (p < w ? 1 : -1);
	// the sine costs the most: only when it is in the blend
	if (m.sine !== 0) y += m.sine * Math.sin(TAU * p);
	if (m.triangle !== 0) y += m.triangle * (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
	return y;
}

/**
 * Sine, triangle, saw and pulse from one phase, blended and band-limited together: the saw's and
 * pulse's jumps get band-limited steps, the triangle's corners polynomial ramps. Hard-syncable.
 * The triangle starts at its trough (phase 0) so that it, the saw and the pulse restart alike.
 */
export class ShapeOscillator {
	#p: number;
	readonly #blep = new BlepBuffer();

	constructor(phase = 0) {
		this.#p = phase - Math.floor(phase);
	}

	get phase(): number {
		return this.#p;
	}

	/** The next sample of mix `m` at `dt`, restarted at `sync` samples ago if given (hard sync). */
	next(dt: number, m: ShapeMix, sync = NO_WRAP): number {
		// the width stays a sample away from either end, so each cycle has both edges
		const w = Math.min(Math.max(m.width, dt), 1 - dt);
		let p = this.#p;
		if (sync >= 0) {
			let at = p + dt * (1 - sync);
			if (at >= 1) at = this.#wrap(at - 1, dt, m, sync);
			else if (m.pulse !== 0 && p < w && at >= w) {
				this.#blep.add(-2 * m.pulse, (at - w) / dt + sync);
			}
			// the jump from wherever the wave was to its start
			this.#blep.add(naive(m, w, 0) - naive(m, w, at), sync);
			p = dt * sync;
		} else {
			const from = p;
			p += dt;
			if (p >= 1) p = this.#wrap(p - 1, dt, m, 0);
			else if (m.pulse !== 0 && from < w && p >= w) this.#blep.add(-2 * m.pulse, (p - w) / dt);
		}
		this.#p = p;
		let y = naive(m, w, p) + this.#blep.next();
		if (m.triangle !== 0) {
			// corners at 0 (slope −4 → +4) and ½ (+4 → −4), per unit of phase
			y += m.triangle * 8 * dt * (polyBlamp(p, dt) - polyBlamp((p + 0.5) % 1, dt));
		}
		return y;
	}

	/**
	 * The phase wrapped and is `p` into the new cycle, `extra` samples before the sample being
	 * made: the saw falls from 1 to −1 and the pulse rises from −1 to 1. (The pulse cannot fall again
	 * in the same sample: its width is at least a sample.)
	 */
	#wrap(p: number, dt: number, m: ShapeMix, extra: number): number {
		const ago = p / dt + extra;
		if (m.saw !== 0) this.#blep.add(-2 * m.saw, ago);
		if (m.pulse !== 0) this.#blep.add(2 * m.pulse, ago);
		return p;
	}

	reset(phase = 0): void {
		this.#p = phase - Math.floor(phase);
		this.#blep.clear();
	}
}

/**
 * A sine operator for FM (phase modulation, as FM synths do it): `mod` is added to the phase in
 * cycles; `feedback` feeds the operator's own last two outputs back, averaged (the DX7's trick
 * against the buzz of one-sample feedback), in cycles per unit of output.
 */
export class Operator {
	#p: number;
	#y1 = 0;
	#y2 = 0;

	constructor(phase = 0) {
		this.#p = phase - Math.floor(phase);
	}

	next(dt: number, mod = 0, feedback = 0): number {
		const fb = feedback === 0 ? 0 : (feedback * (this.#y1 + this.#y2)) / 2;
		const y = Math.sin(TAU * (this.#p + mod + fb));
		this.#y2 = this.#y1;
		this.#y1 = y;
		this.#p += dt;
		if (this.#p >= 1) this.#p -= 1;
		return y;
	}

	reset(phase = 0): void {
		this.#p = phase - Math.floor(phase);
		this.#y1 = 0;
		this.#y2 = 0;
	}
}
