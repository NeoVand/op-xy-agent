import { describe, expect, it } from 'vitest';
import { COLORS, ENCODER_DOTS, RAMP } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { renderFrame } from '../../screen/render';
import type { ScreenFrame } from '../../screen/frame';
import { compressorHeight, needleAngle } from './draw';
import { KNOB_TRAVEL, floorPoint } from './eq';
import type {
	MidiCcFrame,
	MixEqFrame,
	MixMasterFrame,
	MixSaturatorFrame,
	MixSendsFrame
} from './frames';

/** Draws a frame into a recording context. */
function record(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

const header = (labels: string[], value = '00') => labels.map((label) => ({ label, value }));
const eq = (tilts: [number, number, number], knob: number): MixEqFrame => ({
	page: 'mix-eq',
	header: header(['low', 'mid', 'high', 'blend']),
	bands: [0, 0, 0],
	blend: 0.5,
	tilts,
	knob
});
const saturator = (gain: number, clip: number, tone: number, mix: number): MixSaturatorFrame => ({
	page: 'mix-saturator',
	header: header(['gain', 'clip', 'tone', 'mix']),
	gain,
	clip,
	tone,
	mix
});

/** Strokes drawn in a colour and width (hatching, outlines). */
const strokes = (ctx: RecordingContext, color: string, width: number) =>
	ctx.ops.filter((o) => o.op === 'stroke' && o.style === color && o.args[0] === width);

describe('mix M1: the FX send popup', () => {
	const popup = (selected: number, sends: [number, number], muted = false): MixSendsFrame => ({
		page: 'mix-sends',
		base: {
			page: 'mix',
			bank: 'instrument',
			selected,
			strips: Array.from({ length: 8 }, (_, i) => ({
				level: 0.75,
				pan: 0.5,
				muted: muted && i === selected,
				meter: 0
			}))
		},
		sends
	});
	/** What was painted in strip `i` after it was cleared to its grey (the popup's own marks). */
	const overStrip = (ctx: RecordingContext, i: number) => {
		const cleared = ctx.fills.findLastIndex(
			(f) => f.x0 === i * 60 && f.x1 === i * 60 + 60 && f.y0 === 0 && f.y1 === 220
		);
		return ctx.fills.slice(cleared + 1).filter((f) => f.x0 >= i * 60 && f.x1 <= i * 60 + 60);
	};

	it('swaps the strip’s number, level bar and pan dot for two boxed numerals over two send bars', () => {
		const ctx = record(popup(2, [0.5, 0]));
		const marks = overStrip(ctx, 2);
		// FX I halfway up the left half, FX II its 5 px stub on the right, as ink over the grey
		expect(marks).toContainEqual({
			color: '#121214',
			alpha: 1,
			x0: 120,
			y0: 122.5,
			x1: 150,
			y1: 220
		});
		expect(marks).toContainEqual({
			color: '#2f2f34',
			alpha: 1,
			x0: 150,
			y0: 215,
			x1: 180,
			y1: 220
		});
		// "I" and "II": three black strokes of 10 px text between y 10 and 17, in their boxes
		const glyphs = marks.filter((f) => f.color === COLORS.black);
		expect(glyphs).toHaveLength(3);
		for (const g of glyphs) expect([g.y0, g.y1].map(Math.round)).toEqual([10, 17]);
		expect(glyphs.filter((g) => g.x1 <= 150)).toHaveLength(1);
		expect(strokes(ctx, COLORS.black, 1)).toHaveLength(2);
		// nothing of the level bar or the dot is left
		expect(marks.filter((f) => f.x1 - f.x0 === 60 || f.y1 - f.y0 === 10)).toEqual([]);
		// the other strips are the core's: T4's black level bar is still there
		expect(ctx.fillsOf(COLORS.black).some((f) => f.x0 === 180 && f.x1 === 240)).toBe(true);
	});

	it('runs a full send up to y 30 and keeps a muted strip hatched', () => {
		const ctx = record(popup(5, [1, 1], true));
		const bars = overStrip(ctx, 5).filter((f) => f.y1 === 220);
		expect(bars.map((b) => [b.x0, b.y0])).toEqual([
			[300, 30],
			[330, 30]
		]);
		expect(strokes(ctx, COLORS.ink, 0.5)).toHaveLength(2); // the core's hatching, then ours
	});

	it('draws in white ink on the two darkest strips', () => {
		const ctx = record(popup(0, [0.2, 0.2]));
		expect(strokes(ctx, COLORS.white, 1)).toHaveLength(2);
		const [fx1, fx2] = overStrip(ctx, 0).filter((f) => f.y1 === 220);
		expect([fx1.color, fx2.color]).toEqual(['#b9b8b8', '#565656']);
	});
});

describe('mix M2: the EQ scene', () => {
	const size = (f: { x0: number; x1: number; y0: number; y1: number }) => [
		f.x1 - f.x0,
		f.y1 - f.y0
	];

	it('paints the floor, its lines, the slot, the shadows, the panels back to front and the knob', () => {
		const ctx = record(eq([0.5, 0.5, 0.5], 0));
		// after the screen's black, the floor fills it light grey
		expect(ctx.fills[1]).toMatchObject({ color: RAMP[6], x0: 0, y0: 0, x1: 480, y1: 220 });
		// two low panels, the tray and four mid panels, eight high panels and the knob
		expect(ctx.fillsOf(RAMP[2])).toHaveLength(2);
		expect(ctx.fillsOf(RAMP[4])).toHaveLength(5);
		expect(ctx.fillsOf(COLORS.white)).toHaveLength(9);
		// the screen's clear, the groove and fourteen footprints left black
		expect(ctx.fillsOf(COLORS.black)).toHaveLength(16);
		// one path for the floor's lines, fourteen panel edges, the knob's outline and rim
		expect(strokes(ctx, COLORS.ink, 0.75)).toHaveLength(17);
		expect(strokes(ctx, COLORS.ink, 1)).toHaveLength(1); // the "N"
		// every panel comes after every shadow
		const fills = ctx.ops.filter((o) => o.op === 'fill');
		const lastShadow = fills.map((o) => o.style).lastIndexOf(COLORS.black);
		const firstPanel = fills.findIndex((o) => o.style === RAMP[2]);
		expect(lastShadow).toBeLessThan(firstPanel);
	});

	it('lays a flat row exactly over its black footprint and leans a steep one up off it', () => {
		const ctx = record(eq([0, 1, 0.5], 0));
		const low = ctx.fillsOf(RAMP[2]);
		const black = ctx.fillsOf(COLORS.black).slice(2);
		for (const panel of low) expect(black).toContainEqual({ ...panel, color: COLORS.black });
		// a mid panel at 60° stands 34 px above its hinge
		const mid = ctx.fillsOf(RAMP[4]).slice(1);
		const [, hingeY] = floorPoint(4, 16);
		expect(mid[mid.length - 1].y0).toBeCloseTo(
			hingeY - 10 * 2 * 0.5 - 2 * Math.sin(Math.PI / 3) * 19.8,
			1
		);
	});

	it('stands the knob at the "N" end at rest and slides it down the groove to its stop', () => {
		const knob = (travel: number) => {
			const f = record(eq([0.5, 0.5, 0.5], travel))
				.fillsOf(COLORS.white)
				.at(-1);
			expect(size(f ?? { x0: 0, x1: 0, y0: 0, y1: 0 })[0]).toBeCloseTo(8, 1);
			return ((f?.x0 ?? 0) + (f?.x1 ?? 0)) / 2;
		};
		expect(knob(0)).toBeCloseTo(floorPoint(7.5, KNOB_TRAVEL.rest)[0], 1);
		expect(knob(1)).toBeCloseTo(floorPoint(7.5, KNOB_TRAVEL.end)[0], 1);
	});
});

describe('mix M3: the saturator ladders', () => {
	/** The cap fills (50 px wide) in encoder order. */
	const caps = (ctx: RecordingContext) => ctx.fills.filter((f) => f.x1 - f.x0 === 50);

	it('draws four ladders of 43 ticks, the labels in white and a cap per encoder', () => {
		const ctx = record(saturator(20 / 99, 20 / 99, 0, 0));
		const ticks = ctx.fillsOf(RAMP[3]);
		expect(ticks).toHaveLength(4 * 43);
		expect(ticks.filter((t) => t.x0 === 50 && t.x1 === 70)).toHaveLength(43);
		expect(ticks[0].y0).toBeCloseTo(110 - 21 * 4.976 - 1, 1);
		// white label glyphs at each column's top left
		const labels = ctx.fillsOf(COLORS.white).filter((f) => f.y1 < 21);
		expect(new Set(labels.map((f) => Math.floor((f.x0 + 1) / 120)))).toEqual(new Set([0, 1, 2, 3]));
		// E1 black inside a light grey edge, E2 mid grey, E3 light grey, E4 white
		const [e1, e2, e3, e4] = caps(ctx);
		expect([e1.color, e2.color, e3.color, e4.color]).toEqual([
			COLORS.black,
			ENCODER_DOTS[1],
			ENCODER_DOTS[2],
			COLORS.white
		]);
		expect(strokes(ctx, ENCODER_DOTS[2], 2)).toHaveLength(2); // E1's edge and grip
		expect(strokes(ctx, COLORS.black, 1)).toHaveLength(3); // the other caps' grips
		// gain and clip at 20 sit 40 px up from the bottom, tone at neutral in the middle, mix at 0 on the floor
		expect((e1.y0 + e1.y1) / 2).toBeCloseTo(210 - (200 * 20) / 99, 1);
		expect((e2.y0 + e2.y1) / 2).toBeCloseTo(210 - (200 * 20) / 99, 1);
		expect((e3.y0 + e3.y1) / 2).toBeCloseTo(110, 1);
		expect([e4.y0, e4.y1]).toEqual([200, 220]);
	});

	it('runs the caps over the whole height, tone from darkest at the foot to brightest at the top', () => {
		const top = caps(record(saturator(1, 0, 1, 1)));
		expect(top.map((c) => c.y0)).toEqual([0, 200, 0, 0]);
		expect(caps(record(saturator(0, 0, -1, 0)))[2].y1).toBe(220);
	});
});

describe('mix M4: the master page', () => {
	const master = (compressor: number, output: number): MixMasterFrame => ({
		page: 'mix-master',
		header: [
			{ label: 'percussion', value: '64' },
			{ label: 'melodic', value: '66' },
			{ label: 'compressor', value: '32' },
			{ label: 'master', value: '50' }
		],
		values: [64 / 99, 66 / 99, compressor, 50 / 99],
		meters: [0, 0, output],
		groups: ['1 2', '3 4 5 6 7 8']
	});

	it('draws the two strips, the compressor’s bar rising from the divider and the VU meter', () => {
		const ctx = record(master(32 / 99, 0));
		const strips = ctx.fillsOf(COLORS.white).filter((f) => f.y0 === 0 && f.y1 === 220);
		expect(strips.map((f) => [f.x0, f.x1])).toEqual([
			[229, 239.75],
			[240.25, 251]
		]);
		const bar = ctx.fillsOf(COLORS.dark).find((f) => f.x0 === 242.75);
		expect(bar?.y1).toBe(109.5);
		expect(109.5 - (bar?.y0 ?? 0)).toBeCloseTo(compressorHeight(32 / 99), 1);
		expect(strokes(ctx, COLORS.grey1, 1)).toHaveLength(1); // the divider
		expect(strokes(ctx, COLORS.white, 1.5)).toHaveLength(1); // scale line and ticks
		expect(strokes(ctx, COLORS.white, 3)).toHaveLength(1); // the needle
		expect(ctx.fillsOf(RAMP[4])).toHaveLength(1); // the dot past +3
		// the needle rests on −20: its tip is the last point before its 3 px stroke
		const stroke = ctx.ops.findIndex((o) => o.op === 'stroke' && o.args[0] === 3);
		const tip = ctx.ops.slice(0, stroke).findLast((o) => o.op === 'lineTo');
		expect(tip?.args[0]).toBeCloseTo(359.67 + 111 * Math.sin((-35.5 * Math.PI) / 180), 1);
	});

	it('swings the needle from −20 at rest through 0 to +3 at full output', () => {
		expect(needleAngle(0)).toBe(-35.5);
		expect(needleAngle(10 ** (-3 / 20))).toBeCloseTo(15.56, 6); // 0 dB, where the band starts
		expect(needleAngle(10 ** (-8 / 20))).toBeCloseTo(-5.16, 6); // −5 dB
		expect(needleAngle(1)).toBe(36.7);
		expect(needleAngle(0.01)).toBe(-35.5);
	});

	it('grows the compressor’s bar from a pixel at 10 to 40 px at the top', () => {
		expect(compressorHeight(0)).toBe(0);
		expect(compressorHeight(10 / 99)).toBeCloseTo(1.28, 2);
		expect(compressorHeight(1)).toBe(40);
	});
});

describe('midi engine: the CC pages', () => {
	const cc = (slots: MidiCcFrame['slots']): MidiCcFrame => ({
		page: 'midi-engine-cc',
		set: 1,
		shift: false,
		slots
	});

	it('draws the midi M1 page’s row of boxes, crossing the off ones like its bank', () => {
		const ctx = record(
			cc([
				{ label: 'cc 74', value: '64' },
				{ label: 'cc 71', value: '20' },
				{ label: 'off', value: null },
				{ label: 'cc 1', value: '127' }
			])
		);
		const box = (x: number, color: string) =>
			ctx.fillsOf(color).find((f) => f.x0 === x && f.y0 === 80 && f.x1 === x + 65 && f.y1 === 145);
		expect(box(175, COLORS.dark)).toBeDefined();
		expect(box(240, COLORS.grey4)).toBeDefined(); // the "none" box, recoloured
		expect(box(305, COLORS.white)).toBeDefined();
		const cross = ctx.ops.filter((o) => o.op === 'stroke' && o.style === COLORS.black);
		expect(cross).toHaveLength(2);
	});

	it('gives an off first slot a grey cross and edge on the black', () => {
		const ctx = record(
			cc([{ label: 'off', value: null }, ...Array(3).fill({ label: 'off', value: null })])
		);
		const grey = ctx.ops.filter((o) => o.op === 'stroke' && o.style === COLORS.grey1);
		expect(grey).toHaveLength(3);
	});
});
