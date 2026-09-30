// The eval's walkthrough is the app's own on the eval's replica: it lights the step to do, moves on
// once the screen shows where a step leads (whatever the hands pressed to get there), puts its card
// into words, and logs how far the user got.
import { describe, expect, it } from 'vitest';
import { ReplicaState } from '$lib/replica';
import { buildFrame } from '$lib/sim/frames';
import { planParam, planPlace } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { describeFrame } from '$lib/sim/screen/render';
import { FakeTime } from '../../test/fakes/fake-time';
import { markedControls, parseUserKeys, playUserKeys } from './hands';
import { EvalWalkthrough } from './walkthrough';

function setup() {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	const walkthrough = new EvalWalkthrough({
		replica,
		read: () => describeFrame(buildFrame(sim.state)),
		timers: time,
		now: () => time.now()
	});
	const press = async (text: string) => {
		const parsed = parseUserKeys(text);
		if (!parsed.ok) throw new Error(parsed.error);
		await playUserKeys(replica, parsed.value);
	};
	return { time, sim, replica, walkthrough, press };
}

describe('the eval walkthrough', () => {
	it('lights each step, moves on as the hands get the screen there, and logs the way', async () => {
		const { sim, replica, walkthrough, press } = setup();
		const plan = planParam(sim.state, { track: 3, param: 'cutoff', value: 5 });
		walkthrough.start('track 3 cutoff 5', plan.steps);
		expect(walkthrough.card()).toBe(
			'walkthrough card 1/3: T3 → the screen will show "prism: shape 15, ratio 2:1, detune 05, stereo 22"'
		);
		expect(markedControls(replica)).toEqual(['T3 (press)']);

		await press('T3');
		expect(walkthrough.update()).toMatchObject([{ kind: 'step', index: 1, steps: 3 }]);
		await press('M3');
		walkthrough.update();
		expect(walkthrough.card()).toMatch(/^walkthrough card 3\/3: turn E1, 5 detents clockwise → /);
		expect(markedControls(replica)).toEqual(['E1 (turn clockwise)']);

		// not there yet: the step waits
		await press('turn E1 +3');
		expect(walkthrough.update()).toEqual([]);
		await press('turn E1 +2');
		expect(walkthrough.update()).toMatchObject([{ kind: 'done', index: 3 }]);
		expect(walkthrough.card()).toBe('walkthrough card: done: track 3 cutoff 5');
		expect(markedControls(replica)).toEqual([]);
		expect(walkthrough.log.map((e) => e.kind)).toEqual(['start', 'step', 'step', 'done']);
	});

	it('takes a shortcut in one combo, and passes steps already done when it starts', async () => {
		const { sim, walkthrough, press } = setup();
		walkthrough.start(
			'track 3 filter',
			planPlace(sim.state, { area: 'instrument', track: 3, page: 3 }).steps
		);
		await press('T3 → M3');
		expect(walkthrough.update()).toMatchObject([{ kind: 'done' }]);

		// on T3 already: its step is passed at once, and counts as the user's
		const again = setup();
		await again.press('T3');
		again.walkthrough.start('track 3 filter', [
			{ keys: 'T3', screen: describeFrame(buildFrame(again.sim.state)) },
			...planPlace(again.sim.state, { area: 'instrument', track: 3, page: 3 }).steps
		]);
		expect(again.walkthrough.guide.current?.keys).toBe('M3');
		expect(again.walkthrough.log.map((e) => e.kind)).toEqual(['start', 'step']);
	});

	it('logs a walkthrough ended before its end, and clears its marks', async () => {
		const { sim, replica, walkthrough } = setup();
		walkthrough.start('mix M2', planPlace(sim.state, { area: 'mix', page: 2 }).steps);
		expect(markedControls(replica)).toEqual(['mix (press)']);
		walkthrough.stop();
		expect(walkthrough.card()).toBeNull();
		expect(markedControls(replica)).toEqual([]);
		expect(walkthrough.log.map((e) => e.kind)).toEqual(['start', 'stop']);
		// stopped twice: logged once
		walkthrough.stop();
		expect(walkthrough.log).toHaveLength(2);
	});

	it('shows "done" for a while, then goes away as the app does', async () => {
		const { time, sim, walkthrough, press } = setup();
		walkthrough.start('tempo', planPlace(sim.state, { area: 'tempo' }).steps);
		await press('tempo');
		walkthrough.update();
		expect(walkthrough.card()).toMatch(/^walkthrough card: done/);
		await time.advance(3000);
		expect(walkthrough.card()).toBeNull();
		expect(walkthrough.update()).toEqual([]);
	});
});
