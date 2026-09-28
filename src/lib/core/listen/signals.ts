/**
 * Synthetic signals with known answers, for the listening tests (and for checking the analysis by
 * ear): seeded white, pink and brown noise, sines and band-limited saws, chords and progressions
 * from note names, click tracks at a tempo with swing and timing spread, and a small drum machine
 * playing sixteenth-step patterns the way the OP-XY's sequencer lays them out. Deterministic: the
 * same arguments always give the same samples.
 */
import { fft, nextPowerOfTwo } from './fft';

/** A seeded uniform generator in [0, 1) (mulberry32). */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Standard normal values from a uniform generator (Box–Muller). */
export function gaussian(uniform: () => number): () => number {
	return () => {
		const u = Math.max(1e-12, uniform());
		const v = uniform();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	};
}

const frames = (seconds: number, sampleRate: number) =>
	Math.max(0, Math.round(seconds * sampleRate));

/** A sine of `amplitude` (peak). */
export function sine(
	hz: number,
	seconds: number,
	sampleRate: number,
	amplitude = 0.5,
	phase = 0
): Float32Array {
	return Float32Array.from(
		{ length: frames(seconds, sampleRate) },
		(_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate + phase)
	);
}

/**
 * A band-limited sawtooth: harmonics at 1/n up to `maxHz` (default 8 kHz, below Nyquist),
 * `amplitude` scaling the fundamental. Each harmonic turns by a fixed rotation per sample, so long
 * saws stay quick to make.
 */
export function saw(
	hz: number,
	seconds: number,
	sampleRate: number,
	amplitude = 0.5,
	maxHz = 8000
): Float32Array {
	const out = new Float32Array(frames(seconds, sampleRate));
	const harmonics = Math.floor(Math.min(maxHz, sampleRate / 2 - 1) / hz);
	for (let h = 1; h <= harmonics; h++) {
		const w = (2 * Math.PI * hz * h) / sampleRate;
		const c = Math.cos(w);
		const s = Math.sin(w);
		const a = amplitude / h;
		let x = 1;
		let y = 0;
		for (let i = 0; i < out.length; i++) {
			out[i] += a * y;
			const nx = x * c - y * s;
			y = x * s + y * c;
			x = nx;
		}
	}
	return out;
}

/** Digital silence. */
export function silence(seconds: number, sampleRate: number): Float32Array {
	return new Float32Array(frames(seconds, sampleRate));
}

/** The parts one after another. */
export function concat(...parts: readonly Float32Array[]): Float32Array {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** The parts summed sample by sample (as long as the longest). */
export function mix(...parts: readonly Float32Array[]): Float32Array {
	const out = new Float32Array(Math.max(0, ...parts.map((p) => p.length)));
	for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
	return out;
}

/** `x` times `g`. */
export function gain(x: Float32Array, g: number): Float32Array {
	return x.map((v) => v * g);
}

/** Root mean square. */
export function rms(x: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
	return Math.sqrt(sum / Math.max(1, x.length));
}

/** The colour of a noise: its power per hertz falls as 1/f^0 (white), 1/f (pink) or 1/f² (brown). */
export type NoiseColour = 'white' | 'pink' | 'brown';

const EXPONENT: Record<NoiseColour, number> = { white: 0, pink: 1, brown: 2 };

/**
 * Noise with an exact spectral slope (built in the frequency domain: every bin at the colour's
 * magnitude with a random phase, from 10 Hz up), scaled to `rms`.
 */
export function noise(
	colour: NoiseColour,
	seconds: number,
	sampleRate: number,
	{ rms: level = 0.1, seed = 1 }: { rms?: number; seed?: number } = {}
): Float32Array {
	const n = frames(seconds, sampleRate);
	const size = nextPowerOfTwo(Math.max(4, n));
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const uniform = random(seed);
	const exponent = EXPONENT[colour];
	for (let k = 1; k < size / 2; k++) {
		const hz = (k * sampleRate) / size;
		const magnitude = hz >= 10 ? hz ** (-exponent / 2) : 0;
		const phase = 2 * Math.PI * uniform();
		re[k] = magnitude * Math.cos(phase);
		im[k] = magnitude * Math.sin(phase);
		re[size - k] = re[k];
		im[size - k] = -im[k];
	}
	fft(re, im, true);
	const out = Float32Array.from({ length: n }, (_, i) => re[i]);
	const scale = level / Math.max(1e-30, rms(out));
	for (let i = 0; i < n; i++) out[i] *= scale;
	return out;
}

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * A note name as a MIDI note, C4 = 60: `A4`, `C#3`, `Eb5`, `Bb2`.
 * @throws {Error} for anything else
 */
export function noteNumber(name: string): number {
	const m = /^([a-g])(#|b)?(-?\d)$/i.exec(name.trim());
	if (!m) throw new Error(`not a note name: ${name}`);
	const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
	return 12 * (Number(m[3]) + 1) + PITCH[m[1].toLowerCase()] + accidental;
}

/** The frequency of a note name (A4 = 440 Hz). */
export function noteHz(name: string): number {
	return 440 * 2 ** ((noteNumber(name) - 69) / 12);
}

/** Options for {@link chord} and {@link progression}. */
export interface ChordOptions {
	/** Peak amplitude of each note (default 0.15). */
	readonly amplitude?: number;
	/** Sines, or band-limited saws with all their harmonics (default sines). */
	readonly wave?: 'sine' | 'saw';
	/** Fade in and out, seconds (default 0.01, so the joins do not click). */
	readonly fade?: number;
}

/** Notes sounding together for `seconds`. */
export function chord(
	notes: readonly string[],
	seconds: number,
	sampleRate: number,
	{ amplitude = 0.15, wave = 'sine', fade = 0.01 }: ChordOptions = {}
): Float32Array {
	const voices = notes.map((n) =>
		wave === 'saw'
			? saw(noteHz(n), seconds, sampleRate, amplitude)
			: sine(noteHz(n), seconds, sampleRate, amplitude)
	);
	const out = mix(...voices);
	const edge = Math.min(frames(fade, sampleRate), Math.floor(out.length / 2));
	for (let i = 0; i < edge; i++) {
		const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / edge);
		out[i] *= g;
		out[out.length - 1 - i] *= g;
	}
	return out;
}

/** Chords one after another, `secondsEach` apiece. */
export function progression(
	chords: readonly (readonly string[])[],
	secondsEach: number,
	sampleRate: number,
	options: ChordOptions = {}
): Float32Array {
	return concat(...chords.map((c) => chord(c, secondsEach, sampleRate, options)));
}

/** A short noise burst decaying over ~3 ms: a click with a clear attack. */
function burst(sampleRate: number, amplitude: number, uniform: () => number): Float32Array {
	const n = Math.max(8, Math.round(0.012 * sampleRate));
	return Float32Array.from(
		{ length: n },
		(_, i) => amplitude * (2 * uniform() - 1) * Math.exp(-i / (0.003 * sampleRate))
	);
}

/** Options for {@link clickTrack}. */
export interface ClickTrackOptions {
	readonly bpm: number;
	readonly seconds: number;
	readonly sampleRate: number;
	/** Clicks per beat: 1 (quarters), 2 (eighths) or 4 (sixteenths). Default 1. */
	readonly perBeat?: 1 | 2 | 4;
	/** Sixteenth swing in percent: 50 is straight, 66.7 a triplet feel (off-sixteenths late). */
	readonly swing?: number;
	/** Random timing spread, standard deviation in ms. */
	readonly jitterMs?: number;
	/** Level of the off-beat clicks against the beat's (default 0.5). */
	readonly offbeatLevel?: number;
	/** Where the first beat falls, seconds (default 0.25). */
	readonly offset?: number;
	/** Single-sample impulses instead of short noise bursts. */
	readonly impulses?: boolean;
	readonly seed?: number;
}

/**
 * A click track and the exact time of every click. The off-sixteenths (the "e" and "a" of each
 * beat) move by the swing: each pair of sixteenths splits `swing`/100 : 1 − `swing`/100.
 */
export function clickTrack(options: ClickTrackOptions): { samples: Float32Array; times: number[] } {
	const { bpm, seconds, sampleRate } = options;
	const perBeat = options.perBeat ?? 1;
	const swing = options.swing ?? 50;
	const uniform = random(options.seed ?? 7);
	const normal = gaussian(uniform);
	const sixteenth = 15 / bpm;
	const offset = options.offset ?? 0.25;
	const samples = new Float32Array(frames(seconds, sampleRate));
	const times: number[] = [];
	const step = 4 / perBeat;
	for (let s = 0; ; s += step) {
		const straight = offset + s * sixteenth;
		const late = s % 2 === 1 ? (2 * swing) / 100 - 1 : 0;
		const jitter = options.jitterMs ? (normal() * options.jitterMs) / 1000 : 0;
		const t = straight + late * sixteenth + jitter;
		if (t >= seconds - 0.05) break;
		const level = s % 4 === 0 ? 0.8 : 0.8 * (options.offbeatLevel ?? 0.5);
		const at = Math.round(t * sampleRate);
		times.push(at / sampleRate);
		if (options.impulses) {
			samples[at] += level;
		} else {
			const b = burst(sampleRate, level, uniform);
			for (let i = 0; i < b.length && at + i < samples.length; i++) samples[at + i] += b[i];
		}
	}
	return { samples, times };
}

/** Sixteenth steps (0–15 in a bar of 4/4) where each drum plays. */
export interface DrumPattern {
	readonly kick?: readonly number[];
	readonly snare?: readonly number[];
	readonly hat?: readonly number[];
}

/** A kick: a sine falling from 120 to 45 Hz, decaying over a few hundred ms. */
function kick(sampleRate: number): Float32Array {
	const n = Math.round(0.35 * sampleRate);
	const out = new Float32Array(n);
	let phase = 0;
	for (let i = 0; i < n; i++) {
		const t = i / sampleRate;
		const hz = 45 + 75 * Math.exp(-t / 0.03);
		phase += (2 * Math.PI * hz) / sampleRate;
		out[i] = 0.8 * Math.sin(phase) * Math.exp(-t / 0.12);
	}
	return out;
}

/** A snare: a noise burst over a 180 Hz body. */
function snare(sampleRate: number, uniform: () => number): Float32Array {
	const n = Math.round(0.2 * sampleRate);
	return Float32Array.from({ length: n }, (_, i) => {
		const t = i / sampleRate;
		const body = 0.3 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.08);
		return body + 0.35 * (2 * uniform() - 1) * Math.exp(-t / 0.05);
	});
}

/** A closed hat: noise with its lows taken out (two differences), a few tens of ms long. */
function hat(sampleRate: number, uniform: () => number): Float32Array {
	const n = Math.round(0.06 * sampleRate);
	const white = Float32Array.from({ length: n + 2 }, () => 2 * uniform() - 1);
	return Float32Array.from({ length: n }, (_, i) => {
		const t = i / sampleRate;
		const hp = (white[i + 2] - 2 * white[i + 1] + white[i]) / 4;
		return 0.5 * hp * Math.exp(-t / 0.015);
	});
}

/** Options for {@link drumLoop}. */
export interface DrumLoopOptions {
	readonly bpm: number;
	readonly bars: number;
	readonly sampleRate: number;
	readonly pattern: DrumPattern;
	/** Sixteenth swing in percent (50 straight). */
	readonly swing?: number;
	/** Where the first bar starts, seconds (default 0.2). */
	readonly offset?: number;
	readonly seed?: number;
}

/** A drum loop from a sixteenth-step pattern, and when each drum was struck. */
export function drumLoop(options: DrumLoopOptions): {
	samples: Float32Array;
	times: { kick: number[]; snare: number[]; hat: number[] };
} {
	const { bpm, bars, sampleRate, pattern } = options;
	const uniform = random(options.seed ?? 3);
	const sixteenth = 15 / bpm;
	const offset = options.offset ?? 0.2;
	const swing = options.swing ?? 50;
	const seconds = offset + bars * 16 * sixteenth + 0.4;
	const samples = new Float32Array(frames(seconds, sampleRate));
	const times = { kick: [] as number[], snare: [] as number[], hat: [] as number[] };
	const sounds = {
		kick: () => kick(sampleRate),
		snare: () => snare(sampleRate, uniform),
		hat: () => hat(sampleRate, uniform)
	};
	for (let bar = 0; bar < bars; bar++) {
		for (const drum of ['kick', 'snare', 'hat'] as const) {
			for (const step of pattern[drum] ?? []) {
				const late = step % 2 === 1 ? (2 * swing) / 100 - 1 : 0;
				const t = offset + (bar * 16 + step + late) * sixteenth;
				const at = Math.round(t * sampleRate);
				times[drum].push(at / sampleRate);
				const hit = sounds[drum]();
				for (let i = 0; i < hit.length && at + i < samples.length; i++) samples[at + i] += hit[i];
			}
		}
	}
	for (const list of Object.values(times)) list.sort((a, b) => a - b);
	return { samples, times };
}
