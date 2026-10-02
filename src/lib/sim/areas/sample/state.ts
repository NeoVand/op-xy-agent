/**
 * The sample area's part of the simulator state (see `../types.ts`): plain, serialisable data. It
 * holds what every sampler engine of every track has loaded (the drum sampler's 24 keys, the synth
 * sampler's sample and region, the multisampler's zones), the record page, the slicer, the library
 * browser and the recordings saved to the library's user folder. The drum sampler's per-key
 * settings stay in the core's `DrumKey` (params.ts); loop points and zones are new here.
 *
 * Samples are {@link SampleFile}s: a stable `id` (the handle a sound engine keys its audio buffer
 * by), a name, a length, a seed for the stand-in waveform, and measured `peaks` once audio exists
 * (a simulated recording, or a real file a sound engine decoded).
 */
import type { DrumKey } from '../../params';
import { hashSeed, type Peaks } from './wave';

/** Input sources of the recorder, in E1's order (manual: sampler/sampling). */
export const SOURCES = ['mic', 'line in', 'usb'] as const;
export type SampleSource = (typeof SOURCES)[number];

/**
 * Input channels of the sources that have them (shift + E1; manual: line in and USB only). The
 * names are ours: the guide does not list them.
 */
export const CHANNELS: Readonly<Record<SampleSource, readonly string[]>> = {
	mic: [],
	'line in': ['1+2', '1', '2'],
	usb: ['1+2', '3+4', '1', '2', '3', '4']
};

/** Loop types of the synth sampler and multisampler (shift + click E3; manual: synth-sampler). */
export const LOOP_TYPES = ['forever', 'release', 'off'] as const;
export type LoopType = (typeof LOOP_TYPES)[number];

/** Slicer modes in E1's order (manual: sampler/slicing). */
export const SLICE_MODES = ['transient', 'even', 'tap'] as const;
export type SliceMode = (typeof SLICE_MODES)[number];

/** The longest sample any sampler records (manual: sampler/sampling). */
export const MAX_SECONDS = 20;
/** Drum keys, multisampler zones and slices: one per keyboard key. */
export const KEYS = 24;
/** MIDI note of the keyboard's first key (F3) at octave 0. */
export const FIRST_NOTE = 53;

/** A drum key's sound from its file's name: "kick 1.wav" → "kick 1", a made kit's "53 kick.wav" → "kick". */
export const soundName = (file: string) =>
	file.replace(/\.(wav|aiff?)$/i, '').replace(/^\d+\s+/, '');

/**
 * The key (0–23) a sound's name means, as an agent or a user says it: the name ("kick 1"), the name
 * without its number ("open hat" for the lowest "open hat 1"), or what the sound is ("kick" for a
 * made kit's "808 kick", "808 kick" for a new project's "kick 1"); a number the kit does not name
 * counts that kind's keys, low to high ("conga 2" for the "high conga 1" above "low conga 1"; both
 * congas once landed on the low one); null for none. `sounds` are the keys' sound names in key order,
 * null for an empty key. The pattern grid and the key planner both find keys this way (the planner
 * once refused "open hat", which the grid took).
 */
export function soundKeyOf(sounds: readonly (string | null)[], wanted: string): number | null {
	const lower = wanted.trim().toLowerCase();
	const named = sounds.flatMap((name, at) => (name ? [{ at, name: name.toLowerCase() }] : []));
	const bare = (name: string) => name.replace(/\s+\d+$/, '');
	const ends = (name: string, word: string) => bare(name).endsWith(` ${word}`);
	const unstyled = bare(lower).replace(/^\S+\s+(?=\S)/, '');
	const nth = Number(/\s(\d+)$/.exec(lower)?.[1] ?? 0);
	const kind = named.filter((x) => bare(x.name) === bare(lower) || ends(x.name, bare(lower)));
	// the number counts the kind first where the kit has several of it (a made kit names both its
	// kicks "kick", and "kick 2" found the first)
	return (
		named.find((x) => x.name === lower)?.at ??
		(nth >= 1 && kind.length > 1 ? kind[nth - 1]?.at : undefined) ??
		named.find((x) => x.name === bare(lower))?.at ??
		named.find((x) => bare(x.name) === lower)?.at ??
		named.find((x) => ends(x.name, bare(lower)))?.at ??
		named.find((x) => bare(x.name) === unstyled)?.at ??
		null
	);
}

/** A sample file: what a key, zone or the synth sampler holds, and what the library lists. */
export interface SampleFile {
	/** Stable id: the handle a sound engine keys the audio buffer by. */
	id: string;
	/** File name as the screen shows it ("ch mart b.wav"). */
	name: string;
	/** Library folder it lives in ("drum", "user"). */
	folder: string;
	/** Length in seconds. */
	seconds: number;
	/** Seeds the stand-in waveform while no audio is attached. */
	seed: number;
	/** Measured peaks (a simulated recording, or audio a sound engine decoded), else null. */
	peaks: Peaks | null;
	/** Root note (MIDI) from the file's metadata or name, when it has one. */
	root: number | null;
	/**
	 * Where the file lives, as a project file names it (a loaded `.xy`): `/fat32/presets/…` or
	 * `/fat32/samples/…` on the OP-XY's drive, `content/samples/…` in its factory library. The id is
	 * this path, so the audio read from the device (`app/device-samples`) finds every copy.
	 */
	path?: string;
}

/**
 * The settings of a synth sampler's sample or a multisampler zone (manual: synth-sampler,
 * multisampler). Points are 0–1 of the sample; loop start at the end means no loop.
 */
export interface Region {
	start: number;
	loopStart: number;
	loopEnd: number;
	end: number;
	loop: LoopType;
	/** Loop crossfade 0–75 %: the share of the loop it covers (the device draws it so and stops at 75). */
	crossfade: number;
	/** Semitones, −48…48 in hundredths (shown like the drum sampler's tune; `m1.ts` TUNE_RANGE). */
	tune: number;
	/** −30…20 dB. */
	gain: number;
	reverse: boolean;
}

/** A multisampler zone: the note it was recorded on (the zone's top key) and its sample. */
export interface Zone {
	note: number;
	file: SampleFile;
	region: Region;
}

/** What one track's sampler engines hold (whichever engine the track runs uses its part). */
export interface SamplerTrack {
	/** Drum sampler: one sample per keyboard key, F3…E5 (null = empty). */
	keys: (SampleFile | null)[];
	/** Synth sampler: its sample, root note (MIDI) and region. */
	synth: { file: SampleFile | null; root: number; region: Region };
	/** Multisampler: up to 24 zones, ascending by note. */
	zones: Zone[];
	/** Drum keys selected together with key + M4 (one edit changes them all). */
	selection: number[];
}

/** The record page (the sample key). */
export interface RecordState {
	source: SampleSource;
	/** Index into {@link CHANNELS} of the source. */
	channel: number;
	/** Input gain in dB (E3), −24…24. */
	gain: number;
	/** 0–99: the level the recorder waits for (E4). */
	threshold: number;
	/** The input meter now, 0–1. */
	level: number;
	/** The area's clock (ms): time passing on the page; the stand-in input plays on it. */
	clock: number;
	/** The control holding the recorder armed (key.m1, or a keyboard key on the synth sampler). */
	trigger: string | null;
	/** When it was armed: the context clock (ms) and the area clock (ms). */
	armedAt: number;
	armedClock: number;
	/** How long it has been armed by the area clock (ms). */
	held: number;
	/**
	 * The keyboard key (0–23) the take goes to: the drum or multisampler key, or the key that
	 * becomes the synth sampler's root; −1 keeps the synth sampler's root.
	 */
	key: number;
	/** The last take of the library record page (M2 plays it, M4 deletes it), else null. */
	take: SampleFile | null;
	/** M2 is playing the take (the sound engine's cue; the screen does not change). */
	playing: boolean;
	/** How far that playback got (ms); it ends at the take's length. */
	played: number;
}

/** Playback on the slicer: the span (0–1 of the region) and where it is now. */
export interface SlicePlay {
	from: number;
	to: number;
	position: number;
	/** Context clock (ms) when it started, for taps that arrive without time passing. */
	startedAt: number;
}

/** The slicer (key + M1 on a drum sampler key; manual: sampler/slicing). */
export interface SlicerState {
	/** The drum key whose sample is sliced (0–23). */
	key: number;
	mode: SliceMode;
	/** Slices wanted in transient and even mode (E4), 1–24. */
	counts: { transient: number; even: number };
	/** Even mode's section, 0–1 of the key's region (E2, E3). */
	section: { start: number; end: number };
	/** Tap mode: slice points tapped so far, 0–1 of the region, ascending. */
	taps: number[];
	/** Tap mode: M2 stopped the tapping, so the last slice runs to the end. */
	extended: boolean;
	/** Transient mode: slices whose edges were moved (E2, E3), by index. */
	edits: { index: number; start: number; end: number }[];
	/** The slice being edited (its keyboard key), else null. */
	selected: number | null;
	play: SlicePlay | null;
}

/** The library browser (shift + sample; manual: sampler/sample-library). */
export interface LibraryState {
	/** Folder indices from the top down to the open folder (the right column shows its content). */
	path: number[];
	/** Selected entry of the open folder. */
	item: number;
	/** A sample is previewing (it plays when selected; stop ends it). */
	previewing: boolean;
}

/** Which page of the area the sample overlay shows. */
export type SamplePage = 'record' | 'library' | 'slicer';

/** What the sample area remembers. */
export interface SampleState {
	page: SamplePage;
	tracks: SamplerTrack[];
	record: RecordState;
	slicer: SlicerState | null;
	library: LibraryState;
	/** Recordings saved to the library's user folder, oldest first. */
	user: SampleFile[];
	/** Takes recorded so far (numbers the next one). */
	takes: number;
	/** The keyboard's octave as the sampler pages assume it (− and +), −4…4. */
	octave: number;
	/** The drum key copied with key + M2: its sample and settings. */
	clipboard: { file: SampleFile | null; settings: DrumKey } | null;
}

/** A sample file record (stand-in: no peaks). */
export function sampleFile(
	name: string,
	folder: string,
	seconds: number,
	seed = hashSeed(`${folder}/${name}`),
	root: number | null = null
): SampleFile {
	return { id: `${folder}/${name}`, name, folder, seconds, seed, peaks: null, root };
}

/**
 * A sample a project file names by path (a drum key's, the sampler's, a zone's): shown by its file
 * name, with the path as its id, so every key and zone holding that file shares one recording.
 */
export function projectSampleFile(
	path: string,
	seconds: number,
	root: number | null = null
): SampleFile {
	const slash = path.lastIndexOf('/');
	const name = path.slice(slash + 1) || path;
	const folder = slash > 0 ? path.slice(0, slash) : '';
	return { ...sampleFile(name, folder, seconds, hashSeed(path), root), id: path, path };
}

/**
 * Puts a zone into a multisampler's zones: it replaces the zone on the same note, else joins them
 * in note order while there is room for it (manual: multisampler "max").
 */
export function placeZone(zones: readonly Zone[], zone: Zone): Zone[] {
	if (zones.some((z) => z.note === zone.note)) {
		return zones.map((z) => (z.note === zone.note ? zone : z));
	}
	if (zones.length >= KEYS) return [...zones];
	return [...zones, zone].sort((a, b) => a.note - b.note);
}

/** A region: the whole sample, looping 20–80 % forever (the device's default after sampling). */
export function defaultRegion(): Region {
	return {
		start: 0,
		loopStart: 0.2,
		loopEnd: 0.8,
		end: 1,
		loop: 'forever',
		crossfade: 0,
		tune: 0,
		gain: 0,
		reverse: false
	};
}

/**
 * TE's factory kit layout, left to right (manual: sampler/drum-sampler "te-layout"), with a
 * plausible length per sound for the stand-ins.
 */
export const KIT: readonly (readonly [string, number])[] = [
	['kick', 0.6],
	['kick', 0.5],
	['snare', 0.5],
	['snare', 0.4],
	['rim', 0.2],
	['clap', 0.4],
	['tambourine', 0.6],
	['shaker', 0.3],
	['closed hat', 0.15],
	['closed hat', 0.2],
	['open hat', 0.9],
	['clave', 0.2],
	['low tom', 0.7],
	['ride', 2.2],
	['mid tom', 0.6],
	['crash', 2.4],
	['high tom', 0.5],
	['triangle', 1.8],
	['low conga', 0.5],
	['high conga', 0.4],
	['cowbell', 0.5],
	['guiro', 0.6],
	['metal', 1.2],
	['chi', 0.9]
];

/** Factory kit `kit` (0–7, the library's drum/kit 1 … kit 8): its 24 sounds, left to right. */
export function kitFiles(kit: number): SampleFile[] {
	const seen = new Map<string, number>();
	return KIT.map(([role, seconds]) => {
		const n = (seen.get(role) ?? 0) + 1;
		seen.set(role, n);
		return sampleFile(`${role} ${n}.wav`, `drum/kit ${kit + 1}`, seconds);
	});
}

/** A default multisample: four zones of a pad (A3, E4, B4, E5). */
function defaultZones(): Zone[] {
	return (
		[
			['a3', 57],
			['e4', 64],
			['b4', 71],
			['e5', 76]
		] as const
	).map(([name, note]) => ({
		note,
		file: sampleFile(`pad ${name}.wav`, 'pad', 2.4, undefined, note),
		region: defaultRegion()
	}));
}

/**
 * A track's sampler contents in a new project: kit n on the drum sampler (tracks 1 and 2 load
 * different kits), a keys sample on C4 for the synth sampler, a four-zone pad multisample.
 */
export function defaultSamplerTrack(track: number): SamplerTrack {
	return {
		keys: kitFiles(track),
		synth: {
			file: sampleFile('keys c4.wav', 'keys', 2.2, undefined, 60),
			root: 60,
			region: defaultRegion()
		},
		zones: defaultZones(),
		selection: []
	};
}

/** The record page before anything is set: the built-in microphone, no gain, a low threshold. */
export function defaultRecord(): RecordState {
	return {
		source: 'mic',
		channel: 0,
		gain: 0,
		threshold: 20,
		level: 0,
		clock: 0,
		trigger: null,
		armedAt: 0,
		armedClock: 0,
		held: 0,
		key: 0,
		take: null,
		playing: false,
		played: 0
	};
}

/** The sample area's state in a new project. */
export function initialSample(): SampleState {
	return {
		page: 'record',
		tracks: Array.from({ length: 8 }, (_, i) => defaultSamplerTrack(i)),
		record: defaultRecord(),
		slicer: null,
		library: { path: [0], item: 0, previewing: false },
		user: [],
		takes: 0,
		octave: 0,
		clipboard: null
	};
}
