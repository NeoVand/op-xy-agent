/**
 * Band-limited corrections for waveforms with jumps and corners (Brandt, "Hard sync without
 * aliasing", 2001): an oscillator computes its plain waveform and, at each jump, adds the
 * difference between a band-limited step and the plain one over the next few samples. The step is
 * minimum-phase, so nothing is delayed and a jump at any fraction of a sample (a saw's wrap, a
 * pulse's edge, a hard-sync reset) is corrected exactly where it happens. Corners (a triangle's
 * tips) use the cheaper two-sample polynomial ramp correction: their harmonics fall off fast enough.
 */
import { fft } from './analysis';

/** Zero crossings of the windowed sinc on each side: the step settles within 2 × this samples. */
export const BLEP_ZEROS = 16;
/** Table points per sample (the fractional position is interpolated between them). */
export const BLEP_OVERSAMPLE = 64;
/** Samples a correction spans. */
export const BLEP_SPAN = 2 * BLEP_ZEROS;

/**
 * The minimum-phase band-limited step minus the ideal step, sampled `BLEP_OVERSAMPLE` times per
 * sample over {@link BLEP_SPAN} samples, with a guard point for interpolation. Built once.
 */
function buildResidual(): Float32Array {
	const n = BLEP_SPAN * BLEP_OVERSAMPLE + 1;
	// a Blackman-windowed sinc, cut a little below Nyquist so the step's ripple stays out of band
	const cutoff = 0.9;
	const size = 1 << Math.ceil(Math.log2(n * 8));
	const re = new Float64Array(size);
	const im = new Float64Array(size);
	for (let i = 0; i < n; i++) {
		const x = ((i - (n - 1) / 2) / BLEP_OVERSAMPLE) * cutoff;
		const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
		const a = (2 * Math.PI * i) / (n - 1);
		re[i] = sinc * (0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a));
	}
	// minimum phase through the real cepstrum: log |X|, fold onto positive quefrencies, exp back
	fft(re, im);
	for (let i = 0; i < size; i++) {
		re[i] = Math.log(Math.max(1e-12, Math.hypot(re[i], im[i])));
		im[i] = 0;
	}
	fft(re, im, true);
	im[0] = 0;
	im[size / 2] = 0;
	for (let i = 1; i < size / 2; i++) {
		re[i] *= 2;
		im[i] = 0;
	}
	for (let i = size / 2 + 1; i < size; i++) {
		re[i] = 0;
		im[i] = 0;
	}
	fft(re, im);
	for (let i = 0; i < size; i++) {
		const mag = Math.exp(re[i]);
		const phase = im[i];
		re[i] = mag * Math.cos(phase);
		im[i] = mag * Math.sin(phase);
	}
	fft(re, im, true);
	// integrate the minimum-phase impulse into a step that ends at exactly 1, then keep the residual
	const residual = new Float32Array(n + 1);
	let sum = 0;
	for (let i = 0; i < n; i++) sum += re[i];
	let acc = 0;
	for (let i = 0; i < n; i++) {
		acc += re[i];
		residual[i] = acc / sum - 1;
	}
	residual[n - 1] = 0;
	residual[n] = 0;
	return residual;
}

let table: Float32Array | null = null;

/** The shared residual table (built on first use). */
export function blepResidual(): Float32Array {
	table ??= buildResidual();
	return table;
}

/**
 * Collects the corrections for one oscillator: `add` a jump as it happens, and take `next()` once
 * per output sample, adding it to the plain waveform.
 */
export class BlepBuffer {
	readonly #residual = blepResidual();
	/** Corrections still to come, as a ring buffer read at `#at`. */
	readonly #pending = new Float32Array(BLEP_SPAN);
	#at = 0;

	/**
	 * A jump of `height` (new value − old value) that happened `ago` samples before the sample
	 * about to be output (0 ≤ ago < 1: between the previous sample and this one).
	 */
	add(height: number, ago: number): void {
		const r = this.#residual;
		const pending = this.#pending;
		let pos = ago * BLEP_OVERSAMPLE;
		let slot = this.#at;
		for (let k = 0; k < BLEP_SPAN; k++) {
			const i = pos | 0;
			const f = pos - i;
			pending[slot] += height * (r[i] + (r[i + 1] - r[i]) * f);
			pos += BLEP_OVERSAMPLE;
			slot = (slot + 1) & (BLEP_SPAN - 1);
		}
	}

	/** The correction for the sample being output now. */
	next(): number {
		const at = this.#at;
		const v = this.#pending[at];
		this.#pending[at] = 0;
		this.#at = (at + 1) & (BLEP_SPAN - 1);
		return v;
	}

	/** Forgets pending corrections (a voice restarting from silence). */
	clear(): void {
		this.#pending.fill(0);
	}
}

/**
 * Two-sample polynomial correction for a corner at phase 0 of an oscillator at phase `t`, advancing
 * `dt` per sample (the integrated linear B-spline: (1 − τ)³/6 after the corner, (1 + τ)³/6 before
 * it, τ in samples). Multiply by the slope change per sample: the change per unit of phase × `dt`.
 */
export function polyBlamp(t: number, dt: number): number {
	if (t < dt) {
		const x = 1 - t / dt;
		return (x * x * x) / 6;
	}
	if (t > 1 - dt) {
		const x = 1 + (t - 1) / dt;
		return (x * x * x) / 6;
	}
	return 0;
}
