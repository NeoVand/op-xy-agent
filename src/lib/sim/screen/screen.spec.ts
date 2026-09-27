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
import { describeFrame, renderFrame } from './render';
import { frameToSvg } from './svg';
import type { ScreenFrame } from './frame';
import { COLORS, RAMP } from './palette';
import { cutoffX, freqToX } from './pages/filter';

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
	amp: { attack: 0, decay: 1, sustain: 0.76, release: 0 },
	filter: { attack: 1, decay: 1, sustain: 0.41, release: 0.88 },
	selected: 'amp' as const,
	filterDepth: 0.66
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

	it('draws the tempo page on its grey panel with the BPM', () => {
		const ctx = record({
			page: 'tempo',
			bpm: '120',
			groove: 'SH',
			swing: 0,
			metronome: { level: 1, on: true },
			beat: 0,
			pendulum: 1
		});
		expect(ctx.fillsOf(COLORS.tempo).some((f) => f.x1 - f.x0 >= 470)).toBe(true);
		// three digits of 50 px text left of the metronome
		const bpm = ctx.fills.filter((f) => f.y1 > 110 && f.y1 < 130 && f.x1 < 180 && f.y1 - f.y0 > 30);
		expect(bpm).toHaveLength(3);
	});

	it('draws the selected envelope with five handles', () => {
		const ctx = record({ page: 'envelope', ...envelope });
		const handles = ctx.fills.filter(
			(f) => Math.abs(f.x1 - f.x0 - 5) < 0.6 && Math.abs(f.y1 - f.y0 - 5) < 0.6
		);
		expect(handles).toHaveLength(5);
	});

	it('draws the filter bands, the Q box on the cutoff and the envelope handle', () => {
		const ctx = record({ page: 'filter', ...filter });
		for (const band of ['#16161e', '#2f2f37', '#484850', '#96969b']) {
			expect(ctx.fillsOf(band).length, band).toBeGreaterThan(0);
		}
		const q = ctx.fillsOf(COLORS.black).find((f) => f.y0 === 87.5 && f.y1 === 112.5);
		expect(q).toMatchObject({ x0: 310.5, x1: 350.5 });
		const handle = ctx.fillsOf(COLORS.grey2).find((f) => f.x1 - f.x0 === 10);
		expect(handle?.x0).toBeCloseTo(371.3, 0);
		expect(freqToX(5000)).toBe(330.5);
		expect(cutoffX(1)).toBe(450.5);
	});

	it('draws four send cards over the dimmed filter', () => {
		const ctx = record({ page: 'sends', filter, values: ['50', '31', '77', '25'] });
		const cards = ctx.fillsOf(COLORS.white).filter((f) => f.x0 === 155 && f.x1 === 355);
		expect(cards.map((c) => c.y0)).toEqual([30, 70, 110, 150]);
		// the graph under the cards is dimmed to half
		const band = ctx.fillsOf('#96969b').filter((f) => f.x1 - f.x0 > 100);
		expect(band.length).toBeGreaterThan(0);
		expect(band.every((f) => f.alpha === 0.5)).toBe(true);
	});

	it('draws LFO cards with outlines and the knob cap in the parameter colour', () => {
		const ctx = record({
			page: 'lfo',
			type: 'value',
			speed: { synced: false, label: '', position: 0.5 },
			amount: -9,
			volume: 0,
			destination: { label: 'syn', free: true },
			fourth: 'hold',
			parameter: 2
		});
		const outlines = ctx.ops.filter((o) => o.op === 'stroke' && o.args[0] === 2.23);
		expect(outlines.length).toBeGreaterThanOrEqual(6);
		expect(ctx.fillsOf('#96969b').length).toBeGreaterThan(0);
	});

	it('draws an envelope’s ramp in random’s env card and tremolo’s mode card', () => {
		/** The ink lines (1.67 px) stroked inside a card: each as its points. */
		function ramps(frame: ScreenFrame, x: number, y: number): number[][][] {
			const ctx = record(frame);
			const paths: number[][][] = [];
			let path: number[][] = [];
			for (const o of ctx.ops) {
				if (o.op === 'beginPath') path = [];
				else if (o.op === 'moveTo' || o.op === 'lineTo') path.push(o.args as number[]);
				else if (o.op === 'stroke' && o.args[0] === 1.67 && o.style === COLORS.ink) {
					const inside = path.every(
						([px, py]) => px >= x && px <= x + 60 && py >= y && py <= y + 60
					);
					if (path.length && inside) paths.push(path);
				}
			}
			return paths;
		}
		const lfo = (type: 'random' | 'tremolo', envelope: number): ScreenFrame => ({
			page: 'lfo',
			type,
			speed: { synced: true, label: '4', position: 0 },
			amount: 0,
			volume: 0,
			destination: { label: 'syn', free: false },
			fourth: 'shape',
			parameter: 0,
			envelope
		});
		// a full fade-in is TE's line across the card; none rises at once; a fade-out falls at the end
		expect(ramps(lfo('random', 1), 240, 110)).toEqual([
			[
				[250, 160],
				[290, 120]
			]
		]);
		expect(ramps(lfo('random', 0), 240, 110)).toEqual([
			[
				[250, 160],
				[250, 120],
				[290, 120]
			]
		]);
		expect(ramps(lfo('random', -0.5), 240, 110)).toEqual([
			[
				[250, 120],
				[270, 120],
				[290, 160]
			]
		]);
		expect(ramps(lfo('tremolo', 1), 330, 50)).toEqual([
			[
				[340, 100],
				[380, 60]
			]
		]);
	});

	it('draws the duck’s source: the track’s number, or the metronome in its place', () => {
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
			sourceAudio: true
		});
		const inCard = (ctx: RecordingContext) =>
			ctx.fillsOf(COLORS.ink).filter((f) => f.x0 >= 120 && f.x1 <= 180 && f.y0 >= 55);
		const track = inCard(record(duck('12')));
		const metronome = inCard(record(duck('metronome')));
		expect(track.length).toBeGreaterThan(2); // "tr" and two digits
		expect(metronome).toEqual([expect.objectContaining({ x0: 127.5, x1: 172.5, y1: 135.5 })]);
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
				beat: 0,
				pendulum: 1
			})
		).toBe('tempo 120 bpm, groove SH, metronome off');
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
		expect(said('drum')).toMatch(/^drum key F3 \(shift\): tune/);
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
