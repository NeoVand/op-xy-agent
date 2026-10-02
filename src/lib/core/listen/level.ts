/**
 * How loud: sample peak, RMS, crest factor, clipping, DC offset, and loudness after ITU-R BS.1770-4
 * — K-weighting, 400 ms blocks every 100 ms, the absolute gate at −70 LUFS and the relative gate
 * 10 LU under the gated mean — with the loudest momentary (400 ms) and short-term (3 s) values and
 * the loudness range of EBU Tech 3342 (short-term values gated at −70 LUFS and 20 LU under their
 * mean, the spread from their 10th to their 95th percentile).
 *
 * The K-weighting filters are derived for any sample rate from the analog prototypes whose
 * parameters libebur128 (MIT) fitted to the standard's 48 kHz coefficients, so 44.1 kHz captures of
 * the OP-XY are weighted as the standard intends (the tests check the 48 kHz coefficients and the
 * EBU Tech 3341 test signals).
 */
import { filter, type Biquad } from './filters';

/** The quietest level reported, dB: digital silence reads this rather than −∞, so results stay JSON. */
export const DB_FLOOR = -120;

/** A sample at or above this magnitude counts as full scale (16-bit full scale is 0.99997). */
export const CLIP_LEVEL = 0.9999;

/** Consecutive full-scale samples that make a clipped run (a flat top, not a peak that touches). */
export const CLIP_RUN = 3;

/** BS.1770's absolute gate, LUFS. */
export const ABSOLUTE_GATE = -70;

/** An amplitude in dB (20·log10), floored at {@link DB_FLOOR}. */
export function amplitudeDb(amplitude: number): number {
	return amplitude > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(amplitude)) : DB_FLOOR;
}

/** A power (mean square) in dB (10·log10), floored at {@link DB_FLOOR}. */
export function powerDb(power: number): number {
	return power > 0 ? Math.max(DB_FLOOR, 10 * Math.log10(power)) : DB_FLOOR;
}

/**
 * The two K-weighting stages at `sampleRate`: the high-shelf "pre-filter" (+4 dB above ~1.5 kHz,
 * the head's effect) and the RLB high-pass (below ~40 Hz).
 */
export function kWeighting(sampleRate: number): readonly [Biquad, Biquad] {
	// stage 1: high shelf
	let f0 = 1681.974450955533;
	const g = 3.999843853973347;
	let q = 0.7071752369554196;
	let k = Math.tan((Math.PI * f0) / sampleRate);
	const vh = 10 ** (g / 20);
	const vb = vh ** 0.4996667741545416;
	let a0 = 1 + k / q + k * k;
	const shelf: Biquad = {
		b0: (vh + (vb * k) / q + k * k) / a0,
		b1: (2 * (k * k - vh)) / a0,
		b2: (vh - (vb * k) / q + k * k) / a0,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0
	};
	// stage 2: RLB high-pass
	f0 = 38.13547087602444;
	q = 0.5003270373238773;
	k = Math.tan((Math.PI * f0) / sampleRate);
	a0 = 1 + k / q + k * k;
	const highpass: Biquad = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0
	};
	return [shelf, highpass];
}

/** A channel K-weighted. */
export function kWeighted(channel: ArrayLike<number>, sampleRate: number): Float64Array {
	const [shelf, highpass] = kWeighting(sampleRate);
	const y = filter(channel, shelf);
	return filter(y, highpass, y);
}

/** Loudness after BS.1770 and EBU Tech 3342; null where nothing rises above the absolute gate. */
export interface LoudnessStats {
	/** Integrated (programme) loudness, LUFS. */
	readonly integrated: number | null;
	/** The loudest 400 ms block (momentary loudness), LUFS. */
	readonly momentaryMax: number | null;
	/** The loudest 3 s window (short-term loudness), LUFS; null for recordings under 3 s. */
	readonly shortTermMax: number | null;
	/** Loudness range, LU; null under 3 s or with nothing above the gates. */
	readonly range: number | null;
}

const LUFS = (power: number) => -0.691 + 10 * Math.log10(power);

/** Linear-interpolated percentile of sorted values (p in 0–100). */
function percentile(sorted: readonly number[], p: number): number {
	if (sorted.length === 1) return sorted[0];
	const at = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(at);
	const hi = Math.min(sorted.length - 1, lo + 1);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** Window powers (summed over channels) of `length` samples every `hop` samples. */
function windowPowers(sums: readonly Float64Array[], length: number, hop: number): number[] {
	const n = sums[0].length - 1;
	const out: number[] = [];
	for (let start = 0; start + length <= n; start += hop) {
		let z = 0;
		for (const cum of sums) z += (cum[start + length] - cum[start]) / length;
		out.push(z);
	}
	return out;
}

/**
 * Loudness of `channels` (each weighted 1, as BS.1770 weights left and right) at `sampleRate`.
 * Recordings shorter than one 400 ms block measure nothing.
 */
export function loudness(
	channels: readonly ArrayLike<number>[],
	sampleRate: number
): LoudnessStats {
	const n = channels[0]?.length ?? 0;
	const sums = channels.map((channel) => {
		const y = kWeighted(channel, sampleRate);
		const cum = new Float64Array(n + 1);
		for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + y[i] * y[i];
		return cum;
	});
	const hop = Math.round(0.1 * sampleRate);
	const blocks = n > 0 ? windowPowers(sums, 4 * hop, hop) : [];
	const loud = blocks.filter((z) => z > 0 && LUFS(z) > ABSOLUTE_GATE);
	let integrated: number | null = null;
	if (loud.length > 0) {
		const relative = LUFS(loud.reduce((s, z) => s + z, 0) / loud.length) - 10;
		const gated = loud.filter((z) => LUFS(z) > relative);
		integrated = LUFS(gated.reduce((s, z) => s + z, 0) / gated.length);
	}
	const peakBlock = Math.max(0, ...blocks);
	const momentaryMax = peakBlock > 0 && LUFS(peakBlock) > ABSOLUTE_GATE ? LUFS(peakBlock) : null;

	const shortTerm = n > 0 ? windowPowers(sums, 30 * hop, hop) : [];
	const peakShort = Math.max(0, ...shortTerm);
	const shortTermMax = peakShort > 0 && LUFS(peakShort) > ABSOLUTE_GATE ? LUFS(peakShort) : null;
	let range: number | null = null;
	const audible = shortTerm.filter((z) => z > 0 && LUFS(z) > ABSOLUTE_GATE);
	if (audible.length > 0) {
		const relative = LUFS(audible.reduce((s, z) => s + z, 0) / audible.length) - 20;
		const values = audible
			.map(LUFS)
			.filter((l) => l > relative)
			.sort((a, b) => a - b);
		range = percentile(values, 95) - percentile(values, 10);
	}
	return { integrated, momentaryMax, shortTermMax, range };
}

/** Levels of a recording. */
export interface LevelStats {
	/** The highest sample, dBFS (a full-scale sine peaks at 0). */
	readonly peakDbfs: number;
	/** RMS over every channel, dBFS (a full-scale sine reads −3). */
	readonly rmsDbfs: number;
	/** Peak over RMS, dB: about 3 for a sine, 10–20 for a punchy mix, more for sparse hits. */
	readonly crestDb: number;
	/** Samples at full scale, all channels. */
	readonly clippedSamples: number;
	/** Runs of {@link CLIP_RUN} or more full-scale samples in a row (flat tops: clipping). */
	readonly clipRuns: number;
	/** The largest channel mean (DC offset), −1…1. */
	readonly dcOffset: number;
	readonly loudness: LoudnessStats;
	/** Where the highest sample is, seconds from the start. */
	readonly peakSeconds: number;
	/** The first and last sample at full scale, seconds; null with none. */
	readonly clipSeconds: readonly [number, number] | null;
}

/** Peak, RMS, crest, clipping, DC offset and loudness of `channels`. */
export function levelStats(channels: readonly ArrayLike<number>[], sampleRate: number): LevelStats {
	let peak = 0;
	let peakAt = 0;
	let clipFirst = -1;
	let clipLast = -1;
	let sumSquares = 0;
	let count = 0;
	let clippedSamples = 0;
	let clipRuns = 0;
	let dcOffset = 0;
	for (const channel of channels) {
		let sum = 0;
		let run = 0;
		for (let i = 0; i < channel.length; i++) {
			const x = channel[i];
			const a = Math.abs(x);
			if (a > peak) {
				peak = a;
				peakAt = i;
			}
			sumSquares += x * x;
			sum += x;
			if (a >= CLIP_LEVEL) {
				if (clipFirst < 0 || i < clipFirst) clipFirst = i;
				if (i > clipLast) clipLast = i;
				clippedSamples++;
				run++;
				if (run === CLIP_RUN) clipRuns++;
			} else {
				run = 0;
			}
		}
		count += channel.length;
		const mean = channel.length > 0 ? sum / channel.length : 0;
		if (Math.abs(mean) > Math.abs(dcOffset)) dcOffset = mean;
	}
	const peakDbfs = amplitudeDb(peak);
	const rmsDbfs = powerDb(count > 0 ? sumSquares / count : 0);
	return {
		peakDbfs,
		rmsDbfs,
		crestDb: peak > 0 ? peakDbfs - rmsDbfs : 0,
		clippedSamples,
		clipRuns,
		dcOffset,
		loudness: loudness(channels, sampleRate),
		peakSeconds: peakAt / sampleRate,
		clipSeconds: clipFirst < 0 ? null : [clipFirst / sampleRate, clipLast / sampleRate]
	};
}
