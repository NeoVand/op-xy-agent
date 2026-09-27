/**
 * M2 (envelopes) and its shift layer, play mode (guide art instrument-012, where the envelopes show
 * dimmed under the cards). Attack fills its share of a fixed slot (40–138.5, then holds at the
 * peak), decay starts at 138.5 and takes its share of the next 87 px, release is anchored at the
 * right edge and grows leftward (up to 85.5 px), and sustain spans what is left, as in TE's drawing.
 * The selected envelope is light grey with five handles, the other dark; each is named above its
 * sustain line ("env" amp, "mod" filter). The filter envelope is drawn scaled by its depth (the M3
 * envelope amount), so "mod" shows how far it actually moves the filter.
 */
import type { ScreenCtx } from '../context';
import { card, encoderDot, fillBox, line, text } from '../draw';
import type { Adsr, EnvelopeView, PlayModeFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

const X0 = 40;
const TOP = 25;
const BOTTOM = 200;
const SLOT = { attack: 138.5, decay: 87, release: 85.5, end: 440.5 } as const;

/** Points of an envelope in the graph; `depth` (0–1) scales its height (the filter's amount). */
export function envelopePoints(env: Adsr, depth = 1) {
	const clamp = (v: number) => Math.max(0, Math.min(1, v));
	const peakY = BOTTOM - (BOTTOM - TOP) * clamp(depth);
	const peakX = X0 + (SLOT.attack - X0) * clamp(env.attack);
	const decayEnd = SLOT.attack + SLOT.decay * clamp(env.decay);
	const levelY = BOTTOM - (BOTTOM - peakY) * clamp(env.sustain);
	const releaseStart = Math.max(decayEnd, SLOT.end - SLOT.release * clamp(env.release));
	return { peakX, peakY, decayEnd, levelY, releaseStart };
}

function traceEnvelope(ctx: ScreenCtx, env: Adsr, depth: number): void {
	const p = envelopePoints(env, depth);
	ctx.beginPath();
	ctx.moveTo(X0, BOTTOM);
	// attack: a slow start that sweeps up into the peak (TE's control points)
	const dxA = p.peakX - X0;
	const rise = BOTTOM - p.peakY;
	ctx.bezierCurveTo(X0 + 0.88 * dxA, BOTTOM - 0.022 * rise, p.peakX, p.peakY, p.peakX, p.peakY);
	ctx.lineTo(SLOT.attack, p.peakY);
	// decay: a fast fall that settles onto the sustain level
	const dxD = p.decayEnd - SLOT.attack;
	ctx.bezierCurveTo(
		SLOT.attack,
		p.peakY,
		SLOT.attack + 0.083 * dxD,
		p.levelY,
		p.decayEnd,
		p.levelY
	);
	ctx.lineTo(p.releaseStart, p.levelY);
	// release: the same fast-then-settling fall, ending at the right edge
	const dxR = SLOT.end - p.releaseStart;
	ctx.bezierCurveTo(p.releaseStart, p.levelY, p.releaseStart + 0.1 * dxR, BOTTOM, SLOT.end, BOTTOM);
}

/** Draws the envelope graph (M2). */
export function drawEnvelopes(ctx: ScreenCtx, view: EnvelopeView): void {
	const amp = { env: view.amp, depth: 1, name: 'env' };
	const filter = { env: view.filter, depth: Math.max(0.25, view.filterDepth ?? 1), name: 'mod' };
	const [selected, other] = view.selected === 'amp' ? [amp, filter] : [filter, amp];
	line(ctx, SLOT.attack, TOP, SLOT.attack, BOTTOM, COLORS.dark, 1);
	line(ctx, X0 - 0.5, BOTTOM, SLOT.end + 0.5, BOTTOM, COLORS.grey1, 1);

	ctx.lineWidth = 1;
	ctx.strokeStyle = COLORS.dark;
	traceEnvelope(ctx, other.env, other.depth);
	ctx.stroke();
	ctx.strokeStyle = COLORS.light;
	traceEnvelope(ctx, selected.env, selected.depth);
	ctx.stroke();

	const p = envelopePoints(selected.env, selected.depth);
	const handles: [number, number][] = [
		[X0, BOTTOM],
		[p.peakX, p.peakY],
		[SLOT.attack, p.peakY],
		[p.releaseStart, p.levelY],
		[SLOT.end, BOTTOM]
	];
	for (const [x, y] of handles) fillBox(ctx, x - 2.5, y - 2.5, 5, 5, COLORS.light, 1);

	// names above their sustain lines, right-aligned where the release begins
	const q = envelopePoints(other.env, other.depth);
	const clash =
		Math.abs(q.levelY - p.levelY) < 24 && Math.abs(q.releaseStart - p.releaseStart) < 60;
	text(ctx, selected.name, p.releaseStart, p.levelY - 11, 20, COLORS.white, 'right');
	text(
		ctx,
		other.name,
		q.releaseStart - 4,
		clash ? q.levelY + 24 : q.levelY - 8,
		20,
		COLORS.dark,
		'right'
	);
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
