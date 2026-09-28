/**
 * M3 (filter) and its shift layer, the sends, as the device draws them: measured on the owner's
 * OS 1.1.33 unit by camera (docs/research/59-screen-profiling.md §2.3). TE's guide art
 * (instrument-032) drew a resonant peak, a Q box and a "key" label; the device draws none of them.
 *
 * - The response is one drawing for every lowpass type (ladder, svf, z lowpass): a flat top, a
 *   smooth fall and a strip resting on the floor, filled in four bands that lighten across the
 *   spectrum. The cutoff slides it without changing its shape; z hipass mirrors it.
 * - A black box holding the resonance (00–99) sits at the cutoff, higher the more resonance:
 *   resonance moves nothing else.
 * - A positive envelope amount hatches the area up to a ghost of the response at the cutoff plus
 *   the amount.
 * - Key tracking slides an arrow along the bottom.
 * - Shift: four white send cards (aux out, tape, FX I, FX II) over the page at 40 %.
 */
import type { ScreenCtx } from '../context';
import { encoderDot, fillBox, line, text } from '../draw';
import type { FilterView, SendsFrame } from '../frame';
import { drawIcon, icon } from '../icons';
import { COLORS, RAMP } from '../palette';
import { compiled, tracePath } from '../paths';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The graph: the fill spans x 30…450 from its flat top to the floor, resting on a strip above it. */
const FILTER_GRAPH = {
	left: 30,
	right: 450,
	top: 60.2,
	rest: 160.75,
	floor: 171.25
} as const;

/** The dividers between the bands: 1 px black lines under the 1k, 2k and 5k marks. */
const DIVIDERS = [159.5, 248.5, 328.5] as const;

/**
 * The bands' greys, dark to white across the spectrum, picked by the bands' brightness on the
 * captures (54, 162, 192 and a saturated 255) against the mixer strips' palette greys read by the
 * same camera: TE's near-black panel tone, then ramp steps 3, 4 and 7 (their hue on the captures is
 * the camera's cast).
 */
const BAND_FILLS = [COLORS.panel, RAMP[3], RAMP[4], RAMP[7]] as const;

/**
 * The lowpass drawing around its knee, the point that stands for the cutoff (the value box's
 * centre, 19 % of the way down the fall): x in px from the knee, y as a level from the flat top
 * (0) to the resting strip (1). Two cubics fitted to the nine cutoffs of one sweep (rms 0.19 px);
 * flat before the first, resting after the last. The same drawing for ladder, svf and z lowpass.
 */
const FALL = {
	start: -48,
	segments: [
		[-29.7, 0, -8.9, 0, 12.8, 0.375],
		[16.8, 0.444, 33.5, 1, 77, 1]
	]
} as const;

/** The knee travels linearly with the cutoff: 64.3 at 0, 439.3 at full (2.95 px a CC step). */
const KNEE = { min: 64.3, span: 375 } as const;

/**
 * z hipass draws the fall mirrored, its knee this much left of the value box (fitted on four
 * frames at one cutoff, rms 0.3 px; ours: the same at every cutoff).
 */
const HIPASS_SHIFT = 35.1;

/**
 * The resonance box: 39 × 24.2, black with its value in white. Its centre is at the knee (never
 * right of 414.5) and falls from 148.45 at no resonance to 83.65 at full.
 */
const BOX = { w: 39, h: 24.2, radius: 3, maxX: 414.5, y0: 148.45, rise: 64.8 } as const;

/**
 * The envelope's hatching: 1 px lines rising 45° to the right, 10 px apart and fixed on the screen
 * (x + y ≡ 9.8 mod 10), in the ramp's light grey (ours: the captures show a pale line).
 */
const HATCH = { pitch: 10, phase: 9.8, width: 1, color: RAMP[5] } as const;

/** The key tracking arrow: TE's arrow at 94 %, its box sliding from x 63.1 to 395.4. */
const KEY_ARROW = { x: 63.1, travel: 332.3, y: 192.1, scale: 0.94 } as const;

/**
 * The small labels on this page: 11 px in the heavier weight (the device's; TE's art set them
 * 10 px light), spaced as the heavier weight is.
 */
const LABEL = { size: 11, tracking: 0 } as const;

/** Axis labels: left-aligned where the device draws them, "20kHz" ending at the graph's edge. */
const AXIS = [
	{ text: '50', x: 27.8 },
	{ text: '1k', x: 153.7 },
	{ text: '2k', x: 244.3 },
	{ text: '5k', x: 323.8 }
] as const;
const AXIS_BASELINE = 185;

/**
 * x of a frequency on TE's axis in the guide art (log-linear between its marks at 50 Hz, 1k, 2k,
 * 5k and 20 kHz). The instrument page draws the device's graph ({@link kneeX}); the auxiliary
 * filter page still draws TE's.
 */
const TE_AXIS: readonly (readonly [number, number])[] = [
	[50, 30.5],
	[1000, 160.5],
	[2000, 245.5],
	[5000, 330.5],
	[20000, 450.5]
];

/** x of a frequency on TE's axis (guide art instrument-032). */
export function freqToX(hz: number): number {
	const f = Math.max(TE_AXIS[0][0], Math.min(TE_AXIS[TE_AXIS.length - 1][0], hz));
	for (let i = 1; i < TE_AXIS.length; i++) {
		const [f1, x1] = TE_AXIS[i];
		const [f0, x0] = TE_AXIS[i - 1];
		if (f <= f1) return x0 + ((x1 - x0) * Math.log(f / f0)) / Math.log(f1 / f0);
	}
	return TE_AXIS[TE_AXIS.length - 1][1];
}

/** A 0–1 cutoff's x on TE's axis (50 Hz … 20 kHz, exponential; guide art instrument-032). */
export function cutoffX(cutoff: number): number {
	return freqToX(50 * 400 ** clamp01(cutoff));
}

/** The device's knee for a 0–1 cutoff: where the value box sits and the fall bends. */
export function kneeX(cutoff: number): number {
	return KNEE.min + KNEE.span * clamp01(cutoff);
}

/** The resonance box's centre for a view. */
export function resonanceBox(view: FilterView): { x: number; y: number } {
	return {
		x: Math.min(kneeX(view.cutoff), BOX.maxX),
		y: BOX.y0 - BOX.rise * clamp01(view.resonance)
	};
}

/** Adds the area under the response for a knee at `knee` (down to the floor) to the path. */
function traceResponse(ctx: ScreenCtx, knee: number, hipass: boolean): void {
	const { top, rest, floor } = FILTER_GRAPH;
	const dir = hipass ? -1 : 1;
	const origin = hipass ? knee - HIPASS_SHIFT : knee;
	const x = (dx: number) => origin + dir * dx;
	const y = (level: number) => top + level * (rest - top);
	const far = 1000;
	ctx.moveTo(x(-far), floor);
	ctx.lineTo(x(-far), top);
	ctx.lineTo(x(FALL.start), top);
	for (const s of FALL.segments) {
		ctx.bezierCurveTo(x(s[0]), y(s[1]), x(s[2]), y(s[3]), x(s[4]), y(s[5]));
	}
	ctx.lineTo(x(far), rest);
	ctx.lineTo(x(far), floor);
	ctx.closePath();
}

/** Hatches the area between the response at `knee` and its ghost at `ghost`. */
function hatchBetween(ctx: ScreenCtx, knee: number, ghost: number, hipass: boolean): void {
	const { left, right, top, floor } = FILTER_GRAPH;
	ctx.save();
	ctx.beginPath();
	traceResponse(ctx, knee, hipass);
	traceResponse(ctx, ghost, hipass);
	ctx.clip('evenodd');
	ctx.strokeStyle = HATCH.color;
	ctx.lineWidth = HATCH.width;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	const first = Math.floor((left + top - HATCH.phase) / HATCH.pitch) * HATCH.pitch + HATCH.phase;
	for (let c = first; c <= right + floor + HATCH.pitch; c += HATCH.pitch) {
		// the line x + y = c across the graph
		ctx.moveTo(c - floor - 1, floor + 1);
		ctx.lineTo(c - top + 1, top - 1);
	}
	ctx.stroke();
	ctx.restore();
}

/** A label in the page's small, heavier style. */
function label(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	align: 'left' | 'right' = 'left'
) {
	text(ctx, value, x, y, LABEL.size, COLORS.white, align, LABEL.tracking, true);
}

/** Draws the filter graph (M3). */
export function drawFilter(ctx: ScreenCtx, view: FilterView): void {
	const { left, right, top, floor } = FILTER_GRAPH;
	const hipass = view.type === 'z hipass';
	const knee = kneeX(view.cutoff);
	label(ctx, view.type, 29.4, 55.6);

	ctx.save();
	ctx.beginPath();
	ctx.rect(left, 0, right - left, floor);
	ctx.clip();
	// the response, filled in its bands, the dividers over them
	ctx.save();
	ctx.beginPath();
	traceResponse(ctx, knee, hipass);
	ctx.clip();
	const edges = [left, ...DIVIDERS, right];
	BAND_FILLS.forEach((color, i) =>
		fillBox(ctx, edges[i], top - 1, edges[i + 1] - edges[i], floor, color)
	);
	for (const x of DIVIDERS) line(ctx, x, top - 1, x, floor, COLORS.black, 1);
	ctx.restore();
	// the envelope's reach: a ghost of the response at the cutoff plus the amount (a high-pass's
	// goes the other way), the area between them hatched, clamped to the range as on the device. A
	// negative amount hatches toward the other side (ours: the device's CC34 runs from none to full)
	const amount = Math.max(-1, Math.min(1, view.envAmount));
	const ghost = kneeX(view.cutoff + (hipass ? -amount : amount));
	if (Math.abs(ghost - knee) > 0.01) hatchBetween(ctx, knee, ghost, hipass);
	ctx.restore();

	// resonance: its value in the box at the cutoff
	const box = resonanceBox(view);
	fillBox(ctx, box.x - BOX.w / 2, box.y - BOX.h / 2, BOX.w, BOX.h, COLORS.black, BOX.radius);
	const resonance = String(Math.round(clamp01(view.resonance) * 99)).padStart(2, '0');
	text(ctx, resonance, box.x, box.y + 7.6, 20, COLORS.white, 'center', 0, true);

	for (const mark of AXIS) label(ctx, mark.text, mark.x, AXIS_BASELINE);
	label(ctx, '20kHz', 452.6, AXIS_BASELINE, 'right');

	// key tracking
	drawIcon(
		ctx,
		'filter.arrow',
		KEY_ARROW.x + KEY_ARROW.travel * clamp01(view.keyTracking),
		KEY_ARROW.y,
		{
			scale: KEY_ARROW.scale,
			tint: COLORS.white
		}
	);
}

/**
 * The send cards (shift + M3): 200.5 × 36.6, 39.8 apart from y 31.5, each with its icon at the
 * left, its value (20 px; "no send" at zero, as the device writes it) and its encoder's dot at the
 * right end.
 */
const SEND = {
	x: 139.5,
	w: 200.5,
	top: 31.5,
	pitch: 39.8,
	h: 36.6,
	radius: 5,
	icon: 144,
	value: 204.7,
	baseline: 25.5,
	dot: { x: 324.7, y: 6 }
} as const;

/**
 * Where TE's send icons sit on the device's cards (their boxes' tops below the card's): the tape
 * and the FX boxes as TE drew them (without a stray mark TE's FX I art carries), the aux plug with
 * its two dots 2.5 px closer under it.
 */
const SEND_ICONS = [
	{
		name: 'sends.aux',
		parts: [
			{ shapes: [0], dy: 4.9 },
			{ shapes: [1, 2], dy: 2.36 }
		]
	},
	{ name: 'sends.tape', parts: [{ shapes: [0, 1, 2], dy: 9.76 }] },
	{ name: 'sends.fx1', parts: [{ shapes: [1, 2, 3, 4], dy: 6.85 }] },
	{ name: 'sends.fx2', parts: [{ shapes: [0, 1, 2, 3, 4], dy: 6.9 }] }
] as const;

/** Options for {@link iconShapes}. */
export interface ShapeOptions {
	/** Uniform scale (1 = the size the icon was drawn at). */
	readonly scale?: number;
	/** Replaces each drawn shape's fill (a stroke keeps its own colour). */
	readonly fill?: string;
	/** Replaces each drawn shape's stroke colour. */
	readonly stroke?: string;
	/** Replaces each drawn shape's stroke width (before scaling). */
	readonly width?: number;
}

/**
 * Draws some of an icon's shapes (by index, in their own colours unless replaced) with the icon's
 * box corner at (x, y): for pictograms the device draws only part of, or in other colours (the send
 * cards here, the LFO page's knob and duck icons).
 */
export function iconShapes(
	ctx: ScreenCtx,
	name: string,
	shapes: readonly number[],
	x: number,
	y: number,
	options: ShapeOptions = {}
): void {
	const { scale = 1 } = options;
	const data = icon(name);
	for (const index of shapes) {
		const shape = data.shapes[index];
		if (!shape) continue;
		ctx.beginPath();
		tracePath(ctx, compiled(shape.d), x, y, scale);
		if (shape.fill) {
			ctx.fillStyle = options.fill ?? shape.fill;
			ctx.fill(shape.evenodd ? 'evenodd' : 'nonzero');
		}
		if (shape.stroke) {
			ctx.strokeStyle = options.stroke ?? shape.stroke;
			ctx.lineWidth = (options.width ?? shape.width ?? 1) * scale;
			ctx.lineCap = (shape.cap as CanvasLineCap | undefined) ?? 'butt';
			ctx.lineJoin = (shape.join as CanvasLineJoin | undefined) ?? 'miter';
			ctx.stroke();
		}
	}
}

/** Shift + M3: four send cards over the filter graph at 40 %. */
export function drawSends(ctx: ScreenCtx, frame: SendsFrame): void {
	ctx.save();
	ctx.globalAlpha = 0.4;
	drawFilter(ctx, frame.filter);
	ctx.restore();
	frame.values.forEach((value, i) => {
		const top = SEND.top + SEND.pitch * i;
		fillBox(ctx, SEND.x, top, SEND.w, SEND.h, COLORS.white, SEND.radius);
		const send = SEND_ICONS[i];
		for (const part of send.parts)
			iconShapes(ctx, send.name, part.shapes, SEND.icon, top + part.dy);
		// a send at zero reads "no send", set smaller (18 px) than the figures
		if (value === '00') text(ctx, 'no send', SEND.value, top + SEND.baseline, 18, COLORS.ink);
		else text(ctx, value, SEND.value, top + SEND.baseline, 20, COLORS.ink);
		encoderDot(ctx, i as 0 | 1 | 2 | 3, SEND.dot.x, top + SEND.dot.y, COLORS.ink);
	});
}
