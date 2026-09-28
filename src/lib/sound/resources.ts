/**
 * What voices share within one audio context: PeriodicWaves (kept in a small LRU cache, since the
 * browser spends about half a megabyte on each), a loop of white noise, the synthesized kit and the
 * metronome rendered into AudioBuffers on first use, sample files' audio from the registry turned
 * into AudioBuffers, and the reverb's impulse.
 */
import { DRUM_SOUNDS, renderClick, renderDrum, renderImpulse } from './kit';
import { crossfadeLoop } from './dsp';
import { random } from './random';
import type { SampleSource } from './samples';
import type { Spectrum } from './waves';

/** PeriodicWaves kept at once; the least recently used goes first. */
const WAVE_CACHE = 32;
/** Seconds of looping noise every noisy voice reads from (each from its own offset). */
const NOISE_SECONDS = 2;

/** An AudioBuffer from samples, one Float32Array per channel. */
function toBuffer(
	context: BaseAudioContext,
	channels: readonly Float32Array[],
	sampleRate: number
) {
	const buffer = context.createBuffer(channels.length, channels[0].length, sampleRate);
	channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i));
	return buffer;
}

/** A copy of a buffer played backwards (drum and sample keys set to reverse). */
function reversed(context: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i).slice().reverse()
	);
	return toBuffer(context, channels, buffer.sampleRate);
}

/** How many crossfaded copies of one buffer are kept (loop points or crossfade turned). */
const CROSSFADE_CACHE = 4;

const isAudioBuffer = (source: SampleSource): source is AudioBuffer =>
	typeof (source as AudioBuffer).getChannelData === 'function';

/** Shared sound material for one context. */
export class Resources {
	readonly context: BaseAudioContext;
	readonly #waves = new Map<string, PeriodicWave>();
	readonly #drums: (AudioBuffer | undefined)[] = [];
	readonly #reversedDrums: (AudioBuffer | undefined)[] = [];
	readonly #samples = new WeakMap<SampleSource, AudioBuffer>();
	readonly #reversedSamples = new WeakMap<SampleSource, AudioBuffer>();
	readonly #crossfaded = new WeakMap<AudioBuffer, Map<string, AudioBuffer>>();
	#noise: AudioBuffer | null = null;
	#clicks: [AudioBuffer, AudioBuffer] | null = null;
	#impulse: AudioBuffer | null = null;

	constructor(context: BaseAudioContext) {
		this.context = context;
	}

	/** The PeriodicWave for `key`, built from `spectrum()` the first time (or after eviction). */
	wave(key: string, spectrum: () => Spectrum): PeriodicWave {
		const cached = this.#waves.get(key);
		if (cached) {
			// most recently used moves to the end
			this.#waves.delete(key);
			this.#waves.set(key, cached);
			return cached;
		}
		const { real, imag } = spectrum();
		const wave = this.context.createPeriodicWave(real, imag);
		this.#waves.set(key, wave);
		if (this.#waves.size > WAVE_CACHE) {
			const oldest = this.#waves.keys().next().value as string;
			this.#waves.delete(oldest);
		}
		return wave;
	}

	/** How many PeriodicWaves are cached (for tests). */
	get waves(): number {
		return this.#waves.size;
	}

	/** Two seconds of white noise, for looping. */
	get noise(): AudioBuffer {
		if (!this.#noise) {
			const next = random(11);
			const data = Float32Array.from(
				{ length: Math.round(NOISE_SECONDS * this.context.sampleRate) },
				() => next() * 2 - 1
			);
			this.#noise = toBuffer(this.context, [data], this.context.sampleRate);
		}
		return this.#noise;
	}

	/** A kit sound (drum key 0–23), rendered on first use; backwards when `reverse`. */
	drum(index: number, reverse = false): AudioBuffer {
		let buffer = this.#drums[index];
		if (!buffer) {
			buffer = toBuffer(
				this.context,
				[renderDrum(index, this.context.sampleRate)],
				this.context.sampleRate
			);
			this.#drums[index] = buffer;
		}
		if (!reverse) return buffer;
		return (this.#reversedDrums[index] ??= reversed(this.context, buffer));
	}

	/**
	 * Renders the kit sounds not rendered yet, one per call of `step` (so an idle callback can spread
	 * the work); returns false when there is nothing left to do.
	 */
	prepareStep(): boolean {
		const next = DRUM_SOUNDS.findIndex((_, i) => !this.#drums[i]);
		if (next < 0) return false;
		this.drum(next);
		return true;
	}

	/** The metronome click (accented on the first beat of a bar). */
	click(accent: boolean): AudioBuffer {
		const sr = this.context.sampleRate;
		this.#clicks ??= [
			toBuffer(this.context, [renderClick(false, sr)], sr),
			toBuffer(this.context, [renderClick(true, sr)], sr)
		];
		return this.#clicks[accent ? 1 : 0];
	}

	/** The reverb's stereo impulse response. */
	get impulse(): AudioBuffer {
		const sr = this.context.sampleRate;
		this.#impulse ??= toBuffer(this.context, renderImpulse(sr), sr);
		return this.#impulse;
	}

	/** A sample file's audio as an AudioBuffer (converted once), backwards when `reverse`. */
	/**
	 * `buffer` with its loop (seconds) crossfaded over the loop's last `seconds` ({@link
	 * crossfadeLoop}), cached per buffer and settings.
	 */
	crossfaded(
		buffer: AudioBuffer,
		loopStart: number,
		loopEnd: number,
		seconds: number
	): AudioBuffer {
		const key = `${loopStart.toFixed(5)}:${loopEnd.toFixed(5)}:${seconds.toFixed(5)}`;
		let copies = this.#crossfaded.get(buffer);
		if (!copies) this.#crossfaded.set(buffer, (copies = new Map()));
		const cached = copies.get(key);
		if (cached) return cached;
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
			buffer.getChannelData(i)
		);
		const faded = crossfadeLoop(channels, buffer.sampleRate, loopStart, loopEnd, seconds);
		const copy = faded.every((c, i) => c === channels[i])
			? buffer
			: toBuffer(this.context, faded, buffer.sampleRate);
		copies.set(key, copy);
		if (copies.size > CROSSFADE_CACHE) copies.delete(copies.keys().next().value as string);
		return copy;
	}

	sample(source: SampleSource, reverse = false): AudioBuffer {
		let buffer = this.#samples.get(source);
		if (!buffer) {
			buffer = isAudioBuffer(source)
				? source
				: toBuffer(this.context, source.channels, source.sampleRate);
			this.#samples.set(source, buffer);
		}
		if (!reverse) return buffer;
		let back = this.#reversedSamples.get(source);
		if (!back) {
			back = reversed(this.context, buffer);
			this.#reversedSamples.set(source, back);
		}
		return back;
	}
}
