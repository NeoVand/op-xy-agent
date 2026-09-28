/**
 * What the main thread and the recorder worklet (`recorder.worklet.ts`) say to each other. Plain
 * constants and types, so both sides import them.
 */

/** The processor's registered name. */
export const RECORDER = 'opxy-recorder';

/** Frames per posted chunk (about 93 ms at 44.1 kHz). */
export const CHUNK_FRAMES = 4096;

/** Main thread → worklet. */
export type RecorderCommand =
	/** Record the next `frames` frames. */
	| { readonly type: 'start'; readonly frames: number }
	/** Stop early (what was recorded so far is posted, then `done`). */
	| { readonly type: 'stop' };

/** Worklet → main thread. */
export type RecorderReply =
	/** Two channels of recorded audio (each up to CHUNK_FRAMES long) and their peak (0–1). */
	| { readonly type: 'chunk'; readonly channels: readonly Float32Array[]; readonly peak: number }
	/** The recording is complete. */
	| { readonly type: 'done'; readonly frames: number };
