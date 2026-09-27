/**
 * The simulator's model of one OP-XY project (decision D10): plain, serialisable data with the
 * ranges, defaults and value formats of every parameter the simulated pages show. Defaults come
 * from the manual where it gives them (a new project runs at 120 BPM with drums on T1–T2, prism,
 * epiano, dissolve, hardsync, axis and multisampler on T3–T8) and otherwise match TE's guide art;
 * ranges are the device's 0–99 encoder scale unless the manual says otherwise. Everything here is
 * pure so the frame builder and tests can use it without Svelte.
 */
import {
	ENGINES,
	INSTRUMENT_TRACKS,
	KEYBOARD_NOTE_NAMES,
	CC80_TEMPO_RANGE,
	type EngineId
} from '$lib/core/opxy';
import type { FilterType, LfoType, MultiOutMode } from './screen/frame';

/** The four main modes. */
export type SimMode = 'instrument' | 'auxiliary' | 'arrange' | 'mix';
/** Pages opened over any mode by a module key. */
export type Overlay = 'tempo' | 'project' | 'com' | 'sample' | 'players' | 'bar';
/** M1–M4. */
export type PageNumber = 1 | 2 | 3 | 4;
/** Which set of eight tracks the track keys address. */
export type Bank = 'instrument' | 'auxiliary';
/** Lists opened with shift + M1 / M3 / M4 on instrument tracks. */
export type PickerKind = 'engine' | 'filter' | 'lfo';

/** An envelope on the 0–99 scale. */
export interface Envelope99 {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

/** Drum key play modes (manual: key / oneshot / mute group / loop). */
export const DRUM_PLAY_MODES = ['key', 'oneshot', 'mute group', 'loop'] as const;
export type DrumPlayMode = (typeof DRUM_PLAY_MODES)[number];

/** One drum key's settings (manual: sampler/drum-key-settings). */
export interface DrumKey {
	/** Semitones, −12…12 in hundredths. */
	tune: number;
	/** 0–99 of the sample. */
	start: number;
	end: number;
	playMode: DrumPlayMode;
	reverse: boolean;
	/** −100…100. */
	pan: number;
	/** 0–99. */
	fade: number;
	/** −30…20 dB. */
	gain: number;
}

/** Play modes on the M2 shift layer. */
export const PLAY_MODES = ['poly', 'mono', 'legato'] as const;

/** LFO types in the order shift + M4 lists them (manual: duck, element, random, tremolo, value). */
export const LFO_TYPES: readonly LfoType[] = ['duck', 'element', 'random', 'tremolo', 'value'];
/** Filter types (the four factory presets use; the manual says more may exist). */
export const FILTER_TYPES: readonly FilterType[] = ['svf', 'ladder', 'z lowpass', 'z hipass'];
/** Groove types on the tempo page (manual: tempo/grooves). */
export const GROOVES = [
	'shuffle',
	'half shuffle',
	'bombora',
	'wobbly',
	'gaussian',
	'accents',
	'island nod'
] as const;
/**
 * Two-letter names on the metronome. TE's art shows "SH" for shuffle; the others are our
 * abbreviations until the real screen is seen.
 */
export const GROOVE_ABBREVIATIONS: Readonly<Record<(typeof GROOVES)[number], string>> = {
	shuffle: 'SH',
	'half shuffle': 'HS',
	bombora: 'BO',
	wobbly: 'WO',
	gaussian: 'GA',
	accents: 'AC',
	'island nod': 'IN'
};
/** Multi-out modes in E3's order (manual: com/multi-out). */
export const MULTI_OUT_MODES: readonly MultiOutMode[] = [
	'midi',
	'sync8',
	'sync16',
	'sync24',
	'cv/gate',
	'audio'
];
/**
 * Synced LFO speeds: the count of notes (sixteenths, or triplets on random) the card shows beside
 * its note (TE's art shows 4 and 5). The steps past 8 are our guess at how the range continues.
 */
export const LFO_SYNC_STEPS = [
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'12',
	'16',
	'24',
	'32'
] as const;

/** The LFO. `speed` runs over the synced steps then the free range (manual: speed dial). */
export interface Lfo {
	type: LfoType;
	/** 0…LFO_SYNC_STEPS.length − 1 synced, then free positions 0–99 above that. */
	speed: number;
	/** −99…99. */
	amount: number;
	/** Index into the destination list (each page, then its free twin). */
	destination: number;
	/** Encoder of the destination page (0–3). */
	parameter: number;
	/** Tremolo's volume depth −99…99. */
	volume: number;
	/** Duck: the triggering track (1–8), whether its audio (else its notes) triggers, hold, release. */
	source: number;
	sourceAudio: boolean;
	hold: number;
	release: number;
}

/** An instrument track. */
export interface TrackState {
	engine: EngineId;
	/** M1 encoders of a synth engine, 0–99. */
	m1: [number, number, number, number];
	amp: Envelope99;
	filterEnv: Envelope99;
	/** Which envelope M2's encoders edit (click any encoder to swap). */
	envelope: 'amp' | 'filter';
	playMode: { mode: number; portamento: number; bend: number; volume: number };
	filter: {
		type: FilterType;
		cutoff: number;
		resonance: number;
		/** −99…99. */
		envAmount: number;
		keyTracking: number;
	};
	/** Aux out, tape, FX I, FX II (0–99). */
	sends: [number, number, number, number];
	lfo: Lfo;
	mix: { level: number; pan: number; muted: boolean };
	/** Selected drum/sampler key (0–23, F3…E5) and each key's settings. */
	drumKey: number;
	drumKeys: DrumKey[];
	/** The midi engine's channel (1–16), bank (null = none) and program. */
	midi: { channel: number; bank: number | null; program: number };
	/** Sixteen steps of the current pattern (on/off). */
	steps: boolean[];
}

/** An auxiliary track (only what the mixer shows). */
export interface AuxTrackState {
	mix: { level: number; pan: number; muted: boolean };
	steps: boolean[];
}

/** The whole simulated device. */
export interface SimState {
	mode: SimMode;
	overlay: Overlay | null;
	/** Selected M-page per mode that has them. */
	pages: { instrument: PageNumber; auxiliary: PageNumber; mix: PageNumber };
	shift: boolean;
	/** Keys and encoder pushes currently held (for combinations). */
	held: string[];
	/** Active instrument (0–7) and auxiliary (0–7) track. */
	track: number;
	auxTrack: number;
	/** Which track set the arrange and mix pages address; the last mode key decides for keys. */
	banks: { arrange: Bank; mix: Bank };
	/** The set the track keys addressed last (instrument or auxiliary). */
	active: Bank;
	tracks: TrackState[];
	aux: AuxTrackState[];
	tempo: {
		bpm: number;
		groove: number;
		/** −99 (shuffle) … 99 (swing). */
		swing: number;
		metronome: { level: number; on: boolean };
	};
	transport: { playing: boolean; recording: boolean; position: number };
	project: { name: string };
	com: { advertising: boolean; multiOut: MultiOutMode; charging: boolean };
	picker: { kind: PickerKind; index: number } | null;
	/** A page we only name (a soft key's sub-page: settings, rename, …). */
	sub: string | null;
	/** Last taps of the tempo key (ms), for tap tempo. */
	taps: number[];
}

/** Clamps to [min, max]. */
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Two-digit display of a 0–99 value ("00", "07", "80"). */
export const two = (v: number) => String(Math.round(clamp(v, 0, 99))).padStart(2, '0');

/** Display name of a keyboard key index (0 = F3): "F3", "F#3". */
export function keyName(index: number): string {
	const id = KEYBOARD_NOTE_NAMES[clamp(Math.round(index), 0, KEYBOARD_NOTE_NAMES.length - 1)];
	const [, letter, sharp, octave] = /^([a-g])(s?)(\d)$/.exec(id) ?? ['', 'c', '', '4'];
	return `${letter.toUpperCase()}${sharp ? '#' : ''}${octave}`;
}

/** Tune as the sampler shows it: "0.00", "+1.50", "–1.22" (en dash like TE's art). */
export function formatTune(semitones: number): string {
	const v = Math.round(semitones * 100) / 100;
	if (v === 0) return '0.00';
	return `${v < 0 ? '–' : '+'}${Math.abs(v).toFixed(2)}`;
}

/** BPM as the tempo page shows it: whole tempos without decimals ("120", "120.5"). */
export function formatBpm(bpm: number): string {
	const v = Math.round(bpm * 10) / 10;
	return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Tempo limits (the CC80 range the manual documents). */
export const TEMPO_RANGE = CC80_TEMPO_RANGE;

/** A default drum key: whole sample, oneshot, centred. */
export function defaultDrumKey(): DrumKey {
	return {
		tune: 0,
		start: 0,
		end: 99,
		playMode: 'oneshot',
		reverse: false,
		pan: 0,
		fade: 0,
		gain: 0
	};
}

/** Encoder defaults of a synth engine's M1 page (TE's art shows 80 on most engines). */
function defaultM1(engine: EngineId): [number, number, number, number] {
	if (engine === 'dissolve') return [49, 52, 90, 0];
	if (engine === 'simple') return [80, 80, 0, 0];
	return [80, 80, 80, 80];
}

/** A fresh instrument track running `engine`. */
export function defaultTrack(engine: EngineId): TrackState {
	return {
		engine,
		m1: defaultM1(engine),
		// TE's M2 art: a sharp amp envelope with a long sustain, a slower filter envelope
		amp: { attack: 0, decay: 99, sustain: 76, release: 0 },
		filterEnv: { attack: 99, decay: 99, sustain: 41, release: 88 },
		envelope: 'amp',
		playMode: { mode: 0, portamento: 0, bend: 1, volume: 44 },
		filter: { type: 'svf', cutoff: 99, resonance: 0, envAmount: 0, keyTracking: 0 },
		sends: [0, 0, 0, 0],
		lfo: {
			type: 'value',
			speed: 3,
			amount: 0,
			destination: 0,
			parameter: 0,
			volume: 0,
			source: 1,
			sourceAudio: true,
			hold: 50,
			release: 50
		},
		mix: { level: 80, pan: 0, muted: false },
		drumKey: 0,
		drumKeys: Array.from({ length: KEYBOARD_NOTE_NAMES.length }, defaultDrumKey),
		midi: { channel: 1, bank: null, program: 1 },
		steps: Array(16).fill(false)
	};
}

/** The engine of each instrument track in a new project (from the CC map's defaults). */
export function defaultEngines(): EngineId[] {
	return INSTRUMENT_TRACKS.map((t) => t.defaultEngine ?? 'prism');
}

/** A new project as the manual describes it. */
export function defaultState(): SimState {
	return {
		mode: 'instrument',
		overlay: null,
		pages: { instrument: 1, auxiliary: 1, mix: 1 },
		shift: false,
		held: [],
		track: 0,
		auxTrack: 0,
		banks: { arrange: 'instrument', mix: 'instrument' },
		active: 'instrument',
		tracks: defaultEngines().map(defaultTrack),
		aux: Array.from({ length: 8 }, () => ({
			mix: { level: 80, pan: 0, muted: false },
			steps: Array(16).fill(false)
		})),
		tempo: { bpm: 120, groove: 0, swing: 0, metronome: { level: 99, on: false } },
		transport: { playing: false, recording: false, position: 0 },
		project: { name: 'project 1' },
		com: { advertising: false, multiOut: 'midi', charging: false },
		picker: null,
		sub: null,
		taps: []
	};
}

/** Engines in the list shift + M1 opens (the manual: all twelve). */
export const ENGINE_LIST: readonly EngineId[] = ENGINES.map((e) => e.id);

/** An engine's M1 parameter names (from the CC map). */
export function engineParams(engine: EngineId): readonly (string | null)[] {
	return ENGINES.find((e) => e.id === engine)?.params ?? [null, null, null, null];
}

/** Whether an engine plays samples (its M1 page is the sample editor). */
export function isSampler(engine: EngineId): boolean {
	return engine === 'drum' || engine === 'sampler' || engine === 'multisampler';
}
