/**
 * Helpers for the pictogram tables (`../extract-screen-font.mjs` and the area modules beside this
 * file). A shape is `{ box: { x0, y0, x1, y1 }, … }` in screen pixels.
 */

/** Width and height of a box. */
export const boxW = (b) => b.x1 - b.x0;
export const boxH = (b) => b.y1 - b.y0;

/** A `keep` filter: only shapes at least `min` px wide or tall. */
export const big = (min) => (s) => boxW(s.box) >= min || boxH(s.box) >= min;
