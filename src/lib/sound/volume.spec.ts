import { describe, expect, it } from 'vitest';
import { guardCurve, volumeGain } from './volume';

describe('the volume pot', () => {
	it('plays the default level in the middle, 6 dB more at the top and nothing at the bottom', () => {
		expect(volumeGain(0.5)).toBeCloseTo(1, 6);
		expect(20 * Math.log10(volumeGain(1))).toBeCloseTo(6, 6);
		expect(volumeGain(0)).toBe(0);
	});

	it('only ever gets louder as it turns up', () => {
		let last = -1;
		for (let i = 0; i <= 200; i++) {
			const gain = volumeGain(i / 200);
			expect(gain).toBeGreaterThan(last);
			last = gain;
		}
	});

	it('fades the bottom half evenly: a quarter turn is about 15 dB down', () => {
		expect(20 * Math.log10(volumeGain(0.25))).toBeCloseTo(-14.6, 1);
	});

	it('guards the top: passes level up to 0.9, rounds toward 1 above it, never past it', () => {
		const curve = guardCurve();
		const at = (signal: number) => curve[Math.round(((signal / 2 + 1) / 2) * (curve.length - 1))];
		expect(at(0.5)).toBeCloseTo(0.5, 3);
		expect(at(0.9)).toBeCloseTo(0.9, 3);
		expect(at(1.4)).toBeGreaterThan(0.99);
		expect(Math.max(...curve)).toBeLessThanOrEqual(1);
	});
});
