/**
 * Noise and slow randomness for the engines: white noise from a seeded xorshift (every voice its
 * own stream, reproducible in tests) and a smoothed random walk for drift and wobble.
 */

/** White noise, uniform in [−1, 1), from a 32-bit xorshift seeded per voice. */
export class Noise {
	#s: number;

	constructor(seed = 1) {
		// never zero: xorshift would stay there
		this.#s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
	}

	next(): number {
		let s = this.#s;
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		this.#s = s >>> 0;
		return this.#s / 2147483648 - 1;
	}
}

/**
 * A smooth random signal in [−1, 1]: a new random target `rate` times a second, approached along a
 * cosine curve so there are no corners (drift, swarm wobble). Call {@link next} once per control
 * tick with the tick's length in seconds.
 */
export class Wander {
	readonly #noise: Noise;
	#from = 0;
	#to = 0;
	#t = 1;

	constructor(seed = 1) {
		this.#noise = new Noise(seed);
		this.#to = this.#noise.next();
	}

	next(seconds: number, rate: number): number {
		this.#t += seconds * rate;
		if (this.#t >= 1) {
			this.#t %= 1;
			this.#from = this.#to;
			this.#to = this.#noise.next();
		}
		const x = 0.5 - 0.5 * Math.cos(Math.PI * this.#t);
		return this.#from + (this.#to - this.#from) * x;
	}
}
