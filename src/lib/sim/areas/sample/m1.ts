/**
 * The M1 page of sampler tracks (the core's drum page, drawn as the device draws it by
 * `screen/pages/drum.ts`; docs/research/59-screen-profiling.md §2.5) and its encoders, for the
 * three sampler engines:
 *
 * - drum sampler (manual: sampler/drum-key-settings): tune, start, end, play mode of the selected
 *   key; shift: direction, pan, fade, gain. Keys selected with key + M4 change together.
 * - synth sampler (manual: sampler/synth-sampler): sample start, loop start, loop end, sample end
 *   (push to turn finer); shift: direction, tune, loop crossfade, gain; shift + click E3 steps the
 *   loop type. The top row shows the whole sample small.
 * - multisampler (manual: sampler/multisampler): the synth sampler's controls on the zone of the
 *   selected key, with the keyboard on top lighting that zone.
 */
import type { DrumFrame } from '../../screen/frame';
import {
	DRUM_PLAY_MODES,
	SAMPLER_TUNE_RANGE,
	clamp,
	keyName,
	type DrumKey,
	type SimState
} from '../../params';
import type { SamplerView } from './frames';
import { keyNote } from './record';
import { LOOP_TYPES, defaultRegion, type Region, type SampleFile, type Zone } from './state';
import { wave, type Wave } from './wave';

/**
 * Columns of an M1 lane: one per pixel of the 469 px the device draws a sample across (its wave is
 * one-pixel columns; research 59 §2.5).
 */
export const LANE_COLUMNS = 469;

/**
 * How far tune reaches, semitones either way. The device went to −16.10 on a drum key (b1-2477) and
 * −12.20 on the synth sampler (b1-2680); the drum sampler stores a transpose of −48…+48 semitones
 * (docs/research/30-presets-samples.md §2.7). The same reach for the synth sampler and the
 * multisampler is ours.
 */
export const TUNE_RANGE = SAMPLER_TUNE_RANGE;

/**
 * Tune as the M1 page shows it, in semitones to hundredths, always signed ("+0.00", "–0.10",
 * "–16.10"; the device writes zero with a plus, b1-2440).
 */
export function tuneText(semitones: number): string {
	const v = Math.round(semitones * 100) / 100;
	return `${v < 0 ? '–' : '+'}${Math.abs(v).toFixed(2)}`;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** A MIDI note's name with its octave, C4 = 60 ("G#3"). */
export function noteName(note: number): string {
	const n = Math.round(note);
	return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** A MIDI note's name without the octave, as the root badge shows it ("G"). */
export function noteLetter(note: number): string {
	return NOTE_NAMES[((Math.round(note) % 12) + 12) % 12];
}

/** The two lanes of a sample (the right one repeats a mono sample's left). */
export function laneWaves(file: SampleFile): readonly [Wave, Wave] {
	const left = wave(file, 0, file.seconds, LANE_COLUMNS, 0);
	const stereo = (file.peaks?.channels.length ?? 1) > 1;
	return [left, stereo ? wave(file, 0, file.seconds, LANE_COLUMNS, 1) : left];
}

/** The zone of `note` and the notes it covers (a zone runs down to the previous zone's top). */
export function zoneOf(
	zones: readonly Zone[],
	note: number
): { zone: Zone; lo: number; hi: number } | null {
	let lo = 0;
	for (const zone of zones) {
		if (note >= lo && note <= zone.note) return { zone, lo, hi: zone.note };
		lo = zone.note + 1;
	}
	return null;
}

/** The core drum frame's fields for a region (synth sampler, multisampler). */
function regionFrame(
	s: SimState,
	key: string,
	region: Region,
	file: SampleFile | null,
	view: Omit<SamplerView, 'waves' | 'loop'>
): DrumFrame {
	return {
		page: 'drum',
		key,
		tune: tuneText(region.tune),
		start: region.start,
		end: region.end,
		playMode: '',
		shift: s.shift,
		reverse: region.reverse,
		pan: 0,
		fade: region.crossfade / 99,
		gain: (region.gain + 30) / 50,
		seed: s.track * 24 + s.tracks[s.track].drumKey + 1,
		sampler: {
			...view,
			waves: file ? laneWaves(file) : null,
			loop: {
				start: region.loopStart,
				end: region.loopEnd,
				type: region.loop,
				crossfade: region.crossfade / 99
			}
		}
	};
}

/** The M1 page of the active track, which runs a sampler engine. */
export function samplerPage(s: SimState): DrumFrame {
	const t = s.tracks[s.track];
	const area = s.areas.sample;
	const st = area.tracks[s.track];
	if (t.engine === 'sampler') {
		const { file, root, region } = st.synth;
		return regionFrame(s, noteName(root), region, file, {
			engine: 'sampler',
			root: noteLetter(root),
			zone: null
		});
	}
	if (t.engine === 'multisampler') {
		const note = keyNote(area, t.drumKey);
		const found = zoneOf(st.zones, note);
		return regionFrame(
			s,
			noteName(note),
			found?.zone.region ?? defaultRegion(),
			found?.zone.file ?? null,
			{
				engine: 'multisampler',
				root: noteLetter(found?.zone.note ?? note),
				zone: found ? { lo: found.lo, hi: found.hi } : null
			}
		);
	}
	const k = t.drumKeys[t.drumKey];
	const file = st.keys[t.drumKey];
	const others = st.selection.filter((i) => i !== t.drumKey).length;
	return {
		page: 'drum',
		key: others > 0 ? `${keyName(t.drumKey)} +${others}` : keyName(t.drumKey),
		tune: tuneText(k.tune),
		start: k.start / 99,
		end: k.end / 99,
		playMode: k.playMode,
		shift: s.shift,
		reverse: k.reverse,
		pan: k.pan / 100,
		fade: k.fade / 99,
		gain: (k.gain + 30) / 50,
		seed: s.track * 24 + t.drumKey + 1,
		sampler: {
			engine: 'drum',
			waves: file ? laneWaves(file) : null,
			loop: null,
			root: '',
			zone: null
		}
	};
}

/**
 * One drum key's encoders (the drum sampler's M1 page; manual: drum-key-settings). Start and end
 * move a step of their 0–99 scale a detent, a tenth of a step pushed in (manual: "push in for
 * finer steps"), like the synth sampler's points.
 */
function turnDrumKey(k: DrumKey, e: number, delta: number, fine: boolean, shift: boolean): void {
	const step = (v: number, min: number, max: number, by = 1) => clamp(v + delta * by, min, max);
	const tenths = (v: number) => Math.round(v * 10) / 10;
	if (shift) {
		if (e === 0) k.reverse = delta < 0;
		else if (e === 1) k.pan = step(k.pan, -100, 100, fine ? 1 : 2);
		else if (e === 2) k.fade = step(k.fade, 0, 99);
		else k.gain = step(k.gain, -30, 20);
	} else if (e === 0) {
		k.tune = Math.round(step(k.tune, -TUNE_RANGE, TUNE_RANGE, fine ? 0.01 : 0.1) * 100) / 100;
	} else if (e === 1) k.start = tenths(step(k.start, 0, k.end, fine ? 0.1 : 1));
	else if (e === 2) k.end = tenths(step(k.end, k.start, 99, fine ? 0.1 : 1));
	else {
		const at = DRUM_PLAY_MODES.indexOf(k.playMode);
		k.playMode = DRUM_PLAY_MODES[clamp(at + delta, 0, DRUM_PLAY_MODES.length - 1)];
	}
}

/** Rounds a 0–1 point to thousandths (the fine step). */
const point = (v: number) => Math.round(clamp(v, 0, 1) * 1000) / 1000;

/**
 * A region's encoders (synth sampler, multisampler). The four points keep their order: start ≤
 * loop start ≤ loop end ≤ end; loop start at the end means no loop (manual: synth-sampler).
 */
export function turnRegion(
	r: Region,
	e: number,
	delta: number,
	fine: boolean,
	shift: boolean
): void {
	const by = (fine ? 0.001 : 0.01) * delta;
	if (shift) {
		if (e === 0) r.reverse = delta < 0;
		else if (e === 1)
			r.tune =
				Math.round(clamp(r.tune + delta * (fine ? 0.01 : 0.1), -TUNE_RANGE, TUNE_RANGE) * 100) /
				100;
		// the crossfade tops out at 75 % (the owner's unit, research 60 §5)
		else if (e === 2) r.crossfade = clamp(r.crossfade + delta, 0, 75);
		else r.gain = clamp(r.gain + delta, -30, 20);
		return;
	}
	if (e === 0) {
		r.start = point(Math.min(r.start + by, r.end - 0.001));
		r.loopStart = Math.max(r.loopStart, r.start);
		r.loopEnd = Math.max(r.loopEnd, r.loopStart);
	} else if (e === 1) r.loopStart = point(clamp(r.loopStart + by, r.start, r.end));
	else if (e === 2) r.loopEnd = point(clamp(r.loopEnd + by, r.start, r.end));
	else {
		r.end = point(Math.max(r.end + by, r.start + 0.001));
		r.loopEnd = Math.min(r.loopEnd, r.end);
		r.loopStart = Math.min(r.loopStart, r.end);
	}
	if (r.loopEnd < r.loopStart) {
		if (e === 2) r.loopStart = r.loopEnd;
		else r.loopEnd = r.loopStart;
	}
}

/** The region the M1 page edits now (synth sampler, multisampler zone), or null. */
export function activeRegion(s: SimState): Region | null {
	const t = s.tracks[s.track];
	const area = s.areas.sample;
	const st = area.tracks[s.track];
	if (t.engine === 'sampler') return st.synth.region;
	if (t.engine === 'multisampler')
		return zoneOf(st.zones, keyNote(area, t.drumKey))?.zone.region ?? null;
	return null;
}

/** An encoder turn on a sampler track's M1 page. */
export function turnSamplerPage(s: SimState, e: number, delta: number, fine: boolean): void {
	const t = s.tracks[s.track];
	if (t.engine === 'drum') {
		const st = s.areas.sample.tracks[s.track];
		const keys = new Set([t.drumKey, ...st.selection]);
		for (const i of keys) turnDrumKey(t.drumKeys[i], e, delta, fine, s.shift);
		return;
	}
	const region = activeRegion(s);
	if (region) turnRegion(region, e, delta, fine, s.shift);
}

/** Shift + click E3: the next loop type (loop forever, loop until release, loop off). */
export function nextLoopType(s: SimState): boolean {
	const region = activeRegion(s);
	if (!region) return false;
	region.loop = LOOP_TYPES[(LOOP_TYPES.indexOf(region.loop) + 1) % LOOP_TYPES.length];
	return true;
}
