import { describe, expect, it } from 'vitest';
import { describeNoteChange } from './pattern-change';
import { clonePattern, emptyPattern, type Pattern } from './sequencer';

/** A pattern from [step, note, velocity?] triples (steps from 1). */
function pattern(notes: readonly (readonly [number, number, number?])[]): Pattern {
	const p = emptyPattern();
	for (const [step, note, velocity = 100] of notes) {
		p.steps[step - 1].notes.push({ note, velocity, length: 1, offset: 0 });
	}
	return p;
}

const bass = pattern([
	[1, 50],
	[4, 50],
	[7, 53],
	[9, 57],
	[13, 55]
]);

describe('describeNoteChange', () => {
	it('names a transposition, up or down, in semitones or octaves', () => {
		const up = pattern([
			[1, 52],
			[4, 52],
			[7, 55],
			[9, 59],
			[13, 57]
		]);
		expect(describeNoteChange(bass, up)).toBe('5 notes, up 2 semitones');
		expect(describeNoteChange(up, bass)).toBe('5 notes, down 2 semitones');
		const octave = pattern([
			[1, 62],
			[4, 62],
			[7, 65],
			[9, 69],
			[13, 67]
		]);
		expect(describeNoteChange(bass, octave)).toBe('5 notes, up an octave');
	});

	it('tells new pitches on the same rhythm from notes moved to other steps', () => {
		const fourth = pattern([
			[1, 55],
			[4, 55],
			[7, 58],
			[9, 62],
			[13, 60]
		]);
		expect(describeNoteChange(bass, fourth)).toBe('5 notes, up 5 semitones');
		const diatonic = pattern([
			[1, 52],
			[4, 52],
			[7, 55],
			[9, 58],
			[13, 57]
		]);
		expect(describeNoteChange(bass, diatonic)).toBe('5 notes, the same rhythm with new pitches');
		const moved = pattern([
			[1, 50],
			[5, 50],
			[7, 53],
			[9, 57],
			[15, 55]
		]);
		expect(describeNoteChange(bass, moved)).toBe('5 notes, 2 moved to other steps');
	});

	it('says which velocities changed and between which values', () => {
		const hats = pattern([
			[1, 53],
			[3, 61],
			[5, 61],
			[7, 61]
		]);
		const human = clonePattern(hats);
		human.steps[2].notes[0].velocity = 72;
		human.steps[4].notes[0].velocity = 108;
		human.steps[6].notes[0].velocity = 90;
		expect(describeNoteChange(hats, human)).toBe('4 notes, 3 velocities 100 → 72–108');
	});

	it('counts added and removed notes, and new or removed patterns', () => {
		const more = pattern([
			[1, 50],
			[4, 50],
			[7, 53],
			[9, 57],
			[13, 55],
			[15, 57],
			[16, 58]
		]);
		expect(describeNoteChange(bass, more)).toBe('5 → 7 notes (2 added on steps 15, 16)');
		expect(describeNoteChange(emptyPattern(), bass)).toBe('0 → 5 notes');
		expect(describeNoteChange(undefined, bass)).toBe('new, 5 notes');
		expect(describeNoteChange(bass, undefined)).toBe('removed');
		expect(describeNoteChange(bass, clonePattern(bass))).toBeNull();
	});
});
