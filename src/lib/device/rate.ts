/**
 * A token bucket that paces outgoing MIDI instead of blasting it.
 *
 * USB-MIDI buffers are finite and the OP-XY's input handling is not documented, so bursts (panic, a
 * parameter snapshot, an agent setting fifty CCs) are spread out: the first `capacity` messages go
 * at once, the rest at `perSecond`. The bucket may go into debt; the debt is the wait, which the
 * transport turns into a Web MIDI timestamp (docs/research/80-midilab-patterns.md §4.2 "pacing").
 */

/** Bucket parameters. */
export interface TokenBucketOptions {
	/** Burst size: messages that may go at once. */
	readonly capacity: number;
	/** Sustained rate, messages per second. */
	readonly perSecond: number;
	/** Current time (ms); the bucket starts full. */
	readonly now: number;
}

/** A token bucket measured in messages, with time passed in explicitly (no timers). */
export class TokenBucket {
	readonly capacity: number;
	readonly perSecond: number;
	#tokens: number;
	#updatedAt: number;

	constructor(options: TokenBucketOptions) {
		if (!(options.capacity >= 1) || !(options.perSecond > 0)) {
			throw new RangeError('a token bucket needs capacity >= 1 and perSecond > 0');
		}
		this.capacity = options.capacity;
		this.perSecond = options.perSecond;
		this.#tokens = options.capacity;
		this.#updatedAt = options.now;
	}

	/**
	 * Takes one token and returns how long (ms) the message must wait for it: 0 when a token was
	 * available, otherwise the time until the debt is paid back.
	 */
	reserve(now: number): number {
		this.#refill(now);
		this.#tokens -= 1;
		return this.#tokens >= 0 ? 0 : (-this.#tokens * 1000) / this.perSecond;
	}

	/** Returns a token taken by `reserve` (the message was refused or failed to send). */
	refund(): void {
		this.#tokens = Math.min(this.capacity, this.#tokens + 1);
	}

	/** Tokens available at `now` (negative while in debt). */
	available(now: number): number {
		this.#refill(now);
		return this.#tokens;
	}

	#refill(now: number): void {
		if (now > this.#updatedAt) {
			this.#tokens = Math.min(
				this.capacity,
				this.#tokens + ((now - this.#updatedAt) * this.perSecond) / 1000
			);
			this.#updatedAt = now;
		}
	}
}
