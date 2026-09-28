/**
 * Sample preparation for OP-XY presets (docs/research/30-presets-samples.md §3, §5): everything goes
 * to 44.1 kHz (windowed-sinc resampling), long recordings are cut at the device's 20 s, silence is
 * trimmed with a short fade so nothing clicks, and levels are optionally normalised. Note names in
 * file names read with C4 = 60, the device's and factory content's convention.
 */
import type { PcmAudio } from './wav';

/** The rate every preset sample is written at (device recordings and factory content). */
export const PRESET_RATE = 44100;

/** The longest sample the samplers take (the recording limit). */
export const MAX_SECONDS = 20;

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;
const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A MIDI note as the device names files: `c4` is 60, `f#3` 54. */
export function noteName(midi: number): string {
	const m = Math.round(midi);
	return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/**
 * The note a file name carries (`piano-c#4.wav`, `Cello_Bb2 mf.wav`), C4 = 60, or null. The note must
 * stand apart from the words around it, so `take1` or `bass01` carry none.
 */
export function noteFromName(fileName: string): number | null {
	const base = fileName.replace(/\.[a-z0-9]+$/i, '');
	const re = /(?:^|[^a-z0-9])([a-g])(#|b|s|♯|♭)?(-1|[0-9])(?![0-9])/gi;
	let found: number | null = null;
	for (const m of base.matchAll(re)) {
		const pc = PITCH_CLASS[m[1].toLowerCase()];
		const accidental = m[2] ? (m[2] === 'b' || m[2] === '♭' ? -1 : 1) : 0;
		const midi = 12 * (Number(m[3]) + 1) + pc + accidental;
		// the last note in the name wins ("strings c3 take2 c4" means c4)
		if (midi >= 0 && midi <= 127) found = midi;
	}
	return found;
}

/** Zeroth-order modified Bessel function (for the Kaiser window). */
function bessel0(x: number): number {
	let sum = 1;
	let term = 1;
	for (let k = 1; k < 32; k++) {
		term *= (x / (2 * k)) ** 2;
		sum += term;
	}
	return sum;
}

/** Zero crossings of the resampling kernel on each side, and its table's steps per crossing. */
const HALF = 16;
const STEPS = 512;

/** The Kaiser-windowed sinc over [0, HALF] crossings, tabulated once. */
const KERNEL = (() => {
	const beta = 8;
	const norm = bessel0(beta);
	const table = new Float32Array(HALF * STEPS + 2);
	for (let i = 0; i < table.length; i++) {
		const x = i / STEPS;
		const r = Math.min(1, x / HALF);
		const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
		table[i] = sinc * (bessel0(beta * Math.sqrt(1 - r * r)) / norm);
	}
	return table;
})();

/** The kernel at `x` crossings from its centre (0 beyond HALF). */
function kernel(x: number): number {
	const a = Math.abs(x) * STEPS;
	const i = Math.floor(a);
	if (i >= HALF * STEPS) return 0;
	const f = a - i;
	return KERNEL[i] * (1 - f) + KERNEL[i + 1] * f;
}

/**
 * `channels` resampled from `from` to `to` Hz: a Kaiser-windowed sinc, 16 zero crossings each side,
 * its cutoff lowered when going down so nothing folds back.
 */
export function resample(
	channels: readonly Float32Array[],
	from: number,
	to: number
): Float32Array[] {
	if (from === to) return channels.map((c) => c.slice());
	const ratio = to / from;
	const cutoff = Math.min(1, ratio) * 0.97;
	const width = HALF / cutoff;
	return channels.map((input) => {
		const n = Math.floor(input.length * ratio);
		const out = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const t = i / ratio;
			const lo = Math.max(0, Math.ceil(t - width));
			const hi = Math.min(input.length - 1, Math.floor(t + width));
			let sum = 0;
			let weights = 0;
			for (let j = lo; j <= hi; j++) {
				const w = kernel((j - t) * cutoff);
				sum += input[j] * w;
				weights += w;
			}
			out[i] = weights !== 0 ? sum / weights : 0;
		}
		return out;
	});
}

/** Options for {@link prepare}. */
export interface PrepareOptions {
	/** Cut leading and trailing silence (below −60 dBFS). Default true. */
	readonly trim?: boolean;
	/** Bring the peak to −1 dBFS. Default false (keep the recording's level). */
	readonly normalize?: boolean;
}

/** The first and last frame above `threshold` in any channel, or null when all is below. */
function audibleSpan(
	channels: readonly Float32Array[],
	threshold: number
): [number, number] | null {
	const n = channels[0].length;
	let first = -1;
	let last = -1;
	for (let i = 0; i < n && first < 0; i++)
		if (channels.some((c) => Math.abs(c[i]) > threshold)) first = i;
	for (let i = n - 1; i >= 0 && last < 0; i--)
		if (channels.some((c) => Math.abs(c[i]) > threshold)) last = i;
	return first < 0 ? null : [first, last];
}

/**
 * A sample ready for a preset: at 44.1 kHz, at most two channels and 20 s, silence trimmed (a 2 ms
 * lead kept, a 5 ms fade out at the cut), optionally normalised. The root note travels along.
 */
export function prepare(audio: PcmAudio, options: PrepareOptions = {}): PcmAudio {
	let channels = resample(audio.channels.slice(0, 2), audio.sampleRate, PRESET_RATE);
	if (options.trim !== false) {
		const span = audibleSpan(channels, 10 ** (-60 / 20));
		if (span) {
			const from = Math.max(0, span[0] - Math.round(0.002 * PRESET_RATE));
			const to = Math.min(channels[0].length, span[1] + 1);
			channels = channels.map((c) => c.slice(from, to));
		}
	}
	const max = MAX_SECONDS * PRESET_RATE;
	const cut = channels[0].length > max;
	if (cut) channels = channels.map((c) => c.slice(0, max));
	if (options.trim !== false || cut) {
		const fade = Math.min(channels[0].length, Math.round(0.005 * PRESET_RATE));
		for (const c of channels) for (let i = 0; i < fade; i++) c[c.length - 1 - i] *= i / fade;
	}
	if (options.normalize) {
		let peak = 0;
		for (const c of channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
		if (peak > 0) {
			const gain = 10 ** (-1 / 20) / peak;
			for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= gain;
		}
	}
	return { sampleRate: PRESET_RATE, channels, root: audio.root };
}

/** A mono mix of the channels (for analysis). */
export const mono = (channels: readonly Float32Array[]): Float32Array => {
	if (channels.length === 1) return channels[0];
	const out = new Float32Array(channels[0].length);
	for (let i = 0; i < out.length; i++) out[i] = (channels[0][i] + channels[1][i]) / 2;
	return out;
};

/**
 * The pitch of a sustained sample as the nearest MIDI note (YIN on a few windows past the attack),
 * or null when it has no steady pitch.
 */
export function detectNote(audio: PcmAudio): number | null {
	const x = mono(audio.channels);
	const sr = audio.sampleRate;
	const size = 2048;
	const maxLag = Math.floor(sr / 30);
	const minLag = Math.floor(sr / 2000);
	if (x.length < size + maxLag) return null;
	const estimates: number[] = [];
	// windows from 10 % to 60 % of the sample, past the attack
	for (let k = 0; k < 6; k++) {
		const start = Math.floor(x.length * (0.1 + (0.5 * k) / 6));
		if (start + size + maxLag > x.length) break;
		const d = new Float32Array(maxLag + 1);
		for (let lag = 1; lag <= maxLag; lag++) {
			let sum = 0;
			for (let i = 0; i < size; i++) {
				const diff = x[start + i] - x[start + i + lag];
				sum += diff * diff;
			}
			d[lag] = sum;
		}
		// cumulative mean normalised difference, then the bottom of the first dip under the threshold
		const cmnd = new Float32Array(maxLag + 1);
		cmnd[0] = 1;
		let running = 0;
		for (let tau = 1; tau <= maxLag; tau++) {
			running += d[tau];
			cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
		}
		let lag = -1;
		for (let tau = minLag; tau < maxLag; tau++) {
			if (cmnd[tau] >= 0.15) continue;
			while (tau + 1 < maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
			// a parabola through the dip's three points places it between samples
			const [a, b, c] = [cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]];
			const bend = a - 2 * b + c;
			lag = tau + (bend > 0 ? (a - c) / (2 * bend) : 0);
			break;
		}
		if (lag > 0) estimates.push(69 + 12 * Math.log2(sr / lag / 440));
	}
	if (estimates.length < 3) return null;
	estimates.sort((a, b) => a - b);
	return Math.round(estimates[Math.floor(estimates.length / 2)]);
}

/** Loop points for a sustained sample, in frames, or null when it is too short to loop. */
export interface LoopPoints {
	readonly start: number;
	readonly end: number;
	/** Frames of the loop's end crossfaded into what precedes its start. */
	readonly crossfade: number;
}

/**
 * Finds a loop for a sustained sample: the end near 90 % of it, the start between 30 % and 70 %,
 * both on rising zero crossings, chosen so the 20 ms before each match best (normalised
 * correlation); a crossfade of up to a third of the loop smooths what is left.
 */
export function findLoop(audio: PcmAudio): LoopPoints | null {
	const x = mono(audio.channels);
	const sr = audio.sampleRate;
	if (x.length < sr * 0.8) return null;
	const rising = (i: number) => x[i - 1] < 0 && x[i] >= 0;
	const near = (at: number, span: number) => {
		for (let d = 0; d < span; d++) {
			if (at + d < x.length && at + d > 0 && rising(at + d)) return at + d;
			if (at - d > 0 && rising(at - d)) return at - d;
		}
		return at;
	};
	const end = near(Math.floor(x.length * 0.9), Math.floor(sr * 0.01));
	const win = Math.floor(sr * 0.02);
	let best = -Infinity;
	let start = Math.floor(x.length * 0.3);
	const lo = Math.max(win + 1, Math.floor(x.length * 0.3));
	const hi = Math.floor(x.length * 0.7);
	for (let s = lo; s < hi; s++) {
		if (!rising(s)) continue;
		let dot = 0;
		let a2 = 0;
		let b2 = 0;
		for (let i = 1; i <= win; i++) {
			const a = x[end - i];
			const b = x[s - i];
			dot += a * b;
			a2 += a * a;
			b2 += b * b;
		}
		const score = dot / Math.sqrt(a2 * b2 + 1e-12);
		if (score > best) {
			best = score;
			start = s;
		}
	}
	if (end - start < sr * 0.1) return null;
	const crossfade = Math.min(Math.floor((end - start) / 3), start);
	return { start, end, crossfade };
}
