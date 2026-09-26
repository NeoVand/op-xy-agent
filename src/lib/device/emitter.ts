/**
 * A minimal synchronous listener list. Plain TypeScript so the reactive `*.svelte.ts` classes can
 * keep non-reactive plumbing out of their state. A listener that throws is reported and skipped; it
 * never stops delivery to the others (the same contract as core/midi's `MidiBus`).
 */
export class Emitter<Args extends unknown[]> {
	#listeners: Array<(...args: Args) => void> = [];
	#onError: (error: unknown) => void;

	constructor(onError?: (error: unknown) => void) {
		this.#onError =
			onError ?? ((error) => console.error('[device] a listener threw; delivery continues', error));
	}

	/** Adds a listener; returns the function that removes it. */
	on(listener: (...args: Args) => void): () => void {
		this.#listeners = [...this.#listeners, listener];
		return () => {
			this.#listeners = this.#listeners.filter((l) => l !== listener);
		};
	}

	/**
	 * Calls every listener in subscription order. A listener added during delivery waits for the next
	 * call; one removed during delivery is skipped if it has not been called yet.
	 */
	emit(...args: Args): void {
		for (const listener of this.#listeners) {
			if (!this.#listeners.includes(listener)) continue;
			try {
				listener(...args);
			} catch (error) {
				this.#onError(error);
			}
		}
	}

	/** How many listeners are subscribed. */
	get size(): number {
		return this.#listeners.length;
	}
}
