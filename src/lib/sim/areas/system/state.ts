/**
 * The system area's part of the simulator state (see `../types.ts`): power, the project library and
 * the project's own settings, the COM sub-pages (system settings, controller mode, devices), the
 * preset library, the preset settings of each track and the user tunings. Plain, serialisable data;
 * saved projects keep their content as JSON strings so history stays cheap to hold.
 */
import { NEW_PROJECT_TRACKS, presetSettingsOf } from '../../defaults';
import {
	DEFAULT_TRACK_PRESETS,
	FACTORY_PROJECTS,
	defaultDevices,
	factoryPresets,
	type DeviceEntry,
	type PresetEntry
} from './catalogue';

/** The pages the system area opens over the modes (the project and COM pages are overlays). */
export type SystemPage =
	| 'folder'
	| 'history'
	| 'project-settings'
	| 'naming'
	| 'confirm'
	| 'system-settings'
	| 'controller'
	| 'devices'
	| 'mtp'
	| 'presets'
	| 'preset-settings'
	| 'tuning';

/** How long a module key must stay down to count as held (ours; TE gives no figure). */
export const HOLD_MS = 800;
/** How long our boot sequence runs. */
export const BOOT_MS = 2400;
/** How long a soft label keeps saying what just happened ("saved"). */
export const FLASH_MS = 1500;
/**
 * How long the preset browser's "by engine / by category" popup stays after a click of E1: gone
 * within a second or two on the device (camera b1-1523…1525, 1535/1536, 1565…1568; 1 s is ours).
 */
export const VIEW_POPUP_MS = 1000;
/** The popup fades out over its last … (ours: no frame caught it going). */
export const VIEW_POPUP_FADE_MS = 150;

/** Where a settings list stands: the section (left column) and the row within it. */
export interface ListCursor {
	section: number;
	row: number;
}

/** One saved state of a project (manual: project/versions-and-autosave). */
export interface ProjectVersion {
	readonly label: string;
	/** An autosave rather than a save with M2. */
	readonly auto: boolean;
	/** The project's content (JSON, see `projects.ts`). */
	readonly snapshot: string;
}

/** A project in the projects folder. */
export interface ProjectEntry {
	name: string;
	/** Its latest content, or null for a factory project or template we only know by name. */
	snapshot: string | null;
	/** Newest last. */
	versions: ProjectVersion[];
}

/** The projects folder's folders, in the order TE's art lists them (guide art project-014). */
export const PROJECT_FOLDERS = ['factory', 'templates', 'user'] as const;
/** One of {@link PROJECT_FOLDERS}. */
export type ProjectFolder = (typeof PROJECT_FOLDERS)[number];

/** The project's own settings (manual: project/settings, transpose, midi-channels). */
export interface ProjectSettings {
	/** Semitones, −12…12. */
	transpose: number;
	autosave: boolean;
	/** Index into `SCENE_LENGTH_MODES` (settings.ts). */
	sceneLength: number;
	/** Index into `SIGNATURES` (settings.ts). */
	signature: number;
	/** Voices reserved per instrument track, 0 = automatic (manual: 24 voices shared). */
	voices: number[];
	/** Output channel per track 1–16, 0 = off (manual: a fresh project has every channel off). */
	channels: number[];
}

/** A track sound's preset settings (manual: instrument/preset-settings). */
export interface PresetSettings {
	highPass: number;
	velocity: number;
	/** Index into `PORTAMENTO_TYPES`. */
	portamento: number;
	/** 0 = equal temperament, 1–11 = user tuning slot. */
	tuning: number;
	/** 0 = C … 11 = B. */
	root: number;
	/** Semitones. */
	transpose: number;
	width: number;
	/** Mod targets of modwheel, aftertouch, pitchbend and velocity (`MOD_TARGETS` keys). */
	targets: string[];
	/** Their amounts, −99…99 (negative inverts). */
	amounts: number[];
}

/** Device-wide settings (manual: com/system-settings, com/midi-settings). */
export interface SystemSettings {
	screen: number;
	leds: number;
	/** Index into `COUNTRIES`. */
	country: number;
	/** 0 instant, 1 delayed. */
	powerOff: number;
	autosave: boolean;
	preview: boolean;
	/** 0 off, 1 soft, 2 hard (manual: howto/enable-velocity). */
	velocity: number;
	detuneNotes: number;
	detuneCents: number;
	/** Clock, notes and other: indices into `MIDI_DIRECTIONS`. */
	clock: number;
	notes: number;
	other: number;
	/** The active track channel, 1–16. */
	channel: number;
	echo: boolean;
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	/** Pitchbend strip sensitivity of its left and right side. */
	bendLeft: number;
	bendRight: number;
}

/** What the naming screen is naming. */
export type NamingPurpose =
	'rename-project' | 'save-as' | 'rename-preset' | 'new-folder' | 'rename-folder';

/** The naming screen (manual: project-view rename; preset-management rename). */
export interface NamingState {
	purpose: NamingPurpose;
	text: string;
	cursor: number;
	/** The name before editing (the preset or folder being renamed). */
	original: string;
	/** Where M1 or M3 returns to. */
	back: SystemPage | null;
	/** Why the last confirm was refused ("name taken"). */
	notice: string | null;
}

/** A pending delete (ours: holding M4 in the projects folder asks first). */
export interface ConfirmState {
	folder: ProjectFolder;
	name: string;
}

/** A module key being held (hold M1 = new project, hold M4 = delete). */
export interface HoldState {
	key: string;
	/** The clock when it went down. */
	since: number;
	/** Time counted by `advance` while it stays down. */
	elapsed: number;
	fired: boolean;
}

/** The preset browser (manual: instrument/preset-browser, preset-management). */
export interface PresetBrowserState {
	library: PresetEntry[];
	/** User folders besides the snapshot folder, in creation order. */
	folders: string[];
	/** The device's "by engine" / "by category" choice (a click of E1 swaps it). */
	view: 'category' | 'engine';
	/** The chosen category / folder (category view) or engine (engine view). */
	group: string;
	row: number;
	/**
	 * The first row in view of the group column and of the preset column: the device scrolls a
	 * list only as far as the highlight needs (camera b1-1495…1568).
	 */
	groupTop: number;
	rowTop: number;
	/** The instrument track the browser loads onto (0–7). */
	track: number;
	/** `folder/name` of the preset cut with M1. */
	clipboard: string | null;
}

/** A user tuning slot: per pitch class, cents and micro-cents (manual: instrument/user-tunings). */
export interface UserTuning {
	cents: number[];
	micro: number[];
}

/** What the system area remembers. */
export interface SystemState {
	/** The open page, or null for the modes (and the project / COM overlays). */
	page: SystemPage | null;
	/** The power switch and the boot sequence (manual: hardware/power-and-charging). */
	power: { on: boolean; booting: boolean; elapsed: number; since: number | null };
	hold: HoldState | null;
	/** A soft label on the project page that briefly says what happened ("saved"). */
	flash: { slot: number; text: string; ms: number } | null;
	projects: Record<ProjectFolder, ProjectEntry[]>;
	folder: { folder: ProjectFolder; rows: Record<ProjectFolder, number> };
	/** The project whose history is open, and the chosen version (newest first). */
	history: { folder: ProjectFolder; name: string; row: number };
	projectSettings: ProjectSettings;
	projectCursor: ListCursor;
	naming: NamingState | null;
	confirm: ConfirmState | null;
	system: SystemSettings;
	systemCursor: ListCursor;
	/** A soft label briefly confirming an action on a settings page ("calibrated"). */
	notice: string | null;
	controller: { channel: number; knobs: number; octave: boolean };
	devices: DeviceEntry[];
	deviceCursor: { device: number; setting: number };
	/** Incoming MIDI the monitor page lists, newest last (a connected device may feed it). */
	monitor: string[];
	presets: PresetBrowserState;
	/** Milliseconds left of the preset browser's "by engine / by category" popup (0: none). */
	presetPopup: number;
	/** The preset each instrument track was loaded from (`folder/name`). */
	trackPresets: string[];
	presetSettings: PresetSettings[];
	presetCursor: ListCursor;
	tunings: UserTuning[];
	tuningCursor: { slot: number; note: number };
	/** A track sound copied with `Tn + M2`, for `Tn + M3` (manual: save-copy-scramble). */
	sound: string | null;
	/** How many sounds `Tn + M1` has scrambled (seeds the next scramble). */
	scrambles: number;
}

/** A new project's own settings. */
export function defaultProjectSettings(): ProjectSettings {
	return {
		transpose: 0,
		autosave: true,
		sceneLength: 0,
		signature: 1,
		voices: Array.from({ length: 8 }, () => 0),
		channels: Array.from({ length: 16 }, () => 0)
	};
}

/** A sound's preset settings as TE's art shows them (guide art instrument-103). */
export function defaultPresetSettings(): PresetSettings {
	return {
		highPass: 0,
		velocity: 59,
		portamento: 0,
		tuning: 0,
		root: 0,
		transpose: 0,
		width: 0,
		targets: ['none', 'none', 'none', 'none'],
		amounts: [0, 0, 0, 0]
	};
}

/** A new project's preset settings, track by track (what the device stores with its presets). */
export function newProjectPresetSettings(): PresetSettings[] {
	return NEW_PROJECT_TRACKS.map((stored) => presetSettingsOf(stored, defaultPresetSettings()));
}

/** Settings of a unit fresh from the box (the MIDI ones as found on the owner's OS 1.1.33). */
export function defaultSystemSettings(): SystemSettings {
	return {
		screen: 80,
		leds: 80,
		country: 0,
		powerOff: 0,
		autosave: true,
		preview: true,
		velocity: 0,
		detuneNotes: 0,
		detuneCents: 0,
		clock: 1,
		notes: 3,
		other: 3,
		channel: 1,
		echo: false,
		year: 2026,
		month: 9,
		day: 26,
		hour: 12,
		minute: 0,
		bendLeft: 50,
		bendRight: 50
	};
}

/** The system area's state in a new project on a unit fresh from the box. */
export function initialSystem(): SystemState {
	return {
		page: null,
		power: { on: true, booting: false, elapsed: 0, since: null },
		hold: null,
		flash: null,
		projects: {
			factory: FACTORY_PROJECTS.map((name) => ({ name, snapshot: null, versions: [] })),
			templates: [],
			user: [{ name: 'project 1', snapshot: null, versions: [] }]
		},
		folder: { folder: 'user', rows: { factory: 0, templates: 0, user: 0 } },
		history: { folder: 'user', name: 'project 1', row: 0 },
		projectSettings: defaultProjectSettings(),
		projectCursor: { section: 0, row: 0 },
		naming: null,
		confirm: null,
		system: defaultSystemSettings(),
		systemCursor: { section: 0, row: 0 },
		notice: null,
		controller: { channel: 1, knobs: 0, octave: true },
		devices: defaultDevices(),
		deviceCursor: { device: 0, setting: 0 },
		monitor: [],
		presets: {
			library: factoryPresets(),
			folders: [],
			// the owner's unit showed engine view the first time (b1-1495)
			view: 'engine',
			group: 'drum',
			row: 0,
			groupTop: 0,
			rowTop: 0,
			track: 0,
			clipboard: null
		},
		presetPopup: 0,
		trackPresets: [...DEFAULT_TRACK_PRESETS],
		presetSettings: newProjectPresetSettings(),
		presetCursor: { section: 0, row: 0 },
		tunings: Array.from({ length: 11 }, () => ({
			cents: Array.from({ length: 12 }, () => 0),
			micro: Array.from({ length: 12 }, () => 0)
		})),
		tuningCursor: { slot: 0, note: 0 },
		sound: null,
		scrambles: 0
	};
}
