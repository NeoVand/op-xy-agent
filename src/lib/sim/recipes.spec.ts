// The manual's recipes run as written: every step that names a setting (`set` in a howto unit) is
// one the navigator reaches from a new project, where the recipe says (an instrument track's
// parameter, or with `area` a value another page shows: the brain's routing, arrange's song, the
// slicer), so the agent can set the recipe up on the replica with plan_steps and read the same
// steps back to the user.
import { describe, expect, it } from 'vitest';
import { loadManual } from '$lib/manual';
import { goalName, planSettings, playStep, reads, type SettingGoal } from './navigator';
import { OpxySim } from './opxy-sim.svelte';
import { settingGoal } from './settings';

const recipes = loadManual().units.filter((unit) =>
	unit.procedures.some((p) => p.steps.some((s) => s.set !== null))
);

describe('recipes', () => {
	it('exist', () => {
		expect(recipes.map((u) => u.id)).toEqual(
			expect.arrayContaining([
				'howto.sidechain-duck',
				'howto.pluck',
				'howto.pad-swell',
				'howto.wobble',
				'howto.acid-bass',
				'howto.song-with-brain',
				'howto.slice-a-loop',
				'howto.song-from-scenes'
			])
		);
	});

	it.each(recipes.map((u) => [u.id, u] as const))('%s runs on a new project', (_, unit) => {
		// a setting without a track is the recipe's: the first track its steps pick
		const keys = unit.procedures.flatMap((p) => p.steps.map((s) => s.keys)).join(' ');
		const track = Number(/\bT([1-8])\b/.exec(keys)?.[1] ?? 1);
		const goals: SettingGoal[] = unit.procedures.flatMap((p) =>
			p.steps.flatMap((s) => {
				if (!s.set) return [];
				const goal = settingGoal({ ...s.set, track: s.set.track ?? track });
				if (typeof goal === 'string') throw new Error(`${s.set.param}: ${goal}`);
				return [goal];
			})
		);
		const sim = new OpxySim({ now: () => 0 });
		const plan = planSettings(sim.state, goals);
		for (const part of plan.parts) {
			const what = `${goalName(part.goal)} ${part.goal.value}`;
			expect(part.reached, `${what}: ${part.note}`).toBe(true);
		}
		// a step may restate a new project's value (a duck's source 1), but not the whole recipe
		expect(plan.steps.length).toBeGreaterThan(0);
		for (const step of plan.steps) playStep(sim, step);
		for (const goal of goals) {
			expect(reads(sim.state, goal), `${goalName(goal)} reads ${goal.value}`).toBe(true);
		}
	});
});
