/**
 * Parameter locks (manual: sequencer/parameter-locks): which parameter each encoder turns on each
 * instrument page, the id a lock stores it under, its range, and how to read and write it on a
 * track. The encoder mapping mirrors the core's `#turnInstrument` (opxy-sim.svelte.ts) so a turn
 * with a step held stores exactly what the same turn would have set. Ids name parameters, not
 * encoders, so any page can show a step's locked values ({@link lockedTrack}) and the sound engine
 * can apply a step's locks to its track when the step plays.
 *
 * Lockable: the four module pages and their shift layers on instrument tracks, the drum sampler's
 * keys and the synth sampler's region included (OS 1.1.0, "drum & synth sampler parameter locks"),
 * and the midi engine's program (OS 1.1.15). Not lockable: the midi engine's channel and bank, the
 * multisampler's zones (the changelog names the drum and synth samplers only), and players (manual:
 * "players cannot").
 */
import {
	DRUM_PLAY_MODES,
	DUCK_METRONOME,
	ELEMENT_SOURCES,
	LFO_SYNC_STEPS,
	PLAY_MODES,
	clamp,
	detent,
	engineParams,
	formatTune,
	PORTAMENTO_MAX,
	SAMPLER_TUNE_RANGE,
	isSampler,
	portamentoText,
	two,
	type Envelope99,
	type SimState,
	type TrackState
} from '../../params';
import { DESTINATIONS, SENSOR_DESTINATIONS } from '../../screen/pages/lfo';
import { activeRegion, turnRegion } from '../sample/m1';
import type { Region, SampleState } from '../sample/state';

/** One lockable parameter. */
export interface LockParam {
	/** The id locks store it under. */
	readonly id: string;
	/** Its short name on the screen. */
	readonly label: string;
	readonly min: number;
	readonly max: number;
	/** Change per detent, and per detent while the encoder is pushed (fine). */
	readonly step: number;
	readonly fine: number;
	/** The value on a track. */
	get(t: TrackState): number;
	/** Writes a value onto a track (a copy, when showing a step's values). */
	set(t: TrackState, value: number): void;
	/** The value as the page shows it. */
	format(value: number): string;
	/**
	 * A turn of `delta` detents from the step's locks, for a value that turns in its own way (the
	 * synth sampler's points push each other along); else {@link turnedValue} steps it.
	 */
	turn?(locks: Readonly<Record<string, number>>, delta: number, fine: boolean): number;
}

type Spec = Omit<LockParam, 'id' | 'fine' | 'format'> & Partial<Pick<LockParam, 'fine' | 'format'>>;

const param = (id: string, spec: Spec): LockParam => ({
	id,
	fine: spec.step,
	format: (v) => (spec.min < 0 ? String(Math.round(v)) : two(v)),
	...spec
});

const ENVELOPE_FIELDS = ['attack', 'decay', 'sustain', 'release'] as const;
const SENDS = ['aux', 'tape', 'fx1', 'fx2'] as const;
const SAMPLER_FIELDS = [
	'tune',
	'start',
	'end',
	'playMode',
	'reverse',
	'pan',
	'fade',
	'gain'
] as const;

/** A lock parameter by id, or null for an unknown id. */
export function lockParam(id: string): LockParam | null {
	const m1 = /^m1\.([1-4])$/.exec(id);
	if (m1) {
		const e = Number(m1[1]) - 1;
		return param(id, {
			label: `p${e + 1}`,
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.m1[e],
			set: (t, v) => {
				t.m1[e] = v;
			}
		});
	}
	const env = /^(amp|filterEnv)\.(attack|decay|sustain|release)$/.exec(id);
	if (env) {
		const which = env[1] as 'amp' | 'filterEnv';
		const field = env[2] as keyof Envelope99;
		return param(id, {
			label: field,
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t[which][field],
			set: (t, v) => {
				t[which][field] = v;
			}
		});
	}
	const key = /^key(\d+)\.(\w+)$/.exec(id);
	if (key && (SAMPLER_FIELDS as readonly string[]).includes(key[2])) {
		return samplerParam(id, Number(key[1]), key[2] as (typeof SAMPLER_FIELDS)[number]);
	}
	const field = REGION_FIELDS.find((f) => f.id === id);
	if (field) return regionLock(field, null);
	return TRACK_PARAMS[id] ?? null;
}

/** One of the synth sampler's region values, as its M1 page turns it (`turnRegion`). */
interface RegionField {
	readonly id: string;
	readonly label: string;
	readonly encoder: number;
	readonly shift: boolean;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly fine: number;
	get(r: Region): number;
	set(r: Region, value: number): void;
	format(value: number): string;
}

/** A share of the sample, to the tenth of a percent. */
const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;

const point = (
	id: string,
	label: string,
	encoder: number,
	key: 'start' | 'loopStart' | 'loopEnd' | 'end'
): RegionField => ({
	id,
	label,
	encoder,
	shift: false,
	min: 0,
	max: 1,
	step: 0.01,
	fine: 0.001,
	get: (r) => r[key],
	set: (r, v) => {
		r[key] = v;
	},
	format: percent
});

/**
 * The synth sampler's region values a step locks (OS 1.1.0): M1's four points, and with shift the
 * direction, tune, loop crossfade and gain. The loop type is a click, not a turn, and stays
 * unlocked. The ids are the navigator's names for the same values.
 */
const REGION_FIELDS: readonly RegionField[] = [
	point('sample.start', 'start', 0, 'start'),
	point('sample.loopStart', 'loop start', 1, 'loopStart'),
	point('sample.loopEnd', 'loop end', 2, 'loopEnd'),
	point('sample.end', 'end', 3, 'end'),
	{
		id: 'sample.reverse',
		label: 'direction',
		encoder: 0,
		shift: true,
		min: 0,
		max: 1,
		step: 1,
		fine: 1,
		get: (r) => (r.reverse ? 1 : 0),
		set: (r, v) => {
			r.reverse = v >= 0.5;
		},
		format: (v) => (v >= 0.5 ? 'reverse' : 'forward')
	},
	{
		id: 'sample.tune',
		label: 'tune',
		encoder: 1,
		shift: true,
		min: -SAMPLER_TUNE_RANGE,
		max: SAMPLER_TUNE_RANGE,
		step: 0.1,
		fine: 0.01,
		get: (r) => r.tune,
		set: (r, v) => {
			r.tune = v;
		},
		format: formatTune
	},
	{
		id: 'sample.crossfade',
		label: 'loop crossfade',
		encoder: 2,
		shift: true,
		min: 0,
		// the owner's unit stops at 75 % (research 60 §5)
		max: 75,
		step: 1,
		fine: 1,
		get: (r) => r.crossfade,
		set: (r, v) => {
			r.crossfade = v;
		},
		format: (v) => `${Math.round(v)}%`
	},
	{
		id: 'sample.gain',
		label: 'gain',
		encoder: 3,
		shift: true,
		min: -30,
		max: 20,
		step: 1,
		fine: 1,
		get: (r) => r.gain,
		set: (r, v) => {
			r.gain = v;
		},
		format: (v) => String(Math.round(v))
	}
];

/** Whether a lock id is one of the synth sampler's region values (`sample.start` …). */
export const isRegionLock = (id: string): boolean => REGION_FIELDS.some((f) => f.id === id);

/**
 * A region value as a lock parameter. The sample area keeps the region, not the track, so on a
 * track it writes nothing ({@link lockedRegion} applies it) and reads the region it was given:
 * {@link lockTarget}'s, the one on screen, or NaN for an id alone.
 */
function regionLock(f: RegionField, region: Region | null): LockParam {
	return {
		id: f.id,
		label: f.label,
		min: f.min,
		max: f.max,
		step: f.step,
		fine: f.fine,
		format: f.format,
		get: () => (region ? f.get(region) : NaN),
		set: () => {
			// the region is the sample area's: lockedRegion applies the lock
		},
		...(region
			? {
					turn: (locks: Readonly<Record<string, number>>, delta: number, fine: boolean) => {
						// turned on the region as the step plays it, the way the page turns it: a point
						// pushes the loop points it passes, start and end stop short of each other
						const r = { ...lockedRegion(region, locks) };
						turnRegion(r, f.encoder, delta, fine, f.shift);
						return f.get(r);
					}
				}
			: {})
	};
}

/**
 * A synth sampler region with a step's locks on it: what the M1 page shows while the step is held,
 * and what the step's notes play. The points keep their order (start ≤ loop start ≤ loop end ≤
 * end) as turning them does; a locked start past an end turned down later pushes the end (ours).
 */
export function lockedRegion(region: Region, locks: Readonly<Record<string, number>>): Region {
	const fields = REGION_FIELDS.filter((f) => locks[f.id] !== undefined);
	if (fields.length === 0) return region;
	const r = { ...region };
	for (const f of fields) f.set(r, clamp(locks[f.id], f.min, f.max));
	r.end = clamp(r.end, Math.min(r.start + 0.001, 1), 1);
	r.loopStart = clamp(r.loopStart, r.start, r.end);
	r.loopEnd = clamp(r.loopEnd, r.start, r.end);
	if (r.loopEnd < r.loopStart) {
		const loopEnd =
			locks['sample.loopEnd'] !== undefined && locks['sample.loopStart'] === undefined;
		if (loopEnd) r.loopStart = r.loopEnd;
		else r.loopEnd = r.loopStart;
	}
	return r;
}

/** The sample area with a step's locks on track `track`'s synth sampler region (a held step's view). */
export function lockedSample(
	area: SampleState,
	track: number,
	locks: Readonly<Record<string, number>>
): SampleState {
	const held = area.tracks[track];
	if (!held) return area;
	const region = lockedRegion(held.synth.region, locks);
	if (region === held.synth.region) return area;
	return {
		...area,
		tracks: area.tracks.map((t, i) => (i === track ? { ...t, synth: { ...t.synth, region } } : t))
	};
}

/** A sampler key's parameter (the M1 page's two layers). */
function samplerParam(id: string, k: number, field: (typeof SAMPLER_FIELDS)[number]): LockParam {
	const at = (t: TrackState) => t.drumKeys[clamp(k, 0, t.drumKeys.length - 1)];
	switch (field) {
		case 'tune':
			return param(id, {
				label: 'tune',
				min: -SAMPLER_TUNE_RANGE,
				max: SAMPLER_TUNE_RANGE,
				step: 0.1,
				fine: 0.01,
				get: (t) => at(t).tune,
				set: (t, v) => {
					at(t).tune = Math.round(v * 100) / 100;
				},
				format: formatTune
			});
		case 'playMode':
			return param(id, {
				label: 'play mode',
				min: 0,
				max: DRUM_PLAY_MODES.length - 1,
				step: 1,
				get: (t) => DRUM_PLAY_MODES.indexOf(at(t).playMode),
				set: (t, v) => {
					at(t).playMode = DRUM_PLAY_MODES[clamp(Math.round(v), 0, DRUM_PLAY_MODES.length - 1)];
				},
				format: (v) => DRUM_PLAY_MODES[clamp(Math.round(v), 0, DRUM_PLAY_MODES.length - 1)]
			});
		case 'reverse':
			return param(id, {
				label: 'direction',
				min: 0,
				max: 1,
				step: 1,
				get: (t) => (at(t).reverse ? 1 : 0),
				set: (t, v) => {
					at(t).reverse = v >= 0.5;
				},
				format: (v) => (v >= 0.5 ? 'reverse' : 'forward')
			});
		case 'pan':
			return param(id, {
				label: 'pan',
				min: -100,
				max: 100,
				step: 2,
				fine: 1,
				get: (t) => at(t).pan,
				set: (t, v) => {
					at(t).pan = v;
				}
			});
		case 'gain':
			return param(id, {
				label: 'gain',
				min: -30,
				max: 20,
				step: 1,
				get: (t) => at(t).gain,
				set: (t, v) => {
					at(t).gain = v;
				}
			});
		default: {
			// start, end and fade share the 0–99 scale
			const f = field;
			return param(id, {
				label: f,
				min: 0,
				max: 99,
				step: 1,
				get: (t) => at(t)[f],
				set: (t, v) => {
					at(t)[f] = v;
				}
			});
		}
	}
}

/** The fixed-id parameters: play mode, the midi program, filter, sends and LFO. */
const TRACK_PARAMS: Readonly<Record<string, LockParam>> = Object.fromEntries(
	[
		param('playMode.mode', {
			label: 'play mode',
			min: 0,
			max: 2,
			step: 1,
			get: (t) => t.playMode.mode,
			set: (t, v) => {
				t.playMode.mode = v;
			},
			format: (v) => PLAY_MODES[clamp(Math.round(v), 0, 2)]
		}),
		param('playMode.portamento', {
			label: 'portamento',
			min: 0,
			max: PORTAMENTO_MAX,
			step: 1,
			get: (t) => t.playMode.portamento,
			set: (t, v) => {
				t.playMode.portamento = v;
			},
			format: portamentoText
		}),
		param('playMode.bend', {
			label: 'bend',
			min: 0,
			max: 24,
			step: 1,
			get: (t) => t.playMode.bend,
			set: (t, v) => {
				t.playMode.bend = v;
			}
		}),
		param('playMode.volume', {
			label: 'volume',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.playMode.volume,
			set: (t, v) => {
				t.playMode.volume = v;
			}
		}),
		param('midi.program', {
			label: 'program',
			min: 1,
			max: 128,
			step: 1,
			get: (t) => t.midi.program,
			set: (t, v) => {
				t.midi.program = v;
			},
			format: (v) => String(Math.round(v))
		}),
		param('filter.cutoff', {
			label: 'cutoff',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.filter.cutoff,
			set: (t, v) => {
				t.filter.cutoff = v;
			}
		}),
		param('filter.resonance', {
			label: 'resonance',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.filter.resonance,
			set: (t, v) => {
				t.filter.resonance = v;
			}
		}),
		param('filter.envAmount', {
			label: 'env amount',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.filter.envAmount,
			set: (t, v) => {
				t.filter.envAmount = v;
			}
		}),
		param('filter.keyTracking', {
			label: 'key tracking',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.filter.keyTracking,
			set: (t, v) => {
				t.filter.keyTracking = v;
			}
		}),
		...SENDS.map((name, e) =>
			param(`sends.${name}`, {
				label:
					name === 'aux' ? 'aux out' : name === 'fx1' ? 'fx I' : name === 'fx2' ? 'fx II' : name,
				min: 0,
				max: 99,
				step: 1,
				get: (t) => t.sends[e],
				set: (t, v) => {
					t.sends[e] = v;
				}
			})
		),
		param('lfo.speed', {
			label: 'speed',
			min: 0,
			max: LFO_SYNC_STEPS.length + 99,
			step: 1,
			get: (t) => t.lfo.speed,
			set: (t, v) => {
				t.lfo.speed = v;
			},
			format: (v) =>
				v < LFO_SYNC_STEPS.length ? LFO_SYNC_STEPS[Math.round(v)] : two(v - LFO_SYNC_STEPS.length)
		}),
		...(['amount', 'volume', 'envelope'] as const).map((field) =>
			param(`lfo.${field}`, {
				label: field,
				min: -99,
				max: 99,
				step: 1,
				get: (t) => t.lfo[field],
				set: (t, v) => {
					t.lfo[field] = v;
				}
			})
		),
		param('lfo.destination', {
			label: 'destination',
			min: 0,
			max: DESTINATIONS.length - 1,
			step: 1,
			get: (t) => t.lfo.destination,
			set: (t, v) => {
				t.lfo.destination = v;
			},
			// the free card sits under its page's card ("free" below "filter"): named with it, so
			// each of the six reads apart
			format: (v) => {
				const d = DESTINATIONS[clamp(Math.round(v), 0, DESTINATIONS.length - 1)];
				return d.free ? `${d.module} free` : d.module;
			}
		}),
		param('lfo.parameter', {
			label: 'parameter',
			min: 0,
			max: 3,
			step: 1,
			get: (t) => t.lfo.parameter,
			set: (t, v) => {
				t.lfo.parameter = v;
			},
			format: (v) => String(Math.round(v) + 1)
		}),
		param('lfo.source', {
			label: 'source',
			min: 1,
			max: DUCK_METRONOME,
			step: 1,
			get: (t) => t.lfo.source,
			set: (t, v) => {
				t.lfo.source = v;
			},
			format: (v) => (Math.round(v) >= DUCK_METRONOME ? 'metronome' : String(Math.round(v)))
		}),
		param('lfo.sensor', {
			label: 'source',
			min: 0,
			max: ELEMENT_SOURCES.length - 1,
			step: 1,
			get: (t) => t.lfo.sensor,
			set: (t, v) => {
				t.lfo.sensor = v;
			},
			format: (v) => ELEMENT_SOURCES[clamp(Math.round(v), 0, ELEMENT_SOURCES.length - 1)].name
		}),
		param('lfo.shape', {
			label: 'shape',
			min: 0,
			max: 99,
			step: 1,
			get: (t) => t.lfo.shape,
			set: (t, v) => {
				t.lfo.shape = v;
			}
		}),
		...(['hold', 'release'] as const).map((field) =>
			param(`lfo.${field}`, {
				label: field,
				min: 0,
				max: 99,
				step: 1,
				get: (t) => t.lfo[field],
				set: (t, v) => {
					t.lfo[field] = v;
				}
			})
		)
	].map((p) => [p.id, p])
);

/**
 * The parameter encoder `e` (0–3) turns on the instrument page on screen, with its id, or null
 * when that encoder locks nothing there (no parameter, the midi engine's channel and bank, players,
 * lists, other modes). Mirrors `#turnInstrument`.
 */
export function lockTarget(s: SimState, e: number): LockParam | null {
	if (s.mode !== 'instrument' || s.overlay !== null || s.sub !== null || s.picker !== null) {
		return null;
	}
	const t = s.tracks[s.track];
	switch (s.pages.instrument) {
		case 1: {
			if (isSampler(t.engine)) {
				// the synth sampler turns its sample's region here (start, loop, end; shift: direction,
				// tune, crossfade, gain); a multisampler zone takes no lock, rather than a drum key's
				if (t.engine === 'sampler') {
					const region = activeRegion(s);
					const f = REGION_FIELDS.find((r) => r.encoder === e && r.shift === s.shift);
					return region && f ? regionLock(f, region) : null;
				}
				if (t.engine !== 'drum') return null;
				const fields = s.shift
					? (['reverse', 'pan', 'fade', 'gain'] as const)
					: (['tune', 'start', 'end', 'playMode'] as const);
				return lockParam(`key${t.drumKey}.${fields[e]}`);
			}
			if (t.engine === 'midi') return e === 2 ? lockParam('midi.program') : null;
			if (engineParams(t.engine)[e] === null) return null;
			const p = lockParam(`m1.${e + 1}`);
			return p && { ...p, label: engineParams(t.engine)[e] ?? p.label };
		}
		case 2:
			if (t.engine === 'midi') return null;
			if (s.shift)
				return lockParam(
					['playMode.mode', 'playMode.portamento', 'playMode.bend', 'playMode.volume'][e]
				);
			return lockParam(`${t.envelope === 'amp' ? 'amp' : 'filterEnv'}.${ENVELOPE_FIELDS[e]}`);
		case 3:
			if (t.engine === 'midi') return null;
			if (s.shift) return lockParam(`sends.${SENDS[e]}`);
			return lockParam(`filter.${['cutoff', 'resonance', 'envAmount', 'keyTracking'][e]}`);
		case 4: {
			const lfo = t.lfo;
			if (lfo.type === 'duck') {
				// shift + E1 flips the source type, a switch rather than a value
				if (e === 0 && s.shift) return null;
				return lockParam(`lfo.${['source', 'amount', 'hold', 'release'][e]}`);
			}
			// the shift layer's sub functions on E2: random's envelope, tremolo's shape
			if (s.shift && e === 1 && lfo.type === 'random') return lockParam('lfo.envelope');
			if (s.shift && e === 1 && lfo.type === 'tremolo') return lockParam('lfo.shape');
			if (e === 0) return lockParam(lfo.type === 'element' ? 'lfo.sensor' : 'lfo.speed');
			if (e === 1) return lockParam('lfo.amount');
			if (lfo.type === 'tremolo') return lockParam(e === 2 ? 'lfo.volume' : 'lfo.envelope');
			if (e === 2) {
				const p = lockParam('lfo.destination');
				if (!p || lfo.type !== 'element') return p;
				// element follows a sensor: its own four pages (syn, env, filter, amp), no free twins
				const last = SENSOR_DESTINATIONS.length - 1;
				return {
					...p,
					max: last,
					format: (v) => SENSOR_DESTINATIONS[clamp(Math.round(v), 0, last)].module
				};
			}
			return lockParam('lfo.parameter');
		}
	}
	return null;
}

/**
 * The value a turn of `delta` detents gives, starting from the step's lock (else the track's
 * value), the way the core's turn would change the track itself.
 */
export function turnedValue(
	p: LockParam,
	t: TrackState,
	locks: Readonly<Record<string, number>>,
	delta: number,
	fine: boolean
): number {
	if (p.turn) return p.turn(locks, delta, fine);
	const from = locks[p.id] ?? p.get(t);
	if (p.id.endsWith('.reverse')) return delta < 0 ? 1 : 0;
	const by = fine ? p.fine : p.step;
	// whole steps move the number shown, as the core's turn does ({@link detent})
	const rounded =
		by < 1 ? Math.round((from + delta * by) * 100) / 100 : detent(from, delta * by, p.min, p.max);
	// a sample's start never passes its end, nor the end its start (as the core keeps them)
	const edge = /^key(\d+)\.(start|end)$/.exec(p.id);
	if (edge) {
		const other = lockParam(`key${edge[1]}.${edge[2] === 'start' ? 'end' : 'start'}`);
		const bound = other ? (locks[other.id] ?? other.get(t)) : p.max;
		return edge[2] === 'start' ? clamp(rounded, p.min, bound) : clamp(rounded, bound, p.max);
	}
	return clamp(rounded, p.min, p.max);
}

/** A lock's parameter name on this track's pages (engine parameters go by their names). */
export function lockLabel(id: string, t: TrackState): string {
	const m1 = /^m1\.([1-4])$/.exec(id);
	if (m1) return engineParams(t.engine)[Number(m1[1]) - 1] ?? `p${m1[1]}`;
	return lockParam(id)?.label ?? id;
}

/** A copy of a track with a step's locks applied: what the pages show while the step is held. */
export function lockedTrack(t: TrackState, locks: Readonly<Record<string, number>>): TrackState {
	const ids = Object.keys(locks);
	if (ids.length === 0) return t;
	const copy: TrackState = JSON.parse(JSON.stringify(t));
	for (const id of ids) lockParam(id)?.set(copy, locks[id]);
	return copy;
}
