// prism, measured: saw to square to a narrower pulse, oscillator 2 at each of the nine ratios the
// device shows, detune's slow beating, stereo's width, and the bounds every engine keeps. Played
// straight at 48 kHz, block by block as the core plays it.
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
import { DETUNE_CENTS, NARROWEST, Prism, RATIOS, SQUARE_AT } from './prism';

const make = () => new Prism(SR);
const DEFAULT = m1(80, 80, 80, 80);
/** The middle of ratio step `k`'s range. */
const ratio = (k: number) => (k + 0.5) / RATIOS.length;
const ONE_TO_ONE = ratio(1);
/** Harmonics 1…`count` over the fundamental. */
const relative = (x: Float32Array, hz: number, count: number) => {
	const h = harmonicLevels(x, SR, hz, count);
	return h.map((v) => v / h[0]);
};

describe('prism', () => {
	it('is a saw at shape 0: every harmonic, falling as 1/n', () => {
		const { left } = play(make(), 220, 0.5, [0, ONE_TO_ONE, 0, 0]);
		relative(left, 220, 8).forEach((v, i) => expect(v).toBeCloseTo(1 / (i + 1), 2));
	});

	it('is a square at the square point: no even harmonics, odd ones falling as 1/n', () => {
		const h = relative(play(make(), 220, 0.5, [SQUARE_AT, ONE_TO_ONE, 0, 0]).left, 220, 8);
		for (const n of [2, 4, 6, 8]) expect(h[n - 1]).toBeLessThan(0.01);
		for (const n of [3, 5, 7]) expect(h[n - 1]).toBeCloseTo(1 / n, 2);
	});

	it('morphs saw into square without a dip in level, then narrows the pulse', () => {
		// the odd/even blend's power, (1 − k)²/3 + k, rises all the way to the square
		const levels = [0, 0.2, 0.4, 0.6, SQUARE_AT].map((shape) =>
			rms(play(make(), 220, 0.5, [shape, ONE_TO_ONE, 0, 0]).left)
		);
		for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
		// at the top, a pulse of width w: harmonic n at |sin(πnw)|/n
		const h = relative(play(make(), 220, 0.5, [1, ONE_TO_ONE, 0, 0]).left, 220, 4);
		const pulse = (n: number) =>
			Math.abs(Math.sin(Math.PI * n * NARROWEST)) / (n * Math.sin(Math.PI * NARROWEST));
		for (const n of [2, 3, 4]) expect(h[n - 1]).toBeCloseTo(pulse(n), 2);
	});

	it('puts oscillator 2 at each of the nine ratios the screen shows', () => {
		// squares, so oscillator 1 has odd harmonics only and oscillator 2's fundamental stands clear
		// of them: the sub-octave at 2:1, the fifth above at 2:3, the octave at 1:2, and so on
		const f0 = 220;
		const one = levelAt(play(make(), f0, 0.5, [SQUARE_AT, ratio(3), 0, 0]).left, SR, f0);
		RATIOS.forEach((r, k) => {
			const { left } = play(make(), f0, 0.5, [SQUARE_AT, ratio(k), 0, 0]);
			// both at half level; at 1:1 the two add, at 1:3 oscillator 2 lands on the third harmonic
			const expected = r === 1 ? 2 : r === 3 ? 4 / 3 : 1;
			expect(levelAt(left, SR, r * f0) / one).toBeCloseTo(expected, 1);
		});
	});

	it('detunes oscillator 2: at 1:1 the two beat slowly', () => {
		const detune = 0.5;
		const beat = 220 * (Math.pow(2, (DETUNE_CENTS * detune * detune) / 1200) - 1);
		// the fundamental's level every 25 ms, in 50 ms windows
		const envelope = (x: Float32Array) => {
			const out: number[] = [];
			for (let at = 0; at + 2400 <= x.length; at += 1200)
				out.push(levelAt(x.subarray(at, at + 2400), SR, 220));
			return out;
		};
		const beating = envelope(play(make(), 220, 3, [SQUARE_AT, ONE_TO_ONE, detune, 0]).left);
		// equal oscillators cancel at each trough
		expect(Math.min(...beating) / Math.max(...beating)).toBeLessThan(0.1);
		const trough = (from: number, to: number) => {
			let best = from;
			for (let i = from; i < Math.min(to, beating.length); i++)
				if (beating[i] < beating[best]) best = i;
			return best;
		};
		const first = trough(0, 48);
		const second = trough(first + 20, first + 64);
		expect((second - first) * 0.025).toBeCloseTo(1 / beat, 1);
		// and without detune there is nothing to beat
		const still = envelope(play(make(), 220, 1, [SQUARE_AT, ONE_TO_ONE, 0, 0]).left);
		expect(Math.min(...still) / Math.max(...still)).toBeGreaterThan(0.99);
	});

	it('is mono at stereo 0, and wide above it, even at 1:1 with no detune', () => {
		const mono = play(make(), 220, 1, [SQUARE_AT, ONE_TO_ONE, 0, 0]);
		expect(mono.right).toEqual(mono.left);
		const wide = play(make(), 220, 2, [SQUARE_AT, ONE_TO_ONE, 0, 1]);
		expect(Math.abs(correlation(wide.left, wide.right))).toBeLessThan(0.5);
		const usual = play(make(), 220, 2, DEFAULT);
		expect(correlation(usual.left, usual.right)).toBeLessThan(0.9);
	});

	it('sits at the target level at its default M1', () => {
		const { left, right } = play(make(), 220, 1, DEFAULT);
		for (const x of [left, right]) {
			expect(rms(x)).toBeGreaterThan(BOUNDS.level[0]);
			expect(rms(x)).toBeLessThan(BOUNDS.level[1]);
		}
	});

	it('never peaks past ±1.2, on any setting or note', { timeout: 60_000 }, () => {
		const { peak, at } = worstPeak(make, grid([0, ONE_TO_ONE, 0.5, 1]), BOUNDS.notes);
		expect(peak, at).toBeLessThan(BOUNDS.peak);
	});

	it('moves every parameter without clicks', { timeout: 60_000 }, () => {
		for (let k = 0; k < 4; k++) {
			const { sweep, jump, back } = clickRatios(make, DEFAULT, k);
			expect(Math.max(sweep, jump, back), `p${k + 1}`).toBeLessThan(BOUNDS.click);
		}
	});

	it('stays band-limited at every ratio and shape on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = RATIOS.flatMap((_, k) => [0, SQUARE_AT, 1].map((s) => [s, ratio(k), 0, 0]));
		// 2:1 and 2:3 make the series' fundamental half the note
		const f0 = (p: ArrayLike<number>, hz: number) =>
			[0.5, 1.5].includes(RATIOS[Math.floor(p[1] * RATIOS.length)]) ? hz / 2 : hz;
		const { db, at } = worstInharmonic(make, settings, BOUNDS.highNotes, f0);
		expect(db, at).toBeLessThan(BOUNDS.inharmonic);
	});
});
