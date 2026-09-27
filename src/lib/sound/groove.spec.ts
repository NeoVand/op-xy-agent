import { describe, expect, it } from 'vitest';
import { GROOVES } from '$lib/sim/params';
import { grooveJitter, grooveTime, grooveVelocity, maxEarlyShift, type Groove } from './groove';

const type = (name: (typeof GROOVES)[number]) => GROOVES.indexOf(name);
const shuffle = (amount: number): Groove => ({ type: type('shuffle'), amount });

describe('grooves (manual: tempo/grooves)', () => {
	it('leaves every note on the grid at amount 0', () => {
		for (let t = 0; t < GROOVES.length; t++) {
			for (const p of [0, 1, 2.5, 7, 13]) expect(grooveTime(p, { type: t, amount: 0 })).toBe(p);
			expect(grooveJitter(5, { type: t, amount: 0 })).toEqual({ shift: 0, velocity: 1 });
			expect(maxEarlyShift({ type: t, amount: 0 })).toBe(0);
		}
	});

	it('swings the off-beat sixteenths late and shuffles them early, the beats staying put', () => {
		expect(grooveTime(0, shuffle(99))).toBe(0);
		expect(grooveTime(2, shuffle(99))).toBe(2);
		expect(grooveTime(1, shuffle(99))).toBeCloseTo(1.5);
		expect(grooveTime(3, shuffle(-99))).toBeCloseTo(2.5);
		// half shuffle goes half as far
		expect(grooveTime(1, { type: type('half shuffle'), amount: 99 })).toBeCloseTo(1.25);
		// only early shifts widen the scheduler's look-ahead
		expect(maxEarlyShift(shuffle(99))).toBeCloseTo(0.02);
		expect(maxEarlyShift(shuffle(-99))).toBeCloseTo(0.52);
	});

	it('never reorders notes: every warp rises through the bar', () => {
		for (let t = 0; t < GROOVES.length; t++) {
			for (const amount of [-99, -40, 40, 99]) {
				let last = -Infinity;
				for (let p = 0; p <= 32; p += 0.125) {
					const at = grooveTime(p, { type: t, amount });
					expect(at).toBeGreaterThan(last);
					last = at;
				}
			}
		}
	});

	it('drags beats 2 and 4 for bombora and lays back the off-beat for island nod', () => {
		const bombora = { type: type('bombora'), amount: 99 };
		expect(grooveTime(4, bombora)).toBeCloseTo(4.75);
		expect(grooveTime(12, bombora)).toBeCloseTo(12.75);
		expect(grooveTime(8, bombora)).toBe(8);
		const nod = { type: type('island nod'), amount: 99 };
		expect(grooveTime(2, nod)).toBeCloseTo(2.6);
		expect(grooveTime(4, nod)).toBe(4);
	});

	it('accents the beats and softens the off-beats', () => {
		const accents = { type: type('accents'), amount: 99 };
		expect(grooveVelocity(0, accents)).toBeCloseTo(1.2);
		expect(grooveVelocity(1, accents)).toBeCloseTo(0.7);
		expect(grooveVelocity(2, accents)).toBe(1);
		// shuffled, the "and" takes the accent
		expect(grooveVelocity(2, { ...accents, amount: -99 })).toBeCloseTo(1.2);
		expect(grooveVelocity(0, shuffle(99))).toBe(1);
	});

	it('adds seeded randomness: the same seed the same nudge, wobbly and gaussian the most', () => {
		const wobbly = { type: type('wobbly'), amount: 99 };
		expect(grooveJitter(42, wobbly)).toEqual(grooveJitter(42, wobbly));
		expect(grooveJitter(42, wobbly)).not.toEqual(grooveJitter(43, wobbly));
		for (let seed = 0; seed < 200; seed++) {
			const small = grooveJitter(seed, shuffle(99));
			expect(Math.abs(small.shift)).toBeLessThanOrEqual(0.02);
			expect(Math.abs(small.velocity - 1)).toBeLessThanOrEqual(0.05);
			const gauss = grooveJitter(seed, { type: type('gaussian'), amount: 99 });
			expect(Math.abs(gauss.shift)).toBeLessThanOrEqual(0.3 + 1e-9);
			expect(Math.abs(gauss.shift)).toBeLessThanOrEqual(
				maxEarlyShift({ type: type('gaussian'), amount: 99 })
			);
		}
	});
});
