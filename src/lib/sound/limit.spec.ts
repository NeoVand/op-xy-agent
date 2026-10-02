// The master's soft ceiling: straight to the knee, rounded above it, never past its top.
import { describe, expect, it } from 'vitest';
import { softLimit, softLimitCurve } from './limit';

describe('softLimit', () => {
	it('passes quiet sound, rounds loud sound off, and caps it below full scale', () => {
		expect(softLimit(0.5)).toBe(0.5);
		expect(softLimit(-0.8)).toBeCloseTo(-0.8);
		expect(softLimit(0.9)).toBeGreaterThan(0.85);
		expect(softLimit(0.9)).toBeLessThan(0.9);
		expect(softLimit(1)).toBeCloseTo(0.952, 3);
		// beyond full scale: its top, as the wave shaper holds its last point
		expect(softLimit(1.8)).toBe(softLimit(1));
		expect(softLimit(-3)).toBe(-softLimit(1));
	});

	it('is the wave shaper curve over −1…1', () => {
		const curve = softLimitCurve();
		expect(curve).toHaveLength(2049);
		expect(curve[1024]).toBe(0);
		expect(curve[2048]).toBeCloseTo(softLimit(1));
		expect(curve[0]).toBeCloseTo(-softLimit(1));
	});
});
