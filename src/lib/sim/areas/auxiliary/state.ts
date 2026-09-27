/**
 * The auxiliary area's part of the simulator state (see `../types.ts`). Plain, serialisable data.
 */

/** What the auxiliary area remembers (empty until the area is built). */
export type AuxiliaryState = Record<string, never>;

/** The auxiliary area's state in a new project. */
export function initialAuxiliary(): AuxiliaryState {
	return {};
}
