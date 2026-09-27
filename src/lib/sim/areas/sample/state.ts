/**
 * The sample area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the sample area remembers (empty until the area is built). */
export type SampleState = Record<string, never>;

/** The sample area's state in a new project. */
export function initialSample(): SampleState {
	return {};
}
