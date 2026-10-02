/**
 * The simulator's project as an OP-XY project file (M6). `simToXy` writes a `SimState` over a
 * template `.xy` (the blank project a device saved, or the owner's own) with `writeProject`: the
 * settings, every track's patterns with their notes, step components and locks, the scenes and the
 * songs, as far as docs/research/10-xy-format.md has decoded them. Everything else in the file is
 * the template's, sounds included, and what the simulator holds but the file cannot take yet comes
 * back as `skipped`, one line each, so nothing is lost silently.
 *
 * Where the simulator's value and the template's byte mean the same thing (a lossy scale, a mute
 * written as 1 rather than 2, a song never chosen), the template's byte stays: a project nobody
 * touched writes back as its template.
 */
import type { EngineId } from '$lib/core/opxy';
import { captureScene, copy, lengthSettings } from '$lib/sim/areas/arrange/model';
import { SCENES as SIM_SCENES, type PatternSound } from '$lib/sim/areas/arrange/state';
import { octaveKey } from '$lib/sim/areas/sequencer/model';
import { FX_TYPES, type FxSlot } from '$lib/sim/areas/auxiliary/state';
import {
	FIRST_NOTE,
	KEYS,
	KIT,
	defaultRegion,
	defaultSamplerTrack,
	placeZone,
	projectSampleFile,
	type Region,
	type SampleFile,
	type SamplerTrack,
	type Zone
} from '$lib/sim/areas/sample/state';
import { SCENE_LENGTH_MODES, SIGNATURES } from '$lib/sim/areas/system/catalogue';
import { loadEngineSound, loadPreset, presetKey } from '$lib/sim/areas/system/presets';
import {
	NEW_PROJECT_PRESETS,
	PORTAMENTO_MAX,
	fromQ15,
	presetSettingsOf,
	soundOf,
	type StoredSound
} from '$lib/sim/defaults';
import {
	FILTER_TYPES,
	LFO_SYNC_STEPS,
	LFO_TYPES,
	SAMPLER_TUNE_RANGE,
	clamp,
	defaultState,
	defaultTrack,
	type SimState,
	type TrackState
} from '$lib/sim/params';
import {
	MAX_STEPS,
	STEPS_PER_BAR,
	emptyPattern,
	formatScale,
	type Pattern
} from '$lib/sim/sequencer';
import { hex2 } from '$lib/core/xy/bytes';
import { SCENES, TICKS_PER_STEP, TRACKS } from '$lib/core/xy/layout';
import {
	LOOP_BITS,
	REGION_END,
	XY_EFFECTS,
	XY_ENGINES,
	XY_FILTERS,
	XY_LFOS,
	XY_SCALES,
	XY_SCENE_LENGTHS,
	XY_TIME_SIGNATURES,
	blankPattern,
	playModeOf,
	quantizeByte,
	quantizePercent,
	sampleHome,
	timeSignatureOf,
	scaleByte,
	trackGrooveByte,
	trackGrooveValue,
	type XyLock,
	type XyNote,
	type XyPattern,
	type XyProject,
	type XySampleRegion,
	type XySoundState,
	type XyStepComponent
} from '$lib/core/xy/model';
import { readProject } from '$lib/core/xy/read';
import { writeProject } from '$lib/core/xy/write';

/** What {@link simToXy} made. */
export interface SimToXyResult {
	/** The `.xy` file. */
	bytes: Uint8Array;
	/** The model it was written from: what `readProject(bytes)` reads back. */
	project: XyProject;
	/** What the simulator holds that the file does not take yet, one line each, for the user. */
	skipped: string[];
}

/**
 * The simulator's lock ids with a known lock column (`sim/areas/sequencer/locks.ts`; note 10 §3.9,
 * from the hold-record captures u121–u126). All are 0–99 lanes. The rest (the LFO, play mode and bend
 * choices, sampler keys, the midi program, the auxiliary pages) have no column we can name yet.
 */
const LOCK_COLUMNS: Readonly<Record<string, number>> = {
	'm1.1': 1,
	'm1.2': 2,
	'm1.3': 3,
	'm1.4': 4,
	'amp.attack': 9,
	'amp.decay': 10,
	'amp.sustain': 11,
	'amp.release': 12,
	'playMode.portamento': 14,
	'playMode.volume': 16,
	'filter.cutoff': 17,
	'filter.resonance': 18,
	'filter.envAmount': 19,
	'filter.keyTracking': 20,
	'sends.aux': 21,
	'sends.tape': 22,
	'sends.fx1': 23,
	'sends.fx2': 24,
	'filterEnv.attack': 33,
	'filterEnv.decay': 34,
	'filterEnv.sustain': 35,
	'filterEnv.release': 36
};

/** The lock columns the simulator has an id for; locks in the others stay as the template has them. */
const KNOWN_COLUMNS: ReadonlySet<number> = new Set(Object.values(LOCK_COLUMNS));

/** Lock lanes past 0–99: portamento runs 0–127, as its card reads. */
const LANE_MAX: Readonly<Record<string, number>> = { 'playMode.portamento': PORTAMENTO_MAX };

/** A lock's value as the device stores it, 0–32767 over its lane (the inverse of {@link laneOf}). */
const toQ15 = (id: string, value: number) => Math.round((value / (LANE_MAX[id] ?? 99)) * 32767);

/** A stored lock value on its lane (0–99, or portamento's 0–127). */
const laneOf = (id: string, raw: number) => (raw / 32767) * (LANE_MAX[id] ?? 99);

/** The template's raw value when it reads as `value`, else `value` encoded. */
function keep<T>(raw: number, decode: (raw: number) => T, value: T, encode: (v: T) => number) {
	return decode(raw) === value ? raw : encode(value);
}

/**
 * Compiles the simulator's project into a `.xy` file over `template`.
 *
 * Written: tempo, groove type and amount, the metronome, the project settings (transpose, scene
 * length, time signature, voices, MIDI channels), the keyboard octaves of the tracks whose keys
 * transpose, every track's patterns (length, note length, track scale, quantisation, groove,
 * smoothing, notes, step components and the locks with a known column), the 99 scenes (patterns and
 * mutes) and the 14 songs. A pattern the template lacks starts as that track's first pattern there.
 *
 * Not written, and listed in `skipped` when the simulator's state differs from the template's:
 * sounds (engines, presets and their settings), mixer levels and pans, players, quantisation's
 * on/off switch, track scales and grooves without a known byte, and locks without a known column.
 * Auxiliary settings (brain, FX types, external MIDI) are the template's.
 *
 * The metronome is one byte in the file: its volume, with 0 for off (OS 1.1.4 captures); a new
 * project has it on at 0xA8, in the simulator as on the device.
 * @throws XyModelError when the state breaks a limit of the file (see `writeProject`).
 * @throws XyFormatError when the template is not a project we can write over.
 */
export function simToXy(state: SimState, template: Uint8Array): SimToXyResult {
	const base = readProject(template);
	const project = structuredClone(base);
	const skipped: string[] = [];
	writeSettings(state, base, project);
	for (let t = 0; t < TRACKS; t++) {
		project.tracks[t].patterns = writePatterns(state, t, base, skipped);
		reportSound(state, t, base, skipped);
	}
	writeScenes(state, base, project, skipped);
	project.songs = state.areas.arrange.songs.map((song, i) => {
		const was = base.songs[i];
		// a song never edited can be stored empty (TE's factory project "agent"); the simulator holds scene 1
		const untouched = was?.scenes.length === 0 && song.order.length === 1 && song.order[0] === 0;
		return untouched && was.loop === song.loop ? was : { scenes: [...song.order], loop: song.loop };
	});
	return { bytes: writeProject(project, template), project, skipped };
}

// ─── settings ───────────────────────────────────────────────────────────────────────────────────

/** Whether a track's keys play fixed sounds, so the simulator keeps no octave for it. */
function fixedKeys(state: SimState, t: number): boolean {
	return t < 8 ? state.tracks[t].engine === 'drum' : t === 9;
}

function writeSettings(state: SimState, base: XyProject, project: XyProject): void {
	const was = base.settings;
	const s = project.settings;
	const { tempo, areas } = state;
	const settings = areas.system.projectSettings;
	const { mode, signature } = lengthSettings(state);
	s.tempo = Math.round(tempo.bpm * 10) / 10;
	s.grooveType = tempo.groove;
	// our ±99 spans the tempo page's slider, the file's −127…127 its ends (note 59 §2.11)
	s.grooveAmount = keep(
		was.grooveAmount,
		(raw) => Math.round((raw / 127) * 99),
		tempo.swing,
		(v) => Math.round((v / 99) * 127)
	);
	s.clickVolume = tempo.metronome.on
		? keep(
				was.clickVolume,
				(raw) => Math.round((raw / 255) * 99),
				tempo.metronome.level,
				(v) => Math.round((v / 99) * 255)
			)
		: 0;
	s.activeScene = areas.arrange.scene;
	s.activeSong = areas.arrange.song;
	s.sceneLength = XY_SCENE_LENGTHS.indexOf(mode);
	// a byte in either form that means the same signature stays as it is
	s.timeSignature =
		timeSignatureOf(was.timeSignature) === signature
			? was.timeSignature
			: 0x10 + XY_TIME_SIGNATURES.indexOf(signature);
	s.transpose = settings.transpose;
	s.voices = settings.voices.slice(0, 8);
	s.midiChannels = settings.channels.slice(0, TRACKS).map((channel) => channel || null);
	s.octaves = was.octaves.map((octave, t) => {
		if (fixedKeys(state, t)) return octave;
		const key = t < 8 ? octaveKey('instrument', t) : octaveKey('auxiliary', t - 8);
		return areas.sequencer.octaves[key] ?? 0;
	});
}

// ─── patterns ───────────────────────────────────────────────────────────────────────────────────

function writePatterns(state: SimState, t: number, base: XyProject, skipped: string[]) {
	const sequence = t < 8 ? state.tracks[t].sequence : state.aux[t - 8].sequence;
	const from = base.tracks[t].patterns;
	return sequence.patterns.map((pattern, i) => {
		const was = from[i] ?? blankPattern(from[0]);
		const written = writePattern(pattern, was, `T${t + 1} pattern ${i + 1}`, skipped);
		// the device marks a pattern edited when its sequence or bar settings change (not smoothing)
		const edited =
			written.steps !== was.steps ||
			written.noteLength !== was.noteLength ||
			written.scale !== was.scale ||
			written.quantize !== was.quantize ||
			written.groove !== was.groove ||
			written.notes !== was.notes ||
			written.components !== was.components ||
			written.locks !== was.locks;
		return { ...written, pristine: edited ? 0 : was.pristine };
	});
}

/**
 * One pattern over the template's (`was`): its bar settings, notes, components and locks. A list
 * that means the same as the template's is the template's own array, so the caller can tell.
 */
function writePattern(p: Pattern, was: XyPattern, where: string, skipped: string[]): XyPattern {
	const scale = XY_SCALES[was.scale] === p.scale ? was.scale : scaleByte(p.scale);
	if (scale === null) {
		skipped.push(
			`${where}: track scale ${formatScale(p.scale)} has no known byte yet (1/2, 1, 2 and 16 do); the template's stays`
		);
	}
	const groove = trackGrooveValue(was.groove) === p.groove ? was.groove : trackGrooveByte(p.groove);
	if (groove === null) {
		skipped.push(
			`${where}: groove ${p.groove} is off the bar menu's detents; the template's stays`
		);
	}
	if (!p.quantiseOn) {
		skipped.push(
			`${where}: quantisation is switched off, which has no known byte (${p.quantise} kept)`
		);
	}
	if (p.player.on) {
		skipped.push(`${where}: the ${p.player.type} player (players are not in the file map yet)`);
	}
	const notes = p.steps.flatMap((step, i) =>
		step.notes.map((n): XyNote => ({
			tick: Math.round((i + n.offset) * TICKS_PER_STEP),
			gate: Math.round(n.length * TICKS_PER_STEP),
			note: n.note,
			velocity: n.velocity,
			flags: 0
		}))
	);
	const sameNotes = sameList(
		notes,
		was.notes,
		(n) => `${n.tick} ${n.note} ${n.gate} ${n.velocity}`
	);
	const components = p.steps.flatMap((step, i) =>
		step.components.map((c): XyStepComponent => ({ step: i, kind: c.kind, value: c.value }))
	);
	const locks = writeLocks(p, was, where, skipped);
	return {
		...was,
		steps: p.length,
		// the file keeps ticks and the bar menu shows hundredths of a step; the device steps the ticks
		// by 4 (bar-l-*), so a length that reads the same keeps the template's byte
		noteLength: keep(
			was.noteLength,
			(ticks) => Math.round(ticks / 4.8),
			Math.round(p.noteLength * 100),
			() => Math.round(p.noteLength * TICKS_PER_STEP)
		),
		scale: scale ?? was.scale,
		quantize: keep(was.quantize, quantizePercent, p.quantise, quantizeByte),
		groove: groove ?? was.groove,
		smoothing: keep(
			was.smoothing,
			(raw) => Math.round((raw / 255) * 99),
			p.smoothing,
			(v) => Math.round((v / 99) * 255)
		),
		notes: sameNotes ? was.notes : notes,
		// the lanes belong to the take the template's notes came from
		lanes: sameNotes ? was.lanes : new Uint8Array(3),
		components: sameList(components, was.components, (c) => `${c.step} ${c.kind} ${c.value}`)
			? was.components
			: components,
		locks: sameList(locks, was.locks, (l) => `${l.step} ${l.column} ${l.value}`) ? was.locks : locks
	};
}

/** The pattern's locks with a known column, 0–99 as 0–32767; the others go to `skipped`. */
function writeLocks(p: Pattern, was: XyPattern, where: string, skipped: string[]): XyLock[] {
	const locks: XyLock[] = [];
	const unmapped = new Map<string, number>();
	p.steps.forEach((step, i) => {
		for (const [id, value] of Object.entries(step.locks)) {
			const column = LOCK_COLUMNS[id];
			if (column === undefined || !(value >= 0 && value <= (LANE_MAX[id] ?? 99))) {
				unmapped.set(id, (unmapped.get(id) ?? 0) + 1);
				continue;
			}
			const old = was.locks.find((l) => l.step === i && l.column === column);
			const same = old !== undefined && Math.abs(laneOf(id, old.value) - value) < 1e-9;
			locks.push({ step: i, column, value: same ? old.value : toQ15(id, value) });
		}
	});
	for (const [id, count] of unmapped) {
		skipped.push(`${where}: ${count} lock${count > 1 ? 's' : ''} of ${id} (no known lock column)`);
	}
	// the simulator cannot see locks in columns it has no id for: they stay as the template has them
	for (const lock of was.locks) {
		if (!KNOWN_COLUMNS.has(lock.column) && lock.step < p.length) locks.push(lock);
	}
	return locks;
}

/** Whether two lists hold the same items, order aside. */
function sameList<T>(a: readonly T[], b: readonly T[], key: (item: T) => string): boolean {
	if (a.length !== b.length) return false;
	const keys = b.map(key).sort();
	return a
		.map(key)
		.sort()
		.every((k, i) => k === keys[i]);
}

// ─── sounds ─────────────────────────────────────────────────────────────────────────────────────

/** The fields of a track's sound that a pattern's settings hold (the mixer is read apart). */
const LANE_KEYS = [
	'engine',
	'm1',
	'amp',
	'filterEnv',
	'playMode',
	'filter',
	'sends',
	'lfo'
] as const satisfies readonly (keyof PatternSound)[];

/** The fields a pattern's sound slot keeps (the arrange area's {@link PatternSound}). */
const SLOT_KEYS = [
	...LANE_KEYS,
	'drumKeys',
	'midi'
] as const satisfies readonly (keyof PatternSound)[];

/**
 * A pattern's settings in the shape `knowledge/presets/new-project.json` stores a new project's
 * sounds, for `soundOf`. A filter or LFO type we cannot name keeps `base`'s, and says so.
 */
function storedOf(
	state: XySoundState,
	engine: EngineId,
	base: TrackState,
	where: string,
	skipped?: string[]
): StoredSound {
	const filter = FILTER_TYPES.find((f) => f === XY_FILTERS[state.filter.type]);
	const lfo = LFO_TYPES.find((l) => l === XY_LFOS[state.lfo.type]);
	if (!filter) {
		skipped?.push(
			`${where}: filter type byte ${hex2(state.filter.type)} is not one we know (${base.filter.type} plays)`
		);
	}
	if (!lfo) {
		skipped?.push(
			`${where}: LFO type byte ${hex2(state.lfo.type)} is not one we know (${base.lfo.type} plays)`
		);
	}
	const four = (words: readonly number[]) => [words[0], words[1], words[2], words[3]] as const;
	return {
		engine,
		params: [...four(state.params)],
		amp: [...four(state.amp)],
		filterEnv: [...four(state.filterEnv)],
		playMode: playModeOf(state.playMode),
		portamento: { ...state.portamento },
		bend: state.bend,
		volume: state.volume,
		filter: {
			type: filter ?? base.filter.type,
			on: state.filter.on,
			params: [...four(state.filter.params)]
		},
		sends: [...four(state.sends)],
		lfo: { type: lfo ?? base.lfo.type, on: state.lfo.on, params: [...state.lfo.params] },
		velocity: { ...state.velocity },
		width: state.width,
		highpass: state.highpass,
		tuning: { ...state.tuning },
		modulation: {
			modwheel: [...state.modulation.modwheel],
			aftertouch: [...state.modulation.aftertouch],
			pitchbend: [...state.modulation.pitchbend]
		},
		mix: { ...state.mix }
	};
}

/** The sound a pattern's settings make over `base` (a track of the same engine). */
const soundFrom = (stored: StoredSound, base: TrackState) =>
	soundOf(stored, base, LFO_SYNC_STEPS.length);

/** The listed fields of a sound, copied. */
function pick<K extends keyof TrackState>(
	sound: TrackState,
	keys: readonly K[]
): Pick<TrackState, K> {
	return copy(Object.fromEntries(keys.map((k) => [k, sound[k]])) as Pick<TrackState, K>);
}

/** Whether a track plays what a pattern's settings say, field by field. */
function playsSettings(track: TrackState, state: XySoundState, engine: EngineId): boolean {
	const filed = soundFrom(storedOf(state, engine, track, ''), track);
	return LANE_KEYS.every((k) => JSON.stringify(track[k]) === JSON.stringify(filed[k]));
}

// ─── what stays the template's ──────────────────────────────────────────────────────────────────

/**
 * Notes where the track's sound differs from the template's, which the file keeps: another engine
 * on a pattern, another preset, or settings changed from the file's; then the mixer.
 */
function reportSound(state: SimState, t: number, base: XyProject, skipped: string[]): void {
	const aux = t >= 8;
	const sequence = aux ? state.aux[t - 8].sequence : state.tracks[t].sequence;
	const filed = (i: number) => (base.tracks[t].patterns[i] ?? base.tracks[t].patterns[0]).sound;
	const name = `T${t + 1}`;
	if (!aux) {
		const track = state.tracks[t];
		sequence.patterns.forEach((_, i) => {
			const sound = i === sequence.current ? track : state.areas.arrange.sounds[t]?.[i];
			const engine = filed(i).engine;
			if (sound && sound.engine !== XY_ENGINES[engine]) {
				skipped.push(
					`${name} pattern ${i + 1}: plays ${sound.engine}; the file keeps the template's ${XY_ENGINES[engine] ?? `engine ${hex2(engine)}`} (sounds are not written yet)`
				);
			}
		});
		const preset = state.areas.system.trackPresets[t];
		const current = filed(sequence.current);
		if (track.engine === XY_ENGINES[current.engine]) {
			if (preset && preset !== current.preset) {
				skipped.push(`${name}: preset ${preset}; the file keeps the template's ${current.preset}`);
			} else if (!playsSettings(track, current.state, track.engine)) {
				skipped.push(
					`${name}: the changes to ${preset ? `${preset}'s` : 'its'} sound (sounds are not written yet)`
				);
			}
		}
	}
	const mix = aux ? state.aux[t - 8].mix : state.tracks[t].mix;
	const current = filed(sequence.current);
	const level = fromQ15(current.volume >>> 16);
	const pan = (((current.pan >>> 16) - 16384) / 16383) * 100;
	if (Math.abs(mix.level - level) >= 0.5 || Math.abs(mix.pan - pan) >= 0.5) {
		skipped.push(
			`${name}: mixer level ${Math.round(mix.level)} and pan ${Math.round(mix.pan)} (volume and pan sit in each pattern's sound, not written yet)`
		);
	}
}

// ─── scenes ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The 99 scenes: the playing one as the tracks have it, the others as stored, empty ones blank. A
 * lone scene 1 with nothing chosen keeps the template's flag: OS 1.1.4 saves a blank project without
 * it, OS 1.1.33 with it.
 */
function writeScenes(state: SimState, base: XyProject, project: XyProject, skipped: string[]) {
	const a = state.areas.arrange;
	const playing = captureScene(state);
	const count = a.scenes.filter((scene, k) => scene !== null || k === a.scene).length;
	for (let k = 0; k < SCENES; k++) {
		const scene = k === a.scene ? playing : a.scenes[k];
		const was = base.scenes[k];
		if (!scene) {
			project.scenes[k] = {
				patterns: Array(TRACKS).fill(0),
				mutes: Array(TRACKS).fill(false),
				used: false
			};
			continue;
		}
		const patterns = Array.from({ length: TRACKS }, (_, t) => scene.patterns[t] ?? 0);
		const mutes = Array.from({ length: TRACKS }, (_, t) => scene.mix[t]?.muted ?? false);
		const blank = patterns.every((p) => p === 0) && mutes.every((m) => !m);
		project.scenes[k] = {
			patterns,
			mutes,
			used: k === 0 && blank && count === 1 ? was.used : true
		};
		const mixed = scene.mix.some(
			(m, t) => m.level !== playing.mix[t]?.level || m.pan !== playing.mix[t]?.pan
		);
		if (k !== a.scene && mixed) {
			skipped.push(`scene ${k + 1}: its own mixer levels and pans (a scene keeps only mutes)`);
		}
	}
}

// ─── the other way: a project file into the simulator ───────────────────────────────────────────

/** What {@link xyToSim} made. */
export interface XyToSimResult {
	/** The simulator's state with the file's project in it. */
	state: SimState;
	/** What the file holds that the simulator does not take, one line each, for the user. */
	skipped: string[];
}

/** Lock columns by number: the simulator's lock id for each known one. */
const LOCK_IDS: Readonly<Record<number, string>> = Object.fromEntries(
	Object.entries(LOCK_COLUMNS).map(([id, column]) => [column, id])
);

/**
 * Loads a project file into the simulator: the reverse of {@link simToXy}. It starts from `base`
 * (a new project by default) and takes the file's settings, every track's patterns with their
 * notes, step components and locks, the scenes, the songs, each instrument track's sound (the
 * preset its playing pattern names, with that pattern's stored settings over it; the other
 * patterns' sounds load when they play), the samples its drum keys, sampler and zones name (by
 * path: the file holds no audio, so stand-ins play until `app/device-samples` hands it over) and
 * FX I and FX II. What the file names but the replica lacks (TE's factory samples, a type byte we
 * cannot name) is said in `skipped`. The mixer takes each track's level and pan from its playing
 * pattern and its mute from the scene.
 * @throws XyFormatError when the bytes are not a project we can read.
 */
export function xyToSim(file: Uint8Array | XyProject, base?: SimState): XyToSimResult {
	const project = file instanceof Uint8Array ? readProject(file) : file;
	const state = structuredClone(base ?? defaultState());
	const skipped: string[] = [];
	readSettings(project, state, skipped);
	const scene = project.scenes[project.settings.activeScene] ?? project.scenes[0];
	for (let t = 0; t < TRACKS; t++) {
		const sequence = t < 8 ? state.tracks[t].sequence : state.aux[t - 8].sequence;
		const patterns = project.tracks[t].patterns;
		sequence.patterns = patterns.map((p, i) =>
			readPattern(p, `T${t + 1} pattern ${i + 1}`, skipped)
		);
		sequence.current = Math.min(patterns.length - 1, Math.max(0, scene?.patterns[t] ?? 0));
		sequence.page = 0;
		if (t < 8) {
			state.areas.arrange.sounds[t] = patterns.map(() => null);
			// the file's samples replace the replica's: what it does not name starts as a new project's
			state.areas.sample.tracks[t] = defaultSamplerTrack(t);
			readSound(project, state, t, sequence.current, skipped);
		}
		const sound = patterns[sequence.current].sound;
		const mix = t < 8 ? state.tracks[t].mix : state.aux[t - 8].mix;
		// as exact as the simulator keeps them, so a project loaded and saved writes the same bytes
		mix.level = fromQ15(sound.volume >>> 16);
		mix.pan = (((sound.pan >>> 16) - 16384) / 16383) * 100;
		mix.muted = scene?.mutes[t] ?? false;
	}
	readEffects(project, state, skipped);
	// after the sounds: a loaded preset brings its own octave, the file's says where the keys are
	readOctaves(project, state);
	readScenes(project, state);
	state.areas.arrange.songs = project.songs.map((song) => ({
		order: song.scenes.length > 0 ? [...song.scenes] : [0],
		loop: song.loop
	}));
	return { state, skipped };
}

function readSettings(project: XyProject, state: SimState, skipped: string[]): void {
	const s = project.settings;
	const { tempo, areas } = state;
	const settings = areas.system.projectSettings;
	tempo.bpm = s.tempo;
	tempo.groove = s.grooveType;
	tempo.swing = Math.round((s.grooveAmount / 127) * 99);
	tempo.metronome.on = s.clickVolume > 0;
	if (s.clickVolume > 0) tempo.metronome.level = Math.round((s.clickVolume / 255) * 99);
	areas.arrange.scene = Math.min(SIM_SCENES - 1, s.activeScene);
	areas.arrange.song = s.activeSong;
	const mode = XY_SCENE_LENGTHS[s.sceneLength];
	const signature = timeSignatureOf(s.timeSignature);
	// the project page offers longest and time signature; "shortest" has no place there yet
	const length = SCENE_LENGTH_MODES.findIndex((m) => m === mode);
	if (length >= 0) settings.sceneLength = length;
	else if (mode)
		skipped.push(`scene length "${mode}" (the project page offers longest and time signature)`);
	const bar = SIGNATURES.findIndex((sig) => sig === signature);
	if (bar >= 0) settings.signature = bar;
	settings.transpose = s.transpose;
	settings.voices = [...s.voices];
	settings.channels = s.midiChannels.map((channel) => channel ?? 0);
	if (s.activeScene >= SIM_SCENES) {
		skipped.push(`the playing scene ${s.activeScene + 1} (the simulator keeps 99 scenes)`);
	}
}

/** Each track's keyboard octave, kept only where it is not 0, as the simulator keeps them. */
function readOctaves(project: XyProject, state: SimState): void {
	const octaves = state.areas.sequencer.octaves;
	project.settings.octaves.forEach((octave, t) => {
		if (fixedKeys(state, t)) return;
		const key = t < 8 ? octaveKey('instrument', t) : octaveKey('auxiliary', t - 8);
		if (octave) octaves[key] = octave;
		else delete octaves[key];
	});
	// a preset loaded onto a drum track may have left a 0 behind
	for (const [key, octave] of Object.entries(octaves)) if (!octave) delete octaves[key];
}

/** A pattern from the file: its bar settings, notes, components and the locks with a known column. */
function readPattern(p: XyPattern, where: string, skipped: string[]): Pattern {
	const pattern = emptyPattern();
	pattern.length = Math.max(1, Math.min(MAX_STEPS, p.steps));
	pattern.bars = Math.ceil(pattern.length / STEPS_PER_BAR);
	const scale = XY_SCALES[p.scale];
	if (scale === undefined) {
		skipped.push(`${where}: track scale byte ${hex2(p.scale)} is not decoded yet (1 kept)`);
	} else pattern.scale = scale;
	pattern.quantise = quantizePercent(p.quantize);
	pattern.noteLength = Math.max(0.01, Math.min(1, p.noteLength / TICKS_PER_STEP));
	const groove = trackGrooveValue(p.groove);
	if (groove === null)
		skipped.push(`${where}: groove byte ${p.groove} is off the detents (0 kept)`);
	else pattern.groove = groove;
	pattern.smoothing = Math.round((p.smoothing / 255) * 99);
	let outside = 0;
	for (const n of p.notes) {
		const step = Math.round(n.tick / TICKS_PER_STEP);
		if (step < 0 || step >= MAX_STEPS) {
			outside++;
			continue;
		}
		const length = n.gate / TICKS_PER_STEP;
		const offset = n.tick / TICKS_PER_STEP - step;
		const stepped = offset === 0 && n.gate === Math.round(pattern.noteLength * TICKS_PER_STEP);
		pattern.steps[step].notes.push({
			note: n.note,
			velocity: n.velocity,
			length,
			offset,
			...(stepped ? {} : { ownLength: true })
		});
	}
	if (outside > 0)
		skipped.push(`${where}: ${outside} note(s) before the first step or past the last`);
	for (const c of p.components)
		pattern.steps[c.step]?.components.push({ kind: c.kind, value: c.value });
	const unmapped = new Map<number, number>();
	for (const lock of p.locks) {
		const id = LOCK_IDS[lock.column];
		if (!id || !pattern.steps[lock.step]) {
			unmapped.set(lock.column, (unmapped.get(lock.column) ?? 0) + 1);
			continue;
		}
		pattern.steps[lock.step].locks[id] = laneOf(id, lock.value);
	}
	for (const [column, count] of unmapped) {
		skipped.push(
			`${where}: ${count} lock(s) in column ${column}, which the replica does not show (kept in the file)`
		);
	}
	return pattern;
}

/**
 * An instrument track's sound from its playing pattern: the preset it names loads as the preset
 * browser would (the library's, or the engine's starting sound), then the pattern's own settings
 * go over it, so the track plays what the file stores: M1, the envelopes, play mode, filter, sends,
 * LFO and the preset settings. The other patterns' settings wait in their sound slots and load
 * when those patterns play. What the settings cannot carry (TE's samples) says so in `skipped`.
 */
function readSound(
	project: XyProject,
	state: SimState,
	t: number,
	current: number,
	skipped: string[]
) {
	const patterns = project.tracks[t].patterns;
	const sound = patterns[current].sound;
	const engine = XY_ENGINES[sound.engine] as EngineId | undefined;
	const name = `T${t + 1}`;
	if (!engine) {
		skipped.push(`${name}: engine byte ${hex2(sound.engine)} is not one we know (its sound kept)`);
		return;
	}
	const system = state.areas.system;
	const known = system.presets.library.find((p) => presetKey(p) === sound.preset);
	if (known && known.engine === engine) loadPreset(state, t, known);
	else {
		loadEngineSound(state, t, engine);
		if (sound.preset && sound.preset !== '/') system.trackPresets[t] = sound.preset;
	}
	const track = state.tracks[t];
	const stored = storedOf(sound.state, engine, track, name, skipped);
	Object.assign(track, pick(soundFrom(stored, track), LANE_KEYS));
	system.presetSettings[t] = presetSettingsOf(stored, system.presetSettings[t]);
	readSamples(project, state, t, current, skipped);
	// TE's factory samples are not in the replica (nor on the device's drive): its stand-ins play,
	// as they do in a new project, whose kits and pad say nothing
	const own = sound.samples.some((r) => sampleHome(r.path) !== 'factory');
	if (
		SAMPLE_ENGINES.has(engine) &&
		!own &&
		!known?.sound &&
		!NEW_PROJECT_PRESETS.includes(sound.preset)
	) {
		skipped.push(
			`${name}: ${sound.preset && sound.preset !== '/' ? sound.preset : engine}'s samples are TE's and not in the replica, so its own ${engine === 'drum' ? 'kit' : 'tone'} plays`
		);
	}
	const slots = state.areas.arrange.sounds[t];
	patterns.forEach((p, i) => {
		if (i === current) return;
		const own = XY_ENGINES[p.sound.engine] as EngineId | undefined;
		if (!own) {
			skipped.push(
				`${name} pattern ${i + 1}: engine byte ${hex2(p.sound.engine)} is not one we know (the track's sound plays)`
			);
			return;
		}
		const base = own === engine ? track : defaultTrack(own);
		const where = `${name} pattern ${i + 1}`;
		slots[i] = pick(soundFrom(storedOf(p.sound.state, own, base, where, skipped), base), SLOT_KEYS);
	});
}

/**
 * FX I and FX II (T15, T16): the effect their playing pattern names in its engine byte, and its
 * four M1 settings.
 */
function readEffects(project: XyProject, state: SimState, skipped: string[]): void {
	state.areas.auxiliary.fx.forEach((slot, k) => {
		const t = 14 + k;
		const patterns = project.tracks[t].patterns;
		const sound = (patterns[state.aux[t - 8].sequence.current] ?? patterns[0]).sound;
		const type = FX_TYPES.find((f) => f === XY_EFFECTS[sound.engine]);
		if (!type) {
			skipped.push(
				`T${t + 1}: effect byte ${hex2(sound.engine)} is not one we know (${slot.type} kept)`
			);
			return;
		}
		slot.type = type;
		slot.params = [0, 1, 2, 3].map((i) => fromQ15(sound.state.params[i])) as FxSlot['params'];
	});
}

/** Engines that play samples, which a project file names but does not hold. */
const SAMPLE_ENGINES: ReadonlySet<EngineId> = new Set(['drum', 'sampler', 'multisampler']);

/** The device's sample rate: a region's frame count over it is the sample's length. */
const DEVICE_RATE = 44_100;

/**
 * The samples a track's patterns name, into the sample area: each sample engine's part (the drum
 * keys, the sampler's sample, the zones) from the first pattern that runs that engine, the playing
 * one first. Files keep their path as their id: a project names its samples but holds no audio, so
 * until the audio arrives (read from the device, `app/device-samples`) the stand-ins play. The area
 * keeps one set per engine, so a pattern naming other samples than that one is noted.
 */
function readSamples(
	project: XyProject,
	state: SimState,
	t: number,
	current: number,
	skipped: string[]
): void {
	const patterns = project.tracks[t].patterns;
	const held = state.areas.sample.tracks[t];
	const taken = new Map<EngineId, { pattern: number; samples: string }>();
	const order = [current, ...patterns.keys()].filter((i, k, all) => all.indexOf(i) === k);
	for (const i of order) {
		const sound = patterns[i].sound;
		const engine = XY_ENGINES[sound.engine] as EngineId | undefined;
		if (!engine || !SAMPLE_ENGINES.has(engine)) continue;
		const samples = sound.samples.map((r) => `${r.key} ${r.path}`).join('\n');
		const first = taken.get(engine);
		if (first) {
			if (first.samples !== samples) {
				skipped.push(
					`T${t + 1} pattern ${i + 1}: its own samples (the replica keeps one set per engine, pattern ${first.pattern + 1}'s)`
				);
			}
			continue;
		}
		taken.set(engine, { pattern: i, samples });
		if (engine === 'drum') held.keys = drumKeysOf(sound.samples);
		else if (engine === 'sampler') held.synth = synthOf(sound.samples);
		else held.zones = zonesOf(sound.samples);
		held.selection = [];
	}
}

/** A region's sample length in seconds, or `fallback` while the device has not measured it. */
const secondsOf = (r: XySampleRegion, fallback: number) =>
	r.frames > 0 ? r.frames / DEVICE_RATE : fallback;

/**
 * The drum keys a kit's regions fill: each on the key its key byte names (53–76; a region naming
 * another key keeps its own place), the others empty.
 */
function drumKeysOf(regions: readonly XySampleRegion[]): (SampleFile | null)[] {
	const keys: (SampleFile | null)[] = Array.from({ length: KEYS }, () => null);
	for (const r of regions) {
		const note = r.key - FIRST_NOTE;
		const index = note >= 0 && note < KEYS ? note : r.index;
		if (keys[index]) continue;
		keys[index] = projectSampleFile(r.path, secondsOf(r, KIT[index][1]));
	}
	return keys;
}

/** A root note byte, or 60 (neutral) where the byte is not a note. */
const rootOf = (r: XySampleRegion) => (r.root > 0 && r.root < 128 ? r.root : 60);

/** The synth sampler's sample: region 0 (or the first that holds one), its root and region. */
function synthOf(regions: readonly XySampleRegion[]): SamplerTrack['synth'] {
	const r = regions.find((region) => region.index === 0) ?? regions[0];
	if (!r) return { file: null, root: 60, region: defaultRegion() };
	const root = rootOf(r);
	return { file: projectSampleFile(r.path, secondsOf(r, 2), root), root, region: regionOf(r) };
}

/**
 * The multisampler's zones, by the top key each region names. The replica plays a zone unpitched
 * on its top key, so a sample rooted elsewhere is tuned by the difference.
 */
function zonesOf(regions: readonly XySampleRegion[]): Zone[] {
	let zones: Zone[] = [];
	for (const r of regions) {
		const region = regionOf(r);
		const root = r.root > 0 && r.root < 128 ? r.root : r.key;
		const tune = clamp(region.tune + r.key - root, -SAMPLER_TUNE_RANGE, SAMPLER_TUNE_RANGE);
		zones = placeZone(zones, {
			note: r.key,
			file: projectSampleFile(r.path, secondsOf(r, 2), root),
			region: { ...region, tune }
		});
	}
	return zones;
}

/**
 * A sampler region as the sample area keeps it: points as parts of the sample (the defaults while
 * the device has not measured it), the loop type from the mode's bits, the crossfade (the device
 * stops at 75 %, stored as 0x60000000), fine tune, gain and direction. Points that would leave
 * nothing to play (an end at or before the start) play the whole sample instead.
 */
function regionOf(r: XySampleRegion): Region {
	const base = defaultRegion();
	const frames = r.frames;
	const part = (v: number, fallback: number) =>
		frames > 0 && v !== REGION_END ? clamp(v / frames, 0, 1) : fallback;
	// the end is the last frame played: a whole sample ends on its last frame (or one past it)
	const played = frames > 0 && r.end !== REGION_END && r.end > r.start;
	const end = played ? clamp((r.end + 1) / frames, 0, 1) : 1;
	const start = played ? part(r.start, 0) : 0;
	const loopStart = clamp(part(r.loopStart, base.loopStart), start, end);
	const loopEnd = clamp(
		r.loopEnd === REGION_END ? end : part(r.loopEnd, base.loopEnd),
		loopStart,
		end
	);
	return {
		start,
		loopStart,
		loopEnd,
		end,
		loop: r.mode & LOOP_BITS.forever ? 'forever' : r.mode & LOOP_BITS.off ? 'off' : 'release',
		crossfade: clamp(Math.round((r.crossfade / 2 ** 31) * 100), 0, 75),
		tune: r.fine / 100,
		gain: clamp(r.gain, -30, 20),
		reverse: r.reverse
	};
}

/** The scenes the file uses: the pattern each track plays and its mute; the mix is the tracks'. */
function readScenes(project: XyProject, state: SimState): void {
	const a = state.areas.arrange;
	const mixOf = (t: number) => (t < 8 ? state.tracks[t].mix : state.aux[t - 8].mix);
	a.scenes = Array.from({ length: SIM_SCENES }, (_, k) => {
		const slot = project.scenes[k];
		if (!slot?.used && k !== a.scene) return null;
		return {
			patterns: Array.from({ length: TRACKS }, (_, t) => slot?.patterns[t] ?? 0),
			mix: Array.from({ length: TRACKS }, (_, t) => ({
				level: mixOf(t).level,
				pan: mixOf(t).pan,
				muted: slot?.mutes[t] ?? false
			}))
		};
	});
}
