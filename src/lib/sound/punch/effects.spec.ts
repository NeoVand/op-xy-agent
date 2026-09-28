import { describe, expect, it } from 'vitest';
import { defaultEngines } from '$lib/sim/params';
import {
	DRUM_PANS,
	PUNCH_EFFECTS,
	RAMPS,
	effectOf,
	fillAt,
	groupOf,
	punchLevel,
	punchTracks
} from './effects';

/** A new project's tracks: T1–T2 drums, T3–T8 synths. */
const tracks = defaultEngines().map((engine) => ({ engine }));

describe('punch-in effects: keys, groups and levels', () => {
	it('repeats the twelve effects in both octaves, each shaped to its group', () => {
		expect(PUNCH_EFFECTS.percussion).toHaveLength(12);
		expect(PUNCH_EFFECTS.melodic).toHaveLength(12);
		expect(effectOf(0, 'percussion')).toBe('mute');
		expect(effectOf(12, 'melodic')).toBe('mute');
		// the same key position, the other group's version
		expect(effectOf(7, 'percussion')).toBe('fill');
		expect(effectOf(19, 'melodic')).toBe('rise');
		expect(effectOf(9, 'percussion')).toBe('hats');
		expect(effectOf(21, 'melodic')).toBe('fall');
		expect(effectOf(23, 'melodic')).toBe('random');
	});

	it('sorts engines into the percussion and melodic groups, the midi engine into neither', () => {
		expect(groupOf('drum')).toBe('percussion');
		expect(groupOf('prism')).toBe('melodic');
		expect(groupOf('sampler')).toBe('melodic');
		expect(groupOf('midi')).toBeNull();
	});

	it('acts on the sound, on every note, or on the sequencer, by effect and group', () => {
		expect(punchLevel('mute', 'percussion')).toBe('audio');
		expect(punchLevel('stutter', 'melodic')).toBe('audio');
		expect(punchLevel('pan', 'melodic')).toBe('audio');
		expect(punchLevel('pan', 'percussion')).toBe('voice');
		expect(punchLevel('short', 'melodic')).toBe('voice');
		expect(punchLevel('repeat3', 'percussion')).toBe('sequence');
		expect(punchLevel('octave', 'melodic')).toBe('sequence');
	});

	it('targets the group of the octave on the punch-in track, one track or its group from a shortcut', () => {
		expect(punchTracks(tracks, { key: 3, from: null })).toEqual([0, 1]);
		expect(punchTracks(tracks, { key: 15, from: null })).toEqual([2, 3, 4, 5, 6, 7]);
		// shift + a lower key on T4: that track alone; an upper key: its whole group
		expect(punchTracks(tracks, { key: 3, from: 3 })).toEqual([3]);
		expect(punchTracks(tracks, { key: 15, from: 3 })).toEqual([2, 3, 4, 5, 6, 7]);
		// from a drum track the upper octave takes the percussion group
		expect(punchTracks(tracks, { key: 15, from: 0 })).toEqual([0, 1]);
		const midi = tracks.map((t, k) => (k === 5 ? { engine: 'midi' as const } : t));
		expect(punchTracks(midi, { key: 15, from: null })).not.toContain(5);
		expect(punchTracks(midi, { key: 3, from: 5 })).toEqual([]);
	});
});

describe('punch-in effects: the patterns they play', () => {
	it('fills with snares on 1, 3, 6, 9, 11, 14 and kicks that change bar to bar', () => {
		const snares = (bar: number) =>
			Array.from({ length: 16 }, (_, i) => i).filter((i) =>
				fillAt('fill', bar * 16 + i).some((h) => h.key === 2)
			);
		const kicks = (bar: number) =>
			Array.from({ length: 16 }, (_, i) => i).filter((i) =>
				fillAt('fill', bar * 16 + i).some((h) => h.key === 0)
			);
		expect(snares(0)).toEqual([1, 3, 6, 9, 11, 14]);
		expect(snares(1)).toEqual([1, 3, 6, 9, 11, 14]);
		expect(kicks(0)).toEqual([3, 5, 15]);
		expect(kicks(1)).toEqual([2, 7, 10]);
		expect(kicks(2)).toEqual([3, 5, 15]);
	});

	it('rides the hats: closed on every sixteenth, open on the off-beat eighths', () => {
		const keys = Array.from({ length: 16 }, (_, i) => fillAt('hats', i).map((h) => h.key));
		expect(keys.every((k) => k.length === 1)).toBe(true);
		expect(keys.flat().filter((k) => k === 10)).toHaveLength(4);
		expect([2, 6, 10, 14].every((i) => keys[i][0] === 10)).toBe(true);
		expect(fillAt('mute', 0)).toEqual([]);
	});

	it('pans drum hits to both sides by step, and ramps climb and fall an octave', () => {
		expect(DRUM_PANS).toHaveLength(16);
		expect(DRUM_PANS.some((p) => p < 0) && DRUM_PANS.some((p) => p > 0)).toBe(true);
		expect(RAMPS.rise?.at(-1)).toBe(12);
		expect(RAMPS.fall?.at(-1)).toBe(-12);
	});
});
