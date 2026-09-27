/**
 * Arrange in a real browser, where the simulator's state is a deep Svelte `$state` proxy (the
 * server tests run it as plain objects): sounds copied between patterns, scenes, a song playing,
 * and the frame following the state.
 */
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import { accidentalKey } from './model';
import { PATTERN_KEYS } from './state';

function withShift(sim: OpxySim, ...ids: string[]): void {
	sim.input({ type: 'press', id: 'key.shift' });
	for (const id of ids) sim.press(id);
	sim.input({ type: 'release', id: 'key.shift' });
}

const key = (action: (typeof PATTERN_KEYS)[number]) => `key.m${PATTERN_KEYS.indexOf(action) + 1}`;

describe('arrange with reactive state', () => {
	it('keeps sounds with patterns, switches scenes and plays a song', () => {
		const sim = new OpxySim({ now: () => 0 });
		sim.press('key.arrange');
		sim.press('track.3');
		sim.press('step.1');
		sim.press(key('copy'));
		sim.press('track.4');
		sim.press('step.1');
		sim.press(key('paste'));
		const t4 = sim.state.tracks[3];
		expect(t4.engine).toBe('prism');
		withShift(sim, accidentalKey(2));
		sim.turn(4, -1);
		expect(t4.engine).toBe('epiano');
		withShift(sim, accidentalKey(1));
		expect(t4.engine).toBe('prism');
		withShift(sim, 'key.arrange', 'key.m1', accidentalKey(1), accidentalKey(2));
		sim.press('key.play');
		const stepMs = 60000 / sim.state.tempo.bpm / 4;
		for (let i = 0; i < 16 * 5 + 1; i++) sim.advance(stepMs / 5);
		expect(sim.state.areas.arrange.scene).toBe(1);
		expect(t4.engine).toBe('epiano');
	});

	it('updates the frame as the state changes', () => {
		const sim = new OpxySim({ now: () => 0 });
		const scenes: string[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				const frame = sim.frame;
				if (frame.page === 'arrange') scenes.push(frame.scene);
			});
		});
		sim.press('key.arrange');
		flushSync();
		withShift(sim, accidentalKey(7));
		flushSync();
		withShift(sim, accidentalKey(0), accidentalKey(1), accidentalKey(2));
		flushSync();
		stop();
		expect(scenes[0]).toBe('1');
		expect(scenes).toContain('7');
		expect(scenes.at(-1)).toBe('12');
	});

	it('reaches every arrange scenario’s page', () => {
		for (const scenario of SCENARIOS.filter((s) => s.id.startsWith('arrange'))) {
			const sim = new OpxySim({ now: () => 0 });
			scenario.setup(sim);
			expect(sim.frame.page, scenario.id).toBe(scenario.page);
		}
	});
});
