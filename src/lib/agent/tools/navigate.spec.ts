// plan_steps on a bare simulator: the plan comes from where the virtual OP-XY stands, and its
// show animation (a fake replica that plays each step on the simulator) leaves it there.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import type { ReplicaState } from '$lib/replica';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { RehearsedStep } from '../virtual-opxy';
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
	const guided: { goal: string; steps: readonly RehearsedStep[] }[] = [];
	const stops: number[] = [];
	const env: AgentEnvironment = {
		device: null,
		replica: withReplica ? replica : null,
		virtual,
		guide: {
			start: (goal, steps) => void guided.push({ goal, steps }),
			stop: () => void stops.push(1)
		},
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
	return { sim, run, animated, guided, stops };
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
		expect(result.summary).toBe('planned only: 3 steps: T3, M3, turn E1 ×40');
		expect(Object.keys(plan)[0]).toBe('planned');
		expect(sim.state.track).toBe(0);
	});

	it('plans pages, maps tracks 9–16 to the auxiliary set, and rejects what it cannot plan', async () => {
		const { run } = setup();
		const aux = json(await run(planStepsTool, { show: false, area: 'auxiliary', track: 15 }));
		expect(aux.steps.map((s: { keys: string }) => s.keys)).toEqual(['auxiliary', 'T7']);
		expect((await run(planStepsTool, { show: false })).isError).toBe(true);
		const missing = json(
			await run(planStepsTool, { show: false, param: 'flux capacitor', value: 3 })
		);
		expect(missing.reached).toBe(false);
	});
});

describe('plan_steps to a parameter without a value', () => {
	it('plans the way to where it is set and turns nothing', async () => {
		const { sim, run } = setup();
		const result = await run(planStepsTool, { show: false, track: 3, param: 'cutoff' });
		expect(result.isError).toBeFalsy();
		const plan = json(result);
		expect(plan).toMatchObject({ reached: true, note: 'E1 turns it' });
		expect(plan.steps.map((s: { keys: string }) => s.keys)).toEqual(['T3', 'M3']);
		expect(sim.state.tracks[2].filter.cutoff).toBe(0);
	});

	it('takes the replica there with show ("take me to the swing")', async () => {
		const { sim, run, animated } = setup(true);
		const result = json(await run(planStepsTool, { show: true, param: 'swing' }));
		expect(result).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(animated).toEqual([{ keys: 'tempo' }]);
		expect(sim.state.overlay).toBe('tempo');
		expect(sim.state.tempo.swing).toBe(0);
	});
});

describe('plan_steps with show', () => {
	it('animates every step on the replica and leaves the virtual OP-XY at the goal', async () => {
		const { sim, run, animated, stops } = setup(true);
		const result = json(await run(planStepsTool, { show: true, param: 'tempo', value: 100 }));
		expect(result).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(animated).toEqual([
			{ keys: 'tempo' },
			{ keys: 'turn E1', turnSteps: 20, direction: -1, turnStepMs: 90 }
		]);
		expect(sim.state.tempo.bpm).toBe(100);
		// a walkthrough in progress ends first: the animation would clear its marks
		expect(stops).toHaveLength(1);
	});

	it('sets a whole sound up from several settings, grouped by the parameter they set', async () => {
		const { sim, run, animated } = setup(true);
		const result = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'lfo type', value: 'duck' },
					{ param: 'duck source', value: 1 },
					{ param: 'lfo amount', value: 60 },
					{ param: 'warp drive', value: 2 }
				]
			})
		);
		expect(result).toMatchObject({ shown: true, arrived: true, reached: false });
		expect(result.settings.map((p: { param: string; reached: boolean }) => p.reached)).toEqual([
			true,
			true,
			true,
			false
		]);
		expect(result.settings[0].steps[0].keys).toBe('T3');
		expect(result.note).toMatch(/warp drive/);
		expect(animated.length).toBeGreaterThan(4);
		expect(sim.state.tracks[2].lfo).toMatchObject({ type: 'duck', on: true, source: 1 });
		// param with settings is a contradiction
		const both = await run(planStepsTool, {
			show: false,
			param: 'cutoff',
			value: 3,
			settings: [{ param: 'cutoff', value: 4 }]
		});
		expect(both.isError).toBe(true);
	});

	it('sets values on the auxiliary and mixer pages by the names their screens use', async () => {
		const { sim, run } = setup(true);
		const reverb = json(
			await run(planStepsTool, {
				show: true,
				area: 'auxiliary',
				track: 16,
				param: 'size',
				value: 80
			})
		);
		expect(reverb).toMatchObject({ shown: true, arrived: true });
		expect(reverb.steps.map((s: { keys: string }) => s.keys)).toEqual([
			'auxiliary',
			'T8',
			'turn E1'
		]);
		const level = json(
			await run(planStepsTool, { show: true, area: 'mix', track: 3, param: 'level', value: 50 })
		);
		expect(level).toMatchObject({ shown: true, arrived: true });
		expect(Math.round(sim.state.tracks[2].mix.level)).toBe(50);
		const missing = json(
			await run(planStepsTool, { show: false, area: 'mix', param: 'flux', value: 1 })
		);
		expect(missing.note).toMatch(/no page shows "flux"/);
	});

	it('sets a recipe of several parts: arrange, a drum key, the brain, slices, a player', async () => {
		const { sim, run } = setup(true);
		const result = json(
			await run(planStepsTool, {
				show: true,
				settings: [
					{ area: 'arrange', param: 'scene', value: 2 },
					{ area: 'arrange', track: 3, param: 'pattern', value: 2 },
					{ area: 'arrange', param: 'song', value: '1 1 2 2' },
					{ track: 1, param: 'tune', key: 'guiro 1', value: -2 },
					{ area: 'auxiliary', track: 9, page: 2, param: 'track 5', value: 'out' },
					{ area: 'bar', track: 9, param: 'track scale', value: 4 },
					{ area: 'sample', track: 1, key: 'E5', param: 'even slices', value: 16 },
					{ area: 'player', track: 4, param: 'type', value: 'maestro' }
				]
			})
		);
		expect(result).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(result.settings[0]).toMatchObject({ param: 'scene', area: 'arrange', reached: true });
		const s = sim.state;
		expect(s.areas.arrange.songs[0].order).toEqual([0, 0, 1, 1]);
		// the guiro's key, D5, is above the sixteen slices laid from F3
		expect(s.tracks[0].drumKeys[21].tune).toBe(-2);
		expect(s.areas.auxiliary.brain.patterns[0].routes[4]).toBe(false);
		expect(s.tracks[0].drumKeys[0].playMode).toBe('mute group');
		expect(s.tracks[3].sequence.patterns[0].player.type).toBe('maestro');
	});

	it('plans the record page and COM as pages, and says what the bar menu needs', async () => {
		const { run } = setup();
		const record = json(await run(planStepsTool, { show: false, area: 'sample', track: 1 }));
		expect(record.steps.map((s: { keys: string }) => s.keys)).toEqual(['sample']);
		expect(record.screen).toMatch(/^drum sampler record: /);
		const com = json(await run(planStepsTool, { show: false, area: 'com' }));
		expect(com.screen).toMatch(/^com: /);
		const bar = await run(planStepsTool, { show: false, area: 'bar', track: 3 });
		expect(bar.isError).toBe(true);
		const preset = json(
			await run(planStepsTool, { show: false, track: 4, param: 'preset', value: 'pad/bandpasser' })
		);
		expect(preset.reached).toBe(true);
		const wrong = await run(planStepsTool, {
			show: false,
			settings: [{ area: 'player', track: 12, param: 'speed', value: '1/16' }]
		});
		expect(wrong.isError).toBe(true);
	});

	it('hands the steps to the walkthrough with guide, and moves nothing itself', async () => {
		const { sim, run, animated, guided } = setup(true);
		const result = json(
			await run(planStepsTool, { show: false, guide: true, track: 3, param: 'cutoff', value: 40 })
		);
		expect(result).toMatchObject({ guided: true, reached: true });
		expect(guided).toHaveLength(1);
		expect(guided[0].goal).toBe('track 3 cutoff 40');
		expect(guided[0].steps.map((s) => s.keys)).toEqual(['T3', 'M3', 'turn E1']);
		expect(animated).toEqual([]);
		expect(sim.state.track).toBe(0);
		expect(result.walkthrough).toMatch(/The keys are lit on the replica now/);
		// where it starts, so a plan without a track key is not read as that track selected
		expect(result.from).toBe('track 1 (drum) selected');
	});

	it('walks to a value with none given, ending on the turn, its note kept', async () => {
		const { run, guided } = setup(true);
		const result = json(
			await run(planStepsTool, { show: false, guide: true, track: 3, param: 'cutoff' })
		);
		expect(result.note).toBe('E1 turns it');
		expect(result.walkthrough).toMatch(/The keys are lit on the replica now/);
		const steps = guided[0].steps;
		expect(steps.map((s) => s.keys)).toEqual(['T3', 'M3', 'turn E1']);
		// the turn is done once the value has moved from where it stands
		expect(steps.at(-1)).toMatchObject({ leave: steps.at(-2)!.screen });
		expect(result.steps.at(-1)).toEqual({ keys: 'turn E1', until: 'the value changes' });
	});

	it('only returns the plan without a replica', async () => {
		const { sim, run } = setup(false);
		const result = json(await run(planStepsTool, { show: true, area: 'mix', page: 2 }));
		expect(result).toMatchObject({ shown: false, reached: true });
		expect(sim.state.mode).toBe('instrument');
	});
});

describe('plan_steps settings', () => {
	it('name a track only for what belongs to one (not the tempo page)', async () => {
		const { run } = setup();
		const plan = json(
			await run(planStepsTool, {
				show: false,
				settings: [
					{ param: 'tempo', value: 100 },
					{ param: 'cutoff', value: 40, track: 3 }
				]
			})
		);
		expect(plan.settings[0].track).toBeUndefined();
		expect(plan.settings[1].track).toBe(3);
	});
});

describe('plan_steps to the project settings', () => {
	it('sets the time signature through project, M4 and the list', async () => {
		const { sim, run } = setup(true);
		const plan = json(
			await run(planStepsTool, { show: true, param: 'time signature', value: '7/8' })
		);
		expect(plan).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(plan.steps.map((s: { keys: string }) => s.keys)).toEqual([
			'project',
			'M4',
			'turn E1',
			'turn E3'
		]);
		expect(sim.state.areas.system.projectSettings.signature).toBeGreaterThan(0);
		const named = json(
			await run(planStepsTool, { show: false, area: 'project', param: 'nope', value: 1 })
		);
		expect(named.note).toMatch(/the project settings have no "nope"; they hold transpose/);
	});
});
