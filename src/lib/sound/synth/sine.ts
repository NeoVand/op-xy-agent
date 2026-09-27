/**
 * A fast sine for the engines' inner loops (FM operators, tremolo LFOs): one cycle stored in a
 * 4096-point table and read with linear interpolation. Its error against `Math.sin` stays below
 * 4·10⁻⁷ (about −128 dB, under the output's 32-bit floats' own resolution near full scale), and it
 * costs a fraction of `Math.sin` in a loop that runs every sample of every voice.
 */

/** Points in the stored cycle (a power of two, so a bit mask wraps the index). */
const SIZE = 4096;
const MASK = SIZE - 1;

/** One cycle plus a guard point for the interpolation; 16 KB, shared by every voice. */
const TABLE = new Float32Array(SIZE + 1);
for (let i = 0; i < SIZE; i++) TABLE[i] = Math.sin((2 * Math.PI * i) / SIZE);
TABLE[SIZE] = TABLE[0];

/**
 * sin(2π·`phase`) for a phase in cycles: any value, negative or past 1 (FM pushes a carrier's phase
 * either way), as long as |phase| < 500 000 so the index stays a 32-bit integer.
 */
export function sin2pi(phase: number): number {
	const x = phase * SIZE;
	const i = Math.floor(x);
	const k = i & MASK;
	return TABLE[k] + (TABLE[k + 1] - TABLE[k]) * (x - i);
}

/** cos(2π·`phase`), from the same table. */
export function cos2pi(phase: number): number {
	return sin2pi(phase + 0.25);
}
