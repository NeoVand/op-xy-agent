// Portions derived from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill): the readers of
// xy/project_config_inspection.py, xy/bar_menu_inspection.py, xy/scene_volume_inspection.py,
// xy/song_footer_inspection.py and xy/patch_sound_state.py, and the note, step-component and p-lock
// layouts of xy/image_writer.py, rebased on the lane-aware walk (docs/research/10-xy-format.md A.1).
//
// Bytes → model: `readProject` decodes a `.xy` file into what `model.ts` describes.

import { hex2, i8, i32, u16, u32 } from './bytes';
import { MAPPED_FAMILIES, decodeXy } from './container';
import { XyFormatError } from './errors';
import {
	COMPONENT_ROW_SIZE,
	GLOBAL,
	LOCK_COLUMNS,
	LOCK_ROW_SIZE,
	NOTE_SIZE,
	PATTERN,
	PRESET_PATH_SIZE,
	SCENE_SIZE,
	SCENE_SLOTS,
	SOUND,
	STEPS,
	TRACKS,
	walkProject,
	type PatternSpan,
	type XyLayout
} from './layout';
import {
	XY_STEP_COMPONENTS,
	lockBit,
	type XyLock,
	type XyNote,
	type XyPattern,
	type XyProject,
	type XyScene,
	type XySettings,
	type XySong,
	type XySoundState,
	type XyStepComponent
} from './model';

/** The value OS 1.1.4 stores in the active-song byte while no song was ever chosen. */
export const NO_SONG_CHOSEN = 0x10;

/**
 * Decodes a `.xy` file: settings, scenes, every track's patterns and the songs.
 * @throws XyFormatError when the file does not walk (bad magic, RLE, counts or sizes) or its layout
 * family's global header is not mapped.
 */
export function readProject(file: Uint8Array): XyProject {
	const { header, image } = decodeXy(file);
	const layout = walkProject(header, image);
	if (!MAPPED_FAMILIES.includes(header[5])) {
		throw new XyFormatError(
			`layout family ${hex2(header[5])}: only its track base is known, not its settings or scenes`
		);
	}
	return {
		header,
		settings: readSettings(image),
		scenes: readScenes(image),
		tracks: layout.tracks.map((spans) => ({
			patterns: spans.map((span) => readPattern(image, span))
		})),
		songs: readSongs(image, layout)
	};
}

/** The project settings of an image (§3.2). */
export function readSettings(image: Uint8Array): XySettings {
	const activeSong = image[GLOBAL.activeSong];
	return {
		tempo: u16(image, GLOBAL.tempo) / 10,
		grooveAmount: i8(image, GLOBAL.grooveAmount),
		grooveType: image[GLOBAL.grooveType],
		clickVolume: image[GLOBAL.click],
		activeScene: image[GLOBAL.activeScene],
		activeSong: activeSong === NO_SONG_CHOSEN ? 0 : activeSong,
		sceneLength: image[GLOBAL.sceneLength],
		transpose: i8(image, GLOBAL.transpose),
		timeSignature: image[GLOBAL.timeSignature],
		octaves: Array.from({ length: TRACKS }, (_, t) => i8(image, GLOBAL.octaves + t)),
		voices: Array.from({ length: 8 }, (_, t) => image[GLOBAL.voices + t]),
		midiChannels: Array.from({ length: TRACKS }, (_, t) => {
			const raw = image[GLOBAL.midiChannels + t];
			return raw === 0xff ? null : raw + 1;
		})
	};
}

/** The 100 scene slots of an image (§3.3). */
export function readScenes(image: Uint8Array): XyScene[] {
	return Array.from({ length: SCENE_SLOTS }, (_, slot) => {
		const at = GLOBAL.scenes + slot * SCENE_SIZE;
		return {
			patterns: Array.from(image.subarray(at, at + TRACKS)),
			mutes: Array.from(image.subarray(at + TRACKS, at + 2 * TRACKS), (b) => b !== 0),
			used: image[at + 2 * TRACKS] !== 0
		};
	});
}

/** The 14 songs of an image whose footer `layout` found (§3.10). */
export function readSongs(image: Uint8Array, layout: XyLayout): XySong[] {
	return layout.songs.map(({ offset }) => {
		const count = image[offset];
		return {
			scenes: Array.from(image.subarray(offset + 1, offset + 1 + count)),
			loop: image[offset + 1 + count] === 0
		};
	});
}

/** The pattern whose struct `span` locates (§3.4, §3.7–§3.9). */
export function readPattern(image: Uint8Array, span: PatternSpan): XyPattern {
	const base = span.base;
	return {
		steps: image[base + PATTERN.steps],
		noteLength: u16(image, base + PATTERN.noteLength),
		scale: image[base + PATTERN.scale],
		quantize: image[base + PATTERN.quantize],
		groove: i8(image, base + PATTERN.groove),
		smoothing: image[base + PATTERN.smoothing],
		pristine: u16(image, base + PATTERN.pristine),
		notes: readNotes(image, base + PATTERN.notes, span.noteCount),
		components: readComponents(image, base),
		locks: readLocks(image, base),
		lanes: image.slice(span.lanes, span.lanes + span.lanesSize),
		sound: {
			engine: image[base + PATTERN.engine],
			preset: latin1(image, base + PATTERN.presetPath, PRESET_PATH_SIZE),
			volume: u32(image, base + PATTERN.volume),
			pan: u32(image, base + PATTERN.pan),
			state: readSoundState(image, base)
		}
	};
}

/**
 * The sound settings of the pattern at `base` (§3.6), each word as q15 (xy-format's
 * `patch_sound_state`).
 */
export function readSoundState(image: Uint8Array, base: number): XySoundState {
	const q15 = (offset: number) => u32(image, base + offset) >>> 16;
	const run = (offset: number, words: number) =>
		Array.from({ length: words }, (_, k) => q15(offset + 4 * k));
	return {
		params: run(SOUND.params, 8),
		amp: run(SOUND.amp, 4),
		filterEnv: run(SOUND.filterEnv, 4),
		playMode: u32(image, base + SOUND.playMode),
		portamento: { amount: q15(SOUND.portamento), type: q15(SOUND.portamentoType) },
		bend: q15(SOUND.bend),
		volume: q15(SOUND.volume),
		filter: {
			type: image[base + SOUND.filterType],
			on: image[base + SOUND.filterOn] !== 0,
			params: run(SOUND.filter, 4)
		},
		sends: run(SOUND.sends, 4),
		lfo: {
			type: image[base + SOUND.lfoType],
			on: image[base + SOUND.lfoOn] !== 0,
			params: run(SOUND.lfo, 8)
		},
		velocity: {
			sensitivity: q15(SOUND.velocitySensitivity),
			target: q15(SOUND.velocityTarget),
			amount: q15(SOUND.velocityAmount)
		},
		width: q15(SOUND.width),
		highpass: q15(SOUND.highpass),
		tuning: { scale: q15(SOUND.tuningScale), root: q15(SOUND.tuningRoot) },
		modulation: {
			modwheel: [q15(SOUND.modwheel), q15(SOUND.modwheel + 4)],
			aftertouch: [q15(SOUND.aftertouch), q15(SOUND.aftertouch + 4)],
			pitchbend: [q15(SOUND.pitchbend), q15(SOUND.pitchbend + 4)]
		},
		mix: { level: q15(PATTERN.volume), pan: q15(PATTERN.pan) }
	};
}

function readNotes(image: Uint8Array, at: number, count: number): XyNote[] {
	return Array.from({ length: count }, (_, k) => {
		const o = at + k * NOTE_SIZE;
		return {
			tick: i32(image, o),
			gate: u32(image, o + 4),
			note: image[o + 8],
			velocity: image[o + 9],
			flags: u16(image, o + 10)
		};
	});
}

function readComponents(image: Uint8Array, base: number): XyStepComponent[] {
	const components: XyStepComponent[] = [];
	for (let step = 0; step < STEPS; step++) {
		const row = base + PATTERN.components + step * COMPONENT_ROW_SIZE;
		const mask = u16(image, row);
		if (mask === 0) continue;
		XY_STEP_COMPONENTS.forEach((kind, bit) => {
			if ((mask >> bit) & 1) components.push({ step, kind, value: image[row + 2 + bit] });
		});
	}
	return components;
}

function readLocks(image: Uint8Array, base: number): XyLock[] {
	const locks: XyLock[] = [];
	for (let step = 0; step < STEPS; step++) {
		const mask = base + PATTERN.lockMasks + step * 8;
		const low = u32(image, mask);
		const high = u32(image, mask + 4);
		if (low === 0 && high === 0) continue;
		for (let column = 0; column < LOCK_COLUMNS; column++) {
			const bit = lockBit(column);
			const armed = bit < 32 ? (low >>> bit) & 1 : (high >>> (bit - 32)) & 1;
			if (!armed) continue;
			const cell = base + PATTERN.lockValues + step * LOCK_ROW_SIZE + column * 2;
			locks.push({ step, column, value: u16(image, cell) });
		}
	}
	return locks;
}

/** A NUL-padded latin-1 string field. */
function latin1(image: Uint8Array, at: number, size: number): string {
	const field = image.subarray(at, at + size);
	const end = field.indexOf(0);
	return String.fromCharCode(...(end < 0 ? field : field.subarray(0, end)));
}
