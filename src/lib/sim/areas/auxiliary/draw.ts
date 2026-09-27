/**
 * Drawing the auxiliary area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry per
 * frame page, with a short spoken description for screen readers. Pages TE drew (auxiliary-004 …
 * 130) follow the art in its own greys: most aux pictures predate the lighter palette of the FX
 * page and the later how-to art. Pages without art are ours in the same language: a band of boxes
 * labelled in 10 px above, TE's crossed box for "none", the instrument pages' filter graph, send
 * cards and LFO cards.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import type { TextAlign } from '../../screen/font';
import {
	amountRuler,
	card as plainCard,
	disc,
	encoderDot,
	fillBox,
	line,
	strokeBox,
	text,
	type SoftLabel
} from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { PATTERNS, drawIcon } from '../../screen/icons';
import { cutoffX } from '../../screen/pages/filter';
import { COLORS, SOFT_KEY_BASELINE, SOFT_KEY_X } from '../../screen/palette';
import type {
	AuxAudioFrame,
	AuxBrainFrame,
	AuxCcFrame,
	AuxFilterView,
	AuxFxFrame,
	AuxLfoFrame,
	AuxMidiFrame,
	AuxRouteFrame,
	AuxTapeFrame,
	AuxiliaryFrame
} from './frames';

/** The greys of TE's aux art (measured; the FX page uses the core palette). */
const AUX = {
	/** Bands, labels, titles, light boxes. */
	light: '#cdcdcd',
	/** The scale, program and level boxes. */
	mid: '#969696',
	/** The bank and drive boxes (and our "none" boxes). */
	dark: '#323232',
	/** The brain's root box; the tape's dry value. */
	deep: '#191919',
	/** Outlines on the audio page, soft labels on the midi pages. */
	outline: '#afafaf',
	/** The lower arrow on the midi page. */
	arrow: '#4b4b4b',
	/** The line under the mix box. */
	mixLine: '#c7c7c4',
	/** The tape's play head. */
	head: '#d3472d'
} as const;

/**
 * TE's tracking on these pages (measured against our glyphs): 10 px labels run 1.5 % wide, 20 px
 * words 1.8 % tight (the FX page's effect name 2.9 %); figures and capitals are set without.
 */
const LABEL = 0.015;
const WORD = -0.018;
const FX_WORD = -0.029;

/** A 10 px label. */
function label(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	color: string = AUX.light,
	align: TextAlign = 'left'
): void {
	text(ctx, value, x, y, 10, color, align, LABEL);
}

/** Text centred on its ink: TE centres the drawn glyphs, not their advance (auxiliary-031, 064). */
function inkText(
	ctx: ScreenCtx,
	value: string,
	cx: number,
	baseline: number,
	size: number,
	color: string,
	tracking = 0
): void {
	const run = screenFont.layout(value, size, tracking);
	const k = size / screenFont.data.unitsPerEm;
	let x0 = Infinity;
	let x1 = -Infinity;
	for (const g of run.glyphs) {
		if (g.name === ' ') continue;
		const glyph = screenFont.data.glyphs[g.name];
		x0 = Math.min(x0, g.x + (glyph ? glyph.bbox[0] * k : 0));
		x1 = Math.max(x1, g.x + (glyph ? glyph.bbox[2] * k : 0.56 * size));
	}
	if (!Number.isFinite(x0)) return;
	text(ctx, value, cx - (x0 + x1) / 2, baseline, size, color, 'left', tracking);
}

/** The midi pages' soft labels: 10 px in TE's grey over M1–M4 (auxiliary-031; the core's are 20 px). */
function softKeys(ctx: ScreenCtx, labels: readonly (SoftLabel | null)[]): void {
	labels.slice(0, 4).forEach((soft, i) => {
		if (soft) label(ctx, soft.text, SOFT_KEY_X[i], SOFT_KEY_BASELINE, AUX.outline, 'center');
	});
}

/** TE's "none": a box crossed corner to corner (the midi page's bank, the brain's link). */
function crossed(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	fill: string | null,
	width = 1
): void {
	if (fill) fillBox(ctx, x, y, w, h, fill);
	line(ctx, x, y, x + w, y + h, COLORS.black, width);
	line(ctx, x, y + h, x + w, y, COLORS.black, width);
}

// ───────────────────────────────────────────────────────────────── brain (auxiliary-004)

/** The brain's octave, c to b between the root and scale boxes. */
const OCTAVE = { x: 189, key: 101.11 / 7, top: 80, bottom: 145, black: 120.62 } as const;
/** Pitch classes of the white keys, and the black keys with the white-key boundary they sit on. */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS: readonly (readonly [number, number])[] = [
	[1, 1],
	[3, 2],
	[6, 4],
	[8, 5],
	[10, 6]
];

function drawOctave(ctx: ScreenCtx, notes: readonly boolean[]): void {
	const { x, key, top, bottom } = OCTAVE;
	fillBox(ctx, x, top, key * 7, bottom - top, AUX.light);
	for (let i = 1; i < 7; i++) line(ctx, x + key * i, top, x + key * i, bottom, COLORS.black, 1);
	for (const [, at] of BLACK_KEYS) {
		fillBox(ctx, x + key * at - 5.5, top, 11, OCTAVE.black - top, COLORS.black);
	}
	// dots on the notes of the scale: black on white keys, grey on black keys
	WHITE_KEYS.forEach((pc, i) => {
		if (notes[pc]) disc(ctx, x + key * (i + 0.5), 138.23, 4, COLORS.black);
	});
	for (const [pc, at] of BLACK_KEYS) if (notes[pc]) disc(ctx, x + key * at, 112.87, 4, AUX.light);
}

/**
 * Brain: the key in force as the title, then a band: the auto card (TE's head), the root, the
 * octave with the scale's notes, the scale, and the linked track (crossed when none). In manual
 * mode the card reads "manual" and the head dims (ours).
 */
function drawBrain(ctx: ScreenCtx, frame: AuxBrainFrame): void {
	inkText(ctx, frame.title, 239.65, 45, 20, AUX.light, WORD);
	label(ctx, frame.auto ? 'auto' : 'manual', 5, 75);
	label(ctx, 'root', 70, 75);
	label(ctx, 'scale', 295, 75);
	label(ctx, 'track', 425, 75);

	fillBox(ctx, 0, 80, 480, 65, AUX.light);
	fillBox(ctx, 290.32, 80, 129.68, 65, AUX.mid);
	line(ctx, 65, 80, 65, 145, COLORS.black, 0.7);
	drawOctave(ctx, frame.notes);
	drawIcon(ctx, 'auxiliary.brain', 0, 80, frame.auto ? {} : { tint: AUX.mid });
	text(ctx, frame.scale, 299.28, 100, 20, COLORS.black, 'left', WORD);
	if (frame.link === null) crossed(ctx, 420, 80, 60, 65, null, 1.12);
	else text(ctx, frame.link, 424.38, 100, 20, COLORS.black);
	fillBox(ctx, 65, 80, 120, 65, AUX.deep);
	text(ctx, frame.root, 68.84, 100, 20, AUX.light);
}

// ───────────────────────────────────────────────────────────── punch-in fx (auxiliary-021)

/** The dot matrix: 40 × 18 dots on an 11.97 px pitch, 11 px across (TE's 12 px dots, 1 px edge). */
const DOTS = { x: 6.49, y: 8.2, pitch: 11.9725, r: 5.5, ground: 17 } as const;

/**
 * Punch-in FX: TE's dog on the dot matrix. While an effect plays the dog jumps a row, leaving the
 * ground (ours: the device's animations are not documented).
 */
function drawPunch(ctx: ScreenCtx, jump: boolean): void {
	fillBox(ctx, 0, 0, 480, 220, COLORS.ink);
	const pattern = PATTERNS['auxiliary.punch'];
	if (!pattern) return;
	const lit = (row: number, col: number) => pattern.grid[row]?.[col] === '2';
	pattern.grid.forEach((cells, row) => {
		for (let col = 0; col < cells.length; col++) {
			let on = lit(row, col);
			if (jump && row < DOTS.ground) on = row + 1 < DOTS.ground && lit(row + 1, col);
			const color = on ? pattern.colors[1] : pattern.colors[0];
			disc(ctx, DOTS.x + col * DOTS.pitch, DOTS.y + row * DOTS.pitch, DOTS.r, color);
		}
	});
}

// ─────────────────────────────────────────────────────────── external midi (auxiliary-031)

/** The light cards either side of the midi page's boxes (the left one ends at `left`). */
function midiBand(ctx: ScreenCtx, left: number): void {
	fillBox(ctx, 370, 80, 110, 65, AUX.light);
	fillBox(ctx, 0, 80, left, 65, AUX.light);
}

/**
 * A 65 px value box: its fill, and the value in 40 px, smaller for three digits so it keeps clear
 * of the edges (ours: TE's art shows two at most), or TE's crossed box for none.
 */
function valueBox(
	ctx: ScreenCtx,
	x: number,
	fill: string | null,
	value: string | null,
	ink: string
): void {
	if (value === null) {
		crossed(ctx, x, 80, 65, 65, AUX.dark);
		return;
	}
	if (fill) fillBox(ctx, x, 80, 65, 65, fill);
	inkText(ctx, value, x + 32.5, 125, screenFont.fit(value, 56, 40, 20), ink);
}

/** External MIDI M1: the DIN card with its arrows, channel, bank and program. */
function drawMidi(ctx: ScreenCtx, frame: AuxMidiFrame): void {
	midiBand(ctx, 175);
	valueBox(ctx, 240, AUX.dark, frame.bank, AUX.light);
	valueBox(ctx, 305, AUX.mid, frame.program, COLORS.black);
	inkText(ctx, frame.channel, 207.13, 125, 40, AUX.light);
	drawIcon(ctx, 'auxiliary.din', 111, 81);
	label(ctx, 'channel', 180, 75);
	label(ctx, 'bank', 245, 75);
	label(ctx, 'program', 310, 75);
	inkText(ctx, 'midi', 240.03, 45, 20, AUX.light, WORD);
	line(ctx, 110, 80, 110, 145, COLORS.black, 0.5);
	drawIcon(ctx, 'auxiliary.arrow', 137, 61);
	drawIcon(ctx, 'auxiliary.arrow', 137, 149.46, { tint: AUX.arrow });
	softKeys(ctx, frame.soft);
}

/** Box tones by encoder on the CC pages: the M1 page's black, dark, mid, and the light card. */
const CC_TONES = [
	{ fill: COLORS.black, ink: AUX.light },
	{ fill: AUX.dark, ink: AUX.light },
	{ fill: AUX.mid, ink: COLORS.black },
	{ fill: AUX.light, ink: COLORS.black }
] as const;

/**
 * External MIDI M2 / M3 (ours): the M1 page's band with four slot boxes where the DIN card and the
 * three values stand, in encoder order, each labelled with its CC; an off slot is crossed. With
 * shift the boxes show the CC numbers.
 */
function drawCc(ctx: ScreenCtx, frame: AuxCcFrame): void {
	midiBand(ctx, 110);
	frame.slots.forEach((slot, i) => {
		const x = 110 + 65 * i;
		const tone = CC_TONES[i];
		valueBox(ctx, x, tone.fill, slot.value, tone.ink);
		label(ctx, slot.label, x + 5, 75);
	});
	line(ctx, 370, 80, 370, 145, COLORS.black, 0.5);
	inkText(ctx, `set ${frame.set}`, 240, 45, 20, AUX.light, WORD);
	softKeys(ctx, frame.soft);
}

// ───────────────────────────────────────────────────────────── external cv (auxiliary-057)

/** The meter's needle: its pivot below the window, 7° per volt, from radius 54.4 to 85.7. */
const NEEDLE = { x: 240.03, y: 186.28, degreesPerVolt: 7, r0: 54.4, r1: 85.7 } as const;

/** External CV: TE's voltmeter, the needle at the pitch voltage. */
function drawCv(ctx: ScreenCtx, volts: number): void {
	inkText(ctx, 'CV', 240.44, 45, 20, AUX.light);
	drawIcon(ctx, 'auxiliary.meter', 175, 75);
	const a = (Math.max(-5, Math.min(5, volts)) * NEEDLE.degreesPerVolt * Math.PI) / 180;
	const [sin, cos] = [Math.sin(a), Math.cos(a)];
	line(
		ctx,
		NEEDLE.x + sin * NEEDLE.r0,
		NEEDLE.y - cos * NEEDLE.r0,
		NEEDLE.x + sin * NEEDLE.r1,
		NEEDLE.y - cos * NEEDLE.r1,
		AUX.light,
		2
	);
}

// ─────────────────────────────────────────────────────────── external audio (auxiliary-064)

/**
 * The input card's pictogram, centred in the 65 px card at (100, 80): TE's microphone; the other
 * inputs are ours (a headset, TE's jack and speaker from the tempo page, a USB-C plug).
 */
function inputPicture(ctx: ScreenCtx, frame: AuxAudioFrame, color: string): void {
	switch (frame.input) {
		case 'mic':
			drawIcon(ctx, 'auxiliary.mic', 115, 85, { tint: color });
			return;
		case 'headset': {
			// a headband over two ear cups, with a boom to the mouth
			ctx.strokeStyle = color;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(132.5, 115, 18, Math.PI, 0);
			ctx.stroke();
			fillBox(ctx, 111, 110, 9, 18, color, 3);
			fillBox(ctx, 145, 110, 9, 18, color, 3);
			line(ctx, 115.5, 128, 124, 136, color, 2);
			disc(ctx, 126, 137, 3, color);
			return;
		}
		case 'audio input':
			drawIcon(ctx, 'tempo.jack', 109.5, 104.5, { tint: color });
			return;
		case 'usb audio':
			// a USB-C plug seen from its end, on a cable
			strokeBox(ctx, 118.5, 98.5, 28, 11, color, 2, 5.5);
			fillBox(ctx, 124, 103, 17, 2, color, 1);
			fillBox(ctx, 126, 109.5, 13, 8, color);
			fillBox(ctx, 130.5, 117.5, 4, 18, color);
			return;
		case 'main output':
			drawIcon(ctx, 'tempo.speaker', 118.5, 96.5, { tint: color });
			return;
	}
}

/**
 * External audio M1: the input card with its line into drive, drive into level, level and mix
 * running down towards the outputs, and the return box above mix. A switched-off input dims its
 * card and line (ours).
 */
function drawAudio(ctx: ScreenCtx, frame: AuxAudioFrame): void {
	const input = frame.on ? AUX.light : COLORS.grey1;
	const edge = frame.on ? AUX.outline : COLORS.grey1;
	fillBox(ctx, 209.5, 114.5, 31, 31, AUX.dark, 4.5);
	label(ctx, 'drive', 245, 125);
	fillBox(ctx, 359.98, 114.5, 31, 31, AUX.light, 4.5);
	label(ctx, 'level', 320, 126);
	label(ctx, 'mix', 395, 126);
	line(ctx, 300, 145, 300, 220, AUX.mid, 1);
	line(ctx, 375, 145, 375, 220, AUX.mixLine, 1);
	line(ctx, 240.48, 130, 285.48, 130, AUX.dark, 1);
	label(ctx, 'input', 170, 90);
	fillBox(ctx, 100, 80, 65, 65, COLORS.black, 4);
	strokeBox(ctx, 100, 80, 65, 65, edge, 1, 4);
	inputPicture(ctx, frame, input);
	ctx.strokeStyle = edge;
	ctx.lineWidth = 1;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo(225, 115);
	ctx.lineTo(225, 95);
	ctx.lineTo(165.48, 95);
	ctx.stroke();
	fillBox(ctx, 284.5, 114.5, 31, 31, AUX.mid, 4.5);
	inkText(ctx, frame.level, 300, 137.5, 20, COLORS.black);
	inkText(ctx, frame.drive, 225, 137.5, 20, AUX.light);
	inkText(ctx, frame.mix, 375.48, 137.5, 20, COLORS.black);
	drawIcon(ctx, 'auxiliary.return', 360, 80);
}

// ─────────────────────────────────────────────────────────────────── tape (auxiliary-099)

/** The tape strip, 445 px long, its centre line at 97. */
const STRIP = { width: 445, top: 80, bottom: 110, mid: 97 } as const;
/** TE's recorded hit: 2.07 px columns, half-heights in px (a transient, then a softer bump). */
const HIT = [0.51, 1.01, 4.56, 8.11, 0.51, 1.01, 1.52, 2.03, 1.52, 1.01, 0.51];
/** The keyboard: white keys 12 px from 169.86 (W1 … W12), W0 and W13 narrower at the ends. */
const TAPE_KEYS = {
	x: 169.86,
	key: 12,
	first: 158.49,
	last: 325.48,
	top: 115,
	bottom: 145
} as const;
/** White-key boundaries that carry a black key (F# G# A#, C# D#, twice). */
const TAPE_BLACK = [0, 1, 2, 4, 5, 7, 8, 9, 11, 12];
/** Keys from F within an octave: a white key's index, or the boundary a black key sits on. */
const OCTAVE_FROM_F: readonly (readonly ['w' | 'b', number])[] = [
	['w', 0],
	['b', 0],
	['w', 1],
	['b', 1],
	['w', 2],
	['b', 2],
	['w', 3],
	['w', 4],
	['b', 4],
	['w', 5],
	['b', 5],
	['w', 6]
];

/** Where a keyboard key's (0–23, F3 … E5) dot goes on the tape page. */
function tapeKeyDot(key: number): { x: number; y: number; black: boolean } {
	const [kind, n] = OCTAVE_FROM_F[key % 12];
	const offset = key >= 12 ? 7 : 0;
	if (kind === 'b') return { x: TAPE_KEYS.x + TAPE_KEYS.key * (n + offset), y: 123.4, black: true };
	const white = n + offset;
	const x =
		white === 0
			? (TAPE_KEYS.first + TAPE_KEYS.x) / 2
			: white === 13
				? (TAPE_KEYS.x + 12 * TAPE_KEYS.key + TAPE_KEYS.last) / 2
				: TAPE_KEYS.x + TAPE_KEYS.key * (white - 0.5);
	return { x, y: 139, black: false };
}

/**
 * Tape: the reels with the speed, the pitch and loop length over the tape strip (the routed tracks'
 * hits on the loop, the red play head), the dry box, and the keyboard with the clips playing and the
 * last clip's number.
 */
function drawTape(ctx: ScreenCtx, frame: AuxTapeFrame): void {
	drawIcon(ctx, 'auxiliary.reels', 196, 19);
	text(ctx, frame.speed, 289.6, 35, 20, AUX.light);
	label(ctx, frame.pitch, 5, 75);
	label(ctx, frame.length, 441.45, 75, AUX.light, 'right');
	label(ctx, 'dry', 450, 75);

	fillBox(ctx, 0, STRIP.top, STRIP.width, STRIP.bottom - STRIP.top, AUX.light);
	for (const h of frame.hits) {
		const x0 = Math.max(0, Math.min(1, h)) * STRIP.width;
		line(ctx, x0, STRIP.top, x0, STRIP.bottom, COLORS.black, 0.5);
		HIT.forEach((half, i) => {
			const x = x0 + i * 2.07;
			if (x + 2.07 <= STRIP.width) fillBox(ctx, x, STRIP.mid - half, 2.07, half * 2, COLORS.black);
		});
	}
	line(ctx, 0, STRIP.mid, STRIP.width, STRIP.mid, COLORS.black, 0.75);
	const head = Math.max(0, Math.min(1, frame.head)) * STRIP.width;
	line(ctx, head, STRIP.top, head, STRIP.bottom, AUX.head, 2);
	fillBox(ctx, 450, 80, 30, 30, AUX.light);
	inkText(ctx, frame.mix, 465.38, 102, 20, AUX.deep);

	const { x, key, top, bottom } = TAPE_KEYS;
	fillBox(ctx, 0, top, 480, bottom - top, AUX.light);
	for (let k = 0; k <= 12; k++) line(ctx, x + key * k, top, x + key * k, bottom, COLORS.black, 0.5);
	line(ctx, x, bottom, x + key * 12, bottom, COLORS.black, 0.5);
	line(ctx, TAPE_KEYS.first, top, TAPE_KEYS.first, bottom, COLORS.black, 0.5);
	line(ctx, TAPE_KEYS.last, top, TAPE_KEYS.last, bottom, COLORS.black, 0.5);
	for (const k of TAPE_BLACK) fillBox(ctx, x + key * k - 3.2, top, 6.4, 18.8, COLORS.black);
	for (const k of frame.keys) {
		const dot = tapeKeyDot(k);
		disc(ctx, dot.x, dot.y, 2, dot.black ? AUX.light : COLORS.black);
	}
	text(ctx, frame.clip, 329.7, 135, 20, COLORS.black);
}

// ──────────────────────────────────────────────────────────────── fx (auxiliary-130)

/** The columns' tones by encoder, and the bar on each (white on the dark two). */
const FX_COLUMNS = [
	{ fill: COLORS.ink, bar: COLORS.white },
	{ fill: COLORS.dark, bar: COLORS.white },
	{ fill: COLORS.grey4, bar: COLORS.ink },
	{ fill: null, bar: COLORS.ink }
] as const;

/**
 * FX I / FX II: the slot's name boxed and the effect's name, then a white band: a line in on the
 * left, four spread lines out on the right (TE's chorus picture, kept for every effect), and four
 * columns in encoder tones whose bars stand at the parameter values.
 */
function drawFx(ctx: ScreenCtx, frame: AuxFxFrame): void {
	// TE's box is 55 px around "FX I"; "FX II" widens it by its extra letter
	const width = 55 + screenFont.measure(frame.slot, 20) - screenFont.measure('FX I', 20);
	strokeBox(ctx, 180.5, 25.5, width - 1, 29, COLORS.light, 1, 3.5);
	text(ctx, frame.slot, 191.4, 47.5, 20, COLORS.white);
	text(ctx, frame.type, 180 + width + 15.1, 46, 20, COLORS.white, 'left', FX_WORD);

	fillBox(ctx, 0, 80, 480, 65, COLORS.white);
	line(ctx, 0, 112.5, 40, 112.5, COLORS.ink, 1.12);
	for (let i = 0; i < 4; i++) line(ctx, 440, 97.5 + 10 * i, 480, 97.5 + 10 * i, COLORS.ink, 1.12);
	frame.params.forEach((param, i) => {
		const x = 40 + 100 * i;
		const column = FX_COLUMNS[i];
		if (column.fill) fillBox(ctx, x, 80, 100, 65, column.fill);
		fillBox(ctx, x, 140 - 60 * Math.max(0, Math.min(1, param.level)), 100, 5, column.bar);
		label(ctx, param.label, x + 5, 75, COLORS.white);
		label(ctx, param.value, x + 5, 160, COLORS.white);
	});
}

// ─────────────────────────────────────────────────────────────────────── routing (ours)

/**
 * Routing (ours): what the tracks feed in the title, then a band of the eight instrument tracks,
 * each filled from the bottom as far as it sends (full when routed into the brain) or crossed when
 * out. The four the encoders reach are bright with their values below; the other four dim.
 */
function drawRoute(ctx: ScreenCtx, frame: AuxRouteFrame): void {
	inkText(ctx, `${frame.target} routing`, 240, 45, 20, AUX.light, WORD);
	frame.tracks.forEach((route, i) => {
		const x = 60 * i;
		const reached = Math.floor(i / 4) === frame.half;
		ctx.save();
		ctx.globalAlpha = reached ? 1 : 0.5;
		label(ctx, String(i + 1), x + 5, 75);
		if (route.routed) {
			fillBox(ctx, x, 80, 60, 65, AUX.dark);
			const h = 65 * Math.max(0, Math.min(1, route.amount));
			fillBox(ctx, x, 145 - h, 60, h, AUX.light);
		} else crossed(ctx, x, 80, 60, 65, AUX.dark);
		ctx.restore();
		if (i > 0) line(ctx, x, 80, x, 145, COLORS.black, 1);
		if (reached && route.value) inkText(ctx, route.value, x + 30, 172.5, 20, AUX.light);
	});
}

// ───────────────────────────────────────────────────────────────── filter and sends (ours)

const GRAPH = { left: 30.5, right: 450.5, flat: 47.5, floor: 162.5 } as const;
const BANDS = [
	{ x0: 30.5, x1: 160.5, color: '#16161e' },
	{ x0: 160.5, x1: 245.5, color: '#2f2f37' },
	{ x0: 245.5, x1: 330.5, color: '#484850' },
	{ x0: 330.5, x1: 450.5, color: '#96969b' }
] as const;
/**
 * TE's fall past a cutoff (instrument-032), as the core's filter page draws it: two cubics, x in
 * pixels from the cutoff, y as a fraction of the drop from the flat top to the floor.
 */
const FALL = [
	[10.3, 0, 12.3, 0.173, 20, 0.283],
	[57.4, 0.82, 57.2, 1, 63.1, 1]
] as const;

/** Adds the pass band between the high-pass and low-pass edges (down to the floor) to the path. */
function tracePassBand(ctx: ScreenCtx, xh: number, xl: number): void {
	const drop = GRAPH.floor - GRAPH.flat;
	const y = (f: number) => GRAPH.flat + f * drop;
	const [a, b] = FALL;
	// the high-pass edge rises as the mirror image of the fall
	ctx.moveTo(xh - b[4], GRAPH.floor);
	ctx.bezierCurveTo(xh - b[2], y(b[3]), xh - b[0], y(b[1]), xh - a[4], y(a[5]));
	ctx.bezierCurveTo(xh - a[2], y(a[3]), xh - a[0], y(a[1]), xh, GRAPH.flat);
	ctx.lineTo(xl, GRAPH.flat);
	ctx.bezierCurveTo(xl + a[0], y(a[1]), xl + a[2], y(a[3]), xl + a[4], y(a[5]));
	ctx.bezierCurveTo(xl + b[0], y(b[1]), xl + b[2], y(b[3]), xl + b[4], GRAPH.floor);
	ctx.closePath();
}

/**
 * The aux filter (ours, after the instrument's M3 graph): the band between the high-pass and
 * low-pass cutoffs filled in the four greys, an "hp" and an "lp" box on the edges like TE's Q box,
 * and the frequency axis.
 */
function drawFilterGraph(ctx: ScreenCtx, view: AuxFilterView): void {
	const xh = cutoffX(view.highpass);
	const xl = cutoffX(view.lowpass);
	text(ctx, 'filter', 35, 42.5, 10, COLORS.white);
	if (xl > xh) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(GRAPH.left, 0, GRAPH.right - GRAPH.left, GRAPH.floor);
		ctx.clip();
		ctx.save();
		ctx.beginPath();
		tracePassBand(ctx, xh, xl);
		ctx.clip();
		for (const band of BANDS) {
			fillBox(ctx, band.x0, 20, band.x1 - band.x0, GRAPH.floor - 20, band.color);
		}
		for (const band of BANDS.slice(1)) {
			line(ctx, band.x0, 20, band.x0, GRAPH.floor, COLORS.black, 1.59);
		}
		ctx.restore();
		ctx.strokeStyle = COLORS.black;
		ctx.lineWidth = 1.59;
		ctx.beginPath();
		tracePassBand(ctx, xh, xl);
		ctx.stroke();
		ctx.restore();
	}
	for (const [x, name] of [
		[xh, 'hp'],
		[xl, 'lp']
	] as const) {
		fillBox(ctx, x - 20, 87.5, 40, 25, COLORS.black, 2.5);
		text(ctx, name, x, 107.3, 20, COLORS.white, 'center');
	}
	text(ctx, '50', GRAPH.left, 172.5, 10, COLORS.light);
	text(ctx, '1K', 160.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '2K', 245.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '5K', 330.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '20kHz', GRAPH.right, 172.5, 10, COLORS.light, 'right');
}

/** The instrument send cards' icons, where TE drew each (card top in brackets). */
const SEND_ICONS = [
	{ name: 'sends.aux', x: 159, y: 32, top: 30 },
	{ name: 'sends.tape', x: 159, y: 78, top: 70 },
	{ name: 'sends.fx1', x: 159, y: 155, top: 150 },
	{ name: 'sends.fx2', x: 159, y: 115, top: 110 }
] as const;

/** M3 with shift (ours, after instrument-032): the track's send cards over the dimmed filter. */
function drawSends(
	ctx: ScreenCtx,
	filter: AuxFilterView,
	values: readonly (string | null)[]
): void {
	ctx.save();
	ctx.globalAlpha = 0.5;
	drawFilterGraph(ctx, filter);
	ctx.restore();
	values.forEach((value, i) => {
		if (value === null) return;
		const top = 30 + 40 * i;
		plainCard(ctx, 155, top, 200, 35);
		const icon = SEND_ICONS[i];
		drawIcon(ctx, icon.name, icon.x, icon.y - icon.top + top);
		text(ctx, value, 220, top + 25, 20, COLORS.black);
		encoderDot(ctx, i as 0 | 1 | 2 | 3, 340, top + 5, COLORS.black);
	});
}

// ───────────────────────────────────────────────────────────────────────────── lfo (ours)

/** LFO cards carry TE's ink edge (instrument-093). */
const lfoCard = (ctx: ScreenCtx, x: number, y: number, w: number, h: number) =>
	plainCard(ctx, x, y, w, h, COLORS.white, true);

/** The speed card, as the value LFO draws it: a note and count when synced, a clock dial when free. */
function speedCard(ctx: ScreenCtx, speed: AuxLfoFrame['speed'], x: number, y: number): void {
	lfoCard(ctx, x, y, 120, 120);
	encoderDot(ctx, 0, x + 6, y + 5);
	if (speed.synced) {
		drawIcon(ctx, 'lfo.note16', x + 46, y + 30);
		text(ctx, speed.label, x + 115, y + 20, 20, COLORS.ink, 'right');
		return;
	}
	const [cx, cy] = [x + 61, y + 61];
	disc(ctx, cx, cy, 25, COLORS.ink);
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const [sin, cos] = [Math.sin(a), Math.cos(a)];
		line(ctx, cx + sin * 18, cy - cos * 18, cx + sin * 23, cy - cos * 23, COLORS.white, 1.6);
	}
	const hand = (-0.4 + 0.8 * Math.max(0, Math.min(1, speed.position))) * Math.PI * 2;
	ctx.lineCap = 'round';
	line(ctx, cx, cy, cx + Math.sin(hand) * 15, cy - Math.cos(hand) * 15, COLORS.white, 2.2);
}

/** A destination card: the filter keeps its picture, the other modules show their names. */
function destinationCard(ctx: ScreenCtx, name: string, x: number, y: number): void {
	lfoCard(ctx, x, y, 60, 60);
	if (name === 'filter') {
		drawIcon(ctx, 'lfo.filter', x + 12, y + 8);
		text(ctx, name, x + 30, y + 51.4, 20, COLORS.ink, 'center');
	} else text(ctx, name, x + 30, y + 37, 20, COLORS.ink, 'center');
}

/**
 * An aux track's LFO (ours, after the value LFO of instrument-093): speed, amount, the track's
 * destination modules (the chosen one in the middle, its neighbours above and below) and the
 * parameter card with its knob, capped in the parameter's encoder tone.
 */
function drawLfo(ctx: ScreenCtx, frame: AuxLfoFrame): void {
	text(ctx, 'speed', 60, 45, 10, COLORS.white);
	speedCard(ctx, frame.speed, 55, 50);

	text(ctx, 'amount', 180, 45, 10, COLORS.white);
	lfoCard(ctx, 175, 50, 60, 120);
	encoderDot(ctx, 1, 180, 55);
	amountRuler(ctx, 220, 55, 165, frame.amount);

	text(ctx, 'dest', 240, 15, 10, COLORS.white);
	[-1, 0, 1].forEach((offset, row) => {
		const name = frame.destinations[frame.destination + offset];
		if (name !== undefined) destinationCard(ctx, name, 235, 20 + 60 * row);
	});
	encoderDot(ctx, 2, 240, 85);

	text(ctx, frame.parameterName, 300, 45, 10, COLORS.white);
	lfoCard(ctx, 295, 50, 120, 120);
	if (frame.parameterName) {
		drawIcon(ctx, 'lfo.knob', 304, 54);
		const cap = ['#0f0e12', '#484850', '#96969b', COLORS.white][frame.parameter] ?? '#96969b';
		ctx.save();
		ctx.translate(355, 92.45);
		ctx.scale(1, 7.55 / 9.7);
		disc(ctx, 0, 0, 9.7, cap);
		ctx.restore();
	}
	encoderDot(ctx, 3, 300, 55);
	softKeys(ctx, frame.soft);
}

// ───────────────────────────────────────────────────────────────────────── the pages

const volts = (v: number) => `${v >= 0 ? '+' : '–'}${Math.abs(v).toFixed(2)} volts`;

export const drawers: AreaDrawers<AuxiliaryFrame> = {
	'aux-brain': {
		draw: drawBrain,
		describe: (f) =>
			`brain: ${f.title}, ${f.auto ? 'auto' : 'manual'}, root ${f.root}, scale ${f.scale}, ` +
			(f.link === null ? 'no linked track' : `linked track ${Number(f.link)}`)
	},
	'aux-punch': {
		draw: (ctx, f) => drawPunch(ctx, f.active.length > 0),
		describe: (f) =>
			f.active.length === 0
				? 'punch-in fx: hold keys for effects'
				: `punch-in fx: effects on keys ${f.active.map((k) => k + 1).join(' ')}`
	},
	'aux-midi': {
		draw: drawMidi,
		describe: (f) =>
			`external midi: channel ${f.channel}, bank ${f.bank ?? 'none'}, program ${f.program ?? 'none'}`
	},
	'aux-cc': {
		draw: drawCc,
		describe: (f) =>
			`external midi cc set ${f.set}${f.shift ? ' numbers' : ''}: ` +
			f.slots.map((s) => `${s.label} ${s.value ?? 'off'}`).join(', ')
	},
	'aux-cv': {
		draw: (ctx, f) => drawCv(ctx, f.volts),
		describe: (f) => `external cv: ${volts(f.volts)}`
	},
	'aux-audio': {
		draw: drawAudio,
		describe: (f) =>
			`external audio: ${f.input} ${f.on ? 'on' : 'off'}, drive ${f.drive}, level ${f.level}, mix ${f.mix}`
	},
	'aux-tape': {
		draw: drawTape,
		describe: (f) =>
			`tape: pitch ${f.pitch}, speed ${f.speed}, length ${f.length}, dry ${f.mix}` +
			(f.clip ? `, clip ${f.clip}` : '')
	},
	'aux-fx': {
		draw: drawFx,
		describe: (f) =>
			`${f.slot} ${f.type}: ${f.params.map((p) => `${p.label} ${p.value}`).join(', ')}`
	},
	'aux-route': {
		draw: drawRoute,
		describe: (f) => {
			const routed = f.tracks.flatMap((t, i) => (t.routed ? [i + 1] : []));
			const reach = f.half === 0 ? '1–4' : '5–8';
			const list = routed.length ? `routed ${routed.join(' ')}` : 'nothing routed';
			return `${f.target} routing: tracks ${reach} on the encoders, ${list}`;
		}
	},
	'aux-filter': {
		draw: drawFilterGraph,
		describe: (f) =>
			`filter: high-pass ${Math.round(f.highpass * 99)}, low-pass ${Math.round(f.lowpass * 99)}`
	},
	'aux-sends': {
		draw: (ctx, f) => drawSends(ctx, f.filter, f.values),
		describe: (f) => {
			const names = ['aux', 'tape', 'fx I', 'fx II'];
			const sends = f.values.flatMap((v, i) => (v === null ? [] : [`${names[i]} ${v}`]));
			return `sends: ${sends.join(', ') || 'none'}`;
		}
	},
	'aux-lfo': {
		draw: drawLfo,
		describe: (f) =>
			`lfo: amount ${Math.round(f.amount)}, destination ${f.destinations[f.destination]}` +
			(f.parameterName ? `, parameter ${f.parameterName}` : '')
	}
};
