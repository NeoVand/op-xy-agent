/**
 * Listening wired to the real browser: `navigator.mediaDevices`, a new `AudioContext` per device
 * recording, the recorder worklet's module and the analysis worker. Loaded with the agent's chunk
 * (`$lib/agent/runtime`), never at import time of a page, since Vite builds the worklet and the
 * worker as files of their own.
 */
import { browserTimers } from '../env';
import { analyzeHere, workerAnalyzer } from './analyzer';
import AnalysisWorker from './analysis.worker?worker';
import { AudioCapture, type SoundTap } from './capture.svelte';
import workletUrl from './recorder.worklet?worker&url';

/** Listening for the app: the OP-XY's USB audio, or the replica's sound through `tap`. */
export function createBrowserCapture(tap: () => SoundTap | null): AudioCapture {
	const nav = globalThis.navigator;
	return new AudioCapture({
		media: nav?.mediaDevices ?? null,
		createContext: (options) => new AudioContext({ latencyHint: 'playback', ...options }),
		workletUrl,
		tap,
		analyze:
			typeof Worker === 'undefined'
				? analyzeHere
				: workerAnalyzer(() => new AnalysisWorker({ name: 'listen' })),
		timers: browserTimers
	});
}
