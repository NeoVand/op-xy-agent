/**
 * Pictograms and cell patterns the arrange area traces from TE's guide screens: arrange mode (arrange-003, 020, 028).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/arrange.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `arrange.<name>`.
 */
// import { big } from './helpers.mjs';

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
