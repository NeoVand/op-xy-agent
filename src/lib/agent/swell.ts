/**
 * A slow amp attack against how long a track's notes last: a pad set to swell over 3 s under notes
 * of 2 s never reaches full level, which an agent suggested to a user without noticing. And a long
 * release under chords that change, each ringing on under the next: a pad's 3.2 s release read as
 * sus chords at every change, and an agent asked to find the clash looked only at the notes. Said
 * where notes are written and where the envelope is set, from the envelope law the replica plays
 * (`sound/times.ts`).
 */
import { stageSeconds, timeText } from '$lib/sound/times';
import type { VirtualOpxy } from './virtual-opxy';

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
	// the page value with its time, so a note given before a change reads as of that value (an
	// agent saw 2.8 s in one result and 10 s in the next, and could not tell which was now)
	if (attack >= longest) {
		return `T${track}'s amp attack (${m[1]} on its page) takes ${timeText(attack)}, longer than its longest note (${timeText(longest)} at ${at}): its notes end before they reach full level. Longer notes, a slower tempo or a shorter attack let them.`;
	}
	if (attack > longest * 0.6) {
		return `T${track}'s amp attack (${m[1]} on its page) takes ${timeText(attack)} and its longest note lasts ${timeText(longest)} at ${at}, so it reaches full level only near its end (a shorter attack, "amp attack" with a time, brings it in sooner).`;
	}
	return null;
}

/** A note of a track, as far as its tail goes: where it starts, how long, which note. */
interface Held {
	readonly step: number;
	readonly length: number;
	readonly note: number;
}

/**
 * What a long amp release does to chords that change (three notes or more starting together),
 * given the track's M2 amp envelope reading: null unless, at some change, notes of the old chord
 * the new one does not hold ring clearly (half the release, about −20 dB) half a second or more
 * into it.
 */
export function tailNote(
	track: number,
	ampReading: string,
	notes: readonly Held[],
	scale: number,
	bpm: number
): string | null {
	const m = /\brelease (\d+)/.exec(ampReading);
	if (!m || bpm <= 0) return null;
	const release = stageSeconds('release', Number(m[1]));
	const step = (60 / bpm / 4) * scale;
	const onsets = new Map<number, Held[]>();
	for (const n of notes) onsets.set(n.step, [...(onsets.get(n.step) ?? []), n]);
	const chords = [...onsets.entries()].filter(([, at]) => at.length >= 3).sort(([a], [b]) => a - b);
	let changes = 0;
	let blurred = 0;
	for (let i = 1; i < chords.length; i++) {
		const [, was] = chords[i - 1];
		const [at, now] = chords[i];
		const held = new Set(now.map((n) => n.note % 12));
		const left = was.filter((n) => !held.has(n.note % 12));
		if (left.length === 0) continue;
		changes++;
		// how far into the new chord the old one still rings clearly (half its release, about
		// −20 dB, after its own end): half a second of it or more blurs the change
		const ringing = left.some((n) => release / 2 - (at - (n.step + n.length)) * step >= 0.5);
		if (ringing) blurred++;
	}
	if (blurred === 0) return null;
	const at = `${Math.round(bpm * 10) / 10} bpm`;
	return `T${track}'s amp release (${m[1]} on its page, where a lower value lasts longer) takes ${timeText(release)} to die away (${at}), so ${blurred === changes ? 'each chord rings on under the next' : `at ${blurred} of its ${changes} chord changes the old chord rings on under the new one`}: their notes sound together for a while, which blurs the change (a listen reads such blends as sus or added-note chords). A shorter release ("amp release" with a time, such as "0.5 s") keeps the changes clean; a pad often keeps some of it.`;
}

/**
 * The swell notes of every instrument track with notes at the tempo now (or at `bpm`): a tempo
 * change moves notes against an attack that does not move (a pad's 2.8 s swell fit its notes at
 * 72 bpm, and once the tempo doubled the agent learned it only from a later write).
 */
export function swellsNow(virtual: VirtualOpxy, bpm = virtual.status().bpm): string[] {
	return virtual.status().tracks.flatMap((t) => {
		if (t.track > 8 || t.notes === 0 || t.engine === 'drum') return [];
		const p = virtual.readPattern(t.track);
		const line = swellNote(
			t.track,
			virtual.readSound(t.track).pages['M2 amp envelope'] ?? '',
			p.notes,
			p.scale,
			bpm
		);
		return line ? [line] : [];
	});
}
