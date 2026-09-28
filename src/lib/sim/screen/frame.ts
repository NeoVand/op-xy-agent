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
	/**
	 * Metronome level 0–1 and whether it is on (click E4): the speaker's sound waves show the level
	 * while it is on, none while it is off.
	 */
	readonly metronome: { readonly level: number; readonly on: boolean };
	/** Beat within the bar (0–3) while playing, its dot lit on the metronome; null when stopped. */
	readonly beat: number | null;
	/** Pendulum position −1 (left) … 1 (right); it rests at −1. */
	readonly pendulum: number;
	/** Where the weight sits on the rod: 0 at the top (40 BPM) … 1 at the bottom (220 BPM). */
	readonly weight: number;
}

/** A synth engine's M1 page: header plus the engine's illustration. */
export interface SynthFrame {
	readonly page: 'synth';
	readonly engine: string;
	readonly header: readonly HeaderCell[];
	/** The four parameters 0–1 (animates the illustration where it depends on them). */
	readonly params: readonly number[];
	/**
	 * Notes sounding on the track now (keys held, the pattern under the playhead, a player's): some
	 * pictures move only while they sound (prism's rays, dissolve's mosaic, hardsync's blocks).
	 */
	readonly notes?: number;
	/** Milliseconds since the latest of those notes began. */
	readonly onset?: number;
	/** Milliseconds since the last note stopped, while none sounds (what is lit fades out). */
	readonly release?: number;
	/** A clock (ms) that runs only while notes sound: what the sound pushes along moves with it. */
	readonly travel?: number;
	/** The parameters as drawn while they slide to new values (organ's drawbars), 0–1. */
	readonly shown?: readonly number[];
	/** The simulator's clock (ms) while the picture moves: the time its motion runs on. */
	readonly time?: number;
}

/**
 * The M1 page of the sampler engines (drum sampler: the selected key; synth sampler; multisampler:
 * the selected key's zone), with the shift layer's header while shift is held.
 */
export interface DrumFrame {
	readonly page: 'drum';
	/** Selected key, root or zone note ("F3", "F3 +2" with more keys selected; not drawn). */
	readonly key: string;
	/** Tune in semitones, as the device shows it ("+0.00", "–1.22"). */
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
	/** 0–1 of the 0–99 fade (drum sampler: the ramp from the start) or loop crossfade. */
	readonly fade: number;
	/** 0–1 of −30…+20 dB: the gain wedge's fill; it scales the drawn wave. */
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
	/** Aux out, tape, FX I, FX II ("50"; the page writes "no send" for "00", as the device does). */
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
	/**
	 * Label of the fourth card: the destination parameter's name (value, random, element: "cutoff",
	 * "attack", the engine's own), "env" on tremolo (device, 1.1.33).
	 */
	readonly fourth: string;
	/** Which encoder of the destination page is modulated (0–3): the knob's cap colour. */
	readonly parameter: number;
	/** Duck: the track that triggers it ("4", or "metronome"); element: the sensor's letter ("G"). */
	readonly source?: string;
	/** Duck: whether the trigger is the track's audio (else its notes). */
	readonly sourceAudio?: boolean;
	/**
	 * Random and tremolo: the envelope, −1…1 (the model's sign; the device draws low values as a
	 * rising line, the middle flat along the top, high values falling).
	 */
	readonly envelope?: number;
	/** Duck: hold and release, 0–1 (the pulse's length, the release's knee). */
	readonly hold?: number;
	readonly release?: number;
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
