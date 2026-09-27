/**
 * Who gets a voice. The OP-XY shares 24 voices between all tracks and allocates them automatically
 * (manual: hardware/specifications, project/settings); so do we. This is pure bookkeeping over times
 * on the audio clock, because the scheduler plays notes a little ahead: a voice that is let go at
 * 1.00 s is free for a note at 1.05 s even though that has not happened yet.
 */

/** Polyphony shared by all tracks. */
export const VOICE_LIMIT = 24;

/** What the allocator needs to know about a voice. */
export interface VoiceSlot {
	readonly track: number;
	/** When it starts. */
	readonly start: number;
	/** When it is let go (Infinity while held). */
	readonly off: number;
	/** When it has faded to silence (Infinity while held). */
	readonly end: number;
}

/** Voices that sound, or are scheduled to, at or after `time` (the ones taking up polyphony). */
export function busyAt<V extends VoiceSlot>(voices: readonly V[], time: number): V[] {
	return voices.filter((v) => v.end > time);
}

/**
 * The voice a new note at `time` on `track` must take over, or null while there is room. Voices
 * already let go go first, the one released longest ago; then the oldest held note of the same
 * track (a busy part steals from itself before it silences another); then the oldest held note.
 * Voices that have started by `time` are preferred over ones scheduled after it.
 */
export function victim<V extends VoiceSlot>(
	voices: readonly V[],
	time: number,
	track: number,
	limit = VOICE_LIMIT
): V | null {
	const busy = busyAt(voices, time);
	if (busy.length < limit) return null;
	const started = busy.filter((v) => v.start <= time);
	const pool = started.length > 0 ? started : busy;
	const released = pool.filter((v) => v.off <= time);
	if (released.length > 0) return oldest(released, (v) => v.off);
	const own = pool.filter((v) => v.track === track);
	return oldest(own.length > 0 ? own : pool, (v) => v.start);
}

function oldest<V>(voices: readonly V[], key: (v: V) => number): V {
	return voices.reduce((best, v) => (key(v) < key(best) ? v : best));
}
