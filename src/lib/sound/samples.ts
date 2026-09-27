/**
 * Recordings for the sampler engines, handed over by whatever captured or loaded them (the sampling
 * area, a dropped file, the agent) and read by the sound engine whenever a note plays: the synth
 * sampler's one sample per track, the multisampler's zones, and drum keys that replace the
 * synthesized kit. A sample is raw channel data or an AudioBuffer, so the registry needs no
 * AudioContext and can be filled before any sound has been made.
 *
 * @example
 * samples.setSample(2, { source: { sampleRate: 48000, channels: [take] }, root: 60 });
 * samples.setDrumKey(0, 0, { source: kickBuffer }); // T1's F3 plays the recording
 */
import { SoundError } from './errors';

/** Channel data at a sample rate (one channel is mono, two stereo). */
export interface SampleData {
	readonly sampleRate: number;
	readonly channels: readonly Float32Array[];
}

/** What a sample is made of. */
export type SampleSource = SampleData | AudioBuffer;

/** A recording and how to play it. */
export interface Sample {
	readonly source: SampleSource;
	/** The MIDI note it sounds at when played back unpitched (default 60, C4). */
	readonly root?: number;
	/** A loop (seconds into the sample) that repeats while the key is held. */
	readonly loop?: { readonly start: number; readonly end: number };
}

/** A multisampler zone: a sample and the notes it covers. */
export interface SampleZone extends Sample {
	readonly low: number;
	readonly high: number;
}

/** Instrument tracks and drum keys. */
const TRACKS = 8;
const DRUM_KEYS = 24;

function assertTrack(track: number): void {
	if (!Number.isInteger(track) || track < 0 || track >= TRACKS) {
		throw new SoundError(`instrument tracks are 0–${TRACKS - 1}, got ${track}`);
	}
}

function assertSample(sample: Sample): void {
	const { source } = sample;
	const frames = 'length' in source ? source.length : (source.channels[0]?.length ?? 0);
	const channels = 'numberOfChannels' in source ? source.numberOfChannels : source.channels.length;
	if (frames === 0 || channels === 0 || !(source.sampleRate > 0)) {
		throw new SoundError('a sample needs at least one channel with audio in it');
	}
	const root = sample.root ?? 60;
	if (!Number.isInteger(root) || root < 0 || root > 127) {
		throw new SoundError(`a sample's root note is 0–127, got ${root}`);
	}
	if (sample.loop && !(sample.loop.end > sample.loop.start && sample.loop.start >= 0)) {
		throw new SoundError('a loop must end after it starts');
	}
}

/** The samples of every instrument track. Create one per app (the sound module owns it). */
export class SampleRegistry {
	readonly #samples = new Map<number, Sample>();
	readonly #zones = new Map<number, readonly SampleZone[]>();
	readonly #drums = new Map<string, Sample>();
	readonly #listeners: ((track: number) => void)[] = [];

	/** Sets (or with null clears) the synth sampler's recording on `track` (0–7). */
	setSample(track: number, sample: Sample | null): void {
		assertTrack(track);
		if (sample) {
			assertSample(sample);
			this.#samples.set(track, sample);
		} else this.#samples.delete(track);
		this.#changed(track);
	}

	/** Sets the multisampler's zones on `track`; an empty list clears them. */
	setZones(track: number, zones: readonly SampleZone[]): void {
		assertTrack(track);
		for (const zone of zones) {
			assertSample(zone);
			if (!(zone.low <= zone.high)) throw new SoundError('a zone must cover at least one note');
		}
		if (zones.length > 0) this.#zones.set(track, [...zones]);
		else this.#zones.delete(track);
		this.#changed(track);
	}

	/**
	 * Puts a recording on drum key `key` (0 = F3 … 23 = E5) of `track`, in place of the synthesized
	 * kit sound; null brings the kit sound back.
	 */
	setDrumKey(track: number, key: number, sample: Sample | null): void {
		assertTrack(track);
		if (!Number.isInteger(key) || key < 0 || key >= DRUM_KEYS) {
			throw new SoundError(`drum keys are 0–${DRUM_KEYS - 1}, got ${key}`);
		}
		if (sample) {
			assertSample(sample);
			this.#drums.set(`${track}:${key}`, sample);
		} else this.#drums.delete(`${track}:${key}`);
		this.#changed(track);
	}

	/** The synth sampler's recording on `track`, if any. */
	sample(track: number): Sample | null {
		return this.#samples.get(track) ?? null;
	}

	/** The multisampler zone for `note` on `track`: the one covering it, else the nearest root. */
	zone(track: number, note: number): SampleZone | null {
		const zones = this.#zones.get(track);
		if (!zones || zones.length === 0) return null;
		const covering = zones.find((z) => note >= z.low && note <= z.high);
		if (covering) return covering;
		const distance = (z: SampleZone) => Math.abs((z.root ?? 60) - note);
		return zones.reduce((best, z) => (distance(z) < distance(best) ? z : best));
	}

	/** The recording on a drum key, if one replaces the kit sound. */
	drumKey(track: number, key: number): Sample | null {
		return this.#drums.get(`${track}:${key}`) ?? null;
	}

	/** Clears one track's samples, or every track's. */
	clear(track?: number): void {
		const tracks = track === undefined ? Array.from({ length: TRACKS }, (_, i) => i) : [track];
		for (const t of tracks) {
			assertTrack(t);
			this.#samples.delete(t);
			this.#zones.delete(t);
			for (let key = 0; key < DRUM_KEYS; key++) this.#drums.delete(`${t}:${key}`);
			this.#changed(t);
		}
	}

	/** Hears every change (the track it happened on). Returns `unsubscribe`. */
	onChange(listener: (track: number) => void): () => void {
		this.#listeners.push(listener);
		return () => {
			const at = this.#listeners.indexOf(listener);
			if (at >= 0) this.#listeners.splice(at, 1);
		};
	}

	#changed(track: number): void {
		for (const listener of [...this.#listeners]) listener(track);
	}
}
