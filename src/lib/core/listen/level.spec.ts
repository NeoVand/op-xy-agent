// Levels and loudness: peaks, RMS, crest and clipping on signals with known values; K-weighting that
// reproduces BS.1770's published 48 kHz coefficients and responds the same at 44.1 kHz; integrated
// loudness on the EBU Tech 3341 test signals (stereo 1 kHz sines, gating included); the loudest
// momentary and short-term values; and a loudness range of 10 LU between two 10 LU steps.
import { describe, expect, it } from 'vitest';
import { filter, type Biquad } from './filters';
import {
	CLIP_RUN,
	DB_FLOOR,
	amplitudeDb,
	kWeighting,
	levelStats,
	loudness,
	powerDb
} from './level';
import { concat, sine } from './signals';

/** A stereo 1 kHz sine whose peak sits at `dbfs` (the level EBU Tech 3341 states), per segment. */
function steps(sampleRate: number, ...segments: [seconds: number, dbfs: number][]): Float32Array {
	return concat(
		...segments.map(([seconds, dbfs]) => sine(1000, seconds, sampleRate, 10 ** (dbfs / 20)))
	);
}

/** |H(f)| of a biquad in dB. */
function responseDb(f: Biquad, hz: number, sampleRate: number): number {
	const w = (2 * Math.PI * hz) / sampleRate;
	const re = (a: number, b: number, c: number) => a + b * Math.cos(w) + c * Math.cos(2 * w);
	const im = (b: number, c: number) => -(b * Math.sin(w) + c * Math.sin(2 * w));
	const num = Math.hypot(re(f.b0, f.b1, f.b2), im(f.b1, f.b2));
	const den = Math.hypot(re(1, f.a1, f.a2), im(f.a1, f.a2));
	return 20 * Math.log10(num / den);
}

const kDb = (hz: number, sampleRate: number) =>
	kWeighting(sampleRate).reduce((db, f) => db + responseDb(f, hz, sampleRate), 0);

describe('dB helpers', () => {
	it('floor silence instead of returning −∞', () => {
		expect(amplitudeDb(1)).toBe(0);
		expect(amplitudeDb(0.5)).toBeCloseTo(-6.02, 2);
		expect(amplitudeDb(0)).toBe(DB_FLOOR);
		expect(powerDb(0.5)).toBeCloseTo(-3.01, 2);
		expect(powerDb(-1)).toBe(DB_FLOOR);
	});

	it('filter with a biquad (an identity passes the input through)', () => {
		const x = sine(100, 0.01, 48000);
		expect([...filter(x, { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 })]).toEqual([...x].map(Number));
		// a one-sample delay
		const delayed = filter([1, 2, 3], { b0: 0, b1: 1, b2: 0, a1: 0, a2: 0 });
		expect([...delayed]).toEqual([0, 1, 2]);
	});
});

describe('K-weighting', () => {
	it('reproduces BS.1770’s coefficients at 48 kHz', () => {
		const [shelf, highpass] = kWeighting(48000);
		expect(shelf.b0).toBeCloseTo(1.53512485958697, 7);
		expect(shelf.b1).toBeCloseTo(-2.69169618940638, 7);
		expect(shelf.b2).toBeCloseTo(1.19839281085285, 7);
		expect(shelf.a1).toBeCloseTo(-1.69065929318241, 7);
		expect(shelf.a2).toBeCloseTo(0.73248077421585, 7);
		expect([highpass.b0, highpass.b1, highpass.b2]).toEqual([1, -2, 1]);
		expect(highpass.a1).toBeCloseTo(-1.99004745483398, 7);
		expect(highpass.a2).toBeCloseTo(0.99007225036621, 7);
	});

	it('responds the same at 44.1 kHz, the OP-XY’s rate, as at 48 kHz', () => {
		for (const hz of [30, 100, 1000, 3000, 8000, 12000]) {
			expect(Math.abs(kDb(hz, 44100) - kDb(hz, 48000)), `${hz} Hz`).toBeLessThan(0.1);
		}
		// about +0.7 dB at 1 kHz (which the −0.691 of the loudness formula takes back), +4 dB high
		expect(kDb(1000, 44100)).toBeCloseTo(0.69, 1);
		expect(kDb(10000, 44100)).toBeGreaterThan(3.5);
		expect(kDb(20, 44100)).toBeLessThan(-10);
	});
});

describe('integrated loudness (EBU Tech 3341 test signals)', () => {
	const SR = 48000;

	it('reads a −23 dBFS stereo sine as −23 LUFS, and −33 dBFS as −33', () => {
		for (const level of [-23, -33]) {
			const x = steps(SR, [20, level]);
			expect(loudness([x, x], SR).integrated).toBeCloseTo(level, 1);
		}
	});

	it('gates out quiet stretches relative to the programme (test 3)', () => {
		const x = steps(SR, [10, -36], [60, -23], [10, -36]);
		expect(loudness([x, x], SR).integrated).toBeCloseTo(-23, 1);
	});

	it('gates out near-silence absolutely (test 4)', () => {
		const x = steps(SR, [10, -72], [10, -36], [60, -23], [10, -36], [10, -72]);
		expect(loudness([x, x], SR).integrated).toBeCloseTo(-23, 1);
	});

	it('averages power, not dB (test 5)', () => {
		const x = steps(SR, [20, -26], [20.1, -20], [20, -26]);
		expect(loudness([x, x], SR).integrated).toBeCloseTo(-23, 1);
	});

	it('reads a full-scale 1 kHz sine on one channel as −3.01 LUFS (BS.1770 §2)', () => {
		const x = sine(1000, 5, SR, 1);
		expect(loudness([x], SR).integrated).toBeCloseTo(-3.01, 1);
	});

	it('measures the same at 44.1 kHz', () => {
		const x = steps(44100, [10, -23]);
		expect(loudness([x, x], 44100).integrated).toBeCloseTo(-23, 1);
	});
});

describe('momentary, short-term and range', () => {
	const SR = 16000;

	it('finds the loudest block and the loudest 3 s', () => {
		const x = steps(SR, [5, -30], [4, -10], [5, -30]);
		const l = loudness([x, x], SR);
		expect(l.momentaryMax).toBeCloseTo(-10, 1);
		expect(l.shortTermMax).toBeCloseTo(-10, 1);
	});

	it('has no short-term value or range under 3 s', () => {
		const x = steps(SR, [2, -20]);
		const l = loudness([x, x], SR);
		expect(l.momentaryMax).toBeCloseTo(-20, 1);
		expect(l.shortTermMax).toBeNull();
		expect(l.range).toBeNull();
	});

	it('spans 10 LU across a 10 LU step, and nothing on a steady tone', () => {
		const step = steps(SR, [20, -20], [20, -30]);
		expect(loudness([step, step], SR).range).toBeCloseTo(10, 1);
		const steady = steps(SR, [10, -20]);
		expect(loudness([steady, steady], SR).range).toBeCloseTo(0, 1);
	});

	it('measures nothing in silence or below the absolute gate', () => {
		const quiet = steps(SR, [4, -80]);
		expect(loudness([quiet, quiet], SR)).toEqual({
			integrated: null,
			momentaryMax: null,
			shortTermMax: null,
			range: null
		});
		const empty = new Float32Array(SR * 4);
		expect(loudness([empty, empty], SR).integrated).toBeNull();
		expect(loudness([new Float32Array(100)], SR).momentaryMax).toBeNull();
	});
});

describe('levelStats', () => {
	const SR = 48000;

	it('reads a sine’s peak, RMS and crest', () => {
		const x = sine(1000, 1, SR, 0.5);
		const s = levelStats([x, x], SR);
		expect(s.peakDbfs).toBeCloseTo(-6.02, 2);
		expect(s.rmsDbfs).toBeCloseTo(-9.03, 2);
		expect(s.crestDb).toBeCloseTo(3.01, 2);
		expect(s.clippedSamples).toBe(0);
		expect(s.clipRuns).toBe(0);
		expect(s.dcOffset).toBeCloseTo(0, 6);
		expect(s.loudness.integrated).toBeCloseTo(-6.02, 1);
	});

	it('has no crest on a square wave', () => {
		const x = Float32Array.from({ length: SR }, (_, i) => (Math.floor(i / 24) % 2 ? 0.5 : -0.5));
		expect(levelStats([x], SR).crestDb).toBeCloseTo(0, 6);
	});

	it('counts a clipped sine’s flat tops, but not a sine that only touches full scale', () => {
		const clipped = sine(100, 1, SR, 2).map((v) => Math.max(-1, Math.min(1, v)));
		const s = levelStats([clipped], SR);
		expect(s.peakDbfs).toBe(0);
		expect(s.clipRuns).toBe(200);
		expect(s.clippedSamples).toBeGreaterThan(200 * CLIP_RUN);
		// 1 kHz at 48 kHz: one sample each half period lands exactly on a peak
		const touching = levelStats([sine(1000, 1, SR, 1)], SR);
		expect(touching.clippedSamples).toBe(2000);
		expect(touching.clipRuns).toBe(0);
	});

	it('finds a DC offset and reads silence as the floor', () => {
		const offset = sine(1000, 0.5, SR, 0.2).map((v) => v + 0.1);
		expect(levelStats([offset, sine(1000, 0.5, SR, 0.2)], SR).dcOffset).toBeCloseTo(0.1, 3);
		const quiet = levelStats([new Float32Array(SR)], SR);
		expect([quiet.peakDbfs, quiet.rmsDbfs, quiet.crestDb]).toEqual([DB_FLOOR, DB_FLOOR, 0]);
	});
});
