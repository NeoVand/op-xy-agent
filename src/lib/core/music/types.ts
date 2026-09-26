// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/player.svelte.ts (NoteSpec)

/**
 * Shared shapes for musical time. A beat is a quarter note throughout `core/music`.
 *
 * `NoteSpec` used to live in MIDI Lab's player (a Svelte module), which made the notation parser
 * depend on the audio engine; it lives here now so the pure layers can share it.
 */

/** A note in musical time. */
export interface NoteSpec {
	/** MIDI note number, 0–127 (60 is middle C). */
	note: number;
	/** Start, in beats from the start of the phrase. */
	start: number;
	/** How long it sounds, in beats (> 0). */
	duration: number;
	/** 1–127; consumers use `DEFAULT_VELOCITY` when absent. */
	velocity?: number;
	/** Wire channel 0–15; consumers use 0 when absent. */
	channel?: number;
}

/** Velocity for a note that does not say. */
export const DEFAULT_VELOCITY = 96;

/** A note placed on a step grid, as a step sequencer such as the OP-XY's holds it. */
export interface StepNote {
	/** 0-based step where the note starts. */
	step: number;
	/**
	 * How long it sounds, in steps; fractional lengths are fine (the OP-XY's default gate is half a
	 * step).
	 */
	length: number;
	note: number;
	velocity: number;
	channel: number;
}
