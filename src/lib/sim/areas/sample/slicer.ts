/**
 * The slicer (manual: sampler/slicing): on a drum sampler track, key + M1 cuts that key's sample
 * into slices that fill the keyboard from its first key and choke each other. Transient mode cuts
 * at the loudest hits (E4 sets how many; a selected slice's edges move with E2 and E3), even mode
 * splits a section (E2, E3) into equal parts (E4), tap mode takes the points tapped on M1 while
 * the sample plays (M2 stops and lets the last slice run to the end).
 *
 * Ours, where the manual is silent: the slicer shows and cuts the key's trimmed part (its start
 * and end), M1 in transient and even mode plays that part, a key plays its slice, done (M4) fills
 * the keys from F3 and leaves the keys past the last slice alone, cancel (M3) changes nothing.
 */
import type { SimState } from '../../params';
import type { SliceMarker } from './frames';
import { KEYS, type SampleFile, type SlicerState } from './state';
import { decodeWave, wave, type Wave } from './wave';

/** Width of a slicer column: three lane columns (TE's zoomed waveform). */
export const SLICE_COLUMN = 6.21;
/** Columns across the screen (the last one runs past the edge). */
export const SLICE_COLUMNS = Math.ceil(480 / SLICE_COLUMN);
/** Most slices a sample gives: one per key. */
export const MAX_SLICES = KEYS;

/** A slice: 0–1 of the key's trimmed part. */
export interface Slice {
	readonly start: number;
	readonly end: number;
}

/** The key's sample and its trimmed part in seconds (null when the key is empty). */
export function sliceSource(
	s: SimState,
	slicer: SlicerState
): { file: SampleFile; from: number; to: number } | null {
	const file = s.areas.sample.tracks[s.track].keys[slicer.key];
	if (!file) return null;
	const k = s.tracks[s.track].drumKeys[slicer.key];
	const from = (Math.min(k.start, k.end) / 99) * file.seconds;
	const to = (Math.max(k.start, k.end) / 99) * file.seconds;
	return { file, from, to: to > from ? to : file.seconds };
}

/** The slicer's waveform: the trimmed part across the screen in 6.21 px columns. */
export function sliceWave(s: SimState, slicer: SlicerState): Wave {
	const src = sliceSource(s, slicer);
	if (!src) return '0'.repeat(SLICE_COLUMNS);
	const span = ((SLICE_COLUMNS * SLICE_COLUMN) / 480) * (src.to - src.from);
	return wave(src.file, src.from, src.from + span, SLICE_COLUMNS);
}

/** Fraction of the view where column `c` starts. */
const columnAt = (c: number) => (c * SLICE_COLUMN) / 480;

/**
 * Where the `count` loudest hits start, as column indices. Every sounding column is a candidate,
 * scored by its rise (counted twice) and the peak right after it, so hits win and, when a sample
 * has fewer hits than slices wanted, its loudest stretches fill in; picks are kept apart by half
 * an even slice so a drum roll counts once (TE's art: three slices for a roll and two hits).
 */
export function transientColumns(levels: readonly number[], count: number): number[] {
	const candidates: { c: number; score: number }[] = [];
	for (let c = 0; c < levels.length; c++) {
		if (levels[c] <= 0) continue;
		const rise = Math.max(0, levels[c] - (levels[c - 1] ?? 0));
		const peak = Math.max(...levels.slice(c, c + 3));
		candidates.push({ c, score: 2 * rise + peak });
	}
	candidates.sort((a, b) => b.score - a.score || a.c - b.c);
	const spacing = Math.max(1, Math.floor(levels.length / (2 * Math.max(1, count))));
	const picked: number[] = [];
	for (const { c } of candidates) {
		if (picked.length >= count) break;
		if (picked.every((p) => Math.abs(p - c) >= spacing)) picked.push(c);
	}
	return picked.sort((a, b) => a - b);
}

/** The slices of the current mode, 0–1 of the trimmed part. */
export function slices(s: SimState, slicer: SlicerState): Slice[] {
	switch (slicer.mode) {
		case 'transient': {
			const levels = decodeWave(sliceWave(s, slicer));
			const starts = transientColumns(levels, slicer.counts.transient).map(columnAt);
			return starts.map((start, i) => {
				const edit = slicer.edits.find((e) => e.index === i);
				if (edit) return { start: edit.start, end: edit.end };
				return { start, end: starts[i + 1] ?? 1 };
			});
		}
		case 'even': {
			const { start, end } = slicer.section;
			const n = slicer.counts.even;
			return Array.from({ length: n }, (_, i) => ({
				start: start + ((end - start) * i) / n,
				end: start + ((end - start) * (i + 1)) / n
			}));
		}
		case 'tap': {
			const taps = slicer.taps;
			const out = taps.slice(0, -1).map((start, i) => ({ start, end: taps[i + 1] }));
			if (slicer.extended && taps.length > 0) out.push({ start: taps[taps.length - 1], end: 1 });
			// one slice per key: points tapped past the 24th slice are not used
			return out.slice(0, MAX_SLICES);
		}
	}
}

/** The markers the screen draws: slice starts (transient), every boundary (even), the taps. */
export function sliceMarkers(s: SimState, slicer: SlicerState): SliceMarker[] {
	const list = slices(s, slicer);
	const sel = slicer.selected === null ? null : list[slicer.selected];
	const edge = (at: number) =>
		sel !== null && sel !== undefined && (at === sel.start || at === sel.end);
	let points: number[];
	if (slicer.mode === 'tap') points = [...slicer.taps];
	else if (slicer.mode === 'even')
		points = list.length ? [list[0].start, ...list.map((l) => l.end)] : [];
	else {
		points = list.map((l) => l.start);
		// an end moved by hand that no longer meets the next slice gets its own marker
		list.forEach((l, i) => {
			if (l.end < 1 && l.end !== list[i + 1]?.start) points.push(l.end);
		});
	}
	return [...new Set(points)]
		.sort((a, b) => a - b)
		.map((at) => ({ at: Math.round(at * 10000) / 10000, selected: edge(at) }));
}

/**
 * The count at the top right: the slices there are (the E4 setting in transient and even mode,
 * unless a near-silent sample offers fewer places to cut; the slices tapped in tap mode).
 */
export function sliceCount(s: SimState, slicer: SlicerState): number {
	return slices(s, slicer).length;
}

/** Length of the trimmed part in seconds (for playback). */
export function sliceSeconds(s: SimState, slicer: SlicerState): number {
	const src = sliceSource(s, slicer);
	return src ? Math.max(0.01, src.to - src.from) : 1;
}

/** Where playback is now (0–1), taking whichever clock moved further. */
export function playPosition(s: SimState, slicer: SlicerState, now: number): number | null {
	const play = slicer.play;
	if (!play) return null;
	const byNow = play.from + (now - play.startedAt) / 1000 / sliceSeconds(s, slicer);
	return Math.max(play.position, Math.min(byNow, play.to));
}

/** Starts playback of `[from, to]` (0–1). */
export function startPlay(slicer: SlicerState, from: number, to: number, now: number): void {
	slicer.play = { from, to, position: from, startedAt: now };
}

/**
 * A tap on M1 in tap mode: starts the sample, or marks a slice point where it plays now. Points
 * too close to an existing one are ignored.
 */
export function tap(s: SimState, slicer: SlicerState, now: number): void {
	const at = playPosition(s, slicer, now);
	if (at === null || at >= 1) {
		startPlay(slicer, 0, 1, now);
		return;
	}
	if (slicer.taps.every((t) => Math.abs(t - at) > 0.002) && slicer.taps.length <= MAX_SLICES) {
		slicer.taps = [...slicer.taps, Math.round(at * 10000) / 10000].sort((a, b) => a - b);
	}
}

/** Time passing: playback moves on and ends at its span's end. */
export function advanceSlicer(s: SimState, slicer: SlicerState, ms: number): void {
	const play = slicer.play;
	if (!play) return;
	play.position += ms / 1000 / sliceSeconds(s, slicer);
	if (play.position >= play.to) slicer.play = null;
}

/**
 * Done: slice i goes to key i from F3 (the same sample, its start and end at the slice), every
 * slice in the mute group so they choke each other (manual: slicing "layout").
 */
export function applySlices(s: SimState, slicer: SlicerState): number {
	const src = sliceSource(s, slicer);
	if (!src) return 0;
	const t = s.tracks[s.track];
	const st = s.areas.sample.tracks[s.track];
	const source = { ...t.drumKeys[slicer.key] };
	const list = slices(s, slicer).slice(0, MAX_SLICES);
	const toPoint = (f: number) =>
		Math.round(((src.from + f * (src.to - src.from)) / src.file.seconds) * 99);
	list.forEach((slice, i) => {
		st.keys[i] = { ...src.file };
		t.drumKeys[i] = {
			...source,
			start: toPoint(slice.start),
			end: Math.max(toPoint(slice.start), toPoint(slice.end)),
			playMode: 'mute group'
		};
	});
	return list.length;
}
