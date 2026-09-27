/**
 * Frames the arrange area draws (see `../types.ts`): plain data in the units the pages draw (design
 * pixels on the 480 × 220 grid, display strings, colours of the screen palette).
 */

/** A soft label over M1–M4: text, or one of TE's arrow pictograms (song mode's cursor keys). */
export interface ArrangeSoftLabel {
	readonly text: string;
	readonly icon?: 'arrange.left' | 'arrange.right';
	/** white = the key's main action, grey = the others (arrange-003), light = song mode (arrange-028). */
	readonly tone: 'white' | 'grey' | 'light';
}

/** One pattern drawn as a 60 × 30 cell of its track's column. */
export interface ArrangeCell {
	/** Top edge (px). */
	readonly y: number;
	/** Fill: a step of the grey ramp. */
	readonly color: string;
	/** Colour of the number and the note dots on it. */
	readonly ink: string;
	/** The pattern's number (1–16), when it is shown. */
	readonly number: number | null;
	/** TE's thin light edge, so a black cell shows on the black screen. */
	readonly outline: boolean;
	/** The notes as a tiny piano roll: each dot's top-left corner relative to the cell (px). */
	readonly dots: readonly (readonly [number, number])[];
}

/** One track's column. */
export interface ArrangeColumn {
	/** Spoken name ("T3", "tape"). */
	readonly name: string;
	/** The auxiliary track's pictogram, or null for an instrument track (its number is shown). */
	readonly icon: string | null;
	readonly label: string;
	/** The track the keys act on: its pictogram is lit and its whole stack of patterns is open. */
	readonly selected: boolean;
	readonly muted: boolean;
	/** Sound link is on. */
	readonly linked: boolean;
	/** The pattern playing (1-based) and how many the track has. */
	readonly pattern: number;
	readonly patterns: number;
	readonly cells: readonly ArrangeCell[];
	/** Edges of the patterns stacked before and after the one playing (0–3), on closed columns. */
	readonly above: number;
	readonly below: number;
}

/** Arrange mode (guide art arrange-003, arrange-020): eight track columns and the scene. */
export interface PatternsFrame {
	readonly page: 'arrange';
	readonly bank: 'instrument' | 'auxiliary';
	/** The scene in the red box ("10"), or the digits of a scene number being typed ("2-"). */
	readonly scene: string;
	/** A scene waiting for the current one to end ("12"), '' while shift + play waits for one. */
	readonly queued: string | null;
	readonly columns: readonly ArrangeColumn[];
	readonly soft: readonly (ArrangeSoftLabel | null)[];
}

/** One entry of the song order. */
export interface SongSlot {
	/** The scene number ("99"), or the digits being typed ("9-"). */
	readonly scene: string;
	/** The song's position (the white ring). */
	readonly playing: boolean;
	/** Cued with shift + [-] / [+]. */
	readonly cued: boolean;
}

/** Song mode (guide art arrange-028): the song order, eight entries a row, four rows shown. */
export interface SongFrame {
	readonly page: 'song';
	/** 1–14. */
	readonly song: number;
	readonly loop: boolean;
	/** Entries in the song order. */
	readonly length: number;
	/** The slot at the cursor, two digits ("06"). */
	readonly count: string;
	/** Number of the first slot shown (1, 9, 17, …). */
	readonly first: number;
	/** The 32 slots shown, row by row; null = empty. */
	readonly slots: readonly (SongSlot | null)[];
	/** The slot (0–31) whose left edge carries the cursor, or null. */
	readonly cursor: number | null;
	/** A song is playing. */
	readonly playing: boolean;
	readonly soft: readonly (ArrangeSoftLabel | null)[];
}

/** Every frame of the arrange area. */
export type ArrangeFrame = PatternsFrame | SongFrame;
