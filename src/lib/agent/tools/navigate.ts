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
	goalName,
	TEMPO_PARAMS,
	type NavPlan,
	type NavStep,
	type Place,
	type SettingGoal,
	type SettingsPlan
} from '$lib/sim/navigator';
import { BAR } from '$lib/sim/areas/arrange/model';
import { grooveReachAll } from '../groove-reach';
import { compoundPulse } from '../pattern-reading';
import { lockReach } from '../lock-reach';
import { slidesNote } from '../slides';
import { swellNote, swellsNow, tailNote, tailsNow } from '../swell';
import { stageSetting } from '$lib/sound/times';
import type { TimeSignature } from '$lib/sim/areas/arrange/state';
import { SETTING_AREAS, settingGoal, type SettingArea } from '$lib/sim/settings';
import { DEFAULT_TRACK_PRESETS, factoryPresets } from '$lib/sim/areas/system/catalogue';
import { presetKey } from '$lib/sim/areas/system/presets';
import type { NavGoal } from '../virtual-opxy';
import { defineTool, errorResult, jsonResult, type AgentEnvironment } from './define';

/**
 * The factory presets the replica knows by name only: it plays them as their engine's starting
 * sound, all but a new project's eight (catalogue.ts). An agent loading "bass/sonorous" for a
 * rounder bass would otherwise describe a sound the replica never had.
 */
const NAMED_ONLY = new Set(
	factoryPresets()
		.map(presetKey)
		.filter((key) => !DEFAULT_TRACK_PRESETS.includes(key))
);

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
			'true: play the steps on the replica as the user watches, which sets the value and leaves it set (when the user asks you to do it or set it up); a how-to question that should leave their replica as it was takes show_on_replica (a demo, put back after) or guide instead; false: only plan'
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
			'To set a parameter of an instrument track: its name as the page shows it or a common word ("cutoff", "resonance", "amp release", "filter attack" (an envelope stage takes a time too, "2 s" or "300 ms": the nearest value is set and said), "portamento", "fx ii send", "lfo amount", "lfo speed" (a number is a free speed, 0–99; synced to the tempo: "sync N", a cycle of N sixteenths, N one of 1–8, 12, 16, 24, 32, or as a note value, "1/8" (sync 2), "1/4", "1 bar", "2 bars"; no triplets: sync 3 is a dotted eighth), "tempo", "groove" (the tempo page\'s groove type by name, shuffle, half shuffle, danish…; "swing" is its amount, −99 … 99; shuffle moves only the even sixteenths, steps 2, 4, 6…: hits on the eighths stay straight, so put hats between them for it to be heard; the other types move other steps, and the result says which notes moved), "metronome" (on or off; a number is its level, and 0 is silent with it still on), an engine parameter by the name its M1 page shows (read_sound gives each engine\'s, such as "shape" or "detune")), "filter" and "lfo" (on, off: their page key pressed again switches them), a list or a load ("engine", "preset", "filter type", "lfo type": value is the name, e.g. "wavetable", "pluck/beach bum", "ladder", "duck"; a folder alone, "bass", lists its presets; an engine or preset is loaded from the preset browser shift + M1 brings up, which replaces the whole sound; the replica lists the external midi engine last, which OS 1.1.33 does not show), the duck LFO\'s "duck source" (the triggering track 1–16, or "metronome") and "source type" (audio, notes), the value and random LFOs\' "lfo destination" (syn, env, filter, or their free twins "syn free"…; a new project’s is syn, so name it) and "lfo parameter" (the destination page\'s encoder 1–4, or by name: cutoff, resonance, env amount, key tracking; attack, decay, sustain, release), a sampler track\'s own values with key naming the key ("tune", "start", "end", "play mode" (key, oneshot, mute group, loop), "direction", "pan", "fade", "gain" of a drum key; "start", "loop start", "loop end", "end", "tune", "loop crossfade", "gain", "loop type" of the synth sampler or a multisampler zone), any value a page of the track shows (the midi engine\'s "channel", "bank", "cc slot 1", "cc slot 1 number"), or an id ("filter.cutoff"); "sound from" copies another track\'s whole sound onto this one (value: that track, 1–8; its notes and mixer strip stay); the preset settings (shift + instrument): "width" (stereo width), "high pass", "velocity sens", "portamento type", "tuning", "tuning root", "preset transpose" and the mod routing ("velocity target" cutoff with "velocity amount" for accents that open the filter; modwheel, aftertouch and pitchbend alike). With area auxiliary or mix: the value\'s name as read_screen shows it on that page ("size" or "feedback" on FX I/II and their "effect": chorus, delay, dist, lofi, phaser, reverb; "speed" on the tape; the brain\'s "mode" (auto, manual), "root", "scale", "link"; a routing page\'s "track 1"…"track 8" (the brain: in or out; tape, FX and external audio: the send level; tracks 5–8 are a click away, which the plan does); an LFO\'s "lfo speed", "lfo amount"; "drive" on external audio; on mix M1 a track\'s "level", "pan", "fx i", "fx ii", "mute" (the scene on screen\'s: each scene keeps its own mix, so with several scenes, write_arrangement\'s mix sets the others); "low", "mid", "high" on the master EQ, M2; "gain" and the rest on the saturator, M3; "master" on M4). With area player: "type" (arpeggio, hold, maestro), "player" (on, off), maestro\'s "chord" (its notes, "A3 C4 E4": stored with shift held on the keyboard, in the octave the keyboard plays) and the page\'s values (the arpeggio\'s "speed": 1/4, 1/8, 1/8t, 1/16, 1/16t, 1/32, 1/32t, 1/64; "pattern": up, down, up/down, up/repeat/down, random, play order; "range", "hold"; its shift layer "length", "style", "glide", "stereo"). With area arrange: "pattern" (the pattern the track plays; new ones are added as needed), "scene" (1–99; an empty one starts as a copy of the current), "song" (its scenes in order, e.g. "1 1 2 2") and "loop" (on, off). With area bar (the bar menu, bar held): "track scale" (1–8, 16, 1/2), "bars" (1–4), "quant", "length", "groove", "shape" (how a locked value moves to the next lock: 0 jumps at each, up to 99 glides all the way) (the pattern the track plays now; another pattern\'s, or its step locks: in one settings list, area arrange "pattern" to it, the settings, then "pattern" back, and every scene stays as it was). With area sample: the record page\'s "source" (mic, line in, usb), "gain", "threshold", and on a drum track "even slices" or "transient slices" (value: how many; key: the key whose sample is cut; the slices land on the keys from F3). With area com: "multi-out", "bluetooth advertising", "charging", and the system settings (com → M1): midi "clock", "notes" and "other" (in, out, both, off), "active channel" (notes on it play the selected track; 1 by default), "midi echo"; the keyboard\'s "velocity" (off, soft, hard), "detune notes", "detune cents"; "screen brightness", "led brightness", "auto save", "power off", "country", "sample preview"; the pitchbend\'s "left sensitivity" and "right sensitivity"; the date and time ("year" … "minute"). With area project: a project setting ("time signature", "transpose", "autosave"…; a track\'s midi channel, off in a new project, is "midi channel" with track) or "save", "save as" and "new project" (M2 on the project page; shift + M2 and M1, the value being the copy\'s name, typed on the naming screen, else the name it offers (a name the projects folder holds already is refused, never overwritten); hold M1: starting over with a new project\'s sounds and nothing written, the open one saved first; for "delete everything", "start over"), and "rename" (value: the new name, typed; a–z, 0–9, space, - # ( )). Without page, the page that shows it.'
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
	// detents, not clicks: a click of an encoder is a press (an agent read "clicks: 40" for a turn
	// and had to say which it meant)
	...(s.clicks !== undefined
		? {
				detents: Math.abs(s.clicks),
				direction: s.clicks > 0 ? 'clockwise' : 'counter-clockwise'
			}
		: {}),
	screen: s.screen
});

/** A setting's track, or none where it belongs to no track (the tempo page, com, the project). */
function trackOf(goal: SettingGoal): number | undefined {
	if ('area' in goal) {
		if (goal.area === 'com' || goal.area === 'project') return undefined;
		// an auxiliary track as the agent numbers it, 9–16 (FX I given as 15 read back as track 7)
		return goal.area === 'auxiliary' && goal.track !== undefined && goal.track <= 8
			? goal.track + 8
			: goal.track;
	}
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

/**
 * The preset settings a plan sets that the replica shows but its sound does not play: all but
 * velocity sensitivity, the one the browser's sound reads (sound/engine.ts). An agent widening a
 * pad would otherwise describe a change nobody can hear here.
 */
function unplayed(plan: NavPlan | SettingsPlan, goal: NavGoal): string | null {
	const nameOf = (g: NavGoal) => String('label' in g ? g.label : 'param' in g ? g.param : '');
	const parts =
		'parts' in plan
			? plan.parts.map((p) => ({ name: nameOf(p.goal), steps: p.steps }))
			: [{ name: nameOf(goal), steps: plan.steps }];
	const names = parts
		.filter(
			(p) =>
				p.steps.some((s) => /^preset settings\b/.test(s.screen)) &&
				!/^velocity( sens(itivity)?)?$/i.test(p.name.trim())
		)
		.map((p) => p.name.trim());
	if (names.length === 0) return null;
	const one = names.length === 1;
	return `${[...new Set(names)].join(', ')}: the replica shows ${one ? 'it' : 'them'} on its preset settings page, but the browser's sound plays only velocity sensitivity of those settings. On the unit ${one ? 'it changes' : 'they change'} the sound: say what was set, not how it sounds now.`;
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
	async run(asked, ctx) {
		const virtual = ctx.env.virtual;
		if (!virtual)
			return errorResult('There is no replica to plan from in this session.', 'no replica');
		// the groove's type is a list of names, and a number is its amount (E3, swing), as the planner
		// reads it: planned as swing throughout, so a walkthrough to "groove 0" no longer lit E2
		const amount =
			asked.value !== undefined &&
			/^(groove|groove type)$/i.test((asked.param ?? '').trim()) &&
			/^[+\-−]?\d+(\.\d+)?$/.test(String(asked.value).trim());
		const grooved = amount ? { ...asked, param: 'swing' } : asked;
		// an envelope stage by its time ("amp attack", "2 s"): the nearest page value, said; by its page
		// value, the time it takes
		const timings: string[] = [];
		const timed = <T extends { param?: string; value?: string | number }>(s: T): T => {
			const read = s.param && s.value !== undefined ? stageSetting(s.param, s.value) : null;
			if (!read) return s;
			timings.push(read.line);
			return { ...s, value: read.value };
		};
		const input = {
			...timed(grooved),
			...(grooved.settings ? { settings: grooved.settings.map(timed) } : {})
		};
		const goal = toGoal(input, ctx.env);
		if (typeof goal === 'string') return errorResult(goal, 'bad goal');
		// where the plan starts: a plan with no track key once read as "track 3 is selected" unseen
		const status = virtual.status();
		const selected = status.tracks.find((t) => t.track === status.selectedTrack);
		const shows = ctx.env.screen?.read().shows;
		const from = `track ${status.selectedTrack}${selected ? ` (${selected.engine})` : ''} selected${shows ? `, the screen on ${shows}` : ''}`;
		let plan = virtual.plan(goal);
		// a value already set: its plan goes only to its page, the keys the way there takes with no
		// value (tempo 120 on a new project lit the tempo key, and nothing said it was 120 already; an
		// agent asked to teach a send it had just set got "nothing to do" and no keys to light)
		const what = amount ? 'swing (the groove amount, E3)' : (input.param ?? 'the value');
		let already: string | null = null;
		// an action (a save as) does something each time, so it is never set already
		if (!('settings' in goal) && plan.reached && !plan.action && input.value !== undefined) {
			const there = toGoal({ ...input, value: undefined }, ctx.env);
			const path = typeof there === 'string' ? null : virtual.plan(there);
			const same =
				path !== null &&
				path.steps.length === plan.steps.length &&
				path.steps.every(
					(s, i) => s.keys === plan.steps[i].keys && (s.clicks ?? 0) === (plan.steps[i].clicks ?? 0)
				);
			if (path && same && (path.steps.length > 0 || /turns it/.test(path.note ?? ''))) {
				already = `${what} is already ${input.value}`;
				if (input.guide && !input.show) plan = path;
			}
		}
		// a step lock: its keys follow the playhead from bar to bar while the replica plays (and one
		// planned with no value, to where it is made, is one too)
		const stepped = (
			'settings' in goal ? goal.settings : 'to' in goal ? [goal.to] : 'place' in goal ? [] : [goal]
		).flatMap((g) =>
			'step' in g && g.step !== undefined
				? [{ track: g.track ?? status.selectedTrack, step: g.step }]
				: []
		);
		const locking = stepped.length > 0;
		// a lock on a step with no note plays nothing (an agent taught one on step 5 of a bass whose
		// notes skip it, and the user locked a silent step)
		const silent = stepped.filter(
			({ track, step }) =>
				track <= 8 && !virtual.readPattern(track).notes.some((n) => n.step === step)
		);
		const silentText =
			silent.length > 0
				? `${silent.map(({ track, step }) => `step ${step} of T${track}`).join(', ')} holds no note, so a lock there plays nothing; the notes start on steps ${[...new Set(virtual.readPattern(silent[0].track).notes.map((n) => n.step))].slice(0, 16).join(', ') || '(none yet)'}.`
				: null;
		if (input.guide && !input.show) {
			const guide = ctx.env.guide;
			// a lock while the replica plays: stop first, lit, as the step keys follow the playhead,
			// and the rest planned from where the stop leaves them (a user told to stop followed the
			// lit keys alone, and the lock landed a bar late; then a bar tap planned while it played
			// moved the stopped keys off the step's bar)
			const stopFirst =
				locking && virtual.status().playing ? virtual.rehearse('stop').slice(0, 1) : [];
			if (stopFirst.length) plan = virtual.planAfter(stopFirst, goal);
			const alreadyText = already
				? `${already}: say so. The walkthrough lights the way to its page and the encoder, for the user to learn the keys and try it (turning it changes the value).`
				: null;
			// to a value with none given ("walk me through the cutoff"): a last step, the turn, done
			// once the value it turns has changed (the walkthrough once ended a step short of it)
			// with a step's own value, that step held while it turns
			const turn = /^(?:(step \d+) held, )?E([1-4])( with shift held)? turns it/.exec(
				plan.note ?? ''
			);
			const steps = [
				...stopFirst,
				...plan.steps,
				...(turn
					? [
							{
								keys: `${turn[1] ? `${turn[1]} + ` : ''}${turn[3] ? 'shift + ' : ''}turn E${turn[2]}`,
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
					...(timings.length ? { times: timings.join('; ') } : {}),
					...(alreadyText ? { already: alreadyText } : {}),
					...(unplayed(plan, goal) ? { unheard: unplayed(plan, goal) } : {}),
					...planView(plan),
					...(turn || stopFirst.length
						? {
								steps: [
									...stopFirst.map((s) => ({ keys: s.keys, screen: s.screen })),
									...plan.steps.map(stepView),
									...(turn ? [{ keys: steps.at(-1)!.keys, until: 'the value changes' }] : [])
								]
							}
						: {}),
					...(stopFirst.length
						? {
								caution:
									'The replica is playing, and its step keys follow the playhead from bar to bar, so the walkthrough lights stop first: the lock lands on its step once the replica is stopped.'
							}
						: {}),
					...(silentText ? { silent: silentText } : {}),
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
					...(already
						? { already: `${already}: the steps only go to its page; nothing needs turning.` }
						: {}),
					...(timings.length ? { times: timings.join('; ') } : {}),
					// first, so it is not read past (an agent took a plan for the groove as set)
					...(setsValues && !already
						? {
								planned:
									'NOT SET: only planned, the replica is unchanged (reached and screen say where the steps would lead). The same call with show true sets it on the replica.',
								changed: false
							}
						: {}),
					from,
					...planView(plan),
					...(silentText ? { silent: silentText } : {})
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
		// which tracks had their filter off before the show, for the note on filter values below
		const filterWasOff = new Set(
			[1, 2, 3, 4, 5, 6, 7, 8].filter((t) =>
				/\bfilter off\b/.test(virtual.readSound(t).pages['M3 filter'] ?? '')
			)
		);
		// step locks while the replica plays: the step keys follow the playhead from bar to bar, so
		// a plan made a moment before lands a bar off (an agent's four cutoff locks each went a bar
		// early). At the first lock's bar tap or held step, the lock's track selected by then, a bar
		// tap pins the keys, as picking a bar during playback does on the device, and the rest is
		// planned again from there (a tap on another track's one-bar pattern pinned nothing)
		const holdsStep = (keys: string) => /^step \d+ \+/.test(keys);
		// what the steps leave, played on a copy: a list that goes to a setting and back (a pattern
		// switched to for its bar menu, then switched back) never plans again as done, so it has
		// landed when the replica holds what the copy did (an agent's smoothing on a song's second
		// pattern read as missed, every step of it shown)
		const expected = 'settings' in goal ? virtual.played(plan.steps) : null;
		let pinned = false;
		let shown = plan.steps;
		for (let i = 0; i < shown.length; i++) {
			if (ctx.signal.aborted) break;
			const step = shown[i];
			if (
				locking &&
				!pinned &&
				(step.keys === 'bar' || holdsStep(step.keys)) &&
				virtual.status().playing
			) {
				pinned = true;
				await replica.animate('bar').done;
				// the rest from where the replica stands now; the result keeps the whole plan
				shown = virtual.plan(goal).steps;
				i = -1;
				continue;
			}
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
				? after.steps.length === 0 ||
					(expected !== null && virtual.changesSince(expected).length === 0)
				: after.reached && (after.steps.length === 0 || plan.action === true);
		// which settings do not read their value on the replica now, named (an agent took each
		// setting's reached for landed, with arrived false beside it)
		const missed =
			!arrived && 'parts' in after
				? after.parts
						.filter((p) => p.steps.length > 0)
						.map((p) => {
							const g = p.goal as {
								param?: string;
								label?: string;
								value?: unknown;
								step?: number;
							};
							return `${g.label ?? g.param ?? '?'} ${String(g.value ?? '')}${g.step !== undefined ? ` on step ${g.step}` : ''}`.trim();
						})
				: [];
		// a new time signature regroups the bars and leaves the patterns' steps as they were (an
		// agent turning a song into a waltz could not tell whether its patterns had been reflowed)
		const signature = virtual.status().signature;
		const steps = BAR[signature as TimeSignature];
		const meter =
			signature !== status.signature && steps
				? `The time signature is ${signature} now, a bar ${steps} steps: the patterns keep their steps (a 64-step pattern runs ${Math.round((64 / steps) * 100) / 100} bars of it), so write them again in its bars; write_pattern's default length follows the meter.${compoundPulse(signature)}`
				: null;
		// a groove that hardly reaches the notes (shuffle moves the even sixteenths): said where it
		// is set, not only when a pattern is written
		const params =
			'settings' in goal
				? goal.settings.map(goalName)
				: 'to' in goal
					? [goalName(goal.to)]
					: 'place' in goal
						? []
						: [goalName(goal)];
		// confirmed on every track, not only warned: an agent could not tell which groove type it had
		const reach = params.some((p) => /groove|swing|shuffle/i.test(p))
			? grooveReachAll(virtual, true)
			: [];
		// a lock on a drum track's step reaches every sound on it (an agent locked a send on the
		// snare's steps and said the hats stayed dry)
		const goals = 'settings' in goal ? goal.settings : 'param' in goal ? [goal] : [];
		const locked = new Map<number, number[]>();
		for (const g of goals) {
			if (!('step' in g) || g.step === undefined) continue;
			const track = g.track ?? status.selectedTrack;
			locked.set(track, [...(locked.get(track) ?? []), g.step]);
		}
		const shared = [...locked].flatMap(([track, steps]) => {
			const line = lockReach(virtual, track, steps);
			return line ? [line] : [];
		});
		// where a track's notes slide once its play mode or portamento is set (an agent set legato
		// and portamento for an acid line whose notes only touched, and said they slid)
		const gliding = new Set(
			goals.flatMap((g) =>
				'param' in g && /play mode|portamento|glide/i.test(String(g.param))
					? [g.track ?? status.selectedTrack]
					: []
			)
		);
		const slides = [...gliding].flatMap((track) => {
			if (track < 1 || track > 8) return [];
			const page = virtual.readSound(track).pages['shift M2 play mode'] ?? '';
			const line = slidesNote(track, page, virtual.readPattern(track).notes);
			return line ? [line] : [];
		});
		// a slow amp attack set where the notes end before it (a swell its chords never finish)
		const attacked = new Set(
			goals.flatMap((g) =>
				'param' in g && /^(amp )?attack$/i.test(String(g.param).trim())
					? [g.track ?? status.selectedTrack]
					: []
			)
		);
		// a tempo set moves every track's notes against its attack
		const tempoSet = goals.some(
			(g) => 'param' in g && /^(tempo|bpm|tempo\.bpm)$/i.test(String(g.param).trim())
		);
		const swellsByTempo = tempoSet ? swellsNow(virtual) : [];
		const swellsByAttack = [...attacked].flatMap((track) => {
			if (track < 1 || track > 8) return [];
			const p = virtual.readPattern(track);
			const line = swellNote(
				track,
				virtual.readSound(track).pages['M2 amp envelope'] ?? '',
				p.notes,
				p.scale,
				virtual.status().bpm
			);
			return line ? [line] : [];
		});
		const swells = [...new Set([...swellsByAttack, ...swellsByTempo])];
		// a synced LFO speed as a note value and a rate (an agent set "1/8", read back "sync 2", and
		// could not tell what it was: the screen's own count reads otherwise)
		const NOTE_VALUES: Readonly<Record<number, string>> = {
			1: 'a sixteenth',
			2: 'an eighth',
			3: 'a dotted eighth',
			4: 'a quarter note',
			5: 'five sixteenths',
			6: 'a dotted quarter',
			7: 'seven sixteenths',
			8: 'a half note',
			12: 'a dotted half',
			16: 'a bar',
			24: 'a bar and a half',
			32: 'two bars'
		};
		const rates = [
			...new Set(
				goals.flatMap((g) =>
					'param' in g && /^(lfo )?speed$/i.test(String(g.param).trim())
						? [g.track ?? status.selectedTrack]
						: []
				)
			)
		].flatMap((track) => {
			if (track < 1 || track > 8) return [];
			const m = /\bspeed sync (\d+)/.exec(virtual.readSound(track).pages['M4 lfo'] ?? '');
			if (!m) return [];
			const n = Number(m[1]);
			const bpm = virtual.status().bpm;
			const perSecond = Math.round(((bpm / 60) * 4 * 100) / n) / 100;
			return [
				`T${track}'s LFO is synced at sync ${n}: a cycle every ${n} sixteenth${n === 1 ? '' : 's'}${NOTE_VALUES[n] ? ` (${NOTE_VALUES[n]})` : ''}, ${perSecond} a second at ${bpm} bpm.`
			];
		});
		// a filter value set while the filter is off does nothing until it is on (an agent darkening
		// a track found the filter off only by reading the sound first)
		const filtered = new Set(
			goals.flatMap((g) =>
				'param' in g &&
				/^(filter )?(cutoff|resonance|env(elope)? amount|key tracking)$/i.test(
					String(g.param).trim()
				)
					? [g.track ?? status.selectedTrack]
					: []
			)
		);
		const filterOff = [...filtered].flatMap((track) => {
			if (track < 1 || track > 8) return [];
			const off = /\bfilter off\b/.test(virtual.readSound(track).pages['M3 filter'] ?? '');
			if (off) {
				return [
					`T${track}'s filter is off, so its values do nothing until it is on: plan_steps param "filter", value on (its page key pressed again switches it).`
				];
			}
			// which filter: a highpass switched on thins the sound (an agent darkening an epiano's
			// chords turned on the preset's highpass and only saw it in the screen text)
			const page = virtual.readSound(track).pages['M3 filter'] ?? '';
			const type = /^(.*?) filter\b/.exec(page)?.[1]?.trim() ?? 'its';
			const high = /hi\s?pass|high\s?pass|\bhp\b/i.test(type)
				? ` It is a highpass: raising its cutoff takes away the lows and thins the sound; to darken it, set a lowpass type first (filter type, such as ladder).`
				: '';
			return filterWasOff.has(track)
				? [
						`T${track}'s ${type} filter was off, so the steps switched it on first (M3 pressed again on its page): say so, since a filter that is off does nothing whatever its cutoff.${high}`
					]
				: [];
		});
		// a duck whose source track plays more than its kick dips on every one of its hits (an agent
		// ducked a pad from a kit with hats and only the skill said so)
		const ducks = goals.flatMap((g) => {
			if (!('param' in g) || !/^duck source$/i.test(String(g.param).trim())) return [];
			const source = Number(g.value);
			if (!Number.isInteger(source) || source < 1 || source > 8) return [];
			const sounds = [
				...new Set(virtual.readPattern(source).notes.flatMap((n) => (n.sound ? [n.sound] : [])))
			];
			const others = sounds.filter((name) => !/^kick\b/.test(name));
			if (others.length === 0 || others.length === sounds.length) return [];
			return [
				`T${source}, the duck's source, plays ${others.join(', ')} besides its kick: the ducked track dips on all of their hits, not the kick's alone. For the kick alone, give it a track of its own and duck from that, or duck from the metronome for every beat.`
			];
		});
		// and a long release set under chords that change, each ringing on under the next
		const released = new Set(
			goals.flatMap((g) =>
				'param' in g && /^(amp )?release$/i.test(String(g.param).trim())
					? [g.track ?? status.selectedTrack]
					: []
			)
		);
		const tailsByRelease = [...released].flatMap((track) => {
			if (track < 1 || track > 8) return [];
			const p = virtual.readPattern(track);
			const line = tailNote(
				track,
				virtual.readSound(track).pages['M2 amp envelope'] ?? '',
				p.notes,
				p.scale,
				virtual.status().bpm
			);
			return line ? [line] : [];
		});
		// an FX's effect swapped reaches every track that sends to it (an agent swapped FX II's reverb
		// for a lofi, unsure who else sent there)
		const swapped = goals.flatMap((g) => {
			const name = 'label' in g ? g.label : 'param' in g ? g.param : '';
			const track = 'track' in g ? g.track : undefined;
			return /^effect$/i.test(String(name).trim()) &&
				'area' in g &&
				g.area === 'auxiliary' &&
				(track === 15 || track === 16 || track === 7 || track === 8)
				? [track === 15 || track === 7 ? 'I' : 'II']
				: [];
		});
		const fxShared = [...new Set(swapped)].map((fx) => {
			const sends = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((t) => {
				const m = new RegExp(`\\bfx ${fx} (\\d+)`).exec(
					virtual.readSound(t).pages['shift M3 sends'] ?? ''
				);
				const level = m ? Number(m[1]) : 0;
				return level > 0 ? [`T${t} ${level}`] : [];
			});
			const effect = /^(\w+):/.exec(virtual.readSound(1).fx?.[`FX ${fx}` as 'FX I'] ?? '')?.[1];
			return sends.length
				? `FX ${fx}'s effect is every track's: ${sends.join(', ')} send${sends.length === 1 ? 's' : ''} to it${effect ? `, through the ${effect} now` : ''}; the rest send nothing.`
				: `No track sends to FX ${fx} yet: give one its fx ${fx} send to hear it.`;
		});
		// a tempo set leaves every release as long in seconds
		const tails = [...new Set([...tailsByRelease, ...(tempoSet ? tailsNow(virtual) : [])])];
		// a sound loaded (an engine, a preset, another track's) sets every page anew: its pages as
		// they read now, after the settings that followed (an agent loading axis for a pad never saw
		// that the load had brought its own filter and envelopes)
		const loads = new Set(
			goals.flatMap((g) =>
				'param' in g && /^(engine|preset|sound from)$/i.test(String(g.param).trim())
					? [g.track ?? status.selectedTrack]
					: []
			)
		);
		const loaded = [...loads]
			.filter((track) => track >= 1 && track <= 8)
			.map((track) => {
				const sound = virtual.readSound(track);
				return { track, preset: sound.preset, pages: sound.pages };
			});
		// the midi engine, which OS 1.1.33's preset browser did not list (an agent told the user a
		// track "is now on the midi engine" and only remembered that afterwards)
		const midi = loaded.some((l) => l.pages['M1 engine']?.startsWith('midi:'))
			? 'The replica lists the midi engine, but the preset browser on OS 1.1.33 showed none: on the unit, the external MIDI track (auxiliary T3, its channel on M1) is the sure way, so say so.'
			: null;
		// a load that changes how the track plays its notes (a mono bassline's sound swapped for a
		// poly one: its overlaps now sound together, and the agent had no check of it)
		const modes = loaded.flatMap((l) => {
			const was = status.tracks.find((t) => t.track === l.track)?.playMode;
			const now = virtual.status().tracks.find((t) => t.track === l.track)?.playMode;
			if (!was || !now || was === now) return [];
			const mono = (m: string) => m !== 'poly';
			const what = !mono(now)
				? 'notes that overlap sound together now, with no glide between them'
				: !mono(was)
					? 'a chord sounds one note at a time now'
					: now === 'legato'
						? 'overlapping notes now join without a new attack'
						: 'each note now starts its envelope anew';
			return [`T${l.track} plays ${now} now (it was ${was}): ${what}.`];
		});
		// a sound shaped on a track with notes, not heard since (agents set a reese bass or a radio
		// tone by numbers and said afterwards they never listened): the cheap way to hear it alone
		const shaped = [
			...new Set(
				goals.flatMap((g) =>
					'param' in g &&
					!('step' in g && g.step !== undefined) &&
					(!('area' in g) || g.area === undefined || g.area === 'instrument') &&
					!/^(tempo|bpm|tempo\.bpm|groove|swing|metronome)$/i.test(String(g.param).trim())
						? [g.track ?? status.selectedTrack]
						: []
				)
			)
		].filter((t) => t >= 1 && t <= 8 && virtual.readPattern(t).notes.length > 0);
		const hear = shaped.length
			? `Not heard since: listen with scene ${virtual.readArrangement().scene} and tracks [${shaped.join(', ')}] hears ${shaped.length === 1 ? `T${shaped[0]}` : 'each'} alone, offline, before you say how it sounds.`
			: null;
		const namedOnly = loaded.flatMap((l) => (l.preset && NAMED_ONLY.has(l.preset) ? [l] : []));
		const standIn = namedOnly.length
			? `${namedOnly.map((l) => `T${l.track} ${l.preset}`).join(', ')}: the replica knows TE's factory presets by name, not by sound (all but a new project's eight), so it plays ${namedOnly.length === 1 ? 'it' : 'them'} as the engine's starting sound, which loaded reads. On the unit it is TE's own preset: say what was loaded, not how it sounds, and let the user hear it there.`
			: null;
		return jsonResult(
			{
				shown: true,
				arrived,
				...(pinned
					? {
							pinned:
								'The replica was playing, so a bar tap first pinned the step keys (while it plays they follow the playhead from bar to bar); on the unit, stop first, or tap bar to pick the bar, before holding a step.'
						}
					: {}),
				...(missed.length
					? {
							missed: `NOT ON THE REPLICA NOW: ${missed.join('; ')}. Their plans above were made on a copy; plan them again (show) and check before you answer.`
						}
					: {}),
				...(timings.length ? { times: timings.join('; ') } : {}),
				...(already
					? { already: `${already}: the steps only went to its page; nothing was turned.` }
					: {}),
				...planView(plan),
				...(meter ? { meter } : {}),
				...(reach.length ? { groove: reach.join(' ') } : {}),
				...(shared.length ? { locks: shared.join(' ') } : {}),
				...(slides.length ? { slides: slides.join(' ') } : {}),
				...(swells.length ? { swell: swells.join(' ') } : {}),
				...(tails.length ? { tail: tails.join(' ') } : {}),
				...(fxShared.length ? { fx: fxShared.join(' ') } : {}),
				...(ducks.length ? { duck: ducks.join(' ') } : {}),
				...(filterOff.length ? { filterOff: filterOff.join(' ') } : {}),
				...(rates.length ? { lfoRate: rates.join(' ') } : {}),
				...(midi ? { unit: midi } : {}),
				...(standIn ? { standIn } : {}),
				...(modes.length ? { playMode: modes.join(' ') } : {}),
				...(silentText ? { silent: silentText } : {}),
				...(unplayed(plan, goal) ? { unheard: unplayed(plan, goal) } : {}),
				...(hear && !unplayed(plan, goal) ? { hear } : {}),
				...(loaded.length
					? {
							loaded: loaded.length === 1 ? loaded[0] : loaded,
							sound:
								'A load sets every page anew: loaded reads them as they are now, after the settings that followed it.'
						}
					: {})
			},
			`shown: ${summaryOf(plan)}`
		);
	}
});

/** The step-by-step tools. */
export const NAVIGATE_TOOLS = [planStepsTool];
