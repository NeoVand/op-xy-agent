// hardsync against the device: a plain saw at freq 0, the synced saw's ratio rising linearly to 8
// while the pitch stays the note, the sub saw at the note, the lowcut's one pole on the saws only,
// white noise, the device's levels, and the bounds every engine keeps. Played straight at 48 kHz,
// block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, rms } from '../analysis';
import { BOUNDS, SR, clickRatios, grid, m1, play, worstInharmonic, worstPeak } from './audition';
import { DEVICE_GAIN_DB } from './device';
import { HardsyncVoice, LEVEL, LOWCUT, NOISE_DENSITY_DB, SUB_LEVEL, TOP_RATIO } from './hardsync';

const make = (seed: number) => new HardsyncVoice(SR, seed);
const DEFAULT = m1(80, 80, 80, 80);

describe('hardsync', () => {
	it('is a plain saw at the note at freq 0, periodic and band-limited', () => {
		const { left } = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		const h = harmonicLevels(left, SR, 220, 8);
		h.forEach((v, i) => expect(v / h[0]).toBeCloseTo(1 / (i + 1), 2));
		expect(inharmonicDb(left, SR, 220)).toBeLessThan(-60);
	});

	it('moves the synced saw linearly from the note to 8 × it, the pitch staying the note', () => {
		const f0 = 110;
		// the harmonic that leads at each freq the device measured: 3 at CC 38, 4 at 51, 6 at 89
		for (const [cc, lead] of [
			[38, 3],
			[51, 4],
			[89, 6]
		]) {
			const freq = cc / 127;
			const x = play(make(1), f0, 1, [freq, 0, 0, 0]).left;
			const h = harmonicLevels(x.subarray(4800), SR, f0, 10);
			expect(h.indexOf(Math.max(...h)) + 1, `CC ${cc}`).toBe(lead);
			expect(inharmonicDb(x, SR, f0), `CC ${cc}`).toBeLessThan(-50);
		}
		// at full freq a plain saw three octaves up: harmonics 8, 16, 24 only
		const top = play(make(1), f0, 1, [1, 0, 0, 0]).left.subarray(4800);
		const h = harmonicLevels(top, SR, f0, 16);
		expect(TOP_RATIO).toBe(8);
		for (const n of [1, 2, 3, 5, 7]) expect(h[n - 1] / h[7]).toBeLessThan(0.01);
		expect(h[15] / h[7]).toBeCloseTo(0.5, 1);
	});

	it('adds a sub saw at the note, in phase: at freq 0 the sum stays a saw, SUB_LEVEL louder', () => {
		const plain = play(make(1), 220, 0.5, [0, 0, 0, 0]).left.subarray(2400);
		const full = play(make(1), 220, 0.5, [0, 1, 0, 0]).left.subarray(2400);
		const h = harmonicLevels(full, SR, 220, 8);
		h.forEach((v, i) => expect(v / h[0]).toBeCloseTo(1 / (i + 1), 2));
		expect(rms(full) / rms(plain)).toBeCloseTo(1 + SUB_LEVEL, 1);
		// nothing sounds an octave down
		expect(levelAt(full, SR, 110)).toBeLessThan(1e-3);
	});

	it('cuts the saws with lowcut, one pole along the measured corners, and leaves the noise', () => {
		const f0 = 110;
		const open = play(make(1), f0, 1, [0, 0, 0, 0]).left;
		const gain = (x: Float32Array, hz: number) => levelAt(x, SR, hz) / levelAt(open, SR, hz);
		for (const i of [2, 5, 8]) {
			const corner = LOWCUT.hz[i];
			const x = play(make(1), f0, 1, [0, 0, 0, LOWCUT.at[i]]).left;
			for (const n of [1, 2, 3]) {
				const hz = n * f0;
				expect(gain(x, hz)).toBeCloseTo(hz / Math.hypot(hz, corner), 2);
			}
		}
		// noise passes the lowcut untouched
		const band = (x: Float32Array) => rms(x.subarray(4800));
		const noiseOpen =
			band(play(make(7), f0, 1, [1, 0, 1, 0]).left) ** 2 -
			band(play(make(7), f0, 1, [1, 0, 0, 0]).left) ** 2;
		const noiseShut =
			band(play(make(7), f0, 1, [1, 0, 1, 1]).left) ** 2 -
			band(play(make(7), f0, 1, [1, 0, 0, 1]).left) ** 2;
		expect(noiseShut / noiseOpen).toBeCloseTo(1, 1);
	});

	it('adds white noise: energy off the harmonic series', () => {
		const clean = play(make(1), 220, 0.5, [0.5, 0, 0, 0]).left;
		const noisy = play(make(1), 220, 0.5, [0.5, 0, 0.5, 0]).left;
		expect(inharmonicDb(noisy, SR, 220)).toBeGreaterThan(inharmonicDb(clean, SR, 220) + 30);
	});

	it('plays at the device’s levels: the saw at −24.1 dBFS, full noise at −64 dBFS/Hz', () => {
		const saw = play(make(1), 220, 1, [0, 0, 0, 0]).left;
		expect(20 * Math.log10(rms(saw.subarray(4800)))).toBeCloseTo(-24.1 + DEVICE_GAIN_DB, 0);
		expect(LEVEL).toBeCloseTo(Math.sqrt(3) * Math.pow(10, (-24.1 + DEVICE_GAIN_DB) / 20), 6);
		// the noise alone (the same seed with and without it), its density over 1–8 kHz
		const noisy = play(make(1), 220, 1, [0, 0, 1, 0]).left;
		const noise = noisy.map((v, i) => v - saw[i]);
		expect(density(noise.subarray(4800), 1000, 8000)).toBeCloseTo(
			NOISE_DENSITY_DB + DEVICE_GAIN_DB,
			0
		);
	});

	it('never peaks past ±1.2, on any setting or note', { timeout: 60_000 }, () => {
		const { peak, at } = worstPeak(make, grid([0, 0.5, 1]), BOUNDS.notes);
		expect(peak, at).toBeLessThan(BOUNDS.peak);
	});

	it('moves every parameter without clicks', { timeout: 60_000 }, () => {
		for (let k = 0; k < 4; k++) {
			const { sweep, jump, back } = clickRatios(make, DEFAULT, k);
			expect(Math.max(sweep, jump, back), `p${k + 1}`).toBeLessThan(BOUNDS.click);
		}
	});

	it('stays periodic at the note and band-limited on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = grid([0, 0.33, 0.67, 1]).filter((p) => p[2] === 0);
		const { db, at } = worstInharmonic(make, settings, BOUNDS.highNotes);
		expect(db, at).toBeLessThan(BOUNDS.inharmonic);
	});
});

/** A signal's average power density (dB per hertz) between `lo` and `hi`: Welch, Hann, 1024 points. */
function density(x: Float32Array, lo: number, hi: number): number {
	const n = 1024;
	const w = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
	const w2 = w.reduce((s, v) => s + v * v, 0);
	let sum = 0;
	let count = 0;
	for (let at = 0; at + n <= x.length; at += n / 2) {
		for (let k = Math.ceil((lo * n) / SR); k <= Math.floor((hi * n) / SR); k++) {
			let re = 0;
			let im = 0;
			for (let i = 0; i < n; i++) {
				re += x[at + i] * w[i] * Math.cos((2 * Math.PI * k * i) / n);
				im -= x[at + i] * w[i] * Math.sin((2 * Math.PI * k * i) / n);
			}
			// one-sided: twice the two-sided density
			sum += (2 * (re * re + im * im)) / (SR * w2);
			count++;
		}
	}
	return 10 * Math.log10(sum / count);
}
