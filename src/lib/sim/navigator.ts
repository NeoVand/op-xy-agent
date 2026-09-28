/**
 * The navigator (Phase F4): exact steps from where the simulator is to a page, or to a parameter
 * set to a value, as key combos in the manual's key grammar (`T3`, `shift + M3`, `turn E2`) with
 * the number of detents for turns. Every plan is run on a copy of the simulator before it is
 * returned, so the steps are the ones that work, not a guess; the agent shows them on the replica
 * or reads them out, and the screen after each step tells the user what to look for.
 *
 * Planning is deterministic: leave whatever is open with the target's mode key, pick the track, the
 * M-page and the envelope, then turn the encoder that carries the parameter there (found from the
 * lock registry, which mirrors the core's turns) one detent at a time until it reads the value.
 */
import { OpxySim } from './opxy-sim.svelte';
import { buildFrame } from './frames';
import { lockTarget, lockParam, type LockParam } from './areas/sequencer/locks';
import { currentGroup, groups } from './areas/system/presets';
import {
	FILTER_TYPES,
	GROOVES,
	LFO_TYPES,
	TEMPO_RANGE,
	engineParams,
	type PageNumber,
	type SimState,
	type TrackState
} from './params';
import { describeFrame } from './screen/render';

/** A place on the device. Tracks are numbered as printed: 1–8 in each set. */
export type Place =
	| {
			readonly area: 'instrument';
			readonly track: number;
			readonly page: PageNumber;
			/** Shift held: the page's shift layer (play mode on M2, sends on M3, …). */
			readonly shift?: boolean;
			/** On M2: which envelope the encoders edit. */
			readonly envelope?: 'amp' | 'filter';
	  }
	| { readonly area: 'auxiliary'; readonly track: number; readonly page: PageNumber }
	| { readonly area: 'mix'; readonly page: PageNumber }
	| { readonly area: 'arrange' }
	| { readonly area: 'tempo' }
	| { readonly area: 'player'; readonly track: number; readonly shift?: boolean };

/** One step: a key combo, and for a turn the detents (+ clockwise, − counter-clockwise). */
export interface NavStep {
	readonly keys: string;
	readonly clicks?: number;
	/** What the screen shows after the step. */
	readonly screen: string;
}

/** A plan and whether running it reached the goal. */
export interface NavPlan {
	readonly steps: readonly NavStep[];
	readonly reached: boolean;
	/** The screen at the end. */
	readonly screen: string;
	/** Why the goal was not reached, or a note on the result. */
	readonly note?: string;
}

/** A parameter goal: `value` as a number in the parameter's own units, or as the screen shows it. */
export interface ParamGoal {
	/** Instrument track 1–8 (ignored for tempo parameters). */
	readonly track?: number;
	/** A parameter id (`filter.cutoff`, `amp.release`, `tempo.bpm`) or name (see {@link PARAMS}). */
	readonly param: string;
	readonly value: number | string;
}

/** One goal of a {@link SettingsPlan}: its steps and whether they reached it. */
export interface SettingPart {
	readonly goal: ParamGoal;
	readonly steps: readonly NavStep[];
	readonly reached: boolean;
	readonly note?: string;
}

/** Several parameters set in a row, each planned from where the one before left the device. */
export interface SettingsPlan extends NavPlan {
	readonly parts: readonly SettingPart[];
}

/** A settable parameter: where it lives and how it reads. */
export interface ParamInfo {
	readonly id: string;
	/** Words a person might use for it. */
	readonly names: readonly string[];
	readonly page: string;
}

/** A tempo page parameter: its encoder (0–3), how to read it and how it reads. */
export interface TempoParam {
	readonly encoder: number;
	get(s: SimState): number;
	format(v: number): string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
}

/** Tempo page parameters (E1–E4 on the tempo page), by id. */
export const TEMPO_PARAMS: Readonly<Record<string, TempoParam>> = {
	'tempo.bpm': {
		encoder: 0,
		get: (s) => s.tempo.bpm,
		format: (v) => String(Math.round(v * 10) / 10),
		min: TEMPO_RANGE.min,
		max: TEMPO_RANGE.max,
		step: 1
	},
	'tempo.groove': {
		encoder: 1,
		get: (s) => s.tempo.groove,
		format: (v) => GROOVES[v] ?? String(v),
		min: 0,
		max: GROOVES.length - 1,
		step: 1
	},
	'tempo.swing': {
		encoder: 2,
		get: (s) => s.tempo.swing,
		format: String,
		min: -99,
		max: 99,
		step: 1
	},
	'tempo.metronome': {
		encoder: 3,
		get: (s) => s.tempo.metronome.level,
		format: String,
		min: 0,
		max: 99,
		step: 1
	}
};

/**
 * The lists shift + M3 / M4 open: the module page, the list, and what the track has now. A type is
 * picked by turning E1 to it and clicking E1. (The engine is loaded from the preset browser that
 * shift + M1 brings up: {@link planEngine}.)
 */
const PICKERS: Record<
	string,
	{ page: PageNumber; key: string; list: readonly string[]; get(t: TrackState): string }
> = {
	'filter.type': { page: 3, key: 'M3', list: FILTER_TYPES, get: (t) => t.filter.type },
	'lfo.type': { page: 4, key: 'M4', list: LFO_TYPES, get: (t) => t.lfo.type }
};

/** Every parameter the navigator can set, with the words that find it. */
export const PARAMS: readonly ParamInfo[] = [
	{
		id: 'engine',
		names: ['engine', 'synth engine', 'sound engine'],
		page: 'shift M1 (the preset browser: loads the engine’s first preset, the whole sound)'
	},
	{ id: 'filter.type', names: ['filter type', 'filter mode'], page: 'shift M3 (list)' },
	{ id: 'lfo.type', names: ['lfo type', 'lfo mode', 'lfo'], page: 'shift M4 (list)' },
	...[1, 2, 3, 4].map((n) => ({
		id: `m1.${n}`,
		names: [`p${n}`, `engine ${n}`, `m1 e${n}`],
		page: `M1 E${n} (the engine's parameter ${n}: its name depends on the engine)`
	})),
	...(['attack', 'decay', 'sustain', 'release'] as const).flatMap((f) => [
		{ id: `amp.${f}`, names: [f, `amp ${f}`, `amp envelope ${f}`], page: 'M2 (amp envelope)' },
		{
			id: `filterEnv.${f}`,
			names: [`filter ${f}`, `filter envelope ${f}`],
			page: 'M2 (filter envelope)'
		}
	]),
	{
		id: 'playMode.mode',
		names: ['play mode', 'voice mode', 'poly', 'mono', 'legato'],
		page: 'shift M2'
	},
	{ id: 'playMode.portamento', names: ['portamento', 'glide time'], page: 'shift M2' },
	{ id: 'playMode.bend', names: ['bend', 'bend range', 'pitch bend range'], page: 'shift M2' },
	{ id: 'playMode.volume', names: ['preset volume', 'volume'], page: 'shift M2' },
	{ id: 'filter.cutoff', names: ['cutoff', 'filter cutoff', 'frequency'], page: 'M3' },
	{ id: 'filter.resonance', names: ['resonance', 'filter resonance', 'q'], page: 'M3' },
	{
		id: 'filter.envAmount',
		names: ['env amount', 'envelope amount', 'filter env amount'],
		page: 'M3'
	},
	{ id: 'filter.keyTracking', names: ['key tracking', 'keytrack', 'tracking'], page: 'M3' },
	{ id: 'sends.aux', names: ['aux send', 'aux out', 'send aux'], page: 'shift M3' },
	{ id: 'sends.tape', names: ['tape send', 'send tape'], page: 'shift M3' },
	{
		id: 'sends.fx1',
		names: ['fx i', 'fx 1', 'fx1', 'send fx i', 'fx i send', 'delay send'],
		page: 'shift M3'
	},
	{
		id: 'sends.fx2',
		names: ['fx ii', 'fx 2', 'fx2', 'send fx ii', 'fx ii send', 'reverb send'],
		page: 'shift M3'
	},
	{ id: 'lfo.speed', names: ['lfo speed', 'lfo rate', 'speed'], page: 'M4' },
	{ id: 'lfo.amount', names: ['lfo amount', 'lfo depth', 'amount'], page: 'M4' },
	{ id: 'lfo.destination', names: ['lfo destination', 'destination'], page: 'M4' },
	{ id: 'lfo.parameter', names: ['lfo parameter', 'lfo target parameter'], page: 'M4' },
	{
		id: 'lfo.source',
		names: ['duck source', 'lfo source', 'sidechain source', 'trigger track'],
		page: 'M4 (duck)'
	},
	{ id: 'lfo.hold', names: ['duck hold', 'lfo hold'], page: 'M4 (duck)' },
	{ id: 'lfo.release', names: ['duck release', 'lfo release'], page: 'M4 (duck)' },
	{ id: 'midi.program', names: ['program', 'program change'], page: 'M1 on a midi track' },
	{ id: 'tempo.bpm', names: ['tempo', 'bpm'], page: 'tempo' },
	{ id: 'tempo.groove', names: ['groove', 'groove type'], page: 'tempo' },
	{ id: 'tempo.swing', names: ['swing', 'groove amount', 'shuffle'], page: 'tempo' },
	{ id: 'tempo.metronome', names: ['metronome', 'metronome level', 'click level'], page: 'tempo' }
];

/** The parameter a word or id stands for, or null. Engine parameter names match on the track. */
export function findParam(query: string, s?: SimState, track?: number): string | null {
	const q = query.trim().toLowerCase();
	if (PARAMS.some((p) => p.id.toLowerCase() === q))
		return PARAMS.find((p) => p.id.toLowerCase() === q)!.id;
	if (lockParam(query)) return query;
	if (s) {
		const t = s.tracks[(track ?? s.track + 1) - 1] ?? s.tracks[s.track];
		const at = engineParams(t.engine).findIndex((name) => name?.toLowerCase() === q);
		if (at >= 0) return `m1.${at + 1}`;
	}
	return PARAMS.find((p) => p.names.includes(q))?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────── running

/** A private copy of the simulator at `state`. */
function copy(state: SimState): OpxySim {
	return new OpxySim({ state: JSON.parse(JSON.stringify(state)) as SimState, now: () => 0 });
}

const screenOf = (sim: OpxySim) => describeFrame(buildFrame(sim.state));

/** Plays a planned step on a simulator (the replica's, or a copy). */
export function playStep(sim: OpxySim, step: Pick<NavStep, 'keys' | 'clicks'>): void {
	play(sim, step.keys, step.clicks);
}

/** Plays one step on the simulator: presses, a held modifier, a turn or a click. */
function play(sim: OpxySim, keys: string, clicks = 0): void {
	const shifted = keys.startsWith('shift + ');
	const rest = shifted ? keys.slice('shift + '.length) : keys;
	if (shifted) sim.input({ type: 'press', id: 'key.shift' });
	const turn = /^turn E([1-4])$/.exec(rest);
	const click = /^click E([1-4])$/.exec(rest);
	if (turn) {
		const e = Number(turn[1]) as 1 | 2 | 3 | 4;
		for (let i = 0; i < Math.abs(clicks); i++) sim.turn(e, Math.sign(clicks));
	} else if (click) sim.click(Number(click[1]) as 1 | 2 | 3 | 4);
	else sim.press(controlId(rest));
	if (shifted) sim.input({ type: 'release', id: 'key.shift' });
}

/** The simulator's id of a control written in the key grammar. */
function controlId(token: string): string {
	const track = /^T([1-8])$/.exec(token);
	if (track) return `track.${track[1]}`;
	const m = /^M([1-4])$/.exec(token);
	if (m) return `key.m${m[1]}`;
	return `key.${token}`;
}

/** Records steps as they are played on `sim`. */
class Recorder {
	readonly steps: NavStep[] = [];
	constructor(readonly sim: OpxySim) {}
	do(keys: string, clicks?: number): void {
		play(this.sim, keys, clicks);
		this.steps.push({
			keys,
			...(clicks !== undefined ? { clicks } : {}),
			screen: screenOf(this.sim)
		});
	}
	plan(reached: boolean, note?: string): NavPlan {
		return { steps: this.steps, reached, screen: screenOf(this.sim), ...(note ? { note } : {}) };
	}
}

// ─────────────────────────────────────────────────────────────────────────── places

const idle = (s: SimState) =>
	s.overlay === null && s.sub === null && s.picker === null && s.areas.system.page === null;

/** Whether the simulator shows `place`. */
export function isAt(s: SimState, place: Place): boolean {
	switch (place.area) {
		case 'instrument': {
			const t = s.tracks[place.track - 1];
			return (
				s.mode === 'instrument' &&
				idle(s) &&
				s.track === place.track - 1 &&
				s.pages.instrument === place.page &&
				(place.envelope === undefined || place.page !== 2 || t.envelope === place.envelope)
			);
		}
		case 'auxiliary':
			return (
				s.mode === 'auxiliary' &&
				idle(s) &&
				s.auxTrack === place.track - 1 &&
				s.pages.auxiliary === place.page
			);
		case 'mix':
			return s.mode === 'mix' && idle(s) && s.pages.mix === place.page;
		case 'arrange':
			return s.mode === 'arrange' && idle(s);
		case 'tempo':
			return s.overlay === 'tempo' && s.sub === null;
		case 'player':
			return s.overlay === 'players' && s.track === place.track - 1;
	}
}

/** Walks `rec` to `place` (shift layers are reached by holding shift on the following step). */
function walk(rec: Recorder, place: Place): void {
	const s = () => rec.sim.state;
	switch (place.area) {
		case 'instrument': {
			if (s().mode !== 'instrument' || !idle(s())) rec.do('instrument');
			if (s().track !== place.track - 1) rec.do(`T${place.track}`);
			if (s().pages.instrument !== place.page) rec.do(`M${place.page}`);
			const t = s().tracks[place.track - 1];
			if (place.page === 2 && place.envelope && t.envelope !== place.envelope) rec.do('click E1');
			return;
		}
		case 'auxiliary':
			if (s().mode !== 'auxiliary' || !idle(s())) rec.do('auxiliary');
			if (s().auxTrack !== place.track - 1) rec.do(`T${place.track}`);
			if (s().pages.auxiliary !== place.page) rec.do(`M${place.page}`);
			return;
		case 'mix':
			if (s().mode !== 'mix' || !idle(s())) rec.do('mix');
			if (s().pages.mix !== place.page) rec.do(`M${place.page}`);
			return;
		case 'arrange':
			if (s().mode !== 'arrange' || !idle(s())) rec.do('arrange');
			return;
		case 'tempo':
			// pressed on the tempo page, the key taps the tempo: only press it to get there
			if (s().overlay !== 'tempo' || s().sub !== null) rec.do('tempo');
			return;
		case 'player':
			if (s().overlay === 'players' && s().track === place.track - 1) return;
			if (s().mode !== 'instrument' || !idle(s())) rec.do('instrument');
			if (s().track !== place.track - 1) rec.do(`T${place.track}`);
			rec.do('player');
			return;
	}
}

/** Steps from `state` to `place`, run on a copy of the simulator. */
export function planPlace(state: SimState, place: Place): NavPlan {
	const rec = new Recorder(copy(state));
	walk(rec, place);
	return rec.plan(isAt(rec.sim.state, place));
}

// ─────────────────────────────────────────────────────────────────────────── parameters

/** Where an instrument parameter lives: its page, layer and envelope. */
function placeOfParam(id: string, track: number): Place | null {
	if (/^m1\.[1-4]$/.test(id) || id === 'midi.program')
		return { area: 'instrument', track, page: 1 };
	const env = /^(amp|filterEnv)\./.exec(id);
	if (env) {
		return { area: 'instrument', track, page: 2, envelope: env[1] === 'amp' ? 'amp' : 'filter' };
	}
	if (id.startsWith('playMode.')) return { area: 'instrument', track, page: 2, shift: true };
	if (id.startsWith('filter.')) return { area: 'instrument', track, page: 3 };
	if (id.startsWith('sends.')) return { area: 'instrument', track, page: 3, shift: true };
	if (id.startsWith('lfo.')) return { area: 'instrument', track, page: 4 };
	return null;
}

/**
 * Whether {@link planParam} can set the parameter with this id: a tempo value, a list pick, or a
 * parameter of an instrument track's pages (not the sampler keys' own settings, which it does not
 * walk to yet).
 */
export function plannable(id: string): boolean {
	if (id in TEMPO_PARAMS || id === 'engine' || id in PICKERS) return true;
	return lockParam(id) !== null && placeOfParam(id, 1) !== null;
}

/**
 * The encoder (0–3) and layer that turn `id` where the simulator stands, with the parameter as
 * that page reads it (element's LFO has four destinations, not six), or null.
 */
function encoderFor(
	sim: OpxySim,
	id: string
): { e: number; shift: boolean; lock: LockParam } | null {
	for (const shift of [false, true]) {
		const view = { ...sim.state, shift };
		for (let e = 0; e < 4; e++) {
			const lock = lockTarget(view, e);
			if (lock?.id === id) return { e, shift, lock };
		}
	}
	return null;
}

/** The value `goal` names, in the parameter's units (a number, or the reading that matches). */
function targetValue(
	goal: number | string,
	format: (v: number) => string,
	min: number,
	max: number,
	step: number
): number | null {
	if (typeof goal === 'string') {
		const want = goal.trim().toLowerCase();
		for (let v = min; v <= max + 1e-9; v += step) {
			if (format(v).toLowerCase() === want) return v;
		}
	}
	const n = Number(goal);
	if (!Number.isFinite(n)) return null;
	// the number as the screen shows it first (parameter 1 is stored as 0, a synced speed as its
	// place in the list), else the parameter's own units
	for (let v = min; v <= max + 1e-9; v += step) if (Number(format(v)) === n) return v;
	return Math.min(max, Math.max(min, n));
}

/** Turns encoder `e` one detent at a time until `read` gives `target` (or stops moving). */
function turnTo(
	rec: Recorder,
	e: number,
	shift: boolean,
	read: () => number,
	target: number,
	matches: (v: number) => boolean
): boolean {
	const keys = `${shift ? 'shift + ' : ''}turn E${e + 1}`;
	const sim = rec.sim;
	let clicks = 0;
	for (let guard = 0; guard < 400 && !matches(read()); guard++) {
		const before = read();
		const dir = read() < target ? 1 : -1;
		play(sim, keys, dir);
		clicks += dir;
		if (read() === before) break;
	}
	if (clicks !== 0) rec.steps.push({ keys, clicks, screen: screenOf(sim) });
	return matches(read());
}

/**
 * Loads an engine as OS 1.1.33 does (research 59 §2.6): shift + M1 brings up the preset browser
 * on the track's preset, a click of E1 turns it to "by engine" when it lists categories, E1 moves
 * the engine column to the engine (its first preset highlighted), and a click of E2 loads that
 * preset and leaves the browser for M1. The preset replaces the whole sound, so an engine goes
 * before the parameters set after it. The browser lists the engines that have presets, then midi
 * with its starting sound (ours: the owner's unit listed no midi engine, research 59 §2.6).
 */
function planEngine(rec: Recorder, track: number, value: number | string): NavPlan {
	const want = String(value).trim().toLowerCase();
	const t = () => rec.sim.state.tracks[track - 1];
	const b = () => rec.sim.state.areas.system.presets;
	const engines = groups(b(), 'engine');
	if (t().engine !== want && !engines.includes(want)) {
		return rec.plan(false, `"${value}" is not one of the browser's engines: ${engines.join(', ')}`);
	}
	// shift + M1 works from any page of the track
	walk(rec, { area: 'instrument', track, page: rec.sim.state.pages.instrument });
	if (t().engine === want) return rec.plan(true, `already ${want}`);
	rec.do('shift + M1');
	if (b().view !== 'engine') rec.do('click E1');
	const from = currentGroup(b()).index;
	const target = groups(b()).indexOf(want);
	if (target !== from) rec.do('turn E1', target - from);
	rec.do('click E2');
	const ok = t().engine === want;
	return rec.plan(ok, ok ? undefined : `the preset browser did not load ${want}`);
}

/** Steps that set a parameter to a value, run on a copy of the simulator. */
export function planParam(state: SimState, goal: ParamGoal): NavPlan {
	const track = goal.track ?? state.track + 1;
	const id = findParam(goal.param, state, track);
	const rec = new Recorder(copy(state));
	if (!id)
		return rec.plan(
			false,
			`no parameter "${goal.param}"; try one of: ${PARAMS.map((p) => p.id).join(', ')}`
		);

	const tempo = TEMPO_PARAMS[id];
	if (tempo) {
		walk(rec, { area: 'tempo' });
		const target = targetValue(goal.value, tempo.format, tempo.min, tempo.max, tempo.step);
		if (target === null) return rec.plan(false, `"${goal.value}" is not a value of ${id}`);
		const read = () => tempo.get(rec.sim.state);
		const ok = turnTo(rec, tempo.encoder, false, read, target, (v) => Math.abs(v - target) < 0.05);
		return rec.plan(ok, ok ? undefined : `${id} stopped at ${tempo.format(read())}`);
	}

	if (id === 'engine') return planEngine(rec, track, goal.value);

	const picker = PICKERS[id];
	if (picker) {
		walk(rec, { area: 'instrument', track, page: picker.page });
		const want = String(goal.value).trim().toLowerCase();
		const target = picker.list.indexOf(want);
		if (target < 0) {
			return rec.plan(false, `"${goal.value}" is not one of: ${picker.list.join(', ')}`);
		}
		const t = () => rec.sim.state.tracks[track - 1];
		if (picker.get(t()) === picker.list[target])
			return rec.plan(true, `already ${picker.list[target]}`);
		rec.do(`shift + ${picker.key}`);
		const from = rec.sim.state.picker?.index ?? 0;
		if (target !== from) rec.do('turn E1', target - from);
		rec.do('click E1');
		const ok = picker.get(t()) === picker.list[target];
		return rec.plan(ok, ok ? undefined : `the list did not take ${picker.list[target]}`);
	}

	const place = placeOfParam(id, track);
	const p: LockParam | null = lockParam(id);
	if (!place || !p) return rec.plan(false, `${id} is not a parameter the navigator can set yet`);
	walk(rec, place);
	if (!isAt(rec.sim.state, place)) return rec.plan(false, 'could not reach the page');
	// a filter or LFO that is off does nothing: M3 / M4 again on its page switches it on
	const module = rec.sim.state.tracks[track - 1];
	if (id.startsWith('filter.') && !module.filter.on) rec.do('M3');
	if (id.startsWith('lfo.') && !module.lfo.on) rec.do('M4');
	const where = encoderFor(rec.sim, id);
	if (!where) {
		return rec.plan(
			false,
			`no encoder sets ${id} on this track now (its engine or LFO type has no such parameter)`
		);
	}
	const lock = where.lock;
	const target = targetValue(goal.value, lock.format, lock.min, lock.max, lock.step);
	if (target === null) return rec.plan(false, `"${goal.value}" is not a value of ${id}`);
	const t = () => rec.sim.state.tracks[track - 1];
	// compare as the screen shows it, so 40 on a 0–99 lane stops where the page reads 40
	const matches = (v: number) => lock.format(v) === lock.format(target);
	const ok = turnTo(rec, where.e, where.shift, () => lock.get(t()), target, matches);
	return rec.plan(ok, ok ? undefined : `${id} stopped at ${lock.format(lock.get(t()))}`);
}

/** Whether the parameter `goal` names already reads its value (a filter or LFO also switched on). */
export function reads(state: SimState, goal: ParamGoal): boolean {
	const track = goal.track ?? state.track + 1;
	const id = findParam(goal.param, state, track);
	if (!id) return false;
	const tempo = TEMPO_PARAMS[id];
	if (tempo) {
		const target = targetValue(goal.value, tempo.format, tempo.min, tempo.max, tempo.step);
		return target !== null && Math.abs(tempo.get(state) - target) < 0.05;
	}
	const t = state.tracks[track - 1];
	if (!t) return false;
	if (id === 'engine') return t.engine === String(goal.value).trim().toLowerCase();
	const picker = PICKERS[id];
	if (picker) return picker.get(t) === String(goal.value).trim().toLowerCase();
	const p = lockParam(id);
	if (!p || !placeOfParam(id, track)) return false;
	if (id.startsWith('filter.') && !t.filter.on) return false;
	if (id.startsWith('lfo.') && !t.lfo.on) return false;
	const target = targetValue(goal.value, p.format, p.min, p.max, p.step);
	return target !== null && p.format(p.get(t)) === p.format(target);
}

/**
 * Steps that set several parameters in order (a sound set up from an idea: a pluck, a duck), each
 * planned from where the steps before it leave a copy of the simulator. A goal that cannot be
 * reached adds no steps; the others still run.
 */
export function planSettings(state: SimState, goals: readonly ParamGoal[]): SettingsPlan {
	const sim = copy(state);
	const parts: SettingPart[] = [];
	for (const goal of goals) {
		// one that already reads its value needs no steps, not even a trip to its page
		if (reads(sim.state, goal)) {
			parts.push({ goal, steps: [], reached: true, note: 'already set' });
			continue;
		}
		const plan = planParam(sim.state, goal);
		if (plan.reached) for (const step of plan.steps) playStep(sim, step);
		parts.push({
			goal,
			steps: plan.reached ? plan.steps : [],
			reached: plan.reached,
			...(plan.note ? { note: plan.note } : {})
		});
	}
	const failed = parts.filter((p) => !p.reached);
	return {
		steps: parts.flatMap((p) => p.steps),
		reached: failed.length === 0,
		screen: screenOf(sim),
		parts,
		...(failed.length
			? { note: failed.map((p) => `${p.goal.param}: ${p.note ?? 'not reached'}`).join('; ') }
			: {})
	};
}

// ─────────────────────────────────────────────────────────────────── values on the other pages

/**
 * A value an auxiliary, mixer or player page shows, named the way the page's description names it
 * ("size" on FX II, "speed" on the tape, "low" on the master EQ, "level" on mix M1, "style" on the
 * player's shift layer). No table says which encoder carries it: the navigator turns each one on a
 * copy and watches the page.
 */
export interface PageValueGoal {
	readonly area: 'auxiliary' | 'mix' | 'player';
	/**
	 * Auxiliary track 1–8; on mix M1 the track whose strip it is, 1–16 (9–16 auxiliary); for the
	 * player, the instrument track 1–8.
	 */
	readonly track?: number;
	/** The M-page; default: the first page that shows the value. */
	readonly page?: PageNumber;
	readonly label: string;
	readonly value: number | string;
}

/**
 * A page's values as its description lists them: "FX II reverb: size 69, rate 29" → size: "69".
 * A reading starts at the first number ("size 1/8 dotted", "fx II 30"), else it is the last word
 * ("pitch X1", "mic off").
 */
export function pageValues(text: string): Map<string, string> {
	const values = new Map<string, string>();
	const body = text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
	for (const part of body.split(',')) {
		const words = part.trim().split(/\s+/);
		if (words.length < 2) continue;
		const number = words.findIndex((w, i) => i > 0 && /^[-+−]?\d/.test(w));
		const at = number > 0 ? number : words.length - 1;
		values.set(words.slice(0, at).join(' ').toLowerCase(), words.slice(at).join(' '));
	}
	return values;
}

/**
 * The label a page uses for `wanted`: the whole phrase, then its shorter runs of words, longest
 * first ("fx ii send" → "fx ii", "reverb size" → "size").
 */
function pageLabel(values: Map<string, string>, wanted: string): string | null {
	const words = wanted
		.trim()
		.toLowerCase()
		.replace(/\bfx ?(1|one)\b/, 'fx i')
		.replace(/\bfx ?(2|two)\b/, 'fx ii')
		.split(/\s+/);
	for (let length = words.length; length > 0; length--) {
		for (let start = 0; start + length <= words.length; start++) {
			const label = words.slice(start, start + length).join(' ');
			if (values.has(label)) return label;
		}
	}
	return null;
}

/** A page's values, with shift held for its shift layer (read on a copy). */
function valuesOf(sim: OpxySim, shifted = false): Map<string, string> {
	if (!shifted) return pageValues(screenOf(sim));
	const view = copy(sim.state);
	view.input({ type: 'press', id: 'key.shift' });
	return pageValues(screenOf(view));
}

const readValue = (sim: OpxySim, label: string, shifted = false) =>
	valuesOf(sim, shifted).get(label);

/**
 * The turn that moves `label` where the simulator stands: the first encoder, then shift. A detent
 * each way must read differently (or differ from now), so an encoder that only calls up the popup
 * showing the value (mix M1's sends) does not count.
 */
function probe(sim: OpxySim, label: string, shifted = false): string | null {
	const before = readValue(sim, label, shifted);
	// a value of the shift layer is turned with shift held
	for (const shift of shifted ? [true] : [false, true]) {
		for (let e = 1; e <= 4; e++) {
			const keys = `${shift ? 'shift + ' : ''}turn E${e}`;
			const [up, down] = [1, -1].map((dir) => {
				const trial = copy(sim.state);
				play(trial, keys, dir);
				return readValue(trial, label, shifted);
			});
			const moved = up !== down || (before !== undefined && up !== undefined && up !== before);
			if (moved && (up !== undefined || down !== undefined)) return keys;
		}
	}
	return null;
}

/**
 * The detents (+ clockwise) that make `label` read `value`, tried on copies: numbers are
 * approached from whichever side gets closer (the nearest reading when the exact one is skipped),
 * words are searched clockwise, then counter-clockwise. Null when it never reads it.
 */
function detentsTo(
	sim: OpxySim,
	keys: string,
	label: string,
	value: number | string,
	shifted = false
): number | null {
	const target = Number(value);
	const want = String(value).trim().toLowerCase();
	// a reading as a number ("+10", "–08" with the EQ's dash), or NaN for words
	const num = (v: string | undefined) => (v === undefined ? NaN : Number(v.replace(/^[–−]/, '-')));
	const hit = (v: string | undefined) =>
		v !== undefined &&
		(Number.isFinite(target) && Number.isFinite(num(v))
			? num(v) === target
			: v.toLowerCase() === want);
	if (hit(readValue(sim, label, shifted))) return 0;
	for (const dir of [1, -1]) {
		const trial = copy(sim.state);
		// (a popup's value can be missing until the first detent calls the popup up)
		let last = readValue(trial, label, shifted);
		let still = 0;
		for (let n = 1; n <= 400; n++) {
			play(trial, keys, dir);
			const v = readValue(trial, label, shifted);
			if (hit(v)) return n * dir;
			const [now, before] = [num(v) - target, num(last) - target];
			if (Number.isFinite(now) && Number.isFinite(before) && now !== before) {
				if (Math.sign(now) !== Math.sign(before)) {
					// stepped over the value: stop at the closer reading
					return (Math.abs(now) <= Math.abs(before) ? n : n - 1) * dir;
				}
				if (Math.abs(now) > Math.abs(before)) break; // moving away: the other way
			}
			still = v === last ? still + 1 : 0;
			if (still >= 12) break; // the end of its range
			last = v;
		}
	}
	return null;
}

/** A label only a popup shows (mix M1's sends appear once E1 or E2 turns), found on copies. */
function revealed(sim: OpxySim, wanted: string): string | null {
	for (let e = 1; e <= 4; e++) {
		const trial = copy(sim.state);
		play(trial, `turn E${e}`, 1);
		const label = pageLabel(pageValues(screenOf(trial)), wanted);
		if (label) return label;
	}
	return null;
}

/** Walks to the page (and on mix M1 the track) of a page-value goal. */
function walkToPage(rec: Recorder, goal: PageValueGoal, page: PageNumber): void {
	if (goal.area === 'player') {
		walk(rec, { area: 'player', track: goal.track ?? rec.sim.state.track + 1 });
		return;
	}
	if (goal.area === 'auxiliary') {
		walk(rec, { area: 'auxiliary', track: goal.track ?? rec.sim.state.auxTrack + 1, page });
		return;
	}
	walk(rec, { area: 'mix', page });
	if (goal.track === undefined || page !== 1) return;
	const bank = goal.track > 8 ? 'auxiliary' : 'instrument';
	// pressed again, mix swaps the track keys between the two sets
	if (rec.sim.state.banks.mix !== bank) rec.do('mix');
	const index = (goal.track - 1) % 8;
	const s = rec.sim.state;
	if ((bank === 'instrument' ? s.track : s.auxTrack) !== index) rec.do(`T${index + 1}`);
}

/**
 * Steps that set a value an auxiliary, mixer or player page shows, run on a copy of the
 * simulator. When the exact reading is skipped, the steps stop at the nearest one.
 */
export function planPageValue(state: SimState, goal: PageValueGoal): NavPlan {
	// the player is one page; the others have four
	const pages: readonly PageNumber[] =
		goal.area === 'player' ? [1] : goal.page ? [goal.page] : [1, 2, 3, 4];
	let seen: string[] = [];
	for (const page of pages) {
		const rec = new Recorder(copy(state));
		walkToPage(rec, goal, page);
		const values = valuesOf(rec.sim);
		const shiftValues = valuesOf(rec.sim, true);
		const base = pageLabel(values, goal.label) ?? revealed(rec.sim, goal.label);
		// not on the page itself: its shift layer
		const shifted = base === null && pageLabel(shiftValues, goal.label) !== null;
		const label = base ?? pageLabel(shiftValues, goal.label);
		const where = goal.area === 'player' ? 'the player page' : `M${page}`;
		if (!label) {
			const names = new Set([...values.keys(), ...shiftValues.keys()]);
			seen = [...seen, ...[...names].map((k) => `${k} (${where})`)];
			continue;
		}
		const keys = probe(rec.sim, label, shifted);
		if (!keys) return rec.plan(false, `no encoder moves ${label} on ${where}`);
		const detents = detentsTo(rec.sim, keys, label, goal.value, shifted);
		if (detents === null) {
			const now = (shifted ? shiftValues : values).get(label);
			return rec.plan(false, `${label} never reads ${goal.value} (it reads ${now})`);
		}
		if (detents !== 0) rec.do(keys, detents);
		return rec.plan(true);
	}
	const rec = new Recorder(copy(state));
	return rec.plan(
		false,
		`no page shows "${goal.label}"${seen.length ? `; these do: ${seen.join(', ')}` : ''}`
	);
}
