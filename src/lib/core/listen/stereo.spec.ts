// The stereo picture on constructed stereo: mono, unrelated noise, flipped polarity, a panned tone,
// one silent side, and a wide top over a mono or out-of-phase bass.
import { describe, expect, it } from 'vitest';
import { filter, highpass, lowpass } from './filters';
import { gain, mix, noise, sine } from './signals';
import { stereoStats } from './stereo';

const SR = 44100;

describe('stereoStats', () => {
	it('reads mono as correlated, narrow and centred', () => {
		const x = sine(440, 1, SR, 0.4);
		expect(stereoStats([x, x], SR)).toEqual({
			correlation: 1,
			width: 0,
			balanceDb: 0,
			lowCorrelation: null,
			monoLossDb: 0
		});
		// one channel is centred mono too
		expect(stereoStats([x], SR)).toMatchObject({ correlation: 1, width: 0, monoLossDb: 0 });
	});

	it('reads unrelated noise as uncorrelated, wide, and 3 dB down in mono', () => {
		const s = stereoStats(
			[noise('white', 2, SR, { seed: 1 }), noise('white', 2, SR, { seed: 2 })],
			SR
		);
		expect(Math.abs(s.correlation!)).toBeLessThan(0.05);
		expect(s.width).toBeCloseTo(1, 1);
		expect(s.monoLossDb).toBeCloseTo(-3, 0);
		expect(Math.abs(s.balanceDb)).toBeLessThan(0.2);
	});

	it('reads a flipped channel as opposite, cancelling in mono', () => {
		const x = sine(440, 1, SR, 0.4);
		const s = stereoStats([x, gain(x, -1)], SR);
		expect(s.correlation).toBe(-1);
		expect(s.width).toBe(10);
		expect(s.monoLossDb).toBe(-60);
	});

	it('reads a panned tone’s balance', () => {
		const x = sine(440, 1, SR, 0.4);
		const s = stereoStats([x, gain(x, 0.5)], SR);
		expect(s.balanceDb).toBeCloseTo(6.02, 1);
		expect(s.correlation).toBeCloseTo(1, 6);
		const left = stereoStats([x, new Float32Array(x.length)], SR);
		expect(left).toMatchObject({ correlation: null, balanceDb: 60 });
		expect(stereoStats([new Float32Array(10), x.subarray(0, 10)], SR).balanceDb).toBe(-60);
	});

	it('checks the low end on its own', () => {
		const bass = sine(60, 2, SR, 0.4);
		const top = (seed: number) =>
			filter(noise('white', 2, SR, { seed, rms: 0.4 }), {
				b0: 0.5,
				b1: -0.5,
				b2: 0,
				a1: 0,
				a2: 0
			});
		const wide = [mix(bass, Float32Array.from(top(3))), mix(bass, Float32Array.from(top(4)))];
		const mono = stereoStats(wide, SR);
		expect(mono.lowCorrelation!).toBeGreaterThan(0.95);
		expect(mono.correlation!).toBeLessThan(0.9);
		const phasey = stereoStats(
			[mix(bass, Float32Array.from(top(3))), mix(gain(bass, -1), Float32Array.from(top(4)))],
			SR
		);
		expect(phasey.lowCorrelation!).toBeLessThan(-0.95);
	});

	it('filters like a Butterworth, low and high', () => {
		const gainAt = (f: ReturnType<typeof lowpass>, hz: number) => {
			const y = filter(sine(hz, 1, SR, 1), f);
			let peak = 0;
			for (let i = SR / 2; i < SR; i++) peak = Math.max(peak, Math.abs(y[i]));
			return 20 * Math.log10(peak);
		};
		const low = lowpass(150, SR);
		expect(gainAt(low, 40)).toBeCloseTo(0, 0);
		expect(gainAt(low, 150)).toBeCloseTo(-3, 0);
		expect(gainAt(low, 1200)).toBeLessThan(-30);
		const high = highpass(6000, SR);
		expect(gainAt(high, 12000)).toBeCloseTo(0, 0);
		expect(gainAt(high, 6000)).toBeCloseTo(-3, 0);
		expect(gainAt(high, 750)).toBeLessThan(-30);
	});
});
