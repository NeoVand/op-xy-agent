import { describe, expect, it } from 'vitest';
import type { EngineId } from '$lib/core/opxy';
import { TABLES } from '$lib/sound/synth/engines/wavetable';
import { OpxySim } from '../../../opxy-sim.svelte';
import { FADE_MS, SLIDE_MS } from '../../../motion';
import { defaultTrack, engineCell } from '../../../params';
import type { SynthFrame } from '../../frame';
import { RAMP } from '../../palette';
import { RecordingContext } from '../../recording';
import { renderFrame } from '../../render';
import { AXIS, axisBlocks, axisRay, lattice, liftOf, travelled, yLineStart } from './axis';
import { litShare, topGrey, greySpread } from './dissolve';
import { EPIANO, notchPoints } from './epiano';
import { blockWidth, hardsyncBlocks, riseX, subFill } from './hardsync';
import { organCaps } from './organ';
import { concaveX, convexBulge, prismRays, prismTriangle, rayLevel, wedgeAngle } from './prism';
import { loopCentre, simpleCoils, simpleJars, SIMPLE } from './simple';
import { tableIndex, warpedX, wavetableCycle, WAVE } from './wavetable';

const ENGINES = [
	'prism',
	'simple',
	'organ',
	'epiano',
	'dissolve',
	'hardsync',
	'axis',
	'wavetable'
] as const satisfies readonly EngineId[];

const deg = (rad: number) => (rad * 180) / Math.PI;

/** A synth frame as the core builds it, every lane at `cc` (0–127). */
function frameAt(engine: EngineId, cc: number, extra: Partial<SynthFrame> = {}): SynthFrame {
	const v = Math.round((cc * 99) / 127);
	return {
		page: 'synth',
		engine,
		header: [0, 1, 2, 3].map((i) => engineCell(engine, i, v)),
		params: [v, v, v, v].map((x) => x / 99),
		...extra
	};
}

function draw(frame: SynthFrame, tick = 0): RecordingContext {
	const ctx = new RecordingContext();
	renderFrame(ctx, frame, { tick });
	return ctx;
}

describe('synth engine pictures: mappings measured on the device (research 59 §2.5)', () => {
	it('prism: the triangle grows as shape^1.5, the lenses and arms follow ratio, detune, stereo', () => {
		expect(prismTriangle(0).side).toBeCloseTo(59.6, 5);
		expect(prismTriangle(1).side).toBeCloseTo(90.52, 5);
		expect(prismTriangle(0.5).side).toBeCloseTo(59.6 + 30.92 * 0.5 ** 1.5, 5);
		const t = prismTriangle(1);
		expect(t.left[1] - t.apex[1]).toBeCloseTo(0.87 * t.side, 5);
		expect((t.left[1] + t.apex[1]) / 2).toBeCloseTo(119.87, 5);
		expect(convexBulge(0)).toBe(0);
		expect(convexBulge(1)).toBeCloseTo(14.6, 5);
		expect(concaveX(0)).toBeCloseTo(279.7, 5);
		expect(concaveX(1)).toBeCloseTo(319.6, 5);
		expect(deg(wedgeAngle(0))).toBeCloseTo(4.32, 5);
		expect(deg(wedgeAngle(1))).toBeCloseTo(23.68, 5);
	});

	it('prism: three rays leave the triangle, spread past the lenses and end before the arrowhead', () => {
		for (const params of [
			[0, 0, 0, 0],
			[0.5, 0.5, 0.5, 0.5],
			[1, 1, 1, 1]
		]) {
			const { entry, rays } = prismRays(params);
			expect(rays).toHaveLength(3);
			expect(entry[1]).toBeCloseTo(126.2, 5);
			for (const ray of rays) {
				const last = ray.points[ray.points.length - 1];
				expect(last[0]).toBeCloseTo(374, 5);
				for (const [x, y] of ray.points)
					expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
				// left to right, one face after another
				const xs = ray.points.map((p) => p[0]);
				expect([...xs].sort((a, b) => a - b)).toEqual(xs);
			}
			// crossed at the convex lens's focus and fanned out by the concave one: the top ray ends lowest
			const ends = rays.map((r) => r.points[r.points.length - 1][1]);
			expect(ends[0]).toBeGreaterThan(ends[1]);
			expect(ends[1]).toBeGreaterThan(ends[2]);
		}
	});

	it('prism: the rays rise on a note, glow while it holds and fade once the notes stop', () => {
		const at = (notes: number, onset: number | null, release: number | null) =>
			rayLevel({ time: 0, travel: 0, notes, onset, release });
		expect(at(0, null, null)).toBe(0);
		expect(at(1, 0, null)).toBe(0);
		expect(at(1, 40, null)).toBeGreaterThan(0.9);
		expect(at(1, 5000, null)).toBeCloseTo(0.6, 3);
		expect(at(0, null, 0)).toBeCloseTo(0.6, 5);
		expect(at(0, null, 1000)).toBeLessThan(0.01);
	});

	it('organ: type stops a drawbar per type (one stop out at the first), the others slide 160 px', () => {
		expect(organCaps([0, 0, 0, 0])).toEqual([24.6, 4.6, 4.6, 4.6]);
		const full = organCaps([1, 1, 1, 1]);
		expect(full[0]).toBeCloseTo(4.6 + 20 * 8, 5);
		for (const top of full.slice(1)) expect(top).toBeCloseTo(164.6, 5);
		expect(organCaps([0.5, 0.25, 0.5, 0.75])).toEqual([104.6, 44.6, 84.6, 124.6]);
		// eight equal zones for the types
		expect(organCaps([0.124, 0, 0, 0])[0]).toBeCloseTo(24.6, 5);
		expect(organCaps([0.126, 0, 0, 0])[0]).toBeCloseTo(44.6, 5);
	});

	it('hardsync: freq narrows the blocks as freq², lowcut slides the rise, sub fills the dot', () => {
		expect(blockWidth(0)).toBeCloseTo(99.5, 5);
		expect(blockWidth(1)).toBeCloseTo(35.1, 5);
		expect(blockWidth(0.5)).toBeCloseTo(99.5 - 64.4 / 4, 5);
		expect(riseX(0)).toBeCloseTo(204.6, 5);
		expect(riseX(1)).toBeCloseTo(429.8, 5);
		expect(subFill(0)).toBe(0);
		expect(subFill(0.76)).toBe(247);
		expect(subFill(1)).toBe(247);
		expect(subFill(0.38)).toBeGreaterThan(0);
		expect(subFill(0.38)).toBeLessThan(247);
	});

	it('hardsync: the blocks stand in a row from the nozzle and blow right, each keeping its grey', () => {
		const still = hardsyncBlocks(0, 0, 0);
		expect(still[0].x).toBeCloseTo(213.5, 5);
		expect(still.every((b) => b.y === 49.6)).toBe(true);
		expect(still[still.length - 1].x + still[still.length - 1].w).toBeGreaterThanOrEqual(480);
		// pushed one block width along, every block has moved into its neighbour's place
		const w = blockWidth(0);
		const moved = hardsyncBlocks(0, 0, w / 0.89);
		expect(moved[1].x).toBeCloseTo(still[0].x + w, 5);
		expect(moved[1].color).toBe(still[0].color);
		// noise scatters them within 18 px
		const ys = hardsyncBlocks(0, 1, 0).map((b) => b.y);
		expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(18);
		expect(new Set(ys).size).toBeGreaterThan(1);
	});

	it('dissolve: am lights more squares, fm whitens them, swarm evens the greys out', () => {
		expect(litShare(0)).toBeCloseTo(0.35, 5);
		expect(litShare(0.6)).toBeCloseTo(0.35, 5);
		expect(litShare(0.7)).toBeCloseTo(0.39, 5);
		expect(litShare(1)).toBeCloseTo(0.51, 5);
		const level = (i: number) => parseInt(RAMP[i].slice(1, 3), 16);
		expect(topGrey(0)).toBeCloseTo(level(2) + 0.8 * (level(3) - level(2)), 5);
		expect(topGrey(0.75)).toBe(level(7));
		expect(topGrey(1)).toBe(level(7));
		expect(topGrey(1, 1)).toBe(level(6));
		expect(greySpread(0)).toBeCloseTo(0.75, 5);
		expect(greySpread(0.4)).toBeCloseTo(0.75, 5);
		expect(greySpread(0.9)).toBeCloseTo(0.2, 5);
		expect(greySpread(1)).toBeCloseTo(0.2, 5);
	});

	it('epiano: each notch slides 84.6 px up its layer’s front edge', () => {
		for (let i = 0; i < 3; i++) {
			const [x0, y0] = notchPoints(i, 0)[0];
			expect([x0, y0]).toEqual(EPIANO.corners[i]);
			const [x1, y1] = notchPoints(i, 1)[0];
			expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(84.6, 1);
			expect(y1).toBeLessThan(y0);
		}
	});

	it('wavetable: nine tables in equal zones, frames from the sound engine, warp pinned at the ends', () => {
		expect(tableIndex(0)).toBe(0);
		expect(tableIndex(0.5)).toBe(4);
		expect(tableIndex(1)).toBe(TABLES.length - 1);
		for (let t = 0; t < TABLES.length; t++) {
			for (const position of [0, 0.37, 1]) {
				const cycle = wavetableCycle(t / TABLES.length + 0.01, position);
				expect(cycle).toHaveLength(WAVE.points + 1);
				expect(cycle.every((v) => Number.isFinite(v))).toBe(true);
				// on screen: within the page under the header
				const ys = Array.from(cycle, (v) => WAVE.centre - WAVE.scale * v);
				expect(Math.min(...ys)).toBeGreaterThan(20);
				expect(Math.max(...ys)).toBeLessThan(220);
			}
		}
		for (const warp of [0, 0.5, 1]) {
			for (const turn of [0, 1, 4]) {
				expect(warpedX(0, warp, turn)).toBeCloseTo(0, 9);
				expect(warpedX(1, warp, turn)).toBeCloseTo(1, 9);
			}
		}
		expect(warpedX(0.3, 0)).toBe(0.3);
		expect(warpedX(0.3, 1)).not.toBeCloseTo(0.3, 2);
	});

	it('axis: the lattice, the lines carried along by tone and shape, ratio’s slide, tremolo’s lift', () => {
		expect(lattice(0, 0, 0)).toEqual(AXIS.origin);
		expect(lattice(1, 1, 1)).toEqual([224.5 + 29, 119.5 - 16.5]);
		for (let r = 0; r < 8; r++) {
			expect(travelled(r, 8, 0)).toBeCloseTo(-7 + r, 9);
			expect(travelled(r, 8, 1)).toBeCloseTo(1 + r, 9);
		}
		// the near blocks go first
		expect(travelled(7, 8, 0.5) - (-7 + 7)).toBeGreaterThan(travelled(0, 8, 0.5) - -7);
		expect(travelled(0, 5, 1, AXIS.columnSpread)).toBeCloseTo(1, 9);
		expect(yLineStart(0)).toBeCloseTo(-7.2, 9);
		expect(yLineStart(1)).toBeCloseTo(-3, 9);
		expect(liftOf(0, 0)).toBe(0);
		expect(liftOf(0, 1)).toBeCloseTo(7.3, 9);
		expect(liftOf(8, 1)).toBeCloseTo(7.3, 9);
		expect(liftOf(8, 0.5)).toBe(0);
		for (const ratio of [0, 0.5, 1]) {
			const { from, to } = axisRay(ratio);
			expect(from[1]).toBeCloseTo(0.66 * from[0] - 44.5, 9);
			expect(to[0]).toBe(482);
		}
		expect(axisBlocks([0.5, 0.5, 0.5, 0.5])).toHaveLength(8 + 5 + 8 + 2);
	});

	it('simple: stereo parts the jars, the loop and the edge-on coils ride them', () => {
		expect(simpleJars(0)).toEqual([
			[221.5, 96],
			[221.5, 96]
		]);
		expect(simpleJars(1)).toEqual([
			[200.5, 106],
			[242.5, 85.5]
		]);
		expect(loopCentre(0, 0, 0)).toEqual([207.2, 66.4]);
		const loop = loopCentre(1, 1, 1);
		expect(loop[0]).toBeCloseTo(207.2 + 21 + 4 + 3, 9);
		expect(loop[1]).toBeCloseTo(66.4 - 10.5 - 2 + 2.5, 9);
		// the steep coil goes with the left jar, the shallow one's tip with the right jar
		const [steep0, shallow0] = simpleCoils(0.5, 0.5, 0);
		const [steep1, shallow1] = simpleCoils(0.5, 0.5, 1);
		expect(steep1.c[0] - steep0.c[0]).toBeCloseTo(-21 + SIMPLE.steep.stereo[0], 9);
		expect(steep1.c[1] - steep0.c[1]).toBeCloseTo(10 + SIMPLE.steep.stereo[1], 9);
		expect(shallow1.c[0] - shallow0.c[0]).toBeCloseTo(21, 9);
		expect(shallow1.c[1] - shallow0.c[1]).toBeCloseTo(-10.5, 9);
		expect(steep0.lean).toBeCloseTo(-41.3, 9);
		expect(shallow0.lean).toBeCloseTo(-23.6, 9);
		// the start state's coils, as fitted on its frame (steps-101)
		const [a, b] = simpleCoils(59 / 127, 84 / 127, 23 / 127);
		expect(a.c[0]).toBeCloseTo(216.2, 0);
		expect(a.c[1]).toBeCloseTo(75.4, 0);
		const tip = [
			b.c[0] + b.rx * Math.cos((b.lean * Math.PI) / 180),
			b.c[1] + b.rx * Math.sin((b.lean * Math.PI) / 180)
		];
		expect(tip[0]).toBeCloseTo(240.1, 0);
		expect(tip[1]).toBeCloseTo(76.3, 0);
	});
});

describe('synth engine pictures: drawing', () => {
	const MOTIONS: Partial<SynthFrame>[] = [
		{},
		{ notes: 0, travel: 0, time: 0 },
		{ notes: 1, onset: 0, travel: 10, time: 500 },
		{ notes: 2, onset: 180, travel: 700, time: 1200 },
		{ notes: 0, release: 90, travel: 700, time: 1400 },
		{ shown: [0.2, 0.4, 0.6, 0.8] }
	];

	// several hundred full drawings: more than the default 5 s when the whole suite runs at once
	it(
		'draws every engine at CC 0, 64 and 127, at several ticks and while notes sound, with finite numbers only',
		{ timeout: 60_000 },
		() => {
			for (const engine of ENGINES) {
				for (const cc of [0, 64, 127]) {
					for (const motion of MOTIONS) {
						for (const tick of [0, 3, 17]) {
							const ctx = draw(frameAt(engine, cc, motion), tick);
							const where = `${engine} cc ${cc} tick ${tick} ${JSON.stringify(motion)}`;
							expect(ctx.ops.length, where).toBeGreaterThan(20);
							for (const op of ctx.ops) {
								for (const a of op.args) {
									if (typeof a === 'number')
										expect(Number.isFinite(a), `${where}: ${op.op}`).toBe(true);
								}
							}
						}
					}
				}
			}
		}
	);

	it('keeps the top bars the device shows: none on organ, plain on simple and axis, the ramp elsewhere', () => {
		const rampCells = (ctx: RecordingContext) =>
			ctx.fills.filter((f) => f.y0 === 0 && f.y1 === 20 && f.x1 - f.x0 === 60 && f.x0 % 60 === 0);
		for (const engine of ENGINES) {
			const cells = rampCells(draw(frameAt(engine, 64)));
			if (engine === 'organ' || engine === 'simple' || engine === 'axis') {
				expect(cells, engine).toHaveLength(0);
			} else {
				expect(
					cells.map((c) => c.color),
					engine
				).toEqual(RAMP.slice());
			}
		}
	});

	it('moves only what the device moves: still pictures stay still, the sounding ones change', () => {
		const ops = (frame: SynthFrame, tick = 0) => JSON.stringify(draw(frame, tick).ops);
		// with the core's motion (its clock, and a sound clock that stands still) the render tick moves nothing
		for (const engine of ENGINES) {
			const still = frameAt(engine, 64, { notes: 0, travel: 500, time: 1000 });
			expect(ops(still, 0), engine).toBe(ops(still, 9));
		}
		// the sound clock stirs dissolve and blows hardsync's blocks
		for (const engine of ['dissolve', 'hardsync'] as const) {
			expect(ops(frameAt(engine, 64, { travel: 0 })), engine).not.toBe(
				ops(frameAt(engine, 64, { travel: 300 }))
			);
		}
		// prism's rays show only while a note sounds or fades
		const strokes = (frame: SynthFrame) => draw(frame).ops.filter((o) => o.op === 'stroke').length;
		const quiet = strokes(frameAt('prism', 64, { notes: 0 }));
		expect(strokes(frameAt('prism', 64, { notes: 1, onset: 100 }))).toBeGreaterThan(quiet);
		expect(strokes(frameAt('prism', 64, { notes: 0, release: 50 }))).toBeGreaterThan(quiet);
		// wavetable's drift turns the bend with the clock
		const drift = (time: number) => ops(frameAt('wavetable', 100, { time }));
		expect(drift(0)).not.toBe(drift(250));
		// organ draws its drawbars where they are on their way
		const organ = (shown?: number[]) =>
			draw(frameAt('organ', 127, shown ? { shown } : {})).fills.filter(
				(f) => f.x1 - f.x0 === 50 && f.y1 - f.y0 === 35
			);
		expect(organ()[1].y0).toBeCloseTo(164.6, 1);
		expect(organ([0, 0, 0, 0])[1].y0).toBeCloseTo(4.6, 1);
	});
});

describe('synth engine motion (motion.ts)', () => {
	/** A new project on track `n` at M1 (T3 is prism, T4 epiano, T5 dissolve). */
	function onTrack(n: number, engine: EngineId): OpxySim {
		const sim = new OpxySim();
		sim.press(`track.${n}`);
		expect(sim.state.tracks[n - 1].engine).toBe(engine);
		return sim;
	}

	const synth = (sim: OpxySim) => {
		const frame = sim.frame;
		expect(frame.page).toBe('synth');
		return frame as SynthFrame;
	};

	it('stands still until a note sounds, then counts from its onset and runs the sound clock', () => {
		const sim = onTrack(5, 'dissolve');
		sim.advance(100);
		expect(synth(sim)).toMatchObject({ notes: 0, travel: 0 });
		expect(synth(sim).onset).toBeUndefined();
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.advance(50);
		expect(synth(sim)).toMatchObject({ notes: 1, onset: 0 });
		expect(synth(sim).travel).toBeGreaterThan(40);
		sim.advance(200);
		expect(synth(sim).onset).toBe(200);
		sim.input({ type: 'press', id: 'keyboard.e4' });
		sim.advance(10);
		// a second note is a new onset
		expect(synth(sim)).toMatchObject({ notes: 2, onset: 0 });
	});

	it('fades after the last note stops, then forgets it; the sound clock stops with the notes', () => {
		const sim = onTrack(5, 'dissolve');
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.advance(300);
		sim.input({ type: 'release', id: 'keyboard.c4' });
		sim.advance(20);
		expect(synth(sim)).toMatchObject({ notes: 0, release: 0 });
		const travel = synth(sim).travel;
		sim.advance(500);
		expect(synth(sim).release).toBe(500);
		expect(synth(sim).travel).toBe(travel);
		sim.advance(FADE_MS);
		expect(synth(sim).release).toBeUndefined();
	});

	it('the sound clock runs fastest just after a note begins', () => {
		const sim = onTrack(5, 'dissolve');
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.advance(10);
		const t0 = synth(sim).travel ?? 0;
		sim.advance(100);
		const early = (synth(sim).travel ?? 0) - t0;
		sim.advance(2000);
		const t1 = synth(sim).travel ?? 0;
		sim.advance(100);
		const late = (synth(sim).travel ?? 0) - t1;
		expect(early).toBeGreaterThan(late * 2);
		expect(late).toBeCloseTo(25, 0);
	});

	it('hands each picture only what moves it: the still ones keep one frame while notes sound', () => {
		const prism = onTrack(3, 'prism');
		prism.input({ type: 'press', id: 'keyboard.c4' });
		prism.advance(30);
		expect(synth(prism)).toMatchObject({ notes: 1, onset: 0 });
		expect(synth(prism).travel).toBeUndefined();
		const epiano = onTrack(4, 'epiano');
		epiano.advance(10);
		const before = synth(epiano);
		epiano.input({ type: 'press', id: 'keyboard.c4' });
		epiano.advance(30);
		expect(synth(epiano)).toEqual(before);
		const hardsync = onTrack(3, 'prism');
		Object.assign(hardsync.state.tracks[2], defaultTrack('hardsync'));
		hardsync.input({ type: 'press', id: 'keyboard.c4' });
		hardsync.advance(30);
		expect(synth(hardsync).travel).toBeGreaterThan(0);
		expect(synth(hardsync).notes).toBeUndefined();
	});

	it('slides organ’s drawbars to new values and snaps on another track', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		const t = sim.state.tracks[2];
		Object.assign(t, defaultTrack('organ'));
		t.m1 = [0, 0, 0, 0];
		sim.advance(10);
		expect(synth(sim).shown).toBeUndefined();
		t.m1 = [0, 99, 0, 0];
		sim.advance(SLIDE_MS);
		const shown = synth(sim).shown ?? [];
		expect(shown[1]).toBeCloseTo(1 - Math.exp(-1), 3);
		sim.advance(2000);
		expect(synth(sim).shown).toBeUndefined();
		// a track with other values snaps into place
		sim.press('track.4');
		sim.advance(10);
		expect(synth(sim).shown).toBeUndefined();
	});

	it('gives wavetable its clock while drift turns the bend', () => {
		const sim = new OpxySim();
		sim.press('track.3');
		const t = sim.state.tracks[2];
		Object.assign(t, defaultTrack('wavetable'));
		t.m1 = [10, 50, 60, 0];
		sim.advance(40);
		expect(synth(sim).time).toBeUndefined();
		t.m1 = [10, 50, 60, 70];
		sim.advance(40);
		expect(synth(sim).time).toBe(80);
		// without warp's bend there is nothing for drift to turn
		t.m1 = [10, 50, 0, 70];
		sim.advance(40);
		expect(synth(sim).time).toBeUndefined();
	});
});
