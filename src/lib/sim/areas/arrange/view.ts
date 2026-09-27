/**
 * From simulator state to what arrange shows (pure): the track columns and the scene of arrange
 * mode (guide art arrange-003, arrange-020), the song order of song mode (arrange-028), and the
 * LEDs arrange adds.
 *
 * What the art shows and we follow: a column per track with its pictogram on top (lit on the
 * selected track), the pattern each track plays as a 60 × 30 cell on a band at y 100 in the track's
 * step of the grey ramp, a black cell edged in white so it shows, the pattern's number and a tiny
 * piano roll of its notes on it, three indented edges under a track whose further patterns are
 * stacked away, the selected track's stack opened 10 px higher with every pattern numbered and a
 * pattern one ramp step lighter than the one before, and the scene in a red box. What we added
 * where the art is silent: edges above the band for patterns before the one playing, hatching on a
 * muted track, "link" under a linked track, the queued scene in an outlined box beside the red one.
 */
import { AUX_NAMES, type SimState } from '../../params';
import { COLORS, RAMP } from '../../screen/palette';
import type { Pattern } from '../../sequencer';
import type { LedMap } from '../types';
import type {
	ArrangeCell,
	ArrangeColumn,
	ArrangeSoftLabel,
	PatternsFrame,
	SongFrame,
	SongSlot
} from './frames';
import {
	accidentalKey,
	isEmpty,
	naturalKey,
	naturalNumber,
	selectedTrack,
	trackSequence
} from './model';
import { PATTERN_KEYS, SONG_LENGTH, type ArrangeState } from './state';

/** The band the playing patterns sit on, and a pattern cell's size. */
export const BAND_TOP = 100;
export const CELL_W = 60;
export const CELL_H = 30;
/** How much higher the selected track's open stack sits (TE's art: the tape track). */
export const LIFT = 10;
/** Where an open stack shows: below the pictograms, down to the end of the column rules. */
export const STACK_TOP = 30;
export const STACK_BOTTOM = 195;

/**
 * The note dots: 2.125 px squares, a one-bar pattern's steps 2.83 px apart and pitches 2.125 px
 * apart (TE's art). The steps start 11.6 px into the cell, clear of the pattern's number (read off
 * the art, where the brain's figure runs from its fifth step).
 */
export const DOT = 2.125;
const PREVIEW_X = 11.62;
const PREVIEW_W = 16 * 2.8333;
const PITCH_Y = 2.125;
const PREVIEW_H = 22;

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
 * A pattern's notes as a tiny piano roll: time across the cell (the pattern's whole length over
 * the 45 px a bar takes), pitch upwards, the pitches used centred on the cell.
 */
export function previewDots(pattern: Pattern): [number, number][] {
	const length = Math.max(1, pattern.length);
	const notes: [number, number][] = [];
	pattern.steps.slice(0, length).forEach((step, i) => {
		for (const n of step.notes) notes.push([i, n.note]);
	});
	if (notes.length === 0) return [];
	const pitches = notes.map(([, note]) => note);
	const low = Math.min(...pitches);
	const high = Math.max(...pitches);
	const pitchX = PREVIEW_W / Math.max(length, 16);
	const rows = high - low;
	const pitchY = rows > 0 ? Math.min(PITCH_Y, (PREVIEW_H - DOT) / rows) : 0;
	const top = (CELL_H - (rows * pitchY + DOT)) / 2;
	return notes.map(([i, note]) => [r2(PREVIEW_X + i * pitchX), r2(top + (high - note) * pitchY)]);
}

/** Pattern `index` of the track in column `column` as a cell at `y`. */
function cell(column: number, index: number, y: number, pattern: Pattern, numbered: boolean) {
	const shade = Math.min(RAMP.length - 1, column + index);
	return {
		y,
		color: RAMP[shade],
		ink: shade < 4 ? COLORS.white : COLORS.black,
		number: numbered ? index + 1 : null,
		outline: shade === 0,
		dots: previewDots(pattern)
	} satisfies ArrangeCell;
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
	const cells = selected
		? seq.patterns.flatMap((pattern, k) => {
				const y = BAND_TOP - LIFT + CELL_H * (k - current);
				return y + CELL_H > STACK_TOP && y < STACK_BOTTOM
					? [cell(column, k, y, pattern, true)]
					: [];
			})
		: [cell(column, current, BAND_TOP, seq.patterns[current], !isEmpty(seq.patterns[current]))];
	return {
		name: instrument ? `T${column + 1}` : AUX_NAMES[column],
		icon: instrument ? null : AUX_ICONS[column],
		label: instrument ? String(column + 1) : '',
		selected,
		muted: mix.muted,
		linked: s.areas.arrange.link[t].on,
		pattern: current + 1,
		patterns: count,
		cells,
		above: selected ? 0 : Math.min(3, current),
		below: selected ? 0 : Math.min(3, count - 1 - current)
	};
}

/** The digits of a scene number being typed, padded with dashes ("--", "2-"). */
const typing = (digits: readonly number[]) => (digits.join('') + '--').slice(0, 2);

/** What arrange mode's M1–M4 are labelled. */
function patternLabels(s: SimState): ArrangeSoftLabel[] {
	if (s.shift) {
		// the scene functions (manual: arrange/scenes); ours: no art shows this layer
		return [
			{ text: 'clone', tone: 'white' },
			{ text: 'copy', tone: 'grey' },
			{ text: 'paste', tone: 'grey' },
			{ text: 'reset', tone: 'grey' }
		];
	}
	return PATTERN_KEYS.map((action) => ({
		text: action,
		tone: action === 'new' ? 'white' : 'grey'
	}));
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

/** Song mode: the song order around the cursor, and the song's settings. */
export function songFrame(s: SimState): SongFrame {
	const a = s.areas.arrange;
	const song = a.songs[a.song];
	const cursor = Math.min(a.cursor, song.order.length);
	const entries: SongSlot[] = song.order.map((scene, i) => ({
		scene: String(scene + 1),
		playing: i === a.position,
		cued: a.playing && i === a.cue
	}));
	// a scene number being typed shows where it will go
	if (a.entry?.purpose === 'song') {
		entries.splice(cursor, 0, { scene: typing(a.entry.digits), playing: false, cued: false });
	}
	const first = a.scroll * 8;
	const slots = Array.from({ length: 32 }, (_, i) => entries[first + i] ?? null);
	const at = cursor - first;
	const copying = heldSong(s) !== null;
	return {
		page: 'song',
		song: a.song + 1,
		loop: song.loop,
		length: song.order.length,
		count: String(Math.min(cursor + 1, SONG_LENGTH)).padStart(2, '0'),
		first: first + 1,
		slots,
		cursor: at >= 0 && at < 32 ? at : null,
		playing: a.playing,
		soft: [
			{ text: 'clear all', tone: 'light' },
			copying ? { text: 'copy', tone: 'light' } : { text: '', icon: 'arrange.left', tone: 'light' },
			copying
				? { text: 'paste', tone: 'light' }
				: { text: '', icon: 'arrange.right', tone: 'light' },
			{ text: 'delete', tone: 'light' }
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
