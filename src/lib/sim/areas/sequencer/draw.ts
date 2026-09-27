/**
 * Drawing the sequencer area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry per
 * frame page, with a short spoken description for screen readers.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { SequencerFrame } from './frames';

export const drawers: AreaDrawers<SequencerFrame> = {};
