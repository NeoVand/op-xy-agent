/**
 * Key and chord hints from a chromagram.
 *
 * - **Chroma:** the spectral peaks from 50 Hz to 5 kHz (frames of about 190 ms every half frame,
 *   each peak interpolated to a fraction of a bin) add their magnitude to the pitch class they are
 *   nearest, weighted by how close (cos², nothing at half a semitone off), so a tuned note lands in
 *   one class and noise spreads thin.
 * - **Key:** the Krumhansl–Kessler probe-tone profile (major and minor, all 24 rotations) that
 *   correlates best with the whole recording's chroma; the runner-up and the margin say how sure
 *   (the relative major or minor is the usual runner-up).
 * - **Chords:** each segment's chroma (a beat when the tempo is known) against triad, seventh,
 *   diminished and suspended templates by cosine. A template holds each chord note with its first
 *   six harmonics, decaying by 0.6 per harmonic (after Gómez 2006), because overtones land on other
 *   pitch classes (the third harmonic on the fifth, the fifth on the major third): with plain
 *   templates, the third harmonic of an F chord's A reads as an E, and the chord as Fmaj7. A lone
 *   segment between two equal ones is smoothed over, and equal neighbours merge into spans.
 *
 * These are hints: a drum loop has no key at all, and a mix leans on whatever is loudest.
 */
import { RealFft, hann, previousPowerOfTwo } from './fft';
import { mono } from './onsets';

/** Pitch-class names, C = 0. */
export const PITCH_CLASSES = [
	'C',
	'C#',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
] as const;

/** A pitch class's name. */
export type PitchClass = (typeof PITCH_CLASSES)[number];

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Tonics (pitch classes) whose key signature has sharps; the other keys but C major and A minor have flats. */
const SHARP_KEYS = { major: new Set([7, 2, 9, 4, 11, 6]), minor: new Set([4, 11, 6, 1, 8]) };
const PLAIN_KEYS = { major: 0, minor: 9 };

/**
 * The names a key spells the twelve pitch classes with, as its key signature does: sharps in G,
 * D, A, E, B and F# major (E, B, F#, C# and G# minor), flats in F, Bb, Eb, Ab and Db major (D, G,
 * C, F, Bb and Eb minor), the usual names in C major and A minor. So F minor's chords are Db and
 * Ab, not C# and G#.
 */
export function keySpelling(tonic: number, mode: 'major' | 'minor'): readonly string[] {
	if (tonic === PLAIN_KEYS[mode]) return PITCH_CLASSES;
	return SHARP_KEYS[mode].has(tonic) ? SHARP_NAMES : FLAT_NAMES;
}

/** A chord's name ("C#m7") with its root spelled from `names` ("Dbm7"); "N" stays. */
export function respellChord(chord: string, names: readonly string[]): string {
	const m = /^([A-G])([#b]?)(.*)$/.exec(chord);
	if (!m) return chord;
	const natural = PITCH_CLASSES.indexOf(m[1] as PitchClass);
	const pc = (natural + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
	return `${names[pc]}${m[3]}`;
}

/** The range spectral peaks are taken from, hertz. */
const LOW_HZ = 50;
const HIGH_HZ = 5000;
/** Peaks quieter than this under the frame's loudest are left out (dB). */
const PEAK_RANGE_DB = 60;
/** Nor any peak quieter than this sine amplitude (−80 dBFS). */
const PEAK_FLOOR = 1e-4;

/** Krumhansl–Kessler (1982) probe-tone ratings, tonic first. */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** A key is named when its profile correlates at least this well. */
const MIN_KEY_CORRELATION = 0.5;
/** A key is clear with this correlation and this margin over the runner-up. */
const CLEAR_CORRELATION = 0.75;
const CLEAR_MARGIN = 0.05;

/** Chord templates: intervals from the root, and the name's suffix. */
const CHORDS = [
	{ suffix: '', intervals: [0, 4, 7] },
	{ suffix: 'm', intervals: [0, 3, 7] },
	{ suffix: '7', intervals: [0, 4, 7, 10] },
	{ suffix: 'maj7', intervals: [0, 4, 7, 11] },
	{ suffix: 'm7', intervals: [0, 3, 7, 10] },
	{ suffix: 'dim', intervals: [0, 3, 6] },
	{ suffix: 'sus4', intervals: [0, 5, 7] }
] as const;
/** A segment names a chord only when its best template's cosine reaches this. */
const MIN_CHORD_SCORE = 0.6;
/** A note's harmonics as pitch-class offsets (1st to 6th: 0, 0, 7, 0, 4, 7) and their weights. */
const HARMONICS = [0, 0, 7, 0, 4, 7].map((offset, h) => ({ offset, weight: 0.6 ** h }));

/** Every chord's template: twelve weights, unit length, by name ("C", "Am7"). */
const TEMPLATES = CHORDS.flatMap(({ suffix, intervals }) =>
	PITCH_CLASSES.map((name, root) => {
		const t = new Float64Array(12);
		for (const i of intervals) {
			for (const { offset, weight } of HARMONICS) t[(root + i + offset) % 12] += weight;
		}
		const norm = Math.hypot(...t);
		return { chord: `${name}${suffix}`, template: t.map((v) => v / norm) };
	})
);
/** A segment this much quieter than the loudest (in chroma) has no chord. */
const QUIET_SEGMENT = 1e-3;

/** Chroma frame by frame. */
export interface Chromagram {
	/** Frames per second. */
	readonly frameRate: number;
	/** Seconds from the start to the centre of frame 0. */
	readonly start: number;
	/** Twelve magnitudes per frame, C first. */
	readonly frames: readonly Float64Array[];
	/** The frames summed. */
	readonly total: Float64Array;
}

/** The chromagram of `channels` (averaged to mono) at `sampleRate`. */
export function chromagram(channels: readonly ArrayLike<number>[], sampleRate: number): Chromagram {
	const x = mono(channels);
	const size = Math.max(1024, previousPowerOfTwo(0.19 * sampleRate));
	const hop = size / 2;
	const count = x.length >= size ? Math.floor((x.length - size) / hop) + 1 : 0;
	const real = new RealFft(size);
	const w = hann(size);
	const binHz = sampleRate / size;
	const lo = Math.max(2, Math.floor(LOW_HZ / binHz));
	const hi = Math.min(real.bins - 2, Math.ceil(Math.min(HIGH_HZ, sampleRate / 2) / binHz));
	const power = new Float64Array(real.bins);
	const magnitude = new Float64Array(real.bins);
	const frames: Float64Array[] = [];
	const total = new Float64Array(12);
	for (let f = 0; f < count; f++) {
		real.power(x.subarray(f * hop, f * hop + size), power, w);
		let loudest = 0;
		for (let k = 0; k < real.bins; k++) {
			// in sine amplitudes: a sine of amplitude A peaks at A
			magnitude[k] = Math.sqrt(power[k]) / (size / 4);
			if (k >= lo && k <= hi && magnitude[k] > loudest) loudest = magnitude[k];
		}
		const floor = Math.max(PEAK_FLOOR, loudest * 10 ** (-PEAK_RANGE_DB / 20));
		const chroma = new Float64Array(12);
		for (let k = lo; k <= hi; k++) {
			const m = magnitude[k];
			if (m < floor || m <= magnitude[k - 1] || m < magnitude[k + 1]) continue;
			// the true frequency: a parabola through the log magnitudes
			const [a, b, c] = [
				Math.log(magnitude[k - 1] + 1e-12),
				Math.log(m),
				Math.log(magnitude[k + 1] + 1e-12)
			];
			const den = a - 2 * b + c;
			const delta = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
			const hz = (k + delta) * binHz;
			const midi = 69 + 12 * Math.log2(hz / 440);
			const nearest = Math.round(midi);
			const weight = Math.cos(Math.PI * (midi - nearest)) ** 2;
			chroma[((nearest % 12) + 12) % 12] += weight * m;
		}
		for (let pc = 0; pc < 12; pc++) total[pc] += chroma[pc];
		frames.push(chroma);
	}
	return { frameRate: sampleRate / hop, start: size / 2 / sampleRate, frames, total };
}

/** Pearson correlation of two sequences of twelve. */
function correlation(x: ArrayLike<number>, y: ArrayLike<number>): number {
	let mx = 0;
	let my = 0;
	for (let i = 0; i < 12; i++) {
		mx += x[i] / 12;
		my += y[i] / 12;
	}
	let num = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < 12; i++) {
		num += (x[i] - mx) * (y[i] - my);
		dx += (x[i] - mx) ** 2;
		dy += (y[i] - my) ** 2;
	}
	return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

/** A key hint. */
export interface KeyEstimate {
	/** "A minor", "Eb major", spelled as the key signature does ("Db major", not "C# major"). */
	readonly key: string;
	/** The tonic's name ("Db") and pitch class (1). */
	readonly tonic: string;
	readonly pitchClass: number;
	readonly mode: 'major' | 'minor';
	/** How well its profile fits (Pearson r, −1…1). */
	readonly correlation: number;
	/** The next best key, and how far behind it is. */
	readonly runnerUp: string;
	readonly margin: number;
	/** Correlation and margin both comfortable. */
	readonly clear: boolean;
}

/** The key whose profile best fits `chroma` (twelve values, C first), or null for none. */
export function estimateKey(chroma: ArrayLike<number>): KeyEstimate | null {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += chroma[i];
	if (!(sum > 0)) return null;
	const fits: { tonic: number; mode: 'major' | 'minor'; r: number }[] = [];
	for (const [mode, profile] of [
		['major', MAJOR],
		['minor', MINOR]
	] as const) {
		for (let tonic = 0; tonic < 12; tonic++) {
			const rotated = Array.from({ length: 12 }, (_, pc) => profile[(pc - tonic + 12) % 12]);
			fits.push({ tonic, mode, r: correlation(chroma, rotated) });
		}
	}
	fits.sort((a, b) => b.r - a.r);
	const [best, next] = fits;
	if (best.r < MIN_KEY_CORRELATION) return null;
	const tonic = (f: (typeof fits)[number]) => keySpelling(f.tonic, f.mode)[f.tonic];
	const name = (f: (typeof fits)[number]) => `${tonic(f)} ${f.mode}`;
	const margin = best.r - next.r;
	return {
		key: name(best),
		tonic: tonic(best),
		pitchClass: best.tonic,
		mode: best.mode,
		correlation: best.r,
		runnerUp: name(next),
		margin,
		clear: best.r >= CLEAR_CORRELATION && margin >= CLEAR_MARGIN
	};
}

/** A chord over a stretch of the recording. */
export interface ChordSpan {
	/** Seconds. */
	readonly start: number;
	readonly end: number;
	/** "C", "Am", "G7", "Fmaj7", "Bdim", "Dsus4", or "N" for none. */
	readonly chord: string;
	/** The template's cosine with the chroma (0–1); 0 for none. */
	readonly score: number;
}

/** The closest chord to one chroma vector, or "N". */
export function nameChord(chroma: ArrayLike<number>): { chord: string; score: number } {
	let norm = 0;
	for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
	norm = Math.sqrt(norm);
	if (!(norm > 0)) return { chord: 'N', score: 0 };
	let best = { chord: 'N', score: 0 };
	for (const { chord, template } of TEMPLATES) {
		let dot = 0;
		for (let i = 0; i < 12; i++) dot += chroma[i] * template[i];
		const score = dot / norm;
		if (score > best.score) best = { chord, score };
	}
	return best.score >= MIN_CHORD_SCORE ? best : { chord: 'N', score: 0 };
}

/**
 * Chords segment by segment: segments of `seconds` aligned to `phase` (a beat grid's first beat;
 * the stretch before it is a segment of its own), smoothed and merged into spans.
 */
export function chordHints(chroma: Chromagram, seconds: number, phase = 0): ChordSpan[] {
	const count = chroma.frames.length;
	if (count === 0 || !(seconds > 0)) return [];
	const duration = chroma.start * 2 + (count - 1) / chroma.frameRate;
	const first = phase - Math.ceil(phase / seconds) * seconds;
	const segments: { start: number; end: number; chroma: Float64Array }[] = [];
	for (let t = first; t < duration; t += seconds) {
		segments.push({
			start: Math.max(0, t),
			end: Math.min(duration, t + seconds),
			chroma: new Float64Array(12)
		});
	}
	for (let f = 0; f < count; f++) {
		const centre = chroma.start + f / chroma.frameRate;
		const j = Math.min(segments.length - 1, Math.max(0, Math.floor((centre - first) / seconds)));
		const into = segments[j].chroma;
		for (let pc = 0; pc < 12; pc++) into[pc] += chroma.frames[f][pc];
	}
	const loudness = segments.map((s) => s.chroma.reduce((a, b) => a + b, 0));
	const loudest = Math.max(...loudness);
	const named = segments.map((s, j) =>
		loudness[j] > QUIET_SEGMENT * loudest ? nameChord(s.chroma) : { chord: 'N', score: 0 }
	);
	for (let j = 1; j < named.length - 1; j++) {
		if (named[j - 1].chord === named[j + 1].chord && named[j].chord !== named[j - 1].chord) {
			named[j] = { ...named[j - 1] };
		}
	}
	const spans: ChordSpan[] = [];
	named.forEach((n, j) => {
		const last = spans.at(-1);
		if (last && last.chord === n.chord) {
			spans[spans.length - 1] = {
				...last,
				end: segments[j].end,
				score: Math.max(last.score, n.score)
			};
		} else {
			spans.push({
				start: segments[j].start,
				end: segments[j].end,
				chord: n.chord,
				score: n.score
			});
		}
	});
	return spans;
}
