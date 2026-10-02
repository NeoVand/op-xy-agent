// A groove's reach on a drum pattern: each sound's moved steps in full, and the sounds it leaves
// straight said.
import { describe, expect, it } from 'vitest';
import { grooveReach } from './groove-reach';

const hits = (sound: string, steps: number[]) =>
	steps.map((step) => ({ step, note: 60, velocity: 100, length: 1, sound }));

describe('grooveReach', () => {
	it('lists every sound’s moved steps when all of them move', () => {
		// a roll over asked "which hits move" got one list of steps cut at 16
		const pattern = {
			track: 1,
			scale: 1,
			notes: [
				...hits(
					'closed hat 1',
					Array.from({ length: 32 }, (_, i) => i + 1)
				),
				...hits('kick 1', [1, 7, 11, 17, 23, 31]),
				...hits('snare 1', [5, 13, 21, 29, 32])
			]
		};
		const line = grooveReach(pattern, 'roll over', 45, true);
		expect(line).toMatch(/^The groove \(roll over, \+45\) moves \d+ of T1's 43 notes: /);
		expect(line).toMatch(/kick 1 4 of 6 \(steps 7 11 23 31\)/);
		expect(line).toMatch(/snare 1 1 of 5 \(step 32\)/);
		expect(line).toMatch(/closed hat 1 24 of 32 \(steps 2 3 4 6 7 8 10 11 12 14 15 16 18 /);
		expect(line).not.toMatch(/straight/);
	});
});
