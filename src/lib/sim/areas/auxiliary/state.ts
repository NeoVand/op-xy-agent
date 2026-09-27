/**
 * The auxiliary area's part of the simulator state (see `../types.ts`): what the eight auxiliary
 * tracks remember beyond their mixer strips and patterns, which the core keeps in `SimState.aux`.
 * Plain, serialisable data. Parameters, ranges and defaults follow our manual (auxiliary/*, fx/*);
 * where it is silent they follow the community's project-file notes (docs/research/10-xy-format.md
 * §3.11, 20-midi-control.md §3.5), and where both are silent they are ours and say so.
 */

/** Key names as the brain shows them ("c#": lowercase, sharps). */
export const KEYS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;

/**
 * The brain's seven scales in the order the device stores them (manual: auxiliary/brain), each as
 * semitones above the root.
 */
export const SCALES = [
	{ name: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
	{ name: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
	{ name: 'phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
	{ name: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
	{ name: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
	{ name: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
	{ name: 'locrian', steps: [0, 1, 3, 5, 6, 8, 10] }
] as const;

/** What the brain stores per pattern (manual: settings since 1.0.25, routing since 1.0.29). */
export interface BrainSettings {
	/** Automatic key detection; false = the key and scale set by hand (manual). */
	auto: boolean;
	/** Root, 0–11 (c … b). */
	key: number;
	/** Index into {@link SCALES}. */
	scale: number;
	/** The instrument track (0–7) linked to riff over the song, or null. */
	link: number | null;
	/** Instrument tracks routed in: transposed, and listened to for detection. */
	routes: boolean[];
}

/** The brain (T1). */
export interface BrainState {
	/** Settings by pattern of the brain track; a pattern without its own follows the first. */
	patterns: BrainSettings[];
	/** The last note played on the brain's keyboard: the transposition in force, or null. */
	note: number | null;
}

/** One of the external MIDI track's eight CC slots (manual: auxiliary/external-midi). */
export interface CcSlot {
	/** CC number 0–127, or null while the slot is off. */
	cc: number | null;
	/** Value sent, 0–127. */
	value: number;
}

/** The external MIDI track (T3). */
export interface MidiState {
	/** Channel 1–16. */
	channel: number;
	/** Bank and program 1–128, or null for none (nothing sent); the community notes 129 steps. */
	bank: number | null;
	program: number | null;
	/** Slots 1–4 on M2 (set I), 5–8 on M3 (set II). */
	slots: CcSlot[];
}

/** Inputs of the external audio track, in E1's order (manual: auxiliary/external-audio). */
export const AUDIO_INPUTS = ['mic', 'headset', 'audio input', 'usb audio', 'main output'] as const;
export type AudioInput = (typeof AUDIO_INPUTS)[number];

/** The external audio track (T5). */
export interface AudioState {
	/** Index into {@link AUDIO_INPUTS}. */
	input: number;
	/** Whether the input is switched on (E1 click; the how-to switches it on after choosing). */
	on: boolean;
	/** Preamp drive, input level, and how much of the routed tracks returns to the main mix, 0–99. */
	drive: number;
	level: number;
	mix: number;
}

/** The tape track (T6). */
export interface TapeState {
	/** Pitch as a speed multiple, 1–10 ("X1" … "X10"; community notes: x1 default). */
	pitch: number;
	/** Speed in percent, 50–200 (100 default). */
	speed: number;
	/** Loop length, 1–10 (1 default); we read it as beats. */
	length: number;
	/** Tape against the original audio, 0–99 (0 default); TE's art labels it "dry". */
	mix: number;
	/** The keyboard key (0–23) that played the last clip, or null. */
	clip: number | null;
}

/** The six send effects, in the order the effect list shows them (manual: fx/overview). */
export const FX_TYPES = ['chorus', 'delay', 'distortion', 'lofi', 'phaser', 'reverb'] as const;
export type FxType = (typeof FX_TYPES)[number];

/** Each effect's four M1 parameters, E1 … E4, with TE's names (manual: fx/*). */
export const FX_PARAMS: Readonly<Record<FxType, readonly [string, string, string, string]>> = {
	chorus: ['rate', 'depth', 'feedback', 'stereo'],
	delay: ['size', 'amount', 'fine', 'dry'],
	distortion: ['drive', 'amount', 'low cut', 'high cut'],
	lofi: ['rate', 'bits', 'quality', 'drift'],
	phaser: ['frequency', 'depth', 'rate', 'feedback'],
	reverb: ['size', 'modulation', 'rate', 'feedback']
};

/**
 * The delay's size in eight steps. The manual names only the ends (micro … insane); the steps
 * between show their number (ours).
 */
export const DELAY_SIZES = ['micro', '2', '3', '4', '5', '6', '7', 'insane'] as const;

/** One FX slot (T7 FX I, T8 FX II). */
export interface FxSlot {
	type: FxType;
	/** E1 … E4, 0–99; the delay's size is a step 0–7 of {@link DELAY_SIZES}. */
	params: [number, number, number, number];
}

/** An aux track's LFO (M4): speed, amount, destination module and its parameter (encoder). */
export interface AuxLfo {
	/** Synced steps first, then the free range (as the instrument LFO's speed). */
	speed: number;
	/** −99…99. */
	amount: number;
	/** Index into the track's destination modules. */
	destination: number;
	/** The encoder (0–3) of the destination page. */
	parameter: number;
}

/** The pages several aux tracks share (manual: auxiliary/routing-filter-lfo). */
export interface AuxPages {
	/** M3: high-pass and low-pass cutoffs, 0–99. */
	highpass: number;
	lowpass: number;
	/** M3 with shift: sends to aux out, tape, FX I, FX II, 0–99 (only those the track has). */
	sends: [number, number, number, number];
	lfo: AuxLfo;
	/** M2: which instrument tracks the encoders reach, 1–4 (0) or 5–8 (1). */
	half: 0 | 1;
}

/**
 * A punch-in effect being recorded with `shift + key` from an instrument track: the step it landed
 * on, its note, and where it started (in the punch-in pattern's steps), so it gets its length when
 * the key comes up.
 */
export interface PunchTake {
	index: number;
	note: number;
	start: number;
}

/** What the auxiliary area remembers. */
export interface AuxiliaryState {
	brain: BrainState;
	midi: MidiState;
	audio: AudioState;
	tape: TapeState;
	/** FX I and FX II. */
	fx: [FxSlot, FxSlot];
	/** Filter, sends, LFO and routing page of each aux track, by track (used where it has them). */
	pages: AuxPages[];
	/** The effect list shift + T7 / T8 opens: the slot and the highlighted effect, or null. */
	picker: { slot: 0 | 1; index: number } | null;
	/** Punch-in effects being recorded from instrument tracks, by keyboard key id. */
	punchTakes: Record<string, PunchTake>;
}

/**
 * The brain in a new project: automatic detection, c major, nothing linked, tracks 3–8 routed and
 * the drum tracks 1–2 not (manual: auxiliary/brain).
 */
export function defaultBrain(): BrainSettings {
	return {
		auto: true,
		key: 0,
		scale: 0,
		link: null,
		routes: [0, 1, 2, 3, 4, 5, 6, 7].map((t) => t >= 2)
	};
}

/**
 * A fresh effect. The manual gives no defaults; ours sit mid-range, with the delay at its middle
 * size.
 */
export function defaultFx(type: FxType): FxSlot {
	return { type, params: type === 'delay' ? [3, 50, 50, 50] : [50, 50, 50, 50] };
}

/** The auxiliary area's state in a new project (FX I runs the delay, FX II the reverb). */
export function initialAuxiliary(): AuxiliaryState {
	return {
		brain: { patterns: [defaultBrain()], note: null },
		midi: {
			channel: 1,
			bank: null,
			program: null,
			slots: Array.from({ length: 8 }, () => ({ cc: null, value: 0 }))
		},
		// the community's project-file notes: drive 0, input level 75, mix 99, input off
		audio: { input: 0, on: false, drive: 0, level: 75, mix: 99 },
		tape: { pitch: 1, speed: 100, length: 1, mix: 0, clip: null },
		fx: [defaultFx('delay'), defaultFx('reverb')],
		pages: Array.from({ length: 8 }, () => ({
			highpass: 0,
			lowpass: 99,
			sends: [0, 0, 0, 0],
			lfo: { speed: 3, amount: 0, destination: 0, parameter: 0 },
			half: 0
		})),
		picker: null,
		punchTakes: {}
	};
}

/** The brain settings of a pattern of the brain track (read only). */
export function brainSettings(aux: AuxiliaryState, pattern: number): BrainSettings {
	return aux.brain.patterns[pattern] ?? aux.brain.patterns[0];
}

/**
 * The brain settings of a pattern, for editing: a pattern without its own gets a copy of the
 * first's (plain copies: the state may be a reactive proxy).
 */
export function editBrain(aux: AuxiliaryState, pattern: number): BrainSettings {
	const list = aux.brain.patterns;
	while (list.length <= pattern) {
		const first = list[0];
		list.push({ ...first, routes: [...first.routes] });
	}
	return list[pattern];
}
