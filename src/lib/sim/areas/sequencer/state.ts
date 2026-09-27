/**
 * The sequencer area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the sequencer area remembers (empty until the area is built). */
export type SequencerState = Record<string, never>;

/** The sequencer area's state in a new project. */
export function initialSequencer(): SequencerState {
	return {};
}
