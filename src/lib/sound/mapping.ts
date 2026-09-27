/**
 * From the simulator's encoder values to sound: seconds, hertz, cents and gains for the envelopes,
 * filter, LFO, voice settings, mixer and drum keys, and what each synth engine's four M1 parameters
 * do. TE publishes no curves, so these are ours: exponential for times and frequencies (every detent
 * is the same ratio), powers for levels and amounts (fine control near zero), and tuned so that a
 * new project (M1 mostly at 80, level 80, preset volume 44) sounds musical rather than extreme.
 * Pure, so the engine, the scheduler and the tests share them.
 */
import type { EngineId } from '$lib/core/opxy';
import type { Region as SampleRegion } from '$lib/sim/areas/sample/state';
import { LFO_SYNC_STEPS, type Envelope99, type Lfo } from '$lib/sim/params';
import type { FilterType } from '$lib/sim/screen/frame';
import { DESTINATIONS } from '$lib/sim/screen/pages/lfo';

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

/**
 * An envelope time in seconds for an encoder value 0–99, on the OP-XY's measured law: exponential,
 * about 2 s at half and six minutes at 99 (op-forums t/31132, two fits agreeing on the attack; we
 * assume decay and release follow it; docs/research/57-synth-engines.md §4). The fit's 11 ms at 0
 * gives way to `floor`, so the sharpest setting is as quick as it can be without a click.
 */
export function envelopeTime(value: number, floor: number): number {
	return 0.0111 * (Math.exp(10.386 * unit(value)) - 1) + floor;
}

/** Envelope times on the measured law: from 1.5 ms (attack), 20 ms (decay) or 15 ms (release) up. */
export function envelopeSeconds(env: Envelope99): Adsr {
	return {
		attack: envelopeTime(env.attack, 0.0015),
		decay: envelopeTime(env.decay, 0.02),
		sustain: unit(env.sustain),
		release: envelopeTime(env.release, 0.015)
	};
}

// ─────────────────────────────────────────────────────────── filter (M3)

/** Cutoff: 20 Hz … 20 kHz, about one octave every ten detents. */
export const cutoffHz = (v: number): number => sweep(v, 20, 20000);

/** How a filter type is built from biquads: response, stages (12 dB/oct each), peak Q in dB. */
export interface FilterDesign {
	readonly kind: 'lowpass' | 'highpass';
	readonly stages: 1 | 2;
	readonly maxQ: number;
}

/**
 * The four types factory presets use, as biquad designs: svf a 12 dB lowpass, ladder two stages
 * (24 dB, the resonance on the second), z lowpass a sharper-peaked 12 dB lowpass, z hipass a highpass.
 */
export const FILTER_DESIGNS: Readonly<Record<FilterType, FilterDesign>> = {
	svf: { kind: 'lowpass', stages: 1, maxQ: 18 },
	ladder: { kind: 'lowpass', stages: 2, maxQ: 20 },
	'z lowpass': { kind: 'lowpass', stages: 1, maxQ: 22 },
	'z hipass': { kind: 'highpass', stages: 1, maxQ: 18 }
};

/** The design of a filter type (unknown types fall back to svf). */
export const filterDesign = (type: FilterType): FilterDesign =>
	FILTER_DESIGNS[type] ?? FILTER_DESIGNS.svf;

/** Resonance as a biquad Q in dB: flat (−3 dB, Butterworth) at 0, the type's peak at 99. */
export const resonanceQ = (v: number, type: FilterType): number =>
	-3 + (filterDesign(type).maxQ + 3) * Math.pow(unit(v), 1.4);

/** Filter-envelope depth (−99…99) in cents: up to seven octaves either way, finer near zero. */
export function envAmountCents(v: number): number {
	const x = clamp(v, -99, 99) / 99;
	return Math.sign(x) * x * x * 8400;
}

/** Key tracking (0–99): the cutoff follows the note away from C4, up to an octave per octave. */
export const keyTrackCents = (v: number, note: number): number => (note - 60) * 100 * unit(v);

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

/** Preset volume: silent at 0, unity at the default 44, +6 dB at 99. */
export function presetGain(v: number): number {
	const x = clamp(v, 0, 99);
	if (x <= 44) return (x / 44) ** 2;
	return Math.pow(10, (6 * (x - 44)) / 55 / 20);
}

/** Mixer level: silent at 0, unity at the default 80, +4 dB at 99. */
export function levelGain(v: number): number {
	const x = clamp(v, 0, 99);
	if (x <= 80) return (x / 80) ** 2;
	return Math.pow(10, (4 * (x - 80)) / 19 / 20);
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

/** Note velocity (1–127) as a gain; the replica keyboard's 100 sits about 3 dB down. */
export const velocityGain = (velocity: number): number =>
	Math.pow(clamp(velocity, 1, 127) / 127, 1.5);

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

/** Sample fade (0–99): how much of the region's end fades out, in seconds. */
export const fadeSeconds = (fade: number, length: number): number => unit(fade) * length;

/** Where a synth sampler's region plays in its buffer, in seconds. */
export interface RegionPlay extends Region {
	/** The stretch that repeats, or null. */
	readonly loop: Region | null;
}

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
	return {
		start: from,
		end: to,
		loop: looping && loop.end - loop.start >= 0.005 ? loop : null
	};
}

// ─────────────────────────────────────────────────────────── LFO (M4)

/**
 * LFO speed in hertz. The synced range counts sixteenths per cycle (triplet sixteenths for the
 * random LFO) at the tempo; past it the free range runs 0.05–25 Hz.
 */
export function lfoHz(speed: number, bpm: number, triplets = false): number {
	const synced = LFO_SYNC_STEPS.length;
	if (speed < synced) {
		const count = Number(LFO_SYNC_STEPS[clamp(Math.round(speed), 0, synced - 1)]);
		const sixteenth = (15 / bpm) * (triplets ? 2 / 3 : 1);
		return 1 / (count * sixteenth);
	}
	return sweep(speed - synced, 0.05, 25);
}

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
			/** The instrument track (0–7) whose notes duck this one. */
			readonly source: number;
			/** 0–1 of the level taken away. */
			readonly depth: number;
			readonly hold: number;
			readonly release: number;
	  };

const NO_LFO: LfoRoute = { kind: 'none' };

/**
 * Where the LFO goes. Value and random reach the filter's cutoff and resonance and the engine's M1
 * parameters (the envelope and LFO pages are not modulated here); tremolo wobbles pitch and level;
 * duck dips the level on the source track's notes; element follows sensors the replica lacks.
 */
export function lfoRoute(lfo: Lfo, bpm: number): LfoRoute {
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
			const vibrato = (clamp(lfo.amount, -99, 99) / 99) * 50;
			const volume = clamp(lfo.volume, -99, 99) / 99;
			if (vibrato === 0 && volume === 0) return NO_LFO;
			return { kind: 'tremolo', hz: lfoHz(lfo.speed, bpm), vibrato, volume };
		}
		case 'duck': {
			const depth = Math.abs(clamp(lfo.amount, -99, 99)) / 99;
			if (depth === 0) return NO_LFO;
			return {
				kind: 'duck',
				source: clamp(Math.round(lfo.source), 1, 8) - 1,
				depth,
				hold: sweep(lfo.hold, 0.01, 1),
				release: sweep(lfo.release, 0.02, 2)
			};
		}
		default:
			return NO_LFO;
	}
}

/** How far a full-depth LFO moves the cutoff (cents) and the resonance (dB). */
export const LFO_CUTOFF_CENTS = 3600;
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

/** The sampler engines without a sample: a soft, rounded sine. */
export interface SoftControls {
	readonly engine: 'soft';
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
	| SoftControls;

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
 * the soft tone; the drum sampler and the midi engine are not synths (null).
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
		case 'multisampler':
			return { engine: 'soft' };
		default:
			return null;
	}
}
