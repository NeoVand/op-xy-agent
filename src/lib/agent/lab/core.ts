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
import { KeyParseError, parseKeys } from '$lib/core/opxy';
import { selectScene } from '$lib/sim/areas/arrange/model';
import { snapshot } from '$lib/sim/areas/system/projects';
import { buildFrame } from '$lib/sim/frames';
import { playStep, type NavPlan, type NavStep } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { SimState } from '$lib/sim/params';
import { describeFrame } from '$lib/sim/screen/render';
import { TRACK_SCALES } from '$lib/sim/sequencer';
import { settleSession } from '$lib/sim/session';
import { SETTING_AREAS, settingGoal, type SettingArea } from '$lib/sim/settings';
import { MidiImportError, planMidiImport, type ImportPlan } from '../midi-import';
import { pitchRange, trackShapes } from '../midi-text';
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
	/** The takes offered so far, in order. */
	takes(): readonly LabTake[];
	/** Forks made and renders heard so far. */
	counts(): { readonly forks: number; readonly listens: number };
}

/** Seconds `listen` hears by default: the mix, and each track alone (as listen and listen_tracks). */
const LISTEN_SECONDS = 8;
const TRACK_SECONDS = 4;
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
const sceneNumber = z.int().min(1).max(99);
const scales = TRACK_SCALES.map((s) => z.literal(s));

const patternWrite = z.strictObject({
	pattern: patternNumber.optional(),
	bars: z.int().min(1).max(4).optional(),
	length: z.int().min(1).max(64).optional(),
	scale: z.union(scales).optional(),
	notes: z
		.array(
			z.strictObject({
				step: z.int().min(1).max(64),
				note: z.union([z.int().min(0).max(127), z.string().min(2).max(4)]),
				velocity: z.int().min(1).max(127).optional(),
				length: z.number().min(0.05).max(64).optional(),
				// what readPattern says a drum note plays: notes read back are written as they are
				sound: z.string().optional()
			})
		)
		.max(120)
});

const arrangementWrite = z.strictObject({
	scenes: z
		.array(
			z.strictObject({
				scene: sceneNumber,
				patterns: z
					.array(z.strictObject({ track: track16, pattern: patternNumber }))
					.max(16)
					.nullable()
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
	key: settingValue.optional()
});

const listenOptions = z.strictObject({
	seconds: z.number().min(1).max(30).optional(),
	tracks: z.union([z.literal('each'), z.array(track8).min(1).max(8)]).optional(),
	scene: sceneNumber.optional()
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
	const takes: LabTake[] = [];
	let forks = 0;
	let renders = 0;
	let rendered = 0;

	const sideOf = (state: SimState): DiffSide => {
		const sim = new OpxySim({ state, now: () => 0 });
		return { state: sim.state, virtual: options.virtual(sim) };
	};

	function record(fork: unknown, what: string): ForkRecord {
		const found = typeof fork === 'object' && fork !== null ? records.get(fork as Fork) : undefined;
		if (!found) throw new LabError(`${what}: pass a fork made by lab.fork()`);
		return found;
	}

	function makeFork(state: SimState, origin: string, base: string): Fork {
		const name = `fork ${++forks}`;
		const sim = new OpxySim({ state, now: () => 0 });
		const virtual = options.virtual(sim);
		const self: ForkRecord = { name, sim, virtual, origin, base, baseSide: null };

		const status = (): ForkStatus => {
			const s = virtual.status();
			return {
				bpm: s.bpm,
				playing: s.playing,
				selectedTrack: s.selectedTrack,
				tracks: s.tracks,
				arrangement: s.arrangement,
				metronome: s.metronome
			};
		};

		function writePattern(track: number, write: PatternWrite) {
			const t = check(track16, track, 'writePattern track');
			const w = check(patternWrite, write, 'writePattern');
			const notes = w.notes.map((n) => {
				const note = typeof n.note === 'number' ? n.note : parseNoteName(n.note, 'c4');
				if (note === null || note < 0 || note > 127) {
					throw new LabError(`writePattern: "${n.note}" is not a note (60, "C4", "F#3")`);
				}
				return { step: n.step, note, velocity: n.velocity ?? 100, length: n.length ?? 1 };
			});
			const last = notes.reduce((max, n) => Math.max(max, n.step), 1);
			return virtual.writePattern(t, {
				pattern: w.pattern ?? 1,
				bars: w.bars ?? Math.ceil(last / 16),
				length: w.length,
				scale: w.scale,
				notes
			});
		}

		function writeArrangement(write: unknown) {
			const w = check(arrangementWrite, write, 'writeArrangement');
			const order = w.song ? (w.song.order ?? w.song.scenes) : undefined;
			if (w.song && !order) throw new LabError('writeArrangement: song needs its order (scenes)');
			return virtual.writeArrangement({
				scenes: w.scenes,
				song: order ? { order, loop: w.song?.loop ?? true } : undefined
			});
		}

		/** The navigator's plan for settings as a program passes them, from where the fork stands. */
		function planned(input: unknown, what: 'set' | 'plan'): { list: Setting[]; plan: NavPlan } {
			const list = Array.isArray(input)
				? check(z.array(setting).min(1).max(16), input, what)
				: [check(setting, input, what)];
			const selected = virtual.status().selectedTrack;
			const goals = list.map((s) => {
				const goal = settingGoal(s, selected);
				if (typeof goal === 'string') throw new LabError(`${what} ${s.param}: ${goal}`);
				return goal;
			});
			const plan = goals.length === 1 ? virtual.plan(goals[0]) : virtual.plan({ settings: goals });
			return { list, plan };
		}

		function set(input: Setting | readonly Setting[]): SetResult {
			const { list, plan } = planned(input, 'set');
			if (!plan.reached) {
				const what = list.map((s) => `${s.track ? `track ${s.track} ` : ''}${s.param} ${s.value}`);
				throw new LabError(
					`set ${what.join(', ')}: not reached${plan.note ? ` (${plan.note})` : ''}; nothing was changed`
				);
			}
			for (const step of plan.steps) playStep(sim, step);
			return { reached: true, steps: plan.steps.map(stepText), screen: screenOf(sim) };
		}

		function plan(input: Setting | readonly Setting[]): SetResult {
			const { plan: p } = planned(input, 'plan');
			return {
				reached: p.reached,
				steps: p.steps.map(stepText),
				screen: p.screen,
				...(p.note ? { note: p.note } : {})
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
			readSound: (track: number) => virtual.readSound(check(track8, track, 'readSound track')),
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
		const sim = new OpxySim({ state: JSON.parse(JSON.stringify(f.sim.state)), now: () => 0 });
		if (scene === undefined) {
			options.virtual(sim).transport('play');
			return sim.state;
		}
		const shown = f.virtual.readArrangement().scenes.map((s) => s.scene);
		if (!shown.includes(scene)) {
			throw new LabError(`listen: scene ${scene} is empty (scenes: ${shown.join(', ')})`);
		}
		selectScene(sim.state, scene - 1);
		sim.press('key.play');
		return sim.state;
	}

	async function renderOf(state: SimState, seconds: number): Promise<ListenAnalysis> {
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
		const audio = await renderer.render(
			{
				project: snapshot(state),
				transport: { ...state.transport },
				track: state.track,
				mode: state.mode,
				seconds
			},
			options.signal
		);
		return analyzeAudio(audio.channels, audio.sampleRate, { expectedBpm: state.tempo.bpm });
	}

	async function listen(fork: Fork, listening?: ListenOptions): Promise<Heard> {
		const f = record(fork, 'listen');
		const o = check(listenOptions, listening ?? {}, 'listen');
		const state = playing(f, o.scene);
		const click = state.tempo.metronome.on
			? '\nnote: the metronome is on, so its click is in what you heard'
			: '';
		if (!o.tracks) {
			const analysis = await renderOf(state, o.seconds ?? LISTEN_SECONDS);
			const summary = summarize(analysis, { source: f.name });
			return { text: summary.text + click, flags: summary.flags, data: summary.data };
		}
		const tracks =
			o.tracks === 'each'
				? state.tracks.flatMap((t, i) => {
						const p = t.sequence.patterns[t.sequence.current];
						return p?.steps.some((s) => s.notes.length > 0) ? [i + 1] : [];
					})
				: o.tracks;
		if (tracks.length === 0) throw new LabError('listen: no instrument track plays anything here');
		const takes: TrackTake[] = [];
		for (const track of tracks) {
			const alone = JSON.parse(JSON.stringify(state)) as SimState;
			alone.tracks.forEach((t, i) => (t.mix.muted = i !== track - 1));
			const engine = alone.tracks[track - 1].engine;
			const analysis = await renderOf(alone, o.seconds ?? TRACK_SECONDS);
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
			return makeFork(forkState(json), parent.origin, json);
		},
		listen,
		commit(fork: Fork, label: string): ReplicaDiff {
			const f = record(fork, 'commit');
			const text = check(z.string().trim().min(1).max(80), label, 'commit label');
			const before = sideOf(JSON.parse(JSON.stringify(replica)) as SimState);
			applyProject(replica, f.origin, snapshot(f.sim.state));
			const diff = diffReplica(before, sideOf(replica));
			commits.push({ label: text, changes: diff.changes });
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
			const diff = diffReplica(
				sideOf(JSON.parse(JSON.stringify(replica)) as SimState),
				sideOf(trial)
			);
			if (diff.same) throw new LabError(`offer: “${text}” changes nothing on the replica`);
			takes.push({ label: text, changes: diff.changes, base: f.origin, project });
			return diff;
		},
		log: () => {}
	});

	return {
		lab,
		commits: () => [...commits],
		takes: () => [...takes],
		project: () => (committed ? snapshot(replica) : null),
		counts: () => ({ forks, listens: renders })
	};
}
