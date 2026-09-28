import { describe, expect, it } from 'vitest';
import { OpxySim } from './opxy-sim.svelte';
import {
	GROOVE_VALUES,
	MAX_NOTES,
	MAX_STEPS,
	NUDGE,
	OVERLAP,
	STEP_COMPONENTS,
	TRACK_SCALES,
	addBar,
	canNudge,
	clearAll,
	clearLocks,
	clearNotes,
	cloneSequence,
	componentIndex,
	currentPattern,
	digitForScale,
	duplicateBars,
	emptyPattern,
	emptySequence,
	extendNotes,
	formatScale,
	getComponent,
	lockCount,
	newPatternLike,
	noteCount,
	nudgeStep,
	pasteStep,
	recordNote,
	removeBar,
	rotatePattern,
	scaleForDigit,
	setComponentValue,
	setLastBarLength,
	setLock,
	stepAt,
	stepGroove,
	toggleComponent,
	toggleNote,
	toggleStep,
	transposePattern
} from './sequencer';

describe('sequencer model', () => {
	it('starts a pattern as one empty bar of the 64 steps it can hold', () => {
		const p = emptyPattern();
		expect(p.steps).toHaveLength(MAX_STEPS);
		// quantisation 100 and note length 50 (half a step), as decoded project files show
		expect(p).toMatchObject({
			bars: 1,
			length: 16,
			scale: 1,
			quantise: 100,
			quantiseOn: true,
			noteLength: 0.5,
			groove: 0,
			smoothing: 0
		});
		expect(p.player).toMatchObject({ type: 'arpeggio', on: false });
		expect(noteCount(p)).toBe(0);
	});

	it('stores notes on an empty step and clears a step with notes', () => {
		const p = emptyPattern();
		expect(toggleStep(p, 3, [60, 64, 67, 60])).toBe(true);
		expect(p.steps[3].notes.map((n) => n.note)).toEqual([60, 64, 67]);
		expect(p.steps[3].notes[0]).toEqual({ note: 60, velocity: 100, length: 0.5, offset: 0 });
		expect(toggleStep(p, 3, [72])).toBe(true);
		expect(p.steps[3].notes).toEqual([]);
		expect(toggleStep(p, 99, [60])).toBe(false);
		expect(toggleStep(p, 0, [])).toBe(false);
	});

	it('toggles single notes on a held step, up to 120 notes per pattern', () => {
		const p = emptyPattern();
		toggleNote(p, 0, 60);
		toggleNote(p, 0, 63);
		toggleNote(p, 0, 60);
		expect(p.steps[0].notes.map((n) => n.note)).toEqual([63]);
		for (let i = 0; i < MAX_STEPS; i++) {
			toggleNote(p, i, 40);
			toggleNote(p, i, 41);
		}
		expect(noteCount(p)).toBe(MAX_NOTES);
		expect(toggleStep(p, 63, [50])).toBe(false);
		expect(toggleNote(p, 63, 50)).toBe(false);
	});

	it("moves each track's playhead by its own scale and length, wrapping a count-in too", () => {
		const p = emptyPattern();
		expect(stepAt(p, 17)).toBe(1);
		p.length = 12;
		expect(stepAt(p, 13)).toBe(1);
		p.scale = 2;
		expect(stepAt(p, 5)).toBe(2);
		p.scale = 1;
		expect(stepAt(p, -1)).toBe(11);
	});

	it('lists the fourteen step components with their default digits', () => {
		expect(STEP_COMPONENTS).toHaveLength(14);
		expect(STEP_COMPONENTS[0]).toEqual({ kind: 'pulse', defaultValue: 4 });
		expect(STEP_COMPONENTS[3]).toEqual({ kind: 'velocity', defaultValue: 5 });
		expect(STEP_COMPONENTS[13]).toEqual({ kind: 'skip trigger', defaultValue: 2 });
		expect(componentIndex('multiply')).toBe(2);
	});

	it('copies deeply and makes new patterns with the selected player type', () => {
		const s = emptySequence(53);
		toggleStep(currentPattern(s), 0, [53]);
		const copy = cloneSequence(s);
		copy.patterns[0].steps[0].notes[0].note = 54;
		expect(currentPattern(s).steps[0].notes[0].note).toBe(53);
		const p = emptyPattern();
		p.player.type = 'hold';
		p.player.on = true;
		expect(newPatternLike(p).player).toMatchObject({ type: 'hold', on: false });
	});
});

describe('bars, length and scale (manual: sequencer/bars-and-length, track-scale)', () => {
	it('adds bars up to four and removes them with what they held', () => {
		const p = emptyPattern();
		expect(addBar(p)).toBe(true);
		expect(p).toMatchObject({ bars: 2, length: 32 });
		toggleStep(p, 20, [60]);
		addBar(p);
		addBar(p);
		expect(addBar(p)).toBe(false);
		expect(p).toMatchObject({ bars: 4, length: 64 });
		removeBar(p);
		removeBar(p);
		expect(p).toMatchObject({ bars: 2, length: 32 });
		expect(p.steps[20].notes).toHaveLength(1);
		removeBar(p);
		expect(p.steps[20].notes).toHaveLength(0);
		expect(removeBar(p)).toBe(false);
	});

	it('trims only the last bar with bar + step n', () => {
		const p = emptyPattern();
		setLastBarLength(p, 12);
		expect(p.length).toBe(12);
		addBar(p);
		setLastBarLength(p, 5);
		expect(p.length).toBe(21);
		setLastBarLength(p, 40);
		expect(p.length).toBe(32);
	});

	it('duplicates: one bar doubles, two bars double, three bars copy the bar shown', () => {
		const p = emptyPattern();
		toggleStep(p, 0, [60]);
		setComponentValue(p, [0], 'multiply', 3);
		setLock(p, 0, 'filter.cutoff', 20);
		expect(duplicateBars(p, 0)).toBe(true);
		expect(p).toMatchObject({ bars: 2, length: 32 });
		// notes, components and locks come along (OS 1.1.3)
		expect(p.steps[16]).toEqual(p.steps[0]);
		toggleStep(p, 17, [62]);
		duplicateBars(p, 0);
		expect(p.bars).toBe(4);
		expect(p.steps[32].notes[0].note).toBe(60);
		expect(p.steps[49].notes[0].note).toBe(62);
		expect(duplicateBars(p, 0)).toBe(false);

		const three = emptyPattern();
		addBar(three);
		addBar(three);
		toggleStep(three, 20, [64]);
		expect(duplicateBars(three, 1)).toBe(true);
		expect(three.bars).toBe(4);
		expect(three.steps[52].notes[0].note).toBe(64);
	});

	it('refuses a duplicate that would pass 120 notes', () => {
		const p = emptyPattern();
		for (let i = 0; i < 16; i++) toggleStep(p, i, [60, 61, 62, 63]);
		addBar(p);
		for (let i = 16; i < 32; i++) toggleStep(p, i, [60, 61]);
		expect(noteCount(p)).toBe(96);
		expect(duplicateBars(p, 0)).toBe(false);
		expect(p.bars).toBe(2);
	});

	it('maps the ten black keys to track scales and shows them', () => {
		expect(TRACK_SCALES).toHaveLength(10);
		expect(scaleForDigit(4)).toBe(4);
		expect(scaleForDigit(9)).toBe(16);
		expect(scaleForDigit(0)).toBe(0.5);
		expect(digitForScale(0.5)).toBe(0);
		expect(digitForScale(16)).toBe(9);
		expect(digitForScale(12)).toBeNull();
		expect(formatScale(0.5)).toBe('1/2');
		expect(formatScale(16)).toBe('16');
	});

	it('steps the groove along the device detents', () => {
		expect(GROOVE_VALUES).toHaveLength(87);
		expect(stepGroove(0, 1)).toBe(2);
		expect(stepGroove(0, 3)).toBe(7);
		expect(stepGroove(0, -1)).toBe(-2);
		expect(stepGroove(98, 5)).toBe(99);
		expect(stepGroove(5, 0)).toBe(4);
	});
});

describe('clearing (manual: sequencer/clear-and-undo)', () => {
	function busy() {
		const p = emptyPattern();
		toggleStep(p, 1, [60]);
		setComponentValue(p, [1], 'pulse', 2);
		setLock(p, 1, 'filter.cutoff', 10);
		setLock(p, 5, 'm1.1', 3);
		return p;
	}

	it('bar + M1 clears notes (and their components) but keeps locks', () => {
		const p = busy();
		clearNotes(p);
		expect(noteCount(p)).toBe(0);
		expect(p.steps[1].components).toEqual([]);
		expect(lockCount(p)).toBe(2);
	});

	it('bar + M2 clears locks, bar + M4 everything', () => {
		const p = busy();
		clearLocks(p);
		expect(lockCount(p)).toBe(0);
		expect(noteCount(p)).toBe(1);
		const q = busy();
		clearAll(q);
		expect(noteCount(q) + lockCount(q) + q.steps[1].components.length).toBe(0);
	});
});

describe('step components (manual: sequencer/step-components)', () => {
	it('adds a component at its default digit, sets digits and takes it off again', () => {
		const p = emptyPattern();
		expect(toggleComponent(p, [0, 4], 'multiply')).toBe('added');
		expect(getComponent(p.steps[4], 'multiply')).toEqual({ kind: 'multiply', value: 2 });
		setComponentValue(p, [0, 4], 'multiply', 3);
		expect(p.steps[0].components).toEqual([{ kind: 'multiply', value: 3 }]);
		expect(toggleComponent(p, [0, 4], 'multiply')).toBe('removed');
		expect(p.steps[0].components).toEqual([]);
		expect(toggleComponent(p, [], 'pulse')).toBeNull();
	});

	it('adds to the steps that lack it when only some have it, and wraps digits', () => {
		const p = emptyPattern();
		setComponentValue(p, [0], 'velocity', 8);
		expect(toggleComponent(p, [0, 1], 'velocity')).toBe('added');
		expect(getComponent(p.steps[0], 'velocity')?.value).toBe(8);
		expect(getComponent(p.steps[1], 'velocity')?.value).toBe(5);
		setComponentValue(p, [1], 'velocity', 10);
		expect(getComponent(p.steps[1], 'velocity')?.value).toBe(0);
	});
});

describe('editing gestures on the model', () => {
	it('extends notes to a later step: full step, then overlap, then full again', () => {
		const p = emptyPattern();
		toggleStep(p, 2, [60, 64]);
		expect(extendNotes(p, 2, 5)).toBe('full');
		expect(p.steps[2].notes.map((n) => n.length)).toEqual([4, 4]);
		expect(extendNotes(p, 2, 5)).toBe('overlap');
		expect(p.steps[2].notes[0].length).toBe(4 + OVERLAP);
		expect(extendNotes(p, 2, 5)).toBe('full');
		expect(extendNotes(p, 2, 1)).toBeNull();
		expect(extendNotes(p, 3, 5)).toBeNull();
	});

	it('nudges only below quantisation 100, within half a step', () => {
		const p = emptyPattern();
		toggleStep(p, 0, [60]);
		expect(canNudge(p)).toBe(false);
		expect(nudgeStep(p, 0, 1)).toBe(false);
		p.quantise = 50;
		expect(nudgeStep(p, 0, 1)).toBe(true);
		expect(p.steps[0].notes[0].offset).toBeCloseTo(NUDGE);
		for (let i = 0; i < 30; i++) nudgeStep(p, 0, -1);
		expect(p.steps[0].notes[0].offset).toBe(-0.5);
		p.quantise = 100;
		p.quantiseOn = false;
		expect(canNudge(p)).toBe(true);
		expect(nudgeStep(p, 5, 1)).toBe(false);
	});

	it('rotates the whole played length with components and locks, wrapping', () => {
		const p = emptyPattern();
		p.length = 12;
		toggleStep(p, 11, [60]);
		setComponentValue(p, [11], 'pulse', 1);
		setLock(p, 11, 'filter.cutoff', 5);
		toggleStep(p, 12, [70]); // past the length: stays put
		rotatePattern(p, 1);
		expect(p.steps[0].notes[0].note).toBe(60);
		expect(p.steps[0].components).toHaveLength(1);
		expect(p.steps[0].locks).toEqual({ 'filter.cutoff': 5 });
		expect(p.steps[11].notes).toEqual([]);
		expect(p.steps[12].notes[0].note).toBe(70);
		rotatePattern(p, -1);
		expect(p.steps[11].notes[0].note).toBe(60);
		rotatePattern(p, 12);
		expect(p.steps[11].notes[0].note).toBe(60);
	});

	it('transposes every note, refusing to leave MIDI range', () => {
		const p = emptyPattern();
		toggleStep(p, 0, [60]);
		toggleStep(p, 3, [120]);
		expect(transposePattern(p, 12)).toBe(false);
		expect(transposePattern(p, -12)).toBe(true);
		expect(p.steps[0].notes[0].note).toBe(48);
		expect(p.steps[3].notes[0].note).toBe(108);
	});

	it('pastes notes, components and locks, within the note limit', () => {
		const p = emptyPattern();
		toggleStep(p, 0, [60, 64]);
		setComponentValue(p, [0], 'bend', 3);
		setLock(p, 0, 'lfo.amount', -40);
		expect(pasteStep(p, 9, p.steps[0])).toBe(true);
		expect(p.steps[9]).toEqual(p.steps[0]);
		p.steps[9].notes[0].note = 61;
		expect(p.steps[0].notes[0].note).toBe(60);
		for (let i = 16; i < 64; i++) toggleStep(p, i, [40, 41]);
		expect(noteCount(p)).toBe(100);
		for (let i = 10; i < 16; i++) toggleStep(p, i, [30, 31, 32]);
		expect(noteCount(p)).toBe(118);
		expect(pasteStep(p, 1, p.steps[0])).toBe(true);
		expect(pasteStep(p, 2, p.steps[0])).toBe(false);
	});

	it('records live notes on the nearest step with their offset, wrapping takes', () => {
		const p = emptyPattern();
		expect(recordNote(p, 3.3, 60)).toEqual({ index: 3, offset: 0.3 });
		expect(recordNote(p, 4.75, 62)).toEqual({ index: 5, offset: -0.25 });
		expect(recordNote(p, 17.5, 64)).toEqual({ index: 2, offset: -0.5 });
		expect(recordNote(p, 15.6, 65)).toEqual({ index: 0, offset: -0.4 });
		expect(p.steps[3].notes[0]).toMatchObject({ note: 60, offset: 0.3, length: 0.5 });
		// the same note again on that step replaces it
		recordNote(p, 3.1, 60, 90, 2);
		// a live note keeps its own length: the bar menu's length leaves it alone
		expect(p.steps[3].notes).toEqual([
			{ note: 60, velocity: 90, length: 2, offset: 0.1, ownLength: true }
		]);
	});
});

describe('step entry on the simulator (manual: sequencer/step-entry)', () => {
	const notes = (sim: OpxySim, step: number) =>
		currentPattern(sim.track.sequence).steps[step].notes.map((n) => n.note);

	it('stores the last note played, a held chord, and keys pressed with a step held', () => {
		const sim = new OpxySim();
		sim.press('track.3'); // prism, its keyboard an octave down in a new project
		sim.press('keyboard.a3');
		sim.press('step.1');
		expect(notes(sim, 0)).toEqual([45]);
		// a held chord goes on the step together
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.input({ type: 'press', id: 'keyboard.e4' });
		sim.press('step.2');
		sim.input({ type: 'release', id: 'keyboard.c4' });
		sim.input({ type: 'release', id: 'keyboard.e4' });
		expect(notes(sim, 1)).toEqual([48, 52]);
		// with a step held, a key adds its note (and takes it off again)
		sim.input({ type: 'press', id: 'step.2' });
		expect(sim.leds['keyboard.c4']).toBe('white');
		sim.press('keyboard.g4');
		expect(notes(sim, 1)).toEqual([48, 52, 55]);
		sim.press('keyboard.c4');
		sim.input({ type: 'release', id: 'step.2' });
		expect(notes(sim, 1)).toEqual([52, 55]);
		// the step key again clears the step
		sim.press('step.1');
		expect(notes(sim, 0)).toEqual([]);
	});

	it('places drum sounds: the key pressed last is the sound a step stores', () => {
		const sim = new OpxySim();
		expect(sim.track.engine).toBe('drum');
		sim.press('step.1');
		expect(notes(sim, 0)).toEqual([53]);
		sim.press('keyboard.fs3');
		sim.press('step.5');
		expect(notes(sim, 4)).toEqual([54]);
		expect(sim.track.drumKey).toBe(1);
	});
});
