/**
 * The M1 page of the three sampler engines as the device draws it, measured on the owner's OS 1.1.33
 * unit by camera (docs/research/59-screen-profiling.md §2.5; frames b1-2440…2590 drum sampler,
 * b1-2600…2708 synth sampler, b1-2718…2782 multisampler). TE's guide art (sample-025, sample-056,
 * sample-113) has the same two lanes; on the device:
 *
 * - The sample runs across both lanes (left and right channel) in white one-pixel columns, the
 *   parts it skips (before the start, after the end, and the lanes' margins) in a pale grey. A
 *   white L / R badge sits at each lane's top left, over everything.
 * - Each point is a black line through both lanes with a small handle in each gap, the handle in
 *   the shade of the encoder that moves it (dark, mid grey, light grey, white for E1…E4).
 * - The drum sampler's fade darkens a ramp from its start marker, the loop crossfade a wedge before
 *   the loop end, on both layers; gain scales the drawn wave.
 * - The top row is the drum sampler's tune and play mode, the synth sampler's overview of the
 *   whole sample, the multisampler's keyboard with the played zone lit. Shift swaps it for four
 *   pictograms: direction, pan (drum) or tune, fade (drum) or crossfade with its loop type, gain.
 *
 * Colours are TE's palette tones picked by the captures' brightness (the camera adds a cyan cast;
 * the display itself has no blue).
 * The header pictograms are traced off the device (`research/device/icontrace.py`,
 * knowledge/opxy/device-icons/sampler.json). Coordinates are design px, the captures' rows scaled
 * by 220/222, placed as the best aligned frames put them (the synth sampler's from b1-2665 and the
 * multisampler's, which agree to 0.1 px on the badges); the drum sampler's frames, which sit up to
 * 0.5 px left and 0.3–1.1 px higher (their badges, lanes and shared pictograms say so), are moved
 * by as much. The camera's glare widens what is bright by about 0.7 px a side (white on black: the
 * screen font's digits, TE's 10 px handles) and narrows what is dark; sizes below are the shapes'
 * with that taken off, positions the shapes' middles.
 */
import { decodeWave, WAVE_LEVELS } from '../../areas/sample/wave';
import { figures } from '../../areas/sequencer/device-text';
import type { ScreenCtx } from '../context';
import { fillBox, roundRectPath, text } from '../draw';
import { screenFont } from '../font';
import type { DrumFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ─────────────────────────────────────────────────────────────────────────── lanes

/**
 * The lanes: 89.7 px tall from y 30.3 and 124.9, the full width, corners of about 3, in TE's dark
 * grey (the camera reads them as the mixer's second strip). The wave's 1 px centre line runs 45.5
 * below a lane's top, 0.65 below the lane's middle.
 */
export const LANES = { tops: [30.3, 124.9], height: 89.7, radius: 3, centre: 45.5 } as const;

/**
 * Where a sample's start (0) and end (1) fall: x 6.72 to 475.67, the same on every engine (the
 * multisampler's zones and the synth sampler's start at rest, its end alone, the drum sampler's
 * start and end at rest).
 */
export const SAMPLE_X = { x0: 6.72, width: 468.95 } as const;

/** The x of a position 0–1 in the sample. */
export function sampleX(p: number): number {
	return SAMPLE_X.x0 + SAMPLE_X.width * clamp01(p);
}

/**
 * The skipped parts' colour: the camera puts them at the brightness of TE's third grey, with the
 * cyan cast it gives the player pictures (research 59 §2.5); the display has no blue (the owner),
 * so it is that grey.
 */
export const TINT = '#7a7a82';

/** The multisampler's unlit black keys: the pale grey at a fifth over the dark grey (camera). */
const TINT_DARK = '#4d4d55';

/**
 * The drawn wave: a column is the centre line's pixel and as many whole pixels above and below it
 * as its level's share of the lane's half (44.5 px at full scale) times the gain, cut at the lane's
 * edges. Gain in dB scales it as amplitude: the gain wedge's fill and the wave's scale agree over
 * ten frames from −17 to +17 dB (b1-2565…2576).
 */
const WAVE = { full: 44.5, line: 1 } as const;

/** Amplitude factor of a 0–1 gain (−30…+20 dB). */
export function gainFactor(gain: number): number {
	return 10 ** ((clamp01(gain) * 50 - 30) / 20);
}

/**
 * The half-height a lane column is drawn with for a level (sixteenths) at a gain (0–1): the
 * centre line's half pixel plus the whole pixels either side of it.
 */
export function waveHalf(level: number, gain: number): number {
	const rows = Math.round((level / WAVE_LEVELS) * WAVE.full * gainFactor(gain));
	return WAVE.line / 2 + Math.min(Math.ceil(LANES.height), rows);
}

// ─────────────────────────────────────────────────────────────────────────── points

/**
 * A point's line: black, from the top handle's top to the screen's bottom, over the wave; 2 px (the
 * camera reads 1.5 where the lane's glare narrows it, with a black core; ours between the two).
 */
const MARKER = { width: 2, top: 25.45 } as const;

/**
 * A point's handles: TE's 10 × 5 boxes (the camera reads 10.4 for the dark ones, 11.4 for the white
 * ones), centred on its line: above the first lane (0.35 px into it), in the gap between the lanes,
 * and below the second lane. Corners of 1 are ours.
 */
const HANDLE = { w: 10, h: 5, radius: 1, tops: [25.45, 120, 214.65] } as const;

/**
 * The handles' shades, by the encoder that moves the point: E1 TE's dark grey, E2 its fourth, E3
 * its light grey, E4 white (the camera: 120, 193, 246 and 255 where the mixer strips read 103,
 * 190, 240 and 250).
 */
export const HANDLE_SHADES = [COLORS.dark, COLORS.grey3, COLORS.light, COLORS.white] as const;

function point(ctx: ScreenCtx, x: number, encoder: number): void {
	fillBox(ctx, x - MARKER.width / 2, MARKER.top, MARKER.width, 220 - MARKER.top, COLORS.black);
	for (const top of HANDLE.tops) {
		fillBox(ctx, x - HANDLE.w / 2, top, HANDLE.w, HANDLE.h, HANDLE_SHADES[encoder], HANDLE.radius);
	}
}

// ─────────────────────────────────────────────────────────────────────────── fade and crossfade

/** The darkened ramp or wedge: TE's near-black panel tone (the camera: 56, as the filter's band). */
const SHADE = COLORS.panel;

/**
 * The drum sampler's fade: dark above a line from the start marker at a lane's bottom to its top
 * `fade / 255` of the sample further on (fades 26…70 drew 50…127 px, 1.84 px a step, rms 2 px).
 * Where it starts when the start is moved in is ours: at the start marker.
 */
export function fadeRamp(start: number, fade: number): { x0: number; x1: number } {
	const x0 = sampleX(start);
	return { x0, x1: x0 + (clamp01(fade) * 99 * SAMPLE_X.width) / 255 };
}

/**
 * The loop crossfade: a dark wedge ending at the loop end marker, its top reaching back that share
 * of the loop (10, 18, 53 and 75 % of a 103 px loop, 19 % of a 97 px one, each within 0.7 px).
 */
export function crossfadeWedge(
	loopStart: number,
	loopEnd: number,
	crossfade: number
): { x0: number; x1: number } {
	const x1 = sampleX(loopEnd);
	const length = Math.max(0, x1 - sampleX(loopStart));
	return { x0: x1 - (Math.round(clamp01(crossfade) * 99) / 100) * length, x1 };
}

/** Darkens each lane above the line from (x0, bottom) to (x1, top) (the fade), or below it. */
function shadeLanes(ctx: ScreenCtx, x0: number, x1: number, rising: boolean): void {
	if (x1 - x0 < 0.01) return;
	ctx.fillStyle = SHADE;
	for (const top of LANES.tops) {
		const bottom = top + LANES.height;
		ctx.beginPath();
		if (rising) {
			ctx.moveTo(x0, bottom);
			ctx.lineTo(x1, top);
			ctx.lineTo(x0, top);
		} else {
			ctx.moveTo(x0, top);
			ctx.lineTo(x1, top);
			ctx.lineTo(x1, bottom);
		}
		ctx.closePath();
		ctx.fill();
	}
}

// ─────────────────────────────────────────────────────────────────────────── the lanes' content

/**
 * A lane's L / R badge: white, TE's 20 px square (19.8 design rows; the camera reads 21.2 × 20.7),
 * centred at x 16.2, 5.43 below the lane's top, corners of 2.5.
 */
const BADGE = { x: 6.2, dy: 5.43, w: 20, h: 19.8, radius: 2.5 } as const;

/**
 * The badge's letter: 18.5 px, left at pen x 9.6 (L and R alike, not centred), baseline 17 below
 * the badge's top, in TE's third grey (a thin stroke the camera reads pale; TE's art had it black at
 * 17.5 px).
 */
const BADGE_LETTER = { x: 9.6, baseline: 17, size: 18.5, color: COLORS.grey3 } as const;

function badges(ctx: ScreenCtx): void {
	LANES.tops.forEach((top, i) => {
		const y = top + BADGE.dy;
		fillBox(ctx, BADGE.x, y, BADGE.w, BADGE.h, COLORS.white, BADGE.radius);
		text(
			ctx,
			i === 0 ? 'L' : 'R',
			BADGE_LETTER.x,
			y + BADGE_LETTER.baseline,
			BADGE_LETTER.size,
			BADGE_LETTER.color
		);
	});
}

/** Whether x (a column's middle) is inside the part the sample plays. */
const kept = (x: number, from: number, to: number) => x >= from && x <= to;

/**
 * Fills a run of columns as one stepped outline, symmetric about `mid` and cut at `top` and
 * `bottom` (one shape, so neighbouring columns leave no seams between them).
 */
function columnRun(
	ctx: ScreenCtx,
	x0: number,
	step: number,
	halves: readonly number[],
	mid: number,
	top: number,
	bottom: number,
	color: string
): void {
	if (halves.length === 0) return;
	const up = (h: number) => Math.max(top, mid - h);
	const down = (h: number) => Math.min(bottom, mid + h);
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x0, up(halves[0]));
	halves.forEach((h, i) => {
		ctx.lineTo(x0 + i * step, up(h));
		ctx.lineTo(x0 + (i + 1) * step, up(h));
	});
	for (let i = halves.length - 1; i >= 0; i--) {
		ctx.lineTo(x0 + (i + 1) * step, down(halves[i]));
		ctx.lineTo(x0 + i * step, down(halves[i]));
	}
	ctx.closePath();
	ctx.fill();
}

/**
 * The centre lines and the wave, one column per pixel of the sample, white between `from` and `to`
 * (the start and end markers' x) and tinted outside; the centre lines (a column at rest) carry on
 * through the lanes' margins, tinted.
 */
function waves(
	ctx: ScreenCtx,
	levels: readonly (readonly number[])[],
	gain: number,
	from: number,
	to: number
): void {
	LANES.tops.forEach((top, lane) => {
		const mid = top + LANES.centre;
		const bottom = top + LANES.height;
		const end = SAMPLE_X.x0 + SAMPLE_X.width;
		fillBox(ctx, 0, mid - WAVE.line / 2, SAMPLE_X.x0, WAVE.line, TINT);
		fillBox(ctx, end, mid - WAVE.line / 2, 480 - end, WAVE.line, TINT);
		const columns = levels[lane] ?? [];
		const step = SAMPLE_X.width / Math.max(1, columns.length);
		// runs of one colour: tinted before the start, white to the end, tinted after
		let first = 0;
		while (first < columns.length) {
			const white = kept(SAMPLE_X.x0 + (first + 0.5) * step, from, to);
			let last = first;
			while (
				last + 1 < columns.length &&
				kept(SAMPLE_X.x0 + (last + 1.5) * step, from, to) === white
			) {
				last++;
			}
			const halves = columns.slice(first, last + 1).map((level) => waveHalf(level, gain));
			const x0 = SAMPLE_X.x0 + first * step;
			columnRun(ctx, x0, step, halves, mid, top, bottom, white ? COLORS.white : TINT);
			first = last + 1;
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────── the top row

/** Header text: 20 px on baseline 20.7, the device's figures (its narrow 1). */
const HEADER = { size: 20, baseline: 20.7 } as const;

/** Width of a figure's cell (the font's tabular figures). */
const FIGURE = (screenFont.data.figureAdvance * HEADER.size) / screenFont.data.unitsPerEm;

/**
 * The tune readout: the note, then the sign centred in a figure's cell (the + and the – sit in the
 * same place whatever the value), then the figures from the next cell ("0.00", "16.10": left
 * aligned, the digits within 0.4 px of the device's). `pen` is the sign cell's left; the note's box
 * sits 14.7 px left of it. The drum sampler's pen is x 15.7, the synth sampler's and the
 * multisampler's shift layer's x 116.7 (where the dash is centred at 122.15, as measured).
 */
export function tuneLayout(
	tune: string,
	pen: number
): {
	readonly note: number;
	readonly sign: { readonly ch: string; readonly x: number } | null;
	readonly digits: number;
} {
	const signed = /^[+–-]/.test(tune);
	const ch = signed ? tune[0] : null;
	const sign = ch
		? { ch, x: pen + (FIGURE - screenFont.measure(ch === '-' ? '–' : ch, HEADER.size)) / 2 }
		: null;
	return { note: pen - 14.7, sign, digits: pen + FIGURE };
}

function tune(ctx: ScreenCtx, value: string, pen: number): void {
	const layout = tuneLayout(value, pen);
	drawIcon(ctx, 'sampler.device.note', layout.note, 2, { tint: COLORS.white });
	if (layout.sign) {
		const ch = layout.sign.ch === '-' ? '–' : layout.sign.ch;
		text(ctx, ch, layout.sign.x, HEADER.baseline, HEADER.size, COLORS.white);
	}
	const digits = layout.sign ? value.slice(1) : value;
	figures(ctx, digits, layout.digits, HEADER.baseline, HEADER.size, COLORS.white);
}

/** The drum sampler's play modes, as E4 shows them at the top right. */
const PLAY_ICONS: Readonly<Record<string, string>> = {
	key: 'sampler.device.play.key',
	oneshot: 'sampler.device.play.oneshot',
	'mute group': 'sampler.device.play.group',
	loop: 'sampler.device.play.loop'
};

/** Where the play mode sits: its traced box at (438, 1.75). */
const PLAY_AT = { x: 438, y: 1.75 } as const;

/**
 * The synth sampler's overview of the whole sample on the base layer: a small wave centred at y
 * 12.75 from x 3.4 to 477 (fitted to the lanes' tint boundaries over 11 frames, rms 0.6 px), tinted
 * outside the part that plays. A column is a 1 px line and whole pixels either side of it: 6.3 ×
 * the louder lane's share of full scale, less 0.2 (the camera's heights come in steps of a pixel
 * either side; rms 0.3 px over the frames at rest). The gain scaling it is ours.
 */
const STRIP = { x0: 3.4, width: 473.6, centre: 12.75, scale: 6.3, offset: 0.2 } as const;

/** The overview strip's half-height for a level (sixteenths) at a gain. */
export function stripHalf(level: number, gain: number): number {
	const share = (level / WAVE_LEVELS) * gainFactor(gain);
	return WAVE.line / 2 + Math.min(9, Math.max(0, Math.round(STRIP.scale * share - STRIP.offset)));
}

function overview(
	ctx: ScreenCtx,
	levels: readonly (readonly number[])[],
	gain: number,
	start: number,
	end: number
): void {
	const [left = [], right = []] = levels;
	const count = Math.max(left.length, right.length, 1);
	const step = STRIP.width / count;
	const from = STRIP.x0 + STRIP.width * clamp01(start);
	const to = STRIP.x0 + STRIP.width * clamp01(end);
	const halves = Array.from({ length: count }, (_, c) =>
		stripHalf(Math.max(left[c] ?? 0, right[c] ?? 0), gain)
	);
	const white = (c: number) => kept(STRIP.x0 + (c + 0.5) * step, from, to);
	let first = 0;
	while (first < count) {
		let last = first;
		while (last + 1 < count && white(last + 1) === white(first)) last++;
		const run = halves.slice(first, last + 1);
		const color = white(first) ? COLORS.white : TINT;
		columnRun(ctx, STRIP.x0 + first * step, step, run, STRIP.centre, 0, 24, color);
		first = last + 1;
	}
}

/**
 * The multisampler's keyboard: all 128 notes as 75 white keys 5.9837 px apart, the gap before the
 * first centred at x 16.13 (76 gaps fitted to 0.16 px rms); the gaps are 0.6 px (they dip only to
 * two thirds of white), the keys 20.7 tall from the top. Black keys are 5 px wide and 13.8 tall,
 * centred in the gaps (a pixel of white shows between two). Outside the notes, plain blocks. The
 * played note's zone is lit: its white keys white and its black keys black; everything else is
 * tinted, the black keys darker. The zone lit on the device was C−1…C4, then C#4…C5 and C#5…C6 an
 * octave up each time.
 */
export const KEYBOARD = {
	x0: 16.13,
	pitch: 5.9837,
	gap: 0.6,
	height: 20.7,
	black: { w: 5, h: 13.8 }
} as const;

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

/** A note's key: a white key's left edge, or a black key's centre (the gap's middle). */
export function keyOf(note: number): { black: boolean; x: number } {
	const octave = Math.floor(note / 12);
	const step = ((note % 12) + 12) % 12;
	const white = WHITE_STEPS.indexOf(step as (typeof WHITE_STEPS)[number]);
	if (white >= 0) {
		const gap = KEYBOARD.x0 + KEYBOARD.pitch * (octave * 7 + white);
		return { black: false, x: gap + KEYBOARD.gap / 2 };
	}
	// a black key sits in the gap after the white key below it
	const below = WHITE_STEPS.indexOf((step - 1) as (typeof WHITE_STEPS)[number]);
	return { black: true, x: KEYBOARD.x0 + KEYBOARD.pitch * (octave * 7 + below + 1) };
}

function keyboard(ctx: ScreenCtx, zone: { lo: number; hi: number } | null): void {
	const lit = (note: number) => zone !== null && note >= zone.lo && note <= zone.hi;
	const whiteW = KEYBOARD.pitch - KEYBOARD.gap;
	const first = KEYBOARD.x0 - KEYBOARD.gap / 2;
	const end = KEYBOARD.x0 + KEYBOARD.pitch * 75 + KEYBOARD.gap / 2;
	fillBox(ctx, 0, 0, first, KEYBOARD.height, TINT);
	fillBox(ctx, end, 0, 480 - end, KEYBOARD.height, TINT);
	for (let note = 0; note < 128; note++) {
		const key = keyOf(note);
		if (!key.black)
			fillBox(ctx, key.x, 0, whiteW, KEYBOARD.height, lit(note) ? COLORS.white : TINT);
	}
	for (let note = 0; note < 128; note++) {
		const key = keyOf(note);
		if (!key.black) continue;
		const { w, h } = KEYBOARD.black;
		fillBox(ctx, key.x - w / 2, 0, w, h, lit(note) ? COLORS.black : TINT_DARK);
	}
}

// ─────────────────────────────────────────────────────────────────────────── the shift layer

/**
 * Pan (drum sampler, E2): "L" and "R" in the header's style either side of a dark box 40 × 14.85 at
 * (142.65, 5.62), corners of 2, with a 2.5 px white bar across it at the pan. The bar was seen
 * between x 156 and 173; that the box's middle is the centre and its ends the extremes is ours.
 */
const PAN = {
	l: 124.9,
	r: 187.2,
	x: 142.65,
	y: 5.62,
	w: 40,
	h: 14.85,
	radius: 2,
	bar: 2.5
} as const;

/** The pan bar's centre for a pan −1…1. */
export function panX(pan: number): number {
	const travel = (PAN.w - PAN.bar) / 2;
	return PAN.x + PAN.w / 2 + travel * Math.max(-1, Math.min(1, pan));
}

function panBar(ctx: ScreenCtx, pan: number): void {
	text(ctx, 'L', PAN.l, HEADER.baseline, HEADER.size, COLORS.white);
	text(ctx, 'R', PAN.r, HEADER.baseline, HEADER.size, COLORS.white);
	fillBox(ctx, PAN.x, PAN.y, PAN.w, PAN.h, COLORS.dark, PAN.radius);
	fillBox(ctx, panX(pan) - PAN.bar / 2, PAN.y, PAN.bar, PAN.h, COLORS.white);
}

/**
 * Where the ramp pictogram and its value go: the drum sampler's fade (E3) at x 280.25 with its value
 * from pen x 337.3; the loop crossfade (E3) at x 253 with its percentage from pen x 313.2.
 */
const RAMP_AT = {
	drum: { x: 280.25, y: 1.34, value: 337.3 },
	region: { x: 253, y: 1, value: 313.2 }
} as const;

/** The percent sign's box sits 1 px left of the pen after the figures (b1-2689…2699, "75%"). */
const PERCENT_DX = -1;

function amount(ctx: ScreenCtx, value: string, x: number, percent: boolean): void {
	const width = figures(ctx, value, x, HEADER.baseline, HEADER.size, COLORS.white);
	if (percent)
		drawIcon(ctx, 'sampler.device.percent', x + width + PERCENT_DX, 1, { tint: COLORS.white });
}

/**
 * Gain (E4): a wedge rising to the right, its tip 1.4 px thick at x 425.2 and its right side at
 * 469.5 from y 5.25 to its base at 20.1, white from the tip to the gain and TE's first grey beyond
 * (the camera: 130–139, brighter than the pan box beside it). The white reaches x 425.2 + 44.3 ×
 * the 0–1 gain: 451.8 at 0 dB, where the camera put 451.4–451.7 (b1-2552…2576, 2673…2699).
 */
const GAIN = { x0: 425.2, x1: 469.5, top0: 18.67, top1: 5.25, bottom: 20.1 } as const;

/** Where the gain wedge's white part ends for a 0–1 gain. */
export function gainEdge(gain: number): number {
	return GAIN.x0 + (GAIN.x1 - GAIN.x0) * clamp01(gain);
}

function gainWedge(ctx: ScreenCtx, gain: number): void {
	const wedge = () => {
		ctx.beginPath();
		ctx.moveTo(GAIN.x0, GAIN.bottom);
		ctx.lineTo(GAIN.x0, GAIN.top0);
		ctx.lineTo(GAIN.x1, GAIN.top1);
		ctx.lineTo(GAIN.x1, GAIN.bottom);
		ctx.closePath();
	};
	ctx.save();
	wedge();
	ctx.clip();
	const edge = gainEdge(gain);
	fillBox(ctx, GAIN.x0, 0, edge - GAIN.x0, 24, COLORS.white);
	fillBox(ctx, edge, 0, GAIN.x1 - edge, 24, COLORS.grey1);
	ctx.restore();
}

function shiftLayer(ctx: ScreenCtx, frame: DrumFrame, engine: string): void {
	const direction = frame.reverse ? 'backward' : 'forward';
	drawIcon(ctx, `sampler.device.direction.${direction}`, 1, 1, { tint: COLORS.white });
	if (engine === 'drum') {
		panBar(ctx, frame.pan);
		const at = RAMP_AT.drum;
		drawIcon(ctx, 'sampler.device.ramp', at.x, at.y, { tint: COLORS.white });
		amount(ctx, String(Math.round(clamp01(frame.fade) * 99)), at.value, false);
	} else {
		tune(ctx, frame.tune, 116.7);
		const at = RAMP_AT.region;
		const loop = frame.sampler?.loop;
		drawIcon(ctx, 'sampler.device.ramp', at.x, at.y, { tint: COLORS.white });
		// loop forever carries the ∞ (the multisampler's frames); the plain ramp (the synth
		// sampler's) standing for loop until release, and for loop off, is ours
		if (loop?.type === 'forever')
			drawIcon(ctx, 'sampler.device.forever', 285, 8, { tint: COLORS.black });
		amount(ctx, String(Math.round(clamp01(loop?.crossfade ?? frame.fade) * 99)), at.value, true);
	}
	gainWedge(ctx, frame.gain);
}

// ─────────────────────────────────────────────────────────────────────────── the page

/** Draws the M1 page of a sampler track. */
export function drawDrum(ctx: ScreenCtx, frame: DrumFrame): void {
	const view = frame.sampler;
	const engine = view?.engine ?? 'drum';
	const levels = view?.waves ? view.waves.map((w) => decodeWave(w)) : null;
	const loop = view?.loop ?? null;

	ctx.fillStyle = COLORS.dark;
	for (const top of LANES.tops) {
		ctx.beginPath();
		roundRectPath(ctx, 0, top, 480, LANES.height, LANES.radius);
		ctx.fill();
	}
	if (levels) {
		// the fade and the crossfade under the wave
		if (engine === 'drum') {
			const ramp = fadeRamp(frame.start, frame.fade);
			shadeLanes(ctx, ramp.x0, ramp.x1, true);
		} else if (loop) {
			const wedge = crossfadeWedge(loop.start, loop.end, loop.crossfade);
			shadeLanes(ctx, wedge.x0, wedge.x1, false);
		}
		waves(ctx, levels, frame.gain, sampleX(frame.start), sampleX(frame.end));
		// the points, in encoder order: the drum sampler's start (E2) and end (E3); the others'
		// start, loop start, loop end and end (E1…E4)
		if (engine === 'drum') {
			point(ctx, sampleX(frame.start), 1);
			point(ctx, sampleX(frame.end), 2);
		} else {
			point(ctx, sampleX(frame.start), 0);
			if (loop) {
				point(ctx, sampleX(loop.start), 1);
				point(ctx, sampleX(loop.end), 2);
			}
			point(ctx, sampleX(frame.end), 3);
		}
	}
	badges(ctx);

	if (frame.shift) {
		shiftLayer(ctx, frame, engine);
		return;
	}
	if (engine === 'multisampler') {
		keyboard(ctx, view?.zone ?? null);
		return;
	}
	if (engine === 'sampler') {
		if (levels) overview(ctx, levels, frame.gain, frame.start, frame.end);
		return;
	}
	tune(ctx, frame.tune, 15.7);
	const icon = PLAY_ICONS[frame.playMode];
	if (icon) drawIcon(ctx, icon, PLAY_AT.x, PLAY_AT.y, { tint: COLORS.white });
}
