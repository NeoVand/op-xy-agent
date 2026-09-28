/**
 * From simulator state to what arrange shows (pure): the band of tracks and the scene of arrange
 * mode, the song order of song mode, and the LEDs arrange adds.
 *
 * As the owner's OS 1.1.33 unit draws it, measured by camera (docs/research/59-screen-profiling.md
 * §2.9, frames b1-721…874; TE's guide art arrange-003/020/028 differs): a band crossing the eight
 * columns in the tracks' colours, each segment dotted with the notes of the pattern that track
 * plays; the selected track's segment gives way to a stack of its patterns, numbered, the one
 * playing white and raised a little over the band, the others a ramp step darker for each pattern
 * away from it, so turning E4 scrolls the stack and keeps the pattern playing in place. The
 * pattern keys are always lit; M4 clears a track's only pattern and deletes one of several. Song
 * mode counts the scenes in the song, and lights its keys and shows its cursor only while shift is
 * held; the ring on the entry playing carries a notch that goes round once per scene.
 *
 * Ours, where the captures are silent: the edges of other tracks' stacked-away patterns (after
 * TE's art, which draws the ones after the pattern playing under the band; the ones before it, over
 * the band, are ours), the ink on T1 and T2's near-black segments, how a long note and a pitch range
 * too tall for a block are drawn, and where the ring rests when a song that does not loop runs out.
 */
import { AUX_NAMES, clamp, type SimState } from '../../params';
import { COLORS, RAMP } from '../../screen/palette';
import type { Pattern } from '../../sequencer';
import type { LedMap } from '../types';
import type {
	ArrangeBlock,
	ArrangeColumn,
	ArrangeSoftLabel,
	PatternsFrame,
	SongFrame,
	SongSlot
} from './frames';
import {
	accidentalKey,
	naturalKey,
	naturalNumber,
	sceneLength,
	selectedTrack,
	trackSequence
} from './model';
import { PATTERN_KEYS, SONG_LENGTH, type ArrangeState, type PatternAction } from './state';

/** A track's column is 60 px wide; its rules run from the top down to `bottom`, which clips the stack. */
export const COLUMN = { width: 60, bottom: 192.8 } as const;
/** The band the tracks' playing patterns sit on (camera b1-738: 31 panel rows). */
export const BAND = { top: 94.45, bottom: 125.35 } as const;
/**
 * The selected track's stack: the pattern playing fills `top`…`bottom`, raised over the band and a
 * panel row taller than its slot each way; the others are `block` tall (30 panel rows) and close up
 * on it. Notes and numbers keep to the slots, `block` apart from `centre` (b1-764…836).
 */
export const STACK = { top: 88.95, bottom: 120.7, block: 29.73, centre: 105.04 } as const;
/** A block spans its column and both rules: half a pixel over each side. */
export const BLOCK_X = { inset: -0.5, width: 61 } as const;
/** The pattern's number: 10 px, heavier weight, this far into the column and below its slot's centre. */
export const NUMBER = { x: 1.85, drop: 11.75, size: 10 } as const;

/**
 * The notes (b1-738, 740, 764, 826): a bar's 16 steps over 43 px from 14.6 px into the column, a
 * dash a step long and a pixel thick for each note, a pitch a pixel apart, centred on the slot.
 * Longer notes as long dashes, and ranges over 25 semitones squeezed to fit, are ours.
 */
const ROLL = { x: 14.6, width: 43, span: 25 } as const;

/** The tracks' colours on the band: T1 near black, then the ramp up to white (b1-738, 750). */
const TRACK_COLORS = [COLORS.panel, ...RAMP.slice(1)] as const;

/** The auxiliary tracks' pictograms, T1–T8. */
export const AUX_ICONS = [
	'arrange.aux.brain',
	'arrange.aux.punch',
	'arrange.aux.midi',
	'arrange.aux.cv',
	'arrange.aux.audio',
	'arrange.aux.tape',
	'arrange.aux.fx1',
	'arrange.aux.fx2'
] as const;

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * What is drawn on a block: ink, the device's on every grey it was seen on (as dark as T3's
 * segment); on T1 and T2's near black a light grey instead (ours).
 */
const inkOn = (color: string) =>
	color === COLORS.panel || color === RAMP[0] || color === RAMP[1] ? COLORS.light : COLORS.ink;

/**
 * A pattern's notes as dashes: [x from the column's left, y from the slot's centre, length]. Time
 * runs across 43 px for the pattern's length (a bar at least), pitch upwards around the middle of
 * the pitches used.
 */
export function patternNotes(pattern: Pattern): [number, number, number][] {
	const length = Math.max(1, pattern.length);
	const notes: { at: number; note: number; length: number }[] = [];
	pattern.steps.slice(0, length).forEach((step, i) => {
		for (const n of step.notes) notes.push({ at: i + n.offset, note: n.note, length: n.length });
	});
	if (notes.length === 0) return [];
	const pitches = notes.map((n) => n.note);
	const low = Math.min(...pitches);
	const high = Math.max(...pitches);
	const mid = (low + high) / 2;
	const scale = high - low > ROLL.span ? ROLL.span / (high - low) : 1;
	const step = ROLL.width / Math.max(length, 16);
	// a note shows at least a step long (the device's half-step notes do), and at least a pixel
	const dash = (n: { length: number }) => Math.max(1, Math.max(1, n.length) * step);
	return notes.map((n) => [r2(ROLL.x + n.at * step), r2((mid - n.note) * scale), r2(dash(n))]);
}

/** The band segment of a track that is not selected: its colour and the pattern it plays. */
function bandBlock(column: number, pattern: Pattern): ArrangeBlock {
	const color = TRACK_COLORS[column];
	return {
		top: BAND.top,
		bottom: BAND.bottom,
		centre: r2((BAND.top + BAND.bottom) / 2),
		color,
		ink: inkOn(color),
		number: null,
		notes: patternNotes(pattern)
	};
}

/** Pattern `index` of the selected track, `k` places from the one playing, as a block of its stack. */
function stackBlock(index: number, k: number, pattern: Pattern): ArrangeBlock {
	const { top, bottom, block, centre } = STACK;
	const edges =
		k === 0
			? [top, bottom]
			: k < 0
				? [top + block * k, top + block * (k + 1)]
				: [bottom + block * (k - 1), bottom + block * k];
	const color = RAMP[Math.max(0, RAMP.length - 1 - Math.abs(k))];
	return {
		top: r2(edges[0]),
		bottom: r2(edges[1]),
		centre: r2(centre + block * k),
		color,
		ink: inkOn(color),
		number: index + 1,
		notes: patternNotes(pattern)
	};
}

/** The column of the track shown in `column` (0–7). */
function columnFrame(s: SimState, column: number): ArrangeColumn {
	const instrument = s.banks.arrange === 'instrument';
	const t = instrument ? column : 8 + column;
	const seq = trackSequence(s, t);
	const count = seq.patterns.length;
	const current = Math.min(seq.current, count - 1);
	const selected = selectedTrack(s) === t;
	const mix = instrument ? s.tracks[column].mix : s.aux[column].mix;
	const blocks = selected
		? seq.patterns.flatMap((pattern, index) => {
				const block = stackBlock(index, index - current, pattern);
				return block.bottom > 0 && block.top < COLUMN.bottom ? [block] : [];
			})
		: [bandBlock(column, seq.patterns[current])];
	return {
		name: instrument ? `T${column + 1}` : AUX_NAMES[column],
		icon: instrument ? null : AUX_ICONS[column],
		label: instrument ? String(column + 1) : '',
		selected,
		muted: mix.muted,
		linked: s.areas.arrange.link[t].on,
		pattern: current + 1,
		patterns: count,
		blocks,
		above: selected ? 0 : Math.min(3, current),
		below: selected ? 0 : Math.min(3, count - 1 - current)
	};
}

/** The digits of a scene number being typed, padded with dashes ("--", "2-"). */
const typing = (digits: readonly number[]) => (digits.join('') + '--').slice(0, 2);

/** What M4 says: clear while the selected track has one pattern, delete once it has more. */
function patternLabel(s: SimState, action: PatternAction): string {
	if (action !== 'clear') return action;
	return trackSequence(s, selectedTrack(s)).patterns.length > 1 ? 'delete' : 'clear';
}

/** What arrange mode's M1–M4 are labelled: all lit, as on the device (b1-738, 764, 814). */
function patternLabels(s: SimState): ArrangeSoftLabel[] {
	const labels = s.shift
		? ['clone', 'copy', 'paste', 'reset']
		: PATTERN_KEYS.map((action) => patternLabel(s, action));
	return labels.map((text) => ({ text, tone: 'light' }));
}

/** Arrange mode: the scene and the eight tracks of the set it shows. */
export function patternsFrame(s: SimState): PatternsFrame {
	const a = s.areas.arrange;
	const entry = a.entry;
	return {
		page: 'arrange',
		bank: s.banks.arrange,
		scene: entry && entry.purpose === 'select' ? typing(entry.digits) : String(a.scene + 1),
		queued:
			entry && entry.purpose === 'queue'
				? typing(entry.digits)
				: a.queued !== null
					? String(a.queued + 1)
					: a.armed
						? ''
						: null,
		columns: Array.from({ length: 8 }, (_, column) => columnFrame(s, column)),
		soft: patternLabels(s)
	};
}

/** The natural whose song M2 / M3 copy and paste (held with shift in song mode), or null. */
export function heldSong(s: SimState): number | null {
	if (!s.shift) return null;
	for (const id of s.held) {
		const n = naturalNumber(id);
		if (n !== null) return n - 1;
	}
	return null;
}

/** How far the scene playing has got, 0–1 (a count-in counts as its start). */
function sceneProgress(s: SimState): number {
	return clamp(s.transport.position / sceneLength(s), 0, 1);
}

/** Song mode: the song order around the cursor, and the song's settings. */
export function songFrame(s: SimState): SongFrame {
	const a = s.areas.arrange;
	const song = a.songs[a.song];
	const cursor = Math.min(a.cursor, song.order.length);
	const running = a.playing && s.transport.playing;
	const entries: SongSlot[] = song.order.map((scene, i) => ({
		scene: String(scene + 1),
		playing: i === a.position,
		cued: a.playing && i === a.cue,
		progress: running && i === a.position ? sceneProgress(s) : null
	}));
	// a scene number being typed shows where it will go
	if (a.entry?.purpose === 'song') {
		entries.splice(cursor, 0, {
			scene: typing(a.entry.digits),
			playing: false,
			cued: false,
			progress: null
		});
	}
	const first = a.scroll * 8;
	const slots = Array.from({ length: 32 }, (_, i) => entries[first + i] ?? null);
	const at = cursor - first;
	const copying = heldSong(s) !== null;
	const tone = s.shift ? 'light' : 'dim';
	return {
		page: 'song',
		song: a.song + 1,
		loop: song.loop,
		length: song.order.length,
		count: String(song.order.length).padStart(2, '0'),
		at: Math.min(cursor + 1, SONG_LENGTH),
		first: first + 1,
		slots,
		cursor: at >= 0 && at < 32 ? at : null,
		lit: s.shift,
		playing: a.playing,
		soft: [
			{ text: 'clear all', tone },
			copying ? { text: 'copy', tone } : { text: '', icon: 'arrange.left', tone },
			copying ? { text: 'paste', tone } : { text: '', icon: 'arrange.right', tone },
			{ text: 'delete', tone }
		]
	};
}

/** The digits of a scene number (1-based) as black-key digits. */
const digitsOf = (scene: number) =>
	String(scene + 1)
		.split('')
		.map(Number);

/**
 * LEDs arrange adds while shift is held (ours; the guide shows none): the black keys spell the
 * current scene (a queued one in red), or the digits being typed; in song mode the white key of the
 * current song lights.
 */
export function arrangeLeds(s: SimState, leds: LedMap): void {
	const a: ArrangeState = s.areas.arrange;
	if (!s.shift && !a.entry) return;
	if (a.view === 'song' && !a.entry) {
		leds[naturalKey(a.song + 1)] = 'white';
		return;
	}
	if (a.entry) {
		for (const d of [0, ...a.entry.digits]) leds[accidentalKey(d)] = 'white';
		return;
	}
	if (a.queued !== null) for (const d of digitsOf(a.queued)) leds[accidentalKey(d)] = 'red';
	for (const d of digitsOf(a.scene)) leds[accidentalKey(d)] = 'white';
}
