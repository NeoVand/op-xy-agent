import { describe, expect, it } from 'vitest';
import { grainPixels, seeded } from './grain';

describe('grain', () => {
	it('is grey noise round mid-grey with the asked spread', () => {
		const data = grainPixels(64, 24, seeded(7));
		const greys: number[] = [];
		for (let i = 0; i < data.length; i += 4) {
			expect(data[i + 1]).toBe(data[i]);
			expect(data[i + 2]).toBe(data[i]);
			expect(data[i + 3]).toBe(255);
			greys.push(data[i]);
		}
		const mean = greys.reduce((a, b) => a + b, 0) / greys.length;
		const sd = Math.sqrt(greys.reduce((a, b) => a + (b - mean) ** 2, 0) / greys.length);
		expect(mean).toBeGreaterThan(127);
		expect(mean).toBeLessThan(129);
		expect(sd).toBeGreaterThan(22.5);
		expect(sd).toBeLessThan(25.5);
	});

	it('does not correlate one pixel with the next (as the photo’s grain)', () => {
		const size = 64;
		const data = grainPixels(size, 24, seeded(3));
		const at = (x: number, y: number) => data[(y * size + x) * 4] - 128;
		let lag = 0;
		let power = 0;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size - 1; x++) {
				lag += at(x, y) * at(x + 1, y);
				power += at(x, y) ** 2;
			}
		}
		expect(Math.abs(lag / power)).toBeLessThan(0.05);
	});

	it('repeats for the same seed', () => {
		expect(grainPixels(8, 24, seeded(1))).toEqual(grainPixels(8, 24, seeded(1)));
	});
});
