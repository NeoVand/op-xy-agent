/**
 * The single-flight device queue: every agent job that sends MIDI runs here, one at a time, in the
 * order it was submitted. Opus happily issues parallel tool calls ("set tempo" and "mute track 2" in
 * one turn), so ordering is enforced in code, not left to the prompt
 * (docs/research/70-agent-harness.md §4).
 *
 * `abortAll` (panic, or the user pressing stop) aborts the running job's signal and rejects every
 * queued job without running it. Jobs must honour their signal (paced note players check it and
 * release their notes).
 */

/** Rejection reason for jobs that were aborted before or while running. */
export class QueueAbortedError extends Error {
	override name = 'QueueAbortedError';
}

interface Entry {
	readonly label: string;
	readonly controller: AbortController;
	readonly start: () => void;
	readonly reject: (reason: unknown) => void;
}

/** One-at-a-time job runner for device work. */
export class DeviceQueue {
	readonly #waiting: Entry[] = [];
	#running: Entry | null = null;
	#listener: (() => void) | null = null;

	/** True while a job runs. */
	get busy(): boolean {
		return this.#running !== null;
	}

	/** Jobs waiting behind the running one. */
	get pending(): number {
		return this.#waiting.length;
	}

	/** Label of the running job, for the UI. */
	get current(): string | null {
		return this.#running?.label ?? null;
	}

	/** Called whenever the queue starts or finishes a job (for reactive UI). */
	onChange(listener: (() => void) | null): void {
		this.#listener = listener;
	}

	/**
	 * Runs `job` after every job submitted before it has settled. The job receives a signal that
	 * aborts on `abortAll` or when the caller's `signal` aborts.
	 */
	run<T>(
		label: string,
		job: (signal: AbortSignal) => Promise<T>,
		signal?: AbortSignal
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (signal?.aborted) {
				reject(new QueueAbortedError(`${label}: stopped before it ran`));
				return;
			}
			const controller = new AbortController();
			const entry: Entry = {
				label,
				controller,
				reject,
				start: () => {
					this.#running = entry;
					this.#listener?.();
					let settled: Promise<T>;
					try {
						settled = Promise.resolve(job(controller.signal));
					} catch (error) {
						settled = Promise.reject(error);
					}
					// Free the queue before the caller hears back, so `busy` is already false for them.
					const finish = () => {
						signal?.removeEventListener('abort', onCallerAbort);
						if (this.#running === entry) this.#running = null;
						this.#next();
					};
					settled.then(
						(value) => {
							finish();
							resolve(value);
						},
						(error: unknown) => {
							finish();
							reject(error);
						}
					);
				}
			};
			const onCallerAbort = () => this.#cancel(entry, 'stopped');
			signal?.addEventListener('abort', onCallerAbort, { once: true });
			this.#waiting.push(entry);
			if (!this.#running) this.#next();
		});
	}

	/** Aborts the running job and rejects every waiting one. */
	abortAll(reason = 'stopped'): void {
		const waiting = this.#waiting.splice(0);
		for (const entry of waiting) {
			entry.controller.abort(reason);
			entry.reject(new QueueAbortedError(`${entry.label}: ${reason} before it ran`));
		}
		this.#running?.controller.abort(reason);
		this.#listener?.();
	}

	#cancel(entry: Entry, reason: string): void {
		const index = this.#waiting.indexOf(entry);
		if (index >= 0) {
			this.#waiting.splice(index, 1);
			entry.reject(new QueueAbortedError(`${entry.label}: ${reason} before it ran`));
			this.#listener?.();
		} else if (this.#running === entry) {
			entry.controller.abort(reason);
		}
	}

	#next(): void {
		const entry = this.#waiting.shift();
		if (entry) entry.start();
		else this.#listener?.();
	}
}
