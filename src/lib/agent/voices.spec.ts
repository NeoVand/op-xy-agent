// Two lines read against each other: thirds above said with their qualities, a mix said mostly,
// parallel fifths found, and lines that do not move together left alone.
import { describe, expect, it } from 'vitest';
import { voicesNote } from './voices';

const line = (track: number, notes: number[], every = 2, length = 32) => ({
	track,
	length,
	notes: notes.map((note, i) => ({ step: 1 + i * every, note }))
});

describe('voicesNote', () => {
	it('reads a harmony a third above, with how many are major and minor', () => {
		// G major: B D G F# E D under D F# B A G F#
		const melody = line(5, [71, 74, 79, 78, 76, 74]);
		const harmony = line(6, [74, 78, 83, 81, 79, 78]);
		expect(voicesNote(harmony, melody)).toBe(
			"Against T5's line on the same steps (6 of its 6 notes): a third above throughout (3 minor, 3 major)."
		);
	});

	it('says mostly, and names parallel fifths', () => {
		const lower = line(4, [60, 62, 64, 65, 67]);
		const upper = line(5, [64, 69, 71, 69, 71]);
		expect(voicesNote(upper, lower)).toMatch(
			/^Against T4's line on the same steps \(5 of its 5 notes\): mostly (thirds|fifths) above/
		);
		const fifths = line(5, [67, 69, 71, 72, 74]);
		expect(voicesNote(fifths, lower)).toBe(
			"Against T4's line on the same steps (5 of its 5 notes): a fifth above throughout; parallel fifths on steps 1, 3, 5, 7, 9."
		);
	});

	it('reads an octave doubling as one, its parallels the point', () => {
		// an octave-down copy of a melody was flagged for parallel octaves, read as a fault
		const melody = line(5, [69, 72, 76, 74, 72, 71]);
		const double = line(6, [57, 60, 64, 62, 60, 59]);
		expect(voicesNote(double, melody)).toBe(
			"Against T5's line on the same steps (6 of its 6 notes): an octave below throughout."
		);
	});

	it('leaves lines that do not move together, and chords, alone', () => {
		const melody = line(5, [71, 74, 79, 78, 76, 74]);
		const offbeat = {
			track: 6,
			length: 32,
			notes: melody.notes.map((n) => ({ ...n, step: n.step + 1 }))
		};
		expect(voicesNote(offbeat, melody)).toBeNull();
		const chords = {
			track: 7,
			length: 32,
			notes: [1, 3, 5, 7].flatMap((step) => [60, 64, 67].map((note) => ({ step, note })))
		};
		expect(voicesNote(melody, chords)).toBeNull();
	});
});
