/**
 * The system area: the power switch and boot, the project page and everything behind it (new, save,
 * save as, rename, the project settings, the projects folder and its history), the COM page and its
 * sub-pages (system settings, controller mode, devices, MTP), the preset browser (shift + Tn), the
 * preset settings (shift + instrument) with the user tuning editor, and the track-sound combos that
 * fill the preset library (Tn + M1–M4) (guide art project-004 … 019, com-014 … 039,
 * instrument-103, 118). Behaviour follows our manual; the unit ids are cited where each rule
 * lives, and choices the manual leaves open are marked as ours.
 */
import { MULTI_OUT_MODES, clamp, type PageNumber, type SimState } from '../../params';
import type { SimInput } from '../../input';
import type { AreaContext, LedMap, SimArea } from '../types';
import { systemFrame } from './build';
import {
	changeCharacter,
	deleteCharacter,
	finalName,
	moveCursor,
	nextCharacter,
	startNaming
} from './naming';
import {
	copySound,
	cutPreset,
	deleteFolder,
	deletePreset,
	findPreset,
	highlighted,
	loadPreset,
	newFolder,
	openBrowser,
	pastePreset,
	pasteSound,
	presetKey,
	rekeyTracks,
	renameFolder,
	renamePreset,
	saveSound,
	scrambleSound,
	toggleView,
	turnGroup,
	turnPreset
} from './presets';
import {
	deleteProject,
	duplicateProject,
	findProject,
	loadProject,
	loadVersion,
	newProject,
	nextName,
	renameProject,
	saveProject,
	saveProjectAs
} from './projects';
import {
	DEVICE_ROWS,
	PITCHBEND_SECTION,
	PRESET_SECTIONS,
	PROJECT_SECTIONS,
	SYSTEM_SECTIONS,
	TUNING_ROW,
	type Section
} from './settings';
import {
	BOOT_MS,
	FLASH_MS,
	HOLD_MS,
	PROJECT_FOLDERS,
	type ListCursor,
	type SystemPage,
	type SystemState
} from './state';

/** The replica's power switch (controls.json; its input is a toggle). */
export const POWER_SWITCH = 'switch.power';

const sysOf = (s: SimState): SystemState => s.areas.system;
const softKey = (id: string): PageNumber | null => {
	const m = /^key\.m([1-4])$/.exec(id);
	return m ? (Number(m[1]) as PageNumber) : null;
};

/** Keys that keep working on any page: notes, steps, transport, octave keys, encoder pushes. */
const passes = (id: string) =>
	id.startsWith('keyboard.') ||
	id.startsWith('step.') ||
	id.startsWith('encoder.') ||
	['key.play', 'key.stop', 'key.record', 'key.minus', 'key.plus'].includes(id);

/** Leaves the area's page (the overlay underneath stays). */
function closePage(s: SimState): void {
	const sys = sysOf(s);
	sys.page = null;
	sys.naming = null;
	sys.confirm = null;
	sys.hold = null;
	sys.notice = null;
}

/** Opens one of the area's pages over `overlay` (null: over the mode). */
function openPage(s: SimState, page: SystemPage, overlay: SimState['overlay']): void {
	const sys = sysOf(s);
	sys.page = page;
	sys.notice = null;
	sys.hold = null;
	s.overlay = overlay;
	s.sub = null;
	s.picker = null;
}

/**
 * A key the page does not use: notes, steps and transport pass through and the page stays; any
 * other key leaves the page and then does its usual job (the core handles it).
 */
function passOrLeave(s: SimState, id: string): boolean {
	if (passes(id)) return false;
	closePage(s);
	// the page's own key goes back to its main page instead of closing it
	return (
		(id === 'key.project' && s.overlay === 'project') || (id === 'key.com' && s.overlay === 'com')
	);
}

// ─────────────────────────────────────────────────────────────── power (manual: power-and-charging)

function togglePower(ctx: AreaContext): void {
	const s = ctx.state;
	const sys = sysOf(s);
	if (sys.power.on) {
		// switching off keeps everything (the unit saves as it goes) and stops the sound
		sys.power = { on: false, booting: false, elapsed: 0, since: null };
		s.transport.playing = false;
		s.transport.recording = false;
		sys.hold = null;
		sys.flash = null;
	} else {
		sys.power = { on: true, booting: true, elapsed: 0, since: ctx.now() };
	}
}

/** After the boot: the last selected track's page (manual: "then the last selected track"). */
function finishBoot(s: SimState): void {
	const sys = sysOf(s);
	sys.power = { on: true, booting: false, elapsed: 0, since: null };
	closePage(s);
	s.overlay = null;
	s.sub = null;
	s.picker = null;
}

// ─────────────────────────────────────────────────────────────── holds

/** A held module key did its job: M1 on the project page, M4 in the projects folder. */
function fireHold(s: SimState): void {
	const sys = sysOf(s);
	const hold = sys.hold;
	if (!hold || hold.fired) return;
	hold.fired = true;
	if (hold.key === 'key.m1' && sys.page === null && s.overlay === 'project') {
		// manual: project-view: hold M1 creates a new project (autosaving this one)
		newProject(s);
		sys.flash = { slot: 0, text: 'new', ms: FLASH_MS };
	} else if (hold.key === 'key.m4' && sys.page === 'folder') {
		// manual: projects-folder: hold M4 deletes; ours: it asks first
		const folder = sys.folder.folder;
		const entry = sys.projects[folder][sys.folder.rows[folder]];
		if (entry && folder !== 'factory') {
			sys.confirm = { folder, name: entry.name };
			sys.page = 'confirm';
		}
	}
}

function startHold(ctx: AreaContext, key: string): void {
	sysOf(ctx.state).hold = { key, since: ctx.now(), elapsed: 0, fired: false };
}

// ─────────────────────────────────────────────────────────────── settings lists

/**
 * E1 section, E2 row, E3 / E4 value (manual: project/settings, com/system-settings,
 * preset-settings).
 */
function turnList(
	s: SimState,
	sections: readonly Section[],
	cursor: ListCursor,
	e: number,
	delta: number
): void {
	const section = sections[clamp(cursor.section, 0, sections.length - 1)];
	if (e === 0) {
		const next = clamp(cursor.section + delta, 0, sections.length - 1);
		if (next !== cursor.section) {
			cursor.section = next;
			cursor.row = 0;
		}
		return;
	}
	const rows = section.rows(s);
	if (rows.length === 0) return;
	if (e === 1) {
		cursor.row = clamp(cursor.row + delta, 0, rows.length - 1);
		return;
	}
	rows[clamp(cursor.row, 0, rows.length - 1)].turn(s, delta);
}

// ─────────────────────────────────────────────────────────────── pages: keys

/** The project page (manual: project/project-view). */
function projectKey(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	const sys = sysOf(s);
	switch (softKey(id)) {
		case 1:
			startHold(ctx, id);
			return true;
		case 2:
			if (s.shift) {
				// save as: name the copy (shift + M2)
				const taken = sys.projects.user.map((p) => p.name);
				sys.naming = startNaming('save-as', nextName(s.project.name, taken), s.project.name, null);
				sys.page = 'naming';
			} else {
				saveProject(s);
				sys.flash = { slot: 1, text: 'saved', ms: FLASH_MS };
			}
			return true;
		case 3:
			sys.naming = startNaming('rename-project', s.project.name, s.project.name, null);
			sys.page = 'naming';
			return true;
		case 4:
			openPage(s, 'project-settings', 'project');
			return true;
		default:
			return false;
	}
}

/** The COM page (manual: com/overview). */
function comKey(s: SimState, id: string): boolean {
	const pages: readonly SystemPage[] = ['system-settings', 'controller', 'devices', 'mtp'];
	const n = softKey(id);
	if (n === null) return false;
	openPage(s, pages[n - 1], 'com');
	if (n === 3) sysOf(s).deviceCursor.setting = 0;
	return true;
}

/** Project settings (manual: project/settings: M1 leaves). */
function projectSettingsKey(s: SimState, id: string): boolean {
	const n = softKey(id);
	if (n === 1) closePage(s);
	return n !== null || passOrLeave(s, id);
}

/** System settings (manual: com/system-settings: M1 back; M4 calibrates the pitchbend). */
function systemSettingsKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const n = softKey(id);
	if (n === 1) closePage(s);
	else if (n === 4 && SYSTEM_SECTIONS[sys.systemCursor.section]?.label === PITCHBEND_SECTION) {
		sys.notice = 'calibrated';
	}
	return n !== null || passOrLeave(s, id);
}

/** Devices (manual: com/devices: M1 back, M2 forgets the chosen device). */
function devicesKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const n = softKey(id);
	if (n === 1) closePage(s);
	else if (n === 2 && sys.devices.length > 0) {
		sys.devices.splice(clamp(sys.deviceCursor.device, 0, sys.devices.length - 1), 1);
		sys.deviceCursor.device = clamp(
			sys.deviceCursor.device,
			0,
			Math.max(0, sys.devices.length - 1)
		);
	}
	return n !== null || passOrLeave(s, id);
}

/**
 * The projects folder (manual: projects-folder: M1 load, M2 history, M3 duplicate, hold M4
 * delete).
 */
function folderKey(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	const sys = sysOf(s);
	const folder = sys.folder.folder;
	const entry = sys.projects[folder][sys.folder.rows[folder]];
	switch (softKey(id)) {
		case 1:
			if (entry) {
				loadProject(s, folder, entry.name);
				closePage(s);
				s.overlay = 'project';
			}
			return true;
		case 2:
			if (entry) {
				sys.history = { folder, name: entry.name, row: 0 };
				sys.page = 'history';
			}
			return true;
		case 3:
			if (entry) {
				const copy = duplicateProject(s, folder, entry.name);
				if (copy) {
					sys.folder.folder = 'user';
					sys.folder.rows.user = sys.projects.user.findIndex((p) => p.name === copy);
				}
			}
			return true;
		case 4:
			startHold(ctx, id);
			return true;
		default:
			return passOrLeave(s, id);
	}
}

/** A project's history (ours: M1 loads the version, M2 goes back to the folder). */
function historyKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	switch (softKey(id)) {
		case 1: {
			const { folder, name, row } = sys.history;
			if (findProject(s, folder, name)?.versions.length) {
				loadVersion(s, folder, name, row);
				closePage(s);
				s.overlay = 'project';
			}
			return true;
		}
		case 2:
			sys.page = 'folder';
			return true;
		case null:
			return passOrLeave(s, id);
		default:
			return true;
	}
}

/** The delete question (ours): M4 deletes, any other module key keeps the project. */
function confirmKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const n = softKey(id);
	if (n === null) return passOrLeave(s, id);
	if (n === 4 && sys.confirm) {
		deleteProject(s, sys.confirm.folder, sys.confirm.name);
		const folder = sys.confirm.folder;
		sys.folder.rows[folder] = clamp(
			sys.folder.rows[folder],
			0,
			Math.max(0, sys.projects[folder].length - 1)
		);
	}
	sys.confirm = null;
	sys.page = 'folder';
	return true;
}

/** Commits the naming screen; returns why it could not, or null. */
function commitName(s: SimState, name: string): string | null {
	const sys = sysOf(s);
	const n = sys.naming;
	if (!n) return null;
	const b = sys.presets;
	switch (n.purpose) {
		case 'rename-project':
			return renameProject(s, name);
		case 'save-as':
			return saveProjectAs(s, name);
		case 'rename-preset': {
			const error = renamePreset(b, n.original, name);
			const folder = n.original.slice(0, n.original.lastIndexOf('/'));
			if (!error) rekeyTracks(sys.trackPresets, n.original, `${folder}/${name}`);
			return error;
		}
		case 'new-folder':
			return newFolder(b, name);
		case 'rename-folder': {
			const error = renameFolder(b, n.original, name);
			if (!error) rekeyTracks(sys.trackPresets, n.original, name, true);
			return error;
		}
	}
}

/** The naming screen (manual: M1 confirms, M2 next character, M3 cancels, M4 deletes). */
function namingKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const n = sys.naming;
	const key = softKey(id);
	if (!n || key === null) return passOrLeave(s, id);
	if (key === 2) nextCharacter(n);
	else if (key === 4) deleteCharacter(n);
	else {
		if (key === 1) {
			const name = finalName(n);
			const error = name === null ? 'name is empty' : commitName(s, name);
			if (error) {
				n.notice = error;
				return true;
			}
		}
		// done or cancelled: back where the naming started
		const back = n.back;
		sys.naming = null;
		sys.page = back;
	}
	return true;
}

/**
 * The preset browser (manual: preset-management): M1 cut, M2 paste, M3 rename, M4 delete a user
 * preset; with shift, M1 / M3 / M4 make, rename and delete a folder.
 */
function presetsKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const b = sys.presets;
	const key = softKey(id);
	if (key === null) return passOrLeave(s, id);
	if (s.shift) {
		if (key === 1) {
			const name = nextName('folder 0', [...b.folders]);
			sys.naming = startNaming('new-folder', name, '', 'presets');
			sys.page = 'naming';
		} else if (key === 3 && b.view === 'category' && b.folders.includes(b.group)) {
			sys.naming = startNaming('rename-folder', b.group, b.group, 'presets');
			sys.page = 'naming';
		} else if (key === 4) deleteFolder(b);
		return true;
	}
	if (key === 1) cutPreset(b);
	else if (key === 2) {
		const from = b.clipboard;
		const moving = findPreset(b, from);
		if (pastePreset(b) && from && moving) rekeyTracks(sys.trackPresets, from, presetKey(moving));
	} else if (key === 3) {
		const preset = highlighted(b);
		if (preset?.user) {
			sys.naming = startNaming('rename-preset', preset.name, presetKey(preset), 'presets');
			sys.page = 'naming';
		}
	} else deletePreset(b);
	return true;
}

/**
 * Preset settings (manual: preset-settings: instrument or M1–M4 lead back to the pages; M4 edits a
 * user tuning slot, manual: user-tunings).
 */
function presetSettingsKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const key = softKey(id);
	if (key === null) return passOrLeave(s, id);
	const rows =
		PRESET_SECTIONS[clamp(sys.presetCursor.section, 0, PRESET_SECTIONS.length - 1)].rows(s);
	const row = rows[clamp(sys.presetCursor.row, 0, rows.length - 1)];
	const slot = sys.presetSettings[s.track].tuning;
	if (key === 4 && row?.label === TUNING_ROW && slot > 0) {
		sys.tuningCursor.slot = slot - 1;
		sys.page = 'tuning';
		return true;
	}
	// straight to that page of the instrument (the how-to: "press M2 … jump to the envelope")
	closePage(s);
	s.mode = 'instrument';
	s.active = 'instrument';
	s.overlay = null;
	s.pages.instrument = key;
	return true;
}

/** The user tuning editor (ours: M1 or M4 goes back; the keyboard picks the note). */
function tuningKey(s: SimState, id: string): boolean {
	const sys = sysOf(s);
	const key = softKey(id);
	if (key === 1 || key === 4) {
		sys.page = 'preset-settings';
		return true;
	}
	if (key !== null) return true;
	const note = /^keyboard\.([a-g]s?)\d$/.exec(id);
	if (note) {
		const names = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
		sys.tuningCursor.note = Math.max(0, names.indexOf(note[1]));
	}
	return passOrLeave(s, id);
}

// ─────────────────────────────────────────────────────────────── the area

/** The instrument track whose key is held, or −1. */
function heldTrack(ctx: AreaContext): number {
	for (let i = 0; i < 8; i++) if (ctx.isHeld(`track.${i + 1}`)) return i;
	return -1;
}

/**
 * A module key pressed while a track key is held (manual: save-copy-scramble): M1 scrambles the
 * track's sound, M2 copies it, M3 pastes onto it, M4 saves it as a snapshot preset (with shift,
 * back into the snapshot it came from; manual: save-to-same-snapshot).
 */
function trackCombo(s: SimState, track: number, key: PageNumber): void {
	if (key === 1) scrambleSound(s, track);
	else if (key === 2) copySound(s, track);
	else if (key === 3) pasteSound(s, track);
	else saveSound(s, track, s.shift);
}

/** Opens the preset browser on instrument track `track` (manual: preset-browser). */
function openPresets(s: SimState, track: number): void {
	s.track = track;
	s.active = 'instrument';
	openPage(s, 'presets', null);
	openBrowser(s, track);
}

/** The system area (see the module comment); first in the registry, so power comes first. */
export const system: SimArea = {
	id: 'system',

	owns: (s) => {
		const sys = sysOf(s);
		return (
			!sys.power.on ||
			sys.power.booting ||
			sys.page !== null ||
			s.sub !== null ||
			s.overlay === 'project' ||
			s.overlay === 'com'
		);
	},

	frame: systemFrame,

	claim(ctx: AreaContext, input: SimInput): boolean {
		const s = ctx.state;
		const sys = sysOf(s);
		if (input.id === POWER_SWITCH) {
			if (input.type === 'press') togglePower(ctx);
			// a switch is never "held"
			const at = s.held.indexOf(POWER_SWITCH);
			if (at >= 0) s.held.splice(at, 1);
			return true;
		}
		if (!sys.power.on) return true;
		if (sys.power.booting) {
			// without a clock to advance it, the boot ends at the first input after its time
			if (sys.power.since !== null && ctx.now() - sys.power.since >= BOOT_MS) finishBoot(s);
			return true;
		}
		if (input.type !== 'press') return false;
		if (sys.page === 'controller' || sys.page === 'mtp') {
			// manual: controller-mode: shift + com leaves; every other key is the controller's
			if (sys.page === 'controller' && input.id === 'key.com' && s.shift) {
				closePage(s);
				s.overlay = 'com';
				return true;
			}
			return false;
		}
		const key = softKey(input.id);
		const held = heldTrack(ctx);
		if (key !== null && held >= 0 && s.mode === 'instrument') {
			trackCombo(s, held, key);
			return true;
		}
		if (!s.shift) return false;
		if (input.id === 'key.project') {
			// manual: projects-folder: shift + project, on the open project
			openPage(s, 'folder', 'project');
			const at = sys.projects.user.findIndex((p) => p.name === s.project.name);
			sys.folder.folder = at >= 0 ? 'user' : sys.folder.folder;
			if (at >= 0) sys.folder.rows.user = at;
			return true;
		}
		if (input.id === 'key.instrument') {
			// manual: preset-settings: shift + instrument, for the selected track
			openPage(s, 'preset-settings', null);
			return true;
		}
		const track = /^track\.([1-8])$/.exec(input.id);
		if (track && s.mode === 'instrument' && !ctx.isHeld('key.instrument')) {
			openPresets(s, Number(track[1]) - 1);
			return true;
		}
		return false;
	},

	press(ctx: AreaContext, id: string): boolean {
		const s = ctx.state;
		const sys = sysOf(s);
		// a brief label ("saved", "hold", "calibrated") lasts until the next key
		sys.flash = null;
		sys.notice = null;
		switch (sys.page) {
			case null:
				if (s.overlay === 'project') return projectKey(ctx, id);
				if (s.overlay === 'com') return comKey(s, id);
				return false;
			case 'project-settings':
				return projectSettingsKey(s, id);
			case 'system-settings':
				return systemSettingsKey(s, id);
			case 'controller':
				return true;
			case 'mtp': {
				// manual: mtp: M4 ejects (TE's text also has M1 leave)
				const key = softKey(id);
				if (key === 1 || key === 4) closePage(s);
				return true;
			}
			case 'devices':
				return devicesKey(s, id);
			case 'folder':
				return folderKey(ctx, id);
			case 'history':
				return historyKey(s, id);
			case 'confirm':
				return confirmKey(s, id);
			case 'naming':
				return namingKey(s, id);
			case 'presets':
				return presetsKey(s, id);
			case 'preset-settings':
				return presetSettingsKey(s, id);
			case 'tuning':
				return tuningKey(s, id);
		}
	},

	release(ctx: AreaContext, id: string): boolean {
		const s = ctx.state;
		const sys = sysOf(s);
		const hold = sys.hold;
		if (!hold || hold.key !== id) return false;
		if (!hold.fired && (ctx.now() - hold.since >= HOLD_MS || hold.elapsed >= HOLD_MS)) fireHold(s);
		else if (!hold.fired) {
			// a tap: say that this key wants holding (ours)
			if (id === 'key.m1' && sys.page === null) sys.flash = { slot: 0, text: 'hold', ms: FLASH_MS };
			else if (id === 'key.m4' && sys.page === 'folder') sys.notice = 'hold';
		}
		sys.hold = null;
		return true;
	},

	turn(ctx: AreaContext, e: number, delta: number): void {
		const s = ctx.state;
		const sys = sysOf(s);
		switch (sys.page) {
			case null:
				if (s.overlay === 'com') {
					// manual: com/overview: E1 bluetooth advertise, E3 multi-out, (E4 charging, ours)
					const c = s.com;
					if (e === 0) c.advertising = delta > 0;
					else if (e === 2) {
						const at = MULTI_OUT_MODES.indexOf(c.multiOut);
						c.multiOut = MULTI_OUT_MODES[clamp(at + delta, 0, MULTI_OUT_MODES.length - 1)];
					} else if (e === 3) c.charging = delta > 0;
				}
				return;
			case 'project-settings':
				return turnList(s, PROJECT_SECTIONS, sys.projectCursor, e, delta);
			case 'system-settings': {
				const section =
					SYSTEM_SECTIONS[clamp(sys.systemCursor.section, 0, SYSTEM_SECTIONS.length - 1)];
				if (section.label === PITCHBEND_SECTION && (e === 1 || e === 2)) {
					// manual: E2 turns the left side's sensitivity, E3 the right side's
					sys.systemCursor.row = e - 1;
					section.rows(s)[e - 1].turn(s, delta);
					return;
				}
				return turnList(s, SYSTEM_SECTIONS, sys.systemCursor, e, delta);
			}
			case 'preset-settings':
				return turnList(s, PRESET_SECTIONS, sys.presetCursor, e, delta);
			case 'controller': {
				// manual: controller-mode: with shift, E1 channel, E2 knob mode, E3 octave keys
				if (!s.shift) return;
				const c = sys.controller;
				if (e === 0) c.channel = clamp(c.channel + delta, 1, 16);
				else if (e === 1) c.knobs = clamp(c.knobs + delta, 0, 1);
				else if (e === 2) c.octave = delta > 0;
				return;
			}
			case 'devices': {
				// manual: devices: E1 device, E2 setting, E3 / E4 value
				const d = sys.deviceCursor;
				if (e === 0) {
					d.device = clamp(d.device + delta, 0, Math.max(0, sys.devices.length - 1));
				} else if (e === 1) d.setting = clamp(d.setting + delta, 0, DEVICE_ROWS.length - 1);
				else DEVICE_ROWS[clamp(d.setting, 0, DEVICE_ROWS.length - 1)].turn(s, delta);
				return;
			}
			case 'folder': {
				const f = sys.folder;
				if (e === 0) {
					const at = PROJECT_FOLDERS.indexOf(f.folder);
					f.folder = PROJECT_FOLDERS[clamp(at + delta, 0, PROJECT_FOLDERS.length - 1)];
				} else {
					const count = sys.projects[f.folder].length;
					f.rows[f.folder] = clamp(f.rows[f.folder] + delta, 0, Math.max(0, count - 1));
				}
				sys.notice = null;
				return;
			}
			case 'history': {
				if (e === 0) return;
				const entry = sys.projects[sys.history.folder].find((p) => p.name === sys.history.name);
				const count = entry?.versions.length ?? 0;
				sys.history.row = clamp(sys.history.row + delta, 0, Math.max(0, count - 1));
				return;
			}
			case 'naming': {
				const n = sys.naming;
				if (!n) return;
				if (e === 0) moveCursor(n, delta);
				else changeCharacter(n, delta);
				return;
			}
			case 'presets':
				// manual: preset-browser: E1 category / engine, E2–E4 preset
				if (e === 0) turnGroup(sys.presets, delta);
				else turnPreset(sys.presets, delta);
				return;
			case 'tuning': {
				// manual: user-tunings: E1 cents, E2 micro-cents (ranges ours)
				const { slot, note } = sys.tuningCursor;
				const t = sys.tunings[slot];
				if (e === 0) t.cents[note] = clamp(t.cents[note] + delta, -99, 99);
				else if (e === 1) t.micro[note] = clamp(t.micro[note] + delta, 0, 99);
				return;
			}
			default:
				return;
		}
	},

	click(ctx: AreaContext, e: number): void {
		const s = ctx.state;
		const sys = sysOf(s);
		if (sys.page === null && s.overlay === 'com') {
			// manual: bluetooth-midi: clicking E1 advertises as well
			if (e === 0) s.com.advertising = !s.com.advertising;
			return;
		}
		if (sys.page !== 'presets') return;
		const b = sys.presets;
		// manual: preset-browser: click E1 switches the view, click E2–E4 loads
		if (e === 0) toggleView(b);
		else {
			const preset = highlighted(b);
			if (preset) loadPreset(s, b.track, preset);
		}
	},

	leds(state: SimState, leds: LedMap): void {
		const sys = sysOf(state);
		if (sys.power.on && !sys.power.booting) return;
		for (const id of Object.keys(leds) as (keyof LedMap)[]) leds[id] = 'off';
	},

	advance(state: SimState, ms: number): void {
		const sys = sysOf(state);
		if (!sys.power.on) return;
		if (sys.power.booting) {
			sys.power.elapsed += ms;
			if (sys.power.elapsed >= BOOT_MS) finishBoot(state);
			return;
		}
		const hold = sys.hold;
		if (hold && !hold.fired && state.held.includes(hold.key)) {
			hold.elapsed += ms;
			if (hold.elapsed >= HOLD_MS) fireHold(state);
		}
		if (sys.flash) {
			sys.flash.ms -= ms;
			if (sys.flash.ms <= 0) sys.flash = null;
		}
	}
};
