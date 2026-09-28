/**
 * M4 (LFO) as the device draws it: measured on the owner's OS 1.1.33 unit by camera
 * (docs/research/59-screen-profiling.md §2.4). TE's guide art (instrument-052 … 093) has the same
 * five layouts; the device's details differ, and the pictograms TE never drew are traced off its
 * screen (knowledge/opxy/device-icons/modules.json, `research/device/icontrace.py`).
 *
 * - White cards (radius 5) with 1 px ink seams where they meet, each labelled in 11 px grey above
 *   (or under) it, with its encoder's mark: a dark dot for E1, a light one for E2, none for E3, a
 *   ring for E4.
 * - Speed: a note value and a count when synced, a dial whose hand turns half a circle when free.
 * - Amounts: a ladder of 21 ticks and a pointer.
 * - Destinations: a column of cards, the chosen one at y 80 (value, element), or one card (random).
 * - The parameter: TE's knob with its cap in the parameter's shade and its two handles, no curve.
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, line, ring, strokeBox, text } from '../draw';
import { screenFont } from '../font';
import type { LfoFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';
import { iconShapes } from './filter';

/** A destination: a module's page and whether its LFO runs free (does not restart on each note). */
export interface LfoDestination {
	readonly module: string;
	readonly free: boolean;
}

/**
 * The destinations of value and random, in E3's order: each page, then its free twin (the manual:
 * every page appears twice). The device lists syn, env and filter (camera, 1.1.33).
 */
export const DESTINATIONS: readonly LfoDestination[] = ['syn', 'env', 'filter'].flatMap(
	(module) => [
		{ module, free: false },
		{ module, free: true }
	]
);

/** Element follows a sensor, so nothing retriggers: syn, env, filter and amp, no free twins. */
export const SENSOR_DESTINATIONS: readonly LfoDestination[] = ['syn', 'env', 'filter', 'amp'].map(
	(module) => ({ module, free: false })
);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ───────────────────────────────────────────────────────────────────────── cards, labels, marks

/** The cards' row: 120 px tall from y 50; lower cards (random, tremolo, duck) from y 110. */
const ROW = { top: 50, middle: 110, bottom: 170, radius: 5 } as const;

/**
 * Labels: 11 px in the heavier weight, 4 px in from the card, their baseline 4.6 px above it (or
 * 10.4 px under a lower card); grey, the device's (random's env label is white, 0.7 px higher).
 */
const LABEL = { size: 11, dx: 4, above: 45.4, below: 180.4, color: COLORS.grey2 } as const;

function label(
	ctx: ScreenCtx,
	value: string,
	cardX: number,
	y: number,
	color: string = LABEL.color
) {
	text(ctx, value, cardX + LABEL.dx, y, LABEL.size, color, 'left', 0, true);
}

/** A white card; the seams between cards are drawn apart ({@link seams}). */
function card(ctx: ScreenCtx, x: number, y: number, w: number, h: number): void {
	fillBox(ctx, x, y, w, h, COLORS.white, ROW.radius);
}

/** The 1 px ink lines where cards meet: [x0, y0, x1, y1] each. */
function seams(ctx: ScreenCtx, lines: readonly (readonly [number, number, number, number])[]) {
	for (const [x0, y0, x1, y1] of lines) line(ctx, x0, y0, x1, y1, COLORS.ink, 1);
}

/**
 * The encoders' marks from a card's corner: E1 a dark dot, E2 a light grey one (lighter than on
 * other pages), E3 none, E4 a ring.
 */
function mark(ctx: ScreenCtx, encoder: 0 | 1 | 3, x: number, y: number): void {
	if (encoder === 3) ring(ctx, x + 9.9, y + 10.6, 4.5, COLORS.ink, 1);
	else disc(ctx, x + 10.3, y + 10.4, 5, encoder === 0 ? COLORS.ink : COLORS.grey4);
}

// ───────────────────────────────────────────────────────────────────────── speed

/**
 * The note drawn beside a synced count. Seen: 8 with a 32nd, 6 with a 16th, 4 with a quarter and 2
 * with a whole note; the other counts take the nearest of those (ours).
 */
function noteFor(count: number): string {
	if (count >= 7) return 'lfo.note.32nd';
	if (count >= 5) return 'lfo.note.16th';
	if (count >= 3) return 'lfo.note.quarter';
	return 'lfo.note.whole';
}

/**
 * The free dial: a disc of radius 24.2 with twelve notches 4 px wide cut 6.75 px into its rim, and
 * a white hand (5.2 px, round ends, −1.5 … 16.3 px from the centre) that turns from 12 o'clock at
 * the slowest free speed to 6 o'clock at the fastest.
 */
const DIAL = { cx: 59.9, cy: 59.8, r: 24.2, notch: { inner: 17.45, width: 4 }, hand: 5.2 } as const;

function dial(ctx: ScreenCtx, x: number, y: number, position: number): void {
	const cx = x + DIAL.cx;
	const cy = y + DIAL.cy;
	disc(ctx, cx, cy, DIAL.r, COLORS.ink);
	ctx.fillStyle = COLORS.white;
	for (let i = 0; i < 12; i++) {
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate((i * Math.PI) / 6);
		ctx.fillRect(
			-DIAL.notch.width / 2,
			-DIAL.r - 1,
			DIAL.notch.width,
			DIAL.r + 1 - DIAL.notch.inner
		);
		ctx.restore();
	}
	const a = clamp(position, 0, 1) * Math.PI;
	const [sin, cos] = [Math.sin(a), -Math.cos(a)];
	ctx.lineCap = 'round';
	line(
		ctx,
		cx + sin * 1.1,
		cy + cos * 1.1,
		cx + sin * 13.7,
		cy + cos * 13.7,
		COLORS.white,
		DIAL.hand
	);
	ctx.lineCap = 'butt';
}

/**
 * A rule with a gap across the foot of random's speed card and element's source card: the gap is a
 * live reading (random's jumps from capture to capture; where it sits is ours).
 */
const RULE = { y: 107.3, x0: 16, x1: 105, gap: 6 } as const;

/** Random's reading for an animation step: a new value, 0–1, on each step (ours: a hash of it). */
function reading(step: number): number {
	// murmur3's finaliser: well spread, and the same for a step every time
	let h = Math.imul(step ^ 0x9e3779b9, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 0xffffffff;
}

function rule(ctx: ScreenCtx, x: number, at: number): void {
	const gap = x + RULE.x0 + (RULE.x1 - RULE.x0 - RULE.gap) * clamp(at, 0, 1);
	const y = ROW.top + RULE.y;
	if (gap > x + RULE.x0) line(ctx, x + RULE.x0, y, gap, y, COLORS.ink, 1);
	if (gap + RULE.gap < x + RULE.x1) line(ctx, gap + RULE.gap, y, x + RULE.x1, y, COLORS.ink, 1);
}

/**
 * The speed card (E1): a note value and its count (20 px, right-aligned near the top right corner;
 * random sets it 2 px further in) when synced, the dial when free.
 */
function speedCard(ctx: ScreenCtx, frame: LfoFrame, x: number): void {
	card(ctx, x, ROW.top, 120, 120);
	mark(ctx, 0, x, ROW.top);
	if (frame.speed.synced) {
		drawIcon(ctx, noteFor(Number(frame.speed.label)), x, ROW.top, { tint: COLORS.ink });
		const right = frame.type === 'random' ? 113.2 : 115.1;
		text(ctx, frame.speed.label, x + right, ROW.top + 20.5, 20, COLORS.ink, 'right');
	} else dial(ctx, x, ROW.top, frame.speed.position);
}

// ───────────────────────────────────────────────────────────────────────── amount

/**
 * The amount ladder: 21 ticks every 5 px from y 60 to 160, 10 px long at card x 45…55, the middle
 * one 17.5 px; the pointer (28 px, its tip at card x 34) marks −100 at the foot, 100 at the top.
 */
const LADDER = { top: 60, bottom: 160, x0: 45, x1: 55, long: 37.5, body: 6, shoulder: 29, tip: 34 };

function ladderCard(ctx: ScreenCtx, x: number, value: number, encoder: 0 | 1 | 3 | null): void {
	card(ctx, x, ROW.top, 60, 120);
	if (encoder !== null) mark(ctx, encoder, x, ROW.top);
	const middle = (LADDER.top + LADDER.bottom) / 2;
	for (let y = LADDER.top; y <= LADDER.bottom + 0.01; y += 5) {
		const x0 = Math.abs(y - middle) < 0.01 ? LADDER.long : LADDER.x0;
		line(ctx, x + x0, y, x + LADDER.x1, y, COLORS.ink, 1);
	}
	const y = middle - (clamp(value, -100, 100) / 100) * (middle - LADDER.top);
	ctx.fillStyle = COLORS.ink;
	ctx.beginPath();
	ctx.moveTo(x + LADDER.body, y - 5);
	ctx.lineTo(x + LADDER.shoulder, y - 5);
	ctx.lineTo(x + LADDER.tip, y);
	ctx.lineTo(x + LADDER.shoulder, y + 5);
	ctx.lineTo(x + LADDER.body, y + 5);
	ctx.closePath();
	ctx.fill();
}

// ───────────────────────────────────────────────────────────────────────── envelope

/**
 * The envelope's line on its 60 × 60 card: rising at −1, lying along the top at 0, falling at 1
 * (the device: low values rise, the middle is flat, high values fall). Tremolo's line is shorter,
 * starting at its E4 ring.
 */
const ENV_LINE = {
	tremolo: { left: 12.8, right: 46.3, top: 14.8, bottom: 45.1 },
	random: { left: 10.8, right: 49, top: 12.5, bottom: 47.2 }
} as const;

function envelopeLine(
	ctx: ScreenCtx,
	x: number,
	y: number,
	envelope: number,
	kind: keyof typeof ENV_LINE
): void {
	const g = ENV_LINE[kind];
	const t = (clamp(envelope, -1, 1) + 1) / 2;
	const drop = g.bottom - g.top;
	const yl = g.bottom - drop * Math.min(1, 2 * t);
	const yr = g.top + drop * Math.max(0, 2 * t - 1);
	line(ctx, x + g.left, y + yl, x + g.right, y + yr, COLORS.ink, 1.67);
}

// ───────────────────────────────────────────────────────────────────────── destinations

/**
 * TE's pictograms of the destination pages, where the device draws them on the card (value and
 * random name them under it). A free twin's "free" sits on a fixed baseline, 52.3 px down, and the
 * envelope's free twin draws both its icon and its name higher (seen in every frame).
 */
const DEST_ICON: Record<
	string,
	{ icon: string; dx: number; dy: number; freeDy?: number; freeName?: number }
> = {
	syn: { icon: 'lfo.wave.syn', dx: 12.5, dy: 9.5 },
	env: { icon: 'lfo.env', dx: 14.3, dy: 13, freeDy: 10, freeName: 50.4 },
	filter: { icon: 'lfo.filter', dx: 13.5, dy: 11.2 }
};
const FREE_NAME = 52.3;

/**
 * The page's name under the icon: 20 px, centred a little left of the card's middle and centred on
 * its own ink up and down, so "syn" sits higher than "filter" (as measured). Random's single card
 * sets it 2.9 px lower than the column's cards.
 */
const NAME = { dx: 29.7, column: 46.4, random: 49.3 } as const;

/** Draws a name with the middle of its ink (top of the tallest glyph to the lowest foot) at `cy`. */
function inkCentred(ctx: ScreenCtx, value: string, cx: number, cy: number): void {
	const k = 20 / screenFont.data.unitsPerEm;
	let top = 0;
	let bottom = 0;
	for (const name of screenFont.glyphNames(value)) {
		const glyph = screenFont.data.glyphs[name];
		if (!glyph) continue;
		top = Math.min(top, glyph.bbox[1] * k);
		bottom = Math.max(bottom, glyph.bbox[3] * k);
	}
	text(ctx, value, cx, cy - (top + bottom) / 2, 20, COLORS.ink, 'center');
}

/**
 * Element's cards: a pulse for syn and an envelope for env, unnamed and in thinner lines than TE's
 * art (about 1 px); the filter and the amp (a speaker and a small wave, traced off the device) keep
 * their names.
 */
const SENSOR_ICON: Record<string, { icon: string; dx: number; dy: number; named: boolean }> = {
	syn: { icon: 'lfo.pulse', dx: 8, dy: 18, named: false },
	env: { icon: 'lfo.adsr', dx: 7, dy: 18, named: false },
	filter: { icon: 'lfo.filter', dx: 13.5, dy: 11.2, named: true }
};

/** A 60 × 60 destination card: its page's pictogram and name ("free" on a free twin). */
function destCard(
	ctx: ScreenCtx,
	d: LfoDestination,
	x: number,
	y: number,
	sensor: boolean,
	nameAt: number = NAME.column
): void {
	card(ctx, x, y, 60, 60);
	const name = d.free ? 'free' : d.module;
	if (d.module === 'amp') {
		drawIcon(ctx, 'lfo.dest.amp', x, y, { tint: COLORS.ink });
		drawIcon(ctx, 'lfo.dest.amp.wave', x, y, { tint: COLORS.ink });
		inkCentred(ctx, name, x + NAME.dx, y + nameAt);
		return;
	}
	const own = sensor ? SENSOR_ICON[d.module] : undefined;
	if (own?.named) {
		drawIcon(ctx, own.icon, x + own.dx, y + own.dy, { tint: COLORS.ink });
		inkCentred(ctx, name, x + NAME.dx, y + nameAt);
		return;
	}
	if (own) {
		iconShapes(ctx, own.icon, [0], x + own.dx, y + own.dy, { stroke: COLORS.ink, width: 1.1 });
		return;
	}
	const pictogram = DEST_ICON[d.module];
	if (!pictogram) return;
	const dy = d.free ? (pictogram.freeDy ?? pictogram.dy) : pictogram.dy;
	drawIcon(ctx, pictogram.icon, x + pictogram.dx, y + dy, { tint: COLORS.ink });
	if (d.free) {
		const baseline = y + (pictogram.freeName ?? FREE_NAME);
		text(ctx, name, x + NAME.dx, baseline, 20, COLORS.ink, 'center');
	} else inkCentred(ctx, name, x + NAME.dx, y + nameAt);
}

/** The destination column: the chosen card at y 80, the others above and below (no wrapping). */
const COLUMN = { x: 240, at: 80, pitch: 60 } as const;

/**
 * The column's cards and the seams between them; returns the first card's top. Value shows only
 * one card above the chosen one (`above`: 1), element all of them up to the screen's edge (as seen
 * over the CC42 sweeps).
 */
function destColumn(
	ctx: ScreenCtx,
	list: readonly LfoDestination[],
	index: number,
	sensor: boolean,
	above = list.length
): number {
	const first = COLUMN.at - COLUMN.pitch * index;
	const from = Math.max(0, index - above);
	list.forEach((d, i) => {
		if (i >= from) destCard(ctx, d, COLUMN.x, first + COLUMN.pitch * i, sensor);
	});
	for (let i = from + 1; i < list.length; i++) {
		const y = first + COLUMN.pitch * i;
		seams(ctx, [[COLUMN.x, y, COLUMN.x + 60, y]]);
	}
	const top = Math.max(ROW.top, first + COLUMN.pitch * from);
	const bottom = Math.min(ROW.bottom, first + COLUMN.pitch * list.length);
	seams(ctx, [
		[COLUMN.x, top, COLUMN.x, bottom],
		[COLUMN.x + 60, top, COLUMN.x + 60, bottom]
	]);
	return first;
}

/** Where a destination sits in its list. */
function destIndex(list: readonly LfoDestination[], frame: LfoFrame): number {
	const i = list.findIndex(
		(d) => d.module === frame.destination.label && d.free === frame.destination.free
	);
	return Math.max(0, i);
}

// ───────────────────────────────────────────────────────────────────────── parameter

/**
 * The knob's cap takes the shade of the destination's encoder, lighter than the encoders' own
 * dots (measured: near black, mid grey, light grey, white).
 */
const CAPS = [COLORS.panel, COLORS.grey1, COLORS.light, COLORS.white] as const;

/**
 * The parameter card (E4): TE's knob without the curve it sits on (its two handles stay), the cap
 * in the parameter's shade; the card is labelled with the parameter's name.
 */
function paramCard(ctx: ScreenCtx, frame: LfoFrame, x: number): void {
	card(ctx, x, ROW.top, 120, 120);
	mark(ctx, 3, x, ROW.top);
	const [kx, ky] = [x + 8.96, ROW.top + 4.39];
	iconShapes(ctx, 'lfo.knob', [1, 2, 3, 4, 5, 6, 7, 8], kx, ky);
	iconShapes(ctx, 'lfo.knob', [9], kx, ky, { fill: CAPS[clamp(frame.parameter, 0, 3)] });
	label(ctx, frame.fourth, x, LABEL.above);
}

// ───────────────────────────────────────────────────────────────────────── the pages

/** Draws the LFO page; `tick` (the screen's animation step) moves random's reading. */
export function drawLfo(ctx: ScreenCtx, frame: LfoFrame, tick = 0): void {
	switch (frame.type) {
		case 'tremolo':
			drawTremolo(ctx, frame);
			break;
		case 'duck':
			drawDuck(ctx, frame);
			break;
		case 'random':
			drawRandom(ctx, frame, tick);
			break;
		case 'element':
			drawElement(ctx, frame);
			break;
		default:
			drawValue(ctx, frame);
	}
}

/** The seams of the 60 · 180 · 240 · 300 row (value, random, element). */
const ROW_SEAMS = [
	[180, ROW.top, 180, ROW.bottom],
	[240, ROW.top, 240, ROW.bottom],
	[300, ROW.top, 300, ROW.bottom]
] as const;

/**
 * Value: speed, amount, the destination column (unlabelled), the parameter. The column scrolls so
 * the chosen page sits at y 80, with one card above it.
 */
function drawValue(ctx: ScreenCtx, frame: LfoFrame): void {
	label(ctx, 'speed', 60, LABEL.above);
	speedCard(ctx, frame, 60);
	label(ctx, 'amount', 180, LABEL.above);
	ladderCard(ctx, 180, frame.amount, 1);
	destColumn(ctx, DESTINATIONS, destIndex(DESTINATIONS, frame), false, 1);
	paramCard(ctx, frame, 300);
	seams(ctx, [ROW_SEAMS[0]]);
}

/**
 * Random: as value, with the rule under the speed, one destination card over the envelope's card
 * (labelled env, in white), and its step wave under the speed card.
 */
function drawRandom(ctx: ScreenCtx, frame: LfoFrame, tick: number): void {
	label(ctx, 'speed', 60, LABEL.above);
	speedCard(ctx, frame, 60);
	rule(ctx, 60, reading(tick));
	drawIcon(ctx, 'lfo.random', 60, ROW.bottom, { tint: COLORS.white });
	label(ctx, 'amount', 180, LABEL.above);
	ladderCard(ctx, 180, frame.amount, 1);
	label(ctx, 'dest', COLUMN.x, LABEL.above);
	const d = DESTINATIONS[destIndex(DESTINATIONS, frame)];
	destCard(ctx, d, COLUMN.x, ROW.top, false, NAME.random);
	card(ctx, COLUMN.x, ROW.middle, 60, 60);
	envelopeLine(ctx, COLUMN.x, ROW.middle, frame.envelope ?? 0, 'random');
	label(ctx, 'env', COLUMN.x, LABEL.below - 0.7, COLORS.white);
	paramCard(ctx, frame, 300);
	seams(ctx, [...ROW_SEAMS, [COLUMN.x, ROW.middle, COLUMN.x + 60, ROW.middle]]);
}

/** Element's sources by the letter the frame carries: the gyroscope, microphone, envelope, sum. */
const SOURCE_ICON: Record<string, string> = {
	G: 'lfo.source.gyro',
	M: 'lfo.source.mic',
	E: 'lfo.source.envelope',
	S: 'lfo.source.sum'
};

/**
 * Element: the source's pictogram in white on a black disc (r 25.5), the amount, the destination
 * column labelled "dest" above its first card, the parameter. The rule under the disc is a live
 * reading, its gap near the middle on a still unit (as seen); the device draws none for the
 * envelope.
 */
function drawElement(ctx: ScreenCtx, frame: LfoFrame): void {
	const x = 60;
	label(ctx, 'source', x, LABEL.above);
	card(ctx, x, ROW.top, 120, 120);
	mark(ctx, 0, x, ROW.top);
	disc(ctx, x + 60, ROW.top + 59.7, 25.5, COLORS.ink);
	const source = frame.source ?? 'G';
	drawIcon(ctx, SOURCE_ICON[source] ?? SOURCE_ICON.G, x, ROW.top, { tint: COLORS.white });
	if (source !== 'E') rule(ctx, x, 0.475);
	label(ctx, 'amount', 180, LABEL.above);
	ladderCard(ctx, 180, frame.amount, 1);
	const first = destColumn(ctx, SENSOR_DESTINATIONS, destIndex(SENSOR_DESTINATIONS, frame), true);
	label(ctx, 'dest', COLUMN.x, first - 4.9);
	paramCard(ctx, frame, 300);
	seams(ctx, [ROW_SEAMS[0]]);
}

/**
 * Tremolo: rate (the speed card), vibrato and volume ladders, the envelope's card (E4, its ring)
 * over the shape's card (the one waveform the device was seen drawing, whatever the shape: ours).
 */
function drawTremolo(ctx: ScreenCtx, frame: LfoFrame): void {
	label(ctx, 'rate', 90, LABEL.above);
	speedCard(ctx, frame, 90);
	label(ctx, 'vib', 210, LABEL.above);
	ladderCard(ctx, 210, frame.amount, 1);
	label(ctx, 'vol', 270, LABEL.above);
	ladderCard(ctx, 270, frame.volume, null);
	label(ctx, 'env', 330, LABEL.above);
	card(ctx, 330, ROW.top, 60, 60);
	mark(ctx, 3, 330, ROW.top);
	envelopeLine(ctx, 330, ROW.top, frame.envelope ?? 0, 'tremolo');
	card(ctx, 330, ROW.middle, 60, 60);
	drawIcon(ctx, 'lfo.shape', 330, ROW.middle, { tint: COLORS.ink });
	label(ctx, 'shape', 330, LABEL.below);
	seams(ctx, [
		[210, ROW.top, 210, ROW.bottom],
		[270, ROW.top, 270, ROW.bottom],
		[330, ROW.top, 330, ROW.bottom],
		[330, ROW.middle, 390, ROW.middle]
	]);
}

/**
 * Duck's hold and release pictograms: hold is a pulse whose top lengthens with the hold; release
 * runs flat from its ring and then falls to the card's foot, steeper the higher the release.
 */
const PULSE = {
	rise: [14.1, 15.1],
	top: 16.9,
	foot: 46.6,
	end: 46,
	x0: 18,
	span: 20.5,
	lean: 0.9
} as const;
const RELEASE = { x0: 12.9, top: 16.9, knee: 18.3, span: 26.7, foot: 46.6, end: 46.3 } as const;

/**
 * Duck: the source track ("tr" and its number, or a metronome) with the source type's icon at the
 * foot (the MIDI plug for notes, as seen; a wave for audio, ours), the amount, the live signal in a
 * black box outlined in white, hold and release.
 */
function drawDuck(ctx: ScreenCtx, frame: LfoFrame): void {
	const x = 90;
	label(ctx, 'source', x, LABEL.above);
	card(ctx, x, ROW.top, 120, 120);
	mark(ctx, 0, x, ROW.top);
	if (frame.source === 'metronome') {
		drawIcon(ctx, 'lfo.duck.metronome', x, ROW.top, { tint: COLORS.ink });
		// the rod beyond the body and its weight, pale as on the tempo page (ours: the colours)
		line(ctx, 135.5, 96.3, 146.5, 106.8, COLORS.light, 1.1);
		disc(ctx, 141.6, 102.9, 1.6, COLORS.grey2);
	} else {
		text(ctx, 'tr', 135.1, 91.4, 10, COLORS.grey4);
		text(ctx, frame.source ?? '1', 148.4, 119.6, 30, COLORS.ink, 'center');
	}
	if (frame.sourceAudio) {
		iconShapes(ctx, 'lfo.duck.source', [6, 7, 8, 9, 10, 11], 122.1, 147.35, {
			scale: 0.95,
			stroke: COLORS.ink
		});
	} else {
		iconShapes(ctx, 'lfo.duck.source', [0], 101.6, 147.35, { scale: 0.95, fill: COLORS.ink });
		iconShapes(ctx, 'lfo.duck.source', [1, 2, 3, 4, 5], 101.6, 147.35, { scale: 0.95 });
	}

	label(ctx, 'amount', 210, LABEL.above);
	ladderCard(ctx, 210, frame.amount, 1);

	// the signal: black, outlined in white, its level a white line (still: at rest)
	fillBox(ctx, 270.4, 50.75, 118.6, 58.35, COLORS.black, 5);
	strokeBox(ctx, 271.2, 51.55, 117, 56.75, COLORS.white, 1.6, 4.2);
	text(ctx, 'signal', 274, 62.1, LABEL.size, COLORS.white, 'left', 0, true);
	line(ctx, 272.5, 97.9, 386.9, 97.9, COLORS.white, 2);

	card(ctx, 270, ROW.middle, 60, 60);
	const hold = PULSE.x0 + PULSE.span * clamp(frame.hold ?? 0.5, 0, 1);
	polyline(ctx, 270, ROW.middle, [
		[PULSE.rise[0], PULSE.foot],
		[PULSE.rise[1], PULSE.top],
		[hold, PULSE.top],
		[hold + PULSE.lean, PULSE.foot],
		[PULSE.end, PULSE.foot]
	]);
	label(ctx, 'hold', 270, LABEL.below);

	card(ctx, 330, ROW.middle, 60, 60);
	mark(ctx, 3, 330, ROW.middle);
	const knee = RELEASE.knee + RELEASE.span * clamp(frame.release ?? 0.5, 0, 1);
	polyline(ctx, 330, ROW.middle, [
		[RELEASE.x0, RELEASE.top],
		[knee, RELEASE.top],
		[RELEASE.end, RELEASE.foot]
	]);
	label(ctx, 'release', 330, LABEL.below);
	seams(ctx, [
		[210, ROW.top, 210, ROW.bottom],
		[270, ROW.top, 270, ROW.bottom],
		[330, ROW.middle, 330, ROW.bottom]
	]);
}

/** An ink polyline (1.2 px) in a card's coordinates. */
function polyline(
	ctx: ScreenCtx,
	x: number,
	y: number,
	points: readonly (readonly [number, number])[]
): void {
	ctx.strokeStyle = COLORS.ink;
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'butt';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	points.forEach(([px, py], i) =>
		i === 0 ? ctx.moveTo(x + px, y + py) : ctx.lineTo(x + px, y + py)
	);
	ctx.stroke();
}
