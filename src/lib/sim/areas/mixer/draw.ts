/**
 * Drawing the mixer area's frames on the 480 × 220 screen (see `../../screen/areas.ts`), with a
 * short spoken description of each for screen readers.
 *
 * TE's guide shows none of these pages; the mix pages follow the owner's device as a camera saw it
 * (docs/research/59-screen-profiling.md §2.10), measured on the realigned captures and redrawn in
 * TE's palette (the camera tints colours, so only their order is taken from it):
 * - M1 with the FX send popup over the core's strips (frames b1-069…096);
 * - M2, the EQ's scene of hinged panels (frames steps-018…038, b1-136…170; geometry in `eq.ts`);
 * - M3, the saturator's four tick ladders and caps (frames b1-171…204);
 * - M4, the group and master levels with the compressor's bar and a VU meter (frames b1-205…253).
 * The midi engine's CC pages are ours: they keep the midi M1 page's row of 65 px boxes, 10 px
 * labels and 40 px numbers (synth-engines-034) and are titled set I and set II, TE's names for the
 * same pages on the external midi track (auxiliary-031).
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { disc, fillBox, hatch, line, strokeBox, text, type HeaderCell } from '../../screen/draw';
import { drawIcon } from '../../screen/icons';
import { drawMix } from '../../screen/pages/mix';
import { COLORS, ENCODER_DOTS, RAMP } from '../../screen/palette';
import { describeFrame } from '../../screen/render';
import {
	EQ_PANELS,
	GROOVE,
	KNOB_TRAVEL,
	N_GLYPH,
	TRAY,
	floorAt,
	floorPoint,
	panelOutline,
	panelShadow,
	type EqPanel,
	type Point
} from './eq';
import type {
	MidiCcFrame,
	MixEqFrame,
	MixMasterFrame,
	MixSaturatorFrame,
	MixSendsFrame,
	MixerFrame
} from './frames';

const unit = (v: number) => Math.max(0, Math.min(1, v));
const bipolar = (v: number) => Math.max(-1, Math.min(1, v));

/** `t` (0–1) of colour `a` over colour `b`, both `#rrggbb`. */
function blend(a: string, b: string, t: number): string {
	const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
	const mixed = [0, 1, 2].map((i) =>
		Math.round(channel(a, i) * t + channel(b, i) * (1 - t))
			.toString(16)
			.padStart(2, '0')
	);
	return `#${mixed.join('')}`;
}

// ─────────────────────────────────────────────────────────────── mix M1: the FX send popup

/** Top of a send bar at 0 and at full send; the bar runs down to the screen's foot. */
const SEND_ZERO = 215;
const SEND_FULL = 30;
/** How much of the strip's ink each bar takes: FX I dark, FX II half as dark. */
const SEND_INK = [0.75, 0.35] as const;
/** The core's mix page: a muted strip's hatching starts at the top of the level travel. */
const HATCH_TOP = 25;

/**
 * Mix M1 while E1 or E2 turns, measured on camera frames b1-069…096 (T3 selected): the selected
 * strip drops its number, level bar and pan dot; each half of it (30 px) carries a 16 px box with a
 * 1 px edge, "I" over FX I on the left and "II" over FX II on the right, and a bar rising from the
 * foot, from a 5 px stub at 0 to y 30 at full send. On T3 edges and numerals are black, the FX I
 * bar near black and the FX II bar the second ramp grey; as ink over the strip's grey (75 % and
 * 35 %) that carries to the other strips, white ink on the two darkest like the core's bars (ours).
 */
function drawSendPopup(ctx: ScreenCtx, frame: MixSendsFrame): void {
	const { base } = frame;
	drawMix(ctx, base);
	const i = base.selected;
	const strip = base.strips[i];
	if (!strip || i < 0 || i > 7) return;
	const x = i * 60;
	const ink = i < 2 ? COLORS.white : COLORS.black;
	fillBox(ctx, x, 0, 60, 220, RAMP[i]);
	if (strip.muted) hatch(ctx, x, HATCH_TOP, 60, 220 - HATCH_TOP, COLORS.ink, 7.5, 0.5);
	frame.sends.slice(0, 2).forEach((send, k) => {
		const left = x + 30 * k;
		const top = SEND_ZERO - (SEND_ZERO - SEND_FULL) * unit(send);
		fillBox(ctx, left, top, 30, 220 - top, blend(ink, RAMP[i], SEND_INK[k]));
		strokeBox(ctx, left + 7, 6, 16, 16, ink);
		// the device spaces the two strokes of "II" 3.9 px apart, wider than the font's pair
		text(ctx, k === 0 ? 'I' : 'II', left + 15, 17, 10, ink, 'center', k === 0 ? 0 : 0.12);
	});
}

// ─────────────────────────────────────────────────────────────────────────── mix M2: EQ

/**
 * The scene's tones in TE's ramp, ranked as the camera sees them (the camera tints and stretches
 * colours, so only their order and steps are taken): the floor light grey, the tray and the mid
 * panels a step down, the low panels dark, the high panels white; shadows and the groove black.
 */
const EQ_TONES = {
	floor: RAMP[6],
	tray: RAMP[4],
	panels: [RAMP[2], RAMP[4], RAMP[7]],
	ink: COLORS.ink
} as const;
/** The floor's lines and the panels' edges (the captures show about ¾ px of black). */
const EQ_LINE = 0.75;

/** Adds a closed polygon to the current path. */
function tracePolygon(ctx: ScreenCtx, points: readonly Point[]): void {
	points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
	ctx.closePath();
}

/** Fills a polygon, and strokes its edge when `edge` is given. */
function polygon(ctx: ScreenCtx, points: readonly Point[], fill: string, edge?: string): void {
	ctx.beginPath();
	tracePolygon(ctx, points);
	ctx.fillStyle = fill;
	ctx.fill();
	if (!edge) return;
	ctx.strokeStyle = edge;
	ctx.lineWidth = EQ_LINE;
	ctx.lineJoin = 'miter';
	ctx.stroke();
}

/** Adds an elliptical arc (angles clockwise from +x, `from` < `to`) as cubic curves. */
function ellipseArc(
	ctx: ScreenCtx,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	from: number,
	to: number
): void {
	const segments = Math.max(1, Math.ceil((to - from) / (Math.PI / 2)));
	const step = (to - from) / segments;
	const k = (4 / 3) * Math.tan(step / 4);
	for (let i = 0; i < segments; i++) {
		const a0 = from + i * step;
		const a1 = a0 + step;
		const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
		ctx.bezierCurveTo(
			cx + rx * (c0 - k * s0),
			cy + ry * (s0 + k * c0),
			cx + rx * (c1 + k * s1),
			cy + ry * (s1 - k * c1),
			cx + rx * c1,
			cy + ry * s1
		);
	}
}

/** The floor's lines, every cell edge across the whole screen. */
function floorLines(ctx: ScreenCtx): void {
	const corners = [floorAt(0, 0), floorAt(480, 0), floorAt(0, 220), floorAt(480, 220)];
	const [u0, u1] = [
		Math.floor(Math.min(...corners.map((c) => c[0]))),
		Math.ceil(Math.max(...corners.map((c) => c[0])))
	];
	const [v0, v1] = [
		Math.floor(Math.min(...corners.map((c) => c[1]))),
		Math.ceil(Math.max(...corners.map((c) => c[1])))
	];
	ctx.beginPath();
	for (let u = u0; u <= u1; u++) {
		ctx.moveTo(...floorPoint(u, v0));
		ctx.lineTo(...floorPoint(u, v1));
	}
	for (let v = v0; v <= v1; v++) {
		ctx.moveTo(...floorPoint(u0, v));
		ctx.lineTo(...floorPoint(u1, v));
	}
	ctx.strokeStyle = EQ_TONES.ink;
	ctx.lineWidth = EQ_LINE;
	ctx.lineCap = 'butt';
	ctx.stroke();
}

/** The groove: a black band along the tray with round ends, drawn in the floor. */
function groove(ctx: ScreenCtx): void {
	const { u, halfWidth: r, v0, v1 } = GROOVE;
	const half = (from: number) => Array.from({ length: 13 }, (_, i) => from + (Math.PI * i) / 12);
	polygon(
		ctx,
		[
			// the far end's half circle, right to left through its tip, then the near end's
			...half(0).map((a) => floorPoint(u + r * Math.cos(a), v0 + r - r * Math.sin(a))),
			...half(0).map((a) => floorPoint(u - r * Math.cos(a), v1 - r + r * Math.sin(a)))
		],
		COLORS.black
	);
}

/** The "N" lying in the floor past the tray: two uprights along the slot and the diagonal. */
function nGlyph(ctx: ScreenCtx): void {
	const [ua, ub] = N_GLYPH.u;
	const [va, vb] = N_GLYPH.v;
	ctx.beginPath();
	for (const [a, b] of [
		[floorPoint(ua, va), floorPoint(ua, vb)],
		[floorPoint(ub, va), floorPoint(ub, vb)],
		[floorPoint(ua, va), floorPoint(ub, vb)]
	]) {
		ctx.moveTo(...a);
		ctx.lineTo(...b);
	}
	ctx.strokeStyle = EQ_TONES.ink;
	ctx.lineWidth = 1;
	ctx.lineCap = 'butt';
	ctx.stroke();
}

/**
 * The knob: a small white cylinder, 8 px across with a 4.6 px top, at `travel` (0–1) along the
 * groove. At rest it stands in the groove's rounded near end at the tray's height; once it moves
 * it sits 2.5 px lower, down in the groove (frames steps-018…022, b1-157…170).
 */
function eqKnob(ctx: ScreenCtx, travel: number): void {
	const v = KNOB_TRAVEL.rest + (KNOB_TRAVEL.end - KNOB_TRAVEL.rest) * unit(travel);
	const [x, y] = floorPoint(GROOVE.u, v);
	const sunk = unit((KNOB_TRAVEL.rest - v) / 0.2);
	const [rx, ry, top, base] = [4, 2.3, y - 3.7, y + 0.2 + 2.5 * sunk];
	ctx.beginPath();
	ctx.moveTo(x + rx, top);
	ctx.lineTo(x + rx, base);
	ellipseArc(ctx, x, base, rx, ry, 0, Math.PI);
	ctx.lineTo(x - rx, top);
	ellipseArc(ctx, x, top, rx, ry, Math.PI, 2 * Math.PI);
	ctx.closePath();
	ctx.fillStyle = COLORS.white;
	ctx.fill();
	ctx.strokeStyle = EQ_TONES.ink;
	ctx.lineWidth = EQ_LINE;
	ctx.stroke();
	// the top face's near rim
	ctx.beginPath();
	ctx.moveTo(x + rx, top);
	ellipseArc(ctx, x, top, rx, ry, 0, Math.PI);
	ctx.stroke();
}

/**
 * Mix M2 as the device draws it (see `eq.ts`): the floor and its lines, the slot's tray, groove and
 * "N", the panels' shadows, then the panels back to front, each row leaning with its band, and the
 * knob. The device shows no numbers on this page.
 */
function drawEq(ctx: ScreenCtx, frame: MixEqFrame): void {
	fillBox(ctx, 0, 0, 480, 220, EQ_TONES.floor);
	const { u0, u1, v0, v1 } = TRAY;
	polygon(
		ctx,
		[floorPoint(u0, v0), floorPoint(u1, v0), floorPoint(u1, v1), floorPoint(u0, v1)],
		EQ_TONES.tray
	);
	floorLines(ctx);
	groove(ctx);
	nGlyph(ctx);
	const tilt = (panel: EqPanel) => frame.tilts[panel.band] ?? 0.5;
	for (const panel of EQ_PANELS) polygon(ctx, panelShadow(panel), COLORS.black);
	for (const panel of EQ_PANELS) {
		polygon(ctx, panelOutline(panel, tilt(panel)), EQ_TONES.panels[panel.band], EQ_TONES.ink);
	}
	eqKnob(ctx, frame.knob);
}

// ─────────────────────────────────────────────────────────────────────────── mix M3: saturator

/** The four ladders' centres, one per encoder. */
const LADDER_X = [60, 180, 300, 420] as const;
/** Each ladder's 43 ticks, 20 px wide and 2 px thick, every 5 panel rows around y 110. */
const TICKS = { count: 43, pitch: 4.976, width: 20, thickness: 2 } as const;
/** A cap is 50 × 20; it travels the whole height, centred at y 210 at 0 and at 10 at the top. */
const CAP = { width: 50, height: 20, radius: 2, low: 210, high: 10 } as const;
/**
 * The caps in the encoders' styles on black: E1 hollow (a 2 px light grey edge and grip), E2 mid
 * grey, E3 light grey, E4 white, each filled one with a dark 1 px grip across its middle.
 */
const CAP_FILL = [COLORS.black, ENCODER_DOTS[1], ENCODER_DOTS[2], COLORS.white] as const;

/** A ladder's cap at `value` (0–1) in encoder `e`'s style. */
function ladderCap(ctx: ScreenCtx, x: number, value: number, e: number): void {
	const top = CAP.low - CAP.height / 2 - (CAP.low - CAP.high) * unit(value);
	const left = x - CAP.width / 2;
	const middle = top + CAP.height / 2;
	fillBox(ctx, left, top, CAP.width, CAP.height, CAP_FILL[e], CAP.radius);
	if (e === 0) {
		// the hollow cap's 2 px edge runs on the box's outline, its grip across the middle
		const edge = ENCODER_DOTS[2];
		strokeBox(ctx, left, top, CAP.width, CAP.height, edge, 2, CAP.radius);
		line(ctx, left, middle, left + CAP.width, middle, edge, 2);
	} else line(ctx, left, middle, left + CAP.width, middle, COLORS.black, 1);
}

/**
 * Mix M3 as the device draws it (camera frames b1-171…204): on black, a ladder of ticks per
 * encoder with its label at the column's top left in white, and a cap in the encoder's style riding
 * up the ladder with the value (tone centred at neutral).
 */
function drawSaturator(ctx: ScreenCtx, frame: MixSaturatorFrame): void {
	const values = [frame.gain, frame.clip, (bipolar(frame.tone) + 1) / 2, frame.mix];
	LADDER_X.forEach((x, e) => {
		for (let k = 0; k < TICKS.count; k++) {
			const y = 110 + (k - (TICKS.count - 1) / 2) * TICKS.pitch;
			fillBox(
				ctx,
				x - TICKS.width / 2,
				y - TICKS.thickness / 2,
				TICKS.width,
				TICKS.thickness,
				RAMP[3]
			);
		}
		text(ctx, frame.header[e]?.label ?? '', e * 120 - 1, 15.75, 20, COLORS.white);
		ladderCap(ctx, x, values[e], e);
	});
}

// ─────────────────────────────────────────────────────────────────────────── mix M4: master

/**
 * The master page's layout (camera frames b1-205…253): the two groups' levels on the left above
 * and below a divider, two white strips down the middle (they stayed full whatever was turned; how
 * they move with sound was not captured), and the master level under a VU meter.
 */
const MASTER = {
	divider: 109.5,
	strips: [
		[229, 239.75],
		[240.25, 251]
	],
	/** The compressor's dark bar: in the right strip, rising from the divider. */
	compressor: { x: 242.75, width: 4.25, height: 40 }
} as const;

/**
 * The VU meter: its pivot sits below the scale; angles are from straight up, clockwise. The scale
 * reads −20, −10, −5, 0 and +3 at its labelled ticks, a band marks 0…+3, and a grey dot waits past
 * the end.
 */
const VU = {
	x: 359.67,
	y: 151.97,
	radius: 94.5,
	ticks: [
		-35.5, -25.73, -15.41, -10.23, -5.16, 0.16, 5.21, 10.44, 15.56, 20.71, 25.82, 30.97, 36.7
	],
	/** dB → angle at the labelled ticks, for the needle. */
	scale: [
		[-20, -35.5],
		[-10, -25.73],
		[-5, -5.16],
		[0, 15.56],
		[3, 36.7]
	],
	band: [15.2, 37.2],
	labels: [
		{ text: '–20', x: 284.9, y: 59.05 },
		{ text: '–10', x: 304.4, y: 46.15 },
		{ text: '–5', x: 349.2, y: 36.75 },
		{ text: '0', x: 389.8, y: 41.65 },
		{ text: '+3', x: 429.1, y: 60.95 }
	],
	dot: { x: 431.6, y: 71.7, r: 2 },
	needle: { from: 73, to: 111, width: 3 }
} as const;

/** A point `r` from the VU's pivot at `degrees` from straight up. */
function vuPoint(r: number, degrees: number): Point {
	const a = (degrees * Math.PI) / 180;
	return [VU.x + r * Math.sin(a), VU.y - r * Math.cos(a)];
}

/**
 * The needle's angle for the master's momentary output (0–1): silence rests on −20, full output
 * reaches +3 (ours: the device's meter was only seen at rest); in dB between the labelled ticks.
 */
export function needleAngle(output: number): number {
	const db = output > 0 ? 20 * Math.log10(unit(output)) + 3 : -Infinity;
	const scale = VU.scale;
	if (db <= scale[0][0]) return scale[0][1];
	for (let i = 1; i < scale.length; i++) {
		const [d1, a1] = scale[i];
		const [d0, a0] = scale[i - 1];
		if (db <= d1) return a0 + ((db - d0) / (d1 - d0)) * (a1 - a0);
	}
	return scale[scale.length - 1][1];
}

/** The VU meter, needle at the master's output. */
function vuMeter(ctx: ScreenCtx, output: number): void {
	const rad = (d: number) => ((d - 90) * Math.PI) / 180;
	// the band from 0 to +3, from the scale line out
	ctx.beginPath();
	ctx.arc(VU.x, VU.y, VU.radius + 7.4, rad(VU.band[0]), rad(VU.band[1]));
	ctx.arc(VU.x, VU.y, VU.radius - 0.75, rad(VU.band[1]), rad(VU.band[0]), true);
	ctx.closePath();
	ctx.fillStyle = COLORS.white;
	ctx.fill();
	// the scale line and the ticks
	ctx.beginPath();
	ctx.arc(VU.x, VU.y, VU.radius, rad(VU.ticks[0] - 0.4), rad(VU.band[1]));
	for (const t of VU.ticks) {
		ctx.moveTo(...vuPoint(VU.radius - 0.75, t));
		ctx.lineTo(...vuPoint(VU.radius + 13.5, t));
	}
	ctx.strokeStyle = COLORS.white;
	ctx.lineWidth = 1.5;
	ctx.lineCap = 'butt';
	ctx.stroke();
	for (const label of VU.labels)
		text(ctx, label.text, label.x, label.y, 10, COLORS.white, 'center');
	disc(ctx, VU.dot.x, VU.dot.y, VU.dot.r, RAMP[4]);
	const angle = needleAngle(output);
	ctx.beginPath();
	ctx.moveTo(...vuPoint(VU.needle.from, angle));
	ctx.lineTo(...vuPoint(VU.needle.to, angle));
	ctx.lineWidth = VU.needle.width;
	ctx.stroke();
}

/** The compressor's dark bar for `amount` (0–1): a pixel at the default 10, 40 px at the top. */
export function compressorHeight(amount: number): number {
	return MASTER.compressor.height * unit(amount) ** 1.5;
}

/**
 * Mix M4 as the device draws it (camera frames b1-205…253): "percussion" and "melodic" with their
 * levels in 50 px figures, a divider between them; two white strips down the middle, the right one
 * darkened up from the divider as the compressor rises; the VU meter over "master" and its level.
 * The page has no picture of the groups' own meters (they stay in the frame for its readers).
 */
function drawMaster(ctx: ScreenCtx, frame: MixMasterFrame): void {
	const [percussion, melodic, , master] = frame.header;
	text(ctx, percussion?.label ?? '', 5, 20.75, 20, COLORS.white);
	text(ctx, percussion?.value ?? '', 119.5, 87.8, 50, COLORS.white, 'center');
	text(ctx, melodic?.label ?? '', 5, 130.1, 20, COLORS.white);
	text(ctx, melodic?.value ?? '', 119.5, 187.4, 50, COLORS.white, 'center');
	for (const [x0, x1] of MASTER.strips) fillBox(ctx, x0, 0, x1 - x0, 220, COLORS.white);
	const { x, width } = MASTER.compressor;
	const h = compressorHeight(frame.values[2]);
	fillBox(ctx, x, MASTER.divider - h, width, h, COLORS.dark);
	line(ctx, 0, MASTER.divider, 253.5, MASTER.divider, COLORS.grey1, 1);
	vuMeter(ctx, frame.meters[2]);
	text(ctx, master?.label ?? '', 359.5, 132.5, 20, COLORS.white, 'center');
	text(ctx, master?.value ?? '', 359, 187.4, 50, COLORS.white, 'center');
}

// ─────────────────────────────────────────────────────────── midi engine M2 / M3: CC slots

/** The midi M1 page's row of boxes, one per encoder. */
const SLOT_X = [110, 175, 240, 305] as const;
const SLOT_TOP = 80;
const SLOT_SIZE = 65;
/**
 * Box and number colours per encoder: E1's number sits on black like M1's channel, E2 and E3 take
 * M1's bank and program greys, E4 the white encoder's white.
 */
const SLOT_FILL = [COLORS.black, COLORS.dark, COLORS.grey4, COLORS.white] as const;
const SLOT_INK = [COLORS.white, COLORS.white, COLORS.black, COLORS.black] as const;

/** The midi engine's CC page: the set's name, then four slots, off ones crossed like M1's bank. */
function drawMidiCc(ctx: ScreenCtx, frame: MidiCcFrame): void {
	text(ctx, frame.set === 1 ? 'set I' : 'set II', 240, 45, 20, COLORS.white, 'center');
	frame.slots.slice(0, 4).forEach((slot, k) => {
		const x = SLOT_X[k];
		text(ctx, slot.label, x + 5, 75, 10, COLORS.white);
		if (slot.value === null) {
			// TE's crossed "none" box (drawn with its left margin), in the slot's own tone; on black
			// the first one takes a grey cross and edge
			drawIcon(ctx, 'midi.none', x - 26, SLOT_TOP - 11, {
				colors: { '#2f2f37': SLOT_FILL[k], '#000000': k === 0 ? COLORS.grey1 : COLORS.black }
			});
			if (k === 0)
				strokeBox(ctx, x + 0.5, SLOT_TOP + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1, COLORS.grey1);
			return;
		}
		fillBox(ctx, x, SLOT_TOP, SLOT_SIZE, SLOT_SIZE, SLOT_FILL[k]);
		text(ctx, slot.value, x + SLOT_SIZE / 2, 125, 40, SLOT_INK[k], 'center');
	});
}

// ─────────────────────────────────────────────────────────────────────────── registry

const cells = (header: readonly HeaderCell[]) =>
	header.map((c) => `${c.label} ${c.value}`).join(', ');

/** A send as a number on the 0–99 scale the track's send page shows. */
const sendValue = (v: number) => String(Math.round(unit(v) * 99)).padStart(2, '0');

export const drawers: AreaDrawers<MixerFrame> = {
	'mix-sends': {
		draw: drawSendPopup,
		describe: (f) =>
			`${describeFrame(f.base)}, fx I ${sendValue(f.sends[0])}, fx II ${sendValue(f.sends[1])}`
	},
	'mix-eq': { draw: drawEq, describe: (f) => `master eq: ${cells(f.header)}` },
	'mix-saturator': { draw: drawSaturator, describe: (f) => `master saturator: ${cells(f.header)}` },
	'mix-master': { draw: drawMaster, describe: (f) => `master: ${cells(f.header)}` },
	'midi-engine-cc': {
		draw: drawMidiCc,
		describe: (f) =>
			`midi cc set ${f.set === 1 ? 'I' : 'II'}${f.shift ? ' cc numbers' : ''}: ${f.slots
				.map((s) => (s.value === null ? 'off' : `${s.label} ${s.value}`))
				.join(', ')}`
	}
};
