/**
 * The lab's sandbox in the browser: a module worker that runs one program and is thrown away, so
 * nothing a program leaves behind reaches the next one. Once its modules have loaded it keeps
 * what it needs for itself (postMessage, its message listener, the runner's Function constructor)
 * and locks itself down (`lockdown.ts`): no network, no storage, no devices, no new code, frozen
 * built-ins. Then it says it is ready, takes one program, streams what it prints, asks the page to
 * render when it listens, and posts the result (`protocol.ts`).
 */
import { z } from 'zod';
import { createVirtualOpxy } from '$lib/app/virtual';
import { attachedFiles, createLab, type LabAudio, type LabRenderer } from './core';
import { lockDown } from './lockdown';
import type { FromWorker, RenderedMessage, RunMessage, ToWorker } from './protocol';
import { functionExecutor, runLabProgram } from './run';

const worker = self as unknown as {
	postMessage(message: FromWorker): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
};
const post = worker.postMessage.bind(worker);
/** Renders asked of the page, by request number. */
const waiting = new Map<
	number,
	{ resolve: (audio: LabAudio) => void; reject: (error: Error) => void }
>();
let running: string | null = null;
let requests = 0;

/** Listening through the page (the worker has no audio of its own). */
function renderer(id: string): LabRenderer {
	return {
		render(render) {
			const request = ++requests;
			return new Promise<LabAudio>((resolve, reject) => {
				waiting.set(request, { resolve, reject });
				post({ type: 'render', id, request, render });
			});
		}
	};
}

function rendered(message: RenderedMessage): void {
	const pending = waiting.get(message.request);
	if (!pending) return;
	waiting.delete(message.request);
	const channels = message.channels;
	if (message.error || !channels || !message.sampleRate) {
		pending.reject(new Error(message.error ?? 'the page rendered nothing'));
	} else pending.resolve({ sampleRate: message.sampleRate, channels: [...channels] });
}

async function run(message: RunMessage): Promise<void> {
	running = message.id;
	const started = Date.now();
	try {
		const session = createLab({
			snapshot: message.snapshot,
			virtual: (sim) => createVirtualOpxy({ sim }),
			files: attachedFiles(message.files),
			render: message.listen ? renderer(message.id) : null
		});
		const result = await runLabProgram(message.code, session, {
			timeoutMs: message.timeoutMs,
			executor: functionExecutor,
			onLog: (line) => post({ type: 'log', id: message.id, line })
		});
		post({ type: 'done', id: message.id, result });
	} catch (error) {
		// the lab itself failed (not the program): say so rather than leave the page waiting
		post({
			type: 'done',
			id: message.id,
			result: {
				ok: false,
				logs: '',
				error: {
					kind: 'error',
					message: `the lab could not run: ${error instanceof Error ? error.message : String(error)}`
				},
				commits: [],
				project: null,
				forks: 0,
				listens: 0,
				ms: Date.now() - started
			}
		});
	}
}

worker.addEventListener('message', (event) => {
	// only the page's own messages: nothing a program dispatches
	if (!event.isTrusted) return;
	const message = event.data;
	if (message.type === 'run' && running === null) void run(message);
	else if (message.type === 'rendered' && message.id === running) rendered(message);
});

// zod compiles fast paths with new Function unless told not to, and the walls take that away
z.config({ jitless: true });
lockDown();
post({ type: 'ready' });
