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
	/** The key the notes suggest ("F minor"), marked "(a guess)" when two keys fit about as well. */
	readonly key?: string;
	/**
	 * Each bar, four steps a group: a note ("F2"), a chord of three notes or more ("Dm7") or notes
	 * that make none ("C3+G3") where something starts, – while it still sounds, · for silence.
	 */
	readonly bars: readonly string[];
	/** The chords, each where it starts and with its notes: "step 17: G7 (G B D F)". */
	readonly chords?: readonly string[];
}

const ascii = (name: string) => name.replace(/♯/g, '#').replace(/♭/g, 'b');

/** The reading of a pitched pattern, or null for an empty one. */
export function readPattern(p: VirtualPattern): PatternReading | null {
	if (p.notes.length === 0) return null;
	// the key from how long each pitch class sounds
	const chroma = new Array<number>(12).fill(0);
	for (const n of p.notes) chroma[n.note % 12] += Math.max(0.25, n.length);
	const found = new Set(p.notes.map((n) => n.note % 12)).size >= 3 ? estimateKey(chroma) : null;
	const names = found ? keySpelling(found.pitchClass, found.mode) : keySpelling(0, 'major');
	const noteName = (note: number) => `${names[note % 12]}${Math.floor(note / 12) - 1}`;

	const slots = p.bars * 16;
	const starting = new Map<number, number[]>();
	const sounding = new Array<boolean>(slots + 1).fill(false);
	for (const n of p.notes) {
		starting.set(n.step, [...(starting.get(n.step) ?? []), n.note]);
		for (let s = n.step + 1; s < n.step + n.length && s <= slots; s++) sounding[s] = true;
	}
	const chords: string[] = [];
	let lastChord = '';
	const slot = (step: number): string => {
		const notes = (starting.get(step) ?? []).sort((a, b) => a - b);
		if (notes.length === 0) return sounding[step] ? '–' : '·';
		if (notes.length === 1) return noteName(notes[0]);
		const tones = [...new Set(notes.map((n) => names[n % 12]))];
		// two notes are an interval, not a chord ("C5" would read as a note)
		const chord = tones.length >= 3 ? chordName(notes) : null;
		if (!chord) return notes.map(noteName).join('+');
		// the root as the key spells it ("Db", not "C#", in F minor)
		const name = respellChord(ascii(chord.name), names);
		if (name !== lastChord) chords.push(`step ${step}: ${name} (${tones.join(' ')})`);
		lastChord = name;
		return name;
	};
	const bars = Array.from({ length: p.bars }, (_, bar) =>
		Array.from({ length: 4 }, (_, beat) =>
			Array.from({ length: 4 }, (_, i) => slot(bar * 16 + beat * 4 + i + 1)).join(' ')
		).join(' | ')
	);
	return {
		...(found ? { key: found.clear ? found.key : `${found.key} (a guess)` } : {}),
		bars,
		...(chords.length ? { chords } : {})
	};
}

/**
 * A drum hit on the grid by how hard it is next to the sound's other hits: X accented, o soft,
 * x the rest, and x for all when they are about as loud.
 */
export function hitMark(velocity: number, low: number, high: number): string {
	if (high - low < 15) return 'x';
	const third = (high - low) / 3;
	if (velocity >= high - third) return 'X';
	if (velocity <= low + third) return 'o';
	return 'x';
}
