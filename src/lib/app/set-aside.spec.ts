// An example plays on a new project: the user's project, track and mode wait, saving holds
// meanwhile (even when asked to save), and putting it back restores all of it exactly, once.
import { describe, expect, it } from 'vitest';
import { snapshot } from '$lib/sim/areas/system/projects';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { setAside } from './set-aside';
import { createVirtualOpxy } from './virtual';

describe('setting the replica aside', () => {
	it('stands a new project in, and puts the user’s back exactly', () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(5, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 60, velocity: 90, length: 4 }]
		});
		virtual.setTempo(96);
		sim.state.track = 4;
		const theirs = snapshot(sim.state);
		let holds = 0;
		let released = 0;
		const back = setAside(sim, { hold: () => (holds++, () => released++) });
		expect(holds).toBe(1);
		expect(sim.state.tempo.bpm).toBe(120);
		expect(virtual.readPattern(5, 1).notes).toHaveLength(0);
		expect(sim.state.track).toBe(0);
		// the example makes something of its own
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 53, velocity: 100, length: 1 }]
		});
		back();
		expect(snapshot(sim.state)).toBe(theirs);
		expect(sim.state.track).toBe(4);
		expect(released).toBe(1);
		back();
		expect(released).toBe(1);
	});
});
