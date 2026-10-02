// Key and chord hints on chords built from note names: a note lands in its pitch class, progressions
// in five keys (major and minor, sines and harmonic-rich saws) name their key, and chord spans come
// out where the chords change — triads, sevenths, diminished and suspended — while noise has none.
import { describe, expect, it } from 'vitest';
import {
	PITCH_CLASSES,
	chordHints,
	chromagram,
	estimateKey,
	keySpelling,
	nameChord,
	respellChord,
	type ChordSpan
} from './harmony';
import { chord, noise, progression } from './signals';

const SR = 22050;

/** Chord labels of the spans, the silent ones left out. */
const labels = (spans: readonly ChordSpan[]) => spans.map((s) => s.chord).filter((c) => c !== 'N');

describe('chromagram', () => {
	it('puts a note in its pitch class', () => {
		const c = chromagram([chord(['A4'], 2, SR, { amplitude: 0.3 })], SR);
		const peak = c.total.indexOf(Math.max(...c.total));
		expect(PITCH_CLASSES[peak]).toBe('A');
		const others = [...c.total].filter((_, i) => i !== peak);
		expect(Math.max(...others)).toBeLessThan(0.05 * c.total[peak]);
		expect(c.frameRate).toBeCloseTo(SR / 2048, 6);
	});

	it('holds a triad’s three notes', () => {
		const c = chromagram([chord(['C4', 'E4', 'G4'], 2, SR)], SR);
		const top = [...c.total.keys()].sort((a, b) => c.total[b] - c.total[a]).slice(0, 3);
		expect(top.map((i) => PITCH_CLASSES[i]).sort()).toEqual(['C', 'E', 'G']);
	});

	it('is empty for silence and short takes', () => {
		expect(chromagram([new Float32Array(SR)], SR).total.every((v) => v === 0)).toBe(true);
		expect(chromagram([new Float32Array(100)], SR).frames).toEqual([]);
	});
});

describe('estimateKey', () => {
	const cases: [string, string[][]][] = [
		[
			'C major',
			[
				['C4', 'E4', 'G4'],
				['F3', 'A3', 'C4'],
				['G3', 'B3', 'D4'],
				['C4', 'E4', 'G4']
			]
		],
		[
			'A minor',
			[
				['A3', 'C4', 'E4'],
				['D4', 'F4', 'A4'],
				['E3', 'G#3', 'B3'],
				['A3', 'C4', 'E4']
			]
		],
		[
			'G major',
			[
				['G3', 'B3', 'D4'],
				['C4', 'E4', 'G4'],
				['D4', 'F#4', 'A4'],
				['G3', 'B3', 'D4']
			]
		],
		[
			'Eb major',
			[
				['Eb4', 'G4', 'Bb4'],
				['Ab3', 'C4', 'Eb4'],
				['Bb3', 'D4', 'F4'],
				['Eb4', 'G4', 'Bb4']
			]
		],
		[
			'F# minor',
			[
				['F#3', 'A3', 'C#4'],
				['B3', 'D4', 'F#4'],
				['C#4', 'F4', 'G#4'],
				['F#3', 'A3', 'C#4']
			]
		]
	];

	it.each(cases)('names %s from a progression of sines', (key, chords) => {
		const k = estimateKey(chromagram([progression(chords, 1, SR)], SR).total)!;
		expect(k.key).toBe(key);
		expect(k.correlation).toBeGreaterThan(0.75);
	});

	it.each(cases)('names %s from the same progression on saws', (key, chords) => {
		const x = progression(chords, 1, SR, { wave: 'saw', amplitude: 0.1 });
		expect(estimateKey(chromagram([x], SR).total)!.key).toBe(key);
	});

	it('says how sure it is', () => {
		const k = estimateKey(chromagram([progression(cases[0][1], 1, SR)], SR).total)!;
		expect(k).toMatchObject({ tonic: 'C', mode: 'major', clear: true });
		expect(k.margin).toBeGreaterThan(0.05);
		expect(k.runnerUp).not.toBe('C major');
	});

	it('spells a key as its signature does', () => {
		const db = progression(
			[
				['Db3', 'F3', 'Ab3'],
				['Gb3', 'Bb3', 'Db4'],
				['Ab3', 'C4', 'Eb4'],
				['Db3', 'F3', 'Ab3']
			],
			1,
			SR
		);
		expect(estimateKey(chromagram([db], SR).total)).toMatchObject({
			key: 'Db major',
			tonic: 'Db',
			pitchClass: 1
		});
	});

	it('names no key for noise or silence', () => {
		const n = estimateKey(chromagram([noise('pink', 4, SR, { seed: 9 })], SR).total);
		expect(n === null || !n.clear).toBe(true);
		expect(estimateKey(new Float64Array(12))).toBeNull();
		// a flat chroma correlates with nothing
		expect(estimateKey(new Float64Array(12).fill(1))).toBeNull();
	});
});

describe('chords', () => {
	it.each([
		[['C4', 'E4', 'G4'], 'C'],
		[['A3', 'C4', 'E4'], 'Am'],
		[['G3', 'B3', 'D4', 'F4'], 'G7'],
		[['C4', 'E4', 'G4', 'B4'], 'Cmaj7'],
		[['A3', 'C4', 'E4', 'G4'], 'Am7'],
		[['B3', 'D4', 'F4'], 'Bdim'],
		[['D4', 'G4', 'A4'], 'Dsus4'],
		[['Bb3', 'D4', 'F4'], 'Bb']
	])('names %j as %s', (notes, name) => {
		expect(nameChord(chromagram([chord(notes, 1.5, SR)], SR).total).chord).toBe(name);
	});

	it('follows a progression where it changes', () => {
		const chords = [
			['C4', 'E4', 'G4'],
			['A3', 'C4', 'E4'],
			['F3', 'A3', 'C4'],
			['G3', 'B3', 'D4']
		];
		for (const wave of ['sine', 'saw'] as const) {
			const x = progression(chords, 1, SR, { wave, amplitude: 0.1 });
			const spans = chordHints(chromagram([x], SR), 0.5);
			expect(labels(spans), wave).toEqual(['C', 'Am', 'F', 'G']);
			spans.forEach((s, i) => {
				if (i > 0) expect(Math.abs(s.start - i)).toBeLessThanOrEqual(0.5);
			});
		}
	});

	it('smooths a lone segment and aligns segments to the beat', () => {
		const x = progression(
			[
				['C4', 'E4', 'G4'],
				['C4', 'E4', 'G4']
			],
			1,
			SR
		);
		const spans = chordHints(chromagram([x], SR), 0.5, 0.25);
		expect(labels(spans)).toEqual(['C']);
		expect(spans[0].start).toBe(0);
		expect(chordHints(chromagram([new Float32Array(10)], SR), 0.5)).toEqual([]);
		expect(nameChord(new Float64Array(12))).toEqual({ chord: 'N', score: 0 });
	});
});

describe('spelling', () => {
	it('writes sharps in sharp keys, flats in flat keys, the usual names in C and A minor', () => {
		expect(keySpelling(4, 'major')[8]).toBe('G#'); // E major
		expect(keySpelling(1, 'minor')[3]).toBe('D#'); // C# minor
		expect(keySpelling(5, 'minor')[1]).toBe('Db'); // F minor
		expect(keySpelling(3, 'major')[8]).toBe('Ab'); // Eb major
		expect(keySpelling(0, 'major')).toBe(PITCH_CLASSES);
		// A minor: the usual names, its raised seventh G# (not Ab); D minor's C#, G minor's F#
		expect(keySpelling(9, 'minor')).toEqual(PITCH_CLASSES.map((n) => (n === 'Ab' ? 'G#' : n)));
		expect(keySpelling(2, 'minor')[1]).toBe('C#');
		expect(keySpelling(7, 'minor')[6]).toBe('F#');
		// F# minor keeps F, not E#
		expect(keySpelling(6, 'minor')[5]).toBe('F');
	});

	it('respells the root of a chord and keeps its quality', () => {
		const fMinor = keySpelling(5, 'minor');
		expect(respellChord('C#', fMinor)).toBe('Db');
		expect(respellChord('G#m7', fMinor)).toBe('Abm7');
		// and the bass after a slash (Gm/A# read in G minor)
		expect(respellChord('Gm/A#', keySpelling(7, 'minor'))).toBe('Gm/Bb');
		expect(respellChord('C#/G#', fMinor)).toBe('Db/Ab');
		expect(respellChord('Fm', fMinor)).toBe('Fm');
		expect(respellChord('Ebsus4', keySpelling(4, 'major'))).toBe('D#sus4');
		expect(respellChord('N', fMinor)).toBe('N');
	});
});
