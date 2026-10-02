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
import { musicMark } from '$lib/sim/music-mark';
import { GUIDE_DONE_MS, ReplicaGuide, turnHint } from './guide.svelte';
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
	it('counts a last turn with no value to reach once the value moves', async () => {
		const { sim, replica, guide } = setup();
		const plan = planPlace(sim.state, { area: 'instrument', track: 3, page: 3 });
		const screen = plan.steps.at(-1)!.screen;
		guide.start('track 3 cutoff', [...plan.steps, { keys: 'turn E1', screen, leave: screen }]);
		await tap(replica, 'track.3');
		await tap(replica, 'key.m3');
		// on the filter page: the turn is the step now, and nothing has moved yet
		expect(guide.current?.keys).toBe('turn E1');
		replica.turn('encoder.1', 3, { source: 'pointer' });
		await settle();
		expect(guide.status).toBe('done');
	});

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

	it('walks a parameter lock: the step held while the encoder turns', async () => {
		const { sim, replica, guide } = setup();
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 7, note: 48, velocity: 100, length: 2 }]
		});
		const plan = planParam(sim.state, { track: 3, param: 'cutoff', value: 4, step: 7 });
		expect(plan.reached).toBe(true);
		expect(plan.steps.at(-1)?.keys).toBe('step 7 + turn E1');
		guide.start('step 7 cutoff 4', plan.steps);
		await tap(replica, 'track.3');
		await tap(replica, 'key.m3');
		expect(guide.current?.keys).toBe('step 7 + turn E1');
		// the card can say which way: the step's screen is read with it held, the lock's value shown
		const lit = guide.current!;
		expect(lit.screen).toMatch(/^step 7 held/);
		expect(turnHint(lit, describeFrame(buildFrame(sim.state)), '')).toMatchObject({
			label: 'cutoff',
			target: 4,
			way: 'clockwise'
		});
		// the user holds step 7 and turns
		replica.press('step.7', 'pointer');
		await settle();
		replica.turn('encoder.1', 4, { source: 'pointer' });
		await settle();
		replica.release('step.7', 'pointer');
		await settle();
		expect(guide.status).toBe('done');
		const step = sim.state.tracks[2].sequence.patterns[0].steps[6];
		expect(Math.round(step.locks['filter.cutoff'])).toBe(4);
		expect(step.notes).toHaveLength(1);
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

describe('turnHint', () => {
	const step = {
		keys: 'turn E2',
		clicks: -6,
		screen: 'amp envelope: attack 00, decay 25, sustain 38, release 79'
	};
	const from = 'amp envelope: attack 00, decay 31, sustain 38, release 79';
	it('says which way from where the value reads, and comes back after an overshoot', () => {
		expect(turnHint(step, from, from)).toMatchObject({
			label: 'decay',
			now: 31,
			target: 25,
			way: 'counter-clockwise',
			detents: 6
		});
		const past = 'amp envelope: attack 00, decay 99, sustain 38, release 79';
		expect(turnHint(step, past, from)).toMatchObject({ way: 'counter-clockwise', detents: 74 });
		const under = 'amp envelope: attack 00, decay 10, sustain 38, release 79';
		expect(turnHint(step, under, from)).toMatchObject({ way: 'clockwise', detents: 15 });
		// there: nothing to say
		expect(turnHint(step, step.screen, from)).toBeNull();
	});
});

describe('a walkthrough that arms recording', () => {
	it('waits for a mute, though the screen reads the same', async () => {
		// a lesson's instrument + T3 passed before the user pressed anything: a mute leaves the
		// screen as it was
		const { sim, replica, guide } = setup();
		const virtual = createVirtualOpxy({ sim });
		virtual.selectTrack(3);
		const steps = virtual.rehearse('instrument + T3');
		expect(steps[0].screen).toBe(describeFrame(buildFrame(sim.state)));
		guide.start('mute the bass', steps);
		expect(guide.status).toBe('running');
		replica.press('key.instrument', 'pointer');
		replica.press('track.3', 'pointer');
		replica.release('track.3', 'pointer');
		replica.release('key.instrument', 'pointer');
		await settle();
		expect(sim.state.tracks[2].mix.muted).toBe(true);
		expect(guide.status).toBe('done');
	});

	it('waits for the save itself, though the project page reads the same', async () => {
		// project → M2 passed at project: the save leaves the screen as it was
		const { sim, replica, guide } = setup();
		const virtual = createVirtualOpxy({ sim });
		const steps = virtual.rehearse('project → M2');
		expect(steps[1].screen).toBe(steps[0].screen);
		guide.start('save the project', steps);
		await tap(replica, 'key.project');
		expect(guide.status).toBe('running');
		await tap(replica, 'key.m2');
		expect(guide.status).toBe('done');
	});

	it('waits for record + play itself, though the screen reads the same', async () => {
		const { createVirtualOpxy } = await import('$lib/app/virtual');
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		const steps = virtual.rehearse('T4 → record + play');
		const after = steps.at(-1)!;
		// the screen alone would call it done after T4: the mark tells armed from not
		expect(after.screen).toBe(steps[0].screen);
		expect(after.music).not.toBe(steps[0].music);
	});
});
