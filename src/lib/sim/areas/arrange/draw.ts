/**
 * Drawing the arrange area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry per
 * frame page, with a short spoken description for screen readers. Measurements are TE's (guide art
 * arrange-003 for arrange mode, arrange-028 for song mode; `view.ts` says what is ours).
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { disc, fillBox, hatch, line, ring, strokeBox, text } from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { drawIcon } from '../../screen/icons';
import { COLORS, SOFT_KEY_BASELINE, SOFT_KEY_X } from '../../screen/palette';
import type {
	ArrangeColumn,
	ArrangeFrame,
	ArrangeSoftLabel,
	PatternsFrame,
	SongFrame
} from './frames';
import { BAND_TOP, CELL_H, CELL_W, DOT, STACK_BOTTOM, STACK_TOP } from './view';

const TONES: Readonly<Record<ArrangeSoftLabel['tone'], string>> = {
	white: COLORS.white,
	grey: COLORS.grey3,
	light: COLORS.light
};

/** Where TE drew the song cursor's arrows (over M2 and M3). */
const ARROW_AT: Readonly<Record<NonNullable<ArrangeSoftLabel['icon']>, readonly [number, number]>> =
	{
		'arrange.left': [169, 204],
		'arrange.right': [299, 204]
	};

/** Top-left corners of the auxiliary pictograms, one per column (arrange-003). */
const ICON_AT: readonly (readonly [number, number])[] = [
	[20, 4],
	[80, 6],
	[139, 4],
	[200, 9],
	[258, 6],
	[316, 9],
	[376, 6],
	[436, 6]
];

/**
 * Text whose ink (not its advance) is centred on `x`: TE centres the scene number's figures in the
 * red box and sets them tight (−9 %, measured on its "10").
 */
function inkCentred(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	size: number,
	color: string,
	tracking: number
): void {
	const run = screenFont.layout(value, size, tracking);
	const k = size / screenFont.data.unitsPerEm;
	let left = Infinity;
	let right = -Infinity;
	for (const g of run.glyphs) {
		const glyph = screenFont.data.glyphs[g.name];
		if (!glyph) continue;
		left = Math.min(left, g.x + glyph.bbox[0] * k);
		right = Math.max(right, g.x + glyph.bbox[2] * k);
	}
	if (left > right) text(ctx, value, x, y, size, color, 'center', tracking);
	else text(ctx, value, x - (left + right) / 2, y, size, color, 'left', tracking);
}

/** Soft labels over M1–M4, in arrange's tones. */
function softLabels(ctx: ScreenCtx, labels: readonly (ArrangeSoftLabel | null)[]): void {
	labels.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		const color = TONES[label.tone];
		if (label.icon) {
			const [x, y] = ARROW_AT[label.icon];
			drawIcon(ctx, label.icon, x, y, { tint: color });
		} else text(ctx, label.text, SOFT_KEY_X[i], SOFT_KEY_BASELINE, 20, color, 'center');
	});
}

/** One track's column: its pattern cells, the stack edges, mute hatching and the link mark. */
function drawColumn(ctx: ScreenCtx, column: ArrangeColumn, x: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, STACK_TOP, CELL_W, STACK_BOTTOM - STACK_TOP);
	ctx.clip();
	for (const cell of column.cells) {
		fillBox(ctx, x, cell.y, CELL_W, CELL_H, cell.color);
		if (cell.outline)
			strokeBox(ctx, x + 0.25, cell.y + 0.25, CELL_W - 0.5, CELL_H - 0.5, COLORS.white, 0.5);
		for (const [dx, dy] of cell.dots) fillBox(ctx, x + dx, cell.y + dy, DOT, DOT, cell.ink);
		if (cell.number !== null) text(ctx, String(cell.number), x + 4.5, cell.y + 25, 10, cell.ink);
		if (column.muted) hatch(ctx, x, cell.y, CELL_W, CELL_H, cell.ink, 7.5, 0.5);
	}
	ctx.restore();
	// the patterns stacked away: edges below the band for the ones after, above for the ones before
	for (let k = 0; k < column.below; k++) {
		const y = BAND_TOP + CELL_H + 4 + 4 * k;
		line(ctx, x + 4 * k, y, x + CELL_W, y, COLORS.light, 1);
	}
	for (let k = 0; k < column.above; k++) {
		const y = BAND_TOP - 4 - 4 * k;
		line(ctx, x + 4 * k, y, x + CELL_W, y, COLORS.light, 1);
	}
	if (column.linked) text(ctx, 'link', x + CELL_W / 2, 190, 10, COLORS.light, 'center');
}

/** Arrange mode (arrange-003): columns, pictograms, the scene in its red box. */
function drawPatterns(ctx: ScreenCtx, frame: PatternsFrame): void {
	softLabels(ctx, frame.soft);
	for (let i = 1; i < 8; i++) line(ctx, i * CELL_W, 0, i * CELL_W, STACK_BOTTOM, COLORS.grey1, 0.5);
	frame.columns.forEach((column, i) => drawColumn(ctx, column, i * CELL_W));
	frame.columns.forEach((column, i) => {
		const color = column.selected ? COLORS.white : COLORS.grey2;
		if (column.icon) drawIcon(ctx, column.icon, ICON_AT[i][0], ICON_AT[i][1], { tint: color });
		else text(ctx, column.label, i * CELL_W + CELL_W / 2, 22, 20, color, 'center');
	});
	fillBox(ctx, 215, 20, 50, 50, COLORS.red, 5);
	// figures run tight; a number still being typed keeps its dashes apart
	const typing = /\D/.test(frame.scene);
	inkCentred(ctx, frame.scene, 239.8, 60, 40, COLORS.white, typing ? 0 : -0.09);
	if (frame.queued !== null) {
		strokeBox(ctx, 270.5, 32.5, 29, 25, COLORS.red, 1, 3);
		text(ctx, frame.queued, 285, 52, 20, COLORS.red, 'center');
	}
}

/** Song mode's sign for loop off (ours): an arrow running into a bar, where the loop sign sits. */
function drawOnce(ctx: ScreenCtx): void {
	ctx.strokeStyle = COLORS.black;
	ctx.lineWidth = 1.94;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	ctx.moveTo(10, 13);
	ctx.lineTo(29, 13);
	ctx.moveTo(24.5, 8.5);
	ctx.lineTo(29, 13);
	ctx.lineTo(24.5, 17.5);
	ctx.moveTo(33, 6);
	ctx.lineTo(33, 20);
	ctx.stroke();
}

/** Song mode (arrange-028): header, the grid of entries, the cursor. */
function drawSong(ctx: ScreenCtx, frame: SongFrame): void {
	frame.slots.forEach((slot, i) => {
		if (!slot) return;
		const cx = 100 + 40 * (i % 8);
		const cy = 60 + 40 * Math.floor(i / 8);
		if (slot.playing) ring(ctx, cx, cy, 18, COLORS.white, 2);
		else disc(ctx, cx, cy, 15, COLORS.dark);
		if (slot.cued) ring(ctx, cx, cy, 18, COLORS.grey4, 1);
		text(ctx, slot.scene, cx, cy + 7.6, 20, COLORS.white, 'center');
	});
	fillBox(ctx, 0, 0, 480, 25, COLORS.white, 5);
	if (frame.loop) drawIcon(ctx, 'arrange.loop', 9, 4);
	else drawOnce(ctx);
	text(ctx, `song ${frame.song}`, 239.2, 20, 20, COLORS.black, 'center', -0.028);
	text(ctx, 'count', 410, 10, 10, COLORS.black);
	fillBox(ctx, 439, 2, 39, 21, COLORS.black, 3);
	text(ctx, frame.count, 458.5, 20, 20, COLORS.white, 'center');
	for (let c = 0; c < 8; c++) text(ctx, String(c + 1), 85 + 40 * c, 35, 10, COLORS.grey3);
	for (let r = 0; r < 4; r++) {
		text(ctx, String(frame.first + 8 * r), 75, 52.5 + 40 * r, 10, COLORS.grey3, 'right');
	}
	text(ctx, `[${frame.first + 31}]`, 403.2, 172.5, 10, COLORS.grey3);
	softLabels(ctx, frame.soft);
	for (let y = 40; y <= 200; y += 40) line(ctx, 0, y, 480, y, COLORS.grey1, 1.12);
	for (let x = 80; x <= 400; x += 40) line(ctx, x, 25, x, 200, COLORS.grey1, 1.12);
	if (frame.cursor !== null) {
		const x = 80 + 40 * (frame.cursor % 8);
		const y = 40 + 40 * Math.floor(frame.cursor / 8);
		line(ctx, x, y, x, y + 40, COLORS.white, 4.47);
	}
}

export const drawers: AreaDrawers<ArrangeFrame> = {
	arrange: {
		draw: (ctx, frame) => drawPatterns(ctx, frame),
		describe: (frame) => {
			const selected = frame.columns.find((c) => c.selected);
			const track = selected
				? `, ${selected.name} pattern ${selected.pattern} of ${selected.patterns}` +
					(selected.linked ? ', sound link' : '') +
					(selected.muted ? ', muted' : '')
				: '';
			const next = frame.queued ? `, scene ${frame.queued} next` : '';
			return `arrange, scene ${frame.scene}${next}, ${frame.bank} tracks${track}`;
		}
	},
	song: {
		draw: (ctx, frame) => drawSong(ctx, frame),
		describe: (frame) =>
			`song ${frame.song}${frame.loop ? ', looping' : ''}: ${frame.length} scene${frame.length === 1 ? '' : 's'}, cursor at ${Number(frame.count)}${frame.playing ? ', playing' : ''}`
	}
};
