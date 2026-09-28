/**
 * Frames the sequencer area draws (see `../types.ts`): plain data in the units the pages draw. TE's
 * guide has no picture of any of these pages. The bar card, the step and octave popups and the
 * player pages follow the device (research 59 §2.7, §2.8, §2.12); the step components page is ours,
 * in the visual language of the pages the guide does show (research 55 §5).
 */
import type { ArpSettings, PlayerType } from '../../sequencer';
import type { HeaderCell, SoftLabel } from '../../screen/draw';
import type { ScreenFrame } from '../../screen/frame';

/** A note in the bar card's mini piano roll. */
export interface RollNote {
	/** Where it starts in the bar, in steps from the bar's first (0–15.5, micro-timing included). */
	readonly at: number;
	/** How long it lasts, in steps. */
	readonly length: number;
	/** MIDI note. */
	readonly note: number;
}

/**
 * The bar card while `bar` is held or pinned (manual: sequencer/bar-menu), as the device draws it
 * (research 59 §2.8): a white card over the dimmed page with the bars, the track scale, the four
 * encoders' values and a mini piano roll of the bar the step keys show; what M1 / M2 / M4 clear
 * under it. When `bar` goes the card fades out over the page, no longer dimmed.
 */
export interface BarFrame {
	readonly page: 'bar';
	/** The page the card covers. */
	readonly base: ScreenFrame;
	/** E1–E4: quant, length, groove, shape (lock smoothing), their values as display strings. */
	readonly header: readonly HeaderCell[];
	/** Smoothing between locks, 0 (stepped) … 1, which the shape row draws as a glyph. */
	readonly smoothing: number;
	/** Bars in the pattern (1–4): each has a box on the card. */
	readonly bars: number;
	/** The bar the step keys show (0–3): its box is filled. */
	readonly shown: number;
	/** The shown bar's notes. */
	readonly notes: readonly RollNote[];
	/** Steps that play, 1–64. */
	readonly length: number;
	/** Track scale as shown ("1", "16", "1/2"). */
	readonly scale: string;
	/** Pinned with `shift + bar` (stays up until `bar` is pressed again). */
	readonly pinned: boolean;
	/** Over M1–M4: what `bar + M1 / M2 / M4` clear. */
	readonly soft: readonly (SoftLabel | null)[];
	/** How far the clear labels have slid up into place, 0…1. */
	readonly slide: number;
	/** `bar` came up: the card fades out over the page, which is no longer dimmed. */
	readonly going: boolean;
	/** The card's opacity: 1 while it is up, falling to 0 as it goes. */
	readonly fade: number;
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

/** One encoder's card on the player page, in words (the page draws pictures). */
export interface PlayerCard {
	readonly label: string;
	readonly value: string;
}

/** Maestro as its page shows it. */
export interface MaestroView {
	readonly roll: number;
	/** Index into MAESTRO_PATTERNS. */
	readonly pattern: number;
	readonly hold: boolean;
	/** Notes in the stored chord (a slab stands for each, up to eight). */
	readonly notes: number;
	/** The chord's lowest note ("d5"), or null. */
	readonly root: string | null;
	/** The chord is sounding (the slabs stand tall). */
	readonly sounding: boolean;
}

/** The player page (`player`; manual: players/*), as the device draws it (research 59 §2.7). */
export interface PlayerFrame {
	readonly page: 'player';
	readonly type: PlayerType;
	/** Switched on with the second press of `player`. */
	readonly on: boolean;
	/** The arpeggio's shift layer (note length, style, glide, stereo). */
	readonly shift: boolean;
	/** E1–E4 in words, for screen readers and the agent; an empty label leaves the encoder unused. */
	readonly cards: readonly PlayerCard[];
	/** The arpeggio's settings, which its cards picture; null on the other players. */
	readonly arp: ArpSettings | null;
	/** Maestro's settings and chord; null on the other players. */
	readonly maestro: MaestroView | null;
	/** Arpeggio: one cycle of the run, each note as its rank among the run's pitches (0 = lowest). */
	readonly run: readonly number[];
	/** The run's note sounding now (index into `run`), or null. */
	readonly at: number | null;
	/** `shift + player`: the list of players over the page, for this track (numbered from 1). */
	readonly list: { readonly track: number } | null;
}

/**
 * A step held on an instrument page (manual: sequencer/parameter-locks): the page as it plays on
 * that step, its locks applied, and the step's number in a box over it; the box turns orange while
 * a lock is being written (research 59 §2.8).
 */
export interface LockFrame {
	readonly page: 'lock';
	/** The module page with the step's values. */
	readonly base: ScreenFrame;
	/** The held step, numbered from 1 across the pattern. */
	readonly step: number;
	/** An encoder just wrote a lock on it. */
	readonly locking: boolean;
	/** Locks the step carries. */
	readonly locks: number;
	/** The parameter locked last on this step, as shown, or null. */
	readonly last: { readonly label: string; readonly value: string } | null;
}

/**
 * Popups that come up over whatever page is showing and go by themselves (research 59 §2.8,
 * §2.12): the keyboard's octave after [-] / [+], and "copied" once a held step is copied. Each
 * carries its opacity (1, falling to 0 as it fades).
 */
export interface PopupFrame {
	readonly page: 'popup';
	/** The page under the popups. */
	readonly base: ScreenFrame;
	/** The octave the keyboard plays now (−3…3), or null. */
	readonly octave: { readonly value: number; readonly alpha: number } | null;
	/** "copied" over the top bar, or null. */
	readonly copied: { readonly alpha: number } | null;
}

/** Every frame of the sequencer area. */
export type SequencerFrame = BarFrame | ComponentsFrame | PlayerFrame | LockFrame | PopupFrame;
