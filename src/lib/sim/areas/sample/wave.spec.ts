import { describe, expect, it } from 'vitest';
import {
	DEMO_SEED,
	ONE_SHOT_SECONDS,
	UNIT_SECONDS,
	decodeWave,
	encodeWave,
	hashSeed,
	peaksFromChannels,
	standIn,
	standInPeaks,
	wave,
	waveColumns
} from './wave';

/** TE's waveform on the M1 lanes (sample-025), in sixteenths per 2.07 px column. */
const TE_LANE = (() => {
	const out = new Array<number>(232).fill(0);
	[
		1, 1, 1, 1, 2, 9, 16, 1, 2, 9, 16, 1, 2, 9, 16, 1, 2, 3, 4, 3, 2, 1, 1, 2, 3, 4, 3, 2, 1
	].forEach((v, i) => (out[i] = v));
	for (const at of [38, 65, 118]) [1, 2, 9, 16, 1, 2, 3, 4, 3].forEach((v, i) => (out[at + i] = v));
	return out;
})();

describe('stand-in waveforms', () => {
	it('draws TE’s guide waveform from the demo seed, one point per lane column', () => {
		const { levels, rate } = standIn(DEMO_SEED, 20);
		expect(levels).toEqual(TE_LANE);
		expect(rate * 20).toBeCloseTo(232, 6);
		expect(decodeWave(wave({ seconds: 20, seed: DEMO_SEED }, 0, 20, 232))).toEqual(TE_LANE);
	});

	it('is deterministic per seed and differs between seeds', () => {
		expect(standIn(7, 5)).toEqual(standIn(7, 5));
		expect(standIn(7, 5).levels).not.toEqual(standIn(8, 5).levels);
	});

	it('makes phrases at the unit rate and one-shots that decay to silence', () => {
		const phrase = standIn(3, 10);
		expect(phrase.levels).toHaveLength(Math.round(10 / UNIT_SECONDS));
		const shot = standIn(3, ONE_SHOT_SECONDS / 4);
		expect(shot.levels).toHaveLength(232);
		expect(Math.max(...shot.levels.slice(0, 4))).toBeGreaterThan(8);
		expect(shot.levels[shot.levels.length - 1]).toBe(0);
	});

	it('hashes names to stable seeds', () => {
		expect(hashSeed('drum/kick 1.wav')).toBe(hashSeed('drum/kick 1.wav'));
		expect(hashSeed('a')).not.toBe(hashSeed('b'));
	});
});

describe('waveColumns', () => {
	const source = { seconds: 20, seed: DEMO_SEED };

	it('keeps every peak when zoomed out (the card fits 232 points into 171 columns)', () => {
		const cols = waveColumns(source, 0, 20, 171);
		expect(cols).toHaveLength(171);
		expect(cols.filter((v) => v === 1)).toHaveLength(6);
	});

	it('repeats points when zoomed in (the slicer shows a third of the sample, three times as wide)', () => {
		const cols = decodeWave(wave(source, 0, 20 / 3, 77));
		expect(cols.slice(0, 29)).toEqual(TE_LANE.slice(0, 29));
		const twice = decodeWave(wave(source, 0, 20 / 6, 77));
		expect(twice[12]).toBe(twice[13]);
	});

	it('is silent outside the sample and for empty ranges', () => {
		expect(waveColumns(source, 25, 30, 10)).toEqual(new Array(10).fill(0));
		expect(waveColumns(source, 5, 5, 4)).toEqual([0, 0, 0, 0]);
		expect(waveColumns(source, 0, 20, 0)).toEqual([]);
	});

	it('reads measured peaks, repeating a mono channel on the right lane', () => {
		const peaks = { rate: 4, channels: [[0, 0.5, 1, 0.25]] };
		const src = { seconds: 1, seed: 0, peaks };
		expect(waveColumns(src, 0, 1, 4, 0)).toEqual([0, 0.5, 1, 0.25]);
		expect(waveColumns(src, 0, 1, 4, 1)).toEqual([0, 0.5, 1, 0.25]);
		expect(waveColumns(src, 0, 1, 2)).toEqual([0.5, 1]);
	});
});

describe('wave strings and peaks', () => {
	it('encodes sixteenths as base-36 digits and back', () => {
		expect(encodeWave([0, 0.5, 1, 1.5, -1])).toBe('08gg0');
		expect(decodeWave('08g?')).toEqual([0, 8, 16, 0]);
	});

	it('measures peaks from audio blocks (the sound engine hook)', () => {
		const left = Float32Array.from([0.1, -0.8, 0.2, 0.3, 0, -0.05]);
		const peaks = peaksFromChannels([left, left], 6, 3);
		expect(peaks.rate).toBe(3);
		expect(peaks.channels).toEqual([
			[0.8, 0.3, 0.05],
			[0.8, 0.3, 0.05]
		]);
	});

	it('turns a stand-in into peaks with the same shape', () => {
		const peaks = standInPeaks(DEMO_SEED, 20);
		expect(peaks.channels[0].map((v) => Math.round(v * 16))).toEqual(TE_LANE);
	});
});
