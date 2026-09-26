import { describe, expect, it } from 'vitest';
import {
	DEFAULT_OCTAVE_CONVENTION,
	frequencyToNote,
	intervalName,
	isBlackKey,
	noteName,
	noteOctave,
	noteToFrequency,
	parseNoteName,
	pitchClass
} from './notes';
import { MidiRangeError } from './validate';

describe('note names', () => {
	it('calls note 60 C4 by default and C3 under the older convention', () => {
		expect(DEFAULT_OCTAVE_CONVENTION).toBe('c4');
		expect(noteName(60)).toBe('C4');
		expect(noteName(60, { convention: 'c3' })).toBe('C3');
		expect(noteOctave(0)).toBe(-1);
		expect(noteOctave(0, 'c3')).toBe(-2);
	});

	it('spells sharps, flats and ASCII', () => {
		expect(noteName(61)).toBe('C♯4');
		expect(noteName(61, { flats: true })).toBe('D♭4');
		expect(noteName(61, { ascii: true })).toBe('C#4');
		expect(noteName(61, { ascii: true, flats: true })).toBe('Db4');
		expect(noteName(61, { octave: false })).toBe('C♯');
	});

	it('round-trips every note in both conventions and every spelling', () => {
		for (const convention of ['c3', 'c4'] as const) {
			for (const flats of [false, true]) {
				for (const ascii of [false, true]) {
					for (let n = 0; n <= 127; n++) {
						expect(parseNoteName(noteName(n, { convention, flats, ascii }), convention)).toBe(n);
					}
				}
			}
		}
	});

	it('refuses note numbers outside 0–127', () => {
		expect(() => noteName(128)).toThrow(MidiRangeError);
		expect(() => noteName(-1)).toThrow(MidiRangeError);
		expect(() => noteOctave(60.5)).toThrow(MidiRangeError);
	});

	it('parses loosely written names and rejects everything else', () => {
		expect(parseNoteName(' c#4 ')).toBe(61);
		expect(parseNoteName('F♯-1')).toBe(6);
		expect(parseNoteName('Eb4')).toBe(63);
		expect(parseNoteName('B♭3')).toBe(58);
		expect(parseNoteName('G9')).toBe(127);
		expect(parseNoteName('G#9')).toBeNull();
		expect(parseNoteName('Cb-1')).toBeNull();
		expect(parseNoteName('H4')).toBeNull();
		expect(parseNoteName('C')).toBeNull();
		expect(parseNoteName('')).toBeNull();
	});
});

describe('pitch classes', () => {
	it('works for negative numbers too', () => {
		expect(pitchClass(61)).toBe(1);
		expect(pitchClass(-1)).toBe(11);
		expect(isBlackKey(61)).toBe(true);
		expect(isBlackKey(60)).toBe(false);
	});
});

describe('frequencies', () => {
	it('puts A4 at 440 Hz and middle C where it belongs', () => {
		expect(noteToFrequency(69)).toBe(440);
		expect(noteToFrequency(60)).toBeCloseTo(261.626, 3);
		expect(noteToFrequency(69, 432)).toBe(432);
		expect(noteToFrequency(69.5)).toBeCloseTo(452.893, 3);
	});

	it('finds the nearest note and how far off it is', () => {
		expect(frequencyToNote(440)).toEqual({ note: 69, cents: 0 });
		expect(frequencyToNote(445)).toEqual({ note: 69, cents: 20 });
		expect(frequencyToNote(432, 432)).toEqual({ note: 69, cents: 0 });
	});

	it('refuses impossible frequencies', () => {
		expect(() => frequencyToNote(0)).toThrow(MidiRangeError);
		expect(() => frequencyToNote(-5)).toThrow(MidiRangeError);
		expect(() => noteToFrequency(60, 0)).toThrow(MidiRangeError);
		expect(() => noteToFrequency(Number.NaN)).toThrow(MidiRangeError);
	});
});

// Moved here from MIDI Lab's harmony.spec.ts, since intervalName lives in notes.ts.
describe('intervalName', () => {
	it('names the simple intervals', () => {
		expect(intervalName(0)).toBe('unison');
		expect(intervalName(4)).toBe('major 3rd');
		expect(intervalName(6)).toBe('tritone');
		expect(intervalName(7)).toBe('perfect 5th');
		expect(intervalName(11)).toBe('major 7th');
	});

	it('names compounds the way musicians say them', () => {
		expect(intervalName(12)).toBe('octave');
		expect(intervalName(14)).toBe('major 9th');
		expect(intervalName(21)).toBe('major 13th');
		expect(intervalName(24)).toBe('two octaves');
	});

	it('falls back to counting octaves past that', () => {
		expect(intervalName(36)).toBe('3 octaves');
		expect(intervalName(28)).toBe('2 octaves + major 3rd');
	});

	it('does not care about direction, and refuses nonsense', () => {
		expect(intervalName(-7)).toBe('perfect 5th');
		expect(() => intervalName(Number.POSITIVE_INFINITY)).toThrow(MidiRangeError);
	});
});
