// The shared FFT (core/dsp) as listening uses it agrees with a direct DFT to rounding and inverts,
// the real-input FFT matches a direct DFT on real frames, and the Hann window overlaps to a
// constant at 50 %.
import { describe, expect, it } from 'vitest';
import { ListenError } from './errors';
import { fft, hann, nextPowerOfTwo, previousPowerOfTwo, RealFft } from './fft';
import { random } from './signals';

/** The direct DFT of a real or complex sequence. */
function dft(re: ArrayLike<number>, im: ArrayLike<number> = new Float64Array(re.length)) {
	const n = re.length;
	const outRe = new Float64Array(n);
	const outIm = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		for (let t = 0; t < n; t++) {
			const a = (-2 * Math.PI * k * t) / n;
			outRe[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a);
			outIm[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a);
		}
	}
	return { re: outRe, im: outIm };
}

function randomArray(n: number, seed: number): Float64Array {
	const u = random(seed);
	return Float64Array.from({ length: n }, () => 2 * u() - 1);
}

describe('fft', () => {
	it.each([1, 2, 4, 8, 64, 256])('matches a direct DFT at size %i', (n) => {
		const re = randomArray(n, n);
		const im = randomArray(n, n + 1);
		const expected = dft(re, im);
		fft(re, im);
		for (let k = 0; k < n; k++) {
			expect(re[k]).toBeCloseTo(expected.re[k], 9);
			expect(im[k]).toBeCloseTo(expected.im[k], 9);
		}
	});

	it('inverts', () => {
		const re = randomArray(512, 1);
		const im = randomArray(512, 2);
		const [re0, im0] = [re.slice(), im.slice()];
		fft(re, im);
		fft(re, im, true);
		for (let i = 0; i < 512; i++) {
			expect(re[i]).toBeCloseTo(re0[i], 12);
			expect(im[i]).toBeCloseTo(im0[i], 12);
		}
	});

	it('refuses lengths that differ or are not powers of two', () => {
		expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/);
		expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow(/power of two/);
	});
});

describe('RealFft', () => {
	it.each([4, 8, 32, 1024])('matches a direct DFT of a real frame at size %i', (n) => {
		const frame = randomArray(n, 10 + n);
		const expected = dft(frame);
		const real = new RealFft(n);
		const re = new Float64Array(real.bins);
		const im = new Float64Array(real.bins);
		real.transform(frame, re, im);
		for (let k = 0; k < real.bins; k++) {
			expect(re[k]).toBeCloseTo(expected.re[k], 9);
			expect(im[k]).toBeCloseTo(expected.im[k], 9);
		}
	});

	it('applies a window and gives the power per bin', () => {
		const n = 64;
		const frame = randomArray(n, 99);
		const w = hann(n);
		const windowed = frame.map((v, i) => v * w[i]);
		const expected = dft(windowed);
		const real = new RealFft(n);
		const power = new Float64Array(real.bins);
		real.power(frame, power, w);
		for (let k = 0; k < real.bins; k++) {
			expect(power[k]).toBeCloseTo(expected.re[k] ** 2 + expected.im[k] ** 2, 9);
		}
		// the same instance serves the next frame
		real.power(windowed, power);
		expect(power[3]).toBeCloseTo(expected.re[3] ** 2 + expected.im[3] ** 2, 9);
	});

	it('puts a sine in its bin', () => {
		const n = 256;
		const frame = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 10 * i) / n));
		const power = new Float64Array(n / 2 + 1);
		new RealFft(n).power(frame, power);
		expect(power.indexOf(Math.max(...power))).toBe(10);
		expect(Math.sqrt(power[10])).toBeCloseTo(n / 2, 6);
	});

	it('refuses sizes that are too small or not powers of two', () => {
		expect(() => new RealFft(2)).toThrow(ListenError);
		expect(() => new RealFft(100)).toThrow(/power of two/);
	});
});

describe('helpers', () => {
	it('round to powers of two', () => {
		expect([nextPowerOfTwo(0), nextPowerOfTwo(1), nextPowerOfTwo(5), nextPowerOfTwo(1024)]).toEqual(
			[1, 1, 8, 1024]
		);
		expect([previousPowerOfTwo(0), previousPowerOfTwo(5), previousPowerOfTwo(1025)]).toEqual([
			1, 4, 1024
		]);
	});

	it('make a periodic Hann window that sums to a constant at 50 % overlap', () => {
		const n = 16;
		const w = hann(n);
		expect(w[0]).toBe(0);
		expect(w[n / 2]).toBeCloseTo(1, 12);
		for (let i = 0; i < n / 2; i++) expect(w[i] + w[i + n / 2]).toBeCloseTo(1, 12);
	});
});
