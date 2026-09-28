/**
 * Measuring sound: an FFT, windowed spectra, the level of each harmonic of a note, how much of a
 * signal is aliasing (energy away from its harmonics), and a spectral distance between two sounds.
 * The synth core builds its band-limited tables with the FFT; the tests and the device comparison
 * use the rest. Plain TypeScript, so it runs in Node, in the browser and in an AudioWorklet.
 */

import { fft } from '../../core/dsp/fft';

export { fft };

/** The smallest power of two ≥ `n`. */
export const powerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Window shapes for spectra: Hann for levels, Blackman–Harris where leakage must stay low. */
export type WindowKind = 'hann' | 'blackman-harris';

/** A window of `n` points, and its coherent gain (the mean), to read amplitudes back. */
export function window(
	kind: WindowKind,
	n: number
): { readonly w: Float64Array; readonly gain: number } {
	const w = new Float64Array(n);
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const x = (2 * Math.PI * i) / (n - 1);
		w[i] =
			kind === 'hann'
				? 0.5 - 0.5 * Math.cos(x)
				: 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
		sum += w[i];
	}
	return { w, gain: sum / n };
}

/** A power spectrum: power per bin from 0 Hz to Nyquist, and the width of a bin in hertz. */
export interface Spectrum {
	readonly power: Float64Array;
	readonly binHz: number;
}

/**
 * The windowed power spectrum of `samples` (zero-padded to a power of two), for comparing where
 * energy sits; read amplitudes with {@link levelAt} or {@link harmonicLevels} instead.
 */
export function powerSpectrum(
	samples: ArrayLike<number>,
	sampleRate: number,
	kind: WindowKind = 'blackman-harris'
): Spectrum {
	const n = powerOfTwo(samples.length);
	const { w, gain } = window(kind, samples.length);
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	for (let i = 0; i < samples.length; i++) re[i] = samples[i] * w[i];
	fft(re, im);
	const power = new Float64Array(n / 2 + 1);
	const scale = 1 / (samples.length * gain) ** 2;
	for (let i = 0; i <= n / 2; i++) power[i] = (re[i] * re[i] + im[i] * im[i]) * scale;
	return { power, binHz: sampleRate / n };
}

/**
 * The amplitude of a sinusoid at exactly `hz` in `samples` (Hann-windowed Goertzel): a sine of
 * amplitude A reads A, provided the window spans several of its periods.
 */
export function levelAt(samples: ArrayLike<number>, sampleRate: number, hz: number): number {
	const n = samples.length;
	const w = (2 * Math.PI * hz) / sampleRate;
	let re = 0;
	let im = 0;
	let gain = 0;
	for (let i = 0; i < n; i++) {
		const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
		re += samples[i] * h * Math.cos(w * i);
		im -= samples[i] * h * Math.sin(w * i);
		gain += h;
	}
	return (2 * Math.hypot(re, im)) / gain;
}

/** The amplitudes of harmonics 1…`count` of a note at `f0` (those below Nyquist; 0 above). */
export function harmonicLevels(
	samples: ArrayLike<number>,
	sampleRate: number,
	f0: number,
	count: number
): number[] {
	return Array.from({ length: count }, (_, i) => {
		const hz = f0 * (i + 1);
		return hz < sampleRate / 2 ? levelAt(samples, sampleRate, hz) : 0;
	});
}

/**
 * How much of a periodic signal at `f0` is not its harmonics, in dB relative to the whole (−∞ for
 * none): energy in bins farther than `lobe` bins from every harmonic below Nyquist, over all energy.
 * Aliasing folds partials onto inharmonic frequencies, so this rises with it. `ignoreBelow` leaves
 * out DC and rumble.
 */
export function inharmonicDb(
	samples: ArrayLike<number>,
	sampleRate: number,
	f0: number,
	{ lobe = 6, ignoreBelow = 20 }: { lobe?: number; ignoreBelow?: number } = {}
): number {
	const { power, binHz } = powerSpectrum(samples, sampleRate, 'blackman-harris');
	let total = 0;
	let off = 0;
	for (let i = Math.ceil(ignoreBelow / binHz); i < power.length; i++) {
		const hz = i * binHz;
		total += power[i];
		const nearest = Math.max(1, Math.round(hz / f0)) * f0;
		if (Math.abs(hz - nearest) / binHz > lobe) off += power[i];
	}
	return 10 * Math.log10(off / total);
}

/** Root mean square of `samples[from, to)`. */
export function rms(samples: ArrayLike<number>, from = 0, to = samples.length): number {
	let sum = 0;
	for (let i = from; i < to; i++) sum += samples[i] * samples[i];
	return Math.sqrt(sum / Math.max(1, to - from));
}

/** The spectral centroid in hertz: where the energy sits on average (brightness). */
export function centroid(samples: ArrayLike<number>, sampleRate: number): number {
	const { power, binHz } = powerSpectrum(samples, sampleRate, 'hann');
	let num = 0;
	let den = 0;
	for (let i = 1; i < power.length; i++) {
		num += i * binHz * power[i];
		den += power[i];
	}
	return den > 0 ? num / den : 0;
}

/**
 * The log-spectral distance between two sounds in dB (0 = same spectral envelope): each spectrum
 * is smoothed into third-octave bands from 40 Hz to 16 kHz and normalized to its own loudness, so
 * level differences do not count, only tone. Used to fit our engines to captures of the device.
 */
export function spectralDistance(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	sampleRate: number
): number {
	const bands = (x: ArrayLike<number>) => {
		const { power, binHz } = powerSpectrum(x, sampleRate, 'hann');
		const out: number[] = [];
		for (let lo = 40; lo < 16000; lo *= 2 ** (1 / 3)) {
			const hi = lo * 2 ** (1 / 3);
			let sum = 1e-20;
			for (let i = Math.ceil(lo / binHz); i < Math.min(power.length, hi / binHz); i++)
				sum += power[i];
			out.push(10 * Math.log10(sum));
		}
		const mean = out.reduce((s, v) => s + v, 0) / out.length;
		return out.map((v) => v - mean);
	};
	const x = bands(a);
	const y = bands(b);
	let sum = 0;
	for (let i = 0; i < x.length; i++) sum += (x[i] - y[i]) ** 2;
	return Math.sqrt(sum / x.length);
}
