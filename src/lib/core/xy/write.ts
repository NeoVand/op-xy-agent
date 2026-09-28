// Ported from kmorrill/xy-format (MIT, Copyright (c) 2026 Kevin Morrill) xy/image_writer.py: the
// ImageProject setters, add_note, set_step_component, set_plock with its carry, set_song_chain and
// build_arrangement. Corrected as docs/research/10-xy-format.md says: the union mask is the OR of the
// step masks (A.2), the performance lanes travel with the notes (A.1), a song slot is rewritten in
// place whatever its length (A.7), and notes are written in tick order (§3.7).
//
// Model → bytes the template way (§4.3): start from a template's image, write only what the model
// changes and keep every other byte, above all the ~10 KB of sound state per pattern that nobody has
// decoded. A pattern the template lacks starts as the track's first pattern there, emptied, which is
// how upstream's build_arrangement makes clones.

import { concat, hex2, sameBytes, setU16, setU32, u16 } from './bytes';
import { MAPPED_FAMILIES, decodeXy, encodeXy } from './container';
import { XyModelError } from './errors';
import {
	COMPONENT_ROW_SIZE,
	GLOBAL,
	LANES,
	LOCK_COLUMNS,
	LOCK_ROW_SIZE,
	MAX_NOTES,
	MAX_PATTERNS,
	MAX_SONG_LENGTH,
	NOTE_SIZE,
	PATTERN,
	SCENES,
	SCENE_SIZE,
	SCENE_SLOTS,
	SONGS,
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
	type XyStepComponent
} from './model';
import { readPattern, readScenes, readSettings, readSongs } from './read';

/** The mute byte the device writes (any value but 0 mutes). */
const MUTED = 2;
/** Tempo limits in BPM: the device's range (CC80 and the tempo page). */
const TEMPO_MIN = 40;
const TEMPO_MAX = 220;

/**
 * Writes `project` over `template` (a `.xy` file, e.g. the blank project a device saved) and
 * returns the new file. Only what differs from the template's own reading is written, so every
 * byte the model does not describe is the template's, and `writeProject(readProject(f), f)` gives
 * back any file the device wrote. The header is the template's; `project.header` and each
 * pattern's `sound` are not written.
 * @throws XyModelError when the model breaks a limit the firmware relies on (it asserts rather than
 * checks): counts, ranges, scene choices past a track's patterns, more than 120 notes…
 * @throws XyFormatError when the template does not walk.
 */
export function writeProject(project: XyProject, template: Uint8Array): Uint8Array {
	const { header, image } = decodeXy(template);
	const layout = walkProject(header, image);
	if (!MAPPED_FAMILIES.includes(header[5])) {
		throw new XyModelError(`templates of layout family ${hex2(header[5])} cannot be written`);
	}
	checkShape(project);
	const counts = project.tracks.map((track) => track.patterns.length);
	const global = image.slice(0, layout.trackBase);
	writeSettings(global, readSettings(image), project.settings);
	writeScenes(global, readScenes(image), project.scenes, counts);
	const parts: Uint8Array[] = [global];
	project.tracks.forEach((track, t) => {
		track.patterns.forEach((pattern, p) => {
			const struct = buildPattern(
				image,
				layout.tracks[t],
				p,
				pattern,
				`T${t + 1} pattern ${p + 1}`
			);
			parts.push(serialize(struct, p === 0 ? track.patterns.length : null));
		});
	});
	parts.push(writeSongs(image, layout, project.songs));
	return encodeXy(header, concat(parts));
}

// ─── checks ─────────────────────────────────────────────────────────────────────────────────────

function check(value: unknown, min: number, max: number, what: string): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new XyModelError(`${what} must be a whole number ${min}–${max}, not ${String(value)}`);
	}
}

function checkShape(project: XyProject): void {
	const { tracks, scenes, songs, settings } = project;
	if (tracks.length !== TRACKS) throw new XyModelError(`a project has ${TRACKS} tracks`);
	tracks.forEach((track, t) => {
		check(track.patterns.length, 1, MAX_PATTERNS, `T${t + 1}'s pattern count`);
	});
	if (scenes.length !== SCENE_SLOTS) throw new XyModelError(`a project has ${SCENE_SLOTS} scenes`);
	scenes.forEach((scene, k) => {
		if (scene.patterns.length !== TRACKS || scene.mutes.length !== TRACKS) {
			throw new XyModelError(`scene ${k + 1} needs a pattern and a mute for each of ${TRACKS}`);
		}
	});
	if (songs.length !== SONGS) throw new XyModelError(`a project has ${SONGS} songs`);
	if (settings.octaves.length !== TRACKS || settings.midiChannels.length !== TRACKS) {
		throw new XyModelError(`octaves and MIDI channels need a value for each of ${TRACKS} tracks`);
	}
	if (settings.voices.length !== 8) throw new XyModelError('voices need a value for T1–T8');
}

// ─── settings and scenes ────────────────────────────────────────────────────────────────────────

/** The settings stored in one byte each. */
type ByteSetting = Exclude<
	{ [K in keyof XySettings]: XySettings[K] extends number ? K : never }[keyof XySettings],
	'tempo'
>;

function writeSettings(global: Uint8Array, was: XySettings, now: XySettings): void {
	if (now.tempo !== was.tempo) {
		const tenths = Math.round(now.tempo * 10);
		if (
			Math.abs(tenths - now.tempo * 10) > 1e-6 ||
			now.tempo < TEMPO_MIN ||
			now.tempo > TEMPO_MAX
		) {
			throw new XyModelError(
				`tempo must be ${TEMPO_MIN}–${TEMPO_MAX} BPM in tenths, not ${String(now.tempo)}`
			);
		}
		setU16(global, GLOBAL.tempo, tenths);
	}
	const byte = (key: ByteSetting, at: number, min: number, max: number, what: string) => {
		if (now[key] === was[key]) return;
		check(now[key], min, max, what);
		global[at] = now[key] & 0xff;
	};
	byte('grooveAmount', GLOBAL.grooveAmount, -127, 127, 'the groove amount');
	byte('grooveType', GLOBAL.grooveType, 0, 10, 'the groove type');
	byte('clickVolume', GLOBAL.click, 0, 255, 'the click volume');
	byte('activeScene', GLOBAL.activeScene, 0, SCENES - 1, 'the active scene');
	byte('activeSong', GLOBAL.activeSong, 0, SONGS - 1, 'the active song');
	byte('sceneLength', GLOBAL.sceneLength, 0, 2, 'the scene length mode');
	byte('transpose', GLOBAL.transpose, -24, 24, 'the project transpose');
	byte('timeSignature', GLOBAL.timeSignature, 0x10, 0x15, 'the time signature byte');
	now.octaves.forEach((octave, t) => {
		if (octave === was.octaves[t]) return;
		check(octave, -128, 127, `T${t + 1}'s octave`);
		global[GLOBAL.octaves + t] = octave & 0xff;
	});
	now.voices.forEach((voices, t) => {
		if (voices === was.voices[t]) return;
		check(voices, 0, 8, `T${t + 1}'s voices`);
		global[GLOBAL.voices + t] = voices;
	});
	now.midiChannels.forEach((channel, t) => {
		if (channel === was.midiChannels[t]) return;
		if (channel !== null) check(channel, 1, 16, `T${t + 1}'s MIDI channel`);
		global[GLOBAL.midiChannels + t] = channel === null ? 0xff : channel - 1;
	});
}

function writeScenes(
	global: Uint8Array,
	was: readonly XyScene[],
	now: readonly XyScene[],
	counts: readonly number[]
): void {
	now.forEach((scene, k) => {
		const at = GLOBAL.scenes + k * SCENE_SIZE;
		scene.patterns.forEach((pattern, t) => {
			const changed = pattern !== was[k].patterns[t];
			// a scene the device plays must name patterns the track has; blank slots are left as found
			if (changed || scene.used) {
				check(pattern, 0, counts[t] - 1, `scene ${k + 1}'s pattern on T${t + 1}`);
			}
			if (changed) global[at + t] = pattern;
		});
		scene.mutes.forEach((muted, t) => {
			if (muted !== was[k].mutes[t]) global[at + TRACKS + t] = muted ? MUTED : 0;
		});
		if (scene.used !== was[k].used) global[at + 2 * TRACKS] = scene.used ? 1 : 0;
	});
}

// ─── songs ──────────────────────────────────────────────────────────────────────────────────────

function writeSongs(image: Uint8Array, layout: XyLayout, now: readonly XySong[]): Uint8Array {
	const was = readSongs(image, layout);
	return concat(
		now.map((song, s) => {
			const slot = layout.songs[s];
			const same =
				song.loop === was[s].loop &&
				song.scenes.length === was[s].scenes.length &&
				song.scenes.every((scene, i) => scene === was[s].scenes[i]);
			if (same) return image.subarray(slot.offset, slot.offset + slot.size);
			check(song.scenes.length, 0, MAX_SONG_LENGTH, `song ${s + 1}'s length`);
			song.scenes.forEach((scene) => check(scene, 0, SCENES - 1, `a scene of song ${s + 1}`));
			return Uint8Array.of(song.scenes.length, ...song.scenes, song.loop ? 0 : 1, 0);
		})
	);
}

// ─── patterns ───────────────────────────────────────────────────────────────────────────────────

/** A pattern struct in four parts: the fixed head (count byte included), notes, lanes, tail. */
interface PatternStruct {
	head: Uint8Array;
	notes: Uint8Array;
	lanes: Uint8Array;
	tail: Uint8Array;
}

function structAt(image: Uint8Array, span: PatternSpan): PatternStruct {
	return {
		head: image.slice(span.base, span.base + PATTERN.noteCount),
		notes: image.slice(span.base + PATTERN.notes, span.lanes),
		lanes: image.slice(span.lanes, span.lanes + span.lanesSize),
		tail: image.slice(span.lanes + span.lanesSize, span.end)
	};
}

/** The struct's bytes; a leader carries the track's pattern count, a clone drops that byte. */
function serialize(struct: PatternStruct, leaderCount: number | null): Uint8Array {
	if (leaderCount !== null) struct.head[PATTERN.count] = leaderCount;
	const head = leaderCount === null ? struct.head.subarray(1) : struct.head;
	const count = Uint8Array.of(struct.notes.length / NOTE_SIZE);
	return concat([head, count, struct.notes, struct.lanes, struct.tail]);
}

/** What a struct holds, read as the reader would. */
function readStruct(struct: PatternStruct): XyPattern {
	const bytes = serialize({ ...struct, head: struct.head.slice() }, 1);
	const lanes = PATTERN.notes + struct.notes.length;
	return readPattern(bytes, {
		base: 0,
		end: bytes.length,
		noteCount: struct.notes.length / NOTE_SIZE,
		lanes,
		lanesSize: struct.lanes.length
	});
}

/** Empties a struct's sequence: locks, components, notes and lanes (a new pattern's state). */
function wipe(struct: PatternStruct): void {
	const h = struct.head;
	h.fill(0, PATTERN.lockCurrent, PATTERN.lockValues + STEPS * LOCK_ROW_SIZE);
	h.fill(0, PATTERN.lockMasks, PATTERN.lockMasks + STEPS * 8);
	h.fill(0, PATTERN.lockUnion, PATTERN.lockUnion + 8);
	h.fill(0, PATTERN.components, PATTERN.components + STEPS * COMPONENT_ROW_SIZE);
	struct.notes = new Uint8Array(0);
	struct.lanes = new Uint8Array(LANES);
}

/**
 * Pattern `index` of a track as the model has it: the template's struct at that index (or the
 * track's first, emptied, past the template's patterns) with the model's changes written in.
 */
function buildPattern(
	image: Uint8Array,
	spans: readonly PatternSpan[],
	index: number,
	now: XyPattern,
	where: string
): PatternStruct {
	const fresh = index >= spans.length;
	const struct = structAt(image, spans[fresh ? 0 : index]);
	if (fresh) wipe(struct);
	const was = fresh ? readStruct(struct) : readPattern(image, spans[index]);
	const h = struct.head;
	const byte = (key: 'steps' | 'scale' | 'quantize' | 'groove', min: number, max: number) => {
		if (now[key] === was[key]) return;
		check(now[key], min, max, `${where}: ${key}`);
		h[PATTERN[key]] = now[key] & 0xff;
	};
	byte('steps', 1, STEPS);
	byte('scale', 0, 255);
	byte('quantize', 0, 255);
	byte('groove', -128, 127);
	if (now.noteLength !== was.noteLength) {
		check(now.noteLength, 0, 480, `${where}: note length (ticks)`);
		setU16(h, PATTERN.noteLength, now.noteLength);
	}
	if (now.smoothing !== was.smoothing) {
		check(now.smoothing, 0, 255, `${where}: smoothing`);
		h[PATTERN.smoothing] = now.smoothing;
	}
	// written as the model has it: when the device clears it depends on how a pattern was edited
	if (now.pristine !== was.pristine) {
		check(now.pristine, 0, 0xffff, `${where}: pristine`);
		setU16(h, PATTERN.pristine, now.pristine);
	}
	writeComponents(h, was.components, now.components, where);
	writeLocks(h, was.locks, now.locks, where);
	if (!sameNotes(now.notes, was.notes)) struct.notes = encodeNotes(now.notes, where);
	if (!sameBytes(now.lanes, was.lanes)) {
		checkLanes(now.lanes, where);
		struct.lanes = now.lanes.slice();
	}
	return struct;
}

function sameNotes(a: readonly XyNote[], b: readonly XyNote[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(n, i) =>
				n.tick === b[i].tick &&
				n.gate === b[i].gate &&
				n.note === b[i].note &&
				n.velocity === b[i].velocity &&
				n.flags === b[i].flags
		)
	);
}

/** Note records in tick order (a stable sort, so a chord keeps its order), 12 bytes each. */
function encodeNotes(notes: readonly XyNote[], where: string): Uint8Array {
	if (notes.length > MAX_NOTES) {
		throw new XyModelError(`${where} has ${notes.length} notes (at most ${MAX_NOTES})`);
	}
	const out = new Uint8Array(notes.length * NOTE_SIZE);
	[...notes]
		.sort((a, b) => a.tick - b.tick)
		.forEach((note, k) => {
			check(note.tick, -0x80000000, 0x7fffffff, `${where}: a note's tick`);
			check(note.gate, 0, 0xffffffff, `${where}: a note's gate`);
			check(note.note, 0, 127, `${where}: a note's pitch`);
			check(note.velocity, 1, 127, `${where}: a note's velocity`);
			check(note.flags, 0, 0xffff, `${where}: a note's flags`);
			const at = k * NOTE_SIZE;
			setU32(out, at, note.tick);
			setU32(out, at + 4, note.gate);
			out[at + 8] = note.note;
			out[at + 9] = note.velocity;
			setU16(out, at + 10, note.flags);
		});
	return out;
}

/** Lane bytes must be exactly three lanes: a count, then 4 bytes per keyframe when not 0. */
function checkLanes(lanes: Uint8Array, where: string): void {
	let size = 0;
	for (let lane = 0; lane < LANES && size <= lanes.length; lane++) {
		size += lanes[size] === 0 ? 1 : 1 + 4 * (lanes[size] ?? 0);
	}
	if (size !== lanes.length) {
		throw new XyModelError(`${where}: lanes must be exactly three performance lanes`);
	}
}

// ─── step components ────────────────────────────────────────────────────────────────────────────

/** Each step's components as bit → value. */
function componentRows(
	components: readonly XyStepComponent[],
	where: string
): Map<number, Map<number, number>> {
	const rows = new Map<number, Map<number, number>>();
	for (const { step, kind, value } of components) {
		check(step, 0, STEPS - 1, `${where}: a component's step`);
		const bit = XY_STEP_COMPONENTS.indexOf(kind);
		if (bit < 0) throw new XyModelError(`${where}: unknown step component "${kind}"`);
		check(value, 0, 9, `${where}: the ${kind} digit`);
		const row = rows.get(step) ?? new Map<number, number>();
		if (row.has(bit))
			throw new XyModelError(`${where}: two ${kind} components on step ${step + 1}`);
		rows.set(step, row.set(bit, value));
	}
	return rows;
}

/**
 * Writes the steps whose components changed: the enabled bits and each value, as upstream's
 * set_step_component does; a step left without components is zeroed, as clear_step_components
 * does.
 */
function writeComponents(
	h: Uint8Array,
	was: readonly XyStepComponent[],
	now: readonly XyStepComponent[],
	where: string
): void {
	const before = componentRows(was, where);
	const after = componentRows(now, where);
	for (let step = 0; step < STEPS; step++) {
		const a = before.get(step);
		const b = after.get(step);
		if (
			(a?.size ?? 0) === (b?.size ?? 0) &&
			[...(a ?? [])].every(([bit, v]) => b?.get(bit) === v)
		) {
			continue;
		}
		const row = PATTERN.components + step * COMPONENT_ROW_SIZE;
		if (!b || b.size === 0) {
			h.fill(0, row, row + COMPONENT_ROW_SIZE);
			continue;
		}
		// bits 14 and 15 are not components we know: keep them
		let mask = u16(h, row) & 0xc000;
		for (const [bit, value] of b) {
			mask |= 1 << bit;
			h[row + 2 + bit] = value;
		}
		setU16(h, row, mask);
	}
}

// ─── parameter locks ────────────────────────────────────────────────────────────────────────────

const maskByte = (step: number, bit: number) => PATTERN.lockMasks + step * 8 + (bit >> 3);
const cellAt = (step: number, column: number) =>
	PATTERN.lockValues + step * LOCK_ROW_SIZE + column * 2;
const armed = (h: Uint8Array, step: number, bit: number) =>
	((h[maskByte(step, bit)] >> (bit & 7)) & 1) === 1;

function arm(h: Uint8Array, step: number, bit: number, on: boolean): void {
	const at = maskByte(step, bit);
	h[at] = on ? h[at] | (1 << (bit & 7)) : h[at] & ~(1 << (bit & 7));
}

/**
 * Writes the locks that changed. A new or changed lock sets its cell, its mask bit and the column's
 * current value, and (after step 1) leaves `value − 1` in the step before when that cell is unarmed
 * and empty: the carry OS 1.1.25 writes (§3.9, device-verified). A removed lock loses its bit and
 * its cell. The union mask is then the OR of the step masks (A.2).
 */
function writeLocks(
	h: Uint8Array,
	was: readonly XyLock[],
	now: readonly XyLock[],
	where: string
): void {
	const key = (lock: XyLock) => lock.step * LOCK_COLUMNS + lock.column;
	const before = new Map(was.map((lock) => [key(lock), lock.value]));
	const after = new Map<number, XyLock>();
	for (const lock of now) {
		check(lock.step, 0, STEPS - 1, `${where}: a lock's step`);
		check(lock.column, 0, LOCK_COLUMNS - 1, `${where}: a lock's column`);
		check(lock.value, 0, 0xffff, `${where}: a lock's value`);
		if (after.has(key(lock))) {
			throw new XyModelError(
				`${where}: two locks on column ${lock.column} of step ${lock.step + 1}`
			);
		}
		after.set(key(lock), lock);
	}
	let changed = false;
	for (const [k] of before) {
		if (after.has(k)) continue;
		const step = Math.floor(k / LOCK_COLUMNS);
		const column = k % LOCK_COLUMNS;
		arm(h, step, lockBit(column), false);
		setU16(h, cellAt(step, column), 0);
		changed = true;
	}
	const writes = [...after.values()]
		.filter((lock) => before.get(key(lock)) !== lock.value)
		.sort((a, b) => a.step - b.step || a.column - b.column);
	for (const { step, column, value } of writes) {
		const bit = lockBit(column);
		if (step > 0 && !armed(h, step - 1, bit) && u16(h, cellAt(step - 1, column)) === 0) {
			setU16(h, cellAt(step - 1, column), Math.max(0, value - 1));
		}
		setU16(h, cellAt(step, column), value);
		setU16(h, PATTERN.lockCurrent + column * 2, value);
		arm(h, step, bit, true);
		changed = true;
	}
	if (!changed) return;
	for (let byte = 0; byte < 8; byte++) {
		let union = 0;
		for (let step = 0; step < STEPS; step++) union |= h[PATTERN.lockMasks + step * 8 + byte];
		h[PATTERN.lockUnion + byte] = union;
	}
}
