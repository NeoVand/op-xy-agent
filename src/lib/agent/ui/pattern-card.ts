/**
 * What a pattern card in the chat draws and does (PatternCard.svelte): a pattern the agent wrote,
 * live on the replica, as a drum grid (a row per sound) or a small piano roll (a row per pitch),
 * sixteen steps a bar; a click adds or takes away a note, a drag sets how hard it plays. Pure: the
 * card keeps no pattern of its own, it reads and writes the replica's through a {@link PatternHost}.
 */
import { chordName } from '$lib/core/music/harmony';
import { noteName } from '$lib/core/midi/notes';
import type { VirtualNote, VirtualPattern } from '../virtual-opxy';

/** What a pattern card needs of the replica; the app implements it on its simulator. */
export interface PatternHost {
	/** The pattern as it stands now (read reactively), or null when there is none. */
	read(track: number, pattern: number): VirtualPattern | null;
	/** Whether the track plays drums (a sound per key) rather than pitches. */
	drums(track: number): boolean;
	/** Replaces the pattern's notes, keeping its bars, length and scale. */
	write(track: number, pattern: number, notes: readonly VirtualNote[]): void;
	/** The step under the playhead (1-based) while the track plays this pattern, else null. */
	playhead(track: number, pattern: number): number | null;
	/** Whether the replica plays at all (its transport runs; read reactively). */
	running(): boolean;
	/** Plays the pattern from its top: the track plays it, and the transport starts if it stood. */
	play(track: number, pattern: number): void;
	/** Stops the replica's transport. */
	stop(): void;
	/** Sounds notes on the track briefly (a hit, a chord), to hear them. */
	preview(track: number, notes: readonly number[]): void;
	/** Downloads the pattern as a MIDI file, when the app can. */
	download?(track: number, pattern: number): void;
}

/** A row of the grid: a drum sound or a pitch. */
export interface GridRow {
	readonly note: number;
	/** "kick 1", "C3". */
	readonly label: string;
}

/** The steps a card shows in one go: a bar. */
export const BAR = 16;
/** The most pitches a piano roll draws note by note; wider ones show only the pitches used. */
const MAX_ROLL = 16;
/** A new note's velocity. */
export const NEW_VELOCITY = 100;

const pitch = (note: number) => noteName(note, { ascii: true });

/**
 * The rows: every note the pattern holds, and those it held since the card first showed it (so a
 * row does not vanish under the pointer when its last hit is taken away), high to low. A drum row
 * is named for its sound; a piano roll fills in the pitches between, while they fit.
 */
export function gridRows(
	pattern: VirtualPattern,
	drums: boolean,
	seen: ReadonlyMap<number, string>
): GridRow[] {
	const names = new Map(seen);
	for (const n of pattern.notes) {
		if (!names.has(n.note)) names.set(n.note, drums ? (n.sound ?? pitch(n.note)) : '');
	}
	let notes = [...names.keys()];
	if (!drums && notes.length > 0) {
		const low = Math.min(...notes);
		const high = Math.max(...notes);
		if (high - low < MAX_ROLL) notes = Array.from({ length: high - low + 1 }, (_, i) => low + i);
	}
	return notes
		.sort((a, b) => b - a)
		.map((note) => ({
			note,
			label: drums ? names.get(note) || pitch(note) : pitch(note)
		}));
}

/** The note that sounds at `step` on `note`'s row (one starting there, or still held), if any. */
export function noteAt(
	notes: readonly VirtualNote[],
	step: number,
	note: number
): VirtualNote | null {
	return notes.find((n) => n.note === note && step >= n.step && step < n.step + n.length) ?? null;
}

/** The same note: where it starts and its pitch (a pattern holds one of each). */
const same = (a: VirtualNote, b: VirtualNote) => a.step === b.step && a.note === b.note;

/** A click on a cell: the note sounding there goes, else a new one starts there. */
export function toggleNote(
	notes: readonly VirtualNote[],
	step: number,
	note: number
): VirtualNote[] {
	const hit = noteAt(notes, step, note);
	if (hit) return notes.filter((n) => !same(n, hit));
	return [...notes, { step, note, velocity: NEW_VELOCITY, length: 1 }];
}

/** How hard a note plays, set by a drag. */
export function withVelocity(
	notes: readonly VirtualNote[],
	target: VirtualNote,
	velocity: number
): VirtualNote[] {
	const v = Math.max(1, Math.min(127, Math.round(velocity)));
	return notes.map((n) => (same(n, target) ? { ...n, velocity: v } : n));
}

/** The chords of a pitched pattern, where each starts (three pitch classes or more at a step). */
export function chordMarks(
	notes: readonly VirtualNote[]
): { step: number; name: string; notes: number[] }[] {
	const starting = new Map<number, number[]>();
	for (const n of notes) starting.set(n.step, [...(starting.get(n.step) ?? []), n.note]);
	const marks: { step: number; name: string; notes: number[] }[] = [];
	for (const [step, pitches] of [...starting].sort((a, b) => a[0] - b[0])) {
		const sorted = [...pitches].sort((a, b) => a - b);
		if (new Set(sorted.map((p) => p % 12)).size < 3) continue;
		const chord = chordName(sorted);
		if (chord)
			marks.push({ step, name: chord.name.replace(/♯/g, '#').replace(/♭/g, 'b'), notes: sorted });
	}
	return marks;
}
