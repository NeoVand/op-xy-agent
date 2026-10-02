// A track heard alone: the others muted, but a duck's source played on unheard, so the duck moves.
import { describe, expect, it } from 'vitest';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { alone, mixDuckNote } from './scene-render';

describe('alone', () => {
	it('mutes every other track, and keeps a duck source playing at level 0', () => {
		const state = new OpxySim({ now: () => 0 }).state;
		const pad = state.tracks[7];
		pad.lfo.type = 'duck';
		pad.lfo.on = true;
		pad.lfo.source = 1;
		const heard = alone(state, 8);
		expect(heard.tracks.map((t) => t.mix.muted)).toEqual([
			false,
			true,
			true,
			true,
			true,
			true,
			true,
			false
		]);
		expect(heard.tracks[0].mix.level).toBe(0);
		// the state it was given is left as it was
		expect(state.tracks[0].mix.level).toBeGreaterThan(0);
		// a track without a duck mutes the rest
		const kick = alone(state, 1);
		expect(kick.tracks.filter((t) => !t.mix.muted)).toHaveLength(1);
	});
});

describe('mixDuckNote', () => {
	it('points a mix with no pump to the ducking tracks alone', () => {
		const state = new OpxySim({ now: () => 0 }).state;
		expect(mixDuckNote(state, false)).toBeNull();
		Object.assign(state.tracks[7].lfo, { type: 'duck', on: true, source: 1 });
		expect(mixDuckNote(state, false)).toMatch(/^T8 ducks, .*Listen with tracks \[8\]/);
		expect(mixDuckNote(state, true)).toBeNull();
	});
});
