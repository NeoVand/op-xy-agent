/**
 * Second-order filters for the analysis: a biquad runner in double precision, and Butterworth
 * low- and high-pass designs (Robert Bristow-Johnson's audio EQ cookbook) for splitting a signal
 * into bands.
 */

/** Second-order section coefficients, a0 normalised to 1. */
export interface Biquad {
	readonly b0: number;
	readonly b1: number;
	readonly b2: number;
	readonly a1: number;
	readonly a2: number;
}

/** `input` through a biquad (transposed direct form II, in double precision). */
export function filter(input: ArrayLike<number>, f: Biquad, out?: Float64Array): Float64Array {
	const y = out ?? new Float64Array(input.length);
	let z1 = 0;
	let z2 = 0;
	for (let i = 0; i < input.length; i++) {
		const x = input[i];
		const v = f.b0 * x + z1;
		z1 = f.b1 * x - f.a1 * v + z2;
		z2 = f.b2 * x - f.a2 * v;
		y[i] = v;
	}
	return y;
}

/** The cookbook's shared terms at `hz`, Q = 1/√2 (Butterworth). */
function terms(hz: number, sampleRate: number) {
	const w = (2 * Math.PI * Math.min(hz, 0.49 * sampleRate)) / sampleRate;
	const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
	return { cos: Math.cos(w), alpha, a0: 1 + alpha };
}

/** A second-order Butterworth low-pass at `hz`. */
export function lowpass(hz: number, sampleRate: number): Biquad {
	const { cos, alpha, a0 } = terms(hz, sampleRate);
	return {
		b0: (1 - cos) / 2 / a0,
		b1: (1 - cos) / a0,
		b2: (1 - cos) / 2 / a0,
		a1: (-2 * cos) / a0,
		a2: (1 - alpha) / a0
	};
}

/** A second-order Butterworth high-pass at `hz`. */
export function highpass(hz: number, sampleRate: number): Biquad {
	const { cos, alpha, a0 } = terms(hz, sampleRate);
	return {
		b0: (1 + cos) / 2 / a0,
		b1: -(1 + cos) / a0,
		b2: (1 + cos) / 2 / a0,
		a1: (-2 * cos) / a0,
		a2: (1 - alpha) / a0
	};
}
