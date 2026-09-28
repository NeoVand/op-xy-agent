/**
 * The step-by-step tool (Phase F4): `plan_steps` gives the exact keys and encoder turns from where
 * the replica stands to a page, or to a parameter set to a value, tried on a copy of the simulator
 * first (`$lib/sim/navigator.ts`); with `show` it also walks the replica through them, one animated
 * step at a time, so the user watches the keys and the screen change and the virtual OP-XY ends up
 * there. It never sends anything to a connected device. One non-strict tool rather than two strict
 * ones keeps the tool set within the API's grammar limits (`MAX_OPTIONAL_PARAMETERS`).
 */
import { z } from 'zod';
import type { NavPlan, NavStep, Place, SettingsPlan } from '$lib/sim/navigator';
import type { NavGoal } from '../virtual-opxy';
import { defineTool, errorResult, jsonResult, type AgentEnvironment } from './define';

const goalInput = z.object({
	show: z
		.boolean()
		.describe(
			'true: also animate the steps on the replica, which leaves the virtual OP-XY there (when the user wants to be shown, or asks you to set it up); false: only plan'
		),
	area: z
		.enum(['instrument', 'auxiliary', 'mix', 'arrange', 'tempo', 'player'])
		.optional()
		.describe('For a page: which part of the device (not needed when param is given)'),
	track: z
		.int()
		.min(1)
		.max(16)
		.optional()
		.describe(
			'Track 1–16 (9–16 are the auxiliary tracks); default: the selected one. For a parameter, the instrument track whose parameter it is.'
		),
	page: z.int().min(1).max(4).optional().describe('The M-page, 1–4 (instrument, auxiliary, mix)'),
	param: z
		.string()
		.min(1)
		.max(60)
		.optional()
		.describe(
			'To set a parameter: its name as the page shows it or a common word ("cutoff", "resonance", "amp release", "filter attack", "portamento", "fx ii send", "lfo amount", "tempo", "groove", an engine parameter such as "shape" or "detune"), a list ("engine", "filter type", "lfo type": value is the name, e.g. "wavetable", "ladder", "duck"), the duck LFO\'s "duck source" (the triggering track 1–8), or an id ("filter.cutoff")'
		),
	value: z
		.union([z.number(), z.string().min(1).max(30)])
		.optional()
		.describe(
			'The value to set: a number as the screen shows it (0–99 for most, bpm for tempo) or the text the screen shows ("1/16", "danish", "mono")'
		),
	settings: z
		.array(
			z.object({
				param: z.string().min(1).max(60).describe('As for param'),
				value: z.union([z.number(), z.string().min(1).max(30)]).describe('As for value'),
				track: z.int().min(1).max(8).optional().describe('Default: the track given above')
			})
		)
		.min(1)
		.max(16)
		.optional()
		.describe(
			'Several parameters in one go, in order, instead of param and value: each is planned from where the ones before leave the device. Use it to set up a sound from an idea (a pluck: amp decay, sustain, release, resonance; a sidechain duck: lfo type duck, duck source, lfo amount). Put a list pick (engine, filter type, lfo type) before the parameters that depend on it.'
		)
});

type GoalInput = z.infer<typeof goalInput>;

/** The navigator's goal for the tool input, or an error message. */
function toGoal(input: GoalInput, env: AgentEnvironment): NavGoal | string {
	const selected = env.virtual?.status().selectedTrack ?? 1;
	const track = input.track ?? selected;
	if (input.settings !== undefined) {
		if (input.param !== undefined) return 'give either param and value or settings, not both';
		if (track > 8) return 'only instrument tracks (1–8) have these parameters';
		return {
			settings: input.settings.map((s) => ({
				track: s.track ?? track,
				param: s.param,
				value: s.value
			}))
		};
	}
	if (input.param !== undefined) {
		if (input.value === undefined) return 'value is needed with param';
		if (track > 8) return 'only instrument tracks (1–8) have these parameters';
		return { track, param: input.param, value: input.value };
	}
	const aux = track > 8 ? track - 8 : track;
	let place: Place;
	switch (input.area) {
		case 'instrument':
			if (track > 8) return 'instrument tracks are 1–8';
			place = { area: 'instrument', track, page: (input.page ?? 1) as 1 | 2 | 3 | 4 };
			break;
		case 'auxiliary':
			place = { area: 'auxiliary', track: aux, page: (input.page ?? 1) as 1 | 2 | 3 | 4 };
			break;
		case 'mix':
			place = { area: 'mix', page: (input.page ?? 1) as 1 | 2 | 3 | 4 };
			break;
		case 'arrange':
			place = { area: 'arrange' };
			break;
		case 'tempo':
			place = { area: 'tempo' };
			break;
		case 'player':
			if (track > 8) return 'players are on instrument tracks 1–8 here';
			place = { area: 'player', track };
			break;
		default:
			return 'give an area (for a page) or a param and value';
	}
	return { place };
}

const stepView = (s: NavStep) => ({
	keys: s.keys,
	...(s.clicks !== undefined
		? { clicks: s.clicks, direction: s.clicks > 0 ? 'clockwise' : 'counter-clockwise' }
		: {}),
	screen: s.screen
});

/** The plan as the model reads it; several settings come grouped by the parameter they set. */
function planView(plan: NavPlan | SettingsPlan) {
	return {
		reached: plan.reached,
		...('parts' in plan
			? {
					settings: plan.parts.map((p) => ({
						param: p.goal.param,
						value: p.goal.value,
						track: p.goal.track,
						reached: p.reached,
						...(p.note ? { note: p.note } : {}),
						steps: p.steps.map(stepView)
					}))
				}
			: { steps: plan.steps.map(stepView) }),
		screen: plan.screen,
		...(plan.note ? { note: plan.note } : {})
	};
}

const summaryOf = (plan: NavPlan) =>
	plan.steps.length === 0
		? plan.reached
			? 'already there'
			: `not reachable: ${plan.note ?? 'unknown'}`
		: `${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}: ${plan.steps.map((s) => (s.clicks ? `${s.keys} ×${Math.abs(s.clicks)}` : s.keys)).join(', ')}${plan.reached ? '' : ` (not all: ${plan.note ?? 'unknown'})`}`;

/** Longest a turn's animation runs, however many detents it has. */
const TURN_MS = 1800;

export const planStepsTool = defineTool({
	name: 'plan_steps',
	label: 'plan steps',
	kind: 'ui',
	// its optional goal fields would push the strict grammar over the API's size limit
	strict: false,
	description:
		'The exact steps from where the replica stands now to a page ("the filter page of track 3", "mix M2", "the tempo page", "track 4\'s player") or to a parameter set to a value ("track 3 cutoff 40", "tempo 128", "amp release 60"), tried on a copy of the simulator first so they are known to work. Each step is a key combo in the key grammar; turns carry the number of detents and the direction; each step says what the screen shows after it. Use it for every "how do I get to / set …" question instead of working the keys out yourself. With show, it also animates the steps on the replica (the virtual OP-XY ends up there, as if the user had pressed the keys); nothing is sent to a connected device.',
	input: goalInput,
	async run(input, ctx) {
		const virtual = ctx.env.virtual;
		if (!virtual)
			return errorResult('There is no replica to plan from in this session.', 'no replica');
		const goal = toGoal(input, ctx.env);
		if (typeof goal === 'string') return errorResult(goal, 'bad goal');
		const plan = virtual.plan(goal);
		if (!input.show) return jsonResult(planView(plan), summaryOf(plan));
		const replica = ctx.env.replica;
		// several settings show the ones that work; a single goal only when it is reachable
		const showable = 'settings' in goal ? plan.steps.length > 0 : plan.reached;
		if (!showable || !replica) {
			return jsonResult(
				{
					shown: false,
					...planView(plan),
					...(replica ? {} : { reason: 'No replica is on screen.' })
				},
				summaryOf(plan)
			);
		}
		for (const step of plan.steps) {
			if (ctx.signal.aborted) break;
			const clicks = Math.abs(step.clicks ?? 0);
			const timing = clicks
				? {
						turnSteps: clicks,
						direction: Math.sign(step.clicks ?? 1) as 1 | -1,
						turnStepMs: Math.min(140, TURN_MS / clicks)
					}
				: {};
			await replica.animate(step.keys, timing).done;
		}
		// the replica's simulator followed the animation: check that it got there
		const after = virtual.plan(goal);
		// several settings: every reachable one reads its value (the rest say why in the plan)
		const arrived =
			'settings' in goal ? after.steps.length === 0 : after.reached && after.steps.length === 0;
		return jsonResult({ shown: true, arrived, ...planView(plan) }, `shown: ${summaryOf(plan)}`);
	}
});

/** The step-by-step tools. */
export const NAVIGATE_TOOLS = [planStepsTool];
