// The manual's recipes run as written: every step that names a setting (`set` in a howto unit) is
// one the navigator reaches from a new project, on the track the recipe uses, so the agent can set
// the recipe up on the replica with plan_steps and read the same steps back to the user.
import { describe, expect, it } from 'vitest';
import { loadManual } from '$lib/manual';
import { planSettings, playStep, reads, type ParamGoal } from './navigator';
import { OpxySim } from './opxy-sim.svelte';

const recipes = loadManual().units.filter((unit) =>
	unit.procedures.some((p) => p.steps.some((s) => s.set !== null))
);

describe('recipes', () => {
	it('exist', () => {
		expect(recipes.map((u) => u.id)).toEqual(
			expect.arrayContaining(['howto.sidechain-duck', 'howto.pluck', 'howto.acid-bass'])
		);
	});

	it.each(recipes.map((u) => [u.id, u] as const))('%s runs on a new project', (_, unit) => {
		const keys = unit.procedures.flatMap((p) => p.steps.map((s) => s.keys)).join(' ');
		const track = Number(/\bT([1-8])\b/.exec(keys)?.[1] ?? 1);
		const goals: ParamGoal[] = unit.procedures.flatMap((p) =>
			p.steps.flatMap((s) => (s.set ? [{ track, ...s.set }] : []))
		);
		const sim = new OpxySim({ now: () => 0 });
		const plan = planSettings(sim.state, goals);
		for (const part of plan.parts) {
			expect(part.reached, `${part.goal.param} ${part.goal.value}: ${part.note}`).toBe(true);
		}
		for (const step of plan.steps) playStep(sim, step);
		for (const goal of goals) {
			expect(reads(sim.state, goal), `${goal.param} reads ${goal.value}`).toBe(true);
		}
	});
});
