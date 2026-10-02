/**
 * Two lines that move together, read as a musician hears them: the interval between them where they
 * start notes on the same steps ("a third above throughout, 7 minor and 6 major"), and parallel
 * fifths or octaves. An agent harmonizing a melody a third above said "a minor third wherever the
 * scale gives one" without checking a note, and had no way to.
 */

/** A note as a pattern holds it. */
interface Voiced {
	readonly step: number;
	readonly note: number;
	/** In steps, when known: how long the note sounds. */
	readonly length?: number;
}

/** A line: its notes and how many steps it runs before it repeats. */
export interface Line {
	readonly track: number;
	readonly length: number;
	readonly notes: readonly Voiced[];
}

const GENERIC = [
	'unison',
	'second',
	'second',
	'third',
	'third',
	'fourth',
	'tritone',
	'fifth',
	'sixth',
	'sixth',
	'seventh',
	'seventh'
] as const;
const QUALITY: Readonly<Record<number, string>> = {
	1: 'minor',
	2: 'major',
	3: 'minor',
	4: 'major',
	8: 'minor',
	9: 'major',
	10: 'minor',
	11: 'major'
};

/** Single notes by step: a chord's step is left out (it is no line). */
function singles(notes: readonly Voiced[]): Map<number, number> {
	const at = new Map<number, number[]>();
	for (const n of notes) at.set(n.step, [...(at.get(n.step) ?? []), n.note]);
	return new Map([...at].filter(([, ns]) => ns.length === 1).map(([step, ns]) => [step, ns[0]]));
}

const plural = (word: string) => (word === 'unison' ? 'unisons' : `${word}s`);

/** An interval by its name, any octave (an octave apart is "octave", the same note "unison"). */
const generic = (gap: number) => {
	const size = Math.abs(gap) % 12;
	return size === 0 && gap !== 0 ? 'octave' : GENERIC[size];
};

/** The middle note of a line. */
const middle = (notes: ReadonlyMap<number, number>) => {
	const sorted = [...notes.values()].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

/**
 * A line mostly between another's notes in a register near it, a counter-melody: how many of its
 * notes start with the other's, the intervals there and on which steps, or null (an agent said its
 * counter-line "rarely lands on the lead's steps" with 7 of its 20 there, and had nothing to check).
 */
function counterNote(
	other: Line,
	mine: ReadonlyMap<number, number>,
	theirs: ReadonlyMap<number, number>,
	pairs: readonly { step: number; gap: number }[]
): string | null {
	if (theirs.size < 4 || Math.abs(middle(mine) - middle(theirs)) > 12) return null;
	const them = `T${other.track}'s`;
	// the notes between: over one of the other's held notes, or in its rests (an agent asked how
	// often two lines play together counted the lead's held notes by hand)
	const starts = new Set(pairs.map((p) => p.step));
	const between = [...mine.keys()].filter((step) => !starts.has(step));
	const timed = other.notes.every((n) => n.length !== undefined);
	const held = between.filter((step) => {
		const at = ((step - 1) % other.length) + 1;
		return other.notes.some((n) => n.step < at && at < n.step + (n.length ?? 0));
	}).length;
	const over =
		timed && between.length > 0
			? ` (${held} over its held notes, ${between.length - held} in its rests)`
			: '';
	if (pairs.length === 0) {
		return `Against ${them} line: none of its ${mine.size} notes start with one of ${them}; all fall between them${over}.`;
	}
	const counts = new Map<string, number>();
	for (const p of pairs) counts.set(generic(p.gap), (counts.get(generic(p.gap)) ?? 0) + 1);
	const intervals = [...counts]
		.sort((a, b) => b[1] - a[1])
		.map(([g, n]) => `${n} ${n === 1 ? g : plural(g)}`)
		.join(', ');
	const steps = pairs.map((p) => p.step);
	const shown = steps.length > 8 ? `${steps.slice(0, 8).join(', ')}, …` : steps.join(', ');
	return `Against ${them} line: ${pairs.length} of its ${mine.size} notes start with one of ${them} (${intervals}; steps ${shown}), the other ${mine.size - pairs.length} between them${over}.`;
}

/**
 * How `line` sits against `other` where both start single notes on the same steps (the other
 * repeating under a longer line), or null when they move together on too few of them.
 */
export function voicesNote(line: Line, other: Line): string | null {
	const mine = singles(line.notes);
	const theirs = singles(other.notes);
	if (mine.size < 4 || theirs.size === 0 || other.length < 1) return null;
	// lines more than two octaves apart are a lead over a bass, no second voice (a hook's last
	// notes over the bass's roots were flagged as parallel octaves, which an agent called noise)
	if (Math.abs(middle(mine) - middle(theirs)) > 24) return null;
	const pairs = [...mine]
		.sort((a, b) => a[0] - b[0])
		.flatMap(([step, note]) => {
			const under = theirs.get(((step - 1) % other.length) + 1);
			return under === undefined ? [] : [{ step, note, under, gap: note - under }];
		});
	if (pairs.length < 4 || pairs.length < mine.size * 0.6) {
		return counterNote(other, mine, theirs, pairs);
	}
	const counts = new Map<string, number>();
	for (const p of pairs) counts.set(generic(p.gap), (counts.get(generic(p.gap)) ?? 0) + 1);
	const [main, most] = [...counts].sort((a, b) => b[1] - a[1])[0];
	const above = pairs.every((p) => p.gap > 0);
	const below = pairs.every((p) => p.gap < 0);
	const side = above ? ' above' : below ? ' below' : '';
	const qualities = new Map<string, number>();
	for (const p of pairs.filter((q) => generic(q.gap) === main)) {
		const q = QUALITY[Math.abs(p.gap) % 12];
		if (q) qualities.set(q, (qualities.get(q) ?? 0) + 1);
	}
	const kinds =
		qualities.size > 0 ? ` (${[...qualities].map(([q, n]) => `${n} ${q}`).join(', ')})` : '';
	const article = /^[aeio]/.test(main) ? 'an' : 'a';
	const rest = [...counts]
		.filter(([g]) => g !== main)
		.map(([g, n]) => `${n} ${n === 1 ? g : plural(g)}`);
	// the same notes on every step: a copy, not a second voice (an agent's bass written over the
	// same bass read "an unison throughout")
	const shape =
		most === pairs.length && main === 'unison'
			? 'the same notes throughout, a unison doubling'
			: most === pairs.length
				? `${article} ${main}${side} throughout${kinds}`
				: `mostly ${plural(main)}${side} (${most} of ${pairs.length}${kinds ? `, ${[...qualities].map(([q, n]) => `${n} ${q}`).join(', ')}` : ''}; ${rest.join(', ')})`;
	// parallel fifths and octaves: one perfect interval to the same again, both voices moving the
	// same way
	const parallels = new Map<string, Set<number>>();
	pairs.slice(1).forEach((p, i) => {
		const q = pairs[i];
		const perfect = (gap: number) => Math.abs(gap) % 12 === 7 || (gap !== 0 && gap % 12 === 0);
		const same = Math.abs(p.gap) % 12 === Math.abs(q.gap) % 12;
		const moving = Math.sign(p.note - q.note) === Math.sign(p.under - q.under) && p.note !== q.note;
		if (!(perfect(p.gap) && perfect(q.gap) && same && moving)) return;
		const kind = Math.abs(p.gap) % 12 === 7 ? 'fifths' : 'octaves';
		parallels.set(kind, new Set([...(parallels.get(kind) ?? []), q.step, p.step]));
	});
	// an octave throughout is a doubling: its parallels are the point (an octave-down copy of a
	// melody was flagged for parallel octaves, which an agent read as a fault)
	const doubling = most === pairs.length && main === 'octave';
	const parallel = (doubling ? [] : [...parallels])
		.map(([kind, steps]) => {
			const list = [...steps].sort((a, b) => a - b);
			const shown = list.length > 8 ? `${list.slice(0, 8).join(', ')}, …` : list.join(', ');
			return `; parallel ${kind} on steps ${shown}`;
		})
		.join('');
	return `Against T${other.track}'s line on the same steps (${pairs.length} of its ${mine.size} notes): ${shape}${parallel}.`;
}
