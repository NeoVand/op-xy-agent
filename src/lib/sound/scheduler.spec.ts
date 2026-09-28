import { describe, expect, it } from 'vitest';
import {
	GROOVES,
	defaultState,
	defaultTrack,
	type SimState,
	type TrackState
} from '$lib/sim/params';
import { seq } from '$lib/sim/areas/sequencer/model';
import { arpNoteAt, playheadAt } from '$lib/sim/sequencer-playback';
import { currentPattern, setComponentValue, setLock, toggleStep } from '$lib/sim/sequencer';
import {
	KEY_VELOCITY,
	Scheduler,
	arpeggioInput,
	firstIndex,
	lockedSettings,
	positionAt,
	timeAt,
	trackGroove,
	type ClickEvent,
	type ScheduledNote
} from './scheduler';

/** A scheduler on a hand-turned audio clock, recording what it plays. */
function rig(options: { follow?: () => boolean } = {}) {
	const state: SimState = defaultState();
	const clock = { now: 0 };
	const notes: ScheduledNote[] = [];
	const settings: TrackState[] = [];
	const clicks: ClickEvent[] = [];
	const beats: number[] = [];
	const stops: number[] = [];
	const automations: {
		track: number;
		locks: Readonly<Record<string, number>> | null;
		time: number;
	}[] = [];
	const scheduler = new Scheduler({
		state: () => state,
		now: () => clock.now,
		sink: {
			note: (e, s) => {
				notes.push(e);
				settings.push(s);
			},
			click: (e) => clicks.push(e),
			beat: (t) => beats.push(t),
			stop: (t) => stops.push(t),
			automate: (track, locks, time) => automations.push({ track, locks, time })
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
	const play = (position = 0) => {
		state.transport.playing = true;
		state.transport.position = position;
	};
	const pattern = (track: number) => currentPattern(state.tracks[track].sequence);
	/** Note times in sixteenths from the start of play. */
	const sixteenths = (track?: number) =>
		notes
			.filter((n) => track === undefined || n.track === track)
			.map((n) => +((n.time - (scheduler.anchor?.time ?? 0)) / 0.125).toFixed(3));
	return {
		state,
		clock,
		notes,
		settings,
		clicks,
		beats,
		stops,
		automations,
		scheduler,
		run,
		play,
		pattern,
		sixteenths
	};
}

describe('timeline maths', () => {
	it('converts between transport positions and audio time', () => {
		const anchor = { position: 4, time: 10, bpm: 120 };
		expect(timeAt(anchor, 8)).toBeCloseTo(10.5);
		expect(positionAt(anchor, 10.25)).toBeCloseTo(6);
	});

	it('starts on the slot under the position when it has only just begun', () => {
		expect(firstIndex(0, 1)).toBe(0);
		expect(firstIndex(0.3, 1)).toBe(0);
		expect(firstIndex(0.7, 1)).toBe(1);
		expect(firstIndex(5, 2)).toBe(2);
		expect(firstIndex(-15.9, 4, 0.5)).toBe(-4);
	});

	it("applies a step's locks through the sequencer's own table, leaving the track alone", () => {
		const track = defaultTrack('prism');
		const locked = lockedSettings(track, {
			'm1.2': 10,
			'filter.cutoff': 30,
			'amp.attack': 50,
			'key3.tune': 2,
			'playMode.volume': 20
		});
		const [shape, , detune, stereo] = track.m1;
		expect(locked.m1).toEqual([shape, 10, detune, stereo]);
		expect(locked.filter.cutoff).toBe(30);
		expect(locked.amp.attack).toBe(50);
		expect(locked.drumKeys[3].tune).toBe(2);
		expect(locked.playMode.volume).toBe(20);
		expect(track.m1).toEqual(defaultTrack('prism').m1);
		expect(track.filter.cutoff).toBe(99);
		expect(lockedSettings(track, {})).toBe(track);
	});

	it("lets a track's own groove replace the tempo page's swing", () => {
		const state = defaultState();
		const p = currentPattern(state.tracks[0].sequence);
		state.tempo.swing = 30;
		expect(trackGroove(state, p)).toEqual({ type: 0, amount: 30 });
		p.groove = -44;
		expect(trackGroove(state, p)).toEqual({ type: 0, amount: -44 });
	});
});

describe('the lookahead scheduler', () => {
	it("plays a track's steps in time: sixteenths at the tempo, with their velocity and length", () => {
		const { play, run, notes, pattern, sixteenths } = rig();
		toggleStep(pattern(0), 0, [53]);
		toggleStep(pattern(0), 4, [55], 90);
		pattern(0).steps[4].notes[0].length = 2;
		play();
		run(2.45);
		// one bar at 120 BPM lasts two seconds: two passes of both steps
		expect(notes.map((n) => n.note)).toEqual([53, 55, 53, 55]);
		expect(sixteenths()).toEqual([0, 4, 16, 20]);
		expect(notes[1]).toMatchObject({ track: 0, velocity: 90 });
		// a step-entered note is half a step long (the pattern's note length)
		expect(notes[0].duration).toBeCloseTo(0.0625);
		expect(notes[1].duration).toBeCloseTo(0.25);
	});

	it('gives each track its own length and scale', () => {
		const { play, run, pattern, sixteenths } = rig();
		const p = pattern(2);
		p.length = 3;
		p.scale = 2;
		toggleStep(p, 0, [60]);
		toggleStep(p, 2, [64]);
		play();
		run(1.6);
		// steps of two sixteenths; three steps, then round again
		expect(sixteenths(2)).toEqual([0, 4, 6, 10, 12]);
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

	it('plays step components: pulse repeats, multiply ratchets, velocity 0 is silent', () => {
		const { play, run, notes, pattern, sixteenths } = rig();
		const p = pattern(3);
		toggleStep(p, 0, [60]);
		setComponentValue(p, [0], 'pulse', 2); // two repeats: the step plays three times
		toggleStep(p, 8, [62]);
		setComponentValue(p, [8], 'multiply', 4); // four hits inside the step
		toggleStep(p, 12, [64]);
		setComponentValue(p, [12], 'velocity', 9); // digit 9: silent
		play();
		run(1.9);
		// the repeats keep the track on step 1 for two more slots, so step 9 comes two slots later
		expect(sixteenths(3)).toEqual([0, 1, 2, 10, 10.25, 10.5, 10.75]);
		expect(notes.map((n) => n.note)).toEqual([60, 60, 60, 62, 62, 62, 62]);
		expect(notes[3].duration).toBeCloseTo(0.0625 / 4);
	});

	it('glides a portamento step and bends a bend step over the note', () => {
		const { play, run, notes, pattern } = rig();
		const p = pattern(3);
		toggleStep(p, 0, [60]);
		setComponentValue(p, [0], 'portamento', 5);
		toggleStep(p, 4, [67]);
		setComponentValue(p, [4], 'bend', 7); // fade down
		play();
		run(0.8);
		// half of a 125 ms step, and no glide of its own on the next note
		expect(notes[0].glide).toBeCloseTo(0.0625);
		expect(notes[1].glide).toBeUndefined();
		const curve = notes[1].bend!;
		// track 4's default bend range is three semitones: the fade runs from 0 down to −300 cents
		expect(curve[0]).toBeCloseTo(0);
		expect(curve[curve.length - 1]).toBeCloseTo(-300);
	});

	it("moves a routed track's ramps in the brain's key; unrouted tracks climb in semitones", () => {
		const { state, play, run, notes, pattern } = rig();
		state.areas.auxiliary.brain.patterns[0].auto = false; // c major, set by hand
		for (const k of [0, 2]) {
			toggleStep(pattern(k), 0, [60]);
			setComponentValue(pattern(k), [0], 'ramp up', 3); // four stages over an octave
		}
		play();
		run(4.5);
		const passes = (k: number) => notes.filter((n) => n.track === k).map((n) => n.note);
		// T3 is routed into the brain (a new project routes T3–T8); the drums on T1 are not
		expect(passes(2)).toEqual([60, 64, 69]);
		expect(passes(0)).toEqual([60, 64, 68]);
	});

	it("transposes the routed tracks by the brain pattern's note until the next one", () => {
		const { state, play, run, notes, pattern } = rig();
		state.areas.auxiliary.brain.patterns[0].auto = false;
		const brain = currentPattern(state.aux[0].sequence);
		toggleStep(brain, 0, [62]); // d: up a tone from c
		toggleStep(brain, 8, [58]); // a#: down a tone, the short way
		for (const step of [0, 4, 8, 12]) {
			toggleStep(pattern(2), step, [60]);
			toggleStep(pattern(0), step, [53]);
		}
		play();
		run(1.9);
		const bar = (k: number) =>
			notes
				.filter((n) => n.track === k)
				.slice(0, 4)
				.map((n) => n.note);
		expect(bar(2)).toEqual([62, 62, 58, 58]);
		expect(bar(0)).toEqual([53, 53, 53, 53]);
	});

	it('sends a lock on an empty step to the notes sounding then, and lets go at the next step', () => {
		const { play, run, automations, pattern, scheduler } = rig();
		const p = pattern(2);
		toggleStep(p, 0, [48]);
		p.steps[0].notes[0].length = 8;
		setLock(p, 4, 'filter.cutoff', 20);
		setLock(p, 5, 'filter.cutoff', 40);
		play();
		run(0.9);
		const start = scheduler.anchor!.time;
		expect(
			automations.map((a) => [a.track, a.locks, +((a.time - start) / 0.125).toFixed(3)])
		).toEqual([
			[2, { 'filter.cutoff': 20 }, 4],
			[2, { 'filter.cutoff': 40 }, 5],
			[2, null, 6]
		]);
	});

	it('moves between locks over the bar menu’s shape instead of jumping', () => {
		const { play, run, automations, pattern } = rig();
		const p = pattern(2);
		setLock(p, 2, 'm1.1', 90);
		p.smoothing = 99; // over the whole step
		play();
		run(0.5);
		const up = automations.slice(0, 8);
		const down = automations.slice(8);
		// from the track's own shape, 15.8, up to 90 in eight moves across step 3, and back across step 4
		expect(up[0].locks!['m1.1']).toBeGreaterThan(15);
		expect(up[0].locks!['m1.1']).toBeLessThan(30);
		expect(up.at(-1)!.locks).toEqual({ 'm1.1': 90 });
		expect(up.at(-1)!.time - up[0].time).toBeCloseTo((7 / 8) * 0.125);
		expect(down).toHaveLength(8);
		expect(down[0].locks!['m1.1']).toBeLessThan(90);
		expect(down.at(-1)!.locks).toBeNull();
	});

	it('arpeggiates a sequenced chord while it lasts, at its velocity (players work on sequences)', () => {
		const { play, run, notes, pattern, sixteenths } = rig();
		const p = pattern(2);
		toggleStep(p, 0, [48, 52, 55], 90);
		for (const n of p.steps[0].notes) n.length = 4;
		p.player.on = true; // arpeggio, up over an octave
		p.player.arp.speed = 3; // sixteenths (a new pattern's play eighths)
		play();
		run(0.9);
		expect(notes.map((n) => n.note)).toEqual([48, 52, 55, 48]);
		expect(sixteenths()).toEqual([0, 1, 2, 3]);
		expect(notes.every((n) => n.velocity === 90)).toBe(true);
	});

	it('plays maestro’s chord from each sequenced note', () => {
		const { play, run, notes, pattern } = rig();
		const p = pattern(2);
		toggleStep(p, 0, [48]);
		toggleStep(p, 4, [53]);
		Object.assign(p.player, { on: true, type: 'maestro' });
		p.player.maestro.chord = [60, 64, 67];
		play();
		run(0.6);
		expect(notes.map((n) => n.note)).toEqual([48, 52, 55, 53, 57, 60]);
	});

	it('holds each sequenced note until the pattern’s next notes', () => {
		const { play, run, notes, pattern } = rig();
		const p = pattern(2);
		toggleStep(p, 0, [48]);
		toggleStep(p, 6, [50]);
		Object.assign(p.player, { on: true, type: 'hold' });
		play();
		run(1.9);
		// six sixteenths, then ten round to the next bar's first step
		expect(notes.slice(0, 2).map((n) => +n.duration.toFixed(3))).toEqual([0.75, 1.25]);
	});

	it('hands a locked step its settings: the lock reaches the note, the track stays as it was', () => {
		const { play, run, settings, pattern, state } = rig();
		const p = pattern(2);
		toggleStep(p, 0, [60]);
		toggleStep(p, 1, [60]);
		setLock(p, 1, 'filter.cutoff', 20);
		setLock(p, 1, 'm1.1', 5);
		const cutoff = state.tracks[2].filter.cutoff;
		play();
		run(0.3);
		expect(settings[0].filter.cutoff).toBe(cutoff);
		expect(settings[1].filter.cutoff).toBe(20);
		expect(settings[1].m1[0]).toBe(5);
		expect(state.tracks[2].filter.cutoff).toBe(cutoff);
	});

	it('walks the pattern as the LEDs do, pulse, pulse hold and jump included', () => {
		const { play, run, notes, pattern, sixteenths } = rig();
		const p = pattern(0);
		for (let i = 0; i < 16; i++) toggleStep(p, i, [60 + i]);
		setComponentValue(p, [1], 'pulse', 1); // step 2 plays twice
		setComponentValue(p, [3], 'pulse hold', 2); // step 4 holds for two more slots
		setComponentValue(p, [6], 'jump', 1); // step 7 jumps back to step 1
		play();
		run(3);
		const slots = sixteenths(0);
		expect(slots.length).toBeGreaterThan(12);
		// every note sounds on the slot where the LEDs show its step
		slots.forEach((slot, i) => expect(notes[i].note - 60).toBe(playheadAt(p, Math.round(slot))));
		// and the walk really bent: step 2 twice in a row, and back to step 1 after step 7
		expect(notes.slice(0, 4).map((n) => n.note - 60)).toEqual([0, 1, 1, 2]);
		expect(notes.slice(6, 9).map((n) => n.note - 60)).toEqual([5, 6, 0]);
	});

	it('swings the off-beat sixteenths with the groove', () => {
		const { state, play, run, pattern, sixteenths } = rig();
		state.tempo.groove = GROOVES.indexOf('shuffle');
		state.tempo.swing = 99;
		for (let i = 0; i < 4; i++) toggleStep(pattern(3), i, [60]);
		play();
		run(0.6);
		const times = sixteenths(3).slice(0, 4);
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

	it('marks every beat of the sequence, heard or not, for what ducks on the metronome', () => {
		const { play, run, clicks, beats, scheduler } = rig();
		play();
		run(2);
		expect(clicks).toHaveLength(0);
		expect(beats.length).toBeGreaterThanOrEqual(4);
		expect(beats[0]).toBeCloseTo(scheduler.anchor!.time);
		expect(beats[1] - beats[0]).toBeCloseTo(0.5);
	});

	it('marks no beats through a count-in bar, only from where the pattern starts', () => {
		const { play, run, beats, scheduler } = rig();
		play(-16);
		run(2.3);
		expect(beats.length).toBeGreaterThanOrEqual(1);
		expect(beats[0] - scheduler.anchor!.time).toBeCloseTo(2);
	});

	it('counts a recording in: a bar of clicks before the pattern starts, metronome or not', () => {
		const { play, run, clicks, notes, pattern, scheduler } = rig();
		toggleStep(pattern(0), 0, [53]);
		play(-16);
		run(2.3);
		expect(clicks.map((c) => c.accent)).toEqual([true, false, false, false]);
		// the pattern starts where the count-in ends
		expect(notes).toHaveLength(1);
		expect(notes[0].time - scheduler.anchor!.time).toBeCloseTo(2);
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

	it('starts the walks over when the position jumps back (play again, a scene starting)', () => {
		const { state, play, run, notes, stops, pattern } = rig();
		const p = pattern(0);
		toggleStep(p, 0, [53]);
		// every second pass: the first pass is silent, the second sounds
		setComponentValue(p, [0], 'skip trigger', 2);
		play();
		run(2.3);
		expect(notes).toHaveLength(1);
		state.transport.position = 20;
		run(0.025);
		state.transport.position = 0;
		run(0.3);
		expect(stops).toHaveLength(1);
		// the new start counts passes from one again: its first pass is silent too
		expect(notes).toHaveLength(1);
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

	it('keeps playing in time when the track scale changes mid-play', () => {
		const { play, run, pattern, sixteenths } = rig();
		const p = pattern(0);
		for (let i = 0; i < 16; i++) toggleStep(p, i, [53]);
		play();
		run(0.45);
		p.scale = 2;
		run(0.6);
		const times = sixteenths(0);
		const gaps = times.slice(1).map((t, i) => +(t - times[i]).toFixed(3));
		expect(gaps.slice(0, 3)).toEqual([1, 1, 1]);
		expect(gaps.slice(-2)).toEqual([2, 2]);
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
		expect(notes.filter((n) => n.time > 0.2 && n.time < 0.97)).toHaveLength(0);
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

describe("the active track's arpeggio", () => {
	/** A rig on T3 (prism) with its arpeggio on and `keys` held. */
	function arp(keys: string[] = ['keyboard.c4', 'keyboard.e4', 'keyboard.g4']) {
		const r = rig();
		r.state.track = 2;
		const player = r.pattern(2).player;
		player.on = true;
		player.arp.speed = 3; // sixteenths (a new pattern's play eighths)
		r.state.held = keys;
		return { ...r, player, arpNotes: () => r.notes.filter((n) => n.track === 2) };
	}

	it('runs over the keys held on the audio clock: its speed, note length and the keys velocity', () => {
		const { play, run, arpNotes, sixteenths } = arp();
		play();
		run(1);
		const notes = arpNotes().slice(0, 8);
		// a new project's track 3 (the bass) plays an octave down
		expect(notes.map((n) => n.note)).toEqual([48, 52, 55, 48, 52, 55, 48, 52]);
		expect(sixteenths(2).slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		// half a sixteenth at 120 bpm
		for (const n of notes) expect(n.duration).toBeCloseTo(0.0625);
		expect(notes.every((n) => n.velocity === KEY_VELOCITY && n.pan === undefined)).toBe(true);
	});

	it('sounds what its LEDs show, a random pattern too', () => {
		const { play, run, arpNotes, player, state, scheduler } = arp();
		player.arp.pattern = 4; // random
		player.arp.range = 2;
		player.arp.speed = 1; // eighths
		play();
		run(2);
		const input = arpeggioInput(state)!.notes;
		for (const n of arpNotes()) {
			const position = positionAt(scheduler.anchor!, n.time);
			expect(n.note).toBe(arpNoteAt(input, player.arp, position + 1e-6));
		}
		expect(arpNotes().length).toBeGreaterThanOrEqual(8);
	});

	it('keeps running on what its hold kept, and stops when nothing is left', () => {
		const { state, play, run, arpNotes, player } = arp([]);
		player.arp.hold = true;
		seq(state).sustained = [60, 67];
		play();
		run(0.5);
		// the fifth step (0.51 s) is inside the last tick's look-ahead
		expect(arpNotes().map((n) => n.note)).toEqual([60, 67, 60, 67, 60]);
		seq(state).sustained = [];
		const count = arpNotes().length;
		run(0.5);
		expect(arpNotes()).toHaveLength(count);
	});

	it('starts with the step under the playhead when a key goes down, for what is left of it', () => {
		const { state, play, run, arpNotes, clock, scheduler } = arp([]);
		play();
		run(0.275);
		expect(arpNotes()).toHaveLength(0);
		state.held = ['keyboard.c4'];
		scheduler.tick();
		const [first] = arpNotes();
		// step 2 began at 0.26 s and its note ends 62.5 ms later
		expect(first.time).toBeCloseTo(clock.now);
		expect(first.duration).toBeCloseTo(0.26 + 0.0625 - clock.now);
		run(0.2);
		expect(arpNotes()[1].time).toBeCloseTo(timeAt(scheduler.anchor!, 3));
	});

	it('waits out a count-in, and leaves the stopped transport to the keys', () => {
		const { play, run, arpNotes, scheduler } = arp();
		run(0.5);
		expect(arpNotes()).toHaveLength(0);
		play(-16);
		run(1.9);
		expect(arpNotes()).toHaveLength(0);
		run(0.2);
		expect(arpNotes()[0].time).toBeCloseTo(timeAt(scheduler.anchor!, 0));
	});

	it('plays on a muted track (OS 1.1.0), never for another player, an aux track or midi', () => {
		const muted = arp();
		muted.state.tracks[2].mix.muted = true;
		muted.play();
		muted.run(0.2);
		expect(muted.arpNotes().length).toBeGreaterThan(0);
		const cases: ((r: ReturnType<typeof arp>) => void)[] = [
			(r) => (r.player.type = 'hold'),
			(r) => (r.player.on = false),
			(r) => (r.state.mode = 'auxiliary'),
			(r) => (r.state.tracks[2].engine = 'midi')
		];
		for (const change of cases) {
			const r = arp();
			change(r);
			r.play();
			r.run(0.2);
			expect(r.arpNotes()).toHaveLength(0);
		}
	});

	it('spreads successive notes by its stereo amount and glides by its glide', () => {
		const { play, run, arpNotes, player } = arp();
		player.arp.stereo = 99;
		player.arp.glide = 99;
		play();
		run(0.3);
		const notes = arpNotes();
		expect(notes.slice(0, 3).map((n) => n.pan)).toEqual([-1, 1, -1]);
		// a whole arpeggio step of glide at 99
		for (const n of notes) expect(n.glide).toBeCloseTo(0.125);
	});
});
