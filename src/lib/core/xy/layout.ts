// Ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill) xy/image_writer.py
// (pattern_starts_from_image, _song_slot_offset and the offset constants), with the corrections of
// docs/research/10-xy-format.md: three performance lanes follow every pattern's notes (A.1), and the
// song footer is 14 variable-length slots ending at the end of the image (A.7).
//
// The image is `global header + 16 tracks' pattern structs + song footer` (§3.1). Offsets inside a
// pattern are relative to its base: a leader's first byte, or one before a clone's first byte, since
// clones lack the leader's pattern-count byte and every other offset is shared (§3.4).

import { trackBase } from './container';
import { XyFormatError } from './errors';

/** Tracks in a project: T1–T8 instruments, T9–T16 auxiliary. */
export const TRACKS = 16;
/** Patterns a track can hold (OS 1.1.15 and later; 9 before). */
export const MAX_PATTERNS = 16;
/** Notes a pattern can hold. */
export const MAX_NOTES = 120;
/** Steps a pattern can play (four bars of 16). */
export const STEPS = 64;
/** Scene slots in the image (the device offers 99 scenes). */
export const SCENE_SLOTS = 100;
/** Scenes the device offers. */
export const SCENES = 99;
/** Songs in a project. */
export const SONGS = 14;
/** Scenes one song can chain. */
export const MAX_SONG_LENGTH = 96;
/** Ticks per step (a sixteenth): the sequencer runs at 1920 per quarter note. */
export const TICKS_PER_STEP = 480;

/** Offsets of the project settings in the image (families 0x13 and 0x14; §3.2). */
export const GLOBAL = {
	/** u16, tenths of a BPM. */
	tempo: 0x00,
	/** i8. */
	grooveAmount: 0x02,
	grooveType: 0x03,
	/** Metronome click volume. */
	click: 0x04,
	activeScene: 0x06,
	/** 0x10 when no song was ever chosen. */
	activeSong: 0x07,
	sceneLength: 0x08,
	/** i8. */
	transpose: 0x1b,
	timeSignature: 0x1c,
	/** i8 × 16, T1–T16. */
	octaves: 0x3d,
	/** u8 × 8, T1–T8. */
	voices: 0x4d,
	/** u8 × 16, T1–T16; 0xFF = off. */
	midiChannels: 0x55,
	/** Scene slot 0; slot k at `scenes + 33 k`. */
	scenes: 0x95
} as const;

/** Bytes per scene slot: 16 pattern choices, 16 mutes, a flag (§3.3). */
export const SCENE_SIZE = 33;

/** Offsets inside a pattern struct, from its base (§3.4). */
export const PATTERN = {
	/** The track's pattern count (the leader's byte only). */
	count: 0x0000,
	/** Steps that play, 1–64. */
	steps: 0x0001,
	/** u16: the bar menu's note length for step entry, in ticks. */
	noteLength: 0x0002,
	scale: 0x0006,
	quantize: 0x0007,
	/** i8: this track's groove. */
	groove: 0x0008,
	/** u16: 8 until the pattern is edited, then 0. */
	pristine: 0x0011,
	engine: 0x0014,
	/** u16 × 42: the last value locked per column (a cache the screen uses). */
	lockCurrent: 0x024c,
	/** u16 × 42 per step, 64 steps. */
	lockValues: 0x02a0,
	/** u64 per step: which columns are locked. */
	lockMasks: 0x2c4e,
	/** u64: the OR of the 64 step masks (A.2). */
	lockUnion: 0x304e,
	/** Bar menu E4: smoothing between locks. */
	smoothing: 0x3056,
	/** 16 bytes per step: u16 enabled bits, then a value per component. */
	components: 0x3057,
	/** Q31 words of the sound block (§3.6). */
	pan: 0x38f7,
	volume: 0x38fb,
	/** 48 bytes, latin-1, NUL-padded. */
	presetPath: 0x453f,
	noteCount: 0x456f,
	/** 12 bytes per note, then the performance lanes, then the tail. */
	notes: 0x4570
} as const;

/**
 * Offsets of a pattern's sound, from its base (§3.6): four bytes for the LFO and filter types and
 * switches, then Q31 words read as q15 (the word's top 16 bits), xy-format's `patch_sound_state`
 * lanes. Runs are counted in words.
 */
export const SOUND = {
	/** The M4 type byte. */
	lfoType: 0x001c,
	/** M4 on (non-zero) or off. */
	lfoOn: 0x0020,
	/** The M3 filter type byte. */
	filterType: 0x0021,
	/** M3 on (non-zero) or off. */
	filterOn: 0x0025,
	/** Eight words: M1's four encoders, then four the engine keeps. */
	params: 0x3857,
	/** Four words: attack, decay, sustain, release. */
	amp: 0x3877,
	/** poly 0x15555555, mono 0x3FFFFFFF, legato above. */
	playMode: 0x3887,
	portamento: 0x388b,
	bend: 0x388f,
	/** The preset volume (shift + M2), not the mixer's level. */
	volume: 0x3893,
	/** Four words: cutoff, resonance, envelope amount, key tracking. */
	filter: 0x3897,
	/** Four words: aux out, tape, FX I, FX II. */
	sends: 0x38a7,
	/** Eight words: M4's E1–E4, three unused, then shift + E2. */
	lfo: 0x38b7,
	/** Four words: attack, decay, sustain, release. */
	filterEnv: 0x38d7,
	/** Target and amount words of each: mod wheel, aftertouch, pitch bend. */
	modwheel: 0x38ff,
	aftertouch: 0x3907,
	pitchbend: 0x390f,
	velocitySensitivity: 0x3917,
	portamentoType: 0x391b,
	tuningScale: 0x391f,
	width: 0x3923,
	tuningRoot: 0x392b,
	highpass: 0x392f,
	velocityTarget: 0x3933,
	velocityAmount: 0x3937
} as const;

/** A leader struct's size with no notes and empty lanes. */
export const PATTERN_SIZE = 17876;
/** Bytes per note record. */
export const NOTE_SIZE = 12;
/** The fixed bytes after the performance lanes (engine-specific; kept as they are). */
export const TAIL_SIZE = 97;
/** Bytes per step row of the lock table: 42 u16 columns. */
export const LOCK_ROW_SIZE = 84;
/** Columns of the lock table. */
export const LOCK_COLUMNS = 42;
/** Bytes per step of the step components. */
export const COMPONENT_ROW_SIZE = 16;
/** Bytes of the preset path. */
export const PRESET_PATH_SIZE = 48;
/** Performance lanes after the notes: pitch bend, mod wheel, aftertouch (A.1). */
export const LANES = 3;

/** Where one pattern struct sits in the image. */
export interface PatternSpan {
	/** Pattern-relative offsets start here: the leader's first byte, or one before a clone's. */
	readonly base: number;
	/** The first byte after the struct. */
	readonly end: number;
	readonly noteCount: number;
	/** Where the performance lanes start (just after the notes) and the bytes they take. */
	readonly lanes: number;
	readonly lanesSize: number;
}

/** Where one song slot sits in the footer. */
export interface SongSpan {
	readonly offset: number;
	readonly size: number;
}

/** The structure of a decoded image. */
export interface XyLayout {
	/** Where Track 1 starts (the global header's size). */
	readonly trackBase: number;
	/** T1–T16, each its patterns in order (pattern 1 is the leader). */
	readonly tracks: readonly (readonly PatternSpan[])[];
	/** Where the song footer starts. */
	readonly footer: number;
	/** The 14 song slots. */
	readonly songs: readonly SongSpan[];
}

/**
 * Bytes the three performance lanes at `at` take: each is a count byte, and when the count is not
 * 0, two header words and a (tick, value) pair per further keyframe: `1 + 4 × count` bytes.
 * @throws XyFormatError when a lane runs past `end`.
 */
export function lanesSize(image: Uint8Array, at: number, end = image.length): number {
	let size = 0;
	for (let lane = 0; lane < LANES; lane++) {
		if (at + size >= end) throw new XyFormatError(`performance lanes run past offset ${end}`);
		const count = image[at + size];
		size += count === 0 ? 1 : 1 + 4 * count;
	}
	if (at + size > end) throw new XyFormatError(`performance lanes run past offset ${end}`);
	return size;
}

/**
 * Walks the image: every pattern struct of the 16 tracks, then the 14 song slots, which must end
 * exactly at the end of the image. This is the only validation the format offers (§2.3), so a walk
 * that succeeds is a project whose counts and sizes all agree.
 * @throws XyFormatError when a count is out of range or a struct or slot does not fit.
 */
export function walkProject(header: Uint8Array, image: Uint8Array): XyLayout {
	const base = trackBase(header);
	const tracks: PatternSpan[][] = [];
	let pos = base;
	for (let t = 0; t < TRACKS; t++) {
		if (pos >= image.length) throw new XyFormatError(`T${t + 1} starts past the end of the image`);
		const count = image[pos];
		if (count < 1 || count > MAX_PATTERNS) {
			throw new XyFormatError(`T${t + 1} has ${count} patterns (1–${MAX_PATTERNS} expected)`);
		}
		const spans: PatternSpan[] = [];
		for (let p = 0; p < count; p++) {
			const start = p === 0 ? pos : pos - 1;
			const where = `T${t + 1} pattern ${p + 1}`;
			if (start + PATTERN_SIZE > image.length) {
				throw new XyFormatError(`${where} runs past the end of the image`);
			}
			const noteCount = image[start + PATTERN.noteCount];
			if (noteCount > MAX_NOTES) {
				throw new XyFormatError(`${where} holds ${noteCount} notes (at most ${MAX_NOTES})`);
			}
			const lanes = start + PATTERN.notes + noteCount * NOTE_SIZE;
			const size = lanesSize(image, lanes);
			const end = lanes + size + TAIL_SIZE;
			if (end > image.length) throw new XyFormatError(`${where} runs past the end of the image`);
			spans.push({ base: start, end, noteCount, lanes, lanesSize: size });
			pos = end;
		}
		tracks.push(spans);
	}
	const songs: SongSpan[] = [];
	let at = pos;
	for (let s = 0; s < SONGS; s++) {
		if (at >= image.length)
			throw new XyFormatError(`song ${s + 1} starts past the end of the image`);
		const size = image[at] + 3;
		if (at + size > image.length) {
			throw new XyFormatError(`song ${s + 1} runs past the end of the image`);
		}
		songs.push({ offset: at, size });
		at += size;
	}
	if (at !== image.length) {
		throw new XyFormatError(
			`the song footer ends at ${at}, not at the end of the image (${image.length})`
		);
	}
	return { trackBase: base, tracks, footer: pos, songs };
}

/**
 * The keyframe counts of the three performance lanes (pitch bend, mod wheel, aftertouch) in a
 * pattern's lane bytes; 0 is an empty lane.
 */
export function laneCounts(lanes: Uint8Array): [number, number, number] {
	const counts: number[] = [];
	let size = 0;
	for (let lane = 0; lane < LANES; lane++) {
		const count = lanes[size] ?? 0;
		counts.push(count);
		size += count === 0 ? 1 : 1 + 4 * count;
	}
	return counts as [number, number, number];
}
