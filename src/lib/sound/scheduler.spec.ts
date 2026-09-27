import { describe, expect, it } from 'vitest';
import { GROOVES, defaultState, type SimState } from '$lib/sim/params';
import { currentPattern, toggleStep } from '$lib/sim/sequencer';
import {
	Scheduler,
	firstIndex,
	plainStepEvents,
	positionAt,
	sequencerStepEvents,
	timeAt,
	toEvents,
	type ClickEvent,
	type NoteEvent,
	type StepEventsFn
} from './scheduler';

/** A scheduler on a hand-turned audio clock, recording what it plays. */
function rig(options: { stepEvents?: StepEventsFn; follow?: () => boolean } = {}) {
	const state: SimState = defaultState();
	const clock = { now: 0 };
	const notes: NoteEvent[] = [];
	const clicks: ClickEvent[] = [];
	const stops: number[] = [];
	const scheduler = new Scheduler({
		state: () => state,
		now: () => clock.now,
		sink: {
			note: (e) => notes.push(e),
			click: (e) => clicks.push(e),
			stop: (t) => stops.push(t)
		},
		...options
	});
	/** Runs the clock forward in 25 ms ticks. */
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
	const pattern = (track: number) => currentPattern(state.tracks[track].sequence);
	return { state, clock, notes, clicks, stops, scheduler, run, play, pattern };
}

describe('timeline maths', () => {
	it('converts between transport positions and audio time', () => {
		const anchor = { position: 4, time: 10, bpm: 120 };
		expect(timeAt(anchor, 8)).toBeCloseTo(10.5);
		expect(positionAt(anchor, 10.25)).toBeCloseTo(6);
	});

	it('starts on the step under the position when it has only just begun', () => {
		expect(firstIndex(0, 1)).toBe(0);
		expect(firstIndex(0.3, 1)).toBe(0);
		expect(firstIndex(0.7, 1)).toBe(1);
		expect(firstIndex(5, 2)).toBe(2);
		expect(firstIndex(0.4, 4, 0.5)).toBe(0);
	});

	it('cleans step events: real notes only, defaults for the rest', () => {
		expect(
			toEvents([
				{ note: 60 },
				{ note: 200 },
				{ velocity: 3 },
				{ note: 61.4, velocity: 500, length: 0 }
			])
		).toEqual([
			{ note: 60, velocity: 100, length: 1, offset: 0 },
			{ note: 61, velocity: 127, length: 0.05, offset: 0 }
		]);
		const found = sequencerStepEvents();
		expect(found === null || typeof found === 'function').toBe(true);
	});
});

describe('the lookahead scheduler', () => {
	it("plays a track's steps in time: sixteenths at the tempo, with their velocity and length", () => {
		const { play, run, notes, pattern, scheduler } = rig();
		toggleStep(pattern(0), 0, [53]);
		toggleStep(pattern(0), 4, [55], 90);
		pattern(0).steps[4].notes[0].length = 2;
		play();
		run(2.45);
		const start = scheduler.anchor?.time ?? 0;
		// one bar at 120 BPM lasts two seconds: two passes of both steps
		expect(notes.map((n) => [n.note, +(n.time - start).toFixed(4)])).toEqual([
			[53, 0],
			[55, 0.5],
			[53, 2],
			[55, 2.5]
		]);
		expect(notes[1]).toMatchObject({ track: 0, velocity: 90 });
		expect(notes[0].duration).toBeCloseTo(0.125);
		expect(notes[1].duration).toBeCloseTo(0.25);
	});

	it('gives each track its own length and scale, and counts passes', () => {
		const passes: [number, number][] = [];
		const { play, run, notes, pattern, scheduler } = rig({
			stepEvents: (p, index, pass) => {
				if (p === pattern(2)) passes.push([index, pass]);
				return plainStepEvents(p, index, pass);
			}
		});
		const p = pattern(2);
		p.length = 3;
		p.scale = 2;
		toggleStep(p, 0, [60]);
		toggleStep(p, 2, [64]);
		play();
		run(1.6);
		const start = scheduler.anchor?.time ?? 0;
		// steps of two sixteenths (0.25 s); three steps then round again
		expect(
			notes.filter((n) => n.track === 2).map((n) => [n.note, +(n.time - start).toFixed(3)])
		).toEqual([
			[60, 0],
			[64, 0.5],
			[60, 0.75],
			[64, 1.25],
			[60, 1.5]
		]);
		expect(passes.slice(0, 7)).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
			[0, 1],
			[1, 1],
			[2, 1],
			[0, 2]
		]);
	});

	it('schedules only a short way ahead of the audio clock', () => {
		const { play, notes, pattern, scheduler, clock } = rig();
		for (let i = 0; i < 16; i++) toggleStep(pattern(0), i, [53]);
		play();
		scheduler.tick();
		// 100 ms ahead plus half a step of lead: steps 0 and 1 of the 125 ms grid
		expect(notes).toHaveLength(2);
		clock.now = 0.5;
		scheduler.tick();
		expect(notes.every((n) => n.time < clock.now + 0.2)).toBe(true);
	});

	it('swings the off-beat sixteenths with the tempo page groove', () => {
		const { state, play, run, notes, pattern, scheduler } = rig();
		state.tempo.groove = GROOVES.indexOf('shuffle');
		state.tempo.swing = 99;
		for (let i = 0; i < 4; i++) toggleStep(pattern(3), i, [60]);
		play();
		run(0.6);
		const start = scheduler.anchor?.time ?? 0;
		const times = notes.slice(0, 4).map((n) => (n.time - start) / 0.125);
		expect(times[0]).toBeCloseTo(0, 1);
		expect(times[1]).toBeCloseTo(1.5, 1);
		expect(times[2]).toBeCloseTo(2, 1);
		expect(times[3]).toBeCloseTo(3.5, 1);
	});

	it('clicks the metronome on every beat while it is on, accenting the bar', () => {
		const { state, play, run, clicks } = rig();
		play();
		run(1);
		expect(clicks).toHaveLength(0);
		// beats 0–2 went by in silence; from beat 3 it clicks, beat 4 opening the second bar
		state.tempo.metronome.on = true;
		run(2);
		expect(clicks.map((c) => c.accent)).toEqual([false, true, false, false]);
		expect(clicks[1].time - clicks[0].time).toBeCloseTo(0.5);
		expect(clicks[0].gain).toBeGreaterThan(0);
	});

	it('ends the sequence when the transport stops and starts afresh on play', () => {
		const { state, play, run, notes, stops, pattern, clock } = rig();
		toggleStep(pattern(0), 0, [53]);
		play();
		run(0.3);
		state.transport.playing = false;
		run(0.1);
		expect(stops).toHaveLength(1);
		expect(stops[0]).toBeCloseTo(0.3, 1);
		play();
		const before = notes.length;
		run(0.05);
		expect(notes.length).toBe(before + 1);
		expect(notes.at(-1)?.time).toBeCloseTo(clock.now, 1);
	});

	it('starts again from the top when the position jumps back (play pressed while playing)', () => {
		const { state, play, run, notes, stops, pattern } = rig();
		toggleStep(pattern(0), 0, [53]);
		play();
		run(0.4);
		// the simulator's playhead has moved on; then play is pressed again
		state.transport.position = 3.2;
		run(0.025);
		state.transport.position = 0;
		run(0.05);
		expect(stops).toHaveLength(1);
		expect(notes.filter((n) => n.note === 53)).toHaveLength(2);
	});

	it('re-anchors on a tempo change without losing its place', () => {
		const { state, play, run, notes, pattern, clock } = rig();
		for (let i = 0; i < 16; i++) toggleStep(pattern(0), i, [53]);
		play();
		run(0.5);
		state.tempo.bpm = 60;
		const changed = clock.now;
		run(1.5);
		const later = notes.filter((n) => n.time > changed + 0.3);
		// sixteenths at 60 BPM are 250 ms apart
		expect(later[1].time - later[0].time).toBeCloseTo(0.25);
	});

	it('skips muted tracks and the silent midi engine', () => {
		const { state, play, run, notes, pattern } = rig();
		toggleStep(pattern(0), 0, [53]);
		toggleStep(pattern(1), 0, [53]);
		toggleStep(pattern(2), 0, [60]);
		state.tracks[1].mix.muted = true;
		state.tracks[2].engine = 'midi';
		play();
		run(0.2);
		expect(notes.map((n) => n.track)).toEqual([0]);
	});

	it('drops notes a stalled timer missed instead of playing them late in a burst', () => {
		const { play, notes, pattern, scheduler, clock } = rig();
		for (let i = 0; i < 16; i++) toggleStep(pattern(0), i, [53]);
		play();
		scheduler.tick();
		clock.now = 1;
		scheduler.tick();
		expect(notes.every((n) => n.time >= clock.now - 0.03 || n.time < 0.2)).toBe(true);
		expect(notes.filter((n) => n.time > 0.2 && n.time < 0.97)).toHaveLength(0);
	});

	it('plays what a step-events function makes of a step: ratchets and offsets', () => {
		const ratchet: StepEventsFn = (p, index) =>
			p.steps[index].notes.flatMap((n) => [
				{ ...n, length: 0.5 },
				{ ...n, offset: 0.5, length: 0.5 }
			]);
		const { play, run, notes, pattern, scheduler } = rig({ stepEvents: ratchet });
		toggleStep(pattern(0), 0, [53]);
		play();
		run(0.2);
		const start = scheduler.anchor?.time ?? 0;
		expect(notes.map((n) => +(n.time - start).toFixed(4))).toEqual([0, 0.0625]);
		expect(notes[0].duration).toBeCloseTo(0.0625);
	});

	it("follows a device's clock when told to, re-anchoring on drift", () => {
		const { state, play, run, scheduler, clock } = rig({ follow: () => true });
		play();
		run(0.2);
		state.transport.position = 8;
		run(0.05);
		expect(positionAt(scheduler.anchor!, clock.now)).toBeCloseTo(8, 0);
	});
});
