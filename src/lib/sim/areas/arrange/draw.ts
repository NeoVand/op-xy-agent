/**
 * Drawing the arrange area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry
 * per frame page, with a short spoken description for screen readers.
 *
 * Both pages follow the owner's OS 1.1.33 unit as a camera saw it (docs/research/59-screen-profiling.md
 * §2.9; frames b1-721…837 for arrange mode, b1-838…874 for song mode), measured on the realigned
 * captures (design px = capture rows × 220/222) and drawn in TE's palette: the camera tints colours,
 * so their order and steps are taken from it, set against greys the other pages settled (the mix
 * strips). TE's guide art (arrange-003, arrange-028) lays both pages out differently. `view.ts` says
 * what is ours.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { disc, fillBox, hatch, line, ring, strokeBox, text } from '../../screen/draw';
import type { TextAlign } from '../../screen/font';
import { drawIcon } from '../../screen/icons';
import { COLORS, SOFT_KEY_X } from '../../screen/palette';
import { figuresLayout } from '../sequencer/device-text';
import type {
	ArrangeBlock,
	ArrangeColumn,
	ArrangeSoftLabel,
	ArrangeFrame,
	PatternsFrame,
	SongFrame
} from './frames';
import { BAND, BLOCK_X, COLUMN, NUMBER } from './view';

const TONES: Readonly<Record<ArrangeSoftLabel['tone'], string>> = {
	light: COLORS.light,
	dim: COLORS.dim
};

/**
 * The soft labels: 20 px in the heavier weight, a little higher than TE's art sets them, and a
 * little tighter than that weight's own spacing (the device's words measure between the two).
 */
const FOOTER = { baseline: 214.5, size: 20, tracking: -0.015 } as const;

/**
 * Figures as the device sets them (its 1 is narrow, `../sequencer/device-text.ts`), in the heavier
 * weight, `tracking` em apart beyond the font's spacing. Returns the run's width.
 */
function figures(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	size: number,
	color: string,
	align: TextAlign = 'left',
	tracking = 0
): number {
	const { glyphs, width } = figuresLayout(value, size);
	const extra = tracking * size;
	const total = width + extra * Math.max(0, glyphs.length - 1);
	const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
	glyphs.forEach((g, i) => {
		if (g.ch !== ' ') text(ctx, g.ch, x0 + g.x + extra * i, y, size, color, 'left', 0, true);
	});
	return total;
}

// ─────────────────────────────────────────────────────────────────────────── arrange mode

/** The column rules: 1 px, the ramp's third grey, from the top down to the column's foot. */
const RULE = { color: COLORS.grey1, width: 1 } as const;

/**
 * The selected track's number over its column: 20 px, heavier weight, set from a fixed place in the
 * column (a 1 and a 3 start at the same x, b1-738, 739).
 */
const LABEL = { x: 23.1, baseline: 19.5, size: 20 } as const;

/** Top-left corners of the auxiliary pictograms over the selected column (TE's arrange-003). */
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

/** The scene: a white rounded box with a black disc holding the number (b1-738, 814, 829). */
const SCENE = {
	box: { x: 214, y: 146.15, w: 52, h: 52.1, radius: 5.65 },
	disc: { cx: 240, cy: 172.2, r: 21.3 },
	digits: { x: 239.45, baseline: 182.7, size: 30 }
} as const;

/** A scene waiting its turn (ours): an outlined box between the scene's and the next rule. */
const QUEUED = { x: 268.5, y: 157.7, size: 29, radius: 5, baseline: 179.2, text: 20 } as const;

/** The edges of patterns stacked away on other tracks: 4 px apart, each indented 4 px (TE's art). */
const EDGE = { gap: 4, color: COLORS.light } as const;

/**
 * One pattern block in the column whose left edge is `left`: its fill from `x`, `w` wide, its notes
 * and number (placed from the column's edge either way), and hatching when the track is muted.
 */
function drawBlock(
	ctx: ScreenCtx,
	block: ArrangeBlock,
	left: number,
	x: number,
	w: number,
	muted: boolean
): void {
	fillBox(ctx, x, block.top, w, block.bottom - block.top, block.color);
	for (const [dx, dy, length] of block.notes) {
		fillBox(ctx, left + dx, block.centre + dy - 0.5, length, 1, block.ink);
	}
	if (block.number !== null) {
		figures(
			ctx,
			String(block.number),
			left + NUMBER.x,
			block.centre + NUMBER.drop,
			NUMBER.size,
			block.ink
		);
	}
	if (muted) hatch(ctx, x, block.top, w, block.bottom - block.top, block.ink, 7.5, 0.5);
}

/** A track that is not selected: its segment of the band, and the edges of its other patterns. */
function drawBandSegment(ctx: ScreenCtx, column: ArrangeColumn, x: number): void {
	const block = column.blocks[0];
	if (block) drawBlock(ctx, block, x, x, COLUMN.width, column.muted);
	for (let k = 0; k < column.below; k++) {
		const y = BAND.bottom + EDGE.gap * (k + 1);
		line(ctx, x + EDGE.gap * k, y, x + COLUMN.width, y, EDGE.color, 1);
	}
	for (let k = 0; k < column.above; k++) {
		const y = BAND.top - EDGE.gap * (k + 1);
		line(ctx, x + EDGE.gap * k, y, x + COLUMN.width, y, EDGE.color, 1);
	}
}

/** The selected track: its stack of patterns over both rules, cut off at the column's foot. */
function drawStack(ctx: ScreenCtx, column: ArrangeColumn, x: number): void {
	const fill = x + BLOCK_X.inset;
	ctx.save();
	ctx.beginPath();
	ctx.rect(fill, 0, BLOCK_X.width, COLUMN.bottom);
	ctx.clip();
	for (const block of column.blocks) {
		drawBlock(ctx, block, x, fill, BLOCK_X.width, column.muted);
	}
	ctx.restore();
}

/** Arrange mode: the rules, the band, the selected track's stack and name, the scene, the keys. */
function drawPatterns(ctx: ScreenCtx, frame: PatternsFrame): void {
	for (let i = 1; i < 8; i++) {
		const x = i * COLUMN.width;
		line(ctx, x, 0, x, COLUMN.bottom, RULE.color, RULE.width);
	}
	frame.columns.forEach((column, i) => {
		if (!column.selected) drawBandSegment(ctx, column, i * COLUMN.width);
	});
	frame.columns.forEach((column, i) => {
		if (column.selected) drawStack(ctx, column, i * COLUMN.width);
	});
	frame.columns.forEach((column, i) => {
		const x = i * COLUMN.width;
		// ours: the device's captures show no linked track
		if (column.linked) text(ctx, 'link', x + COLUMN.width / 2, 190, 10, COLORS.light, 'center');
		if (!column.selected) return;
		if (column.icon)
			drawIcon(ctx, column.icon, ICON_AT[i][0], ICON_AT[i][1], { tint: COLORS.white });
		else figures(ctx, column.label, x + LABEL.x, LABEL.baseline, LABEL.size, COLORS.white);
	});
	const { box, disc: d, digits } = SCENE;
	fillBox(ctx, box.x, box.y, box.w, box.h, COLORS.white, box.radius);
	disc(ctx, d.cx, d.cy, d.r, COLORS.black);
	figures(ctx, frame.scene, digits.x, digits.baseline, digits.size, COLORS.white, 'center');
	if (frame.queued !== null) {
		strokeBox(
			ctx,
			QUEUED.x + 0.5,
			QUEUED.y + 0.5,
			QUEUED.size - 1,
			QUEUED.size - 1,
			COLORS.white,
			1,
			QUEUED.radius
		);
		const cx = QUEUED.x + QUEUED.size / 2;
		figures(ctx, frame.queued, cx, QUEUED.baseline, QUEUED.text, COLORS.white, 'center');
	}
	frame.soft.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		const color = TONES[label.tone];
		text(
			ctx,
			label.text,
			SOFT_KEY_X[i],
			FOOTER.baseline,
			FOOTER.size,
			color,
			'center',
			FOOTER.tracking,
			true
		);
	});
}

// ─────────────────────────────────────────────────────────────────────────── song mode

/** The header: a white bar across the top, its lower corners rounded (b1-845, 853). */
const HEADER = { h: 23.85, radius: 6 } as const;
/** The traced loop sign's box (knowledge/opxy/device-icons/arrange.json). */
const LOOP_AT = [8, 2] as const;
/** "song 1": 20 px, the light weight, centred. */
const TITLE = { x: 240, baseline: 17.2, size: 20 } as const;
/** "count", 10 px heavier and spaced out, and its black box holding the scene count. */
const COUNT = {
	label: { x: 403.5, baseline: 10.6, size: 10, tracking: 0.08 },
	box: { x: 439.75, y: 3.05, w: 37.5, h: 17.7, radius: 3 },
	digits: { x: 459.6, baseline: 18.5, size: 17, tracking: 0.115 }
} as const;

/**
 * The grid: eight 40 px columns from x 80 and rows 37.81 px apart from y 40.35, 1 px lines in the
 * ramp's darkest grey; the vertical ones from the header down to 192.65, the horizontal ones the
 * screen's width, none under the last row (b1-845).
 */
const GRID = {
	left: 80,
	pitch: 40,
	top: 40.35,
	row: 37.81,
	bottom: 192.65,
	color: COLORS.dark
} as const;
/**
 * Column numbers (10 px heavier, 3.8 px into each column) and the rows' first slots, [1] … [25],
 * whose brackets stand a pixel off their digits (`tracking`).
 */
const HEADINGS = {
	columns: { dx: 3.8, baseline: 35.2 },
	rows: { right: 66, digit: 5.03, drop: 13.15 },
	last: { dx: 3.05 },
	size: 10,
	tracking: 0.1
} as const;
/**
 * An entry: a disc of the ramp's darkest grey (r 15) with its scene in 20 px heavier figures; the
 * song's position a white ring (r 17, 3 px) instead, with a 1 px notch that walks round once per
 * scene while the song plays (b1-865…869, clockwise from the top).
 */
const ENTRY = {
	r: 15,
	ring: { r: 17, width: 3 },
	notch: { from: 14.5, to: 19.5, width: 1.2 },
	cued: { r: 19.2, width: 1 },
	drop: 6.95,
	size: 20
} as const;
/** The cursor: a 3 px white bar on the slot's left edge, the row's height and the lines' too. */
const CURSOR = { width: 3 } as const;
/** Where the soft labels sit in song mode: "clear all" set from the left, TE's arrows (b1-844). */
const SONG_KEYS = { clear: 10.2, arrows: [161.8, 296.7], arrowY: 203.6 } as const;

/** Song mode's sign for loop off (ours): an arrow running into a bar, where the loop sign sits. */
function drawOnce(ctx: ScreenCtx): void {
	ctx.strokeStyle = COLORS.ink;
	ctx.lineWidth = 1.6;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	ctx.moveTo(12, 12);
	ctx.lineTo(31, 12);
	ctx.moveTo(26.5, 7.5);
	ctx.lineTo(31, 12);
	ctx.lineTo(26.5, 16.5);
	ctx.moveTo(35, 5);
	ctx.lineTo(35, 19);
	ctx.stroke();
}

/** The header: loop sign, song, count. */
function drawHeader(ctx: ScreenCtx, frame: SongFrame): void {
	fillBox(ctx, 0, 0, 480, HEADER.h, COLORS.white, [0, 0, HEADER.radius, HEADER.radius]);
	if (frame.loop)
		drawIcon(ctx, 'arrange.device.loop', LOOP_AT[0], LOOP_AT[1], { tint: COLORS.ink });
	else drawOnce(ctx);
	text(ctx, `song ${frame.song}`, TITLE.x, TITLE.baseline, TITLE.size, COLORS.ink, 'center');
	const { label, box, digits } = COUNT;
	text(ctx, 'count', label.x, label.baseline, label.size, COLORS.ink, 'left', label.tracking, true);
	fillBox(ctx, box.x, box.y, box.w, box.h, COLORS.black, box.radius);
	figures(
		ctx,
		frame.count,
		digits.x,
		digits.baseline,
		digits.size,
		COLORS.white,
		'center',
		digits.tracking
	);
}

/** The grid and its headings. */
function drawGrid(ctx: ScreenCtx, frame: SongFrame): void {
	for (let r = 0; r < 4; r++) {
		const y = GRID.top + GRID.row * r;
		line(ctx, 0, y, 480, y, GRID.color, 1);
	}
	for (let c = 0; c <= 8; c++) {
		const x = GRID.left + GRID.pitch * c;
		line(ctx, x, HEADER.h, x, GRID.bottom, GRID.color, 1);
	}
	const { columns, rows, last, size, tracking } = HEADINGS;
	for (let c = 0; c < 8; c++) {
		figures(
			ctx,
			String(c + 1),
			GRID.left + GRID.pitch * c + columns.dx,
			columns.baseline,
			size,
			COLORS.white
		);
	}
	for (let r = 0; r < 4; r++) {
		const n = String(frame.first + 8 * r);
		// the device steps a label left a digit's width per digit, then sets it with its narrow 1
		const x = rows.right - rows.digit * n.length;
		figures(
			ctx,
			`[${n}]`,
			x,
			GRID.top + GRID.row * r + rows.drop,
			size,
			COLORS.white,
			'left',
			tracking
		);
	}
	const lastX = GRID.left + GRID.pitch * 8 + last.dx;
	const lastY = GRID.top + GRID.row * 3 + rows.drop;
	figures(ctx, `[${frame.first + 31}]`, lastX, lastY, size, COLORS.white, 'left', tracking);
}

/** One entry of the song. */
function drawEntry(ctx: ScreenCtx, slot: NonNullable<SongFrame['slots'][number]>, i: number): void {
	const cx = GRID.left + GRID.pitch / 2 + GRID.pitch * (i % 8);
	const cy = GRID.top + GRID.row * Math.floor(i / 8) + GRID.row / 2;
	if (slot.playing) {
		ring(ctx, cx, cy, ENTRY.ring.r, COLORS.white, ENTRY.ring.width);
		if (slot.progress !== null) {
			const a = 2 * Math.PI * slot.progress - Math.PI / 2;
			const { from, to, width } = ENTRY.notch;
			line(
				ctx,
				cx + from * Math.cos(a),
				cy + from * Math.sin(a),
				cx + to * Math.cos(a),
				cy + to * Math.sin(a),
				COLORS.black,
				width
			);
		}
	} else disc(ctx, cx, cy, ENTRY.r, COLORS.dark);
	// ours: the captures show no cued entry
	if (slot.cued) ring(ctx, cx, cy, ENTRY.cued.r, COLORS.light, ENTRY.cued.width);
	figures(ctx, slot.scene, cx, cy + ENTRY.drop, ENTRY.size, COLORS.white, 'center');
}

/** Song mode: header, grid, entries, the cursor while shift is held, the keys. */
function drawSong(ctx: ScreenCtx, frame: SongFrame): void {
	drawHeader(ctx, frame);
	drawGrid(ctx, frame);
	frame.slots.forEach((slot, i) => {
		if (slot) drawEntry(ctx, slot, i);
	});
	if (frame.lit && frame.cursor !== null) {
		const x = GRID.left + GRID.pitch * (frame.cursor % 8);
		const y = GRID.top + GRID.row * Math.floor(frame.cursor / 8);
		fillBox(ctx, x - CURSOR.width / 2, y - 0.5, CURSOR.width, GRID.row + 1, COLORS.white);
	}
	frame.soft.slice(0, 4).forEach((label, i) => {
		if (!label) return;
		const color = TONES[label.tone];
		if (label.icon) {
			drawIcon(ctx, label.icon, SONG_KEYS.arrows[i - 1] ?? SOFT_KEY_X[i], SONG_KEYS.arrowY, {
				tint: color
			});
		} else {
			const [x, align] =
				i === 0 ? [SONG_KEYS.clear, 'left' as const] : [SOFT_KEY_X[i], 'center' as const];
			text(ctx, label.text, x, FOOTER.baseline, FOOTER.size, color, align, FOOTER.tracking, true);
		}
	});
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
			`song ${frame.song}${frame.loop ? ', looping' : ''}: ${frame.length} scene${frame.length === 1 ? '' : 's'}, cursor at ${frame.at}${frame.playing ? ', playing' : ''}`
	}
};
