/**
 * Moving an engine's levels and blends without clicks. The core hands an engine its parameters
 * once per block (16 samples), and an LFO or a turned encoder can make them jump from one block to
 * the next. A {@link Ramp} follows its target through a one-pole of a few milliseconds, and
 * interpolates across each block's samples, so a gain or a waveform blend never steps. Frequencies
 * need none of this: a phase carries on smoothly through a change of rate.
 */

/** How quickly a ramp follows a jump: the one-pole's time constant (≈ 99 % there after 5×). */
export const SMOOTH_SECONDS = 0.004;

/**
 * The one-pole coefficient for a block of `n` samples, cached: the core's blocks are all the
 * same size, so the `exp` runs once per voice.
 */
export class Smoothing {
	#n = 0;
	#coef = 1;

	constructor(
		readonly sampleRate: number,
		readonly seconds = SMOOTH_SECONDS
	) {}

	coef(n: number): number {
		if (n !== this.#n) {
			this.#n = n;
			this.#coef = 1 - Math.exp(-n / (this.seconds * this.sampleRate));
		}
		return this.#coef;
	}
}

/**
 * A level or blend that glides to its {@link target}: set the target in `control`, call
 * {@link advance} once at the top of `render`, then add {@link step} to the value it returns before
 * each sample. The block's last sample lands on {@link value}, where the next block starts.
 */
export class Ramp {
	target: number;
	/** Where the current block ends. */
	value: number;
	/** What each sample of the current block adds. */
	step = 0;
	/** Where the current block starts. */
	from: number;

	constructor(value = 0) {
		this.target = value;
		this.value = value;
		this.from = value;
	}

	/** Moves a block of `n` samples towards the target (one-pole `coef`); returns the start. */
	advance(coef: number, n: number): number {
		const from = this.value;
		let to = from + (this.target - from) * coef;
		// arrive exactly, so that a level at rest is exactly 0 and its source can stop
		if (Math.abs(this.target - to) < 1e-6) to = this.target;
		this.from = from;
		this.value = to;
		this.step = (to - from) / n;
		return from;
	}

	/** Goes straight to `value` (a note's first settings). */
	jump(value: number): void {
		this.target = value;
		this.value = value;
		this.from = value;
		this.step = 0;
	}

	/** Silent for the whole current block: whatever it scales need not run. */
	get idle(): boolean {
		return this.from === 0 && this.value === 0;
	}
}
