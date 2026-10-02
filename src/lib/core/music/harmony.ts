// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/harmony.ts

/**
 * Naming what you just played.
 *
 * MIDI has no idea what a chord is — it sends three independent Note On
 * messages and the meaning is entirely in your head. Putting the name back on
 * screen is the single fastest way to connect "these three numbers" to "this
 * is an F sharp minor seventh", which is the translation this whole app
 * exists to teach.
 *
 * Everything here works from pitch classes and semitone distances, never from
 * spelling: the protocol does not know whether 61 is a C sharp or a D flat,
 * and neither does this.
 */

import { DEFAULT_OCTAVE_CONVENTION, pitchClass, type OctaveConvention } from '../midi/notes';
import { assertIntInRange } from '../midi/validate';

const NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** A chord shape, as semitones above its root. Order matters only for reading. */
interface Formula {
	/** Sorted, unique, all under 12. */
	pcs: number[];
	/**
	 * The letter each tone is written on, counted in steps above the root's
	 * letter — so a minor third is two letters up and spelled flat, while an
	 * augmented second is one letter up and spelled sharp, even though both
	 * are three semitones. This is what makes a C minor seventh read as
	 * E flat and B flat instead of D sharp and A sharp.
	 */
	degrees: number[];
	/** What goes after the root name. */
	suffix: string;
	/** Said out loud, for the line under the name. */
	spoken: string;
}

/*
 * Ordered most-specific first so a four-note match is never shadowed by a
 * three-note subset. Within a size the order is how often the shape turns up.
 */
const FORMULAS: Formula[] = [
	{ pcs: [0, 4, 7, 11], degrees: [0, 2, 4, 6], suffix: 'maj7', spoken: 'major seventh' },
	{ pcs: [0, 4, 7, 10], degrees: [0, 2, 4, 6], suffix: '7', spoken: 'dominant seventh' },
	{ pcs: [0, 3, 7, 10], degrees: [0, 2, 4, 6], suffix: 'm7', spoken: 'minor seventh' },
	{ pcs: [0, 3, 7, 11], degrees: [0, 2, 4, 6], suffix: 'm(maj7)', spoken: 'minor major seventh' },
	{ pcs: [0, 3, 6, 10], degrees: [0, 2, 4, 6], suffix: 'm7♭5', spoken: 'half diminished' },
	{ pcs: [0, 3, 6, 9], degrees: [0, 2, 4, 6], suffix: '°7', spoken: 'diminished seventh' },
	{ pcs: [0, 4, 7, 9], degrees: [0, 2, 4, 5], suffix: '6', spoken: 'major sixth' },
	{ pcs: [0, 3, 7, 9], degrees: [0, 2, 4, 5], suffix: 'm6', spoken: 'minor sixth' },
	{
		pcs: [0, 5, 7, 10],
		degrees: [0, 3, 4, 6],
		suffix: '7sus4',
		spoken: 'seventh suspended fourth'
	},
	{ pcs: [0, 4, 8, 10], degrees: [0, 2, 4, 6], suffix: '7♯5', spoken: 'seventh sharp five' },
	{ pcs: [0, 4, 6, 10], degrees: [0, 2, 4, 6], suffix: '7♭5', spoken: 'seventh flat five' },
	{ pcs: [0, 2, 4, 7], degrees: [0, 1, 2, 4], suffix: 'add9', spoken: 'major added ninth' },
	{ pcs: [0, 2, 3, 7], degrees: [0, 1, 2, 4], suffix: 'm(add9)', spoken: 'minor added ninth' },
	{ pcs: [0, 2, 4, 7, 10], degrees: [0, 1, 2, 4, 6], suffix: '9', spoken: 'dominant ninth' },
	{ pcs: [0, 2, 3, 7, 10], degrees: [0, 1, 2, 4, 6], suffix: 'm9', spoken: 'minor ninth' },
	{ pcs: [0, 2, 4, 7, 11], degrees: [0, 1, 2, 4, 6], suffix: 'maj9', spoken: 'major ninth' },
	{ pcs: [0, 1, 4, 7, 10], degrees: [0, 1, 2, 4, 6], suffix: '7♭9', spoken: 'seventh flat nine' },
	{ pcs: [0, 3, 4, 7, 10], degrees: [0, 1, 2, 4, 6], suffix: '7♯9', spoken: 'seventh sharp nine' },
	{ pcs: [0, 4, 7, 9, 10], degrees: [0, 2, 4, 5, 6], suffix: '13', spoken: 'thirteenth' },
	{
		pcs: [0, 4, 6, 7, 11],
		degrees: [0, 2, 3, 4, 6],
		suffix: 'maj7♯11',
		spoken: 'major seventh sharp eleven'
	},
	{ pcs: [0, 2, 4, 7, 9], degrees: [0, 1, 2, 4, 5], suffix: '6/9', spoken: 'six nine' },
	{
		pcs: [0, 2, 5, 7, 10],
		degrees: [0, 1, 3, 4, 6],
		suffix: '9sus4',
		spoken: 'ninth suspended fourth'
	},
	{
		pcs: [0, 3, 5, 7, 10],
		degrees: [0, 2, 3, 4, 6],
		suffix: 'm7(add11)',
		spoken: 'minor seventh added eleventh'
	},
	{
		pcs: [0, 2, 3, 5, 7, 10],
		degrees: [0, 1, 2, 3, 4, 6],
		suffix: 'm11',
		spoken: 'minor eleventh'
	},
	{ pcs: [0, 4, 7], degrees: [0, 2, 4], suffix: '', spoken: 'major' },
	{ pcs: [0, 3, 7], degrees: [0, 2, 4], suffix: 'm', spoken: 'minor' },
	{ pcs: [0, 3, 6], degrees: [0, 2, 4], suffix: '°', spoken: 'diminished' },
	{ pcs: [0, 4, 8], degrees: [0, 2, 4], suffix: '+', spoken: 'augmented' },
	{ pcs: [0, 5, 7], degrees: [0, 3, 4], suffix: 'sus4', spoken: 'suspended fourth' },
	{ pcs: [0, 2, 7], degrees: [0, 1, 4], suffix: 'sus2', spoken: 'suspended second' },
	{
		pcs: [0, 7],
		degrees: [0, 4],
		suffix: '5',
		spoken: 'fifth — no third, so neither major nor minor'
	}
];

/** Where each chord tone was found, so the notation can spell it right. */
interface Shape {
	root: number;
	formula: Formula;
}

/** A named chord. */
export interface Chord {
	/** "F♯m7", or "C/E" when something other than the root is in the bass. */
	name: string;
	/** "minor seventh", for the line that explains the symbol. */
	spoken: string;
	root: number;
	/** 0 for root position, 1 for first inversion, and so on. */
	inversion: number;
}

function assertNotes(notes: readonly number[]): void {
	notes.forEach((n, i) => assertIntInRange(n, 0, 127, `notes[${i}]`));
}

/** Callers compare equal-length sorted arrays (`match` checks the length first). */
function sameSet(a: number[], b: number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/**
 * Name a set of sounding notes, or return null when it is not a chord this
 * knows — which is honest, and better than forcing every cluster into a
 * symbol nobody would write.
 */
export function chordName(notes: readonly number[], flats = false): Chord | null {
	assertNotes(notes);
	if (notes.length < 2) return null;
	const sorted = [...notes].sort((a, b) => a - b);
	const bass = pitchClass(sorted[0]);
	const pcs = [...new Set(sorted.map(pitchClass))].sort((a, b) => a - b);
	if (pcs.length < 2) return null;

	const names = flats ? NAMES_FLAT : NAMES_SHARP;

	const found = match(pcs, bass);
	if (!found) return null;

	const { root, formula } = found;
	// Which chord tone is in the bass — 0 is root position.
	const inversion = formula.pcs.indexOf((bass - root + 12) % 12);
	const base = names[root] + formula.suffix;
	return {
		name: inversion > 0 ? `${base}/${names[bass]}` : base,
		spoken: formula.spoken,
		root,
		inversion: Math.max(0, inversion)
	};
}

/**
 * The first formula whose shape these pitch classes make, and on which root: on the bass when one
 * fits there, as a musician names it (C E G A over C is C6, not Am7/C; C D G over C is Csus2),
 * else the first that fits (an inversion: G/B).
 */
function match(pcs: number[], bass: number): Shape | null {
	for (const formula of FORMULAS) {
		if (formula.pcs.length !== pcs.length) continue;
		const shape = pcs.map((p) => (p - bass + 12) % 12).sort((a, b) => a - b);
		if (sameSet(shape, formula.pcs)) return { root: bass, formula };
	}
	for (const formula of FORMULAS) {
		if (formula.pcs.length !== pcs.length) continue;
		for (const root of pcs) {
			const shape = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
			if (sameSet(shape, formula.pcs)) return { root, formula };
		}
	}
	return null;
}

/*
 * Spelling.
 *
 * A pitch class does not know its own name. Three semitones above C is E flat
 * in a C minor chord and D sharp in a B major one, and the difference is not
 * cosmetic — it is which line of the staff the notehead sits on. So a note is
 * spelled from the chord it is part of: find the chord, take the letter each
 * tone is written on, and let the accidental fall out of the arithmetic.
 *
 * With no chord to go on there is nothing to reason from, and the caller's
 * sharps-or-flats preference is as good an answer as exists.
 */

/** Semitones above C for each letter, C through B. */
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/**
 * Which letter each pitch class is normally written on when it is a chord
 * root: C, C sharp, D, E flat, E, F, F sharp, G, A flat, A, B flat, B — the
 * spellings a chart is written in. The accidental follows from the letter.
 */
const ROOT_LETTER = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** How one note is written: its letter, accidental and the octave of the letter. */
export interface Spelling {
	note: number;
	/** 0 = C through 6 = B. */
	letter: number;
	/** Semitones away from the natural: -1 flat, 0 natural, 1 sharp. */
	alter: number;
	/** The octave the *letter* lands in, which is not always the note's. */
	octave: number;
}

function place(note: number, letter: number, alter: number): Spelling {
	// B sharp and C flat cross an octave boundary; solving for the octave
	// rather than dividing the note number is what gets those right.
	const octave = (note - alter - NATURAL[letter]) / 12 - 1;
	return { note, letter, alter, octave };
}

/**
 * Spell a set of sounding notes. When they make a chord this knows, every
 * note is spelled from that chord's root; otherwise each note falls back to
 * the caller's preference.
 */
export function spellNotes(notes: readonly number[], flats = false): Spelling[] {
	assertNotes(notes);
	const sorted = [...notes].sort((a, b) => a - b);
	const pcs = [...new Set(sorted.map(pitchClass))].sort((a, b) => a - b);
	const found = pcs.length >= 2 ? match(pcs, pitchClass(sorted[0])) : null;

	if (!found) {
		const step = flats
			? [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
			: [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
		const alt = flats
			? [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0]
			: [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
		return sorted.map((n) => place(n, step[pitchClass(n)], alt[pitchClass(n)]));
	}

	const { root, formula } = found;
	const rootLetter = ROOT_LETTER[root];
	return sorted.map((n) => {
		const interval = (pitchClass(n) - root + 12) % 12;
		const i = formula.pcs.indexOf(interval);
		const letter = (rootLetter + formula.degrees[i]) % 7;
		// The accidental is whatever it takes to get from that letter's natural
		// pitch to the note actually sounding, centred so it comes out as a flat
		// rather than eleven sharps.
		const alter = ((((pitchClass(n) - NATURAL[letter] + 6) % 12) + 12) % 12) - 6;
		return place(n, letter, alter);
	});
}

/**
 * The spelled name, for anywhere text sits beside the notation. Reading
 * "D♯3" under a staff that says E flat is the kind of contradiction that
 * makes a reader stop trusting both.
 *
 * `Spelling.octave` is scientific — middle C is C4 — and this converts to
 * whichever convention the app is set to, the same way `noteName` does.
 */
export function spellingName(
	s: Spelling,
	convention: OctaveConvention = DEFAULT_OCTAVE_CONVENTION
): string {
	const acc = s.alter === 0 ? '' : s.alter > 0 ? '♯'.repeat(s.alter) : '♭'.repeat(-s.alter);
	return `${LETTERS[s.letter].toUpperCase()}${acc}${s.octave - (convention === 'c3' ? 1 : 0)}`;
}

/** VexFlow's key spelling: "eb/4" plus a separate "b" accidental modifier. */
export function vexKey(s: Spelling): { key: string; acc: string } {
	const acc = s.alter === 0 ? '' : s.alter > 0 ? '#'.repeat(s.alter) : 'b'.repeat(-s.alter);
	return { key: `${LETTERS[s.letter]}${acc}/${s.octave}`, acc };
}

/** The name of a pitch class, in the requested spelling. */
export function pitchClassName(pc: number, flats = false): string {
	return (flats ? NAMES_FLAT : NAMES_SHARP)[pitchClass(pc)];
}

/*
 * Symbols.
 *
 * The other way round: "Am7", "F#m7b5", "C/E", "Bbmaj9" as a root, its tones above it and a bass
 * of its own, so a progression can be written by name and voiced by code (agents voicing chords
 * by hand once wrote A D F under "Bbmaj7").
 */

/** Ways a suffix is written, as the formula's own suffix (ASCII ♭ ♯ ° spellings and aliases). */
const SUFFIX_ALIASES: Readonly<Record<string, string>> = {
	'': '',
	maj: '',
	M: '',
	major: '',
	m: 'm',
	min: 'm',
	minor: 'm',
	'-': 'm',
	dim: '°',
	o: '°',
	aug: '+',
	'#5': '+',
	sus: 'sus4',
	M7: 'maj7',
	ma7: 'maj7',
	maj7: 'maj7',
	Δ: 'maj7',
	Δ7: 'maj7',
	min7: 'm7',
	'-7': 'm7',
	mM7: 'm(maj7)',
	mmaj7: 'm(maj7)',
	'm(maj7)': 'm(maj7)',
	m7b5: 'm7♭5',
	ø: 'm7♭5',
	ø7: 'm7♭5',
	dim7: '°7',
	o7: '°7',
	'7#5': '7♯5',
	'7+5': '7♯5',
	aug7: '7♯5',
	'+7': '7♯5',
	'7b5': '7♭5',
	add2: 'add9',
	madd9: 'm(add9)',
	'm(add9)': 'm(add9)',
	'7b9': '7♭9',
	'7#9': '7♯9',
	maj7b5: 'maj7♭5',
	'maj7#11': 'maj7♯11',
	M9: 'maj9',
	'm7(add11)': 'm7(add11)',
	m7add11: 'm7(add11)',
	'69': '6/9',
	'6/9': '6/9',
	'6add9': '6/9'
};

const ascii = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/°/g, 'dim');

/** A chord written by name: its root, its tones as semitones above it, and a bass of its own. */
export interface ChordSymbol {
	/** Pitch class 0–11. */
	readonly root: number;
	/** Semitones above the root, sorted, the root's 0 first. */
	readonly tones: readonly number[];
	/** A slash chord's bass pitch class ("C/E": 4), or null. */
	readonly bass: number | null;
}

const LETTER_PITCH: Readonly<Record<string, number>> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
};

function pitchOfName(letter: string, accidental: string): number {
	const shift =
		accidental === '#' || accidental === '♯'
			? 1
			: accidental === 'b' || accidental === '♭'
				? -1
				: 0;
	return (LETTER_PITCH[letter.toUpperCase()] + shift + 12) % 12;
}

/** "Am7", "F#m7b5", "C/E", "Bbmaj9", "Gsus4" as a chord, or null for anything else. */
export function chordFromSymbol(symbol: string): ChordSymbol | null {
	const m = /^([A-Ga-g])([#♯b♭]?)(.*?)(?:\/([A-Ga-g])([#♯b♭]?))?$/.exec(symbol.trim());
	if (!m) return null;
	const raw = m[3];
	// the formula a suffix names: as written, by an alias, or by its ASCII spelling
	const wanted = SUFFIX_ALIASES[raw] ?? raw;
	const formula =
		FORMULAS.find((f) => f.suffix === wanted) ??
		FORMULAS.find((f) => ascii(f.suffix) === ascii(wanted)) ??
		FORMULAS.find(
			(f) => ascii(f.suffix).toLowerCase() === ascii(wanted).toLowerCase() && wanted !== 'M'
		);
	if (!formula) return null;
	return {
		root: pitchOfName(m[1], m[2]),
		tones: [...formula.pcs],
		bass: m[4] ? pitchOfName(m[4], m[5]) : null
	};
}
