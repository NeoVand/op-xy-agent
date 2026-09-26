// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/notes.ts

/**
 * Note numbers, names and frequencies.
 *
 * MIDI addresses pitch as a plain integer 0–127, and middle C is always note 60. What is ambiguous
 * is the label: Yamaha and Roland historically call note 60 "C3", while scientific pitch notation
 * (and Ableton, Logic, Steinberg) call it "C4". Nothing on the wire changes, only the sticker on
 * the key, so both conventions stay available.
 *
 * The default here is `c4`. Teenage Engineering's current factory content names note 60 `c4`, while
 * device-made files from 2024 used `c3` (docs/research/30-presets-samples.md). The OP-XY screen's
 * own label on OS 1.1.33 is not yet confirmed. Components should exchange note numbers, never
 * names.
 */

import { assertIntInRange, MidiRangeError } from './validate';

/** Pitch-class names with typographic sharps. */
export const NOTE_NAMES_SHARP = [
	'C',
	'C♯',
	'D',
	'D♯',
	'E',
	'F',
	'F♯',
	'G',
	'G♯',
	'A',
	'A♯',
	'B'
] as const;

/** Pitch-class names with typographic flats. */
export const NOTE_NAMES_FLAT = [
	'C',
	'D♭',
	'D',
	'E♭',
	'E',
	'F',
	'G♭',
	'G',
	'A♭',
	'A',
	'B♭',
	'B'
] as const;

/** Pitch-class names with ASCII sharps (`#`). */
export const NOTE_NAMES_ASCII = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B'
] as const;

/** Pitch-class names with ASCII flats (`b`). */
export const NOTE_NAMES_FLAT_ASCII = [
	'C',
	'Db',
	'D',
	'Eb',
	'E',
	'F',
	'Gb',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
] as const;

/** Which label note 60 gets. `c4` is scientific pitch notation. */
export type OctaveConvention = 'c3' | 'c4';

/** The label convention used when a caller does not choose one (see the module comment). */
export const DEFAULT_OCTAVE_CONVENTION: OctaveConvention = 'c4';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** Middle C. Always note 60, whatever it is called. */
export const MIDDLE_C = 60;
/** The A above middle C, the usual 440 Hz tuning reference. */
export const A440 = 69;

/** Pitch class 0–11 (C = 0) of any integer note number, negative ones included. */
export function pitchClass(note: number): number {
	return ((note % 12) + 12) % 12;
}

/** True for the pitch classes on the black keys of a piano. */
export function isBlackKey(note: number): boolean {
	return BLACK_KEYS.has(pitchClass(note));
}

/** Octave number of a MIDI note (0–127) under the given labelling convention. */
export function noteOctave(
	note: number,
	convention: OctaveConvention = DEFAULT_OCTAVE_CONVENTION
): number {
	assertIntInRange(note, 0, 127, 'note');
	return Math.floor(note / 12) - (convention === 'c3' ? 2 : 1);
}

/** Options for `noteName`. */
export interface NoteNameOptions {
	flats?: boolean;
	/** Use `#`/`b` instead of the typographic ♯/♭. */
	ascii?: boolean;
	convention?: OctaveConvention;
	/** Append the octave number (default true). */
	octave?: boolean;
}

/** Name a MIDI note (0–127), e.g. `C♯4`, `Db3` or just `E`. */
export function noteName(note: number, opts: NoteNameOptions = {}): string {
	const {
		flats = false,
		ascii = false,
		convention = DEFAULT_OCTAVE_CONVENTION,
		octave = true
	} = opts;
	assertIntInRange(note, 0, 127, 'note');
	const table = ascii
		? flats
			? NOTE_NAMES_FLAT_ASCII
			: NOTE_NAMES_ASCII
		: flats
			? NOTE_NAMES_FLAT
			: NOTE_NAMES_SHARP;
	const name = table[pitchClass(note)];
	return octave ? `${name}${noteOctave(note, convention)}` : name;
}

/** Equal-tempered frequency in Hz. Fractional notes are fine; `a4` retunes the reference pitch. */
export function noteToFrequency(note: number, a4 = 440): number {
	assertFinite(note, 'note');
	assertPositive(a4, 'a4');
	return a4 * Math.pow(2, (note - A440) / 12);
}

/** Nearest note number to a frequency, plus how many cents sharp (+) or flat (−) it is. */
export function frequencyToNote(hz: number, a4 = 440): { note: number; cents: number } {
	assertPositive(hz, 'hz');
	assertPositive(a4, 'a4');
	const exact = A440 + 12 * Math.log2(hz / a4);
	const note = Math.round(exact);
	return { note, cents: Math.round((exact - note) * 100) };
}

function assertPositive(value: number, field: string): void {
	if (!(Number.isFinite(value) && value > 0)) {
		throw new MidiRangeError(field, value, 'a positive, finite frequency in Hz');
	}
}

function assertFinite(value: number, field: string): void {
	if (!Number.isFinite(value)) throw new MidiRangeError(field, value, 'a finite number');
}

const NAME_RE = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/;
const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * Parse `C#3`, `Eb4` or `F♯-1` back to a note number. Returns null for anything unparseable or
 * outside 0–127, so callers decide how loudly to fail.
 */
export function parseNoteName(
	input: string,
	convention: OctaveConvention = DEFAULT_OCTAVE_CONVENTION
): number | null {
	const m = NAME_RE.exec(input.trim());
	if (!m) return null;
	const pc = LETTER_PC[m[1].toLowerCase()];
	const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === '' ? 0 : -1;
	const base = convention === 'c3' ? 2 : 1;
	const note = (Number(m[3]) + base) * 12 + pc + accidental;
	return note >= 0 && note <= 127 ? note : null;
}

/** Interval names for 0–12 semitones. */
export const INTERVAL_NAMES = [
	'unison',
	'minor 2nd',
	'major 2nd',
	'minor 3rd',
	'major 3rd',
	'perfect 4th',
	'tritone',
	'perfect 5th',
	'minor 6th',
	'major 6th',
	'minor 7th',
	'major 7th',
	'octave'
] as const;

/**
 * Distances above an octave keep the compound names musicians actually use (a ninth is a ninth, not
 * "a second plus an octave") and fall back to counting octaves where those names run out.
 */
const COMPOUND_INTERVALS: Record<number, string> = {
	13: 'minor 9th',
	14: 'major 9th',
	15: 'minor 10th',
	16: 'major 10th',
	17: 'perfect 11th',
	18: 'tritone + octave',
	19: 'perfect 12th',
	20: 'minor 13th',
	21: 'major 13th',
	22: 'minor 14th',
	23: 'major 14th',
	24: 'two octaves'
};

/** The name of an interval of `semitones`, in either direction. */
export function intervalName(semitones: number): string {
	assertFinite(semitones, 'semitones');
	const a = Math.abs(Math.round(semitones));
	if (a <= 12) return INTERVAL_NAMES[a];
	if (COMPOUND_INTERVALS[a]) return COMPOUND_INTERVALS[a];
	const octaves = Math.floor(a / 12);
	const rest = a % 12;
	return rest === 0 ? `${octaves} octaves` : `${octaves} octaves + ${INTERVAL_NAMES[rest]}`;
}
