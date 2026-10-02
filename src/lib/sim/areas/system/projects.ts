/**
 * The projects behind the project page and the projects folder (manual: project/project-view,
 * projects-folder, versions-and-autosave, templates): saving, autosaving, loading (a project or one
 * of its versions), duplicating, deleting, naming and starting a new project. A project's content
 * is everything that belongs to the song: the instrument and auxiliary tracks, the tempo, the other
 * areas' state, the project settings and each track's preset and preset settings. Device-wide
 * things (system settings, devices, the preset library, the projects folder itself) stay. Content
 * is kept as JSON so a history of versions stays cheap to hold in the reactive state.
 */
import { defaultState, type SimState } from '../../params';
import { DEFAULT_TRACK_PRESETS } from './catalogue';
import {
	defaultProjectSettings,
	newProjectPresetSettings,
	type ProjectEntry,
	type ProjectFolder,
	type ProjectSettings,
	type PresetSettings
} from './state';

/** Versions kept per project (ours: the device keeps every one; the replica keeps the latest). */
export const MAX_VERSIONS = 16;

/** What a snapshot holds. */
export interface ProjectContent {
	readonly tracks: SimState['tracks'];
	readonly aux: SimState['aux'];
	readonly tempo: SimState['tempo'];
	readonly areas: Omit<SimState['areas'], 'system'>;
	readonly settings: ProjectSettings;
	readonly trackPresets: string[];
	readonly presetSettings: PresetSettings[];
}

/** Every area's state but the system area's own (which is device-wide, not the song's). */
function songAreas(areas: SimState['areas']): Omit<SimState['areas'], 'system'> {
	const out: Partial<SimState['areas']> = { ...areas };
	delete out.system;
	return out as Omit<SimState['areas'], 'system'>;
}

/** The project's content now, as JSON. */
export function snapshot(s: SimState): string {
	const system = s.areas.system;
	const content: ProjectContent = {
		tracks: s.tracks,
		aux: s.aux,
		tempo: s.tempo,
		areas: songAreas(s.areas),
		settings: system.projectSettings,
		trackPresets: system.trackPresets,
		presetSettings: system.presetSettings
	};
	return JSON.stringify(content);
}

/**
 * Whether two snapshots hold the same project, apart from the clocks that run on as time passes
 * (the sequencer's, the record page's meter and timer), which are no part of it: compared whole, a
 * save read as unsaved a frame later, and a save shown on the replica said it had not arrived.
 */
export function sameContent(a: string, b: string): boolean {
	if (a === b) return true;
	const still = (json: string) => {
		let c: ProjectContent | null;
		try {
			c = JSON.parse(json) as ProjectContent | null;
		} catch {
			return json;
		}
		// an entry with nothing stored yet holds no project to compare
		if (!c || typeof c !== 'object' || !c.areas) return json;
		const areas = c.areas as Partial<SimState['areas']>;
		const record = areas.sample?.record;
		return JSON.stringify({
			...c,
			areas: {
				...areas,
				...(areas.sequencer ? { sequencer: { ...areas.sequencer, clock: 0 } } : {}),
				...(areas.sample && record
					? {
							sample: {
								...areas.sample,
								record: {
									...record,
									clock: 0,
									level: 0,
									held: 0,
									armedAt: 0,
									armedClock: 0,
									played: 0,
									playing: false
								}
							}
						}
					: {})
			}
		});
	};
	return still(a) === still(b);
}

/** Leaves playback and the pages a project change would strand. */
function settle(s: SimState, name: string): void {
	s.project.name = name;
	s.transport.playing = false;
	s.transport.recording = false;
	s.transport.position = 0;
	s.picker = null;
	s.sub = null;
}

/** Puts a snapshot's content into the state under `name`. */
export function restore(s: SimState, json: string, name: string): void {
	const c = JSON.parse(json) as ProjectContent;
	s.tracks = c.tracks;
	s.aux = c.aux;
	s.tempo = c.tempo;
	Object.assign(s.areas, c.areas);
	const sys = s.areas.system;
	sys.projectSettings = c.settings;
	sys.trackPresets = c.trackPresets;
	sys.presetSettings = c.presetSettings;
	settle(s, name);
}

/** A new project's content under `name` (manual: project-view: the default sounds). */
export function freshProject(s: SimState, name: string): void {
	const fresh = defaultState();
	s.tracks = fresh.tracks;
	s.aux = fresh.aux;
	s.tempo = fresh.tempo;
	Object.assign(s.areas, songAreas(fresh.areas));
	const sys = s.areas.system;
	sys.projectSettings = defaultProjectSettings();
	sys.trackPresets = [...DEFAULT_TRACK_PRESETS];
	sys.presetSettings = newProjectPresetSettings();
	settle(s, name);
}

/**
 * The next free name after `name`: its trailing number counted up ("demo 1" → "demo 2"), or " 2"
 * added ("cherry" → "cherry 2"); ours, for copies, save-as and new folders.
 */
export function nextName(name: string, taken: readonly string[]): string {
	const m = /^(.*\S) (\d+)$/.exec(name);
	const base = m ? m[1] : name;
	let n = m ? Number(m[2]) + 1 : 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

/** A project in a folder. */
export function findProject(
	s: SimState,
	folder: ProjectFolder,
	name: string
): ProjectEntry | undefined {
	return s.areas.system.projects[folder].find((p) => p.name === name);
}

/** The open project's entry in the user folder (added when missing). */
function userEntry(s: SimState): ProjectEntry {
	const user = s.areas.system.projects.user;
	let entry = user.find((p) => p.name === s.project.name);
	if (!entry) {
		entry = { name: s.project.name, snapshot: null, versions: [] };
		user.push(entry);
	}
	return entry;
}

/** A version's label: month-day, a running number and what made it ("09-26 (3) save"; ours). */
function versionLabel(s: SimState, entry: ProjectEntry, auto: boolean): string {
	const c = s.areas.system.system;
	const date = `${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
	const n = (entry.versions.length ? parseRunning(entry.versions.at(-1)?.label) : 0) + 1;
	return `${date} (${n}) ${auto ? 'auto' : 'save'}`;
}

const parseRunning = (label?: string) => Number(/\((\d+)\)/.exec(label ?? '')?.[1] ?? 0);

/** Stores the open project and adds a version to its history (manual: M2 saves a version). */
export function saveProject(s: SimState, auto = false): void {
	const entry = userEntry(s);
	const json = snapshot(s);
	entry.snapshot = json;
	entry.versions.push({ label: versionLabel(s, entry, auto), auto, snapshot: json });
	if (entry.versions.length > MAX_VERSIONS)
		entry.versions.splice(0, entry.versions.length - MAX_VERSIONS);
}

/** Whether autosave is on (off in the project or the system settings leaves manual saves). */
export function autosaves(s: SimState): boolean {
	const sys = s.areas.system;
	return sys.projectSettings.autosave && sys.system.autosave;
}

/** An autosave, when autosave is on (before a new project or another project opens). */
export function autosave(s: SimState): void {
	if (autosaves(s)) saveProject(s, true);
}

/** Hold M1: saves the open project (autosave permitting) and starts a new one. */
export function newProject(s: SimState): void {
	autosave(s);
	const user = s.areas.system.projects.user;
	const taken = [...user.map((p) => p.name), s.project.name];
	let n = 1;
	while (taken.includes(`project ${n}`)) n++;
	const name = `project ${n}`;
	freshProject(s, name);
	user.push({ name, snapshot: null, versions: [] });
}

/** Loads a project from the folder (autosaving the open one first). */
export function loadProject(s: SimState, folder: ProjectFolder, name: string): void {
	const entry = findProject(s, folder, name);
	if (!entry) return;
	// the open project may be the one loaded: autosave it first so nothing is lost
	autosave(s);
	const json = entry.snapshot;
	if (json) restore(s, json, entry.name);
	else freshProject(s, entry.name);
}

/** Loads one version from a project's history (the newest is row 0). */
export function loadVersion(s: SimState, folder: ProjectFolder, name: string, row: number): void {
	const entry = findProject(s, folder, name);
	const version = entry?.versions[entry.versions.length - 1 - row];
	if (!entry || !version) return;
	autosave(s);
	restore(s, version.snapshot, entry.name);
}

/** Duplicates a project into the user folder; returns the copy's name (manual: duplicate). */
export function duplicateProject(s: SimState, folder: ProjectFolder, name: string): string | null {
	const entry = findProject(s, folder, name);
	if (!entry) return null;
	const user = s.areas.system.projects.user;
	const copy = nextName(
		name,
		user.map((p) => p.name)
	);
	// the open project duplicates with its unsaved changes (OS 1.1.25)
	const json = folder === 'user' && name === s.project.name ? snapshot(s) : entry.snapshot;
	user.push({ name: copy, snapshot: json, versions: [] });
	return copy;
}

/** Deletes a user project or template; factory projects stay (ours). */
export function deleteProject(s: SimState, folder: ProjectFolder, name: string): boolean {
	if (folder === 'factory') return false;
	const list = s.areas.system.projects[folder];
	const at = list.findIndex((p) => p.name === name);
	if (at < 0) return false;
	list.splice(at, 1);
	return true;
}

/** Renames the open project (and its entry); returns why it could not, or null. */
export function renameProject(s: SimState, name: string): string | null {
	const user = s.areas.system.projects.user;
	if (name !== s.project.name && user.some((p) => p.name === name)) return 'name taken';
	const entry = user.find((p) => p.name === s.project.name);
	if (entry) entry.name = name;
	s.project.name = name;
	return null;
}

/** Saves the open project as a copy under `name` and carries on in the copy (shift + M2). */
export function saveProjectAs(s: SimState, name: string): string | null {
	const user = s.areas.system.projects.user;
	if (user.some((p) => p.name === name)) return 'name taken';
	s.project.name = name;
	saveProject(s);
	return null;
}
