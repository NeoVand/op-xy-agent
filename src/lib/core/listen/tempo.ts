/**
 * Tempo and the timing grid.
 *
 * - **Tempo:** the autocorrelation of the onset pulse (lightly smoothed, mean removed, unbiased)
 *   scores every candidate from 40 to 220 BPM, the OP-XY's range, as the mean correlation at one to
 *   four beat periods, so a pulse that keeps repeating beats one that lines up once. A rhythm
 *   repeats at several related periods (a beat also repeats every two beats, a bar every four), so
 *   every candidate scoring at least three quarters of the best is a reading of the same rhythm (a
 *   loud bass or chord under the drums lowers every score, the right one too). The set tempo, when
 *   known, picks among them (the reading nearest to it); otherwise the reading a listener would most
 *   likely tap, weighted by a log-normal preference around 120 BPM an octave wide (as in Ellis 2007
 *   and librosa). Confidence is how far the winner stands above the median candidate. The result
 *   says how the heard tempo relates to the set one (the same, double, half, 3:2, 2:3 or different)
 *   and how well the rhythm supports the set tempo itself.
 * - **Grid:** onsets against a beat grid at a tempo (the set one when the envelope supports it). The
 *   phase is where the most onset strength falls on beats, refined by least squares on the onsets
 *   near the beats. Each onset gets its place in the beat (on the beat, the "e", the "and", the
 *   "a"); the swing is where the off-sixteenths sit in their pair (50 % straight, 66.7 % a triplet
 *   feel; below 50 the OP-XY's shuffle side pulls them early), and the tightness is the spread of
 *   the onsets around the swung grid, measured robustly (from the median distance) so a stray onset
 *   or two do not read as loose timing; those are counted apart.
 */
import type { Onset } from './onsets';

/** The tempi the OP-XY can be set to, BPM. */
export const TEMPO_RANGE = { min: 40, max: 220 } as const;

/** Candidates are scored every this many BPM before the winner is interpolated. */
const STEP_BPM = 0.25;
/** Candidates this close to the best score are readings of the same rhythm (metrical levels). */
const READING = 0.75;
/** Without a set tempo, readings are weighted by a log-normal preference: its centre, BPM… */
const PREFERRED_BPM = 120;
/** …and its width, octaves. */
const PREFERENCE_OCTAVES = 1;
/** Other readings worth naming: at least this share of the winner's score. */
const ALTERNATIVE = 0.8;
/** The envelope's shortest useful length, seconds (two periods of the slowest beat and a bit). */
const MIN_SECONDS = 3;
/** An onset this far off the grid is a stray, seconds. */
const STRAY = 0.03;
/**
 * Swing is measured when the slots it moves hold at least this many onsets and this share of
 * them, clustered within this spread (robust standard deviation, seconds): swung notes sit in one
 * place, while stray onsets between the eighths (decays, ghost notes) scatter.
 */
const SWING_MIN = 4;
const SWING_SHARE = 0.15;
const SWING_SPREAD = 0.012;

/** How a heard tempo relates to the set one. */
export type TempoRelation =
	'same' | 'double' | 'half' | 'three-halves' | 'two-thirds' | 'different';

/** The heard tempo against the tempo the sequencer is set to. */
export interface ExpectedTempo {
	readonly bpm: number;
	/** The heard tempo is the set one, twice it, half it, … */
	readonly relation: TempoRelation;
	/** How well the envelope supports the set tempo, against the heard tempo's score (0–1). */
	readonly support: number;
	/** Heard minus set, BPM, when they are the same tempo. */
	readonly offBy: number | null;
}

/** What the tempo analysis heard. */
export interface TempoEstimate {
	/** BPM, to a tenth. */
	readonly bpm: number;
	/** 0 (no pulse) to 1 (a metronome). */
	readonly confidence: number;
	/** Other readings the envelope supports nearly as well (half or double time, mostly), BPM. */
	readonly alternatives: readonly number[];
	readonly expected: ExpectedTempo | null;
}

/** Options for {@link estimateTempo}. */
export interface TempoOptions {
	/** The tempo the sequencer is set to, when known. */
	readonly expectedBpm?: number | null;
}

/** `x` smoothed with a Gaussian of `sigma` samples. */
function smooth(x: ArrayLike<number>, sigma: number): Float64Array {
	const radius = Math.ceil(3 * sigma);
	const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) =>
		Math.exp(-0.5 * ((i - radius) / sigma) ** 2)
	);
	const sum = kernel.reduce((a, b) => a + b, 0);
	const out = new Float64Array(x.length);
	for (let i = 0; i < x.length; i++) {
		let v = 0;
		for (let k = -radius; k <= radius; k++) {
			const j = i + k;
			if (j >= 0 && j < x.length) v += x[j] * kernel[k + radius];
		}
		out[i] = v / sum;
	}
	return out;
}

/** The normalised, unbiased autocorrelation of `x` for lags 0 … `maxLag`. */
function autocorrelation(x: Float64Array, maxLag: number): Float64Array {
	const n = x.length;
	const r = new Float64Array(maxLag + 1);
	for (let lag = 0; lag <= maxLag; lag++) {
		let sum = 0;
		for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
		r[lag] = sum / (n - lag);
	}
	const zero = r[0];
	if (zero > 0) for (let lag = 0; lag <= maxLag; lag++) r[lag] /= zero;
	return r;
}

/** `r` at a fractional lag (linear interpolation; 0 beyond its end). */
function at(r: Float64Array, lag: number): number {
	const i = Math.floor(lag);
	if (i + 1 >= r.length) return i < r.length ? r[i] : 0;
	const f = lag - i;
	return r[i] * (1 - f) + r[i + 1] * f;
}

/** How `heard` relates to `set` (both BPM). */
export function tempoRelation(heard: number, set: number): TempoRelation {
	const ratio = heard / set;
	const near = (target: number, tolerance: number) =>
		Math.abs(ratio - target) <= target * tolerance;
	if (near(1, 0.03)) return 'same';
	if (near(2, 0.03)) return 'double';
	if (near(0.5, 0.03)) return 'half';
	if (near(1.5, 0.03)) return 'three-halves';
	if (near(2 / 3, 0.03)) return 'two-thirds';
	return 'different';
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The tempo in an onset envelope (`detectOnsets(...).envelope` at `frameRate` frames a second), or
 * null when it is shorter than {@link MIN_SECONDS} or holds no onsets.
 */
export function estimateTempo(
	envelope: ArrayLike<number>,
	frameRate: number,
	options: TempoOptions = {}
): TempoEstimate | null {
	const n = envelope.length;
	if (n < MIN_SECONDS * frameRate) return null;
	const e = smooth(envelope, Math.max(1, 0.006 * frameRate));
	const mean = e.reduce((s, v) => s + v, 0) / n;
	let energy = 0;
	for (let i = 0; i < n; i++) {
		e[i] -= mean;
		energy += e[i] * e[i];
	}
	if (!(energy > 1e-12)) return null;
	// lags up to four periods of the slowest tempo, and no further than most of the take
	const maxLag = Math.min(
		n - 2,
		Math.floor(0.8 * n),
		Math.ceil(4 * (60 / TEMPO_RANGE.min) * frameRate) + 2
	);
	const r = autocorrelation(e, maxLag);

	const score = (bpm: number): number => {
		const lag = (60 * frameRate) / bpm;
		const k = Math.max(1, Math.min(4, Math.floor(maxLag / lag)));
		let sum = 0;
		for (let m = 1; m <= k; m++) sum += at(r, m * lag);
		return sum / k;
	};
	const bpms: number[] = [];
	for (let b = TEMPO_RANGE.min; b <= TEMPO_RANGE.max + 1e-9; b += STEP_BPM) bpms.push(b);
	const scores = bpms.map(score);
	const best = Math.max(...scores);
	if (!(best > 0)) return null;

	// local maxima of the score; those near the best are readings of one rhythm
	const peaks: number[] = [];
	for (let i = 0; i < scores.length; i++) {
		const left = i > 0 ? scores[i - 1] : -Infinity;
		const right = i < scores.length - 1 ? scores[i + 1] : -Infinity;
		if (scores[i] >= left && scores[i] > right) peaks.push(i);
	}
	const readings = peaks.filter((i) => scores[i] >= READING * best);
	const set = options.expectedBpm;
	const known = set && set >= TEMPO_RANGE.min && set <= TEMPO_RANGE.max ? set : null;
	const preference = (b: number) =>
		Math.exp(-0.5 * (Math.log2(b / PREFERRED_BPM) / PREFERENCE_OCTAVES) ** 2);
	const chosen = readings.reduce((a, b) =>
		known !== null
			? Math.abs(Math.log2(bpms[b] / known)) < Math.abs(Math.log2(bpms[a] / known))
				? b
				: a
			: scores[b] * preference(bpms[b]) > scores[a] * preference(bpms[a])
				? b
				: a
	);
	let bpm = bpms[chosen];
	if (chosen > 0 && chosen < scores.length - 1) {
		const [a, b, c] = [scores[chosen - 1], scores[chosen], scores[chosen + 1]];
		const den = a - 2 * b + c;
		if (den < 0) bpm += STEP_BPM * Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
	}
	const sorted = [...scores].sort((x, y) => x - y);
	const median = sorted[Math.floor(sorted.length / 2)];
	const confidence = Math.max(0, Math.min(1, (scores[chosen] - median) / (1 - median)));
	const alternatives = peaks
		.filter((i) => i !== chosen && scores[i] >= ALTERNATIVE * scores[chosen])
		.filter((i) => Math.abs(bpms[i] - bpm) > 0.03 * bpm)
		.sort((x, y) => scores[y] - scores[x])
		.slice(0, 3)
		.map((i) => round1(bpms[i]));

	let expected: ExpectedTempo | null = null;
	if (known !== null) {
		const relation = tempoRelation(bpm, known);
		expected = {
			bpm: known,
			relation,
			support: Math.max(0, Math.min(1, score(known) / best)),
			offBy: relation === 'same' ? round1(bpm - known) : null
		};
	}
	return { bpm: round1(bpm), confidence, alternatives, expected };
}

/** Where onsets fall in the beat, as shares of them. */
export interface BeatPositions {
	/** On the beat. */
	readonly beat: number;
	/** The second sixteenth, the "e". */
	readonly e: number;
	/** The off-beat eighth, the "and". */
	readonly and: number;
	/** The fourth sixteenth, the "a". */
	readonly a: number;
}

/** Onsets against a beat grid. */
export interface GridStats {
	/** The grid's tempo, BPM (refined from the onsets). */
	readonly bpm: number;
	/** Where the first beat falls, seconds (0 ≤ phase < one beat). */
	readonly phase: number;
	/** Onsets placed on the grid. */
	readonly onsets: number;
	/**
	 * How far onsets stray from the swung sixteenth grid, ms: the spread of their distances as a
	 * standard deviation (1.4826 × the median distance, so a few stray onsets do not count).
	 */
	readonly tightnessMs: number;
	/** The share of onsets more than 30 ms off the grid (flams, pushes, or notes off the grid). */
	readonly stray: number;
	/** Where the off-sixteenths sit in their pair, percent: 50 straight, 66.7 triplet; null without. */
	readonly swing: number | null;
	/** Where the "and"s sit in the beat, percent (50 straight); null without them. */
	readonly swingEighth: number | null;
	readonly positions: BeatPositions;
}

type Slot = keyof BeatPositions;

/** The slot of a place in the beat (0–1) and its nominal place. */
function slotOf(u: number): { slot: Slot; nominal: number } {
	if (u >= 0.94) return { slot: 'beat', nominal: 1 };
	if (u < 0.1) return { slot: 'beat', nominal: 0 };
	if (u < 0.4375) return { slot: 'e', nominal: 0.25 };
	if (u < 0.6) return { slot: 'and', nominal: 0.5 };
	return { slot: 'a', nominal: 0.75 };
}

function median(values: readonly number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The share of `times` in each slot of the beat, on a grid of `bpm` whose beats fall at `phase`. */
export function beatPositions(
	times: readonly number[],
	bpm: number,
	phase: number
): BeatPositions & { readonly count: number } {
	const period = 60 / bpm;
	const counts: Record<Slot, number> = { beat: 0, e: 0, and: 0, a: 0 };
	for (const t of times) {
		const u = ((((t - phase) / period) % 1) + 1) % 1;
		counts[slotOf(u).slot]++;
	}
	const n = Math.max(1, times.length);
	return {
		beat: counts.beat / n,
		e: counts.e / n,
		and: counts.and / n,
		a: counts.a / n,
		count: times.length
	};
}

/**
 * `onsets` against a beat grid at `bpm`: phase, place in the beat, swing and tightness; null with
 * fewer than four onsets.
 */
export function beatGrid(onsets: readonly Onset[], bpm: number): GridStats | null {
	if (onsets.length < 4 || !(bpm > 0)) return null;
	let period = 60 / bpm;
	const sigma = 0.01;
	// the phase that puts the most (squared) strength on beats
	let phase = 0;
	let bestScore = -Infinity;
	for (let p = 0; p < period; p += 0.0005) {
		let s = 0;
		for (const o of onsets) {
			const d = (((o.time - p) % period) + period) % period;
			const dist = Math.min(d, period - d);
			s += o.strength * o.strength * Math.exp(-0.5 * (dist / sigma) ** 2);
		}
		if (s > bestScore) {
			bestScore = s;
			phase = p;
		}
	}
	// refine tempo and phase on the onsets near beats (least squares of time against beat number)
	const near = onsets
		.map((o) => ({ t: o.time, k: Math.round((o.time - phase) / period) }))
		.filter(({ t, k }) => Math.abs(t - phase - k * period) < 0.1 * period);
	const beats = new Set(near.map((p) => p.k));
	if (beats.size >= 3 && Math.max(...beats) - Math.min(...beats) >= 2) {
		const mk = near.reduce((s, p) => s + p.k, 0) / near.length;
		const mt = near.reduce((s, p) => s + p.t, 0) / near.length;
		let num = 0;
		let den = 0;
		for (const p of near) {
			num += (p.k - mk) * (p.t - mt);
			den += (p.k - mk) ** 2;
		}
		const fitted = num / den;
		if (Math.abs(fitted - period) / period < 0.01) {
			period = fitted;
			phase = mt - fitted * mk;
		}
	}
	phase = ((phase % period) + period) % period;

	const placed = onsets.map((o) => {
		const u = ((((o.time - phase) / period) % 1) + 1) % 1;
		const { slot, nominal } = slotOf(u);
		return { slot, offset: u - nominal };
	});
	const offsets = (slots: readonly Slot[]) =>
		placed.filter((p) => slots.includes(p.slot)).map((p) => p.offset);
	const off16 = offsets(['e', 'a']);
	const ands = offsets(['and']);
	const shift: Record<Slot, number> = {
		beat: offsets(['beat']).length > 0 ? median(offsets(['beat'])) : 0,
		e: off16.length > 0 ? median(off16) : 0,
		and: ands.length > 0 ? median(ands) : 0,
		a: off16.length > 0 ? median(off16) : 0
	};
	const distances = placed.map((p) => Math.abs((p.offset - shift[p.slot]) * period));
	const clustered = (offsets: readonly number[]) => {
		if (offsets.length < SWING_MIN || offsets.length < SWING_SHARE * placed.length) return false;
		const m = median(offsets);
		return 1.4826 * median(offsets.map((o) => Math.abs(o - m))) * period <= SWING_SPREAD;
	};
	const counts = beatPositions(
		onsets.map((o) => o.time),
		60 / period,
		phase
	);
	return {
		bpm: round1(60 / period),
		phase,
		onsets: onsets.length,
		tightnessMs: 1.4826 * median(distances) * 1000,
		stray: distances.filter((d) => d > STRAY).length / distances.length,
		swing: clustered(off16) ? round1(50 + 200 * shift.e) : null,
		swingEighth: clustered(ands) ? round1(50 + 100 * shift.and) : null,
		positions: { beat: counts.beat, e: counts.e, and: counts.and, a: counts.a }
	};
}
