/**
 * Frames the sample area draws (see `../types.ts`): plain data in the units the pages draw.
 * Waveforms are {@link Wave} strings (one base-36 digit per column), positions are 0–1 across
 * what the page shows, so a real recording can drive the same frames later.
 */
import type { LoopType, SampleSource, SliceMode } from './state';
import type { Wave } from './wave';

export type { Wave } from './wave';

/** Which record page the sample key opened (manual: sampler/sampling). */
export type RecordTarget = 'library' | 'sampler' | 'drum' | 'multisampler';

/**
 * The multisampler's keyboard (the record page's card, sample-100): the notes the 24 keys play at
 * the current octave, the selected key, where zones end and the selected zone (MIDI notes).
 */
export interface KeyboardView {
	readonly low: number;
	readonly high: number;
	readonly selected: number;
	/** The top note of every zone, ascending (a zone runs down to the previous zone's top). */
	readonly tops: readonly number[];
	/** The zone of the selected key, or null. */
	readonly zone: { readonly lo: number; readonly hi: number } | null;
}

/**
 * The record page (sample-003 synth sampler, sample-004 library, sample-017 drum sampler,
 * sample-100 multisampler): a prompt or the timer box, the sample's waveform on a white card, the
 * input source, gain, level meter and threshold at the right, soft keys along the bottom.
 */
export interface SampleRecordFrame {
	readonly page: 'sample-record';
	readonly target: RecordTarget;
	/** The top line: TE's prompt ("press key to sample", "press ● to record to file") or the timer. */
	readonly header: 'prompt' | 'timer';
	/** Time left, seconds and hundredths ("20:00", "13:52"). */
	readonly timer: string;
	/** Armed: waiting for the input to pass the threshold. */
	readonly armed: boolean;
	readonly recording: boolean;
	/** The sample's name above the card, or null. */
	readonly name: string | null;
	/** White for the key's own sample, light grey for the one a new take replaces. */
	readonly nameTone: 'white' | 'light';
	/** The card's waveform, one column per 2.07 px. */
	readonly wave: Wave;
	readonly source: SampleSource;
	/** The gain as shown ("+11"). */
	readonly gain: string;
	/** The input channel, shown in the gain's place while shift is held ("1+2"), else null. */
	readonly channel: string | null;
	/** The input level, 0–1 of the meter. */
	readonly level: number;
	/** The threshold, 0–1 of the meter. */
	readonly threshold: number;
	/**
	 * Soft keys: M1's record dot (`record`); M2 plays the take (`play`, null when the page has no
	 * play key) or steps to the previous key (`arrows`, with M3 for the next); M4 clears (null when
	 * absent). True = available.
	 */
	readonly soft: {
		readonly record: boolean;
		readonly play: boolean | null;
		readonly arrows: boolean;
		readonly clear: boolean | null;
	};
	/** The multisampler's keyboard under the waveform, else null. */
	readonly keyboard: KeyboardView | null;
}

/** One slice point on the slicer, 0–1 across the view. */
export interface SliceMarker {
	readonly at: number;
	/** An edge of the slice being edited. */
	readonly selected: boolean;
}

/**
 * The slicer (sample-076/080 transient, sample-087 even, sample-094 tap): the mode and slice count,
 * the key's sample over the whole screen with a marker per slice point; the part already played is
 * white, the rest grey.
 */
export interface SampleSliceFrame {
	readonly page: 'sample-slice';
	readonly mode: SliceMode;
	/** The count at the top right ("3"). */
	readonly count: string;
	/** The waveform, one column per 6.21 px, three times the lanes' height. */
	readonly wave: Wave;
	readonly markers: readonly SliceMarker[];
	/** Where playback is, 0–1 across the view, or null when nothing plays (all white). */
	readonly playhead: number | null;
}

/** A list column of the library: the rows on screen, the selected row and the scroll thumb. */
export interface LibraryColumn {
	readonly items: readonly string[];
	/** Row of the selection among `items`, or null. */
	readonly selected: number | null;
	/** The thumb's top and length, 0–1 of the scroll bar (length 1 = everything fits). */
	readonly thumb: { readonly top: number; readonly size: number };
}

/**
 * The sample library (sample-132, sample-140): the selected sample's waveform on a tile, the folders
 * beside the open one at the left, the open folder's samples and [sub folders] at the right; on the
 * drum sampler and multisampler, arrows and clear over M2–M4.
 */
export interface SampleLibraryFrame {
	readonly page: 'sample-library';
	readonly folders: LibraryColumn;
	readonly files: LibraryColumn;
	/** The selected sample's waveform (36 columns), or null when a folder is selected. */
	readonly tile: Wave | null;
	/** The previous / next key arrows and clear (drum sampler, multisampler). */
	readonly keyControls: boolean;
}

/**
 * What the M1 page of a sampler track adds to the core's drum frame (sample-025 synth sampler,
 * sample-056 drum sampler, sample-113 multisampler).
 */
export interface SamplerView {
	readonly engine: 'drum' | 'sampler' | 'multisampler';
	/** Left and right lanes, one column per 2.07 px, or null when the key or zone is empty. */
	readonly waves: readonly [Wave, Wave] | null;
	/** Loop points (0–1 of the sample), type and crossfade (0–1); null on the drum sampler. */
	readonly loop: {
		readonly start: number;
		readonly end: number;
		readonly type: LoopType;
		readonly crossfade: number;
	} | null;
	/** The note the synth sampler is tuned to, as its badge shows it ("G"). */
	readonly root: string;
	/** Multisampler: the selected zone on the key strip (MIDI notes), or null. */
	readonly zone: { readonly lo: number; readonly hi: number } | null;
}

/** Every frame of the sample area. */
export type SampleFrame = SampleRecordFrame | SampleSliceFrame | SampleLibraryFrame;
