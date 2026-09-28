/**
 * The punch-in keys held now, read from the simulator's state: keyboard keys on the punch-in track
 * (aux T2), and `shift + key` on an instrument track when nothing else takes those keys (step
 * components, maestro's chord; the midi engine, as OS 1.0.32 has it). The simulator draws the
 * effects' pictures; these say which effects sound, and on which tracks.
 *
 * A shortcut effect lasts as long as its key is held, shift or not, as the simulator records it
 * (auxiliary `punchTakes`), and a key that went down without shift plays its note to the end even
 * if shift comes down later: whether a key is a shortcut is decided as it goes down (the first
 * time these functions see it held, which the sound does at every press) and kept until it comes
 * up.
 */
import { componentsActive } from '$lib/sim/areas/sequencer/components';
import { heldKeys, keyboardIndex } from '$lib/sim/areas/sequencer/model';
import { playerOf } from '$lib/sim/areas/sequencer/players';
import type { SimState } from '$lib/sim/params';
import { punchTracks, type PunchPress } from './effects';
import type { PunchTrigger } from './state';

/** The auxiliary track the punch-in FX live on (T2). */
export const PUNCH_TRACK = 1;

/** Keyboard keys held, by state: the shortcut press each made going down (null: none). */
const pressed = new WeakMap<SimState, Map<string, PunchPress | null>>();

/** Something else has the keyboard: a page over the mode, or a step held (the keys edit it). */
const busy = (s: SimState) =>
	s.overlay !== null || s.sub !== null || s.held.some((id) => id.startsWith('step.'));

/** The shortcut press keyboard key `key` (0–23) makes going down now, or null if it makes none. */
function shortcut(s: SimState, key: number): PunchPress | null {
	if (s.mode !== 'instrument' || !s.shift || s.picker !== null || busy(s)) return null;
	if (componentsActive(s) || s.tracks[s.track]?.engine === 'midi') return null;
	const player = playerOf(s);
	if (player.on && player.type === 'maestro') return null;
	return { key, from: s.track };
}

/** The punch-in keys held now, and where from (see {@link PunchPress}). */
export function heldPunches(s: SimState): PunchPress[] {
	const keys = heldKeys(s).flatMap((id) => {
		const key = keyboardIndex(id.slice('keyboard.'.length));
		return key >= 0 ? [{ id, key }] : [];
	});
	const seen = pressed.get(s) ?? new Map<string, PunchPress | null>();
	pressed.set(s, seen);
	for (const id of seen.keys()) if (!keys.some((k) => k.id === id)) seen.delete(id);
	for (const { id, key } of keys) if (!seen.has(id)) seen.set(id, shortcut(s, key));
	const punchTrack =
		s.mode === 'auxiliary' && s.auxTrack === PUNCH_TRACK && !s.areas.auxiliary.picker && !busy(s);
	return keys.flatMap(({ id, key }) => {
		const press = seen.get(id);
		if (press) return [press];
		return punchTrack ? [{ key, from: null }] : [];
	});
}

/** The punch-in keys held now, with the tracks each acts on. */
export function heldTriggers(s: SimState): PunchTrigger[] {
	return heldPunches(s).map((press) => ({ ...press, tracks: punchTracks(s.tracks, press) }));
}
