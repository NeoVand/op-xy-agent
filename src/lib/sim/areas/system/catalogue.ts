/**
 * The content a new virtual OP-XY ships with, as far as the system area needs it: the preset
 * library the browser lists, the factory projects, the connected MIDI devices and the options of
 * the settings pages. Our manual names the factory preset categories (instrument/preset-browser)
 * and the snapshot naming (instrument/save-copy-scramble) but no factory preset or project names,
 * so those are placeholders of ours ("bass 1", "demo 1"). Imports only `$lib/core` so the state
 * module can use it without an import cycle through `params.ts`.
 */
import { ENGINE_IDS, type EngineId } from '$lib/core/opxy';

/** Factory preset categories (manual: instrument/preset-browser). */
export const PRESET_CATEGORIES = [
	'bass',
	'bells',
	'drum',
	'fx',
	'keys',
	'lead',
	'organ',
	'pad',
	'pluck',
	'strings',
	'wind'
] as const;

/** The folder the device saves track sounds into (`Tn + M4`; manual: save-copy-scramble). */
export const SNAPSHOT_FOLDER = 'snapshot';

/** One preset in the library. */
export interface PresetEntry {
	name: string;
	/** Category or user folder; '' for presets only engine view lists. */
	folder: string;
	readonly engine: EngineId;
	/** User presets can be cut, pasted, renamed and deleted (manual: preset-management). */
	readonly user: boolean;
	/** A saved track sound (JSON), for presets saved on the device. */
	readonly sound?: string;
}

/**
 * Our placeholder factory library: a few presets per category on engines that suit it, so both
 * browser views have something to show. The first of each engine pair matches a new project's
 * sounds (manual: project-view: drums, bass, pluck, lead, soft pluck, strings, pad).
 */
const FACTORY_TABLE: readonly (readonly [string, readonly EngineId[]])[] = [
	['bass', ['prism', 'simple', 'hardsync', 'wavetable', 'sampler']],
	['bells', ['epiano', 'wavetable', 'prism']],
	['drum', ['drum', 'drum', 'drum', 'drum']],
	['fx', ['dissolve', 'sampler', 'axis']],
	['keys', ['epiano', 'organ', 'multisampler']],
	['lead', ['dissolve', 'hardsync', 'prism', 'axis', 'simple']],
	['organ', ['organ', 'organ', 'organ']],
	['pad', ['multisampler', 'dissolve', 'wavetable', 'axis']],
	['pluck', ['epiano', 'hardsync', 'prism', 'simple']],
	['strings', ['axis', 'multisampler', 'wavetable', 'dissolve']],
	['wind', ['multisampler', 'axis']]
];

/** The factory presets of a new unit (placeholders; every engine has at least one). */
export function factoryPresets(): PresetEntry[] {
	const presets: PresetEntry[] = FACTORY_TABLE.flatMap(([folder, engines]) =>
		engines.map((engine, i) => ({ name: `${folder} ${i + 1}`, folder, engine, user: false }))
	);
	// the midi engine has no category: engine view lists its preset on its own
	for (const engine of ENGINE_IDS) {
		if (!presets.some((p) => p.engine === engine)) {
			presets.push({ name: `${engine} 1`, folder: '', engine, user: false });
		}
	}
	return presets;
}

/** The preset each track of a new project starts with (`folder/name`). */
export const DEFAULT_TRACK_PRESETS: readonly string[] = [
	'drum/drum 1',
	'drum/drum 2',
	'bass/bass 1',
	'pluck/pluck 1',
	'lead/lead 1',
	'pluck/pluck 2',
	'strings/strings 1',
	'pad/pad 1'
];

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
