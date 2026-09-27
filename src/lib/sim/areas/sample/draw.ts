/**
 * Drawing the sample area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one
 * entry per frame page, with a short spoken description for screen readers. Geometry and colours
 * are read off TE's guide art: the record pages (sample-003, 004, 017, 100), the slicer
 * (sample-076, 080, 087, 094) and the library (sample-132, 140).
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { disc, fillBox, line, ring, softLabels, strokeBox, text } from '../../screen/draw';
import { drawIcon } from '../../screen/icons';
import { COLORS, SOFT_KEY_BASELINE, SOFT_KEY_X } from '../../screen/palette';
import type {
	KeyboardView,
	LibraryColumn,
	SampleFrame,
	SampleLibraryFrame,
	SampleRecordFrame,
	SampleSliceFrame
} from './frames';
import { SLICE_COLUMN } from './slicer';
import { decodeWave } from './wave';

/** A waveform column on the card and the tile (TE's pitch; the slicer's is three times it). */
const COLUMN = 2.07;

/** Draws a waveform's columns symmetric about `mid`, `step` px per sixteenth. */
function columns(
	ctx: ScreenCtx,
	levels: readonly number[],
	x0: number,
	width: number,
	mid: number,
	step: number,
	color: (column: number) => string,
	right = 480
): void {
	levels.forEach((level, c) => {
		if (level <= 0) return;
		const x = x0 + c * width;
		if (x >= right) return;
		const h = level * step;
		ctx.fillStyle = color(c);
		ctx.fillRect(x, mid - h, Math.min(width, right - x), 2 * h);
	});
}

/** A soft-key arrow (← on M2, → on M3), 16.7 px of shaft and a 5 × 10 head. */
function arrow(ctx: ScreenCtx, cx: number, direction: -1 | 1, color: string, width: number): void {
	const tip = cx + direction * 8.75;
	const tail = cx - direction * 8.75;
	line(ctx, tail, 210, tip - direction * 0.8, 210, color, width);
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	ctx.moveTo(tip - direction * 5, 205);
	ctx.lineTo(tip, 210);
	ctx.lineTo(tip - direction * 5, 215);
	ctx.stroke();
}

// ─────────────────────────────────────────────────────────────── the record page

/** The input source in its box: TE's microphone, or our line-in jack and USB plug. */
function sourceIcon(ctx: ScreenCtx, source: SampleRecordFrame['source'], fine: boolean): void {
	strokeBox(ctx, 445, 25, 30, 30, COLORS.grey4, fine ? 1 : 1.12, 5);
	if (source === 'mic') {
		drawIcon(ctx, 'sample.mic', 455, 29.5);
		return;
	}
	ctx.fillStyle = COLORS.white;
	if (source === 'line in') {
		// a 3.5 mm plug: tip, rings and sleeve, then the cable (ours)
		ctx.beginPath();
		ctx.arc(460, 31.5, 1.5, Math.PI, 0);
		ctx.lineTo(461.5, 36);
		ctx.lineTo(458.5, 36);
		ctx.closePath();
		ctx.fill();
		fillBox(ctx, 458.5, 37, 3, 4, COLORS.white);
		fillBox(ctx, 457, 42, 6, 7, COLORS.white, 1);
		fillBox(ctx, 459, 49, 2, 6, COLORS.white);
		return;
	}
	// USB: a rounded plug with its tongue, then the cable (ours)
	fillBox(ctx, 455, 30, 10, 13, COLORS.white, 2);
	fillBox(ctx, 457.5, 32, 5, 3, COLORS.black, 0.5);
	fillBox(ctx, 456.5, 43, 7, 4, COLORS.white, 1);
	fillBox(ctx, 459, 47, 2, 8, COLORS.white);
}

/**
 * The level meter: the rail, the input bar from the bottom and the orange threshold. TE draws the
 * drum and multisampler pages' meter with finer strokes (`fine`) than the others.
 */
function meter(ctx: ScreenCtx, level: number, threshold: number, fine: boolean): void {
	fillBox(ctx, 445, 60, 30, 130, COLORS.white, 4);
	strokeBox(ctx, 445, 60, 30, 130, COLORS.white, fine ? 1 : 1.12, 4);
	line(ctx, 460, 65, 460, 185, COLORS.ink, fine ? 1 : 2.23);
	const top = 190 - Math.max(0, Math.min(1, level)) * 125;
	if (top < 190) line(ctx, 460, top, 460, 190, COLORS.ink, fine ? 10 : 11.16);
	const y = 190 - Math.max(0, Math.min(1, threshold)) * 125;
	line(ctx, 445, y, 475, y, COLORS.record, fine ? 2 : 2.23);
}

/** A note's x on the record page's keyboard: 75 white keys from C−1 over the card. */
const KEY_W = 355 / 75;
const WHITE_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const isBlack = (note: number) => [1, 3, 6, 8, 10].includes(((note % 12) + 12) % 12);
const whiteIndex = (note: number) => 7 * Math.floor(note / 12) + WHITE_OF[((note % 12) + 12) % 12];
/** Edges of a note's key (a black key's edges are the boundary it sits on). */
const rightEdge = (note: number) => 62.51 + (whiteIndex(note) + 1) * KEY_W;
const leftEdge = (note: number) => 62.51 + (whiteIndex(note) + (isBlack(note) ? 1 : 0)) * KEY_W;

/**
 * The multisampler's keyboard (sample-100): a band on the card where zones end (ticks) with the
 * selected zone filled, over 128 keys; the keys the keyboard plays now are light, the selected key
 * white.
 */
function keyboard(ctx: ScreenCtx, view: KeyboardView): void {
	for (let w = 0; w < 75; w++) {
		const note = 12 * Math.floor(w / 7) + [0, 2, 4, 5, 7, 9, 11][w % 7];
		const color =
			note === view.selected
				? COLORS.white
				: note >= view.low && note <= view.high
					? COLORS.light
					: COLORS.grey2;
		const x = 62.51 + w * KEY_W;
		fillBox(ctx, x, 160.5, KEY_W, 18, color);
		ctx.strokeStyle = COLORS.black;
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.rect(x, 160.5, KEY_W, 18);
		ctx.stroke();
	}
	for (let note = 0; note < 128; note++) {
		if (!isBlack(note)) continue;
		const x = leftEdge(note);
		if (x > 417) continue;
		line(ctx, x, 160.5, x, 171.78, note === view.selected ? COLORS.white : COLORS.black, 3);
	}
	if (view.zone) {
		const x0 = leftEdge(view.zone.lo);
		const x1 = rightEdge(view.zone.hi);
		fillBox(ctx, x0, 152.7, x1 - x0, 7.8, COLORS.grey2);
		strokeBox(ctx, x0, 152.7, x1 - x0, 7.8, COLORS.black, 0.49);
	}
	for (const top of view.tops) {
		const x = rightEdge(top);
		if (x < 417) line(ctx, x, 152.66, x, 160.5, COLORS.black, 0.5);
	}
	line(ctx, 62.1, 152.66, 417.51, 152.66, COLORS.black, 0.5);
}

/** Tracking of the record page's texts, as TE set them (em). */
const PROMPT_TRACKING = 0.014;
const TIMER_TRACKING = 0.012;
const NAME_TRACKING = -0.006;
const CLEAR_TRACKING = -0.014;

/** The record page. */
function drawRecord(ctx: ScreenCtx, f: SampleRecordFrame): void {
	const keyed = f.target === 'drum' || f.target === 'multisampler';
	if (f.header === 'prompt') {
		if (f.target === 'library') {
			// "press ● to record to file" (sample-004)
			text(ctx, 'press', 129.34, 45, 20, COLORS.white, 'left', PROMPT_TRACKING);
			disc(ctx, 195, 37.5, 7.5, COLORS.record);
			text(ctx, 'to record to file', 212.4, 45, 20, COLORS.white, 'left', PROMPT_TRACKING);
		} else {
			text(ctx, 'press key to sample', 240, 45, 20, COLORS.white, 'center', PROMPT_TRACKING);
		}
	} else {
		// the timer box (sample-017): outlined orange while recording, a ring while armed (ours)
		strokeBox(ctx, 200, 25, 80, 25, f.recording ? COLORS.record : COLORS.grey4, 0.75, 5);
		if (f.armed) ring(ctx, 212.5, 37.5, 6.9, COLORS.record, 1.2);
		else disc(ctx, 212.5, 37.5, 7.5, COLORS.record);
		text(ctx, f.timer, 225.3, 45, 20, COLORS.white, 'left', TIMER_TRACKING);
	}

	const tall = f.keyboard !== null;
	fillBox(ctx, 62.51, 80, 355, tall ? 98.5 : 65, COLORS.white, 5);
	if (f.name) {
		const color = f.nameTone === 'white' ? COLORS.white : COLORS.light;
		text(ctx, f.name, 70, 75, 10, color, 'left', NAME_TRACKING);
	}
	const mid = keyed ? 111.85 : 112.5;
	columns(ctx, decodeWave(f.wave), 62.52, COLUMN, mid, 1.25, () => COLORS.ink, 417.51);
	line(ctx, 62.52, mid, 417.48, mid, COLORS.ink, 1.12);
	if (f.keyboard) keyboard(ctx, f.keyboard);

	text(ctx, f.channel ?? f.gain, 474.4, 20, 20, COLORS.light, 'right');
	sourceIcon(ctx, f.source, keyed);
	meter(ctx, f.level, f.threshold, keyed);

	if (f.soft.record) disc(ctx, SOFT_KEY_X[0], 207.5, 7.5, COLORS.record);
	const tone = (on: boolean) => (on ? COLORS.light : COLORS.grey1);
	if (f.soft.play !== null) drawIcon(ctx, 'sample.play', 167.5, 199.5, { tint: tone(f.soft.play) });
	if (f.soft.arrows) {
		arrow(ctx, 176.25, -1, COLORS.light, 1.5);
		arrow(ctx, 308.75, 1, COLORS.light, 1.5);
	}
	// TE sets clear further left on the drum and multisampler pages than on the others
	if (f.soft.clear !== null) clear(ctx, keyed ? 417.8 : 440.35, tone(f.soft.clear));
}

/** The "clear" soft label over M4, set tighter than other labels as TE does. */
function clear(ctx: ScreenCtx, cx: number, color: string): void {
	text(ctx, 'clear', cx, SOFT_KEY_BASELINE, 20, color, 'center', CLEAR_TRACKING);
}

// ─────────────────────────────────────────────────────────────── the slicer

/** The slicer's lane: rounded 2.5 px across and 5 px down, as TE draws it. */
function sliceLane(ctx: ScreenCtx): void {
	const k = 0.4477152502;
	ctx.fillStyle = COLORS.dark;
	ctx.beginPath();
	ctx.moveTo(2.5, 30);
	ctx.lineTo(477.5, 30);
	ctx.bezierCurveTo(477.5 + 2.5 * (1 - k), 30, 480, 30 + 5 * k, 480, 35);
	ctx.lineTo(480, 185);
	ctx.bezierCurveTo(480, 190 - 5 * k, 477.5 + 2.5 * (1 - k), 190, 477.5, 190);
	ctx.lineTo(2.5, 190);
	ctx.bezierCurveTo(2.5 * k, 190, 0, 190 - 5 * k, 0, 185);
	ctx.lineTo(0, 35);
	ctx.bezierCurveTo(0, 30 + 5 * k, 2.5 * k, 30, 2.5, 30);
	ctx.closePath();
	ctx.fill();
}

/** The slicer page. */
function drawSlice(ctx: ScreenCtx, f: SampleSliceFrame): void {
	sliceLane(ctx);
	line(ctx, 0, 110, 480, 110, COLORS.grey1, 3.35);
	const head = f.playhead === null ? Infinity : f.playhead * 480;
	// played: white; still to play: grey (TE's art shows playback part way)
	columns(ctx, decodeWave(f.wave), 0.01, SLICE_COLUMN, 110, 3.75, (c) =>
		c * SLICE_COLUMN < head ? COLORS.white : COLORS.grey1
	);
	for (const m of f.markers) {
		const x = m.at * 480;
		line(ctx, x, 30.12, x, 190, COLORS.black, 2.23);
		fillBox(ctx, x - 5, 25, 10, 5, m.selected ? COLORS.white : COLORS.grey3);
		fillBox(ctx, x - 5, 190, 10, 5, m.selected ? COLORS.white : COLORS.grey3);
	}
	text(ctx, f.mode, 5, 20, 20, COLORS.white);
	text(ctx, f.count, 475, 20, 20, COLORS.white, 'right');
	softLabels(ctx, [
		f.mode === 'tap' ? { text: 'tap' } : null,
		null,
		{ text: 'cancel' },
		{ text: 'done' }
	]);
}

// ─────────────────────────────────────────────────────────────── the library

/** A library column's scroll bar: a hairline with a 4.5 px thumb. */
function scrollBar(ctx: ScreenCtx, x: number, thumb: LibraryColumn['thumb'], color: string): void {
	line(ctx, x, 10, x, 190, color, 0.56);
	if (thumb.size >= 1) return;
	const top = 10 + thumb.top * 180;
	line(ctx, x, top, x, top + thumb.size * 180, color, 4.47);
}

/** The library page. */
function drawLibrary(ctx: ScreenCtx, f: SampleLibraryFrame): void {
	fillBox(ctx, 10, 20.61, 75, 75, COLORS.white, 5);
	if (f.tile) columns(ctx, decodeWave(f.tile), 10, COLUMN, 55.61, 1.25, () => COLORS.black, 85);
	line(ctx, 10, 55.61, 85, 55.61, COLORS.black, 1.59);

	const baseline = (row: number) => 35.75 + 20 * row;
	if (f.folders.selected !== null) {
		const top = baseline(f.folders.selected) - 14.63;
		strokeBox(ctx, 115.28, top, 159.23, 19.44, COLORS.white, 0.56, 2.2);
	}
	f.folders.items.forEach((item, row) => text(ctx, item, 120.1, baseline(row), 20, COLORS.white));
	if (f.files.selected !== null) {
		fillBox(ctx, 295, baseline(f.files.selected) - 15.75, 165, 20, COLORS.white, 2.5);
	}
	f.files.items.forEach((item, row) =>
		text(
			ctx,
			item,
			300.06,
			baseline(row),
			20,
			row === f.files.selected ? COLORS.black : COLORS.white
		)
	);
	// TE draws the folder column's bar dark and the sample column's white
	scrollBar(ctx, 285, f.folders.thumb, COLORS.dark);
	scrollBar(ctx, 470, f.files.thumb, COLORS.white);

	if (f.keyControls) {
		arrow(ctx, SOFT_KEY_X[1], -1, COLORS.light, 1.12);
		arrow(ctx, SOFT_KEY_X[2], 1, COLORS.light, 1.12);
		clear(ctx, 440.35, COLORS.light);
	}
}

// ─────────────────────────────────────────────────────────────── descriptions

const RECORD_PAGES: Readonly<Record<SampleRecordFrame['target'], string>> = {
	library: 'record to the library',
	sampler: 'synth sampler record',
	drum: 'drum sampler record',
	multisampler: 'multisampler record'
};

/** The sample area's pages. */
export const drawers: AreaDrawers<SampleFrame> = {
	'sample-record': {
		draw: (ctx, frame) => drawRecord(ctx, frame),
		describe: (f) => {
			const state = f.recording ? `recording, ${f.timer} left` : f.armed ? 'armed' : 'ready';
			const sample = f.name ? `, ${f.name}` : '';
			const input = f.channel ? `${f.source} ${f.channel}` : `${f.source}, gain ${f.gain}`;
			return `${RECORD_PAGES[f.target]}: ${state}${sample}, ${input}`;
		}
	},
	'sample-slice': {
		draw: (ctx, frame) => drawSlice(ctx, frame),
		describe: (f) => `slice ${f.mode}: ${f.count} slices`
	},
	'sample-library': {
		draw: (ctx, frame) => drawLibrary(ctx, frame),
		describe: (f) => {
			const folder = f.folders.selected === null ? '' : f.folders.items[f.folders.selected];
			const item = f.files.selected === null ? '' : f.files.items[f.files.selected];
			return `sample library: ${folder}${item ? `, ${item}` : ''}`;
		}
	}
};
