/**
 * Remembers what we sent for a short while, so an identical message coming back can be marked as an
 * echo instead of being mistaken for something the device did.
 *
 * Verified on OS 1.1.33 (docs/research/90-device-probe.md): the OP-XY sends the universal identity
 * request back to us, and relays FA/FC it received; with COM "midi echo" on it may echo more. TE
 * protocol requests are not echoed. Each remembered message matches at most one incoming copy, so
 * sending the same CC twice explains two echoes, not three.
 */

/** Default echo window (ms): long enough for USB round trips, short enough to be unambiguous. */
export const ECHO_WINDOW_MS = 500;

/** Tolerance for an echo stamped a hair before our own send time (two clocks, one domain). */
const EARLY_SLACK_MS = 2;

interface Sent {
	readonly bytes: Uint8Array;
	/** When the message reached the wire (`performance.now()` domain). */
	readonly at: number;
}

/** A bounded, time-windowed registry of recently sent messages. */
export class EchoRegistry {
	readonly windowMs: number;
	readonly maxEntries: number;
	#sent: Sent[] = [];

	constructor(windowMs = ECHO_WINDOW_MS, maxEntries = 512) {
		this.windowMs = windowMs;
		this.maxEntries = maxEntries;
	}

	/** Remembers a message that goes out at `at`. The oldest entries go first when full. */
	remember(bytes: Uint8Array, at: number): void {
		this.#sent.push({ bytes, at });
		const excess = this.#sent.length - this.maxEntries;
		if (excess > 0) this.#sent.splice(0, excess);
	}

	/**
	 * True when `bytes`, received at `time`, repeat a message sent within the window before it. A
	 * match is consumed.
	 */
	match(bytes: ArrayLike<number>, time: number): boolean {
		this.#sent = this.#sent.filter((s) => time - s.at <= this.windowMs);
		const index = this.#sent.findIndex(
			(s) => time >= s.at - EARLY_SLACK_MS && sameBytes(s.bytes, bytes)
		);
		if (index === -1) return false;
		this.#sent.splice(index, 1);
		return true;
	}

	/** Forgets everything (the device went away). */
	clear(): void {
		this.#sent = [];
	}

	/** How many sends are remembered. */
	get size(): number {
		return this.#sent.length;
	}
}

function sameBytes(a: Uint8Array, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
