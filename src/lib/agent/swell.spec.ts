// A slow attack against the notes it sounds under: said when they end before it does, or reach
// full level only near their end; nothing for notes that outlast it.
import { describe, expect, it } from 'vitest';
import { swellNote, tailNote } from './swell';

const amp = (attack: number, release = 33) =>
	`amp envelope: attack ${attack}, decay 96, sustain 99, release ${release}`;

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

describe('tailNote', () => {
	// C major then F major then G, a bar each at 120 bpm
	const chord = (step: number, notes: number[], length = 16) =>
		notes.map((note) => ({ step, length, note }));
	const changes = [
		...chord(1, [60, 64, 67]),
		...chord(17, [60, 65, 69]),
		...chord(33, [62, 67, 71])
	];

	it('says a long release rings each chord on under the next', () => {
		// release 30 is about 3.2 s (an agent's pad read Csus4 at every change)
		expect(tailNote(7, amp(35, 30), changes, 1, 120)).toMatch(
			/^T7's amp release takes 3\.\d s to die away \(120 bpm\), so each chord rings on under the next: /
		);
	});

	it('says nothing for a short release, gaps it dies in, or one chord held on', () => {
		expect(tailNote(7, amp(35, 90), changes, 1, 120)).toBeNull();
		// a bar of silence between chords is longer than half the release
		const gapped = [...chord(1, [60, 64, 67], 4), ...chord(33, [60, 65, 69], 4)];
		expect(tailNote(7, amp(35, 60), gapped, 1, 120)).toBeNull();
		// the same chord again: nothing of it is left to ring under another
		const same = [...chord(1, [60, 64, 67]), ...chord(17, [60, 64, 67])];
		expect(tailNote(7, amp(35, 30), same, 1, 120)).toBeNull();
	});
});
