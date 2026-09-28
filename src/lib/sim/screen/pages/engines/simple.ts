/**
 * simple's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-101…141;
 * docs/research/59-screen-profiling.md §2.5): a slinky on a staircase, under a plain top bar.
 *
 * - The staircase is TE's from the guide, three of its four slabs, 17 px lower (fitted on the
 *   slabs' edges), in the device's shades: tops getting lighter toward the front, dark fronts.
 * - The slinky: a jar of coils (34 wide, 38 tall) with its top coil flipped up into a loop (an
 *   ellipse 20 × 29.5 leaning 18°) and two coils between them seen edge-on, thin rings leaning
 *   −41° and −24° (each fitted on every frame of the sweeps, then linear in the lanes: the steep
 *   one within 0.2 px rms, the shallow one's tip within 0.7 px).
 * - stereo (E4) parts it into two jars: the right one, with the loop and the shallow coil, moves
 *   (+21, −10.5) and the left one, with the steep coil, (−21, +10) at full, in proportion (the
 *   pair's width grows 5.2 px per 16 CC); the gaps between the jars' top coils open as they part;
 * - shape (E1) and pw (E2) move the loop (4, −2) and (3, 2.5) at full, in proportion (the loop's
 *   centre fitted on every frame of the sweeps, within 0.5 px), and the coils more (up to 10 px);
 *   noise (E3) moves nothing.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { icon } from '../../icons';
import { compiled, tracePath } from '../../paths';
import { COLORS } from '../../palette';
import { unit } from './common';

type Vec = readonly [number, number];

/** The measured layout (design px). */
export const SIMPLE = {
	/** TE's staircase art is drawn here (the guide page places it at (−1, 20.5)). */
	stairs: { x: -2.2, y: 37.8 },
	/** The jar at stereo 0: its axis, half-width, the top and bottom coils' centres, ellipse half-height. */
	jar: { x: 221.5, top: 96, bottom: 124, rx: 17, ry: 11 },
	/** How far each jar moves at full stereo. */
	right: [21, -10.5] as Vec,
	left: [-21, 10] as Vec,
	/** The loop at stereo, shape and pw 0, its size and lean, and what shape and pw add at full. */
	loop: {
		x: 207.2,
		y: 66.4,
		rx: 10,
		ry: 14.75,
		lean: 18,
		shape: [4, -2] as Vec,
		pw: [3, 2.5] as Vec
	},
	/**
	 * The two coils seen edge-on between the jars and the loop (thin rings, fitted on every frame of
	 * the sweeps): the steep one rides the left jar, its centre offset from the jar's top coil by
	 * `at` plus what each lane adds at full; the shallow one rides the right jar, placed by its upper
	 * tip (its lower half sinks into the jar).
	 */
	steep: {
		at: [-12.6, -29.2] as Vec,
		shape: [9.8, 3.7] as Vec,
		pw: [9.1, 7.9] as Vec,
		stereo: [2.2, -1] as Vec,
		rx: 14.9,
		ry: 3.1,
		lean: -41.3
	},
	shallow: {
		tip: [8.3, -25.8] as Vec,
		shape: [6.3, 8.8] as Vec,
		pw: [5.7, 5.55] as Vec,
		rx: 14,
		ry: 2.2,
		lean: -23.6
	},
	/** The coils' white band. */
	band: 2.6,
	/**
	 * The gaps between a jar's top coils: dark dashes (offset from the jar's top coil, angle in
	 * degrees, length), the same on both jars (the left one's 2 px lower; seen at stereo 0.5, 0.75
	 * and 1). They open as stereo parts the jars: the right jar's from 0 to `open[0]`, the left
	 * one's from `open[1]` to `open[2]` (none at 0 and 0.25, full at 0.5; the ramps are ours).
	 */
	gaps: [
		[10.1, -0.65, 22, 5.7],
		[6.9, 1.45, 12, 9.2],
		[0.7, 3.85, -2, 14.2],
		[-0.4, 6.6, -2.6, 8.2]
	],
	open: [0.18, 0.25, 0.5],
	gapLine: 1
} as const;

/** TE's slabs (shape indices in the guide's art: top, end face, front face), back to front. */
const SLABS = [
	{ end: 12, front: [13, 14], top: 15, topFill: COLORS.grey2, endFill: COLORS.grey3 },
	{ end: 0, front: [1, 2], top: 3, topFill: COLORS.grey3, endFill: COLORS.grey4 },
	{ end: 4, front: [5, 6], top: 7, topFill: COLORS.card, endFill: COLORS.card }
] as const;

function drawStairs(ctx: ScreenCtx): void {
	const shapes = icon('engine.simple').shapes;
	const { x, y } = SIMPLE.stairs;
	const paint = (index: number, fill: string | null) => {
		const s = shapes[index];
		if (!s) return;
		ctx.beginPath();
		tracePath(ctx, compiled(s.d), x, y, 1);
		if (fill ?? s.fill) {
			ctx.fillStyle = fill ?? s.fill ?? COLORS.black;
			ctx.fill();
		}
		if (s.stroke) {
			ctx.strokeStyle = COLORS.ink;
			ctx.lineWidth = s.width ?? 0.56;
			ctx.lineJoin = 'round';
			ctx.stroke();
		}
	};
	for (const slab of SLABS) {
		paint(slab.end, slab.endFill);
		for (const f of slab.front) paint(f, COLORS.dark);
		paint(slab.top, slab.topFill);
	}
}

/** The jars' centres (top coil) for a stereo lane: the left one, then the right one (with the loop). */
export function simpleJars(stereo: number): [Vec, Vec] {
	const s = unit(stereo);
	const { jar, right, left } = SIMPLE;
	return [
		[jar.x + left[0] * s, jar.top + left[1] * s],
		[jar.x + right[0] * s, jar.top + right[1] * s]
	];
}

/** The loop's centre for the lanes. */
export function loopCentre(shape: number, pw: number, stereo: number): Vec {
	const l = SIMPLE.loop;
	const s = unit(stereo);
	return [
		l.x + SIMPLE.right[0] * s + l.shape[0] * unit(shape) + l.pw[0] * unit(pw),
		l.y + SIMPLE.right[1] * s + l.shape[1] * unit(shape) + l.pw[1] * unit(pw)
	];
}

/** A coil drawn as a ring: centre, half-axes and lean (degrees clockwise). */
export interface Coil {
	readonly c: Vec;
	readonly rx: number;
	readonly ry: number;
	readonly lean: number;
}

/** The two edge-on coils for the lanes: the steep one (left jar), then the shallow one (right jar). */
export function simpleCoils(shape: number, pw: number, stereo: number): [Coil, Coil] {
	const [sh, p, s] = [unit(shape), unit(pw), unit(stereo)];
	const [left, right] = simpleJars(s);
	const a = SIMPLE.steep;
	const b = SIMPLE.shallow;
	const along = (b.lean * Math.PI) / 180;
	const tip: Vec = [
		right[0] + b.tip[0] + b.shape[0] * sh + b.pw[0] * p,
		right[1] + b.tip[1] + b.shape[1] * sh + b.pw[1] * p
	];
	return [
		{
			c: [
				left[0] + a.at[0] + a.shape[0] * sh + a.pw[0] * p + a.stereo[0] * s,
				left[1] + a.at[1] + a.shape[1] * sh + a.pw[1] * p + a.stereo[1] * s
			],
			rx: a.rx,
			ry: a.ry,
			lean: a.lean
		},
		{
			c: [tip[0] - b.rx * Math.cos(along), tip[1] - b.rx * Math.sin(along)],
			rx: b.rx,
			ry: b.ry,
			lean: b.lean
		}
	];
}

/** An ellipse path, `lean` degrees clockwise. */
function ellipse(ctx: ScreenCtx, [cx, cy]: Vec, rx: number, ry: number, lean: number): void {
	const a = (lean * Math.PI) / 180;
	const n = 36;
	ctx.beginPath();
	for (let i = 0; i <= n; i++) {
		const t = (2 * Math.PI * i) / n;
		const ex = rx * Math.cos(t);
		const ey = ry * Math.sin(t);
		const px = cx + ex * Math.cos(a) - ey * Math.sin(a);
		const py = cy + ex * Math.sin(a) + ey * Math.cos(a);
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

/** One jar: a white body of coils, the gaps between its top coils as dark dashes (`open` 0–1). */
function drawJar(ctx: ScreenCtx, [cx, top]: Vec, open: number, drop = 0): void {
	const { rx, ry, bottom, top: t0 } = SIMPLE.jar;
	const b = top + (bottom - t0);
	ctx.fillStyle = COLORS.white;
	ctx.beginPath();
	ctx.moveTo(cx - rx, top);
	ctx.lineTo(cx - rx, b);
	ctx.bezierCurveTo(cx - rx, b + ry * 1.33, cx + rx, b + ry * 1.33, cx + rx, b);
	ctx.lineTo(cx + rx, top);
	ctx.bezierCurveTo(cx + rx, top - ry * 1.33, cx - rx, top - ry * 1.33, cx - rx, top);
	ctx.closePath();
	ctx.fill();
	if (open <= 0) return;
	ctx.strokeStyle = COLORS.grey2;
	ctx.lineWidth = SIMPLE.gapLine;
	ctx.lineCap = 'round';
	for (const [dx, dy, angle, length] of SIMPLE.gaps) {
		const a = (angle * Math.PI) / 180;
		const h = (length * Math.min(1, open)) / 2;
		const [mx, my] = [cx + dx, top + dy + drop];
		ctx.beginPath();
		ctx.moveTo(mx - h * Math.cos(a), my - h * Math.sin(a));
		ctx.lineTo(mx + h * Math.cos(a), my + h * Math.sin(a));
		ctx.stroke();
	}
	ctx.lineCap = 'butt';
}

/** Draws simple's picture under the plain header. */
export function drawSimple(ctx: ScreenCtx, frame: SynthFrame): void {
	const [shape, pw, , stereo] = frame.params.map(unit);
	drawStairs(ctx);
	const [left, right] = simpleJars(stereo);
	const [r, l0, l1] = SIMPLE.open;
	// the right jar stands behind the left one (whose body hides its lower gaps as they part)
	if (stereo > 0.02) drawJar(ctx, right, stereo / r);
	drawJar(ctx, left, (stereo - l0) / (l1 - l0), 2);
	// the edge-on coils, then the loop, all one white band
	ctx.strokeStyle = COLORS.white;
	ctx.lineWidth = SIMPLE.band;
	const l = SIMPLE.loop;
	const coils: Coil[] = [
		...simpleCoils(shape, pw, stereo),
		{ c: loopCentre(shape, pw, stereo), rx: l.rx, ry: l.ry, lean: l.lean }
	];
	for (const coil of coils) {
		ellipse(ctx, coil.c, coil.rx, coil.ry, coil.lean);
		ctx.stroke();
	}
}
