// The scheduler with the simulator moving the song on, as the app runs them: a one-scene song comes
// round every bar and the simulator's position goes back to 0 each time, yet random picks again
// pass after pass, a ramp climbs, a skip counts its passes, and nothing is cut at the bar line. Where
// the timeline cannot carry on (a pattern that does not divide the scene) it is laid down again with
// the random source carried over, so random still changes; play again starts a new run.
import { describe, expect, it } from 'vitest';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { currentPattern, setComponentValue, toggleComponent, toggleStep } from '$lib/sim/sequencer';
import type { StepComponentKind } from '$lib/sim/sequencer';
import { Scheduler, type ScheduledNote } from './scheduler';

/** Track 3 (a synth) with notes on steps 1, 5, 9 and 13, the simulator and the scheduler together. */
function rig(options: { length?: number; component?: StepComponentKind; digit?: number } = {}) {
	const sim = new OpxySim({ now: () => 0 });
	const s = sim.state;
	s.tempo.metronome.on = false;
	s.track = 2;
	const pattern = currentPattern(s.tracks[2].sequence);
	if (options.length) pattern.length = options.length;
	const steps = [0, 4, 8, 12].filter((i) => i < pattern.length);
	for (const i of steps) toggleStep(pattern, i, [60]);
	if (options.component) {
		toggleComponent(pattern, steps, options.component);
		if (options.digit !== undefined)
			setComponentValue(pattern, steps, options.component, options.digit);
	}
	const clock = { now: 0 };
	const notes: ScheduledNote[] = [];
	const stops: number[] = [];
	const scheduler = new Scheduler({
		state: () => s,
		now: () => clock.now,
		sink: {
			note: (e) => notes.push(e),
			click: () => {},
			beat: () => {},
			stop: (t) => stops.push(t),
			automate: () => {}
		}
	});
	/** Plays for `seconds`: the audio clock and the simulator's time go on together, 25 ms a tick. */
	const run = (seconds: number) => {
		const end = clock.now + seconds;
		while (clock.now < end - 1e-9) {
			scheduler.tick();
			clock.now += 0.025;
			sim.advance(25);
		}
	};
	const played = () => notes.filter((n) => n.track === 2).map((n) => n.note);
	return { sim, s, run, played, stops, scheduler };
}

/** The notes played, a bar (four hits) at a time. */
const bars = (notes: readonly number[]) =>
	Array.from({ length: Math.floor(notes.length / 4) }, (_, i) =>
		notes.slice(i * 4, i * 4 + 4).join(' ')
	);

describe('a scene coming round again', () => {
	it('lets random pick again pass after pass', () => {
		const { sim, s, run, played, stops } = rig({ component: 'random' });
		sim.press('key.play');
		run(16); // eight bars at 120 bpm
		// the simulator went back to 0 every bar (the one-scene song came round)
		expect(s.transport.position).toBeLessThan(16);
		const passes = bars(played());
		expect(passes.length).toBeGreaterThanOrEqual(7);
		// not the first bar over and over
		expect(new Set(passes).size).toBeGreaterThan(3);
		// each note within the octave the digit allows, from the note up
		for (const note of played()) {
			expect(note).toBeGreaterThanOrEqual(60);
			expect(note).toBeLessThanOrEqual(72);
		}
		// and the timeline went on across the bar lines: nothing was stopped
		expect(stops).toEqual([]);
	});

	it('lets a ramp climb, and a skip count its passes', () => {
		const ramp = rig({ component: 'ramp up', digit: 1 });
		ramp.sim.press('key.play');
		ramp.run(8);
		// ramp up over two stages in an octave: the note, then an octave up, pass by pass
		expect(bars(ramp.played()).slice(0, 4)).toEqual([
			'60 60 60 60',
			'72 72 72 72',
			'60 60 60 60',
			'72 72 72 72'
		]);
		const skip = rig({ component: 'skip trigger', digit: 2 });
		skip.sim.press('key.play');
		skip.run(8);
		// every second pass is silent: four bars, two of them heard
		expect(skip.played()).toHaveLength(8);
	});

	it('carries the random source over where the timeline is laid down again', () => {
		// a three-step pattern: its scene is three steps long, never whole bars
		const { sim, run, played, stops } = rig({ length: 3, component: 'random' });
		sim.press('key.play');
		run(6);
		expect(stops.length).toBeGreaterThan(3);
		const hits = played();
		expect(hits.length).toBeGreaterThan(8);
		expect(new Set(hits).size).toBeGreaterThan(2);
	});

	it('starts a new run on play again: the first pass as it was', () => {
		const { sim, run, played } = rig({ component: 'random' });
		sim.press('key.play');
		run(2);
		const first = played().slice(0, 4);
		const before = played().length;
		sim.press('key.play');
		run(2);
		expect(played().slice(before, before + 4)).toEqual(first);
	});
});
