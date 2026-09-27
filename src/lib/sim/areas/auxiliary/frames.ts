/**
 * Frames the auxiliary area draws (see `../types.ts`): plain data in the units the pages draw
 * (display strings, 0–1 positions). The effect list (shift + T7 / T8) reuses the core's list page.
 */
import type { SoftLabel } from '../../screen/draw';
import type { LfoFrame } from '../../screen/frame';
import type { AudioInput, FxType } from './state';

/** Brain, T1 M1 (guide art auxiliary-004, how-to-102). */
export interface AuxBrainFrame {
	readonly page: 'aux-brain';
	/** The key the routed tracks play in now: the root, moved by the brain note in force ("c lydian"). */
	readonly title: string;
	/** Automatic detection (else the key set by hand). */
	readonly auto: boolean;
	/** Root and scale ("c#", "lydian"). */
	readonly root: string;
	readonly scale: string;
	/** Linked instrument track ("06"), or null for none (a crossed box). */
	readonly link: string | null;
	/** Pitch classes 0–11 (c … b) dotted on the octave: the notes of the title's scale. */
	readonly notes: readonly boolean[];
}

/** Punch-in FX, T2 (auxiliary-021): TE's dot-matrix dog. */
export interface AuxPunchFrame {
	readonly page: 'aux-punch';
	/** Effects playing now, as keyboard keys 0–23 (held, or fired by the pattern while playing). */
	readonly active: readonly number[];
}

/** External MIDI, T3 M1 (auxiliary-031): channel, bank and program. */
export interface AuxMidiFrame {
	readonly page: 'aux-midi';
	readonly channel: string;
	/** Bank and program as shown, or null for none (a crossed box). */
	readonly bank: string | null;
	readonly program: string | null;
	readonly soft: readonly (SoftLabel | null)[];
}

/** One CC slot as a CC page shows it. */
export interface AuxCcSlot {
	/** The label above the box ("cc 74", "slot 1"). */
	readonly label: string;
	/** The big value ("64"), or null while the slot is off (a crossed box). */
	readonly value: string | null;
}

/** External MIDI, T3 M2 / M3: four CC slots (ours: no art). */
export interface AuxCcFrame {
	readonly page: 'aux-cc';
	readonly set: 'I' | 'II';
	/** Shift held: the slots' CC numbers instead of their values. */
	readonly shift: boolean;
	readonly slots: readonly AuxCcSlot[];
	readonly soft: readonly (SoftLabel | null)[];
}

/** External CV, T4 (auxiliary-057): the voltmeter. */
export interface AuxCvFrame {
	readonly page: 'aux-cv';
	/** The pitch voltage, −5…5 V (the needle). */
	readonly volts: number;
}

/** External audio, T5 M1 (auxiliary-064): input, drive, level and mix. */
export interface AuxAudioFrame {
	readonly page: 'aux-audio';
	readonly input: AudioInput;
	/** Whether the input is switched on (dimmed when off: ours). */
	readonly on: boolean;
	readonly drive: string;
	readonly level: string;
	readonly mix: string;
}

/** Tape, T6 M1 (auxiliary-099). */
export interface AuxTapeFrame {
	readonly page: 'aux-tape';
	/** Pitch ("X2"), speed ("84"), loop length ("3") and mix ("72") as shown. */
	readonly pitch: string;
	readonly speed: string;
	readonly length: string;
	readonly mix: string;
	/** Hits of the routed tracks on the tape loop, 0–1 along the strip. */
	readonly hits: readonly number[];
	/** The tape's play head, 0–1 along the strip. */
	readonly head: number;
	/** Keys playing clips now (0–23), and the last clip's number ("12", or "" before any). */
	readonly keys: readonly number[];
	readonly clip: string;
}

/** One effect parameter column. */
export interface AuxFxParam {
	readonly label: string;
	/** As shown under the column ("32", "micro"). */
	readonly value: string;
	/** 0–1: the bar's height in the column. */
	readonly level: number;
}

/** FX I / FX II, T7 / T8 M1 (auxiliary-130): the loaded effect's four parameters. */
export interface AuxFxFrame {
	readonly page: 'aux-fx';
	readonly slot: 'FX I' | 'FX II';
	readonly type: FxType;
	readonly params: readonly AuxFxParam[];
}

/** One instrument track on a routing page. */
export interface AuxRoute {
	readonly routed: boolean;
	/** 0–1 of the send (brain routing is all or nothing: 1). */
	readonly amount: number;
	/** As shown ("80"), or "" for the brain. */
	readonly value: string;
}

/** Routing, M2 of the brain, external audio, tape and the FX tracks (ours: no art). */
export interface AuxRouteFrame {
	readonly page: 'aux-route';
	/** What the tracks feed ("brain", "aux out", "tape", "FX I", "FX II"). */
	readonly target: string;
	/** Instrument tracks 1–8. */
	readonly tracks: readonly AuxRoute[];
	/** Which four the encoders reach: 0 = tracks 1–4, 1 = 5–8. */
	readonly half: 0 | 1;
}

/** High-pass and low-pass cutoffs, 0–1 along the frequency axis (50 Hz … 20 kHz). */
export interface AuxFilterView {
	readonly highpass: number;
	readonly lowpass: number;
}

/** The filter, M3 of external audio, tape and the FX tracks (ours: no art). */
export interface AuxFilterFrame extends AuxFilterView {
	readonly page: 'aux-filter';
}

/** M3 with shift: send cards over the dimmed filter (ours, after the instrument's sends). */
export interface AuxSendsFrame {
	readonly page: 'aux-sends';
	readonly filter: AuxFilterView;
	/** Aux out, tape, FX I, FX II by encoder ("50"), or null where the track has no such send. */
	readonly values: readonly (string | null)[];
}

/** The LFO, M4 of external MIDI, external audio, tape and the FX tracks (ours, after value). */
export interface AuxLfoFrame {
	readonly page: 'aux-lfo';
	readonly speed: LfoFrame['speed'];
	/** −100…100. */
	readonly amount: number;
	/** The track's modules the LFO can reach, and the chosen one. */
	readonly destinations: readonly string[];
	readonly destination: number;
	/** The modulated parameter's name (the fourth card's label) and its encoder (0–3). */
	readonly parameterName: string;
	readonly parameter: number;
	readonly soft: readonly (SoftLabel | null)[];
}

/** Every frame of the auxiliary area. */
export type AuxiliaryFrame =
	| AuxBrainFrame
	| AuxPunchFrame
	| AuxMidiFrame
	| AuxCcFrame
	| AuxCvFrame
	| AuxAudioFrame
	| AuxTapeFrame
	| AuxFxFrame
	| AuxRouteFrame
	| AuxFilterFrame
	| AuxSendsFrame
	| AuxLfoFrame;
