// What the keys being played make, as the caption line says it: a chord with what it is and its
// notes, an interval, a note, a drum track's sounds; nothing while shift or bar makes them functions.
// The readout follows the replica's keyboard from any source and keeps the last reading a moment.
import { describe, expect, it } from 'vitest';
import { ReplicaState } from '$lib/replica';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../test/fakes/fake-time';
import { PlayReadout, readKeys } from './play-readout.svelte';
import { GUIDE_SCALES, scaleMarks } from './scale-guide.svelte';

/** A new project with track 3 (a melodic track) selected. */
function melodic() {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('track.3');
	return sim;
}

// keyboard keys from F3 (0): C4 is 7, E4 11, G4 14, B3 6, D4 9, A3 4
describe('readKeys', () => {
	it('names a chord, with what it is and its notes', () => {
		const sim = melodic();
		expect(readKeys(sim.state, [7, 11, 14])).toEqual({ name: 'C', detail: 'major · C E G' });
		expect(readKeys(sim.state, [9, 12, 16, 19])?.name).toBe('Dm7');
	});

	it('names two notes by their interval, and one by itself', () => {
		const sim = melodic();
		// track 3 is the bass, an octave down: the C4 key plays C3
		expect(readKeys(sim.state, [7, 14])).toEqual({ name: 'C3 G3', detail: 'perfect 5th' });
		expect(readKeys(sim.state, [8])).toEqual({ name: 'C#3', detail: '' });
		expect(readKeys(sim.state, [8], true)?.name).toBe('Db3');
	});

	it('names a drum track’s sounds, and nothing while shift makes the keys functions', () => {
		const sim = new OpxySim({ now: () => 0 });
		// track 1 of a new project is the drum sampler: F3 and G3 are its first kick and snare
		expect(readKeys(sim.state, [0, 2])?.name).toMatch(/kick .* \+ snare/);
		const melody = melodic();
		melody.input({ type: 'press', id: 'key.shift' });
		expect(readKeys(melody.state, [7])).toBeNull();
	});
});

describe('PlayReadout', () => {
	it('follows the keyboard, demonstrations included, and keeps the last reading a moment', async () => {
		const time = new FakeTime();
		const sim = melodic();
		const replica = new ReplicaState({ timers: time });
		const readout = new PlayReadout({ replica, sim: () => sim.state, timers: time, linger: 1000 });
		const stop = readout.start();
		replica.press('keyboard.c4', 'pointer');
		replica.press('keyboard.e4', 'pointer');
		replica.press('keyboard.g4', 'demo');
		expect(readout.reading?.name).toBe('C');
		// a chord's keys come up one after another: it is still the chord a moment after
		for (const key of ['keyboard.c4', 'keyboard.e4', 'keyboard.g4'] as const) {
			replica.release(key, 'pointer');
		}
		await time.advance(300);
		expect(readout.reading?.name).toBe('C');
		await time.advance(1000);
		expect(readout.reading).toBeNull();
		// a key lifted from a held chord: what stays is read once it has stayed
		replica.press('keyboard.c4', 'pointer');
		replica.press('keyboard.g4', 'pointer');
		replica.press('keyboard.e4', 'pointer');
		replica.release('keyboard.e4', 'pointer');
		await time.advance(300);
		expect(readout.reading).toEqual({ name: 'C3 G3', detail: 'perfect 5th' });
		stop();
	});
});

describe('scaleMarks', () => {
	it('lights the keys of a scale, the root marked', () => {
		const minor = GUIDE_SCALES.find((s) => s.name === 'minor')!;
		const marks = scaleMarks(9, minor);
		// A minor on F3…E5: the white keys only, A as the root (twice)
		expect(Object.keys(marks)).toHaveLength(14);
		expect(marks['keyboard.a3']).toBe('root');
		expect(marks['keyboard.a4']).toBe('root');
		expect(marks['keyboard.c4']).toBe('note');
		expect(marks['keyboard.fs3']).toBeUndefined();
	});
});
