/**
 * Where the energy sits: a Welch power spectrum (Hann frames of about 190 ms overlapping by half,
 * left and right averaged), the five bands a mix is talked about in — each against pink noise, which
 * has equal energy per octave — the spectral centroid (brightness), the tilt in dB per octave (white
 * noise 0, pink −3, brown −6), and a coarse third-octave profile. Bands are integrated over the
 * fraction of each FFT bin they cover, so narrow low bands are not skewed by where the bins fall.
 */
import { RealFft, hann, previousPowerOfTwo } from './fft';
import { DB_FLOOR, powerDb } from './level';

/** The five bands, hertz. */
export const BANDS = [
	{ name: 'low', lo: 20, hi: 150 },
	{ name: 'low-mid', lo: 150, hi: 500 },
	{ name: 'mid', lo: 500, hi: 2500 },
	{ name: 'high', lo: 2500, hi: 8000 },
	{ name: 'air', lo: 8000, hi: 20000 }
] as const;

/** A band's name. */
export type BandName = (typeof BANDS)[number]['name'];

/** Nominal centres of the third-octave bands (ISO 266), 25 Hz to 20 kHz. */
export const THIRD_OCTAVES = [
	25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
	2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
] as const;

/** The exact centre of third-octave band `i` of {@link THIRD_OCTAVES} (base 10: 1000·10^(k/10)). */
function thirdOctaveCentre(i: number): number {
	return 1000 * 10 ** ((i - 16) / 10);
}

/** The range every measure here covers, hertz (capped at Nyquist). */
const LOW_HZ = 20;
const HIGH_HZ = 20000;

/** An averaged one-sided power spectrum: bins sum to the signal's mean square. */
export interface PowerSpectrum {
	readonly power: Float64Array;
	readonly binHz: number;
	/** Frames averaged (per channel). */
	readonly frames: number;
}

/**
 * The Welch power spectrum of `channels` (averaged over channels and frames), or null when the
 * recording is shorter than 256 samples.
 */
export function welch(
	channels: readonly ArrayLike<number>[],
	sampleRate: number
): PowerSpectrum | null {
	const n = channels[0]?.length ?? 0;
	if (n < 256) return null;
	const size = Math.max(
		256,
		Math.min(previousPowerOfTwo(0.19 * sampleRate), previousPowerOfTwo(n))
	);
	const hop = size / 2;
	const w = hann(size);
	let w2 = 0;
	for (const v of w) w2 += v * v;
	const real = new RealFft(size);
	const frame = new Float64Array(real.bins);
	const power = new Float64Array(real.bins);
	let frames = 0;
	for (const channel of channels) {
		for (let start = 0; start + size <= n; start += hop) {
			real.power(sliceOf(channel, start, size), frame, w);
			for (let k = 0; k < real.bins; k++) power[k] += frame[k];
			frames++;
		}
	}
	const scale = 1 / (size * w2 * frames);
	for (let k = 0; k < real.bins; k++) {
		const oneSided = k === 0 || k === real.bins - 1 ? 1 : 2;
		power[k] *= oneSided * scale;
	}
	return { power, binHz: sampleRate / size, frames: frames / channels.length };
}

/** `length` samples of `channel` from `start` (a view when the channel is a typed array). */
function sliceOf(channel: ArrayLike<number>, start: number, length: number): ArrayLike<number> {
	if (channel instanceof Float32Array || channel instanceof Float64Array) {
		return channel.subarray(start, start + length);
	}
	return Array.from({ length }, (_, i) => channel[start + i]);
}

/** Power between `lo` and `hi` Hz, each bin counted by the share of its width inside the range. */
export function bandPower(spectrum: PowerSpectrum, lo: number, hi: number): number {
	const { power, binHz } = spectrum;
	let sum = 0;
	const first = Math.max(0, Math.floor(lo / binHz - 0.5));
	const last = Math.min(power.length - 1, Math.ceil(hi / binHz + 0.5));
	for (let k = first; k <= last; k++) {
		const from = Math.max(lo, (k - 0.5) * binHz);
		const to = Math.min(hi, (k + 0.5) * binHz);
		if (to > from) sum += (power[k] * (to - from)) / binHz;
	}
	return sum;
}

/** One band's level. */
export interface BandLevel {
	readonly name: BandName;
	/** The band's mean square, dB (a full-scale sine inside it reads −3). */
	readonly db: number;
	/** The band's share of all the energy from 20 Hz up, dB (0 = everything). */
	readonly share: number;
	/** The share against pink noise's (equal energy per octave), dB; null above Nyquist. */
	readonly vsPink: number | null;
}

/** Tone: where the energy sits. */
export interface SpectrumStats {
	readonly bands: readonly BandLevel[];
	/** Magnitude-weighted mean frequency, 20 Hz – 20 kHz (brightness). */
	readonly centroidHz: number;
	/** Slope of the power per hertz, dB per octave, 50 Hz – 16 kHz: white 0, pink −3, brown −6. */
	readonly tiltDbPerOctave: number | null;
	/** Each third-octave band's share of the total, dB, by {@link THIRD_OCTAVES}; null above Nyquist. */
	readonly thirdOctaves: readonly (number | null)[];
}

/** Least-squares slope of y against x. */
export function slope(x: readonly number[], y: readonly number[]): number {
	const n = x.length;
	const mx = x.reduce((s, v) => s + v, 0) / n;
	const my = y.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		num += (x[i] - mx) * (y[i] - my);
		den += (x[i] - mx) ** 2;
	}
	return den > 0 ? num / den : 0;
}

/**
 * The tone of `channels`: bands, centroid, tilt and third-octave profile; null when there is no
 * energy from 20 Hz up (or too few samples to measure).
 */
export function spectrumStats(
	channels: readonly ArrayLike<number>[],
	sampleRate: number
): SpectrumStats | null {
	const spectrum = welch(channels, sampleRate);
	if (!spectrum) return null;
	const top = Math.min(HIGH_HZ, sampleRate / 2);
	const total = bandPower(spectrum, LOW_HZ, top);
	if (!(total > 1e-14)) return null;
	const octaves = Math.log2(top / LOW_HZ);
	const bands = BANDS.map(({ name, lo, hi }) => {
		const upper = Math.min(hi, top);
		if (upper <= lo) return { name, db: DB_FLOOR, share: DB_FLOOR, vsPink: null };
		const p = bandPower(spectrum, lo, upper);
		const share = p / total;
		const pink = Math.log2(upper / lo) / octaves;
		return {
			name,
			db: powerDb(p),
			share: powerDb(share),
			vsPink: share > 0 ? 10 * Math.log10(share / pink) : DB_FLOOR
		};
	});

	const { power, binHz } = spectrum;
	let weighted = 0;
	let weights = 0;
	for (let k = Math.ceil(LOW_HZ / binHz); k < power.length && k * binHz <= top; k++) {
		const m = Math.sqrt(power[k]);
		weighted += k * binHz * m;
		weights += m;
	}

	const thirdOctaves = THIRD_OCTAVES.map((_, i) => {
		const centre = thirdOctaveCentre(i);
		const lo = centre * 10 ** -0.05;
		const hi = centre * 10 ** 0.05;
		if (hi > sampleRate / 2) return null;
		return powerDb(bandPower(spectrum, lo, hi) / total);
	});

	const x: number[] = [];
	const y: number[] = [];
	THIRD_OCTAVES.forEach((_, i) => {
		const centre = thirdOctaveCentre(i);
		const lo = centre * 10 ** -0.05;
		const hi = centre * 10 ** 0.05;
		if (centre < 49 || centre > 16500 || hi > sampleRate / 2) return;
		const density = bandPower(spectrum, lo, hi) / (hi - lo);
		if (density <= 0) return;
		x.push(Math.log2(centre));
		y.push(10 * Math.log10(density));
	});

	return {
		bands,
		centroidHz: weights > 0 ? weighted / weights : 0,
		tiltDbPerOctave: x.length >= 5 ? slope(x, y) : null,
		thirdOctaves
	};
}
