/**
 * The simulator's model of one OP-XY project (decision D10): plain, serialisable data with the
 * ranges, defaults and value formats of every parameter the simulated pages show. A new project's
 * sounds are the device's own (`defaults.ts`: the eight presets a blank OS 1.1.33 project stores,
 * drums on T1–T2, then prism, epiano, dissolve, hardsync, axis and multisampler); the rest comes
 * from the manual where it gives defaults and otherwise matches TE's guide art. Ranges are the
 * device's 0–99 encoder scale unless the manual says otherwise. Everything here is pure so the
 * frame builder and tests can use it without Svelte.
 */
import {
	ENGINES,
	INSTRUMENT_TRACKS,
	KEYBOARD_NOTE_NAMES,
	CC80_TEMPO_RANGE,
	type EngineId
} from '$lib/core/opxy';
import { initialAreaStates, type AreaStates } from './areas/state';
import { engineInitM1, NEW_PROJECT_TRACKS, soundOf } from './defaults';
import { emptySequence, type Sequence } from './sequencer';
import type { HeaderCell } from './screen/draw';
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
/** Filter types in the order shift + M3 lists them on the device (camera, 1.1.33; research 59 §2.3). */
export const FILTER_TYPES: readonly FilterType[] = ['ladder', 'svf', 'z hipass', 'z lowpass'];
/**
 * Groove types on the tempo page, in the order the device stores them (project header byte 3;
 * `10-xy-format.md` §3). The online guide describes seven; TE's printed guide v1.1.5 all eleven.
 */
export const GROOVES = [
	'shuffle',
	'half shuffle',
	'danish',
	'bombora',
	'wobbly',
	'gaussian',
	'accents',
	'island nod',
	'disfunk',
	'roll over',
	'prophetic'
] as const;
/**
 * Two-letter names on the metronome. TE's art shows "SH" for shuffle; the others are our
 * abbreviations until the real screen is seen.
 */
export const GROOVE_ABBREVIATIONS: Readonly<Record<(typeof GROOVES)[number], string>> = {
	shuffle: 'SH',
	'half shuffle': 'HS',
	danish: 'DA',
	bombora: 'BO',
	wobbly: 'WO',
	gaussian: 'GA',
	accents: 'AC',
	'island nod': 'IN',
	disfunk: 'DF',
	'roll over': 'RO',
	prophetic: 'PR'
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

/**
 * Element's sources in E1's order (manual: instrument/lfo-element) and the letter its source card
 * shows: TE's art shows G for the gyroscope; the other letters are ours.
 */
export const ELEMENT_SOURCES = [
	{ name: 'gyroscope', letter: 'G' },
	{ name: 'microphone', letter: 'M' },
	{ name: 'amp envelope', letter: 'E' },
	{ name: 'sum', letter: 'S' }
] as const;

/**
 * Duck's last source, after the instrument tracks 1–8 and the auxiliary tracks 9–16: the metronome
 * (manual: instrument/lfo-duck; its place at the end of the list is ours).
 */
export const DUCK_METRONOME = 17;

/** The LFO. `speed` runs over the synced steps then the free range (manual: speed dial). */
export interface Lfo {
	type: LfoType;
	/** Switched on: presets store it (picking a type switches it on; how the device switches it off is unknown). */
	on: boolean;
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
	/**
	 * Duck: the triggering track (1–16, auxiliary tracks from 9) or {@link DUCK_METRONOME}, whether
	 * its audio (else its notes) triggers, hold, release.
	 */
	source: number;
	sourceAudio: boolean;
	hold: number;
	release: number;
	/**
	 * Random's and tremolo's envelope, which fades the modulation in (1…99) or out (−99…−1); 0 is
	 * none (manual: lfo-random, lfo-tremolo; the signed range is ours).
	 */
	envelope: number;
	/** Tremolo's waveform shape, 0–99 (the guide names no shapes, so ours is a plain value). */
	shape: number;
	/** Element's source: an index into {@link ELEMENT_SOURCES}. */
	sensor: number;
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
		/** Switched on: presets store it (picking a type switches it on; an off filter passes all). */
		on: boolean;
		cutoff: number;
		resonance: number;
		/**
		 * 0–99: how far the filter envelope opens the cutoff. The device's CC34 runs from none to
		 * full, drawing no hatch at 0 (research 59 §2.3), and presets store it unsigned.
		 */
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
	/**
	 * The engine and M1 values a switch to the midi engine set aside: switching back to that engine
	 * brings them back (OS 1.0.50; manual: instrument/engine-midi). Null otherwise.
	 */
	parked: { engine: EngineId; m1: [number, number, number, number] } | null;
	/**
	 * The tracks (0–7) this one plays along when it is the primary of a link: up to three, linked by
	 * holding this track's key and pressing theirs (manual: basics/linked-tracks).
	 */
	links: number[];
	/** Patterns, notes and the last note played (`sequencer.ts`). */
	sequence: Sequence;
}

/** An auxiliary track: its mixer strip and its patterns (the aux areas keep the rest). */
export interface AuxTrackState {
	mix: { level: number; pan: number; muted: boolean };
	sequence: Sequence;
}

/** Auxiliary track names by key (manual: basics/track-buttons). */
export const AUX_NAMES = [
	'brain',
	'punch-in fx',
	'external midi',
	'external cv',
	'external audio',
	'tape',
	'fx I',
	'fx II'
] as const;

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
	/** Each area's own state (`areas/`). */
	areas: AreaStates;
}

/** Clamps to [min, max]. */
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Two-digit display of a 0–99 value ("00", "07", "80") the way the device shows its lanes: the
 * floor of the value on a 0–100 scale (a lane stored as raw / 32767 × 99 shows
 * floor(raw × 100 / 32768)), so a preset's 9.9 shows "09" and whole encoder steps show themselves.
 */
export const two = (v: number) => String(shown(v)).padStart(2, '0');

/** The number a 0–99 value shows as (see {@link two}). */
export const shown = (v: number): number =>
	Math.min(99, Math.floor(clamp(v, 0, 99) * (100 / 99) * (32767 / 32768) + 1e-6));

/**
 * A value turned `delta` detents within `min`…`max`: the number on screen moves by `delta`, as the
 * device's does. A value between two shown numbers (a stored preset's) first lands on the one it
 * shows; whole values just move.
 */
export function detent(v: number, delta: number, min: number, max: number): number {
	const from = min === 0 && max === 99 ? shown(v) : Math.round(v);
	return clamp(from + delta, min, max);
}

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

/** An engine's M1 when picked with no preset: the device's own (`defaults.ts`), else TE's art's 80. */
function defaultM1(engine: EngineId): [number, number, number, number] {
	return engineInitM1(engine) ?? [80, 80, 80, 80];
}

/** The mixer level a new project gives every track (the device stores 0x6000 of 0x7FFF). */
export const DEFAULT_LEVEL = (0x6000 / 0x7fff) * 99;

/**
 * The metronome level a new project stores: 0xA8 of 0xFF in the `.xy` header (research/10-xy-format
 * §3.2), 65 on our 0–99 scale and seven of the tempo page's waves. Whether a new project's
 * metronome clicks is not known, so it starts switched off.
 */
export const DEFAULT_METRONOME_LEVEL = Math.round((0xa8 / 0xff) * 99);

/** A fresh instrument track running `engine`. */
export function defaultTrack(engine: EngineId): TrackState {
	return {
		engine,
		m1: defaultM1(engine),
		// TE's M2 art: a sharp amp envelope with a long sustain, a slower filter envelope. Release is
		// the device's handle position: 99 puts it on the end (no release), lower is longer
		amp: { attack: 0, decay: 99, sustain: 76, release: 99 },
		filterEnv: { attack: 99, decay: 99, sustain: 41, release: 29 },
		envelope: 'amp',
		playMode: { mode: 0, portamento: 0, bend: 2, volume: 44 },
		filter: { type: 'svf', on: true, cutoff: 99, resonance: 0, envAmount: 0, keyTracking: 0 },
		sends: [0, 0, 0, 0],
		lfo: {
			type: 'value',
			on: true,
			speed: 3,
			amount: 0,
			destination: 0,
			parameter: 0,
			volume: 0,
			source: 1,
			sourceAudio: true,
			hold: 50,
			release: 50,
			envelope: 0,
			shape: 0,
			sensor: 0
		},
		mix: { level: DEFAULT_LEVEL, pan: 0, muted: false },
		drumKey: 0,
		drumKeys: Array.from({ length: KEYBOARD_NOTE_NAMES.length }, defaultDrumKey),
		midi: { channel: 1, bank: null, program: 1 },
		parked: null,
		links: [],
		// drum tracks store sounds (key F3 = 53 first), synths middle C
		sequence: emptySequence(isSampler(engine) && engine === 'drum' ? 53 : 60)
	};
}

/** The engine of each instrument track in a new project (from the CC map's defaults). */
export function defaultEngines(): EngineId[] {
	return INSTRUMENT_TRACKS.map((t) => t.defaultEngine ?? 'prism');
}

/**
 * The sound of a preset the device stores (`folder/name`, one of a new project's eight), or null
 * for any other preset.
 */
export function storedPresetSound(key: string): TrackState | null {
	const stored = NEW_PROJECT_TRACKS.find((t) => t.preset === key);
	return stored ? soundOf(stored, defaultTrack(stored.engine), LFO_SYNC_STEPS.length) : null;
}

/** A new project's eight instrument tracks: the device's stored presets. */
export function newProjectTracks(): TrackState[] {
	return NEW_PROJECT_TRACKS.map((stored) =>
		soundOf(stored, defaultTrack(stored.engine), LFO_SYNC_STEPS.length)
	);
}

/** A new project as the device makes it. */
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
		tracks: newProjectTracks(),
		aux: Array.from({ length: 8 }, () => ({
			mix: { level: DEFAULT_LEVEL, pan: 0, muted: false },
			sequence: emptySequence()
		})),
		tempo: {
			bpm: 120,
			groove: 0,
			swing: 0,
			metronome: { level: DEFAULT_METRONOME_LEVEL, on: false }
		},
		transport: { playing: false, recording: false, position: 0 },
		project: { name: 'project 1' },
		com: { advertising: false, multiOut: 'midi', charging: false },
		picker: null,
		sub: null,
		taps: [],
		areas: initialAreaStates()
	};
}

/** Engines in the list shift + M1 opens (the manual: all twelve). */
export const ENGINE_LIST: readonly EngineId[] = ENGINES.map((e) => e.id);

/** An engine's M1 parameter names (from the CC map). */
/**
 * Prism's ratio as its top bar writes it: ten equal zones of the lane (research 57 §3, 59 §2.5;
 * the sound engine's `RATIOS`).
 */
export const PRISM_RATIOS = [
	'2:1',
	'1:1',
	'2:3',
	'1:2',
	'1:3',
	'1:4',
	'1:6',
	'1:8',
	'1:12',
	'1:16'
];

/**
 * Wavetable's tables, as its top bar names them in place of E1's label (research 59 §2.5; the sound
 * engine's `TABLES`; "primes" is our name for the one never seen on screen).
 */
export const WAVETABLES = [
	'basic',
	'buzz',
	'crush',
	'drawbars',
	'fibonacci',
	'fractal',
	'geometric',
	'primes',
	'zap'
];

/** Which of `count` equal zones a 0–99 lane is in. */
const zone = (v: number, count: number) =>
	Math.min(count - 1, Math.floor((clamp(v, 0, 99) / 99) * count));

/**
 * An engine parameter's top-bar cell as the device writes it: a two-digit value, except prism's
 * ratio (a fraction) and wavetable's table (its name in the label, no value).
 */
export function engineCell(engine: EngineId, index: number, value: number): HeaderCell {
	const label = engineParams(engine)[index] ?? '';
	if (!label) return { label: '', value: '' };
	if (engine === 'prism' && index === 1) return { label, value: PRISM_RATIOS[zone(value, 10)] };
	if (engine === 'wavetable' && index === 0)
		return { label: WAVETABLES[zone(value, 9)], value: '' };
	return { label, value: two(value) };
}

export function engineParams(engine: EngineId): readonly (string | null)[] {
	return ENGINES.find((e) => e.id === engine)?.params ?? [null, null, null, null];
}

/** Whether an engine plays samples (its M1 page is the sample editor). */
export function isSampler(engine: EngineId): boolean {
	return engine === 'drum' || engine === 'sampler' || engine === 'multisampler';
}
