/**
 * Band-limited single-cycle tables, mipmapped by half octaves: each frame of a table is stored once
 * per level, level l holding only the first 512·2^(−l/2) harmonics, and a note reads the richest
 * level whose harmonics stay below Nyquist, fading in the next richer one as it nears the top of
 * its step so brightness never jumps. Half octaves keep a note's top harmonic within 14–20 kHz
 * (whole octaves let it drop to 10 kHz). Frames blend by position. Built from harmonic amplitudes (and
 * phases) or from drawn single cycles; used by the wavetable engine and anywhere a fixed spectrum
 * plays (organ registrations, the FM engines' operator shapes).
 *
 * Levels are built the first time a note reads them, one inverse FFT each (well under a
 * millisecond), so no note waits for a whole table on the audio thread.
 */
import { fft } from './analysis';

/** Harmonic content of one frame: amplitude (and phase, radians) of harmonics 1, 2, 3, … */
export interface Partials {
	readonly amp: ArrayLike<number>;
	readonly phase?: ArrayLike<number>;
}

/** Harmonics in the richest level. */
export const MAX_HARMONICS = 512;
/** Levels per octave. */
const STEPS = 2;
/**
 * Each level: the harmonics it keeps and the samples it stores them in (a power of two), at least
 * eight per cycle of its top harmonic, so linear interpolation's images stay low.
 */
const LEVELS = Array.from({ length: 9 * STEPS + 1 }, (_, l) => {
	const harmonics = Math.max(1, Math.floor(MAX_HARMONICS / 2 ** (l / STEPS)));
	return { harmonics, size: Math.max(512, 2 ** Math.ceil(Math.log2(8 * harmonics))) };
});

/** Where in its step a note starts fading in the next richer level (0–1, in steps). */
const FADE_FROM = 0.75;
/**
 * Levels are picked this much early (the fade's quarter step), so the richer level's top harmonic
 * is already below Nyquist wherever it fades in.
 */
const EARLY = 2 ** ((1 - FADE_FROM) / STEPS);

/** One level of one frame, with a guard sample for interpolation. */
function build(partials: Partials, harmonics: number, size: number): Float32Array {
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	const count = Math.min(harmonics, partials.amp.length, size / 2 - 1);
	for (let h = 1; h <= count; h++) {
		const a = partials.amp[h - 1] ?? 0;
		if (a === 0) continue;
		const phi = partials.phase?.[h - 1] ?? 0;
		// X[h] = −i·N·a/2·e^{iφ}: the inverse FFT gives a·sin(2πhn/N + φ)
		re[h] = (size / 2) * a * Math.sin(phi);
		im[h] = -(size / 2) * a * Math.cos(phi);
		re[size - h] = re[h];
		im[size - h] = -im[h];
	}
	fft(re, im, true);
	const out = new Float32Array(size + 1);
	for (let i = 0; i < size; i++) out[i] = re[i];
	out[size] = out[0];
	return out;
}

/** The partials of one drawn cycle (any power-of-two length; its DC is dropped). */
export function partialsOf(cycle: ArrayLike<number>, harmonics = MAX_HARMONICS): Partials {
	const n = cycle.length;
	const re = Float64Array.from(cycle);
	const im = new Float64Array(n);
	fft(re, im);
	const count = Math.min(harmonics, n / 2 - 1);
	const amp = new Float32Array(count);
	const phase = new Float32Array(count);
	for (let h = 1; h <= count; h++) {
		amp[h - 1] = (2 * Math.hypot(re[h], im[h])) / n;
		phase[h - 1] = Math.atan2(im[h], re[h]) + Math.PI / 2;
	}
	return { amp, phase };
}

export class WaveTable {
	/** Each frame's partials, and `levels[l][frame]` once built. */
	readonly #partials: readonly Partials[];
	readonly #levels: (Float32Array | null)[][];
	readonly frames: number;

	private constructor(partials: readonly Partials[]) {
		this.#partials = partials;
		this.#levels = LEVELS.map(() => partials.map(() => null));
		this.frames = partials.length;
	}

	/** A table from each frame's partials. */
	static fromPartials(frames: readonly Partials[]): WaveTable {
		if (frames.length === 0) throw new Error('a wavetable needs at least one frame');
		return new WaveTable(frames);
	}

	/** A table from drawn single cycles (power-of-two lengths). */
	static fromCycles(cycles: readonly ArrayLike<number>[]): WaveTable {
		return WaveTable.fromPartials(cycles.map((c) => partialsOf(c)));
	}

	/**
	 * The table at `phase` (0–1), `frame` (0 … frames − 1, fractional: neighbours blend), for a
	 * note advancing `dt` cycles a sample.
	 */
	read(frame: number, phase: number, dt: number): number {
		const lvl = STEPS * Math.log2(Math.max(dt, 1e-9) * 2 * MAX_HARMONICS * EARLY);
		const last = LEVELS.length - 1;
		// the richest level with every harmonic below Nyquist, and how far into its step we are
		const safe = Math.min(last, Math.max(0, Math.ceil(lvl)));
		const into = Math.min(1, Math.max(0, safe - lvl));
		const f = Math.min(Math.max(frame, 0), this.frames - 1);
		const a = this.#frame(safe, f, phase);
		if (safe === 0 || into <= FADE_FROM) return a;
		// over the step's top quarter, fade in the richer level (picked early, it fits below Nyquist)
		const x = (into - FADE_FROM) / (1 - FADE_FROM);
		return a + (this.#frame(safe - 1, f, phase) - a) * x * x;
	}

	#frame(level: number, frame: number, phase: number): number {
		const i = Math.floor(frame);
		const a = sample(this.#cycle(level, i), phase);
		const w = frame - i;
		if (w === 0 || i + 1 >= this.frames) return a;
		return a + (sample(this.#cycle(level, i + 1), phase) - a) * w;
	}

	/** One level of one frame, built the first time it is read. */
	#cycle(level: number, frame: number): Float32Array {
		const row = this.#levels[level];
		let cycle = row[frame];
		if (!cycle) {
			const { harmonics, size } = LEVELS[level];
			cycle = build(this.#partials[frame], harmonics, size);
			row[frame] = cycle;
		}
		return cycle;
	}
}

/** Linear interpolation into one stored cycle (with its guard sample). */
function sample(table: Float32Array, phase: number): number {
	const size = table.length - 1;
	const x = (phase - Math.floor(phase)) * size;
	const i = x | 0;
	return table[i] + (table[i + 1] - table[i]) * (x - i);
}
