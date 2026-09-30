// What changed on the replica, in words (the agent's grounding): nothing reads as nothing; tempo,
// the click and playback; a sound changed through the keys reads as its page did on the screen;
// patterns by their notes; scenes and the song.
import { describe, expect, it } from 'vitest';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { settingGoal } from '$lib/sim/settings';
import { createVirtualOpxy } from './virtual';

function setup() {
	const sim = new OpxySim({ now: () => 0 });
	const virtual = createVirtualOpxy({ sim });
	return { sim, virtual, start: virtual.checkpoint() };
}

describe('replica changes', () => {
	it('are none when nothing changed', () => {
		const { virtual, start } = setup();
		virtual.readSound(3);
		expect(virtual.changesSince(start)).toEqual([]);
	});

	it('say the tempo, the click and playback', () => {
		const { virtual, start } = setup();
		virtual.setTempo(107);
		virtual.setMetronome(false);
		virtual.transport('play');
		expect(virtual.changesSince(start)).toEqual([
			'playback started',
			'tempo 120 → 107 bpm',
			'metronome click on → off'
		]);
	});

	it('read a sound changed through the keys as its page does', () => {
		const { sim, virtual, start } = setup();
		const goal = settingGoal({ param: 'cutoff', value: 40, track: 3 }, 1);
		if (typeof goal === 'string') throw new Error(goal);
		const plan = virtual.plan({ settings: [goal] });
		for (const step of plan.steps) playStep(sim, step);
		const lines = virtual.changesSince(start);
		expect(lines.find((l) => l.startsWith('T3 M3 filter:'))).toMatch(
			/^T3 M3 filter: svf filter on: cutoff 00.* → svf filter on: cutoff 40/
		);
		expect(lines.every((l) => l.startsWith('T3 '))).toBe(true);
	});

	it('count patterns by their notes, and read scenes and the song', () => {
		const { virtual, start } = setup();
		const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }));
		virtual.writePattern(1, { pattern: 1, bars: 1, notes: kick });
		virtual.writePattern(1, { pattern: 2, bars: 2, notes: [...kick, { ...kick[0], step: 17 }] });
		virtual.writeArrangement({
			scenes: [
				{ scene: 1, patterns: [{ track: 1, pattern: 1 }] },
				{ scene: 2, patterns: [{ track: 1, pattern: 2 }] }
			],
			song: { order: [1, 2, 2], loop: true }
		});
		const lines = virtual.changesSince(start);
		expect(lines).toContain('T1 pattern 1: 0 → 4 notes');
		expect(lines).toContain('T1 pattern 2: new, 0 → 5 notes');
		expect(lines.some((l) => /^scenes: 1 → 2/.test(l))).toBe(true);
		expect(lines).toContain('song: 1 → 1 2 2');
	});
});
