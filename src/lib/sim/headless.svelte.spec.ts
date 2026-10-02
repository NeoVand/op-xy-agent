// A headless simulator in the browser: its state is the plain object it was given, where the
// reactive simulator's is a proxy (whose every read and write made the lab's locks and bar settings
// about eight times slower), and it plays keys as the reactive one does.
import { describe, expect, it } from 'vitest';
import { HeadlessSim, OpxySim } from './opxy-sim.svelte';
import { defaultState } from './params';

describe('a headless simulator', () => {
	it('keeps the plain state it was given, where the reactive one wraps it', () => {
		const state = defaultState();
		expect(new HeadlessSim({ state, now: () => 0 }).state).toBe(state);
		expect(new OpxySim({ state, now: () => 0 }).state).not.toBe(state);
	});

	it('plays keys as the reactive simulator does', () => {
		const headless = new HeadlessSim({ now: () => 0 });
		const reactive = new OpxySim({ now: () => 0 });
		for (const sim of [headless, reactive]) {
			sim.press('key.t3');
			sim.press('key.m3');
			sim.turn(1, -10);
		}
		expect(JSON.stringify(headless.state)).toBe(JSON.stringify($state.snapshot(reactive.state)));
		headless.reset();
		expect(headless.state.track).toBe(defaultState().track);
	});
});
