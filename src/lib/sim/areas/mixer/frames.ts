/**
 * Frames the mixer area draws (see `../types.ts`): plain data in the units the pages draw (0–1
 * positions, display strings). TE's guide has no picture of any of these pages; `draw.ts` says how
 * each layout was put together from TE's other pages.
 */
import type { HeaderCell } from '../../screen/draw';

/** Mix M2: the master EQ, as a response over the filter page's frequency axis. */
export interface MixEqFrame {
	readonly page: 'mix-eq';
	/** Low, mid, high and blend as the header shows them ("+12", "–08", "50"). */
	readonly header: readonly HeaderCell[];
	/** Low, mid and high as set on E1–E3, −1 (full cut) … 1 (full boost). */
	readonly bands: readonly [number, number, number];
	/** 0–1: the share of the band settings that is heard (0 = flat). */
	readonly blend: number;
}

/** Mix M3: the master saturator, as a sine wave through it. */
export interface MixSaturatorFrame {
	readonly page: 'mix-saturator';
	/** Gain, clip, tone and mix as the header shows them. */
	readonly header: readonly HeaderCell[];
	/** 0–1: drive into the saturator. */
	readonly gain: number;
	/** 0–1: how far the peaks are cut off. */
	readonly clip: number;
	/** −1 (darker) … 1 (brighter). */
	readonly tone: number;
	/** 0–1: share of the saturated signal in what is heard. */
	readonly mix: number;
}

/** Mix M4: group levels, compressor and master level, as mixer strips. */
export interface MixMasterFrame {
	readonly page: 'mix-master';
	/** Percussion, melodic, compressor and master as the header shows them. */
	readonly header: readonly HeaderCell[];
	/** Percussion group, melodic group, compressor and master level, 0–1 (E1–E4). */
	readonly values: readonly [number, number, number, number];
	/** Momentary output 0–1 of the percussion group, the melodic group and the master. */
	readonly meters: readonly [number, number, number];
	/** Instrument tracks routed to the percussion and to the melodic group ("1 2", "3 4 5 6 7 8"). */
	readonly groups: readonly [string, string];
}

/** One CC slot as a midi-engine page shows it. */
export interface MidiCcSlotView {
	/** Above the box: "cc 74", "cc" on the shift layer, "off" while the slot is off. */
	readonly label: string;
	/** In the box: the value (the CC number with shift), or null for the crossed "none" box. */
	readonly value: string | null;
}

/** The midi engine's M2 or M3 page on an instrument track: four CC slots. */
export interface MidiCcFrame {
	readonly page: 'midi-engine-cc';
	/** 1 on M2 (slots 1–4), 2 on M3 (slots 5–8); TE names the pages set I and set II. */
	readonly set: 1 | 2;
	/** Shift held: the boxes show the slots' CC numbers, the layer shift + turn edits. */
	readonly shift: boolean;
	/** The four slots in encoder order. */
	readonly slots: readonly MidiCcSlotView[];
}

/** Every frame of the mixer area. */
export type MixerFrame = MixEqFrame | MixSaturatorFrame | MixMasterFrame | MidiCcFrame;
