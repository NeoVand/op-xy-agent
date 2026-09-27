/**
 * The system area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the system area remembers (empty until the area is built). */
export type SystemState = Record<string, never>;

/** The system area's state in a new project. */
export function initialSystem(): SystemState {
	return {};
}
