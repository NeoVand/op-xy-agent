// The walkthrough on a real replica wired to a simulator as in the app: it lights the step to do,
// moves on when the screen shows where the step leads (whatever the user pressed to get there),
// and clears the replica when it is done or stopped.
import { describe, expect, it } from 'vitest';
import { ReplicaState, type PressableId } from '$lib/replica';
import { buildFrame } from '$lib/sim/frames';
import { planParam, planPlace } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { describeFrame } from '$lib/sim/screen/render';
import { FakeTime } from '../../../test/fakes/fake-time';
import { GUIDE_DONE_MS, ReplicaGuide, musicMark } from './guide.svelte';
import { createVirtualOpxy } from './virtual';

function setup() {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	const guide = new ReplicaGuide({
		replica,
		read: () => describeFrame(buildFrame(sim.state)),
		music: () => musicMark(sim.state),
		timers: time
	});
	return { time, sim, replica, guide };
}

/** Lets the guide's after-input check run. */
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

async function tap(replica: ReplicaState, id: PressableId) {
	replica.press(id, 'pointer');
	replica.release(id, 'pointer');
	await settle();
}

describe('the replica walkthrough', () => {
	it('walks a key sequence press by press: a drum key, then the steps it goes on', async () => {
		const { sim, replica, guide } = setup();
		const virtual = createVirtualOpxy({ sim });
		const steps = virtual.rehearse('T1 → key G3 → step 5 → step 13');
		expect(steps.map((s) => s.keys)).toEqual(['T1', 'key G3', 'step 5', 'step 13']);
		guide.start('snare on 2 and 4', steps);
		// a new project stands on T1 already: that step is done
		expect(guide.index).toBe(1);
		expect(replica.highlight('keyboard.g3')).toBe('press');
		// a step key pressed before the drum key does not count: its note is the kick's
		await tap(replica, 'step.5');
		expect(guide.index).toBe(1);
		await tap(replica, 'step.5');
		await tap(replica, 'keyboard.g3');
		expect(guide.index).toBe(2);
		await tap(replica, 'step.5');
		expect(guide.index).toBe(3);
		await tap(replica, 'step.13');
		expect(guide.status).toBe('done');
		// the snare on 2 and 4, on the replica the user pressed
		expect(virtual.readPattern(1).notes.map((n) => [n.step, n.note])).toEqual([
			[5, 55],
			[13, 55]
		]);
		// held keys are written out on each step; turns are a value's, for plan_steps
		expect(virtual.rehearse('key G3 + record → + step 5').map((s) => s.keys)).toEqual([
			'key G3 + record',
			'key G3 + step 5'
		]);
		expect(() => virtual.rehearse('M3 → turn E1')).toThrow(/plan_steps/);
	});

	it('tells who listens when the user reaches its end, with what the screen shows', async () => {
		const { sim, replica, guide } = setup();
		const done: [string, string][] = [];
		const stop = guide.onDone((goal, screen) => done.push([goal, screen]));
		guide.start(
			'track 3 filter',
			planPlace(sim.state, { area: 'instrument', track: 3, page: 3 }).steps
		);
		await tap(replica, 'track.3');
		expect(done).toEqual([]);
		await tap(replica, 'key.m3');
		expect(done).toHaveLength(1);
		expect(done[0][0]).toBe('track 3 filter');
		expect(done[0][1]).toMatch(/filter/);
		stop();
		guide.start(
			'track 3 filter',
			planPlace(sim.state, { area: 'instrument', track: 3, page: 2 }).steps
		);
		await tap(replica, 'key.m2');
		expect(done).toHaveLength(1);
	});

	it('lights each step, and moves on once the screen shows where it leads', async () => {
		const { sim, replica, guide } = setup();
		const plan = planParam(sim.state, { track: 3, param: 'cutoff', value: 5 });
		expect(plan.steps.map((s) => s.keys)).toEqual(['T3', 'M3', 'turn E1']);
		guide.start('track 3 cutoff 5', plan.steps);
		expect(guide.status).toBe('running');
		expect(replica.highlight('track.3')).toBe('press');

		await tap(replica, 'track.3');
		expect(guide.index).toBe(1);
		expect(replica.highlight('track.3')).toBeUndefined();
		expect(replica.highlight('key.m3')).toBe('press');

		await tap(replica, 'key.m3');
		expect(guide.current?.keys).toBe('turn E1');
		expect(replica.highlight('encoder.1')).toBe('turn');
		expect(replica.turnHint('encoder.1')).toBe(1);

		// past the value it waits; back on it, it is done
		replica.turn('encoder.1', 7, { source: 'pointer' });
		await settle();
		expect(guide.status).toBe('running');
		replica.turn('encoder.1', -2, { source: 'pointer' });
		await settle();
		expect(guide.status).toBe('done');
		expect(replica.highlight('encoder.1')).toBeUndefined();
		expect(replica.turnHint('encoder.1')).toBeUndefined();
	});

	it('passes steps already done, takes shortcuts, and goes away after "done"', async () => {
		const { time, sim, replica, guide } = setup();
		await tap(replica, 'track.3');
		const plan = planPlace(sim.state, { area: 'mix', page: 2 });
		guide.start('mix M2', [
			{ keys: 'T3', screen: describeFrame(buildFrame(sim.state)) },
			...plan.steps
		]);
		// T3 is already done: the walkthrough starts at the mix key
		expect(guide.current?.keys).toBe('mix');
		await tap(replica, 'key.mix');
		await tap(replica, 'key.m2');
		expect(guide.status).toBe('done');
		await time.advance(GUIDE_DONE_MS);
		expect(guide.status).toBe('idle');
	});

	it('skips a step on request and clears the replica when stopped', async () => {
		const { sim, replica, guide } = setup();
		guide.start(
			'track 3 filter',
			planPlace(sim.state, { area: 'instrument', track: 3, page: 3 }).steps
		);
		guide.skip();
		expect(guide.current?.keys).toBe('M3');
		expect(replica.highlight('key.m3')).toBe('press');
		guide.stop();
		expect(guide.status).toBe('idle');
		expect(replica.highlight('key.m3')).toBeUndefined();
		// stopped: input no longer moves it
		await tap(replica, 'track.3');
		expect(guide.index).toBe(0);
	});
});
