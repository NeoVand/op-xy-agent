/**
 * What the lab's host (the page, `host.ts`) and its worker (`worker.ts`) say to each other. One
 * program per worker: the host sends the program, the replica and the attached files; the worker
 * says when it is ready, streams what the program prints, asks the host to render a fork when the
 * program listens, and ends with the result. The host checks every message it receives, since
 * they come from where model-written code runs.
 */
import { z } from 'zod';
import type { LabRender } from './core';
import type { LabRunResult } from './run';

/** Runs a program. */
export interface RunMessage {
	readonly type: 'run';
	/** A random id: nothing in the worker can guess the run it belongs to. */
	readonly id: string;
	readonly code: string;
	/** The replica (`labSnapshot`). */
	readonly snapshot: string;
	readonly files: readonly { readonly name: string; readonly bytes: Uint8Array }[];
	readonly timeoutMs: number;
	/** Whether the host can render: without it, `lab.listen` says listening is not available. */
	readonly listen: boolean;
}

/** A render the worker asked for: its audio, or why there is none. */
export interface RenderedMessage {
	readonly type: 'rendered';
	readonly id: string;
	readonly request: number;
	readonly sampleRate?: number;
	readonly channels?: readonly Float32Array[];
	readonly error?: string;
}

/** Host → worker. */
export type ToWorker = RunMessage | RenderedMessage;

/** Worker → host. */
export type FromWorker =
	| { readonly type: 'ready' }
	| { readonly type: 'log'; readonly id: string; readonly line: string }
	| {
			readonly type: 'render';
			readonly id: string;
			readonly request: number;
			readonly render: LabRender;
	  }
	| { readonly type: 'done'; readonly id: string; readonly result: LabRunResult };

/** The longest project a worker may hand back, characters (a full project is a few hundred KB). */
export const MAX_PROJECT_CHARS = 20_000_000;

const text = (max: number) => z.string().max(max);

const renderSchema = z.object({
	project: text(MAX_PROJECT_CHARS),
	transport: z.object({ playing: z.boolean(), recording: z.boolean(), position: z.number() }),
	track: z.int().min(0).max(7),
	mode: text(40),
	seconds: z.number().min(0.1).max(30)
});

const resultSchema = z.object({
	ok: z.boolean(),
	logs: text(200_000),
	value: z.unknown().optional(),
	error: z
		.object({
			kind: z.enum(['syntax', 'error', 'timeout', 'stopped']),
			message: text(4_000),
			line: z.int().min(1).optional(),
			code: text(400).optional()
		})
		.optional(),
	commits: z.array(z.object({ label: text(200), changes: z.array(text(2_000)).max(200) })).max(100),
	takes: z
		.array(
			z.object({
				label: text(60),
				changes: z.array(text(2_000)).max(200),
				base: text(MAX_PROJECT_CHARS),
				project: text(MAX_PROJECT_CHARS)
			})
		)
		.max(4)
		.optional(),
	project: text(MAX_PROJECT_CHARS).nullable(),
	forks: z.int().min(0),
	listens: z.int().min(0),
	ms: z.number().min(0)
});

const fromWorkerSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('ready') }),
	z.object({ type: z.literal('log'), id: text(100), line: text(20_000) }),
	z.object({
		type: z.literal('render'),
		id: text(100),
		request: z.int().min(1),
		render: renderSchema
	}),
	z.object({ type: z.literal('done'), id: text(100), result: resultSchema })
]);

/** A worker's message as the host may act on it, or null for anything else. */
export function readFromWorker(data: unknown): FromWorker | null {
	const parsed = fromWorkerSchema.safeParse(data);
	return parsed.success ? (parsed.data as FromWorker) : null;
}
