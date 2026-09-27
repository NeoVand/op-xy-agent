/**
 * Pictograms and cell patterns the mixer area traces from TE's guide screens. TE drew none of the
 * mixer area's own pages (mix M2–M4, the midi engine's CC pages), so these come from other screens.
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/mixer.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `mixer.<name>`.
 */

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {
	// the external audio track's output mark, an arrow into a ring in a black box (its shapes sit in
	// a text-like run, hence `text`): on mix M4 it marks where the master goes
	'mixer.output': { screen: 'auxiliary-064', box: [360, 80, 390, 110], text: true }
};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
