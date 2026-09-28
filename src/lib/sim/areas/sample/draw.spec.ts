import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import type { ScreenFrame } from '../../screen/frame';
import { TINT } from '../../screen/pages/drum';
import { COLORS } from '../../screen/palette';
import { scenarios } from './scenarios';

/** The frame of scenario `id`. */
function scenario(id: string): ScreenFrame {
	const s = SCENARIOS.find((x) => x.id === id);
	if (!s) throw new Error(`no scenario ${id}`);
	const sim = new OpxySim({ now: () => 0 });
	s.setup(sim);
	return sim.frame;
}

function draw(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

describe('the record page (sample-003, 004, 017, 100)', () => {
	it('draws the white card, the meter, the record dot on M1 and the timer box', () => {
		const ctx = draw(scenario('sample-drum-record'));
		const white = ctx.fillsOf(COLORS.white);
		expect(white.some((f) => near(f.x0, 62.51) && near(f.x1, 417.51) && near(f.y1, 145))).toBe(
			true
		);
		expect(white.some((f) => near(f.x0, 445) && near(f.y0, 60) && near(f.y1, 190))).toBe(true);
		const dots = ctx.fillsOf(COLORS.record);
		expect(dots.some((f) => near(f.x0, 32.5) && near(f.y0, 200))).toBe(true);
		expect(dots.some((f) => near(f.x0, 205) && near(f.y0, 30))).toBe(true);
		// ink waveform columns on the card, 2.07 px wide
		const ink = ctx.fillsOf(COLORS.ink).filter((f) => near(f.x1 - f.x0, 2.07, 0.01));
		expect(ink.length).toBeGreaterThan(40);
		// the threshold line in orange
		expect(ctx.ops.some((o) => o.op === 'stroke' && o.style === COLORS.record)).toBe(true);
	});

	it('draws the prompts and no timer where TE shows them', () => {
		const file = draw(scenario('sample-file'));
		expect(file.fillsOf(COLORS.record).some((f) => near(f.x0, 187.5) && near(f.y0, 30))).toBe(true);
		// the play key is dim until there is a take
		expect(file.fillsOf(COLORS.grey1).some((f) => f.x0 > 167 && f.x1 < 183 && f.y0 > 199)).toBe(
			true
		);
		const synth = draw(scenario('sample-key'));
		expect(synth.fillsOf(COLORS.record)).toHaveLength(0);
	});

	it('draws the multisampler keyboard with the playable keys light and the zone band', () => {
		const ctx = draw(scenario('sample-multi-record'));
		const keys = ctx.fills.filter((f) => near(f.y0, 160.5) && near(f.y1, 178.5));
		expect(keys).toHaveLength(75);
		expect(keys.filter((k) => k.color === COLORS.light)).toHaveLength(13);
		expect(keys.filter((k) => k.color === COLORS.white)).toHaveLength(1);
		expect(ctx.fillsOf(COLORS.grey2).some((f) => near(f.x0, 242.57, 1) && near(f.y0, 152.7))).toBe(
			true
		);
	});
});

describe('the slicer (sample-076 … 094)', () => {
	it('draws a marker with two handles per slice point, white up to the playhead', () => {
		const ctx = draw(scenario('sample-even'));
		const handles = ctx
			.fillsOf(COLORS.grey3)
			.filter((f) => near(f.x1 - f.x0, 10) && near(f.y1 - f.y0, 5));
		expect(handles).toHaveLength(20);
		const cols = ctx.fills.filter((f) => near(f.x1 - f.x0, 6.21, 0.02));
		const white = cols.filter((c) => c.color === COLORS.white);
		const grey = cols.filter((c) => c.color === COLORS.grey1);
		expect(Math.max(...white.map((c) => c.x1))).toBeLessThan(106);
		expect(Math.min(...grey.map((c) => c.x0))).toBeGreaterThan(99);
	});

	it('labels tap on M1 only in tap mode', () => {
		const tap = draw(scenario('sample-tap'));
		const even = draw(scenario('sample-even'));
		const soft = (ctx: RecordingContext) =>
			ctx.fillsOf(COLORS.light).filter((f) => f.x1 < 80 && f.y0 > 195).length;
		expect(soft(tap)).toBeGreaterThan(0);
		expect(soft(even)).toBe(0);
	});
});

describe('the library (sample-132, 140)', () => {
	it('outlines the open folder, fills the selected sample and draws the tile', () => {
		const ctx = draw(scenario('sample-library'));
		expect(
			ctx.fillsOf(COLORS.white).some((f) => near(f.x0, 295) && near(f.y0, 60) && near(f.x1, 460))
		).toBe(true);
		expect(ctx.fillsOf(COLORS.white).some((f) => near(f.x0, 10) && near(f.y0, 20.61))).toBe(true);
		const outline = ctx.ops.filter((o) => o.op === 'stroke' && o.args[0] === 0.56);
		expect(outline.length).toBeGreaterThanOrEqual(3);
		// the selected sample's name is black on the white row
		expect(ctx.fillsOf(COLORS.black).some((f) => f.x0 > 299 && f.y1 < 80 && f.y0 > 60)).toBe(true);
	});
});

describe('the sampler M1 pages as the device draws them (screen/pages/drum.spec.ts measures them)', () => {
	/** Handles (10 × 5) of one shade, by their centre x. */
	const handles = (ctx: RecordingContext, shade: string) =>
		ctx
			.fillsOf(shade)
			.filter((f) => near(f.x1 - f.x0, 10, 0.01) && near(f.y1 - f.y0, 5, 0.01))
			.map((f) => Math.round((f.x0 + f.x1) * 50) / 100);

	it('draws the synth sampler’s whole sample small on top, and no root badge', () => {
		const ctx = draw(scenario('sampler'));
		// the overview strip around y 12.75: white from the start to the end, tinted outside
		const strip = (color: string) => ctx.fillsOf(color).filter((f) => f.y0 < 12.5 && f.y1 < 24);
		expect(strip(COLORS.white)).toHaveLength(1);
		expect(strip(TINT)).toHaveLength(2);
		expect(ctx.fillsOf('#484850').some((f) => near(f.x0, 440) && near(f.y0, 5))).toBe(false);
		// start, loop start, loop end and end in E1…E4's shades, three handles each
		expect(new Set(handles(ctx, COLORS.dark)).size).toBe(1);
		expect(handles(ctx, COLORS.dark)).toHaveLength(3);
		expect(handles(ctx, COLORS.white)).toHaveLength(3);
	});

	it('draws the multisampler’s keyboard with the selected zone lit', () => {
		const ctx = draw(scenario('sample-multi'));
		const keys = ctx.fills.filter((f) => f.y0 === 0 && near(f.y1, 20.7) && near(f.x1 - f.x0, 5.38));
		expect(keys).toHaveLength(75);
		// the first key an octave up plays F4, in the zone F4…C6: 12 white keys
		expect(keys.filter((c) => c.color === COLORS.white)).toHaveLength(12);
	});

	it('draws the loop points with E2 and E3 handles, the loop off or not (ours)', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		const ctx = draw(sim.frame);
		expect(handles(ctx, COLORS.grey3)).toHaveLength(3);
		expect(handles(ctx, COLORS.light)).toHaveLength(3);
		sim.state.areas.sample.tracks[2].synth.region.loop = 'off';
		expect(handles(draw(sim.frame), COLORS.grey3)).toHaveLength(3);
	});
});

describe('descriptions and scenarios', () => {
	it('says what each page shows', () => {
		expect(describeFrame(scenario('sample-drum-record'))).toBe(
			'drum sampler record: ready, ch mart b.wav, mic, gain +11'
		);
		expect(describeFrame(scenario('sample-even'))).toBe('slice even: 9 slices');
		expect(describeFrame(scenario('sample-library'))).toBe('sample library: bass, cherry');
	});

	it('covers every sample guide picture but the two core M1 ones, each once', () => {
		const pngs = scenarios.map((s) => /sample-(\d{3})/.exec(s.png ?? '')?.[1]);
		expect(pngs).toEqual([
			'003',
			'004',
			'017',
			'076',
			'080',
			'087',
			'094',
			'100',
			'113',
			'132',
			'140'
		]);
		for (const s of scenarios) expect(s.page, s.id).toBe(scenario(s.id).page);
	});
});
