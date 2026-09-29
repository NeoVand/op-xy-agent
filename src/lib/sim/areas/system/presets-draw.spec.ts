import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { COLORS } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { renderFrame } from '../../screen/render';
import type { SystemListColumn, SystemPresetsFrame } from './frames';
import { fitName } from './presets-draw';

/** A column as the builder makes it: `items` from `first`, nine in view. */
function column(items: readonly string[], selected: number, first = 0, total = items.length) {
	const shown = items.slice(first, first + 9);
	return { items: shown, selected: selected - first, first, total } satisfies SystemListColumn;
}

const ENGINES = [
	...['axis', 'dissolve', 'drum', 'epiano', 'hardsync', 'multisampler'],
	...['organ', 'prism', 'sampler', 'simple', 'wavetable']
];
const PRISM = [
	...['alloy', 'beam', 'dark', 'flyby', 'frontier', 'gradient', 'man stage', 'medieval'],
	...['mineral', 'murmel', 'night sky', 'open cell', 'shine', 'shoulder', 'slush', 'sonorous'],
	...['swelvet', 'tonk 5', 'uranium', 'valves', 'wakeup']
];

/** Frame b1-1500: track 3 by engine, prism boxed, shoulder highlighted on the bottom row. */
const B1_1500: SystemPresetsFrame = {
	page: 'system-presets',
	track: 3,
	view: 'engine',
	groups: column(ENGINES, 7),
	presets: column(PRISM, 13, 5),
	soft: [],
	popup: null
};

function draw(frame: SystemPresetsFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

/** The bounding box of each stroked path: its width and colour. */
function strokes(ctx: RecordingContext) {
	const out: { width: number; color: string; x0: number; y0: number; x1: number; y1: number }[] =
		[];
	let points: [number, number][] = [];
	for (const op of ctx.ops) {
		const a = op.args as number[];
		if (op.op === 'beginPath') points = [];
		else if (op.op === 'moveTo' || op.op === 'lineTo') points.push([a[0], a[1]]);
		else if (op.op === 'arc') points.push([a[0] - a[2], a[1] - a[2]], [a[0] + a[2], a[1] + a[2]]);
		else if (op.op === 'stroke' && points.length) {
			const xs = points.map((p) => p[0]);
			const ys = points.map((p) => p[1]);
			out.push({
				width: a[0],
				color: op.style ?? '',
				x0: Math.min(...xs),
				y0: Math.min(...ys),
				x1: Math.max(...xs),
				y1: Math.max(...ys)
			});
		}
	}
	return out;
}

describe('the preset browser page (device, OS 1.1.33: research 59 §2.6)', () => {
	it('boxes the chosen engine as the type lists do and lays the highlight on a pale blue bar (b1-1500)', () => {
		const ctx = draw(B1_1500);
		// prism on row 7: the list style's 1.5 px box, 3.9 px left of the text
		const box = strokes(ctx).find((s) => s.width === 1.5);
		expect(box).toMatchObject({ color: COLORS.white, x0: 105.3, x1: 230.05 });
		expect(box?.y0).toBeCloseTo(25.3 + 140 - 16.85, 1);
		expect(box?.y1).toBeCloseTo(25.3 + 140 + 4.05, 1);
		// shoulder on the bottom row: the bar from 18.55 above the baseline to 4.6 below
		const [bar] = ctx.fillsOf(COLORS.pale);
		expect(bar.x0).toBeCloseTo(249.1, 1);
		expect(bar.x1).toBeCloseTo(460.35, 1);
		expect(bar.y0).toBeCloseTo(185.3 - 18.55, 1);
		expect(bar.y1).toBeCloseTo(185.3 + 4.6, 1);
		// the highlighted name in ink on it
		expect(ctx.fillsOf(COLORS.ink).some((f) => f.x0 > 254 && f.y1 > 175)).toBe(true);
	});

	it('draws a scroll bar beside each list that runs past nine rows, its thumb the share in view', () => {
		const ctx = draw(B1_1500);
		// 9 of 11 engines, from the top: 183.1 × 9 / 11 long
		const [groups] = ctx.fillsOf(COLORS.grey2);
		expect([groups.x0, groups.x1, groups.y0]).toEqual([236.15, 243.95, 6.85]);
		expect(groups.y1 - groups.y0).toBeCloseTo((183.1 * 9) / 11, 1);
		// 9 of prism's 21 from the sixth: 5 of the 12 rows it can scroll down
		const [presets] = ctx.fillsOf(COLORS.grey3);
		expect([presets.x0, presets.x1]).toEqual([466.55, 472.75]);
		const length = (183.1 * 9) / 21;
		expect(presets.y1 - presets.y0).toBeCloseTo(length, 1);
		expect(presets.y0).toBeCloseTo(6.85 + ((183.1 - length) * 5) / 12, 1);
		// the 1 px tracks
		const tracks = strokes(ctx).filter((s) => s.width === 1 && s.y0 === 6.85);
		expect(tracks.map((t) => [t.x0, t.color])).toEqual([
			[240.05, COLORS.light],
			[469.65, COLORS.white]
		]);
		// a list that fits has none (b1-1528: strings' seven)
		const short = draw({ ...B1_1500, presets: column(PRISM.slice(0, 7), 0) });
		expect(short.fillsOf(COLORS.grey3)).toEqual([]);
	});

	it('writes the track number over "preset" at the left, as the type lists write theirs', () => {
		const ctx = draw(B1_1500);
		const left = ctx.fillsOf(COLORS.white).filter((f) => f.x1 < 70);
		expect(Math.min(...left.map((f) => f.x0))).toBeGreaterThan(4.5);
		expect(Math.max(...left.map((f) => f.y1))).toBeLessThan(50);
	});

	it('cuts a long name at the box, from its start when it is chosen (b1-1530, 1531)', () => {
		const max = 230.05 - 109.2;
		expect(fitName('Nostalgic Synths', max)).toBe('Nostalgic Sy');
		expect(fitName('Nostalgic Synths', max, true)).toBe('talgic Synths');
		expect(fitName('multisampler', max, true)).toBe('multisampler');
	});

	it('shows the chosen view on a white card with E1’s dot over the page dimmed to 40 % (b1-1535)', () => {
		const ctx = draw({ ...B1_1500, popup: { view: 'engine', alpha: 1 } });
		const dim = ctx.fillsOf(COLORS.black).find((f) => f.x1 === 480 && f.alpha < 1);
		expect(dim?.alpha).toBeCloseTo(0.6, 9);
		const card = ctx.fillsOf(COLORS.white).find((f) => f.x0 === 139.5);
		expect(card).toMatchObject({ x1: 340, y0: 71.7, y1: 108.3 });
		expect(ctx.fillsOf(COLORS.grey2).find((f) => f.x0 === 139.5)).toMatchObject({ y0: 111.5 });
		const dot = ctx.fillsOf('#0f0e12').find((f) => f.x0 === 324);
		expect(dot).toMatchObject({ y0: 76.7, x1: 334, y1: 86.7 });
		// by category chosen: the cards trade colours, the dot goes with the white one
		const other = draw({ ...B1_1500, popup: { view: 'category', alpha: 1 } });
		expect(other.fillsOf(COLORS.white).find((f) => f.x0 === 139.5)).toMatchObject({ y0: 111.5 });
		expect(other.fillsOf('#0f0e12').find((f) => f.x0 === 324)).toMatchObject({ y0: 116.5 });
	});

	it('writes cut · paste · rename · delete over M1–M4 in the soft-label greys (b1-1531)', () => {
		const ctx = draw({
			...B1_1500,
			soft: [
				{ text: 'cut', tone: 'normal' },
				{ text: 'paste', tone: 'dim' },
				{ text: 'rename', tone: 'normal' },
				{ text: 'delete', tone: 'normal' }
			]
		});
		const low = (color: string) => ctx.fillsOf(color).filter((f) => f.y0 > 195);
		const paste = low(COLORS.dim);
		expect(Math.min(...paste.map((f) => f.x0))).toBeGreaterThan(150);
		expect(Math.max(...paste.map((f) => f.x1))).toBeLessThan(200);
		expect(Math.max(...paste.map((f) => f.y1))).toBeLessThan(220);
		const lit = low(COLORS.light);
		expect(Math.min(...lit.map((f) => f.x0))).toBeLessThan(30); // cut, centred on 40
		expect(Math.max(...lit.map((f) => f.x1))).toBeGreaterThan(460); // delete, centred on 440
	});

	it('is what shift + M1 brings up on a new project’s track 3, and its words say so', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.combo('key.shift', 'key.m1');
		// the device lists eleven engines; midi follows them here (ours), so the list runs to twelve
		expect(sim.frame).toEqual({ ...B1_1500, groups: column([...ENGINES, 'midi'], 7) });
	});
});
