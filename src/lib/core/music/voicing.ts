/**
 * Chords voiced as a keyboard player would: close, near the middle of the keyboard, each one
 * moving as little as it can from the one before, so a progression written by name ("Am F C G")
 * comes out as smooth voice leading rather than four root-position blocks that jump. A slash
 * chord's bass goes below. Pure: notes in, notes out.
 */
import type { ChordSymbol } from './harmony';

/** Where the voicings sit: the note their middle stays near (60, middle C), and how they move. */
export interface VoicingOptions {
	readonly center?: number;
	/** Every chord on its root, near the centre, rather than led smoothly from the one before. */
	readonly root?: boolean;
}

/** The chord's tones stacked close from each of its inversions, the lowest at or above `floor`. */
function inversions(chord: ChordSymbol, floor: number): number[][] {
	const pcs = chord.tones.map((t) => (chord.root + t) % 12);
	return pcs.map((_, i) => {
		const order = [...pcs.slice(i), ...pcs.slice(0, i)];
		let note = floor + ((((order[0] - floor) % 12) + 12) % 12);
		return order.map((pc, k) => {
			if (k > 0) note += (pc - (note % 12) + 12) % 12 || 12;
			return note;
		});
	});
}

const mean = (notes: readonly number[]) => notes.reduce((a, b) => a + b, 0) / notes.length;

/** How far the voices move from one chord to the next: each note to the nearest in the other. */
function motion(from: readonly number[], to: readonly number[]): number {
	const near = (n: number, set: readonly number[]) => Math.min(...set.map((m) => Math.abs(m - n)));
	return (
		to.reduce((sum, n) => sum + near(n, from), 0) + from.reduce((sum, n) => sum + near(n, to), 0)
	);
}

/**
 * Each chord's notes, low to high: the first close to `center`, each later one the inversion and
 * octave that moves least from the one before while its middle stays within a fifth of `center`
 * (so a long progression does not drift up or down the keyboard).
 */
export function voiceChords(
	chords: readonly ChordSymbol[],
	options: VoicingOptions = {}
): number[][] {
	const center = options.center ?? 60;
	const out: number[][] = [];
	let previous: number[] | null = null;
	for (const chord of chords) {
		const all = [center - 12, center - 7, center].flatMap((floor) => inversions(chord, floor));
		// root position: the inversions with the root at the bottom alone
		const candidates = options.root ? all.filter((c) => c[0] % 12 === chord.root) : all;
		const near = candidates.filter((c) => Math.abs(mean(c) - center) <= 7);
		const pool = near.length > 0 ? near : candidates;
		const score = (c: number[]) =>
			previous && !options.root
				? motion(previous, c) + Math.abs(mean(c) - center) * 0.25
				: Math.abs(mean(c) - center) + (c[0] % 12 === chord.root ? 0 : 3);
		let best = pool[0];
		for (const c of pool) if (score(c) < score(best)) best = c;
		previous = best;
		// a slash chord's bass: the highest such note below the voicing
		const notes = [...best];
		if (chord.bass !== null) {
			let bass = best[0] - 1;
			while (((bass % 12) + 12) % 12 !== chord.bass) bass--;
			notes.unshift(bass);
		}
		out.push(notes);
	}
	return out;
}
