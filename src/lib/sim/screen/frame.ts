/**
 * What the screen shows, as plain data: the simulator produces a {@link ScreenFrame}, the renderer
 * draws it (`render.ts`), tests snapshot it, and the agent can read it. Values are already in the
 * units a page draws (0–1 positions, display strings), so pages stay pure drawing code.
 */
import type { AreaFrame } from '../areas/frames';
import type { SamplerView } from '../areas/sample/frames';
import type { HeaderCell, SoftLabel } from './draw';

/** Attack, decay and release as 0–1 of their segment's width; sustain as a 0–1 level. */
export interface Adsr {
	readonly attack: number;
	readonly decay: number;
	readonly sustain: number;
	readonly release: number;
}

/** Filter types (the names the device stores in presets). */
export type FilterType = 'svf' | 'ladder' | 'z lowpass' | 'z hipass';

/** The M3 filter's state, as the graph needs it. */
export interface FilterView {
	readonly type: FilterType;
	/** 0–1 across the graph's frequency axis (50 Hz … 20 kHz). */
	readonly cutoff: number;
	/** 0–1. */
	readonly resonance: number;
	/** −1…1: how far the filter envelope moves the cutoff. */
	readonly envAmount: number;
	/** 0–1. */
	readonly keyTracking: number;
}

/** The M2 envelopes. */
export interface EnvelopeView {
	readonly amp: Adsr;
	readonly filter: Adsr;
	/** Which envelope the encoders edit (click any encoder to swap). */
	readonly selected: 'amp' | 'filter';
}

/** The tempo page (press tempo anywhere). */
export interface TempoFrame {
	readonly page: 'tempo';
	/** Beats per minute as shown ("120", "120.5"). */
	readonly bpm: string;
	/** Two-letter groove name on the metronome ("SH" for shuffle, "--" for none). */
	readonly groove: string;
	/** Swing (+) / shuffle (−) amount, −1…1: the slider's thumb. */
	readonly swing: number;
	/** Metronome level 0–1 (how many sound waves) and whether it clicks (the jack's dot). */
	readonly metronome: { readonly level: number; readonly on: boolean };
	/** Beat within the bar (0–3), lit on the metronome's dots. */
	readonly beat: number;
	/** Pendulum position −1 (left) … 1 (right). */
	readonly pendulum: number;
}

/** A synth engine's M1 page: header plus the engine's illustration. */
export interface SynthFrame {
	readonly page: 'synth';
	readonly engine: string;
	readonly header: readonly HeaderCell[];
	/** The four parameters 0–1 (animates the illustration where it depends on them). */
	readonly params: readonly number[];
}

/** The drum sampler's M1 page for the selected key (shift: the second layer's header). */
export interface DrumFrame {
	readonly page: 'drum';
	/** Selected key, as shown ("F3"). */
	readonly key: string;
	/** Tune in semitones, as shown ("0.00", "−1.22"). */
	readonly tune: string;
	/** Sample start and end, 0–1 of the sample. */
	readonly start: number;
	readonly end: number;
	readonly playMode: string;
	/** Shift held: direction / pan / fade / gain header. */
	readonly shift: boolean;
	readonly reverse: boolean;
	/** −1…1. */
	readonly pan: number;
	/** 0–1 crossfade (the shaded wedge before the end marker). */
	readonly fade: number;
	/** 0–1. */
	readonly gain: number;
	/** Seeds the placeholder waveform (we have no sample audio). */
	readonly seed: number;
	/** The sample area's part: the lanes' waveforms, loop points, root key, zone (areas/sample). */
	readonly sampler?: SamplerView;
}

/** The midi engine's M1 page. */
export interface MidiFrame {
	readonly page: 'midi';
	readonly channel: string;
	/** Bank, or null for "none" (the crossed box). */
	readonly bank: string | null;
	readonly program: string;
}

/** M2: the amp and filter envelopes. */
export interface EnvelopeFrame extends EnvelopeView {
	readonly page: 'envelope';
}

/** Shift + M2: play mode cards over the dimmed envelopes. */
export interface PlayModeFrame {
	readonly page: 'playmode';
	readonly envelope: EnvelopeView;
	/** Display strings: "poly", "off", "1 semitone", "44". */
	readonly values: readonly [string, string, string, string];
}

/** M3: the filter graph. */
export interface FilterFrame extends FilterView {
	readonly page: 'filter';
	/** The filter is switched off: the page dims under "off" (M3 again switches it on). */
	readonly off?: boolean;
}

/** Shift + M3: send cards over the dimmed filter graph. */
export interface SendsFrame {
	readonly page: 'sends';
	readonly filter: FilterView;
	/** Aux out, tape, FX I, FX II as shown ("50"). */
	readonly values: readonly [string, string, string, string];
}

/** LFO types. */
export type LfoType = 'value' | 'random' | 'tremolo' | 'element' | 'duck';

/** M4: the LFO cards. */
export interface LfoFrame {
	readonly page: 'lfo';
	readonly type: LfoType;
	/** The LFO is switched off: the page dims under "off" (M4 again switches it on). */
	readonly off?: boolean;
	/** Speed: tempo-synced (division shown as a count) or free (the clock dial, 0–1). */
	readonly speed: { readonly synced: boolean; readonly label: string; readonly position: number };
	/** Amount −100…100 (the ruler's pointer); tremolo uses it for vibrato. */
	readonly amount: number;
	/** Tremolo's volume depth −100…100. */
	readonly volume: number;
	/** Destination module (syn, filter, env, …) and whether it is the free-running variant. */
	readonly destination: { readonly label: string; readonly free: boolean };
	/** Label of the fourth card (TE's art: hold, res, mode). */
	readonly fourth: string;
	/** Which encoder of the destination page is modulated (0–3): the knob's cap colour. */
	readonly parameter: number;
	/** Duck: the track that triggers it ("4", or "metronome"); element: the sensor's letter ("G"). */
	readonly source?: string;
	/** Duck: whether the trigger is the track's audio (else its notes). */
	readonly sourceAudio?: boolean;
	/** Element: where its source sits in the list of four, 0–1 (the gap in the card's rule). */
	readonly sourceAt?: number;
	/** Random and tremolo: the envelope, −1 (fades the modulation out) … 1 (fades it in); 0 none. */
	readonly envelope?: number;
}

/** One mixer strip. */
export interface MixStrip {
	/** Level 0–1: the bar's height. */
	readonly level: number;
	/** −1…1 (shown under the selected strip). */
	readonly pan: number;
	readonly muted: boolean;
	/** Momentary output 0–1: the bar's thickness. */
	readonly meter: number;
}

/** Mix M1: levels, pans and sends of eight tracks. */
export interface MixFrame {
	readonly page: 'mix';
	readonly bank: 'instrument' | 'auxiliary';
	readonly strips: readonly MixStrip[];
	/** 0–7. */
	readonly selected: number;
}

/** The project page. */
export interface ProjectFrame {
	readonly page: 'project';
	readonly name: string;
	/** System usage indicators (shown only past their thresholds). */
	readonly usage: { readonly voices: boolean; readonly cpu: boolean; readonly memory: boolean };
	readonly soft: readonly (SoftLabel | null)[];
}

/** Multi-out modes (COM, light grey encoder). */
export type MultiOutMode = 'midi' | 'cv/gate' | 'sync8' | 'sync16' | 'sync24' | 'audio';

/** The COM page. */
export interface ComFrame {
	readonly page: 'com';
	/** Bluetooth MIDI advertising (the "adv" badge). */
	readonly advertising: boolean;
	readonly multiOut: MultiOutMode;
	readonly charging: boolean;
}

/** A three-column list page (settings, browsers, engine select). */
export interface ListFrame {
	readonly page: 'list';
	readonly columns: readonly {
		readonly items: readonly string[];
		readonly selected: number | null;
		readonly style: 'outline' | 'dark' | 'white';
		readonly x: number;
		readonly width: number;
	}[];
	readonly soft: readonly (SoftLabel | null)[];
}

/** Anything we have not drawn yet: a title and lines of text, honestly labelled. */
export interface TextFrame {
	readonly page: 'text';
	readonly title: string;
	readonly lines: readonly string[];
}

/** Every page the renderer draws: the core's, then the areas' (`../areas/`). */
export type ScreenFrame =
	| AreaFrame
	| TempoFrame
	| SynthFrame
	| DrumFrame
	| MidiFrame
	| EnvelopeFrame
	| PlayModeFrame
	| FilterFrame
	| SendsFrame
	| LfoFrame
	| MixFrame
	| ProjectFrame
	| ComFrame
	| ListFrame
	| TextFrame;

/** Page names. */
export type PageName = ScreenFrame['page'];
