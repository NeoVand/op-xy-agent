/**
 * The mixer area's part of the simulator state (see `../types.ts`): the master chain that mix mode's
 * pages M2–M4 edit (manual: mix/eq, mix/saturator, mix/master) and the eight CC slots of every
 * instrument track's midi engine, which its M2 and M3 pages edit (manual: instrument/engine-midi).
 * Plain, serialisable data on the encoders' scales.
 *
 * Defaults are a new project's, read from the device's own project files: the twelve master words of
 * the `.xy` header (docs/research/10-xy-format.md §3.2) hold the EQ bands at their centre (flat), a
 * fourth EQ word at half (taken as blend), saturator gain and clip at 20 %, tone centred, mix at 0,
 * both group levels and the master level at half, and the compressor at 10 %. The external midi
 * track's probes (same document, §3.5) start with every CC slot off.
 */

/** Largest cut or boost of an EQ band. */
export const EQ_BAND_RANGE = 50;
/** The saturator's tone either side of neutral. */
export const TONE_RANGE = 50;
/** Highest CC number and CC value. */
export const CC_MAX = 127;
/** CC slots per midi-engine track (four on M2, four on M3). */
export const CC_SLOTS = 8;

/** The master EQ on mix M2 (manual: mix/eq). */
export interface EqState {
	/** Low, mid and high: a cut (−) or a boost (+), −50…50; 0 is flat. */
	low: number;
	mid: number;
	high: number;
	/** 0–99: how much of the band settings is heard (0 = flat whatever the bands say). */
	blend: number;
}

/** The master saturator on mix M3 (manual: mix/saturator). */
export interface SaturatorState {
	/** 0–99: level driven into the saturator. */
	gain: number;
	/** 0–99: how hard the loudest peaks are cut off. */
	clip: number;
	/** −50…50: darker (highs filtered) … brighter (lows filtered); 0 is neutral. */
	tone: number;
	/** 0–99: share of the saturated signal in the master. */
	mix: number;
}

/** Group levels, compressor and output level on mix M4 (manual: mix/master). */
export interface MasterState {
	/** 0–99: level of the percussion group (drum sampler tracks). */
	percussion: number;
	/** 0–99: level of the melodic group (synth engines, sampler, multisampler). */
	melodic: number;
	/** 0–99: how much the master bus is compressed. */
	compressor: number;
	/** 0–99: the master level going into the output limiter. */
	level: number;
}

/** One CC slot of the midi engine: which controller it sends (null = off) and its value. */
export interface CcSlot {
	/** CC number 0–127, or null while the slot is off (shift + turn switches it on). */
	cc: number | null;
	/** 0–127, sent on the track's channel. */
	value: number;
}

/** What the mixer area remembers. */
export interface MixerState {
	eq: EqState;
	saturator: SaturatorState;
	master: MasterState;
	/** Per instrument track (0–7): the midi engine's CC slots, 1–4 on M2 and 5–8 on M3. */
	midiCc: CcSlot[][];
}

/** The EQ of a new project (and what clicking E4 on mix M2 goes back to). */
export function defaultEq(): EqState {
	return { low: 0, mid: 0, high: 0, blend: 50 };
}

/** A midi-engine track's CC slots in a new project: all off. */
export function defaultCcSlots(): CcSlot[] {
	return Array.from({ length: CC_SLOTS }, () => ({ cc: null, value: 0 }));
}

/** The mixer area's state in a new project. */
export function initialMixer(): MixerState {
	return {
		eq: defaultEq(),
		saturator: { gain: 20, clip: 20, tone: 0, mix: 0 },
		master: { percussion: 50, melodic: 50, compressor: 10, level: 50 },
		midiCc: Array.from({ length: 8 }, defaultCcSlots)
	};
}
