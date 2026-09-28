/**
 * What the main thread and the synth core say to each other (`host.ts` ↔ `core.ts` in the
 * worklet): the messages, the constants both sides need, and which engines the core plays. Types
 * and constants only, so the main thread's bundle carries none of the DSP.
 */
import type { EngineId } from '$lib/core/opxy';
import type { FilterType } from '$lib/sim/screen/frame';

/** An envelope's settings: times in seconds, sustain 0–1. */
export interface AdsrSettings {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

/** The AudioWorklet processor's registered name (`worklet.ts`). */
export const PROCESSOR = 'opxy-synth';
/** Samples between control updates (pitch, filter, engine parameters). */
export const CONTROL = 16;
/** Fade for a stolen or choked voice (matches the Web Audio voices). */
export const STEAL_SECONDS = 0.008;
/** Instrument tracks, each an output of the core. */
export const TRACK_OUTPUTS = 8;
/** LFO signals per track input: cutoff cents, resonance dB, engine unit, vibrato cents. */
export const MOD_CHANNELS = 4;

/** The track's filter as a voice starts with it. */
export interface CoreFilter {
	readonly type: FilterType;
	/** Switched off, the voice passes its engine's output unfiltered. */
	readonly on: boolean;
	/** Resting cutoff, key tracking included (Hz). */
	readonly hz: number;
	/** 0–99. */
	readonly resonance: number;
	readonly envelope: AdsrSettings;
	/** How far the filter envelope moves the cutoff at its peak, in cents. */
	readonly depth: number;
}

/** Everything a voice needs when it starts. Times are audio-context seconds. */
export interface VoiceStart {
	readonly id: number;
	readonly track: number;
	readonly engine: EngineId;
	/** M1 as the note starts, 0–99. */
	readonly m1: readonly number[];
	/** 1–127. */
	readonly velocity: number;
	readonly start: number;
	/** When the note is let go; Infinity while a key holds it. */
	readonly gate: number;
	readonly hz: number;
	/** Where the pitch starts when it glides in, and the glide's length in seconds. */
	readonly from: number;
	readonly glide: number;
	readonly amp: AdsrSettings;
	/** Level at the top of the attack (velocity, engine level, preset volume). */
	readonly peak: number;
	readonly filter: CoreFilter;
	/** Pitch bend at the start, in cents. */
	readonly bend: number;
	/** A bend component's curve over start → gate, in cents. */
	readonly curve: Float32Array | null;
	/** −1…1: the note's own place in the stereo field. */
	readonly pan: number;
	/** Which M1 parameter (0–3) the track's LFO moves, or null. */
	readonly lfoParam: number | null;
	/** The track's element LFO, or null. */
	readonly element: ElementModulation | null;
}

/**
 * The element LFO on the amp envelope, which each voice runs on its own envelope: what it moves,
 * and how far at the envelope's peak (−1…1 of a whole M1 range, of {@link ELEMENT_CUTOFF_CENTS}
 * of cutoff, or of {@link ELEMENT_RESONANCE_DB} of resonance).
 */
export interface ElementModulation {
	readonly target: 'engine' | 'cutoff' | 'resonance';
	readonly param: number;
	readonly depth: number;
}

/**
 * How far a full element depth moves the cutoff (cents) and resonance (dB), as a full LFO does (about
 * ±127 cutoff steps: positive amounts opened the z hipass fully on the owner's unit, research 60 §4).
 */
export const ELEMENT_CUTOFF_CENTS = 12800;
export const ELEMENT_RESONANCE_DB = 12;

/** What the main thread tells the core. */
export type CoreMessage =
	| { readonly t: 'start'; readonly voice: VoiceStart }
	| { readonly t: 'release'; readonly id: number; readonly time: number; readonly seconds?: number }
	| { readonly t: 'kill'; readonly id: number; readonly time: number }
	| { readonly t: 'cancel'; readonly id: number; readonly time: number }
	| { readonly t: 'extend'; readonly id: number; readonly gate: number }
	| {
			readonly t: 'glide';
			readonly id: number;
			readonly time: number;
			readonly hz: number;
			readonly seconds: number;
	  }
	| { readonly t: 'bend'; readonly id: number; readonly time: number; readonly cents: number }
	| {
			readonly t: 'filter';
			readonly id: number;
			readonly time: number;
			readonly hz: number;
			readonly resonance: number;
	  }
	| { readonly t: 'm1'; readonly id: number; readonly time: number; readonly m1: readonly number[] }
	| {
			readonly t: 'lfo';
			readonly id: number;
			readonly param: number | null;
			readonly element: ElementModulation | null;
	  }
	| { readonly t: 'silence' };

/** What the core tells the main thread: a voice has fallen silent and let go of its slot. */
export type CoreReply = { readonly t: 'ended'; readonly id: number };

/**
 * The engines the core plays: all eight synth engines. The samplers and the midi engine stay with
 * the Web Audio voices (docs/research/57-synth-engines.md).
 */
export const CORE_ENGINES: ReadonlySet<EngineId> = new Set<EngineId>([
	'axis',
	'dissolve',
	'epiano',
	'hardsync',
	'organ',
	'prism',
	'simple',
	'wavetable'
]);
