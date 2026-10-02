/**
 * write_pattern's short ways to give notes, so a whole beat fits in a few words instead of an
 * object per note (an agent ran out of output writing seven patterns that way, and the last one
 * arrived without its notes):
 *
 * - a compact string, one note per word, `step:note[:length[:velocity]]`, a chord's notes joined
 *   by `+`: "1:A2:4 5:C3+E3+G3:2:70 9:E2::90" (a length left empty keeps its default);
 * - a grid, as read_pattern shows a drum track: a line per sound, one mark per step (x a hit, X an
 *   accent, o a soft hit, . or - a rest; spaces and | only space it out), keyed by the sound's
 *   name, a note name or a MIDI number: { "kick 1": "x... x... x... x..." }.
 *
 * Both come back as plain notes; note names stay names here (the tool spells them out with the
 * track's octave convention), and a grid's sound names are left for the tool to look up.
 */

import { chordFromSymbol } from '$lib/core/music/harmony';
import { voiceChords } from '$lib/core/music/voicing';

/** A note as written, before its name is read. */
export interface WrittenNote {
	readonly step: number;
	/** A MIDI note number, or a note name ("F#3"). */
	readonly note: number | string;
	readonly velocity?: number;
	readonly length?: number;
}

/** A grid line's hit: the line's key (a sound's name, a note name or a number) and its step. */
type Digit = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export interface GridHit {
	readonly key: string;
	readonly step: number;
	/** The mark: a hit, an accent, a soft hit, or a digit 1–9 for a velocity of its own. */
	readonly mark: 'x' | 'X' | 'o' | Digit;
}

/** Steps a pattern holds: four bars of 16. */
export const MAX_STEPS = 64;

/** Why notes could not be read, in words the model can act on. */
export class PatternNotesError extends Error {
	override name = 'PatternNotesError';
}

const NOTE_NUMBER = /^\d{1,3}$/;

/** A word's step, what it plays, and its length and velocity when given. */
function wordParts(
	word: string,
	form: string
): { step: number; token: string; length?: number; velocity?: number } {
	const parts = word.split(':');
	if (parts.length < 2 || parts.length > 4) {
		throw new PatternNotesError(`"${word}" is not ${form}`);
	}
	const [stepText, token, lengthText = '', velocityText = ''] = parts;
	const step = Number(stepText);
	if (!Number.isInteger(step) || step < 1 || step > MAX_STEPS) {
		throw new PatternNotesError(`"${word}": the step is 1–${MAX_STEPS}`);
	}
	const length = lengthText === '' ? undefined : Number(lengthText);
	if (length !== undefined && !(length >= 0.05 && length <= MAX_STEPS)) {
		throw new PatternNotesError(`"${word}": the length is 0.05–${MAX_STEPS} steps`);
	}
	const velocity = velocityText === '' ? undefined : Number(velocityText);
	if (velocity !== undefined && !(Number.isInteger(velocity) && velocity >= 1 && velocity <= 127)) {
		throw new PatternNotesError(`"${word}": the velocity is 1–127`);
	}
	return {
		step,
		token,
		...(length === undefined ? {} : { length }),
		...(velocity === undefined ? {} : { velocity })
	};
}

function noteOf(text: string, word: string): number | string {
	if (NOTE_NUMBER.test(text)) {
		const n = Number(text);
		if (n > 127) throw new PatternNotesError(`"${word}": note ${n} is past 127`);
		return n;
	}
	if (!/^[a-g][#♯b♭]?-?\d+$/i.test(text)) {
		throw new PatternNotesError(
			`"${word}": "${text}" is not a note (a MIDI number, 60 = middle C, or a name like C4, F#3, Bb2)`
		);
	}
	return text;
}

/** Reads a compact string: `step:note[:length[:velocity]]` words, chords joined by `+`. */
export function compactNotes(text: string): WrittenNote[] {
	const notes: WrittenNote[] = [];
	for (const word of text.split(/[\s,;]+/).filter(Boolean)) {
		const {
			step,
			token: chord,
			length,
			velocity
		} = wordParts(word, 'step:note[:length[:velocity]] (e.g. 1:C3, 5:C3+E3+G3:4:70)');
		const keys = chord.split('+');
		if (keys.some((k) => k === '')) throw new PatternNotesError(`"${word}": a note is missing`);
		for (const key of keys) {
			notes.push({
				step,
				note: noteOf(key, word),
				...(length === undefined ? {} : { length }),
				...(velocity === undefined ? {} : { velocity })
			});
		}
	}
	return notes;
}

/**
 * Reads chords by name, `step:symbol[:length[:velocity]]` words ("1:Am7 17:F/A 33:C:8"), voiced
 * near middle C, each moving as little as it can from the one before, a slash chord's bass below
 * (agents voicing chords by hand once wrote A D F under "Bbmaj7"). A chord with no length lasts
 * until the next one, the last to the end of its bar.
 */
export function compactChords(text: string, options: { root?: boolean } = {}): WrittenNote[] {
	const parsed = text
		.split(/[\s,;]+/)
		.filter(Boolean)
		.map((word) => {
			const part = wordParts(word, 'step:chord[:length[:velocity]] (e.g. 1:Am7, 17:F/A:16:70)');
			const chord = chordFromSymbol(part.token);
			if (!chord) {
				throw new PatternNotesError(
					`"${word}": "${part.token}" is not a chord name (e.g. C, Am7, F#m7b5, Bbmaj9, Gsus4, C/E)`
				);
			}
			return { ...part, chord };
		})
		.sort((a, b) => a.step - b.step);
	const voiced = voiceChords(
		parsed.map((p) => p.chord),
		options
	);
	return parsed.flatMap((p, i) => {
		const next = parsed.slice(i + 1).find((q) => q.step > p.step)?.step;
		const length = p.length ?? (next ?? Math.ceil(p.step / 16) * 16 + 1) - p.step;
		return voiced[i].map((note) => ({
			step: p.step,
			note,
			length,
			...(p.velocity === undefined ? {} : { velocity: p.velocity })
		}));
	});
}

/** The chord names a chords text gives, by step, as written ("Em7" on step 17), for the reading. */
export function chordSymbols(text: string): Map<number, string> {
	const out = new Map<number, string>();
	for (const word of text.split(/[\s,;]+/).filter(Boolean)) {
		try {
			const part = wordParts(word, 'step:chord');
			if (chordFromSymbol(part.token)) out.set(part.step, part.token);
		} catch {
			// compactChords says what is wrong with it
		}
	}
	return out;
}

/** Reads a grid: each line's marks, one per step; returns the hits and how many steps it spans. */
/**
 * Where a grid line's count goes wrong, by its own spacing: a bar (between |) that is not 16 steps,
 * or a group (between spaces) unlike most ("bar 3 has 17", or 'group 14 ("x....") has 5, the
 * others 4'); null when its spacing does not say. An agent once learned only that a 64-step line
 * had one mark too many, somewhere.
 */
export function gridMiscount(line: string, barSteps = 16): string | null {
	const bars = line
		.split('|')
		.map((b) => b.replace(/\s/g, ''))
		.filter((b) => b.length > 0);
	if (bars.length > 1) {
		const off = bars.flatMap((b, i) =>
			b.length !== barSteps ? [`bar ${i + 1} has ${b.length}`] : []
		);
		if (off.length > 0) return off.join(', ');
	}
	const groups = line
		.replace(/\|/g, ' ')
		.split(/\s+/)
		.filter((g) => g.length > 0);
	if (groups.length < 3) return null;
	const counts = new Map<number, number>();
	for (const g of groups) counts.set(g.length, (counts.get(g.length) ?? 0) + 1);
	const usual = [...counts].sort((a, b) => b[1] - a[1])[0][0];
	const off = groups.flatMap((g, i) =>
		g.length !== usual ? [`group ${i + 1} ("${g}") has ${g.length}`] : []
	);
	if (off.length === 0 || off.length > 3) return null;
	return `${off.join(', ')}, the others ${usual}`;
}

export function gridHits(grid: Readonly<Record<string, string>>): {
	hits: GridHit[];
	steps: number;
} {
	const hits: GridHit[] = [];
	let steps = 0;
	for (const [key, line] of Object.entries(grid)) {
		const marks = line.replace(/[\s|]/g, '');
		if (marks.length > MAX_STEPS) {
			const where = gridMiscount(line);
			throw new PatternNotesError(
				`grid "${key}": ${marks.length} steps, past the ${MAX_STEPS} a pattern holds${where ? ` (${where})` : ''}`
			);
		}
		const bad = marks.match(/[^xXo1-9.-]/);
		if (bad) {
			throw new PatternNotesError(
				`grid "${key}": "${bad[0]}" is not a mark (x a hit, X an accent, o a soft hit, 1–9 a hit that loud, . a rest)`
			);
		}
		steps = Math.max(steps, marks.length);
		[...marks].forEach((mark, i) => {
			if (mark !== '.' && mark !== '-')
				hits.push({ key, step: i + 1, mark: mark as GridHit['mark'] });
		});
	}
	return { hits, steps };
}

/**
 * A mark's velocity around `velocity` (the pattern's hit): an accent above it, a soft hit about
 * half, each where read_pattern reads it back as the same mark (X from 115, o up to 75).
 */
export function markVelocity(mark: GridHit['mark'], velocity: number): number {
	// a digit is a velocity outright: 1 soft (14) … 9 full (127), a ghost note at 3 or 4
	if (/^[1-9]$/.test(mark)) return Math.round((Number(mark) * 127) / 9);
	if (mark === 'X') return Math.min(127, Math.max(velocity + 25, 115));
	if (mark === 'o') return Math.max(1, Math.min(Math.round(velocity * 0.55), 75));
	return velocity;
}
