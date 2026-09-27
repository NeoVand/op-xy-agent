/**
 * The arrange area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the arrange area remembers (empty until the area is built). */
export type ArrangeState = Record<string, never>;

/** The arrange area's state in a new project. */
export function initialArrange(): ArrangeState {
	return {};
}
