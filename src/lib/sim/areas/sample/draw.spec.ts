import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import type { ScreenFrame } from '../../screen/frame';
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

describe('the sampler M1 pages (sample-025, 056, 113)', () => {
	it('draws the synth sampler’s root badge and hides loop markers under start and end', () => {
		const ctx = draw(scenario('sampler'));
		expect(ctx.fillsOf('#484850').some((f) => near(f.x0, 440) && near(f.y0, 5))).toBe(true);
		// start handles in TE's synth grey, end handles white
		const start = ctx.fillsOf(COLORS.grey4).filter((f) => near(f.x0, 50) && near(f.x1 - f.x0, 10));
		expect(start).toHaveLength(3);
	});

	it('draws the multisampler’s key strip with the selected zone white', () => {
		const ctx = draw(scenario('sample-multi'));
		const cells = ctx.fills.filter((f) => f.y0 === 0 && near(f.y1, 25) && near(f.x1 - f.x0, 5));
		expect(cells).toHaveLength(96);
		const zone = cells.filter((c) => c.color === COLORS.white);
		expect(zone.map((c) => c.x0)).toEqual(Array.from({ length: 12 }, (_, i) => 175 + 5 * i));
	});

	it('draws loop markers with grey handles when the loop does not sit on start and end', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		const ctx = draw(sim.frame);
		expect(ctx.fillsOf(COLORS.grey2).filter((f) => near(f.x1 - f.x0, 10))).toHaveLength(6);
		sim.state.areas.sample.tracks[2].synth.region.loop = 'off';
		expect(
			draw(sim.frame)
				.fillsOf(COLORS.grey2)
				.filter((f) => near(f.x1 - f.x0, 10))
		).toHaveLength(0);
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
		const pngs = scenarios.map((s) => /sample-(\d{3})/.exec(s.png)?.[1]);
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
