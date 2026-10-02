/**
 * What differs between two states of the replica, in the words a person reads off the device: the
 * tempo page, each instrument track's sound page by page (as read_sound reads them) with its mix
 * and kit, every track's patterns (notes, bars, length, scale, the one it plays), the auxiliary
 * tracks' and the mixer's pages, the scenes and the song. The raw state says what changed, so only
 * those pages are read; a change no page shows is still named, so `same` never hides one.
 */
import { describeNoteChange } from '$lib/sim/pattern-change';
import { AUX_NAMES, GROOVES, type SimState, type TrackState } from '$lib/sim/params';
import { extrasChange } from '$lib/app/replica-diff';
import { planPlace, playStep, pageValues, type Place } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { buildFrame } from '$lib/sim/frames';
import { describeFrame } from '$lib/sim/screen/render';
import { trackSequence } from '$lib/sim/areas/arrange/model';
import { snapshot } from '$lib/sim/areas/system/projects';
import { noteCount, type Pattern } from '$lib/sim/sequencer';
import { SESSION_FIELDS } from '$lib/sim/session';
import type { VirtualArrangement, VirtualOpxy } from '../virtual-opxy';
import type { ReplicaDiff } from './api';

/** One side of a diff: a state and the virtual OP-XY over it (for the pages read_sound reads). */
export interface DiffSide {
	readonly state: SimState;
	readonly virtual: VirtualOpxy;
}

/** Lines a diff lists before it sums up the rest. */
export const DIFF_LINES = 60;
/** Scene lines listed one by one before they are summed up. */
const SCENE_LINES = 6;

const json = (value: unknown) => JSON.stringify(value);
const onOff = (on: boolean) => (on ? 'on' : 'off');
const trackName = (t: number) => (t < 8 ? `T${t + 1}` : `T${t + 1} ${AUX_NAMES[t - 8]}`);
const grooveName = (g: number) => GROOVES[Math.min(GROOVES.length - 1, Math.max(0, g))];

/** The words before a page's values ("svf filter on"), or ''. */
const head = (text: string) => (text.includes(':') ? text.slice(0, text.indexOf(':')).trim() : '');

/**
 * One page's change as its values read: "T3 M3 filter: cutoff 70 → 40, resonance 09 → 30", its
 * heading too when that changed ("svf filter on → ladder filter on"); the whole reading otherwise.
 */
export function pageChange(label: string, before = '', after = ''): string | null {
	if (before === after) return null;
	const parts: string[] = [];
	if (head(before) !== head(after)) parts.push(`${head(before) || '–'} → ${head(after) || '–'}`);
	const was = pageValues(before);
	const now = pageValues(after);
	for (const key of new Set([...was.keys(), ...now.keys()])) {
		const x = was.get(key);
		const y = now.get(key);
		if (x !== y) parts.push(`${key} ${x ?? '–'} → ${y ?? '–'}`);
	}
	return parts.length ? `${label}: ${parts.join(', ')}` : `${label}: "${before}" → "${after}"`;
}

/** Reads pages on a copy of a state, walking the copy from page to page. */
class PageReader {
	readonly #sim: OpxySim;
	constructor(state: SimState) {
		this.#sim = new OpxySim({ state: JSON.parse(JSON.stringify(state)) as SimState, now: () => 0 });
	}
	read(place: Place): string {
		for (const step of planPlace(this.#sim.state, place).steps) playStep(this.#sim, step);
		return describeFrame(buildFrame(this.#sim.state));
	}
}

// ─── the tempo ──────────────────────────────────────────────────────────────────────────────────

function tempoLines(a: SimState, b: SimState): string[] {
	const x = a.tempo;
	const y = b.tempo;
	const out: string[] = [];
	if (x.bpm !== y.bpm) out.push(`tempo ${x.bpm} → ${y.bpm} bpm`);
	if (x.groove !== y.groove) out.push(`groove ${grooveName(x.groove)} → ${grooveName(y.groove)}`);
	if (x.swing !== y.swing) out.push(`groove amount ${x.swing} → ${y.swing}`);
	if (x.metronome.on !== y.metronome.on) {
		out.push(`metronome ${onOff(x.metronome.on)} → ${onOff(y.metronome.on)}`);
	}
	if (x.metronome.level !== y.metronome.level) {
		out.push(`metronome level ${Math.round(x.metronome.level)} → ${Math.round(y.metronome.level)}`);
	}
	return out;
}

// ─── instrument sounds ──────────────────────────────────────────────────────────────────────────

/** An instrument track's sound in raw state: its settings but not its patterns or mix. */
function soundKey(s: SimState, t: number): string {
	const system = s.areas.system;
	return json([
		{ ...s.tracks[t], sequence: null, mix: null },
		s.areas.sample.tracks[t],
		system.trackPresets[t],
		system.presetSettings[t]
	]);
}

function soundLines(a: DiffSide, b: DiffSide, track: number): string[] {
	const x = a.virtual.readSound(track);
	const y = b.virtual.readSound(track);
	const t = `T${track}`;
	const out: string[] = [];
	if (x.engine !== y.engine) out.push(`${t} engine ${x.engine} → ${y.engine}`);
	if (x.preset !== y.preset) out.push(`${t} preset ${x.preset ?? 'none'} → ${y.preset ?? 'none'}`);
	for (const page of new Set([...Object.keys(x.pages), ...Object.keys(y.pages)])) {
		const line = pageChange(`${t} ${page}`, x.pages[page], y.pages[page]);
		if (line) out.push(line);
	}
	const keys = new Set([...Object.keys(x.kit ?? {}), ...Object.keys(y.kit ?? {})]);
	const kit = [...keys].flatMap((key) => {
		const was = x.kit?.[key];
		const now = y.kit?.[key];
		return was === now ? [] : [`${key} ${was ?? 'empty'} → ${now ?? 'empty'}`];
	});
	if (kit.length) out.push(`${t} kit: ${kit.join(', ')}`);
	return out;
}

/** A track's mixer strip, from raw state. */
function mixLine(a: SimState, b: SimState, t: number): string | null {
	const x = t < 8 ? a.tracks[t].mix : a.aux[t - 8].mix;
	const y = t < 8 ? b.tracks[t].mix : b.aux[t - 8].mix;
	const parts: string[] = [];
	if (Math.round(x.level) !== Math.round(y.level)) {
		parts.push(`level ${Math.round(x.level)} → ${Math.round(y.level)}`);
	}
	if (Math.round(x.pan) !== Math.round(y.pan)) {
		parts.push(`pan ${Math.round(x.pan)} → ${Math.round(y.pan)}`);
	}
	if (x.muted !== y.muted) parts.push(y.muted ? 'muted' : 'unmuted');
	return parts.length ? `${trackName(t)} mix: ${parts.join(', ')}` : null;
}

// ─── patterns ───────────────────────────────────────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A pattern in a few words: "24 notes, 2 bars", with its length and scale when not the usual. */
function patternText(p: Pattern): string {
	const notes = noteCount(p);
	const parts = [notes ? plural(notes, 'note') : 'empty', plural(p.bars, 'bar')];
	if (p.length !== p.bars * 16) parts.push(`${p.length} steps`);
	if (p.scale !== 1) parts.push(`scale ${p.scale === 0.5 ? '1/2' : p.scale}`);
	return parts.join(', ');
}

/** What changed in a pattern: its notes, bars, length and scale by value, the rest by name. */
function patternChange(x: Pattern, y: Pattern, track?: TrackState): string {
	const parts: string[] = [];
	const nx = noteCount(x);
	const ny = noteCount(y);
	const notes = (p: Pattern) => json(p.steps.map((s) => s.notes));
	// how, as the replica's changes say it ("35 notes, velocities 60–100 → 52–108"): "notes
	// changed" left an agent unsure its humanize had done anything
	if (notes(x) !== notes(y)) {
		parts.push(
			describeNoteChange(x, y) ??
				(nx !== ny ? `${nx} → ${plural(ny, 'note')}` : `notes changed (${plural(ny, 'note')})`)
		);
	}
	if (x.bars !== y.bars) parts.push(`${x.bars} → ${plural(y.bars, 'bar')}`);
	// a length that only follows the bars says nothing more
	const full = (p: Pattern) => p.length === p.bars * 16;
	if (x.length !== y.length && !(full(x) && full(y))) {
		parts.push(`length ${x.length} → ${y.length} steps`);
	}
	if (x.scale !== y.scale) parts.push(`scale ${x.scale} → ${y.scale}`);
	const locks = (p: Pattern) => json(p.steps.map((s) => [s.locks, s.components]));
	// each lock by its step and value, as the replica's changes say it
	if (locks(x) !== locks(y)) parts.push(...extrasChange(x, y, track));
	const known = new Set(['steps', 'bars', 'length', 'scale']);
	for (const key of Object.keys(y) as (keyof Pattern)[]) {
		if (known.has(key) || json(x[key]) === json(y[key])) continue;
		const was = x[key];
		const now = y[key];
		parts.push(
			typeof now === 'object' ? `${key} changed` : `${key} ${String(was)} → ${String(now)}`
		);
	}
	return parts.join(', ') || 'changed';
}

function patternLines(a: SimState, b: SimState, t: number): string[] {
	const x = trackSequence(a, t);
	const y = trackSequence(b, t);
	const out: string[] = [];
	const count = Math.max(x.patterns.length, y.patterns.length);
	for (let i = 0; i < count; i++) {
		const was = x.patterns[i];
		const now = y.patterns[i];
		if (was && now && json(was) === json(now)) continue;
		const label = `${trackName(t)} pattern ${i + 1}`;
		if (!now) out.push(`${label}: removed`);
		else if (!was) out.push(`${label}: new, ${patternText(now)}`);
		else out.push(`${label}: ${patternChange(was, now, b.tracks[t])}`);
	}
	if (x.current !== y.current) {
		out.push(`${trackName(t)} plays pattern ${y.current + 1} (was ${x.current + 1})`);
	}
	return out;
}

// ─── auxiliary tracks and the mixer ─────────────────────────────────────────────────────────────

const PAGES = [1, 2, 3, 4] as const;

function withoutFields(value: object, fields: readonly string[]): string {
	return json(Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key))));
}

function auxLines(a: SimState, b: SimState): string[] {
	const skip = (SESSION_FIELDS.auxiliary ?? []) as readonly string[];
	if (withoutFields(a.areas.auxiliary, skip) === withoutFields(b.areas.auxiliary, skip)) return [];
	const x = new PageReader(a);
	const y = new PageReader(b);
	const out: string[] = [];
	for (let track = 1; track <= 8; track++) {
		for (const page of PAGES) {
			const place: Place = { area: 'auxiliary', track, page };
			const line = pageChange(`${trackName(track + 7)} M${page}`, x.read(place), y.read(place));
			if (line) out.push(line);
		}
	}
	// a setting no auxiliary page shows (a hidden page's value)
	return out.length ? out : ['auxiliary tracks: settings changed that their pages do not show'];
}

function mixerLines(a: SimState, b: SimState): string[] {
	const skip = (SESSION_FIELDS.mixer ?? []) as readonly string[];
	if (withoutFields(a.areas.mixer, skip) === withoutFields(b.areas.mixer, skip)) return [];
	const x = new PageReader(a);
	const y = new PageReader(b);
	const out = PAGES.flatMap((page) => {
		const place: Place = { area: 'mix', page };
		return pageChange(`mix M${page}`, x.read(place), y.read(place)) ?? [];
	});
	return out.length ? out : ['mixer: settings changed that its pages do not show'];
}

// ─── the arrangement ────────────────────────────────────────────────────────────────────────────

/** A scene's tracks off pattern 1: "T1 p2, T3 p2", or "every track on pattern 1". */
function sceneText(patterns: readonly number[]): string {
	const off = patterns.flatMap((p, i) => (p === 1 ? [] : [`${trackName(i)} p${p}`]));
	return off.length ? off.join(', ') : 'every track on pattern 1';
}

/** "1 2 1 3", the first 24 entries of a long song and how many in all. */
function songText(song: VirtualArrangement['song']): string {
	const order = song.order;
	const shown = order.slice(0, 24).join(' ');
	const more = order.length > 24 ? ` … (${order.length} scenes)` : '';
	return `${shown || 'empty'}${more}${song.loop ? '' : ', no loop'}`;
}

/** Scene numbers as runs: "2–9, 12". */
function runs(numbers: readonly number[]): string {
	const out: string[] = [];
	for (let i = 0; i < numbers.length; i++) {
		let j = i;
		while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
		out.push(j === i ? `${numbers[i]}` : `${numbers[i]}–${numbers[j]}`);
		i = j;
	}
	return out.join(', ');
}

function arrangementLines(x: VirtualArrangement, y: VirtualArrangement): string[] {
	const out: string[] = [];
	if (x.scene !== y.scene) out.push(`current scene ${x.scene} → ${y.scene}`);
	const was = new Map(x.scenes.map((s) => [s.scene, s.patterns]));
	const now = new Map(y.scenes.map((s) => [s.scene, s.patterns]));
	const scenes = [...new Set([...was.keys(), ...now.keys()])].sort((m, n) => m - n);
	const lines: { scene: number; kind: 'new' | 'changed' | 'cleared'; text: string }[] = [];
	for (const scene of scenes) {
		const p = was.get(scene);
		const q = now.get(scene);
		if (p && q && json(p) === json(q)) continue;
		if (!q) lines.push({ scene, kind: 'cleared', text: `scene ${scene}: cleared` });
		else if (!p) lines.push({ scene, kind: 'new', text: `scene ${scene}: new, ${sceneText(q)}` });
		else {
			const moved = q.flatMap((pattern, i) =>
				pattern === p[i] ? [] : [`${trackName(i)} p${p[i]} → p${pattern}`]
			);
			lines.push({ scene, kind: 'changed', text: `scene ${scene}: ${moved.join(', ')}` });
		}
	}
	if (lines.length <= SCENE_LINES) out.push(...lines.map((l) => l.text));
	else {
		for (const kind of ['new', 'changed', 'cleared'] as const) {
			const these = lines.filter((l) => l.kind === kind).map((l) => l.scene);
			if (these.length) out.push(`scenes ${runs(these)}: ${kind} (${these.length})`);
		}
	}
	if (json(x.song) !== json(y.song)) out.push(`song: ${songText(x.song)} → ${songText(y.song)}`);
	return out;
}

// ─── everything else ────────────────────────────────────────────────────────────────────────────

/** Leaves that differ between two plain values, "time signature 4/4 → 3/4", at most `max`. */
function leafChanges(a: unknown, b: unknown, path = '', max = 6): string[] {
	if (json(a) === json(b)) return [];
	const isObject = (v: unknown): v is Record<string, unknown> =>
		typeof v === 'object' && v !== null;
	if (isObject(a) && isObject(b)) {
		const out: string[] = [];
		for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if (out.length >= max) break;
			out.push(...leafChanges(a[key], b[key], path ? `${path} ${key}` : key, max - out.length));
		}
		return out;
	}
	const text = (v: unknown) => (isObject(v) ? 'changed' : String(v));
	return [`${path || 'value'} ${text(a)} → ${text(b)}`];
}

/** A project's content without what belongs to the moment (`sim/session.ts`). */
function content(s: SimState): string {
	const c = JSON.parse(snapshot(s)) as { areas: Record<string, Record<string, unknown> | null> };
	for (const [area, fields] of Object.entries(SESSION_FIELDS)) {
		if (fields === 'all') c.areas[area] = null;
		else for (const field of fields) delete c.areas[area]?.[field as string];
	}
	return json(c);
}

// ─── the diff ───────────────────────────────────────────────────────────────────────────────────

/** What `b` changed from `a`, as a person would read it off the device. */
export function diffReplica(a: DiffSide, b: DiffSide): ReplicaDiff {
	const x = a.state;
	const y = b.state;
	const lines: string[] = [...tempoLines(x, y)];
	for (let t = 0; t < 8; t++) {
		if (soundKey(x, t) !== soundKey(y, t)) {
			const sound = soundLines(a, b, t + 1);
			lines.push(...(sound.length ? sound : [`T${t + 1}: sound settings its pages do not show`]));
		}
	}
	for (let t = 0; t < 16; t++) {
		const mix = mixLine(x, y, t);
		if (mix) lines.push(mix);
	}
	for (let t = 0; t < 16; t++) lines.push(...patternLines(x, y, t));
	lines.push(...auxLines(x, y), ...mixerLines(x, y));
	lines.push(...arrangementLines(a.virtual.readArrangement(), b.virtual.readArrangement()));
	const settings = leafChanges(x.areas.system.projectSettings, y.areas.system.projectSettings);
	if (settings.length) lines.push(`project settings: ${settings.join(', ')}`);
	if (lines.length === 0 && content(x) !== content(y)) {
		lines.push('other project data changed (pattern sounds, sound links, other songs)');
	}
	const changes =
		lines.length > DIFF_LINES
			? [...lines.slice(0, DIFF_LINES - 1), `and ${lines.length - DIFF_LINES + 1} more changes`]
			: lines;
	return { same: changes.length === 0, changes };
}
