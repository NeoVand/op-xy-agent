/**
 * What a pattern's notes became, in the words a musician uses: "5 notes, up 2 semitones", "14
 * notes, 8 velocities 100 → 72–108", "5 → 7 notes (2 added)". The replica's diffs name a change by
 * its kind, so an answer that says "transposed to E minor" can be checked against one that did.
 */
import type { Pattern } from './sequencer';

interface Placed {
	readonly step: number;
	readonly note: number;
	readonly velocity: number;
	readonly length: number;
	readonly offset: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A pattern's notes in order: by step, then by pitch. */
function placed(pattern: Pattern | undefined): Placed[] {
	if (!pattern) return [];
	return pattern.steps.flatMap((s, i) =>
		[...s.notes]
			.sort((a, b) => a.note - b.note)
			.map((n) => ({
				step: i + 1,
				note: n.note,
				velocity: n.velocity,
				length: n.length,
				offset: n.offset
			}))
	);
}

const where = (n: Placed) => `${n.step}:${n.note}`;

/** How many of `a` have no partner in `b`, matching equal keys one to one. */
function unmatched(a: readonly string[], b: readonly string[]): number {
	const left = new Map<string, number>();
	for (const key of b) left.set(key, (left.get(key) ?? 0) + 1);
	let missing = 0;
	for (const key of a) {
		const n = left.get(key) ?? 0;
		if (n > 0) left.set(key, n - 1);
		else missing++;
	}
	return missing;
}

/** The steps of `a`'s notes with no partner in `b`, in order and once each. */
function unmatchedSteps(a: readonly Placed[], b: readonly Placed[]): number[] {
	const left = new Map<string, number>();
	for (const n of b) left.set(where(n), (left.get(where(n)) ?? 0) + 1);
	const steps = new Set<number>();
	for (const n of a) {
		const k = left.get(where(n)) ?? 0;
		if (k > 0) left.set(where(n), k - 1);
		else steps.add(n.step);
	}
	return [...steps].sort((p, q) => p - q);
}

/**
 * "added on step 3", "removed on steps 7, 15 (closed hat 1)": where, when few, and on a drum track
 * which sounds (an agent read the pattern to find out).
 */
function onSteps(
	count: number,
	verb: string,
	steps: readonly number[],
	sounds: readonly string[] = []
): string {
	const at =
		steps.length > 0 && steps.length <= 8
			? ` on step${steps.length === 1 ? '' : 's'} ${steps.join(', ')}`
			: '';
	const which = sounds.length > 0 && sounds.length <= 3 ? ` (${sounds.join(', ')})` : '';
	return `${count} ${verb}${at}${which}`;
}

/** The notes of `a` with no partner in `b`. */
function unmatchedNotes(a: readonly Placed[], b: readonly Placed[]): Placed[] {
	const left = new Map<string, number>();
	for (const n of b) left.set(where(n), (left.get(where(n)) ?? 0) + 1);
	return a.filter((n) => {
		const k = left.get(where(n)) ?? 0;
		if (k > 0) left.set(where(n), k - 1);
		return k === 0;
	});
}

/** "100" or "72–108". */
function range(values: readonly number[]): string {
	const low = Math.min(...values);
	const high = Math.max(...values);
	return low === high ? `${low}` : `${low}–${high}`;
}

/** A shift in semitones as said: "up 2 semitones", "down an octave". */
function shift(semitones: number): string {
	const size = Math.abs(semitones);
	const way = semitones > 0 ? 'up' : 'down';
	if (size % 12 === 0) return `${way} ${size === 12 ? 'an octave' : `${size / 12} octaves`}`;
	return `${way} ${plural(size, 'semitone')}`;
}

/** What changed about notes that kept their steps and pitches: velocity, length, timing. */
function detail(x: readonly Placed[], y: readonly Placed[]): string[] {
	const parts: string[] = [];
	const loud = y.flatMap((n, i) => (n.velocity !== x[i].velocity ? [i] : []));
	if (loud.length) {
		const was = range(loud.map((i) => x[i].velocity));
		const now = range(loud.map((i) => y[i].velocity));
		const which = loud.length === y.length ? 'velocities' : `${loud.length} velocities`;
		parts.push(`${which} ${was} → ${now}`);
	}
	const long = y.filter((n, i) => n.length !== x[i].length).length;
	if (long) parts.push(`${plural(long, 'length')} changed`);
	const nudged = y.filter((n, i) => n.offset !== x[i].offset).length;
	if (nudged) parts.push(`${plural(nudged, 'note')} nudged`);
	return parts;
}

/**
 * The change from `before` to `after` in a few words, or null when their notes are the same. A new
 * pattern (`before` undefined) reads "new, 5 notes".
 */
export function describeNoteChange(
	before: Pattern | undefined,
	after: Pattern | undefined,
	/** A drum note's sound ("kick 1"), on a drum track. */
	soundOf?: (note: number) => string | null
): string | null {
	const x = placed(before);
	const y = placed(after);
	if (!after) return before ? 'removed' : null;
	if (!before) return `new, ${plural(y.length, 'note')}`;
	if (x.length !== y.length) {
		const added = unmatched(y.map(where), x.map(where));
		const removed = unmatched(x.map(where), y.map(where));
		const notes = `${x.length} → ${plural(y.length, 'note')}`;
		// most of it new: "14 added, 15 removed" read as a puzzle for one rewritten grid
		if (x.length && removed * 2 > x.length && added * 2 > y.length) return `${notes}, rewritten`;
		const sounds = (notes: readonly Placed[]) =>
			soundOf
				? [...new Set(notes.map((n) => soundOf(n.note)).filter((s): s is string => !!s))]
				: [];
		const how = [
			added ? onSteps(added, 'added', unmatchedSteps(y, x), sounds(unmatchedNotes(y, x))) : '',
			removed ? onSteps(removed, 'removed', unmatchedSteps(x, y), sounds(unmatchedNotes(x, y))) : ''
		]
			.filter(Boolean)
			.join(', ');
		return x.length && how ? `${notes} (${how})` : notes;
	}
	const count = plural(y.length, 'note');
	if (y.length === 0) return null;
	if (x.every((n, i) => where(n) === where(y[i]))) {
		const parts = detail(x, y);
		return parts.length ? `${count}, ${parts.join(', ')}` : null;
	}
	if (x.every((n, i) => n.step === y[i].step)) {
		const moves = new Set(y.map((n, i) => n.note - x[i].note));
		if (moves.size === 1) return `${count}, ${shift(y[0].note - x[0].note)}`;
		// which steps, when few: one chord changed reads as that chord's step
		const changed = [...new Set(y.flatMap((n, i) => (n.note !== x[i].note ? [n.step] : [])))];
		const steps = new Set(y.map((n) => n.step)).size;
		if (changed.length < steps && changed.length <= 8) {
			return `${count}, the same rhythm with new pitches on step${changed.length === 1 ? '' : 's'} ${changed.join(', ')}`;
		}
		return `${count}, the same rhythm with new pitches`;
	}
	const moved = unmatched(y.map(where), x.map(where));
	if (
		unmatched(
			y.map((n) => `${n.note}`),
			x.map((n) => `${n.note}`)
		) === 0
	) {
		return `${count}, ${moved} moved to other steps`;
	}
	return `${count}, rewritten (${moved} different)`;
}
