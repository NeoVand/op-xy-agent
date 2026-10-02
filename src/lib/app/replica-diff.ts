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
import { GROOVES, type SimState } from '$lib/sim/params';
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

/**
 * Only what differs between two readings of a page: "cutoff 00 → 40", "svf filter on → off,
 * resonance 10 → 20". Readings of another shape (an lfo of another type) are given whole.
 */
export function briefChange(was: string, now: string): string {
	const whole = `${was} → ${now}`;
	const split = (text: string) => {
		const at = text.indexOf(': ');
		return at < 0
			? { head: '', body: text }
			: { head: text.slice(0, at), body: text.slice(at + 2) };
	};
	const a = split(was);
	const b = split(now);
	if (a.head !== b.head && (!a.head || !b.head)) return whole;
	const parts: string[] = [];
	if (a.head !== b.head) {
		const label = sharedLabel(a.head, b.head);
		parts.push(`${a.head} → ${b.head.slice(label.length)}`);
	}
	const pa = a.body.split(', ');
	const pb = b.body.split(', ');
	if (pa.length !== pb.length) return whole;
	pa.forEach((x, i) => {
		const y = pb[i];
		if (x === y) return;
		const label = sharedLabel(x, y);
		parts.push(`${x} → ${y.slice(label.length)}`);
	});
	return parts.length > 0 ? parts.join(', ') : whole;
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
	soundOf?: (note: number) => string | null
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
			if (!same(unplayed(was), unplayed(now)) || !was || !now) {
				parts.push(describeNoteChange(was, now, soundOf) ?? `${notesIn(now)} notes`);
			}
			if (was && now) {
				if (was.bars !== now.bars) parts.push(`${was.bars} → ${now.bars} bars`);
				if (was.length !== now.length) parts.push(`${was.length} → ${now.length} steps`);
				const extras = (p: Pattern) => p.steps.map((s) => [s.components, s.locks]);
				if (!same(extras(was), extras(now))) parts.push('step components or locks changed');
				if (n !== shown && !same(was.player, now.player)) parts.push('its player changed');
			} else if (now && now.length !== now.bars * 16) parts.push(`${now.length} steps`);
			return `${label} pattern ${n}: ${parts.join(', ')}`;
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
 * a new scene by the tracks that leave pattern 1 ("scene 3: new, T1 p2, T5 p4"). Only once there
 * are scenes to tell apart.
 */
function sceneChanges(before: readonly VirtualScene[], after: readonly VirtualScene[]): string[] {
	// one scene is only what the tracks play, which their own lines say
	if (before.length <= 1 && after.length <= 1) return [];
	const was = new Map(before.map((scene) => [scene.scene, scene.patterns]));
	const now = new Map(after.map((scene) => [scene.scene, scene.patterns]));
	const numbers = [...new Set([...was.keys(), ...now.keys()])].sort((a, b) => a - b);
	const lines: string[] = [];
	for (const n of numbers) {
		const a = was.get(n);
		const b = now.get(n);
		if (same(a, b)) continue;
		if (!b) {
			lines.push(`scene ${n}: cleared`);
			continue;
		}
		const moved = b.flatMap((pattern, t) => {
			if (a) return a[t] === pattern ? [] : [`${trackName(t)} p${a[t]} → p${pattern}`];
			return pattern === 1 ? [] : [`${trackName(t)} p${pattern}`];
		});
		const list =
			moved.length > 8
				? `${moved.slice(0, 8).join(', ')} … (${moved.length} tracks)`
				: moved.join(', ');
		lines.push(
			a ? `scene ${n}: ${list}` : `scene ${n}: new, ${list || 'every track on pattern 1'}`
		);
	}
	return lines;
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
		if (was.engine !== now.engine || wasPreset !== nowPreset) {
			const name = (engine: string, preset: string | null) =>
				preset && preset !== '/' ? `${engine} (${preset})` : engine;
			add(`${label} sound: ${name(was.engine, wasPreset)} → ${name(now.engine, nowPreset)}`, [
				track
			]);
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
			for (const page of Object.keys(b)) {
				const wanted = page === 'player' ? playerChanged : soundChanged;
				if (!wanted || a[page] === b[page]) continue;
				const key = pageKey(page);
				add(
					`${label} ${page}: ${a[page] ?? '—'} → ${b[page]}`,
					key ? [track, key] : [track],
					`${label} ${page}: ${a[page] === undefined ? `— → ${b[page]}` : briefChange(a[page], b[page])}`
				);
			}
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
		// a drum note by its key's sound ("closed hat 1")
		const keys = now.engine === 'drum' ? after.areas.sample.tracks[t]?.keys : undefined;
		const soundOf = keys
			? (note: number) => {
					const file = keys[note - FIRST_NOTE];
					return file ? soundName(file.name) : null;
				}
			: undefined;
		const patterns = patternChanges(
			label,
			was.sequence.patterns,
			now.sequence.patterns,
			now.sequence.current + 1,
			soundOf
		);
		for (const line of patterns) add(line, [track]);
	}

	const fx0 = before.areas.auxiliary.fx;
	const fx1 = after.areas.auxiliary.fx;
	fx1.forEach((slot, i) => {
		const name = i === 0 ? 'FX I' : 'FX II';
		const was = fx0[i];
		const aux: ControlId[] = ['key.auxiliary'];
		if (!was || was.type !== slot.type) add(`${name}: ${was?.type ?? '—'} → ${slot.type}`, aux);
		else if (!same(was.params, slot.params)) add(`${name} (${slot.type}) settings changed`, aux);
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
	for (const line of sceneChanges(a0.scenes, a1.scenes)) add(line, arrange);
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
