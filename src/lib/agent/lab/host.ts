/**
 * The lab's host: where a program runs and how its commits reach the replica. `run_lab` talks to a
 * {@link LabHost}; the browser's is {@link BrowserLabHost}, Node's `createNodeLabHost` (`node.ts`).
 *
 * The browser host runs each program in a fresh worker (`worker.ts`), with a snapshot of the live
 * replica and the attached files: the worker locks itself down before it says it is ready, and is
 * terminated when the program ends, runs past its time limit (a loop that never yields included)
 * or the user stops the run. A spare worker starts after each run, so the next one does not wait
 * for the lab to load. When the program listens, the host renders the fork offline through the
 * replica's own sound (the worker has none) and hands the audio over; the worker hears it itself.
 * Once the program has finished without an error, the host lands what its commits changed on the
 * replica as one undo point (`apply.ts`) and tells persistence to save.
 */
import { snapshot, type ProjectContent } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { AttachedFiles } from '../tools/define';
import { UndoPoints, type Landed } from './apply';
import { LISTEN_LIMITS, labSnapshot, type LabRenderer } from './core';
import { readFromWorker, type FromWorker, type RunMessage, type ToWorker } from './protocol';
import { MAX_LOG_CHARS, timeoutText, type LabFailure, type LabRunResult } from './run';

/** How to run one program. */
export interface LabRunRequest {
	/** The files attached in this conversation, for `lab.files`. */
	readonly files?: AttachedFiles | null;
	/** Aborted when the user stops the run: the program stops and nothing lands. */
	readonly signal: AbortSignal;
	readonly timeoutMs: number;
}

/** What a run did. */
export interface LabOutcome {
	readonly result: LabRunResult;
	/** Where its commits landed on the replica (the undo point), or null when nothing changed. */
	readonly landed: Landed | null;
}

/** Runs lab programs against the replica and lands their commits on it. */
export interface LabHost {
	/** Whether `lab.listen` can render here. */
	readonly listens: boolean;
	run(code: string, request: LabRunRequest): Promise<LabOutcome>;
	/**
	 * Takes a landed run back (only what it changed), keeping a point to take the undo back in turn;
	 * null when that point is unknown (too old, or from before a reload).
	 */
	revert(point: string): Landed | null;
	/** Lets its workers go (the conductor is going away). */
	dispose?(): void;
}

/** What the browser host works with. */
export interface BrowserLabHostOptions {
	/** The replica's simulator. */
	readonly sim: OpxySim;
	/** Told after a commit or an undo landed (persistence saves soon). */
	readonly changed?: () => void;
	/** Offline rendering through the replica's sound; without it the lab cannot listen. */
	readonly render?: LabRenderer | null;
	/** Makes a lab worker (default: `worker.ts`); tests hand in their own. */
	readonly worker?: () => Worker;
	/** How long a worker may take to load and lock down, ms. */
	readonly startMs?: number;
	/** A spare worker unused this long is let go, ms. */
	readonly idleMs?: number;
}

/** A timed-out program's worker may still post its own result for this long, ms. */
const GRACE_MS = 1_500;

const randomId = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Whether a worker's project holds what a project holds, before it is merged into the replica. */
function isProject(json: string): boolean {
	try {
		const c = JSON.parse(json) as Partial<Record<keyof ProjectContent, unknown>>;
		const list = (v: unknown, n?: number) =>
			Array.isArray(v) && (n === undefined || v.length === n);
		const object = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
		return (
			list(c.tracks, 8) &&
			list(c.aux, 8) &&
			object(c.tempo) &&
			object(c.areas) &&
			object(c.settings) &&
			list(c.trackPresets) &&
			list(c.presetSettings)
		);
	} catch {
		return false;
	}
}

/** The lab in the browser (see the header). */
export class BrowserLabHost implements LabHost {
	readonly #sim: OpxySim;
	readonly #changed: () => void;
	readonly #render: LabRenderer | null;
	readonly #make: () => Worker;
	readonly #startMs: number;
	readonly #idleMs: number;
	readonly #points = new UndoPoints({ prefix: `lab${randomId().slice(0, 4)}` });
	#spare: Promise<Worker> | null = null;
	#idle: ReturnType<typeof setTimeout> | null = null;

	constructor(options: BrowserLabHostOptions) {
		this.#sim = options.sim;
		this.#changed = options.changed ?? (() => {});
		this.#render = options.render ?? null;
		this.#make =
			options.worker ??
			(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'lab' }));
		this.#startMs = options.startMs ?? 30_000;
		this.#idleMs = options.idleMs ?? 180_000;
	}

	get listens(): boolean {
		return this.#render !== null;
	}

	async run(code: string, request: LabRunRequest): Promise<LabOutcome> {
		const started = Date.now();
		let worker: Worker;
		try {
			worker = await this.#take();
		} catch (error) {
			return {
				result: failed({ kind: 'error', message: errorText(error) }, '', started),
				landed: null
			};
		}
		try {
			const result = await this.#runOn(worker, code, request, started);
			return this.#land(result);
		} finally {
			worker.terminate();
			this.#prepare();
		}
	}

	revert(point: string): Landed | null {
		const landed = this.#points.revert(this.#sim.state, point);
		if (landed) this.#changed();
		return landed;
	}

	/** Terminates the spare worker (the page is going away). */
	dispose(): void {
		if (this.#idle) clearTimeout(this.#idle);
		this.#idle = null;
		const spare = this.#spare;
		this.#spare = null;
		void spare?.then(
			(w) => w.terminate(),
			() => {}
		);
	}

	/** The spare worker, or a new one if it is missing or failed to start. */
	async #take(): Promise<Worker> {
		if (this.#idle) clearTimeout(this.#idle);
		this.#idle = null;
		const spare = this.#spare;
		this.#spare = null;
		if (spare) {
			try {
				return await spare;
			} catch {
				// a spare that failed to start: try once more below
			}
		}
		return this.#start();
	}

	/** Starts the next run's worker now, and lets it go if it waits too long. */
	#prepare(): void {
		const spare = this.#start();
		spare.catch(() => {});
		this.#spare = spare;
		this.#idle = setTimeout(() => {
			if (this.#spare === spare) this.dispose();
		}, this.#idleMs);
	}

	/** A worker that has loaded the lab and locked itself down. */
	#start(): Promise<Worker> {
		const worker = this.#make();
		return new Promise<Worker>((resolve, reject) => {
			const done = (error: string | null) => {
				clearTimeout(timer);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
				if (error === null) resolve(worker);
				else {
					worker.terminate();
					reject(new Error(`the lab could not start: ${error}`));
				}
			};
			const onMessage = (event: MessageEvent) => {
				if (readFromWorker(event.data)?.type === 'ready') done(null);
			};
			const onError = (event: ErrorEvent) => {
				event.preventDefault();
				done(event.message || 'its worker failed to load');
			};
			const timer = setTimeout(() => done('it took too long to load'), this.#startMs);
			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
		});
	}

	/** Runs one program on a ready worker; resolves with its result, never rejects. */
	#runOn(
		worker: Worker,
		code: string,
		request: LabRunRequest,
		started: number
	): Promise<LabRunResult & { base?: string }> {
		const id = randomId();
		const base = snapshot(this.#sim.state);
		const message: RunMessage = {
			type: 'run',
			id,
			code,
			snapshot: labSnapshot(this.#sim.state),
			files: (request.files?.midiNames() ?? []).flatMap((name) => {
				const bytes = request.files?.midi(name);
				return bytes ? [{ name, bytes: bytes.slice() }] : [];
			}),
			timeoutMs: request.timeoutMs,
			listen: this.#render !== null
		};
		const printed: string[] = [];
		let size = 0;
		let renders = 0;
		let seconds = 0;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (result: LabRunResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				request.signal.removeEventListener('abort', onAbort);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
				resolve({ ...result, base });
			};
			const stop = (failure: LabFailure) => finish(failed(failure, printed.join('\n'), started));
			const onAbort = () => stop({ kind: 'stopped', message: 'stopped before it finished' });
			const onError = (event: ErrorEvent) => {
				event.preventDefault();
				stop({
					kind: 'error',
					message: `the lab stopped: ${event.message || 'its worker failed'}`
				});
			};
			const answer = (reply: ToWorker, transfer: Transferable[] = []) => {
				if (!settled) worker.postMessage(reply, transfer);
			};
			const render = async (ask: Extract<FromWorker, { type: 'render' }>) => {
				const renderer = this.#render;
				const over =
					renders >= LISTEN_LIMITS.renders || seconds + ask.render.seconds > LISTEN_LIMITS.seconds;
				if (!renderer || over) {
					answer({
						type: 'rendered',
						id,
						request: ask.request,
						error: renderer ? 'too many renders for one program' : 'listening is not available here'
					});
					return;
				}
				renders++;
				seconds += ask.render.seconds;
				try {
					const audio = await renderer.render(ask.render, request.signal);
					const channels = audio.channels.map((c) => c.slice());
					answer(
						{ type: 'rendered', id, request: ask.request, sampleRate: audio.sampleRate, channels },
						channels.map((c) => c.buffer)
					);
				} catch (error) {
					answer({ type: 'rendered', id, request: ask.request, error: errorText(error) });
				}
			};
			const onMessage = (event: MessageEvent) => {
				const reply = readFromWorker(event.data);
				if (!reply || reply.type === 'ready' || reply.id !== id) return;
				if (reply.type === 'log') {
					if (size < MAX_LOG_CHARS) printed.push(reply.line);
					size += reply.line.length + 1;
				} else if (reply.type === 'render') void render(reply);
				else finish(reply.result);
			};
			const timer = setTimeout(
				() => stop({ kind: 'timeout', message: timeoutText(request.timeoutMs) }),
				request.timeoutMs + GRACE_MS
			);
			if (request.signal.aborted) {
				onAbort();
				return;
			}
			request.signal.addEventListener('abort', onAbort, { once: true });
			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			worker.postMessage(message);
		});
	}

	/** Lands a finished program's commits on the replica, as one undo point. */
	#land(result: LabRunResult & { base?: string }): LabOutcome {
		const { base, ...rest } = result;
		if (!rest.ok || !rest.project || !base) return { result: rest, landed: null };
		if (!isProject(rest.project)) {
			const failure: LabFailure = {
				kind: 'error',
				message: 'the lab handed back a project the replica cannot take, so nothing changed'
			};
			return { result: { ...rest, ok: false, error: failure, project: null }, landed: null };
		}
		const landed = this.#points.land(this.#sim.state, base, rest.project);
		if (landed) this.#changed();
		return { result: rest, landed };
	}
}

/** A run that stopped before the worker could say how it went. */
function failed(error: LabFailure, logs: string, started: number): LabRunResult {
	return {
		ok: false,
		logs,
		error,
		commits: [],
		project: null,
		forks: 0,
		listens: 0,
		ms: Date.now() - started
	};
}
