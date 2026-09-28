/**
 * The app's virtual OP-XY as the agent sees it: the replica's simulator and its sound. With no
 * device connected the live tools (transport, tempo, track, mute, note previews) act on it and the
 * user hears it in the browser; the programming tools (patterns, scenes, the song) always write to
 * it, since the real device cannot receive patterns over MIDI. The app implements this interface
 * (`$lib/app/virtual.ts`); tests run it on a bare simulator.
 *
 * Numbers are the ones a person reads off the device: tracks 1–16 (9–16 auxiliary), patterns 1–16,
 * scenes 1–99, steps 1–64 (bar 2 starts at step 17).
 */

import type { NavPlan, ParamGoal, Place } from '$lib/sim/navigator';

/** Where to take the virtual OP-XY: a page, or a parameter set to a value. */
export type NavGoal = { readonly place: Place } | ParamGoal;

/** A note on a pattern. */
export interface VirtualNote {
	/** Step 1–64. */
	readonly step: number;
	/** MIDI note (60 = middle C; on drum tracks one sound per note, 53–76). */
	readonly note: number;
	/** 1–127. */
	readonly velocity: number;
	/** In steps (1 = a sixteenth at track scale 1). */
	readonly length: number;
}

/** A track's pattern as it stands. */
export interface VirtualPattern {
	readonly track: number;
	readonly pattern: number;
	/** Patterns the track has. */
	readonly patterns: number;
	/** Whether this pattern is the one the track plays. */
	readonly playing: boolean;
	readonly bars: number;
	/** Steps that play (the last bar may be shorter). */
	readonly length: number;
	/** Track scale: 1–8, 16 or 0.5 (a step lasts that many sixteenths). */
	readonly scale: number;
	readonly notes: readonly VirtualNote[];
}

/** What to write onto a pattern. It replaces the pattern's notes, locks and components. */
export interface PatternWrite {
	/** Pattern 1–16; patterns missing up to it are added empty. */
	readonly pattern: number;
	/** 1–4. */
	readonly bars: number;
	/** Steps that play, up to bars × 16 (default: all of them). */
	readonly length?: number;
	/** Track scale (default: leave it). */
	readonly scale?: number;
	readonly notes: readonly VirtualNote[];
}

/** A scene: the pattern each of the 16 tracks plays in it (index 0 = track 1). */
export interface VirtualScene {
	readonly scene: number;
	readonly patterns: readonly number[];
}

/** Scenes and the song. */
export interface VirtualArrangement {
	/** The scene the tracks play now. */
	readonly scene: number;
	/** Scenes that hold something, in order. */
	readonly scenes: readonly VirtualScene[];
	/** The song's scene order (scene numbers) and whether it loops. */
	readonly song: { readonly order: readonly number[]; readonly loop: boolean };
}

/** Scenes to set or clear, and the song's order. */
export interface ArrangementWrite {
	/** `patterns` null clears the scene; tracks left out of a scene play their pattern 1. */
	readonly scenes?: readonly {
		readonly scene: number;
		readonly patterns: readonly { readonly track: number; readonly pattern: number }[] | null;
	}[];
	readonly song?: { readonly order: readonly number[]; readonly loop: boolean };
}

/** A track at a glance. */
export interface VirtualTrack {
	readonly track: number;
	/** Engine ("drum", "prism" …) for instrument tracks, the aux track's name for 9–16. */
	readonly engine: string;
	readonly patterns: number;
	/** The pattern it plays. */
	readonly current: number;
	/** Notes in the pattern it plays. */
	readonly notes: number;
	readonly muted: boolean;
}

/** The virtual OP-XY at a glance. */
export interface VirtualStatus {
	readonly bpm: number;
	readonly playing: boolean;
	/** The selected track, 1–16. */
	readonly selectedTrack: number;
	readonly tracks: readonly VirtualTrack[];
	readonly arrangement: VirtualArrangement;
	/** Whether the browser makes its sound: on, off (the switch), or unavailable (no audio). */
	readonly sound: 'on' | 'off' | 'unavailable';
}

/** The virtual OP-XY. */
export interface VirtualOpxy {
	status(): VirtualStatus;
	/** Starts (the song, when it has more than one entry) or stops the transport. */
	transport(action: 'play' | 'stop'): void;
	setTempo(bpm: number): void;
	selectTrack(track: number): void;
	setMuted(track: number, muted: boolean): void;
	/** Sounds a note now in the browser; false when sound is off or unavailable. */
	preview(track: number, note: number, velocity: number, seconds: number): boolean;
	/** A pattern (default: the one the track plays). */
	readPattern(track: number, pattern?: number): VirtualPattern;
	/** Writes a pattern and makes it the one the track plays. */
	writePattern(track: number, write: PatternWrite): VirtualPattern;
	readArrangement(): VirtualArrangement;
	writeArrangement(write: ArrangementWrite): VirtualArrangement;
	/**
	 * The exact steps from where the virtual OP-XY stands to `goal`, played on a copy of it (the
	 * virtual OP-XY itself does not move) and reporting whether they got there.
	 */
	plan(goal: NavGoal): NavPlan;
}
