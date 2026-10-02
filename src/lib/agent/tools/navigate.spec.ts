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
	return { sim, virtual, run, animated, guided, stops };
}

const json = (result: ToolResult) => JSON.parse(String(result.content));

describe('plan_steps', () => {
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
		expect(named.note).toMatch(/the project settings have no "nope"; they hold transpose/);
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
	});

	it('sets an envelope stage by its time, the nearest value said', async () => {
		const { sim, run } = setup(true);
		const result = json(
			await run(planStepsTool, { show: true, track: 8, param: 'amp attack', value: '2 s' })
		);
		expect(result.times).toMatch(/^amp attack 2 s: 5\d is the nearest \(2(\.\d)? s\)$/);
		expect(sim.state.tracks[7].amp.attack).toBeGreaterThanOrEqual(52);
		expect(sim.state.tracks[7].amp.attack).toBeLessThanOrEqual(54);
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
