/**
 * Pictograms and cell patterns the system area traces from TE's guide screens: project and COM sub-pages, preset browser and settings (project-004 … 019, com-014 … 039, instrument-103, 118).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/system.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `system.<name>`.
 */
// import { big } from './helpers.mjs';

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
