// The soft ceiling: untouched up to the knee, never past the ceiling, and no corner between.
import { describe, expect, it } from 'vitest';
import { CEILING, KNEE, ceiling } from './guard';

describe('the soft ceiling', () => {
	it('leaves everything up to the knee alone', () => {
		for (const x of [0, 0.3, -0.7, KNEE, -KNEE]) expect(ceiling(x)).toBe(x);
	});

	it('rises ever more slowly past it, and never reaches the ceiling’s far side', () => {
		let last = KNEE;
		for (let x = KNEE + 0.01; x < 10; x += 0.01) {
			const y = ceiling(x);
			expect(y).toBeGreaterThanOrEqual(last);
			expect(y).toBeLessThanOrEqual(CEILING);
			expect(ceiling(-x)).toBe(-y);
			last = y;
		}
		expect(ceiling(100)).toBe(CEILING);
	});

	it('joins the straight part with the same slope', () => {
		const h = 1e-6;
		expect((ceiling(KNEE + h) - ceiling(KNEE)) / h).toBeCloseTo(1, 4);
	});
});
