// simple, measured: saw to square, pulse width that acts only on the square, white noise, a
// stereo pair detuned apart, and the bounds every engine keeps. Played straight at 48 kHz, block by
// block as the core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, powerSpectrum, rms } from '../analysis';
import {
	BOUNDS,
	SR,
	clickRatios,
	correlation,
	grid,
	m1,
	play,
	worstInharmonic,
	worstPeak
} from './audition';
import { PW_RANGE, STEREO_CENTS, SimpleVoice } from './simple';

const make = (seed: number) => new SimpleVoice(SR, seed);
const DEFAULT = m1(80, 80, 0, 0);
/** Harmonics 1…`count` over the fundamental. */
const relative = (x: Float32Array, hz: number, count: number) => {
	const h = harmonicLevels(x, SR, hz, count);
	return h.map((v) => v / h[0]);
};

describe('simple', () => {
	it('is a saw at shape 0: every harmonic, falling as 1/n', () => {
		const { left } = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		relative(left, 220, 8).forEach((v, i) => expect(v).toBeCloseTo(1 / (i + 1), 2));
	});

	it('is a square at shape 99 with PW 0: no even harmonics, odd ones falling as 1/n', () => {
		const h = relative(play(make(1), 220, 0.5, m1(99, 0, 0, 0)).left, 220, 8);
		for (const n of [2, 4, 6, 8]) expect(h[n - 1]).toBeLessThan(0.01);
		for (const n of [3, 5, 7]) expect(h[n - 1]).toBeCloseTo(1 / n, 2);
	});

	it('does nothing with PW at saw, and narrows the square with it', () => {
		const a = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		const b = play(make(1), 220, 0.5, [0, 1, 0, 0]);
		expect(b.left).toEqual(a.left);
		// at shape 99, PW 99 is a pulse of width 0.5 − PW_RANGE: harmonic n at |sin(πnw)|/n
		const w = 0.5 - PW_RANGE;
		const h = relative(play(make(1), 220, 0.5, m1(99, 99, 0, 0)).left, 220, 4);
		for (const n of [2, 3, 4])
			expect(h[n - 1]).toBeCloseTo(
				Math.abs(Math.sin(Math.PI * n * w)) / (n * Math.sin(Math.PI * w)),
				2
			);
	});

	it('morphs saw into square without a dip in level', () => {
		const levels = [0, 0.25, 0.5, 0.75, 1].map((shape) =>
			rms(play(make(1), 220, 0.5, [shape, 0, 0, 0]).left)
		);
		for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
	});

	it('adds white noise: energy off the harmonic series, even across the spectrum', () => {
		const clean = play(make(1), 220, 0.5, [0.5, 0, 0, 0]).left;
		const noisy = play(make(1), 220, 1, [0.5, 0, 0.5, 0]).left;
		expect(inharmonicDb(clean, SR, 220)).toBeLessThan(-60);
		expect(inharmonicDb(noisy, SR, 220)).toBeGreaterThan(inharmonicDb(clean, SR, 220) + 30);
		// white: the same power per hertz between the harmonics, low and high
		const { power, binHz } = powerSpectrum(noisy, SR);
		const between = (lo: number, hi: number) => {
			let sum = 0;
			let bins = 0;
			for (let i = Math.ceil(lo / binHz); i < hi / binHz; i++) {
				const hz = i * binHz;
				if (Math.abs(hz - Math.round(hz / 220) * 220) / binHz > 6) {
					sum += power[i];
					bins++;
				}
			}
			return sum / bins;
		};
		expect(between(8000, 12000) / between(2000, 6000)).toBeCloseTo(1, 1);
	});

	it('is mono at stereo 0, and spreads a pair detuned apart above it', () => {
		const mono = play(make(1), 220, 1, DEFAULT);
		expect(mono.right).toEqual(mono.left);
		const wide = play(make(1), 220, 2, [1, 0, 0, 1]);
		expect(Math.abs(correlation(wide.left, wide.right))).toBeLessThan(0.3);
		// the left copy sits STEREO_CENTS below the note, the right one above
		const cents = (c: number) => 220 * Math.pow(2, c / 1200);
		expect(levelAt(wide.left, SR, cents(-STEREO_CENTS))).toBeGreaterThan(
			2 * levelAt(wide.left, SR, cents(STEREO_CENTS))
		);
		expect(levelAt(wide.right, SR, cents(STEREO_CENTS))).toBeGreaterThan(
			2 * levelAt(wide.right, SR, cents(-STEREO_CENTS))
		);
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

	it('stays band-limited for every shape and width on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = grid([0, 0.5, 1]).filter((p) => p[2] === 0 && p[3] === 0);
		const { db, at } = worstInharmonic(make, settings, BOUNDS.highNotes);
		expect(db, at).toBeLessThan(BOUNDS.inharmonic);
	});
});
