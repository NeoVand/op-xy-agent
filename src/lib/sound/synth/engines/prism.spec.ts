// prism against what the device measured: the saw → square blend and its level law, the two pulses
// narrowing one after the other, oscillator 2's level at each of the ten ratios, detune in cents,
// the device's stereo copy, its level against the device's, and the bounds every engine keeps.
// Played straight at 48 kHz, block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, levelAt, rms } from '../analysis';
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
import { BLEND, BLEND_DB, DETUNE, PrismVoice, RATIOS, RATIO_DB, WIDTH1, WIDTH2 } from './prism';

const make = () => new PrismVoice(SR);
const DEFAULT = m1(80, 80, 80, 80);
/** The middle of ratio zone `k`. */
const ratio = (k: number) => (k + 0.5) / RATIOS.length;
const ONE_TO_ONE = ratio(1);
/** Shape at the square (CC 64). */
const SQUARE = 64 / 127;
/** Harmonics 1…`count` over the fundamental. */
const relative = (x: Float32Array, hz: number, count: number) => {
	const h = harmonicLevels(x, SR, hz, count);
	return h.map((v) => v / h[0]);
};
/** `curve`'s value at its `i`th point. */
const point = (curve: { at: readonly number[]; value: readonly number[] }, i: number) =>
	[curve.at[i], curve.value[i]] as const;

describe('prism', () => {
	it('is a saw at shape 0: every harmonic, falling as 1/n', () => {
		const { left } = play(make(), 220, 0.5, [0, ONE_TO_ONE, 0, 0]);
		relative(left, 220, 8).forEach((v, i) => expect(v).toBeCloseTo(1 / (i + 1), 2));
	});

	it('blends saw into square along the measured k: odd harmonics (1 + k)/n, even (1 − k)/n', () => {
		for (const i of [1, 2, 3, 4]) {
			const [shape, k] = point(BLEND, i);
			const h = relative(play(make(), 220, 0.5, [shape, ONE_TO_ONE, 0, 0]).left, 220, 6);
			for (let n = 2; n <= 6; n++) {
				const expected = (n % 2 ? 1 + k : 1 - k) / (n * (1 + k));
				expect(h[n - 1]).toBeCloseTo(expected, 2);
			}
		}
		// the square: no even harmonics, odd ones at 1/n
		const h = relative(play(make(), 220, 0.5, [SQUARE, ONE_TO_ONE, 0, 0]).left, 220, 8);
		for (const n of [2, 4, 6, 8]) expect(h[n - 1]).toBeLessThan(0.01);
		for (const n of [3, 5, 7]) expect(h[n - 1]).toBeCloseTo(1 / n, 2);
	});

	it('gets only 0.9 dB louder from saw to square, as the device does', () => {
		const level = (shape: number) =>
			rms(play(make(), 220, 0.5, [shape, ONE_TO_ONE, 0, 0]).left, 2400);
		// saw − k·shifted saw is 4.8 dB louder at k = 1; the device takes BLEND_DB per unit of k off
		expect(20 * Math.log10(level(SQUARE) / level(0))).toBeCloseTo(4.77 + BLEND_DB, 1);
	});

	it('narrows oscillator 2’s pulse first, then oscillator 1’s', () => {
		// at 1:1 the two pulses add: harmonic n of g1·pulse(w1) + g2·pulse(w2), pulse(w) ∝ (1 − e^(−2πinw))/n
		const g2 = Math.pow(10, RATIO_DB[1] / 20);
		for (const shape of [76 / 127, 89 / 127, 102 / 127, 114 / 127, 1]) {
			const w1 = interpolate(WIDTH1, shape);
			const w2 = interpolate(WIDTH2, shape);
			const expected = (n: number) => {
				const re = 1 - Math.cos(2 * Math.PI * n * w1) + g2 * (1 - Math.cos(2 * Math.PI * n * w2));
				const im = Math.sin(2 * Math.PI * n * w1) + g2 * Math.sin(2 * Math.PI * n * w2);
				return Math.hypot(re, im) / n;
			};
			const h = harmonicLevels(play(make(), 220, 0.5, [shape, ONE_TO_ONE, 0, 0]).left, SR, 220, 8);
			for (let n = 2; n <= 8; n++) {
				expect(h[n - 1] / h[0]).toBeCloseTo(expected(n) / expected(1), 1);
			}
		}
	});

	it('puts oscillator 2 at each of the ten ratios, at its measured level', () => {
		// squares: oscillator 1 has odd harmonics only, so oscillator 2's fundamental stands clear of
		// them except at 1:1 (they add) and 1:3 (on oscillator 1's third harmonic, a third of it)
		const f0 = 110;
		const one = levelAt(play(make(), f0, 0.5, [SQUARE, ratio(3), 0, 0]).left, SR, f0);
		RATIOS.forEach((r, k) => {
			const { left } = play(make(), f0, 0.5, [SQUARE, ratio(k), 0, 0]);
			const g2 = Math.pow(10, RATIO_DB[k] / 20) / Math.hypot(1, (r * f0) / 4000);
			const expected = r === 1 ? 1 + g2 : r === 3 ? 1 / 3 + g2 : g2;
			expect(levelAt(left, SR, r * f0) / one).toBeCloseTo(expected, 1);
		});
	});

	it('detunes oscillator 2 in cents along the measured curve: at 1:1 the two beat', () => {
		const [detune, cents] = point(DETUNE, 5);
		const beat = 220 * (Math.pow(2, cents / 1200) - 1);
		// the fundamental's level every 25 ms, in 50 ms windows
		const envelope = (x: Float32Array) => {
			const out: number[] = [];
			for (let at = 0; at + 2400 <= x.length; at += 1200)
				out.push(levelAt(x.subarray(at, at + 2400), SR, 220));
			return out;
		};
		const beating = envelope(play(make(), 220, 3, [SQUARE, ONE_TO_ONE, detune, 0]).left);
		// oscillator 2 at 2.4 dB under oscillator 1: the troughs leave (1 − g)/(1 + g)
		const g = Math.pow(10, RATIO_DB[1] / 20);
		expect(Math.min(...beating) / Math.max(...beating)).toBeCloseTo((1 - g) / (1 + g), 1);
		const trough = (from: number, to: number) => {
			let best = from;
			for (let i = from; i < Math.min(to, beating.length); i++)
				if (beating[i] < beating[best]) best = i;
			return best;
		};
		const first = trough(0, 48);
		const second = trough(first + 20, first + 64);
		expect((second - first) * 0.025).toBeCloseTo(1 / beat, 1);
	});

	it('is mono at stereo 0, and adds the device’s swept copy above it', () => {
		const mono = play(make(), 220, 1, [SQUARE, ONE_TO_ONE, 0, 0]);
		expect(mono.right).toEqual(mono.left);
		// the device's channels correlate at 0.69 at full stereo on A4 (a saw at 1:1)
		const wide = play(make(), 440, 2, [0, ONE_TO_ONE, 0, 1]);
		expect(correlation(wide.left, wide.right)).toBeGreaterThan(0.55);
		expect(correlation(wide.left, wide.right)).toBeLessThan(0.85);
	});

	it('plays at the device’s level: a saw at 1:1, −14.8 dBFS there', () => {
		const { left } = play(make(), 220, 0.5, [0, ONE_TO_ONE, 0, 0]);
		expect(20 * Math.log10(rms(left, 2400))).toBeCloseTo(-14.8 + DEVICE_GAIN_DB, 0);
	});

	it('never peaks past ±1.2 in mono, ±2 with the stereo copy', { timeout: 60_000 }, () => {
		const settings = grid([0, ONE_TO_ONE, 0.5, 1]);
		const mono = worstPeak(
			make,
			settings.filter((p) => p[3] === 0),
			BOUNDS.notes
		);
		expect(mono.peak, mono.at).toBeLessThan(BOUNDS.peak);
		// the copy adds up to 0.89 of the sound, high-passed: its edges stack on the dry sound's
		const wide = worstPeak(make, settings, BOUNDS.notes);
		expect(wide.peak, wide.at).toBeLessThan(2);
	});

	it('moves every parameter without clicks', { timeout: 60_000 }, () => {
		// shape, ratio and detune in mono: with the copy, a change plays against the copy of the
		// sound 12 ms before, a mix no setting makes at rest (the device's delay does the same)
		const mono = m1(80, 80, 80, 0);
		for (let k = 0; k < 4; k++) {
			const { sweep, jump, back } = clickRatios(make, k === 3 ? DEFAULT : mono, k);
			expect(Math.max(sweep, jump, back), `p${k + 1}`).toBeLessThan(BOUNDS.click);
		}
	});

	it('stays band-limited at every ratio and shape on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = RATIOS.flatMap((_, k) => [0, SQUARE, 1].map((s) => [s, ratio(k), 0, 0]));
		// 2:1 and 2:3 make the series' fundamental half the note
		const f0 = (p: ArrayLike<number>, hz: number) =>
			[0.5, 1.5].includes(RATIOS[Math.floor(p[1] * RATIOS.length)]) ? hz / 2 : hz;
		const { db, at } = worstInharmonic(make, settings, BOUNDS.highNotes, f0);
		expect(db, at).toBeLessThan(BOUNDS.inharmonic);
	});
});

/** A measured curve at `x`, linearly between its points. */
function interpolate(
	curve: { at: readonly number[]; value: readonly number[] },
	x: number
): number {
	const { at, value } = curve;
	if (x <= at[0]) return value[0];
	if (x >= at[at.length - 1]) return value[value.length - 1];
	let i = 0;
	while (x > at[i + 1]) i++;
	return value[i] + ((value[i + 1] - value[i]) * (x - at[i])) / (at[i + 1] - at[i]);
}
