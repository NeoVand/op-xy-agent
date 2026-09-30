/**
 * What the replica holds, as a flat and readable summary (tempo, transport, each track's sound, mix
 * and notes, the scenes and the song), and what changed between two summaries. The episodes eval
 * (`episodes.ts`) summarises the replica around every agent turn and every key press of the
 * simulated user, so each change is known to be the agent's or the user's own: a user who wanted
 * to learn must have turned the cutoff with their own hands.
 *
 * Values are the ones the screen shows (0–99 as the device displays them), so a change reads like
 * the device ("t3.cutoff 0 → 40"). Where the user is on the device (the page, the mode) is not the
 * music and is left out.
 */
import type { VirtualNote, VirtualOpxy } from '$lib/agent/virtual-opxy';
import type { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { DUCK_METRONOME, GROOVES, shown } from '$lib/sim/params';
import { currentPattern } from '$lib/sim/sequencer';
import { captureScene } from '$lib/sim/areas/arrange/model';

/** The replica at one moment: keys such as `tempo`, `t3.cutoff`, `t1.notes`, `song`. */
export type ReplicaSummary = Readonly<Record<string, string | number | boolean>>;

/** One value that changed. */
export interface Change {
	readonly key: string;
	readonly from: string | number | boolean | null;
	readonly to: string | number | boolean | null;
}

/** A pattern's notes in order, as `step:note` ("1:53 5:53 9:53 13:53"), or "none". */
export function notesText(notes: readonly VirtualNote[]): string {
	if (notes.length === 0) return 'none';
	return [...notes]
		.sort((a, b) => a.step - b.step || a.note - b.note)
		.map((n) => `${n.step}:${n.note}`)
		.join(' ');
}

const ENVELOPE = ['attack', 'decay', 'sustain', 'release'] as const;

/** The replica's music now: what a change by the agent or the user can touch. */
export function summarizeReplica(sim: OpxySim, virtual: VirtualOpxy): ReplicaSummary {
	const s = sim.state;
	const out: Record<string, string | number | boolean> = {
		tempo: s.tempo.bpm,
		swing: s.tempo.swing,
		groove: GROOVES[s.tempo.groove] ?? String(s.tempo.groove),
		metronome: s.tempo.metronome.on,
		playing: s.transport.playing
	};
	s.tracks.forEach((t, i) => {
		const n = `t${i + 1}`;
		out[`${n}.engine`] = t.engine;
		out[`${n}.muted`] = t.mix.muted;
		out[`${n}.level`] = shown(t.mix.level);
		out[`${n}.filter`] = `${t.filter.type}${t.filter.on ? '' : ' off'}`;
		out[`${n}.cutoff`] = shown(t.filter.cutoff);
		out[`${n}.resonance`] = shown(t.filter.resonance);
		for (const stage of ENVELOPE) out[`${n}.amp.${stage}`] = shown(t.amp[stage]);
		out[`${n}.lfo`] = `${t.lfo.type}${t.lfo.on ? '' : ' off'}`;
		out[`${n}.lfo.amount`] = Math.round(t.lfo.amount);
		if (t.lfo.type === 'duck') {
			out[`${n}.duck.source`] =
				t.lfo.source === DUCK_METRONOME ? 'metronome' : `track ${t.lfo.source}`;
		}
		out[`${n}.fx1`] = shown(t.sends[2]);
		out[`${n}.fx2`] = shown(t.sends[3]);
		const p = virtual.readPattern(i + 1);
		out[`${n}.pattern`] =
			`${p.pattern} of ${p.patterns}, ${p.bars} bar${p.bars === 1 ? '' : 's'}, ${p.length} steps`;
		out[`${n}.notes`] = notesText(p.notes);
		const groove = currentPattern(t.sequence).groove;
		if (groove !== 0) out[`${n}.groove`] = groove;
	});
	s.aux.forEach((a, i) => {
		const n = `t${i + 9}`;
		out[`${n}.muted`] = a.mix.muted;
		const notes = virtual.readPattern(i + 9).notes;
		if (notes.length > 0) out[`${n}.notes`] = notesText(notes);
	});
	const arrange = s.areas.arrange;
	out.scene = arrange.scene + 1;
	arrange.scenes.forEach((kept, i) => {
		// the scene playing now is what the tracks play, whatever was stored for it
		const scene = i === arrange.scene ? captureScene(s) : kept;
		if (!scene) return;
		const muted = scene.mix.flatMap((m, t) => (m.muted ? [t + 1] : []));
		out[`scene.${i + 1}`] = `patterns ${scene.patterns
			.slice(0, 8)
			.map((p) => p + 1)
			.join(' ')}${muted.length > 0 ? `, muted ${muted.join(' ')}` : ''}`;
	});
	const song = arrange.songs[arrange.song];
	out.song = `${song.order.map((n) => n + 1).join(' ') || 'none'}${song.loop ? ', loops' : ''}`;
	return out;
}

/** Every value that differs between two summaries (a key only one has counts, as null). */
export function diffSummaries(before: ReplicaSummary, after: ReplicaSummary): Change[] {
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
	return keys
		.filter((key) => before[key] !== after[key])
		.map((key) => ({ key, from: before[key] ?? null, to: after[key] ?? null }));
}

/** How many notes a `notes` value holds. */
const noteCount = (v: Change['from']) =>
	typeof v === 'string' && v !== 'none' ? v.split(' ').length : 0;

/** A change in a few words ("t3.cutoff 0 → 40", "t1.notes 0 → 4 notes"). */
export function describeChange(change: Change): string {
	if (change.key.endsWith('.notes')) {
		return `${change.key} ${noteCount(change.from)} → ${noteCount(change.to)} notes`;
	}
	return `${change.key} ${change.from ?? '–'} → ${change.to ?? '–'}`;
}

/** The first and last value a key took over a series of changes, or null when it never changed. */
export function netChange(changes: readonly Change[], key: string): Change | null {
	const mine = changes.filter((c) => c.key === key);
	if (mine.length === 0) return null;
	return { key, from: mine[0].from, to: mine[mine.length - 1].to };
}
