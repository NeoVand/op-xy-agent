/**
 * epiano's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-184…224;
 * docs/research/59-screen-profiling.md §2.5): TE's stack of four layers from the guide, the top one
 * a keyboard, which the device draws in its own shades (the second layer white, the third light
 * grey) and marks with a dark notch per parameter on the front right edge of a lower layer:
 *
 * - tone (E1) on the bottom layer, texture (E2) on the third, tine (E3) on the second, each notch
 *   sliding from the layer's front corner 84.6 px up the edge, in proportion (within 0.3 px);
 * - punch (E4) moves nothing.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { icon } from '../../icons';
import { compiled, tracePath } from '../../paths';
import { COLORS } from '../../palette';
import { unit } from './common';

/** The measured layout (design px). */
export const EPIANO = {
	/** TE's art is placed as the guide's page places it (the device agrees within a pixel). */
	art: { x: -1, y: 20.5 },
	/** The front corners of the layers the notches ride on: tone's, texture's, tine's (screen px). */
	corners: [
		[240.15, 210],
		[240.15, 190],
		[239.72, 170]
	],
	/** The front right edge's direction and how far a notch travels up it. */
	edge: [0.8614, -0.5076],
	travel: 84.6,
	/** The notch: a triangle from its corner on the edge (TE's shape). */
	notch: [
		[0, 0],
		[-2.4, -7.69],
		[10.61, -6.25]
	]
} as const;

/** TE's shapes by layer, drawn in the device's shades (their outlines as TE drew them). */
const LAYERS = [
	{ shapes: range(0, 65), fill: COLORS.dark },
	{ shapes: [65, 67, 68, 69, 70, 71, 72], fill: COLORS.grey4 },
	{ shapes: range(73, 138), fill: COLORS.white },
	{ shapes: range(138, 163), fill: null }
] as const;

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from }, (_, i) => from + i);
}

/** Where a notch's three corners sit for a lane (0–1), on layer `i` (0 tone, 1 texture, 2 tine). */
export function notchPoints(i: number, value: number): [number, number][] {
	const [cx, cy] = EPIANO.corners[i];
	const along = EPIANO.travel * unit(value);
	const [ex, ey] = EPIANO.edge;
	return EPIANO.notch.map(([dx, dy]) => [cx + ex * along + dx, cy + ey * along + dy]);
}

function drawLayers(ctx: ScreenCtx): void {
	const shapes = icon('engine.epiano').shapes;
	const { x, y } = EPIANO.art;
	for (const layer of LAYERS) {
		for (const index of layer.shapes) {
			const s = shapes[index];
			if (!s) continue;
			ctx.beginPath();
			tracePath(ctx, compiled(s.d), x, y, 1);
			// the layer's own faces take the device's shade; keys and lines keep TE's colours
			const fill = s.fill && layer.fill && s.fill !== COLORS.black ? layer.fill : s.fill;
			if (fill) {
				ctx.fillStyle = fill;
				ctx.fill();
			}
			if (s.stroke) {
				ctx.strokeStyle = s.stroke;
				ctx.lineWidth = s.width ?? 1;
				ctx.lineJoin = (s.join as CanvasLineJoin | undefined) ?? 'miter';
				ctx.stroke();
			}
		}
	}
}

/** Draws epiano's picture under the header. */
export function drawEpiano(ctx: ScreenCtx, frame: SynthFrame): void {
	drawLayers(ctx);
	ctx.fillStyle = COLORS.black;
	ctx.strokeStyle = COLORS.black;
	ctx.lineWidth = 0.5;
	for (let i = 0; i < 3; i++) {
		const pts = notchPoints(i, frame.params[i] ?? 0);
		ctx.beginPath();
		ctx.moveTo(pts[0][0], pts[0][1]);
		for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
	}
}
