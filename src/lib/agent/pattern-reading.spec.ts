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

	it('spells a key’s own seven notes on seven letters: E# in F# major, Cb in Gb major', () => {
		// a V chord in F# major read C# F G#
		const fifth = [61, 65, 68].map((note) => ({ step: 1, note, length: 4 }));
		expect(readPattern(pattern(fifth), [], undefined, parseKey('F# major'))?.chords).toEqual([
			'step 1: C# (C# E# G#)'
		]);
		const cb = [71, 75, 78].map((note) => ({ step: 1, note, length: 4 }));
		const gb = readPattern(pattern(cb), [], undefined, parseKey('Gb major'));
		expect(gb?.chords).toEqual(['step 1: Cb (Cb Eb Gb)']);
		// Cb5 is B4's key (71): its octave counts from its letter
		expect(gb?.notes).toBe('1:Cb5+Eb5+Gb5:4:100');
	});

	it('spells a key named with a sharp in sharps, its flat twin in flats', () => {
		// the black keys in D# minor read as Bb Ab Gb Db Eb, "as D# minor spells them"
		const notes = [70, 68, 66, 61, 63].map((note, i) => ({ step: 1 + i * 2, note, length: 2 }));
		const sharps = readPattern(pattern(notes), [], undefined, parseKey('D# minor'), [
			'A#',
			'G#',
			'F#',
			'C#',
			'D#'
		]);
		expect(sharps?.bars).toEqual(['A#4 – G#4 – | F#4 – C#4 – | D#4 – · · | · · · ·']);
		expect(sharps?.spelled).toBeUndefined();
		const flats = readPattern(pattern(notes), [], undefined, parseKey('Eb minor'));
		expect(flats?.bars).toEqual(['Bb4 – Ab4 – | Gb4 – Db4 – | Eb4 – · · | · · · ·']);
	});

	it('says which notes are outside the key named, and the mode one of them makes', () => {
		// Dm7 G7: D F A C, G B D F — the B makes D minor dorian
		const notes = [50, 53, 57, 60, 55, 59, 62, 65].map((note, i) => ({
			step: i < 4 ? 1 : 9,
			note,
			length: 8
		}));
		const dorian = readPattern(pattern(notes), [], undefined, parseKey('D minor'));
		expect(dorian?.outside).toBe(
			'B is outside D minor: with it the notes are D dorian (key "D dorian" reads them so)'
		);
		expect(
			readPattern(pattern(notes), [], undefined, parseKey('D dorian'))?.outside
		).toBeUndefined();
		// harmonic minor's leading note is in the key: no flag for E in F minor's C7
		const c7 = [48, 52, 55, 58].map((note) => ({ step: 1, note, length: 16 }));
		expect(readPattern(pattern(c7), [], undefined, parseKey('F minor'))?.outside).toBeUndefined();
		// two strangers, no mode
		const odd = [60, 61, 66].map((note, i) => ({ step: i * 4 + 1, note, length: 2 }));
		expect(readPattern(pattern(odd), [], undefined, parseKey('C major'))?.outside).toBe(
			'C# F# are outside C major'
		);
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
		// each digit reads back as written, the loud ones too (a plain hit at 100 stays x)
		for (const d of [1, 2, 3, 4, 5, 6, 7, 8]) {
			expect(hitMark(Math.round((d * 127) / 9))).toBe(String(d));
		}
		expect(hitMark(90)).toBe('x');
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
	it('names a part’s own chords, and what they make over another track’s bass beside them', () => {
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
		// its own chord first: a strings part transposed before its bass read Bm7/A for B D F#
		expect(over?.bars[0]).toMatch(/^Cmaj7 /);
		expect(over?.chords?.[0]).toBe("step 1: Cmaj7 (C E G B; over T3's A it sounds as Am9)");
		// a progression over the bass, apart from its own
		const two = at(
			[
				...[60, 64, 67, 71].map((note) => [1, note, 8] as [number, number, number]),
				...[60, 65, 69].map((note) => [9, note, 8] as [number, number, number])
			],
			4
		);
		const under = at(
			[
				[1, 45, 8],
				[9, 50, 8]
			],
			3
		);
		const both = readPattern(two, [under]);
		expect(both?.progression).toMatch(/^Cmaj7 F\b/);
		expect(both?.withBass).toBe("with T3's bass as it plays now: Am9 Dm7");
		// a one-bar bass loops under two bars of chords (it was heard under the first bar alone)
		const long: VirtualPattern = {
			...at(
				[
					...[60, 64, 67, 71].map((note) => [1, note, 16] as [number, number, number]),
					...[60, 64, 67, 71].map((note) => [17, note, 16] as [number, number, number])
				],
				4
			),
			bars: 2,
			length: 32
		};
		const looped = readPattern(
			{ ...long, notes: long.notes.filter((n) => n.step === 1 || n.note !== 71) },
			[bass]
		);
		expect(looped?.chords).toEqual([
			"step 1: Cmaj7 (C E G B; over T3's A it sounds as Am9)",
			"step 17: C (C E G; over T3's A it sounds as Am7)"
		]);
	});
});

describe('a melody against the chords another track plays', () => {
	it('counts its chord tones and names those on a beat outside the chord', () => {
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
		// E minor (E G B) for two beats, then C major (C E G)
		const chords = at(
			[
				...[64, 67, 71].map((note) => [1, note, 8] as [number, number, number]),
				...[60, 64, 67].map((note) => [9, note, 8] as [number, number, number])
			],
			7
		);
		// B on 1 (a tone), F# on 3 (a passing note), F# on 5 (on a beat, outside Em), E on 9 (a tone)
		const melody = at(
			[
				[1, 71, 2],
				[3, 66, 2],
				[5, 66, 2],
				[9, 76, 4]
			],
			5
		);
		const reading = readPattern(melody, [chords], undefined, parseKey('E minor'));
		expect(reading?.againstChords).toBe(
			"2 of the 4 notes over T7's chords are chord tones; on a beat and outside the chord: step 5: F#4 over Em (E G B); 1 off the beat is a passing note"
		);
	});
});

describe('parseKey', () => {
	it('reads a key and spells a mode as its parent', () => {
		expect(parseKey('A minor')).toEqual({
			label: 'A minor',
			pitchClass: 9,
			mode: 'minor',
			tonic: 9,
			letter: 5
		});
		expect(parseKey('D dorian')).toEqual({
			label: 'D dorian',
			pitchClass: 0,
			mode: 'major',
			tonic: 2,
			letter: 0
		});
		expect(parseKey('eb')).toEqual({
			label: 'Eb major',
			pitchClass: 3,
			mode: 'major',
			tonic: 3,
			prefer: 'flats',
			letter: 2
		});
		expect(parseKey('D# minor')?.prefer).toBe('sharps');
		expect(parseKey('H minor')).toBeNull();
	});
});
