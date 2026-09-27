/**
 * Frames the sequencer area draws (see `../types.ts`): plain data in the units the pages draw. TE's
 * guide has no picture of any of these pages, so their layouts are ours, in the visual language of
 * the pages it does show (research 55 §5).
 */
import type { PlayerType } from '../../sequencer';
import type { HeaderCell, SoftLabel } from '../../screen/draw';
import type { ScreenFrame } from '../../screen/frame';

/**
 * One step of the bar page's pattern map: no such bar, a step past the length (the last bar
 * trimmed), an empty step, a step with notes.
 */
export type BarCell = 'none' | 'trimmed' | 'empty' | 'note';

/** The bar menu while `bar` is held or pinned (manual: sequencer/bar-menu). */
export interface BarFrame {
	readonly page: 'bar';
	/** E1–E4: quantise, note length, groove, shape (lock smoothing), as display strings. */
	readonly header: readonly HeaderCell[];
	/** Four rows (bars 1–4) of sixteen steps. */
	readonly cells: readonly (readonly BarCell[])[];
	/** The bar the step keys show (0–3). */
	readonly shown: number;
	/** The step playing (0–63), or null. */
	readonly playhead: number | null;
	readonly bars: number;
	/** Steps that play, 1–64. */
	readonly length: number;
	/** Track scale as shown ("1", "16", "1/2"). */
	readonly scale: string;
	/** Pinned with `shift + bar` (stays up until `bar` is pressed again). */
	readonly pinned: boolean;
	/** Over M1–M4: what `bar + M1 / M2 / M4` clear. */
	readonly soft: readonly (SoftLabel | null)[];
}

/** How many of the selected steps carry a component. */
export type Presence = 'none' | 'some' | 'all';

/** Shift held with steps selected: the step components (manual: sequencer/step-components). */
export interface ComponentsFrame {
	readonly page: 'components';
	/** The selected steps, numbered from 1 across the pattern. */
	readonly steps: readonly number[];
	/** Each of the 14 components (white-key order): on none, some or all selected steps. */
	readonly present: readonly Presence[];
	/** The component the last white key chose, its digit (null when the steps differ) and meaning. */
	readonly chosen: {
		readonly index: number;
		readonly name: string;
		readonly digit: number | null;
		readonly value: string;
	} | null;
}

/** One encoder's card on the player page; an empty label leaves the encoder unused. */
export interface PlayerCard {
	readonly label: string;
	readonly value: string;
}

/** The player page (`player`; manual: players/*). */
export interface PlayerFrame {
	readonly page: 'player';
	readonly type: PlayerType;
	/** Switched on with the second press of `player`. */
	readonly on: boolean;
	/** The arpeggio's shift layer (note length, style, glide, stereo). */
	readonly shift: boolean;
	/** E1–E4. */
	readonly cards: readonly PlayerCard[];
	/** Arpeggio: one cycle of the run, as semitones above its lowest note (the picture). */
	readonly run: readonly number[];
	/** The run's note sounding now (index into `run`), or null. */
	readonly at: number | null;
	/** Maestro and hold: pitch classes (0 = C) to mark on the octave picture. */
	readonly marks: readonly number[];
	/** Maestro: the stored chord's lowest note ("C4"), or null. */
	readonly root: string | null;
}

/**
 * A step held on an instrument page: the page as it plays on that step (its locks applied), with
 * a tag naming the step and the lock turned last (our feedback; manual: sequencer/parameter-locks).
 */
export interface LockFrame {
	readonly page: 'lock';
	/** The module page with the step's values. */
	readonly base: ScreenFrame;
	/** The held step, numbered from 1 across the pattern. */
	readonly step: number;
	/** Locks the step carries. */
	readonly locks: number;
	/** The parameter locked last on this step, as shown, or null. */
	readonly last: { readonly label: string; readonly value: string } | null;
}

/** Every frame of the sequencer area. */
export type SequencerFrame = BarFrame | ComponentsFrame | PlayerFrame | LockFrame;
