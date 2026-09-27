/**
 * The sequencer area's part of the simulator state (see `../types.ts`): the gestures in progress
 * (bar held or pinned, steps held or selected, recording, the clear gesture), the keyboard octave,
 * the copy buffer, one undo level and the players' sounding notes. The patterns themselves live in
 * each track's `sequence` (`../../sequencer.ts`). Plain, serialisable data.
 */
import type { Bank, Overlay, SimState } from '../../params';
import type { SeqStep, Sequence } from '../../sequencer';

/** A step key held down. */
export interface StepHold {
	/** The pattern step it addresses (fixed when it went down). */
	index: number;
	/** When it went down (ms, the simulator's clock for gestures). */
	since: number;
	/** The step held notes when pressed: a tap clears it, a hold copies it. */
	notes: boolean;
	/** The step was empty: the last note (or the copy) goes on it when it comes up. */
	place: boolean;
	/** Something happened while it was down (a key, a lock, a nudge, an extend), so its release does nothing. */
	edited: boolean;
}

/** What the screen showed before `bar` went down, restored when it comes up. */
export interface BarReturn {
	overlay: Overlay | null;
	sub: string | null;
	picker: SimState['picker'];
}

/** What the sequencer area remembers. */
export interface SequencerState {
	// bar menu (manual: sequencer/bar-menu, bars-and-length)
	/** `shift + bar` pinned the bar page: it stays until `bar` is pressed again. */
	barPinned: boolean;
	/** When `bar` went down, to tell a tap (switch bars) from a hold. */
	barSince: number;
	/** Something was done while `bar` was down, so letting go does not switch bars. */
	barUsed: boolean;
	/** The page to go back to when `bar` comes up. */
	barReturn: BarReturn | null;
	/** A bar tapped during playback stays on the step keys instead of following the playhead. */
	pagePinned: boolean;

	// step components (manual: sequencer/step-components)
	/** Steps selected with shift held (pattern steps, in the order pressed). */
	selection: number[];
	/** The component chosen with a white key in this shift gesture (index into STEP_COMPONENTS). */
	component: number | null;

	// step keys (manual: step-entry, copy-step, extend-notes, parameter-locks)
	/** Step keys held now, by key id (`step.5`). */
	holds: Record<string, StepHold>;
	/** A step copied by holding it: the next empty step pressed gets it. */
	clipboard: SeqStep | null;
	/** The lock turned last (pattern step and parameter id), for the screen. */
	lastLock: { step: number; id: string } | null;

	// keyboard
	/** Keyboard octave, −3…3 (`[-]` / `[+]`; synth and sampler tracks). */
	octave: number;
	/** Single-sound view: the note whose steps the step keys show, and the key holding it. */
	single: { note: number; key: string } | null;

	// recording (manual: live-recording, step-recording, clear-and-undo)
	/** `record + play` while stopped: waiting for the first note (step 1 flashes red). */
	armed: boolean;
	/** Recording latched on: `record + play` during playback, or after arming or a count-in. */
	recLatch: boolean;
	/** `record + play → play`: recording starts when the count-in bar ends. */
	countIn: boolean;
	/** Step recording's cursor (a pattern step) while `record` is held with playback stopped. */
	cursor: number | null;
	/** Keys held now have filled the cursor step: it moves on when the last one comes up. */
	cursorFilled: boolean;
	/** Notes being recorded live, by keyboard key: their step and where they began (steps). */
	takes: Record<string, { index: number; note: number; start: number }>;
	/** `record + hold stop`: when the gesture began (gesture clock), and the LED clock then. */
	clearSince: number | null;
	clearClock: number | null;
	/** One undo level: a track's sequence before the last change (`shift + record` swaps it back). */
	undo: { bank: Bank; track: number; sequence: Sequence } | null;

	// players (manual: players/*)
	/** Notes a player keeps sounding after the keys came up (hold, arpeggio or maestro with hold). */
	sustained: number[];
	/** Maestro: shift is held and the next key starts a new chord. */
	chordFresh: boolean;
	/** Maestro chord hits so far (its up/down strum alternates). */
	hits: number;

	// time
	/** Milliseconds the simulator has advanced (LED blinking). */
	clock: number;
}

/** The sequencer area's state in a new project. */
export function initialSequencer(): SequencerState {
	return {
		barPinned: false,
		barSince: 0,
		barUsed: false,
		barReturn: null,
		pagePinned: false,
		selection: [],
		component: null,
		holds: {},
		clipboard: null,
		lastLock: null,
		octave: 0,
		single: null,
		armed: false,
		recLatch: false,
		countIn: false,
		cursor: null,
		cursorFilled: false,
		takes: {},
		clearSince: null,
		clearClock: null,
		undo: null,
		sustained: [],
		chordFresh: true,
		hits: 0,
		clock: 0
	};
}
