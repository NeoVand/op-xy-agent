/**
 * Every area's frames, gathered into `ScreenFrame` (see `types.ts`).
 */
import type { AuxiliaryFrame } from './auxiliary/frames';
import type { ArrangeFrame } from './arrange/frames';
import type { MixerFrame } from './mixer/frames';
import type { SampleFrame } from './sample/frames';
import type { SystemFrame } from './system/frames';
import type { SequencerFrame } from './sequencer/frames';

/** A frame drawn by an area. */
export type AreaFrame =
	AuxiliaryFrame | ArrangeFrame | MixerFrame | SampleFrame | SystemFrame | SequencerFrame;
