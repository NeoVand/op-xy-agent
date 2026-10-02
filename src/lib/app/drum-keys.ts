/**
 * A drum track's own key settings (tune, start, end, play mode, direction, pan, fade, gain), as
 * the key's page shows them, for read_sound and the change lists. A drum key panned left once
 * left no trace in either, and the agent could not tell whether its setting had landed.
 */
import { KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
import { soundName } from '$lib/sim/areas/sample/state';
import { lockParam } from '$lib/sim/areas/sequencer/locks';
import { defaultDrumKey, type DrumKey, type SimState } from '$lib/sim/params';

const FIELDS = ['tune', 'start', 'end', 'playMode', 'reverse', 'pan', 'fade', 'gain'] as const;

/** Key `k`'s values of track `t` (0-based) by label, as its page reads them ("pan": "-70"). */
export function drumKeyValues(s: SimState, t: number, k: number): Record<string, string> {
	const track = s.tracks[t];
	const out: Record<string, string> = {};
	for (const field of FIELDS) {
		const p = lockParam(`key${k}.${field}`);
		if (p) out[p.label] = p.format(p.get(track));
	}
	return out;
}

/** The key's name and the sound on it: "C#4 closed hat 1". */
export function drumKeyName(s: SimState, t: number, k: number): string {
	const file = s.areas.sample.tracks[t]?.keys[k];
	const name = KEYBOARD_NOTE_NAMES[k];
	// as read_sound names keys ("F#3", from "fs3")
	const note = name ? name.toUpperCase().replace('S', '#') : `key ${k + 1}`;
	return file ? `${note} ${soundName(file.name)}` : note;
}

/**
 * The keys whose values are not a new key's, each as "pan -70, gain -3": what read_sound lists
 * beside a kit's names (empty for a track that is no drum sampler, or holds only defaults).
 */
export function drumKeysSet(s: SimState, t: number): Record<string, string> {
	const track = s.tracks[t];
	if (!track || track.engine !== 'drum') return {};
	const fresh = defaultDrumKey();
	const out: Record<string, string> = {};
	track.drumKeys.forEach((key: DrumKey, k) => {
		const changed = FIELDS.filter((f) => key[f] !== fresh[f]);
		if (changed.length === 0) return;
		const values = drumKeyValues(s, t, k);
		const labels = changed.map((f) => lockParam(`key${k}.${f}`)?.label ?? f);
		out[drumKeyName(s, t, k)] = labels.map((label) => `${label} ${values[label]}`).join(', ');
	});
	return out;
}

/** What changed on track `t`'s drum keys between two states: "C#4 closed hat 1: pan 0 → -70". */
export function drumKeyChanges(before: SimState, after: SimState, t: number): string[] {
	const a = before.tracks[t];
	const b = after.tracks[t];
	if (!a || !b || b.engine !== 'drum' || a.engine !== 'drum') return [];
	return b.drumKeys.flatMap((_, k) => {
		const was = drumKeyValues(before, t, k);
		const now = drumKeyValues(after, t, k);
		const moved = Object.keys(now).filter((label) => was[label] !== now[label]);
		return moved.length
			? [
					`${drumKeyName(after, t, k)}: ${moved.map((label) => `${label} ${was[label]} → ${now[label]}`).join(', ')}`
				]
			: [];
	});
}
