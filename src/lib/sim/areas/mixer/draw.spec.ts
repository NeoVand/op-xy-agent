import { describe, expect, it } from 'vitest';
import { ICONS } from '../../screen/icons';
import { COLORS, ENCODER_DOTS, RAMP } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { renderFrame } from '../../screen/render';
import type { ScreenFrame } from '../../screen/frame';
import { EQ_HANDLE_X, compressorCurve, eqLift, saturatorWave } from './draw';
import type { MidiCcFrame, MixEqFrame, MixMasterFrame, MixSaturatorFrame } from './frames';

/** Draws a frame into a recording context. */
function record(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

const header = (labels: string[]) => labels.map((label) => ({ label, value: '00' }));
const eq = (bands: [number, number, number], blend: number): MixEqFrame => ({
	page: 'mix-eq',
	header: header(['low', 'mid', 'high', 'blend']),
	bands,
	blend
});
const saturator = (gain: number, clip: number, tone: number, mix: number): MixSaturatorFrame => ({
	page: 'mix-saturator',
	header: header(['gain', 'clip', 'tone', 'mix']),
	gain,
	clip,
	tone,
	mix
});

/** The header's eight 60 × 20 cells. */
const headerCells = (ctx: RecordingContext) =>
	ctx.fills.filter((f) => f.y0 === 0 && f.y1 === 20 && f.x1 - f.x0 === 60);

/** Strokes drawn in a colour and width (hatching, outlines). */
const strokes = (ctx: RecordingContext, color: string, width: number) =>
	ctx.ops.filter((o) => o.op === 'stroke' && o.style === color && o.args[0] === width);

describe('mix M2: the EQ picture', () => {
	it('lifts nothing when flat and follows each band where it acts', () => {
		for (const x of [30.5, 100, 240, 330.5, 450.5]) expect(eqLift([0, 0, 0], x)).toBe(0);
		// a full low boost lifts the left edge by the full 50 px and leaves the top end alone
		expect(eqLift([1, 0, 0], 30.5)).toBeGreaterThan(49);
		expect(eqLift([1, 0, 0], 450.5)).toBeCloseTo(0, 3);
		expect(eqLift([0, -1, 0], EQ_HANDLE_X[1])).toBeCloseTo(-50, 5);
		expect(eqLift([0, 0, 1], 450.5)).toBeGreaterThan(49);
		expect(eqLift([0, 0, 1], 30.5)).toBeCloseTo(0, 3);
	});

	it('draws the header, the filter’s four bands and a handle per band in its encoder’s tone', () => {
		const ctx = record(eq([0.4, -0.3, 0.2], 1));
		expect(headerCells(ctx).map((c) => c.color)).toEqual(RAMP.slice());
		for (const band of [COLORS.panel, COLORS.dark, COLORS.grey1, COLORS.grey4]) {
			expect(
				ctx.fillsOf(band).some((f) => f.y1 === 162.5),
				band
			).toBe(true);
		}
		const handles = [0, 1, 2].map((e) =>
			ctx.fillsOf(ENCODER_DOTS[e]).find((f) => f.x1 - f.x0 === 10 && f.y1 - f.y0 === 10)
		);
		handles.forEach((h, i) => {
			expect(h, `handle ${i}`).toBeDefined();
			expect(((h?.x0 ?? 0) + (h?.x1 ?? 0)) / 2).toBeCloseTo(EQ_HANDLE_X[i], 1);
		});
		// the low handle rides up with the boost, the mid one down with the cut
		expect(handles[0]?.y0 ?? 0).toBeLessThan(95 - 5 - 10);
		expect(handles[1]?.y0 ?? 0).toBeGreaterThan(95 - 5 + 10);
	});

	it('hatches what blend holds back, and nothing at full blend or when flat', () => {
		const hatch = (frame: MixEqFrame) => strokes(record(frame), COLORS.light, 0.56).length;
		expect(hatch(eq([0.4, -0.3, 0.2], 0.5))).toBe(1);
		expect(hatch(eq([0.4, -0.3, 0.2], 1))).toBe(0);
		expect(hatch(eq([0, 0, 0], 0.5))).toBe(0);
	});
});

describe('mix M3: the saturator picture', () => {
	it('shows the clean sine with nothing mixed in, the saturated one with everything', () => {
		const clean = saturatorWave(saturator(0.8, 0.5, 0, 0));
		clean.out.forEach((v, i) => {
			expect(v).toBeCloseTo(Math.sin((4 * Math.PI * i) / (clean.out.length - 1)), 9);
		});
		const full = saturatorWave(saturator(0.8, 0.5, 0, 1));
		full.out.forEach((v, i) => expect(v).toBeCloseTo(full.wet[i], 12));
	});

	it('squares the wave off with gain and cuts it at the ceiling that clip lowers', () => {
		const soft = saturatorWave(saturator(0, 0, 0, 1));
		const hard = saturatorWave(saturator(1, 0.5, 0, 1));
		expect(soft.ceiling).toBe(1);
		expect(hard.ceiling).toBeCloseTo(0.65, 5);
		expect(Math.max(...hard.wet)).toBeCloseTo(hard.ceiling, 5);
		// a quarter period in (x = 105), the driven wave already sits at its ceiling
		expect(hard.wet[105 - 80]).toBeCloseTo(hard.ceiling, 2);
		expect(soft.wet[105 - 80]).toBeLessThan(0.8);
	});

	it('darkens by rounding the corners and brightens by overshooting them, wrapping at the ends', () => {
		const neutral = saturatorWave(saturator(1, 0.5, 0, 1));
		const dark = saturatorWave(saturator(1, 0.5, -1, 1));
		const bright = saturatorWave(saturator(1, 0.5, 1, 1));
		expect(Math.max(...dark.wet)).toBeLessThan(Math.max(...neutral.wet));
		expect(Math.max(...bright.wet)).toBeGreaterThan(neutral.ceiling + 0.05);
		for (const w of [dark.wet, bright.wet]) expect(w[0]).toBeCloseTo(w[w.length - 1], 6);
	});

	it('draws the ceiling rules, the saturated wave in grey and the heard one in white', () => {
		const ctx = record(saturator(0.6, 0.45, -0.2, 0.7));
		expect(headerCells(ctx)).toHaveLength(8);
		expect(strokes(ctx, COLORS.grey2, 1.12)).toHaveLength(1);
		expect(strokes(ctx, COLORS.white, 1.67)).toHaveLength(1);
		expect(strokes(ctx, COLORS.grey1, 1)).toHaveLength(2);
	});
});

describe('mix M4: the master picture', () => {
	const master: MixMasterFrame = {
		page: 'mix-master',
		header: header(['percussion', 'melodic', 'compressor', 'master']),
		values: [1, 0.5, 0.4, 0],
		meters: [1, 0, 0],
		groups: ['1 2', '3 4 5 6 7 8']
	};

	it('compresses above a threshold that more compression lowers, at a steeper ratio', () => {
		const none = compressorCurve(0);
		expect(none.threshold).toBe(1);
		expect(none.output(0.5)).toBe(0.5);
		const full = compressorCurve(1);
		expect(full).toMatchObject({ threshold: expect.closeTo(0.3, 5), ratio: 8 });
		expect(full.output(0.1)).toBe(0.1);
		expect(full.output(1)).toBeCloseTo(0.3 + 0.7 / 8, 5);
		// the soft knee meets both lines
		expect(full.output(0.3 - 0.06)).toBeCloseTo(0.24, 9);
		expect(full.output(0.3 + 0.06)).toBeCloseTo(0.3 + 0.06 / 8, 9);
	});

	it('draws mix M1’s strips with wide bars for the groups and the master, and the output mark', () => {
		const ctx = record(master);
		const strips = ctx.fills.filter((f) => f.y0 === 0 && f.y1 === 220 && f.x1 - f.x0 === 60);
		expect(strips.map((s) => s.color)).toEqual(RAMP.slice());
		// percussion at the top of its travel, 13.36 px thick with full output
		const perc = ctx.fillsOf(COLORS.white).find((f) => f.x0 === 0 && f.x1 === 120);
		expect(perc).toMatchObject({ y0: 25 - 6.68, y1: 25 + 6.68 });
		// melodic halfway, master at the bottom, both thin and black
		const black = ctx.fillsOf(COLORS.black).filter((f) => f.x1 - f.x0 === 120);
		expect(black.map((f) => f.x0)).toEqual([120, 360]);
		expect(black[0].y0).toBeCloseTo(115 - 0.28, 5);
		// the knee's handle and the output mark's black box
		expect(ctx.fillsOf(COLORS.ink).some((f) => f.x1 - f.x0 === 5)).toBe(true);
		expect(ICONS['mixer.output']).toBeDefined();
		expect(ctx.fillsOf('#000000').some((f) => f.x0 === 365 && f.y0 === 182.5)).toBe(true);
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
