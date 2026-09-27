// simple, measured: saw to square, pulse width that acts only on the square, white noise, the
// device's stereo copy, its level against the device's, and the bounds every engine keeps. Played
// straight at 48 kHz, block by block as the core plays it.
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
import { DEVICE_GAIN_DB } from './device';
import { PW_RANGE, SimpleVoice } from './simple';
import { offsetCents } from './stereo';

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

	it('is mono at stereo 0, and adds the device’s swept copy above it', () => {
		const mono = play(make(1), 220, 1, DEFAULT);
		expect(mono.right).toEqual(mono.left);
		// at full stereo on A4 the device's channels correlate at 0.69
		const wide = play(make(1), 440, 2, [0, 0, 0, 1]);
		expect(correlation(wide.left, wide.right)).toBeGreaterThan(0.55);
		expect(correlation(wide.left, wide.right)).toBeLessThan(0.85);
		// early in the note the left copy sits above the note and the right one below (stereo.spec)
		const at = (c: number) => 440 * 4 * Math.pow(2, c / 1200);
		const l = wide.left.subarray(4800, 4800 + 48000);
		const r = wide.right.subarray(4800, 4800 + 48000);
		expect(levelAt(l, SR, at(offsetCents(1)))).toBeGreaterThan(
			5 * levelAt(l, SR, at(-offsetCents(1)))
		);
		expect(levelAt(r, SR, at(-offsetCents(1)))).toBeGreaterThan(
			5 * levelAt(r, SR, at(offsetCents(1)))
		);
	});

	it('plays its saw at the device’s level', () => {
		// −18.9 dBFS on the device's USB audio: the level every measured engine is scaled from
		const { left } = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		expect(20 * Math.log10(rms(left, 2400))).toBeCloseTo(-18.9 + DEVICE_GAIN_DB, 0);
	});

	it('sits at the target level at its default M1', () => {
		const { left, right } = play(make(1), 220, 1, DEFAULT);
		for (const x of [left, right]) {
			expect(rms(x)).toBeGreaterThan(BOUNDS.level[0]);
			expect(rms(x)).toBeLessThan(BOUNDS.level[1]);
		}
	});

	it('never peaks past ±1.2 in mono, ±2 with the stereo copy', { timeout: 60_000 }, () => {
		const settings = grid([0, 0.5, 1]);
		const mono = worstPeak(
			make,
			settings.filter((p) => p[3] === 0),
			BOUNDS.notes
		);
		expect(mono.peak, mono.at).toBeLessThan(BOUNDS.peak);
		// the copy adds up to 0.89 of the sound, high-passed: its edges stack on the dry sound's, as
		// on the device
		const wide = worstPeak(make, settings, BOUNDS.notes);
		expect(wide.peak, wide.at).toBeLessThan(2);
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
