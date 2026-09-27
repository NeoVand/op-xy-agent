/**
 * Every area's guide-art scenarios (see `../scenarios.ts`).
 */
import type { Scenario } from '../scenarios';
import { scenarios as auxiliary } from './auxiliary/scenarios';
import { scenarios as arrange } from './arrange/scenarios';
import { scenarios as mixer } from './mixer/scenarios';
import { scenarios as sample } from './sample/scenarios';
import { scenarios as system } from './system/scenarios';
import { scenarios as sequencer } from './sequencer/scenarios';

/** Area scenarios, in area order. */
export const AREA_SCENARIOS: readonly Scenario[] = [
	...auxiliary,
	...arrange,
	...mixer,
	...sample,
	...system,
	...sequencer
];
