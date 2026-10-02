/**
 * A slow amp attack against how long a track's notes last: a pad set to swell over 3 s under notes
 * of 2 s never reaches full level, which an agent suggested to a user without noticing. Said where
 * notes are written and where the attack is set, from the envelope law the replica plays
 * (`sound/times.ts`).
 */
import { stageSeconds, timeText } from '$lib/sound/times';

/**
 * What a slow attack does to `notes` (lengths in steps at track scale `scale`) at `bpm`, given the
 * track's M2 amp envelope reading ("amp envelope: attack 57, …"); null when the notes outlast it.
 */
export function swellNote(
	track: number,
	ampReading: string,
	notes: readonly { readonly length: number }[],
	scale: number,
	bpm: number
): string | null {
	const m = /\battack (\d+)/.exec(ampReading);
	if (!m || notes.length === 0 || bpm <= 0) return null;
	const attack = stageSeconds('attack', Number(m[1]));
	if (attack < 0.3) return null;
	const longest = Math.max(...notes.map((n) => n.length)) * (60 / bpm / 4) * scale;
	const at = `${Math.round(bpm * 10) / 10} bpm`;
	if (attack >= longest) {
		return `T${track}'s amp attack takes ${timeText(attack)}, longer than its longest note (${timeText(longest)} at ${at}): its notes end before they reach full level. Longer notes, a slower tempo or a shorter attack let them.`;
	}
	if (attack > longest * 0.6) {
		return `T${track}'s amp attack takes ${timeText(attack)} and its longest note lasts ${timeText(longest)} at ${at}, so it reaches full level only near its end.`;
	}
	return null;
}
