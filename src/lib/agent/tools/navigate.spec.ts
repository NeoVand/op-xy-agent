// plan_steps on a bare simulator: the plan comes from where the virtual OP-XY stands, and its
// show animation (a fake replica that plays each step on the simulator) leaves it there.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import type { ReplicaState } from '$lib/replica';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import { planStepsTool } from './navigate';

function setup(withReplica = false) {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const virtual = createVirtualOpxy({ sim });
	const animated: { keys: string; turnSteps?: number; direction?: number }[] = [];
	const replica = {
		animate: (keys: string, timing: { turnSteps?: number; direction?: 1 | -1 } = {}) => {
			animated.push({ keys, ...timing });
			const clicks = timing.turnSteps ? timing.turnSteps * (timing.direction ?? 1) : undefined;
			playStep(sim, { keys, clicks });
			return {
				done: Promise.resolve('finished' as const),
				plan: { duration: 0 },
				cancel: () => {}
			};
		}
	} as unknown as ReplicaState;
	const env: AgentEnvironment = {
		device: null,
		replica: withReplica ? replica : null,
		virtual,
		manual: NO_MANUAL,
		timers: time,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const run = (tool: AnyTool, input: unknown): Promise<ToolResult> => {
		const ctx: ToolContext = {
			toolCallId: 'toolu_n',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		};
		return tool.run(tool.input.parse(input), ctx);
	};
	return { sim, run, animated };
}

const json = (result: ToolResult) => JSON.parse(String(result.content));

describe('plan_steps', () => {
	it('plans a parameter from where the replica stands, without moving it', async () => {
		const { sim, run } = setup();
		const result = await run(planStepsTool, { show: false, track: 3, param: 'cutoff', value: 40 });
		expect(result.isError).toBeFalsy();
		const plan = json(result);
		expect(plan.reached).toBe(true);
		expect(plan.steps.map((s: { keys: string }) => s.keys)).toEqual(['T3', 'M3', 'turn E1']);
		expect(plan.steps[2]).toMatchObject({ clicks: 40, direction: 'clockwise' });
		expect(plan.screen).toContain('cutoff 40');
		expect(result.summary).toBe('3 steps: T3, M3, turn E1 ×40');
		expect(sim.state.track).toBe(0);
	});

	it('plans pages, maps tracks 9–16 to the auxiliary set, and rejects what it cannot plan', async () => {
		const { run } = setup();
		const aux = json(await run(planStepsTool, { show: false, area: 'auxiliary', track: 15 }));
		expect(aux.steps.map((s: { keys: string }) => s.keys)).toEqual(['auxiliary', 'T7']);
		expect((await run(planStepsTool, { show: false, param: 'cutoff' })).isError).toBe(true);
		expect((await run(planStepsTool, { show: false })).isError).toBe(true);
		const missing = json(
			await run(planStepsTool, { show: false, param: 'flux capacitor', value: 3 })
		);
		expect(missing.reached).toBe(false);
	});
});

describe('plan_steps with show', () => {
	it('animates every step on the replica and leaves the virtual OP-XY at the goal', async () => {
		const { sim, run, animated } = setup(true);
		const result = json(await run(planStepsTool, { show: true, param: 'tempo', value: 100 }));
		expect(result).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(animated).toEqual([
			{ keys: 'tempo' },
			{ keys: 'turn E1', turnSteps: 20, direction: -1, turnStepMs: 90 }
		]);
		expect(sim.state.tempo.bpm).toBe(100);
	});

	it('only returns the plan without a replica', async () => {
		const { sim, run } = setup(false);
		const result = json(await run(planStepsTool, { show: true, area: 'mix', page: 2 }));
		expect(result).toMatchObject({ shown: false, reached: true });
		expect(sim.state.mode).toBe('instrument');
	});
});
