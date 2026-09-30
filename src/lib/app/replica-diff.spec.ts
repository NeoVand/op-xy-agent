// What changed on the replica, in words (the agent's grounding): nothing reads as nothing; tempo,
// the click and playback; a sound changed through the keys reads as its page did on the screen;
// patterns by their notes; scenes and the song.
import { describe, expect, it } from 'vitest';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { settingGoal } from '$lib/sim/settings';
import { briefChange } from './replica-diff';
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
		expect(lines).toContain('T1 pattern 2: new, 5 notes');
		expect(lines.some((l) => /^scenes: 1 → 2/.test(l))).toBe(true);
		expect(lines).toContain('song: 1 → 1 2 2');
	});

	it('say how the notes changed: a transposition, new velocities', () => {
		const { virtual } = setup();
		const line = [1, 4, 7, 9].map((step, i) => ({
			step,
			note: [50, 50, 53, 57][i],
			velocity: 100,
			length: 1
		}));
		virtual.writePattern(3, { pattern: 1, bars: 1, notes: line });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 3, note: 61, velocity: 100, length: 1 }]
		});
		const start = virtual.checkpoint();
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: line.map((n) => ({ ...n, note: n.note + 2 }))
		});
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 3, note: 61, velocity: 72, length: 1 }]
		});
		const lines = virtual.changesSince(start);
		expect(lines).toContain('T3 pattern 1: 4 notes, up 2 semitones');
		expect(lines).toContain('T1 pattern 1: 1 note, velocities 100 → 72');
	});
});

describe('replica changes, briefly and where', () => {
	it('say only what a page changed, and name its track and page keys', () => {
		const { sim, virtual, start } = setup();
		const goal = settingGoal({ param: 'cutoff', value: 40, track: 3 }, 1);
		if (typeof goal === 'string') throw new Error(goal);
		for (const step of virtual.plan({ settings: [goal] }).steps) playStep(sim, step);
		const filter = virtual.changedSince(start).find((c) => c.line.startsWith('T3 M3 filter:'));
		expect(filter?.brief).toBe('T3 M3 filter: cutoff 00 → 40');
		expect(filter?.controls).toEqual(['track.3', 'key.m3']);
	});

	it('name the tempo key, the mix, the track of a pattern and the arrangement', () => {
		const { virtual, start } = setup();
		virtual.setTempo(96);
		virtual.writePattern(2, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 60, velocity: 100, length: 1 }]
		});
		virtual.writeArrangement({
			scenes: [{ scene: 1, patterns: [{ track: 2, pattern: 1 }] }],
			song: { order: [1, 1], loop: true }
		});
		const where = Object.fromEntries(virtual.changedSince(start).map((c) => [c.brief, c.controls]));
		expect(where['tempo 120 → 96 bpm']).toEqual(['key.tempo']);
		expect(where['T2 pattern 1: 0 → 1 note']).toEqual(['track.2']);
		expect(where['song: 1 → 1 1']).toEqual(['key.arrange']);
		// the lines the agent reads are the same changes, in the same order
		expect(virtual.changedSince(start).map((c) => c.line)).toEqual(virtual.changesSince(start));
	});
});

describe('briefChange', () => {
	it('keeps only the values that differ', () => {
		const was = 'svf filter on: cutoff 00, resonance 10, env amount 0';
		expect(briefChange(was, 'svf filter on: cutoff 40, resonance 10, env amount 0')).toBe(
			'cutoff 00 → 40'
		);
		expect(briefChange(was, 'svf filter off: cutoff 00, resonance 25, env amount 50')).toBe(
			'svf filter on → off, resonance 10 → 25, env amount 0 → 50'
		);
		expect(briefChange('amp envelope: attack 10', 'amp envelope: attack 05')).toBe(
			'attack 10 → 05'
		);
	});

	it('gives readings of another shape whole', () => {
		expect(briefChange('tremolo lfo off', 'duck lfo on: source metronome, amount 50')).toBe(
			'tremolo lfo off → duck lfo on: source metronome, amount 50'
		);
		expect(briefChange('a: 1, 2', 'a: 1, 2, 3')).toBe('a: 1, 2 → a: 1, 2, 3');
	});
});
