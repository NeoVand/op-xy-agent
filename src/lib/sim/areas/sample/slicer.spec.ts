import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { SampleSliceFrame } from './frames';
import { demoFile } from './demo';
import { SLICE_COLUMN, transientColumns } from './slicer';

/** T1 with TE's sample on F3, trimmed to its first third, and the slicer open on it. */
function slicing() {
	const clock = { t: 0 };
	const sim = new OpxySim({ now: () => clock.t });
	sim.state.areas.sample.tracks[0].keys[0] = demoFile(20);
	Object.assign(sim.state.tracks[0].drumKeys[0], { start: 0, end: 33 });
	sim.input({ type: 'press', id: 'keyboard.f3' });
	sim.press('key.m1');
	sim.input({ type: 'release', id: 'keyboard.f3' });
	const frame = () => {
		expect(sim.frame.page).toBe('sample-slice');
		return sim.frame as SampleSliceFrame;
	};
	/** Milliseconds of the trimmed part (6.67 s). */
	const span = (20000 * 33) / 99;
	return { sim, clock, frame, span };
}

const at = (column: number) => Math.round(((column * SLICE_COLUMN) / 480) * 10000) / 10000;

describe('the slicer (manual: sampler/slicing)', () => {
	it('opens with key + M1 on a drum sampler key that holds a sample', () => {
		const { frame } = slicing();
		expect(frame()).toMatchObject({ mode: 'transient', count: '8', playhead: null });
		const empty = new OpxySim({ now: () => 0 });
		empty.state.areas.sample.tracks[0].keys[2] = null;
		empty.input({ type: 'press', id: 'keyboard.g3' });
		empty.press('key.m1');
		expect(empty.frame.page).toBe('drum');
	});

	it('cuts at the loudest hits, a drum roll once (TE’s three transients)', () => {
		const { sim, frame } = slicing();
		sim.turn(4, -5);
		expect(frame().count).toBe('3');
		expect(frame().markers.map((m) => m.at)).toEqual([at(5), at(40), at(67)]);
		expect(transientColumns([0, 0, 9, 16, 1, 0, 0, 12, 1], 2)).toEqual([2, 7]);
	});

	it('fills in the loudest stretches when a sample has fewer hits than slices wanted', () => {
		expect(transientColumns([16, 12, 9, 7, 5, 3, 2, 1, 0, 0], 3)).toHaveLength(3);
		expect(transientColumns([0, 0, 0], 2)).toEqual([]);
	});

	it('moves the selected transient slice’s edges with E2 and E3 (push for fine)', () => {
		const { sim, frame } = slicing();
		sim.turn(4, -5);
		sim.press('keyboard.fs3');
		expect(
			frame()
				.markers.filter((m) => m.selected)
				.map((m) => m.at)
		).toEqual([at(40), at(67)]);
		sim.turn(2, 2);
		sim.turn(3, -1, true);
		const marks = frame().markers.map((m) => m.at);
		expect(marks).toContain(at(42));
		expect(marks.some((m) => Math.abs(m - (at(67) - 0.1 * (SLICE_COLUMN / 480))) < 1e-3)).toBe(
			true
		);
		// a new count starts over
		sim.turn(4, 1);
		expect(frame().markers).toHaveLength(4);
	});

	it('splits a section evenly: E2 and E3 set it, E4 the count', () => {
		const { sim, frame } = slicing();
		sim.turn(1, 1);
		sim.turn(4, 1);
		expect(frame()).toMatchObject({ mode: 'even', count: '9' });
		sim.turn(2, 1);
		sim.turn(3, -5);
		const marks = frame().markers.map((m) => m.at);
		expect(marks).toHaveLength(10);
		expect(marks[0]).toBeCloseTo(0.01);
		expect(marks[9]).toBeCloseTo(0.95);
		expect(marks[1] - marks[0]).toBeCloseTo(0.94 / 9, 3);
	});

	it('taps slice points as the sample plays; M2 lets the last run to the end', () => {
		const { sim, clock, frame, span } = slicing();
		sim.turn(1, 5);
		expect(frame()).toMatchObject({ mode: 'tap', count: '0' });
		sim.press('key.m1');
		expect(frame().playhead).toBe(0);
		for (const f of [0.1, 0.3, 0.6]) {
			clock.t = f * span;
			sim.press('key.m1');
		}
		expect(frame().markers.map((m) => m.at)).toEqual([0.1, 0.3, 0.6]);
		expect(frame().count).toBe('2');
		sim.press('key.m2');
		expect(frame()).toMatchObject({ count: '3', playhead: null });
		// shift + key deletes that key's slice
		sim.input({ type: 'press', id: 'key.shift' });
		sim.press('keyboard.fs3');
		sim.input({ type: 'release', id: 'key.shift' });
		expect(frame().markers.map((m) => m.at)).toEqual([0.1, 0.6]);
		// E2 moves the selected slice's start
		sim.press('keyboard.fs3');
		sim.turn(2, -2);
		expect(frame().markers[1].at).toBeCloseTo(0.6 - (2 * SLICE_COLUMN) / 480, 4);
	});

	it('plays a slice when its key is pressed, white up to the playhead', () => {
		const { sim, frame, span } = slicing();
		sim.turn(4, -5);
		sim.press('keyboard.g3');
		expect(frame().playhead).toBeCloseTo(at(67));
		sim.advance(0.05 * span);
		expect(frame().playhead).toBeCloseTo(at(67) + 0.05, 3);
		sim.advance(span);
		expect(frame().playhead).toBeNull();
		expect(sim.leds['keyboard.g3']).toBe('white');
		expect(sim.leds['keyboard.f3']).toBe('dim');
		expect(sim.leds['keyboard.gs3']).toBe('off');
	});

	it('fills the keys from F3 with the slices on done, choking each other', () => {
		const { sim } = slicing();
		sim.turn(4, -5);
		sim.press('key.m4');
		expect(sim.frame.page).toBe('drum');
		const t = sim.state.tracks[0];
		const keys = sim.state.areas.sample.tracks[0].keys;
		expect(keys.slice(0, 3).map((k) => k?.name)).toEqual(Array(3).fill('ch mart b.wav'));
		expect(t.drumKeys.slice(0, 3).map((k) => k.playMode)).toEqual(Array(3).fill('mute group'));
		expect(t.drumKeys.slice(0, 3).map((k) => [k.start, k.end])).toEqual([
			[2, 17],
			[17, 29],
			[29, 33]
		]);
		expect(keys[3]?.name).toBe('snare 2.wav');
	});

	it('changes nothing on cancel, and leaves when another track is chosen', () => {
		const { sim } = slicing();
		sim.turn(4, -5);
		sim.press('key.m3');
		expect(sim.frame.page).toBe('drum');
		expect(sim.state.tracks[0].drumKeys[1].playMode).toBe('oneshot');
		sim.input({ type: 'press', id: 'keyboard.f3' });
		sim.press('key.m1');
		sim.input({ type: 'release', id: 'keyboard.f3' });
		sim.press('track.2');
		expect(sim.state.overlay).toBeNull();
		expect(sim.state.track).toBe(1);
	});

	it('clamps the mode at both ends of the list', () => {
		const { sim, frame } = slicing();
		sim.turn(1, -3);
		expect(frame().mode).toBe('transient');
		sim.turn(1, 9);
		expect(frame().mode).toBe('tap');
	});
});
