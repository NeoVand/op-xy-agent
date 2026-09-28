/**
 * The preset browser's page (shift + M1, shift + Tn) as the owner's unit draws it on OS 1.1.33,
 * measured on the realigned camera frames b1-1495…1568 (research 59 §2.6): design pixels, rows
 * × 220/222. Colours are TE's palette; the camera shifts them, so the greys are matched by
 * brightness against pages whose greys are known (the player cards, the arrange labels).
 *
 * - The track number over "preset" at the left, and the middle column, are the device's list
 *   style (the filter and LFO type lists, `screen/pages/misc.ts`): 20 px in the heavier weight on
 *   rows 20 px apart from baseline 25.3, the chosen engine or category boxed.
 * - The presets start 144.9 px right of the middle column's text; the highlighted one sits on a
 *   pale blue bar (the players' blue) in ink.
 * - A list that overflows its nine rows has a scroll bar: a 1 px track and a thumb as long as the
 *   share of the list in view (b1-1500: 9 of 11 engines).
 * - A click of E1 brings up two cards over the page dimmed to 40 %: the chosen view's card white
 *   with E1's dot, the other grey (the sends cards' size and place, `screen/pages/filter.ts`).
 * - With a user preset highlighted, cut · paste · rename · delete over M1–M4 (b1-1531).
 */
import type { ScreenCtx } from '../../screen/context';
import { encoderDot, fillBox, line, strokeBox, text, type SoftLabel } from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { COLORS, SOFT_KEY_X, SCREEN } from '../../screen/palette';
import type { SystemListColumn, SystemPresetsFrame } from './frames';

/** Rows: the first baseline and the pitch (the device's lists). */
const ROW = { first: 25.3, pitch: 20 } as const;

/** Text: 20 px in the heavier weight, a little tighter than our bold (as the type lists). */
const TEXT = { size: 20, tracking: -0.02 } as const;

/** The track number and "preset". */
const LEFT_X = 4.5;

/**
 * The middle column: the text, and the box round the chosen engine or category (1.5 px, its
 * outline centred 3.9 px left of the text, from 16.85 px above the baseline to 4.05 below).
 */
const GROUPS = {
	x: 109.2,
	box: { x: 105.3, w: 124.75, top: -16.85, h: 20.9, line: 1.5, r: 2.5 },
	/**
	 * Where a long name stops: at the box's right edge (b1-1500: "multisampler" whole, reaching
	 * 228.5; b1-1530: "Nostalgic Sy", the n that would pass 229 left out).
	 */
	right: 230.05
} as const;

/**
 * The preset column: the text, and the highlight bar (x 249.1–460.35, from 18.55 px above the
 * baseline to 4.6 below, over five frames). A long name stops at the bar's right edge (ours, as in
 * the middle column).
 */
const PRESETS = {
	x: 254.1,
	bar: { x: 249.1, w: 211.25, top: -18.55, h: 23.15, r: 2.5 },
	right: 460.35
} as const;

/**
 * The scroll bars: 1 px tracks at x 240.05 and 469.65 from y 6.85 to 189.95, thumbs 7.8 and 6.2 px
 * wide on them. The middle column's is the dimmer of the two (camera: about three quarters as
 * bright), like the darker group bar of TE's older art.
 */
const SCROLL = {
	top: 6.85,
	bottom: 189.95,
	groups: { x: 240.05, thumb: 7.8, track: COLORS.light, fill: COLORS.grey2 },
	presets: { x: 469.65, thumb: 6.2, track: COLORS.white, fill: COLORS.grey3 }
} as const;

/**
 * The view popup: cards 200.5 × 36.6 at x 139.5, tops 71.7 and 111.5 (by engine, by category),
 * radius 5; E1's dot 6 px in from the right edge and 5 px down; the names 20 px, centred, 25 px
 * below the card's top. Behind them the page at 40 % (b1-1524, 1535, 1565…1567).
 */
const POPUP = {
	x: 139.5,
	w: 200.5,
	h: 36.6,
	tops: { engine: 71.7, category: 111.5 },
	r: 5,
	dot: { dx: 200.5 - 16, dy: 5 },
	baseline: 25,
	dim: 0.6
} as const;

/** The footer: 20 px in the heavier weight, baseline 214.75, over M1–M4 (b1-1531). */
const FOOTER = { baseline: 214.75, color: { normal: COLORS.light, dim: COLORS.dim } } as const;

/** The width a run takes in the list style (the heavier weight adds 0.03 em of tracking). */
const widthOf = (value: string) => screenFont.measure(value, TEXT.size, TEXT.tracking + 0.03);

/**
 * A name cut to fit `max` px: whole characters dropped from its end, or from its start when it is
 * highlighted, so the end shows (b1-1531: the boxed "Nostalgic Synths" reads "talgic Synths"; ours:
 * the device may move it like a ticker, and one frame caught it at its end).
 */
export function fitName(value: string, max: number, fromStart = false): string {
	let out = value;
	while (out.length > 1 && widthOf(out) > max) out = fromStart ? out.slice(1) : out.slice(0, -1);
	return out;
}

/** One row of text in the list style. */
function rowText(ctx: ScreenCtx, value: string, x: number, row: number, color: string): void {
	text(ctx, value, x, ROW.first + ROW.pitch * row, TEXT.size, color, 'left', TEXT.tracking, true);
}

/** The middle column: engines or categories, the chosen one boxed. */
function drawGroups(ctx: ScreenCtx, column: SystemListColumn): void {
	const { box } = GROUPS;
	column.items.forEach((item, i) => {
		const chosen = i === column.selected;
		if (chosen) {
			const y = ROW.first + ROW.pitch * i + box.top;
			strokeBox(ctx, box.x, y, box.w, box.h, COLORS.white, box.line, box.r);
		}
		rowText(ctx, fitName(item, GROUPS.right - GROUPS.x, chosen), GROUPS.x, i, COLORS.white);
	});
}

/** The preset column: the highlighted preset on the pale bar, a cut one dim. */
function drawPresets(ctx: ScreenCtx, column: SystemListColumn): void {
	const { bar } = PRESETS;
	column.items.forEach((item, i) => {
		const lit = i === column.selected;
		if (lit) {
			const y = ROW.first + ROW.pitch * i + bar.top;
			fillBox(ctx, bar.x, y, bar.w, bar.h, COLORS.blue, bar.r);
		}
		const ink = lit ? COLORS.ink : column.dim?.includes(i) ? COLORS.dim : COLORS.white;
		rowText(ctx, fitName(item, PRESETS.right - PRESETS.x, lit), PRESETS.x, i, ink);
	});
}

/** A column's scroll bar, drawn only when its list runs past the nine rows. */
function drawScroll(
	ctx: ScreenCtx,
	column: SystemListColumn,
	bar: { readonly x: number; readonly thumb: number; readonly track: string; readonly fill: string }
): void {
	const rows = column.items.length;
	if (column.total <= rows) return;
	const span = SCROLL.bottom - SCROLL.top;
	const length = (span * rows) / column.total;
	const top = SCROLL.top + ((span - length) * column.first) / (column.total - rows);
	line(ctx, bar.x, SCROLL.top, bar.x, SCROLL.bottom, bar.track, 1);
	fillBox(ctx, bar.x - bar.thumb / 2, top, bar.thumb, length, bar.fill);
}

/** The footer over M1–M4, in the device's soft-label greys and weight. */
function drawFooter(ctx: ScreenCtx, labels: readonly (SoftLabel | null)[]): void {
	labels.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		const color = label.tone === 'dim' ? FOOTER.color.dim : FOOTER.color.normal;
		text(ctx, label.text, SOFT_KEY_X[i], FOOTER.baseline, TEXT.size, color, 'center', 0, true);
	});
}

/** The view popup over the page. */
function drawPopup(ctx: ScreenCtx, popup: NonNullable<SystemPresetsFrame['popup']>): void {
	ctx.save();
	ctx.globalAlpha = POPUP.dim * popup.alpha;
	fillBox(ctx, 0, 0, SCREEN.width, SCREEN.height, COLORS.black);
	ctx.globalAlpha = popup.alpha;
	for (const view of ['engine', 'category'] as const) {
		const top = POPUP.tops[view];
		const chosen = view === popup.view;
		fillBox(ctx, POPUP.x, top, POPUP.w, POPUP.h, chosen ? COLORS.white : COLORS.grey2, POPUP.r);
		if (chosen) encoderDot(ctx, 0, POPUP.x + POPUP.dot.dx, top + POPUP.dot.dy);
		text(ctx, `by ${view}`, POPUP.x + POPUP.w / 2, top + POPUP.baseline, 20, COLORS.ink, 'center');
	}
	ctx.restore();
}

/** Draws the preset browser. */
export function drawPresetBrowser(ctx: ScreenCtx, frame: SystemPresetsFrame): void {
	rowText(ctx, String(frame.track), LEFT_X, 0, COLORS.white);
	rowText(ctx, 'preset', LEFT_X, 1, COLORS.white);
	drawGroups(ctx, frame.groups);
	drawPresets(ctx, frame.presets);
	drawScroll(ctx, frame.groups, SCROLL.groups);
	drawScroll(ctx, frame.presets, SCROLL.presets);
	drawFooter(ctx, frame.soft);
	if (frame.popup) drawPopup(ctx, frame.popup);
}

/** The page in words: the track, the view, the chosen group and preset, the popup and footer. */
export function describePresetBrowser(frame: SystemPresetsFrame): string {
	const pick = (c: SystemListColumn) => (c.selected === null ? null : c.items[c.selected]);
	const picks = [pick(frame.groups), pick(frame.presets)].filter(Boolean).join(', ');
	const popup = frame.popup ? ' (view popup)' : '';
	const keys = frame.soft
		.map((label, i) => (label && label.tone !== 'dim' ? `M${i + 1} ${label.text}` : null))
		.filter(Boolean);
	const footer = keys.length ? `; ${keys.join(', ')}` : '';
	return `presets for track ${frame.track}, by ${frame.view}${popup}: ${picks || 'empty'}${footer}`;
}
