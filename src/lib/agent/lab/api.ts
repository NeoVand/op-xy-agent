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
	/**
	 * Offers a fork to the user as a take instead of committing it: when the program ends without an
	 * error, the chat shows each take offered (two or three a run, four at most) for the user to hear
	 * on the replica with the loop and keep one, or none. Nothing lands until they keep it. Returns
	 * what the take would change.
	 */
	offer(fork: Fork, label: string): ReplicaDiff;
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
	/** Seconds to hear, 1–30 (default 8, or the scene's whole length when longer, up to 30; each track alone 4). */
	readonly seconds?: number;
	/** `'each'`: every instrument track that plays, heard alone; or a list of tracks 1–8. */
	readonly tracks?: 'each' | readonly number[];
	/** A scene 1–99 looping, instead of what play starts. */
	readonly scene?: number;
	/**
	 * The song from one of its entries (1 = the first; bar: the bar of that entry's scene to start
	 * at), across the scenes that follow as the song plays them: to hear a change of part.
	 */
	readonly song?: { readonly entry?: number; readonly bar?: number };
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
		| 'instrument'
		| 'tempo'
		| 'auxiliary'
		| 'mix'
		| 'player'
		| 'arrange'
		| 'bar'
		| 'sample'
		| 'com'
		| 'project';
	/** The M-page, 1–4. */
	readonly page?: number;
	/** A sampler track's key: "G3", its sample's name ("snare 1"), or 1–24. */
	readonly key?: number | string;
	/** A parameter lock: the pattern step (1–64) whose own value this sets, the track's kept. */
	readonly step?: number;
	/**
	 * With step: the pattern whose step it locks, when not the one the track plays; with area bar:
	 * the pattern whose bar menu it sets (the track is switched to it and back, so what plays and
	 * the scenes stay as they were).
	 */
	readonly pattern?: number;
}

/** What `set` did, or what `plan` would do. */
export interface SetResult {
	/** Every setting reads its value (set throws when one cannot be reached). */
	readonly reached: boolean;
	/** The keys, in the key grammar ("T3", "M3", "turn E1 ×-12"). */
	readonly steps: readonly string[];
	/** What the screen shows after them. */
	readonly screen: string;
	/** Why a setting was not reached, from `plan`; from `set`, a groove that hardly reaches the notes. */
	readonly note?: string;
}

/** What to write onto a pattern; it replaces the pattern's notes. */
export interface PatternWrite {
	/** Pattern 1–16 (default 1); patterns missing up to it are added empty. */
	readonly pattern?: number;
	/**
	 * Bars 1–4 (default: enough for the last step written): of 16 steps in 4/4; in another time
	 * signature its own bars (four of 6/8: 48 steps), unless length is given, when bars counts the
	 * unit's 16-step bars that hold it.
	 */
	readonly bars?: number;
	/** Steps that play, when the last bar is shorter (default: all). */
	readonly length?: number;
	/** Track scale: how many sixteenths a step lasts, 1–8, 16 or 0.5 (default: unchanged). */
	readonly scale?: number;
	/** With one scene, leave the track on the pattern it plays (a part to come), as write_pattern's. */
	readonly stay?: boolean;
	/** This pattern's own groove, −99 (shuffle) … 99 (swing), as write_pattern's (0: the tempo page's). */
	readonly groove?: number;
	/** Every note's velocity that gives none, 1–127 (default 100). */
	readonly velocity?: number;
	/** The key meant ("A minor", "D dorian"), as write_pattern's: readings spell the pattern in it. */
	readonly key?: string;
	/** Chords by name, as write_pattern takes them ("1:Am7 17:F"), voiced smoothly (or voicing root). */
	readonly chords?: string;
	readonly voicing?: 'smooth' | 'root';
	/** Where chords by name sit: the note their middle stays near ("C5"; default C4). */
	readonly register?: string;
	/**
	 * A drum track's lines by sound name or note, as write_pattern's grid ({"closed hat": "x.x. X.x."}:
	 * x a hit at velocity, X an accent, o soft, 1–9 a hit that loud, . a rest), with notes or alone.
	 */
	readonly grid?: Readonly<Record<string, string>>;
	/**
	 * With grid: the sounds its lines name are replaced, every other note of the pattern stays,
	 * with its parameter locks and step components.
	 */
	readonly merge?: boolean;
	/**
	 * Another of the track's patterns to start from, as write_pattern's copy: alone a duplicate
	 * (notes, locks, components, length, scale, groove); with grid and merge a variation of it; with
	 * notes, those notes on its locks and components.
	 */
	readonly copy?: number;
	/**
	 * At most 120, in any order; an empty list clears the pattern. Or one string, a word a note
	 * ("1:A2:4 5:C3+E3:2"), as write_pattern takes it.
	 */
	readonly notes?:
		| string
		| readonly {
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
				/** Off the grid by this much of a step, −0.5 … 0.5, as readPattern gives a live take's. */
				readonly offset?: number;
		  }[];
}

/** A fork's status: the virtual OP-XY's, without the browser's sound (a fork makes none). */
export type ForkStatus = Omit<VirtualStatus, 'sound'>;
/** A pattern as it stands: track, pattern, patterns (on the track), current, bars, length, scale, notes. */
export type Pattern = VirtualPattern;
/** Scenes (each the pattern of every track, index 0 = track 1) and the song (order, loop). */
export type Arrangement = VirtualArrangement;
/** An instrument track's sound: engine, preset, each page as its screen reads, mix, a drum track's kit. */
/** A track's sound, its envelopes also in seconds ("amp envelope attack 2 s, … release 4 s"). */
export type TrackSound = VirtualTrackSound & { readonly times?: string };
export type { ArrangementWrite };

/** A copy of the replica with the replica's own calls, the keys and the navigator. */
export interface Fork {
	/** "fork 1", "fork 2", … as the logs and diffs name it. */
	readonly name: string;
	/** Tempo, selected track, every track at a glance, the arrangement, the metronome. */
	status(): ForkStatus;
	/** A pattern (default: the one the track plays). */
	readPattern(track: number, pattern?: number): Pattern;
	/**
	 * Writes a pattern. With one scene it becomes the one the track plays; once scenes are set,
	 * what plays and every scene stay as they were (writeArrangement puts it in a scene).
	 */
	writePattern(track: number, write: PatternWrite): Pattern;
	readArrangement(): Arrangement;
	/**
	 * Sets scenes (`patterns` by track, or every track's as readArrangement gives them; pattern 0
	 * rests a track; `null` clears a scene; tracks left out keep theirs in that scene, pattern 1 in
	 * a new one) and the song (`order`, `loop`).
	 */
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
