/**
 * What only means something mid-gesture: the sequencer's gestures, clipboards and undo; queued,
 * armed or half-typed scenes and a playing song; an open effect list; the mixer's send popup; the
 * recorder, an open slicer and the library cursor. Reloaded work starts without it, like a booted
 * device (`app/persistence.ts`), and a lab's fork starts without it and never carries it back to
 * the replica (`agent/lab`): it belongs to the moment, not to the song.
 */
import { defaultState, type SimState } from './params';

/** The areas' session fields, by area; `all` for an area that is nothing but (the sequencer's). */
export const SESSION_FIELDS: {
	readonly [A in keyof SimState['areas']]?: 'all' | readonly (keyof SimState['areas'][A])[];
} = {
	sequencer: 'all',
	arrange: ['view', 'queued', 'armed', 'entry', 'playing', 'position', 'cue', 'clipboard'],
	auxiliary: ['picker'],
	mixer: ['sendPopup'],
	sample: ['record', 'slicer', 'page', 'library', 'clipboard']
};

/** Puts every session field back as a new project has it, so the work starts idle. */
export function settleSession(state: SimState): void {
	const fresh = defaultState().areas as unknown as Record<string, Record<string, unknown>>;
	const areas = state.areas as unknown as Record<string, Record<string, unknown>>;
	for (const [area, fields] of Object.entries(SESSION_FIELDS)) {
		if (fields === 'all') areas[area] = fresh[area];
		else for (const field of fields) areas[area][field] = fresh[area][field];
	}
}
