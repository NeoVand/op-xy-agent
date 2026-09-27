/**
 * The audio of the simulator's sample files (manual: sampler). The simulator holds what every
 * sampler engine has loaded — each drum key's sample, the synth sampler's, the multisampler's
 * zones — as files with stable ids (`$lib/sim/areas/sample`); this registry holds the audio for
 * those ids, handed over by whatever captured or decoded it (a recorder, a dropped file, the
 * agent), and the sound engine reads it whenever a note plays. Copies of one file share its id,
 * so one recording serves every key and zone that holds it. A file without audio here plays the
 * synthesized kit (a drum key) or a soft tone (the synth samplers). Audio is raw channel data or
 * an AudioBuffer, so the registry needs no AudioContext and can be filled before any sound.
 *
 * @example
 * samples.setFile('drum/kit 1/kick 1.wav', kickBuffer); // every key holding it plays the recording
 * samples.setFile(take.id, { sampleRate: 48000, channels: [left, right] });
 */
import { SoundError } from './errors';

/** Channel data at a sample rate (one channel is mono, two stereo). */
export interface SampleData {
	readonly sampleRate: number;
	readonly channels: readonly Float32Array[];
}

/** What a sample file's audio is. */
export type SampleSource = SampleData | AudioBuffer;

const isBuffer = (source: SampleSource): source is AudioBuffer => 'getChannelData' in source;

/** Every channel of a sample's audio (for measuring it). */
export function sampleChannels(source: SampleSource): Float32Array[] {
	if (!isBuffer(source)) return [...source.channels];
	return Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c));
}

/** A sample's length in seconds. */
export function sampleSeconds(source: SampleSource): number {
	const frames = isBuffer(source) ? source.length : (source.channels[0]?.length ?? 0);
	return frames / source.sampleRate;
}

function assertAudio(source: SampleSource): void {
	const channels = sampleChannels(source);
	if (channels.length === 0 || !(channels[0].length > 0) || !(source.sampleRate > 0)) {
		throw new SoundError('a sample needs at least one channel with audio in it');
	}
}

/** The audio of every sample file that has some. Create one per app (the sound module owns it). */
export class SampleRegistry {
	readonly #files = new Map<string, SampleSource>();
	readonly #listeners: ((id: string) => void)[] = [];

	/** Sets (or with null clears) the audio of the sample file `id`. */
	setFile(id: string, source: SampleSource | null): void {
		if (typeof id !== 'string' || id.length === 0) {
			throw new SoundError('a sample file needs its id');
		}
		if (source) {
			assertAudio(source);
			this.#files.set(id, source);
		} else if (!this.#files.delete(id)) return;
		this.#changed(id);
	}

	/** The audio of the sample file `id`, if any. */
	file(id: string): SampleSource | null {
		return this.#files.get(id) ?? null;
	}

	/** The ids that have audio. */
	get ids(): string[] {
		return [...this.#files.keys()];
	}

	/** Forgets every file's audio. */
	clear(): void {
		for (const id of this.ids) this.setFile(id, null);
	}

	/** Hears every change (the id it happened to). Returns `unsubscribe`. */
	onChange(listener: (id: string) => void): () => void {
		this.#listeners.push(listener);
		return () => {
			const at = this.#listeners.indexOf(listener);
			if (at >= 0) this.#listeners.splice(at, 1);
		};
	}

	#changed(id: string): void {
		for (const listener of [...this.#listeners]) listener(id);
	}
}
