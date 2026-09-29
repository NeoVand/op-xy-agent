/**
 * Cutting a loop into slices for a drum kit, as the device's own slicer does (up to 24 slices that
 * fill the keys and choke each other; docs/research/30-presets-samples.md §3.2 and §5). Slices start
 * at the loop's transients (spectral flux with an adaptive median threshold, then refined in the
 * waveform) or at equal divisions, always a little before the hit and on a zero crossing, so no
 * slice clicks in or loses its attack.
 */
import { fft } from '../dsp/fft';
import { DRUM_KEYS } from './patch';
import { mono } from './audio';
import type { PcmAudio } from './wav';

export interface OnsetOptions {
	/** 0–1: how small a hit still counts (default 0.5). */
	readonly sensitivity?: number;
	/** The shortest slice in seconds (default 0.05). */
	readonly minGap?: number;
	/** At most this many slices, the strongest hits kept (default 24, the keys a kit has). */
	readonly max?: number;
}

/** How far before a hit a slice starts: the attack's first moments stay in (seconds). */
const LEAD = 0.002;
/** How far a start may move back to meet a zero crossing (seconds). */
const SNAP_BACK = 0.002;
/** The fades at a slice's ends, so neither cut clicks (seconds). */
const FADE_IN = 0.001;
const FADE_OUT = 0.003;
/** A hit is where the next millisecond is this many times louder than the 10 ms before it. */
const SHORT = 0.001;
const LONG = 0.01;

/** The nearest zero crossing at or before `at`, looking back no further than `maxBack` frames. */
export function snapToZero(x: Float32Array, at: number, maxBack: number): number {
	const start = Math.max(0, Math.min(x.length - 1, Math.round(at)));
	for (let i = start; i > 0 && start - i <= maxBack; i--) {
		if (x[i] === 0 || x[i - 1] <= 0 !== x[i] <= 0) return i;
	}
	return start;
}

/**
 * Where the hits are, in frames of `audio`: the first sound, then every transient after it, each a
 * little before the hit (on a zero crossing when one is near). A sustained sound gives one slice.
 */
export function findOnsets(audio: PcmAudio, options: OnsetOptions = {}): number[] {
	const x = mono(audio.channels);
	const sr = audio.sampleRate;
	const sensitivity = Math.min(1, Math.max(0, options.sensitivity ?? 0.5));
	const minGap = Math.round((options.minGap ?? 0.05) * sr);
	const max = Math.min(DRUM_KEYS, Math.max(1, options.max ?? DRUM_KEYS));
	const first = firstSound(x);
	if (first < 0) return [];
	const energy = new Energy(x);
	// how much louder a hit must make it: 6 dB at the middle sensitivity
	const jump = 2 + 4 * (1 - sensitivity);

	// spectral flux of the log magnitude, one value per hop of ~6 ms
	const size = 2 ** Math.round(Math.log2(sr * 0.023));
	const hop = size / 4;
	const hann = Float64Array.from(
		{ length: size },
		(_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
	);
	const frames = Math.max(0, Math.floor((x.length - size) / hop) + 1);
	const flux = new Float64Array(frames);
	let previous: Float64Array | null = null;
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	for (let t = 0; t < frames; t++) {
		for (let i = 0; i < size; i++) {
			re[i] = x[t * hop + i] * hann[i];
			im[i] = 0;
		}
		fft(re, im);
		const bins = new Float64Array(size / 2);
		let sum = 0;
		for (let k = 0; k < size / 2; k++) {
			bins[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
			if (previous) sum += Math.max(0, bins[k] - previous[k]);
		}
		flux[t] = sum;
		previous = bins;
	}
	const top = flux.reduce((m, v) => Math.max(m, v), 0);
	if (top > 0) for (let t = 0; t < frames; t++) flux[t] /= top;

	// peaks over a moving median, higher up the less sensitive
	const offset = 0.03 + 0.3 * (1 - sensitivity) ** 2;
	const reach = 8;
	const peaks: { at: number; strength: number }[] = [];
	for (let t = 1; t < frames - 1; t++) {
		const around = Array.from(
			flux.subarray(Math.max(0, t - reach), Math.min(frames, t + reach + 1))
		);
		around.sort((a, b) => a - b);
		const median = around[Math.floor(around.length / 2)];
		if (flux[t] < median + offset) continue;
		let isPeak = true;
		for (let d = 1; d <= 3 && isPeak; d++) {
			if (flux[t - d] > flux[t] || (t + d < frames && flux[t + d] >= flux[t])) isPeak = false;
		}
		if (!isPeak) continue;
		const at = hitStart(energy, t * hop - hop, t * hop + size, sr, jump);
		// a peak with no jump in level is a change of colour, not a hit (a vibrato, a filter sweep)
		if (at === null) continue;
		// the loudness just after the hit is what "strongest" means when there are too many
		peaks.push({ at, strength: energy.mean(at, at + Math.round(0.02 * sr)) });
	}

	// the first sound always starts a slice; later hits keep their distance and the strongest win
	const kept = [{ at: first, strength: Infinity }];
	for (const peak of [...peaks].sort((a, b) => b.strength - a.strength)) {
		if (kept.length >= max) break;
		if (kept.every((k) => Math.abs(k.at - peak.at) >= minGap)) kept.push(peak);
	}
	const lead = Math.round(LEAD * sr);
	const back = Math.round(SNAP_BACK * sr);
	return kept
		.map((k) => snapToZero(x, Math.max(0, k.at - lead), back))
		.sort((a, b) => a - b)
		.filter((at, i, all) => i === 0 || at > all[i - 1]);
}

/** Equal divisions of the whole sound (a bar into 8 or 16), each start on a zero crossing if near. */
export function equalSlices(audio: PcmAudio, count: number): number[] {
	const x = mono(audio.channels);
	const n = Math.min(DRUM_KEYS, Math.max(1, Math.round(count)));
	const back = Math.round(SNAP_BACK * audio.sampleRate);
	return Array.from({ length: n }, (_, i) =>
		i === 0 ? 0 : snapToZero(x, Math.round((i * x.length) / n), back)
	);
}

/** The slices themselves: each from its start to the next one's, with short fades at both ends. */
export function sliceAudio(audio: PcmAudio, starts: readonly number[]): PcmAudio[] {
	const length = audio.channels[0]?.length ?? 0;
	const fadeIn = Math.round(FADE_IN * audio.sampleRate);
	const fadeOut = Math.round(FADE_OUT * audio.sampleRate);
	return starts.map((start, i) => {
		const end = i + 1 < starts.length ? starts[i + 1] : length;
		const channels = audio.channels.map((channel) => {
			const out = channel.slice(start, end);
			const up = Math.min(fadeIn, out.length);
			for (let j = 0; j < up; j++) out[j] *= j / up;
			const down = Math.min(fadeOut, out.length);
			for (let j = 0; j < down; j++) out[out.length - down + j] *= 1 - (j + 1) / down;
			return out;
		});
		return { sampleRate: audio.sampleRate, channels };
	});
}

/** A loop's tempo as the loop's own length tells it, checked against its hits. */
export interface LoopTempo {
	/** Beats per minute, to a tenth. */
	readonly bpm: number;
	/** How many beats the loop holds (4 is a bar of 4/4). */
	readonly beats: number;
	/** 0–1: how well the hits sit on that tempo's sixteenths. */
	readonly confidence: number;
}

/**
 * The tempo of a loop cut to length (a bar, two, four): a whole number of beats between 70 and
 * 180 BPM, the one whose sixteenths the loop's hits (`onsets`, frames) sit on best, with bars of
 * 4, 8, 16 or 32 beats preferred and tempos near 115. Null for a sound under half a second.
 */
export function loopTempo(audio: PcmAudio, onsets: readonly number[]): LoopTempo | null {
	const sr = audio.sampleRate;
	const seconds = (audio.channels[0]?.length ?? 0) / sr;
	if (seconds < 0.5) return null;
	const times = onsets.map((f) => f / sr);
	let best: (LoopTempo & { score: number }) | null = null;
	for (let beats = 1; beats <= 64; beats++) {
		const bpm = (60 * beats) / seconds;
		if (bpm < 70 || bpm > 180) continue;
		const step = 60 / bpm / 4;
		// how close each hit is to a sixteenth, forgiving ±12 ms
		const fit =
			times.length === 0
				? 0.5
				: times.reduce((sum, t) => {
						const off = Math.abs(t - Math.round(t / step) * step);
						return sum + Math.exp(-((off / 0.012) ** 2));
					}, 0) / times.length;
		const bar = [4, 8, 16, 32, 64].includes(beats)
			? 1
			: beats % 4 === 0
				? 0.85
				: beats % 2 === 0
					? 0.7
					: 0.5;
		const comfort = 1 - 0.25 * Math.abs(Math.log2(bpm / 115));
		const score = fit * bar * comfort;
		if (!best || score > best.score)
			best = { bpm: Math.round(bpm * 10) / 10, beats, confidence: fit, score };
	}
	if (!best) return null;
	return { bpm: best.bpm, beats: best.beats, confidence: best.confidence };
}

/** The first frame louder than −50 dBFS, or −1 for silence. */
function firstSound(x: Float32Array): number {
	const floor = 10 ** (-50 / 20);
	for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= floor) return i;
	return -1;
}

/** Mean squares over any span in constant time (running sums of x²). */
class Energy {
	readonly #sums: Float64Array;
	constructor(x: Float32Array) {
		this.#sums = new Float64Array(x.length + 1);
		for (let i = 0; i < x.length; i++) this.#sums[i + 1] = this.#sums[i] + x[i] * x[i];
	}
	mean(from: number, to: number): number {
		const a = Math.max(0, Math.min(this.#sums.length - 1, from));
		const b = Math.max(0, Math.min(this.#sums.length - 1, to));
		return b > a ? (this.#sums[b] - this.#sums[a]) / (b - a) : 0;
	}
}

/**
 * Where a hit inside an analysis frame begins: the first frame whose next millisecond is `jump`
 * times louder than the 10 ms before it, or null when nothing in the frame jumps that much.
 */
function hitStart(
	energy: Energy,
	from: number,
	to: number,
	sr: number,
	jump: number
): number | null {
	const short = Math.max(1, Math.round(SHORT * sr));
	const long = Math.round(LONG * sr);
	// the quietest signal still counted as a hit: −60 dBFS
	const floor = 1e-6;
	for (let i = Math.max(1, from); i < to; i++) {
		const next = energy.mean(i, i + short);
		if (next < floor) continue;
		if (next >= jump * Math.max(energy.mean(i - long, i), floor / jump)) return i;
	}
	return null;
}
