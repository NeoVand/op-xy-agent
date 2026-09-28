/**
 * Where notes and hits start.
 *
 * - **Detection:** the spectral flux — the rise of log-compressed magnitudes from one frame to the
 *   next, Blackman–Harris frames of about 23 ms every quarter frame (~5.8 ms at 44.1 kHz), weighted
 *   so that every third of an octave counts the same (as madmom's log-filtered spectrogram does),
 *   or a kick's few low bins would drown among a chord's many high ones — picked with an adaptive
 *   threshold: a frame is an onset when it is the largest within ±30 ms and stands above twice the
 *   mean of the surrounding 170 ms by a share of the largest flux (after Böck et al. 2012; twice,
 *   because the partials of a held chord beat against each other and ripple the flux). The same
 *   rise over the highs alone is picked too, on the same scale, so a quiet hat over a loud chord is
 *   heard. Bins more than 60 dB under the frame's strongest are held there and never count as a
 *   rise: whatever leaks through the window from a loud tone flickers from frame to frame.
 * - **Confirmation:** the energy must not fall across it (the frames after the peak against the
 *   one two before, plain and weighted toward the highs, so a hat over a fading pad still counts).
 *   A clean tone's log flux also jumps when it fades out, because its spectrum widens as it goes;
 *   at an offset the energy falls, while a note change at the same loudness keeps it.
 * - **Placement:** a sound that rises out of near-silence (clicks, drums, notes after a rest, a
 *   kick under a held chord in the lows) is placed to the sample where its energy rises most
 *   steeply; anything else at the flux peak, interpolated between frames, less the typical delay
 *   of that peak. The timing grid needs both.
 * - **Bands:** each onset counts in the bands where its energy jumps (low: kicks and bass, mid:
 *   snares and most notes, high: hats and cymbals), for the drum picture. The bands are filtered out
 *   of the signal and compared over 20 ms: frames of 23 ms have bins 43 Hz wide, where a kick's tail
 *   and a bass note share bins and beat against each other from frame to frame.
 */
import { RealFft, blackmanHarris, previousPowerOfTwo } from './fft';
import { filter, highpass, lowpass } from './filters';

/** The bands onsets are sorted into, hertz. */
export const ONSET_BANDS = {
	low: [30, 200],
	mid: [200, 4000],
	high: [6000, 16000]
} as const;

/** An onset band's name. */
export type OnsetBand = keyof typeof ONSET_BANDS;

const BAND_NAMES = ['low', 'mid', 'high'] as const;

/** Where the flux looks, hertz. */
const FULL_BAND = [30, 16000] as const;

/** Log compression: log(1 + γ·amplitude), amplitude 1 for a full-scale sine in one bin. */
const GAMMA = 1000;
/**
 * A bin rises only above the highest value it held over this long before, seconds (a maximum
 * filter in time, after SuperFlux's in frequency): partials closer than a bin's width beat against
 * each other, so a low saw's many harmonics make every bin swell and fade tens of times a second,
 * while a real onset rises above anything held just before. The price: two onsets in the same bins
 * closer than this count as one (a flam, a fast ratchet).
 */
const LOOKBACK = 0.045;
/**
 * …and by at least this much (natural log of the magnitude, about 1 dB): a steady tone's bins
 * swell and fade periodically, and a frame can catch the swell a little higher than the frames
 * before it did (a held A1 saw gave 47 onsets in 8 s without this, none with it).
 */
const MARGIN = 0.1;
/** Bins more than this far under the frame's strongest are held at that level, dB. */
const FRAME_RANGE_DB = 60;
/** A flux below this (weighted mean rise per bin, natural log) is nothing, however it compares. */
const MIN_FLUX = 0.002;
/** An onset's frame must be louder than this (RMS, dBFS): a noise floor has no onsets. */
const MIN_LEVEL_DB = -55;

/** Peak picking windows, seconds. */
const PRE_MAX = 0.03;
const POST_MAX = 0.03;
const PRE_AVG = 0.1;
const POST_AVG = 0.07;
/** Peaks of one detector closer than this are one. */
const MIN_GAP = 0.03;
/** Onsets found closer than this (by any detectors) are one, seconds. */
const MERGE = 0.02;
/** A peak must stand this many times above the local mean (plus delta). */
const LAMBDA = 2;

/**
 * An offset, not an onset: the energy after the flux peak is below this share of the energy before,
 * both plain and weighted toward the highs.
 */
const FALL = 0.8;

/**
 * A band counts for an onset when its energy (the band filtered out of the signal, 20 ms after the
 * onset against 20 ms ending 5 ms before it) grows at least this much…
 */
const BAND_RISE = 2;
/** …and holds at least this share of the whole signal's energy after it (−30 dB). */
const BAND_SHARE = 1e-3;
/** Those windows, seconds. */
const BAND_SPAN = 0.02;
const BAND_GUARD = 0.005;

/** The window for the steepest energy rise, seconds… */
const RISE_WINDOW = 0.0025;
/** …and in the lows, where 2.5 ms is inside one cycle and would follow the waveform, not the rise. */
const LOW_RISE_WINDOW = 0.01;
/** A rise out of near-silence: the energy after is at least this many times the energy before. */
const CLEAN_GAIN = 10;
/**
 * Where a transient sits, on average, in the frame whose flux peaks: this share of the frame in.
 * Measured on clicks, drums and saw notes at 22.05, 44.1 and 48 kHz: placed this way they land
 * within about 3 ms, without bias (`onsets.spec.ts`).
 */
const PEAK_DELAY = 0.58;

/** One onset. */
export interface Onset {
	/** Seconds from the start. */
	readonly time: number;
	/** The pulse at the onset over its largest (loud hits near 1, quiet ones lower), 0–1. */
	readonly strength: number;
}

/** What onset detection found. */
export interface OnsetAnalysis {
	/** Envelope frames per second. */
	readonly frameRate: number;
	/** The flux, one value per frame, the largest scaled to 1 (all 0 when nothing rose). */
	readonly envelope: Float32Array;
	/**
	 * What tempo is read from: the flux plus the square root of the rise in power (both scaled to
	 * 1), so a loud kick or snare counts for more than a hat. The log flux alone weighs a noisy hat
	 * about as much as a kick, and a beat with hats on every eighth would read at double time.
	 */
	readonly pulse: Float32Array;
	readonly onsets: readonly Onset[];
	/** The times of the onsets that count in each band, seconds. */
	readonly bands: Readonly<Record<OnsetBand, readonly number[]>>;
}

/** Options for {@link detectOnsets}. */
export interface OnsetOptions {
	/** How far a peak must rise above the local mean, as a share of the largest flux (default 0.05). */
	readonly delta?: number;
	/**
	 * Place onsets that rise out of near-silence to the sample (default true); false keeps every
	 * onset at its flux peak.
	 */
	readonly refine?: boolean;
}

/** The channels averaged to one. */
export function mono(channels: readonly ArrayLike<number>[]): Float32Array {
	const n = channels[0]?.length ?? 0;
	const out = new Float32Array(n);
	for (const channel of channels) for (let i = 0; i < n; i++) out[i] += channel[i];
	if (channels.length > 1) for (let i = 0; i < n; i++) out[i] /= channels.length;
	return out;
}

/**
 * Frame indices where `flux` peaks above its adaptive threshold, in frames `loud` allows; `scale`
 * is what delta is a share of (default the largest value of `flux`).
 */
function pick(
	flux: Float64Array,
	loud: Uint8Array,
	frameRate: number,
	delta: number,
	scale?: number
): number[] {
	let max = scale ?? 0;
	if (scale === undefined) for (const v of flux) if (v > max) max = v;
	if (max < MIN_FLUX) return [];
	const preMax = Math.max(1, Math.round(PRE_MAX * frameRate));
	const postMax = Math.max(1, Math.round(POST_MAX * frameRate));
	const preAvg = Math.max(1, Math.round(PRE_AVG * frameRate));
	const postAvg = Math.max(1, Math.round(POST_AVG * frameRate));
	const gap = Math.max(1, Math.round(MIN_GAP * frameRate));
	const n = flux.length;
	const cum = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + flux[i] / max;
	const out: number[] = [];
	let last = -Infinity;
	for (let i = 0; i < n; i++) {
		const v = flux[i];
		if (v < MIN_FLUX || !loud[i]) continue;
		let isMax = true;
		for (let j = Math.max(0, i - preMax); j <= Math.min(n - 1, i + postMax); j++) {
			// ties go to the first frame of a plateau
			if (flux[j] > v || (flux[j] === v && j < i)) {
				isMax = false;
				break;
			}
		}
		if (!isMax) continue;
		const lo = Math.max(0, i - preAvg);
		const hi = Math.min(n, i + postAvg + 1);
		const mean = (cum[hi] - cum[lo]) / (hi - lo);
		if (v / max < LAMBDA * mean + delta) continue;
		if (i - last < gap) continue;
		out.push(i);
		last = i;
	}
	return out;
}

/** The most of the three frames after `f` (a note that comes back after a dip keeps its onset). */
function after(e: Float64Array, f: number): number {
	const last = e.length - 1;
	return Math.max(e[Math.min(last, f + 1)], e[Math.min(last, f + 2)], e[Math.min(last, f + 3)]);
}

/** The frame two before `f`. */
const before = (e: Float64Array, f: number) => e[Math.max(0, f - 2)];

/** Whether energy `e` falls across frame `f`. */
function falls(e: Float64Array, f: number): boolean {
	const a = after(e, f);
	return a < FALL * before(e, f) || a <= 0;
}

/** Where a parabola through the flux at f − 1, f, f + 1 peaks, in frames (f ± 0.5). */
function peakFrame(flux: Float64Array, f: number): number {
	if (f <= 0 || f >= flux.length - 1) return f;
	const [a, b, c] = [flux[f - 1], flux[f], flux[f + 1]];
	const den = a - 2 * b + c;
	return den < 0 ? f + Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : f;
}

/**
 * The sample in `[from, to)` where the summed energy `cum` rises most (the energy over the `w`
 * samples after it minus the `w` before; the latest of equal maxima), and how many times the energy
 * after it is the energy before.
 */
function steepestRise(
	cum: Float64Array,
	from: number,
	to: number,
	w: number
): { at: number; gain: number } {
	let best = -Infinity;
	let at = from;
	for (let i = from; i < to; i++) {
		const rise = cum[i + w] - 2 * cum[i] + cum[i - w];
		if (rise >= best) {
			best = rise;
			at = i;
		}
	}
	const a = cum[at + w] - cum[at];
	const b = cum[at] - cum[at - w];
	return { at, gain: a / Math.max(b, a * 1e-6, 1e-24) };
}

/** Summed squares of `x`, for energies over any stretch. */
function summed(x: ArrayLike<number>): Float64Array {
	const cum = new Float64Array(x.length + 1);
	for (let i = 0; i < x.length; i++) cum[i + 1] = cum[i] + x[i] * x[i];
	return cum;
}

/**
 * Onsets of `channels` (averaged to mono) at `sampleRate`: the envelopes for tempo, each onset's
 * time and strength, and the onsets that count in each band.
 */
export function detectOnsets(
	channels: readonly ArrayLike<number>[],
	sampleRate: number,
	options: OnsetOptions = {}
): OnsetAnalysis {
	const delta = options.delta ?? 0.05;
	const refine = options.refine ?? true;
	const x = mono(channels);
	const size = Math.max(256, previousPowerOfTwo(0.03 * sampleRate));
	const hop = size / 4;
	const frameRate = sampleRate / hop;
	// frame f covers [f·hop, f·hop + size): only whole frames, because a recording starts and stops
	// in the middle of the music, and padding it with silence would make both ends sound like onsets
	const count = x.length >= size ? Math.floor((x.length - size) / hop) + 1 : 0;
	const real = new RealFft(size);
	const w = blackmanHarris(size);
	// a sine of amplitude A peaks at A·Σw/2 in its bin
	const norm = (0.35875 * size) / 2;
	const binHz = sampleRate / size;
	const binOf = (hz: number) => Math.round(Math.min(hz, sampleRate / 2) / binHz);
	const lo = Math.max(1, binOf(FULL_BAND[0]));
	const hi = Math.min(real.bins - 1, binOf(FULL_BAND[1]));
	// a third of an octave spans 0.23·k bins at bin k: weigh each bin by the inverse of that
	const weight = Float64Array.from({ length: real.bins }, (_, k) => 1 / Math.max(1, 0.2316 * k));
	let weights = 0;
	for (let k = lo; k <= hi; k++) weights += weight[k];
	const highLo = Math.max(1, binOf(ONSET_BANDS.high[0]));
	const highHi = Math.min(real.bins - 1, binOf(ONSET_BANDS.high[1]));

	const flux = new Float64Array(count);
	/** The same rise over the high band alone (hats and cymbals, above a held chord's ripple). */
	const highFlux = new Float64Array(count);
	/** Energy per frame: all of it, weighted toward the highs, the highs alone; and the power rise. */
	const plain = new Float64Array(count);
	const bright = new Float64Array(count);
	const highEnergy = new Float64Array(count);
	const accent = new Float64Array(count);
	const level = new Float64Array(count);
	const re = new Float64Array(real.bins);
	const im = new Float64Array(real.bins);
	const power = new Float64Array(real.bins);
	const lastPower = new Float64Array(real.bins);
	// the last few frames' log magnitudes, and each bin's highest among them
	const back = Math.max(1, Math.round(LOOKBACK * frameRate));
	const history = Array.from({ length: back }, () => new Float64Array(real.bins));
	const previous = new Float64Array(real.bins);
	const current = new Float64Array(real.bins);
	for (let f = 0; f < count; f++) {
		const frame = x.subarray(f * hop, f * hop + size);
		real.transform(frame, re, im, w);
		let squares = 0;
		for (const v of frame) squares += v * v;
		level[f] = squares / size;
		let strongest = 0;
		for (let k = 0; k < real.bins; k++) {
			power[k] = re[k] * re[k] + im[k] * im[k];
			if (power[k] > strongest) strongest = power[k];
		}
		const held = strongest * 10 ** (-FRAME_RANGE_DB / 10);
		previous.fill(0);
		for (let j = 0; j < Math.min(back, f); j++) {
			const h = history[j];
			for (let k = lo; k <= hi; k++) {
				if (h[k] > previous[k]) previous[k] = h[k];
			}
		}
		let rises = 0;
		let highRises = 0;
		let p = 0;
		let b = 0;
		let h = 0;
		let a = 0;
		for (let k = 0; k < real.bins; k++) {
			current[k] = Math.log1p((GAMMA * Math.sqrt(Math.max(held, power[k]))) / norm);
			if (k < lo || k > hi) continue;
			const high = k >= highLo && k <= highHi;
			// a held bin has not risen, whatever the level it is held at did
			const rise = current[k] - previous[k] - MARGIN;
			if (f > 0 && power[k] > held && rise > 0) {
				rises += weight[k] * rise;
				if (high) highRises += rise;
			}
			p += power[k];
			b += power[k] * k * k;
			if (high) h += power[k];
			if (f > 0 && power[k] > lastPower[k]) a += power[k] - lastPower[k];
		}
		flux[f] = rises / weights;
		highFlux[f] = highRises / Math.max(1, highHi - highLo + 1);
		plain[f] = p;
		bright[f] = b;
		highEnergy[f] = h;
		accent[f] = a;
		lastPower.set(power);
		history[f % back].set(current);
	}

	// an offset's flux is no onset: silence it before picking, so it cannot hide a real onset next
	// to it behind the ±30 ms maximum
	for (let f = 0; f < count; f++) {
		if (falls(plain, f) && falls(bright, f)) {
			flux[f] = 0;
			accent[f] = 0;
			highFlux[f] = 0;
		}
		if (falls(highEnergy, f)) highFlux[f] = 0;
	}

	let max = 0;
	for (const v of flux) if (v > max) max = v;
	const envelope = Float32Array.from(flux, (v) => (max > 0 ? v / max : 0));
	let loudest = 0;
	for (const v of accent) if (v > loudest) loudest = v;
	const pulse = Float32Array.from(envelope, (v, f) =>
		loudest > 0 ? v + Math.sqrt(accent[f] / loudest) : v
	);
	let peakPulse = 0;
	for (const v of pulse) if (v > peakPulse) peakPulse = v;

	const floor = 10 ** (MIN_LEVEL_DB / 10);
	const loud = Uint8Array.from({ length: count }, (_, f) =>
		Math.max(level[f], level[Math.min(count - 1, f + 1)]) >= floor ? 1 : 0
	);
	const riseWindow = Math.max(2, Math.round(RISE_WINDOW * sampleRate));
	const whole = summed(x);
	const lowCut = lowpass(ONSET_BANDS.low[1], sampleRate);
	const lows = summed(filter(filter(x, lowCut), lowCut));
	const mids = summed(
		filter(
			filter(x, highpass(ONSET_BANDS.mid[0], sampleRate)),
			lowpass(ONSET_BANDS.mid[1], sampleRate)
		)
	);
	const highCut = highpass(ONSET_BANDS.high[0], sampleRate);
	const highs = summed(filter(filter(x, highCut), highCut));
	const bandSums: Record<OnsetBand, Float64Array> = { low: lows, mid: mids, high: highs };
	// the lows' own onsets: their energy per frame rising over its highest in the look-back before
	// the frame (frames that do not overlap it: a kick slides into a window over four hops). A kick
	// under a loud bass fills only a few bins the bass already holds, so the flux barely moves.
	const lowEnergy = Float64Array.from(
		{ length: count },
		(_, f) => lows[f * hop + size] - lows[f * hop]
	);
	const lowRise = new Float64Array(count);
	const apart = size / hop;
	for (let f = apart; f < count; f++) {
		let held = 0;
		for (let j = Math.max(0, f - apart - back); j <= f - apart; j++)
			held = Math.max(held, lowEnergy[j]);
		const e = lowEnergy[f];
		lowRise[f] = e > 0 && held > 0 ? Math.max(0, Math.log(e / held)) : 0;
	}
	const lowFrames: number[] = [];
	const gap = Math.max(1, Math.round(MIN_GAP * frameRate));
	for (let f = 1; f < count; f++) {
		const v = lowRise[f];
		if (v < Math.log(BAND_RISE) || !loud[f]) continue;
		if (lowEnergy[f] < BAND_SHARE * (whole[f * hop + size] - whole[f * hop])) continue;
		let isMax = true;
		for (let j = Math.max(1, f - gap); j <= Math.min(count - 1, f + gap); j++) {
			if (lowRise[j] > v || (lowRise[j] === v && j < f)) {
				isMax = false;
				break;
			}
		}
		if (isMax && (lowFrames.length === 0 || f - lowFrames[lowFrames.length - 1] >= gap)) {
			lowFrames.push(f);
		}
	}
	const span = Math.max(1, Math.round(BAND_SPAN * sampleRate));
	const guard = Math.round(BAND_GUARD * sampleRate);
	const over = (cum: Float64Array, a: number, b: number) => {
		const n = cum.length - 1;
		return cum[Math.max(0, Math.min(n, b))] - cum[Math.max(0, Math.min(n, a))];
	};
	/** The bands whose energy jumps at `t` seconds. */
	const bandsAt = (t: number): OnsetBand[] => {
		const i = Math.round(t * sampleRate);
		const total = over(whole, i, i + span);
		return BAND_NAMES.filter((band) => {
			const cum = bandSums[band];
			const a = over(cum, i, i + span);
			const b = over(cum, i - guard - span, i - guard);
			return a >= BAND_RISE * b && a >= BAND_SHARE * total && a > 0;
		});
	};
	// two second-order low-passes delay the lows by twice √2/(2π·fc)
	const lowLag = (2 * Math.SQRT2) / (2 * Math.PI * ONSET_BANDS.low[1]);
	/** A placed onset, and whether it sits on a clean rise out of near-silence (to the sample). */
	type Placed = { readonly time: number; readonly exact: boolean };
	/** The whole signal's own rise within 3 ms of `t`, which the filters' lag cannot blur. */
	const pin = (t: number): Placed => {
		const reach = Math.round(0.003 * sampleRate);
		const at = Math.round(t * sampleRate);
		const a = Math.max(riseWindow, at - reach);
		const b = Math.min(x.length - riseWindow, at + reach);
		const pinned = b > a ? steepestRise(whole, a, b, riseWindow) : null;
		if (!pinned || pinned.gain < 2) return { time: t, exact: false };
		return { time: pinned.at / sampleRate, exact: pinned.gain >= CLEAN_GAIN };
	};
	const place = (f: number, low: boolean): Placed => {
		const estimate = (peakFrame(flux, f) * hop + PEAK_DELAY * size) / sampleRate;
		const from = Math.max(riseWindow, f * hop - hop);
		const to = Math.min(x.length - riseWindow, f * hop + size + hop);
		if (!refine || to <= from) return { time: estimate, exact: false };
		const near = (t: number) => Math.abs(t - estimate) <= size / 2 / sampleRate;
		const rise = steepestRise(whole, from, to, riseWindow);
		if (rise.gain >= CLEAN_GAIN && near(rise.at / sampleRate)) {
			return { time: rise.at / sampleRate, exact: true };
		}
		if (low) {
			// clean in the lows (a kick under a held chord): found there, then pinned
			const own = steepestRise(lows, from, to, riseWindow);
			const t = own.at / sampleRate - lowLag;
			if (own.gain >= CLEAN_GAIN && near(t)) return pin(t);
		}
		return { time: estimate, exact: false };
	};

	// a rise in the lows' energy: it happened between the last frame that does not overlap frame f
	// and the end of f; found in the lows, then pinned on the whole signal's own rise within a few ms
	const lowWindow = Math.max(2, Math.round(LOW_RISE_WINDOW * sampleRate));
	/** The lows' power over the `lowWindow` samples ending at `i`. */
	const lowPower = (i: number) => (lows[i] - lows[i - lowWindow]) / lowWindow;
	const placeLow = (f: number): Placed => {
		const from = Math.max(2 * lowWindow, (f - apart) * hop);
		const to = Math.min(x.length, f * hop + size + lowWindow);
		if (to <= from) return { time: (f * hop) / sampleRate, exact: false };
		// a quarter of the way from the level before to the peak after, on an envelope smoothed over
		// 10 ms (a bass under the kick ripples faster than that), less a quarter of the smoothing and
		// the filters' lag; a quarter, not half, because a kick sweeping down through a bass swells
		// twice, and the second swell can be the larger
		let base = 0;
		for (let i = from - lowWindow; i < from; i++) base += lowPower(i);
		base /= lowWindow;
		let peak = 0;
		for (let i = from; i < to; i++) peak = Math.max(peak, lowPower(i));
		const quarter = base + 0.25 * (peak - base);
		let cross = from;
		while (cross < to && lowPower(cross) < quarter) cross++;
		const t = (cross - lowWindow / 4) / sampleRate - lowLag;
		return refine ? pin(t) : { time: t, exact: false };
	};

	// onsets over the whole spectrum, in the highs alone (measured against the same scale, so the
	// highs' ripple of a held chord does not count) and in the lows' energy, one list in time order
	const found = [
		...pick(flux, loud, frameRate, delta).map((f) => ({ f, low: false })),
		...pick(highFlux, loud, frameRate, delta, max).map((f) => ({ f, low: false })),
		...lowFrames.map((f) => ({ f, low: true }))
	]
		.map(({ f, low }) => {
			const estimate = (peakFrame(flux, f) * hop + PEAK_DELAY * size) / sampleRate;
			const placed = low ? placeLow(f) : place(f, bandsAt(estimate).includes('low'));
			return { ...placed, low, strength: peakPulse > 0 ? pulse[f] / peakPulse : 0 };
		})
		.sort((p, q) => p.time - q.time);
	const onsets: Onset[] = [];
	const bands: Record<OnsetBand, number[]> = { low: [], mid: [], high: [] };
	// one transient found by two detectors (or twice by one) is one onset, placed where it was
	// placed to the sample, else where the lows put it (a kick), else first
	let group: typeof found = [];
	const flush = () => {
		if (group.length === 0) return;
		const time = (group.find((g) => g.exact) ?? group.find((g) => g.low) ?? group[0]).time;
		const strength = Math.max(...group.map((g) => g.strength));
		onsets.push({ time, strength });
		for (const band of bandsAt(time)) bands[band].push(time);
		group = [];
	};
	for (const candidate of found) {
		if (group.length > 0 && candidate.time - group[0].time >= MERGE) flush();
		group.push(candidate);
	}
	flush();
	return { frameRate, envelope, pulse, onsets, bands };
}
