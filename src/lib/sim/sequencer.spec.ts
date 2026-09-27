import { describe, expect, it } from 'vitest';
import { OpxySim } from './opxy-sim.svelte';
import {
	MAX_NOTES,
	MAX_STEPS,
	STEP_COMPONENTS,
	currentPattern,
	emptyPattern,
	noteCount,
	stepAt,
	toggleNote,
	toggleStep
} from './sequencer';

describe('sequencer model', () => {
	it('starts a pattern as one empty bar of the 64 steps it can hold', () => {
		const p = emptyPattern();
		expect(p.steps).toHaveLength(MAX_STEPS);
		expect(p).toMatchObject({ bars: 1, length: 16, scale: 1, noteLength: 1 });
		expect(noteCount(p)).toBe(0);
	});

	it('stores notes on an empty step and clears a step with notes', () => {
		const p = emptyPattern();
		expect(toggleStep(p, 3, [60, 64, 67, 60])).toBe(true);
		expect(p.steps[3].notes.map((n) => n.note)).toEqual([60, 64, 67]);
		expect(p.steps[3].notes[0]).toEqual({ note: 60, velocity: 100, length: 1, offset: 0 });
		expect(toggleStep(p, 3, [72])).toBe(true);
		expect(p.steps[3].notes).toEqual([]);
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
	});

	it("moves each track's playhead by its own scale and length", () => {
		const p = emptyPattern();
		expect(stepAt(p, 17)).toBe(1);
		p.length = 12;
		expect(stepAt(p, 13)).toBe(1);
		p.scale = 2;
		expect(stepAt(p, 5)).toBe(2);
	});

	it('lists the fourteen step components with their default digits', () => {
		expect(STEP_COMPONENTS).toHaveLength(14);
		expect(STEP_COMPONENTS[0]).toEqual({ kind: 'pulse', defaultValue: 4 });
		expect(STEP_COMPONENTS[3]).toEqual({ kind: 'velocity', defaultValue: 5 });
		expect(STEP_COMPONENTS[13]).toEqual({ kind: 'skip trigger', defaultValue: 2 });
	});
});

describe('step entry on the simulator (manual: sequencer/step-entry)', () => {
	const notes = (sim: OpxySim, step: number) =>
		currentPattern(sim.track.sequence).steps[step].notes.map((n) => n.note);

	it('stores the last note played, a held chord, and keys pressed with a step held', () => {
		const sim = new OpxySim();
		sim.press('track.3'); // prism
		sim.press('keyboard.a3');
		sim.press('step.1');
		expect(notes(sim, 0)).toEqual([57]);
		// a held chord goes on the step together
		sim.input({ type: 'press', id: 'keyboard.c4' });
		sim.input({ type: 'press', id: 'keyboard.e4' });
		sim.press('step.2');
		sim.input({ type: 'release', id: 'keyboard.c4' });
		sim.input({ type: 'release', id: 'keyboard.e4' });
		expect(notes(sim, 1)).toEqual([60, 64]);
		// with a step held, a key adds its note (and takes it off again)
		sim.input({ type: 'press', id: 'step.2' });
		expect(sim.leds['keyboard.c4']).toBe('white');
		sim.press('keyboard.g4');
		expect(notes(sim, 1)).toEqual([60, 64, 67]);
		sim.press('keyboard.c4');
		sim.input({ type: 'release', id: 'step.2' });
		expect(notes(sim, 1)).toEqual([64, 67]);
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
