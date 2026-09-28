/**
 * Frames the auxiliary area draws (see `../types.ts`): plain data in the units the pages draw
 * (display strings, 0–1 positions), holding what the device's screen shows on OS 1.1.33
 * (docs/research/59-screen-profiling.md §2.13).
 */
import type { LfoFrame } from '../../screen/frame';
import type { AudioInput } from './state';

/** Brain, T1 M1 (guide art auxiliary-004, how-to-102; the device). */
export interface AuxBrainFrame {
	readonly page: 'aux-brain';
	/** The key the routed tracks play in now: the root, moved by the brain note in force ("c lydian"). */
	readonly title: string;
	/** Automatic detection (else the key set by hand, shown in the root and scale boxes). */
	readonly auto: boolean;
	/** Root and scale as the device writes them ("c#", "mixo"). */
	readonly root: string;
	readonly scale: string;
	/** Linked instrument track ("06"), or null for none (a crossed box). */
	readonly link: string | null;
	/** Pitch classes 0–11 (c … b) dotted on the octave: the notes of the title's scale. */
	readonly notes: readonly boolean[];
}

/**
 * Punch-in FX, T2: the dot matrix of TE's art (auxiliary-021), as the device fills it (research 59
 * §2.13): a heartbeat trace while idle, a picture from the effect's animation while one plays.
 */
export interface AuxPunchFrame {
	readonly page: 'aux-punch';
	/** Effects playing now, as keyboard keys 0–23 (held, or fired by the pattern while playing). */
	readonly active: readonly number[];
	/** The key whose effect's picture fills the matrix (the one pressed last), or null for none. */
	readonly picture: number | null;
	/**
	 * The heartbeat's dot (column 0–39, row 0–17 of the matrix) while no effect plays, or null while
	 * one plays or the dot is between loops, off the screen.
	 */
	readonly beat: { readonly col: number; readonly row: number } | null;
}

/** External MIDI, T3 M1 (auxiliary-031; the device): channel, bank and program. */
export interface AuxMidiFrame {
	readonly page: 'aux-midi';
	/** Two digits ("01" … "16"). */
	readonly channel: string;
	/** Bank and program as shown ("1" … "128"), or null for none (a crossed box). */
	readonly bank: string | null;
	readonly program: string | null;
}

/** One CC slot as a CC page shows it. */
export interface AuxCcSlot {
	/** The CC number it sends, or null while the slot is off ("off" under a crossed box). */
	readonly cc: number | null;
	/** The value it sends, 0–127, as shown in the box. */
	readonly value: string;
}

/** External MIDI, T3 M2 / M3 (the device, frames b1-4103…4159): four CC slots. */
export interface AuxCcFrame {
	readonly page: 'aux-cc';
	/** Which four of the eight slots: set I (M2, slots 1–4) or set II (M3, slots 5–8). */
	readonly set: 'I' | 'II';
	readonly slots: readonly AuxCcSlot[];
}

/** External CV, T4 (auxiliary-057; the device): the voltmeter. */
export interface AuxCvFrame {
	readonly page: 'aux-cv';
	/** The pitch voltage, −5…5 V (the needle). */
	readonly volts: number;
}

/** External audio, T5 M1 (auxiliary-064; the device): input, drive, level and mix. */
export interface AuxAudioFrame {
	readonly page: 'aux-audio';
	readonly input: AudioInput;
	/** Whether the input is switched on (off: the card crossed in red, "fdbk block" over a mic). */
	readonly on: boolean;
	/** Drive "00"–"20", level and mix "00"–"99". */
	readonly drive: string;
	readonly level: string;
	readonly mix: string;
}

/** Tape, T6 M1 (auxiliary-099; the device, research 59 §2.13). */
export interface AuxTapeFrame {
	readonly page: 'aux-tape';
	/** Pitch as a speed multiple ("x2"), speed in percent ("84"), loop length ("3"), mix ("72"). */
	readonly pitch: string;
	readonly speed: string;
	readonly length: string;
	readonly mix: string;
	/** Hits of the routed tracks on the tape loop, 0–1 along the strip. */
	readonly hits: readonly number[];
	/** The tape's play head, 0–1 along the strip. */
	readonly head: number;
	/** Keys playing clips now (0–23). */
	readonly keys: readonly number[];
}

/** One effect parameter column. */
export interface AuxFxParam {
	readonly label: string;
	/** As shown under the column ("32", "1/8 dotted"). */
	readonly value: string;
	/** 0–1: the marker's height in the column. */
	readonly level: number;
}

/** FX I / FX II, T7 / T8 M1 (auxiliary-130; the device, research 59 §2.13): four parameters. */
export interface AuxFxFrame {
	readonly page: 'aux-fx';
	readonly slot: 'FX I' | 'FX II';
	/** The loaded effect as the screen names it ("dist" for the distortion). */
	readonly type: string;
	readonly params: readonly AuxFxParam[];
}

/** The effect list, `shift + T7 / T8` (the device's, like the player list). */
export interface AuxFxListFrame {
	readonly page: 'aux-fx-list';
	/** The FX track's number as the device counts tracks ("15" for FX I). */
	readonly track: string;
	/** The six effects as the list writes them, and the highlighted one. */
	readonly items: readonly string[];
	readonly selected: number;
}

/** One instrument track on a routing page. */
export interface AuxRoute {
	readonly routed: boolean;
	/** 0–1 of the send (brain routing is all or nothing: 1). */
	readonly amount: number;
	/** As shown ("80"; "0" for none), or "" for the brain. */
	readonly value: string;
}

/**
 * Routing, M2 of the brain, external audio, tape and the FX tracks (the device's brain and
 * external audio pages; tape and FX ours after them).
 */
export interface AuxRouteFrame {
	readonly page: 'aux-route';
	/** What the tracks feed ("brain", "aux out", "tape", "FX I", "FX II"). */
	readonly target: string;
	/** Instrument tracks 1–8. */
	readonly tracks: readonly AuxRoute[];
	/** Which four the encoders reach: 0 = tracks 1–4, 1 = 5–8. */
	readonly half: 0 | 1;
}

/** High-pass and low-pass cutoffs, 0–1 of their lanes. */
export interface AuxFilterView {
	readonly highpass: number;
	readonly lowpass: number;
}

/** The filter, M3 of external audio, tape and the FX tracks (the device's external audio page). */
export interface AuxFilterFrame extends AuxFilterView {
	readonly page: 'aux-filter';
	/** Switched off (a new project's): the page dims under "off"; M3 again switches it on. */
	readonly off: boolean;
}

/** M3 with shift: send cards over the dimmed filter (after the device's instrument sends). */
export interface AuxSendsFrame {
	readonly page: 'aux-sends';
	readonly filter: AuxFilterView;
	/**
	 * Aux out, tape, FX I, FX II by encoder ("50"; the page writes "00" as "no send"), or null where
	 * the track has no such send.
	 */
	readonly values: readonly (string | null)[];
}

/** One card of the LFO's destination column. */
export type AuxLfoDestination = 'syn' | 'filter' | 'amp' | 'off' | 'cc1' | 'cc2';

/** The LFO, M4 of external MIDI, external audio, tape and the FX tracks (the device's value LFO). */
export interface AuxLfoFrame {
	readonly page: 'aux-lfo';
	/** Switched off (a new project's): the page dims under "off"; M4 again switches it on. */
	readonly off: boolean;
	readonly speed: LfoFrame['speed'];
	/** −100…100. */
	readonly amount: number;
	/** The column of destinations the LFO can reach, and the chosen one (the middle row). */
	readonly destinations: readonly AuxLfoDestination[];
	readonly destination: number;
	/** The modulated parameter's name, over the fourth card ("hi pass", "cc 9", "no cc set"). */
	readonly parameterName: string;
	/** The encoder (0–3) of that parameter: the knob cap's grey. */
	readonly parameter: number;
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
	| AuxFxListFrame
	| AuxRouteFrame
	| AuxFilterFrame
	| AuxSendsFrame
	| AuxLfoFrame;
