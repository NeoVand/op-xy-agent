/**
 * Listening as the agent's tools see it (`tools/listen.ts`): record a few seconds from the OP-XY's
 * USB audio or from the replica's sound, and hear the recording. The browser implements it with
 * `$lib/device/listen` (an AudioWorklet recorder, the analysis in a worker); tests hand in fakes that
 * return synthetic audio, so the tools run in Node.
 */
import type { ListenAnalysis, ListenOptions } from '$lib/core/listen';

/** Where a recording comes from: the OP-XY's USB audio, or the replica's sound in the browser. */
export type ListenFrom = 'device' | 'replica';

/** A recording: one or two channels at a sample rate. */
export interface ListenRecording {
	readonly channels: readonly Float32Array[];
	readonly sampleRate: number;
	readonly source: ListenFrom;
	/** The input's name, or "replica". */
	readonly label: string;
}

/** Records and hears. */
export interface ListenHost {
	/**
	 * Records `seconds` from `source`. Rejects with a readable message when it cannot (no OP-XY
	 * input, no permission, the replica's sound off), and when `signal` aborts.
	 */
	record(source: ListenFrom, seconds: number, signal: AbortSignal): Promise<ListenRecording>;
	/** What the recording sounds like (off the main thread in the browser). */
	analyze(recording: ListenRecording, options: ListenOptions): Promise<ListenAnalysis>;
}
