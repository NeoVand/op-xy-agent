/**
 * Pictograms and cell patterns the sequencer area traces from TE's guide art: the bar menu, players, step components and parameter locks (how-to-102 and others).
 * Same entry format as the core table in `../extract-screen-font.mjs` (ICONS and PATTERNS); the
 * script writes them to `knowledge/opxy/screen-icons/sequencer.json`, which `src/lib/sim/screen/icons.ts`
 * merges with the core icons. Name icons `sequencer.<name>`.
 *
 * - The fourteen step component icons are the ones TE prints on the white keys, drawn in the step
 *   components chapter's reference table (65 × 65 unit pictures, not screens: `svg` entries at one
 *   pixel per unit). Each gets a 40 px box around its own centre, so a page can centre any of them.
 * - The octave keyboard is the brain page's (how-to-102), without the dots that mark its scale:
 *   the player page puts its own dots on it for maestro's chord and hold's notes.
 */
// import { big } from './helpers.mjs';

/** The step component key icons in the guide's reference table. */
const TABLE = 'research/ui-reference/guide-svg/step-components';

/** A key icon: its file and the centre of its shapes (SVG units = screen pixels here). */
const keyIcon = (file, cx, cy) => ({
	svg: `${TABLE}/${file}`,
	box: [cx - 20, cy - 20, cx + 20, cy + 20]
});

/** Named pictograms: `name: { screen, box: [x0, y0, x1, y1], … }` or `{ svg, scale, box }`. */
export const icons = {
	'sequencer.pulse': keyIcon('025_673b3f3aba2fc3f524da9c82.svg', 32.39, 32.75),
	'sequencer.pulse-hold': keyIcon('026_673b3f3aba2fc3f524da9c64.svg', 33.45, 34.18),
	'sequencer.multiply': keyIcon('028_673b3f3aba2fc3f524da9c78.svg', 32.38, 32.24),
	'sequencer.velocity': keyIcon('030_673b3f3aba2fc3f524da9c8d.svg', 32.32, 32.32),
	'sequencer.ramp-up': keyIcon('032_673b403bba2fc3f524da9cc6.svg', 32.55, 33.18),
	'sequencer.ramp-down': keyIcon('034_673b3f3aba2fc3f524da9c92.svg', 32.45, 33.18),
	'sequencer.random': keyIcon('036_673b3f3aba2fc3f524da9c6c.svg', 32.45, 33.18),
	'sequencer.portamento': keyIcon('038_673b3f3aba2fc3f524da9c7e.svg', 32.45, 33.18),
	'sequencer.bend': keyIcon('040_673b3d60ba2fc3f524da9c20.svg', 32.45, 33.18),
	'sequencer.tonality': keyIcon('042_673dcae1c40d2a4a1a3f70e9.svg', 33.45, 34.18),
	'sequencer.jump': keyIcon('044_673b3f3aba2fc3f524da9c80.svg', 31.98, 33.18),
	'sequencer.skip-lock': keyIcon('046_673b3c2bba2fc3f524da9be1.svg', 32.44, 33.18),
	'sequencer.skip-component': keyIcon('048_673b3cc5ba2fc3f524da9bff.svg', 32.45, 34.18),
	'sequencer.skip-trigger': keyIcon('050_673b3552ba2fc3f524da9b28.svg', 34.08, 34.18),
	// the brain page's one-octave keyboard, its scale dots left out
	'sequencer.octave': {
		screen: 'how-to-102',
		box: [189, 80, 290.1, 145],
		exclude: [
			[190, 133, 289, 144],
			[256, 108, 266, 118]
		]
	}
};

/** Cell patterns: `name: { screen, cell, origin: [x, y], cols, rows }`. */
export const patterns = {};
