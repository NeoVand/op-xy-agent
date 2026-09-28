/**
 * Drawing the auxiliary area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one
 * entry per frame page, with a short spoken description for screen readers.
 *
 * The pages follow the owner's device (OS 1.1.33) as the camera saw it, measured on the realigned
 * captures (docs/research/59-screen-profiling.md §2.13) and drawn in TE's palette: the camera
 * tints and stretches colours, so tones are TE's, ranked as the captures rank them. On the device
 * the aux pages share the FX page's newer greys (white cards and strips, the root, bank and drive
 * boxes dark, the scale and program boxes mid grey) where TE's older art drew light and deep greys,
 * and every small label is 12 px in the heavier weight. What the captures never showed is ours and
 * says so: the punch-in effects' animations (one picture of each, held), the routing of tape and
 * the FX tracks (after external audio's), their filters and LFOs (after external audio's), and
 * every send layer (after the instrument's).
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import {
	amountRuler,
	card as plainCard,
	disc,
	encoderDot,
	fillBox,
	line,
	strokeBox,
	text
} from '../../screen/draw';
import { screenFont, type TextAlign } from '../../screen/font';
import { PATTERNS, drawIcon, icon } from '../../screen/icons';
import { COLORS, RAMP } from '../../screen/palette';
import { compiled, tracePath } from '../../screen/paths';
import type {
	AuxAudioFrame,
	AuxBrainFrame,
	AuxCcFrame,
	AuxFilterView,
	AuxFxFrame,
	AuxFxListFrame,
	AuxLfoDestination,
	AuxLfoFrame,
	AuxMidiFrame,
	AuxPunchFrame,
	AuxRouteFrame,
	AuxTapeFrame,
	AuxiliaryFrame
} from './frames';

/** Colours of TE's aux art the device keeps. */
const AUX = {
	/** TE's light grey: the arrows, the microphone, the meter's scale, the connecting lines. */
	light: '#cdcdcd',
	/** The tape's play head. */
	head: '#d3472d'
} as const;

const unit = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The device's small labels on every aux page: 12 px in the heavier weight at the font's own
 * spacing (widths and heights of "size", "mix", "program", "cc 9" … on the captures; TE's art set
 * them 10 px light).
 */
function label(
	ctx: ScreenCtx,
	value: string,
	x: number,
	y: number,
	color: string = COLORS.white,
	align: TextAlign = 'left'
): void {
	text(ctx, value, x, y, 12, color, align, -0.03, true);
}

/** A page title: 20 px heavy, centred. */
const title = (ctx: ScreenCtx, value: string, x: number, baseline: number) =>
	text(ctx, value, x, baseline, 20, COLORS.white, 'center', 0, true);

/** Text centred on its ink: TE centres the drawn glyphs, not their advance (auxiliary-031, 064). */
function inkText(
	ctx: ScreenCtx,
	value: string,
	cx: number,
	baseline: number,
	size: number,
	color: string
): void {
	const run = screenFont.layout(value, size);
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
	text(ctx, value, cx - (x0 + x1) / 2, baseline, size, color);
}

/** TE's "none": a box crossed corner to corner (bank and program, off CC slots, the link). */
function crossed(
	ctx: ScreenCtx,
	x: number,
	y: number,
	w: number,
	h: number,
	fill: string | null,
	ink: string = COLORS.ink,
	width = 1
): void {
	if (fill) fillBox(ctx, x, y, w, h, fill);
	line(ctx, x, y, x + w, y + h, ink, width);
	line(ctx, x, y + h, x + w, y, ink, width);
}

/** A page switched off: drawn at 40 % under "off" in a black box, as the instrument pages. */
function dimmedIfOff(ctx: ScreenCtx, off: boolean, draw: () => void): void {
	if (!off) {
		draw();
		return;
	}
	ctx.save();
	ctx.globalAlpha = 0.4;
	draw();
	ctx.restore();
	fillBox(ctx, 210.5, 90.5, 60, 40, COLORS.black, 4);
	strokeBox(ctx, 210.5, 90.5, 60, 40, COLORS.white, 1.5, 4);
	text(ctx, 'off', 240.5, 121, 30, COLORS.white, 'center', 0, true);
}

/**
 * Draws the shapes of a TE icon whose indices `keep` accepts, recoloured by `tone` (the device
 * leaves out parts of some of TE's pictures: the meter's figures, the curve behind the LFO knob).
 */
function iconShapes(
	ctx: ScreenCtx,
	name: string,
	x: number,
	y: number,
	keep: (index: number) => boolean,
	tone: (color: string, index: number) => string = (c) => c
): void {
	icon(name).shapes.forEach((shape, i) => {
		if (!keep(i)) return;
		ctx.beginPath();
		tracePath(ctx, compiled(shape.d), x, y, 1);
		if (shape.fill) {
			ctx.fillStyle = tone(shape.fill, i);
			ctx.fill(shape.evenodd ? 'evenodd' : 'nonzero');
		}
		if (shape.stroke) {
			ctx.strokeStyle = tone(shape.stroke, i);
			ctx.lineWidth = shape.width ?? 1;
			ctx.lineCap = 'butt';
			ctx.lineJoin = 'miter';
			ctx.stroke();
		}
	});
}

// ───────────────────────────────────────────────── brain (auxiliary-004, as the device draws it)

/**
 * The brain's band on OS 1.1.33 (frames steps-710…746, b1-3975…4040): a white card with TE's head
 * (auto) or an open hand (manual, traced off the screen), the root box dark, the octave, the scale
 * box mid grey and the link box white, crossed while nothing is linked. Root and scale show, with
 * their labels, only while set by hand. The octave starts at x 189.9, where TE's art left a gap.
 */
const OCTAVE = { x: 189.9, key: 101.11 / 7, top: 80, bottom: 145, black: 120.62 } as const;
/** Pitch classes of the white keys, and the black keys with the white-key boundary they sit on. */
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS: readonly (readonly [number, number])[] = [
	[1, 1],
	[3, 2],
	[6, 4],
	[8, 5],
	[10, 6]
];

/** The octave: white keys, black keys, and dots on the scale's notes (ink on white, white on black). */
function drawOctave(ctx: ScreenCtx, notes: readonly boolean[]): void {
	const { x, key, top, bottom } = OCTAVE;
	fillBox(ctx, x, top, key * 7, bottom - top, COLORS.white);
	for (let i = 1; i < 7; i++) line(ctx, x + key * i, top, x + key * i, bottom, COLORS.ink, 1);
	for (const [, at] of BLACK_KEYS) {
		fillBox(ctx, x + key * at - 5.5, top, 11, OCTAVE.black - top, COLORS.ink);
	}
	WHITE_KEYS.forEach((pc, i) => {
		if (notes[pc]) disc(ctx, x + key * (i + 0.5), 138.23, 4, COLORS.ink);
	});
	for (const [pc, at] of BLACK_KEYS)
		if (notes[pc]) disc(ctx, x + key * at, 112.87, 4, COLORS.white);
}

function drawBrain(ctx: ScreenCtx, frame: AuxBrainFrame): void {
	title(ctx, frame.title, 239.4, 45.9);
	label(ctx, frame.auto ? 'auto' : 'manual', 3.5, 75.9);
	label(ctx, 'link', 422.7, 75.9);

	fillBox(ctx, 0, 80, 65, 65, COLORS.white);
	drawIcon(ctx, frame.auto ? 'auxiliary.brain' : 'auxiliary.hand', 0, 80, { tint: COLORS.ink });
	fillBox(ctx, 65, 80, OCTAVE.x - 65, 65, COLORS.dark);
	drawOctave(ctx, frame.notes);
	fillBox(ctx, 290.3, 80, 129.7, 65, COLORS.grey4);
	fillBox(ctx, 420, 80, 60, 65, COLORS.white);
	if (frame.link === null) crossed(ctx, 420, 80, 60, 65, null, COLORS.ink, 1.12);
	else text(ctx, frame.link, 423.2, 101.2, 20, COLORS.ink);
	if (frame.auto) return;
	label(ctx, 'root', 69.1, 75.9);
	label(ctx, 'scale', 293.2, 75.9);
	text(ctx, frame.root, 72.3, 100.9, 20, COLORS.white);
	text(ctx, frame.scale, 297.9, 101.2, 20, COLORS.ink);
}

// ───────────────────────────────────────────────────────────────────────────── routing (M2)

/**
 * Routing as the device draws it (the brain, b1-4009…4031; external audio, b1-4319…4322): two
 * rows of eight boxes, 25 × 30 on a 30 px pitch, joined by short lines and bracketed to what they
 * feed. The top row runs the tracks' greys (the first outlined), each with its number (the brain)
 * or its send (a mixer's plain number); the bottom row shows what goes in: white when routed into
 * the brain, filled from the foot as far as a track sends elsewhere. Labels over the top row name
 * the tracks, bright for the four the encoders reach. The brain's card stands left of the rows
 * ("in"); what the sends feed stands right of them, a white box ("out" for the aux output; ours
 * for tape and the FX tracks after it).
 */
const ROUTE = { box: 25, pitch: 30, top: 80, bottom: 115, height: 30, line: 1.5 } as const;
/** Where the rows start: right of the brain's card, or at the left for the sends. */
const ROUTE_X = { brain: 172, send: 90 } as const;
/** The name in the target box by routing page (ours past "out"). */
const ROUTE_BOX: Readonly<Record<string, string>> = {
	'aux out': 'out',
	tape: 'tape',
	'FX I': 'FX I',
	'FX II': 'FX II'
};

/** The rows' boxes, joining lines and labels; `x0` is the first box's left edge. */
function routeRows(ctx: ScreenCtx, frame: AuxRouteFrame, x0: number, brain: boolean): void {
	const { box, pitch, top, bottom, height } = ROUTE;
	for (let i = 0; i < 7; i++) {
		const x = x0 + pitch * i + box;
		line(ctx, x, top + height / 2, x + pitch - box, top + height / 2, AUX.light, ROUTE.line);
		line(ctx, x, bottom + height / 2, x + pitch - box, bottom + height / 2, AUX.light, ROUTE.line);
	}
	frame.tracks.forEach((route, i) => {
		const x = x0 + pitch * i;
		const reached = Math.floor(i / 4) === frame.half;
		const name = brain ? (route.routed ? 'on' : 'off') : String(i + 1);
		label(ctx, name, x + 1.2, 75.7, reached ? COLORS.white : COLORS.grey3);
		fillBox(ctx, x, top, box, height, RAMP[i], 2);
		if (i === 0) strokeBox(ctx, x, top, box, height, AUX.light, 2, 2);
		const ink = i < 3 ? COLORS.white : COLORS.ink;
		inkText(ctx, brain ? String(i + 1) : route.value, x + box / 2, top + 22.5, 20, ink);
		if (brain && route.routed) {
			fillBox(ctx, x, bottom, box, height, COLORS.white, 2);
			return;
		}
		const fill = brain ? 0 : height * unit(route.amount);
		if (fill > 0) fillBox(ctx, x, bottom + height - fill, box, fill, COLORS.white);
		strokeBox(ctx, x, bottom, box, height, AUX.light, 2, 2);
	});
}

/** A bracket joining the two rows' ends at `x` to a stub towards `to` at mid-height. */
function bracket(ctx: ScreenCtx, from: number, x: number, to: number): void {
	const { top, bottom, height } = ROUTE;
	const [upper, lower] = [top + height / 2, bottom + height / 2];
	line(ctx, from, upper, x, upper, AUX.light, ROUTE.line);
	line(ctx, from, lower, x, lower, AUX.light, ROUTE.line);
	line(ctx, x, upper - ROUTE.line / 2, x, lower + ROUTE.line / 2, AUX.light, ROUTE.line);
	line(ctx, x, (upper + lower) / 2, to, (upper + lower) / 2, AUX.light, ROUTE.line);
}

function drawRoute(ctx: ScreenCtx, frame: AuxRouteFrame): void {
	if (frame.target === 'brain') {
		label(ctx, 'in', 66.5, 75.7);
		fillBox(ctx, 67, 80, 66, 65, COLORS.white, 2);
		drawIcon(ctx, 'auxiliary.brain', 68, 80, { tint: COLORS.ink });
		bracket(ctx, ROUTE_X.brain, 152.2, 133);
		routeRows(ctx, frame, ROUTE_X.brain, true);
		return;
	}
	const end = ROUTE_X.send + ROUTE.pitch * 7 + ROUTE.box;
	bracket(ctx, end, 344.4, 364);
	routeRows(ctx, frame, ROUTE_X.send, false);
	fillBox(ctx, 364, 80, 116, 65, COLORS.white);
	text(ctx, ROUTE_BOX[frame.target] ?? frame.target, 369.2, 100.6, 20, COLORS.ink);
}

// ─────────────────────────────────────── punch-in fx (auxiliary-021, as the device fills it)

/**
 * The dot matrix: TE's 40 × 18 dots on an 11.97 px pitch (the device's lattice within 0.4 px), 10
 * px across on the device (edges of the unlit dots in frames b1-895, b1-979…991; TE's art 11 px).
 */
const DOTS = { x: 6.49, y: 8.2, pitch: 11.9725, r: 5, cols: 40, rows: 18 } as const;

/**
 * Punch-in FX as the device draws it (research 59 §2.13; frames b1-875…991 and the 10 fps
 * recordings of every key): the matrix unlit (TE's panel tone on ink) but for the heartbeat's
 * white dot while no effect plays, and while one plays a picture from its animation, lit dots
 * white (the device's; ours: one frame of each animation, held, where the device animates it).
 */
function drawPunch(ctx: ScreenCtx, f: AuxPunchFrame): void {
	fillBox(ctx, 0, 0, 480, 220, COLORS.ink);
	const picture = f.picture === null ? undefined : PATTERNS[`auxiliary.punch.${f.picture}`];
	const beat = f.picture === null ? f.beat : null;
	for (let row = 0; row < DOTS.rows; row++) {
		for (let col = 0; col < DOTS.cols; col++) {
			const lit = picture
				? picture.grid[row]?.[col] === '2'
				: beat !== null && beat.col === col && beat.row === row;
			const x = DOTS.x + col * DOTS.pitch;
			disc(ctx, x, DOTS.y + row * DOTS.pitch, DOTS.r, lit ? COLORS.white : COLORS.panel);
		}
	}
}

// ───────────────────────────────────────── external midi (auxiliary-031, as the device draws it)

/**
 * The band of the midi pages (frames steps-747…787, b1-4095…4159): white cards either side of
 * four 65 px boxes from x 110 (M1: TE's DIN card, then the channel on black, the bank dark, the
 * program mid grey; M2 and M3: four CC slots in the encoders' tones). The big numbers are 40 px,
 * centred in the band as the device sets them; none of these pages carries soft labels.
 */
const MIDI = { top: 80, height: 65, box: 65, first: 110, baseline: 128.3 } as const;

/**
 * The device's 40 px figures: TE's digits set narrower and taller (ink widths 0.91 and heights
 * 1.05 of TE's on "01", "16", "81", "128"), centred on their ink.
 */
function bigFigure(
	ctx: ScreenCtx,
	value: string,
	cx: number,
	baseline: number,
	color: string
): void {
	ctx.save();
	ctx.translate(cx, baseline);
	ctx.scale(0.91, 1.05);
	inkText(ctx, value, 0, 0, 40, color);
	ctx.restore();
}

function midiBand(ctx: ScreenCtx, left: number): void {
	fillBox(ctx, 0, MIDI.top, left, MIDI.height, COLORS.white);
	fillBox(ctx, 370, MIDI.top, 110, MIDI.height, COLORS.white);
}

/**
 * A value box: its fill and 40 px value, or TE's crossed box for none: 1 px ink lines, or 2 px
 * white ones on black (b1-4103…4159).
 */
function valueBox(
	ctx: ScreenCtx,
	x: number,
	fill: string,
	value: string | null,
	ink: string,
	cx = x + MIDI.box / 2
): void {
	fillBox(ctx, x, MIDI.top, MIDI.box, MIDI.height, fill);
	if (value === null) {
		const black = fill === COLORS.black;
		crossed(
			ctx,
			x,
			MIDI.top,
			MIDI.box,
			MIDI.height,
			null,
			black ? COLORS.white : COLORS.ink,
			black ? 2 : 1
		);
		return;
	}
	bigFigure(ctx, value, cx, MIDI.baseline, ink);
}

/** External MIDI M1: the DIN card with the arrow under it, channel, bank and program. */
function drawMidi(ctx: ScreenCtx, frame: AuxMidiFrame): void {
	title(ctx, 'midi', 239.7, 45.8);
	midiBand(ctx, 175);
	line(ctx, 110, MIDI.top, 110, MIDI.top + MIDI.height, COLORS.ink, 0.5);
	drawIcon(ctx, 'auxiliary.din', 111, 81);
	// only the lower of TE's two arrows shows, light (the captures)
	drawIcon(ctx, 'auxiliary.arrow', 137, 149.46, { tint: AUX.light });
	valueBox(ctx, 175, COLORS.black, frame.channel, COLORS.white, 205);
	valueBox(ctx, 240, COLORS.dark, frame.bank, COLORS.white);
	valueBox(ctx, 305, COLORS.grey4, frame.program, COLORS.ink, 335.3);
	label(ctx, 'channel', 179.1, 75.8);
	label(ctx, 'bank', 244, 75.8);
	label(ctx, 'program', 308.8, 75.8);
}

/** The CC slots' tones by encoder: black, dark, mid grey, white (ink on the light two). */
const CC_TONES = [
	{ fill: COLORS.black, ink: COLORS.white },
	{ fill: COLORS.dark, ink: COLORS.white },
	{ fill: COLORS.grey4, ink: COLORS.ink },
	{ fill: COLORS.white, ink: COLORS.ink }
] as const;

/** External MIDI M2 / M3: four slots, each its value or crossed, its CC or "off" under it. */
function drawCc(ctx: ScreenCtx, frame: AuxCcFrame): void {
	title(ctx, 'midi', 239.7, 45.8);
	midiBand(ctx, MIDI.first);
	frame.slots.forEach((slot, i) => {
		const x = MIDI.first + MIDI.box * i;
		const tone = CC_TONES[i];
		valueBox(ctx, x, tone.fill, slot.cc === null ? null : slot.value, tone.ink);
		label(ctx, slot.cc === null ? 'off' : `cc ${slot.cc}`, x + 3.6, 158.2);
	});
	line(ctx, 370, MIDI.top, 370, MIDI.top + MIDI.height, COLORS.ink, 0.5);
}

// ───────────────────────────────────────── external cv (auxiliary-057, as the device draws it)

/**
 * The meter on OS 1.1.33 (b1-4236…4287): TE's voltmeter with a white body, the scale redrawn as the
 * device draws it (an arc of radius 68.5 about the pivot below the window, fifteen 2 px ticks every
 * 5° from −35° to +35°, 10 px long; TE's art left out the ticks near its needle), the figures in
 * the heavier weight, and a white needle 3 px wide from radius 58.5 to 79, 7° per volt.
 */
const METER = { x: 240.03, y: 186.28, arc: 68.5, tick: 10, degreesPerVolt: 7 } as const;
const NEEDLE = { r0: 58.5, r1: 79, width: 3 } as const;
/** The scale's figures: text, x, baseline. */
const METER_SCALE = [
	['-5', 192.5, 119.3],
	['-2.5', 214, 105.3],
	['0', 240, 101.7],
	['2.5', 268, 105.3],
	['5', 289, 119.3]
] as const;
/** The shapes of TE's meter the device keeps: the body, the window, the "V" and its bars. */
const METER_KEPT = new Set([0, 1, 13, 14, 15, 16, 17]);

/** A point `r` from the meter's pivot at `degrees` from upright (clockwise). */
function meterPoint(r: number, degrees: number): [number, number] {
	const a = (degrees * Math.PI) / 180;
	return [METER.x + Math.sin(a) * r, METER.y - Math.cos(a) * r];
}

function drawMeter(ctx: ScreenCtx, x: number, y: number): void {
	iconShapes(
		ctx,
		'auxiliary.meter',
		x,
		y,
		(i) => METER_KEPT.has(i),
		// the body is white on the device; the window stays black, the "V" ink
		(c, i) => (i === 0 ? COLORS.white : i === 1 ? COLORS.black : c === '#000000' ? COLORS.ink : c)
	);
	ctx.strokeStyle = AUX.light;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(METER.x, METER.y, METER.arc, (-125 * Math.PI) / 180, (-55 * Math.PI) / 180);
	ctx.stroke();
	for (let degrees = -35; degrees <= 35; degrees += 5) {
		const [x0, y0] = meterPoint(METER.arc - 0.5, degrees);
		const [x1, y1] = meterPoint(METER.arc + METER.tick, degrees);
		line(ctx, x0, y0, x1, y1, AUX.light, 2);
	}
	for (const [figure, cx, baseline] of METER_SCALE) {
		label(ctx, figure, cx, baseline, COLORS.white, 'center');
	}
}

/** External CV: the voltmeter, the needle at the pitch voltage. */
function drawCv(ctx: ScreenCtx, volts: number): void {
	title(ctx, 'CV', 240, 45.8);
	drawMeter(ctx, 175, 75);
	const degrees = Math.max(-5, Math.min(5, volts)) * METER.degreesPerVolt;
	const [x0, y0] = meterPoint(NEEDLE.r0, degrees);
	const [x1, y1] = meterPoint(NEEDLE.r1, degrees);
	line(ctx, x0, y0, x1, y1, COLORS.white, NEEDLE.width);
}

// ─────────────────────────────────────── external audio (auxiliary-064, as the device draws it)

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
 * External audio M1 on OS 1.1.33 (steps-866…883, b1-4280…4318): TE's signal flow with a 2 px edge
 * on the input card and light lines. While the input is off the card is crossed in red; over a
 * microphone the device writes "fdbk block" above it (the captures show the mic blocked, never
 * switched on: the rest is ours). Drive reads 00–20.
 */
function drawAudio(ctx: ScreenCtx, frame: AuxAudioFrame): void {
	const edge = AUX.light;
	line(ctx, 165, 95, 225, 95, edge, 1);
	line(ctx, 225, 94.5, 225, 114.5, edge, 1);
	line(ctx, 240.5, 130, 284.5, 130, edge, 1);
	line(ctx, 300, 145.5, 300, 220, edge, 1);
	line(ctx, 375.5, 145.5, 375.5, 220, edge, 1);
	fillBox(ctx, 100, 80, 65, 65, COLORS.black, 4);
	strokeBox(ctx, 100, 80, 65, 65, edge, 2, 4);
	inputPicture(ctx, frame, AUX.light);
	if (!frame.on) {
		line(ctx, 101, 144, 164, 81, COLORS.red, 1.5);
		if (frame.input === 'mic' || frame.input === 'headset') label(ctx, 'fdbk block', 105.6, 75.8);
	}
	label(ctx, 'input', 169.9, 91.1);
	fillBox(ctx, 209.5, 114.5, 31, 31, COLORS.dark, 4.5);
	fillBox(ctx, 284.5, 114.5, 31, 31, COLORS.grey4, 4.5);
	fillBox(ctx, 359.98, 114.5, 31, 31, COLORS.white, 4.5);
	inkText(ctx, frame.drive, 225.5, 138, 20, COLORS.white);
	inkText(ctx, frame.level, 300, 137.8, 20, COLORS.ink);
	inkText(ctx, frame.mix, 375.5, 137.8, 20, COLORS.ink);
	label(ctx, 'drive', 243.5, 126.5);
	label(ctx, 'level', 318.3, 126.5);
	label(ctx, 'mix', 393.1, 126.5);
	drawIcon(ctx, 'auxiliary.return', 360, 80, { colors: { '#afafaf': AUX.light } });
}

// ───────────────────────────────────────────────── tape (auxiliary-099, as the device draws it)

/**
 * The tape page on OS 1.1.33 (frames steps-954…998): TE's reels with the speed beside them in
 * percent, the tape strip, "mix" over the mix box, and the keyboard strip carrying the pitch
 * multiplier at its left and the loop length right of the keys, where TE's art had the pitch and
 * length over the strip and the clip number by the keys. Strips and boxes are white, the numbers
 * in them ink. The hits of the routed tracks and the red play head are TE's art (the captures show
 * an empty loop, stopped).
 */
const STRIP = { width: 447, top: 80, bottom: 110, mid: 95 } as const;
/** TE's recorded hit: 2.07 px columns, half-heights in px (a transient, then a softer bump). */
const HIT = [0.51, 1.01, 4.56, 8.11, 0.51, 1.01, 1.52, 2.03, 1.52, 1.01, 0.51];
/** The keyboard: fourteen white keys 12 px wide from x 156 (F3 … E5), black keys 18.8 deep. */
const TAPE_KEYS = { x: 156, key: 12, whites: 14, top: 115, bottom: 145, black: 18.8 } as const;
/** White-key boundaries that carry a black key (F# G# A#, C# D#, twice). */
const TAPE_BLACK = [1, 2, 3, 5, 6, 8, 9, 10, 12, 13];
/** Keys from F within an octave: a white key's index, or the boundary a black key sits on. */
const OCTAVE_FROM_F: readonly (readonly ['w' | 'b', number])[] = [
	['w', 0],
	['b', 1],
	['w', 1],
	['b', 2],
	['w', 2],
	['b', 3],
	['w', 3],
	['w', 4],
	['b', 5],
	['w', 5],
	['b', 6],
	['w', 6]
];

/** Where a keyboard key's (0–23, F3 … E5) dot goes on the tape page (TE's dots). */
function tapeKeyDot(key: number): { x: number; y: number; black: boolean } {
	const [kind, n] = OCTAVE_FROM_F[key % 12];
	const at = n + (key >= 12 ? 7 : 0);
	if (kind === 'b') return { x: TAPE_KEYS.x + TAPE_KEYS.key * at, y: 123.4, black: true };
	return { x: TAPE_KEYS.x + TAPE_KEYS.key * (at + 0.5), y: 139, black: false };
}

/**
 * A percent sign, which the screen font lacks: two rings and a stroke rising to the right, a
 * digit-high and 0.75 em wide like the device's "100%" (ours in the shape).
 */
function percent(ctx: ScreenCtx, x: number, baseline: number, size: number, color: string): void {
	const k = size / 20;
	ctx.strokeStyle = color;
	ctx.lineWidth = 2 * k;
	const [rx, ry, kappa] = [2.5 * k, 3.4 * k, 0.5523];
	for (const [cx, cy] of [
		[x + 3.6 * k, baseline - 11 * k],
		[x + 11.4 * k, baseline - 3.6 * k]
	]) {
		// an ellipse as four quarter arcs
		ctx.beginPath();
		ctx.moveTo(cx + rx, cy);
		ctx.bezierCurveTo(cx + rx, cy + ry * kappa, cx + rx * kappa, cy + ry, cx, cy + ry);
		ctx.bezierCurveTo(cx - rx * kappa, cy + ry, cx - rx, cy + ry * kappa, cx - rx, cy);
		ctx.bezierCurveTo(cx - rx, cy - ry * kappa, cx - rx * kappa, cy - ry, cx, cy - ry);
		ctx.bezierCurveTo(cx + rx * kappa, cy - ry, cx + rx, cy - ry * kappa, cx + rx, cy);
		ctx.closePath();
		ctx.stroke();
	}
	line(ctx, x + 2.2 * k, baseline, x + 12.8 * k, baseline - 14.5 * k, color, 2 * k);
}

function drawTape(ctx: ScreenCtx, frame: AuxTapeFrame): void {
	// the reels are as bright as the strips on the device (TE's art: light grey)
	drawIcon(ctx, 'auxiliary.reels', 196, 19, { colors: { '#cdcdcd': COLORS.white } });
	const speed = text(ctx, frame.speed, 289.3, 35.7, 20, COLORS.white, 'left', 0, true);
	percent(ctx, 289.3 + speed + 0.8, 35.7, 20, COLORS.white);

	fillBox(ctx, 0, STRIP.top, STRIP.width, STRIP.bottom - STRIP.top, COLORS.white);
	for (const h of frame.hits) {
		const x0 = unit(h) * STRIP.width;
		line(ctx, x0, STRIP.top, x0, STRIP.bottom, COLORS.ink, 0.5);
		HIT.forEach((half, i) => {
			const x = x0 + i * 2.07;
			if (x + 2.07 <= STRIP.width) fillBox(ctx, x, STRIP.mid - half, 2.07, half * 2, COLORS.ink);
		});
	}
	line(ctx, 0, STRIP.mid, STRIP.width, STRIP.mid, COLORS.ink, 0.75);
	const head = unit(frame.head) * STRIP.width;
	line(ctx, head, STRIP.top, head, STRIP.bottom, AUX.head, 2);
	label(ctx, 'mix', 448.3, 76);
	fillBox(ctx, 450, STRIP.top, 30, STRIP.bottom - STRIP.top, COLORS.white);
	text(ctx, frame.mix, 465, 102, 20, COLORS.ink, 'center');

	const { x, key, top, bottom } = TAPE_KEYS;
	fillBox(ctx, 0, top, 480, bottom - top, COLORS.white);
	for (let k = 0; k <= TAPE_KEYS.whites; k++) {
		line(ctx, x + key * k, top, x + key * k, bottom, COLORS.ink, 0.5);
	}
	for (const k of TAPE_BLACK)
		fillBox(ctx, x + key * k - 3.2, top, 6.4, TAPE_KEYS.black, COLORS.ink);
	for (const k of frame.keys) {
		const dot = tapeKeyDot(k);
		disc(ctx, dot.x, dot.y, 2, dot.black ? COLORS.white : COLORS.ink);
	}
	text(ctx, frame.pitch, 5.4, 137.8, 20, COLORS.ink);
	text(ctx, frame.length, 329.4, 137.8, 20, COLORS.ink);
}

// ──────────────────────────────────────────────────── fx (auxiliary-130, as the device draws it)

/**
 * The FX page on OS 1.1.33, measured on frames steps-999…1081 and b1-4640…4790 (research 59
 * §2.13): TE's layout (the slot boxed, the band y 80–145 with four 100 px columns from x 40) with
 * the device's own marks. Each column carries an 8 px marker whose top runs from 137 (0) to 80
 * (full), linear in the lane; the white strips at either edge carry one line at mid-height for
 * every effect.
 */
const FX = { band: 80, height: 65, x: 40, width: 100, marker: 8, travel: 57, mid: 112.5 } as const;

/** The columns' tones by encoder (TE's art); the marker is white on the ink column, ink elsewhere. */
const FX_COLUMNS = [
	{ fill: COLORS.ink, marker: COLORS.white },
	{ fill: COLORS.dark, marker: COLORS.ink },
	{ fill: COLORS.grey4, marker: COLORS.ink },
	{ fill: COLORS.white, marker: COLORS.ink }
] as const;

/**
 * The slot's name in its box: 20 px heavy, set wider than the font (its "I" stands at 218.5), the
 * box TE's (55 px) with a 2 px edge. "FX II" (never on camera) widens both by its extra letter.
 */
const FX_TITLE = { x: 187.1, baseline: 48.6, tracking: 0.035, name: 13 } as const;

function drawFx(ctx: ScreenCtx, frame: AuxFxFrame): void {
	const wide = (value: string) => screenFont.measure(value, 20, FX_TITLE.tracking + 0.03);
	const width = 54 + wide(frame.slot) - wide('FX I');
	strokeBox(ctx, 180.5, 25.5, width, 29, COLORS.light, 2, 3.5);
	text(
		ctx,
		frame.slot,
		FX_TITLE.x,
		FX_TITLE.baseline,
		20,
		COLORS.white,
		'left',
		FX_TITLE.tracking,
		true
	);
	text(ctx, frame.type, 180.5 + width + 1 + FX_TITLE.name, 46.9, 20, COLORS.white, 'left', 0, true);

	fillBox(ctx, 0, FX.band, 480, FX.height, COLORS.white);
	line(ctx, 0, FX.mid, FX.x, FX.mid, COLORS.ink, 1);
	line(ctx, FX.x + 4 * FX.width, FX.mid, 480, FX.mid, COLORS.ink, 1);
	frame.params.forEach((param, i) => {
		const x = FX.x + FX.width * i;
		const column = FX_COLUMNS[i];
		fillBox(ctx, x, FX.band, FX.width, FX.height, column.fill);
		const top = FX.band + FX.travel - FX.travel * unit(param.level);
		fillBox(ctx, x, top, FX.width, FX.marker, column.marker);
		label(ctx, param.label, x - 1.3, 75.8);
		label(ctx, param.value, x - 1.3, 160.35);
	});
}

/**
 * `shift + T7 / T8`: the effect list in the player list's style (frames b1-4647…4690): the FX
 * track's number and "fx" at the left, the six effects 20 px apart with the loaded one boxed, all
 * 20 px in the heavier weight.
 */
function drawFxList(ctx: ScreenCtx, frame: AuxFxListFrame): void {
	text(ctx, frame.track, 3.5, 27.3, 20, COLORS.white, 'left', 0, true);
	text(ctx, 'fx', 3.5, 47.3, 20, COLORS.white, 'left', 0, true);
	frame.items.forEach((item, i) => {
		const baseline = 26.5 + 20 * i;
		text(ctx, item, 108.4, baseline, 20, COLORS.white, 'left', 0, true);
		if (i === frame.selected) {
			strokeBox(ctx, 104, baseline - 17.4, 124.7, 20.9, COLORS.white, 1.8, 2.5);
		}
	});
}

// ─────────────────────────────────────────── filter (M3, as the device draws external audio's)

/**
 * The aux filter on OS 1.1.33 (steps-884…903, b1-4323…4335): the pass band between a rising
 * high-pass edge and a falling low-pass edge, filled in four bands that lighten across the
 * spectrum, over a strip resting on the floor; the frequency axis under it. Each edge is one
 * smooth step 80 px wide whose midpoint moves linearly with its lane: the low-pass's at
 * x 83.7 + 404.2·l, the high-pass's at x −53.4 + 397·h (fits to the CC sweeps within about a
 * pixel; the device's fall runs a little longer at its foot).
 */
const GRAPH = { left: 30, right: 450, top: 55.7, rest: 159.5, floor: 169.3, edge: 40 } as const;
/** The band dividers (1 px black under the 1k, 2k and 5k marks). */
const DIVIDERS = [159.5, 248.5, 328.5] as const;
/**
 * The bands' greys, ranked against tones of known grey in the same captures (the FX columns, the
 * routing boxes): the first darker than the ramp's first grey, then its third and fourth, then
 * white.
 */
const BAND_FILLS = [COLORS.panel, RAMP[2], RAMP[3], RAMP[7]] as const;
/** The axis marks, 12 px heavy: x, alignment. */
const AXIS: readonly (readonly [string, number, TextAlign])[] = [
	['50', 27.2, 'left'],
	['1k', 160.5, 'center'],
	['2k', 250.4, 'center'],
	['5k', 330.8, 'center'],
	['20kHz', 453.2, 'right']
];

/** How far down an edge's step is at `d` px past its midpoint: 0 at the top, 1 at the rest. */
function step(d: number): number {
	const t = unit((d + GRAPH.edge) / (2 * GRAPH.edge));
	return t * t * (3 - 2 * t);
}

/** Adds the filled area (the pass band over the resting strip) to the path. */
function tracePassBand(ctx: ScreenCtx, view: AuxFilterView): void {
	const lp = 83.7 + 404.2 * unit(view.lowpass);
	const hp = -53.4 + 397 * unit(view.highpass);
	ctx.moveTo(GRAPH.left, GRAPH.floor);
	for (let x = GRAPH.left; x <= GRAPH.right; x += 1) {
		const level = Math.max(step(x - lp), step(hp - x));
		ctx.lineTo(x, GRAPH.top + level * (GRAPH.rest - GRAPH.top));
	}
	ctx.lineTo(GRAPH.right, GRAPH.floor);
	ctx.closePath();
}

function drawFilterGraph(ctx: ScreenCtx, view: AuxFilterView): void {
	ctx.save();
	ctx.beginPath();
	tracePassBand(ctx, view);
	ctx.clip();
	const edges = [GRAPH.left, ...DIVIDERS, GRAPH.right];
	BAND_FILLS.forEach((fill, i) => {
		fillBox(ctx, edges[i], GRAPH.top, edges[i + 1] - edges[i], GRAPH.floor - GRAPH.top, fill);
	});
	for (const x of DIVIDERS) line(ctx, x, GRAPH.top, x, GRAPH.floor, COLORS.black, 1);
	ctx.restore();
	for (const [mark, x, align] of AXIS) label(ctx, mark, x, 182.3, COLORS.white, align);
}

/**
 * M3 with shift: the track's send cards over the filter at 40 %, as the device draws an
 * instrument's (b1-2950…2980, measured for the instrument's sends page; the aux tracks' were never
 * on camera): white cards 200.5 px wide from x 139.5, parts of TE's pictograms, the value, and the
 * encoder's dot at the right. A send at none reads "no send".
 */
const SEND = { x: 139.5, w: 200.5, top: 31.5, pitch: 39.8, h: 36.6, radius: 5 } as const;
/** The parts of TE's send pictograms the device draws, and how far below the card's top. */
const SEND_ICONS = [
	{
		name: 'sends.aux',
		parts: [
			{ shapes: [0], dy: 4.9 },
			{ shapes: [1, 2], dy: 2.36 }
		]
	},
	{ name: 'sends.tape', parts: [{ shapes: [0, 1, 2], dy: 9.76 }] },
	{ name: 'sends.fx1', parts: [{ shapes: [1, 2, 3, 4], dy: 6.85 }] },
	{ name: 'sends.fx2', parts: [{ shapes: [0, 1, 2, 3, 4], dy: 6.9 }] }
] as const;

function drawSends(
	ctx: ScreenCtx,
	filter: AuxFilterView,
	values: readonly (string | null)[]
): void {
	ctx.save();
	ctx.globalAlpha = 0.4;
	drawFilterGraph(ctx, filter);
	ctx.restore();
	values.forEach((value, i) => {
		if (value === null) return;
		const top = SEND.top + SEND.pitch * i;
		fillBox(ctx, SEND.x, top, SEND.w, SEND.h, COLORS.white, SEND.radius);
		const send = SEND_ICONS[i];
		for (const part of send.parts) {
			const shapes: readonly number[] = part.shapes;
			iconShapes(ctx, send.name, 144, top + part.dy, (index) => shapes.includes(index));
		}
		text(ctx, value === '00' ? 'no send' : value, 204.7, top + 25.5, 20, COLORS.ink);
		encoderDot(ctx, i as 0 | 1 | 2 | 3, 324.7, top + 6, COLORS.ink);
	});
}

// ────────────────────────────────────────────────── lfo (M4, as the device draws the aux LFOs)

/**
 * The aux LFO on OS 1.1.33 (external MIDI's, steps-788…828; external audio's, steps-904…953):
 * TE's value LFO set 5 px right, as TE draws random and element: speed (a clock dial when free, a
 * note and count when synced), amount ("amt": a ruler of 21 ticks from y 61 to 161 and a pointer
 * travelling ±50 px about its middle), a column of destinations with the chosen one in the middle
 * row and its neighbours above and below, and the parameter's card with its knob (without TE's
 * curve), named above it. Only speed and amount carry encoder dots.
 */
const LFO = { x: 60, y: 50, rulerTop: 61, rulerBottom: 161 } as const;
/** LFO cards carry TE's ink edge (instrument-093), which reads as a seam where cards touch. */
const lfoCard = (ctx: ScreenCtx, x: number, y: number, w: number, h: number) =>
	plainCard(ctx, x, y, w, h, COLORS.white, true);

/**
 * The speed card: when synced TE's note (5 px right of where TE drew it) and the count; when free a
 * clock dial whose hand turns half a turn, from 12 o'clock at the slowest to 6 at the fastest.
 */
function speedCard(ctx: ScreenCtx, speed: AuxLfoFrame['speed'], x: number, y: number): void {
	lfoCard(ctx, x, y, 120, 120);
	encoderDot(ctx, 0, x + 6, y + 5);
	if (speed.synced) {
		drawIcon(ctx, 'lfo.note16', x + 51.2, y + 30);
		text(ctx, speed.label, x + 115, y + 21.5, 20, COLORS.ink, 'right');
		return;
	}
	const [cx, cy] = [x + 60.2, y + 60];
	disc(ctx, cx, cy, 25, COLORS.ink);
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const [sin, cos] = [Math.sin(a), Math.cos(a)];
		line(ctx, cx + sin * 18, cy - cos * 18, cx + sin * 23, cy - cos * 23, COLORS.white, 1.6);
	}
	const hand = unit(speed.position) * Math.PI;
	ctx.lineCap = 'round';
	line(ctx, cx, cy, cx + Math.sin(hand) * 15, cy - Math.cos(hand) * 15, COLORS.white, 2.2);
}

/**
 * The destination cards' pictograms (x, y from the card's corner) and their names' baselines: the
 * device sets each name at its own height under its picture.
 */
const DESTINATION_CARDS: Readonly<
	Record<Exclude<AuxLfoDestination, 'off'>, { dx: number; dy: number; baseline: number }>
> = {
	syn: { dx: 13.5, dy: 10, baseline: 50.6 },
	filter: { dx: 13, dy: 10.6, baseline: 53.2 },
	amp: { dx: 0, dy: 0, baseline: 52.4 },
	cc1: { dx: 13.2, dy: 4.4, baseline: 53.3 },
	cc2: { dx: 13.2, dy: 4.4, baseline: 53.3 }
};

/** A 60 × 60 destination card with its pictogram and name, or crossed for none. */
function destinationCard(ctx: ScreenCtx, name: AuxLfoDestination, x: number, y: number): void {
	lfoCard(ctx, x, y, 60, 60);
	if (name === 'off') {
		crossed(ctx, x, y, 60, 60, null, COLORS.ink, 1);
		return;
	}
	const at = DESTINATION_CARDS[name];
	if (name === 'syn') drawIcon(ctx, 'lfo.wave.syn', x + at.dx, y + at.dy);
	else if (name === 'filter') drawIcon(ctx, 'lfo.filter', x + at.dx, y + at.dy);
	else if (name === 'amp') {
		// the speaker traced off the screen, and a small wave after it
		drawIcon(ctx, 'auxiliary.amp', x, y, { tint: COLORS.ink });
		ctx.strokeStyle = COLORS.ink;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (let i = 0; i <= 16; i++) {
			const px = x + 31 + i;
			const py = y + 23 - 5 * Math.sin((i / 16) * Math.PI * 2);
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.stroke();
	} else {
		// the CC sets: a DIN socket over their name (steps-788…828)
		drawIcon(ctx, 'auxiliary.din', x + at.dx, y + at.dy, { scale: 0.52, tint: COLORS.ink });
	}
	text(ctx, name, x + 30, y + at.baseline, 20, COLORS.ink, 'center');
}

function drawLfo(ctx: ScreenCtx, frame: AuxLfoFrame): void {
	const { x, y } = LFO;
	label(ctx, 'speed', x + 4.5, 45.8);
	speedCard(ctx, frame.speed, x, y);

	label(ctx, 'amt', x + 123.5, 45.8);
	lfoCard(ctx, x + 120, y, 60, 120);
	encoderDot(ctx, 1, x + 125, y + 5);
	amountRuler(ctx, x + 165, LFO.rulerTop, LFO.rulerBottom, frame.amount);

	// the column scrolls: the chosen destination in the middle row, its neighbours above and below
	for (let offset = -2; offset <= 2; offset++) {
		const name = frame.destinations[frame.destination + offset];
		if (name !== undefined) destinationCard(ctx, name, x + 180, 80 + 60 * offset);
	}

	const px = x + 240;
	label(ctx, frame.parameterName, px + 3.5, 45.8);
	lfoCard(ctx, px, y, 120, 120);
	// TE's knob without the curve and handles behind it, 2.3 px lower than TE drew it
	iconShapes(ctx, 'lfo.knob', px + 9, y + 6.3, (i) => i >= 3);
	// the knob's cap takes the grey of the destination parameter's encoder
	const cap = ['#0f0e12', '#484850', '#96969b', COLORS.white][frame.parameter] ?? '#96969b';
	ctx.save();
	ctx.translate(px + 60, y + 44.75);
	ctx.scale(1, 7.55 / 9.7);
	disc(ctx, 0, 0, 9.7, cap);
	ctx.restore();
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
		draw: drawPunch,
		describe: (f) => {
			if (f.active.length === 0) return 'punch-in fx: hold keys for effects';
			// the lower octave acts on the percussion tracks, the upper on the melodic ones
			const group = (name: string, keys: readonly number[]) =>
				keys.length ? [`${name} ${keys.map((k) => (k % 12) + 1).join(' ')}`] : [];
			const effects = [
				...group(
					'percussion',
					f.active.filter((k) => k < 12)
				),
				...group(
					'melodic',
					f.active.filter((k) => k >= 12)
				)
			];
			return `punch-in fx: ${effects.join(', ')}`;
		}
	},
	'aux-midi': {
		draw: drawMidi,
		describe: (f) =>
			`external midi: channel ${f.channel}, bank ${f.bank ?? 'none'}, program ${f.program ?? 'none'}`
	},
	'aux-cc': {
		draw: drawCc,
		describe: (f) =>
			`external midi set ${f.set}: ` +
			f.slots.map((s) => (s.cc === null ? 'off' : `cc ${s.cc} ${s.value}`)).join(', ')
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
		// the page writes the speed "100%"; the description keeps the bare number (read by the
		// navigator as a number)
		describe: (f) => `tape: pitch ${f.pitch}, speed ${f.speed}, length ${f.length}, mix ${f.mix}`
	},
	'aux-fx': {
		draw: drawFx,
		describe: (f) =>
			`${f.slot} ${f.type}: ${f.params.map((p) => `${p.label} ${p.value}`).join(', ')}`
	},
	'aux-fx-list': {
		draw: drawFxList,
		describe: (f) => f.items[f.selected] ?? ''
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
		draw: (ctx, f) => dimmedIfOff(ctx, f.off, () => drawFilterGraph(ctx, f)),
		describe: (f) =>
			`filter${f.off ? ' off' : ''}: high-pass ${Math.round(f.highpass * 99)}, ` +
			`low-pass ${Math.round(f.lowpass * 99)}`
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
		draw: (ctx, f) => dimmedIfOff(ctx, f.off, () => drawLfo(ctx, f)),
		describe: (f) =>
			`lfo${f.off ? ' off' : ''}: amount ${Math.round(f.amount)}, ` +
			`destination ${f.destinations[f.destination]}` +
			(f.parameterName ? `, parameter ${f.parameterName}` : '')
	}
};
