import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fontJson from '$knowledge/opxy/screen-font.json';
import iconsJson from '$knowledge/opxy/screen-icons.json';
import { screenFont } from './font';
import { ICONS, PATTERNS, drawIcon } from './icons';
import { PathDataError, compilePath, tracePath } from './paths';
import { RecordingContext } from './recording';
import { describeFrame, describeList, renderFrame } from './render';
import { frameToSvg } from './svg';
import type { FilterView, ScreenFrame } from './frame';
import { COLORS, RAMP } from './palette';
import { cutoffX, freqToX, kneeX, resonanceBox } from './pages/filter';
import { ENVELOPE_GRAPH, envelopePoints } from './pages/envelope';

const ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('screen font data (scripts/extract-screen-font.mjs output)', () => {
	it('has the documented shape and metrics', () => {
		expect(fontJson.format).toBe(1);
		expect(fontJson.unitsPerEm).toBe(1000);
		expect(fontJson.capHeight).toBeGreaterThan(fontJson.xHeight);
		expect(fontJson.figureAdvance).toBe(545);
		expect(fontJson.ligatures).toEqual(['ffl', 'ff', 'fi']);
		for (const [name, glyph] of Object.entries(fontJson.glyphs)) {
			expect(glyph.advance, name).toBeGreaterThan(0);
			expect(glyph.bbox, name).toHaveLength(4);
			expect(glyph.samples, name).toBeGreaterThan(0);
			expect(() => compilePath(glyph.d), name).not.toThrow();
		}
	});

	it('covers every lowercase letter and digit, and lists what it misses', () => {
		for (const c of 'abcdefghijklmnopqrstuvwxyz0123456789#+-./:–[]') {
			expect(screenFont.has(c), c).toBe(true);
		}
		for (const c of fontJson.missing) expect(screenFont.has(c), c).toBe(false);
		const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).filter(
			(c) => c !== ' '
		);
		const covered = printable.filter((c) => screenFont.has(c)).length;
		expect(covered + fontJson.missing.length).toBe(printable.length);
	});

	it('lays out with ligatures, tabular figures and the "11" kerning pair', () => {
		expect(screenFont.glyphNames('office')).toEqual(['o', 'ffi'.slice(0, 2), 'i', 'c', 'e']);
		expect(screenFont.glyphNames('fill')).toEqual(['fi', 'l', 'l']);
		expect(screenFont.measure('00', 20)).toBeCloseTo(2 * 545 * 0.02, 5);
		expect(screenFont.measure('10', 20)).toBeCloseTo(screenFont.measure('88', 20), 5);
		expect(screenFont.measure('11', 20)).toBeCloseTo((2 * 545 - 156) * 0.02, 5);
		expect(screenFont.measure('ab', 20, 0.1)).toBeCloseTo(screenFont.measure('ab', 20) + 2, 5);
		expect(screenFont.fit('a long project name', 100, 40)).toBeLessThan(40);
	});

	it('draws known glyphs as paths and unknown ones with the fallback face', () => {
		const ctx = new RecordingContext();
		const width = screenFont.draw(ctx, 'aB', 10, 20, { size: 20, color: '#ffffff' });
		expect(width).toBeGreaterThan(0);
		expect(ctx.summary().fill).toBe(1);
		const text = ctx.ops.filter((o) => o.op === 'fillText');
		expect(text).toHaveLength(1);
		expect(text[0].args[0]).toBe('B');
	});
});

describe('pictograms', () => {
	it('every icon compiles and has a box', () => {
		expect(Object.keys(ICONS).length).toBeGreaterThanOrEqual(45);
		for (const [name, icon] of Object.entries(ICONS)) {
			expect(icon.w, name).toBeGreaterThan(0);
			expect(icon.shapes.length, name).toBeGreaterThan(0);
			for (const shape of icon.shapes) {
				expect(() => compilePath(shape.d), name).not.toThrow();
				if (shape.clip) expect(() => compilePath(shape.clip ?? ''), name).not.toThrow();
			}
		}
		expect(iconsJson.format).toBe(1);
	});

	it("keeps dissolve's noise field as a 48 × 20 cell pattern", () => {
		const cells = PATTERNS['engine.dissolve'];
		expect(cells.grid).toHaveLength(20);
		for (const row of cells.grid) expect(row).toMatch(/^[.1-3]{48}$/);
		expect(cells.colors).toContain('#f7f5f5');
	});

	it('draws an icon at an offset, recolouring on request', () => {
		const ctx = new RecordingContext();
		drawIcon(ctx, 'tempo.metronome', 100, 50, { colors: { '#000000': '#123456' } });
		expect(ctx.fills.length).toBeGreaterThan(0);
		expect(Math.min(...ctx.fills.map((f) => f.x0))).toBeGreaterThanOrEqual(99);
	});
});

describe('path data', () => {
	it('compiles absolute M/L/H/V/C/Z and traces with offset and scale', () => {
		const ops = compilePath('M0 0L10 0V10H0C0 5 0 5 0 0Z');
		expect(ops.length).toBeGreaterThan(0);
		const ctx = new RecordingContext();
		ctx.beginPath();
		tracePath(ctx, ops, 5, 5, 2);
		ctx.fill();
		expect(ctx.fills[0]).toMatchObject({ x0: 5, y0: 5, x1: 25, y1: 25 });
	});

	it('rejects commands it does not handle', () => {
		expect(() => compilePath('M0 0Q1 1 2 2')).toThrow(PathDataError);
		expect(() => compilePath('m0 0l1 1')).toThrow(PathDataError);
	});
});

const header = (labels: string[]) => labels.map((label) => ({ label, value: '80' }));
const envelope = {
	amp: { attack: 0, decay: 1, sustain: 0.76, release: 1 },
	filter: { attack: 1, decay: 1, sustain: 0.41, release: 0.29 },
	selected: 'amp' as const
};
const filter = {
	type: 'svf' as const,
	cutoff: Math.log(100) / Math.log(400),
	resonance: 0.4,
	envAmount: 0.35,
	keyTracking: 1
};

/** Draws a frame into a recording context. */
function record(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

describe('envelope graph (measured on the device, note 59 §2.2)', () => {
	const env = (attack: number, decay: number, sustain: number, release: number) =>
		envelopePoints({ attack, decay, sustain, release });

	it('slides each handle linearly: peak up to 115 px, decay end 101 px past it, sustain to the top', () => {
		expect(env(0, 0, 0, 1).peakX).toBe(ENVELOPE_GRAPH.left);
		expect(env(1, 0, 0, 1).peakX).toBe(ENVELOPE_GRAPH.left + 115);
		// the device at CC 64 of 127: the peak 57.8 px in, the decay end 50.9 px past it
		expect(env(64 / 127, 0, 0, 1).peakX - ENVELOPE_GRAPH.left).toBeCloseTo(57.8, 0);
		expect(env(0, 64 / 127, 0, 1).decayEnd - ENVELOPE_GRAPH.left).toBeCloseTo(50.9, 0);
		expect(env(0, 0, 1, 1).levelY).toBe(ENVELOPE_GRAPH.top);
		expect(env(0, 0, 0, 1).levelY).toBe(ENVELOPE_GRAPH.base);
	});

	it('places the release handle by its value: 0 starts 107 px before the end, full sits on it', () => {
		expect(env(0, 0, 0.5, 0).releaseStart).toBe(ENVELOPE_GRAPH.right - 107);
		expect(env(0, 0, 0.5, 1).releaseStart).toBe(ENVELOPE_GRAPH.right);
		// a higher release value moves the handle right: a shorter release
		expect(env(0, 0, 0.5, 0.8).releaseStart).toBeGreaterThan(env(0, 0, 0.5, 0.2).releaseStart);
	});
});

describe('renderFrame (recorded draw calls)', () => {
	it('clears to black and clips to the rounded display', () => {
		const ctx = record({ page: 'text', title: 'test', lines: ['hello'] });
		expect(ctx.ops[0].op).toBe('save');
		expect(ctx.ops[1]).toMatchObject({ op: 'fillRect', args: [0, 0, 480, 220], style: '#000000' });
		expect(ctx.ops.some((o) => o.op === 'clip')).toBe(true);
		expect(ctx.ops[ctx.ops.length - 1].op).toBe('restore');
	});

	it('draws the synth header as eight ramp cells with labels and values', () => {
		const ctx = record({
			page: 'synth',
			engine: 'prism',
			header: header(['shape', 'ratio', 'detune', 'stereo']),
			params: [0.8, 0.8, 0.8, 0.8]
		});
		const cells = ctx.fills.filter((f) => f.y0 === 0 && f.y1 === 20 && f.x1 - f.x0 === 60);
		expect(cells.map((c) => c.color)).toEqual(RAMP.slice());
		// value text is white on the dark half and black on the light half
		expect(ctx.fillsOf(COLORS.white).some((f) => f.x0 > 65 && f.x1 < 120 && f.y1 <= 20)).toBe(true);
		expect(ctx.fillsOf(COLORS.black).some((f) => f.x0 > 305 && f.x1 < 360 && f.y1 <= 20)).toBe(
			true
		);
	});

	it('draws the tempo page on its light grey with the BPM, as the device does', () => {
		const ctx = record({
			page: 'tempo',
			bpm: '120',
			groove: 'SH',
			swing: 0,
			metronome: { level: 1, on: true },
			beat: 0,
			pendulum: -1,
			weight: 80 / 180
		});
		expect(ctx.fillsOf(COLORS.light).some((f) => f.x1 - f.x0 >= 470)).toBe(true);
		// three digits of 50 px text left of the metronome
		const bpm = ctx.fills.filter((f) => f.y1 > 110 && f.y1 < 130 && f.x1 < 180 && f.y1 - f.y0 > 30);
		expect(bpm).toHaveLength(3);
	});

	it('draws the selected envelope with five 8 px handles, white, as the device does', () => {
		const ctx = record({ page: 'envelope', ...envelope });
		const handles = ctx
			.fillsOf(COLORS.white)
			.filter((f) => Math.abs(f.x1 - f.x0 - 8) < 0.6 && Math.abs(f.y1 - f.y0 - 8) < 0.6);
		expect(handles).toHaveLength(5);
		// the start and end handles sit on the axis at 41 and 440
		const xs = handles.map((f) => (f.x0 + f.x1) / 2).sort((a, b) => a - b);
		expect(xs[0]).toBeCloseTo(41, 5);
		expect(xs[4]).toBeCloseTo(440, 5);
	});

	it('draws the filter as the device does: four bands, the resonance box at the knee, the key arrow (note 59 §2.3)', () => {
		const ctx = record({ page: 'filter', ...filter, envAmount: 0 });
		// the bands' greys, dark to white, clipped to the response
		for (const band of [COLORS.panel, RAMP[3], RAMP[4], RAMP[7]]) {
			expect(ctx.fillsOf(band).length, band).toBeGreaterThan(0);
		}
		// the knee slides 2.95 px a CC step from 64.3 and the box holds the resonance (0.4 → 40)
		expect(kneeX(0)).toBe(64.3);
		expect(kneeX(1)).toBeCloseTo(439.3, 9);
		const x = kneeX(filter.cutoff);
		const y = 148.45 - 64.8 * filter.resonance;
		const box = ctx.fillsOf(COLORS.black).find((f) => Math.abs(f.x1 - f.x0 - 39) < 0.01);
		expect(box?.x0).toBeCloseTo(x - 19.5, 1);
		expect(box?.y0).toBeCloseTo(y - 12.1, 1);
		expect(resonanceBox({ ...filter, cutoff: 1 }).x).toBe(414.5);
		// no hatching without an envelope amount
		expect(ctx.ops.some((o) => o.op === 'stroke' && o.style === RAMP[5])).toBe(false);
		// TE's axis for the pages that still use it (the auxiliary filter)
		expect(freqToX(5000)).toBe(330.5);
		expect(cutoffX(1)).toBe(450.5);
	});

	it('slides the key-tracking arrow from x 63.1 to 395.4 (note 59 §2.3)', () => {
		const arrowX = (keyTracking: number) => {
			const ctx = record({ page: 'filter', ...filter, keyTracking });
			const white = ctx.fillsOf(COLORS.white).filter((f) => f.y0 > 190 && f.y1 < 215);
			return Math.min(...white.map((f) => f.x0));
		};
		expect(arrowX(0)).toBeCloseTo(63.1 + 1.5 * 0.94, 1);
		expect(arrowX(1)).toBeCloseTo(395.4 + 1.5 * 0.94, 1);
	});

	it('hatches up to a ghost of the response at the cutoff plus the envelope amount', () => {
		const hatched = (view: Partial<FilterView>) => {
			const ctx = record({ page: 'filter', ...filter, ...view });
			return ctx.ops.some((o) => o.op === 'stroke' && o.style === RAMP[5]);
		};
		expect(hatched({ envAmount: 0.3 })).toBe(true);
		// the ghost is clamped to the range: a cutoff at full leaves nothing to hatch
		expect(hatched({ envAmount: 0.3, cutoff: 1 })).toBe(false);
		expect(hatched({ envAmount: 0.3, type: 'z hipass' })).toBe(true);
	});

	it('draws four white send cards over the filter at 40 %', () => {
		const ctx = record({ page: 'sends', filter, values: ['50', '31', '77', '00'] });
		const cards = ctx.fillsOf(COLORS.white).filter((f) => f.x0 === 139.5 && f.x1 === 340);
		expect(cards.map((c) => c.y0)).toEqual([31.5, 71.3, 111.1, 150.9]);
		const bands = ctx.fillsOf(RAMP[4]).filter((f) => f.x1 - f.x0 > 50);
		expect(bands.length).toBeGreaterThan(0);
		expect(bands.every((f) => f.alpha === 0.4)).toBe(true);
		// a send at zero reads "no send", as the device writes it: six letters on the last card
		const words = ctx
			.fillsOf(COLORS.ink)
			.filter((f) => f.x0 > 200 && f.x1 < 320 && f.y0 > 151 && f.y1 < 188);
		expect(words).toHaveLength(6);
	});

	it('draws LFO cards with ink seams and the knob cap in the parameter’s shade', () => {
		const ctx = record({
			page: 'lfo',
			type: 'value',
			speed: { synced: false, label: '', position: 0.5 },
			amount: -9,
			volume: 0,
			destination: { label: 'syn', free: true },
			fourth: 'detune',
			parameter: 2
		});
		const seams = ctx.ops.filter(
			(o) => o.op === 'stroke' && o.args[0] === 1 && o.style === COLORS.ink
		);
		expect(seams.length).toBeGreaterThanOrEqual(4);
		// the cap: the icon's last shape, recoloured
		expect(ctx.fillsOf(COLORS.light).some((f) => f.x0 > 340 && f.x1 < 380 && f.y1 < 105)).toBe(
			true
		);
	});

	it('tilts the envelope’s line: rising, flat along the top, falling (device, CC 0 / 64 / 127)', () => {
		/** The 1.67 px ink lines inside a card, as their end points. */
		function lines(frame: ScreenFrame, x: number, y: number): number[][][] {
			const ctx = record(frame);
			const out: number[][][] = [];
			let path: number[][] = [];
			for (const o of ctx.ops) {
				if (o.op === 'beginPath') path = [];
				else if (o.op === 'moveTo' || o.op === 'lineTo') path.push(o.args as number[]);
				else if (o.op === 'stroke' && o.args[0] === 1.67 && o.style === COLORS.ink) {
					const inside = path.every(
						([px, py]) => px >= x && px <= x + 60 && py >= y && py <= y + 60
					);
					if (path.length && inside) out.push(path);
				}
			}
			return out;
		}
		const lfo = (type: 'random' | 'tremolo', envelope: number): ScreenFrame => ({
			page: 'lfo',
			type,
			speed: { synced: true, label: '4', position: 0 },
			amount: 0,
			volume: 0,
			destination: { label: 'syn', free: false },
			fourth: 'env',
			parameter: 0,
			envelope
		});
		expect(lines(lfo('random', -1), 240, 110)).toEqual([
			[
				[250.8, 157.2],
				[289, 122.5]
			]
		]);
		expect(lines(lfo('random', 0), 240, 110)).toEqual([
			[
				[250.8, 122.5],
				[289, 122.5]
			]
		]);
		expect(lines(lfo('random', 1), 240, 110)).toEqual([
			[
				[250.8, 122.5],
				[289, 157.2]
			]
		]);
		expect(lines(lfo('tremolo', -1), 330, 50)).toEqual([
			[
				[342.8, 95.1],
				[376.3, 64.8]
			]
		]);
	});

	it('draws the duck’s source: "tr" and the track’s number, or the metronome in its place', () => {
		const duck = (source: string): ScreenFrame => ({
			page: 'lfo',
			type: 'duck',
			speed: { synced: true, label: '4', position: 0 },
			amount: 0,
			volume: 0,
			destination: { label: 'syn', free: false },
			fourth: '',
			parameter: 0,
			source,
			sourceAudio: false
		});
		const inCard = (ctx: RecordingContext, color: string) =>
			ctx.fillsOf(color).filter((f) => f.x0 >= 120 && f.x1 <= 180 && f.y0 >= 80 && f.y1 <= 130);
		const track = record(duck('12'));
		expect(inCard(track, COLORS.ink)).toHaveLength(2); // two digits
		expect(inCard(track, COLORS.grey4)).toHaveLength(2); // "tr"
		const metronome = record(duck('metronome'));
		expect(inCard(metronome, COLORS.ink)).toEqual([
			expect.objectContaining({ x0: expect.closeTo(135.9, 0), y1: expect.closeTo(124.2, 0) })
		]);
	});

	it('draws the pickers’ lists as the device does: rows from baseline 25.3, the current one boxed', () => {
		const ctx = record({
			page: 'list',
			soft: [],
			columns: [
				{ items: ['3', 'filter'], selected: null, style: 'outline', x: 4.5, width: 100 },
				{
					items: ['ladder', 'svf', 'z hipass', 'z lowpass'],
					selected: 1,
					style: 'outline',
					x: 109.2,
					width: 124.75
				}
			]
		});
		// one 1.5 px white outline, its top 16.85 px above the second row's baseline (45.3)
		const boxAt = ctx.ops.findIndex((o) => o.op === 'stroke' && o.args[0] === 1.5);
		expect(ctx.ops[boxAt].style).toBe(COLORS.white);
		const start = ctx.ops.slice(0, boxAt).findLast((o) => o.op === 'moveTo');
		expect(start?.args).toEqual([105.3 + 2.5, 28.45]);
		// the words in the heavier weight: every glyph is filled and stroked in white
		expect(
			ctx.ops.filter((o) => o.op === 'stroke' && o.style === COLORS.white).length
		).toBeGreaterThan(20);
	});

	it('draws eight mixer strips, hatching a muted one', () => {
		const strips = Array.from({ length: 8 }, (_, i) => ({
			level: 0.5,
			pan: 0,
			muted: i === 4,
			meter: 0
		}));
		const ctx = record({ page: 'mix', bank: 'instrument', selected: 1, strips });
		const columns = ctx.fills.filter((f) => f.y0 === 0 && f.x1 - f.x0 === 60);
		expect(columns.map((c) => c.color)).toEqual(RAMP.slice());
		expect(ctx.ops.filter((o) => o.op === 'clip').length).toBeGreaterThanOrEqual(2);
	});

	it('draws the COM selector with four stops', () => {
		const ctx = record({ page: 'com', advertising: false, multiOut: 'sync16', charging: false });
		const rings = ctx.fills.filter((f) => f.x0 === 320 && f.x1 === 340);
		expect(rings).toHaveLength(4);
		expect(rings.filter((r) => r.color === COLORS.card).map((r) => r.y0)).toEqual([50]);
	});

	it('describes frames in words for screen readers', () => {
		expect(
			describeFrame({
				page: 'tempo',
				bpm: '120',
				groove: 'SH',
				swing: 0,
				metronome: { level: 1, on: false },
				beat: null,
				pendulum: -1,
				weight: 80 / 180
			})
		).toBe('tempo 120 bpm, groove SH, swing 0, metronome off');
		expect(describeFrame({ page: 'midi', channel: '1', bank: null, program: '1' })).toContain(
			'bank none'
		);
	});

	it('names the sampler engine the M1 page belongs to', async () => {
		const { SCENARIOS } = await import('../scenarios');
		const { OpxySim } = await import('../opxy-sim.svelte');
		const said = (id: string) => {
			const sim = new OpxySim({ now: () => 0 });
			SCENARIOS.find((s) => s.id === id)?.setup(sim);
			return describeFrame(sim.frame);
		};
		expect(said('drum')).toMatch(/^drum key F3 \(shift\): direction forward, pan 0/);
		expect(said('sampler')).toMatch(/^sampler, root /);
		expect(said('sample-multi')).toMatch(/^multisampler zone /);
	});
});

describe('frameToSvg', () => {
	it('renders a frame as a standalone SVG', () => {
		const svg = frameToSvg(
			{
				page: 'project',
				name: 'demo 1',
				usage: { voices: true, cpu: false, memory: false },
				soft: []
			},
			2
		);
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('width="960"');
		expect(svg).toContain('<path');
	});
});

const research = path.join(ROOT, 'research/ui-reference/guide-screens/index.json');
describe.skipIf(!existsSync(research))(
	'scripts/extract-screen-font.mjs (research input present)',
	() => {
		it('regenerates exactly the committed font and icons', () => {
			const out = execFileSync(
				process.execPath,
				['scripts/extract-screen-font.mjs', '--check', '--quiet'],
				{
					cwd: ROOT,
					encoding: 'utf8'
				}
			);
			expect(out).toMatch(/screen-font\.json is up to date/);
			expect(out).toMatch(/screen-icons\.json is up to date/);
			// It traces every guide screen: seconds alone, longer beside the whole suite.
		}, 60_000);
	}
);

describe('describeList', () => {
	it('names a list, its items and the highlighted one; null for other pages', () => {
		const frame: ScreenFrame = {
			page: 'list',
			columns: [
				{ items: ['3', 'filter'], selected: null, style: 'outline', x: 4.5, width: 100 },
				{
					items: ['ladder', 'svf', 'z hipass', 'z lowpass'],
					selected: 1,
					style: 'outline',
					x: 109.2,
					width: 124.75
				}
			],
			soft: []
		} as unknown as ScreenFrame;
		expect(describeList(frame)).toBe(
			'3 filter list: ladder, svf, z hipass, z lowpass (svf highlighted)'
		);
		// the screen's short reading stays the highlighted item
		expect(describeFrame(frame)).toBe('svf');
		const long = {
			...frame,
			columns: [{ items: Array.from({ length: 20 }, (_, i) => `p${i}`), selected: 4 }]
		} as unknown as ScreenFrame;
		expect(describeList(long)).toBe('a list: p4 highlighted, 5 of 20');
		expect(describeList({ page: 'tempo' } as unknown as ScreenFrame)).toBeNull();
	});
});
