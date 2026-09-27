/**
 * Pictograms and cell patterns the system area traces from TE's guide screens: project and COM sub-pages, preset browser and settings (project-004 … 019, com-014 … 039, instrument-103, 118).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/system.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `system.<name>`.
 */

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {
	// controller and MTP mode: the device on its white card (TE masks a whole device to the card),
	// the laptop it is wired to, and the keyboard controller mode adds
	'system.device': { screen: 'com-039', box: [4, 4, 236, 191], masked: true },
	'system.laptop': { screen: 'com-039', box: [319, 19, 404, 145] },
	'system.keys': { screen: 'com-022', box: [319, 157, 403, 188] },
	// devices: the MIDI socket picture of the chosen device, and a bluetooth device's wireless mark
	'system.din': { screen: 'com-030', box: [178, 19, 231, 82] },
	'system.wireless': { screen: 'com-030', box: [127, 84, 145, 95] }
};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
