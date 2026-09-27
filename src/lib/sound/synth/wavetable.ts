/**
 * Band-limited single-cycle tables, mipmapped by octave: each frame of a table is stored once per
 * level, level l holding only the first 512 >> l harmonics, and a note reads the richest level
 * whose harmonics stay below Nyquist, fading in the next richer one as it nears the top of its
 * octave so brightness never jumps. Frames blend by position. Built from harmonic amplitudes (and
 * phases) or from drawn single cycles; used by the wavetable engine and anywhere a fixed spectrum
 * plays (organ registrations, prism's shapes, sub oscillators).
 */
import { fft } from './analysis';

/** Harmonic content of one frame: amplitude (and phase, radians) of harmonics 1, 2, 3, … */
export interface Partials {
	readonly amp: ArrayLike<number>;
	readonly phase?: ArrayLike<number>;
}

/** Harmonics in the richest level. */
export const MAX_HARMONICS = 512;
/** Each level: the harmonics it keeps and the samples it stores them in (four per top harmonic). */
const LEVELS = Array.from({ length: 10 }, (_, l) => {
	const harmonics = MAX_HARMONICS >> l;
	return { harmonics, size: Math.max(256, 4 * harmonics) };
});

/** Where in its octave a note starts fading in the next richer level (0–1, in octaves). */
const FADE_FROM = 0.75;

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
	/** `levels[l][frame]`. */
	readonly #levels: Float32Array[][];
	readonly frames: number;

	private constructor(levels: Float32Array[][]) {
		this.#levels = levels;
		this.frames = levels[0].length;
	}

	/** A table from each frame's partials. */
	static fromPartials(frames: readonly Partials[]): WaveTable {
		if (frames.length === 0) throw new Error('a wavetable needs at least one frame');
		return new WaveTable(
			LEVELS.map(({ harmonics, size }) => frames.map((f) => build(f, harmonics, size)))
		);
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
		const lvl = Math.log2(Math.max(dt, 1e-9) * 2 * MAX_HARMONICS);
		const last = LEVELS.length - 1;
		// the richest level with every harmonic below Nyquist, and how far into its octave we are
		const safe = Math.min(last, Math.max(0, Math.ceil(lvl)));
		const into = Math.min(1, Math.max(0, safe - lvl));
		const f = Math.min(Math.max(frame, 0), this.frames - 1);
		const a = this.#frame(safe, f, phase);
		if (safe === 0 || into <= FADE_FROM) return a;
		// over the octave's top quarter, fade in the richer level: the few of its harmonics still
		// above Nyquist are faint and fold back above ~0.4 × the sample rate
		const x = (into - FADE_FROM) / (1 - FADE_FROM);
		return a + (this.#frame(safe - 1, f, phase) - a) * x * x;
	}

	#frame(level: number, frame: number, phase: number): number {
		const frames = this.#levels[level];
		const i = Math.floor(frame);
		const a = sample(frames[i], phase);
		const w = frame - i;
		if (w === 0 || i + 1 >= frames.length) return a;
		return a + (sample(frames[i + 1], phase) - a) * w;
	}
}

/** Linear interpolation into one stored cycle (with its guard sample). */
function sample(table: Float32Array, phase: number): number {
	const size = table.length - 1;
	const x = (phase - Math.floor(phase)) * size;
	const i = x | 0;
	return table[i] + (table[i + 1] - table[i]) * (x - i);
}
