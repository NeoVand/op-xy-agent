/**
 * What the preset maker lets you change on one sound, each value the `patch.json` region field it
 * writes, in the device's ranges (docs/research/30-presets-samples.md §2.6–2.7):
 *
 * | edit              | field                                  | range / unit                       |
 * | ----------------- | -------------------------------------- | ---------------------------------- |
 * | `start`, `end`    | `sample.start`, `sample.end`           | frames, 0 ≤ start < end ≤ frames   |
 * | `gain`            | `gain`                                 | dB, −30…+20                        |
 * | `pan`             | `pan` (drum)                           | −100…+100                          |
 * | `transpose`       | `transpose` (drum)                     | semitones, −48…+48                 |
 * | `tune`            | `tune` (sampler, multisampler)         | cents, −99…+99                     |
 * | `reverse`         | `reverse`                              | plays start → end backwards        |
 * | `playmode`        | `playmode` (drum)                      | gate (key), oneshot, group, loop   |
 * | `loop`            | `loop.start/end/crossfade/onrelease/enabled` | frames; forever, release, off |
 *
 * Fades are not a field we trust: the drum `fade.in`/`fade.out` units are unverified (note 30
 * §2.7), so a fade is written into the WAV itself, at the region's own start and end. Positions are
 * frames of the sound's own audio.
 */
import { findLoop } from './audio';
import type { DrumPlayMode, LoopMode, PresetKind } from './patch';
import type { PcmAudio } from './wav';

/** A sampler region's loop: how it loops and where, in frames. */
export interface LoopEdit {
	readonly mode: LoopMode;
	readonly start: number;
	readonly end: number;
	/** Frames of the loop's end crossfaded into what precedes its start. */
	readonly crossfade: number;
}

/** Everything the preset maker changes on one sound (see the table above). */
export interface SoundEdit {
	readonly start: number;
	readonly end: number;
	/** Frames faded in from `start` (written into the WAV). */
	readonly fadeIn: number;
	/** Frames faded out to `end` (written into the WAV). */
	readonly fadeOut: number;
	readonly gain: number;
	readonly pan: number;
	readonly transpose: number;
	readonly tune: number;
	readonly reverse: boolean;
	readonly playmode: DrumPlayMode;
	readonly loop: LoopEdit;
}

/** The device's ranges for the number fields (note 30 §2.6–2.7). */
export const EDIT_RANGES = {
	gain: { min: -30, max: 20 },
	pan: { min: -100, max: 100 },
	transpose: { min: -48, max: 48 },
	tune: { min: -99, max: 99 }
} as const;

/** Frames per second of every preset sample. */
const RATE = 44100;
/** The shortest region and loop the editor keeps (frames): about 2 ms. */
export const MIN_SPAN = 88;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const whole = (v: number, lo: number, hi: number) => Math.round(clamp(v, lo, hi));

/**
 * The first and last frame louder than −60 dBFS, or than 50 dB under the peak when that is
 * higher (a microphone's hiss is not the sound), plus a 2 ms lead-in; the whole sound when it is
 * all quieter. Where the editor first puts `start` and `end`, so silence is trimmed without
 * cutting anything off.
 */
export function audibleSpan(audio: PcmAudio): { start: number; end: number } {
	const frames = audio.channels[0]?.length ?? 0;
	let peak = 0;
	for (const c of audio.channels)
		for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
	const threshold = Math.max(10 ** (-60 / 20), peak * 10 ** (-50 / 20));
	const loud = (i: number) => audio.channels.some((c) => Math.abs(c[i]) > threshold);
	let first = 0;
	while (first < frames && !loud(first)) first++;
	if (first >= frames) return { start: 0, end: frames };
	let last = frames - 1;
	while (last > first && !loud(last)) last--;
	const lead = Math.round(0.002 * audio.sampleRate);
	return { start: Math.max(0, first - lead), end: Math.min(frames, last + 1) };
}

/**
 * A new sound's edit: trimmed to what is audible, level and pitch untouched, one-shot, and for the
 * samplers a loop found in the audio (else the device's own 20 % / 80 % after sampling).
 */
export function defaultEdit(
	audio: PcmAudio,
	kind: PresetKind,
	options: { trim?: boolean } = {}
): SoundEdit {
	const frames = audio.channels[0]?.length ?? 0;
	const span = options.trim === false ? { start: 0, end: frames } : audibleSpan(audio);
	const found = kind === 'drum' ? null : findLoop(audio);
	const loop: LoopEdit = found
		? { mode: 'forever', ...found }
		: {
				mode: 'off',
				start: Math.floor(0.2 * frames),
				end: Math.floor(0.8 * frames),
				crossfade: 0
			};
	return clampEdit(
		{
			...span,
			fadeIn: 0,
			fadeOut: Math.min(Math.round(0.003 * audio.sampleRate), frames),
			gain: 0,
			pan: 0,
			transpose: 0,
			tune: 0,
			reverse: false,
			playmode: 'oneshot',
			loop
		},
		frames
	);
}

/**
 * An edit made valid for a sound of `frames` frames: whole numbers in the device's ranges,
 * 0 ≤ start < end ≤ frames, fades inside the region, start ≤ loop.start < loop.end ≤ end and a
 * crossfade no longer than the loop or the region before it (note 30 §2.7).
 */
export function clampEdit(edit: SoundEdit, frames: number): SoundEdit {
	const span = Math.min(MIN_SPAN, Math.max(1, frames));
	const start = whole(edit.start, 0, Math.max(0, frames - span));
	const end = whole(edit.end, start + span, Math.max(start + span, frames));
	const length = end - start;
	const fadeIn = whole(edit.fadeIn, 0, length);
	const fadeOut = whole(edit.fadeOut, 0, length - fadeIn);
	const loopStart = whole(edit.loop.start, start, Math.max(start, end - span));
	const loopEnd = whole(edit.loop.end, loopStart + Math.min(span, end - loopStart), end);
	// the crossfade reads the frames before the loop's start, and only the region's are written
	const crossfade = whole(edit.loop.crossfade, 0, Math.min(loopEnd - loopStart, loopStart - start));
	return {
		start,
		end,
		fadeIn,
		fadeOut,
		gain: whole(edit.gain, EDIT_RANGES.gain.min, EDIT_RANGES.gain.max),
		pan: whole(edit.pan, EDIT_RANGES.pan.min, EDIT_RANGES.pan.max),
		transpose: whole(edit.transpose, EDIT_RANGES.transpose.min, EDIT_RANGES.transpose.max),
		tune: whole(edit.tune, EDIT_RANGES.tune.min, EDIT_RANGES.tune.max),
		reverse: Boolean(edit.reverse),
		playmode: edit.playmode,
		loop: { mode: edit.loop.mode, start: loopStart, end: loopEnd, crossfade }
	};
}

/** Options for {@link renderEdit}. */
export interface RenderOptions {
	/** Keep only start…end (default true): smaller files, `sample.start` 0 in the patch. */
	readonly crop?: boolean;
	/** Also bake what the device does at play time (reverse, the loop's crossfade): for previews. */
	readonly preview?: boolean;
}

/** A sound as written (or heard): its audio and the region's frames within it. */
export interface RenderedSound {
	readonly audio: PcmAudio;
	readonly start: number;
	readonly end: number;
	readonly loop: LoopEdit;
}

/**
 * The sound with its edit applied to the audio: the fades written in, cropped to its region unless
 * told not to, and for a preview also reversed and its loop crossfaded, as the device plays it.
 * Positions come back in frames of the returned audio.
 */
export function renderEdit(
	audio: PcmAudio,
	edit: SoundEdit,
	options: RenderOptions = {}
): RenderedSound {
	const frames = audio.channels[0]?.length ?? 0;
	const e = clampEdit(edit, frames);
	const crop = options.crop !== false;
	const offset = crop ? e.start : 0;
	const channels = audio.channels.map((c) => (crop ? c.slice(e.start, e.end) : c.slice()));
	const start = e.start - offset;
	const end = e.end - offset;
	for (const c of channels) {
		for (let i = 0; i < e.fadeIn; i++) c[start + i] *= i / e.fadeIn;
		for (let i = 0; i < e.fadeOut; i++) c[end - 1 - i] *= i / e.fadeOut;
	}
	let loop: LoopEdit = { ...e.loop, start: e.loop.start - offset, end: e.loop.end - offset };
	if (options.preview) {
		// the crossfade: the loop's last frames blend into the frames before its start, so the jump
		// from its end back to its start is seamless
		const xf = loop.mode === 'off' ? 0 : loop.crossfade;
		for (const c of channels) {
			for (let i = 0; i < xf; i++) {
				const t = i / xf;
				const at = loop.end - xf + i;
				c[at] = c[at] * (1 - t) + c[loop.start - xf + i] * t;
			}
		}
		if (e.reverse) {
			for (const c of channels) c.subarray(start, end).reverse();
			loop = {
				...loop,
				start: start + (end - loop.end),
				end: start + (end - loop.start)
			};
		}
	}
	return { audio: { sampleRate: audio.sampleRate, channels, root: audio.root }, start, end, loop };
}

/** Seconds of `frames` at the preset rate. */
export const seconds = (frames: number, rate = RATE): number => frames / rate;
