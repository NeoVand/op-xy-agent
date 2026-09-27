// The stereo copy simple and prism share, fed a sine: the dry sound untouched in both channels, the
// copy a few cents up in one channel and down in the other at the measured level and high-pass,
// the two trading places each half period, the sweep running free on the core's clock.
import { describe, expect, it } from 'vitest';
import { levelAt } from '../analysis';
import { SR } from './audition';
import { StereoCopy, copyCorner, copyLevel, halfPeriod, offsetCents } from './stereo';

const BLOCK = 16;

/** `seconds` of a unit sine at `hz` through a copy at stereo `s`, begun at `time` on the clock. */
function through(hz: number, s: number, seconds: number, time = 0) {
	const copy = new StereoCopy(SR);
	copy.start(s, time);
	const total = Math.round((seconds * SR) / BLOCK) * BLOCK;
	const left = new Float32Array(total);
	const right = new Float32Array(total);
	const dry = new Float32Array(BLOCK);
	for (let at = 0; at < total; at += BLOCK) {
		for (let i = 0; i < BLOCK; i++) dry[i] = Math.sin((2 * Math.PI * hz * (at + i)) / SR);
		copy.set(s);
		copy.process(dry, left.subarray(at, at + BLOCK), right.subarray(at, at + BLOCK), BLOCK);
	}
	return { left, right };
}

const off = (hz: number, cents: number) => hz * Math.pow(2, cents / 1200);

describe('stereo copy', () => {
	it('follows the curves measured on the device', () => {
		const knee = 64 / 127;
		expect(copyLevel(0)).toBe(0);
		expect(copyLevel(32 / 127)).toBeCloseTo(0.43, 2);
		expect(copyLevel(knee)).toBeCloseTo(0.86, 2);
		expect(copyLevel(1)).toBeCloseTo(0.89, 2);
		expect(offsetCents(0.3)).toBeCloseTo(6.9, 5);
		expect(offsetCents(96 / 127)).toBeCloseTo(11.1, 1);
		expect(offsetCents(1)).toBeCloseTo(15.2, 5);
		expect(halfPeriod(knee)).toBeCloseTo(3.05, 5);
		expect(halfPeriod(1)).toBeCloseTo(2.2, 5);
		expect(copyCorner(knee)).toBeCloseTo(815, 5);
		expect(copyCorner(1)).toBeCloseTo(490, 5);
	});

	it('passes the dry sound alone at stereo 0', () => {
		const { left, right } = through(440, 0, 0.2);
		expect(right).toEqual(left);
		expect(left[100]).toBeCloseTo(Math.sin((2 * Math.PI * 440 * 100) / SR), 6);
	});

	it('adds a copy a few cents up in one channel and down in the other, high-passed', () => {
		for (const s of [0.25, 64 / 127, 1]) {
			const hz = 1000;
			const cents = offsetCents(s);
			// the first second: well inside the triangle's first half (the left copy rising)
			const { left, right } = through(hz, s, 1.05);
			const l = left.subarray(2400);
			const r = right.subarray(2400);
			const expected = (copyLevel(s) * hz) / Math.hypot(hz, copyCorner(s));
			expect(levelAt(l, SR, off(hz, cents)) / expected).toBeCloseTo(1, 1);
			expect(levelAt(r, SR, off(hz, -cents)) / expected).toBeCloseTo(1, 1);
			expect(levelAt(l, SR, off(hz, -cents))).toBeLessThan(0.05 * expected);
			expect(levelAt(r, SR, off(hz, cents))).toBeLessThan(0.05 * expected);
			// the dry sine keeps its level
			expect(levelAt(l, SR, hz)).toBeCloseTo(1, 1);
		}
	});

	it('trades the copies between channels every half period', () => {
		const s = 64 / 127;
		const hz = 1000;
		const cents = offsetCents(s);
		const half = halfPeriod(s);
		const { left } = through(hz, s, half + 1.2);
		const after = left.subarray(Math.round((half + 0.1) * SR));
		expect(levelAt(after, SR, off(hz, -cents))).toBeGreaterThan(
			10 * levelAt(after, SR, off(hz, cents))
		);
	});

	it('runs the sweep free on the core’s clock: a note a period later plays the same', () => {
		const s = 0.3;
		const period = 2 * halfPeriod(s);
		const a = through(500, s, 0.5, 0);
		const b = through(500, s, 0.5, period);
		for (let i = 0; i < a.left.length; i += 97) {
			expect(b.left[i]).toBeCloseTo(a.left[i], 3);
			expect(b.right[i]).toBeCloseTo(a.right[i], 3);
		}
	});
});
