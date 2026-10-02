/**
 * A drum grid line's key as a MIDI note: a number, a note name ("C#4"), or a sound of the track's kit
 * by its name, without its number, or by what it is ("kick 1" where a made kit says "808 kick"), as
 * the key planner finds keys too. write_pattern's grid and the lab's take it alike (an agent in the
 * lab wrote hats by number, unsure the kit put them there).
 */
import { parseNoteName } from '$lib/core/midi/notes';
import { FIRST_NOTE, KEYS, soundKeyOf } from '$lib/sim/areas/sample/state';

/** The note a grid line's key names, or null for none of the kit's (`kit`: "F3": "kick 1"). */
export function gridKey(
	key: string,
	kit: Readonly<Record<string, string>> | undefined
): number | null {
	const k = key.trim();
	if (/^\d{1,3}$/.test(k)) return Number(k) <= 127 ? Number(k) : null;
	const named = parseNoteName(k, 'c4');
	if (named !== null) return named;
	const sounds = new Array<string | null>(KEYS).fill(null);
	for (const [note, name] of Object.entries(kit ?? {})) {
		const at = (parseNoteName(note, 'c4') ?? -1) - FIRST_NOTE;
		if (at >= 0 && at < KEYS) sounds[at] = name;
	}
	const at = soundKeyOf(sounds, k);
	return at === null ? null : FIRST_NOTE + at;
}
