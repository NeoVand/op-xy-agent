// epiano measured on its own at 48 kHz: a pure sine with everything at 0, tone bringing in
// harmonics, tine decaying them (or holding them at 0), punch's short high partial, and the bounds
// every engine keeps: level at the default M1, peaks, aliasing and no clicks as parameters move.
import { describe, expect, it } from 'vitest';
import { centroid, harmonicLevels, inharmonicDb, levelAt, rms } from '../analysis';
import { SR, peak, play, roughness, throughCore } from './audition';
import { EpianoVoice } from './epiano';

const DEFAULT = [80 / 99, 80 / 99, 80 / 99, 80 / 99];
const epiano = () => new EpianoVoice(SR);
/** Harmonic energy above the fundamental, relative to it. */
const overtones = (levels: number[]) =>
	Math.sqrt(levels.slice(1).reduce((s, v) => s + v * v, 0)) / levels[0];

describe('epiano', () => {
	it('is a pure sine with every parameter at 0', () => {
		const { left } = play(epiano(), { hz: 220, seconds: 0.5, params: [0, 0, 0, 0] });
		const x = left.subarray(4800, 4800 + 16384);
		const [h1, ...rest] = harmonicLevels(x, SR, 220, 8);
		expect(h1).toBeGreaterThan(0.3);
		for (const h of rest) expect(h / h1).toBeLessThan(1e-3);
		expect(inharmonicDb(x, SR, 220)).toBeLessThan(-80);
	});

	it('brightens as tone rises, to a saw-like spectrum at the top', () => {
		const note = (tone: number) =>
			play(epiano(), { hz: 220, seconds: 0.5, params: [tone, 0, 0, 0] }).left.subarray(4800);
		const brightness = [0, 0.25, 0.5, 0.75, 1].map((tone) => centroid(note(tone), SR));
		expect(brightness[0]).toBeLessThan(225);
		for (let i = 1; i < brightness.length; i++) {
			expect(brightness[i]).toBeGreaterThan(brightness[i - 1] * 1.02);
		}
		expect(brightness[4]).toBeGreaterThan(2 * brightness[0]);
		// at full tone every harmonic up to the 8th keeps at least half a saw's 1/n
		const [h1, ...rest] = harmonicLevels(note(1), SR, 220, 8);
		rest.forEach((h, i) => expect(h / h1).toBeGreaterThan(0.5 / (i + 2)));
	});

	it('lets the brightness fall back to the carrier with tine, and holds it at tine 0', () => {
		const early = (x: Float32Array) => centroid(x.subarray(0, 2048), SR);
		const late = (x: Float32Array) => centroid(x.subarray(SR / 2, SR / 2 + 8192), SR);
		const held = play(epiano(), { hz: 220, seconds: 0.7, params: [0.8, 0, 0, 0] }).left;
		// tine 0.7: a time constant of 0.16 s, so 3 of them have passed by 0.5 s
		const plucked = play(epiano(), { hz: 220, seconds: 0.7, params: [0.8, 0, 0, 0.7] }).left;
		expect(early(held)).toBeGreaterThan(330);
		expect(late(held)).toBeGreaterThan(early(held) * 0.85);
		expect(early(plucked)).toBeGreaterThan(330);
		// back to the sine body: the centroid lands on the fundamental
		expect(late(plucked)).toBeLessThan(260);
		// a higher tine plucks faster: less brightness left after 100 ms
		const at100 = (tine: number) => {
			const { left } = play(epiano(), { hz: 220, seconds: 0.2, params: [0.8, 0, 0, tine] });
			return overtones(harmonicLevels(left.subarray(4800, 4800 + 2400), SR, 220, 12));
		};
		expect(at100(0.8)).toBeLessThan(at100(0.4) * 0.5);
	});

	it('strikes with a short partial seven times the note when punch is up', () => {
		const partial = (punch: number, from: number, to: number) => {
			const { left } = play(epiano(), { hz: 220, seconds: 0.4, params: [0, 0, punch, 0] });
			return levelAt(left.subarray(from, to), SR, 7 * 220);
		};
		// the first 20 ms, and from 200 ms (eight decay time constants later)
		expect(partial(1, 0, 960)).toBeGreaterThan(0.05);
		expect(partial(1, 9600, 19200)).toBeLessThan(1e-3);
		expect(partial(0, 0, 960)).toBeLessThan(1e-3);
		// punch² keeps low settings subtle
		expect(partial(0.5, 0, 960)).toBeLessThan(partial(1, 0, 960) * 0.35);
	});

	it('plays through the synth core at the same level', () => {
		const x = throughCore('epiano', [80, 80, 80, 80]);
		expect(x.every(Number.isFinite)).toBe(true);
		expect(rms(x, 2400)).toBeGreaterThan(0.2);
		expect(rms(x, 2400)).toBeLessThan(0.35);
	});

	it('sits at the level every engine shares at the default M1 (0.2–0.35 RMS per channel)', () => {
		const { left, right } = play(epiano(), { hz: 220, seconds: 1.05, params: DEFAULT });
		for (const x of [left, right]) {
			expect(rms(x, 2400)).toBeGreaterThan(0.2);
			expect(rms(x, 2400)).toBeLessThan(0.35);
		}
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (const tone of [0, 0.6, 0.8, 1]) {
				for (const texture of [0, 0.8, 1]) {
					const params = [tone, texture, 1, 0];
					const { left } = play(epiano(), { hz, seconds: 0.2, params, velocity: 127 });
					worst = Math.max(worst, peak(left));
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('keeps aliasing below −50 dB at 1–2 kHz, key scaling the index where FM would fold', () => {
		for (const hz of [1003, 1499, 2011]) {
			for (const tone of [0.25, 0.5, 0.75, 1]) {
				for (const texture of [0, 0.5, 1]) {
					const { left } = play(epiano(), { hz, seconds: 0.45, params: [tone, texture, 1, 0] });
					// after the punch has decayed; its partial is harmonic anyway
					expect(inharmonicDb(left.subarray(4800, 4800 + 16384), SR, hz)).toBeLessThan(-50);
				}
			}
		}
	});

	it('glides through parameter jumps without clicks', () => {
		// Every parameter jumps between two settings every 50 ms. Smoothing turns each jump into a
		// 5 ms glide through shapes the static settings also make, so the waveform's second
		// difference stays within those settings' own (a click would add its full jump on top: a
		// hundredth or more, against a few thousandths for the smooth range). 25% covers the
		// glides' in-between shapes.
		for (const [low, high] of [
			[0, 1],
			[0, 0.75]
		]) {
			const settings = [0, 0.25, 0.5, 0.75, 0.9, 1].filter((v) => v >= low && v <= high);
			for (let param = 0; param < 3; param++) {
				const at = (v: number) => [0.4, 0.4, 0.4, 0].map((x, i) => (i === param ? v : x));
				const still = Math.max(
					...settings.map((v) =>
						roughness(play(epiano(), { hz: 220, seconds: 0.3, params: at(v) }).left)
					)
				);
				const jumping = play(epiano(), {
					hz: 220,
					seconds: 0.6,
					params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? low : high)
				}).left;
				expect(roughness(jumping)).toBeLessThan(still * 1.25);
			}
		}
		// tine only changes a decay's speed: jumps in it change nothing at once
		const tine = play(epiano(), {
			hz: 220,
			seconds: 0.6,
			params: (t) => [0.8, 0.5, 0, Math.floor(t / 0.05) % 2 === 0 ? 0 : 1]
		}).left;
		const still = roughness(
			play(epiano(), { hz: 220, seconds: 0.6, params: [0.8, 0.5, 0, 0] }).left
		);
		expect(roughness(tine)).toBeLessThan(still * 1.25);
	});
});
