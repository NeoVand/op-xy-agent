/**
 * Runs the listening analysis in a worker (`analysis.worker.ts`), falling back to the page when a
 * worker cannot start. The recording is copied to the worker (a few ms for 30 s of stereo), so the
 * fallback still has it.
 */
import { analyzeAudio, type ListenAnalysis, type ListenOptions } from '$lib/core/listen';
import type { Analyze, Recording } from './capture.svelte';

/** Page → worker. */
export interface AnalysisRequest {
	readonly id: number;
	readonly channels: readonly Float32Array[];
	readonly sampleRate: number;
	readonly options: ListenOptions;
}

/** Worker → page. */
export type AnalysisReply =
	| { readonly id: number; readonly analysis: ListenAnalysis }
	| { readonly id: number; readonly error: string };

/** Hears a recording on the page (tests, and browsers where the worker fails). */
export const analyzeHere: Analyze = async (recording: Recording, options: ListenOptions) =>
	analyzeAudio(recording.channels, recording.sampleRate, options);

/**
 * An analysis that runs in the worker `create` makes (once, on first use); when the worker cannot
 * start or dies, this and later analyses run on the page.
 */
export function workerAnalyzer(create: () => Worker): Analyze {
	let worker: Worker | null = null;
	let broken = false;
	let next = 1;
	const pending = new Map<
		number,
		{ resolve: (a: ListenAnalysis) => void; reject: (e: Error) => void; request: AnalysisRequest }
	>();

	const fallBack = () => {
		broken = true;
		worker?.terminate();
		worker = null;
		const waiting = [...pending.values()];
		pending.clear();
		for (const { resolve, reject, request } of waiting) {
			try {
				resolve(analyzeAudio(request.channels, request.sampleRate, request.options));
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		}
	};

	const start = (): Worker | null => {
		if (worker || broken) return worker;
		try {
			worker = create();
		} catch {
			broken = true;
			return null;
		}
		worker.onmessage = (event: MessageEvent<AnalysisReply>) => {
			const reply = event.data;
			const job = pending.get(reply.id);
			if (!job) return;
			pending.delete(reply.id);
			if ('analysis' in reply) job.resolve(reply.analysis);
			else job.reject(new Error(reply.error));
		};
		worker.onerror = (event) => {
			event.preventDefault?.();
			fallBack();
		};
		return worker;
	};

	return (recording, options) => {
		const w = start();
		if (!w) return analyzeHere(recording, options);
		return new Promise<ListenAnalysis>((resolve, reject) => {
			const request: AnalysisRequest = {
				id: next++,
				channels: recording.channels,
				sampleRate: recording.sampleRate,
				options
			};
			pending.set(request.id, { resolve, reject, request });
			w.postMessage(request);
		});
	};
}
