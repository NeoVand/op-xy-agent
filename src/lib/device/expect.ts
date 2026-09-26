/**
 * Waiting for MIDI: resolve when a matching event appears on the bus, or give up after a timeout.
 * The session uses it for the identity reply; the agent's "wait for the user to press play" tool
 * and UI checkpoints will build on the same helper (docs/research/80-midilab-patterns.md, port-list
 * item 16).
 */
import type { MidiBus, MidiEvent } from '$lib/core/midi/bus';
import { ExpectTimeoutError } from './errors';
import type { Timers } from './types';

/** Options for `waitForEvent`. */
export interface WaitForEventOptions {
	/** Give up after this many milliseconds. */
	readonly timeoutMs: number;
	readonly timers: Timers;
	/** Aborting rejects with the signal's reason. */
	readonly signal?: AbortSignal;
	/** What we wait for, for the timeout message. */
	readonly description?: string;
}

/**
 * Resolves with the first bus event for which `test` returns true. A `test` that throws counts as
 * "no match", so one bad predicate cannot break the stream or the wait.
 */
export function waitForEvent(
	bus: MidiBus,
	test: (event: MidiEvent) => boolean,
	options: WaitForEventOptions
): Promise<MidiEvent> {
	return new Promise<MidiEvent>((resolve, reject) => {
		const { signal, timers } = options;
		if (signal?.aborted) {
			reject(signal.reason);
			return;
		}
		const finish = () => {
			unsubscribe();
			timers.clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		};
		const onAbort = () => {
			finish();
			reject(signal?.reason);
		};
		const unsubscribe = bus.subscribe((event) => {
			if (safeTest(test, event)) {
				finish();
				resolve(event);
			}
		});
		const timer = timers.setTimeout(() => {
			finish();
			reject(
				new ExpectTimeoutError(
					`no ${options.description ?? 'matching MIDI event'} within ${options.timeoutMs} ms`
				)
			);
		}, options.timeoutMs);
		signal?.addEventListener('abort', onAbort);
	});
}

/** Runs a predicate; a throw counts as "no match". */
function safeTest(test: (event: MidiEvent) => boolean, event: MidiEvent): boolean {
	try {
		return test(event);
	} catch {
		return false;
	}
}
