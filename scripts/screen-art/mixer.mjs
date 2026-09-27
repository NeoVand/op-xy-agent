/**
 * Pictograms and cell patterns the mixer area traces from TE's guide screens: mix mode pages M2–M4 (no guide art: reuse other screens' shapes if any).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/mixer.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `mixer.<name>`.
 */
// import { big } from './helpers.mjs';

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
