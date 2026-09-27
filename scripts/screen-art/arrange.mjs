/**
 * Pictograms and cell patterns the arrange area traces from TE's guide screens: arrange mode (arrange-003, 020, 028).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/arrange.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `arrange.<name>`.
 */

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {
	// the auxiliary tracks' pictograms across the top of arrange-003, one per 60 px column (the
	// "CV" and "FX" lettering is heavier than the screen font: it belongs to the pictograms)
	'arrange.aux.brain': { screen: 'arrange-003', box: [20, 4, 40, 26] },
	'arrange.aux.punch': { screen: 'arrange-003', box: [80, 6, 100, 24] },
	'arrange.aux.midi': { screen: 'arrange-003', box: [139, 4, 161, 26] },
	'arrange.aux.cv': { screen: 'arrange-003', box: [200, 9, 220, 21] },
	'arrange.aux.audio': { screen: 'arrange-003', box: [258, 6, 282, 24] },
	'arrange.aux.tape': { screen: 'arrange-003', box: [316, 9, 344, 21] },
	'arrange.aux.fx1': { screen: 'arrange-003', box: [376, 6, 404, 24] },
	'arrange.aux.fx2': { screen: 'arrange-003', box: [436, 6, 464, 24] },
	// song mode (arrange-028): the loop sign in the header and the cursor arrows over M2 / M3
	'arrange.loop': { screen: 'arrange-028', box: [9, 4, 35, 22] },
	'arrange.left': { screen: 'arrange-028', box: [169, 204, 189, 216] },
	'arrange.right': { screen: 'arrange-028', box: [299, 204, 319, 216] }
};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
