import { describe, expect, it } from 'vitest';
import { chordFromSymbol } from './harmony';
import { voiceChords } from './voicing';

describe('chordFromSymbol', () => {
	it('reads a root, a suffix in its usual spellings, and a slash bass', () => {
		expect(chordFromSymbol('Am7')).toEqual({ root: 9, tones: [0, 3, 7, 10], bass: null });
		expect(chordFromSymbol('C/E')).toEqual({ root: 0, tones: [0, 4, 7], bass: 4 });
		expect(chordFromSymbol('F#m7b5')?.tones).toEqual([0, 3, 6, 10]);
		expect(chordFromSymbol('Bbmaj9')).toMatchObject({ root: 10, tones: [0, 2, 4, 7, 11] });
		expect(chordFromSymbol('Gsus4')?.tones).toEqual([0, 5, 7]);
		expect(chordFromSymbol('Cdim')?.tones).toEqual([0, 3, 6]);
		expect(chordFromSymbol('Caug')?.tones).toEqual([0, 4, 8]);
		expect(chordFromSymbol('Ebm')?.root).toBe(3);
		expect(chordFromSymbol('A7b9')?.tones).toEqual([0, 1, 4, 7, 10]);
		expect(chordFromSymbol('CM7')?.tones).toEqual([0, 4, 7, 11]);
		expect(chordFromSymbol('C')?.tones).toEqual([0, 4, 7]);
	});

	it('gives null for what is no chord', () => {
		expect(chordFromSymbol('H7')).toBeNull();
		expect(chordFromSymbol('Cfoo')).toBeNull();
		expect(chordFromSymbol('')).toBeNull();
	});
});

describe('voiceChords', () => {
	const voice = (...names: string[]) => voiceChords(names.map((n) => chordFromSymbol(n)!));

	it('starts close to middle C in root position and moves each voice as little as it can', () => {
		const [am, f, c, g] = voice('Am', 'F', 'C', 'G');
		expect(am).toEqual([57, 60, 64]);
		// common tones stay, the others step
		expect(f).toEqual([57, 60, 65]);
		expect(c).toEqual([55, 60, 64]);
		expect(g).toEqual([55, 59, 62]);
	});

	it('stays near the middle over a long progression', () => {
		const chords = voice('C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G');
		for (const c of chords) {
			const middle = c.reduce((a, b) => a + b, 0) / c.length;
			expect(Math.abs(middle - 60)).toBeLessThanOrEqual(7);
		}
	});

	it('keeps every chord on its root when asked', () => {
		const chords = voiceChords(
			['Am', 'F', 'C', 'G'].map((n) => chordFromSymbol(n)!),
			{ root: true }
		);
		expect(chords.map((c) => c[0] % 12)).toEqual([9, 5, 0, 7]);
		for (const c of chords) {
			const middle = c.reduce((a, b) => a + b, 0) / c.length;
			expect(Math.abs(middle - 60)).toBeLessThanOrEqual(7);
		}
	});

	it('puts a slash chord’s bass below the voicing', () => {
		const [c] = voice('C/E');
		expect(c[0] % 12).toBe(4);
		expect(c[0]).toBeLessThan(c[1]);
		expect(
			c
				.slice(1)
				.map((n) => n % 12)
				.sort((a, b) => a - b)
		).toEqual([0, 4, 7]);
	});
});
