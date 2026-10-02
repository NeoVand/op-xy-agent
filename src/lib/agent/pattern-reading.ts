/**
 * A pitched pattern as a musician reads it, for the agent to describe from (docs/AGENT-V2.md,
 * grounding): the key its notes suggest, each bar with the notes or chords on its steps, and the
 * chords where they change, spelled as the key does. A description written from this says what
 * the pattern plays, not what the agent meant it to play, and a chord that came out wrong (G7 where
 * it meant Gm7) shows by its name.
 */
import { estimateKey, keySpelling, respellChord } from '$lib/core/listen/harmony';
import { chordName } from '$lib/core/music/harmony';
import type { VirtualPattern } from './virtual-opxy';

/** What a pitched pattern plays. */
export interface PatternReading {
	/**
	 * The key the notes suggest with the parts that play alongside ("F minor"), marked "(a guess)"
	 * when two keys fit about as well.
	 */
	readonly key?: string;
	/**
	 * Each bar, four steps a group: a note ("F2"), a chord of three notes or more ("Dm7") or notes
	 * that make none ("C3+G3") where something starts, – while it still sounds, · for silence.
	 */
	readonly bars: readonly string[];
	/** The chords, each where it starts and with its notes: "step 17: G7 (G B D F)". */
	readonly chords?: readonly string[];
	/**
	 * The chords by their plain names and as degrees of the key, with the inversions apart: "C G Am
	 * F: I V vi IV in C major; G/B, Am/C, F/C are inversions, the same chords over another of their
	 * notes".
	 */
	readonly progression?: string;
}

const ascii = (name: string) => name.replace(/♯/g, '#').replace(/♭/g, 'b');

/** How readings group a bar: its steps, and each beat's (a 3/4 bar is three beats of four). */
export interface BarMeter {
	readonly bar: number;
	readonly beats: readonly number[];
}

/** A key as the writer means it: its spelling's tonic and mode (a mode spells as its parent). */
export interface MeantKey {
	readonly label: string;
	readonly pitchClass: number;
	readonly mode: 'major' | 'minor';
	/** The key's own tonic (D for D dorian, whose spelling is C major's). */
	readonly tonic: number;
}

/** Modes by name: the major or minor key they spell as, and how far below its tonic theirs is. */
const MODES: Readonly<Record<string, { mode: 'major' | 'minor'; down: number }>> = {
	major: { mode: 'major', down: 0 },
	ionian: { mode: 'major', down: 0 },
	minor: { mode: 'minor', down: 0 },
	aeolian: { mode: 'minor', down: 0 },
	dorian: { mode: 'major', down: 2 },
	phrygian: { mode: 'major', down: 4 },
	lydian: { mode: 'major', down: 5 },
	mixolydian: { mode: 'major', down: 7 },
	locrian: { mode: 'major', down: 11 }
};

/** "A minor", "F# major", "D dorian", "Bb" (major) as a key to spell in; null for anything else. */
export function parseKey(text: string): MeantKey | null {
	const m = /^\s*([A-Ga-g])([#b♯♭]?)\s*([a-z]*)\s*$/i.exec(text);
	if (!m) return null;
	const letter = m[1].toUpperCase();
	const natural = [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(letter)];
	const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
	const word = (m[3] || 'major').toLowerCase();
	const kind = MODES[word];
	if (!kind) return null;
	const tonic = (natural + accidental + 12) % 12;
	return {
		label: `${letter}${m[2] ? (accidental > 0 ? '#' : 'b') : ''} ${word}`,
		pitchClass: (tonic - kind.down + 12) % 12,
		mode: kind.mode,
		tonic
	};
}

/** Degrees as a major scale counts them, the pop convention: a minor key's VI reads ♭VI. */
const DEGREES = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

/** A chord as a degree of the key on `tonic`: "vi", "V7", "♭VII", "iiø7". */
export function numeral(root: number, suffix: string, tonic: number): string {
	const degree = DEGREES[(root - tonic + 12) % 12];
	const minor = /^m(?!aj)/.test(suffix) || suffix.includes('°');
	const rest = /^m7(♭|b)5$/.test(suffix)
		? 'ø7'
		: minor && suffix.startsWith('m')
			? suffix.slice(1)
			: suffix;
	return (minor ? degree.toLowerCase() : degree) + rest;
}

/** Four beats of four steps. */
export const FOUR_FOUR: BarMeter = { bar: 16, beats: [4, 4, 4, 4] };

/**
 * A pattern's steps that play (1…`length`) laid out bar by bar in `meter`: each beat's cells joined
 * by `cell`, the beats by `beat`. A waltz read in bars of sixteen once looked broken; and steps past
 * the length do not play, so they are not shown.
 */
export function meterBars(
	length: number,
	meter: BarMeter,
	mark: (step: number) => string,
	cell: string,
	beat: string
): string[] {
	const count = Math.max(1, Math.ceil(length / meter.bar));
	return Array.from({ length: count }, (_, b) => {
		let at = b * meter.bar;
		return meter.beats
			.map((size) => {
				const cells = Array.from({ length: size }, (_, i) => at + i + 1)
					.filter((step) => step <= length)
					.map(mark);
				at += size;
				return cells.join(cell);
			})
			.filter(Boolean)
			.join(beat);
	});
}

/**
 * The reading of a pitched pattern, or null for an empty one. The key counts the pitched parts that
 * play `alongside` it too (the scene's other tracks): a melody's first bars alone once read as E
 * minor in C major, chords of C and G as G major.
 */
export function readPattern(
	p: VirtualPattern,
	alongside: readonly VirtualPattern[] = [],
	meter: BarMeter = FOUR_FOUR,
	/** The key the writer means: spelled in, and named, instead of guessed. */
	meant: MeantKey | null = null
): PatternReading | null {
	if (p.notes.length === 0) return null;
	// the key from how long each pitch class sounds, in this part and those with it
	const chroma = new Array<number>(12).fill(0);
	const all = [p, ...alongside].flatMap((q) => q.notes);
	for (const n of all) chroma[n.note % 12] += Math.max(0.25, n.length);
	const found = meant
		? null
		: new Set(all.map((n) => n.note % 12)).size >= 3
			? estimateKey(chroma, { written: true })
			: null;
	const names = meant
		? keySpelling(meant.pitchClass, meant.mode)
		: found
			? keySpelling(found.pitchClass, found.mode)
			: keySpelling(0, 'major');
	const noteName = (note: number) => `${names[note % 12]}${Math.floor(note / 12) - 1}`;

	const slots = p.bars * 16;
	const starting = new Map<number, number[]>();
	const sounding = new Array<boolean>(slots + 1).fill(false);
	for (const n of p.notes) {
		starting.set(n.step, [...(starting.get(n.step) ?? []), n.note]);
		for (let s = n.step + 1; s < n.step + n.length && s <= slots; s++) sounding[s] = true;
	}
	const chords: string[] = [];
	// each chord where it changes, for the progression: its plain name, root and whether inverted
	const heard: { plain: string; name: string; root: number; suffix: string }[] = [];
	let lastChord = '';
	// the lowest note another part sounds under a step, below this one's: a bass the chord is over
	const under = (step: number, below: number): { note: number; track: number } | null => {
		let best: { note: number; track: number } | null = null;
		for (const q of alongside) {
			for (const n of q.notes) {
				if (n.step > step || n.step + Math.max(1, n.length) <= step || n.note >= below) continue;
				if (!best || n.note < best.note) best = { note: n.note, track: q.track };
			}
		}
		return best;
	};
	const slot = (step: number): string => {
		const notes = (starting.get(step) ?? []).sort((a, b) => a - b);
		if (notes.length === 0) return sounding[step] ? '–' : '·';
		if (notes.length === 1) return noteName(notes[0]);
		const tones = [...new Set(notes.map((n) => names[n % 12]))];
		// two notes are an interval, not a chord ("C5" would read as a note)
		const alone = tones.length >= 3 ? chordName(notes) : null;
		// named over the bass another track plays under it, as a musician hears it (a rootless Am9
		// over the bass's A once read as Cmaj7)
		const bass = tones.length >= 3 ? under(step, notes[0]) : null;
		const over = bass ? chordName([bass.note, ...notes]) : null;
		const chord = over ?? alone;
		if (!chord) {
			// three notes or more that make no chord this names: in the progression as their notes,
			// so it does not drop out unseen (an agent could not tell an A7♭9 was unnamed)
			const unnamed = `[${tones.join(' ')}]`;
			if (tones.length >= 3 && unnamed !== lastChord) {
				heard.push({ plain: unnamed, name: unnamed, root: -1, suffix: '' });
				lastChord = unnamed;
			}
			return notes.map(noteName).join('+');
		}
		// the root as the key spells it ("Db", not "C#", in F minor)
		const name = respellChord(ascii(chord.name), names);
		const with_ = over && bass ? ` over T${bass.track}'s ${names[bass.note % 12]}` : '';
		if (name !== lastChord) {
			chords.push(`step ${step}: ${name} (${tones.join(' ')}${with_})`);
			const plain = name.split('/')[0];
			heard.push({ plain, name, root: chord.root, suffix: plain.slice(names[chord.root].length) });
		}
		lastChord = name;
		return name;
	};
	const bars = meterBars(p.length, meter, (step) => slot(step), ' ', ' | ');
	// the progression as a musician names it: an agent once could not say "C G Am F" for chords
	// that read C, G/B, Am/C and F/C
	const tonic = meant ? meant.tonic : found?.pitchClass;
	const keyName = meant ? meant.label : found?.key;
	const inverted = heard.filter((h) => h.name !== h.plain).map((h) => h.name);
	const unnamed = heard.filter((h) => h.root < 0).map((h) => h.plain);
	const degree = (h: (typeof heard)[number]) =>
		h.root < 0 || tonic === undefined ? '?' : numeral(h.root, h.suffix, tonic);
	const progression =
		heard.length >= 2 && tonic !== undefined && keyName
			? `${heard.map((h) => h.plain).join(' ')}: ${heard.map(degree).join(' ')} in ${keyName}${inverted.length ? `; ${inverted.join(', ')} ${inverted.length === 1 ? 'is an inversion' : 'are inversions'}, the same chord${inverted.length === 1 ? '' : 's'} over another of ${inverted.length === 1 ? 'its' : 'their'} notes` : ''}${unnamed.length ? `; ${unnamed.join(', ')} ${unnamed.length === 1 ? 'is' : 'are'} no chord the reading names` : ''}`
			: null;
	return {
		...(meant
			? { key: `${meant.label} (as written)` }
			: found
				? { key: found.clear ? found.key : `${found.key} (a guess)` }
				: {}),
		bars,
		...(chords.length ? { chords } : {}),
		...(progression ? { progression } : {})
	};
}

/** At or over this velocity a hit reads as an accent, X. */
export const ACCENT_VELOCITY = 115;
/** At or under this, a soft hit, read as its digit. */
export const SOFT_VELOCITY = 75;

/**
 * A drum hit on the grid by how hard it is, by fixed lines: X an accent, x a hit, and a soft hit as
 * its loudness digit, 1–5 (velocity about 14 a digit), so a grid reads back as written (marked
 * against each other, a line of soft hats came back as x, and an agent thought they played at full
 * velocity; an o for every soft hit hid ghost notes made softer).
 */
export function hitMark(velocity: number): string {
	if (velocity >= ACCENT_VELOCITY) return 'X';
	if (velocity <= SOFT_VELOCITY) {
		return String(Math.min(5, Math.max(1, Math.round((velocity * 9) / 127))));
	}
	return 'x';
}
