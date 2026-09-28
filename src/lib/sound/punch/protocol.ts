/**
 * What the main thread and the punch-in processor say to each other (`host.ts` ↔ `worklet.ts`):
 * the processor's name, its shape and its messages. Types and constants only.
 */
import type { CoreEffect } from './core';

/** The AudioWorklet processor's registered name (`worklet.ts`). */
export const PUNCH_PROCESSOR = 'opxy-punch';
/** Instrument tracks: one stereo input and output each, in the same order. */
export const PUNCH_TRACKS = 8;

/** Main thread → processor. Frames are the context's sample frames. */
export type PunchMessage =
	| {
			readonly t: 'add';
			readonly track: number;
			readonly id: number;
			readonly effect: CoreEffect;
			readonly from: number;
			readonly to: number;
	  }
	| { readonly t: 'end'; readonly track: number; readonly id: number; readonly at: number }
	| { readonly t: 'grid'; readonly at: number; readonly origin: number; readonly step: number }
	| { readonly t: 'clear' };
