/**
 * What changed on the replica between two states, in words (docs/AGENT-V2.md, grounding): the
 * agent is handed these lines before it writes its answer, so it describes what happened, never what
 * it meant to do. Playback, tempo, groove and the click; each instrument track's sound as its pages
 * read on the screen (only for tracks that changed, since reading a sound plays keys on a copy);
 * mix; patterns; the send effects; scenes and the song. Each change also says it briefly, for
 * people (only the values that differ), and names the keys that lead to it on the device, which the
 * replica lights once the answer is written.
 */
import type { ControlId } from '$lib/core/opxy';
import type { ReplicaChange, VirtualOpxy, VirtualScene } from '$lib/agent/virtual-opxy';
import { DEFAULT_LEVEL, GROOVES, type SimState, type TrackState } from '$lib/sim/params';
import { lockLabel, lockParam } from '$lib/sim/areas/sequencer/locks';
import { drumKeyChanges } from './drum-keys';
import { brainSettings, KEYS, SCALES, type BrainSettings } from '$lib/sim/areas/auxiliary/state';
import { trackSequence } from '$lib/sim/areas/arrange/model';
import { formatScale } from '$lib/sim/sequencer';
import { noteName } from '$lib/core/midi/notes';
import { describeNoteChange } from '$lib/sim/pattern-change';
import { FIRST_NOTE, soundName } from '$lib/sim/areas/sample/state';
import { PROJECT_SECTIONS } from '$lib/sim/areas/system/settings';

/** Most lines a diff gives; the rest are counted. */
export const MAX_CHANGE_LINES = 40;

/** Readers of the two states (the agent's view of the replica, before and after). */
export interface DiffReaders {
	readonly before: VirtualOpxy;
	readonly after: VirtualOpxy;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const round = (n: number) => Math.round(n);

type Pattern = SimState['tracks'][number]['sequence']['patterns'][number];

const notesIn = (p: Pattern | undefined) =>
	p ? p.steps.reduce((sum, step) => sum + step.notes.length, 0) : 0;

/** "patterns 1–10" / "pattern 3" / "patterns 2, 5". */
function patternList(numbers: readonly number[]): string {
	if (numbers.length === 1) return `pattern ${numbers[0]}`;
	const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
	return contiguous ? `patterns ${numbers[0]}–${numbers.at(-1)}` : `patterns ${numbers.join(', ')}`;
}

/** The page key a sound page is on ("T3 M3 filter", "shift M2 play mode", "player"). */
function pageKey(page: string): ControlId | null {
	if (page === 'player') return 'key.player';
	const m = /\bM([1-4])\b/.exec(page);
	return m ? (`key.m${m[1]}` as ControlId) : null;
}

/** "cutoff 00" and "cutoff 40" share "cutoff ": the words before the first that differs. */
function sharedLabel(a: string, b: string): string {
	let end = 0;
	for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) {
		if (a[i] === ' ') end = i + 1;
	}
	return a.slice(0, end);
}

/** A page's reading as its head ("svf filter on") and its values ("cutoff 00", …). */
function readingParts(text: string): { head: string; values: string[] } {
	const at = text.indexOf(': ');
	return at < 0
		? { head: '', values: text.split(', ') }
		: { head: text.slice(0, at), values: text.slice(at + 2).split(', ') };
}

/**
 * What moved and what stayed between two readings of a page, or null for readings of another
 * shape (an lfo of another type).
 */
function readingDiff(was: string, now: string): { moved: string[]; kept: string[] } | null {
	const a = readingParts(was);
	const b = readingParts(now);
	if (a.head !== b.head && (!a.head || !b.head)) return null;
	if (a.values.length !== b.values.length) return null;
	const moved: string[] = [];
	const kept: string[] = [];
	if (a.head !== b.head) {
		const label = sharedLabel(a.head, b.head);
		moved.push(`${a.head} → ${b.head.slice(label.length)}`);
	} else if (a.head) kept.push(a.head);
	a.values.forEach((x, i) => {
		const y = b.values[i];
		if (x === y) {
			kept.push(x);
			return;
		}
		const label = sharedLabel(x, y);
		moved.push(`${x} → ${y.slice(label.length)}`);
	});
	return moved.length > 0 ? { moved, kept } : null;
}

/**
 * Only what differs between two readings of a page: "cutoff 00 → 40", "svf filter on → off,
 * resonance 10 → 20". Readings of another shape (an lfo of another type) are given whole.
 */
export function briefChange(was: string, now: string): string {
	return readingDiff(was, now)?.moved.join(', ') ?? `${was} → ${now}`;
}

/**
 * A page's change as the agent reads it: what moved, then what did not ("cutoff 00 → 15;
 * unchanged: svf filter on, resonance 09, …"). Both whole readings, the page's name twice
 * ("sends: sends: aux 00…"), hid the value that moved among the ones that did not; the moved
 * value beside the page "now" left an agent unsure whether the others had moved too.
 */
function pageChange(page: string, was: string | undefined, now: string): string {
	if (was === undefined) return `— → ${now}`;
	const diff = readingDiff(was, now);
	if (!diff) return `${was} → ${now}`;
	// the reading's own name where it is the page's ("sends: aux 00…" on shift M3 sends)
	const kept = diff.kept.filter((part, i) => !(i === 0 && page.endsWith(part)));
	return `${diff.moved.join(', ')}${kept.length ? `; unchanged: ${kept.join(', ')}` : ''}`;
}

/**
 * A pattern's locks and step components, changed: each lock by its step, name and value ("step 5
 * cutoff locked at 80"), the components by their steps (one line once said only "step components
 * or locks changed", and an agent could not tell whether a user's lock had landed).
 */
export function extrasChange(was: Pattern, now: Pattern, track: TrackState | undefined): string[] {
	// the same change on several steps reads as one ("fx i send locked at 60 on steps 5, 13, 21"):
	// a count alone ("5 locks changed") left an agent unsure which steps took what
	const groups = new Map<string, number[]>();
	const components: number[] = [];
	for (let i = 0; i < Math.max(was.steps.length, now.steps.length); i++) {
		const a = was.steps[i]?.locks ?? {};
		const b = now.steps[i]?.locks ?? {};
		for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if (a[id] === b[id]) continue;
			const param = lockParam(id);
			const name = track ? lockLabel(id, track) : (param?.label ?? id);
			const shown = (v: number) => (param ? param.format(v) : String(Math.round(v)));
			const what =
				b[id] === undefined
					? `${name} lock off`
					: a[id] === undefined
						? `${name} locked at ${shown(b[id])}`
						: `${name} lock ${shown(a[id])} → ${shown(b[id])}`;
			groups.set(what, [...(groups.get(what) ?? []), i + 1]);
		}
		if (!same(was.steps[i]?.components, now.steps[i]?.components)) components.push(i + 1);
	}
	const locks = [...groups].map(
		([what, steps]) =>
			`${what} on step${steps.length === 1 ? '' : 's'} ${steps.length > 8 ? `${steps.slice(0, 8).join(', ')}…` : steps.join(', ')}`
	);
	return [
		...(locks.length > 4
			? [...locks.slice(0, 4), `and ${locks.length - 4} more lock changes`]
			: locks),
		...(components.length
			? [
					`step components changed on step${components.length === 1 ? '' : 's'} ${components.join(', ')}`
				]
			: [])
	];
}

/** A pattern without its player, which the player page's line says (or "player changed"). */
const unplayed = (p: Pattern | undefined) => (p ? { ...p, player: null } : p);

/**
 * A track's patterns, changed: which, and their notes before and after. The player of pattern
 * `shown` (1-based: the one that plays, whose page has its own line) is left out.
 */
function patternChanges(
	label: string,
	before: readonly Pattern[],
	after: readonly Pattern[],
	shown: number,
	soundOf?: (note: number) => string | null,
	track?: TrackState
): string[] {
	const changed: number[] = [];
	for (let i = 0; i < Math.max(before.length, after.length); i++) {
		const differs =
			i + 1 === shown ? !same(unplayed(before[i]), unplayed(after[i])) : !same(before[i], after[i]);
		if (differs) changed.push(i + 1);
	}
	if (changed.length === 0) return [];
	if (changed.length <= 3) {
		return changed.map((n) => {
			const was = before[n - 1];
			const now = after[n - 1];
			const parts: string[] = [];
			// the notes, when they changed (a lock alone once read "2 notes, step 7 … locked")
			const notes = (p: Pattern | undefined) => p?.steps.map((s) => s.notes);
			if (!was || !now || !same(notes(was), notes(now))) {
				parts.push(describeNoteChange(was, now, soundOf) ?? `${notesIn(now)} notes`);
			}
			if (was && now) {
				if (was.bars !== now.bars) parts.push(`${was.bars} → ${now.bars} bars`);
				if (was.length !== now.length) parts.push(`${was.length} → ${now.length} steps`);
				// what the bar menu sets, by name (a scale doubled for a doubled tempo read "its
				// settings changed", and the agent could not tell it had landed)
				if (was.scale !== now.scale) {
					parts.push(`track scale ${formatScale(was.scale)} → ${formatScale(now.scale)}`);
				}
				if (was.groove !== now.groove) parts.push(`groove ${was.groove} → ${now.groove}`);
				parts.push(...extrasChange(was, now, track));
				if (n !== shown && !same(was.player, now.player)) parts.push('its player changed');
			} else if (now && now.length !== now.bars * 16) parts.push(`${now.length} steps`);
			// what else a pattern holds (its scale, its groove…) when nothing named above changed
			return `${label} pattern ${n}: ${parts.length ? parts.join(', ') : 'its settings changed'}`;
		});
	}
	const total = (list: readonly Pattern[]) => list.reduce((sum, p) => sum + notesIn(p), 0);
	return [
		`${label}: ${patternList(changed)} written; ${before.length} → ${after.length} patterns, ${total(before)} → ${total(after)} notes in all`
	];
}

/** Track index 0–15 as the scenes name it: T1–T8, then the auxiliary tracks. */
const trackName = (index: number) => (index < 8 ? `T${index + 1}` : `aux T${index - 7}`);

/**
 * Scenes set, changed or cleared, as the lab's diffs say them: "scene 2: T1 p1 → p2, T3 p1 → p3";
 * a new scene by the tracks that leave pattern 1 ("scene 3: new, T1 p2, T5 p4"), and each scene's
 * mix where it moved ("T1, T3 level 74 → 48"; the scene on screen's, `onScreen`, is the mix lines'
 * own). Only once there are scenes to tell apart.
 */
function sceneChanges(
	before: readonly VirtualScene[],
	after: readonly VirtualScene[],
	onScreen: number | null = null
): string[] {
	// one scene is only what the tracks play, which their own lines say
	if (before.length <= 1 && after.length <= 1) return [];
	const was = new Map(before.map((scene) => [scene.scene, scene]));
	const now = new Map(after.map((scene) => [scene.scene, scene]));
	const numbers = [...new Set([...was.keys(), ...now.keys()])].sort((a, b) => a - b);
	const lines: string[] = [];
	for (const n of numbers) {
		const a = was.get(n);
		const b = now.get(n);
		if (!b) {
			lines.push(`scene ${n}: cleared`);
			continue;
		}
		const moved = b.patterns.flatMap((pattern, t) => {
			if (a)
				return a.patterns[t] === pattern ? [] : [`${trackName(t)} p${a.patterns[t]} → p${pattern}`];
			return pattern === 1 ? [] : [`${trackName(t)} p${pattern}`];
		});
		// a fade's scenes differ by their levels alone, and four of them read "T1 p3, T3 p3"
		const mixed = n === onScreen ? [] : sceneMix(a, b);
		if (a && moved.length === 0 && mixed.length === 0) continue;
		// the patterns, then the mix after a semicolon ("T1 p2, T3 p2; T1, T3 at level 48")
		const patterns =
			moved.length > 8
				? `${moved.slice(0, 8).join(', ')} … (${moved.length} tracks)`
				: moved.join(', ');
		const mix = mixed.join(', ');
		const list = [a || moved.length ? patterns : 'every track on pattern 1', mix]
			.filter(Boolean)
			.join('; ');
		lines.push(a ? `scene ${n}: ${list}` : `scene ${n}: new, ${list}`);
	}
	return lines;
}

/** A scene's levels and mutes, against the scene it was or, new, a new scene's. */
function sceneMix(a: VirtualScene | undefined, b: VirtualScene): string[] {
	const unity = Math.round(DEFAULT_LEVEL);
	const levels = new Map<string, string[]>();
	(b.levels ?? []).forEach((level, t) => {
		const from = a?.levels?.[t] ?? unity;
		if (level === from) return;
		const as = a ? `level ${from} → ${level}` : `at level ${level}`;
		levels.set(as, [...(levels.get(as) ?? []), trackName(t)]);
	});
	const mutedA = new Set(a?.muted ?? []);
	const mutedB = new Set(b.muted ?? []);
	const mutes = [...new Set([...mutedA, ...mutedB])]
		.sort((x, y) => x - y)
		.flatMap((track) =>
			mutedA.has(track) === mutedB.has(track)
				? []
				: [`${trackName(track - 1)} ${mutedB.has(track) ? 'muted' : 'unmuted'}`]
		);
	return [...[...levels].map(([as, tracks]) => `${tracks.join(', ')} ${as}`), ...mutes];
}

/**
 * The changes from `before` to `after`, one line each (at most {@link MAX_CHANGE_LINES}), or none.
 */
export function replicaChanges(before: SimState, after: SimState, read: DiffReaders): string[] {
	const lines = replicaChangeList(before, after, read).map((change) => change.line);
	if (lines.length <= MAX_CHANGE_LINES) return lines;
	return [
		...lines.slice(0, MAX_CHANGE_LINES),
		`… and ${lines.length - MAX_CHANGE_LINES} more changes`
	];
}

/** The changes from `before` to `after`, every one, each with its brief and its keys. */
export function replicaChangeList(
	before: SimState,
	after: SimState,
	read: DiffReaders
): ReplicaChange[] {
	const changes: ReplicaChange[] = [];
	const add = (line: string, controls: readonly ControlId[], brief = line) =>
		changes.push({ line, brief, controls });
	if (before.transport.playing !== after.transport.playing) {
		add(after.transport.playing ? 'playback started' : 'playback stopped', ['key.play']);
	}
	// the scene playing moved on (the song went to its next part, or one was picked): said once,
	// for the tracks' pattern switches it brings, which once read as the user's own edits
	const sceneMoved =
		before.areas.arrange.scene !== after.areas.arrange.scene && after.transport.playing;
	if (sceneMoved) {
		const how = after.areas.arrange.playing ? 'the song moved on' : 'another scene was picked';
		add(
			`playing scene ${after.areas.arrange.scene + 1} now, was ${before.areas.arrange.scene + 1} (${how})`,
			['key.arrange']
		);
	}
	const t0 = before.tempo;
	const t1 = after.tempo;
	const tempo: ControlId[] = ['key.tempo'];
	if (t0.bpm !== t1.bpm) add(`tempo ${t0.bpm} → ${t1.bpm} bpm`, tempo);
	if (t0.groove !== t1.groove) {
		add(`groove ${GROOVES[t0.groove] ?? t0.groove} → ${GROOVES[t1.groove] ?? t1.groove}`, tempo);
	}
	if (round(t0.swing) !== round(t1.swing)) {
		add(`groove amount ${round(t0.swing)} → ${round(t1.swing)}`, tempo);
	}
	if (t0.metronome.on !== t1.metronome.on) {
		add(
			`metronome click ${t0.metronome.on ? 'on' : 'off'} → ${t1.metronome.on ? 'on' : 'off'}`,
			tempo
		);
	}

	for (let t = 0; t < 8; t++) {
		const label = `T${t + 1}`;
		const track = `track.${t + 1}` as ControlId;
		const was = before.tracks[t];
		const now = after.tracks[t];
		const wasPreset = before.areas.system.trackPresets[t] ?? null;
		const nowPreset = after.areas.system.trackPresets[t] ?? null;
		// a new sound (an engine or a preset loaded) is one line: its pages are all the new sound's,
		// which once read as a dozen separate edits
		const newSound = was.engine !== now.engine || wasPreset !== nowPreset;
		if (newSound) {
			const name = (engine: string, preset: string | null) =>
				preset && preset !== '/' ? `${engine} (${preset})` : engine;
			add(
				`${label} sound: ${name(was.engine, wasPreset)} → ${name(now.engine, nowPreset)} (every page as the new sound has it: read_sound reads them)`,
				[track],
				`${label} sound: ${name(was.engine, wasPreset)} → ${name(now.engine, nowPreset)}`
			);
		}
		// the sound without the patterns and the mix, which have their own lines
		const sound = (track: typeof was) => ({ ...track, sequence: null, mix: null });
		const kit = (s: SimState) => s.areas.sample.tracks[t];
		// the player belongs to the pattern that plays: its page has a line of its own below
		const player = (track: typeof was) => track.sequence.patterns[track.sequence.current]?.player;
		const soundChanged = !same(sound(was), sound(now)) || !same(kit(before), kit(after));
		const playerChanged = !same(player(was), player(now));
		if (soundChanged || playerChanged) {
			const a = read.before.readSound(t + 1).pages;
			const b = read.after.readSound(t + 1).pages;
			// a drum track's M1 reads the key last touched, whose own values the key lines give (a plan
			// that panned two hats read "M1 engine: drum key F3 → D#4", as if the sound had changed)
			const keyPage = (page: string) =>
				page === 'M1 engine' && was.engine === 'drum' && now.engine === 'drum';
			for (const page of Object.keys(b)) {
				const wanted = page === 'player' ? playerChanged : soundChanged && !newSound;
				if (!wanted || a[page] === b[page] || keyPage(page)) continue;
				const key = pageKey(page);
				add(
					`${label} ${page}: ${pageChange(page, a[page], b[page])}`,
					key ? [track, key] : [track],
					`${label} ${page}: ${a[page] === undefined ? `— → ${b[page]}` : briefChange(a[page], b[page])}`
				);
			}
		}
		// a drum key's own values (a key panned left once left no line, and the agent could not tell
		// whether its setting had landed)
		if (soundChanged && !newSound) {
			for (const line of drumKeyChanges(before, after, t)) {
				add(`${label} key ${line}`, [track], `${label} key ${line}`);
			}
		}
		// a kit's samples, key by key (a new kit on a drum track once left no line at all)
		const keysWere = kit(before)?.keys ?? [];
		const keysNow = kit(after)?.keys ?? [];
		const swapped: string[] = [];
		for (let k = 0; k < Math.max(keysWere.length, keysNow.length); k++) {
			const a = keysWere[k]?.name ?? null;
			const b = keysNow[k]?.name ?? null;
			if ((keysWere[k]?.id ?? null) === (keysNow[k]?.id ?? null)) continue;
			const name = (file: string | null) => (file ? soundName(file) : 'empty');
			// the same name on a new file: the sound remade (a shorter snare)
			swapped.push(a === b ? `${name(b)} remade` : `${name(a)} → ${name(b)}`);
		}
		if (swapped.length > 0) {
			add(
				`${label} kit: ${swapped.length} key${swapped.length === 1 ? '' : 's'} with new samples (${swapped.slice(0, 4).join(', ')}${swapped.length > 4 ? ', …' : ''})`,
				[track],
				`${label} kit: ${swapped.length} new sample${swapped.length === 1 ? '' : 's'}`
			);
		}
		const m0 = was.mix;
		const m1 = now.mix;
		const mix: ControlId[] = [track, 'key.mix'];
		if (round(m0.level) !== round(m1.level))
			add(`${label} level ${round(m0.level)} → ${round(m1.level)}`, mix);
		if (round(m0.pan) !== round(m1.pan))
			add(`${label} pan ${round(m0.pan)} → ${round(m1.pan)}`, mix);
		if (m0.muted !== m1.muted) add(`${label} ${m1.muted ? 'muted' : 'unmuted'}`, mix);
		// in the scene on screen, which an agent once took for the whole song
		if (was.sequence.current !== now.sequence.current && !sceneMoved) {
			add(
				`${label} plays pattern ${was.sequence.current + 1} → ${now.sequence.current + 1} in scene ${after.areas.arrange.scene + 1}, the one on screen`,
				[track],
				`${label} plays pattern ${was.sequence.current + 1} → ${now.sequence.current + 1}`
			);
		}
		// a drum note by its key's sound ("closed hat 1"), any other by its name ("4 added on steps
		// 28, 29 (B1, D2)": steps alone left an agent checking a rewritten ending by eye)
		const keys = now.engine === 'drum' ? after.areas.sample.tracks[t]?.keys : undefined;
		const soundOf = keys
			? (note: number) => {
					const file = keys[note - FIRST_NOTE];
					return file ? soundName(file.name) : null;
				}
			: (note: number) =>
					note >= 0 && note <= 127 ? noteName(note, { ascii: true, convention: 'c4' }) : null;
		const patterns = patternChanges(
			label,
			was.sequence.patterns,
			now.sequence.patterns,
			now.sequence.current + 1,
			soundOf,
			now
		);
		for (const line of patterns) add(line, [track]);
	}

	// the brain (aux T1): its key, scale, detection, link and routing, for the pattern it is on (an
	// agent that set it to D minor was told nothing had changed)
	const brain = (st: SimState) => brainSettings(st.areas.auxiliary, trackSequence(st, 8).current);
	const b0 = brain(before);
	const b1 = brain(after);
	const brainParts: string[] = [];
	const mode = (b: BrainSettings) => (b.auto ? 'auto' : 'manual');
	const key = (b: BrainSettings) => `${KEYS[b.key]} ${SCALES[b.scale]?.label ?? b.scale}`;
	const linked = (b: BrainSettings) => (b.link === null ? 'none' : `T${b.link + 1}`);
	const routed = (b: BrainSettings) =>
		b.routes.flatMap((r, i) => (r ? [`T${i + 1}`] : [])).join(' ') || 'none';
	if (b0.auto !== b1.auto) brainParts.push(`${mode(b0)} → ${mode(b1)}`);
	if (key(b0) !== key(b1)) brainParts.push(`key ${key(b0)} → ${key(b1)}`);
	if (b0.link !== b1.link) brainParts.push(`link ${linked(b0)} → ${linked(b1)}`);
	if (routed(b0) !== routed(b1)) brainParts.push(`routed ${routed(b0)} → ${routed(b1)}`);
	if (brainParts.length > 0) add(`brain: ${brainParts.join(', ')}`, ['key.auxiliary']);

	const fx0 = before.areas.auxiliary.fx;
	const fx1 = after.areas.auxiliary.fx;
	fx1.forEach((slot, i) => {
		const name = i === 0 ? 'FX I' : 'FX II';
		const was = fx0[i];
		const aux: ControlId[] = ['key.auxiliary'];
		if (!was || was.type !== slot.type) add(`${name}: ${was?.type ?? '—'} → ${slot.type}`, aux);
		else if (!same(was.params, slot.params)) {
			// as its page reads ("FX I delay: dry 99 → 00"), where "settings changed" once left an
			// agent unsure which of them it had set
			const page = `${name} ${slot.type}`;
			const a = read.before.readSound(1).fx?.[name];
			const b = read.after.readSound(1).fx?.[name];
			if (a && b && a !== b) {
				add(`${page}: ${pageChange(page, a, b)}`, aux, `${page}: ${briefChange(a, b)}`);
			} else add(`${name} (${slot.type}) settings changed`, aux);
		}
	});
	if (!same(before.areas.mixer, after.areas.mixer)) {
		add('the mixer’s master section changed', ['key.mix']);
	}
	// project settings, row by row as the page reads them (an agent set 3/4 and could not see it
	// land); the groove type has its tempo line above
	if (!same(before.areas.system.projectSettings, after.areas.system.projectSettings)) {
		for (const section of PROJECT_SECTIONS) {
			const was = section.rows(before);
			for (const row of section.rows(after)) {
				if (row.label === 'groove type') continue;
				const a = was.find((r) => r.label === row.label)?.value(before);
				const b = row.value(after);
				if (a !== b) add(`project ${row.label}: ${a ?? '—'} → ${b}`, ['key.project']);
			}
		}
	}

	const a0 = read.before.readArrangement();
	const a1 = read.after.readArrangement();
	const arrange: ControlId[] = ['key.arrange'];
	// the scene on screen's mix is the mix lines' own, when it is the same scene before and after
	const onScreen =
		before.areas.arrange.scene === after.areas.arrange.scene ? after.areas.arrange.scene + 1 : null;
	for (const line of sceneChanges(a0.scenes, a1.scenes, onScreen)) add(line, arrange);
	if (!same(a0.song, a1.song)) {
		const order = (o: readonly number[]) =>
			o.length > 12 ? `${o.slice(0, 12).join(' ')} … (${o.length} entries)` : o.join(' ');
		add(
			`song: ${order(a0.song.order)} → ${order(a1.song.order)}${a0.song.loop !== a1.song.loop ? `, loop ${a1.song.loop ? 'on' : 'off'}` : ''}`,
			arrange
		);
	}
	return changes;
}
