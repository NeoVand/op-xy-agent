// The Node lab host on a replica: a program's commits land only after it has finished, as one undo
// point; what the replica did meanwhile stays; undo takes back only what the run changed, and the
// undo can be taken back in turn; a failed or timed-out program changes nothing; session fields
// (a song's position) never travel.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { snapshot } from '$lib/sim/areas/system/projects';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { clickRenderer } from '../testing/lab';
import { applyProject, UndoPoints } from './apply';
import { createNodeLabHost } from './node';

function setup(render = clickRenderer()) {
	const sim = new OpxySim({ now: () => 0 });
	const replica = createVirtualOpxy({ sim });
	let saves = 0;
	const host = createNodeLabHost({ sim, render, changed: () => saves++ });
	const run = (code: string, timeoutMs = 5_000) =>
		host.run(code, { signal: new AbortController().signal, timeoutMs });
	return { sim, replica, host, run, saves: () => saves };
}

describe('the Node lab host', () => {
	it('lands a finished program’s commits on the replica, once, as an undo point', async () => {
		const { replica, run, saves } = setup();
		const { result, landed } = await run(
			[
				'const f = lab.fork();',
				'f.setTempo(96);',
				'f.writePattern(3, { notes: [{ step: 1, note: "A1", length: 4 }] });',
				'lab.commit(f, "bass");',
				'return lab.fork().status().bpm;'
			].join('\n')
		);
		expect(result.ok).toBe(true);
		expect(result.value).toBe(96);
		expect(result.commits[0].changes).toContain('tempo 120 → 96 bpm');
		expect(landed?.point).toMatch(/^lab\w+-1$/);
		expect(replica.status().bpm).toBe(96);
		expect(replica.readPattern(3).notes).toHaveLength(1);
		expect(saves()).toBe(1);
	});

	it('changes nothing while the program runs, nor when it fails or runs out of time', async () => {
		const { replica, run } = setup();
		const during = await run(
			'const f = lab.fork();\nf.setTempo(96);\nlab.commit(f, "x");\nreturn lab.fork().status().bpm;'
		);
		expect(during.landed).not.toBeNull();
		const failed = await run(
			'const f = lab.fork();\nf.setTempo(70);\nlab.commit(f, "x");\nnull.boom;'
		);
		expect(failed.landed).toBeNull();
		const slow = await run(
			'const f = lab.fork();\nf.setTempo(70);\nlab.commit(f, "x");\nwhile (true) {}',
			200
		);
		expect(slow.result.error?.kind).toBe('timeout');
		expect(slow.landed).toBeNull();
		expect(replica.status().bpm).toBe(96);
	});

	it('keeps what the replica did while the program ran', async () => {
		const box: { replica?: ReturnType<typeof createVirtualOpxy> } = {};
		// the user turns the tempo while the program waits on its listen
		const render = clickRenderer(() => box.replica?.setTempo(99));
		const { replica, run } = setup(render);
		box.replica = replica;
		const { landed } = await run(
			'const f = lab.fork();\nf.writePattern(1, { notes: [{ step: 1, note: 53 }] });\nawait lab.listen(f, { seconds: 1 });\nf.setMuted(4, true);\nlab.commit(f, "kick");'
		);
		expect(landed).not.toBeNull();
		expect(replica.status().bpm).toBe(99);
		expect(replica.readPattern(1).notes).toHaveLength(1);
		expect(replica.status().tracks[3].muted).toBe(true);
	});

	it('takes back only what the run changed, and can take the undo back', async () => {
		const { replica, run, host } = setup();
		const { landed } = await run(
			'const f = lab.fork();\nf.setTempo(96);\nf.setMuted(2, true);\nlab.commit(f, "x");'
		);
		// a change after the run, which the undo leaves alone
		replica.writePattern(5, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 60, velocity: 90, length: 1 }]
		});
		const undone = host.revert(landed?.point ?? '');
		expect(undone).not.toBeNull();
		expect(replica.status().bpm).toBe(120);
		expect(replica.status().tracks[1].muted).toBe(false);
		expect(replica.readPattern(5).notes).toHaveLength(1);
		const redone = host.revert(undone?.point ?? '');
		expect(redone).not.toBeNull();
		expect(replica.status().bpm).toBe(96);
		expect(replica.status().tracks[1].muted).toBe(true);
		expect(host.revert('lab-unknown')).toBeNull();
	});

	it('refuses to listen where there is no renderer', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const host = createNodeLabHost({ sim });
		expect(host.listens).toBe(false);
		const { result } = await host.run('await lab.listen(lab.fork());', {
			signal: new AbortController().signal,
			timeoutMs: 2_000
		});
		expect(result.error?.message).toMatch(/isn't available here/);
	});

	it('stops when the run is stopped, landing nothing', async () => {
		const { replica, host } = setup();
		const controller = new AbortController();
		const running = host.run(
			'const f = lab.fork();\nf.setTempo(70);\nlab.commit(f, "x");\nawait new Promise(() => {});',
			{ signal: controller.signal, timeoutMs: 5_000 }
		);
		controller.abort();
		const { result, landed } = await running;
		expect(result.error?.kind).toBe('stopped');
		expect(landed).toBeNull();
		expect(replica.status().bpm).toBe(120);
	});
});

describe('applyProject', () => {
	it('merges what changed and nothing else, never a song’s position', () => {
		const sim = new OpxySim({ now: () => 0 });
		const base = snapshot(sim.state);
		const next = JSON.parse(base);
		next.tempo.bpm = 100;
		next.areas.arrange.playing = true;
		next.areas.arrange.position = 5;
		next.tracks[2].sequence.patterns[0].steps[4].notes = [
			{ note: 45, velocity: 90, length: 1, offset: 0, ownLength: true }
		];
		const replica = sim.state;
		replica.tracks[0].mix.level = 50;
		expect(applyProject(replica, base, JSON.stringify(next))).toBe(true);
		expect(replica.tempo.bpm).toBe(100);
		expect(replica.tracks[0].mix.level).toBe(50);
		expect(replica.tracks[2].sequence.patterns[0].steps[4].notes).toHaveLength(1);
		expect(replica.areas.arrange.playing).toBe(false);
		expect(replica.areas.arrange.position).toBe(0);
		expect(applyProject(replica, base, base)).toBe(false);
	});

	it('keeps the newest undo points only', () => {
		const sim = new OpxySim({ now: () => 0 });
		const points = new UndoPoints({ limit: 2, prefix: 't' });
		const ids: string[] = [];
		for (const bpm of [90, 91, 92]) {
			const base = snapshot(sim.state);
			const next = JSON.parse(base);
			next.tempo.bpm = bpm;
			ids.push(points.land(sim.state, base, JSON.stringify(next))?.point ?? '');
		}
		expect(ids).toEqual(['t-1', 't-2', 't-3']);
		expect(points.has('t-1')).toBe(false);
		expect(points.revert(sim.state, 't-3')).not.toBeNull();
		expect(sim.state.tempo.bpm).toBe(91);
	});
});
