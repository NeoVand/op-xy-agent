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

/**
 * How `line` sits against `other` where both start single notes on the same steps (the other
 * repeating under a longer line), or null when they move together on too few of them.
 */
export function voicesNote(line: Line, other: Line): string | null {
	const mine = singles(line.notes);
	const theirs = singles(other.notes);
	if (mine.size < 4 || theirs.size === 0 || other.length < 1) return null;
	const pairs = [...mine]
		.sort((a, b) => a[0] - b[0])
		.flatMap(([step, note]) => {
			const under = theirs.get(((step - 1) % other.length) + 1);
			return under === undefined ? [] : [{ step, note, under, gap: note - under }];
		});
	if (pairs.length < 4 || pairs.length < mine.size * 0.6) return null;
	const generic = (gap: number) => {
		const size = Math.abs(gap) % 12;
		return size === 0 && gap !== 0 ? 'octave' : GENERIC[size];
	};
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
	const article = /^[aeiou]/.test(main) ? 'an' : 'a';
	const rest = [...counts]
		.filter(([g]) => g !== main)
		.map(([g, n]) => `${n} ${n === 1 ? g : plural(g)}`);
	const shape =
		most === pairs.length
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
