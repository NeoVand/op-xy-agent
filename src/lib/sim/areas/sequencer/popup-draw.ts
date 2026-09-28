/**
 * The sequencer's popups as the device draws them, measured by camera on the owner's OS 1.1.33
 * unit (research 59 §2.8, §2.12); TE's guide pictures none of them. Positions are design px
 * (camera rows × 220/222).
 *
 * - A held step (frames b1-605…713): its number in a 50 × 50 white box at the top of the page,
 *   orange with a white number while an encoder writes a lock (b1-684…697).
 * - "copied" (b1-633, 634, 678, 708): a white tab hanging from the top edge over the top bar.
 * - The octave after [-] / [+] (b1-254…283): a 100 × 50 card low in the middle, a mini piano of
 *   four white keys and three black on the left and the octave, "+0" included, in the light
 *   weight on the right.
 */
import type { ScreenCtx } from '../../screen/context';
import { fillBox, line, roundRectPath, text } from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { COLORS } from '../../screen/palette';
import { figures } from './device-text';

/** The held step's box and its number (40 px for "5" and "9"; 39 fits all the digits seen). */
const STEP = {
	x: 215,
	y: 25,
	size: 50,
	radius: 4.5,
	centre: 239.4,
	baseline: 65.2,
	text: 39
} as const;

/** A held step's number in its box: white, or orange while a lock is being written. */
export function drawStepBox(ctx: ScreenCtx, step: number, locking: boolean): void {
	fillBox(
		ctx,
		STEP.x,
		STEP.y,
		STEP.size,
		STEP.size,
		locking ? COLORS.record : COLORS.white,
		STEP.radius
	);
	const color = locking ? COLORS.white : COLORS.ink;
	figures(ctx, String(step), STEP.centre, STEP.baseline, STEP.text, color, 'center');
}

/**
 * "copied": the tab reaches 22.3 px down (the top bar ends at 20) and spans x 202.5–278.5; the
 * word, 20 px, sits a little left of its middle, as measured.
 */
const COPIED = {
	x: 202.5,
	w: 76,
	bottom: 22.3,
	radius: 4,
	centre: 238.7,
	baseline: 17.45
} as const;

/** "copied" over the top bar. */
export function drawCopied(ctx: ScreenCtx, alpha: number): void {
	ctx.save();
	ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
	// the top corners are off the screen: only the bottom ones show
	const top = -COPIED.radius - 1;
	fillBox(ctx, COPIED.x, top, COPIED.w, COPIED.bottom - top, COLORS.white, COPIED.radius);
	text(ctx, 'copied', COPIED.centre, COPIED.baseline, 20, COLORS.ink, 'center');
	ctx.restore();
}

/** The octave card and its piano: white keys 10 px wide from x 190, black keys on 200, 210, 220. */
const OCTAVE = { x: 190, y: 155, w: 100, h: 50, radius: 5 } as const;
const PIANO = { divides: [200, 210, 220], edge: 230, black: 5, bottom: 184.5, round: 1 } as const;
/**
 * The octave's sign (38 px) is centred on x 247.4 and sits 3 px higher than the digit (39 px),
 * whose pen is fixed at 258.8, so every digit starts at the same place.
 */
const SIGN = { centre: 247.4, baseline: 191.5, size: 38 } as const;
const DIGIT = { x: 258.8, baseline: 194.5, size: 39 } as const;

/** The octave as the popup writes it: "+1", "+0", "-3". */
export const octaveText = (octave: number) => `${octave < 0 ? '-' : '+'}${Math.abs(octave)}`;

/** A glyph centred on its ink at x (baseline y). */
function centredGlyph(ctx: ScreenCtx, ch: string, x: number, y: number, size: number): void {
	const glyph = screenFont.data.glyphs[ch];
	const k = size / screenFont.data.unitsPerEm;
	const middle = glyph ? ((glyph.bbox[0] + glyph.bbox[2]) / 2) * k : 0;
	text(ctx, ch, x - middle, y, size, COLORS.ink);
}

/** The octave popup. */
export function drawOctave(ctx: ScreenCtx, octave: number, alpha: number): void {
	ctx.save();
	ctx.globalAlpha *= Math.max(0, Math.min(1, alpha));
	fillBox(ctx, OCTAVE.x, OCTAVE.y, OCTAVE.w, OCTAVE.h, COLORS.white, OCTAVE.radius);
	const bottom = OCTAVE.y + OCTAVE.h;
	// the white keys' edges: under the black keys, and the piano's right edge its full height
	for (const x of PIANO.divides) line(ctx, x, PIANO.bottom, x, bottom, COLORS.light, 1);
	line(ctx, PIANO.edge, OCTAVE.y, PIANO.edge, bottom, COLORS.light, 1);
	ctx.fillStyle = COLORS.ink;
	for (const x of PIANO.divides) {
		ctx.beginPath();
		const r = PIANO.round;
		roundRectPath(ctx, x - PIANO.black / 2, OCTAVE.y, PIANO.black, PIANO.bottom - OCTAVE.y, [
			0,
			0,
			r,
			r
		]);
		ctx.fill();
	}
	const value = octaveText(octave);
	centredGlyph(ctx, value[0], SIGN.centre, SIGN.baseline, SIGN.size);
	figures(ctx, value.slice(1), DIGIT.x, DIGIT.baseline, DIGIT.size, COLORS.ink);
	ctx.restore();
}
