// plan_steps on a bare simulator: the plan comes from where the virtual OP-XY stands, and its
// show animation (a fake replica that plays each step on the simulator) leaves it there.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { ReplicaState } from '$lib/replica';
import { playStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { RehearsedStep } from '../virtual-opxy';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import { planStepsTool } from './navigate';

function setup(withReplica = false, drift = 0) {
	const time = new FakeTime();
	const sim = new OpxySim({ now: () => time.now() });
	const virtual = createVirtualOpxy({ sim });
	const animated: { keys: string; turnSteps?: number; direction?: number }[] = [];
	const replica = {
		animate: (keys: string, timing: { turnSteps?: number; direction?: 1 | -1 } = {}) => {
			animated.push({ keys, ...timing });
			// time passing as each step animates (the playhead moves on while it plays)
			if (drift) sim.advance(drift);
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
	return { sim, virtual, env, run, animated, guided, stops };
}

const json = (result: ToolResult) => JSON.parse(String(result.content));

describe('plan_steps', () => {
	it('lands a list that switches to another pattern and back', async () => {
		// an agent smoothing a song's second pattern switched T7 to it, set the bar menu's shape and
		// switched back: every step was shown, and the result read both switches as missed
		const { virtual, run } = setup(true);
		const note = { step: 1, note: 60, velocity: 90, length: 16 };
		virtual.writePattern(7, { pattern: 1, bars: 4, notes: [note] });
		virtual.writePattern(7, { pattern: 2, bars: 4, notes: [note], play: false });
		const shown = json(
			await run(planStepsTool, {
				show: true,
				settings: [
					{ area: 'arrange', param: 'pattern', value: 2, track: 7 },
					{ area: 'bar', param: 'shape', value: 60, track: 7 },
					{ area: 'arrange', param: 'pattern', value: 1, track: 7 }
				]
			})
		);
		expect(shown).toMatchObject({ shown: true, arrived: true });
		expect(shown.missed).toBeUndefined();
		expect(virtual.readPattern(7).pattern).toBe(1);
	});

	it('names the settings a show did not land', async () => {
		const { env, run } = setup(true);
		// a replica whose turns go nowhere: the pages open, no value moves
		const replica = env.replica as unknown as { animate: (k: string, t?: object) => unknown };
		const animate = replica.animate;
		replica.animate = (keys, timing) =>
			keys.startsWith('turn')
				? { done: Promise.resolve('finished'), plan: { duration: 0 }, cancel: () => {} }
				: animate(keys, timing);
		const shown = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'cutoff', value: 40 },
					{ param: 'resonance', value: 20 }
				]
			})
		);
		expect(shown.arrived).toBe(false);
		expect(shown.missed).toMatch(/^NOT ON THE REPLICA NOW: cutoff 40; resonance 20\./);
	});

	it('takes the value LFO’s parameter by name', async () => {
		const { sim, run } = setup(true);
		const shown = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'lfo type', value: 'value' },
					{ param: 'lfo destination', value: 'filter' },
					{ param: 'lfo parameter', value: 'resonance' }
				]
			})
		);
		expect(shown.arrived).toBe(true);
		expect(sim.state.tracks[2].lfo.parameter).toBe(1);
	});

	it('says when a groove it sets hardly reaches the notes', async () => {
		const { virtual, run } = setup(true);
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [1, 3, 5, 7, 9, 11, 13, 15].map((step) => ({
				step,
				note: 61,
				velocity: 100,
				length: 1
			}))
		});
		const shown = json(
			await run(planStepsTool, {
				show: true,
				settings: [
					{ param: 'groove', value: 'shuffle' },
					{ param: 'swing', value: 50 }
				]
			})
		);
		expect(shown.shown).toBe(true);
		expect(shown.groove).toMatch(
			/moves none of T1's notes, so it plays straight: shuffle moves the even sixteenths/
		);
	});

	it('says patterns keep their steps when the time signature changes', async () => {
		const { run } = setup(true);
		const shown = json(
			await run(planStepsTool, {
				show: true,
				area: 'project',
				param: 'time signature',
				value: '3/4'
			})
		);
		expect(shown.shown).toBe(true);
		expect(shown.meter).toMatch(
			/3\/4 now, a bar 12 steps: the patterns keep their steps \(a 64-step pattern runs 5.33 bars/
		);
		expect(shown.meter).not.toMatch(/felt beat/);
		// a compound meter says its felt beat against the tempo (a slow 12/8 blues: which pulse?)
		const compound = json(
			await run(planStepsTool, {
				show: true,
				area: 'project',
				param: 'time signature',
				value: '12/8'
			})
		);
		expect(compound.meter).toMatch(/Its felt beat is the dotted quarter, six steps/);
	});

	it('reads a shift layer’s value with shift held, as the user sees it turning', async () => {
		const { run } = setup();
		const plan = json(
			await run(planStepsTool, {
				show: false,
				track: 3,
				settings: [
					{ param: 'cutoff', value: 22 },
					{ param: 'fx ii send', value: 18 }
				]
			})
		);
		const send = plan.settings[1].steps.at(-1);
		expect(send.keys).toBe('shift + turn E4');
		expect(send.screen).toMatch(/^sends: .*fx II 18/);
	});

	it('plans a parameter from where the replica stands, without moving it', async () => {
		const { sim, run } = setup();
		const result = await run(planStepsTool, { show: false, track: 3, param: 'cutoff', value: 40 });
		expect(result.isError).toBeFalsy();
		const plan = json(result);
		expect(plan.reached).toBe(true);
		expect(plan.steps.map((s: { keys: string }) => s.keys)).toEqual(['T3', 'M3', 'turn E1']);
		expect(plan.steps[2]).toMatchObject({ detents: 40, direction: 'clockwise' });
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
		const { sim, virtual, run, animated } = setup(true);
		// the kit's kick with its hats: the duck dips on both
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [
				...[1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 })),
				...[3, 7, 11, 15].map((step) => ({ step, note: 61, velocity: 90, length: 1 }))
			]
		});
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
		expect(result.duck).toMatch(
			/^T1, the duck's source, plays closed hat 1 besides its kick: the ducked track dips on all of their hits/
		);
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
		// an auxiliary track reads back as given, 9–16 (FX I given as 15 came back as track 7)
		expect(result.settings[4]).toMatchObject({ param: 'track 5', area: 'auxiliary', track: 9 });
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

	it('lights a step held while its encoder turns, for a lock with no value given', async () => {
		// "teach me to put a parameter lock on step 5": the walkthrough lit M3 and E1 alone, and
		// the user turned the track's cutoff; step 5 also held no note
		const { sim, run, guided } = setup(true);
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(3, {
			pattern: 1,
			bars: 2,
			notes: [1, 4, 7, 20].map((step) => ({ step, note: 45, velocity: 100, length: 1 }))
		});
		const result = json(
			await run(planStepsTool, { show: false, guide: true, track: 3, param: 'cutoff', step: 5 })
		);
		expect(result.guided).toBe(true);
		expect(guided[0].steps.map((s) => s.keys)).toEqual(['T3', 'M3', 'step 5 + turn E1']);
		expect(result.silent).toMatch(
			/^step 5 of T3 holds no note, so a lock there plays nothing; the notes start on steps 1, 4, 7, 20\./
		);
		// on the second bar: the bar tapped first, and its step key held
		const second = json(
			await run(planStepsTool, { show: false, guide: true, track: 3, param: 'cutoff', step: 20 })
		);
		expect(guided[1].steps.map((s) => s.keys).slice(-2)).toEqual(['bar', 'step 4 + turn E1']);
		expect(second.silent).toBeUndefined();
	});

	it('lights stop first for a lock while the replica plays', async () => {
		// a user told to stop followed the lit keys alone, and the lock landed a bar late
		const { sim, run, guided } = setup(true);
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(3, {
			pattern: 1,
			bars: 2,
			notes: [1, 7, 23].map((step) => ({ step, note: 45, velocity: 100, length: 1 }))
		});
		virtual.transport('play');
		const result = json(
			await run(planStepsTool, {
				show: false,
				guide: true,
				track: 3,
				param: 'cutoff',
				value: 70,
				step: 7
			})
		);
		expect(guided[0].steps[0].keys).toBe('stop');
		expect(guided[0].steps.at(-1)?.keys).toBe('step 7 + turn E1');
		expect(result.steps[0].keys).toBe('stop');
		expect(result.caution).toMatch(/the walkthrough lights stop first/);
		// planned with the playhead in bar 2, the lit keys, played, lock the step asked for: the
		// rest is planned from the stopped keys (a bar tap planned while it played moved them off)
		virtual.transport('stop');
		virtual.transport('play');
		for (let i = 0; i < 25; i++) sim.advance(100); // into bar 2 at 120 bpm
		await run(planStepsTool, {
			show: false,
			guide: true,
			track: 3,
			param: 'cutoff',
			value: 70,
			step: 3
		});
		const lit = guided.at(-1)!.steps;
		expect(lit[0].keys).toBe('stop');
		for (const step of lit) playStep(sim, step);
		const locked = sim.state.tracks[2].sequence.patterns[0].steps
			.map((s, i) => (s.locks && Object.keys(s.locks).length ? i + 1 : 0))
			.filter((i) => i > 0);
		expect(locked).toEqual([3]);
		// stopped, it starts at the track
		virtual.transport('stop');
		await run(planStepsTool, {
			show: false,
			guide: true,
			track: 3,
			param: 'cutoff',
			value: 70,
			step: 7
		});
		expect(guided.at(-1)!.steps[0].keys).not.toBe('stop');
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

	it('walks to a value already set: the way to its page and encoder, said so', async () => {
		const { sim, run, guided } = setup(true);
		// on the filter page of track 3 already, the cutoff at 40 (just set, as an agent had)
		playStep(sim, { keys: 'T3' });
		playStep(sim, { keys: 'M3' });
		sim.state.tracks[2].filter.cutoff = 40;
		const result = json(
			await run(planStepsTool, { show: false, guide: true, track: 3, param: 'cutoff', value: 40 })
		);
		expect(result.guided).toBe(true);
		expect(result.already).toMatch(
			/^cutoff is already 40: say so\. The walkthrough lights the way/
		);
		// already on its page: the encoder alone is lit
		expect(guided[0].steps.map((s) => s.keys)).toEqual(['turn E1']);
	});

	it('says a value is already set when only its page is a step away, and lights the encoder', async () => {
		// a new project's tempo is 120: the plan to "tempo 120" pressed tempo alone, and said
		// nothing of the value being set already
		const { run, guided } = setup(true);
		const result = json(
			await run(planStepsTool, {
				show: false,
				guide: true,
				area: 'tempo',
				param: 'tempo',
				value: '120'
			})
		);
		expect(result.already).toMatch(/^tempo is already 120: say so/);
		expect(guided[0].steps.map((s) => s.keys)).toEqual(['tempo', 'turn E1']);
		const planned = json(
			await run(planStepsTool, { show: false, area: 'tempo', param: 'tempo', value: '120' })
		);
		expect(planned.already).toMatch(/^tempo is already 120: the steps only go to its page/);
		expect(planned.planned).toBeUndefined();
		// a value that is not set yet says nothing of the kind
		const other = json(
			await run(planStepsTool, { show: false, area: 'tempo', param: 'tempo', value: '96' })
		);
		expect(other.already).toBeUndefined();
		expect(other.planned).toMatch(/^NOT SET/);
	});

	it('walks "groove 0" to the groove amount, the encoder it sets (E3)', async () => {
		// the value plan took the amount (E3) while the walkthrough lit the groove type's E2
		const { run, guided } = setup(true);
		const result = json(
			await run(planStepsTool, {
				show: false,
				guide: true,
				area: 'tempo',
				param: 'groove',
				value: '0'
			})
		);
		expect(result.already).toMatch(/^swing \(the groove amount, E3\) is already 0: say so/);
		expect(guided[0].steps.map((s) => s.keys)).toEqual(['tempo', 'turn E3']);
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
		expect(named.note).toMatch(
			/the project settings have no "nope"; by page they hold general: transpose/
		);
	});

	it('locks one step’s value with its key held while the encoder turns', async () => {
		const { sim, virtual, run } = setup(true);
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [
				{ step: 1, note: 45, velocity: 100, length: 2 },
				{ step: 7, note: 48, velocity: 100, length: 2 }
			]
		});
		const before = sim.state.tracks[2].filter.cutoff;
		const start = virtual.checkpoint();
		const plan = json(
			await run(planStepsTool, { show: true, track: 3, param: 'cutoff', value: 60, step: 7 })
		);
		expect(plan).toMatchObject({ shown: true, arrived: true, reached: true });
		const last = plan.steps.at(-1);
		expect(last.keys).toBe('step 7 + turn E1');
		expect(plan.note).toMatch(/step 7 locked, the track's own value kept/);
		const step = sim.state.tracks[2].sequence.patterns[0].steps[6];
		expect(Math.round(step.locks['filter.cutoff'])).toBe(60);
		// the track's own cutoff and the step's note stay
		expect(sim.state.tracks[2].filter.cutoff).toBe(before);
		expect(step.notes.map((n) => n.note)).toEqual([48]);
		// read back with the pattern, and named in the change list
		expect(virtual.readPattern(3).locks).toEqual([{ step: 7, values: ['cutoff 60'] }]);
		expect(virtual.changesSince(start)).toContain('T3 pattern 1: cutoff locked at 60 on step 7');
	});

	it('copies one track’s sound onto another with Tn + M2 and Tn + M3', async () => {
		const { sim, run } = setup(true);
		const plan = json(
			await run(planStepsTool, { show: true, track: 6, param: 'sound from', value: 3 })
		);
		expect(plan).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(plan.steps.map((s: { keys: string }) => s.keys).slice(-2)).toEqual([
			'T3 + M2',
			'T6 + M3'
		]);
		expect(sim.state.tracks[5].engine).toBe(sim.state.tracks[2].engine);
	});

	it('saves the project with M2, and a copy with shift + M2 and M1', async () => {
		const { sim, run } = setup(true);
		const keys = (plan: { steps: { keys: string }[] }) => plan.steps.map((s) => s.keys);
		const saved = json(await run(planStepsTool, { show: true, area: 'project', param: 'save' }));
		expect(saved).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(keys(saved)).toEqual(['project', 'M2']);
		const name = sim.state.project.name;
		const copy = json(await run(planStepsTool, { show: true, area: 'project', param: 'save as' }));
		expect(copy).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(keys(copy).slice(-2)).toEqual(['shift + M2', 'M1']);
		expect(sim.state.project.name).not.toBe(name);
		expect(copy.note).toMatch(/^saved as "project 2"/);
	});

	it('types the name a save as or a rename is given on the naming screen', async () => {
		// "save this project as night drive" saved as "project 2", read back as "already night drive"
		const { sim, run } = setup(true);
		const named = json(
			await run(planStepsTool, {
				show: true,
				area: 'project',
				param: 'save as',
				value: 'Night Drive'
			})
		);
		expect(named).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(named.already).toBeUndefined();
		expect(sim.state.project.name).toBe('night drive');
		expect(named.note).toMatch(
			/^saved as "night drive", now the open project, typed on the naming screen/
		);
		// and what keeps the edits after it (an agent could not tell whether a variation was saved)
		expect(named.note).toMatch(
			/edits from here on are autosaved when another project opens or a new one starts; save again \(M2\) to store them now/
		);
		const renamed = json(
			await run(planStepsTool, { show: true, area: 'project', param: 'rename', value: 'dusk' })
		);
		expect(renamed).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(sim.state.project.name).toBe('dusk');
		// a character the screen cannot spell is refused, with the ones it can
		const odd = await run(planStepsTool, {
			show: false,
			area: 'project',
			param: 'save as',
			value: 'café'
		});
		expect(String(odd.content)).toMatch(/the naming screen has no \\"é\\"/);
	});

	it('arrives at a save and a named save as with the real replica, time passing', async () => {
		// the sequencer's clock runs on every frame: a save compared whole read as unsaved a frame
		// later, and "save it as sunrise jam" shown on the replica said it had not arrived
		const time = new FakeTime();
		const sim = new OpxySim({ now: () => time.now() });
		const replica = new ReplicaState({ timers: time });
		replica.observe((event) => sim.input(event));
		const virtual = createVirtualOpxy({ sim });
		const frame = () => {
			sim.advance(16);
			time.setTimeout(frame, 16);
		};
		time.setTimeout(frame, 16);
		const env = {
			device: null,
			replica,
			virtual,
			guide: { start: () => {}, stop: () => {} },
			manual: NO_MANUAL,
			timers: time,
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {}
		} as unknown as AgentEnvironment;
		const live = async (input: unknown) => {
			const ctx: ToolContext = {
				toolCallId: 'toolu_save',
				agent: 'conductor',
				signal: new AbortController().signal,
				env
			};
			let done = false;
			const running = planStepsTool
				.run(planStepsTool.input.parse(input), ctx)
				.finally(() => (done = true));
			for (let i = 0; i < 4000 && !done; i++) await time.advance(50);
			return json(await running);
		};
		const saved = await live({ show: true, area: 'project', param: 'save' });
		expect(saved).toMatchObject({ shown: true, arrived: true });
		const named = await live({
			show: true,
			area: 'project',
			param: 'save as',
			value: 'sunrise jam'
		});
		expect(named).toMatchObject({ shown: true, arrived: true });
		expect(sim.state.project.name).toBe('sunrise jam');
	});

	it('reaches the system settings: a keyboard on channel 3 plays the selected track', async () => {
		// an agent gave com → M1 steps from the manual, unable to check them
		const { sim, run } = setup(true);
		const channel = json(
			await run(planStepsTool, {
				show: true,
				area: 'com',
				param: 'active track channel',
				value: 3
			})
		);
		expect(channel).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(channel.steps.map((s: { keys: string }) => s.keys).slice(0, 2)).toEqual(['com', 'M1']);
		expect(channel.screen).toBe('system settings: midi, active channel, 3');
		expect(sim.state.areas.system.system.channel).toBe(3);
		const velocity = json(
			await run(planStepsTool, {
				show: true,
				area: 'com',
				param: 'keyboard velocity',
				value: 'soft'
			})
		);
		expect(velocity.screen).toBe('system settings: keyboard, velocity, soft');
	});

	it('says where the notes slide once legato and portamento are set', async () => {
		// an acid line whose notes ended where the next began, set to legato: none slides
		const { virtual, run } = setup(true);
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [1, 3, 5].map((step) => ({ step, note: 45, velocity: 100, length: 2 }))
		});
		const result = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'play mode', value: 'legato' },
					{ param: 'portamento', value: 20 }
				]
			})
		);
		expect(result.slides).toMatch(
			/^T3 plays legato with portamento 20, but no note runs past the next one's start/
		);
	});

	it('reads the sound back after loading an engine, with the settings that followed', async () => {
		const { run } = setup(true);
		const result = json(
			await run(planStepsTool, {
				show: true,
				track: 8,
				settings: [
					{ param: 'engine', value: 'axis' },
					{ param: 'amp attack', value: 50 }
				]
			})
		);
		expect(result.loaded.track).toBe(8);
		expect(result.loaded.pages['M1 engine']).toMatch(/^axis:/);
		expect(result.loaded.pages['M2 amp envelope']).toMatch(/attack 50/);
		expect(result.sound).toMatch(/^A load sets every page anew/);
		expect(result.unit).toBeUndefined();
		// the midi engine: the unit's own browser did not list it
		const midi = json(
			await run(planStepsTool, {
				show: true,
				track: 4,
				settings: [{ param: 'engine', value: 'midi' }]
			})
		);
		expect(midi.unit).toMatch(/preset browser on OS 1\.1\.33 showed none/);
		expect(midi.standIn).toBeUndefined();
	});

	it('says a factory preset plays as its engine’s starting sound, and lists a folder', async () => {
		const { run } = setup(true);
		const named = json(
			await run(planStepsTool, { show: true, track: 3, param: 'preset', value: 'bass/sonorous' })
		);
		expect(named.loaded.preset).toBe('bass/sonorous');
		// the new project's bass is mono; prism's starting sound is poly
		expect(named.playMode).toMatch(
			/^T3 plays poly now \(it was mono\): notes that overlap sound together now/
		);
		expect(named.standIn).toMatch(
			/^T3 bass\/sonorous: the replica knows TE's factory presets by name/
		);
		// a new project's own presets are the device's sounds
		const own = json(
			await run(planStepsTool, { show: true, track: 8, param: 'preset', value: 'pad/bandpasser' })
		);
		expect(own.standIn).toBeUndefined();
		const folder = json(
			await run(planStepsTool, { show: false, track: 3, param: 'preset', value: 'bass' })
		);
		expect(folder.note).toMatch(/^"bass" is a folder of the preset browser, holding bass\/alloy, /);
	});

	it('says a synced LFO speed as a note value and a rate', async () => {
		// "1/8" read back as "sync 2", and an agent could not tell what that was
		const { run } = setup(true);
		const result = json(
			await run(planStepsTool, { show: true, track: 3, param: 'lfo speed', value: '1/8' })
		);
		expect(result.lfoRate).toBe(
			"T3's LFO is synced at sync 2: a cycle every 2 sixteenths (an eighth), 4 a second at 120 bpm."
		);
	});

	it('says which tracks an FX reaches when its effect is swapped', async () => {
		// FX II's reverb swapped for a lofi, and the agent was unsure who else sent there
		const { run } = setup(true);
		const swapped = json(
			await run(planStepsTool, {
				show: true,
				settings: [{ area: 'auxiliary', track: 16, param: 'effect', value: 'lofi' }]
			})
		);
		expect(swapped.fx).toMatch(
			/^FX II's effect is every track's: (T\d \d+, )*T4 23(, T\d \d+)* send to it, through the lofi now; the rest send nothing\.$/
		);
	});

	it('says how to hear a sound shaped on a track with notes, alone', async () => {
		// agents set a reese bass or a radio tone by numbers and said afterwards they never listened
		const { virtual, run } = setup(true);
		const empty = json(
			await run(planStepsTool, { show: true, track: 3, param: 'cutoff', value: 40 })
		);
		// no notes on T3: nothing to hear
		expect(empty.hear).toBeUndefined();
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 45, velocity: 100, length: 4 }]
		});
		const shaped = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'detune', value: 60 },
					{ param: 'tempo', value: 100 }
				]
			})
		);
		expect(shaped.hear).toBe(
			'Not heard since: listen with scene 1 and tracks [3] hears T3 alone, offline, before you say how it sounds.'
		);
		// a tempo alone shapes no sound
		const tempo = json(await run(planStepsTool, { show: true, param: 'tempo', value: 90 }));
		expect(tempo.hear).toBeUndefined();
	});

	it('says when the steps switched an off filter on to set its cutoff', async () => {
		// T7's strings in a new project have the filter off
		const { run } = setup(true);
		const off = json(
			await run(planStepsTool, { show: true, track: 7, param: 'cutoff', value: 30 })
		);
		// the steps switch it on first (M3 again), said so
		expect(off.steps.map((s: { keys: string }) => s.keys)).toEqual(['T7', 'M3', 'M3', 'turn E1']);
		expect(off.filterOff).toMatch(/^T7's ladder filter was off, so the steps switched it on first/);
		expect(off.filterOff).not.toMatch(/highpass/);
		// T4's epiano has a highpass, off: switched on to darken, it would thin the chords
		const high = json(
			await run(planStepsTool, { show: true, track: 4, param: 'cutoff', value: 55 })
		);
		expect(high.filterOff).toMatch(
			/^T4's z hipass filter was off, .* It is a highpass: raising its cutoff takes away the lows/
		);
		const on = json(
			await run(planStepsTool, {
				show: true,
				track: 7,
				settings: [
					{ param: 'filter', value: 'on' },
					{ param: 'cutoff', value: 30 }
				]
			})
		);
		// on already: nothing to say
		expect(on.filterOff).toBeUndefined();
	});

	it('sets an envelope stage by its time, the nearest value said', async () => {
		const { sim, run } = setup(true);
		const result = json(
			await run(planStepsTool, { show: true, track: 8, param: 'amp attack', value: '2 s' })
		);
		expect(result.times).toMatch(
			/^amp attack 2 s: the page value 5\d \(of 0–99\) is the nearest, 2(\.\d)? s$/
		);
		expect(sim.state.tracks[7].amp.attack).toBeGreaterThanOrEqual(52);
		// by its page value, its time said, and the release's way round
		const release = json(
			await run(planStepsTool, { show: true, track: 8, param: 'amp release', value: 12 })
		);
		expect(release.times).toMatch(
			/^amp release 12: about \d+(\.\d)? s \(the release runs the other way: a lower value lasts longer\)$/
		);
		expect(sim.state.tracks[7].amp.attack).toBeLessThanOrEqual(54);
		// by its time, the way round too (an agent read a release of 33 as short and 78 as long)
		const timed = json(
			await run(planStepsTool, { show: true, track: 8, param: 'amp release', value: '0.6 s' })
		);
		expect(timed.times).toMatch(
			/^amp release 0\.6 s: the page value \d+ \(of 0–99\) is the nearest, 0\.6 s; the release runs the other way, a higher value shorter$/
		);
	});

	it('pins the step keys before locking steps while the replica plays', async () => {
		// a bar passes as each step animates: unpinned, the step keys follow the playhead and every
		// lock lands a bar off (an agent's cutoff ramp did)
		const { virtual, run } = setup(true, 2000);
		virtual.writePattern(7, {
			pattern: 1,
			bars: 4,
			notes: [1, 17, 33, 49].map((step) => ({ step, note: 60, velocity: 90, length: 16 }))
		});
		virtual.transport('play');
		await run(planStepsTool, {
			show: true,
			track: 7,
			settings: [1, 17, 33, 49].map((step, i) => ({ param: 'cutoff', value: 10 + i * 25, step }))
		});
		const locks = virtual.readPattern(7).locks ?? [];
		expect(locks.map((l) => [l.step, l.values.join(', ')])).toEqual([
			[1, 'cutoff 10'],
			[17, 'cutoff 35'],
			[33, 'cutoff 60'],
			[49, 'cutoff 85']
		]);
	});

	it('lands step locks on their steps with the real replica animating while it plays', async () => {
		// the replica's own animation timers and the simulator's frames, as in the app: a bar tap on
		// another track's one-bar pattern once pinned nothing, and every lock landed two bars off
		const time = new FakeTime();
		const sim = new OpxySim({ now: () => time.now() });
		const replica = new ReplicaState({ timers: time });
		replica.observe((event) => sim.input(event));
		const virtual = createVirtualOpxy({ sim });
		const frame = () => {
			sim.advance(16);
			time.setTimeout(frame, 16);
		};
		time.setTimeout(frame, 16);
		virtual.writePattern(7, {
			pattern: 1,
			bars: 4,
			notes: [1, 17, 33, 49].map((step) => ({ step, note: 60, velocity: 90, length: 16 }))
		});
		virtual.transport('play');
		await time.advance(2500);
		const env = {
			device: null,
			replica,
			virtual,
			guide: { start: () => {}, stop: () => {} },
			manual: NO_MANUAL,
			timers: time,
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {}
		} as unknown as AgentEnvironment;
		const ctx: ToolContext = {
			toolCallId: 'toolu_live',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		};
		let done = false;
		const running = planStepsTool
			.run(
				planStepsTool.input.parse({
					show: true,
					track: 7,
					settings: [
						{ param: 'filter', value: 'on' },
						...[1, 17, 33, 49].map((step, i) => ({ param: 'cutoff', value: 10 + i * 25, step }))
					]
				}),
				ctx
			)
			.finally(() => (done = true));
		for (let i = 0; i < 4000 && !done; i++) await time.advance(50);
		const result = json(await running);
		expect(result.arrived).toBe(true);
		expect(result.pinned).toMatch(
			/^The replica was playing, so a bar tap first pinned the step keys/
		);
		expect((virtual.readPattern(7).locks ?? []).map((l) => [l.step, l.values.join(', ')])).toEqual([
			[1, 'cutoff 10'],
			[17, 'cutoff 35'],
			[33, 'cutoff 60'],
			[49, 'cutoff 85']
		]);
	});

	it('reaches a track’s midi channel on the project’s midi page, not its voices', async () => {
		// "track 6" is a row of the voices page and of the midi page: an agent set track 6's voices
		const { run } = setup(true);
		const channel = json(
			await run(planStepsTool, {
				show: false,
				area: 'project',
				param: 'midi channel',
				track: 6,
				value: '2'
			})
		);
		expect(channel.reached).toBe(true);
		expect(channel.screen).toMatch(/midi, track 6, 2/);
		const named = json(
			await run(planStepsTool, { show: false, area: 'project', param: 'midi track 6', value: '2' })
		);
		expect(named.screen).toMatch(/midi, track 6, 2/);
		const after = json(
			await run(planStepsTool, {
				show: false,
				area: 'project',
				param: 'track 2 midi channel',
				value: '10'
			})
		);
		expect(after.screen).toMatch(/midi, track 2, 10/);
		const bare = json(
			await run(planStepsTool, { show: false, area: 'project', param: 'track 6', value: '2' })
		);
		expect(bare.reached).toBe(false);
		expect(bare.note).toMatch(/"track 6" is a row of voices and midi: name the page/);
	});

	it('sets a preset setting, the stereo width, through shift + instrument', async () => {
		// an agent asked to widen a chord loop found no page for width
		const { sim, run } = setup(true);
		const wide = json(
			await run(planStepsTool, { show: true, track: 7, param: 'width', value: 60 })
		);
		expect(wide).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(wide.steps.map((s: { keys: string }) => s.keys)).toContain('shift + instrument');
		expect(sim.state.areas.system.presetSettings[6].width).toBeGreaterThan(0);
		expect(wide.screen).toMatch(/width, 60/);
		// shown, not played: the browser's sound reads only velocity sensitivity of these
		expect(wide.unheard).toMatch(/^width: the replica shows it on its preset settings page/);
		// velocity onto the cutoff: accents that open the filter (an acid line's agent asked for it)
		const accents = json(
			await run(planStepsTool, {
				show: true,
				track: 3,
				settings: [
					{ param: 'velocity target', value: 'cutoff' },
					{ param: 'velocity amount', value: 50 }
				]
			})
		);
		expect(accents).toMatchObject({ shown: true, arrived: true });
		expect(accents.unheard).toMatch(/^velocity target, velocity amount: .* them /);
		const sensitivity = json(
			await run(planStepsTool, { show: true, track: 3, param: 'velocity sens', value: 40 })
		);
		expect(sensitivity.unheard).toBeUndefined();
	});

	it('starts over with a new project: project, then hold M1', async () => {
		// "delete everything and start over" once meant writing over each track remembered
		const { sim, virtual, run } = setup(true);
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 1, note: 53, velocity: 100, length: 1 }]
		});
		const name = sim.state.project.name;
		const fresh = json(
			await run(planStepsTool, { show: true, area: 'project', param: 'new project' })
		);
		expect(fresh).toMatchObject({ shown: true, arrived: true, reached: true });
		expect(fresh.steps.map((s: { keys: string }) => s.keys)).toEqual(['project', 'hold M1']);
		expect(sim.state.project.name).not.toBe(name);
		expect(virtual.readPattern(1).notes).toHaveLength(0);
		expect(fresh.note).toMatch(/^a new project, "project 2": a new project's sounds/);
	});
});

describe('plan_steps guiding to a page value with none given', () => {
	it('ends on the turn even when the replica is on the page already', async () => {
		const { sim, run, guided } = setup(true);
		await run(planStepsTool, {
			show: true,
			area: 'player',
			track: 4,
			param: 'player',
			value: 'on'
		});
		const result = json(
			await run(planStepsTool, {
				show: false,
				guide: true,
				area: 'player',
				track: 4,
				param: 'speed'
			})
		);
		expect(result.guided).toBe(true);
		expect(guided.at(-1)?.steps.map((s) => s.keys)).toEqual(['turn E1']);
		expect(sim.state.overlay).toBe('players');
	});
});

describe('plan_steps to a maestro chord', () => {
	it('enters the chord with shift held on the maestro page, the player on', async () => {
		const { sim, run } = setup(true);
		const plan = json(
			await run(planStepsTool, {
				show: true,
				settings: [
					{ area: 'player', track: 4, param: 'type', value: 'maestro' },
					{ area: 'player', track: 4, param: 'chord', value: 'A3 C4 E4' }
				]
			})
		);
		expect(plan).toMatchObject({ shown: true, arrived: true, reached: true });
		const player = sim.state.tracks[3].sequence.patterns[0].player;
		expect(player).toMatchObject({ type: 'maestro', on: true });
		expect(player.maestro.chord).toEqual([69, 72, 76]); // an octave up, where the keyboard plays
	});
});
