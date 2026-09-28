import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { COLORS } from '../../screen/palette';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import type { SongFrame } from './frames';
import { accidentalKey, naturalKey } from './model';
import { PATTERN_KEYS, SONG_LENGTH } from './state';

/** Holds shift while pressing each key in turn. */
function withShift(sim: OpxySim, ...ids: string[]): void {
	sim.input({ type: 'press', id: 'key.shift' });
	for (const id of ids) sim.press(id);
	sim.input({ type: 'release', id: 'key.shift' });
}

const NEW = `key.m${PATTERN_KEYS.indexOf('new') + 1}`;

/** Song mode of a new project, the song emptied. */
function songMode(): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.arrange');
	withShift(sim, 'key.arrange');
	withShift(sim, 'key.m1');
	return sim;
}

/** The song frame (fails on another page). */
function song(sim: OpxySim): SongFrame {
	const f = sim.frame;
	expect(f.page).toBe('song');
	return f as SongFrame;
}

/** The scene numbers the song frame shows. */
const entries = (f: SongFrame) => f.slots.filter((s) => s !== null).map((s) => s.scene);

/** Moves time by `steps` sixteenths in frame-sized slices (0.2 of a step each). */
function play(sim: OpxySim, steps: number): void {
	const stepMs = 60000 / sim.state.tempo.bpm / 4;
	for (let i = 0; i < Math.round(steps * 5); i++) sim.advance(stepMs / 5);
}

/** Scenes 1–3 in which T1 plays its patterns 1–3, then song mode with the song 1, 2, 3. */
function threeScenes(): OpxySim {
	const sim = new OpxySim({ now: () => 0 });
	sim.press('key.arrange');
	sim.press(NEW);
	sim.press(NEW);
	sim.turn(4, -2); // scene 1: pattern 1
	withShift(sim, accidentalKey(2));
	sim.turn(4, 1); // scene 2: pattern 2
	withShift(sim, accidentalKey(3));
	sim.turn(4, 1); // scene 3: pattern 3
	withShift(sim, accidentalKey(1));
	withShift(sim, 'key.arrange', 'key.m1', accidentalKey(1), accidentalKey(2), accidentalKey(3));
	return sim;
}

const t1 = (sim: OpxySim) => sim.state.tracks[0].sequence.current;
const scene = (sim: OpxySim) => sim.state.areas.arrange.scene + 1;

describe('song mode: the song order (manual: arrange/song-mode)', () => {
	it('opens with shift + arrange and closes with arrange; a new song holds scene 1', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.arrange');
		withShift(sim, 'key.arrange');
		const f = song(sim);
		expect(f).toMatchObject({ song: 1, loop: true, length: 1, count: '01', first: 1, cursor: 1 });
		expect(entries(f)).toEqual(['1']);
		sim.press('key.arrange');
		expect(sim.frame.page).toBe('arrange');
		withShift(sim, 'key.arrange');
		withShift(sim, 'key.arrange');
		expect(sim.frame.page).toBe('arrange');
	});

	it('keys scenes in at the cursor like a phone number; count is how many scenes the song holds', () => {
		const sim = songMode();
		expect(song(sim)).toMatchObject({ length: 0, count: '00', at: 1, cursor: 0 });
		withShift(sim, accidentalKey(1), accidentalKey(3), accidentalKey(3));
		expect(entries(song(sim))).toEqual(['1', '3', '3']);
		expect(song(sim)).toMatchObject({ count: '03', at: 4, cursor: 3 });
		sim.press(accidentalKey(5)); // without shift a black key only plays
		expect(song(sim).length).toBe(3);
	});

	it('moves the cursor with shift + M2 / M3, inserts there, deletes before it, clears all', () => {
		const sim = songMode();
		withShift(sim, accidentalKey(1), accidentalKey(2), accidentalKey(3));
		withShift(sim, 'key.m2', 'key.m2');
		// the device's count stays the song's length wherever the cursor goes (b1-854…863)
		expect(song(sim)).toMatchObject({ count: '03', at: 2, cursor: 1 });
		withShift(sim, accidentalKey(9));
		expect(entries(song(sim))).toEqual(['1', '9', '2', '3']);
		withShift(sim, 'key.m3', 'key.m3', 'key.m3');
		expect(song(sim).cursor).toBe(4);
		withShift(sim, 'key.m4');
		expect(entries(song(sim))).toEqual(['1', '9', '2']);
		withShift(sim, 'key.m2', 'key.m2', 'key.m2', 'key.m4');
		expect(entries(song(sim))).toEqual(['9', '2']);
		sim.press('key.m4'); // without shift nothing happens
		expect(song(sim).length).toBe(2);
		withShift(sim, 'key.m1');
		expect(song(sim)).toMatchObject({ length: 0, cursor: 0 });
		// deleting scenes from the song leaves the scenes themselves alone
		expect(sim.state.areas.arrange.scenes.every((s) => s === null)).toBe(true);
	});

	it('keys scenes 10–99 with accidental 0 and two digits, shown where they will go', () => {
		const sim = songMode();
		withShift(sim, accidentalKey(1), accidentalKey(0), accidentalKey(9));
		expect(entries(song(sim))).toEqual(['1', '9-']);
		sim.press(accidentalKey(4));
		expect(entries(song(sim))).toEqual(['1', '94']);
	});

	it('holds at most 96 scenes and scrolls to keep the cursor in view', () => {
		const sim = songMode();
		withShift(sim, ...Array(40).fill(accidentalKey(1)));
		expect(song(sim)).toMatchObject({ first: 17, count: '40', at: 41, cursor: 24 });
		withShift(sim, ...Array(40).fill('key.m2'));
		expect(song(sim)).toMatchObject({ first: 1, cursor: 0 });
		withShift(sim, ...Array(70).fill(accidentalKey(2)));
		expect(song(sim).length).toBe(SONG_LENGTH);
		withShift(sim, ...Array(90).fill('key.m3'));
		expect(song(sim)).toMatchObject({ first: 73, count: '96', at: 96, cursor: 24 });
	});

	it('loops or not with E1: turned right on, left off, a click toggles', () => {
		const sim = songMode();
		sim.turn(1, -1);
		expect(song(sim).loop).toBe(false);
		sim.turn(1, 2);
		expect(song(sim).loop).toBe(true);
		sim.click(1);
		expect(song(sim).loop).toBe(false);
	});
});

describe('songs (manual: arrange/songs)', () => {
	it('picks one of 14 songs with shift + a white key and remembers it when song mode closes', () => {
		const sim = songMode();
		withShift(sim, accidentalKey(5));
		withShift(sim, naturalKey(14));
		expect(song(sim)).toMatchObject({ song: 14, length: 1, cursor: 1 });
		sim.press('key.arrange');
		sim.press('key.instrument');
		sim.press('key.arrange');
		withShift(sim, 'key.arrange');
		expect(song(sim).song).toBe(14);
		withShift(sim, naturalKey(1));
		expect(entries(song(sim))).toEqual(['5']);
	});

	it('copies a song with its white key held and pastes it onto another', () => {
		const sim = songMode();
		withShift(sim, accidentalKey(7), accidentalKey(8));
		sim.input({ type: 'press', id: 'key.shift' });
		sim.input({ type: 'press', id: naturalKey(1) });
		expect(song(sim).soft.map((l) => l?.text)).toEqual(['clear all', 'copy', 'paste', 'delete']);
		sim.press('key.m2');
		sim.input({ type: 'release', id: naturalKey(1) });
		sim.input({ type: 'press', id: naturalKey(3) });
		sim.press('key.m3');
		sim.input({ type: 'release', id: naturalKey(3) });
		sim.input({ type: 'release', id: 'key.shift' });
		expect(song(sim).song).toBe(3);
		expect(entries(song(sim))).toEqual(['7', '8']);
		expect(song(sim).soft.map((l) => l?.icon ?? l?.text)).toEqual([
			'clear all',
			'arrange.left',
			'arrange.right',
			'delete'
		]);
	});

	it('lights the current song’s white key while shift is held', () => {
		const sim = songMode();
		withShift(sim, naturalKey(4));
		sim.input({ type: 'press', id: 'key.shift' });
		expect(sim.leds[naturalKey(4)]).toBe('white');
		sim.input({ type: 'release', id: 'key.shift' });
		expect(sim.leds[naturalKey(4)]).toBe('off');
	});
});

describe('song playback', () => {
	it('plays the song from its first scene; each scene starts on its first step', () => {
		const sim = threeScenes();
		withShift(sim, 'key.m2', 'key.m2'); // the cursor does not decide where play starts
		sim.press('key.play');
		expect(sim.state.areas.arrange.playing).toBe(true);
		expect([scene(sim), t1(sim)]).toEqual([1, 0]);
		play(sim, 15.8);
		expect(scene(sim)).toBe(1);
		play(sim, 0.4);
		expect([scene(sim), t1(sim)]).toEqual([2, 1]);
		expect(sim.state.transport.position).toBeLessThan(1);
		expect(song(sim).slots[1]?.playing).toBe(true);
		play(sim, 16);
		expect([scene(sim), t1(sim)]).toEqual([3, 2]);
		play(sim, 16);
		expect([scene(sim), t1(sim)]).toEqual([1, 0]);
		expect(describeFrame(song(sim))).toBe('song 1, looping: 3 scenes, cursor at 2, playing');
	});

	it('keeps time over many scenes: every scene lasts exactly its length', () => {
		const sim = threeScenes();
		sim.press('key.play');
		play(sim, 30 * 16 + 0.4); // thirty scenes, ten times round the song
		expect(scene(sim)).toBe(1);
		expect(sim.state.transport.position).toBeCloseTo(0.4, 6);
		play(sim, 15.4);
		expect(scene(sim)).toBe(1);
		play(sim, 0.4);
		expect(scene(sim)).toBe(2);
	});

	it('lasts each scene as long as its longest pattern', () => {
		const sim = threeScenes();
		const second = sim.state.tracks[0].sequence.patterns[1];
		second.length = 32;
		second.steps[20].notes = [{ note: 60, velocity: 100, length: 1, offset: 0 }];
		sim.press('key.play');
		play(sim, 16.2);
		expect(scene(sim)).toBe(2);
		play(sim, 31.6);
		expect(scene(sim)).toBe(2);
		play(sim, 0.4);
		expect(scene(sim)).toBe(3);
	});

	it('stops the transport after the last scene when the song does not loop', () => {
		const sim = threeScenes();
		sim.turn(1, -1);
		sim.press('key.play');
		play(sim, 47.8);
		expect(sim.state.transport.playing).toBe(true);
		play(sim, 0.4);
		expect(sim.state.transport.playing).toBe(false);
		expect(sim.state.transport.position).toBe(0);
		expect(sim.state.areas.arrange.playing).toBe(false);
		// ours: the ring rests on the last entry, as it does where stop is pressed
		expect(song(sim).slots[2]?.playing).toBe(true);
	});

	it('walks a notch round the playing entry’s ring once per scene, from the top (b1-865…869)', () => {
		const sim = threeScenes();
		expect(song(sim).slots[0]?.progress).toBeNull();
		sim.press('key.play');
		play(sim, 4);
		expect(song(sim).slots[0]?.progress).toBeCloseTo(0.25, 5);
		play(sim, 12.4); // the second scene, a fortieth in
		const slots = song(sim).slots;
		expect([slots[0]?.progress, slots[1]?.progress]).toEqual([null, expect.closeTo(0.025, 5)]);
		sim.press('key.stop');
		expect(song(sim).slots[1]).toMatchObject({ playing: true, progress: null });
	});

	it('jumps to a cued entry at the next scene end (shift + [-] / [+])', () => {
		const sim = threeScenes();
		withShift(sim, 'key.plus'); // not playing: nothing to cue
		expect(sim.state.areas.arrange.cue).toBeNull();
		sim.press('key.play');
		withShift(sim, 'key.plus', 'key.plus', 'key.plus');
		expect(song(sim).slots[2]?.cued).toBe(true);
		withShift(sim, 'key.minus');
		withShift(sim, 'key.plus');
		play(sim, 16.2);
		expect(scene(sim)).toBe(3);
		expect(sim.state.areas.arrange.cue).toBeNull();
	});

	it('keeps playing the song in other modes; stop ends it; play elsewhere plays one scene', () => {
		const sim = threeScenes();
		sim.press('key.play');
		sim.press('key.instrument');
		play(sim, 16.2);
		expect(scene(sim)).toBe(2);
		sim.press('key.stop');
		expect(sim.state.areas.arrange.playing).toBe(false);
		// the ring stays on the entry that was playing (b1-870, 871)
		expect(sim.state.areas.arrange.position).toBe(1);
		sim.press('key.play');
		play(sim, 16.2);
		expect(scene(sim)).toBe(2);
	});

	it('starts a newly chosen song from its first scene at the next scene end', () => {
		const sim = threeScenes();
		withShift(sim, naturalKey(2), 'key.m1', accidentalKey(3));
		withShift(sim, naturalKey(1));
		sim.press('key.play');
		withShift(sim, naturalKey(2));
		expect(song(sim).slots[0]?.playing).toBe(false);
		play(sim, 16.2);
		expect(scene(sim)).toBe(3);
		expect(song(sim).slots[0]?.playing).toBe(true);
	});
});

describe('song drawing and the arrange-028 scenario', () => {
	it('reaches the art’s state: song 9, eight entries, the cursor before the sixth', () => {
		const s = SCENARIOS.find((x) => x.id === 'arrange-song');
		if (!s) throw new Error('arrange-song');
		const sim = new OpxySim({ now: () => 0 });
		s.setup(sim);
		const f = song(sim);
		// the art's count reads 06; the device's counts the song's scenes
		expect(f).toMatchObject({ song: 9, loop: true, count: '08', at: 6, first: 1, cursor: 5 });
		expect(entries(f)).toEqual(['99', '1', '1', '1', '1', '3', '3', '5']);
		expect(f.slots[0]?.playing).toBe(true);
	});

	it('draws the header, the entries as discs, and the cursor only while shift is held', () => {
		const sim = songMode();
		withShift(sim, accidentalKey(1), accidentalKey(2));
		sim.turn(1, -1);
		let ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(ctx.fillsOf(COLORS.white).some((f) => f.y0 === 0 && f.y1 === 23.85)).toBe(true);
		expect(ctx.fillsOf(COLORS.dark).some((f) => f.x0 === 125 && f.x1 === 155)).toBe(true);
		// no cursor without shift, and the keys dimmed
		const cursor = (c: RecordingContext) =>
			c.fillsOf(COLORS.white).some((f) => f.x0 === 158.5 && f.y0 === 39.85 && f.x1 === 161.5);
		expect(cursor(ctx)).toBe(false);
		expect(song(sim)).toMatchObject({ lit: false, cursor: 2 });
		expect(song(sim).soft.map((l) => l?.tone)).toEqual(['dim', 'dim', 'dim', 'dim']);
		sim.input({ type: 'press', id: 'key.shift' });
		ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(cursor(ctx)).toBe(true);
		expect(song(sim).soft.map((l) => l?.tone)).toEqual(['light', 'light', 'light', 'light']);
	});

	it('draws the song’s position as a ring, and its notch while the song plays', () => {
		const sim = threeScenes();
		const ring = (c: RecordingContext) =>
			c.ops.filter((op) => op.op === 'arc' && op.args[0] === 100 && op.args[2] === 17).length;
		let ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		expect(ring(ctx)).toBe(1);
		sim.press('key.play');
		play(sim, 4); // a quarter of the way: the notch at three o'clock
		ctx = new RecordingContext();
		renderFrame(ctx, sim.frame);
		const notch = ctx.ops.findIndex((op) => op.op === 'moveTo' && op.args[0] === 114.5);
		expect(notch).toBeGreaterThan(0);
		expect(ctx.ops[notch].args[1]).toBeCloseTo(59.24, 1);
	});
});

describe('following a connected device', () => {
	it('changes scenes on its clock ticks, landing exactly on the new scene’s first step', () => {
		const sim = threeScenes();
		sim.press('key.play');
		for (let i = 0; i < 16 * 6 - 1; i++) sim.clockTick();
		expect(scene(sim)).toBe(1);
		// the page's frames only run the areas' timers while the device's clock drives
		sim.advance(1000, { transport: false });
		expect(sim.state.transport.position).toBe(95 / 6);
		sim.clockTick();
		expect([scene(sim), t1(sim)]).toEqual([2, 1]);
		expect(sim.state.transport.position).toBe(0);
		for (let i = 0; i < 6; i++) sim.clockTick();
		expect(sim.state.transport.position).toBe(1);
	});

	it('lands a page-clock scene start at the overshoot, never ahead of it', () => {
		const sim = threeScenes();
		sim.press('key.play');
		const stepMs = 60000 / sim.state.tempo.bpm / 4;
		sim.advance(stepMs * 15.9);
		sim.advance(stepMs * 0.3);
		expect(scene(sim)).toBe(2);
		expect(sim.state.transport.position).toBeCloseTo(0.2, 9);
	});
});
