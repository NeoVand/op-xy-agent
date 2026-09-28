/**
 * M2 (envelopes) and its shift layer, play mode, as the device draws them. Measured on the owner's
 * OS 1.1.33 unit by camera: 313 envelope states with sub-pixel handle fits
 * (docs/research/59-screen-profiling.md §2.2). TE's guide art showed a different, older layout.
 *
 * Both envelopes are always drawn:
 * - the selected one is white, with five handles (start, peak, decay end, release start, end) and
 *   drop lines from the inner three to the axis;
 * - the other is light grey with neither;
 * - each is named ("amp", "filter") just left of its release handle, above its sustain line.
 *
 * Every handle moves linearly with its value:
 * - attack slides the peak along the top, up to 115 px from the start;
 * - decay puts its end up to 101 px past the peak;
 * - sustain lifts the level from the axis to the top;
 * - release is a handle position. At 0 it starts 107 px before the end and at full it sits on the
 *   end, so a higher release value is a shorter release (the same lane the device stores).
 *
 * There is no flat top, and each stage is a cubic. The attack leaves the axis vertically and bends
 * into the peak. Decay and release drop vertically and settle almost level (fitted to within 0.2 px).
 * The filter envelope is drawn at full height whatever the filter's envelope amount.
 */
import type { ScreenCtx } from '../context';
import { card, encoderDot, fillBox, line, text } from '../draw';
import type { Adsr, EnvelopeView, PlayModeFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** The graph on the design grid (480 × 220): the handles' centres and each stage's reach. */
export const ENVELOPE_GRAPH = {
	left: 41,
	right: 440,
	base: 204,
	top: 33,
	/** How far the peak can move right of the start. */
	attack: 115,
	/** How far the decay end can move right of the peak. */
	decay: 101,
	/** How far before the end the release starts at release 0. */
	release: 107,
	handle: 8
} as const;

/** Cubic control points of each stage, as fractions of its box from its start (u across, v down/up). */
const ATTACK_SHAPE = { c1: [0, 0.338], c2: [0.379, 0.792] } as const;
const FALL_SHAPE = { c1: [0, 0.371], c2: [0.236, 0.946] } as const;

const unit = (v: number) => Math.max(0, Math.min(1, v));

/** Where an envelope's handles sit (all values 0–1, as the view carries them). */
export function envelopePoints(env: Adsr) {
	const g = ENVELOPE_GRAPH;
	const peakX = g.left + g.attack * unit(env.attack);
	const decayEnd = peakX + g.decay * unit(env.decay);
	const levelY = g.base - (g.base - g.top) * unit(env.sustain);
	const releaseStart = g.right - g.release * (1 - unit(env.release));
	return { peakX, peakY: g.top, decayEnd, levelY, releaseStart };
}

type Shape = { readonly c1: readonly number[]; readonly c2: readonly number[] };

/** One stage from (x0, y0) to (x1, y1) on its fitted cubic (the path is already open). */
function stage(ctx: ScreenCtx, x0: number, y0: number, x1: number, y1: number, shape: Shape): void {
	const dx = x1 - x0;
	const dy = y1 - y0;
	ctx.bezierCurveTo(
		x0 + shape.c1[0] * dx,
		y0 + shape.c1[1] * dy,
		x0 + shape.c2[0] * dx,
		y0 + shape.c2[1] * dy,
		x1,
		y1
	);
}

function traceEnvelope(ctx: ScreenCtx, env: Adsr): void {
	const g = ENVELOPE_GRAPH;
	const p = envelopePoints(env);
	ctx.beginPath();
	ctx.moveTo(g.left, g.base);
	stage(ctx, g.left, g.base, p.peakX, p.peakY, ATTACK_SHAPE);
	stage(ctx, p.peakX, p.peakY, p.decayEnd, p.levelY, FALL_SHAPE);
	ctx.lineTo(p.releaseStart, p.levelY);
	stage(ctx, p.releaseStart, p.levelY, g.right, g.base, FALL_SHAPE);
}

/** A handle: an 8 px square with softened corners. */
function handle(ctx: ScreenCtx, x: number, y: number): void {
	const s = ENVELOPE_GRAPH.handle;
	fillBox(ctx, x - s / 2, y - s / 2, s, s, COLORS.white, 1.5);
}

/** Draws the envelope graph (M2). */
export function drawEnvelopes(ctx: ScreenCtx, view: EnvelopeView): void {
	const g = ENVELOPE_GRAPH;
	const amp = { env: view.amp, name: 'amp' };
	const filter = { env: view.filter, name: 'filter' };
	const [selected, other] = view.selected === 'amp' ? [amp, filter] : [filter, amp];
	const p = envelopePoints(selected.env);
	const q = envelopePoints(other.env);

	// the axis and the selected envelope's drop lines, under everything
	line(ctx, g.left, g.base, g.right, g.base, COLORS.grey3, 1);
	for (const x of [p.peakX, p.decayEnd, p.releaseStart]) {
		const top = x === p.peakX ? p.peakY : p.levelY;
		line(ctx, x, top, x, g.base, COLORS.grey3, 1);
	}

	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	ctx.strokeStyle = COLORS.chrome;
	traceEnvelope(ctx, other.env);
	ctx.stroke();
	ctx.strokeStyle = COLORS.white;
	traceEnvelope(ctx, selected.env);
	ctx.stroke();

	for (const [x, y] of [
		[g.left, g.base],
		[p.peakX, p.peakY],
		[p.decayEnd, p.levelY],
		[p.releaseStart, p.levelY],
		[g.right, g.base]
	] as const)
		handle(ctx, x, y);

	// names in the heavier weight just left of each release handle, above the sustain line; they
	// may overlap (the device does not move them apart)
	text(ctx, other.name, q.releaseStart - 8, q.levelY - 8, 20, COLORS.chrome, 'right', 0, true);
	text(ctx, selected.name, p.releaseStart - 8, p.levelY - 8, 20, COLORS.white, 'right', 0, true);
}

/** Play-mode card icons, in encoder order. */
const PLAY_ICONS = [
	{ name: 'playmode.poly', x: 144, y: 34 },
	{ name: 'playmode.portamento', x: 144, y: 79 },
	{ name: 'playmode.bend', x: 143, y: 119 },
	{ name: 'playmode.volume', x: 144, y: 159 }
] as const;

/** Shift layers float four 200 × 35 cards over their page, which dims to half strength. */
export function drawPlayMode(ctx: ScreenCtx, frame: PlayModeFrame): void {
	ctx.save();
	ctx.globalAlpha = 0.5;
	drawEnvelopes(ctx, frame.envelope);
	ctx.restore();
	frame.values.forEach((value, i) => {
		const top = 35 + 40 * i;
		card(ctx, 140, top, 200, 35);
		const icon = PLAY_ICONS[i];
		drawIcon(ctx, icon.name, icon.x, icon.y);
		text(ctx, value, 205, top + 25, 20, COLORS.black);
		encoderDot(ctx, i as 0 | 1 | 2 | 3, 325, top + 5, COLORS.black);
	});
}
