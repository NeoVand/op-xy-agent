/**
 * Every area's pictogram tables, by area (see `../extract-screen-font.mjs`).
 */
import * as auxiliary from './auxiliary.mjs';
import * as arrange from './arrange.mjs';
import * as mixer from './mixer.mjs';
import * as sample from './sample.mjs';
import * as system from './system.mjs';
import * as sequencer from './sequencer.mjs';

/** Area → { icons, patterns }. */
export const AREA_ART = { auxiliary, arrange, mixer, sample, system, sequencer };
