/**
 * Frames the arrange area draws (see `../types.ts`): plain data in the units the pages draw (design
 * pixels on the 480 × 220 grid, display strings, colours of the screen palette).
 */

/** A soft label over M1–M4: text, or one of TE's arrow pictograms (song mode's cursor keys). */
export interface ArrangeSoftLabel {
	readonly text: string;
	readonly icon?: 'arrange.left' | 'arrange.right';
	/** light = available (arrange always, song mode while shift is held), dim = song mode's rest. */
	readonly tone: 'light' | 'dim';
}

/** One pattern as a block: on the band (a track not selected) or in the selected track's stack. */
export interface ArrangeBlock {
	/** Top and bottom edges of the fill (px). */
	readonly top: number;
	readonly bottom: number;
	/** The line the notes are centred on: the pattern's place in the stack, which the fill can overrun. */
	readonly centre: number;
	/** Fill: a step of the grey ramp. */
	readonly color: string;
	/** Colour of the number and the notes on it. */
	readonly ink: string;
	/** The pattern's number (1–16), or null on the band, which shows none. */
	readonly number: number | null;
	/** The notes as dashes: [x from the column's left, y from `centre`, length] (px). */
	readonly notes: readonly (readonly [number, number, number])[];
}

/** One track's column. */
export interface ArrangeColumn {
	/** Spoken name ("T3", "tape"). */
	readonly name: string;
	/** The auxiliary track's pictogram, shown over its column while selected; null for T1–T8. */
	readonly icon: string | null;
	/** The instrument track's number, shown over its column while selected. */
	readonly label: string;
	/** The track the keys act on: its stack of patterns stands where its band segment was. */
	readonly selected: boolean;
	readonly muted: boolean;
	/** Sound link is on. */
	readonly linked: boolean;
	/** The pattern playing (1-based) and how many the track has. */
	readonly pattern: number;
	readonly patterns: number;
	/** The band segment, or the selected track's stack (any block may run off the screen). */
	readonly blocks: readonly ArrangeBlock[];
	/** Edges of the patterns stacked before and after the one playing (0–3), on other tracks. */
	readonly above: number;
	readonly below: number;
}

/** Arrange mode: the band of eight tracks, the selected one's stack, and the scene. */
export interface PatternsFrame {
	readonly page: 'arrange';
	readonly bank: 'instrument' | 'auxiliary';
	/** The scene in the box ("10"), or the digits of a scene number being typed ("2-"). */
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
	/** How far the playing scene has got (0–1) while the song plays: the ring's notch; else null. */
	readonly progress: number | null;
}

/** Song mode: the song order, eight entries a row, four rows shown. */
export interface SongFrame {
	readonly page: 'song';
	/** 1–14. */
	readonly song: number;
	readonly loop: boolean;
	/** Entries in the song order. */
	readonly length: number;
	/** The header's count: how many scenes the song holds, two digits ("05"). */
	readonly count: string;
	/** The slot the cursor stands before (1-based). */
	readonly at: number;
	/** Number of the first slot shown (1, 9, 17, …). */
	readonly first: number;
	/** The 32 slots shown, row by row; null = empty. */
	readonly slots: readonly (SongSlot | null)[];
	/** The slot (0–31) whose left edge carries the cursor, or null. */
	readonly cursor: number | null;
	/** Shift is held: the soft labels light up and the cursor shows. */
	readonly lit: boolean;
	/** A song is playing. */
	readonly playing: boolean;
	readonly soft: readonly (ArrangeSoftLabel | null)[];
}

/** Every frame of the arrange area. */
export type ArrangeFrame = PatternsFrame | SongFrame;
