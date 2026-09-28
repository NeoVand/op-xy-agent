import { describe, expect, it } from 'vitest';
import { defaultState, type SimState } from '$lib/sim/params';
import { currentPattern, toggleStep } from '$lib/sim/sequencer';
import { Scheduler, type PunchEvent, type ScheduledNote } from '../scheduler';
import { PUNCH_FIRST_NOTE } from './effects';

/** 120 BPM: a sixteenth lasts 0.125 s. */
const SIXTEENTH = 0.125;

/** A scheduler on a hand-turned clock, with the punch-in track (aux T2) on screen. */
function rig() {
	const state: SimState = defaultState();
	state.tempo.metronome.on = false;
	state.mode = 'auxiliary';
	state.auxTrack = 1;
	const clock = { now: 0 };
	const notes: ScheduledNote[] = [];
	const punches: PunchEvent[] = [];
	const scheduler = new Scheduler({
		state: () => state,
		now: () => clock.now,
		sink: {
			note: (e) => notes.push(e),
			click: () => {},
			punch: (e) => punches.push(e),
			stop: () => {}
		}
	});
	const run = (seconds: number) => {
		const end = clock.now + seconds;
		while (clock.now < end - 1e-9) {
			scheduler.tick();
			clock.now = Math.min(end, clock.now + 0.025);
		}
		scheduler.tick();
	};
	const play = () => {
		state.transport.playing = true;
		state.transport.position = 0;
	};
	/** Fills track `k`'s pattern: step i plays `note(i)`. */
	const steps = (k: number, count: number, note: (i: number) => number) => {
		const pattern = currentPattern(state.tracks[k].sequence);
		for (let i = 0; i < count; i++) toggleStep(pattern, i, [note(i)]);
	};
	/** Track `k`'s notes as [sixteenth, note], in time order. */
	const heard = (k: number) =>
		notes
			.filter((n) => n.track === k)
			.map((n) => [Math.round((n.time - (scheduler.anchor?.time ?? 0)) / SIXTEENTH), n.note]);
	const hold = (...keys: string[]) => (state.held = keys.map((k) => `keyboard.${k}`));
	return { state, clock, notes, punches, scheduler, run, play, steps, heard, hold };
}

describe('punch-in effects on the sequencer’s notes', () => {
	it('repeats the steps from where the key went down, and the pattern carries on in place after', () => {
		const { run, play, steps, heard, hold } = rig();
		steps(0, 16, (i) => 53 + i);
		// A3: three steps over and over, on the drums
		hold('a3');
		play();
		run(1);
		hold();
		run(1);
		const t1 = heard(0);
		for (const [at, note] of t1.filter(([at]) => at <= 8)) expect(note).toBe(53 + (at % 3));
		for (const [at, note] of t1.filter(([at]) => at >= 11)) expect(note).toBe(53 + (at % 16));
	});

	it('moves the synths an octave down and plays the drums an octave up', () => {
		const { run, play, steps, notes, hold } = rig();
		steps(0, 4, () => 53);
		steps(2, 4, () => 60);
		// both A♯ keys: the octave on each group
		hold('as3', 'as4');
		play();
		run(0.4);
		const synth = notes.filter((n) => n.track === 2);
		const drums = notes.filter((n) => n.track === 0);
		expect(synth.length).toBeGreaterThan(0);
		expect(synth.every((n) => n.note === 48)).toBe(true);
		expect(drums.every((n) => n.note === 53 && n.tune === 12)).toBe(true);
	});

	it('leaves the other group alone', () => {
		const { run, play, steps, notes, hold } = rig();
		steps(0, 4, () => 53);
		steps(2, 4, () => 60);
		hold('as4');
		play();
		run(0.4);
		expect(notes.filter((n) => n.track === 0).every((n) => n.tune === undefined)).toBe(true);
		expect(notes.filter((n) => n.track === 2).every((n) => n.note === 48)).toBe(true);
	});

	it('plays a drum track’s notes on the other drum track too (follow)', () => {
		const { run, play, steps, heard, hold } = rig();
		steps(0, 4, (i) => 53 + i);
		hold('b3');
		play();
		run(0.4);
		expect(heard(1)).toEqual(heard(0));
		expect(heard(1).length).toBeGreaterThan(0);
	});

	it('adds the kick and snare fill once, on the first drum track, even with no pattern', () => {
		const { run, play, heard, hold } = rig();
		hold('c4');
		play();
		run(16 * SIXTEENTH - 0.11);
		const snare = heard(0).flatMap(([at, note]) => (note === PUNCH_FIRST_NOTE + 2 ? [at] : []));
		const kick = heard(0).flatMap(([at, note]) => (note === PUNCH_FIRST_NOTE ? [at] : []));
		expect(snare).toEqual([1, 3, 6, 9, 11, 14]);
		expect(kick).toEqual([3, 5, 15]);
		expect(heard(1)).toEqual([]);
	});

	it('rides the hats while D is held', () => {
		const { run, play, heard, hold } = rig();
		hold('d4');
		play();
		run(8 * SIXTEENTH - 0.11);
		expect(heard(0).map(([, note]) => note - PUNCH_FIRST_NOTE)).toEqual([8, 8, 10, 8, 8, 8, 10, 8]);
	});

	it('ramps a synth’s notes up step by step, gliding', () => {
		const { run, play, steps, notes, hold } = rig();
		steps(2, 8, () => 60);
		hold('c5');
		play();
		run(8 * SIXTEENTH - 0.11);
		const synth = notes.filter((n) => n.track === 2);
		expect(synth.map((n) => n.note)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
		expect(synth.every((n) => (n.glide ?? 0) > 0)).toBe(true);
	});

	it('plays random kit keys on the drums and random intervals on the synths, the same each time', () => {
		const once = () => {
			const { run, play, steps, notes, hold } = rig();
			steps(0, 16, () => 53);
			steps(2, 16, () => 60);
			hold('e4', 'e5');
			play();
			run(16 * SIXTEENTH - 0.11);
			return notes.map((n) => [n.track, n.note]);
		};
		const notes = once();
		const drums = notes.filter(([k]) => k === 0).map(([, n]) => n);
		const synth = notes.filter(([k]) => k === 2).map(([, n]) => n);
		expect(drums.every((n) => n >= 53 && n < 77)).toBe(true);
		expect(new Set(drums).size).toBeGreaterThan(3);
		expect(new Set(synth).size).toBeGreaterThan(2);
		expect(synth.every((n) => Math.abs(n - 60) <= 12)).toBe(true);
		expect(once()).toEqual(notes);
	});

	it('sends the punch-in track’s notes to the sound with their times, and applies them to notes', () => {
		const { state, run, play, steps, punches, heard, scheduler } = rig();
		steps(0, 16, (i) => 53 + i);
		const pattern = currentPattern(state.aux[1].sequence);
		// the upper F on step 2 for two steps; A3 (repeat three steps) from step 4 for eight
		toggleStep(pattern, 2, [PUNCH_FIRST_NOTE + 12]);
		pattern.steps[2].notes[0].length = 2;
		toggleStep(pattern, 4, [PUNCH_FIRST_NOTE + 4]);
		pattern.steps[4].notes[0].length = 8;
		play();
		run(2);
		const mute = punches.find((p) => p.key === 12);
		expect(mute?.tracks).toEqual([2, 3, 4, 5, 6, 7]);
		const start = scheduler.anchor?.time ?? 0;
		expect(mute!.start).toBeCloseTo(start + 2 * SIXTEENTH, 6);
		expect(mute!.end).toBeCloseTo(start + 4 * SIXTEENTH, 6);
		const t1 = new Map(heard(0).map(([at, note]) => [at, note]));
		expect([4, 5, 6, 7, 8, 9, 10, 11].map((at) => t1.get(at))).toEqual([
			57, 58, 59, 57, 58, 59, 57, 58
		]);
		// in place again once the note ends
		expect(t1.get(12)).toBe(65);
	});

	it('leaves the notes alone while the punch-in track is muted', () => {
		const { state, run, play, steps, punches, heard } = rig();
		steps(0, 8, (i) => 53 + i);
		const pattern = currentPattern(state.aux[1].sequence);
		toggleStep(pattern, 0, [PUNCH_FIRST_NOTE + 4]);
		pattern.steps[0].notes[0].length = 8;
		state.aux[1].mix.muted = true;
		play();
		run(8 * SIXTEENTH - 0.11);
		expect(punches).toEqual([]);
		expect(heard(0).map(([, note]) => note)).toEqual([53, 54, 55, 56, 57, 58, 59, 60]);
	});
});
