/**
 * M3 (filter) and its shift layer, sends (guide art instrument-032, where the graph shows dimmed
 * under the cards). The response is filled in four bands that lighten with frequency, split at the
 * 1K / 2K / 5K marks; resonance lifts a bump at the cutoff (the Q box sits on it), the envelope
 * amount hatches the range the cutoff sweeps (with a handle), key tracking shows beside "key".
 */
import type { ScreenCtx } from '../context';
import { card, disc, encoderDot, fillBox, line, text } from '../draw';
import type { FilterView, SendsFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

const LEFT = 30.5;
const RIGHT = 450.5;
const FLAT = 47.5;
/** The band area's floor, and the response's resting level just above it (TE leaves a strip). */
const FLOOR = 162.5;
const REST = 157.5;
/** Resonance lifts the peak by up to this many pixels (TE's art: 10.8 px). */
const BUMP = 27;
/** Frequency → x anchors of TE's axis (not a uniform log scale). */
const AXIS: readonly (readonly [number, number])[] = [
	[50, 30.5],
	[1000, 160.5],
	[2000, 245.5],
	[5000, 330.5],
	[20000, 450.5]
];
/** Band edges and fills, dark → light across the spectrum. */
const BANDS = [
	{ x0: 30.5, x1: 160.5, color: '#16161e' },
	{ x0: 160.5, x1: 245.5, color: '#2f2f37' },
	{ x0: 245.5, x1: 330.5, color: '#484850' },
	{ x0: 330.5, x1: 450.5, color: '#96969b' }
] as const;

/**
 * TE's response past the cutoff, as two cubic segments relative to the peak: x in pixels from the
 * cutoff, y as a fraction of the fall from the peak to the resting level. `RESTING` is the filter's
 * own curve; `SWEPT` is how far the envelope carries it in TE's art (the hatched area between).
 */
type Fall = readonly (readonly [number, number, number, number, number, number])[];
const RESTING: Fall = [
	[10.3, 0, 12.3, 0.173, 20, 0.283],
	[57.4, 0.82, 57.2, 1, 63.1, 1]
];
const SWEPT: Fall = [
	[15, 0, 32.8, 0.191, 43, 0.315],
	[81.8, 0.787, 82.3, 1, 91.3, 1]
];
/** How much wider SWEPT is than RESTING, and the envelope amount that reaches it. */
const SWEPT_STRETCH = 91.3 / 63.1;
const SWEPT_AMOUNT = 0.35;

/** x of a frequency on TE's axis (log-linear between the anchors). */
export function freqToX(hz: number): number {
	const f = Math.max(AXIS[0][0], Math.min(AXIS[AXIS.length - 1][0], hz));
	for (let i = 1; i < AXIS.length; i++) {
		const [f1, x1] = AXIS[i];
		const [f0, x0] = AXIS[i - 1];
		if (f <= f1) return x0 + ((x1 - x0) * Math.log(f / f0)) / Math.log(f1 / f0);
	}
	return RIGHT;
}

/** The cutoff's x for a 0–1 cutoff (50 Hz … 20 kHz, exponential). */
export function cutoffX(cutoff: number): number {
	return freqToX(50 * 400 ** Math.max(0, Math.min(1, cutoff)));
}

/**
 * The fall stretched by `stretch`: widening follows TE's swept curve (interpolated, and beyond it
 * extrapolated); narrowing scales the resting curve.
 */
function fallFor(stretch: number): Fall {
	if (stretch <= 1)
		return RESTING.map(
			(seg) => seg.map((v, i) => (i % 2 === 0 ? v * stretch : v)) as unknown as Fall[number]
		);
	const t = (stretch - 1) / (SWEPT_STRETCH - 1);
	return RESTING.map(
		(seg, s) => seg.map((v, i) => v + (SWEPT[s][i] - v) * t) as unknown as Fall[number]
	);
}

/** A response outline: a start point and absolute cubic segments [c1x, c1y, c2x, c2y, x, y]. */
interface Outline {
	readonly start: readonly [number, number];
	readonly segs: readonly (readonly number[])[];
}

/**
 * The response outline for a cutoff at `xc`: flat, TE's 40 px rise into the resonant peak at the
 * cutoff, the fall (stretched), then the resting level. A high-pass is the mirror image.
 */
function outline(xc: number, view: FilterView, stretch: number): Outline {
	const peak = FLAT - Math.max(0, Math.min(1, view.resonance)) * BUMP;
	const drop = REST - peak;
	const dir = view.type === 'z hipass' ? -1 : 1;
	const X = (dx: number) => xc + dir * dx;
	const flat = (dx: number, y: number) => [X(dx), y, X(dx), y, X(dx), y];
	return {
		start: [X(-1000), FLAT],
		segs: [
			flat(-40, FLAT),
			[X(-6.8), FLAT, X(-14), peak, xc, peak],
			...fallFor(stretch).map((g) => [
				X(g[0]),
				peak + g[1] * drop,
				X(g[2]),
				peak + g[3] * drop,
				X(g[4]),
				peak + g[5] * drop
			]),
			flat(1000, REST)
		]
	};
}

/** Adds the area under an outline (down to the floor) to the current path. */
function traceArea(ctx: ScreenCtx, shape: Outline): void {
	ctx.moveTo(shape.start[0], FLOOR);
	ctx.lineTo(shape.start[0], shape.start[1]);
	for (const g of shape.segs) ctx.bezierCurveTo(g[0], g[1], g[2], g[3], g[4], g[5]);
	const last = shape.segs[shape.segs.length - 1];
	ctx.lineTo(last[4], FLOOR);
	ctx.closePath();
}

/** x where an outline first reaches height `y` (sampled; only the fall reaches below the flat). */
function crossing(shape: Outline, y: number): number | null {
	let [x0, y0] = shape.start;
	for (const g of shape.segs) {
		const [sx, sy] = [x0, y0];
		for (let i = 1; i <= 48; i++) {
			const t = i / 48;
			const u = 1 - t;
			const x = u * u * u * sx + 3 * u * u * t * g[0] + 3 * u * t * t * g[2] + t * t * t * g[4];
			const yy = u * u * u * sy + 3 * u * u * t * g[1] + 3 * u * t * t * g[3] + t * t * t * g[5];
			if (y0 < y && yy >= y) return x0 + ((x - x0) * (y - y0)) / (yy - y0);
			x0 = x;
			y0 = yy;
		}
	}
	return null;
}

/** How far the envelope stretches the fall for an amount −1…1 (TE's art: 0.35 → its swept curve). */
function stretchFor(amount: number): number {
	const a = Math.max(-1, Math.min(1, amount));
	const k = (SWEPT_STRETCH - 1) / SWEPT_AMOUNT;
	return a >= 0 ? 1 + k * a : 1 / (1 - k * a);
}

/** Draws the filter graph (M3). */
export function drawFilter(ctx: ScreenCtx, view: FilterView): void {
	const xc = cutoffX(view.cutoff);
	text(ctx, view.type, 35, 42.5, 10, COLORS.white);
	const resting = outline(xc, view, 1);
	ctx.save();
	ctx.beginPath();
	ctx.rect(LEFT, 0, RIGHT - LEFT, FLOOR);
	ctx.clip();

	// envelope sweep first: hatching between the resting and the swept response
	const amount = Math.max(-1, Math.min(1, view.envAmount));
	const swept = Math.abs(amount) > 0.01 ? outline(xc, view, stretchFor(amount)) : null;
	if (swept) {
		ctx.save();
		ctx.beginPath();
		traceArea(ctx, resting);
		traceArea(ctx, swept);
		ctx.clip('evenodd');
		ctx.strokeStyle = COLORS.grey4;
		ctx.lineWidth = 0.56;
		ctx.beginPath();
		for (let d = LEFT - 140; d < RIGHT + 5; d += 5) {
			ctx.moveTo(d, FLOOR);
			ctx.lineTo(d + 142.5, FLOOR - 142.5);
		}
		ctx.stroke();
		ctx.restore();
	}

	// the response, banded, each band edged in black like TE's
	ctx.save();
	ctx.beginPath();
	traceArea(ctx, resting);
	ctx.clip();
	for (const band of BANDS) fillBox(ctx, band.x0, 20, band.x1 - band.x0, FLOOR - 20, band.color);
	for (const band of BANDS.slice(1)) line(ctx, band.x0, 20, band.x0, FLOOR, COLORS.black, 1.59);
	line(ctx, xc, 20, xc, FLOOR, COLORS.black, 1.59);
	ctx.restore();
	ctx.strokeStyle = COLORS.black;
	ctx.lineWidth = 1.59;
	ctx.beginPath();
	traceArea(ctx, resting);
	ctx.stroke();
	ctx.restore();

	// the envelope's handle, 45 % of the way across the hatching at mid-fall (as in TE's art)
	if (swept) {
		const peak = FLAT - Math.max(0, Math.min(1, view.resonance)) * BUMP;
		const y = (peak + REST) / 2 + 1.8;
		const a = crossing(resting, y);
		const b = crossing(swept, y);
		if (a !== null && b !== null) disc(ctx, a + 0.455 * (b - a), y, 5, COLORS.grey2);
	}
	// resonance: the Q box on the cutoff
	fillBox(ctx, xc - 20, 87.5, 40, 25, COLORS.black, 2.5);
	text(ctx, 'Q', xc, 107.3, 20, COLORS.white, 'center');

	// axis
	text(ctx, '50', LEFT, 172.5, 10, COLORS.light);
	text(ctx, '1K', 160.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '2K', 245.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '5K', 330.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '20kHz', RIGHT, 172.5, 10, COLORS.light, 'right');

	// key tracking
	text(ctx, 'key', 30.5, 200, 20, COLORS.light);
	drawIcon(ctx, 'filter.arrow', 69, 184, {
		alpha: 0.25 + 0.75 * Math.max(0, Math.min(1, view.keyTracking))
	});
}

/** Send card icons in encoder order: aux out, tape, FX I, FX II (the guide text's order). */
const SEND_ICONS = [
	{ name: 'sends.aux', x: 159, y: 32 },
	{ name: 'sends.tape', x: 159, y: 78 },
	{ name: 'sends.fx1', x: 159, y: 155 },
	{ name: 'sends.fx2', x: 159, y: 115 }
] as const;

/** Shift + M3: four send cards over the dimmed filter graph. */
export function drawSends(ctx: ScreenCtx, frame: SendsFrame): void {
	ctx.save();
	ctx.globalAlpha = 0.5;
	drawFilter(ctx, frame.filter);
	ctx.restore();
	frame.values.forEach((value, i) => {
		const top = 30 + 40 * i;
		card(ctx, 155, top, 200, 35);
		const icon = SEND_ICONS[i];
		// each icon is placed in its card: shift from the card it was drawn in
		const drawnTop = [30, 70, 150, 110][i];
		drawIcon(ctx, icon.name, icon.x, icon.y - drawnTop + top);
		text(ctx, value, 220, top + 25, 20, COLORS.black);
		encoderDot(ctx, i as 0 | 1 | 2 | 3, 340, top + 5, COLORS.black);
	});
}
