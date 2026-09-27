/**
 * Pictograms and cell patterns the sample area traces from TE's guide screens: the sample key and sampler pages (sample-003 … 140).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/sample.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `sample.<name>`.
 */

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {
	// the record page's input source: the built-in microphone in its box (sample-003)
	'sample.mic': { screen: 'sample-003', box: [455, 29.5, 465.5, 55.5] },
	// the play key's triangle on the library record page, dim until there is a take (sample-004)
	'sample.play': { screen: 'sample-004', box: [167.5, 199.5, 182.5, 215.5] },
	// the synth sampler's root-key badge: a box with an arrow, the key's letter set beside it
	'sample.root': { screen: 'sample-025', box: [439.5, 4.5, 470.5, 20.5] }
};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
