/**
 * Drawing the mixer area's frames on the 480 × 220 screen (see `../../screen/areas.ts`), with a
 * short spoken description of each for screen readers.
 *
 * TE's guide has no picture of any of these pages, so every layout here is ours, put together from
 * the primitives of TE's other pages (research 55 §5) so that they read as the same device:
 * - mix M2–M4 carry the engine pages' header (eight ramp cells; each encoder's label and value in its
 *   tone) over a picture: the EQ as a response on the filter page's frequency axis and bands (guide
 *   art instrument-032), the saturator as a sine wave through it, and the master as mix M1's strips
 *   (mix-003) with wide bars for the groups and the master and a compressor curve;
 * - the midi engine's CC pages keep the midi M1 page's row of 65 px boxes, 10 px labels and 40 px
 *   numbers (synth-engines-034) and are titled set I and set II, TE's names for the same pages on the
 *   external midi track (auxiliary-031).
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { disc, fillBox, header, line, strokeBox, text, type HeaderCell } from '../../screen/draw';
import { drawIcon } from '../../screen/icons';
import { freqToX } from '../../screen/pages/filter';
import { COLORS, ENCODER_DOTS, RAMP } from '../../screen/palette';
import type {
	MidiCcFrame,
	MixEqFrame,
	MixMasterFrame,
	MixSaturatorFrame,
	MixerFrame
} from './frames';

const unit = (v: number) => Math.max(0, Math.min(1, v));
const bipolar = (v: number) => Math.max(-1, Math.min(1, v));

// ─────────────────────────────────────────────────────────────────────────── mix M2: EQ

/** The filter page's axis and floor: the EQ is drawn over the same frequencies. */
const AXIS_LEFT = 30.5;
const AXIS_RIGHT = 450.5;
const FLOOR = 162.5;
/** The filter's bands, dark to light across the spectrum, split at 1K, 2K and 5K. */
const BANDS = [
	{ x0: 30.5, x1: 160.5, color: COLORS.panel },
	{ x0: 160.5, x1: 245.5, color: COLORS.dark },
	{ x0: 245.5, x1: 330.5, color: COLORS.grey1 },
	{ x0: 330.5, x1: 450.5, color: COLORS.grey4 }
] as const;
/** The flat response's level, and how far a full boost or cut lifts or drops it. */
const FLAT = 95;
const EQ_DEPTH = 50;
/**
 * Where the bands act (ours: TE does not say): a low shelf turning at 200 Hz, a mid bell at 1.8 kHz,
 * a high shelf turning at 9 kHz; widths in pixels of the axis.
 */
const LOW_X = freqToX(200);
const MID_X = freqToX(1800);
const HIGH_X = freqToX(9000);
const SHELF_WIDTH = 14;
const BELL_WIDTH = 45;
/** Where each band's handle sits on the set response: well inside each shelf, on the bell's top. */
export const EQ_HANDLE_X = [60, MID_X, 420] as const;

/** The EQ's lift in pixels (up is +) at `x` for band settings −1…1 (low, mid, high). */
export function eqLift(bands: readonly number[], x: number): number {
	const [low = 0, mid = 0, high = 0] = bands;
	const lowShelf = 1 / (1 + Math.exp((x - LOW_X) / SHELF_WIDTH));
	const highShelf = 1 / (1 + Math.exp((HIGH_X - x) / SHELF_WIDTH));
	const bell = Math.exp(-(((x - MID_X) / BELL_WIDTH) ** 2));
	return EQ_DEPTH * (low * lowShelf + mid * bell + high * highShelf);
}

/** Adds the area under the response, lifted by `amount` of the bands, down to the floor. */
function traceEq(ctx: ScreenCtx, bands: readonly number[], amount: number): void {
	ctx.moveTo(AXIS_LEFT, FLOOR);
	for (let x = AXIS_LEFT; x <= AXIS_RIGHT + 0.01; x += 2) {
		ctx.lineTo(x, FLAT - amount * eqLift(bands, x));
	}
	ctx.lineTo(AXIS_RIGHT, FLOOR);
	ctx.closePath();
}

/** A band's handle: a 10 px dot in its encoder's tone, ringed white so the dark one shows. */
function bandHandle(ctx: ScreenCtx, x: number, y: number, encoder: 0 | 1 | 2): void {
	disc(ctx, x, y, 6, COLORS.white);
	disc(ctx, x, y, 5, ENCODER_DOTS[encoder]);
}

/** The filter page's axis labels. */
function axisLabels(ctx: ScreenCtx): void {
	text(ctx, '50', AXIS_LEFT, 172.5, 10, COLORS.light);
	text(ctx, '1K', 160.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '2K', 245.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '5K', 330.5, 172.5, 10, COLORS.light, 'center');
	text(ctx, '20kHz', AXIS_RIGHT, 172.5, 10, COLORS.light, 'right');
}

/**
 * Mix M2: what the master hears is filled in the filter's bands (blend × the band settings); the
 * part blend still holds back is hatched up to the set response, where a handle per band sits; a
 * dark rule marks flat under a cut.
 */
function drawEq(ctx: ScreenCtx, frame: MixEqFrame): void {
	const bands = frame.bands.map(bipolar);
	const blend = unit(frame.blend);
	ctx.save();
	ctx.beginPath();
	ctx.rect(AXIS_LEFT, 20, AXIS_RIGHT - AXIS_LEFT, FLOOR - 20);
	ctx.clip();
	line(ctx, AXIS_LEFT, FLAT, AXIS_RIGHT, FLAT, COLORS.grey1, 1);

	ctx.save();
	ctx.beginPath();
	traceEq(ctx, bands, blend);
	ctx.clip();
	for (const band of BANDS) fillBox(ctx, band.x0, 20, band.x1 - band.x0, FLOOR - 20, band.color);
	for (const band of BANDS.slice(1)) line(ctx, band.x0, 20, band.x0, FLOOR, COLORS.black, 1.59);
	ctx.restore();

	// hatched between what is heard and the set response, like the filter's envelope sweep; drawn
	// over the fill so a cut's share shows too
	if (blend < 0.995 && bands.some((b) => Math.abs(b) > 0.001)) {
		ctx.save();
		ctx.beginPath();
		traceEq(ctx, bands, blend);
		traceEq(ctx, bands, 1);
		ctx.clip('evenodd');
		ctx.strokeStyle = COLORS.light;
		ctx.lineWidth = 0.56;
		ctx.beginPath();
		for (let d = AXIS_LEFT - 145; d < AXIS_RIGHT + 5; d += 5) {
			ctx.moveTo(d, FLOOR);
			ctx.lineTo(d + 145, FLOOR - 145);
		}
		ctx.stroke();
		ctx.restore();
	}
	ctx.strokeStyle = COLORS.black;
	ctx.lineWidth = 1.59;
	ctx.beginPath();
	traceEq(ctx, bands, blend);
	ctx.stroke();
	ctx.restore();

	EQ_HANDLE_X.forEach((x, i) => bandHandle(ctx, x, FLAT - eqLift(bands, x), i as 0 | 1 | 2));
	axisLabels(ctx);
	header(ctx, frame.header);
}

// ─────────────────────────────────────────────────────────────────────────── mix M3: saturator

/** Two periods of a sine across the filter's width, centred under the header. */
const WAVE_LEFT = 30;
const WAVE_RIGHT = 450;
const WAVE_MID = 120;
const WAVE_AMP = 70;

/**
 * Zero-phase smoothing over about `width` samples (a one-pole filter run both ways) of a signal
 * whose last sample repeats its first (whole periods): it wraps around, so the ends match.
 */
function smooth(values: readonly number[], width: number): number[] {
	const a = 1 / (1 + Math.max(0, width));
	const period = values.length - 1;
	const at = (i: number) => values[((i % period) + period) % period];
	const ext = Array.from({ length: values.length + 2 * period }, (_, i) => at(i - period));
	for (let i = 1; i < ext.length; i++) ext[i] = ext[i - 1] + a * (ext[i] - ext[i - 1]);
	for (let i = ext.length - 2; i >= 0; i--) ext[i] = ext[i + 1] + a * (ext[i] - ext[i + 1]);
	return ext.slice(period, period + values.length);
}

/**
 * The saturator's picture, one sample (−1…1) per pixel column (ours): the sine is driven through a
 * soft curve (gain squares it off), cut flat at the ceiling (clip), then darkened (smoothed) or
 * brightened (edges sharpened) by tone; what is heard mixes the dry sine with that by `mix`.
 */
export function saturatorWave(frame: Pick<MixSaturatorFrame, 'gain' | 'clip' | 'tone' | 'mix'>): {
	wet: number[];
	out: number[];
	ceiling: number;
} {
	const n = WAVE_RIGHT - WAVE_LEFT + 1;
	const drive = 0.3 + 4.7 * unit(frame.gain);
	const ceiling = 1 - 0.7 * unit(frame.clip);
	const dry = Array.from({ length: n }, (_, i) => Math.sin((4 * Math.PI * i) / (n - 1)));
	const shaped = dry.map((v) =>
		Math.max(-ceiling, Math.min(ceiling, Math.tanh(drive * v) / Math.tanh(drive)))
	);
	const tone = bipolar(frame.tone);
	let wet = shaped;
	if (tone < 0) wet = smooth(shaped, -tone * 12);
	else if (tone > 0) {
		// less low end: the flat tops droop and the edges overshoot, as through a high-pass
		const soft = smooth(shaped, 6);
		wet = shaped.map((v, i) => v + 0.8 * tone * (v - soft[i]));
	}
	const mix = unit(frame.mix);
	return { wet, out: dry.map((v, i) => v + mix * (wet[i] - v)), ceiling };
}

/** A curve through one sample per pixel column. */
function wave(ctx: ScreenCtx, samples: readonly number[], color: string, width: number): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineJoin = 'round';
	ctx.beginPath();
	samples.forEach((v, i) => {
		const y = WAVE_MID - Math.max(-1.3, Math.min(1.3, v)) * WAVE_AMP;
		if (i === 0) ctx.moveTo(WAVE_LEFT + i, y);
		else ctx.lineTo(WAVE_LEFT + i, y);
	});
	ctx.stroke();
}

/**
 * Mix M3: the clip ceiling as two rules, the fully saturated signal in grey and what the master hears
 * in white; with mix at 0 the white line is the clean sine, and it meets the grey one as mix rises.
 */
function drawSaturator(ctx: ScreenCtx, frame: MixSaturatorFrame): void {
	const { wet, out, ceiling } = saturatorWave(frame);
	line(ctx, WAVE_LEFT, WAVE_MID, WAVE_RIGHT, WAVE_MID, COLORS.dark, 1);
	for (const c of [ceiling, -ceiling]) {
		const y = WAVE_MID - c * WAVE_AMP;
		line(ctx, WAVE_LEFT, y, WAVE_RIGHT, y, COLORS.grey1, 1);
	}
	wave(ctx, wet, COLORS.grey2, 1.12);
	wave(ctx, out, COLORS.white, 1.67);
	header(ctx, frame.header);
}

// ─────────────────────────────────────────────────────────────────────────── mix M4: master

/** Top and bottom of a level's travel (mix M1's). */
const LEVEL_TOP = 25;
const LEVEL_BOTTOM = 205;

/** Mix M1's level bar: its height is the level, its thickness the momentary output. */
function levelBar(
	ctx: ScreenCtx,
	x: number,
	width: number,
	level: number,
	meter: number,
	color: string
): void {
	const y = LEVEL_BOTTOM - (LEVEL_BOTTOM - LEVEL_TOP) * unit(level);
	const thickness = 0.56 + 12.8 * unit(meter);
	fillBox(ctx, x, y - thickness / 2, width, thickness, color);
}

/**
 * The compressor as a transfer curve (ours): the output follows the input up to the threshold and
 * rises 1/ratio as steeply above it, with a soft knee. More compression lowers the threshold (to 30 %
 * of the range) and raises the ratio (to 8:1).
 */
export function compressorCurve(amount: number): {
	threshold: number;
	ratio: number;
	output: (input: number) => number;
} {
	const a = unit(amount);
	const threshold = 1 - 0.7 * a;
	const ratio = 1 + 7 * a;
	const knee = 0.12;
	const output = (v: number) => {
		if (v <= threshold - knee / 2) return v;
		if (v >= threshold + knee / 2) return threshold + (v - threshold) / ratio;
		const d = v - threshold + knee / 2;
		return v + ((1 / ratio - 1) * d * d) / (2 * knee);
	};
	return { threshold, ratio, output };
}

/** Draws the compressor curve in a `size` square with its top-left at (x, y), a handle at the knee. */
function drawCompressor(ctx: ScreenCtx, x: number, y: number, size: number, amount: number): void {
	const { threshold, output } = compressorCurve(amount);
	const px = (v: number) => x + v * size;
	const py = (v: number) => y + size - v * size;
	line(ctx, px(0), py(0), px(1), py(1), COLORS.grey1, 1);
	ctx.strokeStyle = COLORS.black;
	ctx.lineWidth = 1.59;
	ctx.lineJoin = 'round';
	ctx.beginPath();
	for (let i = 0; i <= 60; i++) {
		const v = i / 60;
		if (i === 0) ctx.moveTo(px(v), py(output(v)));
		else ctx.lineTo(px(v), py(output(v)));
	}
	ctx.stroke();
	if (threshold < 1)
		fillBox(ctx, px(threshold) - 2.5, py(output(threshold)) - 2.5, 5, 5, COLORS.ink, 1);
}

/**
 * Mix M4 on mix M1's eight strips: the percussion and melodic groups and the master as bars two
 * strips wide (white on the darkest pair, black after, as on M1), the compressor as its curve; at
 * the foot, the tracks each group gathers and, under the master, the external audio page's output
 * mark (auxiliary-064).
 */
function drawMaster(ctx: ScreenCtx, frame: MixMasterFrame): void {
	for (let i = 0; i < 8; i++) fillBox(ctx, i * 60, 0, 60, 220, RAMP[i]);
	const [percussion, melodic, compressor, level] = frame.values;
	levelBar(ctx, 0, 120, percussion, frame.meters[0], COLORS.white);
	levelBar(ctx, 120, 120, melodic, frame.meters[1], COLORS.black);
	drawCompressor(ctx, 255, 75, 90, compressor);
	levelBar(ctx, 360, 120, level, frame.meters[2], COLORS.black);
	text(ctx, frame.groups[0], 5, 212.5, 10, COLORS.white);
	text(ctx, frame.groups[1], 125, 212.5, 10, COLORS.white);
	drawIcon(ctx, 'mixer.output', 365, 182.5);
	header(ctx, frame.header);
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

export const drawers: AreaDrawers<MixerFrame> = {
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
