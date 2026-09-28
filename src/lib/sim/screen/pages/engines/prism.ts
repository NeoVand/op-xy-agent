/**
 * prism's M1 picture as the device draws it (camera, OS 1.1.33: the quiet CC sweeps steps-061…096
 * and the playing frames b1-1285…1343; docs/research/59-screen-profiling.md §2.5):
 *
 * - shape (E1) grows an outlined triangle about a fixed middle: its side is 59.6 + 30.9·shape^1.5
 *   px (within 0.05 px over nine values), its height 0.87 of that (a hair over equilateral);
 * - ratio (E2) thickens the grey convex lens continuously (not in its ten zones): the left face is
 *   fixed, the right one bulges from flat to 14.6 px;
 * - detune (E3) slides the light grey concave lens 40 px right;
 * - stereo (E4) opens the arrowhead's arms about its tip, from 4.3° to 23.7° each.
 *
 * While notes sound, light runs through them: a beam from the left edge, split by the triangle into
 * three rays, focused by the convex lens and spread by the concave one. The rays follow the device's
 * paths, fitted as thin lenses (0.2 px on the convex lens); inside the lenses they are drawn dark.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';
import { COLORS } from '../../palette';
import { fadingLine, lerp, motionOf, polyline, unit, type Motion } from './common';

/** The measured layout (design px). */
export const PRISM = {
	/**
	 * The triangle (its outline's middle line): middle of apex and base, side = side + grow·shape^power,
	 * height = tall·side, a 2 px white outline.
	 */
	triangle: { x: 74.04, y: 119.87, side: 59.6, grow: 30.92, power: 1.5, tall: 0.87, stroke: 2 },
	/**
	 * The convex lens: the flat face at ratio 0 (x) and the left face's circle (centre `left` px
	 * right of it, radius), both faces meeting at the tips; the right face bulges `bulge`·ratio.
	 */
	convex: { x: 180.75, y: 119.85, left: 48.75, radius: 64.5, bulge: 14.6 },
	/** The concave lens: centre x at detune 0 and its travel, flat top and bottom, concave sides. */
	concave: {
		x: 279.7,
		travel: 39.9,
		y: 119.75,
		top: 79.25,
		bottom: 160.25,
		radius: 66,
		offset: 73.35
	},
	/**
	 * The arrowhead: body tip, the arms' apex, their half-angle (° at stereo 0, and its growth),
	 * length and stroke; the body's corners on the arms; the dark disc and the thin ring in it.
	 */
	wedge: {
		tip: [470, 120.5],
		apex: [468.8, 120.5],
		angle: 4.32,
		open: 19.36,
		arm: 91.4,
		stroke: 2.5,
		corner: 80,
		bulge: 84.3,
		disc: { x: 381.6, y: 120.6, r: 19.2 },
		ring: 29.9
	}
} as const;

/**
 * The rays (fitted on 16 playing frames): the beam's height; the three rays' common origin past the
 * triangle and their slopes, at the smallest triangle and at the largest (between them, by the
 * triangle's side); the convex lens as a thin lens (plane, axis, focal length at ratio 0 and its
 * shortening); the concave lens moves the rays' crossing point `concaveK` of the way towards itself
 * (a lens whose power follows the distance, as measured); where the rays fade and end.
 */
export const RAYS = {
	beam: 126.2,
	small: { side: 60.5, origin: [100.8, 118.1], slopes: [0.094, 0.191, 0.285] },
	large: { side: 90.5, origin: [107.8, 114.0], slopes: [0.175, 0.273, 0.382] },
	convex: { x: 180.5, axis: 120.9, focal: 38.75, shorten: 5.5 },
	concave: { axis: 119.7, k: 0.415 },
	fade: [356, 374],
	width: 2
} as const;

type Point = readonly [number, number];

/** The triangle's corners for a shape lane (0–1). */
export function prismTriangle(shape: number): {
	apex: Point;
	left: Point;
	right: Point;
	side: number;
} {
	const t = PRISM.triangle;
	const side = t.side + t.grow * Math.pow(unit(shape), t.power);
	const h = side * t.tall;
	return {
		apex: [t.x, t.y - h / 2],
		left: [t.x - side / 2, t.y + h / 2],
		right: [t.x + side / 2, t.y + h / 2],
		side
	};
}

/** The convex lens's right face: its bulge (px) for a ratio lane. */
export const convexBulge = (ratio: number): number => PRISM.convex.bulge * unit(ratio);

/** The concave lens's centre x for a detune lane. */
export const concaveX = (detune: number): number =>
	PRISM.concave.x + PRISM.concave.travel * unit(detune);

/** The arms' half-angle (radians) for a stereo lane. */
export const wedgeAngle = (stereo: number): number =>
	((PRISM.wedge.angle + PRISM.wedge.open * unit(stereo)) * Math.PI) / 180;

/** Where two lines meet: (p, slope m) with the segment a–b's line. */
function meet(p: Point, m: number, a: Point, b: Point): Point {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	// p + t·(1, m) = a + s·(dx, dy)
	const t = (dy * (a[0] - p[0]) - dx * (a[1] - p[1])) / (dy - dx * m);
	return [p[0] + t, p[1] + m * t];
}

/** One ray's path: from the triangle's entry point to its end (the beam before it is shared). */
export interface Ray {
	readonly points: readonly Point[];
}

/** The beam's entry point and the three rays for the four lanes. */
export function prismRays(params: readonly number[]): { entry: Point; rays: Ray[] } {
	const [shape, ratio, detune] = params.map(unit);
	const tri = prismTriangle(shape);
	const entry = meet([0, RAYS.beam], 0, tri.left, tri.apex);
	const t = unit((tri.side - RAYS.small.side) / (RAYS.large.side - RAYS.small.side));
	const origin: Point = [
		lerp(RAYS.small.origin[0], RAYS.large.origin[0], t),
		lerp(RAYS.small.origin[1], RAYS.large.origin[1], t)
	];
	const lens = RAYS.convex;
	const f = lens.focal - lens.shorten * unit(ratio);
	// the thin lens images the rays' origin: every ray crosses there after the lens
	const u = lens.x - origin[0];
	const v = 1 / (1 / f - 1 / u);
	const focus: Point = [lens.x + v, lens.axis - (v / u) * (origin[1] - lens.axis)];
	const cx = concaveX(detune);
	const k = RAYS.concave.k;
	const source: Point = [
		cx - k * (cx - focus[0]),
		RAYS.concave.axis + k * (focus[1] - RAYS.concave.axis)
	];
	const end = RAYS.fade[1];
	const c = PRISM.convex;
	const cc = PRISM.concave;
	const b = convexBulge(ratio);
	const h = Math.sqrt(c.radius ** 2 - c.left ** 2);
	const r = b > 0.05 ? (h * h + b * b) / (2 * b) : 0;
	const rays = RAYS.small.slopes.map((s0, i) => {
		const m = lerp(s0, RAYS.large.slopes[i], t);
		const exit = meet(origin, m, tri.apex, tri.right);
		const y1 = origin[1] + m * (lens.x - origin[0]);
		const m1 = m - (y1 - lens.axis) / f;
		const y2 = y1 + m1 * (cx - lens.x);
		const m2 = (y2 - source[1]) / (cx - source[0]);
		// the bends are drawn at the glass's faces, as the device draws them: the ray meets a lens on
		// its way in and leaves it on its way out, straight in between
		const into = (
			x0: number,
			y0: number,
			slope: number,
			centre: Point,
			radius: number,
			side: 1 | -1
		) => onCircle([x0, y0], slope, centre, radius, side);
		const inConvex = into(lens.x, y1, m, [c.x + c.left, c.y], c.radius, -1);
		const outConvex =
			r > 0
				? into(lens.x, y1, m1, [c.x + b - r, c.y], r, 1)
				: ([c.x, y1 + m1 * (c.x - lens.x)] as Point);
		const inConcave = into(cx, y2, m1, [cx - cc.offset, cc.y], cc.radius, 1);
		const outConcave = into(cx, y2, m2, [cx + cc.offset, cc.y], cc.radius, -1);
		return {
			points: [
				entry,
				exit,
				inConvex,
				outConvex,
				inConcave,
				outConcave,
				[end, y2 + m2 * (end - cx)]
			] as Point[]
		};
	});
	return { entry, rays };
}

/**
 * Where the line through `p` with slope `m` meets a circle: on its right half (`side` 1) or its left
 * half (−1). Falls back to `p` if they miss.
 */
function onCircle(p: Point, m: number, centre: Point, radius: number, side: 1 | -1): Point {
	// (x − cx)² + (p_y + m(x − p_x) − cy)² = r²
	const dy = p[1] - m * p[0] - centre[1];
	const qa = 1 + m * m;
	const qb = 2 * (m * dy - centre[0]);
	const qc = centre[0] ** 2 + dy * dy - radius * radius;
	const disc = qb * qb - 4 * qa * qc;
	if (disc < 0) return p;
	const x = (-qb + side * Math.sqrt(disc)) / (2 * qa);
	return [x, p[1] + m * (x - p[0])];
}

/**
 * How bright the rays are: a quick rise on each note, settling to a glow while it holds, and a fade
 * once the notes stop (ours: the device's frames show bright and faint rays but no timing).
 */
export function rayLevel(motion: Motion): number {
	if (motion.notes <= 0) {
		return motion.release === null ? 0 : 0.6 * Math.exp(-motion.release / 150);
	}
	if (motion.onset === null) return 1;
	const rise = Math.min(1, motion.onset / 40);
	return rise * (0.6 + 0.4 * Math.exp(-motion.onset / 400));
}

function trianglePath(ctx: ScreenCtx, shape: number): void {
	const { apex, left, right } = prismTriangle(shape);
	ctx.beginPath();
	ctx.moveTo(apex[0], apex[1]);
	ctx.lineTo(right[0], right[1]);
	ctx.lineTo(left[0], left[1]);
	ctx.closePath();
}

function convexPath(ctx: ScreenCtx, ratio: number): void {
	const c = PRISM.convex;
	const phi = Math.acos(c.left / c.radius);
	const h = c.radius * Math.sin(phi);
	const b = convexBulge(ratio);
	ctx.beginPath();
	ctx.moveTo(c.x, c.y - h);
	ctx.arc(c.x + c.left, c.y, c.radius, Math.PI + phi, Math.PI - phi, true);
	if (b < 0.05) {
		ctx.lineTo(c.x, c.y - h);
	} else {
		const r = (h * h + b * b) / (2 * b);
		const psi = Math.asin(h / r);
		ctx.arc(c.x + b - r, c.y, r, psi, -psi, true);
	}
	ctx.closePath();
}

function concavePath(ctx: ScreenCtx, detune: number): void {
	const c = PRISM.concave;
	const x = concaveX(detune);
	const half = c.y - c.top;
	const phi = Math.asin(half / c.radius);
	const corner = c.offset - c.radius * Math.cos(phi);
	ctx.beginPath();
	ctx.moveTo(x - corner, c.top);
	ctx.lineTo(x + corner, c.top);
	ctx.arc(x + c.offset, c.y, c.radius, Math.PI + phi, Math.PI - phi, true);
	ctx.lineTo(x - corner, c.bottom);
	ctx.arc(x - c.offset, c.y, c.radius, phi, -phi, true);
	ctx.closePath();
}

/** The arrowhead: its white body, the dark disc and ring, then the arms over them. */
function drawWedge(ctx: ScreenCtx, stereo: number): void {
	const w = PRISM.wedge;
	const a = wedgeAngle(stereo);
	const [ax, ay] = w.apex;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	// the body's left side bends like TE's art, flattened as the arms close (its middle hides under
	// the disc at every setting)
	const k = sin / Math.sin((21.8 * Math.PI) / 180);
	const p1: Point = [ax - w.corner * cos, ay - w.corner * sin];
	const p2: Point = [ax - w.corner * cos, ay + w.corner * sin];
	const bx = w.tip[0] - w.bulge;
	const body = () => {
		ctx.beginPath();
		ctx.moveTo(w.tip[0], w.tip[1]);
		ctx.lineTo(p1[0], p1[1]);
		ctx.bezierCurveTo(p1[0] - 4.6 * k, p1[1] + 10.4 * k, bx, ay - 12.1 * k, bx, ay);
		ctx.bezierCurveTo(bx, ay + 12.1 * k, p2[0] - 4.6 * k, p2[1] - 10.4 * k, p2[0], p2[1]);
		ctx.closePath();
	};
	ctx.fillStyle = COLORS.white;
	body();
	ctx.fill();
	ctx.fillStyle = COLORS.black;
	ctx.beginPath();
	ctx.arc(w.disc.x, w.disc.y, w.disc.r, 0, Math.PI * 2);
	ctx.fill();
	// the ring shows only on the body
	ctx.save();
	body();
	ctx.clip();
	ctx.strokeStyle = COLORS.grey3;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(w.disc.x, w.disc.y, w.ring, 0, Math.PI * 2);
	ctx.stroke();
	ctx.restore();
	polyline(
		ctx,
		[
			[ax - w.arm * cos, ay - w.arm * sin],
			[ax, ay],
			[ax - w.arm * cos, ay + w.arm * sin]
		],
		COLORS.white,
		w.stroke,
		'round',
		'round'
	);
}

/** The rays: white in the air, dark inside the lenses, fading out before the arrowhead. */
function drawRays(ctx: ScreenCtx, params: readonly number[], level: number): void {
	if (level <= 0) return;
	const [, ratio, detune] = params.map(unit);
	const { entry, rays } = prismRays(params);
	ctx.save();
	ctx.globalAlpha *= level;
	const [from, to] = RAYS.fade;
	polyline(ctx, [[0, RAYS.beam], entry], COLORS.white, RAYS.width);
	for (const ray of rays) {
		const pts = ray.points;
		const last = pts.length - 1;
		polyline(ctx, pts.slice(0, last), COLORS.white, RAYS.width);
		const [x0, y0] = pts[last - 1];
		const [x1, y1] = pts[last];
		fadingLine(ctx, x0, y0, x1, y1, from, to, COLORS.white, RAYS.width);
	}
	// inside the glass the rays are dark
	for (const clip of [() => convexPath(ctx, ratio), () => concavePath(ctx, detune)]) {
		ctx.save();
		clip();
		ctx.clip();
		for (const ray of rays) polyline(ctx, ray.points, COLORS.ink, 1);
		ctx.restore();
	}
	ctx.restore();
}

/** Draws prism's picture under the header. */
export function drawPrism(ctx: ScreenCtx, frame: SynthFrame, tick = 0): void {
	const [shape, ratio, detune, stereo] = frame.params.map(unit);
	const t = PRISM.triangle;
	ctx.fillStyle = COLORS.grey1;
	convexPath(ctx, ratio);
	ctx.fill();
	ctx.fillStyle = COLORS.light;
	concavePath(ctx, detune);
	ctx.fill();
	drawWedge(ctx, stereo);
	drawRays(ctx, frame.params, rayLevel(motionOf(frame, tick)));
	ctx.strokeStyle = COLORS.white;
	ctx.lineWidth = t.stroke;
	ctx.lineJoin = 'miter';
	trianglePath(ctx, shape);
	ctx.stroke();
}
