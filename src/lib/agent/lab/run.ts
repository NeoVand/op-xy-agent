/**
 * Running a lab program: the model's code as the body of an async function, in strict mode, with
 * `lab` and a console in scope. What it prints comes back (cut at a limit, with a note saying so),
 * what it returns comes back as JSON, and an error comes back with the line of the program it
 * points at. An executor decides where the code runs: by the Function constructor here (the
 * browser's lab worker, whose host terminates it at its time limit), or in a context of its own
 * that stops even inside a loop (Node, `node.ts`).
 */
import type { Lab } from './api';
import { LabError, type LabCommit, type LabSession } from './core';

/** The name the program's code has in stack traces. */
export const PROGRAM_FILE = 'lab-program.js';
/** Characters of printed output handed back by default. */
export const MAX_LOG_CHARS = 10_000;
/** Characters of the returned value handed back by default. */
export const MAX_VALUE_CHARS = 6_000;
/** The time limit when none is given, ms. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** The console a program prints with. */
export interface LabConsole {
	log(...values: unknown[]): void;
	info(...values: unknown[]): void;
	debug(...values: unknown[]): void;
	dir(...values: unknown[]): void;
	table(...values: unknown[]): void;
	warn(...values: unknown[]): void;
	error(...values: unknown[]): void;
}

/** What a program has in scope. */
export interface LabScope {
	readonly lab: Lab;
	readonly console: LabConsole;
}

/** Where and how a program runs. */
export interface LabExecutor {
	/**
	 * Runs `code` with `scope` in scope; resolves with what it returns, rejects with what it throws
	 * or with a {@link LabTimeout} once `timeoutMs` has passed.
	 */
	run(code: string, scope: LabScope, timeoutMs: number): Promise<unknown>;
	/** Lines the executor's wrapper puts before the program's first line, as stack traces count. */
	readonly lineOffset: number;
	/** The syntax error `code` has, or null (to find a syntax error's line by its prefixes). */
	syntaxError(code: string): string | null;
}

/** The program ran past its time limit. */
export class LabTimeout extends Error {
	override name = 'LabTimeout';
}

/** Why a program did not finish. */
export interface LabFailure {
	readonly kind: 'syntax' | 'error' | 'timeout' | 'stopped';
	/** "TypeError: fork.readPatern is not a function". */
	readonly message: string;
	/** The line of the program it points at, 1-based, when known. */
	readonly line?: number;
	/** That line's code. */
	readonly code?: string;
}

/** What a run gives back. */
export interface LabRunResult {
	readonly ok: boolean;
	/** What it printed. */
	readonly logs: string;
	/** What it returned, as JSON (a string with a note when it was too long). */
	readonly value?: unknown;
	readonly error?: LabFailure;
	/** Its commits, oldest first (they land only when the program finished). */
	readonly commits: readonly LabCommit[];
	/** The project to land on the replica: the commits' result, or null. */
	readonly project: string | null;
	readonly forks: number;
	readonly listens: number;
	readonly ms: number;
}

/** How to run. */
export interface RunOptions {
	readonly timeoutMs?: number;
	readonly maxLogChars?: number;
	readonly maxValueChars?: number;
	/** Where the code runs (default: the Function constructor, in this realm). */
	readonly executor?: LabExecutor;
	/** Stops the run (the user pressed stop). */
	readonly signal?: AbortSignal;
	/** Each printed line as it is printed (the worker streams them, so a timeout keeps them). */
	readonly onLog?: (line: string) => void;
}

// ─── the Function constructor ───────────────────────────────────────────────────────────────────

/**
 * Taken when this module loads, before the lab worker locks code generation away (the program is
 * compiled here, and nothing it runs can compile more).
 */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
	...args: string[]
) => (lab: Lab, console: LabConsole) => Promise<unknown>;

/** A program as strict code with its name for stack traces (the directive shares the first line). */
const body = (code: string) => `'use strict'; ${code}\n//# sourceURL=${PROGRAM_FILE}`;

/** Resolves with `promise`, or rejects with a {@link LabTimeout} after `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new LabTimeout(timeoutText(ms))), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

/** The words for a program stopped at its limit. */
export const timeoutText = (ms: number) =>
	`the program ran past its time limit of ${Math.round(ms / 100) / 10} s and was stopped: do less per run (fewer forks or listens), or give timeout_s`;

/**
 * The program compiled by the Function constructor (the spec puts the parameters on its first
 * line and `) {` on the second, so its code starts on line 3). It cannot stop a loop that never
 * yields: the worker's host terminates the worker for that.
 */
export const functionExecutor: LabExecutor = {
	lineOffset: 2,
	run(code, scope, timeoutMs) {
		const program = new AsyncFunction('lab', 'console', body(code));
		return withTimeout(program(scope.lab, scope.console), timeoutMs);
	},
	syntaxError(code) {
		try {
			new AsyncFunction('lab', 'console', body(code));
			return null;
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
};

// ─── what comes back ────────────────────────────────────────────────────────────────────────────

const tag = (value: object) => Object.prototype.toString.call(value).slice(8, -1);

/** A value as plain JSON: functions dropped, cycles marked, forks by name, maps and sets as lists. */
export function toJson(value: unknown, depth = 0, seen = new Set<object>()): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
	if (typeof value === 'bigint') return String(value);
	if (typeof value !== 'object') return undefined;
	if (seen.has(value)) return '[circular]';
	if (depth > 12) return '[too deep]';
	const kind = tag(value);
	if (kind === 'Error' || value instanceof Error) {
		const e = value as { name?: unknown; message?: unknown };
		return `${String(e.name ?? 'Error')}: ${String(e.message ?? '')}`;
	}
	const toJSON = (value as { toJSON?: unknown }).toJSON;
	if (typeof toJSON === 'function') return toJson(toJSON.call(value), depth + 1, seen);
	seen.add(value);
	try {
		if (ArrayBuffer.isView(value)) {
			const items = Array.from(value as unknown as ArrayLike<number>);
			return items.length > 32 ? `[${kind} of ${items.length}]` : items;
		}
		if (kind === 'Map') {
			return [...(value as Map<unknown, unknown>)].map(([k, v]) => [
				toJson(k, depth + 1, seen),
				toJson(v, depth + 1, seen)
			]);
		}
		if (kind === 'Set') return [...(value as Set<unknown>)].map((v) => toJson(v, depth + 1, seen));
		if (Array.isArray(value)) return value.map((v) => toJson(v, depth + 1, seen) ?? null);
		const out: Record<string, unknown> = {};
		for (const [key, v] of Object.entries(value)) {
			const json = toJson(v, depth + 1, seen);
			if (json !== undefined) out[key] = json;
		}
		return out;
	} finally {
		seen.delete(value);
	}
}

/** Printed values on one line: strings as they are, everything else as compact JSON. */
export function formatValues(values: readonly unknown[]): string {
	return values
		.map((v) => {
			if (typeof v === 'string') return v;
			if (v === undefined) return 'undefined';
			const json = toJson(v);
			return typeof json === 'string' && typeof v !== 'object' ? json : JSON.stringify(json);
		})
		.join(' ');
}

/** The printed output, cut at a limit. */
class LogBook {
	#text = '';
	#cut = 0;
	constructor(
		readonly max: number,
		readonly onLine?: (line: string) => void
	) {}

	add(line: string): void {
		const room = this.max - this.#text.length;
		if (room <= 0) {
			this.#cut += line.length + 1;
			return;
		}
		this.onLine?.(line);
		if (line.length + 1 <= room) this.#text += `${line}\n`;
		else {
			this.#text += `${line.slice(0, room)}\n`;
			this.#cut += line.length - room;
		}
	}

	text(): string {
		const text = this.#text.replace(/\n$/, '');
		return this.#cut
			? `${text}\n[${this.#cut} more characters of output were cut: print summaries and counts, not whole objects]`
			: text;
	}
}

/** The returned value as JSON, or a string of its first characters when it is too long. */
function valueOf(value: unknown, max: number): unknown {
	const json = toJson(value);
	if (json === undefined) return undefined;
	const text = JSON.stringify(json);
	return text.length <= max
		? json
		: `${text.slice(0, max)} … [cut: ${text.length} characters in all; return less]`;
}

// ─── errors ─────────────────────────────────────────────────────────────────────────────────────

const LINE_IN_STACK = new RegExp(`${PROGRAM_FILE.replace('.', '\\.')}:(\\d+)`);
/** A syntax error at the very end: something opened is never closed. */
const AT_THE_END = /end of input|unterminated|missing \} |end of script/i;

/** An error's message and stack, from this realm or another (a vm context's errors are its own). */
function parts(error: unknown): { name: string; message: string; stack: string } {
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const e = error as { name?: unknown; message?: unknown; stack?: unknown };
		return {
			name: String(e.name ?? 'Error'),
			message: String(e.message),
			stack: typeof e.stack === 'string' ? e.stack : ''
		};
	}
	return { name: 'Error', message: String(error), stack: '' };
}

/** The line of a syntax error the engine does not place: the first prefix of the code that has it. */
function syntaxLine(code: string, text: string, executor: LabExecutor): number | null {
	const lines = code.split('\n');
	if (AT_THE_END.test(text)) return lines.length;
	for (let n = 1; n < lines.length; n++) {
		if (executor.syntaxError(lines.slice(0, n).join('\n')) === text) return n;
	}
	return lines.length;
}

/** Why the program stopped, with its line when the error says. */
function failure(error: unknown, code: string, executor: LabExecutor): LabFailure {
	const { name, message, stack } = parts(error);
	if (error instanceof LabTimeout) return { kind: 'timeout', message };
	const syntax = name === 'SyntaxError';
	const found = LINE_IN_STACK.exec(stack);
	const line = found
		? Number(found[1]) - executor.lineOffset
		: syntax
			? syntaxLine(code, message, executor)
			: null;
	const lines = code.split('\n');
	const at = line !== null && line >= 1 && line <= lines.length ? line : null;
	return {
		kind: syntax ? 'syntax' : 'error',
		message: error instanceof LabError ? message : `${name}: ${message}`,
		...(at !== null ? { line: at, code: lines[at - 1].trim().slice(0, 160) } : {})
	};
}

/** `import(…)`: the lab loads nothing (the worker has no network, and the check says why). */
const IMPORT = /\bimport\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*[(.]/;

/** A reason the code is refused before it runs, or null. */
function refused(code: string): LabFailure | null {
	const m = IMPORT.exec(code);
	if (!m) return null;
	const line = code.slice(0, m.index).split('\n').length;
	return {
		kind: 'syntax',
		message: 'the lab has no imports: everything is on lab (and console)',
		line,
		code: code.split('\n')[line - 1].trim().slice(0, 160)
	};
}

// ─── running ────────────────────────────────────────────────────────────────────────────────────

/**
 * Runs a program on a lab session. Never rejects: failures come back in the result, and a failed
 * or stopped program's commits never land (`project` is null).
 */
export async function runLabProgram(
	code: string,
	session: LabSession,
	options: RunOptions = {}
): Promise<LabRunResult> {
	const started = Date.now();
	const logs = new LogBook(options.maxLogChars ?? MAX_LOG_CHARS, options.onLog);
	const print = (...values: unknown[]) => logs.add(formatValues(values));
	const console: LabConsole = Object.freeze({
		log: print,
		info: print,
		debug: print,
		dir: print,
		table: print,
		warn: (...values: unknown[]) => logs.add(`warn: ${formatValues(values)}`),
		error: (...values: unknown[]) => logs.add(`error: ${formatValues(values)}`)
	});
	const lab: Lab = Object.freeze({ ...session.lab, log: print });
	const executor = options.executor ?? functionExecutor;
	const finish = (outcome: { value?: unknown } | { error: LabFailure }): LabRunResult => ({
		ok: !('error' in outcome),
		logs: logs.text(),
		...outcome,
		commits: session.commits(),
		project: 'error' in outcome ? null : session.project(),
		...session.counts(),
		ms: Date.now() - started
	});
	const blocked = refused(code);
	if (blocked) return finish({ error: blocked });
	const signal = options.signal;
	if (signal?.aborted) return finish({ error: { kind: 'stopped', message: 'stopped' } });
	try {
		const running = executor.run(code, { lab, console }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		const value = signal ? await untilAborted(running, signal) : await running;
		return finish({ value: valueOf(value, options.maxValueChars ?? MAX_VALUE_CHARS) });
	} catch (error) {
		if (signal?.aborted) {
			return finish({ error: { kind: 'stopped', message: 'stopped before it finished' } });
		}
		return finish({ error: failure(error, code, executor) });
	}
}

/** `promise`, or a rejection once `signal` aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new Error('stopped'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}
