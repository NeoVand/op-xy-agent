/**
 * Semantic CC resolution: "filter cutoff on track 3" → CC32 on channel 2, with its value mapping,
 * confidence and risk. Built on `knowledge/midi/cc-map.json`; never produces bytes (core/midi does).
 *
 * Channels are **0-based wire channels** (0–15). Track numbers are 1–16.
 *
 * The **lane model** (derived, see docs/research/20-midi-control.md §3.0): per-track CCs address
 * the four encoders of each module page in order (dark, mid, light, white): M1 = CC12–15,
 * M1 + shift = CC16–19 (speculative), M2 = 20–23, M2 alt (filter envelope) = 24–27,
 * M2 + shift = 28–31, M3 = 32–35, M3 + shift = 36–39, M4 = 40–43. Lanes predict CCs that no source
 * lists; such targets are tagged `speculative`.
 */
import type { CcParamEntry, CcTrackType, SideEffect } from './ccMap.schema';
import type { Confidence } from './common.schema';
import { ccMapFile } from './data';
import { CcMapError, KnowledgeValidationError } from './errors';
import { getEngine, getFxEngine, getTrack, TRACKS, type TrackInfo } from './tracks';

// ---------------------------------------------------------------------------------------------
// Lane model

/** Encoder names in lane order (E1–E4). */
export const LANE_ENCODERS = ['dark', 'mid', 'light', 'white'] as const;
/** Module page layer: the page itself, its shift layer, or M2's alternate (filter-envelope) page. */
export type LaneLayer = 'base' | 'shift' | 'alt';
/** Module page 1–4 (M1–M4). */
export type LaneModule = 1 | 2 | 3 | 4;
/** Encoder 1–4 (dark, mid, light, white). */
export type LaneEncoder = 1 | 2 | 3 | 4;

/** One encoder lane of one module page. */
export interface LaneAddress {
	readonly module: LaneModule;
	readonly layer: LaneLayer;
	readonly encoder: LaneEncoder;
}

/** One page of the lane model with its four CCs. */
export interface LanePage {
	readonly module: LaneModule;
	readonly layer: LaneLayer;
	/** CCs of the dark, mid, light and white encoder lanes. */
	readonly ccs: readonly [number, number, number, number];
	readonly confidence: Confidence;
	/** What the page edits on an instrument track (from cc-map.json). */
	readonly description: string;
}

const LANE_RE = /^M([1-4])(?:(\+shift)|(alt))?\.(dark|mid|light|white)$/;

function pageFromLabel(label: string): { module: LaneModule; layer: LaneLayer } {
	const m = /^M([1-4])(\+shift| alt)?/.exec(label);
	if (!m)
		throw new KnowledgeValidationError('knowledge/midi/cc-map.json', [`lane page "${label}"`]);
	return {
		module: Number(m[1]) as LaneModule,
		layer: m[2] === '+shift' ? 'shift' : m[2] === ' alt' ? 'alt' : 'base'
	};
}

/** The lane model pages (8), from cc-map.json `laneModel`. */
export const LANE_PAGES: readonly LanePage[] = ccMapFile.laneModel.pages.map((page) => ({
	...pageFromLabel(page.page),
	ccs: [page.dark, page.mid, page.light, page.white],
	confidence: page.confidence,
	description: page.page
}));

/**
 * Parses a lane string: `M3.dark`, `M2+shift.white`, `M2alt.mid`.
 * @throws {CcMapError}
 */
export function parseLane(text: string): LaneAddress {
	const m = LANE_RE.exec(text.trim());
	if (!m) throw new CcMapError(`invalid lane "${text}" (expected e.g. M3.dark or M2+shift.white)`);
	const lane: LaneAddress = {
		module: Number(m[1]) as LaneModule,
		layer: m[2] ? 'shift' : m[3] ? 'alt' : 'base',
		encoder: (LANE_ENCODERS.indexOf(m[4] as (typeof LANE_ENCODERS)[number]) + 1) as LaneEncoder
	};
	findPage(lane);
	return lane;
}

/** Formats a lane as cc-map.json writes it (`M2+shift.white`). */
export function formatLane(lane: LaneAddress): string {
	const layer = lane.layer === 'shift' ? '+shift' : lane.layer === 'alt' ? 'alt' : '';
	return `M${lane.module}${layer}.${LANE_ENCODERS[lane.encoder - 1]}`;
}

function findPage(lane: { module: number; layer: LaneLayer }): LanePage {
	const page = LANE_PAGES.find((p) => p.module === lane.module && p.layer === lane.layer);
	if (!page) {
		throw new CcMapError(
			`the lane model has no page M${lane.module}${lane.layer === 'base' ? '' : ` ${lane.layer}`}`
		);
	}
	return page;
}

/**
 * The CC the lane model assigns to a lane, with the model's confidence for that page.
 * @throws {CcMapError} for a page the model does not have (e.g. M4 + shift)
 */
export function laneToCc(lane: LaneAddress | string): { cc: number; confidence: Confidence } {
	const address = typeof lane === 'string' ? parseLane(lane) : lane;
	const page = findPage(address);
	return { cc: page.ccs[address.encoder - 1], confidence: page.confidence };
}

/** The lane a per-track CC sits on, if the lane model covers it (CC12–43). */
export function ccToLane(cc: number): LaneAddress | undefined {
	for (const page of LANE_PAGES) {
		const index = page.ccs.indexOf(cc);
		if (index >= 0) {
			return { module: page.module, layer: page.layer, encoder: (index + 1) as LaneEncoder };
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------------------------
// Targets

/** Whether a CC addresses one track (its channel) or the whole device. */
export type CcScope = 'track' | 'global';

/** Risk levels, from harmless to "needs the user's explicit approval". */
export type RiskLevel = 'safe' | 'ui' | 'audible' | 'transport' | 'state' | 'destructive';

/** What the transport policy must enforce before sending a CC. */
export interface CcRisk {
	readonly level: RiskLevel;
	/** Ask the user before every send. */
	readonly confirm: boolean;
	/** Minimum time between two sends of this CC to the device, in ms (0 = none). */
	readonly minIntervalMs: number;
	/** Changes stored state (project / scene, persisted by autosave): journal it for undo. */
	readonly persistent: boolean;
	readonly reason: string | null;
}

/** Tempo scalings proposed for CC80 by the community sources. */
export const TEMPO_SCALINGS = ['linear-40-220', 'bpm-over-2'] as const;
/** A CC80 tempo scaling. */
export type TempoScaling = (typeof TEMPO_SCALINGS)[number];
/**
 * The scaling the device actually uses: BPM = 2 × value, clamped by the device to 40–220 (verified
 * on OS 1.1.33, 2026-09-26, docs/research/90-device-probe.md — CC80 0/32/60/64/96/127 gave
 * 40/64/120/128/192/220 BPM). 2-BPM resolution; values 20–110 are the useful range.
 */
export const TEMPO_SCALING_VERIFIED: TempoScaling = 'bpm-over-2';
/** Tempo range the device clamps CC80 to. */
export const CC80_TEMPO_RANGE = { min: 40, max: 220 } as const;

/** How a semantic value maps onto the 7-bit CC value. */
export type ValueMapping =
	/** 0–127, meaning per parameter. */
	| { readonly kind: 'continuous' }
	/** 0–127 around a neutral centre (pan 64, groove 63). */
	| { readonly kind: 'centered'; readonly center: number }
	/** On/off: `off` turns it off, `onFrom`–127 turn it on; we send `on`. */
	| { readonly kind: 'toggle'; readonly off: number; readonly on: number; readonly onFrom: number }
	/** Named choices in value order; `thresholds` are the lowest value of each bucket, or null if unknown. */
	| {
			readonly kind: 'enum';
			readonly values: readonly string[];
			readonly thresholds: readonly number[] | null;
	  }
	/** A number `first … first + count − 1` sent as `n − first` (scene 1–99 → 0–98). */
	| { readonly kind: 'index'; readonly first: number; readonly count: number }
	/** Any value triggers; we send `value`. */
	| { readonly kind: 'trigger'; readonly value: number }
	/** BPM with an unconfirmed scaling: use {@link tempoToCc}. */
	| { readonly kind: 'tempo'; readonly scalings: readonly TempoScaling[] }
	/** A remote-key index (see remoteKeys.ts). */
	| { readonly kind: 'remoteKey' };

/** A fully resolved CC: where to send it, what values mean, how sure we are, how risky it is. */
export interface CcTarget {
	readonly cc: number;
	/** 0-based channel to send on. */
	readonly channel: number;
	/** Channels the device accepts it on: `any`, or a list of 0-based channels. */
	readonly acceptedChannels: 'any' | readonly number[];
	readonly scope: CcScope;
	/** 1–16 for track-scope targets, null for global ones. */
	readonly track: number | null;
	/** Canonical parameter id: `filter.cutoff` (track scope) or `global.tempo` (global scope). */
	readonly param: string;
	readonly name: string;
	/** Encoder lane (module page + encoder) when the parameter sits on one. */
	readonly lane: LaneAddress | null;
	readonly range: readonly [number, number];
	readonly mapping: ValueMapping;
	readonly confidence: Confidence;
	readonly risk: CcRisk;
	/** Firmware version that introduced the CC, when known. */
	readonly since: string | null;
	readonly source: readonly string[];
	readonly notes: string | null;
}

/** A per-track parameter by name. `engine` / `effect` enable engine-resolved names. */
export interface TrackParamQuery {
	readonly track: number;
	/** `filter.cutoff`, `engine.p1`, `lfo.k2`, `tape.pitch`… (see {@link listTrackCcs}). */
	readonly param: string;
	/** Instrument engine on that track: allows `engine.<name>`, e.g. `engine.shape` for prism. */
	readonly engine?: string;
	/** Effect on FX I / FX II: allows `effect.<name>`, e.g. `effect.size` for reverb. */
	readonly effect?: string;
}

/** A per-track encoder lane, e.g. `{ track: 3, lane: 'M3.dark' }`. */
export interface TrackLaneQuery {
	readonly track: number;
	readonly lane: LaneAddress | string;
}

/** A global parameter: `global.tempo`, `scene.select`, `master.eq.low`… (see {@link listGlobalCcs}). */
export interface GlobalQuery {
	readonly param: string;
}

/** Anything {@link resolveCc} can answer. */
export type CcQuery = TrackParamQuery | TrackLaneQuery | GlobalQuery;

// Our default policy per side-effect class (policy choices, not device facts).
const RISK_BY_SIDE_EFFECT: Record<SideEffect, CcRisk> = {
	none: { level: 'safe', confirm: false, minIntervalMs: 0, persistent: false, reason: null },
	ui: { level: 'ui', confirm: false, minIntervalMs: 0, persistent: false, reason: null },
	audible: { level: 'audible', confirm: false, minIntervalMs: 0, persistent: false, reason: null },
	transport: {
		level: 'transport',
		confirm: false,
		minIntervalMs: 0,
		persistent: false,
		reason: null
	},
	scene: {
		level: 'state',
		confirm: false,
		minIntervalMs: 0,
		persistent: true,
		reason: 'changes scene state, which is saved with the project'
	},
	project: {
		level: 'state',
		confirm: false,
		minIntervalMs: 0,
		persistent: true,
		reason: 'changes project data, which autosave persists'
	},
	destructive: {
		level: 'destructive',
		confirm: true,
		minIntervalMs: 1000,
		persistent: true,
		reason: 'can load, create or delete data'
	}
};

const SCENE_SWITCH: Partial<CcRisk> = {
	minIntervalMs: 250,
	reason: 'switches scene; switching to an empty scene may duplicate the current one'
};

// Per-CC refinements of the class defaults.
const RISK_OVERRIDES: Readonly<Record<number, Partial<CcRisk>>> = {
	82: SCENE_SWITCH,
	83: SCENE_SWITCH,
	84: SCENE_SWITCH,
	85: SCENE_SWITCH,
	86: {
		minIntervalMs: 5000,
		reason:
			'loads another project (unsaved changes may be lost); repeated requests crashed firmware before 1.0.40'
	},
	106: {
		minIntervalMs: 50,
		reason:
			'remote key press: anything a finger can do; judge each key by its risk in remoteKeys.ts and always release it with CC107'
	}
};

// CCs introduced by a known firmware release (see firmware.ts / changelog-midi-usb.json).
const SINCE: Readonly<Record<string, string>> = { 'scene.selectDelayed': '1.1.0' };

const BEND_RANGE_VALUES = ['off', '1', '2', '3', '4', '5', '6', '7', 'octave'];
const MIDI_CHANNEL_VALUES = Array.from({ length: 16 }, (_, i) => String(i + 1));

/** Parameter definitions as stored in the tables below (before track / channel resolution). */
interface ParamDef {
	readonly param: string;
	readonly entry: CcParamEntry;
	readonly lane: LaneAddress | null;
	readonly confidence: Confidence;
	readonly source: readonly string[];
}

const shortId = (id: string) => id.slice(id.indexOf('.') + 1);

function toDef(entry: CcParamEntry, param = shortId(entry.id)): ParamDef {
	const lane = entry.lane && entry.lane !== 'mixer' ? parseLane(entry.lane) : null;
	return { param, entry, lane, confidence: entry.confidence, source: entry.source };
}

function mappingFor(param: string, entry: CcParamEntry): ValueMapping {
	switch (param) {
		case 'mute':
			return { kind: 'toggle', off: 0, on: 127, onFrom: 1 };
		case 'pan':
			return { kind: 'centered', center: 64 };
		case 'voice.bendRange':
			return { kind: 'enum', values: BEND_RANGE_VALUES, thresholds: null };
		case 'channel':
			return { kind: 'enum', values: MIDI_CHANNEL_VALUES, thresholds: null };
		case 'global.groove':
			return { kind: 'centered', center: 63 };
		case 'global.tempo': {
			// A scaling verified on the device wins over the community candidates.
			const verified = entry.verifiedScaling as TempoScaling | undefined;
			return {
				kind: 'tempo',
				scalings: verified
					? [verified]
					: ((entry.candidates as { id: string }[] | undefined)?.map(
							(c) => c.id as TempoScaling
						) ?? [...TEMPO_SCALINGS])
			};
		}
		case 'scene.select':
		case 'scene.selectDelayed':
			return { kind: 'index', first: 1, count: 99 };
		case 'project.load':
			return { kind: 'index', first: 0, count: 128 };
		case 'track.select':
			return { kind: 'index', first: 1, count: 16 };
		case 'scene.previous':
		case 'scene.next':
		case 'transport.playCc':
		case 'transport.stopCc':
			return { kind: 'trigger', value: 127 };
		case 'ui.keyDown':
		case 'ui.keyUp':
			return { kind: 'remoteKey' };
	}
	if (Array.isArray(entry.values)) return { kind: 'enum', values: entry.values, thresholds: null };
	return { kind: 'continuous' };
}

function riskFor(cc: number, sideEffect: SideEffect): CcRisk {
	return { ...RISK_BY_SIDE_EFFECT[sideEffect], ...RISK_OVERRIDES[cc] };
}

// Per-track tables: the mixer / common CCs every track has, the type's own parameters, and for
// auxiliary types with an LFO page but no listed LFO lanes, CC40–43 from the lane model (derived;
// cc-map.json `trackTypes._common`).
const COMMON: readonly ParamDef[] = ccMapFile.perTrack.map((entry) => toDef(entry));

function lfoLanes(): ParamDef[] {
	return LANE_ENCODERS.map((encoderName, i) => {
		const lane: LaneAddress = { module: 4, layer: 'base', encoder: (i + 1) as LaneEncoder };
		const cc = laneToCc(lane).cc;
		const entry: CcParamEntry = {
			cc,
			id: `synthetic.lfo.k${i + 1}`,
			name: `LFO knob ${i + 1} (${encoderName} encoder)`,
			range: [0, 127],
			confidence: 'derived',
			source: [...ccMapFile.laneModel.source],
			sideEffect: 'project',
			semantics: 'CC40-43 on auxiliary tracks with an M4 LFO page (lane model)'
		};
		return { param: `lfo.k${i + 1}`, entry, lane, confidence: 'derived', source: entry.source };
	});
}

const TYPE_PARAMS = new Map<CcTrackType, readonly ParamDef[]>();
for (const track of TRACKS) {
	if (TYPE_PARAMS.has(track.type)) continue;
	const own = ccMapFile.trackTypes[track.type].params.map((entry) => toDef(entry));
	const needsLfo = track.hasLfo && !own.some((d) => d.param.startsWith('lfo.'));
	const defs = [...COMMON, ...own, ...(needsLfo ? lfoLanes() : [])];
	const seen = new Set<string>();
	for (const def of defs) {
		if (seen.has(def.param)) {
			throw new KnowledgeValidationError('knowledge/midi/cc-map.json', [
				`${track.type}: parameter "${def.param}" is defined twice`
			]);
		}
		seen.add(def.param);
	}
	TYPE_PARAMS.set(track.type, defs);
}

function paramsOf(track: TrackInfo): readonly ParamDef[] {
	return TYPE_PARAMS.get(track.type) ?? [];
}

function trackTarget(track: TrackInfo, def: ParamDef, name = def.entry.name): CcTarget {
	const channels = def.entry.channel;
	if (Array.isArray(channels) && !channels.includes(track.number)) {
		throw new CcMapError(
			`${def.param} only exists on track ${channels.join('/')}, not on track ${track.number}`
		);
	}
	return {
		cc: def.entry.cc,
		channel: track.defaultChannel,
		acceptedChannels: [track.defaultChannel],
		scope: 'track',
		track: track.number,
		param: def.param,
		name,
		lane: def.lane,
		range: def.entry.range,
		mapping: mappingFor(def.param, def.entry),
		confidence: def.confidence,
		risk: riskFor(def.entry.cc, def.entry.sideEffect),
		since: SINCE[def.param] ?? null,
		source: def.source,
		notes: def.entry.notes ?? def.entry.caution ?? def.entry.semantics ?? null
	};
}

// Global table; CC90 (master EQ) is split into one target per band channel.
const GLOBALS: readonly CcTarget[] = ccMapFile.global.flatMap((entry): CcTarget[] => {
	const base = {
		cc: entry.cc,
		scope: 'global' as const,
		track: null,
		lane: null,
		range: entry.range,
		mapping: mappingFor(entry.id, entry),
		risk: riskFor(entry.cc, entry.sideEffect),
		since: SINCE[entry.id] ?? null,
		source: entry.source,
		notes: entry.caution ?? entry.notes ?? entry.semantics ?? null
	};
	if (entry.perChannel) {
		return Object.entries(entry.perChannel).map(([channel, band]) => ({
			...base,
			channel: Number(channel) - 1,
			acceptedChannels: [Number(channel) - 1],
			param: `${entry.id}.${band.band}`,
			name: `${entry.name} ${band.band}`,
			confidence: band.confidence
		}));
	}
	const accepted = entry.channel === 'any' || entry.channel === '1-16' ? 'any' : entry.channel;
	return [
		{
			...base,
			channel: accepted === 'any' ? 0 : accepted[0] - 1,
			acceptedChannels: accepted === 'any' ? 'any' : accepted.map((c) => c - 1),
			param: entry.id,
			name: entry.name,
			confidence: entry.confidence
		}
	];
});

const camel = (label: string) =>
	label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase());

function resolveEngineName(track: TrackInfo, query: TrackParamQuery, name: string): CcTarget {
	if (track.type !== 'instrument') {
		throw new CcMapError(
			`engine parameters exist on instrument tracks 1-8, not track ${track.number}`
		);
	}
	if (query.engine === undefined) {
		throw new CcMapError(
			`"${query.param}" needs the track's engine: pass { engine: 'prism' } or use engine.p1-p4`
		);
	}
	const engine = getEngine(query.engine);
	const index = engine.params.findIndex((p) => p !== null && camel(p) === name);
	if (index < 0) {
		const known = engine.params.filter((p) => p !== null).map((p) => `engine.${camel(p)}`);
		throw new CcMapError(`${engine.id} has no parameter "${name}" (known: ${known.join(', ')})`);
	}
	return withParamName(track, `engine.p${index + 1}`, engine.id, engine.params[index]);
}

function resolveEffectName(track: TrackInfo, query: TrackParamQuery, name: string): CcTarget {
	if (track.type !== 'fx') {
		throw new CcMapError(`effect parameters exist on FX tracks 15-16, not track ${track.number}`);
	}
	if (query.effect === undefined) {
		throw new CcMapError(
			`"${query.param}" needs the track's effect: pass { effect: 'reverb' } or use p1-p4`
		);
	}
	const fx = getFxEngine(query.effect);
	const index = fx.params.findIndex((p) => camel(p) === name);
	if (index < 0) {
		const known = fx.params.map((p) => `effect.${camel(p)}`);
		throw new CcMapError(`${fx.id} has no parameter "${name}" (known: ${known.join(', ')})`);
	}
	return withParamName(track, `p${index + 1}`, fx.id, fx.params[index]);
}

function withParamName(
	track: TrackInfo,
	param: string,
	owner: string,
	label: string | null
): CcTarget {
	const def = paramsOf(track).find((d) => d.param === param);
	if (!def) throw new CcMapError(`track ${track.number} has no ${param}`);
	return trackTarget(track, def, label === null ? def.entry.name : `${owner}: ${label}`);
}

function resolveTrackParam(query: TrackParamQuery): CcTarget {
	const track = getTrack(query.track);
	let param = query.param.trim();
	// Accept the full cc-map.json ids too ("track.filter.cutoff", "tape.pitch").
	const full = paramsOf(track).find((d) => d.entry.id === param);
	if (full) param = full.param;

	if (param.startsWith('engine.') && !/^engine\.p[1-8]$/.test(param)) {
		return resolveEngineName(track, query, param.slice('engine.'.length));
	}
	if (param.startsWith('effect.'))
		return resolveEffectName(track, query, param.slice('effect.'.length));

	const def = paramsOf(track).find((d) => d.param === param);
	if (!def) {
		const known = paramsOf(track).map((d) => d.param);
		throw new CcMapError(
			`track ${track.number} (${track.name}) has no parameter "${query.param}"; known: ${known.join(', ')}`
		);
	}
	if (query.engine !== undefined && param.startsWith('engine.p')) {
		const engine = getEngine(query.engine);
		const label = engine.params[Number(param.slice('engine.p'.length)) - 1] ?? null;
		return trackTarget(track, def, label === null ? def.entry.name : `${engine.id}: ${label}`);
	}
	if (query.effect !== undefined && /^p[1-4]$/.test(param) && track.type === 'fx') {
		const fx = getFxEngine(query.effect);
		return trackTarget(track, def, `${fx.id}: ${fx.params[Number(param.slice(1)) - 1]}`);
	}
	return trackTarget(track, def);
}

function resolveTrackLane(query: TrackLaneQuery): CcTarget {
	const track = getTrack(query.track);
	const lane = typeof query.lane === 'string' ? parseLane(query.lane) : query.lane;
	const { cc, confidence } = laneToCc(lane);
	const known = paramsOf(track).find((d) => d.entry.cc === cc);
	if (known) return trackTarget(track, known);
	// Nothing documented on this lane for this track type: a prediction of the lane model.
	const label = formatLane(lane);
	const entry: CcParamEntry = {
		cc,
		id: `lane.${label}`,
		name: `${label} lane (untested prediction)`,
		range: [0, 127],
		confidence: 'speculative',
		source: [...ccMapFile.laneModel.source],
		sideEffect: 'project',
		semantics: `lane model page confidence: ${confidence}`
	};
	return trackTarget(track, {
		param: `lane.${label}`,
		entry,
		lane,
		confidence: 'speculative',
		source: entry.source
	});
}

function resolveGlobal(query: GlobalQuery): CcTarget {
	const target = GLOBALS.find((g) => g.param === query.param.trim());
	if (!target) {
		throw new CcMapError(
			`unknown global parameter "${query.param}"; known: ${GLOBALS.map((g) => g.param).join(', ')}`
		);
	}
	return target;
}

/**
 * Resolves a semantic parameter to a CC target.
 *
 * @example resolveCc({ track: 3, param: 'filter.cutoff' })          // CC32, channel 2
 * @example resolveCc({ track: 3, param: 'engine.shape', engine: 'prism' }) // CC12
 * @example resolveCc({ track: 14, lane: 'M1.light' })                // tape length, CC14
 * @example resolveCc({ param: 'global.tempo' })                      // CC80, any channel
 * @throws {CcMapError} for unknown tracks, parameters or lanes
 */
export function resolveCc(query: CcQuery): CcTarget {
	if ('track' in query) {
		return 'lane' in query ? resolveTrackLane(query) : resolveTrackParam(query);
	}
	return resolveGlobal(query);
}

/** Every documented CC of a track (1–16), in cc-map.json order. */
export function listTrackCcs(track: number): CcTarget[] {
	const info = getTrack(track);
	return paramsOf(info)
		.filter((d) => !Array.isArray(d.entry.channel) || d.entry.channel.includes(info.number))
		.map((d) => trackTarget(info, d));
}

/** Every global CC (CC90 split per EQ band). */
export function listGlobalCcs(): readonly CcTarget[] {
	return GLOBALS;
}

/**
 * What an incoming or outgoing CC means: global targets accepting that channel plus the parameter
 * of the track listening on it. Used to label MIDI traffic.
 */
export function describeCc(cc: number, channel: number): CcTarget[] {
	const globals = GLOBALS.filter(
		(g) => g.cc === cc && (g.acceptedChannels === 'any' || g.acceptedChannels.includes(channel))
	);
	const track = TRACKS.find((t) => t.defaultChannel === channel);
	const local = track ? listTrackCcs(track.number).filter((t) => t.cc === cc) : [];
	return [...globals, ...local];
}

// ---------------------------------------------------------------------------------------------
// Values

function requireInt(target: CcTarget, value: number): number {
	const [lo, hi] = target.range;
	if (!Number.isInteger(value) || value < lo || value > hi) {
		throw new CcMapError(`${target.param}: value must be an integer ${lo}-${hi}, got ${value}`);
	}
	return value;
}

/**
 * Converts a semantic value into the CC value for a target. Throws rather than clamping or
 * guessing (clamping is a UI concern).
 *
 * - continuous / centered / remoteKey: a raw integer within the target's range
 * - toggle: `true` / `false` (or a raw integer)
 * - index: the human number (scene 1–99, track 1–16, project 0–127)
 * - enum: one of `mapping.values`; needs known thresholds unless `assumeEvenBuckets` is set
 * - trigger: anything (the value is ignored)
 * - tempo: BPM (40–220), encoded with the verified scaling (see {@link tempoToCc})
 * @throws {CcMapError}
 */
export function encodeCcValue(
	target: CcTarget,
	value?: number | boolean | string,
	options: { readonly assumeEvenBuckets?: boolean } = {}
): number {
	const { mapping } = target;
	switch (mapping.kind) {
		case 'continuous':
		case 'centered':
		case 'remoteKey':
			if (typeof value !== 'number') throw new CcMapError(`${target.param}: expected a number`);
			return requireInt(target, value);
		case 'toggle':
			if (typeof value === 'boolean') return value ? mapping.on : mapping.off;
			if (typeof value === 'number') return requireInt(target, value);
			throw new CcMapError(`${target.param}: expected true/false`);
		case 'index': {
			const last = mapping.first + mapping.count - 1;
			if (
				typeof value !== 'number' ||
				!Number.isInteger(value) ||
				value < mapping.first ||
				value > last
			) {
				throw new CcMapError(`${target.param}: expected an integer ${mapping.first}-${last}`);
			}
			return requireInt(target, value - mapping.first);
		}
		case 'enum': {
			const index = typeof value === 'string' ? mapping.values.indexOf(value) : -1;
			if (index < 0) {
				throw new CcMapError(`${target.param}: expected one of ${mapping.values.join(', ')}`);
			}
			if (mapping.thresholds) return mapping.thresholds[index];
			if (!options.assumeEvenBuckets) {
				throw new CcMapError(
					`${target.param}: bucket thresholds are unknown; calibrate on the device or pass { assumeEvenBuckets: true }`
				);
			}
			// Centre of bucket `index` when 0–127 is split evenly (integer maths, no float drift).
			return Math.floor(((2 * index + 1) * 128) / (2 * mapping.values.length));
		}
		case 'trigger':
			return mapping.value;
		case 'tempo':
			if (typeof value !== 'number') {
				throw new CcMapError(`${target.param}: expected a BPM number, got ${String(value)}`);
			}
			return tempoToCc(value);
	}
}

/**
 * CC80 value for a tempo. Defaults to the scaling verified on the device (BPM = 2 × value); odd
 * tempos round to the nearest value the device can show. `linear-40-220` is kept only to reason
 * about third-party material that assumed it.
 * @throws {CcMapError} when the tempo is outside 40–220 BPM (what the device accepts)
 */
export function tempoToCc(bpm: number, scaling: TempoScaling = TEMPO_SCALING_VERIFIED): number {
	if (!Number.isFinite(bpm)) throw new CcMapError(`tempo must be a number, got ${bpm}`);
	const { min, max } = CC80_TEMPO_RANGE;
	if (bpm < min || bpm > max) throw new CcMapError(`CC80 covers ${min}-${max} BPM, got ${bpm}`);
	if (scaling === 'linear-40-220') return Math.round(((bpm - 40) * 127) / 180);
	return Math.round(bpm / 2);
}

/**
 * Tempo that a CC80 value means under a scaling.
 * @throws {CcMapError} for values outside 0–127
 */
export function ccToTempo(value: number, scaling: TempoScaling = TEMPO_SCALING_VERIFIED): number {
	if (!Number.isInteger(value) || value < 0 || value > 127) {
		throw new CcMapError(`CC value must be an integer 0-127, got ${value}`);
	}
	if (scaling === 'linear-40-220') return 40 + (value * 180) / 127;
	return Math.min(CC80_TEMPO_RANGE.max, Math.max(CC80_TEMPO_RANGE.min, value * 2));
}
