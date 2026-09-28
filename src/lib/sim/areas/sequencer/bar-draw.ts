/**
 * The bar card as the device draws it, measured on the owner's OS 1.1.33 unit by camera (frames
 * b1-476…649, realigned) and on the owner's photo of it (research 59 §2.8); TE's guide pictures
 * none of it. Positions are design px (camera rows × 220/222).
 *
 * - A white card, 320 × 130 at (80, 40), over the page it covers, which dims to about 30 %.
 * - Top row: the bars 1–4 in 35 px boxes, filled for the bar the step keys show, outlined for the
 *   others the pattern has; "track scale" and its value.
 * - Under it, a table: the four encoders' names, values and dots (quant, length, groove, and
 *   shape, which is a glyph), and on the right a mini piano roll of the shown bar, a dash per
 *   note, over a faint grid.
 * - Under the card, what M1, M2 and M4 clear; the labels slide up from below as the card appears.
 * - When the card goes it fades out over the page, which is no longer dimmed.
 */
import type { ScreenCtx } from '../../screen/context';
import { encoderDot, fillBox, strokeBox, text } from '../../screen/draw';
import { COLORS, SCREEN, SOFT_KEY_BASELINE } from '../../screen/palette';
import { renderFrame } from '../../screen/render';
import { figures } from './device-text';
import type { BarFrame } from './frames';

/**
 * The page behind the card shows at 30 % of its brightness: the prism page's top bar and wedge
 * beside the card, read through the camera's response to known greys, came out at 28–37 %.
 */
const VEIL = 0.7;

/** The card. Its corners measure a radius of about 6. */
const CARD = { x: 80, y: 40, w: 320, h: 130, radius: 6 } as const;
const RIGHT = CARD.x + CARD.w;
const BOTTOM = CARD.y + CARD.h;

/**
 * The card's faint rules (the owner's photo shows them; the camera only through the fade, b1-642):
 * one under the top row, the divider before the roll the card's full height, the table's columns,
 * and the roll's grid, a line every two steps and every 10 px down. Their grey is the photo's.
 */
const RULES = {
	color: COLORS.card,
	top: 81.5,
	divider: 240,
	columns: [160, 200],
	across: 20,
	down: 10
} as const;

/** The bars' boxes: bar i at x + pitch · i; its digit's pen `digit` px into the box. */
const BOX = { x: 82.5, y: 43.5, w: 35, h: 34.5, radius: 3, pitch: 40, digit: 9 } as const;
/** The bars' digits, and the top row's text. */
const TOP = {
	size: 29.25,
	baseline: 70.8,
	label: 244.5,
	value: 363.5,
	textBaseline: 71.2
} as const;

/**
 * The table: names at `label`, values centred on `value`, the encoders' dots centred at x `dot`
 * + 5, 4.9 px above each baseline; rows 20 px apart. All in the light weight, 20 px.
 */
const ROWS = { label: 84.5, value: 179.5, dot: 215, baseline: 100.3, pitch: 20, size: 20 } as const;

/**
 * The shape glyph (frames b1-518…529): a step from low to high whose riser leans into a ramp as
 * the smoothing grows, the knee sliding from under the high end to the low end. Relative to its
 * row's baseline; 1.5 px ink.
 */
const SHAPE = { left: 171.1, right: 189.4, low: -0.45, high: -13.8, width: 1.5 } as const;

/**
 * The mini piano roll: step i of the shown bar at x = 240 + 10 · i, a note as a 1.5 px dash as
 * long as the note (half a step at the default length: 5 px, as measured). Pitch goes up a pixel
 * a semitone, y = 177.8 − note: ours. Nobody logged which keys were played, but the camera's
 * four notes (track 3, b1-637…641) land on whole notes that way (42, 48, 58, 64: keys from
 * across its two octaves), and the owner's photo shows the same 22–23 px spread. To confirm on
 * the device, say with C3 and C4 on two steps.
 */
const ROLL = { x: 240, step: 10, zero: 177.8, thick: 1.5 } as const;

/** The clear labels: "clr notes" kept off the screen's edge, the others centred over M2 and M4. */
const LABELS = [
	{ x: 9.5, align: 'left' },
	{ x: 175, align: 'center' },
	null,
	{ x: 440, align: 'center' }
] as const;
/** How far below their place the labels start (ours: b1-498 caught them 13.4 px low). */
const SLIDE = 20;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function rules(ctx: ScreenCtx): void {
	ctx.strokeStyle = RULES.color;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(CARD.x, RULES.top);
	ctx.lineTo(RIGHT, RULES.top);
	ctx.moveTo(RULES.divider, CARD.y);
	ctx.lineTo(RULES.divider, BOTTOM);
	for (const x of RULES.columns) {
		ctx.moveTo(x, RULES.top);
		ctx.lineTo(x, BOTTOM);
	}
	for (let x = RULES.divider + RULES.across; x < RIGHT; x += RULES.across) {
		ctx.moveTo(x, RULES.top);
		ctx.lineTo(x, BOTTOM);
	}
	for (let y = RULES.top + RULES.down; y < BOTTOM; y += RULES.down) {
		ctx.moveTo(RULES.divider, y);
		ctx.lineTo(RIGHT, y);
	}
	ctx.stroke();
}

/** Bars 1–4 and the track scale. */
function topRow(ctx: ScreenCtx, frame: BarFrame): void {
	for (let i = 0; i < 4; i++) {
		const x = BOX.x + BOX.pitch * i;
		const shown = i === frame.shown;
		if (shown) fillBox(ctx, x, BOX.y, BOX.w, BOX.h, COLORS.ink, BOX.radius);
		else if (i < frame.bars) {
			strokeBox(ctx, x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1, COLORS.ink, 1, BOX.radius - 0.5);
		}
		const color = shown ? COLORS.white : COLORS.ink;
		figures(ctx, String(i + 1), x + BOX.digit, TOP.baseline, TOP.size, color);
	}
	text(ctx, 'track scale', TOP.label, TOP.textBaseline, 20, COLORS.ink);
	figures(ctx, frame.scale, TOP.value, TOP.textBaseline, 20, COLORS.ink);
}

function shapeGlyph(ctx: ScreenCtx, smoothing: number, baseline: number): void {
	const low = baseline + SHAPE.low;
	const knee = SHAPE.right - (SHAPE.right - SHAPE.left) * clamp01(smoothing);
	ctx.strokeStyle = COLORS.ink;
	ctx.lineWidth = SHAPE.width;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	ctx.moveTo(SHAPE.left, low);
	ctx.lineTo(knee, low);
	ctx.lineTo(SHAPE.right, baseline + SHAPE.high);
	ctx.stroke();
}

/** quant, length, groove and shape: name, value (shape as its glyph) and the encoder's dot. */
function table(ctx: ScreenCtx, frame: BarFrame): void {
	frame.header.slice(0, 4).forEach((cell, e) => {
		const y = ROWS.baseline + ROWS.pitch * e;
		text(ctx, cell.label, ROWS.label, y, ROWS.size, COLORS.ink);
		if (e === 3) shapeGlyph(ctx, frame.smoothing, y);
		else figures(ctx, cell.value, ROWS.value, y, ROWS.size, COLORS.ink, 'center');
		encoderDot(ctx, e as 0 | 1 | 2 | 3, ROWS.dot, y - 9.9, COLORS.ink);
	});
}

function roll(ctx: ScreenCtx, frame: BarFrame): void {
	ctx.save();
	ctx.beginPath();
	ctx.rect(ROLL.x, RULES.top, RIGHT - ROLL.x, BOTTOM - RULES.top);
	ctx.clip();
	for (const n of frame.notes) {
		const y = ROLL.zero - n.note;
		fillBox(
			ctx,
			ROLL.x + ROLL.step * n.at,
			y - ROLL.thick / 2,
			ROLL.step * n.length,
			ROLL.thick,
			COLORS.ink
		);
	}
	ctx.restore();
}

function clearLabels(ctx: ScreenCtx, frame: BarFrame): void {
	const dy = SLIDE * (1 - easeOut(clamp01(frame.slide)));
	frame.soft.slice(0, 4).forEach((label, i) => {
		const at = LABELS[i];
		if (!label || !at) return;
		text(ctx, label.text, at.x, SOFT_KEY_BASELINE + dy, 20, COLORS.light, at.align);
	});
}

/** The bar card over the page it covers (dimmed while the card is up). */
export function drawBar(ctx: ScreenCtx, frame: BarFrame, tick: number): void {
	renderFrame(ctx, frame.base, { tick });
	ctx.save();
	const alpha = ctx.globalAlpha;
	if (!frame.going) {
		ctx.globalAlpha = alpha * VEIL;
		fillBox(ctx, 0, 0, SCREEN.width, SCREEN.height, COLORS.black);
	}
	ctx.globalAlpha = alpha * clamp01(frame.fade);
	fillBox(ctx, CARD.x, CARD.y, CARD.w, CARD.h, COLORS.white, CARD.radius);
	rules(ctx);
	topRow(ctx, frame);
	table(ctx, frame);
	roll(ctx, frame);
	clearLabels(ctx, frame);
	ctx.restore();
}
