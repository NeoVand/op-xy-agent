import { describe, expect, it } from 'vitest';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { playerOf } from '$lib/sim/areas/sequencer/players';
import { heldTriggers } from './held';

const down = (sim: OpxySim, id: string) => sim.input({ type: 'press', id });
const up = (sim: OpxySim, id: string) => sim.input({ type: 'release', id });

/** The held punch-in keys, by key. */
const held = (sim: OpxySim) => heldTriggers(sim.state).sort((a, b) => a.key - b.key);

/** A simulator on auxiliary track `n`. */
function aux(n: number): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.auxiliary');
	sim.press(`track.${n}`);
	return sim;
}

/** A simulator on instrument track `n`. */
function instrument(n: number): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press(`track.${n}`);
	return sim;
}

describe('punch-in keys held', () => {
	it('takes every key held on the punch-in track, lower octave the drums, upper the synths', () => {
		const sim = aux(2);
		down(sim, 'keyboard.c4');
		down(sim, 'keyboard.e5');
		expect(held(sim)).toEqual([
			{ key: 7, from: null, tracks: [0, 1] },
			{ key: 23, from: null, tracks: [2, 3, 4, 5, 6, 7] }
		]);
		up(sim, 'keyboard.c4');
		expect(held(sim).map((t) => t.key)).toEqual([23]);
		up(sim, 'keyboard.e5');
		expect(held(sim)).toEqual([]);
	});

	it('leaves the keys to other auxiliary tracks and to notes on instrument tracks', () => {
		const brain = aux(1);
		down(brain, 'keyboard.c4');
		expect(held(brain)).toEqual([]);
		const synth = instrument(3);
		down(synth, 'keyboard.c4');
		expect(held(synth)).toEqual([]);
	});

	it('fires shift + key on an instrument track for as long as the key is held', () => {
		const sim = instrument(3);
		down(sim, 'key.shift');
		down(sim, 'keyboard.d4');
		down(sim, 'keyboard.f4');
		const lower = { key: 9, from: 2, tracks: [2] };
		expect(held(sim)).toEqual([lower, { key: 12, from: 2, tracks: [2, 3, 4, 5, 6, 7] }]);
		// shift let go first: the effects hold on with their keys
		up(sim, 'key.shift');
		up(sim, 'keyboard.f4');
		expect(held(sim)).toEqual([lower]);
		up(sim, 'keyboard.d4');
		expect(held(sim)).toEqual([]);
	});

	it('keeps a key that went down as a note a note when shift comes down after it', () => {
		const sim = instrument(3);
		down(sim, 'keyboard.d4');
		expect(held(sim)).toEqual([]);
		down(sim, 'key.shift');
		expect(held(sim)).toEqual([]);
	});

	it('gives the shortcut up where the keys mean something else', () => {
		// a midi engine track (OS 1.0.32)
		const midi = instrument(3);
		midi.state.tracks[2].engine = 'midi';
		down(midi, 'key.shift');
		down(midi, 'keyboard.d4');
		expect(held(midi)).toEqual([]);
		// maestro takes shift + keys for its chord
		const maestro = instrument(3);
		Object.assign(playerOf(maestro.state), { on: true, type: 'maestro' });
		down(maestro, 'key.shift');
		down(maestro, 'keyboard.d4');
		expect(held(maestro)).toEqual([]);
		// a step held: the keyboard edits it
		const step = instrument(3);
		down(step, 'step.1');
		down(step, 'key.shift');
		down(step, 'keyboard.d4');
		expect(held(step)).toEqual([]);
	});
});
