import { describe, expect, it } from 'vitest';
import { hitMark, readPattern } from './pattern-reading';
import type { VirtualNote, VirtualPattern } from './virtual-opxy';

function pattern(notes: readonly Omit<VirtualNote, 'velocity'>[], bars = 1): VirtualPattern {
	return {
		track: 3,
		pattern: 1,
		patterns: 1,
		playing: true,
		bars,
		length: bars * 16,
		scale: 1,
		notes: notes.map((n) => ({ velocity: 100, ...n }))
	};
}

describe('readPattern', () => {
	it('reads a bassline step by step, spelled as its key does', () => {
		// F2 F2 F3 F2 | F2 Ab2 F2 F3 | F2 F2 Eb3 F2 | F2 C3 Db3 F2
		const line = [41, 41, 53, 41, 41, 44, 41, 53, 41, 41, 51, 41, 41, 48, 49, 41];
		const reading = readPattern(pattern(line.map((note, i) => ({ step: i + 1, note, length: 1 }))));
		expect(reading?.bars).toEqual(['F2 F2 F3 F2 | F2 Ab2 F2 F3 | F2 F2 Eb3 F2 | F2 C3 Db3 F2']);
		expect(reading?.chords).toBeUndefined();
	});

	it('names each chord where it starts, so a wrong one shows (G7, not Gm7)', () => {
		const chord = (step: number, notes: number[]) =>
			notes.map((note) => ({ step, note, length: 16 }));
		const reading = readPattern(
			pattern([...chord(1, [50, 53, 57, 60]), ...chord(17, [55, 59, 62, 65])], 2)
		);
		expect(reading?.bars).toEqual([
			'Dm7 – – – | – – – – | – – – – | – – – –',
			'G7 – – – | – – – – | – – – – | – – – –'
		]);
		expect(reading?.chords).toEqual(['step 1: Dm7 (D F A C)', 'step 17: G7 (G B D F)']);
		const minor = readPattern(pattern(chord(1, [55, 58, 62, 65])));
		expect(minor?.chords).toEqual(['step 1: Gm7 (G Bb D F)']);
	});

	it('shows rests, held notes and notes that make no chord', () => {
		const reading = readPattern(
			pattern([
				{ step: 1, note: 48, length: 2 },
				{ step: 5, note: 48, length: 1 },
				{ step: 5, note: 55, length: 1 }
			])
		);
		expect(reading?.bars[0]).toMatch(/^C3 – · · \| C3\+G3 · · · \|/);
		expect(readPattern(pattern([]))).toBeNull();
	});

	it('names a key when the notes say one', () => {
		const scale = [57, 59, 60, 62, 64, 65, 67, 69].map((note, i) => ({
			step: i * 2 + 1,
			note,
			length: i === 0 || i === 7 ? 4 : 1
		}));
		expect(readPattern(pattern(scale))?.key).toMatch(/^A minor|^C major/);
	});
});

describe('hitMark', () => {
	it('marks accents and soft hits against the sound’s other hits', () => {
		expect(hitMark(70, 45, 70)).toBe('X');
		expect(hitMark(45, 45, 70)).toBe('o');
		expect(hitMark(58, 45, 70)).toBe('x');
		expect(hitMark(100, 95, 105)).toBe('x');
	});
});
