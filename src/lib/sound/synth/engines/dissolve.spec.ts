// dissolve, measured: a pure sine at all-zero, two detuned carriers beating, swarm's wobble and
// noise band, FM's saw-like series against Bessel functions, AM's sidebands, the DC the FM leaves
// taken off, and the bounds every engine keeps. Played straight at 48 kHz, block by block as the
// core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, powerSpectrum, rms } from '../analysis';
import { BOUNDS, SR, clickRatios, grid, m1, play, worstInharmonic, worstPeak } from './audition';
import { DETUNE_CENTS, DissolveVoice, FM_INDEX, LEVEL, besselJ1 } from './dissolve';

const make = (seed: number) => new DissolveVoice(SR, seed);
const DEFAULT = m1(49, 52, 90, 0);

/** Jₙ(x) by its power series. */
function besselJ(n: number, x: number): number {
	let term = Math.pow(x / 2, n);
	for (let k = 2; k <= n; k++) term /= k;
	let sum = term;
	for (let m = 1; m < 40; m++) {
		term *= -(x * x) / (4 * m * (m + n));
		sum += term;
	}
	return sum;
}

/** Mean power per bin in `lo`–`hi` hertz, leaving out the bins near `f0`'s harmonics. */
function between(x: Float32Array, f0: number, lo: number, hi: number): number {
	const { power, binHz } = powerSpectrum(x, SR);
	let sum = 0;
	let bins = 0;
	for (let i = Math.ceil(lo / binHz); i < hi / binHz; i++) {
		const hz = i * binHz;
		if (Math.abs(hz - Math.max(1, Math.round(hz / f0)) * f0) / binHz > 6) {
			sum += power[i];
			bins++;
		}
	}
	return sum / bins;
}

describe('dissolve', () => {
	it('is a pure sine with everything at zero', () => {
		const { left, right } = play(make(1), 220, 0.5, [0, 0, 0, 0]);
		const h = harmonicLevels(left, SR, 220, 8);
		expect(h[0]).toBeCloseTo(LEVEL, 2);
		for (const v of h.slice(1)) expect(20 * Math.log10(v / h[0])).toBeLessThan(-50);
		expect(right).toEqual(left);
	});

	it('spreads two carriers with detune, which beat', () => {
		const detune = 0.5;
		const cents = (DETUNE_CENTS * detune * detune) / 2;
		const [low, high] = [-cents, cents].map((c) => 220 * Math.pow(2, c / 1200));
		const { left } = play(make(1), 220, 2, [0, 0, 0, detune]);
		// a carrier each side of the note, half the level each
		expect(levelAt(left, SR, low)).toBeCloseTo(LEVEL / 2, 1);
		expect(levelAt(left, SR, high)).toBeCloseTo(LEVEL / 2, 1);
		// the level every 10 ms, in 30 ms windows: troughs one beat apart
		const envelope: number[] = [];
		for (let at = 0; at + 1440 <= left.length; at += 480)
			envelope.push(levelAt(left.subarray(at, at + 1440), SR, 220));
		expect(Math.min(...envelope) / Math.max(...envelope)).toBeLessThan(0.1);
		const trough = (from: number, to: number) => {
			let best = from;
			for (let i = from; i < to; i++) if (envelope[i] < envelope[best]) best = i;
			return best;
		};
		const first = trough(0, 40);
		const second = trough(first + 15, first + 55);
		expect((second - first) * 0.01).toBeCloseTo(1 / (high - low), 1);
	});

	it('swarms: noise banded around the note, and the pitch wobbling', () => {
		const clean = play(make(1), 220, 1, [0, 0, 0, 0]).left;
		const swarm = play(make(1), 220, 1, [0.5, 0, 0, 0]).left;
		expect(inharmonicDb(swarm, SR, 220)).toBeGreaterThan(inharmonicDb(clean, SR, 220) + 30);
		// the noise sits around the note, far above what reaches the upper harmonics' region
		const full = play(make(1), 220, 1, [1, 0, 0, 0]).left;
		expect(between(full, 220, 150, 330)).toBeGreaterThan(30 * between(full, 220, 2000, 3000));
		// wobble: the carriers leave the note's exact frequency
		expect(levelAt(full, SR, 220)).toBeLessThan(0.8 * levelAt(clean, SR, 220));
	});

	it('turns saw-like with FM: the cosine-phase 1:1 series, periodic', () => {
		// index 1.5: harmonic k at |J(k−1) − (−1)^k·J(k+1)|, about 1 : 0.67 : 0.33 : 0.08
		const index = 1.5;
		const fm = Math.sqrt(index / FM_INDEX);
		const { left } = play(make(1), 220, 0.5, [0, 0, fm, 0]);
		const h = harmonicLevels(left, SR, 220, 5);
		const series = [1, 2, 3, 4].map((k) =>
			Math.abs(besselJ(k - 1, index) - Math.pow(-1, k) * besselJ(k + 1, index))
		);
		for (let k = 1; k < 4; k++) expect(h[k] / h[0]).toBeCloseTo(series[k] / series[0], 2);
		expect(inharmonicDb(left, SR, 220)).toBeLessThan(-60);
		// and more FM, more harmonics: the fifth grows tenfold from there to the top
		const top = harmonicLevels(play(make(1), 220, 0.5, [0, 0, 1, 0]).left, SR, 220, 5);
		expect(top[4] / top[0]).toBeGreaterThan(10 * (h[4] / h[0]));
	});

	it('takes off the DC the cosine modulator leaves', () => {
		// J₁ peaks near index 1.84: left in, the offset would be LEVEL·0.58
		const fm = Math.sqrt(1.8412 / FM_INDEX);
		const { left } = play(make(1), 200, 1, [0, 0, fm, 0]);
		const mean = left.reduce((s, v) => s + v, 0) / left.length;
		expect(Math.abs(mean)).toBeLessThan(1e-3);
	});

	it('adds grit and highs with AM: sidebands off the series and above the note', () => {
		const pure = play(make(1), 220, 1, [0, 0, 0, 0]).left;
		const am = play(make(1), 220, 1, [0, 1, 0, 0]).left;
		expect(inharmonicDb(am, SR, 220)).toBeGreaterThan(inharmonicDb(pure, SR, 220) + 30);
		// noise at the note times the carrier: a band around twice the note
		expect(levelAt(am, SR, 440)).toBeGreaterThan(100 * levelAt(pure, SR, 440));
	});

	it('knows J₁', () => {
		expect(besselJ1(1)).toBeCloseTo(0.4400505857, 9);
		expect(besselJ1(1.8411838)).toBeCloseTo(0.5818652, 6);
		expect(besselJ1(3.831706)).toBeCloseTo(0, 6);
		expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 9);
	});

	it('sits at the target level at its default M1, whatever its randomness does', () => {
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const { left } = play(make(seed), 220, 2, DEFAULT);
			expect(rms(left), `seed ${seed}`).toBeGreaterThan(BOUNDS.level[0]);
			expect(rms(left), `seed ${seed}`).toBeLessThan(BOUNDS.level[1]);
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
		// from a pure sine, where any step would stand out
		for (let k = 0; k < 4; k++) {
			const { sweep, jump, back } = clickRatios(make, [0, 0, 0, 0], k);
			expect(Math.max(sweep, jump, back), `p${k + 1} from the sine`).toBeLessThan(BOUNDS.click);
		}
	});

	it('stays band-limited with FM on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = [0, 0.25, 0.5, 0.7, 0.78, 0.85, 1].map((fm) => [0, 0, fm, 0]);
		const { db, at } = worstInharmonic(make, settings, BOUNDS.highNotes);
		expect(db, at).toBeLessThan(BOUNDS.inharmonic);
	});
});
