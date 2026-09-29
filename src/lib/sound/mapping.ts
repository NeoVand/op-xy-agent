/**
 * From the simulator's encoder values to sound: seconds, hertz, cents and gains for the envelopes,
 * filter, LFO, voice settings, mixer and drum keys, and what each synth engine's four M1 parameters
 * do. The envelopes, filters, LFO rates and depths, duck and drum fade follow what the owner's unit
 * measured (docs/research/60-sound-session.md); the rest is ours: exponential for times and
 * frequencies (every detent is the same ratio), powers for levels and amounts (fine control near
 * zero), and tuned so that a new project sounds musical rather than extreme. Pure, so the engine,
 * the scheduler and the tests share them.
 */
import type { EngineId } from '$lib/core/opxy';
import type { Region as SampleRegion } from '$lib/sim/areas/sample/state';
import {
	DUCK_METRONOME,
	ELEMENT_SOURCES,
	LFO_SYNC_STEPS,
	type Envelope99,
	type Lfo
} from '$lib/sim/params';
import type { FilterType } from '$lib/sim/screen/frame';
import { DESTINATIONS, SENSOR_DESTINATIONS } from '$lib/sim/screen/pages/lfo';
import { TAUS_PER_TIME } from './envelope';
import { logTable, toCc, zQ } from './synth/laws';

export { ATTACK_TARGET, DECAY_CUT, toCc, zLevelDb, zQ } from './synth/laws';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A 0–99 encoder value as 0–1. */
export const unit = (v: number): number => clamp(v, 0, 99) / 99;

/** An exponential sweep from `min` (at 0) to `max` (at 99). */
export const sweep = (v: number, min: number, max: number): number =>
	min * Math.pow(max / min, unit(v));

/** A MIDI note in hertz (A4 = 440). */
export const noteHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

// ─────────────────────────────────────────────────────────── envelopes (M2)

/** An envelope in seconds, with the sustain level 0–1. */
export interface Adsr {
	readonly attack: number;
	readonly decay: number;
	readonly sustain: number;
	readonly release: number;
}

/** The quickest attack: the device's 0 is instant; half a millisecond keeps it from clicking. */
const ATTACK_FLOOR = 0.0005;

/**
 * The attack's length in seconds for its value 0–99, measured on the owner's unit (research 60 §3):
 * 5.16 ms · (e^(0.0878 · CC) − 1), so 77 ms at CC 32, 1.4 s at 64 and six minutes at 127. Its
 * shape is an RC charge toward twice the peak that stops at the peak (`ATTACK_TARGET`).
 */
export function attackSeconds(v: number): number {
	return Math.max(ATTACK_FLOOR, 0.00516 * (Math.exp(0.0878 * toCc(v)) - 1));
}

/** Decay and release half-lives measured at these CCs (research 60 §3), in milliseconds. */
const HALF_LIFE_CC = [0, 16, 32, 48, 64, 72, 80, 88, 96, 104, 112, 120, 127] as const;
const HALF_LIFE_MS = [4.5, 64, 128, 197, 281, 339, 421, 547, 758, 1129, 1802, 3046, 4993] as const;

/**
 * The half-life in seconds of a decay at `v` (0–99), or of a release at 99 − `v`: decay and release
 * fall exponentially on one law, nearly linear up to the middle and steepening past it, 4.5 ms to
 * 5 s (research 60 §3).
 */
export function halfLifeSeconds(v: number): number {
	return logTable(HALF_LIFE_CC, HALF_LIFE_MS, toCc(v)) / 1000;
}

/** A decay or release "time" (four time constants, as the envelopes take them) from a half-life. */
const timeOfHalfLife = (half: number): number => (TAUS_PER_TIME * half) / Math.LN2;

/**
 * An envelope in seconds on the measured laws. The release lane is the release handle's position
 * on the M2 graph (camera, 1.1.33; note 59 §2.2): at 99 the handle sits on the end, at 0 it starts
 * 107 px before it, so a higher value is a shorter release, on the decay's law from the other end.
 * A new project's bass (release 79) fades in about 0.7 s.
 */
export function envelopeSeconds(env: Envelope99): Adsr {
	return {
		attack: attackSeconds(env.attack),
		decay: timeOfHalfLife(halfLifeSeconds(env.decay)),
		sustain: unit(env.sustain),
		release: timeOfHalfLife(halfLifeSeconds(99 - env.release))
	};
}

// ─────────────────────────────────────────────────────────── filter (M3)

/**
 * Each type's cutoff against the lane's CC, measured on the owner's unit (research 60 §2): the
 * ladder's one-pole corner and the svf sections' natural frequency every 8 steps (log-interpolated,
 * carried on at the end slopes), the z pair's natural frequency on a straight line in log frequency
 * (0.083 octave a step, the z hipass an octave below the z lowpass).
 */
const CUTOFF_TABLE_CC = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112] as const;
const CUTOFF_TABLES: Partial<Record<FilterType, readonly number[]>> = {
	ladder: [
		23.2, 51.1, 83.3, 160.4, 304.3, 502.5, 815, 1262.7, 1936, 2926.6, 4558.5, 6691, 9864.3, 14251,
		20183.5
	],
	svf: [26, 62.2, 131.7, 259, 467.1, 777.3, 1261.6, 2013.6, 3178.8, 5356.5, 8537.6, 13889]
};
const CUTOFF_LINES: Partial<Record<FilterType, readonly [number, number]>> = {
	'z lowpass': [4.792, 0.0828],
	'z hipass': [3.891, 0.0813]
};

/** The cutoff in hertz at a lane position (CC, beyond 0–127 when modulation pushes it there). */
export function cutoffAtCc(cc: number, type: FilterType): number {
	const line = CUTOFF_LINES[type];
	if (line) return Math.pow(2, line[0] + line[1] * cc);
	const hz = CUTOFF_TABLES[type] ?? (CUTOFF_TABLES.svf as readonly number[]);
	const xs = CUTOFF_TABLE_CC.slice(0, hz.length);
	const last = xs.length - 1;
	// past either end, on the end segment's slope (octaves per step)
	const lo = Math.log2(hz[1] / hz[0]) / (xs[1] - xs[0]);
	const hi = Math.log2(hz[last] / hz[last - 1]) / (xs[last] - xs[last - 1]);
	if (cc <= xs[0]) return hz[0] * Math.pow(2, lo * (cc - xs[0]));
	if (cc >= xs[last]) return hz[last] * Math.pow(2, hi * (cc - xs[last]));
	return logTable(xs, hz, cc);
}

/** The cutoff (0–99) of a filter type in hertz. */
export const cutoffHz = (v: number, type: FilterType = 'svf'): number => cutoffAtCc(toCc(v), type);

/** How a filter type is built from biquads: response, stages (12 dB/oct each), peak Q in dB. */
export interface FilterDesign {
	readonly kind: 'lowpass' | 'highpass';
	readonly stages: 1 | 2;
	readonly maxQ: number;
}

/**
 * The four types as biquad designs, for the Web Audio voices (the synth core models them closer,
 * `synth/core.ts`): ladder and svf are 24 dB lowpasses (two stages, the resonance on the second),
 * the z pair single two-poles, the z lowpass peaking far higher than the z hipass (research 60 §2).
 */
export const FILTER_DESIGNS: Readonly<Record<FilterType, FilterDesign>> = {
	svf: { kind: 'lowpass', stages: 2, maxQ: 17 },
	ladder: { kind: 'lowpass', stages: 2, maxQ: 20 },
	'z lowpass': { kind: 'lowpass', stages: 1, maxQ: 32 },
	'z hipass': { kind: 'highpass', stages: 1, maxQ: 12 }
};

/** The design of a filter type (unknown types fall back to svf). */
export const filterDesign = (type: FilterType): FilterDesign =>
	FILTER_DESIGNS[type] ?? FILTER_DESIGNS.svf;

/**
 * Resonance as a biquad Q in dB for the Web Audio voices: the z pair's measured Q; for the 24 dB
 * types a Butterworth-flat −3 dB at 0 rising to the type's peak at 99.
 */
export function resonanceQ(v: number, type: FilterType): number {
	if (type === 'z lowpass' || type === 'z hipass') {
		return 20 * Math.log10(zQ(v, type === 'z hipass'));
	}
	return -3 + (filterDesign(type).maxQ + 3) * Math.pow(unit(v), 1.4);
}

/**
 * How far the filter envelope opens the cutoff at its peak, in cents: the device adds about 0.85 of
 * the amount's steps to the cutoff's own steps (research 60 §2), so the depth depends on where the
 * cutoff rests and on the type's law. The amount runs from none to full (no negative side).
 */
export function envAmountCents(amount: number, type: FilterType = 'svf', cutoff = 0): number {
	const from = toCc(cutoff);
	const to = from + 0.85 * toCc(Math.max(0, amount));
	return 1200 * Math.log2(cutoffAtCc(to, type) / cutoffAtCc(from, type));
}

/** The note key tracking pivots on: C2 (research 60 §2). */
export const KEY_TRACK_PIVOT = 36;

/** Key tracking (0–99): the cutoff follows the note away from C2, up to an octave per octave. */
export const keyTrackCents = (v: number, note: number): number =>
	(note - KEY_TRACK_PIVOT) * 100 * unit(v);

// ─────────────────────────────────────────────────────────── voice (M2 + shift)

/** Play modes in the order M2 + shift, E1 steps through them. */
export const PLAY_MODE_NAMES = ['poly', 'mono', 'legato'] as const;
export type PlayMode = (typeof PLAY_MODE_NAMES)[number];

/** The play mode at an index (0 poly, 1 mono, 2 legato). */
export const playMode = (index: number): PlayMode =>
	PLAY_MODE_NAMES[clamp(Math.round(index), 0, PLAY_MODE_NAMES.length - 1)];

/** Portamento: off at 0, then 5 ms … 2.5 s. */
export const glideSeconds = (v: number): number =>
	v <= 0 ? 0 : 0.005 * Math.pow(500, (clamp(v, 1, 99) - 1) / 98);

/** A q15 lane on the 0–99 scale. */
const q99 = (raw: number) => (raw / 32767) * 99;

/**
 * The preset volume each engine's level was measured at. The calibration session played every
 * engine at its track's preset volume, so an engine sounds as measured there: prism on
 * bass/shoulder, epiano on pluck/beach bum, dissolve on lead/gaussian, hardsync on
 * pluck/dielectric, axis on strings/draemy. Simple, organ and wavetable replaced T1's, T2's and
 * T8's presets and, we assume, kept their volumes; the drums and the multisampler sit at a new
 * project's T1 and T8.
 */
const PRESET_VOLUME_MEASURED: Partial<Record<EngineId, number>> = {
	prism: q99(24901),
	epiano: q99(25670),
	dissolve: q99(16794),
	hardsync: q99(28180),
	axis: q99(10000),
	simple: q99(18348),
	organ: q99(24900),
	wavetable: q99(23591),
	drum: q99(18348),
	multisampler: q99(23591)
};

/** The preset volume law (unmeasured): silent at 0, quadratic to 44, then +6 dB by 99. */
function presetLaw(v: number): number {
	const x = clamp(v, 0, 99);
	if (x <= 44) return (x / 44) ** 2;
	return Math.pow(10, (6 * (x - 44)) / 55 / 20);
}

/**
 * Preset volume as a gain for `engine`: unity at the volume its level was measured at (so a new
 * project's sounds play as measured), moving on the law from there; without an engine, unity at 44.
 */
export function presetGain(v: number, engine?: EngineId): number {
	const measured = engine ? PRESET_VOLUME_MEASURED[engine] : undefined;
	return presetLaw(v) / (measured === undefined ? 1 : presetLaw(measured));
}

/** The mixer level of a new project's tracks (the device stores 0x6000 of 0x7FFF): unity gain. */
export const LEVEL_UNITY = q99(0x6000);

/** Mixer level: silent at 0, unity at a new project's level (75 shown), +4 dB at 99. */
export function levelGain(v: number): number {
	const x = clamp(v, 0, 99);
	if (x <= LEVEL_UNITY) return (x / LEVEL_UNITY) ** 2;
	return Math.pow(10, (4 * (x - LEVEL_UNITY)) / (99 - LEVEL_UNITY) / 20);
}

/** Pan −100…100 as −1…1. */
export const panValue = (v: number): number => clamp(v, -100, 100) / 100;

/**
 * Mix M4's group levels (percussion, melodic) and master level: unity at a new project's 50, silent
 * at 0, +6 dB at 99 (the master's extra drive goes into the limiter).
 */
export function groupGain(v: number): number {
	const x = clamp(v, 0, 99);
	if (x <= 50) return (x / 50) ** 2;
	return Math.pow(10, (6 * (x - 50)) / 49 / 20);
}

/** A master EQ band (mix M2, −50…50) in dB, heard as far as `blend` (0–99; 0 = flat): ±12 dB at full. */
export const eqGainDb = (band: number, blend: number): number =>
	(clamp(band, -50, 50) / 50) * 12 * unit(blend);

/** Where the master EQ's three bands sit: a low shelf, a mid bell and a high shelf (Hz). */
export const EQ_BANDS = { low: 150, mid: 1000, high: 6000 } as const;

/** A send level (0–99), squared so low values stay subtle. */
export const sendGain = (v: number): number => unit(v) ** 2;

/**
 * Note velocity (1–127) as a gain at a preset's velocity sensitivity (0–99, shift + M2): the
 * owner's unit scales the level by 1 − s·(1 − v/127), s the sensitivity. Its eight default tracks
 * at velocity 40, 100 and 127 (sensitivities 21 to 100 %) follow it within 0.2 dB
 * (docs/research/90-device-probe.md, 2026-09-29). Full sensitivity is linear in velocity; at 0 every
 * note plays alike.
 */
export const velocityGain = (velocity: number, sensitivity = 99): number =>
	1 - unit(sensitivity) * (1 - clamp(velocity, 1, 127) / 127);

/**
 * The velocity sensitivity each engine's level was measured at: the calibration session's presets
 * (as {@link PRESET_VOLUME_MEASURED}), at velocity 100. Simple, organ and wavetable took over T1's,
 * T2's and T8's tracks and, picked without a preset, kept their sensitivity.
 */
const SENSITIVITY_MEASURED: Partial<Record<EngineId, number>> = {
	prism: q99(6879),
	epiano: q99(26541),
	dissolve: q99(10240),
	hardsync: 99,
	axis: 99,
	simple: q99(19660),
	organ: q99(19660),
	wavetable: q99(26540)
};

/**
 * A note's velocity as a gain for `engine`'s voice, 1 where its level was measured (velocity 100 at
 * the calibration preset's sensitivity), so the engine plays the device's level there and follows
 * the device's velocity law elsewhere.
 */
export function velocityScale(velocity: number, sensitivity: number, engine: EngineId): number {
	const measured = SENSITIVITY_MEASURED[engine] ?? sensitivity;
	return velocityGain(velocity, sensitivity) / velocityGain(100, measured);
}

/** Pitch bend (−1…1) over the bend range (semitones, 0 = off), in cents. */
export const bendCents = (value: number, range: number): number =>
	clamp(value, -1, 1) * clamp(range, 0, 24) * 100;

// ─────────────────────────────────────────────────────────── drum keys and samples

/** Decibels as a gain. */
export const dbGain = (db: number): number => Math.pow(10, db / 20);

/** Tune in semitones as a playback rate. */
export const tuneRate = (semitones: number): number => Math.pow(2, semitones / 12);

/** A stretch of a sample, in seconds. */
export interface Region {
	readonly start: number;
	readonly end: number;
}

/** Sample start and end (0–99 of the sample) in seconds, never shorter than 5 ms. */
export function sampleRegion(start: number, end: number, duration: number): Region {
	const from = unit(start) * duration;
	const to = Math.max(unit(end) * duration, Math.min(duration, from + 0.005));
	return { start: Math.min(from, Math.max(0, duration - 0.005)), end: to };
}

/**
 * A drum key's sample fade (0–99) in seconds: a linear fade-in from the start marker lasting a
 * fixed time, not a share of the sample, 0.25 s at 50 and 0.95 s at 99 (research 60 §5; the screen
 * draws it as a ramp rising from the start marker).
 */
export const fadeSeconds = (fade: number): number => 0.95 * unit(fade) ** 2;

/** Where a synth sampler's region plays in its buffer, in seconds. */
export interface RegionPlay extends Region {
	/** The stretch that repeats, or null. */
	readonly loop: Region | null;
	/** Seconds of the loop's end crossfaded into what precedes its start (0: none). */
	readonly crossfade: number;
}

/** The loop crossfade's top: 75 % of the loop (research 60 §5). */
export const CROSSFADE_MAX = 75;

/**
 * A synth sampler's or multisampler zone's region (manual: synth-sampler; points 0–1 of the
 * sample) in seconds of a buffer `duration` long, never shorter than 5 ms. A loop plays while it is
 * set (loop start at the end, or no length, means none; "until release" loops like "forever", its
 * tail fading with the release). Reversed, the same stretch plays backwards, so the points mirror
 * onto the reversed buffer.
 */
export function regionSeconds(region: SampleRegion, duration: number): RegionPlay {
	const at = (v: number) => clamp(region.reverse ? 1 - v : v, 0, 1) * duration;
	const [a, b] = [at(region.start), at(region.end)];
	const from = Math.min(Math.min(a, b), Math.max(0, duration - 0.005));
	const to = Math.max(Math.max(a, b), Math.min(duration, from + 0.005));
	const [la, lb] = [at(region.loopStart), at(region.loopEnd)].map((v) => clamp(v, from, to));
	const loop = { start: Math.min(la, lb), end: Math.max(la, lb) };
	const looping = region.loop !== 'off' && region.loopStart < region.end;
	const repeats = looping && loop.end - loop.start >= 0.005;
	// the crossfade covers that share of the loop, as its wedge is drawn
	const share = clamp(region.crossfade ?? 0, 0, CROSSFADE_MAX) / 99;
	return {
		start: from,
		end: to,
		loop: repeats ? loop : null,
		crossfade: repeats ? share * (loop.end - loop.start) : 0
	};
}

// ─────────────────────────────────────────────────────────── LFO (M4)

/**
 * LFO speed in hertz. The synced range counts sixteenths per cycle (triplet sixteenths for the
 * random LFO) at the tempo, which matches the device where the counts are powers of two (a quarter
 * note per cycle at CC 32, research 60 §4); past it the free range stands still at its first
 * position and rises as a square law to 21.5 Hz, as measured.
 */
export function lfoHz(speed: number, bpm: number, triplets = false): number {
	const synced = LFO_SYNC_STEPS.length;
	if (speed < synced) {
		const count = Number(LFO_SYNC_STEPS[clamp(Math.round(speed), 0, synced - 1)]);
		const sixteenth = (15 / bpm) * (triplets ? 2 / 3 : 1);
		return 1 / (count * sixteenth);
	}
	return FREE_LFO_TOP_HZ * unit(speed - synced) ** 2;
}

/** The free LFO's fastest rate (research 60 §4). */
export const FREE_LFO_TOP_HZ = 21.5;

/** Waveforms the engine's LFO plays. */
export type LfoWave = 'sine' | 'random';

/** What the track's LFO does to the sound, worked out from its M4 settings. */
export type LfoRoute =
	| { readonly kind: 'none' }
	| {
			/** The filter's cutoff (cents) or resonance (dB), or one of the engine's M1 parameters. */
			readonly kind: 'cutoff' | 'resonance' | 'engine';
			/** M1 parameter 0–3 when `kind` is engine. */
			readonly param: number;
			readonly hz: number;
			/** −1…1. */
			readonly depth: number;
			/** Restart the wave with each note (the normal destinations; the free ones run on). */
			readonly retrigger: boolean;
			readonly wave: LfoWave;
	  }
	| {
			readonly kind: 'tremolo';
			readonly hz: number;
			/** Vibrato depth in cents (the amount card). */
			readonly vibrato: number;
			/** Tremolo depth −1…1 (the volume card). */
			readonly volume: number;
	  }
	| {
			readonly kind: 'duck';
			/**
			 * The instrument track (0–7) whose notes duck this one, {@link DUCK_ON_BEAT} for the
			 * metronome, or {@link DUCK_ON_NOTHING} for an auxiliary track (none sounds here).
			 */
			readonly source: number;
			/** 0–1 of the level taken away. */
			readonly depth: number;
			readonly hold: number;
			readonly release: number;
	  }
	| {
			/** Element on the amp envelope: each voice moves its target by its own envelope. */
			readonly kind: 'element';
			readonly target: 'engine' | 'cutoff' | 'resonance';
			/** M1 parameter 0–3 when `target` is engine. */
			readonly param: number;
			/** −1…1 at the envelope's peak. */
			readonly depth: number;
	  };

const NO_LFO: LfoRoute = { kind: 'none' };

/**
 * Where the LFO goes. Value and random reach the filter's cutoff and resonance and the engine's M1
 * parameters (the envelope and LFO pages are not modulated here); tremolo wobbles pitch and level;
 * duck dips the level on the source track's notes; element follows each voice's amp envelope (the
 * replica has no gyroscope or microphone). A switched-off LFO goes nowhere.
 */
export function lfoRoute(lfo: Lfo, bpm: number): LfoRoute {
	if (!lfo.on) return NO_LFO;
	switch (lfo.type) {
		case 'value':
		case 'random': {
			const depth = clamp(lfo.amount, -99, 99) / 99;
			const destination =
				DESTINATIONS[clamp(Math.round(lfo.destination), 0, DESTINATIONS.length - 1)];
			if (depth === 0 || !destination) return NO_LFO;
			const param = clamp(Math.round(lfo.parameter), 0, 3);
			const common = {
				param,
				hz: lfoHz(lfo.speed, bpm, lfo.type === 'random'),
				depth,
				retrigger: !destination.free,
				wave: (lfo.type === 'random' ? 'random' : 'sine') as LfoWave
			};
			if (destination.module === 'syn') return { kind: 'engine', ...common };
			if (destination.module === 'filter' && param <= 1) {
				return { kind: param === 0 ? 'cutoff' : 'resonance', ...common };
			}
			return NO_LFO;
		}
		case 'tremolo': {
			// measured (research 60 §4): vibrato ±1500 cents at full, growing as the cube of the
			// amount; the level dips to 1 − 0.82·|volume|
			const vibrato = TREMOLO_VIBRATO_CENTS * (clamp(lfo.amount, -99, 99) / 99) ** 3;
			const volume = TREMOLO_VOLUME_DEPTH * (clamp(lfo.volume, -99, 99) / 99);
			if (vibrato === 0 && volume === 0) return NO_LFO;
			return { kind: 'tremolo', hz: lfoHz(lfo.speed, bpm), vibrato, volume };
		}
		case 'element': {
			// the amp envelope is the one source the replica has (sum: the others add nothing)
			const depth = clamp(lfo.amount, -99, 99) / 99;
			const sensor = ELEMENT_SOURCES[clamp(Math.round(lfo.sensor), 0, ELEMENT_SOURCES.length - 1)];
			if (depth === 0 || (sensor.name !== 'amp envelope' && sensor.name !== 'sum')) return NO_LFO;
			const destination =
				SENSOR_DESTINATIONS[clamp(Math.round(lfo.destination), 0, SENSOR_DESTINATIONS.length - 1)];
			const param = clamp(Math.round(lfo.parameter), 0, 3);
			if (destination.module === 'syn') return { kind: 'element', target: 'engine', param, depth };
			if (destination.module === 'filter' && param <= 1) {
				return { kind: 'element', target: param === 0 ? 'cutoff' : 'resonance', param, depth };
			}
			return NO_LFO;
		}
		case 'duck': {
			const depth = Math.abs(clamp(lfo.amount, -99, 99)) / 99;
			if (depth === 0) return NO_LFO;
			const source = Math.round(lfo.source);
			return {
				kind: 'duck',
				source:
					source >= DUCK_METRONOME
						? DUCK_ON_BEAT
						: source > 8
							? DUCK_ON_NOTHING
							: Math.max(1, source) - 1,
				depth,
				hold: duckHoldSeconds(lfo.hold),
				release: duckReleaseSeconds(lfo.release)
			};
		}
		default:
			return NO_LFO;
	}
}

/** A duck's source when it is the metronome: every beat while the sequence plays. */
export const DUCK_ON_BEAT = -1;
/** A duck's source when it is an auxiliary track, whose notes make no sound in the browser. */
export const DUCK_ON_NOTHING = -2;

/** Tremolo's vibrato at full amount (cents) and how far its volume card dips the level. */
export const TREMOLO_VIBRATO_CENTS = 1500;
export const TREMOLO_VOLUME_DEPTH = 0.82;

/** The duck's hold and release measured at CC 0, 32, 64, 96 and 127 (research 60 §4). */
const DUCK_CC = [0, 32, 64, 96, 127] as const;
const DUCK_HOLD_MS = [52, 59, 98, 297, 394] as const;
/** Time to recover to 90 % after the hold: higher is faster, as on the amp release. */
const DUCK_RELEASE_MS = [641, 364, 163, 43, 7] as const;

/** How long the duck holds the level down (seconds) at hold 0–99. */
export const duckHoldSeconds = (v: number): number =>
	logTable(DUCK_CC, DUCK_HOLD_MS, toCc(v)) / 1000;

/** How long the duck takes to recover to 90 % (seconds) at release 0–99. */
export const duckReleaseSeconds = (v: number): number =>
	logTable(DUCK_CC, DUCK_RELEASE_MS, toCc(v)) / 1000;

/**
 * How far a full-depth LFO moves the cutoff (cents) and the resonance (dB). Half the amount already
 * sweeps the whole range from the middle of the cutoff (research 60 §4): about ±127 cutoff steps
 * at full, some 10.7 octaves.
 */
export const LFO_CUTOFF_CENTS = 12800;
export const LFO_RESONANCE_DB = 12;

// ─────────────────────────────────────────────────────────── metronome

/** Metronome level (0–99) as a gain. */
export const metronomeGain = (level: number): number => 0.5 * unit(level) ** 2;

// ─────────────────────────────────────────────────────────── engines (M1)

/** prism: a detuned pair of oscillators plus a third at a musical ratio, spread in stereo. */
export interface PrismControls {
	readonly engine: 'prism';
	/** Waveform position: 0 sine, 1 triangle, 2 saw, 3 square (crossfaded in between). */
	readonly shape: number;
	/** Frequency ratio of the third oscillator. */
	readonly ratio: number;
	/** Cents between the pair. */
	readonly detune: number;
	/** How far the pair pans apart (0–0.9). */
	readonly spread: number;
}

/** epiano: an FM tine piano. */
export interface EpianoControls {
	readonly engine: 'epiano';
	/** FM index the tone settles on (brightness). */
	readonly index: number;
	/** Saturation drive (1 = clean). */
	readonly drive: number;
	/** 0–1: how hard each note's brightness and level bark at the start. */
	readonly punch: number;
	/** FM index of the metallic tine strike. */
	readonly tine: number;
}

/** Organ models by `type`, in 20-detent zones. */
export const ORGAN_MODELS = ['transistor', 'reed', 'church', 'full', 'jazz'] as const;

/** organ: drawbar registrations with a separate 16′ bass and a rotary-style tremolo. */
export interface OrganControls {
	readonly engine: 'organ';
	/** Index into {@link ORGAN_MODELS}. */
	readonly model: number;
	/** Level of the 16′ sub drawbar (0–0.8). */
	readonly bass: number;
	/** Tremolo depth (0–0.3) and speed (Hz). */
	readonly tremolo: number;
	readonly speed: number;
}

/** The wavetable engine's nine tables. */
export const WAVETABLES = [
	'basic',
	'bright',
	'vocal',
	'hollow',
	'bell',
	'sync',
	'pulse',
	'organ',
	'metal'
] as const;

/** Frames (waveforms) in every table. */
export const WAVETABLE_FRAMES = 8;

/** wavetable: morphs between neighbouring frames of a table; warp and drift are phase modulation. */
export interface WavetableControls {
	readonly engine: 'wavetable';
	/** Index into {@link WAVETABLES}. */
	readonly table: number;
	/** 0 … frames − 1, fractional between frames. */
	readonly position: number;
	/** Modulation index that bends the waveform. */
	readonly warp: number;
	/** Modulator ratio: 1 follows the pitch; more drifts into inharmonic tones. */
	readonly drift: number;
}

/** axis: FM strings — two carriers a detune or a fifth-stack apart, bowed brightness, tremolo. */
export interface AxisControls {
	readonly engine: 'axis';
	/** FM index (brightness). */
	readonly index: number;
	/** Cents from the first carrier to the second (a detune, or 7, 12, 19 or 24 semitones). */
	readonly interval: number;
	/** Carrier waveform: 0 sine, 1 triangle, 2 saw. */
	readonly shape: number;
	/** Tremolo depth (0–0.25) and speed (Hz), both from the one tremolo control. */
	readonly tremolo: number;
	readonly speed: number;
}

/** dissolve: pitched oscillators eaten into by noise. */
export interface DissolveControls {
	readonly engine: 'dissolve';
	/** Noise FM depth as a fraction of the pitch. */
	readonly swarm: number;
	/** Level of the noise layer tuned to the note. */
	readonly air: number;
	/** Amplitude-modulation depth 0–1. */
	readonly am: number;
	/** FM index. */
	readonly fm: number;
	/** Cents of the detuned second oscillator (0 = none). */
	readonly detune: number;
}

/** hardsync: a synced saw (its spectrum per ratio) over a sub oscillator, noise and a low cut. */
export interface HardsyncControls {
	readonly engine: 'hardsync';
	/** Slave-to-master frequency ratio, in 25 steps so each spectrum can be cached. */
	readonly ratio: number;
	readonly sub: number;
	readonly noise: number;
	/** Low-cut corner in Hz (the sub stays below it untouched). */
	readonly lowcut: number;
}

/** simple: one oscillator from sine to pulse, pulse width, noise and a stereo double. */
export interface SimpleControls {
	readonly engine: 'simple';
	/** 0 sine, 1 triangle, 2 saw, 3 pulse (crossfaded in between). */
	readonly shape: number;
	/** Pulse duty cycle 0.04–0.5. */
	readonly duty: number;
	readonly noise: number;
	/** 0–1: a detuned double panned apart. */
	readonly spread: number;
}

/** The synth sampler without a sample: a soft, rounded sine. */
export interface SoftControls {
	readonly engine: 'soft';
}

/**
 * The multisampler without its samples (TE's, which the app cannot ship): a banded pad after a new
 * project's pad/bandpasser (2026-09-29), so a new project's T8 plays a pad and not a sine.
 */
export interface BandControls {
	readonly engine: 'band';
}

/** What a synth voice is built from. */
export type EngineControls =
	| PrismControls
	| EpianoControls
	| OrganControls
	| WavetableControls
	| AxisControls
	| DissolveControls
	| HardsyncControls
	| SimpleControls
	| SoftControls
	| BandControls;

/** Synth engines by their controls' name. */
export type SynthEngine = EngineControls['engine'];

/** prism's ratio zones: sub-octave, unison, fifth, octave (where the default 80 sits), 12th, two octaves. */
const PRISM_RATIOS: readonly (readonly [number, number])[] = [
	[0, 0.5],
	[10, 1],
	[30, 1.5],
	[50, 2],
	[85, 3],
	[95, 4]
];

/** axis's fifth steps above the detune half. */
const AXIS_STEPS = [7, 12, 19, 24] as const;

/**
 * Four M1 values (0–99) as the controls of a synth engine's voice. Samplers without a sample play
 * a stand-in (the synth sampler a soft tone, the multisampler a banded pad); the drum sampler and
 * the midi engine are not synths (null).
 */
export function engineControls(
	engine: EngineId,
	m1: readonly [number, number, number, number]
): EngineControls | null {
	const [a, b, c, d] = m1.map(unit) as [number, number, number, number];
	switch (engine) {
		case 'prism':
			return {
				engine,
				shape: a * 3,
				ratio: [...PRISM_RATIOS].reverse().find(([from]) => m1[1] >= from)?.[1] ?? 1,
				detune: 30 * c * c,
				spread: 0.9 * d
			};
		case 'epiano':
			return {
				engine,
				index: 0.1 + 1.5 * Math.pow(a, 1.5),
				drive: 1 + 2.5 * b ** 3,
				punch: c,
				tine: 1.2 * Math.pow(d, 1.5)
			};
		case 'organ':
			return {
				engine,
				model: Math.min(ORGAN_MODELS.length - 1, Math.floor(clamp(m1[0], 0, 99) / 20)),
				bass: 0.8 * Math.pow(b, 1.2),
				tremolo: 0.3 * c * c,
				speed: 0.6 * Math.pow(7.5 / 0.6, d)
			};
		case 'wavetable':
			return {
				engine,
				table: Math.min(WAVETABLES.length - 1, Math.floor((clamp(m1[0], 0, 99) * 9) / 100)),
				position: b * (WAVETABLE_FRAMES - 1),
				warp: 1.5 * c * c,
				drift: 1 + 0.5 * d ** 3
			};
		case 'axis': {
			const ratio = clamp(m1[1], 0, 99);
			const interval =
				ratio <= 50
					? (25 * ratio) / 50
					: 100 * AXIS_STEPS[Math.min(AXIS_STEPS.length - 1, Math.floor((ratio - 51) / 12.25))];
			return {
				engine,
				index: 0.05 + 1.2 * a * a,
				interval,
				shape: c * 2,
				tremolo: 0.25 * d * d,
				speed: 1 + 6 * d
			};
		}
		case 'dissolve':
			return {
				engine,
				swarm: 1.5 * a * a,
				air: 0.6 * a * a,
				am: b,
				fm: 2 * c * c,
				detune: 40 * d * d
			};
		case 'hardsync':
			return {
				engine,
				ratio: 1 + 5 * Math.pow(Math.round(a * 24) / 24, 1.5),
				sub: 0.7 * Math.pow(b, 1.5),
				noise: 0.4 * c ** 3,
				lowcut: 20 * Math.pow(40, d * d)
			};
		case 'simple':
			return { engine, shape: a * 3, duty: 0.5 - 0.46 * b, noise: 0.5 * c * c, spread: d };
		case 'sampler':
			return { engine: 'soft' };
		case 'multisampler':
			return { engine: 'band' };
		default:
			return null;
	}
}
