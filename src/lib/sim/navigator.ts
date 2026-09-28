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
import { engineParams, GROOVES, TEMPO_RANGE, type PageNumber, type SimState } from './params';
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

/** A settable parameter: where it lives and how it reads. */
export interface ParamInfo {
	readonly id: string;
	/** Words a person might use for it. */
	readonly names: readonly string[];
	readonly page: string;
}

/** Tempo page parameters (E1–E4 on the tempo page). */
const TEMPO_PARAMS: Record<
	string,
	{
		encoder: number;
		get(s: SimState): number;
		format(v: number): string;
		min: number;
		max: number;
		step: number;
	}
> = {
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

/** Every parameter the navigator can set, with the words that find it. */
export const PARAMS: readonly ParamInfo[] = [
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

const idle = (s: SimState) => s.overlay === null && s.sub === null && s.picker === null;

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

/** The encoder (0–3) and layer that turn `id` where the simulator stands, or null. */
function encoderFor(sim: OpxySim, id: string): { e: number; shift: boolean } | null {
	for (const shift of [false, true]) {
		const view = { ...sim.state, shift };
		for (let e = 0; e < 4; e++) if (lockTarget(view, e)?.id === id) return { e, shift };
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
	if (typeof goal === 'number') return Math.min(max, Math.max(min, goal));
	const want = goal.trim().toLowerCase();
	for (let v = min; v <= max + 1e-9; v += step) {
		if (format(v).toLowerCase() === want) return v;
	}
	const n = Number(want);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
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

	const place = placeOfParam(id, track);
	const p: LockParam | null = lockParam(id);
	if (!place || !p) return rec.plan(false, `${id} is not a parameter the navigator can set yet`);
	walk(rec, place);
	if (!isAt(rec.sim.state, place)) return rec.plan(false, 'could not reach the page');
	const where = encoderFor(rec.sim, id);
	if (!where) {
		return rec.plan(
			false,
			`no encoder sets ${id} on this track now (its engine or LFO type has no such parameter)`
		);
	}
	const target = targetValue(goal.value, p.format, p.min, p.max, p.step);
	if (target === null) return rec.plan(false, `"${goal.value}" is not a value of ${id}`);
	const t = () => rec.sim.state.tracks[track - 1];
	// compare as the screen shows it, so 40 on a 0–99 lane stops where the page reads 40
	const matches = (v: number) => p.format(v) === p.format(target);
	const ok = turnTo(rec, where.e, where.shift, () => p.get(t()), target, matches);
	return rec.plan(ok, ok ? undefined : `${id} stopped at ${p.format(p.get(t()))}`);
}
