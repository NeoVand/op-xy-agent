/**
 * The spectra behind every listening measure: a real-input FFT that gets a frame's spectrum from a
 * complex FFT of half its length (every frame analysed here is real, so this halves the work of the
 * onset flux, the Welch spectra and the chromagram), on top of the FFT the whole app shares
 * (`core/dsp/fft`), and the analysis windows. Plain TypeScript: it runs in Node, the browser and a
 * worker alike.
 */
import { fft } from '../dsp/fft';
import { ListenError } from './errors';

export { fft };

function isPowerOfTwo(n: number): boolean {
	return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** The smallest power of two ≥ `n` (1 for n ≤ 1). */
export function nextPowerOfTwo(n: number): number {
	return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

/** The largest power of two ≤ `n` (1 for n < 2). */
export function previousPowerOfTwo(n: number): number {
	return 2 ** Math.floor(Math.log2(Math.max(1, n)));
}

/**
 * The FFT of real frames of one power-of-two size: the even samples as real parts and the odd ones
 * as imaginary parts go through a complex FFT of half the size, and one pass of butterflies
 * separates the two. Reuses its buffers, so one instance serves a whole analysis (not re-entrant).
 */
export class RealFft {
	readonly size: number;
	/** Bins from DC to Nyquist: size / 2 + 1. */
	readonly bins: number;
	readonly #re: Float64Array;
	readonly #im: Float64Array;
	readonly #cos: Float64Array;
	readonly #sin: Float64Array;
	/** The spectrum `power` works in, made on first use. */
	#scratchRe: Float64Array | null = null;
	#scratchIm: Float64Array | null = null;

	/** @throws {ListenError} unless `size` is a power of two of at least 4 */
	constructor(size: number) {
		if (!isPowerOfTwo(size) || size < 4) {
			throw new ListenError(`RealFft: size must be a power of two ≥ 4 (got ${size})`);
		}
		this.size = size;
		this.bins = size / 2 + 1;
		const half = size / 2;
		this.#re = new Float64Array(half);
		this.#im = new Float64Array(half);
		this.#cos = new Float64Array(half + 1);
		this.#sin = new Float64Array(half + 1);
		for (let k = 0; k <= half; k++) {
			this.#cos[k] = Math.cos((2 * Math.PI * k) / size);
			this.#sin[k] = Math.sin((2 * Math.PI * k) / size);
		}
	}

	/**
	 * The spectrum of `frame` (length `size`, optionally multiplied by `window`) as real and
	 * imaginary parts for bins 0 … size / 2 (each output at least `bins` long).
	 */
	transform(
		frame: ArrayLike<number>,
		outRe: Float64Array,
		outIm: Float64Array,
		window?: ArrayLike<number>
	): void {
		const half = this.size / 2;
		const re = this.#re;
		const im = this.#im;
		if (window) {
			for (let n = 0; n < half; n++) {
				re[n] = frame[2 * n] * window[2 * n];
				im[n] = frame[2 * n + 1] * window[2 * n + 1];
			}
		} else {
			for (let n = 0; n < half; n++) {
				re[n] = frame[2 * n];
				im[n] = frame[2 * n + 1];
			}
		}
		fft(re, im);
		// X[k] = E[k] + W^k·O[k], with E and O the spectra of the even and odd samples:
		// E = (Z[k] + conj Z[half − k]) / 2, O = (Z[k] − conj Z[half − k]) / 2i
		outRe[0] = re[0] + im[0];
		outIm[0] = 0;
		outRe[half] = re[0] - im[0];
		outIm[half] = 0;
		for (let k = 1; k < half; k++) {
			const ar = re[k];
			const ai = im[k];
			const br = re[half - k];
			const bi = -im[half - k];
			const er = (ar + br) / 2;
			const ei = (ai + bi) / 2;
			const or = (ai - bi) / 2;
			const oi = -(ar - br) / 2;
			const c = this.#cos[k];
			const s = this.#sin[k];
			outRe[k] = er + c * or + s * oi;
			outIm[k] = ei + c * oi - s * or;
		}
	}

	/** |X[k]|² for bins 0 … size / 2 of `frame` (times `window`, when given), into `out`. */
	power(frame: ArrayLike<number>, out: Float64Array, window?: ArrayLike<number>): void {
		const re = (this.#scratchRe ??= new Float64Array(this.bins));
		const im = (this.#scratchIm ??= new Float64Array(this.bins));
		this.transform(frame, re, im, window);
		for (let k = 0; k < this.bins; k++) out[k] = re[k] * re[k] + im[k] * im[k];
	}
}

/**
 * A periodic Hann window of `n` points (the spectral-analysis form: frames overlapping by half sum
 * to a constant).
 */
export function hann(n: number): Float64Array {
	const w = new Float64Array(n);
	for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
	return w;
}

/**
 * A periodic four-term Blackman–Harris window of `n` points: side lobes 92 dB down, so a loud tone
 * leaks nothing measurable into distant bins (a wider main lobe is the price).
 */
export function blackmanHarris(n: number): Float64Array {
	const w = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		const x = (2 * Math.PI * i) / n;
		w[i] = 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
	}
	return w;
}
