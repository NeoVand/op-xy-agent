/**
 * The mixer area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the mixer area remembers (empty until the area is built). */
export type MixerState = Record<string, never>;

/** The mixer area's state in a new project. */
export function initialMixer(): MixerState {
	return {};
}
