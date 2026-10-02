/**
 * The lab's core (docs/AGENT-V2.md, "The lab"), the same wherever it runs: in the browser's lab
 * worker and in Node for tests and evals. Forks are copies of the replica made from a saved state,
 * each a simulator of its own with the virtual OP-XY's calls, the keys and the navigator; diffs say
 * what differs in the device's words; MIDI files go onto forks by import_midi's planner; listening
 * renders a fork offline through an injected renderer and hears it with `core/listen`. Commits
 * merge into the lab's own copy of the replica, which later forks start from; the host lands the
 * result on the real replica once the program has finished.
 *
 * Every argument a program passes is checked here (the program is the model's code, and what it
 * writes ends up in the replica's state), so a mistake comes back as a `LabError` that says what
 * was wrong instead of a value that breaks the replica later.
 */
import { z } from 'zod';
import { gmProgramName } from '$lib/core/midi/constants';
import { parseNoteName } from '$lib/core/midi/notes';
import { midiFileNotes, type MidiFileNotes } from '$lib/core/music/midifile';
import {
	analyzeAudio,
	summarize,
	summarizeTracks,
	type ListenAnalysis,
	type TrackTake
} from '$lib/core/listen';
import { barLevels, loudness } from '$lib/core/listen/level';
import { grooveReachAll } from '../groove-reach';
import { lockReach } from '../lock-reach';
import { BAR, lengthSettings, sceneLength } from '$lib/sim/areas/arrange/model';
import { KeyParseError, parseKeys } from '$lib/core/opxy';
import { snapshot } from '$lib/sim/areas/system/projects';
import { buildFrame } from '$lib/sim/frames';
import { playStep, type NavPlan, type NavStep } from '$lib/sim/navigator';
import { HeadlessSim, OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import { describeFrame } from '$lib/sim/screen/render';
import { TRACK_SCALES } from '$lib/sim/sequencer';
import { settleSession } from '$lib/sim/session';
import { SETTING_AREAS, settingGoal, type SettingArea } from '$lib/sim/settings';
import { softLimit } from '$lib/sound/limit';
import { envelopeTimes, stageSetting } from '$lib/sound/times';
import { MidiImportError, planMidiImport, type ImportPlan } from '../midi-import';
import { pitchRange, trackShapes } from '../midi-text';
import {
	alone,
	clickHeard,
	keyNote,
	renderRequest,
	sceneState,
	tracksPlaying,
	writtenKey
} from '../scene-render';
import type { AttachedFiles } from '../tools/define';
import { writeImport } from '../tools/midi';
import type { VirtualOpxy } from '../virtual-opxy';
import type {
	Fork,
	ForkStatus,
	Heard,
	Lab,
	LabMidi,
	ListenOptions,
	MidiWrite,
	PatternWrite,
	ReplicaDiff,
	SetResult,
	Setting,
	TrackShape
} from './api';
import { applyProject } from './apply';
import { diffReplica, type DiffSide } from './diff';
import {
	compactChords,
	compactNotes,
	gridHits,
	markVelocity,
	PatternNotesError,
	type WrittenNote
} from '../pattern-notes';
import { gridKey } from '../grid-key';
import { parseKey } from '../pattern-reading';
import { takeReads } from './take-reads';

/** A program's mistake, in words it can act on. */
export class LabError extends Error {
	override name = 'LabError';
}

/** Rendering a project offline through the replica's sound (the lab's ears). */
export interface LabRenderer {
	render(request: LabRender, signal?: AbortSignal): Promise<LabAudio>;
}

/** What to render: a project and how it plays, as the eval's ears take it. */
export interface LabRender {
	/** The project (`snapshot`). */
	readonly project: string;
	readonly transport: SimState['transport'];
	/** The active track and mode (the arpeggio reads them). */
	readonly track: number;
	readonly mode: SimState['mode'];
	readonly seconds: number;
	/** The seconds whose notes play (default all): after it the sound only rings out. */
	readonly notes?: number;
}

/** Rendered audio: one or two channels. */
export interface LabAudio {
	readonly sampleRate: number;
	readonly channels: readonly Float32Array[];
}

/** What a lab needs. */
export interface LabOptions {
	/** The replica to start from (`labSnapshot`). */
	readonly snapshot: string;
	/** The virtual OP-XY over a simulator (the app's `createVirtualOpxy`), for every fork. */
	readonly virtual: (sim: OpxySim) => VirtualOpxy;
	/** Files attached in this conversation. */
	readonly files?: AttachedFiles | null;
	/** Offline rendering for `listen`; absent where there is none. */
	readonly render?: LabRenderer | null;
	/** Aborts listening when the run is stopped. */
	readonly signal?: AbortSignal;
}

/** One commit: its label and what it changed. */
export interface LabCommit {
	readonly label: string;
	readonly changes: readonly string[];
}

/** A fork offered to the user to hear and keep (`lab.offer`). */
export interface LabTake {
	readonly label: string;
	/** What keeping it would change on the replica as the lab left it. */
	readonly changes: readonly string[];
	/** The parts it changes as they would read: a drum sound's line with its loudness, notes. */
	readonly reads?: readonly string[];
	/** The project its line began from, and its own: keeping it merges the one into the other. */
	readonly base: string;
	readonly project: string;
}

/** The most takes a program may offer. */
export const MAX_TAKES = 4;

/** A lab in use: what the program sees, and what the host reads afterwards. */
export interface LabSession {
	readonly lab: Lab;
	/** The commits so far, oldest first. */
	commits(): readonly LabCommit[];
	/** The project the commits leave (`snapshot`), or null when nothing was committed. */
	project(): string | null;
	/** The keys the committed writes named, by track:pattern (null: written with none). */
	keys(): Readonly<Record<string, string | null>>;
	/** The takes offered so far, in order. */
	takes(): readonly LabTake[];
	/** Forks made and renders heard so far. */
	counts(): { readonly forks: number; readonly listens: number };
}

/** Seconds `listen` hears by default: the mix, and each track alone (as listen and listen_tracks). */
const LISTEN_SECONDS = 8;
const TRACK_SECONDS = 4;
const barsOf = (n: number) => `${n} bar${n === 1 ? '' : 's'}`;
/** Seconds a song is heard by default, across a change of part. */
const SONG_SECONDS = 16;
/** How long each part of a song heard rings into the next, s (as the song's WAV). */
const SONG_TAIL = 1;
/** What one program may render: renders, and seconds in all. */
export const LISTEN_LIMITS = { renders: 24, seconds: 240 } as const;

/**
 * The replica as a lab starts from it: its whole state (the screen, the selected track, the preset
 * library, the project), without the saved content of the projects folder, which forks never need.
 */
export function labSnapshot(s: SimState): string {
	const system = s.areas.system;
	const projects = Object.fromEntries(
		Object.entries(system.projects).map(([folder, list]) => [
			folder,
			list.map((p) => ({ name: p.name, snapshot: null, versions: [] }))
		])
	);
	return JSON.stringify({ ...s, areas: { ...s.areas, system: { ...system, projects } } });
}

/**
 * Files handed over by name (to the worker), found as the conductor finds them: the model may drop
 * the extension or change the case.
 */
export function attachedFiles(
	list: readonly { readonly name: string; readonly bytes: Uint8Array }[]
): AttachedFiles {
	const bare = (name: string) => name.toLowerCase().replace(/\.(mid|midi|smf|kar|rmi)$/, '');
	return {
		midi: (name) =>
			(list.find((f) => f.name === name) ?? list.find((f) => bare(f.name) === bare(name)))?.bytes ??
			null,
		midiNames: () => list.map((f) => f.name)
	};
}

/** A copy of a state, settled as a fork starts: no keys held, stopped, no gesture in progress. */
function forkState(json: string): SimState {
	const state = JSON.parse(json) as SimState;
	settleSession(state);
	state.held = [];
	state.shift = false;
	state.taps = [];
	state.transport = { playing: false, recording: false, position: 0 };
	return state;
}

// ─── checking what a program passes ─────────────────────────────────────────────────────────────

const track16 = z.int().min(1).max(16);
const track8 = z.int().min(1).max(8);
const patternNumber = z.int().min(1).max(16);
/** A scene's pattern for a track: 1–16, or 0 for an empty one (the track rests). */
const scenePattern = z.int().min(0).max(16);
const sceneNumber = z.int().min(1).max(99);
const scales = TRACK_SCALES.map((s) => z.literal(s));
/**
 * A track scale as a number or as write_pattern writes it ("2", "1/2"): an agent's program passed
 * "2" and was told only "Invalid input".
 */
const trackScale = z.preprocess(
	(v) => (typeof v === 'string' ? (v.trim() === '1/2' ? 0.5 : Number(v)) : v),
	z.union(scales, {
		error: `scale is how many sixteenths a step lasts: ${TRACK_SCALES.join(', ')} (0.5 is 1/2)`
	})
);

const patternWrite = z.strictObject({
	pattern: patternNumber.optional(),
	bars: z.int().min(1).max(4).optional(),
	length: z.int().min(1).max(64).optional(),
	scale: trackScale.optional(),
	// as write_pattern takes them (an agent's program failed on stay, which the tool has)
	stay: z.boolean().optional(),
	groove: z.int().min(-99).max(99).optional(),
	// a list, or write_pattern's short form ("1:A2:4 5:C3+E3+G3:2:70"), which an agent carried over
	notes: z
		.union([
			z
				.array(
					z.strictObject({
						step: z.int().min(1).max(64),
						note: z.union([z.int().min(0).max(127), z.string().min(2).max(4)]),
						velocity: z
							.int()
							.min(1, { error: 'velocity is 1–127: a note at 0 would be silent, so leave it out' })
							.max(127)
							.optional(),
						length: z.number().min(0.05).max(64).optional(),
						// what readPattern says a drum note plays: notes read back are written as they are
						sound: z.string().optional(),
						// and a live take's timing off the grid, as readPattern gives it
						offset: z.number().min(-0.5).max(0.5).optional()
					})
				)
				.max(120),
			z.string().max(4000)
		])
		.optional(),
	// chords by name, as write_pattern takes them ("1:Am7 17:F"; an agent wrote a lab's chords out
	// note by note, unsure the lab took names)
	chords: z.string().max(2000).optional(),
	voicing: z.enum(['smooth', 'root']).optional(),
	// every note's velocity that gives none, as write_pattern's (a program failed on it)
	velocity: z.int().min(1).max(127).optional(),
	// a drum track's lines by sound name, as write_pattern's grid ({"closed hat": "x.x. x.x."}): an
	// agent's hats went in by number, unsure the kit put them there
	grid: z.record(z.string().min(1).max(40), z.string().max(400)).optional(),
	// with a grid, the sounds it names replace theirs and the rest of the pattern stays, as
	// write_pattern's merge (a program's hat takes failed on it twice)
	merge: z.boolean().optional(),
	// start from another of the track's patterns, as write_pattern's copy (a program building an
	// outro from copies failed on it): alone a duplicate, with a grid and merge a variation
	copy: patternNumber.optional(),
	// the key meant, as write_pattern takes it (a song's program failed on it): read_pattern spells
	// the pattern in it once the commit lands
	key: z.string().max(24).optional()
});

const arrangementWrite = z.strictObject({
	scenes: z
		.array(
			z.strictObject({
				scene: sceneNumber,
				// by track, or as readArrangement gives them: every track's pattern, index 0 = track 1
				patterns: z
					.union([
						z.array(z.strictObject({ track: track16, pattern: scenePattern })).max(16),
						z.array(scenePattern).max(16)
					])
					.nullable(),
				// what readArrangement says a scene lasts; ignored here (its patterns decide)
				bars: z.number().optional(),
				// a scene's own mix, as write_arrangement takes it
				mix: z
					.array(
						z.strictObject({
							track: track16,
							level: z.int().min(0).max(99).optional(),
							muted: z.boolean().optional()
						})
					)
					.max(16)
					.optional(),
				// what readArrangement says of its mix; ignored here
				muted: z.array(track16).optional(),
				levels: z.array(z.number()).optional()
			})
		)
		.max(99)
		.optional(),
	song: z
		.strictObject({
			order: z.array(sceneNumber).max(96).optional(),
			// write_arrangement's name for the order
			scenes: z.array(sceneNumber).max(96).optional(),
			loop: z.boolean().optional()
		})
		.optional()
});

const settingValue = z.union([z.number(), z.string().min(1).max(30)]);
const setting = z.strictObject({
	param: z.string().min(1).max(60),
	value: settingValue,
	track: track16.optional(),
	area: z.enum(SETTING_AREAS as [SettingArea, ...SettingArea[]]).optional(),
	page: z.int().min(1).max(4).optional(),
	key: settingValue.optional(),
	// a parameter lock on one step, as plan_steps takes it (an agent's riser needed a cutoff per step)
	step: z.int().min(1).max(64).optional(),
	// with step, the pattern whose step it locks, when not the one the track plays (an outro's
	// copies took the verse's locks, and pointing the track at them rewrote a scene); with area
	// bar, the pattern whose bar menu it sets
	pattern: patternNumber.optional()
});

const listenOptions = z.strictObject({
	seconds: z.number().min(1).max(30).optional(),
	tracks: z.union([z.literal('each'), z.array(track8).min(1).max(8)]).optional(),
	scene: sceneNumber.optional(),
	song: z
		.strictObject({
			// both count from 1 (a program's entry 0, bar 0 failed with "too small")
			entry: z
				.int()
				.min(1, { error: "entries count from 1: the song's first entry is 1" })
				.max(96)
				.optional(),
			bar: z
				.int()
				.min(1, { error: "bars count from 1: an entry's first bar is 1" })
				.max(64)
				.optional()
		})
		.optional()
});

const planOptions = z.strictObject({
	tracks: z
		.array(
			z.strictObject({
				midi: z.int().min(1).max(64),
				to: track8,
				transpose: z.int().min(-48).max(48).optional(),
				drums: z.boolean().optional()
			})
		)
		.min(1)
		.max(16),
	fromBar: z.int().min(1).optional(),
	toBar: z.int().min(1).optional()
});

/** A MIDI file as read, possibly reshaped by the program (fewer notes, other lengths). */
const midiFile = z.looseObject({
	notes: z
		.array(
			z.looseObject({
				note: z.int().min(0).max(127),
				start: z.number().min(0),
				duration: z.number().min(0),
				velocity: z.int().min(0).max(127),
				channel: z.int().min(0).max(15),
				track: z.int().min(0)
			})
		)
		.max(200_000),
	tempos: z.array(z.looseObject({ beat: z.number(), bpm: z.number().min(1).max(1000) })).min(1),
	meters: z
		.array(
			z.looseObject({
				beat: z.number(),
				numerator: z.int().min(1).max(64),
				denominator: z.int().min(1).max(64)
			})
		)
		.min(1),
	keys: z.array(z.looseObject({})),
	tracks: z.array(
		z.looseObject({
			index: z.int().min(0),
			channels: z.array(z.int().min(0).max(15)),
			noteCount: z.int().min(0)
		})
	)
});

/** A plan as `midi.write` takes it: what it writes, checked (the rest is the report). */
const planToWrite = z.looseObject({
	bpm: z.number().min(1).max(1000),
	patterns: z.array(
		z.looseObject({
			track: track8,
			pattern: patternNumber,
			bars: z.int().min(1).max(4),
			length: z.int().min(1).max(64),
			notes: z
				.array(
					z.looseObject({
						step: z.int().min(1).max(64),
						note: z.int().min(0).max(127),
						velocity: z.int().min(1).max(127),
						length: z.number().min(0.05).max(64)
					})
				)
				.max(120)
		})
	),
	scenes: z
		.array(
			z.looseObject({
				scene: sceneNumber,
				patterns: z.array(z.looseObject({ track: track8, pattern: patternNumber })).max(16)
			})
		)
		.max(99),
	song: z.array(sceneNumber).max(96),
	tracks: z.array(z.looseObject({ to: track8 }))
});

/** `value` as `schema` takes it, or a LabError naming `what` and the first problems. */
function check<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
	const result = schema.safeParse(value);
	if (result.success) return result.data;
	const problems = result.error.issues.slice(0, 3).map((issue) => {
		const at = issue.path.length ? `${issue.path.join('.')}: ` : '';
		return `${at}${issue.message}`;
	});
	throw new LabError(`${what}: ${problems.join('; ')}`);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ─── the lab ────────────────────────────────────────────────────────────────────────────────────

/** What the lab keeps about each fork (the program only holds the fork's calls). */
interface ForkRecord {
	readonly name: string;
	readonly sim: OpxySim;
	readonly virtual: VirtualOpxy;
	/** The lab's project when this fork's line began: what committing it merges from. */
	readonly origin: string;
	/** The whole state it was forked from, for `diff()`. */
	readonly base: string;
	baseSide: DiffSide | null;
	/** The keys its writes named, by track:pattern (null: written with none), carried into its forks. */
	readonly keys: Map<string, string | null>;
}

const stepText = (s: NavStep) => (s.clicks === undefined ? s.keys : `${s.keys} ×${s.clicks}`);
const screenOf = (sim: OpxySim) => describeFrame(buildFrame(sim.state));

/** Builds a lab over a saved replica (see {@link LabOptions}). */
export function createLab(options: LabOptions): LabSession {
	const records = new WeakMap<Fork, ForkRecord>();
	/** The lab's copy of the replica: commits merge into it, and forks start from it. */
	const replica = forkState(options.snapshot);
	let committed = false;
	const commits: LabCommit[] = [];
	/** The keys the committed forks' writes named (track:pattern → "A minor"; null: none). */
	const keys = new Map<string, string | null>();
	const takes: LabTake[] = [];
	let forks = 0;
	let renders = 0;
	let rendered = 0;

	const sideOf = (state: SimState): DiffSide => {
		const sim = new HeadlessSim({ state, now: () => 0 });
		return { state: sim.state, virtual: options.virtual(sim) };
	};

	function record(fork: unknown, what: string): ForkRecord {
		const found = typeof fork === 'object' && fork !== null ? records.get(fork as Fork) : undefined;
		if (!found) throw new LabError(`${what}: pass a fork made by lab.fork()`);
		return found;
	}

	function makeFork(
		state: SimState,
		origin: string,
		base: string,
		named: ReadonlyMap<string, string | null> = new Map()
	): Fork {
		const name = `fork ${++forks}`;
		const sim = new HeadlessSim({ state, now: () => 0 });
		const virtual = options.virtual(sim);
		const self: ForkRecord = {
			name,
			sim,
			virtual,
			origin,
			base,
			baseSide: null,
			keys: new Map(named)
		};

		const status = (): ForkStatus => {
			const s = virtual.status();
			return {
				bpm: s.bpm,
				signature: s.signature,
				playing: s.playing,
				selectedTrack: s.selectedTrack,
				tracks: s.tracks,
				arrangement: s.arrangement,
				metronome: s.metronome
			};
		};

		/** A drum grid's hits as notes, each line's key found in the track's kit by name. */
		function gridNotes(
			track: number,
			grid: Readonly<Record<string, string>> | undefined,
			velocity: number
		): WrittenNote[] {
			if (!grid) return [];
			const kit = track <= 8 ? virtual.readSound(track).kit : undefined;
			const { hits } = gridHits(grid);
			const unknown = Object.keys(grid).filter((key) => gridKey(key, kit) === null);
			if (unknown.length > 0) {
				const sounds = kit ? ` (its sounds: ${[...new Set(Object.values(kit))].join(', ')})` : '';
				throw new LabError(
					`writePattern: grid ${unknown.map((k) => `"${k}"`).join(', ')} is no sound, note name or number of track ${track}${sounds}`
				);
			}
			return hits.map((hit) => ({
				step: hit.step,
				note: gridKey(hit.key, kit)!,
				velocity: markVelocity(hit.mark, velocity),
				length: 1
			}));
		}

		function writePattern(track: number, write: PatternWrite) {
			const t = check(track16, track, 'writePattern track');
			const w = check(patternWrite, write, 'writePattern');
			if (
				w.notes === undefined &&
				w.chords === undefined &&
				w.grid === undefined &&
				w.copy === undefined
			) {
				throw new LabError(
					'writePattern: give notes (a list or "1:A2:4 5:C3+E3:2"), chords ("1:Am7 17:F"), a drum grid ({"kick": "x... x..."}) or copy (another pattern of the track)'
				);
			}
			const meant = w.key === undefined ? undefined : parseKey(w.key);
			if (meant === null) {
				throw new LabError(
					`writePattern: "${w.key}" is no key it reads ("A minor", "D dorian", "Eb major")`
				);
			}
			if (w.copy !== undefined && w.copy > virtual.status().tracks[t - 1].patterns) {
				throw new LabError(
					`writePattern: track ${t} has no pattern ${w.copy} to copy (it has ${virtual.status().tracks[t - 1].patterns})`
				);
			}
			let given: readonly WrittenNote[];
			try {
				const notes = typeof w.notes === 'string' ? compactNotes(w.notes) : (w.notes ?? []);
				const chords = w.chords ? compactChords(w.chords, { root: w.voicing === 'root' }) : [];
				given = [...notes, ...chords, ...gridNotes(t, w.grid, w.velocity ?? 100)];
			} catch (error) {
				if (error instanceof PatternNotesError)
					throw new LabError(`writePattern: ${error.message}`);
				throw error;
			}
			if (given.length > 120) {
				// the chords counted, a note each (a gated pad's 48 triads read as 144 notes)
				const at = new Map<number, number>();
				for (const n of given) at.set(n.step, (at.get(n.step) ?? 0) + 1);
				const chords = [...at.values()].filter((k) => k >= 3);
				const of =
					chords.length >= 2
						? ` (${chords.length} chords of about ${Math.round(chords.reduce((a, b) => a + b, 0) / chords.length)} notes: each note of a chord counts)`
						: '';
				throw new LabError(
					`writePattern: ${given.length} notes${of}, and a pattern holds 120: fewer hits, fewer notes a chord, or more patterns`
				);
			}
			const notes = given.map((n) => {
				const note = typeof n.note === 'number' ? n.note : parseNoteName(n.note, 'c4');
				if (note === null || note < 0 || note > 127) {
					throw new LabError(`writePattern: "${n.note}" is not a note (60, "C4", "F#3")`);
				}
				const offset = (n as { offset?: number }).offset;
				return {
					step: n.step,
					note,
					velocity: n.velocity ?? w.velocity ?? 100,
					length: n.length ?? 1,
					...(offset ? { offset } : {})
				};
			});
			if (w.merge && !w.grid) {
				throw new LabError(
					'writePattern: merge goes with a grid (the sounds its lines name are replaced, the rest kept)'
				);
			}
			// what the write starts from: the copy (alone its notes, with a merge those its grid does
			// not name), or with a merge the pattern itself, whose locks and components stay (a lab
			// merge once dropped every lock and component of the pattern)
			const copied = w.copy !== undefined ? virtual.readPattern(t, w.copy) : null;
			const base = copied ?? (w.merge ? virtual.readPattern(t, w.pattern ?? 1) : null);
			const before = w.merge ? base : null;
			if (copied && !w.merge && notes.length === 0) {
				for (const n of copied.notes) {
					notes.push({
						step: n.step,
						note: n.note,
						velocity: n.velocity,
						length: n.length,
						...(n.offset ? { offset: n.offset } : {})
					});
				}
			}
			if (before) {
				const kit = t <= 8 ? virtual.readSound(t).kit : undefined;
				const named = new Set(Object.keys(w.grid ?? {}).map((key) => gridKey(key, kit)));
				for (const n of before.notes) {
					if (named.has(n.note)) continue;
					notes.push({
						step: n.step,
						note: n.note,
						velocity: n.velocity,
						length: n.length,
						...(n.offset ? { offset: n.offset } : {})
					});
				}
			}
			const last = notes.reduce((max, n) => Math.max(max, n.step), 1);
			// in another meter, bars without a length count its bars, as write_pattern's do
			const meterBar = BAR[lengthSettings(sim.state).signature];
			let meterLength: number | undefined;
			if (meterBar !== 16 && w.bars !== undefined && w.length === undefined) {
				meterLength = w.bars * meterBar;
				if (meterLength > 64) {
					throw new LabError(
						`writePattern: ${w.bars} bars of ${lengthSettings(sim.state).signature} are ${meterLength} steps, and a pattern holds 64: ${Math.floor(64 / meterBar)} of its bars at most (or length up to 64)`
					);
				}
			}
			const bars =
				meterLength !== undefined
					? Math.ceil(meterLength / 16)
					: (w.bars ?? (base ? Math.max(base.bars, Math.ceil(last / 16)) : Math.ceil(last / 16)));
			// the base's locks and components on the steps the pattern keeps
			const steps = bars * 16;
			const locks = (base?.stepLocks ?? []).filter((l) => l.step <= steps);
			const components = (base?.components ?? []).filter((c) => c.step <= steps);
			self.keys.set(`${t}:${w.pattern ?? 1}`, meant?.label ?? null);
			return virtual.writePattern(t, {
				pattern: w.pattern ?? 1,
				bars,
				length: w.length ?? meterLength ?? (base && w.bars === undefined ? base.length : undefined),
				scale: w.scale ?? (copied ? copied.scale : undefined),
				...(w.stay ? { play: false } : {}),
				...(w.groove !== undefined
					? { groove: w.groove }
					: copied?.groove !== undefined
						? { groove: copied.groove }
						: {}),
				notes,
				...(locks.length ? { locks } : {}),
				...(components.length ? { components } : {})
			});
		}

		function writeArrangement(write: unknown) {
			const w = check(arrangementWrite, write, 'writeArrangement');
			const order = w.song ? (w.song.order ?? w.song.scenes) : undefined;
			if (w.song && !order) throw new LabError('writeArrangement: song needs its order (scenes)');
			const scenes = w.scenes?.map(({ scene, patterns, mix }) => ({
				scene,
				patterns:
					patterns?.map((p, i) => (typeof p === 'number' ? { track: i + 1, pattern: p } : p)) ??
					null,
				...(mix ? { mix } : {})
			}));
			return virtual.writeArrangement({
				scenes,
				song: order ? { order, loop: w.song?.loop ?? true } : undefined
			});
		}

		/**
		 * The navigator's plan for settings as a program passes them, from where the fork stands; an
		 * envelope stage may be given as a time, as plan_steps takes it (a program's "0.3 s" attack was
		 * refused, and the settings batched with it were lost).
		 */
		function planned(
			input: unknown,
			what: 'set' | 'plan'
		): { list: Setting[]; plan: NavPlan; times: string[] } {
			const given = Array.isArray(input)
				? check(z.array(setting).min(1).max(16), input, what)
				: [check(setting, input, what)];
			const times: string[] = [];
			const list = given.map((s) => {
				const read = stageSetting(s.param, s.value);
				if (!read) return s;
				times.push(read.line);
				return { ...s, value: read.value };
			});
			const selected = virtual.status().selectedTrack;
			const goals = list.map((s) => {
				const goal = settingGoal(s, selected);
				if (typeof goal === 'string') throw new LabError(`${what} ${s.param}: ${goal}`);
				return goal;
			});
			const plan = goals.length === 1 ? virtual.plan(goals[0]) : virtual.plan({ settings: goals });
			return { list, plan, times };
		}

		function set(input: Setting | readonly Setting[]): SetResult {
			const all = Array.isArray(input)
				? check(z.array(setting).min(1).max(16), input, 'set')
				: [check(setting, input, 'set')];
			if (all.some((s) => s.pattern !== undefined)) return setOnPatterns(all);
			return setNow(all);
		}

		/**
		 * Locks on another pattern's steps, or its bar menu (quant, length, groove, shape), as a person
		 * sets them: the track switched to that pattern (the arrange page's pattern), the setting made,
		 * the track switched back, so what plays and every scene stay as they were (a program smoothing
		 * the locks of a song's second pattern pressed its way there and smoothed the first).
		 */
		function setOnPatterns(all: readonly Setting[]): SetResult {
			if (all.some((s) => s.pattern !== undefined && s.step === undefined && s.area !== 'bar')) {
				throw new LabError(
					"set: pattern goes with step (a lock on that pattern's step) or with area bar (that pattern's bar menu: quant, length, groove, shape)"
				);
			}
			const selected = virtual.status().selectedTrack;
			const steps: string[] = [];
			const notes: string[] = [];
			const groups = new Map<string, Setting[]>();
			for (const s of all) {
				const key = s.pattern === undefined ? 'now' : `${s.track ?? selected}:${s.pattern}`;
				groups.set(key, [...(groups.get(key) ?? []), s]);
			}
			const switchTo = (track: number, pattern: number) => {
				const goal = settingGoal(
					{ area: 'arrange', param: 'pattern', value: pattern, track },
					selected
				);
				if (typeof goal === 'string') throw new LabError(`set: ${goal}`);
				const p = virtual.plan(goal);
				if (!p.reached)
					throw new LabError(`set: track ${track} did not switch to pattern ${pattern}`);
				for (const step of p.steps) playStep(sim, step);
				steps.push(...p.steps.map(stepText));
			};
			for (const [key, group] of groups) {
				const plain = group.map((g) => {
					const rest: Setting = { ...g };
					delete (rest as { pattern?: number }).pattern;
					return rest;
				});
				if (key === 'now') {
					const r = setNow(plain);
					steps.push(...r.steps);
					if (r.note) notes.push(r.note);
					continue;
				}
				const [t, n] = key.split(':').map(Number);
				const was = virtual.status().tracks[t - 1]?.current ?? 1;
				const patterns = virtual.status().tracks[t - 1]?.patterns ?? 1;
				if (n > patterns)
					throw new LabError(`set: track ${t} has no pattern ${n} (it has ${patterns})`);
				if (n !== was) switchTo(t, n);
				const r = setNow(plain);
				steps.push(...r.steps);
				if (r.note) notes.push(r.note);
				if (n !== was) switchTo(t, was);
			}
			return {
				reached: true,
				steps,
				screen: screenOf(sim),
				...(notes.length ? { note: notes.join(' ') } : {})
			};
		}

		function setNow(input: readonly Setting[]): SetResult {
			const { list, plan, times } = planned(input, 'set');
			if (!plan.reached) {
				const what = list.map((s) => `${s.track ? `track ${s.track} ` : ''}${s.param} ${s.value}`);
				throw new LabError(
					`set ${what.join(', ')}: not reached${plan.note ? ` (${plan.note})` : ''}; nothing was changed`
				);
			}
			for (const step of plan.steps) playStep(sim, step);
			// a groove that hardly reaches the notes, said where it is set (an agent swung a beat on
			// the eighths, heard no swing, and suspected the render)
			const reach = list.some((s) => /groove|swing|shuffle/i.test(s.param))
				? grooveReachAll(virtual, true)
				: [];
			// a lock on a drum track's step reaches every sound on it
			const locked = new Map<number, number[]>();
			for (const s of list) {
				if (s.step === undefined) continue;
				const track = s.track ?? virtual.status().selectedTrack;
				locked.set(track, [...(locked.get(track) ?? []), s.step]);
			}
			const shared = [...locked].flatMap(([track, steps]) => {
				const line = lockReach(virtual, track, steps);
				return line ? [line] : [];
			});
			const notes = [...times, ...reach, ...shared];
			return {
				reached: true,
				steps: plan.steps.map(stepText),
				screen: screenOf(sim),
				...(notes.length ? { note: notes.join(' ') } : {})
			};
		}

		function plan(input: Setting | readonly Setting[]): SetResult {
			const { plan: p, times } = planned(input, 'plan');
			const notes = [...times, ...(p.note ? [p.note] : [])];
			return {
				reached: p.reached,
				steps: p.steps.map(stepText),
				screen: p.screen,
				...(notes.length ? { note: notes.join(' ') } : {})
			};
		}

		function press(keys: string, clicks?: number): string {
			const combo = check(z.string().min(1).max(200), keys, 'press');
			const turn =
				clicks === undefined
					? undefined
					: check(z.int().min(-200).max(200), clicks, 'press clicks');
			let turns: boolean;
			try {
				turns = parseKeys(combo).chords.some((c) => c.terms.some((t) => t.gesture === 'turn'));
			} catch (error) {
				if (error instanceof KeyParseError)
					throw new LabError(`press "${combo}": ${error.message}`);
				throw error;
			}
			if (turns && !turn) {
				throw new LabError(
					`press "${combo}": a turn needs its detents, as in press("turn E2", 5) (negative turns left)`
				);
			}
			if (!turns && turn !== undefined) {
				throw new LabError(`press "${combo}": detents go with a turn ("turn E1")`);
			}
			playStep(sim, { keys: combo, clicks: turn });
			return screenOf(sim);
		}

		function diff(against?: Fork): ReplicaDiff {
			if (against === undefined) {
				self.baseSide ??= sideOf(JSON.parse(self.base) as SimState);
				return diffReplica(self.baseSide, { state: sim.state, virtual });
			}
			const other = record(against, 'diff');
			return diffReplica(
				{ state: other.sim.state, virtual: other.virtual },
				{ state: sim.state, virtual }
			);
		}

		const fork: Fork = Object.freeze({
			name,
			status,
			readPattern: (track: number, pattern?: number) =>
				virtual.readPattern(
					check(track16, track, 'readPattern track'),
					pattern === undefined ? undefined : check(patternNumber, pattern, 'readPattern pattern')
				),
			writePattern,
			readArrangement: () => virtual.readArrangement(),
			writeArrangement,
			// the envelopes in seconds too, as read_sound gives them (a program set a 2 s attack and
			// read back 53, unable to check it)
			readSound: (track: number) => {
				const sound = virtual.readSound(check(track8, track, 'readSound track'));
				const times = (['amp', 'filter'] as const).flatMap((name) => {
					const page = sound.pages[`M2 ${name} envelope`];
					const t = page ? envelopeTimes(page) : null;
					return t ? [`${name} envelope ${t}`] : [];
				});
				return times.length ? { ...sound, times: times.join('; ') } : sound;
			},
			setTempo: (bpm: number) =>
				virtual.setTempo(check(z.number().min(40).max(220), bpm, 'setTempo')),
			setMetronome: (on: boolean) => virtual.setMetronome(check(z.boolean(), on, 'setMetronome')),
			setMuted: (track: number, muted: boolean) =>
				virtual.setMuted(
					check(track16, track, 'setMuted track'),
					check(z.boolean(), muted, 'setMuted')
				),
			selectTrack: (track: number) => virtual.selectTrack(check(track16, track, 'selectTrack')),
			set,
			plan,
			press,
			screen: () => screenOf(sim),
			diff,
			// a fork printed or returned reads as its name
			toJSON: () => `[${name}]`
		});
		records.set(fork, self);
		return fork;
	}

	// ─── files and MIDI ──────────────────────────────────────────────────────────────────────

	function readFile(name: unknown): MidiFileNotes {
		const file = check(z.string().min(1).max(200), name, 'files.midi');
		const bytes = options.files?.midi(file) ?? null;
		if (!bytes) {
			const names = options.files?.midiNames() ?? [];
			throw new LabError(
				names.length
					? `files.midi: no MIDI file named "${file}"; attached: ${names.join(', ')}`
					: 'files.midi: no MIDI file is attached in this conversation'
			);
		}
		try {
			return midiFileNotes(bytes);
		} catch (error) {
			throw new LabError(`files.midi: "${file}" could not be read: ${message(error)}`);
		}
	}

	/** A file as a program passes it: read by files.midi (perhaps reshaped), or its name. */
	const fileOf = (file: unknown, what: string): MidiFileNotes =>
		typeof file === 'string'
			? readFile(file)
			: (check(midiFile, file, `${what} file`) as unknown as MidiFileNotes);

	const midi: LabMidi = Object.freeze({
		shapes(file: MidiFileNotes | string): TrackShape[] {
			const read = fileOf(file, 'midi.shapes');
			const shapes = trackShapes(read);
			return read.tracks
				.filter((t) => t.noteCount > 0)
				.map((t) => {
					const drums = t.channels.length > 0 && t.channels.every((c) => c === 9);
					const program = t.programs.find((p) => p.channel !== 9);
					return {
						midi: t.index + 1,
						name: t.name?.trim() || null,
						channels: t.channels.map((c) => c + 1),
						notes: t.noteCount,
						range: pitchRange(t.lowest, t.highest, drums),
						drums,
						instrument: program ? gmProgramName(program.program) : null,
						shape: shapes.get(t.index) ?? []
					};
				});
		},
		plan(file: MidiFileNotes | string, planning: unknown): ImportPlan {
			const read = fileOf(file, 'midi.plan');
			const o = check(planOptions, planning, 'midi.plan');
			try {
				return planMidiImport(read, o);
			} catch (error) {
				if (error instanceof MidiImportError) throw new LabError(`midi.plan: ${error.message}`);
				throw error;
			}
		},
		write(fork: Fork, plan: ImportPlan, writing?: { readonly keepOthers?: boolean }): MidiWrite {
			const f = record(fork, 'midi.write');
			const p = check(planToWrite, plan, 'midi.write plan') as unknown as ImportPlan;
			const o = check(
				z.strictObject({ keepOthers: z.boolean().optional() }),
				writing ?? {},
				'midi.write'
			);
			const written = writeImport(f.virtual, p, o);
			return {
				bpm: f.virtual.status().bpm,
				patterns: p.patterns.length,
				scenes: p.scenes.length,
				song: p.song.length,
				resting: written.rests.map((r) => r.track),
				stillPlaying: [...written.playing],
				metronomeOff: written.clickOff
			};
		}
	});

	// ─── listening ───────────────────────────────────────────────────────────────────────────

	/** A copy of a fork set playing from the top (or looping one scene), as its render starts. */
	function playing(f: ForkRecord, scene: number | undefined): SimState {
		if (scene !== undefined) {
			const shown = f.virtual.readArrangement().scenes.map((s) => s.scene);
			if (!shown.includes(scene)) {
				throw new LabError(`listen: scene ${scene} is empty (scenes: ${shown.join(', ')})`);
			}
			return sceneState(f.sim.state, scene);
		}
		const sim = new HeadlessSim({ state: JSON.parse(JSON.stringify(f.sim.state)), now: () => 0 });
		options.virtual(sim).transport('play');
		return sim.state;
	}

	async function renderOf(state: SimState, seconds: number): Promise<ListenAnalysis> {
		const audio = await renderAudio(state, seconds);
		return analyzeAudio(audio.channels, audio.sampleRate, { expectedBpm: state.tempo.bpm });
	}

	async function renderAudio(state: SimState, seconds: number, notes?: number): Promise<LabAudio> {
		const renderer = options.render;
		if (!renderer) {
			throw new LabError(
				"listen: listening is not available in the lab here; judge by the patterns and the sounds' pages instead"
			);
		}
		if (renders >= LISTEN_LIMITS.renders || rendered + seconds > LISTEN_LIMITS.seconds) {
			throw new LabError(
				`listen: a program hears at most ${LISTEN_LIMITS.renders} renders and ${LISTEN_LIMITS.seconds} s`
			);
		}
		renders++;
		rendered += seconds;
		return renderer.render(renderRequest(state, seconds, notes), options.signal);
	}

	/**
	 * The song from an entry (and a bar of it), across the scenes that follow: each entry rendered
	 * from where it starts, ringing into the next, as the song's WAV is made (the render itself does
	 * not move from scene to scene). Agents could hear a scene alone, never a change of part.
	 */
	async function listenSong(
		f: ForkRecord,
		from: { entry?: number; bar?: number },
		seconds: number
	): Promise<Heard> {
		const base = f.sim.state;
		const a = base.areas.arrange;
		const order = a.songs[a.song]?.order ?? [];
		// one entry is a song when it does not loop: it plays once (a sting)
		if (order.length < 2 && !(order.length === 1 && !a.songs[a.song]?.loop)) {
			throw new LabError(
				'listen: song needs a song of two entries or more, or one that does not loop (writeArrangement song); hear one scene with scene'
			);
		}
		const entry = from.entry ?? 1;
		if (entry > order.length) {
			throw new LabError(
				`listen: the song has ${order.length} entries (song entry 1–${order.length})`
			);
		}
		const per16 = 60 / base.tempo.bpm / 4;
		const barSteps = BAR[lengthSettings(base).signature];
		const pieces: {
			entry: number;
			scene: number;
			bar: number;
			start: number;
			seconds: number;
			audio: LabAudio;
		}[] = [];
		let at = 0;
		for (let i = entry - 1; i < order.length && at < seconds - 0.01; i++) {
			const scene = order[i] + 1;
			const state = sceneState(base, scene);
			const length = Math.max(1, sceneLength(state));
			const bar = i === entry - 1 ? (from.bar ?? 1) : 1;
			const offset = (bar - 1) * barSteps;
			if (offset >= length) {
				throw new LabError(
					`listen: entry ${i + 1} (scene ${scene}) has ${barsOf(Math.ceil(length / barSteps))}, so it has no bar ${bar}`
				);
			}
			state.transport.position = offset;
			const part = Math.min(seconds - at, (length - offset) * per16);
			const last = at + part >= seconds - 0.01 || i === order.length - 1;
			// the part's notes, then a tail that rings into the next with no notes of its own (the
			// scene looping would start over in it)
			const audio = last
				? await renderAudio(state, part)
				: await renderAudio(state, part + SONG_TAIL, part - per16 / 4);
			pieces.push({ entry: i + 1, scene, bar, start: at, seconds: part, audio });
			at += part;
		}
		const rate = pieces[0].audio.sampleRate;
		const frames = Math.round(at * rate);
		const out = [new Float32Array(frames), new Float32Array(frames)];
		// where a part's tail overlaps the next part's start, the sum goes through the master's
		// ceiling, as one render would (each part was limited alone, and a tail summed onto the
		// next part's crash read as clipping)
		const layers = new Uint8Array(frames);
		for (const piece of pieces) {
			const from0 = Math.round(piece.start * rate);
			const n = Math.min(frames - from0, piece.audio.channels[0]?.length ?? 0);
			for (let i = 0; i < n; i++) layers[from0 + i]++;
			out.forEach((channel, c) => {
				const source = piece.audio.channels[c] ?? piece.audio.channels[0];
				for (let i = 0; i < source.length && from0 + i < frames; i++)
					channel[from0 + i] += source[i];
			});
		}
		for (const channel of out) {
			for (let i = 0; i < frames; i++) if (layers[i] > 1) channel[i] = softLimit(channel[i]);
		}
		const analysis = analyzeAudio(out, rate, { expectedBpm: base.tempo.bpm });
		const summary = summarize(analysis, { source: f.name });
		// each part's own loudness, so a change of part reads as louder or quieter
		const clock = (s: number) => `${Math.round(s * 10) / 10} s`;
		let was: number | null = null;
		const parts = pieces.map((p) => {
			const start = Math.round(p.start * rate);
			const end = Math.round((p.start + p.seconds) * rate);
			const lufs = loudness(
				out.map((c) => c.subarray(start, end)),
				rate
			).integrated;
			const change =
				lufs !== null && was !== null
					? ` (${lufs - was >= 0 ? '+' : ''}${(lufs - was).toFixed(1)} dB)`
					: '';
			if (lufs !== null) was = lufs;
			// and bar by bar, so a fade or a build can be heard as one
			const byBar = lufs === null ? null : barLevels(out, rate, barSteps * per16, start, end);
			const bars = byBar ? `, ${byBar}` : '';
			return `entry ${p.entry}, scene ${p.scene}${p.bar > 1 ? ` from bar ${p.bar}` : ''} (${clock(p.start)}–${clock(p.start + p.seconds)}): ${lufs === null ? 'silent' : `${lufs.toFixed(1)} LUFS`}${change}${bars}`;
		});
		const ended =
			at < seconds - 0.01
				? `\nnote: the song ends ${clock(at)} in${a.songs[a.song]?.loop ? ' (it loops: entry 1 follows)' : ''}`
				: '';
		const click = clickHeard(base)
			? '\nnote: the metronome is on, so its click is in what you heard'
			: '';
		return {
			text: `${summary.text}\nparts: ${parts.join('; ')}${ended}${click}`,
			flags: summary.flags,
			data: summary.data
		};
	}

	async function listen(fork: Fork, listening?: ListenOptions): Promise<Heard> {
		const f = record(fork, 'listen');
		const o = check(listenOptions, listening ?? {}, 'listen');
		if (o.song) {
			if (o.scene !== undefined || o.tracks) {
				throw new LabError('listen: song goes alone, without scene or tracks');
			}
			return listenSong(f, o.song, o.seconds ?? SONG_SECONDS);
		}
		const state = playing(f, o.scene);
		const click = clickHeard(state)
			? '\nnote: the metronome is on, so its click is in what you heard'
			: '';
		if (!o.tracks) {
			const audio = await renderAudio(state, o.seconds ?? LISTEN_SECONDS);
			const analysis = analyzeAudio(audio.channels, audio.sampleRate, {
				expectedBpm: state.tempo.bpm
			});
			const summary = summarize(analysis, { source: f.name });
			const key = keyNote(writtenKey(state), analysis.harmony?.key);
			// bar by bar from its start, so a build within a scene is heard as one
			const bars = barLevels(
				audio.channels,
				audio.sampleRate,
				(BAR[lengthSettings(state).signature] * 15) / state.tempo.bpm
			);
			return {
				text:
					summary.text +
					(bars ? `\nloudness ${bars} (LUFS, from its first bar)` : '') +
					click +
					(key ? `\nnote: ${key}` : ''),
				flags: summary.flags,
				data: summary.data
			};
		}
		const tracks = o.tracks === 'each' ? tracksPlaying(state) : o.tracks;
		if (tracks.length === 0) throw new LabError('listen: no instrument track plays anything here');
		const takes: TrackTake[] = [];
		for (const track of tracks) {
			const engine = state.tracks[track - 1].engine;
			const analysis = await renderOf(alone(state, track), o.seconds ?? TRACK_SECONDS);
			takes.push({ track, name: engine, percussive: engine === 'drum', analysis });
		}
		const summary = summarizeTracks(takes, { source: f.name });
		return {
			text: summary.text + click,
			flags: [...new Set(summary.tracks.flatMap((t) => t.flags))],
			data: null,
			tracks: summary.tracks
		};
	}

	// ─── the lab ─────────────────────────────────────────────────────────────────────────────

	const lab: Lab = Object.freeze({
		files: Object.freeze({
			names: () => [...(options.files?.midiNames() ?? [])],
			midi: readFile
		}),
		midi,
		fork(from?: Fork): Fork {
			if (from === undefined) {
				const json = JSON.stringify(replica);
				return makeFork(forkState(json), snapshot(replica), json);
			}
			const parent = record(from, 'fork');
			const json = JSON.stringify(parent.sim.state);
			return makeFork(forkState(json), parent.origin, json, parent.keys);
		},
		listen,
		commit(fork: Fork, label: string): ReplicaDiff {
			const f = record(fork, 'commit');
			const text = check(z.string().trim().min(1).max(80), label, 'commit label');
			const before = sideOf(JSON.parse(JSON.stringify(replica)) as SimState);
			applyProject(replica, f.origin, snapshot(f.sim.state));
			const diff = diffReplica(before, sideOf(replica));
			commits.push({ label: text, changes: diff.changes });
			for (const [slot, key] of f.keys) keys.set(slot, key);
			committed = true;
			return diff;
		},
		offer(fork: Fork, label: string): ReplicaDiff {
			const f = record(fork, 'offer');
			const text = check(z.string().trim().min(1).max(60), label, 'take label');
			if (takes.length >= MAX_TAKES) {
				throw new LabError(`offer: a program offers at most ${MAX_TAKES} takes`);
			}
			// what keeping it would do to the replica as the lab has it now
			const trial = JSON.parse(JSON.stringify(replica)) as SimState;
			const project = snapshot(f.sim.state);
			applyProject(trial, f.origin, project);
			const before = sideOf(JSON.parse(JSON.stringify(replica)) as SimState);
			const after = sideOf(trial);
			const diff = diffReplica(before, after);
			if (diff.same) throw new LabError(`offer: “${text}” changes nothing on the replica`);
			const reads = takeReads(before.virtual, after.virtual);
			takes.push({
				label: text,
				changes: diff.changes,
				...(reads.length ? { reads } : {}),
				base: f.origin,
				project
			});
			return diff;
		},
		log: () => {}
	});

	return {
		lab,
		commits: () => [...commits],
		takes: () => [...takes],
		project: () => (committed ? snapshot(replica) : null),
		keys: () => Object.fromEntries(keys),
		counts: () => ({ forks, listens: renders })
	};
}
