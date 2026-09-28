/**
 * Drawing primitives of the OP-XY screen, each matching a recurring element of TE's guide art
 * (docs/research/55-screen.md §3): the eight-cell parameter header, white cards with encoder dots,
 * amount rulers with pointers, soft labels above M1–M4, list rows, hatching. All measurements are
 * in design pixels on the 480 × 220 grid.
 */
import type { ScreenCtx } from './context';
import { screenFont, type TextAlign } from './font';
import { COLORS, ENCODER_DOTS, RAMP, SOFT_KEY_BASELINE, SOFT_KEY_X } from './palette';

/** Corner radii: one for all corners, or [top-left, top-right, bottom-right, bottom-left]. */
export type Radii = number | readonly [number, number, number, number];

/** Adds a rounded rectangle to the current path (arcs as cubic curves, like TE's vectors). */
export function roundRectPath(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	radii: Radii
): void {
	const max = Math.min(w, h) / 2;
	const [tl, tr, br, bl] = (typeof radii === 'number' ? [radii, radii, radii, radii] : radii).map(
		(r) => Math.max(0, Math.min(r, max))
	);
	const k = 0.4477152502; // 1 − κ: control-point inset of a quarter circle
	ctx.moveTo(x + tl, y);
	ctx.lineTo(x + w - tr, y);
	if (tr) ctx.bezierCurveTo(x + w - tr * k, y, x + w, y + tr * k, x + w, y + tr);
	ctx.lineTo(x + w, y + h - br);
	if (br) ctx.bezierCurveTo(x + w, y + h - br * k, x + w - br * k, y + h, x + w - br, y + h);
	ctx.lineTo(x + bl, y + h);
	if (bl) ctx.bezierCurveTo(x + bl * k, y + h, x, y + h - bl * k, x, y + h - bl);
	ctx.lineTo(x, y + tl);
	if (tl) ctx.bezierCurveTo(x, y + tl * k, x + tl * k, y, x + tl, y);
	ctx.closePath();
}

/** Fills a rectangle, rounded when `radii` is given. */
export function fillBox(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string,
	radii: Radii = 0
): void {
	ctx.fillStyle = color;
	if (radii === 0) {
		ctx.fillRect(x, y, w, h);
		return;
	}
	ctx.beginPath();
	roundRectPath(ctx, x, y, w, h, radii);
	ctx.fill();
}

/** Strokes a rectangle (optionally rounded) with its outline centred on the edge. */
export function strokeBox(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string,
	width = 1,
	radii: Radii = 0
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.beginPath();
	roundRectPath(ctx, x, y, w, h, radii);
	ctx.stroke();
}

/** A straight line. */
export function line(
	ctx: ScreenCtx,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: string,
	width = 1
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.lineTo(x1, y1);
	ctx.stroke();
}

/** A filled circle. */
export function disc(ctx: ScreenCtx, cx: number, cy: number, r: number, color: string): void {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
}

/** A circle outline. */
export function ring(
	ctx: ScreenCtx,
	cx: number,
	cy: number,
	r: number,
	color: string,
	width = 1
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.stroke();
}

/** Text in the screen font (baseline at y). */
export function text(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	size: number,
	color: string,
	align: TextAlign = 'left',
	tracking = 0,
	bold = false
): number {
	return screenFont.draw(ctx, value, x, y, { size, color, align, tracking, bold });
}

/**
 * An encoder's dot, 10 px across, with its top-left at (x, y): dark, mid and light grey are filled,
 * the white encoder is a 1 px ring. `on` is the ring's colour (ink on cards, white on black).
 */
export function encoderDot(
	ctx: ScreenCtx,
	encoder: 0 | 1 | 2 | 3,
	x: number,
	y: number,
	on: string = COLORS.ink
): void {
	const fill = ENCODER_DOTS[encoder];
	if (fill === 'ring') ring(ctx, x + 5, y + 5, 4.5, on, 1);
	else disc(ctx, x + 5, y + 5, 5, fill);
}

/** One label/value pair of the header bar. */
export interface HeaderCell {
	readonly label: string;
	readonly value: string;
}

/**
 * The engine header: eight 60 × 20 cells running the grey ramp, a 10 px label then a 20 px value
 * per encoder; text flips to black on the light half. The last cell meets the screen's corner.
 * `plain` draws no cells, white text straight on the page (simple and axis on the device, whose
 * pictures run up under it: research 59 §2.5).
 */
export function header(
	ctx: ScreenCtx,
	cells: readonly HeaderCell[],
	style: 'ramp' | 'plain' = 'ramp'
): void {
	if (style === 'ramp') for (let i = 0; i < 8; i++) fillBox(ctx, i * 60, 0, 60, 20, RAMP[i]);
	cells.slice(0, 4).forEach((cell, e) => {
		const labelX = e * 120;
		const color = style === 'plain' || e < 2 ? COLORS.white : COLORS.black;
		text(ctx, cell.label, labelX + 5, 10, 10, color);
		text(ctx, cell.value, labelX + 65, 17.75, 20, color);
	});
}

/** How prominent a soft label is. */
export type SoftTone = 'bright' | 'normal' | 'dim';

/** A soft label over one of M1–M4. */
export interface SoftLabel {
	readonly text: string;
	readonly tone?: SoftTone;
}

const SOFT_COLOR: Record<SoftTone, string> = {
	bright: COLORS.white,
	normal: COLORS.light,
	dim: COLORS.dim
};

/** Soft labels centred over M1–M4 (20 px, baseline 215). `null` leaves a slot empty. */
export function softLabels(ctx: ScreenCtx, labels: readonly (SoftLabel | null)[]): void {
	labels.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		text(
			ctx,
			label.text,
			SOFT_KEY_X[i],
			SOFT_KEY_BASELINE,
			20,
			SOFT_COLOR[label.tone ?? 'normal'],
			'center'
		);
	});
}

/**
 * A white card (radius 5), the base of play-mode, send and LFO pages. `outline` adds TE's ink edge
 * (2.2 px, centred), which reads as a seam where cards touch.
 */
export function card(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string = COLORS.white,
	outline = false
): void {
	fillBox(ctx, x, y, w, h, color, 5);
	if (outline) strokeBox(ctx, x, y, w, h, COLORS.ink, 2.23, 5);
}

/**
 * The amount ruler of the LFO cards: ticks every 5 px from `top` to `bottom` at `x`…`x + 10`, a long
 * tick at the centre (the zero), and a 30 × 10 pointer whose tip marks `amount` (−100…100).
 */
export function amountRuler(
	ctx: ScreenCtx,
	x: number,
	top: number,
	bottom: number,
	amount: number,
	color: string = COLORS.ink
): void {
	const mid = (top + bottom) / 2;
	for (let y = top; y <= bottom + 0.01; y += 5) {
		const long = Math.abs(y - mid) < 0.01;
		line(ctx, long ? x - 10 : x, y, x + 10, y, color, 1.12);
	}
	const clamped = Math.max(-100, Math.min(100, amount));
	const tip = mid - (clamped / 100) * (mid - top);
	const px = x - 40;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(px, tip - 5);
	ctx.lineTo(px + 25, tip - 5);
	ctx.lineTo(px + 30, tip);
	ctx.lineTo(px + 25, tip + 5);
	ctx.lineTo(px, tip + 5);
	ctx.closePath();
	ctx.fill();
}

/** Diagonal hatching (45°, rising to the right) over a rectangle, clipped to it. */
export function hatch(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	color: string,
	spacing = 7.5,
	width = 0.5
): void {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.beginPath();
	for (let d = -h; d < w + h; d += spacing) {
		ctx.moveTo(x + d, y + h);
		ctx.lineTo(x + d + h, y);
	}
	ctx.stroke();
	ctx.restore();
}

/**
 * A list column (the three-column settings pages): rows 20 px apart, 20 px text. `selected` draws
 * the column's selection style: an outline (section), a dark fill (setting) or a white fill with
 * black text (value).
 */
export function listColumn(
	ctx: ScreenCtx,
	items: readonly string[],
	x: number,
	width: number,
	firstBaseline: number,
	selected: number | null,
	style: 'outline' | 'dark' | 'white',
	color: string = COLORS.white
): void {
	items.forEach((item, i) => {
		const baseline = firstBaseline + i * 20;
		const top = baseline - 15;
		let ink = color;
		if (i === selected) {
			if (style === 'outline')
				strokeBox(ctx, x - 5, top + 0.25, width, 19.5, COLORS.white, 0.56, 2.5);
			else if (style === 'dark') fillBox(ctx, x - 5, top, width, 20, COLORS.dark, 2.5);
			else {
				fillBox(ctx, x - 5, top, width, 20, COLORS.white, 2.5);
				ink = COLORS.black;
			}
		}
		text(ctx, item, x, baseline, 20, ink);
	});
}
