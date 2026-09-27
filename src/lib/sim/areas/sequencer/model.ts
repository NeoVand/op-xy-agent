/**
 * What the sequencer area reads from the simulator state: the track the step keys address, its
 * pattern, the bar shown on the step keys, the note under a keyboard key, which gestures are in
 * progress, and the one-level undo. Shared by the gestures, the LEDs and the frames.
 */
import { KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
import type { Bank, SimState, TrackState } from '../../params';
import {
	STEPS_PER_BAR,
	cloneSequence,
	currentPattern,
	type Pattern,
	type Sequence
} from '../../sequencer';
import { playheadAt } from '../../sequencer-playback';
import type { SequencerState } from './state';

/** The first keyboard key's note at octave 0 (F3). */
export const KEYBOARD_BASE = 53;
/** A release sooner than this after `bar` went down, with nothing done meanwhile, switches bars. */
export const TAP_MS = 400;
/** A step with notes held this long is copied instead of cleared when it comes up. */
export const COPY_MS = 500;
/** `record + stop` held this long clears the track's pattern. */
export const CLEAR_MS = 1000;
/** LEDs that flash change every this many milliseconds of simulator time. */
export const BLINK_MS = 250;
/** Keyboard octave range. */
export const OCTAVES = { min: -3, max: 3 } as const;

/** The sequencer area's state slice. */
export const seq = (s: SimState): SequencerState => s.areas.sequencer;

/** The set of tracks the step keys address (the core's rule: mix and arrange have their own). */
export function activeBank(s: SimState): Bank {
	if (s.mode === 'mix') return s.banks.mix;
	if (s.mode === 'arrange') return s.banks.arrange;
	return s.mode;
}

/** The index of the active track in its set. */
export const activeIndex = (s: SimState) => (activeBank(s) === 'instrument' ? s.track : s.auxTrack);

/** The instrument track the step keys address, or null on an auxiliary track. */
export function activeTrack(s: SimState): TrackState | null {
	return activeBank(s) === 'instrument' ? s.tracks[s.track] : null;
}

/** The sequence the step keys edit. */
export function activeSequence(s: SimState): Sequence {
	return activeBank(s) === 'instrument' ? s.tracks[s.track].sequence : s.aux[s.auxTrack].sequence;
}

/** The pattern the step keys edit (the one that plays). */
export const activePattern = (s: SimState): Pattern => currentPattern(activeSequence(s));

/** Whether the keys address a drum track (24 sounds: no octaves, sequence moves by semitones). */
export function isDrumTrack(s: SimState): boolean {
	return activeTrack(s)?.engine === 'drum';
}

/**
 * Whether the sequencer's gestures apply: instrument or auxiliary mode (the manual's context for
 * them), no list or named sub-page open, and no other area's page over the mode.
 */
export function sequencing(s: SimState): boolean {
	return (
		(s.mode === 'instrument' || s.mode === 'auxiliary') &&
		s.sub === null &&
		s.picker === null &&
		(s.overlay === null || s.overlay === 'tempo' || s.overlay === 'bar' || s.overlay === 'players')
	);
}

/** Whether the bar menu is up: `bar` held, or pinned with `shift + bar`. */
export const barDown = (s: SimState) => s.overlay === 'bar';

/** The step playing now (−1 when stopped or during a count-in). */
export function playingStep(s: SimState, pattern = activePattern(s)): number {
	const t = s.transport;
	if (!t.playing || t.position < 0) return -1;
	return playheadAt(pattern, t.position);
}

/**
 * The bar the step keys show (manual: sequencer/bars-and-length): step recording follows its
 * cursor; during playback the keys follow the playhead unless a bar was tapped; otherwise the bar
 * last chosen.
 */
export function shownBar(s: SimState): number {
	const sequence = activeSequence(s);
	const pattern = currentPattern(sequence);
	const st = seq(s);
	const last = Math.max(0, pattern.bars - 1);
	if (st.cursor !== null) return Math.min(last, Math.floor(st.cursor / STEPS_PER_BAR));
	const head = playingStep(s, pattern);
	if (head >= 0 && !st.pagePinned) return Math.min(last, Math.floor(head / STEPS_PER_BAR));
	return Math.max(0, Math.min(last, sequence.page));
}

/** The pattern step a step key (0–15) addresses now. */
export const stepIndex = (s: SimState, key: number) => shownBar(s) * STEPS_PER_BAR + key;

/** The index of a keyboard key name (`fs3` → 1), or −1. */
export const keyboardIndex = (name: string) =>
	(KEYBOARD_NOTE_NAMES as readonly string[]).indexOf(name);

/** The note a keyboard key (0 = F3 … 23 = E5) plays now: the octave moves melodic tracks only. */
export function keyNote(s: SimState, index: number): number {
	const octave = fixedKeys(s) ? 0 : seq(s).octave;
	return KEYBOARD_BASE + index + 12 * octave;
}

/**
 * Whether the 24 keys are fixed sounds rather than pitches, so [-] / [+] leave them in place: a
 * drum track's kit, and the punch-in track's effects (manual: auxiliary/punch-in-fx).
 */
export function fixedKeys(s: SimState): boolean {
	return activeBank(s) === 'auxiliary' ? s.auxTrack === 1 : isDrumTrack(s);
}

/** The keyboard key (0–23) that plays `note` now, or −1. */
export function noteKey(s: SimState, note: number): number {
	const index = note - keyNote(s, 0);
	return index >= 0 && index < KEYBOARD_NOTE_NAMES.length ? index : -1;
}

/** Keyboard keys held now (ids), in the order pressed. */
export const heldKeys = (s: SimState) => s.held.filter((id) => id.startsWith('keyboard.'));

/** The notes of the keyboard keys held now, in the order pressed. */
export function heldNotes(s: SimState): number[] {
	return heldKeys(s).flatMap((id) => {
		const i = keyboardIndex(id.slice('keyboard.'.length));
		return i >= 0 ? [keyNote(s, i)] : [];
	});
}

/** The pattern steps of the step keys held now (in the order pressed). */
export function heldSteps(s: SimState): number[] {
	const holds = seq(s).holds;
	return s.held.flatMap((id) => (holds[id] ? [holds[id].index] : []));
}

/**
 * Every step held now becomes part of another gesture: letting go of it will not clear, copy or
 * place anything.
 */
export function editHolds(s: SimState): void {
	for (const hold of Object.values(seq(s).holds)) {
		hold.edited = true;
		hold.place = false;
	}
}

/** Whether a track key (`track.n`) is held; returns its number 1–8 or 0. */
export function heldTrackKey(s: SimState): number {
	const id = s.held.find((h) => /^track\.[1-8]$/.test(h));
	return id ? Number(id.slice('track.'.length)) : 0;
}

/**
 * Whether live recording is taking notes: playing, past a count-in, and latched, armed-then-started
 * or with `record` held.
 */
export function liveRecording(s: SimState): boolean {
	const st = seq(s);
	const t = s.transport;
	if (!t.playing || t.position < 0) return false;
	return st.recLatch || st.countIn || s.held.includes('key.record');
}

/** Whether any recording is under way (live, armed, counting in or step recording). */
export function recordingAny(s: SimState): boolean {
	const st = seq(s);
	return liveRecording(s) || st.armed || st.countIn || st.cursor !== null;
}

/**
 * Keeps the core's `transport.recording` flag in step with the gestures, for anything else that
 * reads it.
 */
export function syncRecordingFlag(s: SimState): void {
	const on = recordingAny(s);
	if (s.transport.recording !== on) s.transport.recording = on;
}

/**
 * Remembers the active track's sequence for `shift + record` before a change (one undo level;
 * manual: sequencer/clear-and-undo).
 */
export function remember(s: SimState): void {
	seq(s).undo = {
		bank: activeBank(s),
		track: activeIndex(s),
		sequence: cloneSequence(activeSequence(s))
	};
}

/**
 * Undo: swaps the remembered sequence back into its track, remembering the present one, so undo
 * again redoes (ours: the manual promises one level). Returns false when there is nothing to undo.
 */
export function undo(s: SimState): boolean {
	const st = seq(s);
	const saved = st.undo;
	if (!saved) return false;
	const holder = saved.bank === 'instrument' ? s.tracks[saved.track] : s.aux[saved.track];
	st.undo = { ...saved, sequence: cloneSequence(holder.sequence) };
	holder.sequence = saved.sequence;
	return true;
}
