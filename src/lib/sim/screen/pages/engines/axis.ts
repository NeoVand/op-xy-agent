/**
 * axis's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-307…347;
 * docs/research/59-screen-profiling.md §2.5): three lines of blocks through a junction on an
 * axonometric lattice, a column standing on it, and a white ray running on down-right; the top bar
 * is plain text over it.
 *
 * The lattice (fitted, IoU 0.85 on the lit silhouette): a block's corner (x, y, z) is drawn at
 * (224.5, 119.5) + x·(14.5, −9.4) + y·(14.5, 9.4) + z·(0, −16.5).
 *
 * - tone (E1) carries the eight blocks of the x line from the down-left side of the junction
 *   (−7…0) to the up-right side (1…8): block r (0 the far end, a wedge) travels 8·tone^p with
 *   p = 7.65·0.115^(r/7), so the near blocks go first and the line spreads out on the way (fitted
 *   on seven tones, rms 0.47 block);
 * - ratio (E2) slides the y line (seven blocks, a tile, the pieces falling off its end and the ray)
 *   rigidly 4.2 blocks down-right, in proportion;
 * - shape (E3) carries the column's five blocks from under the junction to above it, as tone does
 *   (p = 6.4·0.07^(r/4); rms 0.66 block: the device's blocks cross the junction in turn, faster than
 *   this curve lets them);
 * - tremolo (E4) lifts the y line's blocks 7.3 px, one after another from its far upper end, nine
 *   blocks over the range (the camera caught whole steps only; the easing between is ours).
 *
 * Shading, as seen: the y line runs white, light, dark to its end wherever it is; the x line's far
 * end is white, and far out up-right its blocks darken and flatten into tiles; the column is white
 * with a light right face.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { COLORS } from '../../palette';
import { ease, unit } from './common';

type Vec = readonly [number, number];

/** The measured lattice (design px). */
export const AXIS = {
	origin: [224.5, 119.5] as Vec,
	e1: [14.5, -9.4] as Vec,
	e2: [14.5, 9.4] as Vec,
	e3: [0, -16.5] as Vec,
	/** Blocks on the x line and in the column, and how each line spreads (see `travelled`). */
	xBlocks: 8,
	columnBlocks: 5,
	xSpread: [7.65, 0.115],
	columnSpread: [6.4, 0.07],
	/** The y line: its first block's place at ratio 0 and how far ratio slides it. */
	yStart: -7.2,
	ySlide: 4.2,
	/** Tremolo: how far a lifted block rises (px) and over how many blocks the lift runs. */
	lift: 7.3,
	liftBlocks: 9,
	/**
	 * The ray: 2.5 px, on the line y = 0.66x − 44.5 (the same at every ratio), starting 8.53 blocks
	 * down the y line from its first block.
	 */
	ray: { width: 2.5, slope: 0.66, offset: -44.5, start: 8.53 }
} as const;

/** A lattice point on screen. */
export function lattice(x: number, y: number, z: number): Vec {
	const { origin: o, e1, e2, e3 } = AXIS;
	return [o[0] + e1[0] * x + e2[0] * y + e3[0] * z, o[1] + e1[1] * x + e2[1] * y + e3[1] * z];
}

/**
 * Where block r (0 the far end) of a line of `n` sits along it for a lane (its lower corner): from
 * −(n − 1) + r at 0 (the last block inside the junction) to 1 + r at full.
 */
export function travelled(
	r: number,
	n: number,
	v: number,
	[lead, spread]: readonly [number, number] = AXIS.xSpread
): number {
	const p = lead * Math.pow(spread, n > 1 ? r / (n - 1) : 1);
	return 1 - n + r + n * Math.pow(unit(v), p);
}

/** The y line's first block (its far upper end) for a ratio lane. */
export const yLineStart = (ratio: number): number => AXIS.yStart + AXIS.ySlide * unit(ratio);

/** How far block i of the y line is lifted (px) for a tremolo lane. */
export function liftOf(i: number, tremolo: number): number {
	return AXIS.lift * ease(unit(tremolo) * AXIS.liftBlocks - i);
}

/**
 * One block: its lattice corner, height (1 a cube, 0 a tile), lift (px), the three faces' greys, and
 * its kind (a wedge slopes down to its far end; a stand is a tile tipped up on its edge).
 */
interface Block {
	readonly kind: 'cube' | 'wedge' | 'stand';
	readonly x: number;
	readonly y: number;
	readonly z: number;
	readonly h: number;
	readonly lift: number;
	readonly top: number;
	readonly left: number;
	readonly right: number;
}

const hex = (v: number) => {
	const h = Math.round(Math.max(0, Math.min(255, v)))
		.toString(16)
		.padStart(2, '0');
	return `#${h}${h}${h}`;
};

/** Face greys (0–255) for a shade: 0 white, 1 light, 2 dark (continuous). */
function faces(shade: number): { top: number; left: number; right: number } {
	const stops = [
		{ top: 247, left: 247, right: 175 },
		{ top: 150, left: 175, right: 110 },
		{ top: 47, left: 47, right: 30 }
	];
	const s = Math.max(0, Math.min(2, shade));
	const i = Math.min(1, Math.floor(s));
	const f = s - i;
	const a = stops[i];
	const b = stops[i + 1];
	return {
		top: a.top + (b.top - a.top) * f,
		left: a.left + (b.left - a.left) * f,
		right: a.right + (b.right - a.right) * f
	};
}

/** The x line's far end is white (its first three blocks); far out up-right it darkens and flattens. */
function xShade(r: number, x: number): { shade: number; h: number } {
	const far = Math.max(0, Math.min(1, (x - 4.5) / 2));
	const flat = Math.max(0, Math.min(1, (x - 5.6) / 1.2));
	return { shade: (r < 3 ? 0 : 1) + far * (r < 3 ? 2 : 1), h: 1 - flat * 0.97 };
}

/** The y line's shades by block, from its far upper end (white) to its end (dark, a tile). */
const Y_LINE: readonly { shade: number; h: number }[] = [
	{ shade: 0, h: 1 },
	{ shade: 0, h: 1 },
	{ shade: 0, h: 1 },
	{ shade: 1, h: 1 },
	{ shade: 1, h: 1 },
	{ shade: 1.4, h: 1 },
	{ shade: 1.7, h: 1 },
	{ shade: 1.95, h: 0.05 }
];

/** The column above the junction: white, its right face light. */
const COLUMN = { top: 247, left: 247, right: 110 } as const;

/** Every block of the picture for the four lanes. */
export function axisBlocks(params: readonly number[]): Block[] {
	const [tone, ratio, shape, tremolo] = params.map(unit);
	const blocks: Block[] = [];
	const add = (
		kind: Block['kind'],
		x: number,
		y: number,
		z: number,
		shade: number,
		h = 1,
		lift = 0
	) => blocks.push({ kind, x, y, z, h, lift, ...faces(shade) });
	const nx = AXIS.xBlocks;
	for (let r = 0; r < nx; r++) {
		const x = travelled(r, nx, tone, AXIS.xSpread);
		const { shade, h } = xShade(r, x);
		add(r === 0 ? 'wedge' : 'cube', x, 0, 0, shade, h);
	}
	const nz = AXIS.columnBlocks;
	for (let r = 0; r < nz; r++) {
		const z = travelled(r, nz, shape, AXIS.columnSpread);
		// under the junction the blocks turn light, then dark and flat far down (as the x line's end)
		const below = Math.max(0, Math.min(1, -z - 0.5));
		const dark = Math.max(0, Math.min(1, (-z - 2.5) / 1.5));
		const flat = Math.max(0, Math.min(1, (-z - 3.2) / 1));
		const light = faces(1 + dark);
		const mix = (a: number, b: number) => a + (b - a) * below;
		blocks.push({
			kind: 'cube',
			x: 0,
			y: 0,
			z,
			h: 1 - 0.9 * flat,
			lift: 0,
			top: mix(COLUMN.top, light.top),
			left: mix(COLUMN.left, light.left),
			right: mix(COLUMN.right, light.right)
		});
	}
	const y0 = yLineStart(ratio);
	Y_LINE.forEach((b, i) => add('cube', 0, y0 + i, 0, b.shade, b.h, liftOf(i, tremolo)));
	// what falls off the line's end: a tile tipped up beyond it, another edge-on under it
	add('stand', 0.5, y0 + 8.8, 0.45, 1.9, 0.9);
	add('stand', 0.5, y0 + 7.5, -1.27, 1.9, 1.05);
	return blocks;
}

/** Where the ray starts and ends: on its fixed line, from past the y line's end to the screen's edge. */
export function axisRay(ratio: number): { from: Vec; to: Vec } {
	const r = AXIS.ray;
	const x0 = lattice(0.5, yLineStart(ratio) + r.start, 0)[0];
	const x1 = 482;
	return { from: [x0, r.slope * x0 + r.offset], to: [x1, r.slope * x1 + r.offset] };
}

function drawBlock(ctx: ScreenCtx, b: Block): void {
	const P = (dx: number, dy: number, dz: number): Vec => {
		const [px, py] = lattice(b.x + dx, b.y + dy, b.z + dz);
		return [px, py - b.lift];
	};
	const h = Math.max(0.02, b.h);
	let top = [P(0, 0, h), P(1, 0, h), P(1, 1, h), P(0, 1, h)];
	let left = [P(0, 0, 0), P(0, 0, h), P(0, 1, h), P(0, 1, 0)];
	let right = [P(0, 1, 0), P(0, 1, h), P(1, 1, h), P(1, 1, 0)];
	if (b.kind === 'stand') {
		// a thin tile standing in the y–z plane, facing the viewer's left
		left = [P(0, 0, 0), P(0, 0, h), P(0, 1, h), P(0, 1, 0)];
		ctx.strokeStyle = COLORS.dark;
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(left[0][0], left[0][1]);
		for (const [px, py] of left.slice(1)) ctx.lineTo(px, py);
		ctx.closePath();
		ctx.fillStyle = hex(b.left);
		ctx.fill();
		return;
	}
	if (b.kind === 'wedge') {
		// the far end slopes from the ground up to the top halfway along
		top = [P(0.5, 0, h), P(1, 0, h), P(1, 1, h), P(0.5, 1, h)];
		left = [P(0, 0, 0), P(0.5, 0, h), P(0.5, 1, h), P(0, 1, 0)];
		right = [P(0, 1, 0), P(0.5, 1, h), P(1, 1, h), P(1, 1, 0)];
	}
	const poly = (pts: Vec[], grey: number) => {
		ctx.beginPath();
		ctx.moveTo(pts[0][0], pts[0][1]);
		for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
		ctx.closePath();
		ctx.fillStyle = hex(grey);
		ctx.fill();
		ctx.stroke();
	};
	ctx.strokeStyle = COLORS.dark;
	ctx.lineWidth = 0.75;
	ctx.lineJoin = 'round';
	if (b.h > 0.1) {
		poly(left, b.left);
		poly(right, b.right);
	}
	poly(top, b.top);
}

/** Draws axis's picture under the plain header. */
export function drawAxis(ctx: ScreenCtx, frame: SynthFrame): void {
	const [, ratio] = frame.params.map(unit);
	const ray = axisRay(ratio);
	ctx.strokeStyle = COLORS.white;
	ctx.lineWidth = AXIS.ray.width;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo(ray.from[0], ray.from[1]);
	ctx.lineTo(ray.to[0], ray.to[1]);
	ctx.stroke();
	// back to front: the viewer looks from −x, +y, +z
	const blocks = axisBlocks(frame.params).sort((a, b) => -a.x + a.y + a.z - (-b.x + b.y + b.z));
	ctx.lineCap = 'butt';
	for (const b of blocks) drawBlock(ctx, b);
}
