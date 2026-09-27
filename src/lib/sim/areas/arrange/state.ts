/**
 * The arrange area's part of the simulator state (see `../types.ts`). Plain, serialisable data:
 * the 99 scenes, the 14 songs, the scene queue, sound link and the sounds each pattern carries,
 * and the clipboards of M2 / M3. Which pattern a track plays lives with the track itself
 * (`sequence.current`); the scenes remember it per scene. Limits are the manual's
 * (arrange/scenes, arrange/song-mode, arrange/songs); the layout of a scene follows the device's
 * project file, which keeps one pattern choice and one mute per track for all 16 tracks.
 */
import type { TrackState } from '../../params';
import type { Pattern } from '../../sequencer';
import type { BrainSettings } from '../auxiliary/state';

/** Scenes in a project, songs in a project, scenes in one song (manual: arrange/scenes, songs). */
export const SCENES = 99;
export const SONGS = 14;
export const SONG_LENGTH = 96;
/** Tracks a scene addresses: the eight instrument tracks, then the eight auxiliary ones. */
export const SCENE_TRACKS = 16;

/**
 * How a scene's length can be worked out, a project setting since OS 1.1.0 (manual:
 * project/settings): the three modes a project file knows (docs/research/10-xy-format.md §3.2). The
 * setting itself is the project's, on its settings page (the system area's state).
 */
export const SCENE_LENGTH_MODES = ['longest', 'shortest', 'time signature'] as const;
export type SceneLengthMode = (typeof SCENE_LENGTH_MODES)[number];

/** Time signatures of the project's tempo settings (manual: project/settings). */
export const TIME_SIGNATURES = ['3/4', '4/4', '5/4', '6/8', '7/8', '12/8'] as const;
export type TimeSignature = (typeof TIME_SIGNATURES)[number];

/** What the module keys do to patterns in arrange. */
export type PatternAction = 'new' | 'copy' | 'paste' | 'clear';

/**
 * The pattern action on M1…M4. The manual (arrange/patterns) gives M1 new, M2 copy, M3 paste and
 * M4 clear (remove); TE's screen art labels the keys the other way round at the ends (clear, copy,
 * paste, new). We follow the manual until a unit settles it: reversing this list moves both the
 * labels and the actions.
 */
export const PATTERN_KEYS: readonly PatternAction[] = ['new', 'copy', 'paste', 'clear'];

/** One track's mix as a scene keeps it. */
export interface SceneMix {
	level: number;
	pan: number;
	muted: boolean;
}

/** A scene: the pattern each of the 16 tracks plays (0-based) and their mix (manual: arrange/scenes). */
export interface Scene {
	patterns: number[];
	mix: SceneMix[];
}

/** A song: the order its scenes play in (0-based scene numbers) and whether it loops. */
export interface Song {
	order: number[];
	loop: boolean;
}

/**
 * The sound a pattern of an instrument track carries: the engine and every page's settings, but
 * not the mix (a scene keeps that) or what the pages show (the selected drum key, the envelope M2
 * edits). Auxiliary tracks' settings belong to the auxiliary area and are not swapped here.
 */
export type PatternSound = Pick<
	TrackState,
	| 'engine'
	| 'm1'
	| 'amp'
	| 'filterEnv'
	| 'playMode'
	| 'filter'
	| 'sends'
	| 'lfo'
	| 'drumKeys'
	| 'midi'
>;

/** Sound link of one track (manual: arrange/sound-link): on, and the pattern whose sound it keeps. */
export interface SoundLink {
	on: boolean;
	source: number;
}

/**
 * A copied pattern with the sound it played with (null when it came from an auxiliary track) and,
 * from the brain track, its brain settings (kept per pattern since OS 1.0.29; null otherwise).
 */
export interface PatternClip {
	pattern: Pattern;
	sound: PatternSound | null;
	brain: BrainSettings | null;
}

/** A scene number being typed after `accidental 0` (scenes 10–99), and what it is for. */
export interface SceneEntry {
	digits: number[];
	purpose: 'select' | 'queue' | 'song';
}

/** What the arrange area remembers. */
export interface ArrangeState {
	/** The pattern overview, or the song editor (shift + arrange). */
	view: 'patterns' | 'song';
	/** The scene playing (0-based). */
	scene: number;
	/**
	 * Every scene's record; null = empty (never used). The current scene's record is refreshed from
	 * the tracks whenever the scene is left, copied or cloned: while current, the tracks are the truth.
	 */
	scenes: (Scene | null)[];
	/** A scene waiting for the current one to end (shift + play, then a scene), or null. */
	queued: number | null;
	/** Shift + play was tapped: the next scene chosen is queued. */
	armed: boolean;
	/** A two-digit scene number in progress, or null. */
	entry: SceneEntry | null;
	/**
	 * The sound each pattern of each instrument track carries, index for index with its patterns;
	 * null = none stored yet (the pattern takes whatever the track plays when it is reached).
	 */
	sounds: (PatternSound | null)[][];
	/** Sound link per track, all 16 (instrument then auxiliary). */
	link: SoundLink[];
	/** What M2 / shift + M2 / natural + M2 copied last. */
	clipboard: { pattern: PatternClip | null; scene: Scene | null; song: Song | null };
	/** The 14 songs; a new project's songs each hold scene 1 and loop (the device's defaults). */
	songs: Song[];
	/** The song chosen (0-based), remembered while song mode is closed. */
	song: number;
	/** The song editor's cursor: how many entries stand before it (0…length). */
	cursor: number;
	/** The first row of eight entries the song editor shows. */
	scroll: number;
	/** A song is playing (play was pressed in song mode). */
	playing: boolean;
	/** The song entry playing (0-based; −1 = the song starts at the next scene end). */
	position: number;
	/** An entry cued with shift + [-] / [+], taken at the next scene end, or null. */
	cue: number | null;
}

/** The arrange area's state in a new project. */
export function initialArrange(): ArrangeState {
	return {
		view: 'patterns',
		scene: 0,
		scenes: Array.from({ length: SCENES }, () => null),
		queued: null,
		armed: false,
		entry: null,
		sounds: Array.from({ length: 8 }, () => [null]),
		link: Array.from({ length: SCENE_TRACKS }, () => ({ on: false, source: 0 })),
		clipboard: { pattern: null, scene: null, song: null },
		songs: Array.from({ length: SONGS }, () => ({ order: [0], loop: true })),
		song: 0,
		cursor: 1,
		scroll: 0,
		playing: false,
		position: 0,
		cue: null
	};
}
