// A pattern card's grid: rows high to low (a drum row named for its sound, a piano roll filled in
// while it fits), a row kept once seen, a click toggling the note sounding in a cell, a drag setting
// how hard it plays, and the chords where they start.
import { describe, expect, it } from 'vitest';
import type { VirtualNote, VirtualPattern } from '../virtual-opxy';
import { chordMarks, gridRows, noteAt, toggleNote, withVelocity } from './pattern-card';

const pattern = (notes: VirtualNote[]): VirtualPattern => ({
	track: 1,
	pattern: 1,
	patterns: 1,
	current: true,
	bars: 1,
	length: 16,
	scale: 1,
	notes
});

const hit = (step: number, note: number, sound?: string): VirtualNote => ({
	step,
	note,
	velocity: 100,
	length: 1,
	...(sound ? { sound } : {})
});

describe('gridRows', () => {
	it('names drum rows for their sounds, high to low, and keeps a row once seen', () => {
		const beat = pattern([hit(1, 53, 'kick 1'), hit(3, 61, 'closed hat 1'), hit(5, 53, 'kick 1')]);
		expect(gridRows(beat, true, new Map()).map((r) => r.label)).toEqual(['closed hat 1', 'kick 1']);
		const seen = new Map([[55, 'snare 1']]);
		expect(gridRows(beat, true, seen).map((r) => r.note)).toEqual([61, 55, 53]);
	});

	it('fills a piano roll between its lowest and highest pitch, or keeps to the pitches used', () => {
		const bass = pattern([hit(1, 48), hit(5, 51)]);
		expect(gridRows(bass, false, new Map()).map((r) => r.label)).toEqual([
			'D#3',
			'D3',
			'C#3',
			'C3'
		]);
		const wide = pattern([hit(1, 36), hit(5, 72)]);
		expect(gridRows(wide, false, new Map()).map((r) => r.label)).toEqual(['C5', 'C2']);
	});
});

describe('editing', () => {
	it('toggles the note sounding in a cell, a held one included', () => {
		const long: VirtualNote = { step: 3, note: 48, velocity: 90, length: 4 };
		expect(noteAt([long], 5, 48)).toBe(long);
		expect(toggleNote([long], 5, 48)).toEqual([]);
		expect(toggleNote([long], 9, 48)).toEqual([
			long,
			{ step: 9, note: 48, velocity: 100, length: 1 }
		]);
	});

	it('sets a velocity within 1–127', () => {
		const a = hit(1, 53);
		expect(withVelocity([a], a, 150)[0].velocity).toBe(127);
		expect(withVelocity([a], a, 0.2)[0].velocity).toBe(1);
	});
});

describe('chordMarks', () => {
	it('names the chords where they start, not two-note intervals', () => {
		const notes = [48, 52, 55].map((n) => hit(1, n)).concat([hit(9, 50), hit(9, 57)]);
		expect(chordMarks(notes)).toEqual([{ step: 1, name: 'C', notes: [48, 52, 55] }]);
	});
});
