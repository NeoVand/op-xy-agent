/**
 * The step-by-step tool (Phase F4): `plan_steps` gives the exact keys and encoder turns from where
 * the replica stands to a page, or to a parameter set to a value, tried on a copy of the simulator
 * first (`$lib/sim/navigator.ts`); with `show` it also walks the replica through them, one animated
 * step at a time, so the user watches the keys and the screen change and the virtual OP-XY ends up
 * there. It never sends anything to a connected device. One non-strict tool rather than two strict
 * ones keeps the tool set within the API's grammar limits (`MAX_OPTIONAL_PARAMETERS`).
 */
import { z } from 'zod';
import {
	findParam,
	TEMPO_PARAMS,
	type NavPlan,
	type NavStep,
	type Place,
	type SettingGoal,
	type SettingsPlan
} from '$lib/sim/navigator';
import { SETTING_AREAS, settingGoal, type SettingArea } from '$lib/sim/settings';
import type { NavGoal } from '../virtual-opxy';
import { defineTool, errorResult, jsonResult, type AgentEnvironment } from './define';

/** A setting's value, as plan_steps takes it. */
const settingValue = z.union([z.number(), z.string().min(1).max(30)]);

/** A sampler track's key, as plan_steps takes it. */
const samplerKey = z.union([z.number(), z.string().min(1).max(30)]);

/** Where a setting lives (the areas plan_steps plans values in). */
const settingArea = z.enum(SETTING_AREAS as [SettingArea, ...SettingArea[]]);

const goalInput = z.object({
	show: z
		.boolean()
		.describe(
			'true: also animate the steps on the replica, which leaves it there (when the user wants to be shown, or asks you to set it up); false: only plan'
		),
	guide: z
		.boolean()
		.optional()
		.describe(
			'true (with show false): walk the user through the steps on the replica instead: it lights one step at a time, with the turn direction for encoders, and waits until the user has done it; for someone who wants to learn by doing it themselves'
		),
	area: z
		.enum([
			'instrument',
			'auxiliary',
			'mix',
			'arrange',
			'tempo',
			'player',
			'sample',
			'com',
			'bar',
			'project'
		])
		.optional()
		.describe(
			"Which part of the device: for a page (sample is the record page), or where param lives (not needed for an instrument track's parameter)"
		),
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
			'To set a parameter of an instrument track: its name as the page shows it or a common word ("cutoff", "resonance", "amp release", "filter attack", "portamento", "fx ii send", "lfo amount", "lfo speed" (a number is a free speed, 0–99; synced to the tempo: "sync 16", "1 bar", "1/4"), "tempo", "groove", "metronome" (on or off; a number is its level, and 0 is silent with it still on), an engine parameter such as "shape" or "detune"), "filter" and "lfo" (on, off: their page key pressed again switches them), a list or a load ("engine", "preset", "filter type", "lfo type": value is the name, e.g. "wavetable", "pluck/beach bum", "ladder", "duck"; an engine or preset is loaded from the preset browser shift + M1 brings up, which replaces the whole sound; the replica lists the external midi engine last, which OS 1.1.33 does not show), the duck LFO\'s "duck source" (the triggering track 1–16, or "metronome") and "source type" (audio, notes), a sampler track\'s own values with key naming the key ("tune", "start", "end", "play mode" (key, oneshot, mute group, loop), "direction", "pan", "fade", "gain" of a drum key; "start", "loop start", "loop end", "end", "tune", "loop crossfade", "gain", "loop type" of the synth sampler or a multisampler zone), any value a page of the track shows (the midi engine\'s "channel", "bank", "cc slot 1", "cc slot 1 number"), or an id ("filter.cutoff"); "sound from" copies another track\'s whole sound onto this one (value: that track, 1–8; its notes and mixer strip stay). With area auxiliary or mix: the value\'s name as read_screen shows it on that page ("size" or "feedback" on FX I/II and their "effect": chorus, delay, dist, lofi, phaser, reverb; "speed" on the tape; the brain\'s "mode" (auto, manual), "root", "scale", "link"; a routing page\'s "track 1"…"track 8" (the brain: in or out; tape, FX and external audio: the send level; tracks 5–8 are a click away, which the plan does); an LFO\'s "lfo speed", "lfo amount"; "drive" on external audio; on mix M1 a track\'s "level", "pan", "fx i", "fx ii", "mute"; "low", "mid", "high" on the master EQ, M2; "gain" and the rest on the saturator, M3; "master" on M4). With area player: "type" (arpeggio, hold, maestro), "player" (on, off), maestro\'s "chord" (its notes, "A3 C4 E4": stored with shift held on the keyboard, in the octave the keyboard plays) and the page\'s values (the arpeggio\'s "speed": 1/4, 1/8, 1/8t, 1/16, 1/16t, 1/32, 1/32t, 1/64; "pattern": up, down, up/down, up/repeat/down, random, play order; "range", "hold"; its shift layer "length", "style", "glide", "stereo"). With area arrange: "pattern" (the pattern the track plays; new ones are added as needed), "scene" (1–99; an empty one starts as a copy of the current), "song" (its scenes in order, e.g. "1 1 2 2") and "loop" (on, off). With area bar (the bar menu, bar held): "track scale" (1–8, 16, 1/2), "bars" (1–4), "quant", "length", "groove", "shape". With area sample: the record page\'s "source" (mic, line in, usb), "gain", "threshold", and on a drum track "even slices" or "transient slices" (value: how many; key: the key whose sample is cut; the slices land on the keys from F3). With area com: "multi-out", "bluetooth advertising", "charging". With area project: a project setting ("time signature", "transpose", "autosave"…) or "save" and "save as" (no value: M2 on the project page, or shift + M2 and M1 under the name it offers). Without page, the page that shows it.'
		),
	value: settingValue
		.optional()
		.describe(
			'The value to set: a number as the screen shows it (0–99 for most, bpm for tempo) or the text the screen shows ("1/16", "danish", "mono"). Leave it out to go to where param is set, changing nothing ("take me to the swing")'
		),
	key: samplerKey
		.optional()
		.describe(
			'A sampler track\'s key: whose settings param sets on a drum track (its name "G3", its sample\'s such as "snare 1", or 1–24; default: the key selected last), the multisampler zone of that key, or the drum key whose sample "even slices" cuts'
		),
	step: z
		.int()
		.min(1)
		.max(64)
		.optional()
		.describe(
			"A parameter lock: the pattern step whose own value param sets (its step key held while the encoder turns), the track's value kept; on the bar the step keys show, bar tapped to reach another"
		),
	settings: z
		.array(
			z.object({
				param: z.string().min(1).max(60).describe('As for param'),
				value: settingValue.describe('As for value'),
				track: z.int().min(1).max(16).optional().describe('Default: the track given above'),
				area: settingArea.optional().describe('Default: the area given above'),
				page: z.int().min(1).max(4).optional().describe('As for page'),
				key: samplerKey.optional().describe('As for key'),
				step: z.int().min(1).max(64).optional().describe('As for step')
			})
		)
		.min(1)
		.max(16)
		.optional()
		.describe(
			"Several settings in one go, in order, instead of param and value: each is planned from where the ones before leave the device. Use it to set up a sound from an idea (a pluck: amp decay, sustain, release, resonance; a sidechain duck: lfo type duck, duck source, lfo amount) or a recipe of several parts (a song from scenes: arrange scene 2, track 3's pattern 2, the song). Put a list pick or load (engine, preset, filter type, lfo type, a player's type) before the settings that depend on it, the engine or preset first of all (it resets the sound)."
		)
});

type GoalInput = z.infer<typeof goalInput>;

/** The navigator's goal for the tool input, or an error message. */
function toGoal(input: GoalInput, env: AgentEnvironment): NavGoal | string {
	const selected = env.virtual?.status().selectedTrack ?? 1;
	const track = input.track ?? selected;
	const { area, page, key, step } = input;
	if (input.settings !== undefined) {
		if (input.param !== undefined) return 'give either param and value or settings, not both';
		const goals: SettingGoal[] = [];
		for (const s of input.settings) {
			const spec = {
				param: s.param,
				value: s.value,
				area: s.area ?? area,
				track: s.track ?? input.track,
				page: s.page ?? page,
				key: s.key ?? key,
				step: s.step ?? step
			};
			const goal = settingGoal(spec, selected);
			if (typeof goal === 'string') return `${s.param}: ${goal}`;
			goals.push(goal);
		}
		return { settings: goals };
	}
	if (input.param !== undefined) {
		// no value: to where the parameter is set, changing nothing
		const spec = {
			param: input.param,
			value: input.value ?? '',
			area,
			track: input.track,
			page,
			key,
			step
		};
		const goal = settingGoal(spec, selected);
		if (typeof goal === 'string' || input.value !== undefined) return goal;
		return { to: goal };
	}
	const aux = track > 8 ? track - 8 : track;
	let place: Place;
	switch (area) {
		case 'instrument':
			if (track > 8) return 'instrument tracks are 1–8';
			place = { area: 'instrument', track, page: (page ?? 1) as 1 | 2 | 3 | 4 };
			break;
		case 'auxiliary':
			place = { area: 'auxiliary', track: aux, page: (page ?? 1) as 1 | 2 | 3 | 4 };
			break;
		case 'mix':
			place = { area: 'mix', page: (page ?? 1) as 1 | 2 | 3 | 4 };
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
		case 'sample':
			if (track > 8) return 'sampling is on instrument tracks 1–8';
			place = { area: 'sample', track };
			break;
		case 'com':
			place = { area: 'com' };
			break;
		case 'bar':
			return 'the bar menu shows while bar is held: give a param (track scale, bars, quant, length, groove, shape) and a value';
		case 'project':
			return 'the project settings are a list: give a param (signature, transpose, auto save, scene length, groove type, or a track\'s voices such as "track 3") and a value';
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

/** A setting's track, or none where it belongs to no track (the tempo page, com, the project). */
function trackOf(goal: SettingGoal): number | undefined {
	if ('area' in goal)
		return goal.area === 'com' || goal.area === 'project' ? undefined : goal.track;
	const id = findParam(goal.param);
	return id !== null && TEMPO_PARAMS[id] ? undefined : goal.track;
}

/** The plan as the model reads it; several settings come grouped by the parameter they set. */
function planView(plan: NavPlan | SettingsPlan) {
	// in a batch, what did not land, up front (an agent once had to read every entry to find it)
	const failed =
		'parts' in plan
			? plan.parts
					.filter((p) => !p.reached)
					.map((p) => {
						const name = 'label' in p.goal ? p.goal.label : p.goal.param;
						const t = trackOf(p.goal);
						const track = t !== undefined ? `track ${t} ` : '';
						return `${track}${name} ${p.goal.value}${p.note ? `: ${p.note}` : ''}`;
					})
			: [];
	return {
		reached: plan.reached,
		...(failed.length > 0 ? { failed, landed: 'every other setting' } : {}),
		...('parts' in plan
			? {
					settings: plan.parts.map((p) => ({
						param: 'label' in p.goal ? p.goal.label : p.goal.param,
						...('area' in p.goal ? { area: p.goal.area } : {}),
						value: p.goal.value,
						...(trackOf(p.goal) !== undefined ? { track: trackOf(p.goal) } : {}),
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

/** The walkthrough's goal in a few words, for its card ("track 3 cutoff 40", "mix M2"). */
function goalText(input: GoalInput): string {
	const track = input.track !== undefined ? `track ${input.track} ` : '';
	if (input.settings)
		return `${track}${input.settings.map((s) => `${s.param} ${s.value}`).join(', ')}`;
	if (input.param !== undefined) return `${track}${input.param} ${input.value ?? ''}`.trim();
	const page = input.page !== undefined ? ` M${input.page}` : '';
	return `${track}${input.area ?? ''}${page}`.trim();
}

/** Longest a turn's animation runs, however many detents it has. */
const TURN_MS = 1800;

export const planStepsTool = defineTool({
	name: 'plan_steps',
	label: 'plan steps',
	kind: 'ui',
	// its optional goal fields would push the strict grammar over the API's size limit
	strict: false,
	description:
		'The exact steps from where the replica stands now to a page ("the filter page of track 3", "mix M2", "the tempo page", "track 4\'s player") or to a parameter set to a value ("track 3 cutoff 40", "tempo 128", "amp release 60", the project setting "time signature 7/8"), tried on a copy of the simulator first so they are known to work. Each step is a key combo in the key grammar; turns carry the number of detents and the direction; each step says what the screen shows after it. Use it for every "how do I get to / set …" question instead of working the keys out yourself. With show, it also animates the steps on the replica (it ends up there, as if the user had pressed the keys); nothing is sent to a connected device.',
	input: goalInput,
	async run(input, ctx) {
		const virtual = ctx.env.virtual;
		if (!virtual)
			return errorResult('There is no replica to plan from in this session.', 'no replica');
		const goal = toGoal(input, ctx.env);
		if (typeof goal === 'string') return errorResult(goal, 'bad goal');
		// where the plan starts: a plan with no track key once read as "track 3 is selected" unseen
		const status = virtual.status();
		const selected = status.tracks.find((t) => t.track === status.selectedTrack);
		const shows = ctx.env.screen?.read().shows;
		const from = `track ${status.selectedTrack}${selected ? ` (${selected.engine})` : ''} selected${shows ? `, the screen on ${shows}` : ''}`;
		const plan = virtual.plan(goal);
		if (input.guide && !input.show) {
			const guide = ctx.env.guide;
			// to a value with none given ("walk me through the cutoff"): a last step, the turn, done
			// once the value it turns has changed (the walkthrough once ended a step short of it)
			const turn = /^E([1-4])( with shift held)? turns it/.exec(plan.note ?? '');
			const steps = [
				...plan.steps,
				...(turn
					? [
							{
								keys: `${turn[2] ? 'shift + ' : ''}turn E${turn[1]}`,
								screen: plan.screen,
								leave: plan.screen
							}
						]
					: [])
			];
			if (!guide || steps.length === 0) {
				return jsonResult(
					{
						guided: false,
						...planView(plan),
						reason: !guide
							? 'No replica walkthrough in this view.'
							: plan.reached
								? 'Nothing to do: already there.'
								: 'No steps: the goal was not found (see note).'
					},
					summaryOf(plan)
				);
			}
			guide.start(goalText(input), steps);
			return jsonResult(
				{
					guided: true,
					from,
					...planView(plan),
					...(turn
						? {
								steps: [
									...plan.steps.map(stepView),
									{ keys: steps.at(-1)!.keys, until: 'the value changes' }
								]
							}
						: {}),
					// its own key: the plan's note ("E1 turns it") once took this one's place
					walkthrough:
						'The keys are lit on the replica now, one step at a time, and it waits for the user: tell them to follow the lit keys. It moves on by itself when the screen shows where a step leads, and tells you when the last is done.'
				},
				`guiding: ${summaryOf(plan)}`
			);
		}
		if (!input.show) {
			// a plan with values changes nothing: said in the result, so no answer claims it was set
			const setsValues = input.settings !== undefined || input.value !== undefined;
			return jsonResult(
				{
					// first, so it is not read past (an agent took a plan for the groove as set)
					...(setsValues
						? {
								planned:
									'NOT SET: only planned, the replica is unchanged (reached and screen say where the steps would lead). The same call with show true sets it on the replica.',
								changed: false
							}
						: {}),
					from,
					...planView(plan)
				},
				setsValues ? `planned only: ${summaryOf(plan)}` : summaryOf(plan)
			);
		}
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
		ctx.env.guide?.stop();
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
		// a save as leaves nothing a second plan reads as done: done when it can still be done
		const arrived =
			'settings' in goal
				? after.steps.length === 0
				: after.reached && (after.steps.length === 0 || plan.action === true);
		return jsonResult({ shown: true, arrived, ...planView(plan) }, `shown: ${summaryOf(plan)}`);
	}
});

/** The step-by-step tools. */
export const NAVIGATE_TOOLS = [planStepsTool];
