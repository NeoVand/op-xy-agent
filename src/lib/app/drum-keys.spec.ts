// A drum key's own values: read by read_sound where they are not a new key's, and listed as
// changes when they move (a key panned left once left no trace in either).
import { describe, expect, it } from 'vitest';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { createVirtualOpxy } from './virtual';
import { drumKeyChanges, drumKeysSet } from './drum-keys';

describe('drum keys', () => {
	it('lists the keys set apart from a new key, and what moved', () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		expect(drumKeysSet(sim.state, 0)).toEqual({});
		const before = JSON.parse(JSON.stringify(sim.state));
		sim.state.tracks[0].drumKeys[8].pan = -70;
		expect(drumKeysSet(sim.state, 0)).toEqual({ 'C#4 closed hat 1': 'pan -70' });
		expect(virtual.readSound(1).keys).toEqual({ 'C#4 closed hat 1': 'pan -70' });
		expect(drumKeyChanges(before, sim.state, 0)).toEqual(['C#4 closed hat 1: pan 0 → -70']);
		// in the change list too
		expect(virtual.changesSince(virtual.checkpoint())).toEqual([]);
	});

	it('groups the same lock on several steps into one change', () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [5, 13].map((step) => ({ step, note: 55, velocity: 100, length: 1 }))
		});
		const mark = virtual.checkpoint();
		for (const step of [5, 13])
			sim.state.tracks[0].sequence.patterns[0].steps[step - 1].locks['sends.fx1'] = 60;
		expect(virtual.changesSince(mark).join('\n')).toMatch(/locked at 60 on steps 5, 13/);
	});

	it('reads a move as a change line', () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		const mark = virtual.checkpoint();
		sim.state.tracks[0].drumKeys[2].gain = -6;
		expect(virtual.changesSince(mark).join('\n')).toMatch(/T1 key G3 snare 1: gain 0 → -6/);
	});
});
