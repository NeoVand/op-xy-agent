/**
 * The preset browser's model (manual: instrument/preset-browser, preset-management), as the owner's
 * unit runs it on OS 1.1.33 (camera b1-1495…1568, research 59 §2.6): the two views (by engine: the
 * engines that have presets; by category: the categories and folders), the chosen group's presets,
 * both lists sorted by name and scrolled only as far as the highlight needs, loading a preset onto a
 * track, and the user-preset actions (cut, paste, rename, delete) and folder actions (new, rename,
 * delete when empty). The factory presets have the device's names (catalogue.ts); apart from a new
 * project's eight they load their engine's starting sound, since the rest of TE's values are not
 * known here.
 */
import { ENGINE_IDS, type EngineId } from '$lib/core/opxy';
import { NEW_PROJECT_TRACKS, presetSettingsOf } from '../../defaults';
import {
	clamp,
	defaultTrack,
	storedPresetSound,
	type SimState,
	type TrackState
} from '../../params';
import type { SamplerTrack } from '../sample/state';
import { octaveKey } from '../sequencer/model';
import { SNAPSHOT_FOLDER, type PresetEntry } from './catalogue';
import { defaultPresetSettings, type PresetBrowserState, type PresetSettings } from './state';

/** Rows each column of the browser shows (nine on the device). */
export const BROWSER_ROWS = 9;

/** A preset's key: `folder/name`. */
export const presetKey = (p: Pick<PresetEntry, 'folder' | 'name'>) => `${p.folder}/${p.name}`;

/**
 * The device's order: by character code, so its lists run alphabetically and a folder named with
 * a capital sorts first (the owner's "Nostalgic Synths" stands above bass, b1-1524).
 */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Engines in the order the browser lists them, by name: the midi engine as "midi" (its name since
 * OS 1.0.15; TE's older art calls it external). The owner's unit listed eleven engines with presets
 * and no midi (b1-1500); how OS 1.1.33 picks the midi engine is still open (QUESTIONS), so here it
 * follows them at the end of the list, where loading it gives the engine's starting sound (ours).
 */
const ENGINES_SORTED: readonly EngineId[] = [...ENGINE_IDS].sort(byCode);

/** Engines the browser lists even with no preset of theirs (see {@link ENGINES_SORTED}). */
const ALWAYS_LISTED: readonly EngineId[] = ['midi'];

/**
 * The middle column: the engines that have presets (engine view), or the categories, the user's
 * folders and, once it holds a preset, the snapshot folder (category view; the owner's unit, whose
 * snapshot folder exists, listed none, b1-1524…1534).
 */
export function groups(b: PresetBrowserState, view = b.view): string[] {
	if (view === 'engine') {
		// the engines with presets as the device lists them, then any listed without (midi, ours)
		const withPresets = ENGINES_SORTED.filter((e) => b.library.some((p) => p.engine === e));
		return [...withPresets, ...ALWAYS_LISTED.filter((e) => !withPresets.includes(e))];
	}
	const folders = new Set(b.library.filter((p) => p.folder).map((p) => p.folder));
	for (const folder of b.folders) folders.add(folder);
	return [...folders].sort(byCode);
}

/** The presets of a group, by name (factory and user presets together, as on the device). */
export function presetsIn(b: PresetBrowserState, group: string, view = b.view): PresetEntry[] {
	return b.library
		.filter((p) => (view === 'engine' ? p.engine === group : p.folder === group))
		.sort((p, q) => byCode(p.name, q.name));
}

/** The chosen group, kept inside the list as presets come and go. */
export function currentGroup(b: PresetBrowserState): { list: string[]; index: number } {
	const list = groups(b);
	const index = Math.max(0, list.indexOf(b.group));
	return { list, index };
}

/** The highlighted preset, if the group has any. */
export function highlighted(b: PresetBrowserState): PresetEntry | undefined {
	const { list, index } = currentGroup(b);
	const presets = presetsIn(b, list[index] ?? '');
	return presets[clamp(b.row, 0, presets.length - 1)];
}

/**
 * The first row in view of a list of `total` rows with `index` highlighted, from `top`: moved
 * only as far as the highlight needs, and never past the end.
 */
export function scrolled(top: number, index: number, total: number, rows = BROWSER_ROWS): number {
	const last = Math.max(0, total - rows);
	let first = clamp(top, 0, last);
	if (index < first) first = index;
	if (index > first + rows - 1) first = index - rows + 1;
	return clamp(first, 0, last);
}

/**
 * Keeps both highlights in view after the lists changed; `fromTop` scrolls each list down from its
 * top instead, as a list does when it first appears (b1-1495: shoulder, 14th of prism's presets,
 * on the bottom row).
 */
export function keepInView(b: PresetBrowserState, fromTop = false): void {
	const { list, index } = currentGroup(b);
	b.groupTop = scrolled(fromTop ? 0 : b.groupTop, index, list.length);
	b.rowTop = scrolled(fromTop ? 0 : b.rowTop, b.row, presetsIn(b, list[index] ?? '').length);
}

/** Points the browser at a preset (its group in the current view, and its row there). */
export function select(
	b: PresetBrowserState,
	preset: PresetEntry | undefined,
	fromTop = false
): void {
	if (!preset) {
		b.group = groups(b)[0] ?? '';
		b.row = 0;
	} else {
		b.group = b.view === 'engine' ? preset.engine : preset.folder;
		b.row = Math.max(0, presetsIn(b, b.group).indexOf(preset));
	}
	keepInView(b, fromTop);
}

/** Finds a preset by key. */
export function findPreset(b: PresetBrowserState, key: string | null): PresetEntry | undefined {
	return key === null ? undefined : b.library.find((p) => presetKey(p) === key);
}

/**
 * Opens the browser on a track, on the preset the track was loaded from (b1-1495: bass/shoulder
 * highlighted on a new project's track 3), in the view last chosen.
 */
export function openBrowser(s: SimState, track: number): void {
	const sys = s.areas.system;
	const b = sys.presets;
	b.track = track;
	const preset = findPreset(b, sys.trackPresets[track]);
	// a preset saved without a category (older libraries) shows in engine view only
	if (preset && !preset.folder) b.view = 'engine';
	select(b, preset ?? b.library.find((p) => p.engine === s.tracks[track].engine), true);
}

/**
 * E1: the next or previous group; its presets start from the top, the first highlighted (b1-1502:
 * back on prism the highlight is on alloy, not on shoulder).
 */
export function turnGroup(b: PresetBrowserState, delta: number): void {
	const { list, index } = currentGroup(b);
	const at = clamp(index + delta, 0, list.length - 1);
	const next = list[at];
	if (next !== undefined && next !== b.group) {
		b.group = next;
		b.row = 0;
		b.rowTop = 0;
	}
	b.groupTop = scrolled(b.groupTop, at, list.length);
}

/** E2–E4: the next or previous preset of the group. */
export function turnPreset(b: PresetBrowserState, delta: number): void {
	const { list, index } = currentGroup(b);
	const count = presetsIn(b, list[index] ?? '').length;
	b.row = clamp(b.row + delta, 0, Math.max(0, count - 1));
	b.rowTop = scrolled(b.rowTop, b.row, count);
}

/**
 * Click E1: by engine ↔ by category, keeping the highlighted preset highlighted (b1-1536: strings'
 * draemy is still highlighted under axis), both lists scrolled from their tops.
 */
export function toggleView(b: PresetBrowserState): void {
	const preset = highlighted(b);
	b.view = b.view === 'category' ? 'engine' : 'category';
	// a preset without a category cannot show in category view: start at the top there
	select(b, preset && (b.view === 'engine' || preset.folder) ? preset : undefined, true);
}

/** The parts of a track that make its sound (a preset replaces them; steps and mix stay). */
type Sound = Pick<
	TrackState,
	| 'engine'
	| 'm1'
	| 'amp'
	| 'filterEnv'
	| 'envelope'
	| 'playMode'
	| 'filter'
	| 'lfo'
	| 'drumKey'
	| 'drumKeys'
	| 'midi'
>;

/** What a sampler engine plays, as a saved sound keeps it: the part of the sampler its engine uses. */
type Samples = Partial<Pick<SamplerTrack, 'keys' | 'synth' | 'zones'>>;

/** A saved sound: the track's sound, its preset settings and, on a sampler track, its samples. */
interface SavedSound {
	sound: Sound;
	settings: PresetSettings;
	samples?: Samples;
}

/** The samples a track's engine plays: the drum keys, the synth sampler's sample or the zones. */
function samplesOf(s: SimState, track: number): Samples | undefined {
	const st = s.areas.sample.tracks[track];
	switch (s.tracks[track].engine) {
		case 'drum':
			return { keys: st.keys };
		case 'sampler':
			return { synth: st.synth };
		case 'multisampler':
			return { zones: st.zones };
		default:
			return undefined;
	}
}

/**
 * A track's sound with its preset settings and its samples, as a user preset stores it (manual:
 * save-copy-scramble: saving copies the track's samples into the preset).
 */
export function soundOf(s: SimState, track: number): string {
	const t = s.tracks[track];
	const sound: Sound = {
		engine: t.engine,
		m1: t.m1,
		amp: t.amp,
		filterEnv: t.filterEnv,
		envelope: t.envelope,
		playMode: t.playMode,
		filter: t.filter,
		lfo: t.lfo,
		drumKey: t.drumKey,
		drumKeys: t.drumKeys,
		midi: t.midi
	};
	const saved: SavedSound = {
		sound,
		settings: s.areas.system.presetSettings[track],
		samples: samplesOf(s, track)
	};
	return JSON.stringify(saved);
}

/** Puts a saved sound onto a track: its sound, its preset settings and the samples it brings. */
function applySound(s: SimState, track: number, json: string): SavedSound {
	const saved = JSON.parse(json) as SavedSound;
	Object.assign(s.tracks[track], saved.sound);
	s.areas.system.presetSettings[track] = saved.settings;
	if (saved.samples) {
		const st = s.areas.sample.tracks[track];
		Object.assign(st, saved.samples);
		st.selection = [];
	}
	return saved;
}

/**
 * Loads a preset onto an instrument track: the whole sound and its preset settings change, with
 * the samples a saved sound brings; the steps and the mixer strip stay (manual: preset-browser:
 * "replaces the track's whole sound"). Our factory placeholders leave the samples alone.
 */
export function loadPreset(s: SimState, track: number, preset: PresetEntry): void {
	const t = s.tracks[track];
	const sys = s.areas.system;
	const stored = storedPresetSound(presetKey(preset));
	if (preset.sound) applySound(s, track, preset.sound);
	else {
		// one of a new project's presets comes back as the device stores it; placeholders fresh
		const fresh = stored ?? defaultTrack(preset.engine);
		const sound: Sound = {
			engine: fresh.engine,
			m1: fresh.m1,
			amp: fresh.amp,
			filterEnv: fresh.filterEnv,
			envelope: fresh.envelope,
			playMode: fresh.playMode,
			filter: fresh.filter,
			lfo: fresh.lfo,
			drumKey: fresh.drumKey,
			drumKeys: fresh.drumKeys,
			midi: fresh.midi
		};
		Object.assign(t, sound);
		const settings = NEW_PROJECT_TRACKS.find((n) => n.preset === presetKey(preset));
		sys.presetSettings[track] = settings
			? presetSettingsOf(settings, defaultPresetSettings())
			: defaultPresetSettings();
		// a stored preset brings its keyboard octave (the bass an octave down, and so on)
		if (settings) s.areas.sequencer.octaves[octaveKey('instrument', track)] = settings.octave;
	}
	sys.trackPresets[track] = presetKey(preset);
}

/**
 * Puts an engine's starting sound on an instrument track, for an engine the browser lists with no
 * preset (the midi engine): as a load, the whole sound changes and the steps and mixer strip stay.
 */
export function loadEngineSound(s: SimState, track: number, engine: EngineId): void {
	const fresh = defaultTrack(engine);
	Object.assign(s.tracks[track], {
		engine: fresh.engine,
		m1: fresh.m1,
		amp: fresh.amp,
		filterEnv: fresh.filterEnv,
		envelope: fresh.envelope,
		playMode: fresh.playMode,
		filter: fresh.filter,
		lfo: fresh.lfo,
		drumKey: fresh.drumKey,
		drumKeys: fresh.drumKeys,
		midi: fresh.midi
	});
	s.areas.system.presetSettings[track] = defaultPresetSettings();
	s.areas.system.trackPresets[track] = '';
}

/**
 * Keeps the tracks loaded from a preset pointing at it after it is renamed or moved (`folder`:
 * every preset of a renamed folder).
 */
export function rekeyTracks(keys: string[], from: string, to: string, folder = false): void {
	keys.forEach((key, i) => {
		if (key === from) keys[i] = to;
		else if (folder && key.startsWith(`${from}/`)) keys[i] = `${to}/${key.slice(from.length + 1)}`;
	});
}

/** Whether a folder takes user presets (the snapshot folder and the user's own folders). */
export function isUserFolder(b: PresetBrowserState, folder: string): boolean {
	return folder === SNAPSHOT_FOLDER || b.folders.includes(folder);
}

/** M1: cuts the highlighted user preset (it moves when pasted). */
export function cutPreset(b: PresetBrowserState): boolean {
	const preset = highlighted(b);
	if (!preset?.user) return false;
	b.clipboard = presetKey(preset);
	return true;
}

/**
 * Whether M2 would paste the cut preset into the chosen folder: a user folder in category view
 * with no preset of that name already there (manual: nothing is overwritten; only user folders
 * take presets, ours).
 */
export function canPaste(b: PresetBrowserState): boolean {
	const preset = findPreset(b, b.clipboard);
	if (!preset || b.view !== 'category' || !isUserFolder(b, b.group)) return false;
	return !b.library.some((p) => p.folder === b.group && p.name === preset.name && p !== preset);
}

/** M2: pastes the cut preset into the chosen folder, when {@link canPaste}. */
export function pastePreset(b: PresetBrowserState): boolean {
	const preset = findPreset(b, b.clipboard);
	if (!preset || !canPaste(b)) return false;
	preset.folder = b.group;
	b.clipboard = null;
	select(b, preset);
	return true;
}

/**
 * Moves off a group that has gone (its last preset deleted, the folder deleted) to the one that
 * took its place in the list, and keeps both highlights in view.
 */
function regroup(b: PresetBrowserState, index: number): void {
	const list = groups(b);
	if (!list.includes(b.group)) {
		b.group = list[clamp(index, 0, list.length - 1)] ?? '';
		b.row = 0;
	}
	const count = presetsIn(b, b.group).length;
	b.row = clamp(b.row, 0, Math.max(0, count - 1));
	keepInView(b);
}

/** M4: deletes the highlighted user preset. */
export function deletePreset(b: PresetBrowserState): boolean {
	const preset = highlighted(b);
	if (!preset?.user) return false;
	const { index } = currentGroup(b);
	b.library.splice(b.library.indexOf(preset), 1);
	if (b.clipboard === presetKey(preset)) b.clipboard = null;
	regroup(b, index);
	return true;
}

/** Renames a user preset; returns why it could not, or null. */
export function renamePreset(b: PresetBrowserState, key: string, name: string): string | null {
	const preset = findPreset(b, key);
	if (!preset?.user) return 'not a user preset';
	if (b.library.some((p) => p !== preset && p.folder === preset.folder && p.name === name)) {
		return 'name taken';
	}
	preset.name = name;
	select(b, preset);
	return null;
}

/** Shift + M1: a new user folder; returns why it could not, or null. */
export function newFolder(b: PresetBrowserState, name: string): string | null {
	if (groups(b, 'category').includes(name) || name === SNAPSHOT_FOLDER) return 'name taken';
	b.folders.push(name);
	if (b.view === 'category') {
		b.group = name;
		b.row = 0;
	}
	keepInView(b);
	return null;
}

/** Shift + M3: renames a user folder and moves its presets along. */
export function renameFolder(b: PresetBrowserState, from: string, to: string): string | null {
	const at = b.folders.indexOf(from);
	if (at < 0) return 'not a user folder';
	if (to !== from && (groups(b, 'category').includes(to) || to === SNAPSHOT_FOLDER)) {
		return 'name taken';
	}
	b.folders[at] = to;
	for (const p of b.library) if (p.folder === from) p.folder = to;
	if (b.clipboard?.startsWith(`${from}/`))
		b.clipboard = `${to}/${b.clipboard.slice(from.length + 1)}`;
	if (b.group === from) b.group = to;
	keepInView(b);
	return null;
}

/** Shift + M4: deletes the chosen user folder, which must be empty (manual). */
export function deleteFolder(b: PresetBrowserState): boolean {
	const at = b.folders.indexOf(b.group);
	if (b.view !== 'category' || at < 0 || presetsIn(b, b.group).length > 0) return false;
	const { index } = currentGroup(b);
	b.folders.splice(at, 1);
	regroup(b, index);
	return true;
}

// ─────────────────────────────────────────────────────────────── track sounds (Tn + M1–M4)

const two = (v: number) => String(v).padStart(2, '0');

/** A new snapshot's name: the clock's date and a running number ("2026-06-15 (1)", manual). */
function snapshotName(s: SimState): string {
	const c = s.areas.system.system;
	const date = `${c.year}-${two(c.month)}-${two(c.day)}`;
	const taken = new Set(
		s.areas.system.presets.library.filter((p) => p.folder === SNAPSHOT_FOLDER).map((p) => p.name)
	);
	let n = 1;
	while (taken.has(`${date} (${n})`)) n++;
	return `${date} (${n})`;
}

/**
 * `Tn + M4` saves the track's sound as a new snapshot preset (manual: save-copy-scramble); with
 * shift held it writes back into the snapshot the sound came from (manual: save-to-same-snapshot).
 */
export function saveSound(s: SimState, track: number, inPlace: boolean): PresetEntry {
	const sys = s.areas.system;
	const b = sys.presets;
	const t = s.tracks[track];
	const sound = soundOf(s, track);
	const from = findPreset(b, sys.trackPresets[track]);
	if (inPlace && from?.user && from.folder === SNAPSHOT_FOLDER) {
		const updated: PresetEntry = { ...from, engine: t.engine, sound };
		b.library[b.library.indexOf(from)] = updated;
		return updated;
	}
	const preset: PresetEntry = {
		name: snapshotName(s),
		folder: SNAPSHOT_FOLDER,
		engine: t.engine,
		user: true,
		sound
	};
	b.library.push(preset);
	sys.trackPresets[track] = presetKey(preset);
	return preset;
}

/** A copied track sound: the saved sound, the track's preset and its keyboard octave. */
type CopiedSound = SavedSound & { preset: string; octave?: number };

/**
 * `Tn + M2` copies the track's sound (with its preset settings and samples) and its keyboard
 * octave (OS 1.0.38: a copied track takes its active octave along).
 */
export function copySound(s: SimState, track: number): void {
	const sys = s.areas.system;
	const saved = JSON.parse(soundOf(s, track)) as SavedSound;
	const octave = s.areas.sequencer.octaves[octaveKey('instrument', track)] ?? 0;
	const copied: CopiedSound = { ...saved, preset: sys.trackPresets[track], octave };
	sys.sound = JSON.stringify(copied);
}

/** `Tn + M3` pastes the copied sound and octave onto the track (its steps and mixer strip stay). */
export function pasteSound(s: SimState, track: number): boolean {
	const sys = s.areas.system;
	if (!sys.sound) return false;
	const saved = applySound(s, track, sys.sound) as CopiedSound;
	sys.trackPresets[track] = saved.preset;
	if (saved.octave !== undefined) {
		s.areas.sequencer.octaves[octaveKey('instrument', track)] = saved.octave;
	}
	return true;
}

/** A small deterministic generator (mulberry32), so scrambles repeat in tests. */
function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * `Tn + M1` scrambles the track's sound: engine parameters, envelopes, filter and LFO amount take
 * random values (ours: which ones). The midi engine's CCs stay (OS 1.0.45: not scrambled).
 */
export function scrambleSound(s: SimState, track: number): void {
	const sys = s.areas.system;
	const t = s.tracks[track];
	if (t.engine === 'midi') return;
	sys.scrambles += 1;
	const next = random(sys.scrambles * 7919 + track);
	const r = () => Math.round(next() * 99);
	const env = () => ({ attack: r(), decay: r(), sustain: r(), release: r() });
	if (t.engine !== 'drum' && t.engine !== 'sampler' && t.engine !== 'multisampler') {
		t.m1 = [r(), r(), r(), r()];
	}
	t.amp = env();
	t.filterEnv = env();
	t.filter.cutoff = r();
	t.filter.resonance = r();
	t.filter.envAmount = r() * 2 - 99;
	t.lfo.amount = r() * 2 - 99;
}
