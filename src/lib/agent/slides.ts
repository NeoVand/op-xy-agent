/**
 * Where a mono or legato track's notes slide, as the replica's engine plays them (`sound/engine.ts`;
 * manual: howto.acid-bass): in legato a note glides into the next only where it runs past that
 * note's start, and in mono every note glides from the last, both with portamento up. An agent wrote
 * an acid line whose notes ended just where the next began, set legato and portamento, and told the
 * user they slid: none did.
 */

/** A note as the pattern holds it: where it starts and how many steps it lasts. */
export interface SlidingNote {
	readonly step: number;
	readonly length: number;
}

/** The play mode and portamento a track's shift M2 page reads ("play mode legato, portamento 20"). */
export function playModeOf(reading: string): { mode: string; portamento: number } | null {
	const m = /play mode (\w+), portamento (off|\d+)/.exec(reading);
	return m ? { mode: m[1], portamento: m[2] === 'off' ? 0 : Number(m[2]) } : null;
}

const listed = (steps: readonly number[]) =>
	`step${steps.length === 1 ? '' : 's'} ${steps.length > 8 ? `${steps.slice(0, 8).join(', ')}…` : steps.join(', ')}`;

/**
 * What slides on track `track` with its play mode page reading `reading`, in a sentence, or null
 * when nothing does or could (poly, portamento off, fewer than two notes).
 */
export function slidesNote(
	track: number,
	reading: string,
	notes: readonly SlidingNote[]
): string | null {
	const play = playModeOf(reading);
	if (!play || play.mode === 'poly' || play.portamento === 0) return null;
	// one entry a start, the longest note there (a chord's)
	const ends = new Map<number, number>();
	for (const n of notes) ends.set(n.step, Math.max(ends.get(n.step) ?? 0, n.step + n.length));
	const starts = [...ends.keys()].sort((a, b) => a - b);
	if (starts.length < 2) return null;
	if (play.mode === 'mono') {
		return `T${track} plays mono with portamento ${play.portamento}: every note slides from the one before. For slides on chosen notes alone, set play mode legato and let those notes run past the next one's start.`;
	}
	const runs: number[] = [];
	const touching: number[] = [];
	starts.slice(0, -1).forEach((step, i) => {
		const end = ends.get(step)!;
		const next = starts[i + 1];
		if (end > next + 1e-6) runs.push(step);
		else if (Math.abs(end - next) <= 1e-6) touching.push(step);
	});
	if (runs.length > 0) {
		const others = touching.length
			? ` Those on ${listed(touching)} end just where the next begins, so they start it afresh: make one longer than the gap to slide it.`
			: '';
		return `T${track} plays legato with portamento ${play.portamento}: the notes on ${listed(runs)} run past the next one's start and slide into it.${others}`;
	}
	if (touching.length > 0) {
		return `T${track} plays legato with portamento ${play.portamento}, but no note runs past the next one's start (those on ${listed(touching)} end just where the next begins), so none slides: for a slide, make the note longer than the gap (2.5 steps for notes 2 apart).`;
	}
	return null;
}
