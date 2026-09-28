/**
 * The master EQ's picture on mix M2, as the device draws it (camera frames steps-018…038 and
 * b1-136…170, docs/research/59-screen-profiling.md §2.10): an axonometric floor of rhombic cells
 * with three rows of hinged panels — two large ones for the lows, four for the mids, eight small
 * ones for the highs — that lie flat at a full cut and lean up to 60° at full boost, leaving their
 * footprints black; beside them a slot with a small cylinder knob and an "N" at its near end.
 * Everything is placed in floor cells: `u` runs up and to the right on the screen, `v` down and to
 * the right, and heights stand straight up.
 *
 * All sizes were measured on the realigned captures and converted to the 480 × 220 design grid; the
 * pure functions here turn EQ settings into that geometry, `draw.ts` paints it.
 */

/** A point on the screen, design px. */
export type Point = readonly [number, number];

/**
 * The floor's projection: a grid vertex, and the screen steps of one cell along `u` and `v` (the
 * lines run at slopes of ∓2/3; a cell is 29.9 px wide and 19.9 px tall).
 */
export const FLOOR = { x: 0.634, y: 10.394, u: [14.944, -9.95], v: [14.948, 9.952] } as const;
/** Screen px per cell of height: the device draws heights taller than a true projection would. */
export const HEIGHT = 19.8;
/** How far a panel leans at a full boost (it lies flat at a full cut). */
export const MAX_TILT = Math.PI / 3;

/** The screen point of floor position (`u`, `v`) raised by `h` cells. */
export function floorPoint(u: number, v: number, h = 0): Point {
	return [
		FLOOR.x + u * FLOOR.u[0] + v * FLOOR.v[0],
		FLOOR.y + u * FLOOR.u[1] + v * FLOOR.v[1] - h * HEIGHT
	];
}

/** The floor position under a screen point (the inverse of {@link floorPoint} at height 0). */
export function floorAt(x: number, y: number): readonly [number, number] {
	const [a, c] = FLOOR.u;
	const [b, d] = FLOOR.v;
	const det = a * d - b * c;
	const dx = x - FLOOR.x;
	const dy = y - FLOOR.y;
	return [(d * dx - b * dy) / det, (a * dy - c * dx) / det];
}

/**
 * One panel: it spans `u0`…`u1`, is hinged along the line `v = hinge` and, lying flat, reaches back
 * `depth` cells to `v = hinge − depth`.
 */
export interface EqPanel {
	readonly band: 0 | 1 | 2;
	readonly u0: number;
	readonly u1: number;
	readonly hinge: number;
	readonly depth: number;
}

/** Every panel in drawing order, back to front: rows of eight cells from v 8 to 16. */
export const EQ_PANELS: readonly EqPanel[] = (() => {
	const rows = [
		{ band: 0, u0: -3, u1: 1, depth: 4 },
		{ band: 1, u0: 2, u1: 4, depth: 2 },
		{ band: 2, u0: 5, u1: 6, depth: 1 }
	] as const;
	const panels = rows.flatMap((row) =>
		Array.from({ length: 8 / row.depth }, (_, i) => ({ ...row, hinge: 8 + row.depth * (i + 1) }))
	);
	// nearer means further down the floor (larger v), then further left (smaller u)
	return panels.sort((p, q) => p.hinge - q.hinge || q.u0 - p.u0);
})();

/**
 * A panel's outline at `tilt` (0–1 of {@link MAX_TILT}): the hinge's ends, then the free edge's.
 */
export function panelOutline(panel: EqPanel, tilt: number): readonly Point[] {
	const a = Math.max(0, Math.min(1, tilt)) * MAX_TILT;
	const back = panel.hinge - panel.depth * Math.cos(a);
	const up = panel.depth * Math.sin(a);
	return [
		floorPoint(panel.u0, panel.hinge),
		floorPoint(panel.u1, panel.hinge),
		floorPoint(panel.u1, back, up),
		floorPoint(panel.u0, back, up)
	];
}

/**
 * A panel's shadow: the footprint it lay on, black wherever the raised panel leaves it uncovered
 * (at every tilt the black ends where the flat panel's edge was).
 */
export function panelShadow(panel: EqPanel): readonly Point[] {
	const back = panel.hinge - panel.depth;
	return [
		floorPoint(panel.u0, panel.hinge),
		floorPoint(panel.u1, panel.hinge),
		floorPoint(panel.u1, back),
		floorPoint(panel.u0, back)
	];
}

/** The slot's tray: the floor cells u 7…8, v 8…16, a step darker than the floor. */
export const TRAY = { u0: 7, u1: 8, v0: 8, v1: 16 } as const;
/** The black groove along the tray's middle, with round ends. */
export const GROOVE = { u: 7.5, halfWidth: 0.185, v0: 8.27, v1: 15.69 } as const;
/** Where the knob stands along the groove: in its near end at rest, at `end` at its stop. */
export const KNOB_TRAVEL = { rest: 15.5, end: 9.47 } as const;
/** The "N" in the cell past the tray: its two uprights (at `u`) and the diagonal between them. */
export const N_GLYPH = { u: [7.32, 7.68], v: [16.22, 16.78] } as const;

/**
 * The bands as the picture shows them, −1…1: the set bands bent by E4's morph (0–1) toward the lows
 * and highs cut and the mids boosted, where the device's E4 takes them (frames b1-156…170).
 */
export function shownBands(bands: readonly number[], morph: number): [number, number, number] {
	const m = Math.max(0, Math.min(1, morph));
	const target = [-1, 1, -1];
	return [0, 1, 2].map((i) => {
		const b = Math.max(-1, Math.min(1, bands[i] ?? 0));
		return b + m * (target[i] - b);
	}) as [number, number, number];
}

/** How far each row of panels leans (0–1 of {@link MAX_TILT}): flat at a full cut, half at 0. */
export function eqTilts(bands: readonly number[], morph: number): [number, number, number] {
	return shownBands(bands, morph).map((b) => (b + 1) / 2) as [number, number, number];
}

/**
 * The knob's travel from rest (0) to its stop (1): how far the shown bands are from flat, on
 * average. One band at a full cut or boost takes it a third of the way, half a cut or boost a sixth
 * (frames steps-019…033); E4's morph all the way takes every band to an end, and the knob to its
 * stop.
 */
export function knobTravel(bands: readonly number[], morph: number): number {
	const shown = shownBands(bands, morph);
	return Math.min(1, shown.reduce((sum, b) => sum + Math.abs(b), 0) / 3);
}
