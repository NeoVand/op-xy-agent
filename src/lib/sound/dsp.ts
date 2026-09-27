/**
 * A small offline DSP kit for sounds rendered once into buffers (the drum kit, the metronome, the
 * reverb's impulse): band-limited oscillators, RBJ biquads, envelopes and mixing, sample by sample in
 * plain TypeScript. Rendering in TypeScript rather than a Web Audio graph keeps these sounds
 * deterministic and testable in Node, and costs a few milliseconds once.
 */

/** RBJ cookbook biquad responses. */
export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peaking';

/** A biquad filter (transposed direct form II). */
export class Biquad {
	#b0 = 1;
	#b1 = 0;
	#b2 = 0;
	#a1 = 0;
	#a2 = 0;
	#z1 = 0;
	#z2 = 0;

	/**
	 * @param q quality (bandwidth for bandpass and peaking; 0.707 is flat for low/highpass)
	 * @param gainDb boost or cut, peaking only
	 */
	constructor(
		readonly kind: BiquadKind,
		frequency: number,
		q: number,
		readonly sampleRate: number,
		gainDb = 0
	) {
		this.set(frequency, q, gainDb);
	}

	/** Changes the corner, quality and gain without resetting the filter's memory. */
	set(frequency: number, q: number, gainDb = 0): void {
		const f = Math.min(Math.max(frequency, 10), this.sampleRate * 0.49);
		const w = (2 * Math.PI * f) / this.sampleRate;
		const cos = Math.cos(w);
		const alpha = Math.sin(w) / (2 * Math.max(q, 0.05));
		let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
		switch (this.kind) {
			case 'lowpass':
				b0 = (1 - cos) / 2;
				b1 = 1 - cos;
				b2 = b0;
				a0 = 1 + alpha;
				a1 = -2 * cos;
				a2 = 1 - alpha;
				break;
			case 'highpass':
				b0 = (1 + cos) / 2;
				b1 = -(1 + cos);
				b2 = b0;
				a0 = 1 + alpha;
				a1 = -2 * cos;
				a2 = 1 - alpha;
				break;
			case 'bandpass':
				b0 = alpha;
				b1 = 0;
				b2 = -alpha;
				a0 = 1 + alpha;
				a1 = -2 * cos;
				a2 = 1 - alpha;
				break;
			case 'peaking': {
				const a = Math.pow(10, gainDb / 40);
				b0 = 1 + alpha * a;
				b1 = -2 * cos;
				b2 = 1 - alpha * a;
				a0 = 1 + alpha / a;
				a1 = -2 * cos;
				a2 = 1 - alpha / a;
				break;
			}
		}
		this.#b0 = b0 / a0;
		this.#b1 = b1 / a0;
		this.#b2 = b2 / a0;
		this.#a1 = a1 / a0;
		this.#a2 = a2 / a0;
	}

	/** Filters one sample. */
	process(x: number): number {
		const y = this.#b0 * x + this.#z1;
		this.#z1 = this.#b1 * x - this.#a1 * y + this.#z2;
		this.#z2 = this.#b2 * x - this.#a2 * y;
		return y;
	}
}

/** PolyBLEP: the correction that takes most of the aliasing out of a naive step. */
function blep(phase: number, step: number): number {
	if (phase < step) {
		const t = phase / step;
		return t + t - t * t - 1;
	}
	if (phase > 1 - step) {
		const t = (phase - 1) / step;
		return t * t + t + t + 1;
	}
	return 0;
}

/** A band-limited oscillator whose frequency may change every sample. */
export class Oscillator {
	#phase: number;

	constructor(
		readonly shape: 'sine' | 'square' | 'saw' | 'triangle',
		readonly sampleRate: number,
		phase = 0
	) {
		this.#phase = phase % 1;
	}

	/** The next sample at `frequency` hertz. */
	next(frequency: number): number {
		const step = Math.min(Math.abs(frequency) / this.sampleRate, 0.5);
		const p = this.#phase;
		let y: number;
		switch (this.shape) {
			case 'sine':
				y = Math.sin(2 * Math.PI * p);
				break;
			case 'saw':
				y = 2 * p - 1 - blep(p, step);
				break;
			case 'square':
				y = (p < 0.5 ? 1 : -1) + blep(p, step) - blep((p + 0.5) % 1, step);
				break;
			case 'triangle':
				// no corrections needed: a triangle's harmonics fall away fast enough on their own
				y = 1 - 4 * Math.abs(p - 0.5);
				break;
		}
		this.#phase = (p + step) % 1;
		return y;
	}
}

/** exp(−t/τ): the decay every percussive envelope here is built from. */
export const decay = (t: number, tau: number): number => (t < 0 ? 0 : Math.exp(-t / tau));

/** Renders `seconds` of sound from a function of (sample index, time in seconds). */
export function render(
	sampleRate: number,
	seconds: number,
	sample: (i: number, t: number) => number
): Float32Array {
	const out = new Float32Array(Math.max(1, Math.round(seconds * sampleRate)));
	for (let i = 0; i < out.length; i++) out[i] = sample(i, i / sampleRate);
	return out;
}

/** The largest absolute sample. */
export function peak(samples: Float32Array): number {
	let max = 0;
	for (const v of samples) max = Math.max(max, Math.abs(v));
	return max;
}

/** Root mean square of a stretch of samples (all of them by default). */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
	let sum = 0;
	for (let i = from; i < to; i++) sum += samples[i] * samples[i];
	return Math.sqrt(sum / Math.max(1, to - from));
}

/** The loudest stretch of `seconds`: the RMS of the loudest window (a short-term loudness). */
export function loudness(samples: Float32Array, sampleRate: number, seconds = 0.03): number {
	const w = Math.max(1, Math.min(samples.length, Math.round(sampleRate * seconds)));
	let sum = 0;
	for (let i = 0; i < w; i++) sum += samples[i] * samples[i];
	let best = sum;
	for (let i = w; i < samples.length; i++) {
		sum += samples[i] * samples[i] - samples[i - w] * samples[i - w];
		best = Math.max(best, sum);
	}
	return Math.sqrt(Math.max(0, best) / w);
}

/** The ceiling finished sounds never pass. */
export const CEILING = 0.95;

/**
 * Finishes a rendered sound in place: a 0.3 ms fade in and a 4 ms fade out so nothing clicks, then
 * scaled so its loudest 30 ms sit at `loudnessDb` (dBFS). Balancing by loudness rather than peak
 * keeps noisy sounds (snares, hats) as present as tonal ones; peaks that would pass the ceiling are
 * rounded off with tanh, which gives transients a little drive, as drum machines do.
 */
export function finish(
	samples: Float32Array,
	loudnessDb: number,
	sampleRate: number
): Float32Array {
	const fadeIn = Math.min(samples.length, Math.max(1, Math.round(sampleRate * 0.0003)));
	const fadeOut = Math.min(samples.length, Math.round(sampleRate * 0.004));
	for (let i = 0; i < fadeIn; i++) samples[i] *= i / fadeIn;
	for (let i = 0; i < fadeOut; i++) samples[samples.length - 1 - i] *= i / fadeOut;
	const level = loudness(samples, sampleRate);
	const gain = level > 0 ? Math.pow(10, loudnessDb / 20) / level : 0;
	for (let i = 0; i < samples.length; i++) samples[i] = ceiling(samples[i] * gain);
	return samples;
}

/** Where the ceiling's knee starts: straight below, rounding off above. */
const KNEE = 0.6;

/** Linear up to the knee, then a tanh curve that meets the ceiling (smooth in value and slope). */
export function ceiling(x: number): number {
	const a = Math.abs(x);
	if (a <= KNEE) return x;
	return Math.sign(x) * (KNEE + (CEILING - KNEE) * Math.tanh((a - KNEE) / (CEILING - KNEE)));
}

/** Scales in place to a peak, with a 4 ms fade out (for material whose loudness is set later). */
export function normalize(samples: Float32Array, target: number, sampleRate: number): Float32Array {
	const max = peak(samples);
	const gain = max > 0 ? target / max : 0;
	const fade = Math.min(samples.length, Math.round(sampleRate * 0.004));
	for (let i = 0; i < samples.length; i++) {
		const tail = samples.length - i;
		samples[i] *= gain * (tail < fade ? tail / fade : 1);
	}
	return samples;
}

/** A soft clipper for drive: tanh, normalised so full scale stays full scale. */
export const saturate = (x: number, drive: number): number =>
	Math.tanh(x * drive) / Math.tanh(drive);
