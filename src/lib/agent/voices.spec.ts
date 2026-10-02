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
		// three octaves down is a bass under a lead, not a second voice: its octaves go unread
		const bass = line(3, [33, 36, 40, 38, 36, 35]);
		expect(voicesNote(melody, bass)).toBeNull();
		// the same notes: a unison doubling (read "an unison throughout")
		expect(voicesNote({ ...melody, track: 4 }, melody)).toBe(
			"Against T5's line on the same steps (6 of its 6 notes): the same notes throughout, a unison doubling."
		);
	});

	it('reads a counter-line between the notes of one near it, and leaves chords alone', () => {
		const melody = line(5, [71, 74, 79, 78, 76, 74]);
		const offbeat = {
			track: 6,
			length: 32,
			notes: melody.notes.map((n) => ({ ...n, step: n.step + 1 }))
		};
		expect(voicesNote(offbeat, melody)).toBe(
			"Against T5's line: none of its 6 notes start with one of T5's; all fall between them."
		);
		// a counter-melody: two of its six with the lead's, the rest between (said "rarely" of 7 in 20)
		const counter = {
			track: 6,
			length: 32,
			notes: [
				{ step: 1, note: 67 },
				{ step: 4, note: 69 },
				{ step: 6, note: 71 },
				{ step: 9, note: 72 },
				{ step: 12, note: 71 },
				{ step: 14, note: 69 }
			]
		};
		expect(voicesNote(counter, melody)).toBe(
			"Against T5's line: 2 of its 6 notes start with one of T5's (2 thirds; steps 1, 9), the other 4 between them."
		);
		// with the lead's lengths, the notes between are over its held notes or in its rests: held
		// two steps from 1, 3, 5…, a note on 2, 4 and 6 is over a held note, one on 14 in a rest
		const timed = { ...melody, notes: melody.notes.map((n) => ({ ...n, length: 2 })) };
		const answer = {
			track: 6,
			length: 32,
			notes: [2, 4, 6, 14].map((step) => ({ step, note: 69, length: 1 }))
		};
		expect(voicesNote(answer, timed)).toBe(
			"Against T5's line: none of its 4 notes start with one of T5's; all fall between them (3 over its held notes, 1 in its rests)."
		);
		// two octaves below, a bass: no counter-line
		const bass = { ...offbeat, notes: offbeat.notes.map((n) => ({ ...n, note: n.note - 24 })) };
		expect(voicesNote(bass, melody)).toBeNull();
		const chords = {
			track: 7,
			length: 32,
			notes: [1, 3, 5, 7].flatMap((step) => [60, 64, 67].map((note) => ({ step, note })))
		};
		expect(voicesNote(melody, chords)).toBeNull();
	});
});
