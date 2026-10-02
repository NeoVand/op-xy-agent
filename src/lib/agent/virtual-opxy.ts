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

import type { ControlId } from '$lib/core/opxy';
import type {
	NavPlan,
	PageValueGoal,
	ParamGoal,
	Place,
	SettingGoal,
	SettingsPlan
} from '$lib/sim/navigator';

/**
 * Where to take the virtual OP-XY: a page, a parameter set to a value, a value another page shows,
 * several settings of either kind in a row, or where a setting is made (`to`, changing nothing).
 */
export type NavGoal =
	| { readonly place: Place }
	| ParamGoal
	| { readonly settings: readonly SettingGoal[] }
	| { readonly to: SettingGoal }
	| PageValueGoal;

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
	/** On a drum track, the sound on the note's key ("kick 1", "closed hat 2"), when reading. */
	readonly sound?: string;
	/**
	 * Off the grid by this much of a step, −0.5 … 0.5 (a live take's timing, a nudge), when not 0:
	 * read back, and kept by writes that start from the pattern.
	 */
	readonly offset?: number;
}

/** A step's parameter locks as stored, by parameter id ("cutoff": 40), for writes that keep them. */
export interface StepLocks {
	readonly step: number;
	readonly values: Readonly<Record<string, number>>;
}

/** A track's pattern as it stands. */
export interface VirtualPattern {
	readonly track: number;
	readonly pattern: number;
	/** Patterns the track has. */
	readonly patterns: number;
	/** Whether this pattern is the track's current one (it plays when the replica plays). */
	readonly current: boolean;
	readonly bars: number;
	/** Steps that play (the last bar may be shorter). */
	readonly length: number;
	/** Track scale: 1–8, 16 or 0.5 (a step lasts that many sixteenths). */
	readonly scale: number;
	readonly notes: readonly VirtualNote[];
	/** Step components on its steps (random, skip trigger, multiply …), when it has any. */
	readonly components?: readonly VirtualComponent[];
	/** The bar menu's groove amount for this pattern, when set: it replaces the tempo page's. */
	readonly groove?: number;
	/** Parameter locks on its steps, each value as its page shows it ("cutoff 80"), when any. */
	readonly locks?: readonly { readonly step: number; readonly values: readonly string[] }[];
	/** The same locks as stored, for a write that keeps them (a bar written alone, a transpose). */
	readonly stepLocks?: readonly StepLocks[];
	/**
	 * The bar menu's quantisation, 0–100, when not the new pattern's 100 (or "off"): how far notes
	 * off the grid are pulled onto it as they play.
	 */
	readonly quantise?: number | 'off';
}

/**
 * A step component (manual: sequencer/step-component-reference): its kind ("random", "skip
 * trigger"…) and its digit, 0–9 (0 means random for most).
 */
export interface VirtualComponent {
	readonly step: number;
	readonly kind: string;
	readonly value: number;
}

/**
 * What to write onto a pattern. It replaces the pattern's notes, locks and components with these
 * (a write that keeps some passes them back: notes with their offsets, `locks`).
 */
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
	/** Step components to put on its steps (each step holds a few at most). */
	readonly components?: readonly VirtualComponent[];
	/** Parameter locks to put on its steps, as readPattern's stepLocks give them (default none). */
	readonly locks?: readonly StepLocks[];
	/** The bar menu's quantisation, 0–100 (default: left as it is); setting it switches it on. */
	readonly quantise?: number;
	/** Make it the pattern the track plays (default); false edits it in place (a pattern card). */
	readonly play?: boolean;
	/**
	 * The pattern's own groove amount, the bar menu's (−99 … 99 on the tempo page's groove type,
	 * snapped to the device's detents; 0: the tempo page's amount); default: left as it is.
	 */
	readonly groove?: number;
}

/** A scene: the pattern each of the 16 tracks plays in it (index 0 = track 1). */
export interface VirtualScene {
	readonly scene: number;
	readonly patterns: readonly number[];
	/**
	 * How long the scene plays before a song moves on, in bars: its longest pattern with notes, by
	 * the project's scene length (a pattern lasts its steps times its track scale).
	 */
	readonly bars: number;
	/** Tracks muted in this scene (scenes keep their mix), when any. */
	readonly muted?: readonly number[];
	/** Each instrument track's level (0–99) in this scene, track 1 first. */
	readonly levels?: readonly number[];
}

/** Scenes and the song. */
export interface VirtualArrangement {
	/** The scene the tracks play now. */
	readonly scene: number;
	/**
	 * What play runs: the song in its order, or one scene round and round (a scene was picked, which
	 * holds it, or the song has one entry). While a song plays it is `song`.
	 */
	readonly plays: 'song' | 'scene';
	/** A scene waiting for the current one to end (shift + play, then the scene). */
	readonly queued?: number;
	/**
	 * Where the playhead is while it plays: the bar of the scene (1 = its first) and, while a song
	 * plays, its entry (1-based) — an agent asked "which part is it on?" could only guess.
	 */
	readonly at?: { readonly bar: number; readonly entry?: number };
	/** Scenes that hold something, in order. */
	readonly scenes: readonly VirtualScene[];
	/** The song's scene order (scene numbers) and whether it loops. */
	readonly song: { readonly order: readonly number[]; readonly loop: boolean };
	/**
	 * Steps (sixteenths) in a bar of the project's time signature (14 in 7/8): what scenes' bars
	 * and the playhead's bar count in. Default 16.
	 */
	readonly barSteps?: number;
}

/** Scenes to set or clear, and the song's order. */
export interface ArrangementWrite {
	/** `patterns` null clears the scene; tracks left out of a scene play their pattern 1. */
	readonly scenes?: readonly {
		readonly scene: number;
		readonly patterns: readonly { readonly track: number; readonly pattern: number }[] | null;
		/** Levels (0–99) and mutes this scene keeps for its tracks; tracks left out keep theirs. */
		readonly mix?: readonly {
			readonly track: number;
			readonly level?: number;
			readonly muted?: boolean;
		}[];
	}[];
	readonly song?: { readonly order: readonly number[]; readonly loop: boolean };
}

/** A track at a glance. */
export interface VirtualTrack {
	readonly track: number;
	/** Engine ("drum", "prism" …) for instrument tracks, the aux track's name for 9–16. */
	readonly engine: string;
	/** The preset an instrument track's sound came from ("bass/shoulder"), when it has one. */
	readonly preset?: string;
	readonly patterns: number;
	/** The pattern it plays. */
	readonly current: number;
	/** Notes in the pattern it plays. */
	readonly notes: number;
	/** Notes in each of its patterns, pattern 1 first (0: an empty pattern, where it rests). */
	readonly byPattern: readonly number[];
	readonly muted: boolean;
}

/** The virtual OP-XY at a glance. */
export interface VirtualStatus {
	readonly bpm: number;
	/** The project's time signature (project → M4, tempo): how readings group a pattern's bars. */
	readonly signature: string;
	readonly playing: boolean;
	/** The selected track, 1–16. */
	readonly selectedTrack: number;
	readonly tracks: readonly VirtualTrack[];
	readonly arrangement: VirtualArrangement;
	/** Whether the browser makes its sound: on, off (the switch), or unavailable (no audio). */
	readonly sound: 'on' | 'off' | 'unavailable';
	/**
	 * Whether the metronome clicks along, heard (the tempo page: on, with a level above 0); its click
	 * is in what the agent hears.
	 */
	readonly metronome?: boolean;
	/**
	 * Live recording on the selected track, when it is not off: armed for the first note, counting
	 * in, or on (latched: what is played lands in the pattern until stop).
	 */
	readonly recording?: 'armed' | 'count-in' | 'on';
	/** The tempo page's groove: its type ("shuffle") and amount (−99 shuffle … 99 swing, 0 none). */
	readonly groove?: { readonly type: string; readonly amount: number };
}

/** A drum kit's sounds, one per keyboard key (53–76). */
export interface VirtualKit {
	readonly name: string;
	readonly sounds: readonly {
		readonly key: number;
		/** What the sound is ("kick", "closed hat"), for its file name. */
		readonly name: string;
		readonly audio: { readonly sampleRate: number; readonly channels: readonly Float32Array[] };
	}[];
}

/** What {@link VirtualOpxy.loadKit} did. */
export interface VirtualKitLoad {
	readonly track: number;
	/** Keys that now hold one of the kit's sounds. */
	readonly keys: number;
	/** The track was another engine and is a drum sampler now. */
	readonly engineChanged: boolean;
	/** The browser can play the kit's audio (else the keys play the replica's stand-in sounds). */
	readonly audible: boolean;
}

/** An instrument track's sound on the replica, each page as its screen reads. */
export interface VirtualTrackSound {
	readonly track: number;
	readonly engine: string;
	/** The preset it was loaded from ("pluck/beach bum"), or null for an engine without one. */
	readonly preset: string | null;
	/**
	 * Each page as its screen reads ("prism: shape 15, ratio 2:1, detune 05, stereo 22"): the engine
	 * (M1; a drum track's selected key), both envelopes (M2), the play mode (shift M2), the filter
	 * (M3, with its envelope amount and key tracking), the sends (shift M3), the LFO (M4), the player.
	 */
	readonly pages: Readonly<Record<string, string>>;
	/** The mixer's level (0–99) and pan (−100 … 100) for the track, and whether it is muted. */
	readonly mix: { readonly level: number; readonly pan: number; readonly muted: boolean };
	/** What the sends feed: the effect FX I and FX II hold, as their pages read ("reverb: size 69, …"). */
	readonly fx?: { readonly 'FX I': string; readonly 'FX II': string };
	/** On a drum track, the sound on each key ("F3": "kick 1"). */
	readonly kit?: Readonly<Record<string, string>>;
	/** On a drum track, the keys whose own values are not a new key's ("C#4 closed hat 1": "pan -70"). */
	readonly keys?: Readonly<Record<string, string>>;
}

/** A step of a walkthrough: its keys, a turn's detents, and what the replica shows after it. */
export interface RehearsedStep {
	readonly keys: string;
	readonly clicks?: number;
	readonly screen: string;
	/** The replica's music after it, where a press changes that and not the screen. */
	readonly music?: string;
	/** Done once the screen no longer reads this (a turn with no value to reach). */
	readonly leave?: string;
}

/** The virtual OP-XY. */
export interface VirtualOpxy {
	status(): VirtualStatus;
	/**
	 * Starts (the song, when it has more than one entry) or stops the transport; play while it
	 * plays starts again from the top, as the play key does. With `scene`, play starts that scene
	 * from its top and loops it (stopped first, then picked, as a person would).
	 */
	transport(action: 'play' | 'stop', options?: { readonly scene?: number }): void;
	setTempo(bpm: number): void;
	/**
	 * Switches the metronome's click on or off (the tempo page's `click E4`); on at level 0 also
	 * brings its level back to a new project's, so it is heard.
	 */
	setMetronome(on: boolean): void;
	selectTrack(track: number): void;
	setMuted(track: number, muted: boolean): void;
	/** Sounds a note now in the browser; false when sound is off or unavailable. */
	preview(track: number, note: number, velocity: number, seconds: number): boolean;
	/** A pattern (default: the one the track plays). */
	readPattern(track: number, pattern?: number): VirtualPattern;
	/** Writes a pattern and makes it the one the track plays. */
	writePattern(track: number, write: PatternWrite): VirtualPattern;
	readArrangement(): VirtualArrangement;
	/** An instrument track's whole sound (1–8), as its pages show it. */
	readSound(track: number): VirtualTrackSound;
	writeArrangement(write: ArrangementWrite): VirtualArrangement;
	/**
	 * Puts a drum kit on an instrument track (1–8): the track becomes a drum sampler (keeping its key
	 * settings if it was one) whose keys hold the kit's sounds, so its patterns play the kit.
	 */
	loadKit(track: number, kit: VirtualKit): VirtualKitLoad;
	/**
	 * The exact steps from where the virtual OP-XY stands to `goal`, played on a copy of it (the
	 * virtual OP-XY itself does not move) and reporting whether they got there.
	 */
	plan(goal: NavGoal): NavPlan | SettingsPlan;
	/**
	 * A key sequence played on a copy, chord by chord (the virtual OP-XY does not move): each
	 * step's keys (held keys written out), and the screen and music it leaves, for a walkthrough
	 * the user follows key by key. Throws for keys outside the grammar, and for turns (their
	 * detents are a value's: plan one with plan_steps).
	 */
	rehearse(keys: string): readonly RehearsedStep[];
	/** The replica as it stands, to compare with later (a turn's grounding, the lab). */
	checkpoint(): VirtualCheckpoint;
	/** What changed since `checkpoint`, a line each in words; empty when nothing did. */
	changesSince(checkpoint: VirtualCheckpoint): readonly string[];
	/** The same changes, each with a shorter line for people and the keys that lead to it. */
	changedSince(checkpoint: VirtualCheckpoint): readonly ReplicaChange[];
	/**
	 * Puts the replica back as it was at `to`: its mode, pages and selected track as well as its
	 * sounds, notes and mutes, but not the transport; only where it still reads as `from` (default:
	 * as it stands), so what changed since stays. Returns whether anything changed.
	 */
	revert(to: VirtualCheckpoint, from?: VirtualCheckpoint): boolean;
}

/** The replica at one moment (opaque: its state, serialized). */
export interface VirtualCheckpoint {
	readonly state: string;
}

/** One change on the replica, as the agent reads it and as a person does, and where it lives. */
export interface ReplicaChange {
	/** The agent's line: "T3 M3 filter: svf filter on: cutoff 00, … → svf filter on: cutoff 40, …". */
	readonly line: string;
	/** Only what differs, for people: "T3 M3 filter: cutoff 00 → 40". */
	readonly brief: string;
	/** The keys that lead to it on the device: its track and page (`track.3`, `key.m3`). */
	readonly controls: readonly ControlId[];
}
