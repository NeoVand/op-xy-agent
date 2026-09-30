/**
 * The lab as a program sees it (`run_lab`). The program is the body of an async function with `lab`
 * and `console` in scope. It works on forks, which are copies of the replica, and changes the
 * replica only through `lab.commit`: when the program ends without an error, what the committed fork
 * changed lands on the replica as one change the user can undo. A program that throws or runs out
 * of time changes nothing. There is no network, no storage, no page and no connected OP-XY.
 *
 * Numbers are the device's: tracks 1–16 (1–8 instrument, 9–16 auxiliary), patterns 1–16, scenes
 * 1–99, steps 1–64 (bar 2 starts at step 17; at track scale 1 a step is a sixteenth). Only a MIDI
 * file as read (`MidiFileNotes`) counts from 0: its `notes[].track`, `tracks[].index` and channels
 * (channel 9 is GM drums).
 */
import type { MidiFileNotes } from '$lib/core/music/midifile';
import type { SummaryData } from '$lib/core/listen';
import type { ImportPlan } from '../midi-import';
import type {
	ArrangementWrite,
	VirtualArrangement,
	VirtualPattern,
	VirtualStatus,
	VirtualTrackSound
} from '../virtual-opxy';

export type { ImportPlan, MidiFileNotes, SummaryData };

/** The lab: forks, files, MIDI arranging, listening, committing and printing. */
export interface Lab {
	/** Files attached in this conversation. */
	readonly files: LabFiles;
	/** MIDI files arranged onto a fork by the same planner as import_midi. */
	readonly midi: LabMidi;
	/**
	 * A copy of the replica as it stands (after the commits made so far in this program), or of
	 * `from`, another fork, with its changes. Forks never touch each other or the replica.
	 */
	fork(from?: Fork): Fork;
	/**
	 * Renders a fork offline through the replica's own sound and hears it: loudness (LUFS), tone,
	 * stereo, tempo and timing, where the hits sit in the beat, key and chords, and flags worth acting
	 * on. It plays from the top as play would (the song from its first scene), or one scene looping.
	 * The song does not move on to its next scene while it renders, so hear a later part by its scene.
	 */
	listen(fork: Fork, options?: ListenOptions): Promise<Heard>;
	/**
	 * Marks a fork for the replica: when the program ends without an error, what the fork changed
	 * (sounds, patterns, scenes, song, tempo, mixer) lands on the replica, and what it left alone
	 * stays as the replica has it. Returns what changes. Later forks start from the committed state.
	 */
	commit(fork: Fork, label: string): ReplicaDiff;
	/** Prints values for you to read in the result (console.log does the same). */
	log(...values: unknown[]): void;
}

/** Attached files. */
export interface LabFiles {
	/** The names of the MIDI files attached so far. */
	names(): string[];
	/**
	 * A MIDI file's notes, read by the app: `notes` (note, start and duration in beats, velocity,
	 * channel 0–15, track 0-based), `tempos`, `meters`, `keys`, `tracks` (index 0-based, name,
	 * channels, programs, noteCount, lowest, highest), `beats` and `seconds`.
	 */
	midi(name: string): MidiFileNotes;
}

/** What one track of a MIDI file plays. */
export interface TrackShape {
	/** The track's number as the attachment lists it and `plan` takes it: its index + 1. */
	readonly midi: number;
	readonly name: string | null;
	/** Its channels, 1–16 (10 is GM drums). */
	readonly channels: readonly number[];
	readonly notes: number;
	/** "C2–G4", or drum note numbers ("notes 36–46"). */
	readonly range: string;
	/** Every note on channel 10. */
	readonly drums: boolean;
	/** Its GM instrument when the file names one ("Electric Bass (finger)"). */
	readonly instrument: string | null;
	/** The bars it plays in, a melody line or chords, a track it doubles, melodies it takes turns with. */
	readonly shape: readonly string[];
}

/** Which file tracks go where, as import_midi takes them. */
export interface MidiPlanOptions {
	readonly tracks: readonly {
		/** The file's track, 1-based (a shape's `midi`). */
		readonly midi: number;
		/** OP-XY instrument track 1–8; several file tracks may share one. */
		readonly to: number;
		/** Semitones up or down, −48…48. */
		readonly transpose?: number;
		/** GM drums onto the kit's layout (default: a track on channel 10). */
		readonly drums?: boolean;
	}[];
	/** The first and last bar to take (default: from where the chosen tracks start to where they end). */
	readonly fromBar?: number;
	readonly toBar?: number;
}

/** MIDI files onto forks. A file is one `lab.files.midi` read (reshaped, if you like), or its name. */
export interface LabMidi {
	/** Each track with notes: its number, channels, range and what it plays. */
	shapes(file: MidiFileNotes | string): TrackShape[];
	/**
	 * Plans an import without writing anything: 4-bar patterns (16 per track), a scene per block, the
	 * song. `plan.tracks[i]` says per OP-XY track how many notes it holds (`notes`), how many blocks
	 * play the closest of its patterns (`folded`) and the share of its notes that play as written
	 * (`asWritten`, 0–1); `plan.notes` says what the OP-XY cannot carry.
	 */
	plan(file: MidiFileNotes | string, options: MidiPlanOptions): ImportPlan;
	/**
	 * Writes a plan onto a fork as import_midi does: the tempo, the patterns at track scale 1, the
	 * scenes and the song, the tracks left out resting (unless keepOthers) and the metronome off.
	 */
	write(fork: Fork, plan: ImportPlan, options?: { readonly keepOthers?: boolean }): MidiWrite;
}

/** What writing a plan did. */
export interface MidiWrite {
	readonly bpm: number;
	readonly patterns: number;
	readonly scenes: number;
	/** The song's length in scenes. */
	readonly song: number;
	/** Tracks left out that rest during the song (their own patterns are kept). */
	readonly resting: readonly number[];
	/** Tracks left out that keep playing (16 patterns, none empty). */
	readonly stillPlaying: readonly number[];
	/** The metronome was on and is off now. */
	readonly metronomeOff: boolean;
}

/** How to listen. */
export interface ListenOptions {
	/** Seconds to hear, 1–30 (default 8; each track alone 4). */
	readonly seconds?: number;
	/** `'each'`: every instrument track that plays, heard alone; or a list of tracks 1–8. */
	readonly tracks?: 'each' | readonly number[];
	/** A scene 1–99 looping, instead of what play starts. */
	readonly scene?: number;
}

/** What a fork sounds like. */
export interface Heard {
	/** A few short lines in words. */
	readonly text: string;
	/** What is worth fixing or checking ("clipping", "off-tempo", …); empty when nothing stands out. */
	readonly flags: readonly string[];
	/** The numbers: level (lufs, peak), tone, stereo, rhythm (bpm, onsets, swing, drums), harmony (key, chords); null for tracks alone. */
	readonly data: SummaryData | null;
	/** Each track heard alone, when asked for. */
	readonly tracks?: readonly {
		readonly track: number;
		readonly name: string;
		readonly flags: readonly string[];
		readonly data: SummaryData;
	}[];
}

/** What differs between two states of the replica. */
export interface ReplicaDiff {
	/** Nothing differs. */
	readonly same: boolean;
	/**
	 * Each difference in words: "tempo 120 → 107 bpm", "T3 M3 filter: cutoff 70 → 40", "T1 pattern 2:
	 * new, 24 notes, 4 bars", "song: 1 → 1 2 1 3".
	 */
	readonly changes: readonly string[];
}

/** A setting as plan_steps takes it. */
export interface Setting {
	/** Its name as the page shows it or a common word: "cutoff", "amp release", "engine", "preset", "size". */
	readonly param: string;
	/** A number as the screen shows it (0–99 for most, bpm for tempo) or its text ("ladder", "1/16"). */
	readonly value: number | string;
	/** Track 1–16 (default: the selected one). */
	readonly track?: number;
	/** Where it lives when not an instrument track's parameter. */
	readonly area?:
		'instrument' | 'tempo' | 'auxiliary' | 'mix' | 'player' | 'arrange' | 'bar' | 'sample' | 'com';
	/** The M-page, 1–4. */
	readonly page?: number;
	/** A sampler track's key: "G3", its sample's name ("snare 1"), or 1–24. */
	readonly key?: number | string;
}

/** What `set` did, or what `plan` would do. */
export interface SetResult {
	/** Every setting reads its value (set throws when one cannot be reached). */
	readonly reached: boolean;
	/** The keys, in the key grammar ("T3", "M3", "turn E1 ×-12"). */
	readonly steps: readonly string[];
	/** What the screen shows after them. */
	readonly screen: string;
	/** Why a setting was not reached, from `plan`. */
	readonly note?: string;
}

/** What to write onto a pattern; it replaces the pattern's notes. */
export interface PatternWrite {
	/** Pattern 1–16 (default 1); patterns missing up to it are added empty. */
	readonly pattern?: number;
	/** Bars 1–4 (default: enough for the last step written). */
	readonly bars?: number;
	/** Steps that play, when the last bar is shorter (default: all). */
	readonly length?: number;
	/** Track scale: how many sixteenths a step lasts, 1–8, 16 or 0.5 (default: unchanged). */
	readonly scale?: number;
	/** At most 120, in any order; an empty list clears the pattern. */
	readonly notes: readonly {
		/** 1–64. */
		readonly step: number;
		/** A MIDI note (60 = C4) or a name ("F#3"); on a drum track one sound per note, 53–76. */
		readonly note: number | string;
		/** 1–127 (default 100). */
		readonly velocity?: number;
		/** In steps (default 1). */
		readonly length?: number;
		/** What readPattern says a drum note plays; ignored here (the note decides). */
		readonly sound?: string;
	}[];
}

/** A fork's status: the virtual OP-XY's, without the browser's sound (a fork makes none). */
export type ForkStatus = Omit<VirtualStatus, 'sound'>;
/** A pattern as it stands: track, pattern, patterns (on the track), playing, bars, length, scale, notes. */
export type Pattern = VirtualPattern;
/** Scenes (each the pattern of every track, index 0 = track 1) and the song (order, loop). */
export type Arrangement = VirtualArrangement;
/** An instrument track's sound: engine, preset, each page as its screen reads, mix, a drum track's kit. */
export type TrackSound = VirtualTrackSound;
export type { ArrangementWrite };

/** A copy of the replica with the replica's own calls, the keys and the navigator. */
export interface Fork {
	/** "fork 1", "fork 2", … as the logs and diffs name it. */
	readonly name: string;
	/** Tempo, selected track, every track at a glance, the arrangement, the metronome. */
	status(): ForkStatus;
	/** A pattern (default: the one the track plays). */
	readPattern(track: number, pattern?: number): Pattern;
	/** Writes a pattern and makes it the one the track plays. */
	writePattern(track: number, write: PatternWrite): Pattern;
	readArrangement(): Arrangement;
	/** Sets scenes (`patterns: null` clears one; tracks left out play pattern 1) and the song (`order`, `loop`). */
	writeArrangement(write: ArrangementWrite): Arrangement;
	/** An instrument track's whole sound (1–8), each page as its screen shows it. */
	readSound(track: number): TrackSound;
	/** 40–220 bpm. */
	setTempo(bpm: number): void;
	setMetronome(on: boolean): void;
	setMuted(track: number, muted: boolean): void;
	selectTrack(track: number): void;
	/**
	 * Sets values through the keys, as a person would: the navigator's steps, played on this fork.
	 * Several settings go in order (an engine or preset first: it resets the sound). Throws when a
	 * setting cannot be reached, saying why.
	 */
	set(setting: Setting | readonly Setting[]): SetResult;
	/** The steps `set` would play from where the fork stands, without playing them. */
	plan(setting: Setting | readonly Setting[]): SetResult;
	/**
	 * Presses a key combo in the key grammar ("shift + M1", "T3", "record + play"); a turn takes its
	 * detents ("turn E2", 5; negative turns left). Returns what the screen shows after it.
	 */
	press(keys: string, clicks?: number): string;
	/** What the fork's screen shows, in words. */
	screen(): string;
	/** What this fork changed from where it was forked, or how it differs from `against`. */
	diff(against?: Fork): ReplicaDiff;
}
