/**
 * The content a new virtual OP-XY ships with, as far as the system area needs it: the preset
 * library the browser lists, the factory projects, the connected MIDI devices and the options of
 * the settings pages. The factory presets carry the device's own names, categories and engines
 * (below); the snapshot naming is our manual's (instrument/save-copy-scramble); the factory
 * projects are placeholders of ours ("demo 1"). Imports only `$lib/core` and `defaults.ts` (which
 * imports only `$lib/core`) so the state module can use it without an import cycle through
 * `params.ts`.
 */
import type { EngineId } from '$lib/core/opxy';
import { NEW_PROJECT_PRESETS } from '../../defaults';

/**
 * The factory preset categories: the eight the preset browser lists on the owner's unit (OS
 * 1.1.33, camera b1-1524…1534) and xy-format's OS 1.1.21 capture names (docs/research/10-xy-format.md
 * appendix D).
 */
export const PRESET_CATEGORIES = [
	'bass',
	'drum',
	'keys',
	'lead',
	'organ',
	'pad',
	'pluck',
	'strings'
] as const;

/** The folder the device saves track sounds into (`Tn + M4`; manual: save-copy-scramble). */
export const SNAPSHOT_FOLDER = 'snapshot';

/** One preset in the library. */
export interface PresetEntry {
	name: string;
	/** Category or user folder ('' in libraries saved before categories were the device's). */
	folder: string;
	readonly engine: EngineId;
	/** User presets can be cut, pasted, renamed and deleted (manual: preset-management). */
	readonly user: boolean;
	/** A saved track sound (JSON), for presets saved on the device. */
	readonly sound?: string;
}

type Category = (typeof PRESET_CATEGORIES)[number];

/**
 * The factory presets: 156, by category and engine. Names, categories and engines are xy-format's
 * OS 1.1.21 capture list (MIT; docs/research/10-xy-format.md appendix D), and every list the
 * owner's OS 1.1.33 browser showed agrees with it, lengths included (camera b1-1495…1568: each
 * engine's presets, the bass, pluck and strings categories). The midi engine has none, so the
 * browser lists no midi engine (it lists eleven engines on the device). Which sounds they make is
 * not known here, apart from a new project's eight (`defaults.ts`): the others load as their
 * engine's starting sound.
 */
const FACTORY: Readonly<Record<Category, readonly (readonly [EngineId, string])[]>> = {
	bass: [
		['prism', 'alloy, flyby, mineral, shoulder, sonorous, valves'],
		['sampler', 'any time, guitar low, iguana, rear 424'],
		['wavetable', 'bark, not fm, wobbler'],
		['simple', 'belch bass, big square, blank, essex, line check, pressure, shark attack'],
		['hardsync', 'corduroy'],
		['dissolve', 'haymaker, loney bass, off guard, pocket, trunk, under bron'],
		['epiano', 'jacket']
	],
	drum: [
		[
			'drum',
			'boop, chamine, dead spot, fletcher, in phase, kerf, martini, mushroom, playwood, sugar, wood box, zebra'
		]
	],
	keys: [
		[
			'sampler',
			'80s lover, ambi piano, drodezzz, elect piano, newshour, piano 1, piano 2, whurl xy'
		],
		['wavetable', 'corporate, spacious'],
		['prism', 'dark, man stage, medieval, shine, slush, swelvet, tonk 5, wakeup'],
		['hardsync', 'electric'],
		['epiano', 'foal, jeans, needs tuning'],
		['simple', 'key keys, missing you'],
		['multisampler', 'refelt piano, vintage']
	],
	lead: [
		['wavetable', 'asinine, modulus, sad triangle'],
		['sampler', 'azimuth, far field, saw 101, wide saw'],
		['prism', 'beam, gradient, open cell'],
		['axis', 'bowed'],
		['simple', 'burbie, low ride, massage, millinery, top spin, whirrs, wool'],
		['dissolve', 'dustmite, gaussian, insomniac, sonar, spud mate'],
		['hardsync', 'runway, swell, wub'],
		['multisampler', 'uknowaxel']
	],
	organ: [
		['organ', 'chorale, chunk, manual, vestigial'],
		['sampler', 'dusty org, fm organ, hammy xy3, joker'],
		['multisampler', 'harmonium'],
		['wavetable', 'meat org, post order']
	],
	pad: [
		['axis', 'chambre, confucius, kowalski, separee'],
		['wavetable', 'chuba, ulysses, zafu'],
		['sampler', 'dark choir, dream choir, op1 pad, padawan, qiviut, rich pad, there is hope'],
		['prism', 'frontier, murmel, night sky, uranium'],
		['multisampler', 'bandpasser, spectre, subsun'],
		['dissolve', 'unravel']
	],
	pluck: [
		['organ', 'avant garde, dingus'],
		['axis', 'bellissimo, coin, layered, rift'],
		[
			'sampler',
			'bellonboards, endless, guitar, kvarnofon, marimba, on tape, resobubble, synth bell'
		],
		['simple', 'deep luck, pale crepe, rally'],
		['epiano', 'beach bum, leftovers'],
		['hardsync', 'dielectric, odorant'],
		['dissolve', 'soft tines, whorl']
	],
	strings: [
		['axis', 'draemy, nachtmusik, pointe, soutenu, whitness'],
		['multisampler', 'ensemble'],
		['sampler', 'intimate str']
	]
};

/** The factory presets of a new unit (a new project's eight among them, under their names). */
export function factoryPresets(): PresetEntry[] {
	return PRESET_CATEGORIES.flatMap((folder) =>
		FACTORY[folder].flatMap(([engine, names]) =>
			names.split(', ').map((name) => ({ name, folder, engine, user: false }))
		)
	);
}

/** The preset each track of a new project starts with (`folder/name`, the device's). */
export const DEFAULT_TRACK_PRESETS: readonly string[] = NEW_PROJECT_PRESETS;

/** Placeholder factory projects (TE's art names its example project "demo 1"). */
export const FACTORY_PROJECTS: readonly string[] = [
	'demo 1',
	'demo 2',
	'demo 3',
	'demo 4',
	'demo 5',
	'demo 6'
];

/** Directions a MIDI setting can take (manual: com/midi-settings: in and both confirmed). */
export const MIDI_DIRECTIONS = ['off', 'in', 'out', 'both'] as const;

/** Time signatures of the project's tempo page (manual: project/settings). */
export const SIGNATURES = ['3/4', '4/4', '5/4', '6/8', '7/8', '12/8'] as const;

/**
 * How a scene's length is worked out (manual: project/settings, OS 1.1.0). The manual names one
 * mode, "time signature"; "longest" (the longest pattern decides) is our name for the other.
 */
export const SCENE_LENGTH_MODES = ['longest', 'time signature'] as const;

/** Portamento styles of the preset settings: TE's art shows "lin"; "exp" is ours. */
export const PORTAMENTO_TYPES = ['lin', 'exp'] as const;

/** Tuning roots (preset settings). The capitals the screen font lacks fall back (D, E, A, B). */
export const NOTE_NAMES = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B'
] as const;

/** Countries of the system settings (ours: the manual names the setting, not its list). */
export const COUNTRIES = [
	'sweden',
	'australia',
	'canada',
	'china',
	'france',
	'germany',
	'japan',
	'korea',
	'uk',
	'usa'
] as const;

/**
 * What the mod sources can reach (manual: preset-settings: "parameters of the sound"). `p1`…`p4`
 * are the engine's M1 parameters and read as their names; the rest are ours.
 */
export const MOD_TARGETS = [
	'none',
	'p1',
	'p2',
	'p3',
	'p4',
	'cutoff',
	'resonance',
	'env amount',
	'attack',
	'decay',
	'sustain',
	'release',
	'lfo speed',
	'lfo amount',
	'volume',
	'pan'
] as const;

/** The mod sources, in the preset settings' order (manual: preset-settings). */
export const MOD_SOURCES = ['modwheel', 'aftertouch', 'pitchbend', 'velocity'] as const;

/** A MIDI device the OP-XY knows (manual: com/devices). */
export interface DeviceEntry {
	name: string;
	connected: boolean;
	/** Bluetooth devices show a wireless mark in the list. */
	readonly wireless: boolean;
	/** Clock, notes, other (MIDI_DIRECTIONS), timestamp and velocity (off / on). */
	settings: [number, number, number, number, number];
}

/** What the virtual OP-XY is connected to: the computer running the app (ours). */
export function defaultDevices(): DeviceEntry[] {
	return [{ name: 'computer', connected: true, wireless: false, settings: [3, 3, 3, 0, 1] }];
}

/**
 * Characters the naming screen offers, in the order E2 turns through them: the ones names on the
 * unit are seen to use (docs/research/30 §3.5: lowercase, digits, space, #, parentheses and -, as
 * in the snapshot names "2026-06-15 (1)"). The order is ours; the screen font has no glyphs for
 * the parentheses, so they draw in the fallback face.
 */
export const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789 -#()';

/** The longest name the naming screen accepts (docs/research/30 §3.5: names up to 24). */
export const NAME_MAX = 24;
