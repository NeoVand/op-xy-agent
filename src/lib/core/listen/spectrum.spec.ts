// Tone on noises and tones with known spectra: pink noise is level against pink in every band and
// tilts −3 dB per octave, white 0 and brown −6; a sine's energy sits in its band and its centroid is
// its frequency; the Welch spectrum keeps Parseval's energy; lower sample rates measure the same.
import { describe, expect, it } from 'vitest';
import { DB_FLOOR } from './level';
import { noise, sine } from './signals';
import { BANDS, THIRD_OCTAVES, bandPower, slope, spectrumStats, welch } from './spectrum';

const SR = 44100;

const band = (stats: NonNullable<ReturnType<typeof spectrumStats>>, name: string) =>
	stats.bands.find((b) => b.name === name)!;

describe('welch', () => {
	it('keeps a sine’s energy (Parseval) and puts it at its frequency', () => {
		const x = sine(1000, 2, SR, 0.5);
		const s = welch([x, x], SR)!;
		const total = s.power.reduce((a, v) => a + v, 0);
		expect(total).toBeCloseTo(0.125, 3);
		const peak = s.power.indexOf(Math.max(...s.power));
		expect(peak * s.binHz).toBeCloseTo(1000, -1);
		expect(bandPower(s, 900, 1100)).toBeCloseTo(0.125, 3);
		expect(s.frames).toBeGreaterThan(15);
	});

	it('needs a few hundred samples', () => {
		expect(welch([new Float32Array(200)], SR)).toBeNull();
		expect(welch([Array.from({ length: 300 }, () => 0.1)], SR)).not.toBeNull();
	});
});

describe('spectrumStats', () => {
	it('finds pink noise level against pink in every band, tilting −3 dB/oct', () => {
		const x = noise('pink', 8, SR, { seed: 11 });
		const y = noise('pink', 8, SR, { seed: 12 });
		const s = spectrumStats([x, y], SR)!;
		for (const b of s.bands) expect(Math.abs(b.vsPink!), b.name).toBeLessThan(0.8);
		expect(s.tiltDbPerOctave).toBeCloseTo(-3, 0);
		expect(Math.abs(s.tiltDbPerOctave! + 3)).toBeLessThan(0.3);
		// third octaves hold equal shares from 50 Hz up
		const shares = s.thirdOctaves.slice(3, 29) as number[];
		expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(2);
		// magnitude-weighted centroid of a 1/√f magnitude between 20 Hz and 20 kHz: ≈ 6.9 kHz
		expect(s.centroidHz / 6884).toBeCloseTo(1, 1);
	});

	it('finds white noise bright (tilt 0) and brown noise dark (−6 dB/oct)', () => {
		const white = spectrumStats([noise('white', 6, SR, { seed: 2 })], SR)!;
		expect(Math.abs(white.tiltDbPerOctave!)).toBeLessThan(0.3);
		expect(band(white, 'air').vsPink!).toBeGreaterThan(6);
		expect(band(white, 'low').vsPink!).toBeLessThan(-10);
		expect(white.centroidHz / 10010).toBeCloseTo(1, 1);
		const brown = spectrumStats([noise('brown', 6, SR, { seed: 3 })], SR)!;
		expect(Math.abs(brown.tiltDbPerOctave! + 6)).toBeLessThan(0.3);
		expect(band(brown, 'low').vsPink!).toBeGreaterThan(3);
		expect(band(brown, 'air').vsPink!).toBeLessThan(-10);
	});

	it('puts a sine in its band and reads its frequency as the centroid', () => {
		const s = spectrumStats([sine(1000, 3, SR, 0.5)], SR)!;
		expect(s.centroidHz).toBeCloseTo(1000, -1);
		expect(band(s, 'mid').share).toBeCloseTo(0, 1);
		expect(band(s, 'mid').db).toBeCloseTo(-9.03, 1);
		expect(band(s, 'low').share).toBeLessThan(-40);
		expect(band(s, 'air').share).toBeLessThan(-40);
		const low = spectrumStats([sine(60, 3, SR, 0.5)], SR)!;
		expect(low.centroidHz).toBeCloseTo(60, -1);
		expect(band(low, 'low').share).toBeCloseTo(0, 1);
		// the 1 kHz third octave holds the sine
		expect(s.thirdOctaves[THIRD_OCTAVES.indexOf(1000)]).toBeCloseTo(0, 1);
	});

	it('measures below 44.1 kHz against the range it can hear', () => {
		const rate = 22050;
		const s = spectrumStats([noise('pink', 8, rate, { seed: 5 })], rate)!;
		for (const b of s.bands) expect(Math.abs(b.vsPink!), b.name).toBeLessThan(1);
		expect(s.thirdOctaves.at(-1)).toBeNull();
		expect(Math.abs(s.tiltDbPerOctave! + 3)).toBeLessThan(0.4);
		// a band wholly above Nyquist reads nothing
		const narrow = spectrumStats([noise('pink', 4, 12000, { seed: 6 })], 12000)!;
		expect(band(narrow, 'air')).toEqual({
			name: 'air',
			db: DB_FLOOR,
			share: DB_FLOOR,
			vsPink: null
		});
	});

	it('measures nothing in silence', () => {
		expect(spectrumStats([new Float32Array(SR)], SR)).toBeNull();
		expect(spectrumStats([new Float32Array(100)], SR)).toBeNull();
	});

	it('names the five bands in order', () => {
		expect(BANDS.map((b) => b.name)).toEqual(['low', 'low-mid', 'mid', 'high', 'air']);
		expect(slope([1, 2, 3], [2, 4, 6])).toBe(2);
		expect(slope([1, 1], [2, 4])).toBe(0);
	});
});
