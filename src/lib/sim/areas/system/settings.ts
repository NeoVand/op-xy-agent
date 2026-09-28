/**
 * The settings lists of the system area as data: sections (the left column, picked with E1), rows
 * (the middle column, E2) and values (the right column, E3 or E4). Project settings follow our
 * manual's project/settings, transpose and midi-channels; system settings com/system-settings,
 * com/midi-settings and com/midi-monitor; preset settings instrument/preset-settings; device
 * settings com/devices (and the how-to that lists clock, notes, other, timestamp and velocity).
 * Where the manual names a setting but not its values, the values are ours.
 */
import {
	AUX_NAMES,
	GROOVES,
	clamp,
	detent,
	engineParams,
	shown,
	type SimState
} from '../../params';
import {
	COUNTRIES,
	MIDI_DIRECTIONS,
	MOD_SOURCES,
	MOD_TARGETS,
	NOTE_NAMES,
	PORTAMENTO_TYPES,
	SCENE_LENGTH_MODES,
	SIGNATURES
} from './catalogue';
import type { PresetSettings } from './state';

/** One row of a settings list. */
export interface Setting {
	readonly label: string;
	/** The value as the screen shows it ('' for a row without one). */
	value(s: SimState): string;
	/** Turns the value by whole detents; read-only rows ignore it. */
	turn(s: SimState, delta: number): void;
}

/** A section of a settings page: its name and its rows (which may depend on the state). */
export interface Section {
	readonly label: string;
	rows(s: SimState): readonly Setting[];
}

type Getter<T> = (s: SimState) => T;
type Setter<T> = (s: SimState, value: T) => void;

/** A row choosing one of `options` (stops at both ends, like every TE list). */
function choice(
	label: string,
	options: readonly string[],
	get: Getter<number>,
	set: Setter<number>
): Setting {
	return {
		label,
		value: (s) => options[clamp(get(s), 0, options.length - 1)] ?? '',
		turn: (s, delta) => set(s, clamp(get(s) + delta, 0, options.length - 1))
	};
}

/** A numeric row. */
function number(
	label: string,
	min: number,
	max: number,
	get: Getter<number>,
	set: Setter<number>,
	format: (v: number) => string = String
): Setting {
	return {
		label,
		value: (s) => format(get(s)),
		turn: (s, delta) => set(s, detent(get(s), delta, min, max))
	};
}

/** An off / on row. */
function toggle(label: string, get: Getter<boolean>, set: Setter<boolean>): Setting {
	return choice(
		label,
		['off', 'on'],
		(s) => (get(s) ? 1 : 0),
		(s, v) => set(s, v === 1)
	);
}

/** A row that only shows something. */
function info(label: string, value: Getter<string>): Setting {
	return { label, value, turn: () => {} };
}

const semi = (v: number) => `${v} semi`;
const two = (v: number) => String(v).padStart(2, '0');

const project = (s: SimState) => s.areas.system.projectSettings;
const system = (s: SimState) => s.areas.system.system;

/** Every track's name, 1–16, as the midi page lists them. */
const TRACK_NAMES = [...Array.from({ length: 8 }, (_, i) => `track ${i + 1}`), ...AUX_NAMES];

/** Project settings (project → M4; manual: project/settings). */
export const PROJECT_SECTIONS: readonly Section[] = [
	{
		label: 'general',
		rows: () => [
			// manual: project/transpose
			number(
				'transpose',
				-12,
				12,
				(s) => project(s).transpose,
				(s, v) => (project(s).transpose = v),
				semi
			),
			// manual: versions-and-autosave (autosave can be switched off here or in system settings)
			toggle(
				'auto save',
				(s) => project(s).autosave,
				(s, v) => (project(s).autosave = v)
			),
			// manual: project/settings (OS 1.1.0 scene length; the page is our guess)
			choice(
				'scene length',
				SCENE_LENGTH_MODES,
				(s) => project(s).sceneLength,
				(s, v) => (project(s).sceneLength = v)
			)
		]
	},
	{
		label: 'tempo',
		rows: () => [
			choice(
				'signature',
				SIGNATURES,
				(s) => project(s).signature,
				(s, v) => (project(s).signature = v)
			),
			// the same groove as the tempo page's E2 (manual: "view and edit the groove type")
			choice(
				'groove type',
				GROOVES,
				(s) => s.tempo.groove,
				(s, v) => (s.tempo.groove = v)
			)
		]
	},
	{
		label: 'voices',
		// automatic by default; reserving voices gives a track priority (manual: project/settings)
		rows: () =>
			Array.from({ length: 8 }, (_, i) =>
				number(
					`track ${i + 1}`,
					0,
					24,
					(s) => project(s).voices[i],
					(s, v) => (project(s).voices[i] = v),
					(v) => (v === 0 ? 'auto' : String(v))
				)
			)
	},
	{
		label: 'midi',
		// a channel per track, off in a fresh project (manual: project/midi-channels)
		rows: () =>
			TRACK_NAMES.map((name, i) =>
				number(
					name,
					0,
					16,
					(s) => project(s).channels[i],
					(s, v) => (project(s).channels[i] = v),
					(v) => (v === 0 ? 'off' : String(v))
				)
			)
	}
];

const directions = (label: string, key: 'clock' | 'notes' | 'other') =>
	choice(
		label,
		MIDI_DIRECTIONS,
		(s) => system(s)[key],
		(s, v) => (system(s)[key] = v)
	);

/** The section of the system settings whose E2 and E3 turn the strip's two sides. */
export const PITCHBEND_SECTION = 'pitchbend';

/** The version the replica's firmware model follows (the owner's unit). */
export const OS_VERSION = '1.1.33';

/** System settings (com → M1; manual: com/system-settings). */
export const SYSTEM_SECTIONS: readonly Section[] = [
	{
		label: 'system',
		rows: () => [
			number(
				'screen brightness',
				0,
				99,
				(s) => system(s).screen,
				(s, v) => (system(s).screen = v)
			),
			number(
				'led brightness',
				0,
				99,
				(s) => system(s).leds,
				(s, v) => (system(s).leds = v)
			),
			choice(
				'country',
				COUNTRIES,
				(s) => system(s).country,
				(s, v) => (system(s).country = v)
			),
			choice(
				'power off',
				['instant', 'delayed'],
				(s) => system(s).powerOff,
				(s, v) => (system(s).powerOff = v)
			),
			toggle(
				'auto save',
				(s) => system(s).autosave,
				(s, v) => (system(s).autosave = v)
			),
			// OS 1.1.17 (manual: com/system-settings)
			toggle(
				'sample preview',
				(s) => system(s).preview,
				(s, v) => (system(s).preview = v)
			)
		]
	},
	{
		label: 'keyboard',
		rows: () => [
			// off, soft, hard (manual: howto/enable-velocity)
			choice(
				'velocity',
				['off', 'soft', 'hard'],
				(s) => system(s).velocity,
				(s, v) => (system(s).velocity = v)
			),
			number(
				'detune notes',
				-12,
				12,
				(s) => system(s).detuneNotes,
				(s, v) => (system(s).detuneNotes = v),
				semi
			),
			number(
				'detune cents',
				-50,
				50,
				(s) => system(s).detuneCents,
				(s, v) => (system(s).detuneCents = v),
				(v) => `${v} cents`
			)
		]
	},
	{
		label: 'midi',
		// manual: com/midi-settings (stock: clock in, notes both, other both, channel 1, echo off)
		rows: () => [
			directions('clock', 'clock'),
			directions('notes', 'notes'),
			directions('other', 'other'),
			number(
				'active channel',
				1,
				16,
				(s) => system(s).channel,
				(s, v) => (system(s).channel = v)
			),
			toggle(
				'midi echo',
				(s) => system(s).echo,
				(s, v) => (system(s).echo = v)
			)
		]
	},
	{
		label: 'clock',
		// the date and time stamped on versions and autosaves (manual: com/system-settings)
		rows: () => [
			number(
				'year',
				2024,
				2099,
				(s) => system(s).year,
				(s, v) => (system(s).year = v)
			),
			number(
				'month',
				1,
				12,
				(s) => system(s).month,
				(s, v) => (system(s).month = v),
				two
			),
			number(
				'day',
				1,
				31,
				(s) => system(s).day,
				(s, v) => (system(s).day = v),
				two
			),
			number(
				'hour',
				0,
				23,
				(s) => system(s).hour,
				(s, v) => (system(s).hour = v),
				two
			),
			number(
				'minute',
				0,
				59,
				(s) => system(s).minute,
				(s, v) => (system(s).minute = v),
				two
			)
		]
	},
	{
		label: PITCHBEND_SECTION,
		// E2 turns the left side, E3 the right side, M4 calibrates (manual: com/system-settings)
		rows: () => [
			number(
				'left sensitivity',
				0,
				99,
				(s) => system(s).bendLeft,
				(s, v) => (system(s).bendLeft = v)
			),
			number(
				'right sensitivity',
				0,
				99,
				(s) => system(s).bendRight,
				(s, v) => (system(s).bendRight = v)
			)
		]
	},
	{
		label: 'battery',
		// shown, not set (manual: com/system-settings); the replica has no battery to measure
		rows: () => [info('level', () => '80'), info('current limit', () => '500 ma')]
	},
	{
		label: 'monitor',
		// incoming MIDI, newest first (manual: com/midi-monitor)
		rows: (s) => {
			const lines = s.areas.system.monitor.slice(-8).reverse();
			return lines.length === 0
				? [info('waiting for midi', () => '')]
				: lines.map((line) => info(line, () => ''));
		}
	},
	{
		// TE's art lists this section last; the replica shows its firmware model's version
		label: 'legal',
		rows: () => [info('version', () => OS_VERSION)]
	}
];

const presetOf = (s: SimState): PresetSettings => s.areas.system.presetSettings[s.track];

/** The mod targets a track's engine offers: none, its named M1 parameters, then the rest. */
export function modTargets(s: SimState): readonly string[] {
	const params = engineParams(s.tracks[s.track].engine);
	return MOD_TARGETS.filter((key) => {
		const p = /^p([1-4])$/.exec(key);
		return !p || params[Number(p[1]) - 1] !== null;
	});
}

/** How a mod target reads: the engine's parameter name for p1…p4. */
export function targetName(s: SimState, key: string): string {
	const p = /^p([1-4])$/.exec(key);
	if (!p) return key;
	return engineParams(s.tracks[s.track].engine)[Number(p[1]) - 1] ?? 'none';
}

function target(label: string, source: number): Setting {
	return {
		label,
		value: (s) => targetName(s, presetOf(s).targets[source]),
		turn: (s, delta) => {
			const list = modTargets(s);
			const at = Math.max(0, list.indexOf(presetOf(s).targets[source]));
			presetOf(s).targets[source] = list[clamp(at + delta, 0, list.length - 1)];
		}
	};
}

/** The preset settings row that picks the tuning (M4 edits a user slot there). */
export const TUNING_ROW = 'tuning';

/** Preset settings of the selected track (shift + instrument; manual: preset-settings). */
export const PRESET_SECTIONS: readonly Section[] = [
	{
		label: 'settings',
		rows: () => [
			number(
				'high pass',
				0,
				99,
				(s) => presetOf(s).highPass,
				(s, v) => (presetOf(s).highPass = v),
				(v) => String(shown(v))
			),
			number(
				'velocity sens',
				0,
				99,
				(s) => presetOf(s).velocity,
				(s, v) => (presetOf(s).velocity = v),
				(v) => String(shown(v))
			),
			choice(
				'portamento type',
				PORTAMENTO_TYPES,
				(s) => presetOf(s).portamento,
				(s, v) => (presetOf(s).portamento = v)
			),
			// equal temperament or one of 11 user slots (manual: instrument/user-tunings)
			choice(
				TUNING_ROW,
				['equal', ...Array.from({ length: 11 }, (_, i) => `user ${i + 1}`)],
				(s) => presetOf(s).tuning,
				(s, v) => (presetOf(s).tuning = v)
			),
			choice(
				'tuning root',
				NOTE_NAMES,
				(s) => presetOf(s).root,
				(s, v) => (presetOf(s).root = v)
			),
			number(
				'transpose',
				-24,
				24,
				(s) => presetOf(s).transpose,
				(s, v) => (presetOf(s).transpose = v),
				semi
			),
			number(
				'width',
				0,
				99,
				(s) => presetOf(s).width,
				(s, v) => (presetOf(s).width = v),
				(v) => String(shown(v))
			)
		]
	},
	{
		label: 'mod',
		// a target and an amount per source; a negative amount inverts (manual: preset-settings)
		rows: () =>
			MOD_SOURCES.flatMap((source, i) => [
				target(`${source} target`, i),
				number(
					`${source} amount`,
					-99,
					99,
					(s) => presetOf(s).amounts[i],
					(s, v) => (presetOf(s).amounts[i] = v)
				)
			])
	}
];

/** Settings of the selected device (com → M3; manual: com/devices). */
export const DEVICE_ROWS: readonly Setting[] = (
	[
		['clock', MIDI_DIRECTIONS],
		['notes', MIDI_DIRECTIONS],
		['other', MIDI_DIRECTIONS],
		['timestamp', ['off', 'on']],
		['velocity', ['off', 'on']]
	] as const
).map(([label, options], i) =>
	choice(
		label,
		options,
		(s) => selectedDevice(s)?.settings[i] ?? 0,
		(s, v) => {
			const device = selectedDevice(s);
			if (device) device.settings[i] = v;
		}
	)
);

/** The device the devices page has chosen, if any is known. */
export function selectedDevice(s: SimState) {
	const sys = s.areas.system;
	return sys.devices[clamp(sys.deviceCursor.device, 0, sys.devices.length - 1)];
}
