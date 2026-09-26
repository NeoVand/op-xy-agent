/**
 * Manual time for tests: a clock, timers and animation frames that only move when told to.
 *
 * `advance(ms)` runs every timer due within the window in time order, setting `now()` to each
 * timer's due time first and letting pending promise callbacks run after each one, so async code
 * (a request that awaits a reply that a fake device sends after 1 ms) plays out deterministically.
 * Frames run only on `runFrames()`. Works in Node and in the browser (no Node-only imports).
 */
import type { Clock, FrameScheduler, Timers } from '$lib/device/types';

interface Timer {
	readonly at: number;
	readonly seq: number;
	readonly callback: () => void;
}

/** Lets every queued promise callback run (a macrotask turn). */
function macrotask(): Promise<void> {
	const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown })
		.setImmediate;
	return new Promise((resolve) => {
		if (immediate) immediate(() => resolve());
		else globalThis.setTimeout(resolve, 0);
	});
}

/** A deterministic clock + timers + frame scheduler. */
export class FakeTime implements Clock, Timers, FrameScheduler {
	#now: number;
	#seq = 0;
	#nextId = 1;
	readonly #timers = new Map<number, Timer>();
	readonly #frames = new Map<number, (time: number) => void>();

	/** Starts at `start` ms (not 0, so "no timestamp" and "time zero" never look alike). */
	constructor(start = 1000) {
		this.#now = start;
	}

	now(): number {
		return this.#now;
	}

	setTimeout(callback: () => void, ms: number): number {
		const id = this.#nextId++;
		this.#timers.set(id, { at: this.#now + Math.max(0, ms), seq: this.#seq++, callback });
		return id;
	}

	clearTimeout(handle: unknown): void {
		this.#timers.delete(handle as number);
	}

	request(callback: (time: number) => void): number {
		const id = this.#nextId++;
		this.#frames.set(id, callback);
		return id;
	}

	cancel(handle: unknown): void {
		this.#frames.delete(handle as number);
	}

	/** Timers not yet run. */
	get pendingTimers(): number {
		return this.#timers.size;
	}

	/** Frames requested and not yet run. */
	get pendingFrames(): number {
		return this.#frames.size;
	}

	/** Lets queued promise callbacks run without moving time. */
	async flush(): Promise<void> {
		await macrotask();
	}

	/** Moves time forward by `ms`, running due timers in order (and promise callbacks after each). */
	async advance(ms: number): Promise<void> {
		const target = this.#now + ms;
		await macrotask();
		for (;;) {
			const due = this.#nextDue(target);
			if (!due) break;
			this.#timers.delete(due[0]);
			this.#now = due[1].at;
			due[1].callback();
			await macrotask();
		}
		this.#now = target;
		await macrotask();
	}

	/** Runs every requested animation frame once, at the current time. */
	async runFrames(): Promise<void> {
		const frames = [...this.#frames.values()];
		this.#frames.clear();
		for (const frame of frames) frame(this.#now);
		await macrotask();
	}

	#nextDue(target: number): [number, Timer] | undefined {
		let best: [number, Timer] | undefined;
		for (const entry of this.#timers) {
			const timer = entry[1];
			if (timer.at > target) continue;
			if (!best || timer.at < best[1].at || (timer.at === best[1].at && timer.seq < best[1].seq)) {
				best = entry;
			}
		}
		return best;
	}
}
