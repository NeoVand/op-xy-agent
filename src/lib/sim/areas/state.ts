/**
 * Every area's state slice, gathered for `SimState.areas` (see `types.ts`).
 */
import { initialAuxiliary, type AuxiliaryState } from './auxiliary/state';
import { initialArrange, type ArrangeState } from './arrange/state';
import { initialMixer, type MixerState } from './mixer/state';
import { initialSample, type SampleState } from './sample/state';
import { initialSystem, type SystemState } from './system/state';
import { initialSequencer, type SequencerState } from './sequencer/state';

/** State of each area. */
export interface AreaStates {
	auxiliary: AuxiliaryState;
	arrange: ArrangeState;
	mixer: MixerState;
	sample: SampleState;
	system: SystemState;
	sequencer: SequencerState;
}

/** Every area's state in a new project. */
export function initialAreaStates(): AreaStates {
	return {
		auxiliary: initialAuxiliary(),
		arrange: initialArrange(),
		mixer: initialMixer(),
		sample: initialSample(),
		system: initialSystem(),
		sequencer: initialSequencer()
	};
}
