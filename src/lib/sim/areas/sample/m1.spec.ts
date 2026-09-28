import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { DrumFrame } from '../../screen/frame';
import { demoFile } from './demo';
import { LANE_COLUMNS, noteLetter, noteName, turnRegion, zoneOf } from './m1';
import { defaultRegion } from './state';
import { decodeWave } from './wave';

function drum(sim: OpxySim): DrumFrame {
	expect(sim.frame.page).toBe('drum');
	return sim.frame as DrumFrame;
}

/** Holds keyboard key `key` while pressing `m`. */
function keyCombo(sim: OpxySim, key: string, m: string): void {
	sim.input({ type: 'press', id: `keyboard.${key}` });
	sim.press(m);
	sim.input({ type: 'release', id: `keyboard.${key}` });
}

describe('the drum sampler’s M1 page (manual: sampler/drum-key-settings)', () => {
	it('shows the selected key’s sample on both lanes, nothing for an empty key', () => {
		const sim = new OpxySim({ now: () => 0 });
		const view = drum(sim).sampler;
		expect(view?.engine).toBe('drum');
		expect(view?.waves?.[0]).toHaveLength(LANE_COLUMNS);
		expect(view?.waves?.[0]).toBe(view?.waves?.[1]);
		expect(decodeWave(view?.waves?.[0] ?? '')[0]).toBeGreaterThan(0);
		sim.state.areas.sample.tracks[0].keys[1] = null;
		sim.press('keyboard.fs3');
		expect(drum(sim).sampler?.waves).toBeNull();
	});

	it('edits every key selected with key + M4 together', () => {
		const sim = new OpxySim({ now: () => 0 });
		keyCombo(sim, 'g3', 'key.m4');
		keyCombo(sim, 'a3', 'key.m4');
		sim.press('keyboard.f3');
		expect(drum(sim).key).toBe('F3 +2');
		sim.turn(1, 5);
		const tunes = sim.state.tracks[0].drumKeys.slice(0, 5).map((k) => k.tune);
		expect(tunes).toEqual([0.5, 0, 0.5, 0, 0.5]);
		keyCombo(sim, 'g3', 'key.m4');
		expect(sim.state.areas.sample.tracks[0].selection).toEqual([4]);
	});

	it('copies a key with key + M2 and pastes it with key + M3', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.state.tracks[0].drumKeys[0].tune = -3;
		keyCombo(sim, 'f3', 'key.m2');
		keyCombo(sim, 'e5', 'key.m3');
		expect(sim.state.areas.sample.tracks[0].keys[23]?.name).toBe('kick 1.wav');
		expect(sim.state.tracks[0].drumKeys[23].tune).toBe(-3);
		// the pasted key is its own copy
		sim.state.tracks[0].drumKeys[23].tune = 1;
		expect(sim.state.tracks[0].drumKeys[0].tune).toBe(-3);
		// without a key held, M2 turns the page as always
		sim.press('key.m2');
		expect(sim.frame.page).toBe('envelope');
	});
});

describe('the synth sampler’s M1 page (manual: sampler/synth-sampler)', () => {
	function synth() {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		return sim;
	}

	it('turns start, loop start, loop end and end, finer when pushed', () => {
		const sim = synth();
		const r = sim.state.areas.sample.tracks[2].synth.region;
		sim.turn(1, 10);
		sim.turn(2, 5, true);
		sim.turn(3, -10);
		sim.turn(4, -5);
		expect(r).toMatchObject({ start: 0.1, loopStart: 0.205, loopEnd: 0.7, end: 0.95 });
		expect(drum(sim)).toMatchObject({ start: 0.1, end: 0.95, key: 'C4' });
		expect(drum(sim).sampler).toMatchObject({
			engine: 'sampler',
			root: 'C',
			loop: { start: 0.205, end: 0.7, type: 'forever', crossfade: 0 }
		});
	});

	it('keeps the points in order and lets loop start reach the end (no loop)', () => {
		const r = defaultRegion();
		turnRegion(r, 1, 200, false, false);
		expect(r.loopStart).toBe(1);
		expect(r.loopEnd).toBe(1);
		turnRegion(r, 3, -50, false, false);
		expect(r).toMatchObject({ end: 0.5, loopStart: 0.5, loopEnd: 0.5 });
		turnRegion(r, 0, 80, false, false);
		expect(r.start).toBe(0.499);
		expect(r.loopStart).toBeGreaterThanOrEqual(r.start);
	});

	it('edits direction, tune, crossfade and gain with shift; shift + click E3 steps the loop type', () => {
		const sim = synth();
		sim.input({ type: 'press', id: 'key.shift' });
		sim.turn(1, -1);
		sim.turn(2, -12);
		sim.turn(3, 40);
		sim.turn(4, 7);
		sim.click(3);
		const r = sim.state.areas.sample.tracks[2].synth.region;
		expect(r).toMatchObject({ reverse: true, tune: -1.2, crossfade: 40, gain: 7, loop: 'release' });
		expect(drum(sim)).toMatchObject({ shift: true, tune: '–1.20', reverse: true });
		sim.click(3);
		sim.click(3);
		expect(r.loop).toBe('forever');
		sim.input({ type: 'release', id: 'key.shift' });
		// without shift, a click does nothing here
		sim.click(3);
		expect(r.loop).toBe('forever');
	});
});

describe('the multisampler’s M1 page (manual: sampler/multisampler)', () => {
	it('edits the zone of the selected key and shows it on the key strip', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.8');
		sim.press('keyboard.c4');
		expect(drum(sim).sampler).toMatchObject({ engine: 'multisampler', zone: { lo: 58, hi: 64 } });
		sim.turn(4, -20);
		const zones = sim.state.areas.sample.tracks[7].zones;
		expect(zones[1].region.end).toBe(0.8);
		expect(zones[0].region.end).toBe(1);
		sim.press('keyboard.e5');
		expect(drum(sim).sampler?.zone).toEqual({ lo: 72, hi: 76 });
	});

	it('is empty above the top zone', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('track.8');
		sim.press('key.plus');
		sim.press('keyboard.e5');
		expect(drum(sim).sampler).toMatchObject({ waves: null, zone: null });
		sim.turn(1, 5);
		expect(sim.state.areas.sample.tracks[7].zones.every((z) => z.region.start === 0)).toBe(true);
	});

	it('finds zones: each runs down to the previous zone’s top', () => {
		const zones = [64, 84].map((note) => ({ note, file: demoFile(), region: defaultRegion() }));
		expect(zoneOf(zones, 0)).toMatchObject({ lo: 0, hi: 64 });
		expect(zoneOf(zones, 65)).toMatchObject({ lo: 65, hi: 84 });
		expect(zoneOf(zones, 85)).toBeNull();
	});
});

describe('note names', () => {
	it('names notes with C4 = 60, the badge without the octave', () => {
		expect(noteName(60)).toBe('C4');
		expect(noteName(56)).toBe('G#3');
		expect(noteName(0)).toBe('C-1');
		expect(noteLetter(55)).toBe('G');
		expect(noteLetter(70)).toBe('A#');
	});
});
