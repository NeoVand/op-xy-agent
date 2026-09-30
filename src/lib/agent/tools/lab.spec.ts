// run_lab through the executor, as the conductor runs it: a program that commits leaves one
// revision the user can undo (only what it changed), and redo; the result reads logs, the value,
// each commit's changes and whether the replica changed; a failing program is an error with its
// line and changes nothing; a revert only runs as the app's undo, never as the model's program.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { ToolExecutor, type ToolCallRequest } from '../executor';
import { Journal } from '../journal';
import { createNodeLabHost } from '../lab/node';
import { NO_MANUAL } from '../manual-source';
import { PolicyGate } from '../policy';
import { DeviceQueue } from '../queue';
import { files, smallSong } from '../testing/lab';
import type { AgentEnvironment } from './define';
import { createConductorRegistry } from './index';

function setup(options: { lab?: boolean } = {}) {
	const sim = new OpxySim({ now: () => 0 });
	const replica = createVirtualOpxy({ sim });
	const registry = createConductorRegistry();
	const journal = new Journal({ session: 's', threadId: 't' });
	const executor = new ToolExecutor({
		gate: new PolicyGate({ requestApproval: async () => ({ kind: 'approve' }) }),
		queue: new DeviceQueue(),
		journal,
		emit: () => {},
		firmware: () => null
	});
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		virtual: replica,
		files: files({ 'louie.mid': smallSong() }),
		lab: options.lab === false ? null : createNodeLabHost({ sim }),
		manual: NO_MANUAL,
		timers: new FakeTime(),
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	let n = 0;
	const call = async (input: Record<string, unknown>) => {
		const request: ToolCallRequest = { id: `toolu_${++n}`, name: 'run_lab', input };
		const [block] = await executor.execute({
			agent: 'conductor',
			registry,
			calls: [request],
			env,
			signal: new AbortController().signal
		});
		const text = typeof block.content === 'string' ? block.content : '';
		return { block, body: text.startsWith('{') ? JSON.parse(text) : text };
	};
	return { replica, registry, journal, executor, env, call };
}

describe('run_lab', () => {
	it('lands a program’s commits as one change the user can undo, and redo', async () => {
		const { replica, journal, executor, registry, env, call } = setup();
		const { body, block } = await call({
			purpose: 'slower with a bass',
			code: [
				'const f = lab.fork();',
				'f.setTempo(96);',
				'f.writePattern(3, { notes: [{ step: 1, note: "A1", length: 8 }] });',
				'console.log("bass", f.readPattern(3).notes.length);',
				'lab.commit(f, "a slower bass");',
				'return f.status().bpm;'
			].join('\n')
		});
		expect(block.is_error).toBeUndefined();
		expect(body).toMatchObject({
			ok: true,
			logs: 'bass 1',
			value: 96,
			commits: [{ label: 'a slower bass' }],
			replica: expect.stringMatching(/^changed/)
		});
		expect(body.commits[0].changes).toEqual(
			expect.arrayContaining(['tempo 120 → 96 bpm', 'T3 pattern 1: 0 → 1 note'])
		);
		expect(replica.status().bpm).toBe(96);
		const [revision] = journal.list();
		expect(revision.label).toBe('lab: slower with a bass');
		expect(revision.inverse).toMatchObject({
			tool: 'run_lab',
			label: 'the replica back as it was before “slower with a bass”'
		});

		// the user's undo: the replica back, and a revision that redoes it
		const undone = await executor.undo(revision.rev, registry, env);
		expect(undone.ok).toBe(true);
		expect(replica.status().bpm).toBe(120);
		expect(replica.readPattern(3).notes).toHaveLength(0);
		const back = journal.list()[1];
		expect(back.undoes).toBe(revision.rev);
		expect(back.inverse?.label).toBe('“slower with a bass” again');
		expect((await executor.undo(back.rev, registry, env)).ok).toBe(true);
		expect(replica.status().bpm).toBe(96);
		expect(journal.list()[2].inverse?.label).toMatch(/back as it was before/);
	});

	it('leaves no revision when nothing was committed', async () => {
		const { journal, call } = setup();
		const { body } = await call({
			purpose: 'look',
			code: 'const f = lab.fork();\nreturn f.readSound(3).preset;'
		});
		expect(body).toMatchObject({
			ok: true,
			value: 'bass/shoulder',
			replica: 'unchanged: nothing was committed'
		});
		expect(journal.list()).toHaveLength(0);
	});

	it('reads MIDI files attached in the conversation', async () => {
		const { replica, call } = setup();
		const { body } = await call({
			purpose: 'import louie',
			code: [
				'const read = lab.files.midi("louie.mid");',
				'const plan = lab.midi.plan(read, { tracks: [{ midi: 2, to: 1 }, { midi: 3, to: 3 }] });',
				'const f = lab.fork();',
				'lab.midi.write(f, plan);',
				'lab.commit(f, "louie");',
				'return plan.tracks.map((t) => t.asWritten);'
			].join('\n')
		});
		expect(body.value).toEqual([1, 1]);
		expect(replica.readArrangement().song.order).toEqual([1, 2]);
		expect(replica.status().bpm).toBe(107);
	});

	it('is an error with the program’s line when it fails, and changes nothing', async () => {
		const { replica, journal, call } = setup();
		const { block, body } = await call({
			purpose: 'oops',
			code: 'const f = lab.fork();\nf.setTempo(90);\nlab.commit(f, "x");\nf.readPatern(1);'
		});
		expect(block.is_error).toBe(true);
		expect(body).toMatchObject({
			ok: false,
			line: 4,
			code: 'f.readPatern(1);',
			replica: 'unchanged: a program that fails or is stopped changes nothing'
		});
		expect(body.error).toMatch(/readPatern is not a function/);
		expect(replica.status().bpm).toBe(120);
		expect(journal.list()).toHaveLength(0);
	});

	it('runs a revert only as the app’s undo', async () => {
		const { call } = setup();
		const { block, body } = await call({ purpose: 'sneaky', code: 'lab.revert("lab-1")' });
		expect(block.is_error).toBe(true);
		expect(body.error).toMatch(/lab.revert is not a function/);
	});

	it('says so where there is no lab, and checks its input', async () => {
		const { call } = setup({ lab: false });
		expect((await call({ purpose: 'x', code: 'return 1' })).body).toMatch(/not available here/);
		const { block } = await setup().call({ purpose: 'x', code: 'return 1', timeout_s: 600 });
		expect(block.is_error).toBe(true);
	});
});
