// dissolve against the device: a pure sine at 0 at the device's level, detune's two carriers at
// ±34 cents with the lower 5 dB under, fm as each carrier's own feedback, am as a hard clip inside
// the loop, swarm's pitch jitter spreading a band around the note, and the bounds every engine
// keeps. Played straight at 48 kHz, block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, powerSpectrum, rms } from '../analysis';
import { DEVICE_GAIN_DB } from './device';
import { BOUNDS, SR, clickRatios, grid, m1, play, worstInharmonic, worstPeak } from './audition';
import {
	CLIP,
	DETUNE_CENTS,
	DissolveVoice,
	FEEDBACK,
	LOWER_DB,
	SWARM_CURVE,
	SWARM_SPREAD,
	UPPER_DB
} from './dissolve';

const make = (seed: number) => new DissolveVoice(SR, seed);
const DEFAULT = m1(49, 52, 90, 0);
const db = (x: number) => 20 * Math.log10(x);

/** Harmonics 1…`count` of the carrier y = clip(g·sin(θ + β·y)), settled over many cycles. */
function reference(beta: number, g: number, count: number): number[] {
	const n = 2048;
	let y = new Float64Array(n);
	for (let i = 0; i < n; i++) y[i] = Math.sin((2 * Math.PI * i) / n);
	for (let pass = 0; pass < 200; pass++) {
		const next = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			const x = g * Math.sin((2 * Math.PI * i) / n + beta * y[i]);
			next[i] = Math.max(-1, Math.min(1, x));
		}
		y = next;
	}
	return Array.from({ length: count }, (_, k) => {
		let re = 0;
		let im = 0;
		for (let i = 0; i < n; i++) {
			re += y[i] * Math.cos((2 * Math.PI * (k + 1) * i) / n);
			im += y[i] * Math.sin((2 * Math.PI * (k + 1) * i) / n);
		}
		return (2 * Math.hypot(re, im)) / n;
	});
}

describe('dissolve', () => {
	it('is a pure sine with everything at zero, at the device’s level', () => {
		const { left } = play(make(1), 110, 0.5, [0, 0, 0, 0]);
		const x = left.subarray(4800, 4800 + 16384);
		const h = harmonicLevels(x, SR, 110, 6);
		for (let k = 1; k < 6; k++) expect(h[k] / h[0]).toBeLessThan(1e-3);
		expect(inharmonicDb(x, SR, 110)).toBeLessThan(-80);
		// the two carriers in phase: the upper's peak plus the lower's, 5 dB under
		const peak = Math.pow(10, (UPPER_DB + DEVICE_GAIN_DB) / 20) * (1 + Math.pow(10, LOWER_DB / 20));
		expect(db(h[0])).toBeCloseTo(db(peak), 1);
	});

	it('splits the carriers ±34.3 cents at full detune, the lower 5 dB under the upper', () => {
		const { left } = play(make(1), 440, 1.5, [0, 0, 0, 1]);
		const x = left.subarray(4800);
		const up = levelAt(x, SR, 440 * Math.pow(2, DETUNE_CENTS / 1200));
		const down = levelAt(x, SR, 440 * Math.pow(2, -DETUNE_CENTS / 1200));
		expect(db(down / up)).toBeCloseTo(LOWER_DB, 0);
		expect(levelAt(x, SR, 440)).toBeLessThan(0.05 * up);
	});

	it('turns fm into each carrier’s own feedback, and am into a hard clip inside the loop', () => {
		for (const [fm, am, hz] of [
			[1, 0, 110],
			[0.5, 0, 110],
			[0, 1, 110],
			[64 / 127, 64 / 127, 110],
			// the device drives the clip less up the keyboard
			[0, 1, 440],
			[0, 64 / 127, 440]
		]) {
			const { left } = play(make(1), hz, 0.6, [0, am, fm, 0]);
			const h = harmonicLevels(left.subarray(4800, 4800 + 16384), SR, hz, 6);
			const g = (hz === 110 ? CLIP.a2 : CLIP.a4)[Math.round(am * 10)];
			const r = reference(FEEDBACK * fm, g, 6);
			for (let k = 1; k < 6; k++) {
				if (r[k] / r[0] < 1e-3) continue;
				const at = `fm ${fm} am ${am} at ${hz} Hz, h${k + 1}`;
				expect(db(h[k] / h[0]), at).toBeCloseTo(db(r[k] / r[0]), 0);
			}
		}
	});

	it('gets louder with am, as a clip does (no level compensation)', () => {
		const level = (am: number) => rms(play(make(1), 220, 0.5, [0, am, 0, 0]).left, 2400);
		// the device: +2 dB at full am
		expect(db(level(1) / level(0))).toBeCloseTo(2, 0);
	});

	it('spreads a band around the note with swarm, its width 0.13·swarm^1.6 of the note', () => {
		const hz = 440;
		for (const swarm of [0.5, 1]) {
			// the band's standard deviation over the note, averaged over seeds (it is random)
			let sum = 0;
			for (const seed of [1, 2, 3, 4]) {
				const { left } = play(make(seed), hz, 1.5, [swarm, 0, 0, 0]);
				const { power, binHz } = powerSpectrum(left.subarray(4800), SR);
				let p = 0;
				let m = 0;
				let v = 0;
				for (let i = Math.ceil((0.5 * hz) / binHz); i < (1.5 * hz) / binHz; i++) {
					p += power[i];
					m += power[i] * i * binHz;
				}
				m /= p;
				for (let i = Math.ceil((0.5 * hz) / binHz); i < (1.5 * hz) / binHz; i++) {
					v += power[i] * (i * binHz - m) ** 2;
				}
				sum += Math.sqrt(v / p) / hz;
			}
			const expected = SWARM_SPREAD * Math.pow(swarm, SWARM_CURVE);
			expect(sum / 4 / expected, `swarm ${swarm}`).toBeGreaterThan(0.6);
			expect(sum / 4 / expected, `swarm ${swarm}`).toBeLessThan(1.5);
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

	it('stays band-limited with fm and am on 1–2 kHz notes', { timeout: 60_000 }, () => {
		const settings = [0, 0.5, 1].flatMap((fm) => [0, 0.5, 1].map((am) => [0, am, fm, 0]));
		const { db: worst, at } = worstInharmonic(make, settings, BOUNDS.highNotes);
		expect(worst, at).toBeLessThan(BOUNDS.inharmonic);
	});
});
