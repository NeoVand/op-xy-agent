import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { ScreenFrame } from '../../screen/frame';
import { RecordingContext } from '../../screen/recording';
import { describeFrame, renderFrame } from '../../screen/render';
import { NUDGE, OVERLAP, currentPattern, getComponent, type Pattern } from '../../sequencer';
import {
	ACCIDENTALS,
	NATURALS,
	accidentalDigit,
	describeComponent,
	naturalIndex
} from './components';
import { flashing } from './leds';
import { lockParam, lockTarget, lockedTrack, turnedValue } from './locks';
import { COUNT_IN } from './recording';

/** A simulator on a clock the test moves. */
function rig() {
	const clock = { t: 0 };
	const sim = new OpxySim({ now: () => clock.t });
	return { sim, clock };
}

const down = (sim: OpxySim, id: string) => sim.input({ type: 'press', id });
const up = (sim: OpxySim, id: string) => sim.input({ type: 'release', id });
const pattern = (sim: OpxySim): Pattern => currentPattern(sim.track.sequence);
const notesOn = (sim: OpxySim, step: number) => pattern(sim).steps[step].notes.map((n) => n.note);
/** Step LEDs 1–16 as a string: . off, d dim, w white, r red. */
const stepLeds = (sim: OpxySim) =>
	Array.from({ length: 16 }, (_, i) => {
		const led = sim.leds[`step.${i + 1}` as 'step.1'];
		return led === 'white' ? 'w' : led === 'dim' ? 'd' : led === 'red' ? 'r' : '.';
	}).join('');
/** Keyboard keys lit, by name. */
const litKeys = (sim: OpxySim) =>
	Object.entries(sim.leds)
		.filter(([id, led]) => id.startsWith('keyboard.') && led === 'white')
		.map(([id]) => id.slice('keyboard.'.length));

/** The frame, narrowed to one page. */
function page<P extends ScreenFrame['page']>(
	sim: OpxySim,
	name: P
): Extract<ScreenFrame, { page: P }> {
	const frame = sim.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

/** Plays `key` as the last note, then taps each step. */
function place(sim: OpxySim, key: string, steps: readonly number[]): void {
	sim.press(`keyboard.${key}`);
	for (const step of steps) sim.press(`step.${step}`);
}

/** Sixteenths at 120 BPM. */
const SIXTEENTH = 125;

describe('bar menu (manual: sequencer/bar-menu)', () => {
	it('shows while bar is held, then returns to the page it covered', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.m3');
		down(sim, 'key.bar');
		const bar = page(sim, 'bar');
		expect(bar.header.map((c) => `${c.label} ${c.value}`)).toEqual([
			'quantise 100',
			'length 50',
			'groove 00',
			'shape 00'
		]);
		expect(bar).toMatchObject({ bars: 1, length: 16, scale: '1', shown: 0, pinned: false });
		expect(bar.soft.map((l) => l?.text ?? null)).toEqual(['notes', 'params', null, 'all']);
		up(sim, 'key.bar');
		expect(sim.state.overlay).toBeNull();
		expect(sim.frame.page).toBe('filter');
	});

	it('adds, removes and duplicates bars, sets the length and the track scale', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1, 5]);
		down(sim, 'key.bar');
		sim.press('key.plus');
		expect(pattern(sim)).toMatchObject({ bars: 2, length: 32 });
		sim.press('key.minus');
		expect(pattern(sim).bars).toBe(1);
		// bar + shift + [+]: the bar doubles, notes included
		sim.combo('key.shift', 'key.plus');
		expect(pattern(sim).bars).toBe(2);
		expect(notesOn(sim, 16)).toEqual([60]);
		// bar + step 12: the last bar plays 12 steps
		sim.press('step.12');
		expect(pattern(sim).length).toBe(28);
		expect(page(sim, 'bar').cells[1].filter((c) => c === 'trimmed')).toHaveLength(4);
		// the step keys show the length: notes white, the rest of it dim
		expect(stepLeds(sim)).toBe('wdddwddddddddddd');
		// bar + black key: the track scale (the key marked 4 is 4; 0 is 1/2), lit while bar is held
		sim.press('keyboard.cs4');
		expect(pattern(sim).scale).toBe(4);
		expect(litKeys(sim)).toEqual(['cs4']);
		sim.press('keyboard.ds5');
		expect(page(sim, 'bar').scale).toBe('1/2');
		sim.press('keyboard.c4'); // a white key does nothing here
		expect(pattern(sim).scale).toBe(0.5);
		up(sim, 'key.bar');
		expect(sim.frame.page).toBe('synth');
		// the combos above were not taps: the keys still show bar 1
		expect(sim.track.sequence.page).toBe(0);
	});

	it('turns quantise, note length, groove and shape; E1 click switches quantise off', () => {
		const { sim } = rig();
		down(sim, 'key.bar');
		sim.turn(1, -24);
		sim.turn(2, 10);
		sim.turn(3, 3);
		sim.turn(4, 5);
		expect(page(sim, 'bar').header.map((c) => c.value)).toEqual(['76', '60', '07', '05']);
		sim.turn(2, 100);
		sim.turn(3, -10);
		expect(page(sim, 'bar').header.map((c) => c.value)).toEqual(['76', '100', '–16', '05']);
		sim.click(1);
		expect(page(sim, 'bar').header[0].value).toBe('off');
		expect(pattern(sim)).toMatchObject({ quantise: 76, quantiseOn: false, noteLength: 1 });
		up(sim, 'key.bar');
		// step entry uses the new note length
		sim.press('step.1');
		expect(pattern(sim).steps[0].notes[0].length).toBe(1);
	});

	it('moves the step keys to the next bar with a tap, and follows the playhead while playing', () => {
		const { sim, clock } = rig();
		sim.press('track.3');
		down(sim, 'key.bar');
		sim.press('key.plus');
		up(sim, 'key.bar');
		sim.press('key.bar'); // a tap
		expect(sim.track.sequence.page).toBe(1);
		place(sim, 'c4', [1]);
		expect(notesOn(sim, 16)).toEqual([60]);
		expect(notesOn(sim, 0)).toEqual([]);
		sim.press('key.bar');
		expect(sim.track.sequence.page).toBe(0);
		// a long press without a combo is a look, not a tap
		down(sim, 'key.bar');
		clock.t += 800;
		up(sim, 'key.bar');
		expect(sim.track.sequence.page).toBe(0);
		// playing, the keys follow the playhead into bar 2 (its note, and the playhead beside it) …
		sim.press('key.play');
		sim.advance(SIXTEENTH * 17);
		expect(stepLeds(sim)).toBe('ww..............');
		// … until a bar is tapped: then they stay on it
		sim.press('key.bar');
		expect(sim.track.sequence.page).toBe(0);
		sim.advance(SIXTEENTH * 16);
		expect(stepLeds(sim)).toBe('.w..............');
		sim.press('key.stop');
		expect(sim.state.areas.sequencer.pagePinned).toBe(false);
	});

	it('pins with shift + bar until bar is pressed again, combos included', () => {
		const { sim } = rig();
		sim.combo('key.shift', 'key.bar');
		expect(page(sim, 'bar').pinned).toBe(true);
		sim.press('key.plus'); // still the bar menu's
		expect(pattern(sim).bars).toBe(2);
		sim.press('key.bar');
		expect(sim.state.overlay).toBeNull();
		expect(sim.state.areas.sequencer.barPinned).toBe(false);
		// a mode key closes a pinned page too
		sim.combo('key.shift', 'key.bar');
		sim.press('key.mix');
		expect(sim.frame.page).toBe('mix');
		sim.press('key.m1');
		expect(sim.state.areas.sequencer.barPinned).toBe(false);
	});

	it('clears notes (M1), locks (M2) or both (M4), and shift + record undoes', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1, 2]);
		down(sim, 'step.3');
		sim.turn(1, -10); // a lock on an empty step
		up(sim, 'step.3');
		const counts = () => ({
			notes: pattern(sim).steps.reduce((n, s) => n + s.notes.length, 0),
			locks: pattern(sim).steps.reduce((n, s) => n + Object.keys(s.locks).length, 0)
		});
		expect(counts()).toEqual({ notes: 2, locks: 1 });
		down(sim, 'key.bar');
		sim.press('key.m2');
		expect(counts()).toEqual({ notes: 2, locks: 0 });
		sim.press('key.m3'); // nothing on M3
		sim.press('key.m1');
		expect(counts()).toEqual({ notes: 0, locks: 0 });
		up(sim, 'key.bar');
		sim.combo('key.shift', 'key.record');
		expect(counts()).toEqual({ notes: 2, locks: 0 });
		// undo again redoes
		sim.combo('key.shift', 'key.record');
		expect(counts()).toEqual({ notes: 0, locks: 0 });
		sim.combo('key.shift', 'key.record');
		down(sim, 'key.bar');
		sim.press('key.m4');
		up(sim, 'key.bar');
		expect(counts()).toEqual({ notes: 0, locks: 0 });
		expect(sim.frame.page).toBe('synth');
	});
});

describe('step components (manual: sequencer/step-components)', () => {
	it('dims note steps with shift, selects steps, adds a component and sets its digit', () => {
		const { sim } = rig();
		place(sim, 'fs3', [3, 7, 11, 15]);
		expect(stepLeds(sim)).toBe('..w...w...w...w.');
		down(sim, 'key.shift');
		expect(stepLeds(sim)).toBe('..d...d...d...d.');
		expect(sim.frame.page).toBe('drum'); // nothing selected yet: the page's shift layer
		sim.press('step.7');
		sim.press('step.15');
		expect(page(sim, 'components')).toMatchObject({ steps: [7, 15], chosen: null });
		// selected steps flash (lit while the simulator clock stands still)
		expect(stepLeds(sim)).toBe('..d...w...d...w.');
		sim.advance(260);
		expect(stepLeds(sim)).toBe('..d.......d.....');
		sim.press('keyboard.a3'); // natural 3: multiply at its default, 2 hits
		expect(page(sim, 'components').chosen).toEqual({
			index: 2,
			name: 'multiply',
			digit: 2,
			value: '2 hits'
		});
		sim.press('keyboard.as3'); // accidental 3
		const frame = page(sim, 'components');
		expect(frame.chosen?.value).toBe('3 hits');
		expect(frame.present[2]).toBe('all');
		expect(litKeys(sim).sort()).toEqual(['a3', 'as3']);
		up(sim, 'key.shift');
		expect(sim.frame.page).toBe('drum');
		expect(getComponent(pattern(sim).steps[6], 'multiply')).toEqual({ kind: 'multiply', value: 3 });
		expect(getComponent(pattern(sim).steps[2], 'multiply')).toBeUndefined();
		// the component keys did not change the note a step press places
		expect(sim.track.sequence.lastNote).toBe(54);
		// with shift, steps that carry a component light fully
		down(sim, 'key.shift');
		expect(stepLeds(sim)).toBe('..d...w...d...w.');
		up(sim, 'key.shift');
	});

	it('takes a component off the same steps, and reports steps that differ', () => {
		const { sim } = rig();
		place(sim, 'f3', [1, 2]);
		down(sim, 'key.shift');
		sim.press('step.1');
		sim.press('keyboard.b3'); // velocity on step 1
		sim.press('keyboard.as4'); // digit 8: 127
		sim.press('step.2'); // now steps 1 and 2
		expect(page(sim, 'components').present[3]).toBe('some');
		expect(page(sim, 'components').chosen).toMatchObject({ digit: 8, value: 'velocity 127' });
		sim.press('keyboard.b3'); // adds it to step 2 at its default
		expect(page(sim, 'components').chosen).toMatchObject({ digit: null, value: 'mixed' });
		sim.press('keyboard.b3'); // all have it: off
		expect(page(sim, 'components').chosen?.value).toBe('off');
		sim.press('step.2'); // deselects
		expect(page(sim, 'components').steps).toEqual([1]);
		up(sim, 'key.shift');
		expect(pattern(sim).steps[0].components).toEqual([]);
	});

	it('names every component digit in our words', () => {
		expect(describeComponent('pulse', 1)).toBe('1 repeat');
		expect(describeComponent('pulse hold', 0)).toBe('random hold');
		expect(describeComponent('velocity', 9)).toBe('velocity 0');
		expect(describeComponent('ramp down', 7)).toBe('3 steps 3 octaves');
		expect(describeComponent('random', 1)).toBe('2 steps 1 octave');
		expect(describeComponent('portamento', 5)).toBe('glide 50%');
		expect(describeComponent('bend', 0)).toBe('random 2');
		expect(describeComponent('tonality', 0)).toBe('quantise 100%');
		expect(describeComponent('tonality', 4)).toBe('fifth up');
		expect(describeComponent('jump', 4)).toBe('to step 13');
		expect(describeComponent('jump', 9)).toBe('realign');
		expect(describeComponent('jump', 0)).toBe('random step');
		expect(describeComponent('skip trigger', 1)).toBe('every pass');
		expect(describeComponent('skip parameter lock', 3)).toBe('every 3rd pass');
		expect(describeComponent('skip step component', 0)).toBe('random passes');
		expect(NATURALS.map(naturalIndex)).toEqual([...Array(14).keys()]);
		expect(ACCIDENTALS.map(accidentalDigit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
		expect(accidentalDigit(0)).toBeNull();
	});
});

describe('parameter locks (manual: sequencer/parameter-locks)', () => {
	it('stores the turned value on a held step, shows the step, and leaves the track alone', () => {
		const { sim } = rig();
		sim.press('track.3'); // prism, M1
		down(sim, 'step.5');
		const held = page(sim, 'lock');
		expect(held).toMatchObject({ step: 5, locks: 0, last: null });
		sim.turn(1, -30);
		const lock = page(sim, 'lock');
		expect(lock.base).toMatchObject({ page: 'synth' });
		expect(lock.base.page === 'synth' && lock.base.header[0].value).toBe('50');
		expect(lock).toMatchObject({ locks: 1, last: { label: 'shape', value: '50' } });
		expect(sim.track.m1[0]).toBe(80);
		up(sim, 'step.5');
		// a lock on an empty step (OS 1.1.33): no note is placed
		expect(pattern(sim).steps[4]).toEqual({ notes: [], components: [], locks: { 'm1.1': 50 } });
		expect(page(sim, 'synth').header[0].value).toBe('80');
		// holding it again shows its value, and turning starts from it
		down(sim, 'step.5');
		sim.turn(1, 5);
		expect(pattern(sim).steps[4].locks['m1.1']).toBe(55);
		expect(describeFrame(sim.frame)).toBe(
			'step 5 held, 1 lock, shape 55: prism: shape 55, ratio 80, detune 80, stereo 80'
		);
		up(sim, 'step.5');
	});

	it('locks every held step, on each page and shift layer', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1, 2]);
		const locks = (step: number) => pattern(sim).steps[step].locks;
		sim.press('key.m3');
		down(sim, 'step.1');
		down(sim, 'step.2');
		sim.turn(1, -20);
		up(sim, 'step.2');
		up(sim, 'step.1');
		expect(locks(0)).toEqual({ 'filter.cutoff': 79 });
		expect(locks(1)).toEqual({ 'filter.cutoff': 79 });
		expect(notesOn(sim, 0)).toEqual([60]); // not cleared: the hold was a lock
		down(sim, 'step.1');
		down(sim, 'key.shift');
		sim.turn(3, 40); // FX I send
		up(sim, 'key.shift');
		sim.press('key.m2'); // M keys still change pages while a step is held
		sim.turn(1, 10);
		sim.click(2); // swaps to the filter envelope
		sim.turn(1, -9);
		sim.press('key.m4');
		sim.turn(2, -50);
		up(sim, 'step.1');
		expect(locks(0)).toEqual({
			'filter.cutoff': 79,
			'sends.fx1': 40,
			'amp.attack': 10,
			'filterEnv.attack': 90,
			'lfo.amount': -50
		});
		expect(sim.track.envelope).toBe('filter');
		expect(sim.track.sends[2]).toBe(0);
		// one undo takes back the whole held gesture
		sim.combo('key.shift', 'key.record');
		expect(locks(0)).toEqual({ 'filter.cutoff': 79 });
	});

	it('locks sampler keys (fine tune included) but not the midi engine', () => {
		const { sim } = rig();
		down(sim, 'step.2'); // T1, drum sampler
		sim.turn(1, -12);
		sim.turn(1, -3, true);
		const lock = page(sim, 'lock');
		expect(lock.base.page === 'drum' && lock.base.tune).toBe('–1.23');
		up(sim, 'step.2');
		expect(pattern(sim).steps[1].locks).toEqual({ 'key0.tune': -1.23 });
		const t = sim.state.tracks[2];
		t.engine = 'midi';
		sim.press('track.3');
		down(sim, 'step.1');
		sim.turn(1, 3);
		up(sim, 'step.1');
		expect(t.midi.channel).toBe(1);
		expect(pattern(sim).steps[0].locks).toEqual({});
	});

	it('maps encoders to lock ids like the core, and applies locks to a copy of the track', () => {
		const { sim } = rig();
		const s = sim.state;
		sim.press('track.3');
		expect(lockTarget(s, 3)?.id).toBe('m1.4');
		sim.press('key.m4');
		expect([0, 1, 2, 3].map((e) => lockTarget(s, e)?.id)).toEqual([
			'lfo.speed',
			'lfo.amount',
			'lfo.destination',
			'lfo.parameter'
		]);
		sim.state.tracks[2].lfo.type = 'duck';
		expect(lockTarget(s, 0)?.id).toBe('lfo.source');
		sim.state.tracks[2].lfo.type = 'tremolo';
		expect(lockTarget(s, 3)).toBeNull();
		sim.press('track.1');
		sim.press('key.m1');
		sim.state.shift = true;
		expect([0, 1, 2, 3].map((e) => lockTarget(s, e)?.id)).toEqual([
			'key0.reverse',
			'key0.pan',
			'key0.fade',
			'key0.gain'
		]);
		sim.state.shift = false;
		const t = sim.track;
		const reverse = lockParam('key0.reverse');
		expect(reverse && turnedValue(reverse, t, {}, -1, false)).toBe(1);
		const start = lockParam('key0.start');
		t.drumKeys[0].end = 40;
		expect(start && turnedValue(start, t, {}, 90, false)).toBe(40);
		const copy = lockedTrack(t, { 'key0.start': 12, 'filter.cutoff': 3, 'lfo.speed': 20 });
		expect(copy.drumKeys[0].start).toBe(12);
		expect(copy.filter.cutoff).toBe(3);
		expect(t.filter.cutoff).toBe(99);
		expect(lockParam('lfo.speed')?.format(20)).toBe('08');
		expect(lockParam('nope')).toBeNull();
		expect(lockedTrack(t, {})).toBe(t);
	});
});

describe('step gestures (manual: extend-notes, copy-step, nudge, rotate, transpose, single-sound)', () => {
	it('stretches a held step to a later one: full step, then overlap', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1]);
		down(sim, 'step.1');
		sim.press('step.4');
		expect(pattern(sim).steps[0].notes[0].length).toBe(4);
		sim.press('step.4');
		expect(pattern(sim).steps[0].notes[0].length).toBe(4 + OVERLAP);
		up(sim, 'step.1');
		expect(notesOn(sim, 0)).toEqual([60]);
		expect(notesOn(sim, 3)).toEqual([]);
	});

	it('copies a step held a while and pastes it on the next empty step', () => {
		const { sim, clock } = rig();
		sim.press('track.3');
		place(sim, 'e4', [1]);
		down(sim, 'step.1');
		sim.turn(2, 5); // a lock comes along
		up(sim, 'step.1');
		down(sim, 'step.1');
		clock.t += 600;
		up(sim, 'step.1');
		expect(notesOn(sim, 0)).toEqual([64]); // copied, not cleared
		sim.press('step.9');
		expect(pattern(sim).steps[8]).toEqual(pattern(sim).steps[0]);
		sim.press('step.10');
		expect(notesOn(sim, 9)).toEqual([64]);
		// playing a key forgets the copy
		place(sim, 'g4', [11]);
		expect(pattern(sim).steps[10]).toMatchObject({ notes: [{ note: 67 }], locks: {} });
		// a short tap still clears
		sim.press('step.11');
		expect(notesOn(sim, 10)).toEqual([]);
	});

	it('nudges held steps only below quantise 100', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [2]);
		down(sim, 'step.2');
		sim.press('key.plus');
		up(sim, 'step.2');
		expect(pattern(sim).steps[1].notes[0].offset).toBe(0);
		expect(notesOn(sim, 1)).toEqual([60]); // the hold was a nudge, not a tap
		down(sim, 'key.bar');
		sim.turn(1, -50);
		up(sim, 'key.bar');
		down(sim, 'step.2');
		sim.press('key.plus');
		sim.press('key.plus');
		sim.press('key.minus');
		up(sim, 'step.2');
		expect(pattern(sim).steps[1].notes[0].offset).toBeCloseTo(NUDGE);
	});

	it('rotates with a track key held, transposes with shift, moves octaves plain', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1]);
		down(sim, 'track.3');
		sim.press('key.plus');
		up(sim, 'track.3');
		expect(notesOn(sim, 1)).toEqual([60]);
		sim.combo('key.shift', 'key.plus');
		expect(notesOn(sim, 1)).toEqual([72]);
		sim.combo('key.shift', 'key.minus');
		sim.combo('key.shift', 'key.minus');
		expect(notesOn(sim, 1)).toEqual([48]);
		// the keyboard an octave up: C4's key now plays C5
		sim.press('key.plus');
		expect(sim.state.areas.sequencer.octave).toBe(1);
		place(sim, 'c4', [5]);
		expect(notesOn(sim, 4)).toEqual([72]);
		down(sim, 'step.5');
		expect(litKeys(sim)).toEqual(['c4']);
		up(sim, 'step.5');
		for (let i = 0; i < 6; i++) sim.press('key.plus');
		expect(sim.state.areas.sequencer.octave).toBe(3);
		// drums: a semitone per press, and no octaves on the keys
		sim.press('track.1');
		place(sim, 'f3', [1]);
		expect(notesOn(sim, 0)).toEqual([53]);
		sim.combo('key.shift', 'key.plus');
		expect(notesOn(sim, 0)).toEqual([54]);
	});

	it('shows one note’s steps with key + record, and sequences just that note', () => {
		const { sim } = rig();
		place(sim, 'f3', [1, 5, 9, 13]); // kick
		place(sim, 'fs3', [3, 7]); // snare
		down(sim, 'keyboard.fs3');
		sim.press('key.record');
		expect(stepLeds(sim)).toBe('..w...w.........');
		sim.press('step.5'); // adds the snare where the kick is
		expect(notesOn(sim, 4)).toEqual([53, 54]);
		expect(stepLeds(sim)).toBe('..w.w.w.........');
		up(sim, 'keyboard.fs3');
		expect(stepLeds(sim)).toBe('w.w.w.w.w...w...');
		// key + step enters the view directly
		down(sim, 'keyboard.g3');
		sim.press('step.16');
		expect(stepLeds(sim)).toBe('...............w');
		up(sim, 'keyboard.g3');
	});
});

describe('live recording (manual: sequencer/live-recording)', () => {
	it('arms, starts with the first note, records with offsets and lengths, red until stop', () => {
		const { sim } = rig();
		sim.press('track.3');
		down(sim, 'key.record');
		sim.press('key.play');
		up(sim, 'key.record');
		expect(sim.state.transport).toMatchObject({ playing: false, recording: true });
		expect(stepLeds(sim)).toBe('r...............');
		down(sim, 'keyboard.c4');
		expect(sim.state.transport.playing).toBe(true);
		sim.advance(SIXTEENTH * 2);
		up(sim, 'keyboard.c4');
		expect(pattern(sim).steps[0].notes).toEqual([
			{ note: 60, velocity: 100, length: 2, offset: 0 }
		]);
		sim.advance(SIXTEENTH * 2.3);
		sim.press('keyboard.e4');
		expect(pattern(sim).steps[4].notes[0]).toMatchObject({ note: 64, offset: 0.3 });
		sim.advance(SIXTEENTH * 0.5);
		expect(stepLeds(sim)).toBe('r...w...........');
		sim.press('key.stop');
		expect(sim.state.transport).toMatchObject({ playing: false, recording: false });
		expect(stepLeds(sim)).toBe('w...w...........');
	});

	it('records while record is held during playback, or latched with record + play', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.play');
		sim.advance(SIXTEENTH);
		sim.press('keyboard.c4'); // not recording
		expect(notesOn(sim, 1)).toEqual([]);
		down(sim, 'key.record');
		sim.press('keyboard.d4');
		up(sim, 'key.record');
		sim.advance(SIXTEENTH);
		sim.press('keyboard.e4'); // not recording any more
		expect(notesOn(sim, 1)).toEqual([62]);
		expect(notesOn(sim, 2)).toEqual([]);
		down(sim, 'key.record');
		sim.press('key.play'); // latch
		up(sim, 'key.record');
		expect(sim.state.transport.position).toBeCloseTo(2);
		sim.press('keyboard.f4');
		expect(notesOn(sim, 2)).toEqual([65]);
		sim.press('key.record'); // a tap unlatches
		sim.advance(SIXTEENTH);
		sim.press('keyboard.g4');
		expect(notesOn(sim, 3)).toEqual([]);
	});

	it('counts in a bar with record + play → play', () => {
		const { sim } = rig();
		sim.press('track.3');
		down(sim, 'key.record');
		sim.press('key.play');
		sim.press('key.play');
		up(sim, 'key.record');
		expect(sim.state.transport).toMatchObject({ playing: true, position: -COUNT_IN });
		expect(stepLeds(sim)).toBe('r...............');
		sim.press('keyboard.c4'); // during the count-in: not recorded
		expect(notesOn(sim, 0)).toEqual([]);
		sim.advance(SIXTEENTH * COUNT_IN);
		sim.press('keyboard.c4');
		expect(notesOn(sim, 0)).toEqual([60]);
	});

	it('stores encoder moves on the playing step (automation), turning the track too', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.m3');
		sim.press('key.play');
		sim.advance(SIXTEENTH * 2.2);
		down(sim, 'key.record');
		sim.turn(1, -10);
		up(sim, 'key.record');
		expect(pattern(sim).steps[2].locks).toEqual({ 'filter.cutoff': 89 });
		expect(sim.track.filter.cutoff).toBe(89);
	});
});

describe('step recording (manual: sequencer/step-recording)', () => {
	it('fills the red cursor step by step, chords on one step, with rests, backs and deletes', () => {
		const { sim } = rig();
		sim.press('track.3');
		down(sim, 'key.record');
		expect(stepLeds(sim)).toBe('r...............');
		sim.press('keyboard.c4');
		expect(stepLeds(sim)).toBe('wr..............');
		down(sim, 'keyboard.e4');
		down(sim, 'keyboard.g4');
		expect(notesOn(sim, 1)).toEqual([64, 67]);
		expect(litKeys(sim).sort()).toEqual(['e4', 'g4']);
		up(sim, 'keyboard.e4');
		up(sim, 'keyboard.g4');
		expect(stepLeds(sim)).toBe('wwr.............');
		sim.press('key.plus'); // a rest
		sim.press('keyboard.d4');
		expect(notesOn(sim, 3)).toEqual([62]);
		sim.press('key.minus');
		sim.press('key.minus');
		sim.press('key.minus');
		// back on step 2: its notes light, ready to replace
		expect(litKeys(sim).sort()).toEqual(['e4', 'g4']);
		sim.press('keyboard.a4');
		expect(notesOn(sim, 1)).toEqual([69]);
		sim.press('step.1'); // removes step 1
		expect(notesOn(sim, 0)).toEqual([]);
		up(sim, 'key.record');
		expect(sim.state.areas.sequencer.cursor).toBeNull();
		expect(stepLeds(sim)).toBe('.w.w............');
		expect(sim.state.transport).toMatchObject({ playing: false, recording: false });
	});

	it('follows the cursor into the next bar', () => {
		const { sim } = rig();
		sim.press('track.3');
		down(sim, 'key.bar');
		sim.press('key.plus');
		up(sim, 'key.bar');
		down(sim, 'key.record');
		for (let i = 0; i < 16; i++) sim.press('key.plus');
		expect(stepLeds(sim)).toBe('r...............');
		sim.press('keyboard.c4');
		up(sim, 'key.record');
		expect(notesOn(sim, 16)).toEqual([60]);
		expect(sim.track.sequence.page).toBe(1);
	});
});

describe('clearing and undo (manual: sequencer/clear-and-undo)', () => {
	it('clears the pattern with record + stop held long enough, and undoes it', () => {
		const { sim, clock } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1, 2, 3]);
		down(sim, 'key.record');
		down(sim, 'key.stop');
		expect(stepLeds(sim)).toBe('rww.............');
		clock.t += 500;
		up(sim, 'key.stop');
		expect(notesOn(sim, 0)).toEqual([60]); // not long enough
		down(sim, 'key.stop');
		clock.t += 1200;
		up(sim, 'key.stop');
		up(sim, 'key.record');
		expect([0, 1, 2].map((i) => notesOn(sim, i))).toEqual([[], [], []]);
		sim.combo('key.shift', 'key.record');
		expect([0, 1, 2].map((i) => notesOn(sim, i))).toEqual([[60], [60], [60]]);
	});

	it('fills the row red while playing and clears when it is full', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [9]);
		sim.press('key.play');
		down(sim, 'key.record');
		down(sim, 'key.stop');
		expect(sim.state.transport.playing).toBe(true);
		sim.advance(500);
		expect(stepLeds(sim).slice(0, 8)).toBe('rrrrrrrr');
		sim.advance(600);
		expect(notesOn(sim, 8)).toEqual([]);
		up(sim, 'key.stop');
		up(sim, 'key.record');
	});
});

describe('players (manual: players/*)', () => {
	it('opens with player, switches on with player again, and steps through types with shift', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.player');
		expect(page(sim, 'player')).toMatchObject({ type: 'arpeggio', on: false });
		sim.press('key.player');
		expect(page(sim, 'player').on).toBe(true);
		sim.combo('key.shift', 'key.player');
		expect(page(sim, 'player').type).toBe('maestro');
		sim.combo('key.shift', 'key.player');
		expect(page(sim, 'player')).toMatchObject({ type: 'hold', cards: [] });
		sim.combo('key.shift', 'key.player');
		expect(page(sim, 'player').type).toBe('arpeggio');
		sim.press('key.m1');
		expect(sim.frame.page).toBe('synth');
		// each track's pattern has its own player
		sim.press('track.4');
		expect(pattern(sim).player.on).toBe(false);
	});

	it('sets the arpeggio on two layers and pictures its run', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.player');
		sim.turn(1, 2);
		sim.turn(2, 2);
		sim.turn(3, 1);
		sim.turn(4, 1);
		const frame = page(sim, 'player');
		expect(frame.cards.map((c) => c.value)).toEqual(['1/8', 'up/down', '2 oct', 'on']);
		expect(frame.run).toEqual([0, 4, 7, 12, 16, 19, 16, 12, 7, 4]);
		down(sim, 'key.shift');
		sim.turn(1, -20);
		sim.turn(2, 1);
		sim.turn(3, 30);
		sim.turn(4, 99);
		const layer = page(sim, 'player');
		expect(layer.shift).toBe(true);
		expect(layer.cards.map((c) => `${c.label} ${c.value}`)).toEqual([
			'length 30',
			'style converge',
			'glide 30',
			'stereo 99'
		]);
		up(sim, 'key.shift');
		sim.click(4); // hold off again
		expect(pattern(sim).player.arp.hold).toBe(false);
		expect(describeFrame(sim.frame)).toBe(
			'arpeggio player off: speed 1/8, pattern up/down, range 2 oct, hold off'
		);
	});

	it('runs the arpeggio over held (or kept) notes, lighting the note it plays', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.press('key.player');
		sim.press('key.player');
		sim.turn(4, 1); // hold on
		sim.press('key.m1');
		for (const key of ['c4', 'e4', 'g4']) down(sim, `keyboard.${key}`);
		for (const key of ['c4', 'e4', 'g4']) up(sim, `keyboard.${key}`);
		expect(litKeys(sim).sort()).toEqual(['c4', 'e4', 'g4']);
		sim.press('key.play');
		expect(litKeys(sim)).toEqual(['c4']);
		sim.advance(SIXTEENTH);
		expect(litKeys(sim)).toEqual(['e4']);
		sim.press('key.stop');
		expect(litKeys(sim)).toEqual([]);
		// keys held down run it too: the keyboard shows the note sounding, not every key held
		down(sim, 'keyboard.d4');
		down(sim, 'keyboard.a4');
		expect(litKeys(sim).sort()).toEqual(['a4', 'd4']);
		sim.press('key.play');
		expect(litKeys(sim)).toEqual(['d4']);
		sim.advance(SIXTEENTH);
		expect(litKeys(sim)).toEqual(['a4']);
		up(sim, 'keyboard.d4');
		up(sim, 'keyboard.a4');
	});

	it('holds notes until the next ones with the hold player', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.combo('key.shift', 'key.player');
		sim.combo('key.shift', 'key.player');
		sim.press('key.player'); // hold, on
		sim.press('keyboard.c4');
		expect(litKeys(sim)).toEqual(['c4']);
		expect(page(sim, 'player').marks).toEqual([0]);
		sim.press('keyboard.e4');
		expect(litKeys(sim)).toEqual(['e4']);
		down(sim, 'keyboard.g4');
		sim.press('keyboard.a4');
		up(sim, 'keyboard.g4');
		expect(litKeys(sim).sort()).toEqual(['a4', 'g4']);
		sim.press('key.player'); // off lets go
		expect(litKeys(sim)).toEqual([]);
		sim.press('key.player');
		sim.press('keyboard.c4');
		sim.press('key.stop'); // so does stop
		expect(litKeys(sim)).toEqual([]);
	});

	it('stores a maestro chord with shift held and plays it from any key', () => {
		const { sim } = rig();
		sim.press('track.4');
		sim.combo('key.shift', 'key.player');
		sim.press('key.player'); // maestro, on
		down(sim, 'key.shift');
		for (const key of ['d4', 'f4', 'a4']) sim.press(`keyboard.${key}`);
		up(sim, 'key.shift');
		expect(pattern(sim).player.maestro.chord).toEqual([62, 65, 69]);
		const frame = page(sim, 'player');
		expect(frame).toMatchObject({ root: 'd4', marks: [2, 5, 9] });
		expect(frame.cards.map((c) => c.label)).toEqual(['roll', 'pattern', '', 'hold']);
		down(sim, 'keyboard.c4');
		expect(litKeys(sim).sort()).toEqual(['c4', 'ds4', 'g4']);
		up(sim, 'keyboard.c4');
		expect(litKeys(sim)).toEqual([]);
		// a new chord replaces the old one
		down(sim, 'key.shift');
		sim.press('keyboard.e4');
		up(sim, 'key.shift');
		expect(pattern(sim).player.maestro.chord).toEqual([64]);
		sim.turn(1, 40);
		sim.turn(2, 3);
		sim.turn(4, 1);
		expect(page(sim, 'player').cards.map((c) => c.value)).toEqual(['40', 'random', '', 'on']);
		sim.press('keyboard.g4');
		expect(litKeys(sim)).toEqual(['g4']);
	});
});

describe('flashing LEDs', () => {
	it('tells a host when an LED flashes, so it can keep the clock running while stopped', () => {
		const { sim } = rig();
		expect(flashing(sim.state)).toBe(false);
		down(sim, 'key.record');
		sim.press('key.play'); // armed
		expect(flashing(sim.state)).toBe(true);
		up(sim, 'key.record');
		sim.press('key.record'); // disarmed
		expect(flashing(sim.state)).toBe(false);
		down(sim, 'key.shift');
		sim.press('step.1');
		expect(flashing(sim.state)).toBe(true);
		up(sim, 'key.shift');
		expect(flashing(sim.state)).toBe(false);
	});
});

describe('auxiliary tracks and rendering', () => {
	it('sequences auxiliary tracks with the same gestures (locks stay with instrument pages)', () => {
		const { sim } = rig();
		sim.press('key.auxiliary');
		sim.press('track.2');
		place(sim, 'c4', [1, 2]);
		const aux = currentPattern(sim.state.aux[1].sequence);
		expect(aux.steps[0].notes.map((n) => n.note)).toEqual([60]);
		down(sim, 'key.shift');
		sim.press('step.2');
		sim.press('keyboard.f3');
		up(sim, 'key.shift');
		expect(aux.steps[1].components).toEqual([{ kind: 'pulse', value: 4 }]);
		down(sim, 'step.1');
		expect(sim.frame.page).not.toBe('lock');
		up(sim, 'step.1');
	});

	it('draws and describes every page', () => {
		const { sim } = rig();
		sim.press('track.3');
		place(sim, 'c4', [1, 3]);
		const frames: ScreenFrame[] = [];
		down(sim, 'key.bar');
		frames.push(sim.frame);
		up(sim, 'key.bar');
		down(sim, 'key.shift');
		sim.press('step.3');
		frames.push(sim.frame);
		sim.press('keyboard.b4'); // natural 11: jump
		sim.press('keyboard.cs4'); // accidental 4
		frames.push(sim.frame);
		up(sim, 'key.shift');
		sim.press('key.player');
		frames.push(sim.frame);
		sim.combo('key.shift', 'key.player');
		frames.push(sim.frame);
		sim.combo('key.shift', 'key.player');
		frames.push(sim.frame);
		sim.press('key.m1');
		down(sim, 'step.1');
		sim.turn(2, 3);
		frames.push(sim.frame);
		up(sim, 'step.1');
		expect(frames.map((f) => f.page)).toEqual([
			'bar',
			'components',
			'components',
			'player',
			'player',
			'player',
			'lock'
		]);
		for (const frame of frames) {
			const ctx = new RecordingContext();
			renderFrame(ctx, frame);
			expect(ctx.fills.length, frame.page).toBeGreaterThan(5);
			expect(describeFrame(frame).length).toBeGreaterThan(10);
		}
		expect(describeFrame(frames[0])).toContain('bar menu: quantise 100');
		expect(describeFrame(frames[2])).toBe(
			'step components on steps 3: jump to step 13; on them: jump'
		);
	});
});
