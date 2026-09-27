// Ramps, the engines' way of moving levels and blends: a jump arrives over milliseconds, in even
// per-sample steps that join from block to block, and settles exactly.
import { describe, expect, it } from 'vitest';
import { Ramp, SMOOTH_SECONDS, Smoothing } from './ramp';

const SR = 48000;
const BLOCK = 16;

/** Follows `ramp` sample by sample for `blocks` blocks, as an engine's render does. */
function follow(ramp: Ramp, smoothing: Smoothing, blocks: number): number[] {
	const out: number[] = [];
	for (let b = 0; b < blocks; b++) {
		let v = ramp.advance(smoothing.coef(BLOCK), BLOCK);
		for (let i = 0; i < BLOCK; i++) out.push((v += ramp.step));
	}
	return out;
}

describe('ramps', () => {
	it('take a jump over milliseconds, one small even step a sample', () => {
		const smoothing = new Smoothing(SR);
		const ramp = new Ramp(0);
		ramp.target = 1;
		const x = follow(ramp, smoothing, 200);
		// one time constant in, about 63 % of the way
		expect(x[Math.round(SMOOTH_SECONDS * SR)]).toBeCloseTo(1 - Math.exp(-1), 1);
		// no step larger than the first block's share, spread over its samples
		let largest = 0;
		for (let i = 1; i < x.length; i++) largest = Math.max(largest, Math.abs(x[i] - x[i - 1]));
		expect(largest).toBeLessThanOrEqual(smoothing.coef(BLOCK) / BLOCK + 1e-12);
		// and it lands exactly, so a silent source can stop
		expect(x[x.length - 1]).toBe(1);
		ramp.target = 0;
		follow(ramp, smoothing, 400);
		expect(ramp.idle).toBe(true);
	});

	it('jump straight to a note’s first value', () => {
		const ramp = new Ramp(0.3);
		ramp.jump(0.8);
		expect(ramp.advance(0.1, BLOCK)).toBe(0.8);
		expect(ramp.step).toBe(0);
	});
});
