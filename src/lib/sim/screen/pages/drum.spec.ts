import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { LANE_COLUMNS, TUNE_RANGE, tuneText } from '../../areas/sample/m1';
import { encodeWave } from '../../areas/sample/wave';
import type { SamplerView } from '../../areas/sample/frames';
import type { DrumFrame, ScreenFrame } from '../frame';
import { icon } from '../icons';
import { COLORS } from '../palette';
import { compiled } from '../paths';
import { RecordingContext } from '../recording';
import { renderFrame } from '../render';
import {
	HANDLE_SHADES,
	KEYBOARD,
	LANES,
	TINT,
	crossfadeWedge,
	fadeRamp,
	gainEdge,
	gainFactor,
	keyOf,
	panX,
	sampleX,
	stripHalf,
	tuneLayout,
	waveHalf
} from './drum';

/**
 * Positions measured on the owner's OS 1.1.33 unit by camera (realigned frames, design px;
 * docs/research/59-screen-profiling.md §2.5): the drum sampler b1-2440…2590, the synth sampler
 * b1-2600…2708, the multisampler b1-2718…2782.
 */

/** A wave of `n` columns at one level. */
const flat = (level: number, n = LANE_COLUMNS) => encodeWave(Array(n).fill(level / 16));

const view = (over: Partial<SamplerView> = {}): SamplerView => ({
	engine: 'drum',
	waves: [flat(4), flat(4)],
	loop: null,
	root: 'C',
	zone: null,
	...over
});

const drum = (over: Partial<DrumFrame> = {}, sampler: Partial<SamplerView> = {}): DrumFrame => ({
	page: 'drum',
	key: 'F3',
	tune: '+0.00',
	start: 0,
	end: 1,
	playMode: 'oneshot',
	shift: false,
	reverse: false,
	pan: 0,
	fade: 0,
	gain: 0.6,
	seed: 1,
	sampler: view(sampler),
	...over
});

const synth = (over: Partial<DrumFrame> = {}, sampler: Partial<SamplerView> = {}) =>
	drum(over, {
		engine: 'sampler',
		loop: { start: 0.3, end: 0.6, type: 'release', crossfade: 0 },
		...sampler
	});

function record(frame: ScreenFrame): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame);
	return ctx;
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

/** Whether an icon was drawn with its box at (x, y): its first point lands there. */
function drew(ctx: RecordingContext, name: string, x: number, y: number): boolean {
	const ops = compiled(icon(name).shapes[0].d);
	const [px, py] = [x + ops[1], y + ops[2]].map((v) => Math.round(v * 100) / 100);
	return ctx.ops.some((o) => o.op === 'moveTo' && o.args[0] === px && o.args[1] === py);
}

/** The x of a measured marker line (its centre) as a 0–1 position. */
const at = (x: number) => (x - 6.72) / 468.95;

describe('sampler M1 lanes, points and waves (measured, note 59 §2.5)', () => {
	it('draws two dark lanes the full width, a white badge on each, over everything', () => {
		const ctx = record(drum());
		const lanes = ctx.fillsOf(COLORS.dark).filter((f) => f.x0 === 0 && f.x1 === 480);
		expect(lanes.map((f) => [f.y0, f.y1])).toEqual([
			[30.3, 120],
			[124.9, 214.6]
		]);
		// TE's 20 px badges where the camera saw 21.2 × 20.7 of glare, centred at x 16.2
		const badges = ctx.fillsOf(COLORS.white).filter((f) => near(f.x0, 6.2) && near(f.x1, 26.2));
		expect(badges.map((f) => [f.y0, f.y1])).toEqual([
			[35.73, 55.53],
			[130.33, 150.13]
		]);
		// the badges come after the points (the start line hides under them, b1-2607…2626)
		const lastBadge = ctx.ops.findLastIndex((o) => o.op === 'fill' && o.style === COLORS.white);
		const lastLine = ctx.ops.findLastIndex((o) => o.op === 'fillRect' && o.style === COLORS.black);
		expect(lastBadge).toBeGreaterThan(lastLine);
	});

	it('spans a sample from x 6.72 to 475.67, the same on every engine', () => {
		expect(sampleX(0)).toBe(6.72);
		expect(sampleX(1)).toBeCloseTo(475.67, 6);
		// the multisampler's zone at rest (b1-2772…2782) and the synth sampler's end alone
		// (b1-2660…2665) put the lines at 6.7 and 475.65
		expect(Math.abs(sampleX(0) - 6.7)).toBeLessThan(0.1);
		expect(Math.abs(sampleX(1) - 475.65)).toBeLessThan(0.1);
		expect(sampleX(2)).toBe(sampleX(1));
	});

	it('marks each point with a black line and three handles in its encoder’s shade', () => {
		const lines = (ctx: RecordingContext) =>
			ctx
				.fillsOf(COLORS.black)
				.filter((f) => near(f.x1 - f.x0, 2) && near(f.y0, 25.45) && f.y1 === 220);
		// TE's 10 × 5 handles: the camera reads 10.4 (dark) to 11.4 (white) of glare
		const handles = (ctx: RecordingContext, shade: string) =>
			ctx.fillsOf(shade).filter((f) => near(f.x1 - f.x0, 10) && near(f.y1 - f.y0, 5));
		// the drum sampler: start on E2 (TE's fourth grey), end on E3 (light grey)
		const d = record(drum({ start: at(177.7), end: at(223) }));
		expect(lines(d).map((f) => (f.x0 + f.x1) / 2)).toEqual([177.7, 223]);
		expect(handles(d, HANDLE_SHADES[1]).map((f) => f.y0)).toEqual([25.45, 120, 214.65]);
		expect(handles(d, HANDLE_SHADES[2]).every((f) => near((f.x0 + f.x1) / 2, 223))).toBe(true);
		// the synth sampler: start, loop start, loop end, end on E1…E4 (b1-2672: 6.75, 211.1, 315.0,
		// 438.7; the camera read the handles 120, 193, 246, 255)
		const s = record(
			synth(
				{ start: at(6.75), end: at(438.7) },
				{ loop: { start: at(211.1), end: at(315), type: 'forever', crossfade: 0 } }
			)
		);
		expect(lines(s).map((f) => Math.round(((f.x0 + f.x1) / 2) * 100) / 100)).toEqual([
			6.75, 211.1, 315, 438.7
		]);
		expect(HANDLE_SHADES).toEqual([COLORS.dark, COLORS.grey3, COLORS.light, COLORS.white]);
		[6.75, 211.1, 315, 438.7].forEach((x, e) => {
			expect(handles(s, HANDLE_SHADES[e]).filter((f) => near((f.x0 + f.x1) / 2, x))).toHaveLength(
				3
			);
		});
	});

	it('scales the wave by the gain in dB, whole pixels either side of the 1 px centre line', () => {
		expect(gainFactor(0.6)).toBeCloseTo(1, 9); // 0 dB
		expect(gainFactor(1)).toBeCloseTo(10, 9); // +20 dB
		expect(gainFactor(0)).toBeCloseTo(10 ** -1.5, 9); // −30 dB
		expect(waveHalf(16, 0.6)).toBe(45.5); // full scale: the lane's half
		expect(waveHalf(8, 0.6)).toBe(22.5);
		expect(waveHalf(0, 1)).toBe(0.5);
		expect(waveHalf(1, 0)).toBe(0.5);
		// +16.7 dB clipped the drum's kick to the lanes (b1-2571)
		expect(waveHalf(16, 1)).toBeGreaterThan(LANES.height);
	});

	it('tints what the sample skips: before the start, after the end and the lanes’ margins', () => {
		const ctx = record(drum({ start: 0.25, end: 0.75 }));
		// a wave at level 4 of 16 stands 11 px either side of the centre line, 45.5 below the lane's
		// top: tinted up to the start, white to the end, tinted after, split to the column
		const mid = 30.3 + 45.5;
		const runs = (color: string) =>
			ctx.fillsOf(color).filter((f) => near(f.y0, mid - 11.5) && near(f.y1, mid + 11.5));
		const tinted = runs(TINT);
		const white = runs(COLORS.white);
		expect(tinted).toHaveLength(2);
		expect(white).toHaveLength(1);
		expect(tinted[0].x0).toBe(6.72);
		expect(Math.abs(tinted[0].x1 - sampleX(0.25))).toBeLessThan(1);
		expect(white[0].x0).toBe(tinted[0].x1);
		expect(Math.abs(white[0].x1 - sampleX(0.75))).toBeLessThan(1);
		expect(tinted[1].x0).toBe(white[0].x1);
		expect(tinted[1].x1).toBeCloseTo(475.67, 1);
		// the centre line carries on through the margins, tinted
		const margins = ctx.fillsOf(TINT).filter((f) => near(f.y1 - f.y0, 1));
		expect(margins.map((f) => [f.x0, f.x1])).toContainEqual([0, 6.72]);
		expect(margins.map((f) => [f.x0, f.x1])).toContainEqual([475.67, 480]);
	});

	it('darkens the drum sampler’s fade as a ramp from the start marker, fade/255 of the sample', () => {
		// fades 26…70 at the device: the ramp's top as measured (b1-2554…2564, 2577, 2583), ±2.5 px;
		// fade 38 (b1-2558) drew 6 px short, the camera catching it mid-change
		for (const [fade, width] of [
			[26, 50.17],
			[32, 57.67],
			[46, 84.05],
			[56, 104.36],
			[57, 104.54],
			[63, 117.2],
			[70, 127.44]
		]) {
			const ramp = fadeRamp(0, fade / 99);
			expect(ramp.x0).toBe(sampleX(0));
			expect(Math.abs(ramp.x1 - ramp.x0 - width)).toBeLessThan(2.5);
		}
		const ctx = record(drum({ fade: 63 / 99 }));
		const shade = ctx.fillsOf(COLORS.panel);
		expect(shade.map((f) => [f.x0, f.y0, f.y1])).toEqual([
			[6.72, 30.3, 120],
			[6.72, 124.9, 214.6]
		]);
		expect(shade[0].x1).toBeCloseTo(6.72 + (63 * 468.95) / 255, 1);
		expect(record(drum({ fade: 0 })).fillsOf(COLORS.panel)).toHaveLength(0);
	});

	it('darkens the loop crossfade as a wedge ending at the loop end, that share of the loop', () => {
		// the synth sampler's 103.5 px loop (b1-2684…2700) and the multisampler's 97.4 px (b1-2759)
		for (const [ls, le, pct, top] of [
			[211.15, 314.6, 10, 304.38],
			[211.15, 314.6, 18, 295.83],
			[211.15, 314.6, 53, 260.05],
			[211.15, 314.6, 75, 237.5],
			[302.0, 399.4, 19, 381.6]
		]) {
			const wedge = crossfadeWedge(at(ls), at(le), pct / 99);
			expect(wedge.x1).toBeCloseTo(le, 6);
			expect(Math.abs(wedge.x0 - top)).toBeLessThan(0.75);
		}
		const frame = synth({}, { loop: { start: 0.3, end: 0.6, type: 'forever', crossfade: 0.5 } });
		const shade = record(frame).fillsOf(COLORS.panel);
		expect(shade).toHaveLength(2);
		expect(shade[0].x1).toBeCloseTo(sampleX(0.6), 6);
	});
});

describe('sampler M1 top rows (measured, note 59 §2.5)', () => {
	it('sets the tune as the device does: the sign centred in a figure’s cell, figures after it', () => {
		// the synth sampler's shift layer (b1-2673…2678): the dash centred at 122.15, "–12.00"'s
		// zeros at pens 152.38 and 163.23
		const s = tuneLayout('–12.00', 116.7);
		expect(s.sign?.x).toBeDefined();
		expect(s.digits).toBeCloseTo(127.6, 6);
		expect(s.note).toBeCloseTo(102, 6);
		// the drum sampler's base layer (b1-2440…2458): the first 0's ink from 27.4 (drum frames
		// moved to the others' place)
		const d = tuneLayout('+0.00', 15.7);
		expect(Math.abs(d.digits + 0.82 - 27.57)).toBeLessThan(0.4);
		expect(tuneText(0)).toBe('+0.00');
		expect(tuneText(-0.1)).toBe('–0.10');
		expect(tuneText(-16.1)).toBe('–16.10');
		expect(tuneText(12)).toBe('+12.00');
	});

	it('shows the drum sampler’s play mode as one of four pictograms at the top right', () => {
		const icons = {
			oneshot: 'sampler.device.play.oneshot',
			key: 'sampler.device.play.key',
			'mute group': 'sampler.device.play.group',
			loop: 'sampler.device.play.loop'
		};
		for (const [mode, name] of Object.entries(icons)) {
			const ctx = record(drum({ playMode: mode }));
			expect(drew(ctx, name, 438, 1.75), mode).toBe(true);
			expect(drew(ctx, 'sampler.device.note', 1, 2)).toBe(true);
		}
	});

	it('draws the synth sampler’s whole sample small on top, tinted outside start and end', () => {
		expect(stripHalf(0, 0.6)).toBe(0.5); // the 1 px line
		expect(stripHalf(16, 0.6)).toBe(6.5);
		expect(stripHalf(6, 0.6)).toBe(2.5); // a lane peak of 17 px drew 2 px either side (b1-2607)
		const ctx = record(synth({ start: 0.5 }, { waves: [flat(0), flat(0)] }));
		const strip = (color: string) =>
			ctx.fills.filter((f) => f.color === color && near(f.y0, 12.25) && near(f.y1, 13.25));
		expect(strip(TINT).map((f) => f.x0)).toEqual([3.4]);
		expect(strip(COLORS.white)).toHaveLength(1);
		expect(Math.abs(strip(COLORS.white)[0].x0 - 240.2)).toBeLessThan(1);
		expect(strip(COLORS.white)[0].x1).toBe(477);
	});

	it('lights the played zone on the multisampler’s keyboard of all 128 notes', () => {
		// the zones lit at the device: C−1…C4, C#4…C5, C#5…C6 (b1-2728…2780), their edges where the
		// white fell to 200 of 252
		const right = (note: number) => keyOf(note).x + KEYBOARD.pitch - KEYBOARD.gap;
		expect(keyOf(0).x).toBeCloseTo(16.43, 2);
		expect(Math.abs(right(60) - 231.0)).toBeLessThan(0.3);
		expect(Math.abs(keyOf(62).x - 232.0)).toBeLessThan(0.3);
		expect(Math.abs(right(72) - 272.9)).toBeLessThan(0.3);
		expect(Math.abs(keyOf(74).x - 273.9)).toBeLessThan(0.3);
		expect(Math.abs(right(84) - 314.87)).toBeLessThan(0.3);
		expect(keyOf(61)).toEqual({ black: true, x: expect.closeTo(231.54, 2) });
		const ctx = record(
			drum({}, { engine: 'multisampler', zone: { lo: 61, hi: 72 }, loop: synth().sampler?.loop })
		);
		const whites = ctx.fills.filter(
			(f) => f.y0 === 0 && near(f.y1, 20.7) && near(f.x1 - f.x0, 5.3837)
		);
		expect(whites).toHaveLength(75);
		expect(whites.filter((f) => f.color === COLORS.white)).toHaveLength(7);
		const blacks = ctx.fills.filter((f) => f.y0 === 0 && near(f.y1, 13.8) && near(f.x1 - f.x0, 5));
		expect(blacks).toHaveLength(53);
		expect(blacks.filter((f) => f.color === COLORS.black)).toHaveLength(5);
	});

	it('shows direction, pan, fade and gain on the drum sampler’s shift layer', () => {
		const ctx = record(drum({ shift: true, reverse: true, pan: 0.5, fade: 63 / 99, gain: 0.6 }));
		expect(drew(ctx, 'sampler.device.direction.backward', 1, 1)).toBe(true);
		expect(drew(ctx, 'sampler.device.ramp', 280.25, 1.34)).toBe(true);
		const box = ctx.fillsOf(COLORS.dark).find((f) => near(f.x0, 142.65));
		expect(box && [box.x1, box.y0, box.y1]).toEqual([182.65, 5.62, 20.47]);
		const bar = ctx.fillsOf(COLORS.white).find((f) => near(f.x1 - f.x0, 2.5) && near(f.y0, 5.62));
		expect(bar && (bar.x0 + bar.x1) / 2).toBeCloseTo(panX(0.5), 1);
		// the bar was seen between 156 and 173 (b1-2545…2551)
		expect(panX(-1)).toBeLessThan(156);
		expect(panX(1)).toBeGreaterThan(173);
		expect(panX(0)).toBeCloseTo(162.65, 6);
		// the gain wedge's white reached 451.4–451.7 at 0 dB (b1-2552…2564, 2673…2699)
		expect(Math.abs(gainEdge(0.6) - 451.55)).toBeLessThan(0.3);
		expect(gainEdge(0)).toBe(425.2);
		expect(gainEdge(1)).toBeCloseTo(469.5, 6);
		const wedge = ctx.fillsOf(COLORS.white).find((f) => f.x0 === 425.2);
		expect(wedge?.x1).toBeCloseTo(gainEdge(0.6), 2);
		expect(ctx.fillsOf(COLORS.grey1).some((f) => near(f.x1, 469.5))).toBe(true);
	});

	it('shows direction, tune, crossfade with its loop type and gain on the samplers’ shift layer', () => {
		const frame = (type: 'forever' | 'release' | 'off') =>
			synth(
				{ shift: true, tune: '–12.00' },
				{ loop: { start: 0.3, end: 0.6, type, crossfade: 75 / 99 } }
			);
		const forever = record(frame('forever'));
		expect(drew(forever, 'sampler.device.direction.forward', 1, 1)).toBe(true);
		expect(drew(forever, 'sampler.device.note', 102, 2)).toBe(true);
		expect(drew(forever, 'sampler.device.ramp', 253, 1)).toBe(true);
		expect(drew(forever, 'sampler.device.forever', 285, 8)).toBe(true);
		// "75" from pen 313.2, the percent sign 1 px left of the pen after it (b1-2689…2699)
		expect(drew(forever, 'sampler.device.percent', 313.2 + 21.8 - 1, 1)).toBe(true);
		expect(drew(record(frame('release')), 'sampler.device.forever', 285, 8)).toBe(false);
		// neither the key nor the root is written on the page
		expect(forever.ops.some((o) => o.op === 'fillText')).toBe(false);
	});
});

describe('sampler M1 frames (from the simulator)', () => {
	it('carries one wave column per pixel and the tune as the device writes it', () => {
		const sim = new OpxySim({ now: () => 0 });
		const f = sim.frame as DrumFrame;
		expect(f.tune).toBe('+0.00');
		expect(f.sampler?.waves?.[0]).toHaveLength(LANE_COLUMNS);
		expect(LANE_COLUMNS).toBe(469);
	});

	it('tunes past an octave, as far as the device went and on to four', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.turn(1, -161); // a drum key at −16.10 (b1-2477)
		expect((sim.frame as DrumFrame).tune).toBe('–16.10');
		sim.turn(1, -1000);
		expect(sim.state.tracks[0].drumKeys[0].tune).toBe(-TUNE_RANGE);
		const s = new OpxySim({ now: () => 0 });
		s.press('track.3');
		s.state.tracks[2].engine = 'sampler';
		s.input({ type: 'press', id: 'key.shift' });
		s.turn(2, -122); // the synth sampler at −12.20 (b1-2680)
		expect((s.frame as DrumFrame).tune).toBe('–12.20');
	});
});
