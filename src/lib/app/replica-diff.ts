/**
 * What changed on the replica between two states, in words (docs/AGENT-V2.md, grounding): the
 * agent is handed these lines before it writes its answer, so it describes what happened, never what
 * it meant to do. Playback, tempo, groove and the click; each instrument track's sound as its pages
 * read on the screen (only for tracks that changed, since reading a sound plays keys on a copy);
 * mix; patterns; the send effects; scenes and the song.
 */
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import { GROOVES, type SimState } from '$lib/sim/params';

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

/** A track's patterns, changed: which, and their notes before and after. */
function patternChanges(
	label: string,
	before: readonly Pattern[],
	after: readonly Pattern[]
): string[] {
	const changed: number[] = [];
	for (let i = 0; i < Math.max(before.length, after.length); i++) {
		if (!same(before[i], after[i])) changed.push(i + 1);
	}
	if (changed.length === 0) return [];
	if (changed.length <= 3) {
		return changed.map((n) => {
			const was = before[n - 1];
			const now = after[n - 1];
			if (!now) return `${label} pattern ${n} removed`;
			const bars = was && was.bars !== now.bars ? `, ${was.bars} → ${now.bars} bars` : '';
			const length = now.length !== now.bars * 16 ? ` (${now.length} steps)` : '';
			return `${label} pattern ${n}: ${was ? notesIn(was) : 'new, 0'} → ${notesIn(now)} notes${bars}${length}`;
		});
	}
	const total = (list: readonly Pattern[]) => list.reduce((sum, p) => sum + notesIn(p), 0);
	return [
		`${label}: ${patternList(changed)} written; ${before.length} → ${after.length} patterns, ${total(before)} → ${total(after)} notes in all`
	];
}

/**
 * The changes from `before` to `after`, one line each (at most {@link MAX_CHANGE_LINES}), or none.
 */
export function replicaChanges(before: SimState, after: SimState, read: DiffReaders): string[] {
	const lines: string[] = [];
	if (before.transport.playing !== after.transport.playing) {
		lines.push(after.transport.playing ? 'playback started' : 'playback stopped');
	}
	const t0 = before.tempo;
	const t1 = after.tempo;
	if (t0.bpm !== t1.bpm) lines.push(`tempo ${t0.bpm} → ${t1.bpm} bpm`);
	if (t0.groove !== t1.groove) {
		lines.push(`groove ${GROOVES[t0.groove] ?? t0.groove} → ${GROOVES[t1.groove] ?? t1.groove}`);
	}
	if (round(t0.swing) !== round(t1.swing)) {
		lines.push(`groove amount ${round(t0.swing)} → ${round(t1.swing)}`);
	}
	if (t0.metronome.on !== t1.metronome.on) {
		lines.push(
			`metronome click ${t0.metronome.on ? 'on' : 'off'} → ${t1.metronome.on ? 'on' : 'off'}`
		);
	}

	for (let t = 0; t < 8; t++) {
		const label = `T${t + 1}`;
		const was = before.tracks[t];
		const now = after.tracks[t];
		const wasPreset = before.areas.system.trackPresets[t] ?? null;
		const nowPreset = after.areas.system.trackPresets[t] ?? null;
		if (was.engine !== now.engine || wasPreset !== nowPreset) {
			const name = (engine: string, preset: string | null) =>
				preset && preset !== '/' ? `${engine} (${preset})` : engine;
			lines.push(`${label} sound: ${name(was.engine, wasPreset)} → ${name(now.engine, nowPreset)}`);
		}
		// the sound without the patterns and the mix, which have their own lines
		const sound = (track: typeof was) => ({ ...track, sequence: null, mix: null });
		const kit = (s: SimState) => s.areas.sample.tracks[t];
		if (!same(sound(was), sound(now)) || !same(kit(before), kit(after))) {
			const a = read.before.readSound(t + 1).pages;
			const b = read.after.readSound(t + 1).pages;
			for (const page of Object.keys(b)) {
				if (a[page] !== b[page]) lines.push(`${label} ${page}: ${a[page] ?? '—'} → ${b[page]}`);
			}
		}
		const m0 = was.mix;
		const m1 = now.mix;
		if (round(m0.level) !== round(m1.level))
			lines.push(`${label} level ${round(m0.level)} → ${round(m1.level)}`);
		if (round(m0.pan) !== round(m1.pan))
			lines.push(`${label} pan ${round(m0.pan)} → ${round(m1.pan)}`);
		if (m0.muted !== m1.muted) lines.push(`${label} ${m1.muted ? 'muted' : 'unmuted'}`);
		lines.push(...patternChanges(label, was.sequence.patterns, now.sequence.patterns));
	}

	const fx0 = before.areas.auxiliary.fx;
	const fx1 = after.areas.auxiliary.fx;
	fx1.forEach((slot, i) => {
		const name = i === 0 ? 'FX I' : 'FX II';
		const was = fx0[i];
		if (!was || was.type !== slot.type) lines.push(`${name}: ${was?.type ?? '—'} → ${slot.type}`);
		else if (!same(was.params, slot.params)) lines.push(`${name} (${slot.type}) settings changed`);
	});
	if (!same(before.areas.mixer, after.areas.mixer))
		lines.push('the mixer’s master section changed');

	const a0 = read.before.readArrangement();
	const a1 = read.after.readArrangement();
	if (!same(a0.scenes, a1.scenes)) {
		lines.push(`scenes: ${a0.scenes.length} → ${a1.scenes.length} with patterns set`);
	}
	if (!same(a0.song, a1.song)) {
		const order = (o: readonly number[]) =>
			o.length > 12 ? `${o.slice(0, 12).join(' ')} … (${o.length} entries)` : o.join(' ');
		lines.push(
			`song: ${order(a0.song.order)} → ${order(a1.song.order)}${a0.song.loop !== a1.song.loop ? `, loop ${a1.song.loop ? 'on' : 'off'}` : ''}`
		);
	}
	if (lines.length <= MAX_CHANGE_LINES) return lines;
	return [
		...lines.slice(0, MAX_CHANGE_LINES),
		`… and ${lines.length - MAX_CHANGE_LINES} more changes`
	];
}
