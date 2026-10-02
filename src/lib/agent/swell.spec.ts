// A slow attack against the notes it sounds under: said when they end before it does, or reach
// full level only near their end; nothing for notes that outlast it.
import { describe, expect, it } from 'vitest';
import { swellNote } from './swell';

const amp = (attack: number) => `amp envelope: attack ${attack}, decay 96, sustain 99, release 33`;

describe('swellNote', () => {
	it('says notes end before a slow attack does', () => {
		// attack 57 is about 3.2 s; a bar at 120 bpm is 2 s
		expect(swellNote(8, amp(57), [{ length: 16 }], 1, 120)).toBe(
			"T8's amp attack takes 3.2 s, longer than its longest note (2 s at 120 bpm): its notes end before they reach full level. Longer notes, a slower tempo or a shorter attack let them."
		);
	});

	it('says a note reaches full level only near its end', () => {
		expect(swellNote(8, amp(57), [{ length: 32 }], 1, 120)).toMatch(
			/takes 3\.2 s and its longest note lasts 4 s at 120 bpm, so it reaches full level only near its end/
		);
	});

	it('says nothing for notes that outlast the attack, or a quick attack', () => {
		expect(swellNote(8, amp(57), [{ length: 64 }], 1, 120)).toBeNull();
		expect(swellNote(8, amp(20), [{ length: 1 }], 1, 120)).toBeNull();
	});
});
