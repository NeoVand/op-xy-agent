// hardsync, measured: a plain saw at freq 0, the synced formant climbing three octaves while the
// pitch stays the note, the sub at the note, the lowcut's slope and range, white noise, and the
// bounds every engine keeps. Played straight at 48 kHz, block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { centroid, harmonicLevels, inharmonicDb, levelAt, powerSpectrum, rms } from '../analysis';
import { BOUNDS, SR, clickRatios, grid, m1, play, worstInharmonic, worstPeak } from './audition';
import { HardsyncVoice, LEVEL, LOWCUT_FROM, LOWCUT_TO, OCTAVES, SUB_LEVEL } from './hardsync';

const make = (seed: number) => new HardsyncVoice(SR, seed);
const DEFAULT = m1(80, 80, 80, 80);

/** The share of `x`'s power between `lo` and `hi` hertz. */
function share(x: Float32Array, lo: number, hi: number): number {
	const { power, binHz } = powerSpectrum(x, SR);
	let band = 0;
	let total = 0;
	for (let i = 1; i < power.length; i++) {
		total += power[i];
		if (i * binHz >= lo && i * binHz <= hi) band += power[i];
	}
	return band / total;
}

describe('hardsync', () => {
	it('is a plain saw at the note at freq 0, periodic and band-limited', () => {
		const { left } = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		const h = harmonicLevels(left, SR, 220, 8);
		h.forEach((v, i) => expect(v / h[0]).toBeCloseTo(1 / (i + 1), 2));
		expect(inharmonicDb(left, SR, 220)).toBeLessThan(-60);
	});

	it('moves the formant up three octaves with freq, the pitch staying the note', () => {
		const f0 = 110;
		const plain = play(make(1), f0, 1, [0, 0, 0, 0]).left;
		let bright = centroid(plain, SR);
		// ratios 2.3, 4.3 and 7.2: sync's own territory, clear of the plain-saw integers
		for (const freq of [0.4, 0.7, 0.95]) {
			const slave = f0 * Math.pow(2, OCTAVES * freq);
			const x = play(make(1), f0, 1, [freq, 0, 0, 0]).left;
			const lo = slave / Math.SQRT2;
			const hi = slave * Math.SQRT2;
			expect(share(x, lo, hi), `freq ${freq}`).toBeGreaterThan(2 * share(plain, lo, hi));
			expect(inharmonicDb(x, SR, f0), `freq ${freq}`).toBeLessThan(-50);
			const c = centroid(x, SR);
			expect(c).toBeGreaterThan(bright);
			bright = c;
		}
	});

	it('adds a sine sub at the note, not below it', () => {
		const without = play(make(1), 220, 0.5, [0.8, 0, 0, 0]).left;
		const withSub = play(make(1), 220, 0.5, [0.8, 1, 0, 0]).left;
		// the synced saw has little fundamental; the sub brings LEVEL·SUB_LEVEL of it
		expect(levelAt(without, SR, 220)).toBeLessThan(0.5 * LEVEL * SUB_LEVEL);
		expect(levelAt(withSub, SR, 220)).toBeGreaterThan(0.8 * LEVEL * SUB_LEVEL);
		// a sine: the harmonics above are the saw's alone, and nothing sounds an octave down
		expect(levelAt(withSub, SR, 440)).toBeCloseTo(levelAt(without, SR, 440), 3);
		expect(levelAt(withSub, SR, 110)).toBeLessThan(1e-3);
	});

	it('cuts the lows with lowcut: a two-pole highpass from 20 Hz to 3 kHz', () => {
		// a 49 Hz saw has its fifth harmonic at the middle cutoff, √(20·3000) ≈ 245 Hz
		const f0 = 49;
		const middle = Math.sqrt(LOWCUT_FROM * LOWCUT_TO);
		const open = play(make(1), f0, 1, [0, 0, 0, 0]).left;
		const half = play(make(1), f0, 1, [0, 0, 0, 0.5]).left;
		const shut = play(make(1), f0, 1, [0, 0, 0, 1]).left;
		const gain = (x: Float32Array, hz: number) => levelAt(x, SR, hz) / levelAt(open, SR, hz);
		expect(gain(half, middle)).toBeCloseTo(Math.SQRT1_2, 1);
		// 12 dB an octave below the cutoff: two octaves down is −24 dB
		expect(gain(half, middle / 4)).toBeCloseTo(1 / 16, 1);
		// at the top, the fundamental is all but gone and the highs pass
		expect(gain(shut, f0)).toBeLessThan(1e-3);
		expect(gain(shut, f0 * 200)).toBeGreaterThan(0.9);
	});

	it('adds white noise: energy off the harmonic series', () => {
		const clean = play(make(1), 220, 0.5, [0.5, 0, 0, 0]).left;
		const noisy = play(make(1), 220, 0.5, [0.5, 0, 0.5, 0]).left;
		expect(inharmonicDb(noisy, SR, 220)).toBeGreaterThan(inharmonicDb(clean, SR, 220) + 30);
	});

	it('sits at the target level at its default M1', () => {
		const { left, right } = play(make(1), 220, 1, DEFAULT);
		for (const x of [left, right]) {
			expect(rms(x)).toBeGreaterThan(BOUNDS.level[0]);
			expect(rms(x)).toBeLessThan(BOUNDS.level[1]);
		}
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
