import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { ScreenFrame, TempoFrame } from '../frame';
import { COLORS } from '../palette';
import { RecordingContext } from '../recording';
import { renderFrame } from '../render';
import { bpmLayout, pendulumPoint, thumbX, waveCount, weightAlong } from './tempo';

/**
 * Positions measured on the owner's OS 1.1.33 unit by camera (realigned frames, design px;
 * docs/research/59-screen-profiling.md §2.11).
 */
const tempo = (over: Partial<TempoFrame> = {}): TempoFrame => ({
	page: 'tempo',
	bpm: '120',
	groove: 'SH',
	swing: 0,
	metronome: { level: 168 / 255, on: true },
	beat: null,
	pendulum: -1,
	weight: 80 / 180,
	...over
});

function record(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

const page = (sim: OpxySim) => {
	const f = sim.frame;
	if (f.page !== 'tempo') throw new Error(`expected the tempo page, got ${f.page}`);
	return f;
};

describe('tempo page (measured on the device, note 59 §2.11)', () => {
	it('sets the BPM where the device does: a narrow 1, the run centred at x 107.25', () => {
		// each glyph's pen as the font's outline matched the frames (steps-693…699, b1-3913)
		const device: Record<string, number[]> = {
			'40': [80.1, 106.7],
			'80': [80.8, 106.7],
			'118': [72.22, 90.22, 111.8],
			'120': [68.22, 89.97, 114.7],
			'160': [68.22, 90.67, 115.7],
			'200': [67.97, 92.7, 118.7],
			'220': [68.97, 93.85, 118.58]
		};
		for (const [bpm, pens] of Object.entries(device)) {
			const { glyphs, width } = bpmLayout(bpm);
			const x0 = 107.25 - width / 2;
			expect(glyphs.map((g) => g.ch).join('')).toBe(bpm);
			// the device puts each glyph on a whole pixel, so within one
			glyphs.forEach((g, i) => expect(Math.abs(x0 + g.x - pens[i])).toBeLessThan(1));
		}
	});

	it('rests the pendulum at its left end, the weight lower the faster the tempo', () => {
		// the weight's dot at 40, 120 and 220 BPM (steps-694, 693…709, 698)
		const at = (bpm: number) => pendulumPoint(-1, weightAlong((bpm - 40) / 180));
		for (const [bpm, x, y] of [
			[40, 168.95, 59.26],
			[120, 197.79, 89.72],
			[220, 233.6, 128.02]
		]) {
			const p = at(bpm);
			expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(0.6);
		}
		// the swing's ends mirror each other about the pivot's upright
		const left = pendulumPoint(-1, 100);
		const right = pendulumPoint(1, 100);
		expect(left.x + right.x).toBeCloseTo(2 * 240.5, 6);
		expect(left.y).toBeCloseTo(right.y, 6);
		expect(pendulumPoint(0, 100)).toEqual({ x: 240.5, y: 36 });
	});

	it('slides the groove thumb as CC81 does: 0 at the left, 64 in the middle, 127 at the right', () => {
		const device: [number, number][] = [
			[0, 196.16],
			[32, 217.9],
			[48, 229.03],
			[63, 239.47],
			[64, 240.12],
			[80, 251.16],
			[96, 262.08],
			[127, 283.99]
		];
		for (const [cc, x] of device) expect(Math.abs(thumbX((cc - 64) / 64) - x)).toBeLessThan(0.4);
		expect(thumbX(5)).toBe(thumbX(1));
	});

	it('shows sound waves for the level while the metronome is on, the outer ones going first', () => {
		expect(waveCount(168 / 255, true)).toBe(7); // a new project's level: seven, as on the device
		expect(waveCount(1, true)).toBe(10);
		expect(waveCount(0.01, true)).toBe(1);
		expect(waveCount(0, true)).toBe(0);
		expect(waveCount(1, false)).toBe(0);
		const rings = (frame: TempoFrame) =>
			record(frame).ops.filter((o) => o.op === 'stroke' && o.style === COLORS.white).length;
		expect(rings(tempo())).toBe(7);
		expect(rings(tempo({ metronome: { level: 1, on: false } }))).toBe(0);
	});

	it('draws the page light grey, the pendulum white, and lights no dot until it plays', () => {
		const dots = (frame: TempoFrame) =>
			record(frame)
				.fillsOf(COLORS.white)
				.filter((f) => f.y0 > 150 && f.y1 < 160)
				.map((f) => (f.x0 + f.x1) / 2);
		expect(
			record(tempo())
				.fillsOf(COLORS.light)
				.some((f) => f.x1 - f.x0 >= 470)
		).toBe(true);
		expect(dots(tempo())).toEqual([]);
		expect(dots(tempo({ beat: 2 }))).toEqual([250.2]);
	});
});

describe('tempo frame (from the simulator)', () => {
	it('rests the pendulum at the left with no beat lit, the weight placed by the tempo', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.tempo');
		expect(page(sim)).toMatchObject({ pendulum: -1, beat: null, weight: 80 / 180 });
		sim.turn(1, 100);
		expect(page(sim).weight).toBe(1);
		sim.turn(1, -200);
		expect(page(sim).weight).toBe(0);
	});

	it('swings end to end in a beat while playing, at an end on each beat, lighting its dot', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.tempo');
		sim.press('key.play');
		expect(page(sim)).toMatchObject({ pendulum: -1, beat: 0 });
		sim.advance(250); // half a beat at 120 BPM: upright
		expect(page(sim).pendulum).toBeCloseTo(0, 9);
		expect(page(sim).beat).toBe(0);
		sim.advance(250); // the second beat: the right end
		expect(page(sim)).toMatchObject({ pendulum: 1, beat: 1 });
		sim.advance(1000); // the fourth beat: back at the right after a full swing
		expect(page(sim).pendulum).toBeCloseTo(1, 9);
		expect(page(sim).beat).toBe(3);
		sim.press('key.stop');
		expect(page(sim)).toMatchObject({ pendulum: -1, beat: null });
	});
});
