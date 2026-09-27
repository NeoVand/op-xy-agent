/**
 * Pictograms and cell patterns the auxiliary area traces from TE's guide screens: auxiliary tracks (auxiliary-004 … 130).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/auxiliary.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `auxiliary.<name>`.
 *
 * The boxes hold no lettering, so `text: true` keeps pictograms that the font pass could mistake for
 * lone glyphs (the head, the DIN socket, the microphone are single filled shapes of glyph size).
 */

/** The voltmeter's needle is its only 2 px stroke; the page draws it at the output voltage. */
const notNeedle = (s) => !(s.stroke !== 'none' && s.strokeWidth > 1.5);

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }`. */
export const icons = {
	// brain (T1 M1): the head on the auto card, left of the separator at x 65
	'auxiliary.brain': { screen: 'auxiliary-004', box: [0, 80, 64, 145], text: true },
	// external midi (T3 M1): the DIN socket on its card, and the arrow above it (tinted below)
	'auxiliary.din': { screen: 'auxiliary-031', box: [111, 81, 175, 145], text: true },
	'auxiliary.arrow': { screen: 'auxiliary-031', box: [137, 61, 149, 76], text: true },
	// external cv (T4): the voltmeter with its scale, the V and the DC mark, without the needle
	'auxiliary.meter': {
		screen: 'auxiliary-057',
		box: [175, 75, 305, 221],
		text: true,
		keep: notNeedle
	},
	// external audio (T5 M1): the microphone in the input card, the return box above mix
	'auxiliary.mic': { screen: 'auxiliary-064', box: [115, 85, 150, 146], text: true },
	'auxiliary.return': { screen: 'auxiliary-064', box: [360, 80, 390, 110], text: true },
	// tape (T6 M1): the two reels and the tape between them
	'auxiliary.reels': { screen: 'auxiliary-099', box: [196, 19, 284, 61] }
};

/**
 * Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. The punch-in picture is a
 * 40 × 18 matrix of round dots, 12 px across on an 11.97 px pitch; the grid keeps which are lit and
 * the page draws them as dots at the true pitch (not as the squares `drawPattern` paints).
 */
export const patterns = {
	'auxiliary.punch': {
		screen: 'auxiliary-021',
		cell: 12,
		origin: [0.49, 2.2],
		cols: 40,
		rows: 18
	}
};
