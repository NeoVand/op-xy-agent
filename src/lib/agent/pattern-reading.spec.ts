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

	it('names the progression plainly and as degrees, with the inversions apart', () => {
		const chord = (step: number, notes: number[]) =>
			notes.map((note) => ({ step, note, length: 16 }));
		// Let It Be's turn voiced smoothly: C, G/B, Am/C, F/C
		const reading = readPattern(
			pattern(
				[
					...chord(1, [60, 64, 67]),
					...chord(17, [59, 62, 67]),
					...chord(33, [60, 64, 69]),
					...chord(49, [60, 65, 69])
				],
				4
			),
			[],
			undefined,
			parseKey('C major')
		);
		expect(reading?.progression).toBe(
			'C G Am F: I V vi IV in C major; G/B, Am/C, F/C are inversions, the same chords over another of their notes'
		);
		// a minor key's degrees as a major scale counts them
		const minor = readPattern(
			pattern(
				[...chord(1, [57, 60, 64]), ...chord(17, [53, 57, 60]), ...chord(33, [55, 59, 62, 65])],
				3
			),
			[],
			undefined,
			parseKey('A minor')
		);
		expect(minor?.progression).toBe('Am F G7: i ♭VI ♭VII7 in A minor');
		// a cluster that is no chord keeps its place, as its notes
		const cluster = readPattern(
			pattern([...chord(1, [57, 60, 64]), ...chord(17, [60, 61, 62])], 2),
			[],
			undefined,
			parseKey('A minor')
		);
		expect(cluster?.progression).toBe(
			'Am [C C# D]: i ? in A minor; [C C# D] is no chord the reading names'
		);
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

describe('a line of single notes', () => {
	it('names the chord each bar outlines, where its notes make one', () => {
		// A2 A2 C3 E3 | G2 G2 B2 D3 | F2 F2 A2 C3 | E2 E2 G#2 B2: Am G F E, the call-response bass
		const bars = [
			[45, 45, 48, 52],
			[43, 43, 47, 50],
			[41, 41, 45, 48],
			[40, 40, 44, 47]
		];
		const notes = bars.flatMap((bar, b) =>
			bar.map((note, i) => ({ step: b * 16 + 9 + i * 2, note, length: 1 }))
		);
		const reading = readPattern(pattern(notes, 4), [], undefined, parseKey('A minor'));
		expect(reading?.outlines).toEqual([
			'bar 1: Am (A C E)',
			'bar 2: G (G B D)',
			'bar 3: F (F A C)',
			'bar 4: E (E G# B)'
		]);
		// a bar of a scale run makes no chord, and says none
		const run = readPattern(
			pattern([60, 62, 64, 65, 67].map((note, i) => ({ step: i * 3 + 1, note, length: 2 })))
		);
		expect(run?.outlines).toBeUndefined();
	});

	it('says how it spells the sharps a writer gave in a flat key', () => {
		const notes = [41, 44, 46, 48, 51].map((note, i) => ({ step: i * 3 + 1, note, length: 2 }));
		const reading = readPattern(pattern(notes), [], undefined, parseKey('F minor'), [
			'G#',
			'A#',
			'D#',
			'C'
		]);
		expect(reading?.bars[0]).toMatch(/Ab2/);
		expect(reading?.spelled).toBe(
			'G# A# D# read as Ab Bb Eb, as F minor spells them (the same notes)'
		);
		// spelled as given: nothing to say
		const plain = readPattern(pattern(notes), [], undefined, parseKey('F minor'), ['Ab']);
		expect(plain?.spelled).toBeUndefined();
	});
});

describe('hitMark', () => {
	it('marks accents and soft hits by fixed lines, so a grid reads back as written', () => {
		expect(hitMark(120)).toBe('X');
		expect(hitMark(115)).toBe('X');
		expect(hitMark(100)).toBe('x');
		expect(hitMark(76)).toBe('x');
		expect(hitMark(75)).toBe('5');
		// a line of soft hits stays soft, whatever the other hits
		expect([55, 55, 55].map(hitMark)).toEqual(['4', '4', '4']);
		// each soft digit reads back as written
		for (const d of [1, 2, 3, 4, 5]) expect(hitMark(Math.round((d * 127) / 9))).toBe(String(d));
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
		// and what its own notes make, which a part moved before its bass would read as
		expect(over?.chords?.[0]).toBe("step 1: Am9 (C E G B over T3's A; its own notes make Cmaj7)");
	});
});

describe('parseKey', () => {
	it('reads a key and spells a mode as its parent', () => {
		expect(parseKey('A minor')).toEqual({
			label: 'A minor',
			pitchClass: 9,
			mode: 'minor',
			tonic: 9
		});
		expect(parseKey('D dorian')).toEqual({
			label: 'D dorian',
			pitchClass: 0,
			mode: 'major',
			tonic: 2
		});
		expect(parseKey('eb')).toEqual({ label: 'Eb major', pitchClass: 3, mode: 'major', tonic: 3 });
		expect(parseKey('H minor')).toBeNull();
	});
});
