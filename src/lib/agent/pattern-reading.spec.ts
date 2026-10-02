import { describe, expect, it } from 'vitest';
import { hitMark, parseKey, readPattern } from './pattern-reading';
import type { VirtualNote, VirtualPattern } from './virtual-opxy';

function pattern(notes: readonly Omit<VirtualNote, 'velocity'>[], bars = 1): VirtualPattern {
	return {
		track: 3,
		pattern: 1,
		patterns: 1,
		current: true,
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
	it('marks accents and soft hits by fixed lines, so a grid reads back as written', () => {
		expect(hitMark(120)).toBe('X');
		expect(hitMark(115)).toBe('X');
		expect(hitMark(100)).toBe('x');
		expect(hitMark(76)).toBe('x');
		expect(hitMark(75)).toBe('o');
		// a line of soft hits stays soft, whatever the other hits
		expect([55, 55, 55].map(hitMark)).toEqual(['o', 'o', 'o']);
	});
});

describe('the key of a pattern with the parts alongside it', () => {
	it('counts the chords under a melody that alone suggests another key', () => {
		const at = (notes: [number, number, number][], track: number): VirtualPattern => ({
			track,
			pattern: 1,
			patterns: 1,
			current: true,
			bars: 1,
			length: 16,
			scale: 1,
			notes: notes.map(([step, note, length]) => ({ step, note, velocity: 100, length }))
		});
		// E E F G G F E D: alone, no C to settle it
		const melody = at(
			[64, 64, 65, 67, 67, 65, 64, 62].map((note, i) => [i * 2 + 1, note, 2]),
			5
		);
		const chords = at(
			[
				[1, 48, 8],
				[1, 52, 8],
				[1, 55, 8],
				[9, 43, 8],
				[9, 47, 8],
				[9, 50, 8]
			],
			7
		);
		expect(readPattern(melody, [chords])?.key).toMatch(/^C major/);
		// alone, the melody's E, F, G and D still fit no key better than C major (F rules G out)
		expect(readPattern(melody)?.key ?? '').not.toMatch(/^(G|E) /);
	});
});

describe('a chord named over the bass another part plays', () => {
	it('reads a rootless voicing as the chord its bass makes it', () => {
		const at = (notes: [number, number, number][], track: number): VirtualPattern => ({
			track,
			pattern: 1,
			patterns: 1,
			current: true,
			bars: 1,
			length: 16,
			scale: 1,
			notes: notes.map(([step, note, length]) => ({ step, note, velocity: 100, length }))
		});
		// C E G B over A: Am9 without its root
		const keys = at(
			[60, 64, 67, 71].map((note) => [1, note, 16] as [number, number, number]),
			4
		);
		const bass = at([[1, 45, 16]], 3);
		expect(readPattern(keys)?.chords?.[0]).toMatch(/^step 1: Cmaj7 /);
		const over = readPattern(keys, [bass]);
		expect(over?.bars[0]).toMatch(/^Am9 /);
		expect(over?.chords?.[0]).toBe("step 1: Am9 (C E G B over T3's A)");
	});
});

describe('parseKey', () => {
	it('reads a key and spells a mode as its parent', () => {
		expect(parseKey('A minor')).toEqual({ label: 'A minor', pitchClass: 9, mode: 'minor' });
		expect(parseKey('D dorian')).toEqual({ label: 'D dorian', pitchClass: 0, mode: 'major' });
		expect(parseKey('eb')).toEqual({ label: 'Eb major', pitchClass: 3, mode: 'major' });
		expect(parseKey('H minor')).toBeNull();
	});
});
