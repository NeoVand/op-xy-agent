// Running a program: what it prints and returns comes back (cut, with a note), errors come back
// with the program's own line (a runtime error, a syntax error, a lab mistake), import() is refused,
// a failed program's commits never land, and the time limit stops a runaway program: in Node even
// inside a loop, before or after it awaits a listen.
import { describe, expect, it } from 'vitest';
import { clickRenderer, labOn } from '../testing/lab';
import { vmExecutor } from './node';
import { functionExecutor, runLabProgram, toJson } from './run';

const executors = [
	['the Function constructor', functionExecutor],
	['a vm context', vmExecutor]
] as const;

describe.each(executors)('a program run by %s', (_name, executor) => {
	const run = (code: string, options: { timeoutMs?: number; maxLogChars?: number } = {}) => {
		const { session, replica } = labOn({ render: clickRenderer() });
		return runLabProgram(code, session, { executor, ...options }).then((result) => ({
			result,
			replica
		}));
	};

	it('prints and returns, with lab and console in scope', async () => {
		const { result } = await run(
			[
				'const f = lab.fork();',
				'f.setTempo(96);',
				'console.log("tempo", f.status().bpm);',
				'lab.log({ track: 3 }, [1, 2]);',
				'console.warn("careful");',
				'return { bpm: f.status().bpm, fork: f };'
			].join('\n')
		);
		expect(result.ok).toBe(true);
		expect(result.logs).toBe('tempo 96\n{"track":3} [1,2]\nwarn: careful');
		expect(result.value).toEqual({ bpm: 96, fork: '[fork 1]' });
		expect(result.forks).toBe(1);
		expect(result.project).toBeNull();
	});

	it('cuts long output with a note saying so', async () => {
		const { result } = await run('for (let i = 0; i < 500; i++) console.log("line", i);', {
			maxLogChars: 200
		});
		expect(result.logs.length).toBeLessThan(400);
		expect(result.logs).toMatch(/more characters of output were cut/);
	});

	it('reports a runtime error with the program’s line', async () => {
		const { result } = await run('const f = lab.fork();\n\nf.readPatern(1);');
		expect(result.ok).toBe(false);
		expect(result.error).toMatchObject({
			kind: 'error',
			line: 3,
			code: 'f.readPatern(1);'
		});
		expect(result.error?.message).toMatch(/^TypeError: .*readPatern is not a function/);
	});

	it('reports a lab mistake in its own words, at the line that made it', async () => {
		const { result } = await run(
			'const f = lab.fork();\nf.set({ track: 3, param: "cutoff", value: "loud" });'
		);
		expect(result.error?.message).toMatch(/^set track 3 cutoff loud: not reached/);
		expect(result.error?.line).toBe(2);
	});

	it('reports a syntax error with its line', async () => {
		const { result } = await run('const a = 1;\nconst b = 2;\nconst c = ;\nreturn a;');
		expect(result.error).toMatchObject({ kind: 'syntax', line: 3, code: 'const c = ;' });
		const open = await run('const a = [1, 2;\nreturn a;');
		expect(open.result.error?.kind).toBe('syntax');
	});

	it('refuses import() before running anything', async () => {
		const { result } = await run(
			'lab.fork();\nconst m = await import("https://example.com/x.js");'
		);
		expect(result.error).toMatchObject({ kind: 'syntax', line: 2 });
		expect(result.error?.message).toMatch(/no imports/);
		expect(result.forks).toBe(0);
	});

	it('lands nothing when it fails after a commit', async () => {
		const { result } = await run(
			'const f = lab.fork();\nf.setTempo(90);\nlab.commit(f, "slower");\nthrow new Error("no");'
		);
		expect(result.ok).toBe(false);
		expect(result.commits).toEqual([{ label: 'slower', changes: ['tempo 120 → 90 bpm'] }]);
		expect(result.project).toBeNull();
	});

	it('hands the committed project back when it finishes', async () => {
		const { result, replica } = await run(
			'const f = lab.fork();\nf.setTempo(90);\nreturn lab.commit(f, "slower");'
		);
		expect(result.ok).toBe(true);
		expect(result.value).toEqual({ same: false, changes: ['tempo 120 → 90 bpm'] });
		expect(JSON.parse(result.project ?? '{}').tempo.bpm).toBe(90);
		expect(replica.status().bpm).toBe(120);
	});

	it('awaits listens', async () => {
		const { result } = await run(
			'const f = lab.fork();\nf.writePattern(1, { notes: [{ step: 1, note: 53 }] });\nconst heard = await lab.listen(f, { seconds: 2 });\nreturn heard.flags;'
		);
		expect(result.ok).toBe(true);
		expect(result.listens).toBe(1);
		expect(Array.isArray(result.value)).toBe(true);
	});

	it('stops at the time limit while it awaits', async () => {
		const { result } = await run('await new Promise(() => {});', { timeoutMs: 100 });
		expect(result.error?.kind).toBe('timeout');
		expect(result.error?.message).toMatch(/time limit of 0.1 s/);
	});
});

describe('a program in a vm context', () => {
	it('stops a loop that never yields, before and after it awaits', async () => {
		const { session } = labOn({ render: clickRenderer() });
		const started = Date.now();
		const loop = await runLabProgram('lab.log("start");\nwhile (true) {}', session, {
			executor: vmExecutor,
			timeoutMs: 200
		});
		expect(loop.error?.kind).toBe('timeout');
		expect(loop.logs).toBe('start');
		const after = await runLabProgram(
			'const f = lab.fork();\nf.writePattern(1, { notes: [{ step: 1, note: 53 }] });\nawait lab.listen(f, { seconds: 1 });\nlab.log("heard");\nfor (;;) {}',
			labOn({ render: clickRenderer() }).session,
			{ executor: vmExecutor, timeoutMs: 1500 }
		);
		expect(after.error?.kind).toBe('timeout');
		expect(after.logs).toBe('heard');
		expect(Date.now() - started).toBeLessThan(4000);
	});

	it('has no eval, no Function constructor and no Node', async () => {
		const { session } = labOn();
		const result = await runLabProgram(
			'return [typeof process, typeof require, typeof fetch, typeof setTimeout];',
			session,
			{ executor: vmExecutor }
		);
		expect(result.value).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
		const evil = await runLabProgram('return eval("1 + 1");', labOn().session, {
			executor: vmExecutor
		});
		expect(evil.error?.message).toMatch(/EvalError/);
	});
});

describe('toJson', () => {
	it('makes any value plain JSON', () => {
		const cycle: Record<string, unknown> = { a: 1 };
		cycle.self = cycle;
		expect(toJson(cycle)).toEqual({ a: 1, self: '[circular]' });
		expect(toJson(new Map([['k', 1]]))).toEqual([['k', 1]]);
		expect(toJson(new Set([1, 2]))).toEqual([1, 2]);
		expect(toJson([1, undefined, () => 1, NaN])).toEqual([1, null, null, 'NaN']);
		expect(toJson(new Error('x'))).toBe('Error: x');
		expect(toJson(new Float32Array(100))).toBe('[Float32Array of 100]');
		expect(toJson(10n)).toBe('10');
	});
});
