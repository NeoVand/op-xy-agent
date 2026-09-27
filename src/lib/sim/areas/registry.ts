/**
 * The areas, in the order they are asked whether they own the screen (see `types.ts`): named
 * sub-pages first (they open over any mode), then the overlays, then the modes.
 */
import type { SimState } from '../params';
import { system } from './system/sim';
import { sample } from './sample/sim';
import { sequencer } from './sequencer/sim';
import { mixer } from './mixer/sim';
import { arrange } from './arrange/sim';
import { auxiliary } from './auxiliary/sim';
import type { SimArea } from './types';

/** Every area, in the order asked. */
export const AREAS: readonly SimArea[] = [system, sample, sequencer, mixer, arrange, auxiliary];

/** The area that owns the screen in this state, or null when the core does. */
export function ownerOf(state: SimState): SimArea | null {
	return AREAS.find((area) => area.owns(state)) ?? null;
}
