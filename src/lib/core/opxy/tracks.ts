/**
 * The 16 tracks, their default MIDI channels and the engines that can run on them.
 *
 * Tracks 1–8 are instrument tracks, 9–16 auxiliary: 9 brain, 10 punch-in FX, 11 external MIDI,
 * 12 external CV, 13 external audio, 14 tape, 15 FX I, 16 FX II. The same eight track keys address
 * both banks; the instrument / auxiliary mode key chooses which. Channels here are **0-based wire
 * channels** (track N listens on channel N − 1, "channel N" in human terms).
 */
import { CC_TRACK_TYPES, type CcTrackType } from './ccMap.schema';
import type { Confidence } from './common.schema';
import { getControl } from './controls';
import { ccMapFile } from './data';
import { CcMapError, KnowledgeValidationError } from './errors';
import type { TrackKeyId } from './ids';

/** Track types (the keys of cc-map.json `trackTypes`). */
export const TRACK_TYPES = CC_TRACK_TYPES;
/** What a track is: an instrument track or one of the auxiliary track types. */
export type TrackType = CcTrackType;
/** The bank a track belongs to, i.e. the mode key that selects it. */
export type TrackKind = 'instrument' | 'auxiliary';

/** The synth, sampler and MIDI engines an instrument track can run. */
export const ENGINE_IDS = [
	'axis',
	'dissolve',
	'drum',
	'epiano',
	'hardsync',
	'multisampler',
	'organ',
	'prism',
	'sampler',
	'simple',
	'wavetable',
	'midi'
] as const;
/** An instrument engine. */
export type EngineId = (typeof ENGINE_IDS)[number];

/** The send effects FX I and FX II can run. */
export const FX_ENGINE_IDS = ['chorus', 'delay', 'distortion', 'lofi', 'phaser', 'reverb'] as const;
/** A send effect. */
export type FxEngineId = (typeof FX_ENGINE_IDS)[number];

/** One of the 16 tracks. */
export interface TrackInfo {
	/** 1–16. */
	readonly number: number;
	readonly kind: TrackKind;
	readonly type: TrackType;
	/** 1–8: the track key that selects it in its mode. */
	readonly slot: number;
	/** Control id of that track key. */
	readonly keyId: TrackKeyId;
	/** Short name: "track 3", "brain", "punch-in FX", "FX II", … */
	readonly name: string;
	/** How the guide addresses it: "T3" in instrument mode, "T1 brain" in auxiliary mode. */
	readonly alias: string;
	/** Role in a fresh default project ("drum 1", "bass", …) or the auxiliary role. */
	readonly role: string;
	/** 0-based MIDI channel the track listens on by default (= number − 1). */
	readonly defaultChannel: number;
	/** Engine of a fresh default project (instrument tracks; user-changeable). */
	readonly defaultEngine: EngineId | null;
	/** Effect of a fresh default project (FX tracks; user-changeable). */
	readonly defaultEffect: FxEngineId | null;
	/** Whether the track has an M4 LFO page (CC40–43 lanes). */
	readonly hasLfo: boolean;
	readonly confidence: Confidence;
	readonly source: readonly string[];
}

/** An instrument engine and its M1 parameters (CC12–15 on its track). */
export interface EngineInfo {
	readonly id: EngineId;
	readonly kind: 'synth' | 'sampler' | 'midi';
	/** Names of M1 parameters P1–P4 (dark, mid, light, white encoder); null = unused. */
	readonly params: readonly [string, string, string, string | null];
	/** Other names the engine has had (the midi engine was "external" before OS 1.0.15). */
	readonly aliases: readonly string[];
	readonly confidence: Confidence;
	readonly source: readonly string[];
	readonly notes: string | null;
}

/** A send effect and its M1 parameters (CC12–15 on tracks 15/16). */
export interface FxEngineInfo {
	readonly id: FxEngineId;
	readonly params: readonly [string, string, string, string];
	/** Effect-type byte in `.xy` project files (no CC selects the effect). */
	readonly typeByte: number;
	readonly confidence: Confidence;
	readonly source: readonly string[];
	readonly notes: string | null;
}

// Which track types have an M4 LFO page: the guide's auxiliary chapter documents LFO pages for
// external MIDI, external audio, tape and FX I/II, and none for brain, punch-in FX or external CV.
const HAS_LFO: Record<TrackType, boolean> = {
	instrument: true,
	brain: false,
	punchIn: false,
	externalMidi: true,
	externalCv: false,
	externalAudio: true,
	tape: true,
	fx: true
};

// Default send effects of a fresh project (cc-map.json channel descriptions + xy-format probes).
const DEFAULT_EFFECT: Readonly<Record<number, FxEngineId>> = { 15: 'delay', 16: 'reverb' };

const ENGINE_KIND: Record<EngineId, EngineInfo['kind']> = {
	axis: 'synth',
	dissolve: 'synth',
	epiano: 'synth',
	hardsync: 'synth',
	organ: 'synth',
	prism: 'synth',
	simple: 'synth',
	wavetable: 'synth',
	drum: 'sampler',
	sampler: 'sampler',
	multisampler: 'sampler',
	midi: 'midi'
};

const ENGINE_ALIASES: Partial<Record<EngineId, readonly string[]>> = { midi: ['external'] };

const AUX_ROLE_TYPE: Record<string, TrackType> = {
	brain: 'brain',
	punchIn: 'punchIn',
	externalMidi: 'externalMidi',
	externalCv: 'externalCv',
	externalAudio: 'externalAudio',
	tape: 'tape',
	fx1: 'fx',
	fx2: 'fx'
};

function invalid(issue: string): never {
	throw new KnowledgeValidationError('knowledge/midi/cc-map.json', [issue]);
}

const isEngineId = (id: string): id is EngineId => (ENGINE_IDS as readonly string[]).includes(id);
const isFxEngineId = (id: string): id is FxEngineId =>
	(FX_ENGINE_IDS as readonly string[]).includes(id);

/** All 16 tracks, in order (index 0 = track 1). */
export const TRACKS: readonly TrackInfo[] = ccMapFile.channels.defaults.map((entry) => {
	const auxiliary = entry.kind === 'auxiliary';
	const slot = auxiliary
		? (entry.auxIndex ?? invalid(`track ${entry.track}: no auxIndex`))
		: entry.track;
	const keyId = `track.${slot}` as TrackKeyId;
	const key = getControl(keyId);
	const type = auxiliary
		? (AUX_ROLE_TYPE[entry.role] ?? invalid(`track ${entry.track}: unknown role ${entry.role}`))
		: 'instrument';
	if (!ccMapFile.trackTypes[type].tracks.includes(entry.track)) {
		invalid(`track ${entry.track} is not listed under trackTypes.${type}.tracks`);
	}
	const engine = entry.defaultEngine ?? null;
	if (engine !== null && !isEngineId(engine)) invalid(`track ${entry.track}: engine ${engine}`);
	const name = auxiliary ? (key.track?.auxiliary.name ?? entry.role) : `track ${entry.track}`;
	return {
		number: entry.track,
		kind: entry.kind,
		type,
		slot,
		keyId,
		name,
		alias: auxiliary ? `T${slot} ${name}` : `T${slot}`,
		role: entry.role,
		defaultChannel: entry.channel - 1,
		defaultEngine: engine,
		defaultEffect: DEFAULT_EFFECT[entry.track] ?? null,
		hasLfo: HAS_LFO[type],
		confidence: entry.confidence,
		source: entry.source
	};
});

/** Instrument tracks 1–8. */
export const INSTRUMENT_TRACKS: readonly TrackInfo[] = TRACKS.filter(
	(t) => t.kind === 'instrument'
);
/** Auxiliary tracks 9–16. */
export const AUXILIARY_TRACKS: readonly TrackInfo[] = TRACKS.filter((t) => t.kind === 'auxiliary');

/** Instrument engines with their M1 parameter names. */
export const ENGINES: readonly EngineInfo[] = ENGINE_IDS.map((id) => {
	const entry = ccMapFile.engines[id] ?? invalid(`engines.${id} is missing`);
	return {
		id,
		kind: ENGINE_KIND[id],
		params: [entry.p1, entry.p2, entry.p3, entry.p4],
		aliases: ENGINE_ALIASES[id] ?? [],
		confidence: entry.confidence,
		source: entry.source,
		notes: entry.notes ?? null
	};
});

/** Send effects with their M1 parameter names and `.xy` type bytes. */
export const FX_ENGINES: readonly FxEngineInfo[] = FX_ENGINE_IDS.map((id) => {
	const entry = ccMapFile.fxEngines[id] ?? invalid(`fxEngines.${id} is missing`);
	return {
		id,
		params: [entry.p1, entry.p2, entry.p3, entry.p4 ?? invalid(`fxEngines.${id}.p4 is null`)],
		typeByte: ccMapFile.fxTypeBytes[id],
		confidence: entry.confidence,
		source: entry.source,
		notes: entry.notes ?? null
	};
});

/**
 * Track 1–16.
 * @throws {CcMapError} for anything else
 */
export function getTrack(number: number): TrackInfo {
	const track = Number.isInteger(number) ? TRACKS[number - 1] : undefined;
	if (!track) throw new CcMapError(`track must be an integer 1-16, got ${number}`);
	return track;
}

/** The track a track key addresses in the given mode (T1 = track 1 or brain). */
export function trackForKey(kind: TrackKind, keyId: TrackKeyId): TrackInfo {
	const slot = Number(keyId.slice('track.'.length));
	return getTrack(kind === 'instrument' ? slot : slot + 8);
}

/** The track whose default receive channel is `channel` (0–15). */
export function trackForChannel(channel: number): TrackInfo {
	if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
		throw new CcMapError(`channel must be an integer 0-15, got ${channel}`);
	}
	return TRACKS[channel];
}

/**
 * An engine by id or former name ("external" → midi), case-insensitive.
 * @throws {CcMapError}
 */
export function getEngine(name: string): EngineInfo {
	const key = name.trim().toLowerCase();
	const engine = ENGINES.find((e) => e.id === key || e.aliases.includes(key));
	if (!engine) {
		throw new CcMapError(`unknown engine "${name}" (known: ${ENGINE_IDS.join(', ')})`);
	}
	return engine;
}

/**
 * A send effect by id, case-insensitive.
 * @throws {CcMapError}
 */
export function getFxEngine(name: string): FxEngineInfo {
	const key = name.trim().toLowerCase();
	const fx = isFxEngineId(key) ? FX_ENGINES.find((e) => e.id === key) : undefined;
	if (!fx) throw new CcMapError(`unknown effect "${name}" (known: ${FX_ENGINE_IDS.join(', ')})`);
	return fx;
}
