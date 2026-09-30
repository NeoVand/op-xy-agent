/**
 * The lab in Node, for tests and evals: the program runs in-process in a context of its own
 * (`node:vm`) whose only globals are `lab` and a console, with code generation off, and it stops
 * at its time limit even inside a loop. Its microtasks run inside that limit too
 * (`microtaskMode: 'afterEvaluate'`): when a listen the program awaits comes back, the context's
 * queue is run again under the time left. A vm context is not a security boundary (the lab's own
 * objects lead back to Node), so this runs code we run ourselves; the browser's worker is the
 * sandbox (`worker.ts`).
 */
import vm from 'node:vm';
import { createVirtualOpxy } from '$lib/app/virtual';
import { snapshot } from '$lib/sim/areas/system/projects';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { VirtualOpxy } from '../virtual-opxy';
import type { Lab } from './api';
import { TakeShelf, UndoPoints } from './apply';
import { createLab, labSnapshot, type LabRenderer } from './core';
import type { LabHost, LabOutcome, LabRunRequest } from './host';
import {
	LabTimeout,
	PROGRAM_FILE,
	runLabProgram,
	timeoutText,
	type LabExecutor,
	type LabScope
} from './run';

/** The program inside an async arrow, strict, its first line on the script's second. */
const wrap = (code: string) => `(async () => {\n'use strict'; ${code}\n})()`;
/** The wrapper's first line does not count: the program's first line is line 1. */
const SCRIPT = { filename: PROGRAM_FILE, lineOffset: -1 } as const;

const timedOut = (error: unknown) =>
	typeof error === 'object' &&
	error !== null &&
	(error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';

/** Runs programs in a `node:vm` context of their own, stopped at the time limit (see above). */
export const vmExecutor: LabExecutor = {
	lineOffset: 0,
	run(code: string, scope: LabScope, timeoutMs: number): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const deadline = Date.now() + timeoutMs;
			let done = false;
			const timer = setTimeout(() => fail(new LabTimeout(timeoutText(timeoutMs))), timeoutMs);
			function fail(error: unknown) {
				if (done) return;
				done = true;
				clearTimeout(timer);
				reject(timedOut(error) ? new LabTimeout(timeoutText(timeoutMs)) : error);
			}
			function succeed(value: unknown) {
				if (done) return;
				done = true;
				clearTimeout(timer);
				resolve(value);
			}
			const left = () => Math.max(1, deadline - Date.now());
			// resumes what the program awaited: its continuation waits in the context's own queue
			const pump = () => {
				if (done) return;
				try {
					vm.runInContext('', context, { timeout: left() });
				} catch (error) {
					fail(error);
				}
			};
			const lab: Lab = Object.freeze({
				...scope.lab,
				listen: (...args: Parameters<Lab['listen']>) => {
					const heard = scope.lab.listen(...args);
					heard.then(
						() => setImmediate(pump),
						() => setImmediate(pump)
					);
					return heard;
				}
			});
			const context = vm.createContext(
				{ lab, console: scope.console },
				{
					name: 'lab',
					codeGeneration: { strings: false, wasm: false },
					microtaskMode: 'afterEvaluate'
				}
			);
			try {
				const script = new vm.Script(wrap(code), SCRIPT);
				const result = script.runInContext(context, { timeout: left() }) as Promise<unknown>;
				result.then(succeed, fail);
			} catch (error) {
				fail(error);
			}
		});
	},
	syntaxError(code: string): string | null {
		try {
			new vm.Script(wrap(code), SCRIPT);
			return null;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
};

/** What the Node host works on. */
export interface NodeLabHostOptions {
	/** The replica's simulator: forks start from it, commits land on it. */
	readonly sim: OpxySim;
	/** Told after a commit or an undo landed (the app's persistence saves). */
	readonly changed?: () => void;
	/** Offline rendering for `lab.listen` (the eval's ears); without it listening is refused. */
	readonly render?: LabRenderer | null;
	/** The virtual OP-XY over a simulator (default: the app's). */
	readonly virtual?: (sim: OpxySim) => VirtualOpxy;
}

/** A lab host that runs programs in this process, against `options.sim`. */
export function createNodeLabHost(options: NodeLabHostOptions): LabHost {
	const { sim } = options;
	const virtual = options.virtual ?? ((s: OpxySim) => createVirtualOpxy({ sim: s }));
	const points = new UndoPoints({ prefix: `lab${Math.random().toString(36).slice(2, 6)}` });
	const shelf = new TakeShelf(points);
	return {
		listens: Boolean(options.render),
		async run(code: string, request: LabRunRequest): Promise<LabOutcome> {
			const base = snapshot(sim.state);
			const session = createLab({
				snapshot: labSnapshot(sim.state),
				virtual,
				files: request.files ?? null,
				render: options.render ?? null,
				signal: request.signal
			});
			const result = await runLabProgram(code, session, {
				timeoutMs: request.timeoutMs,
				executor: vmExecutor,
				signal: request.signal
			});
			const landed = result.project ? points.land(sim.state, base, result.project) : null;
			if (landed) options.changed?.();
			const takes = result.ok ? (result.takes ?? []) : [];
			return { result, landed, offer: takes.length > 0 ? shelf.shelve(takes) : null };
		},
		revert(point: string) {
			const landed = points.revert(sim.state, point);
			if (landed) options.changed?.();
			return landed;
		},
		hear(offer, take) {
			const heard = shelf.hear(sim.state, offer, take);
			if (heard) options.changed?.();
			return heard;
		},
		keep(offer) {
			return shelf.keep(offer);
		}
	};
}
