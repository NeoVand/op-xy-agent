/**
 * The preset maker's workbench logic that is not audio: what kind of preset a first drop of files
 * wants to be, how a multisample's zones spread over the keyboard (as the builder writes them), and
 * waveform overviews for the keys and the editor. Pure.
 */
import { detectNote, mono, noteFromName } from './audio';
import { findOnsets, loopTempo } from './slice';
import type { PcmAudio } from './wav';

/** What the preset maker makes: a preset kind, or a loop sliced into a drum kit. */
export type BenchMode = 'drum' | 'slices' | 'multisampler' | 'sampler';

/** A dropped file, decoded. */
export interface DroppedSound {
	readonly name: string;
	readonly audio: PcmAudio;
}

/** Why a drop became what it did, for the line the screen shows. */
export interface ModeGuess {
	readonly mode: BenchMode;
	readonly reason: string;
}

const seconds = (a: PcmAudio) => (a.channels[0]?.length ?? 0) / a.sampleRate;

/**
 * What a first drop wants to be: one long file full of hits at a steady tempo is a loop to slice;
 * one sustained, pitched sound a synth sampler; several notes of an instrument (roots in their
 * names or files, or several pitched sustains) a multisample; anything else a drum kit.
 */
export function guessMode(sounds: readonly DroppedSound[]): ModeGuess {
	if (sounds.length === 0) return { mode: 'drum', reason: 'nothing dropped' };
	if (sounds.length === 1) {
		const [only] = sounds;
		const length = seconds(only.audio);
		if (length >= 1.2) {
			const hits = findOnsets(only.audio);
			const tempo = loopTempo(only.audio, hits);
			if (hits.length >= 4 && tempo && tempo.confidence > 0.6) {
				return { mode: 'slices', reason: `a loop at ${tempo.bpm} bpm: sliced onto the keys` };
			}
		}
		const root = only.audio.root ?? noteFromName(only.name);
		if (root !== null && root !== undefined && length >= 0.3) {
			return { mode: 'sampler', reason: 'one note: played across the keys' };
		}
		if (length >= 0.8 && detectNote(only.audio) !== null) {
			return { mode: 'sampler', reason: 'one pitched sound: played across the keys' };
		}
		return { mode: 'drum', reason: 'one hit: on the kit' };
	}
	const named = sounds.map((s) => s.audio.root ?? noteFromName(s.name));
	const distinct = new Set(named.filter((r) => r !== null && r !== undefined));
	if (distinct.size >= 2 && distinct.size >= sounds.length / 2) {
		return { mode: 'multisampler', reason: `${distinct.size} notes of one instrument` };
	}
	const sustained = sounds.filter((s) => seconds(s.audio) >= 0.8);
	if (sustained.length === sounds.length && sounds.length <= 24) {
		const notes = new Set(sustained.map((s) => detectNote(s.audio)).filter((n) => n !== null));
		if (notes.size >= 2 && notes.size >= sounds.length * 0.75) {
			return { mode: 'multisampler', reason: `${notes.size} pitched notes: one instrument` };
		}
	}
	return { mode: 'drum', reason: `${sounds.length} hits: laid out as TE lays out a kit` };
}

/** A multisample zone: the notes it plays, from `low` to `high`, pitched from `root`. */
export interface Zone {
	readonly root: number;
	readonly low: number;
	readonly high: number;
}

/**
 * The zones distinct roots make, as the builder writes them: each reaches half way to the next
 * root, the lowest down to 0 and the highest up to 127 (zones fill down from their `hikey`).
 */
export function zonesFor(roots: readonly number[]): Zone[] {
	const sorted = [...new Set(roots)].sort((a, b) => a - b);
	return sorted.map((root, i) => {
		const next = sorted[i + 1];
		const previous = sorted[i - 1];
		return {
			root,
			low: previous === undefined ? 0 : Math.floor((previous + root) / 2) + 1,
			high: next === undefined ? 127 : Math.floor((root + next) / 2)
		};
	});
}

/** The zone that plays `note`, or null with no zones. */
export function zoneFor(zones: readonly Zone[], note: number): Zone | null {
	return zones.find((z) => note >= z.low && note <= z.high) ?? null;
}

/**
 * A waveform overview: the lowest and highest sample (channels mixed) under each of `columns`
 * columns of frames `from` to `to`, as [low0, high0, low1, high1, …].
 */
export function overview(
	audio: PcmAudio,
	columns: number,
	from = 0,
	to = audio.channels[0]?.length ?? 0
): Float32Array {
	const x = mono(audio.channels);
	const n = Math.max(1, Math.round(columns));
	const out = new Float32Array(n * 2);
	const span = Math.max(0, to - from);
	if (span === 0) return out;
	for (let c = 0; c < n; c++) {
		const a = from + Math.floor((c * span) / n);
		const b = Math.max(a + 1, from + Math.floor(((c + 1) * span) / n));
		let low = 0;
		let high = 0;
		for (let i = a; i < b && i < x.length; i++) {
			if (x[i] < low) low = x[i];
			if (x[i] > high) high = x[i];
		}
		out[2 * c] = low;
		out[2 * c + 1] = high;
	}
	return out;
}

/**
 * The nearest rising zero crossing to `at` within `reach` frames either way (where a loop point
 * joins without a click), or `at` itself when there is none.
 */
export function nearestZero(audio: PcmAudio, at: number, reach: number): number {
	const x = mono(audio.channels);
	const start = Math.max(1, Math.min(x.length - 1, Math.round(at)));
	for (let d = 0; d <= reach; d++) {
		for (const i of [start - d, start + d]) {
			if (i > 0 && i < x.length && x[i - 1] < 0 && x[i] >= 0) return i;
		}
	}
	return start;
}
