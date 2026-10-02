/**
 * What a take holds where it differs from the replica, read back as write_pattern reads a pattern:
 * a drum sound's line with each hit's loudness, a pitched part's notes. Two takes once read alike
 * ("15 → 22 notes" each), an accented hat line and a flat one, and the agent described them from
 * its own code with nothing to check it by.
 */
import type { VirtualNote, VirtualOpxy } from '../virtual-opxy';
import { readPattern as readingOf } from '../pattern-reading';

/** The most lines a take reads back. */
const MAX_LINES = 6;

/** A hit's loudness as a grid digit, 1 (14) … 9 (127), as write_pattern's grid writes it. */
const digit = (velocity: number) =>
	String(Math.max(1, Math.min(9, Math.round((velocity * 9) / 127))));

/** One sound's hits over `length` steps, a beat of four marks a group and | between bars. */
function line(notes: readonly VirtualNote[], length: number): string {
	const marks = Array.from({ length }, () => '.');
	for (const n of notes) if (n.step >= 1 && n.step <= length) marks[n.step - 1] = digit(n.velocity);
	const bars: string[] = [];
	for (let b = 0; b < length; b += 16) {
		const bar = marks.slice(b, b + 16).join('');
		bars.push(bar.match(/.{1,4}/g)!.join(' '));
	}
	return bars.join(' | ');
}

const key = (notes: readonly VirtualNote[]) =>
	JSON.stringify(
		[...notes]
			.map((n) => [n.step, n.note, n.velocity, n.length])
			.sort((a, b) => a[0] - b[0] || a[1] - b[1])
	);

/** The take's changed parts as lines ("T1 p1 closed hat 1: 9.3. 9.3. …"), at most six. */
export function takeReads(before: VirtualOpxy, after: VirtualOpxy): string[] {
	const out: string[] = [];
	const tracks = after.status().tracks.filter((t) => t.track <= 8);
	for (const t of tracks) {
		const drums = t.engine === 'drum';
		for (let p = 1; p <= t.patterns; p++) {
			const now = after.readPattern(t.track, p);
			let was: VirtualNote[] = [];
			try {
				was = [...before.readPattern(t.track, p).notes];
			} catch {
				// a pattern the take added
			}
			if (key(was) === key(now.notes) || now.notes.length === 0) continue;
			const where = `T${t.track} p${p}`;
			if (drums) {
				const sounds = [...new Set(now.notes.map((n) => n.note))].sort((a, b) => a - b);
				for (const note of sounds) {
					const mine = now.notes.filter((n) => n.note === note);
					const theirs = was.filter((n) => n.note === note);
					if (key(mine) === key(theirs)) continue;
					out.push(`${where} ${mine[0].sound ?? note}: ${line(mine, now.length)}`);
				}
			} else {
				const reading = readingOf(now);
				if (reading?.notes) out.push(`${where}: ${reading.notes}`);
			}
		}
	}
	return out.length > MAX_LINES
		? [...out.slice(0, MAX_LINES), `and ${out.length - MAX_LINES} more`]
		: out;
}
