// The table sine against Math.sin: its worst error over many phases (negative and past a cycle
// included, as FM produces them) and the spectrum it plays, which must stay a pure tone.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb } from './analysis';
import { Noise } from './noise';
import { cos2pi, sin2pi } from './sine';

const SR = 48000;

describe('table sine', () => {
	it('matches Math.sin within 4e-7 anywhere, negative phases and several cycles included', () => {
		const noise = new Noise(11);
		let worst = 0;
		for (let i = 0; i < 200000; i++) {
			const phase = noise.next() * 8;
			worst = Math.max(worst, Math.abs(sin2pi(phase) - Math.sin(2 * Math.PI * phase)));
			worst = Math.max(worst, Math.abs(cos2pi(phase) - Math.cos(2 * Math.PI * phase)));
		}
		// exact points: the table's own samples and the quarter cycles
		expect(sin2pi(0)).toBe(0);
		expect(sin2pi(0.25)).toBeCloseTo(1, 7);
		expect(sin2pi(-0.25)).toBeCloseTo(-1, 7);
		expect(worst).toBeLessThan(4e-7);
	});

	it('plays a tone as pure as Math.sin’s: harmonics below −120 dB, noise at the floor', () => {
		const hz = 1003;
		const tone = (sine: (phase: number) => number) => {
			let p = 0;
			return Float64Array.from({ length: 16384 }, () => {
				p = (p + hz / SR) % 1;
				return sine(p);
			});
		};
		const x = tone(sin2pi);
		const [h1, ...rest] = harmonicLevels(x, SR, hz, 6);
		expect(h1).toBeCloseTo(1, 4);
		for (const h of rest) expect(h).toBeLessThan(1e-6);
		// the window's sidelobes set a floor near −88 dB that Math.sin's own tone sits on too
		const exact = inharmonicDb(
			tone((p) => Math.sin(2 * Math.PI * p)),
			SR,
			hz
		);
		expect(inharmonicDb(x, SR, hz)).toBeLessThan(exact + 1);
	});
});
