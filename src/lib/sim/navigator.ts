/**
 * The navigator (Phase F4): exact steps from where the simulator is to a page, or to a parameter
 * set to a value, as key combos in the manual's key grammar (`T3`, `shift + M3`, `turn E2`,
 * `shift + player → + player`) with the number of detents for turns. Every plan is run on a copy
 * of the simulator before it is returned, so the steps are the ones that work, not a guess; the
 * agent shows them on the replica or reads them out, and the screen after each step tells the user
 * what to look for.
 *
 * Planning is deterministic: leave whatever is open with the target's mode key, pick the track, the
 * M-page and the envelope, then turn the encoder that carries the parameter there (found from the
 * lock registry, which mirrors the core's turns) one detent at a time until it reads the value.
 * Values the other pages show are found by the names their screens use ({@link planPageValue});
 * a few are set with keys of their own rather than an encoder: the player type, arrange's patterns,
 * scenes and song, slicing a drum key, and the bar menu's track scale and bars.
 */
import { KEYBOARD_FIRST_NOTE, parseKeys, targetIds, type KeySequence } from '$lib/core/opxy';
import { OpxySim } from './opxy-sim.svelte';
import { buildFrame } from './frames';
import { trackSequence } from './areas/arrange/model';
import { FX_NAMES, FX_TYPES } from './areas/auxiliary/state';
import { activeRegion, tuneText, zoneOf } from './areas/sample/m1';
import { keyNote } from './areas/sample/record';
import { MAX_SLICES } from './areas/sample/slicer';
import { SLICE_MODES, type Region } from './areas/sample/state';
import { lockTarget, lockParam, type LockParam } from './areas/sequencer/locks';
import type { PresetEntry } from './areas/system/catalogue';
import { currentGroup, groups, presetKey, presetsIn } from './areas/system/presets';
import {
	FILTER_TYPES,
	GROOVES,
	LFO_TYPES,
	PLAY_MODES,
	SAMPLER_TUNE_RANGE,
	TEMPO_RANGE,
	engineParams,
	keyName,
	two,
	type PageNumber,
	type SimState,
	type TrackState
} from './params';
import type { ScreenFrame } from './screen/frame';
import { describeFrame } from './screen/render';
import {
	MAX_BARS,
	MAX_PATTERNS,
	PLAYER_TYPES,
	TRACK_SCALES,
	currentPattern,
	digitForScale,
	formatScale,
	type Pattern,
	type PlayerType
} from './sequencer';

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
	| {
			readonly area: 'player';
			readonly track: number;
			readonly shift?: boolean;
			/** The player the page shows, picked from the list `shift + player` brings up. */
			readonly type?: PlayerType;
	  }
	| { readonly area: 'com' }
	/** The record page the sample key opens over the track (manual: sampler/sampling). */
	| { readonly area: 'sample'; readonly track: number };

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
	/**
	 * On a sampler track, the keyboard key whose settings these are (a drum key, a multisampler's
	 * zone): its name ("G3"), its sample's name ("snare 1") or its number 1–24; default: the key
	 * selected last.
	 */
	readonly key?: number | string;
	/** For a value no parameter id names (found on the track's pages by name): the M-page. */
	readonly page?: PageNumber;
}

/** One goal of a {@link SettingsPlan}: its steps and whether they reached it. */
export interface SettingPart {
	readonly goal: SettingGoal;
	readonly steps: readonly NavStep[];
	readonly reached: boolean;
	readonly note?: string;
}

/** Several settings made in a row, each planned from where the one before left the device. */
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

// ─────────────────────────────────────────────────────────────────────── sampler keys

/**
 * A drum key's settings on the drum sampler's M1 page (manual: sampler/drum-key-settings): the
 * lock registry's `key<n>.<field>`, planned as `key.<field>` for the key a goal names (or the one
 * selected last).
 */
const KEY_FIELDS = ['tune', 'start', 'end', 'playMode', 'reverse', 'pan', 'fade', 'gain'] as const;

/** Words for a drum key's settings (its M1 page's labels first). */
const KEY_NAMES: Readonly<Record<(typeof KEY_FIELDS)[number], readonly string[]>> = {
	tune: ['tune', 'key tune', 'drum tune', 'pitch'],
	start: ['start', 'key start', 'sample start'],
	end: ['end', 'key end', 'sample end'],
	playMode: ['play mode', 'key play mode', 'drum play mode'],
	reverse: ['direction', 'reverse', 'key direction'],
	pan: ['pan', 'key pan'],
	fade: ['fade', 'fade in', 'key fade'],
	gain: ['gain', 'key gain']
};

/**
 * A value of the synth sampler's sample or of a multisampler zone (manual: synth-sampler,
 * multisampler; the lock registry keeps only the drum keys'): its encoder and layer, the region's
 * value, and how the M1 page reads it.
 */
export interface RegionParam {
	readonly id: string;
	readonly label: string;
	readonly names: readonly string[];
	/** 0–3. */
	readonly encoder: number;
	readonly shift: boolean;
	get(r: Region): number;
	format(v: number): string;
	readonly min: number;
	readonly max: number;
	/** Change per detent. */
	readonly step: number;
}

/** A share of the sample, to the tenth of a percent. */
const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;

/** The points move a hundredth of the sample a detent (a thousandth pushed in). */
const point = (
	id: string,
	label: string,
	names: readonly string[],
	encoder: number,
	get: (r: Region) => number
): RegionParam => ({
	id,
	label,
	names,
	encoder,
	shift: false,
	get,
	format: percent,
	min: 0,
	max: 1,
	step: 0.01
});

/** The M1 values of the synth sampler and of the multisampler's zones, by encoder and layer. */
export const REGION_PARAMS: readonly RegionParam[] = [
	point('sample.start', 'start', ['start', 'sample start'], 0, (r) => r.start),
	point('sample.loopStart', 'loop start', ['loop start'], 1, (r) => r.loopStart),
	point('sample.loopEnd', 'loop end', ['loop end'], 2, (r) => r.loopEnd),
	point('sample.end', 'end', ['end', 'sample end'], 3, (r) => r.end),
	{
		id: 'sample.reverse',
		label: 'direction',
		names: ['direction', 'reverse'],
		encoder: 0,
		shift: true,
		get: (r) => (r.reverse ? 1 : 0),
		format: (v) => (v >= 0.5 ? 'reverse' : 'forward'),
		min: 0,
		max: 1,
		step: 1
	},
	{
		id: 'sample.tune',
		label: 'tune',
		names: ['tune', 'pitch'],
		encoder: 1,
		shift: true,
		get: (r) => r.tune,
		format: tuneText,
		min: -SAMPLER_TUNE_RANGE,
		max: SAMPLER_TUNE_RANGE,
		step: 0.1
	},
	{
		id: 'sample.crossfade',
		label: 'loop crossfade',
		names: ['loop crossfade', 'crossfade'],
		encoder: 2,
		shift: true,
		get: (r) => r.crossfade,
		format: (v) => `${Math.round(v)}%`,
		min: 0,
		// the owner's unit stops at 75 % (research 60 §5)
		max: 75,
		step: 1
	},
	{
		id: 'sample.gain',
		label: 'gain',
		names: ['gain'],
		encoder: 3,
		shift: true,
		get: (r) => r.gain,
		format: (v) => String(Math.round(v)),
		min: -30,
		max: 20,
		step: 1
	}
];

const regionParam = (id: string) => REGION_PARAMS.find((r) => r.id === id);

/** The drum sampler's key settings and the samplers' regions, as settable parameters. */
const SAMPLER_PARAMS: readonly ParamInfo[] = [
	...KEY_FIELDS.map((field) => ({
		id: `key.${field}`,
		names: KEY_NAMES[field],
		page: `M1${['reverse', 'pan', 'fade', 'gain'].includes(field) ? ' with shift' : ''} on a drum track (the key given, else the one selected last)`
	})),
	...REGION_PARAMS.map((r) => ({
		id: r.id,
		names: r.names,
		page: `M1${r.shift ? ' with shift' : ''} on a sampler or multisampler track (a multisampler zone by its key)`
	}))
];

/** A sampler track's own parameters, by the names its M1 page uses. */
function samplerParams(engine: string): readonly ParamInfo[] {
	if (engine === 'drum') return SAMPLER_PARAMS.filter((p) => p.id.startsWith('key.'));
	if (engine === 'sampler' || engine === 'multisampler') {
		return SAMPLER_PARAMS.filter((p) => p.id.startsWith('sample.'));
	}
	return [];
}

/** Every parameter the navigator can set, with the words that find it. */
export const PARAMS: readonly ParamInfo[] = [
	{
		id: 'engine',
		names: ['engine', 'synth engine', 'sound engine'],
		page: 'shift M1 (the preset browser: loads the engine’s first preset, the whole sound)'
	},
	{
		id: 'preset',
		names: ['preset', 'factory preset', 'user preset'],
		page: 'shift M1 (the preset browser: loads the preset by name, "pluck/beach bum" or "beach bum", the whole sound)'
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
	...SAMPLER_PARAMS,
	{ id: 'tempo.bpm', names: ['tempo', 'bpm'], page: 'tempo' },
	{ id: 'tempo.groove', names: ['groove', 'groove type'], page: 'tempo' },
	{ id: 'tempo.swing', names: ['swing', 'groove amount', 'shuffle'], page: 'tempo' },
	{ id: 'tempo.metronome', names: ['metronome', 'metronome level', 'click level'], page: 'tempo' }
];

/** The parameters any track has, found by their words alone (a sampler's own go by its engine). */
const GENERAL = PARAMS.filter((p) => !SAMPLER_PARAMS.includes(p));

/**
 * The parameter a word or id stands for, or null. Engine parameter names match on the track, and
 * so do a sampler track's own M1 values; "play mode" on a drum track is its key's (key, oneshot,
 * …) unless `value` is a voice mode (poly, mono, legato: the M2 shift layer's).
 */
export function findParam(
	query: string,
	s?: SimState,
	track?: number,
	value?: number | string
): string | null {
	const q = query.trim().toLowerCase();
	const exact = PARAMS.find((p) => p.id.toLowerCase() === q);
	if (exact) return exact.id;
	if (lockParam(query)) return query;
	if (s) {
		const t = s.tracks[(track ?? s.track + 1) - 1] ?? s.tracks[s.track];
		const own = samplerParams(t.engine);
		const voice = (PLAY_MODES as readonly string[]).includes(String(value).trim().toLowerCase());
		const hit = own.find((p) => p.names.includes(q));
		if (hit && !(hit.id === 'key.playMode' && voice)) return hit.id;
		// a synth's M1 goes by the engine's names; a sampler's is its own (above), and the midi
		// engine's channel and bank are values its page shows (planned by name)
		const synth = own.length === 0 && t.engine !== 'midi';
		const at = synth ? engineParams(t.engine).findIndex((n) => n?.toLowerCase() === q) : -1;
		if (at >= 0) return `m1.${at + 1}`;
	}
	return GENERAL.find((p) => p.names.includes(q))?.id ?? null;
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

/** Key combos parsed once: a plan replays the same few combos thousands of times on copies. */
const parsed = new Map<string, KeySequence>();

/**
 * Plays a key combo on the simulator as the replica animates it: every key of a chord but the last
 * is held while the last is pressed, turned (`clicks` detents) or clicked, and the held keys come
 * up after the chord unless the next one keeps them (`shift + player → + player`).
 */
function play(sim: OpxySim, keys: string, clicks = 0): void {
	let sequence = parsed.get(keys);
	if (!sequence) {
		sequence = parseKeys(keys);
		parsed.set(keys, sequence);
	}
	let held: string[] = [];
	const release = () => {
		for (const id of held.reverse()) sim.input({ type: 'release', id });
		held = [];
	};
	sequence.chords.forEach((chord, i) => {
		if (!chord.keepHeld) release();
		chord.terms.forEach((term, j) => {
			// the navigator's own steps name single controls; anything wider stands for its first
			const id = targetIds(term.target)[0];
			if (j < chord.terms.length - 1) {
				sim.input({ type: 'press', id });
				held.push(id);
				return;
			}
			const encoder = /^encoder\.([1-4])$/.exec(id);
			const e = encoder ? (Number(encoder[1]) as 1 | 2 | 3 | 4) : null;
			if (term.gesture === 'turn') {
				if (e) for (let n = 0; n < Math.abs(clicks); n++) sim.turn(e, Math.sign(clicks));
			} else if (term.gesture === 'click') {
				if (e) sim.click(e);
			} else sim.press(id);
		});
		if (!sequence.chords[i + 1]?.keepHeld) release();
	});
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

/** The player instrument track `track` (1–8) uses now: its pattern's. */
const playerType = (s: SimState, track: number): PlayerType | undefined =>
	s.tracks[track - 1] && currentPattern(s.tracks[track - 1].sequence).player.type;

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
			return s.mode === 'arrange' && idle(s) && s.areas.arrange.view === 'patterns';
		case 'tempo':
			return s.overlay === 'tempo' && s.sub === null;
		case 'player':
			return (
				s.overlay === 'players' &&
				s.track === place.track - 1 &&
				(place.type === undefined || playerType(s, place.track) === place.type)
			);
		case 'com':
			return s.overlay === 'com' && s.sub === null;
		case 'sample':
			return (
				s.overlay === 'sample' &&
				s.sub === null &&
				s.areas.sample.page === 'record' &&
				s.track === place.track - 1
			);
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
			// song mode is arrange's other view: arrange goes back to the patterns
			if (s().areas.arrange.view === 'song') rec.do('arrange');
			return;
		case 'tempo':
			// pressed on the tempo page, the key taps the tempo: only press it to get there
			if (s().overlay !== 'tempo' || s().sub !== null) rec.do('tempo');
			return;
		case 'player': {
			const open = () => s().overlay === 'players' && s().track === place.track - 1;
			if (!open()) {
				if (s().mode !== 'instrument' || !idle(s())) rec.do('instrument');
				if (s().track !== place.track - 1) rec.do(`T${place.track}`);
			}
			// shift + player shows the list with the track's player boxed; each further press of
			// player, shift still down, moves on (research 59 §2.7), and letting go opens that page
			const now = playerType(s(), place.track) ?? PLAYER_TYPES[0];
			const n = PLAYER_TYPES.length;
			const moves = place.type
				? (PLAYER_TYPES.indexOf(place.type) - PLAYER_TYPES.indexOf(now) + n) % n
				: 0;
			if (moves > 0) rec.do(['shift + player', ...Array(moves).fill('+ player')].join(' → '));
			else if (!open()) rec.do('player');
			return;
		}
		case 'com':
			// the key again on the page goes back: only press it to get there
			if (s().overlay !== 'com' || s().sub !== null) rec.do('com');
			return;
		case 'sample':
			if (isAt(s(), place)) return;
			walk(rec, { area: 'instrument', track: place.track, page: s().pages.instrument });
			rec.do('sample');
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
	if (/^m1\.[1-4]$/.test(id) || id === 'midi.program' || /^key\d*\./.test(id)) {
		return { area: 'instrument', track, page: 1 };
	}
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
 * Whether {@link planParam} can set the parameter with this id: a tempo value, an engine or preset
 * load, a list pick, a parameter of an instrument track's pages, a drum key's setting (`key.tune`,
 * or `key3.tune` for one key) or a sampler's region value (`sample.start`).
 */
export function plannable(id: string): boolean {
	if (id in TEMPO_PARAMS || id === 'engine' || id === 'preset' || id in PICKERS) return true;
	if (regionParam(id)) return true;
	const drum = /^key\.(\w+)$/.exec(id);
	if (drum) return (KEY_FIELDS as readonly string[]).includes(drum[1]);
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

/** A reading as a number ("+1.50", "–08", "x4", "12.5%"), or NaN for words ("1/16", "off"). */
function readingNumber(reading: string): number {
	const m = /^x?([+\-–−]?\d+(?:\.\d+)?)%?$/.exec(reading.trim());
	return m ? Number(m[1].replace(/^[–−]/, '-').replace(/^\+/, '')) : NaN;
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
	const n = typeof goal === 'number' ? goal : readingNumber(goal);
	if (!Number.isFinite(n)) return null;
	// the number as the screen shows it (parameter 1 is stored as 0, a synced speed as its place
	// in the list, a sample's point as a percentage): the reading nearest it; where the readings
	// are words, the parameter's own units
	let nearest: number | null = null;
	let gap = Infinity;
	for (let v = min; v <= max + 1e-9; v += step) {
		const shown = readingNumber(format(v));
		if (Number.isFinite(shown) && Math.abs(shown - n) < gap)
			[nearest, gap] = [v, Math.abs(shown - n)];
	}
	return nearest ?? Math.min(max, Math.max(min, n));
}

/**
 * Whether a value reads as the goal: as the target does, or as the goal is written (a sample's
 * start stops a tenth of a percent before its end, off the detents' grid: "99.9%").
 */
const readsAs =
	(format: (v: number) => string, target: number, goal: number | string) => (v: number) =>
		format(v) === format(target) || hit(format(v), goal);

/**
 * Which way a detent of `keys` moves the value toward `target`: +1 when clockwise raises it, −1
 * when clockwise lowers it (a sample's direction: counter-clockwise is reverse), tried on copies;
 * 0 when neither way gets closer.
 */
function senseOf(
	sim: OpxySim,
	keys: string,
	read: (sim: OpxySim) => number,
	target: number
): 1 | -1 | 0 {
	const now = read(sim);
	const toward = now < target ? 1 : -1;
	for (const dir of [toward, -toward]) {
		const trial = copy(sim.state);
		play(trial, keys, dir);
		if (Math.abs(read(trial) - target) < Math.abs(now - target)) return dir === toward ? 1 : -1;
	}
	return 0;
}

/** Turns encoder `e` one detent at a time until `read` gives `target` (or stops moving). */
function turnTo(
	rec: Recorder,
	e: number,
	shift: boolean,
	read: (sim: OpxySim) => number,
	target: number,
	matches: (v: number) => boolean
): boolean {
	const keys = `${shift ? 'shift + ' : ''}turn E${e + 1}`;
	const sim = rec.sim;
	if (matches(read(sim))) return true;
	const sense = senseOf(sim, keys, read, target);
	if (sense === 0) return false;
	let clicks = 0;
	// a sampler's tune runs 960 detents end to end
	for (let guard = 0; guard < 1000 && !matches(read(sim)); guard++) {
		const before = read(sim);
		const dir = (before < target ? 1 : -1) * sense;
		play(sim, keys, dir);
		clicks += dir;
		if (read(sim) === before) break;
	}
	if (clicks !== 0) rec.steps.push({ keys, clicks, screen: screenOf(sim) });
	return matches(read(sim));
}

/**
 * A keyboard key (0–23) by its name at the default octave ("G3", "key F#3", "Bb3"), the name of the
 * sample it holds on track `track` ("snare 1"), or its number (1–24, or 53–76 as a MIDI note);
 * null when there is no such key.
 */
export function keyIndexOf(s: SimState, track: number, key: number | string): number | null {
	const text = String(key).trim().toLowerCase();
	if (/^\d+$/.test(text)) {
		const n = Number(text);
		if (n >= 1 && n <= 24) return n - 1;
		const at = n - KEYBOARD_FIRST_NOTE;
		return at >= 0 && at < 24 ? at : null;
	}
	const name = text.replace(/^key\s+/, '');
	const note = /^([a-g])(#|♯|s|b|♭)?(\d)$/.exec(name);
	if (note) {
		const pitch = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[note[1] as 'c'];
		const accidental = note[2] === undefined ? 0 : /[b♭]/.test(note[2]) ? -1 : 1;
		const at = 12 * (Number(note[3]) + 1) + pitch + accidental - KEYBOARD_FIRST_NOTE;
		return at >= 0 && at < 24 ? at : null;
	}
	const bare = (file: string) => file.toLowerCase().replace(/\.[a-z0-9]+$/, '');
	const files = s.areas.sample.tracks[track - 1]?.keys ?? [];
	const at = files.findIndex((file) => file !== null && bare(file.name) === bare(name));
	return at >= 0 ? at : null;
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

/**
 * The library's preset a name stands for: its key ("pluck/beach bum") or its name alone when only
 * one preset has it; or why there is none.
 */
function presetNamed(s: SimState, value: number | string): PresetEntry | string {
	const want = String(value).trim().toLowerCase();
	const library = s.areas.system.presets.library;
	const byKey = library.find((p) => presetKey(p).toLowerCase() === want);
	if (byKey) return byKey;
	const named = library.filter((p) => p.name.toLowerCase() === want);
	if (named.length === 1) return named[0];
	if (named.length > 1)
		return `"${value}" names ${named.map(presetKey).join(', ')}: give its folder`;
	return `no preset "${value}" in the library`;
}

/**
 * Loads a preset by name from the browser shift + M1 brings up, in the view it shows: E1 to the
 * preset's engine (or its category), E2 to the preset, and a click of E2 loads it and leaves the
 * browser for M1 (research 59 §2.6). Like an engine, it replaces the whole sound; factory presets
 * other than a new project's eight load their engine's starting sound here (catalogue.ts).
 */
function planPreset(rec: Recorder, track: number, value: number | string): NavPlan {
	const preset = presetNamed(rec.sim.state, value);
	if (typeof preset === 'string') return rec.plan(false, preset);
	const key = presetKey(preset);
	const loaded = () => rec.sim.state.areas.system.trackPresets[track - 1] === key;
	const b = () => rec.sim.state.areas.system.presets;
	walk(rec, { area: 'instrument', track, page: rec.sim.state.pages.instrument });
	if (loaded()) return rec.plan(true, `already ${key}`);
	rec.do('shift + M1');
	// a preset kept without a category shows in engine view only
	if (b().view === 'category' && !preset.folder) rec.do('click E1');
	const group = b().view === 'engine' ? preset.engine : preset.folder;
	const from = currentGroup(b()).index;
	const to = groups(b()).indexOf(group);
	if (to !== from) rec.do('turn E1', to - from);
	const row = presetsIn(b(), group).findIndex((p) => presetKey(p) === key);
	if (row !== b().row) rec.do('turn E2', row - b().row);
	rec.do('click E2');
	return rec.plan(loaded(), loaded() ? undefined : `the preset browser did not load ${key}`);
}

/** The region a sampler track's M1 edits for `key` (the multisampler's zone), or null. */
function regionOf(s: SimState, track: number, key: number | null): Region | null {
	const t = s.tracks[track - 1];
	const area = s.areas.sample;
	const st = area.tracks[track - 1];
	if (t.engine === 'sampler') return st.synth.region;
	if (t.engine === 'multisampler') {
		return zoneOf(st.zones, keyNote(area, key ?? t.drumKey))?.zone.region ?? null;
	}
	return null;
}

/** Sets a value of the synth sampler's sample or a multisampler zone on M1. */
function planRegion(
	rec: Recorder,
	track: number,
	key: number | null,
	region: RegionParam,
	value: number | string
): NavPlan {
	const engine = rec.sim.state.tracks[track - 1].engine;
	if (engine !== 'sampler' && engine !== 'multisampler') {
		return rec.plan(
			false,
			`${region.id} is the synth sampler's and the multisampler's; track ${track} runs ${engine}`
		);
	}
	walk(rec, { area: 'instrument', track, page: 1 });
	// the multisampler edits the zone of the key played last
	if (
		engine === 'multisampler' &&
		key !== null &&
		rec.sim.state.tracks[track - 1].drumKey !== key
	) {
		rec.do(`key ${keyName(key)}`);
	}
	const read = (sim: OpxySim) => {
		const r = activeRegion(sim.state);
		return r ? region.get(r) : NaN;
	};
	if (!activeRegion(rec.sim.state)) {
		return rec.plan(false, `no zone on ${keyName(key ?? rec.sim.state.tracks[track - 1].drumKey)}`);
	}
	const target = targetValue(value, region.format, region.min, region.max, region.step);
	if (target === null) return rec.plan(false, `"${value}" is not a value of ${region.id}`);
	const ok = turnTo(
		rec,
		region.encoder,
		region.shift,
		read,
		target,
		readsAs(region.format, target, value)
	);
	return rec.plan(ok, ok ? undefined : `${region.id} stopped at ${region.format(read(rec.sim))}`);
}

/** Steps that set a parameter to a value, run on a copy of the simulator. */
export function planParam(state: SimState, goal: ParamGoal): NavPlan {
	const track = goal.track ?? state.track + 1;
	const id = findParam(goal.param, state, track, goal.value);
	const rec = new Recorder(copy(state));
	if (!id) {
		// not a sound parameter: a value one of the track's pages shows by that name (the midi
		// engine's channel and CC slots, a duck's source type, a sampler's loop type)
		const shown = planPageValue(state, {
			area: 'instrument',
			track,
			...(goal.page ? { page: goal.page } : {}),
			label: goal.param,
			value: goal.value
		});
		if (shown.reached || !/^no page shows/.test(shown.note ?? '')) return shown;
		return rec.plan(
			false,
			`no parameter "${goal.param}"; try one of: ${PARAMS.map((p) => p.id).join(', ')}`
		);
	}

	const tempo = TEMPO_PARAMS[id];
	if (tempo) {
		walk(rec, { area: 'tempo' });
		const target = targetValue(goal.value, tempo.format, tempo.min, tempo.max, tempo.step);
		if (target === null) return rec.plan(false, `"${goal.value}" is not a value of ${id}`);
		const read = (sim: OpxySim) => tempo.get(sim.state);
		const ok = turnTo(rec, tempo.encoder, false, read, target, (v) => Math.abs(v - target) < 0.05);
		return rec.plan(ok, ok ? undefined : `${id} stopped at ${tempo.format(read(rec.sim))}`);
	}

	if (id === 'engine') return planEngine(rec, track, goal.value);
	if (id === 'preset') return planPreset(rec, track, goal.value);

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

	const engine = state.tracks[track - 1]?.engine;
	if (engine === undefined) return rec.plan(false, `no instrument track ${track}`);
	const key = goal.key === undefined ? null : keyIndexOf(state, track, goal.key);
	if (goal.key !== undefined && key === null) {
		return rec.plan(false, `no key "${goal.key}": give its name (G3), its sample's or 1–24`);
	}
	const region = regionParam(id);
	if (region) return planRegion(rec, track, key, region, goal.value);
	// a drum key's setting: the key goes first (pressed on M1, it is the one the page edits)
	let lockId = id;
	const drum = /^key(\d*)\.(\w+)$/.exec(id);
	if (drum) {
		if (engine !== 'drum') {
			return rec.plan(false, `${id} is a drum key's setting; track ${track} runs ${engine}`);
		}
		const k = drum[1] ? Number(drum[1]) : (key ?? state.tracks[track - 1].drumKey);
		lockId = `key${k}.${drum[2]}`;
		walk(rec, { area: 'instrument', track, page: 1 });
		if (rec.sim.state.tracks[track - 1].drumKey !== k) rec.do(`key ${keyName(k)}`);
	}
	const place = placeOfParam(lockId, track);
	const p: LockParam | null = lockParam(lockId);
	if (!place || !p) return rec.plan(false, `${id} is not a parameter the navigator can set yet`);
	walk(rec, place);
	if (!isAt(rec.sim.state, place)) return rec.plan(false, 'could not reach the page');
	// a filter or LFO that is off does nothing: M3 / M4 again on its page switches it on
	const module = rec.sim.state.tracks[track - 1];
	if (lockId.startsWith('filter.') && !module.filter.on) rec.do('M3');
	if (lockId.startsWith('lfo.') && !module.lfo.on) rec.do('M4');
	const where = encoderFor(rec.sim, lockId);
	if (!where) {
		return rec.plan(
			false,
			`no encoder sets ${id} on this track now (its engine or LFO type has no such parameter)`
		);
	}
	const lock = where.lock;
	const target = targetValue(goal.value, lock.format, lock.min, lock.max, lock.step);
	if (target === null) return rec.plan(false, `"${goal.value}" is not a value of ${id}`);
	const read = (sim: OpxySim) => lock.get(sim.state.tracks[track - 1]);
	// compare as the screen shows it, so 40 on a 0–99 lane stops where the page reads 40
	const ok = turnTo(
		rec,
		where.e,
		where.shift,
		read,
		target,
		readsAs(lock.format, target, goal.value)
	);
	return rec.plan(ok, ok ? undefined : `${id} stopped at ${lock.format(read(rec.sim))}`);
}

/**
 * Whether the setting `goal` names already reads its value (a filter or LFO also switched on; a
 * page's value as that page shows it).
 */
export function reads(state: SimState, goal: SettingGoal): boolean {
	if ('label' in goal) return readsPage(state, goal);
	const track = goal.track ?? state.track + 1;
	const id = findParam(goal.param, state, track, goal.value);
	if (!id) {
		return readsPage(state, {
			area: 'instrument',
			track,
			...(goal.page ? { page: goal.page } : {}),
			label: goal.param,
			value: goal.value
		});
	}
	const tempo = TEMPO_PARAMS[id];
	if (tempo) {
		const target = targetValue(goal.value, tempo.format, tempo.min, tempo.max, tempo.step);
		return target !== null && Math.abs(tempo.get(state) - target) < 0.05;
	}
	const t = state.tracks[track - 1];
	if (!t) return false;
	if (id === 'engine') return t.engine === String(goal.value).trim().toLowerCase();
	if (id === 'preset') {
		const preset = presetNamed(state, goal.value);
		return (
			typeof preset !== 'string' && state.areas.system.trackPresets[track - 1] === presetKey(preset)
		);
	}
	const picker = PICKERS[id];
	if (picker) return picker.get(t) === String(goal.value).trim().toLowerCase();
	const key = goal.key === undefined ? null : keyIndexOf(state, track, goal.key);
	if (goal.key !== undefined && key === null) return false;
	const region = regionParam(id);
	if (region) {
		const r = regionOf(state, track, key);
		const target = targetValue(goal.value, region.format, region.min, region.max, region.step);
		return (
			r !== null && target !== null && readsAs(region.format, target, goal.value)(region.get(r))
		);
	}
	const drum = /^key(\d*)\.(\w+)$/.exec(id);
	if (drum && t.engine !== 'drum') return false;
	const lockId = drum ? `key${drum[1] ? Number(drum[1]) : (key ?? t.drumKey)}.${drum[2]}` : id;
	const p = lockParam(lockId);
	if (!p || !placeOfParam(lockId, track)) return false;
	if (lockId.startsWith('filter.') && !t.filter.on) return false;
	if (lockId.startsWith('lfo.') && !t.lfo.on) return false;
	const target = targetValue(goal.value, p.format, p.min, p.max, p.step);
	return target !== null && readsAs(p.format, target, goal.value)(p.get(t));
}

/** A setting of any kind: an instrument or tempo parameter, or a value another page shows. */
export type SettingGoal = ParamGoal | PageValueGoal;

/** A setting's name, as the plan reports it. */
export const goalName = (goal: SettingGoal): string => ('label' in goal ? goal.label : goal.param);

/** Plans one setting of any kind. */
const planGoal = (state: SimState, goal: SettingGoal): NavPlan =>
	'label' in goal ? planPageValue(state, goal) : planParam(state, goal);

/**
 * Steps that make several settings in order (a sound set up from an idea: a pluck, a duck; a song
 * from scenes), each planned from where the steps before it leave a copy of the simulator. A goal
 * that cannot be reached adds no steps; the others still run.
 */
export function planSettings(state: SimState, goals: readonly SettingGoal[]): SettingsPlan {
	const sim = copy(state);
	const parts: SettingPart[] = [];
	for (const goal of goals) {
		// one that already reads its value needs no steps, not even a trip to its page
		if (reads(sim.state, goal)) {
			parts.push({ goal, steps: [], reached: true, note: 'already set' });
			continue;
		}
		const plan = planGoal(sim.state, goal);
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
			? { note: failed.map((p) => `${goalName(p.goal)}: ${p.note ?? 'not reached'}`).join('; ') }
			: {})
	};
}

// ─────────────────────────────────────────────────────────────────── values on the other pages

/** The parts of the device {@link planPageValue} finds values on by name. */
export type PageArea =
	'instrument' | 'auxiliary' | 'mix' | 'player' | 'arrange' | 'bar' | 'sample' | 'com';

/**
 * A value a page shows, named the way the page's screen names it ("size" on FX II, "speed" on the
 * tape, "low" on the master EQ, "level" on mix M1, "style" on the player's shift layer, "track 5"
 * on the brain's routing, "source" on the record page). No table says which encoder carries it:
 * the navigator turns each one on a copy and watches the page. A few are set with keys of their
 * own ({@link specialOf}): the player's "type"; arrange's "pattern", "scene", "song" and "loop";
 * the sample area's "even slices" and "transient slices"; the bar menu's "track scale" and "bars".
 */
export interface PageValueGoal {
	readonly area: PageArea;
	/**
	 * Auxiliary track 1–8; on mix M1, arrange and the bar menu the track, 1–16 (9–16 auxiliary);
	 * for the instrument pages, the player and the sample area, the instrument track 1–8.
	 */
	readonly track?: number;
	/** The M-page; default: the first page that shows the value. */
	readonly page?: PageNumber;
	readonly label: string;
	readonly value: number | string;
	/** The drum key slicing starts from, as {@link ParamGoal.key} names keys. */
	readonly key?: number | string;
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

const onOff = (on: boolean) => (on ? 'on' : 'off');
const picked = (column: { readonly items: readonly string[]; readonly selected: number | null }) =>
	column.selected === null ? undefined : column.items[column.selected];

/**
 * Values a page draws that its description leaves out or runs together, read off the frame and
 * named as the page names them: a list's boxed item, the brain's mode and link box, a routing
 * page's track boxes (the four the encoders reach), CC slots, an LFO's speed card, the player's
 * cards, a filter, LFO or player switched on or off, the record page, the slicer, arrange's
 * pattern and the bar card. The device map labels its controls with the same names.
 */
export function frameValues(frame: ScreenFrame): Map<string, string> {
	const out = new Map<string, string>();
	const put = (label: string, value: string | null | undefined) => {
		if (value !== null && value !== undefined) out.set(label, value);
	};
	switch (frame.page) {
		case 'list':
			put('type', frame.columns[1] && picked(frame.columns[1]));
			break;
		case 'system-presets':
			put(frame.view, picked(frame.groups));
			put('preset', picked(frame.presets));
			break;
		case 'aux-fx-list':
			put('effect', frame.items[frame.selected]);
			break;
		case 'aux-brain':
			put('mode', frame.auto ? 'auto' : 'manual');
			put('root', frame.root);
			put('scale', frame.scale);
			put('link', frame.link ?? 'off');
			break;
		case 'aux-audio':
			put('input', frame.input);
			// E1's click switches the chosen input on or off (manual: external-audio)
			put('input on', onOff(frame.on));
			break;
		case 'aux-route':
			for (let i = frame.half * 4; i < frame.half * 4 + 4; i++) {
				const t = frame.tracks[i];
				put(`track ${i + 1}`, t.value || (t.routed ? 'in' : 'out'));
			}
			break;
		case 'aux-cc':
			frame.slots.forEach((slot, e) => {
				const n = (frame.set === 'II' ? 4 : 0) + e + 1;
				put(`cc slot ${n} number`, slot.cc === null ? 'off' : String(slot.cc));
				put(`cc slot ${n}`, slot.cc === null ? 'off' : slot.value);
			});
			break;
		case 'midi-engine-cc':
			// shift shows the slots' CC numbers in the boxes
			frame.slots.forEach((slot, e) => {
				const n = (frame.set - 1) * 4 + e + 1;
				put(frame.shift ? `cc slot ${n} number` : `cc slot ${n}`, slot.value ?? 'off');
			});
			break;
		case 'aux-lfo':
			put('speed', frame.speed.synced ? frame.speed.label : two(frame.speed.position * 99));
			put('amount', String(Math.round(frame.amount)));
			put('destination', frame.destinations[frame.destination]);
			// the card names the parameter; where it cannot ("-", or external MIDI's "no cc set"
			// while its slots have none), which encoder of the page it is
			put(
				'parameter',
				/^(-|no cc set)$/.test(frame.parameterName)
					? `E${frame.parameter + 1}`
					: frame.parameterName
			);
			put('lfo', onOff(!frame.off));
			break;
		case 'aux-filter':
			put('filter', onOff(!frame.off));
			break;
		case 'filter':
			put('filter', onOff(!frame.off));
			break;
		case 'lfo':
			put('lfo', onOff(!frame.off));
			// the duck's trigger: the source track's audio or its notes (manual: lfo-duck)
			if (frame.type === 'duck')
				put('source type', frame.sourceAudio === false ? 'notes' : 'audio');
			break;
		case 'drum':
			if (frame.sampler?.loop) put('loop type', frame.sampler.loop.type);
			break;
		case 'player':
			put('type', frame.type);
			put('player', onOff(frame.on));
			for (const card of frame.cards) if (card.label) put(card.label, card.value);
			break;
		case 'com':
			put('bluetooth advertising', onOff(frame.advertising));
			put('multi-out', frame.multiOut);
			put('charging', onOff(frame.charging));
			break;
		case 'mix':
			// the selected strip's mute, which a click of E4 switches (manual: mute-solo)
			put('mute', frame.strips[frame.selected] && onOff(frame.strips[frame.selected].muted));
			break;
		case 'sample-record':
			put('source', frame.source);
			put('gain', frame.gain);
			put('threshold', two(frame.threshold * 99));
			put('channel', frame.channel);
			break;
		case 'sample-slice':
			put('mode', frame.mode);
			put('slices', frame.count);
			break;
		case 'arrange': {
			put('scene', frame.scene);
			const column = frame.columns.find((c) => c.selected);
			if (column) {
				put('pattern', String(column.pattern));
				put('patterns', String(column.patterns));
				put('sound link', onOff(column.linked));
				put('mute', onOff(column.muted));
			}
			break;
		}
		case 'song':
			put('song', String(frame.song));
			put('loop', onOff(frame.loop));
			put('scenes', String(frame.length));
			break;
		case 'bar':
			for (const cell of frame.header) put(cell.label, cell.value);
			put('track scale', frame.scale);
			put('bars', String(frame.bars));
			put('steps', String(frame.length));
			break;
	}
	return out;
}

/**
 * What the screen shows as values: its description's, with the frame's over them. A reading of
 * several words ("pattern play order") splits wrongly in the description; the frame's label wins
 * and the wrong split goes.
 */
function screenValues(sim: OpxySim): Map<string, string> {
	const frame = buildFrame(sim.state);
	const values = pageValues(describeFrame(frame));
	const drawn = frameValues(frame);
	for (const label of [...values.keys()]) {
		if ([...drawn.keys()].some((d) => label.startsWith(`${d} `))) values.delete(label);
	}
	for (const [label, value] of drawn) values.set(label, value);
	return values;
}

/** The words a value is asked for by ("fx 2 send" → fx, ii, send). */
const wordsOf = (wanted: string) =>
	wanted
		.trim()
		.toLowerCase()
		.replace(/\bfx ?(1|one)\b/, 'fx i')
		.replace(/\bfx ?(2|two)\b/, 'fx ii')
		.split(/\s+/);

/**
 * The label a page uses for `wanted`: the whole phrase, then its shorter runs of words, longest
 * first and, among runs as long, the last (the noun after its modifiers: "fx ii send" → "fx ii",
 * "reverb size" → "size", "lfo amount" → "amount" on the LFO page, which also reads "lfo" on or
 * off).
 */
function pageLabel(values: Map<string, string>, wanted: string): string | null {
	const words = wordsOf(wanted);
	for (let length = words.length; length > 0; length--) {
		for (let start = words.length - length; start >= 0; start--) {
			const label = words.slice(start, start + length).join(' ');
			if (values.has(label)) return label;
		}
	}
	return null;
}

/** How a page's values are seen and set: the bar card shows only while bar is held. */
interface Access {
	/** A key held down to see the page. */
	readonly held?: string;
	/** Written before each gesture ("bar + turn E1"). */
	readonly prefix: string;
}

const PLAIN: Access = { prefix: '' };
const BAR_HELD: Access = { held: 'key.bar', prefix: 'bar + ' };
const accessOf = (goal: PageValueGoal): Access => (goal.area === 'bar' ? BAR_HELD : PLAIN);

/** A page's values, with shift held for its shift layer (read on a copy). */
function valuesOf(sim: OpxySim, shifted = false, access: Access = PLAIN): Map<string, string> {
	if (!shifted && !access.held) return screenValues(sim);
	const view = copy(sim.state);
	if (access.held) view.input({ type: 'press', id: access.held });
	if (shifted) view.input({ type: 'press', id: 'key.shift' });
	return screenValues(view);
}

const readValue = (sim: OpxySim, label: string, access: Access, shifted = false) =>
	valuesOf(sim, shifted, access).get(label);

/**
 * Whether a reading is `value`: as numbers where both are ("+10", "–08", "50%"; a number before a
 * unit, "3 oct", when the value is a bare number), else as words.
 */
function hit(reading: string | undefined, value: number | string): boolean {
	if (reading === undefined) return false;
	const target = typeof value === 'number' ? value : readingNumber(value);
	const now = readingNumber(reading);
	if (Number.isFinite(target) && Number.isFinite(now)) return now === target;
	const unit = /^([+\-–−]?\d+(?:\.\d+)?) [a-z]+$/.exec(reading.trim());
	if (Number.isFinite(target) && unit) return readingNumber(unit[1]) === target;
	return reading.toLowerCase() === String(value).trim().toLowerCase();
}

/** A gesture that moves a value: a turn (detents counted), or a press repeated (a click, a key). */
interface Move {
	readonly keys: string;
	readonly turn: boolean;
}

/**
 * The key that switches the page's module on and off where the simulator stands: M3 or M4 on its
 * own page (a filter, an LFO), player on the player page; null elsewhere.
 */
function pageKey(s: SimState): string | null {
	if (s.overlay === 'players' && s.sub === null) return 'player';
	if (!idle(s) || (s.mode !== 'instrument' && s.mode !== 'auxiliary')) return null;
	const page = s.pages[s.mode];
	return page === 3 || page === 4 ? `M${page}` : null;
}

/**
 * The gestures that move `label` where the simulator stands, the most direct first: turns on the
 * page's layer (then with shift), clicks, then the page's own key; among turns, the encoder that
 * moves fewest other values goes first (on an LFO, E4 sets the parameter where E3's destination
 * also resets it). A turn counts when a detent each way reads differently (or differs from now),
 * so an encoder that only calls up the popup showing the value (mix M1's sends) does not.
 */
function movesOf(sim: OpxySim, label: string, access: Access, shifted: boolean): Move[] {
	const read = (trial: OpxySim) => valuesOf(trial, shifted, access);
	const before = read(sim);
	const found: { move: Move; rank: number; others: number }[] = [];
	const layers = shifted ? [true] : [false, true];
	layers.forEach((shift, layer) => {
		for (let e = 1; e <= 4; e++) {
			const keys = `${access.prefix}${shift ? 'shift + ' : ''}turn E${e}`;
			const [up, down] = [1, -1].map((dir) => {
				const trial = copy(sim.state);
				play(trial, keys, dir);
				return read(trial);
			});
			const [u, d, now] = [up.get(label), down.get(label), before.get(label)];
			const moved = u !== d || (now !== undefined && u !== undefined && u !== now);
			if (!moved || (u === undefined && d === undefined)) continue;
			const labels = new Set([...up.keys(), ...down.keys()]);
			const others = [...labels].filter((l) => l !== label && up.get(l) !== down.get(l)).length;
			found.push({ move: { keys, turn: true }, rank: layer, others });
		}
	});
	const key = access.held ? null : pageKey(sim.state);
	const presses = [
		...[1, 2, 3, 4].map((e) => `${access.prefix}click E${e}`),
		...(access.held ? [] : [1, 2, 3, 4].map((e) => `shift + click E${e}`)),
		...(key ? [key] : [])
	];
	for (const keys of presses) {
		const trial = copy(sim.state);
		play(trial, keys);
		const after = read(trial);
		if (after.get(label) === undefined || after.get(label) === before.get(label)) continue;
		const labels = new Set([...before.keys(), ...after.keys()]);
		const others = [...labels].filter((l) => l !== label && after.get(l) !== before.get(l)).length;
		found.push({ move: { keys, turn: false }, rank: 2, others });
	}
	return found.sort((a, b) => a.rank - b.rank || a.others - b.others).map((f) => f.move);
}

/**
 * The detents (+ clockwise) that make `label` read `value`, tried on copies: numbers are
 * approached from whichever side gets closer (the nearest reading when the exact one is skipped),
 * words are searched clockwise, then counter-clockwise. A dial whose readings start over (an
 * LFO's synced steps, then its free range from 00) is followed into the new run. Null when it
 * never reads it.
 */
function detentsTo(
	sim: OpxySim,
	keys: string,
	label: string,
	value: number | string,
	access: Access = PLAIN,
	shifted = false
): number | null {
	const target = typeof value === 'number' ? value : readingNumber(value);
	// a reading as a number, or NaN for words
	const num = (v: string | undefined) => (v === undefined ? NaN : readingNumber(v));
	if (hit(readValue(sim, label, access, shifted), value)) return 0;
	for (const dir of [1, -1]) {
		const trial = copy(sim.state);
		// (a popup's value can be missing until the first detent calls the popup up)
		let last = readValue(trial, label, access, shifted);
		let still = 0;
		let trend = 0;
		for (let n = 1; n <= 400; n++) {
			play(trial, keys, dir);
			const v = readValue(trial, label, access, shifted);
			if (hit(v, value)) return n * dir;
			const [now, before] = [num(v) - target, num(last) - target];
			if (Number.isFinite(now) && Number.isFinite(before) && now !== before) {
				const change = Math.sign(now - before);
				const restarted = trend !== 0 && change !== trend;
				trend = change;
				if (!restarted) {
					if (Math.sign(now) !== Math.sign(before)) {
						// stepped over the value: stop at the closer reading
						return (Math.abs(now) <= Math.abs(before) ? n : n - 1) * dir;
					}
					if (Math.abs(now) > Math.abs(before)) break; // moving away: the other way
				}
			}
			still = v === last ? still + 1 : 0;
			if (still >= 12) break; // the end of its range
			last = v;
		}
	}
	return null;
}

/** How many presses of `keys` (a click that steps a choice, a key that switches) read `value`. */
function pressesTo(
	sim: OpxySim,
	keys: string,
	label: string,
	value: number | string,
	access: Access,
	shifted: boolean
): number | null {
	const trial = copy(sim.state);
	for (let n = 0; n <= 8; n++) {
		if (hit(readValue(trial, label, access, shifted), value)) return n;
		play(trial, keys);
	}
	return null;
}

/** A label only a popup shows (mix M1's sends appear once E1 or E2 turns), found on copies. */
function revealed(sim: OpxySim, wanted: string, access: Access): string | null {
	for (let e = 1; e <= 4; e++) {
		const trial = copy(sim.state);
		play(trial, `${access.prefix}turn E${e}`, 1);
		const label = pageLabel(valuesOf(trial, false, access), wanted);
		if (label) return label;
	}
	return null;
}

/**
 * Where the page shows `wanted`: on the page, in a popup a turn calls up, on its shift layer (when
 * it names more of it: "cc slot 2 number" over the page's "cc slot 2"), or on the page's other view
 * a click away (a routing page's tracks 5–8), which `rec` then clicks to.
 */
function locate(
	rec: Recorder,
	wanted: string,
	access: Access
): { label: string; shifted: boolean } | null {
	const base =
		pageLabel(valuesOf(rec.sim, false, access), wanted) ?? revealed(rec.sim, wanted, access);
	const shifted = pageLabel(valuesOf(rec.sim, true, access), wanted);
	const size = (label: string | null) => (label === null ? 0 : label.split(' ').length);
	if (base && size(base) >= size(shifted)) return { label: base, shifted: false };
	if (shifted) return { label: shifted, shifted: true };
	if (access.held) return null;
	const page = buildFrame(rec.sim.state).page;
	for (let e = 1; e <= 4; e++) {
		const trial = copy(rec.sim.state);
		play(trial, `click E${e}`);
		if (buildFrame(trial.state).page !== page) continue;
		const label = pageLabel(valuesOf(trial), wanted);
		if (!label) continue;
		rec.do(`click E${e}`);
		return { label, shifted: false };
	}
	return null;
}

/** Whether the page shows its filter or LFO switched off (the auxiliary tracks' included). */
function moduleOff(sim: OpxySim): boolean {
	const frame = buildFrame(sim.state);
	return (
		(frame.page === 'filter' ||
			frame.page === 'lfo' ||
			frame.page === 'aux-filter' ||
			frame.page === 'aux-lfo') &&
		frame.off === true
	);
}

/** Track `track` (1–16) selected on its mode's page, where the bar menu edits its pattern. */
function selectTrack(rec: Recorder, track: number): void {
	const s = rec.sim.state;
	if (track > 8) walk(rec, { area: 'auxiliary', track: track - 8, page: s.pages.auxiliary });
	else walk(rec, { area: 'instrument', track, page: s.pages.instrument });
}

/**
 * Arrange's pattern view with track `track` (1–16) selected: arrange pressed again swaps the track
 * keys between the two sets.
 */
function selectArrangeTrack(rec: Recorder, track: number): void {
	walk(rec, { area: 'arrange' });
	const bank = track > 8 ? 'auxiliary' : 'instrument';
	if (rec.sim.state.banks.arrange !== bank) rec.do('arrange');
	const index = (track - 1) % 8;
	const s = rec.sim.state;
	if ((bank === 'instrument' ? s.track : s.auxTrack) !== index) rec.do(`T${index + 1}`);
}

/** The track the bar menu would edit now, 1–16. */
const activeTrack = (s: SimState) => (s.active === 'auxiliary' ? s.auxTrack + 9 : s.track + 1);

/** Walks to the page (and on mix M1 and arrange the track) of a page-value goal, or says why not. */
function walkToPage(rec: Recorder, goal: PageValueGoal, page: PageNumber): string | null {
	const s = rec.sim.state;
	switch (goal.area) {
		case 'player':
		case 'sample': {
			const track = goal.track ?? s.track + 1;
			if (track > 8) return `${goal.area === 'player' ? 'players' : 'sampling'} are on tracks 1–8`;
			walk(rec, goal.area === 'player' ? { area: 'player', track } : { area: 'sample', track });
			return null;
		}
		case 'instrument':
			walk(rec, { area: 'instrument', track: goal.track ?? s.track + 1, page });
			return null;
		case 'auxiliary':
			walk(rec, { area: 'auxiliary', track: goal.track ?? s.auxTrack + 1, page });
			return null;
		case 'com':
			walk(rec, { area: 'com' });
			return null;
		case 'bar':
			selectTrack(rec, goal.track ?? activeTrack(s));
			return null;
		case 'arrange':
			if (goal.track !== undefined) selectArrangeTrack(rec, goal.track);
			else walk(rec, { area: 'arrange' });
			return null;
		case 'mix': {
			walk(rec, { area: 'mix', page });
			if (goal.track === undefined || page !== 1) return null;
			const bank = goal.track > 8 ? 'auxiliary' : 'instrument';
			// pressed again, mix swaps the track keys between the two sets
			if (rec.sim.state.banks.mix !== bank) rec.do('mix');
			const index = (goal.track - 1) % 8;
			const now = rec.sim.state;
			if ((bank === 'instrument' ? now.track : now.auxTrack) !== index) rec.do(`T${index + 1}`);
			return null;
		}
	}
}

/** The pages a goal's value may be on: the one given, or all four where there are four. */
function pagesOf(goal: PageValueGoal): readonly PageNumber[] {
	if (goal.area !== 'instrument' && goal.area !== 'auxiliary' && goal.area !== 'mix') return [1];
	return goal.page ? [goal.page] : [1, 2, 3, 4];
}

/** The page a goal's value is on, in words. */
function whereOf(goal: PageValueGoal, page: PageNumber): string {
	switch (goal.area) {
		case 'player':
			return 'the player page';
		case 'sample':
			return 'the record page';
		case 'bar':
			return 'the bar menu';
		case 'com':
			return 'com';
		case 'arrange':
			return 'arrange';
		default:
			return `M${page}`;
	}
}

/**
 * How well a page answers `wanted`: the words its label takes, and the others its heading has
 * ("lfo speed" is the page headed "lfo", not the tape's own speed on M1).
 */
function matchOf(sim: OpxySim, label: string, wanted: string): number {
	const heading = describeFrame(buildFrame(sim.state))
		.split(':')[0]
		.toLowerCase()
		.split(/[\s,]+/);
	const taken = label.split(' ');
	const rest = wordsOf(wanted).filter((w) => !taken.includes(w) && heading.includes(w));
	return taken.length + rest.length;
}

/** The page that shows a goal's value (walked to on a copy), or the values the pages do show. */
type Found =
	| {
			readonly rec: Recorder;
			readonly label: string;
			readonly shifted: boolean;
			readonly where: string;
	  }
	| { readonly rec: null; readonly refused?: string; readonly seen: readonly string[] };

function findPage(state: SimState, goal: PageValueGoal, access: Access): Found {
	let best: {
		rec: Recorder;
		label: string;
		shifted: boolean;
		where: string;
		match: number;
	} | null = null;
	const seen: string[] = [];
	for (const page of pagesOf(goal)) {
		const rec = new Recorder(copy(state));
		const refused = walkToPage(rec, goal, page);
		if (refused) return { rec: null, refused, seen };
		const where = whereOf(goal, page);
		const found = locate(rec, goal.label, access);
		if (!found) {
			const names = new Set([
				...valuesOf(rec.sim, false, access).keys(),
				...valuesOf(rec.sim, true, access).keys()
			]);
			seen.push(...[...names].map((k) => `${k} (${where})`));
			continue;
		}
		const match = matchOf(rec.sim, found.label, goal.label);
		if (!best || match > best.match) best = { rec, ...found, where, match };
	}
	return best ?? { rec: null, seen };
}

/**
 * Steps that set a value a page shows, run on a copy of the simulator. When the exact reading is
 * skipped, the steps stop at the nearest one.
 */
export function planPageValue(state: SimState, goal: PageValueGoal): NavPlan {
	const special = specialOf(goal);
	if (special) return special.plan(state, goal);
	const access = accessOf(goal);
	const found = findPage(state, goal, access);
	if (!found.rec) {
		const rec = new Recorder(copy(state));
		if (found.refused) return rec.plan(false, found.refused);
		const seen = found.seen.length ? `; these do: ${found.seen.join(', ')}` : '';
		return rec.plan(false, `no page shows "${goal.label}"${seen}`);
	}
	const { rec, label, shifted, where } = found;
	// a filter or LFO that is off does nothing: its page's key switches it on first (as for an
	// instrument track's filter and LFO)
	const key = pageKey(rec.sim.state);
	if (moduleOff(rec.sim) && key && label !== 'filter' && label !== 'lfo') rec.do(key);
	if (hit(readValue(rec.sim, label, access, shifted), goal.value)) return rec.plan(true);
	const moves = movesOf(rec.sim, label, access, shifted);
	if (moves.length === 0) return rec.plan(false, `no encoder moves ${label} on ${where}`);
	for (const move of moves) {
		if (move.turn) {
			const detents = detentsTo(rec.sim, move.keys, label, goal.value, access, shifted);
			if (detents === null) continue;
			if (detents !== 0) rec.do(move.keys, detents);
			return rec.plan(true);
		}
		const presses = pressesTo(rec.sim, move.keys, label, goal.value, access, shifted);
		if (presses === null) continue;
		for (let i = 0; i < presses; i++) rec.do(move.keys);
		return rec.plan(true);
	}
	const now = readValue(rec.sim, label, access, shifted);
	return rec.plan(false, `${label} never reads ${goal.value} (it reads ${now})`);
}

/** Whether a page shows the goal's value (a value of a filter or LFO that is off does not count). */
function readsPage(state: SimState, goal: PageValueGoal): boolean {
	const special = specialOf(goal);
	if (special) return special.reads(state, goal);
	const access = accessOf(goal);
	const found = findPage(state, goal, access);
	if (!found.rec) return false;
	if (moduleOff(found.rec.sim) && found.label !== 'filter' && found.label !== 'lfo') return false;
	return hit(readValue(found.rec.sim, found.label, access, found.shifted), goal.value);
}

// ───────────────────────────────────────────────────────────── values set with keys of their own

/** A value set with keys of its own rather than by turning an encoder. */
interface Special {
	plan(state: SimState, goal: PageValueGoal): NavPlan;
	reads(state: SimState, goal: PageValueGoal): boolean;
}

/** A whole number from a goal's value, or null. */
function wholeNumber(value: number | string): number | null {
	const n = Number(String(value).trim());
	return Number.isInteger(n) ? n : null;
}

const word = (value: number | string) => String(value).trim().toLowerCase();

/** The keys that choose scene `n` (1–99): a black key with shift; from 10, accidental 0 and two more. */
const sceneKeys = (n: number): string[] =>
	n <= 9
		? [`shift + accidental ${n}`]
		: ['shift + accidental 0', `accidental ${Math.floor(n / 10)}`, `accidental ${n % 10}`];

/** The player a track uses: arpeggio, hold or maestro, picked from the list shift + player shows. */
const PLAYER_TYPE: Special = {
	plan(state, goal) {
		const track = goal.track ?? state.track + 1;
		const rec = new Recorder(copy(state));
		const type = PLAYER_TYPES.find((p) => p === word(goal.value));
		if (!type)
			return rec.plan(false, `"${goal.value}" is not a player: ${PLAYER_TYPES.join(', ')}`);
		const place: Place = { area: 'player', track, type };
		walk(rec, place);
		return rec.plan(isAt(rec.sim.state, place));
	},
	reads: (state, goal) => playerType(state, goal.track ?? state.track + 1) === word(goal.value)
};

/** The effect a name stands for, as the list writes it ("dist") or in full ("distortion"). */
const effectNamed = (value: number | string) =>
	FX_TYPES.find((type) => type === word(value) || FX_NAMES[type] === word(value));

/**
 * The effect an FX track runs (manual: fx/overview): shift + T7 or T8 lists the six, E4 moves the
 * box and a click of E4 loads it (a new effect starts from its own values).
 */
const EFFECT: Special = {
	plan(state, goal) {
		const track = goal.track ?? state.auxTrack + 1;
		const rec = new Recorder(copy(state));
		if (track !== 7 && track !== 8) {
			return rec.plan(false, 'effects run on FX I and FX II, auxiliary tracks 7 and 8');
		}
		const type = effectNamed(goal.value);
		if (!type) {
			const names = FX_TYPES.map((t) => FX_NAMES[t]).join(', ');
			return rec.plan(false, `"${goal.value}" is not an effect: ${names}`);
		}
		const running = () => rec.sim.state.areas.auxiliary.fx[track - 7].type;
		walk(rec, { area: 'auxiliary', track, page: 1 });
		if (running() !== type) {
			rec.do(`shift + T${track}`);
			const from = rec.sim.state.areas.auxiliary.picker?.index ?? 0;
			const to = FX_TYPES.indexOf(type);
			if (to !== from) rec.do('turn E4', to - from);
			rec.do('click E4');
		}
		return rec.plan(running() === type);
	},
	reads(state, goal) {
		const track = goal.track ?? state.auxTrack + 1;
		const type = effectNamed(goal.value);
		return (track === 7 || track === 8) && state.areas.auxiliary.fx[track - 7].type === type;
	}
};

/** The song mode view, from wherever the simulator stands. */
function toSong(rec: Recorder): void {
	const s = rec.sim.state;
	if (s.mode === 'arrange' && idle(s) && s.areas.arrange.view === 'song') return;
	walk(rec, { area: 'arrange' });
	rec.do('shift + arrange');
}

/** A song's scenes from "1 1 2 2" (or commas), 1–99 each, or null. */
function songOf(value: number | string): number[] | null {
	const scenes = String(value)
		.split(/[\s,]+/)
		.filter(Boolean)
		.map(Number);
	const ok = scenes.length > 0 && scenes.every((n) => Number.isInteger(n) && n >= 1 && n <= 99);
	return ok ? scenes : null;
}

const songNow = (s: SimState) => s.areas.arrange.songs[s.areas.arrange.song];
const sameSong = (s: SimState, scenes: readonly number[]) =>
	songNow(s).order.length === scenes.length &&
	scenes.every((n, i) => songNow(s).order[i] === n - 1);

/**
 * Arrange (manual: arrange/*): a track's pattern (M1 adds an empty one after the others, which
 * plays at once; E4 steps through them), the scene (shift and a black key; an empty scene starts as
 * a copy of the current one), the song's order (song mode: shift + M1 clears it, shift and a black
 * key keys a scene in at the cursor) and whether it loops (song mode's E1).
 */
const ARRANGE: Readonly<Record<string, Special>> = {
	pattern: {
		plan(state, goal) {
			const track = goal.track ?? state.track + 1;
			const rec = new Recorder(copy(state));
			const want = wholeNumber(goal.value);
			if (want === null || want < 1 || want > MAX_PATTERNS) {
				return rec.plan(false, `a track has patterns 1–${MAX_PATTERNS}`);
			}
			selectArrangeTrack(rec, track);
			const seq = () => trackSequence(rec.sim.state, track - 1);
			while (seq().patterns.length < want) {
				const before = seq().patterns.length;
				rec.do('M1');
				if (seq().patterns.length === before) break;
			}
			const from = seq().current;
			if (from !== want - 1) rec.do('turn E4', want - 1 - from);
			const ok = seq().current === want - 1;
			return rec.plan(ok, ok ? undefined : `track ${track} plays pattern ${seq().current + 1}`);
		},
		reads: (state, goal) =>
			trackSequence(state, (goal.track ?? state.track + 1) - 1).current + 1 ===
			wholeNumber(goal.value)
	},
	scene: {
		plan(state, goal) {
			const rec = new Recorder(copy(state));
			const want = wholeNumber(goal.value);
			if (want === null || want < 1 || want > 99) return rec.plan(false, 'scenes are 1–99');
			walk(rec, { area: 'arrange' });
			if (rec.sim.state.areas.arrange.scene !== want - 1) {
				for (const keys of sceneKeys(want)) rec.do(keys);
			}
			const ok = rec.sim.state.areas.arrange.scene === want - 1;
			return rec.plan(ok, ok ? undefined : `scene ${want} did not come up`);
		},
		reads: (state, goal) => state.areas.arrange.scene + 1 === wholeNumber(goal.value)
	},
	song: {
		plan(state, goal) {
			const rec = new Recorder(copy(state));
			const scenes = songOf(goal.value);
			if (!scenes) return rec.plan(false, `give the song's scenes in order, e.g. "1 1 2 2"`);
			toSong(rec);
			if (!sameSong(rec.sim.state, scenes)) {
				if (songNow(rec.sim.state).order.length > 0) rec.do('shift + M1');
				for (const n of scenes) for (const keys of sceneKeys(n)) rec.do(keys);
			}
			const ok = sameSong(rec.sim.state, scenes);
			return rec.plan(ok, ok ? undefined : 'the song did not take those scenes');
		},
		reads: (state, goal) => {
			const scenes = songOf(goal.value);
			return scenes !== null && sameSong(state, scenes);
		}
	},
	loop: {
		plan(state, goal) {
			const rec = new Recorder(copy(state));
			const want = word(goal.value);
			if (want !== 'on' && want !== 'off') return rec.plan(false, 'loop is on or off');
			toSong(rec);
			// E1: right loops, left plays the song once
			if (onOff(songNow(rec.sim.state).loop) !== want) rec.do('turn E1', want === 'on' ? 1 : -1);
			return rec.plan(onOff(songNow(rec.sim.state).loop) === want);
		},
		reads: (state, goal) => onOff(songNow(state).loop) === word(goal.value)
	}
};

/** Whether keys F3… of `track` hold `count` slices of the sample on `key` (in the mute group). */
function slicedInto(
	s: SimState,
	track: number,
	key: number,
	count: number,
	mode: 'even' | 'transient'
): boolean {
	const files = s.areas.sample.tracks[track - 1]?.keys ?? [];
	const keys = s.tracks[track - 1].drumKeys;
	const source = files[key]?.id;
	if (source === undefined || count > files.length) return false;
	for (let i = 0; i < count; i++) {
		if (files[i]?.id !== source || keys[i].playMode !== 'mute group') return false;
		// each slice starts where the one before ends, and even slices are as long as each other
		if (i > 0 && Math.abs(keys[i].start - keys[i - 1].end) > 1) return false;
		const length = (k: (typeof keys)[number]) => k.end - k.start;
		if (mode === 'even' && i > 0 && Math.abs(length(keys[i]) - length(keys[0])) > 1) return false;
	}
	// the next key carrying on the same run would mean more slices than that
	const next = keys[count];
	return !(next && files[count]?.id === source && Math.abs(next.start - keys[count - 1].end) <= 1);
}

/**
 * Slicing a drum key (manual: sampler/slicing): key + M1 opens the slicer on it, E1 picks the
 * mode, E4 the number of slices, and done (M4 on the simulator; the guide does not place it) lays
 * the slices on the keys from F3 up, choking each other. Tap mode is played by hand and has no goal.
 */
function slices(mode: 'even' | 'transient'): Special {
	const where = (state: SimState, goal: PageValueGoal) => {
		const track = goal.track ?? state.track + 1;
		const t = state.tracks[track - 1];
		const key = goal.key === undefined ? (t?.drumKey ?? 0) : keyIndexOf(state, track, goal.key);
		return { track, t, key, count: wholeNumber(goal.value) };
	};
	return {
		plan(state, goal) {
			const { track, t, key, count } = where(state, goal);
			const rec = new Recorder(copy(state));
			if (!t || t.engine !== 'drum') {
				return rec.plan(false, `slicing is the drum sampler's; track ${track} runs ${t?.engine}`);
			}
			if (key === null) return rec.plan(false, `no key "${goal.key}" on track ${track}`);
			if (count === null || count < 1 || count > MAX_SLICES) {
				return rec.plan(false, `a sample gives 1–${MAX_SLICES} slices`);
			}
			if (!state.areas.sample.tracks[track - 1].keys[key]) {
				return rec.plan(false, `key ${keyName(key)} holds no sample`);
			}
			walk(rec, { area: 'instrument', track, page: 1 });
			rec.do(`key ${keyName(key)} + M1`);
			const slicer = rec.sim.state.areas.sample.slicer;
			if (!slicer) return rec.plan(false, 'the slicer did not open');
			const from = SLICE_MODES.indexOf(slicer.mode);
			const to = SLICE_MODES.indexOf(mode);
			if (from !== to) rec.do('turn E1', to - from);
			const detents = detentsTo(rec.sim, 'turn E4', 'slices', count);
			if (detents === null || !hit(detentsRead(rec.sim, detents), count)) {
				return rec.plan(false, `the sample gives no ${count} ${mode} slices`);
			}
			if (detents !== 0) rec.do('turn E4', detents);
			rec.do('M4');
			const ok = slicedInto(rec.sim.state, track, key, count, mode);
			return rec.plan(ok, ok ? undefined : 'the slices did not land on the keys');
		},
		reads(state, goal) {
			const { track, t, key, count } = where(state, goal);
			return (
				t?.engine === 'drum' &&
				key !== null &&
				count !== null &&
				slicedInto(state, track, key, count, mode)
			);
		}
	};
}

/** The slicer's count after `detents` of E4 (tried on a copy). */
function detentsRead(sim: OpxySim, detents: number): string | undefined {
	const trial = copy(sim.state);
	if (detents !== 0) play(trial, 'turn E4', detents);
	return readValue(trial, 'slices', PLAIN);
}

/** The pattern track `track` (1–16) plays. */
const patternOf = (s: SimState, track: number): Pattern =>
	currentPattern(trackSequence(s, track - 1));

/** A track scale from 4, "4", "1/2" or 0.5, or null for one the black keys cannot set. */
function scaleOf(value: number | string): number | null {
	const text = String(value).trim();
	const n = /^1\s*\/\s*2$/.test(text) ? 0.5 : Number(text);
	return (TRACK_SCALES as readonly number[]).includes(n) ? n : null;
}

/**
 * The bar menu (manual: sequencer/bar-menu, track-scale, bars-and-length): with bar held, a black
 * key sets the track scale and [+] / [−] add and remove bars.
 */
const BAR: Readonly<Record<string, Special>> = {
	'track scale': {
		plan(state, goal) {
			const track = goal.track ?? activeTrack(state);
			const rec = new Recorder(copy(state));
			const scale = scaleOf(goal.value);
			const digit = scale === null ? null : digitForScale(scale);
			if (scale === null || digit === null) {
				return rec.plan(
					false,
					`a track scale is one of ${TRACK_SCALES.map(formatScale).join(', ')}`
				);
			}
			selectTrack(rec, track);
			if (patternOf(rec.sim.state, track).scale !== scale) rec.do(`bar + accidental ${digit}`);
			return rec.plan(patternOf(rec.sim.state, track).scale === scale);
		},
		reads: (state, goal) =>
			patternOf(state, goal.track ?? activeTrack(state)).scale === scaleOf(goal.value)
	},
	bars: {
		plan(state, goal) {
			const track = goal.track ?? activeTrack(state);
			const rec = new Recorder(copy(state));
			const want = wholeNumber(goal.value);
			if (want === null || want < 1 || want > MAX_BARS) {
				return rec.plan(false, `a pattern has 1–${MAX_BARS} bars`);
			}
			selectTrack(rec, track);
			const bars = () => patternOf(rec.sim.state, track).bars;
			for (let guard = 0; guard < MAX_BARS && bars() !== want; guard++) {
				rec.do(bars() < want ? 'bar + [+]' : 'bar + [-]');
			}
			return rec.plan(bars() === want);
		},
		reads: (state, goal) =>
			patternOf(state, goal.track ?? activeTrack(state)).bars === wholeNumber(goal.value)
	}
};

const SLICES = { even: slices('even'), transient: slices('transient') };

/** The keys of its own that set a goal's value, or null for a value an encoder sets. */
function specialOf(goal: PageValueGoal): Special | null {
	const label = word(goal.label);
	switch (goal.area) {
		case 'player':
			return label === 'type' || label === 'player type' ? PLAYER_TYPE : null;
		case 'auxiliary':
			return label === 'effect' || label === 'fx type' ? EFFECT : null;
		case 'arrange':
			return ARRANGE[label] ?? null;
		case 'sample':
			return label === 'even slices'
				? SLICES.even
				: label === 'transient slices'
					? SLICES.transient
					: null;
		case 'bar':
			return BAR[label] ?? null;
		default:
			return null;
	}
}
