// Loosening notes: the same notes loosen the same way, within the reach asked, the beats half as
// far, nothing before the first step, velocities kept in 1–127.
import { describe, expect, it } from 'vitest';
import { humanizeNotes, seedOf } from './humanize';

const hats: { step: number; note: number; velocity: number; offset?: number }[] = Array.from(
	{ length: 16 },
	(_, i) => ({ step: i + 1, note: 61, velocity: 120 })
);

describe('humanize', () => {
	it('loosens the same notes the same way, within reach', () => {
		const a = humanizeNotes(hats, { timing: 0.2, velocity: 20 }, () => true, seedOf(hats));
		const b = humanizeNotes(hats, { timing: 0.2, velocity: 20 }, () => true, seedOf(hats));
		expect(a).toEqual(b);
		for (const n of a) {
			const reach = (n.step - 1) % 4 === 0 ? 0.1 : 0.2;
			expect(Math.abs(n.offset ?? 0)).toBeLessThanOrEqual(reach);
			expect(n.velocity).toBeGreaterThanOrEqual(100);
			expect(n.velocity).toBeLessThanOrEqual(127);
		}
		expect(a[0].offset ?? 0).toBeGreaterThanOrEqual(0);
		expect(new Set(a.map((n) => n.offset ?? 0)).size).toBeGreaterThan(4);
	});

	it('leans every note behind the beat by the same amount, the first never early', () => {
		const back = humanizeNotes(hats, { late: 0.08 }, () => true, 3);
		expect(back.every((n) => n.offset === 0.08)).toBe(true);
		const ahead = humanizeNotes(hats, { late: -0.05 }, () => true, 3);
		expect(ahead[0].offset ?? 0).toBe(0);
		expect(ahead.slice(1).every((n) => n.offset === -0.05)).toBe(true);
	});

	it('leaves the notes it does not pick, and velocities alone when asked for timing only', () => {
		const out = humanizeNotes(hats, { timing: 0.1 }, (n) => n.step % 2 === 0, 7);
		expect(out.filter((n) => n.step % 2 === 1)).toEqual(hats.filter((n) => n.step % 2 === 1));
		expect(out.every((n) => n.velocity === 120)).toBe(true);
	});
});
