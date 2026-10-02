// write_pattern's short forms: a compact string (step:note[:length[:velocity]], chords joined by +)
// and a grid as read_pattern shows drums, read into plain notes; mistakes name the word or line.
import { describe, expect, it } from 'vitest';
import {
	compactNotes,
	gridHits,
	gridMiscount,
	markVelocity,
	PatternNotesError
} from './pattern-notes';

describe('compactNotes', () => {
	it('reads a word per note, chords, lengths and velocities, either left out', () => {
		expect(compactNotes('1:A2:4 5:C3+E3+G3:2:70\n9:E2::90, 13:45')).toEqual([
			{ step: 1, note: 'A2', length: 4 },
			{ step: 5, note: 'C3', length: 2, velocity: 70 },
			{ step: 5, note: 'E3', length: 2, velocity: 70 },
			{ step: 5, note: 'G3', length: 2, velocity: 70 },
			{ step: 9, note: 'E2', velocity: 90 },
			{ step: 13, note: 45 }
		]);
		expect(compactNotes('  ')).toEqual([]);
		expect(compactNotes('3:F#3:0.5 4:Bb-1')).toEqual([
			{ step: 3, note: 'F#3', length: 0.5 },
			{ step: 4, note: 'Bb-1' }
		]);
	});

	it('names the word that is wrong, and why', () => {
		const wrong = (text: string) => () => compactNotes(text);
		expect(wrong('1:C3 C3')).toThrow(/"C3" is not step:note/);
		expect(wrong('65:C3')).toThrow(/"65:C3": the step is 1–64/);
		expect(wrong('1:H3')).toThrow(/"H3" is not a note/);
		expect(wrong('1:200')).toThrow(/past 127/);
		expect(wrong('1:C3:0')).toThrow(/the length is/);
		expect(wrong('1:C3:1:128')).toThrow(/the velocity is 1–127/);
		expect(wrong('1:C3+:1')).toThrow(/a note is missing/);
		expect(wrong('1:C3:1:2:3')).toThrow(PatternNotesError);
	});
});

describe('gridHits', () => {
	it('reads a mark a step, spaces and bars ignored, and how far the lines reach', () => {
		const { hits, steps } = gridHits({
			'kick 1': 'x... ..x. x... .... | X... .... .... ....',
			62: '..o. ..x-'
		});
		expect(steps).toBe(32);
		// (an object's number keys come first)
		expect(hits).toEqual([
			{ key: '62', step: 3, mark: 'o' },
			{ key: '62', step: 7, mark: 'x' },
			{ key: 'kick 1', step: 1, mark: 'x' },
			{ key: 'kick 1', step: 7, mark: 'x' },
			{ key: 'kick 1', step: 9, mark: 'x' },
			{ key: 'kick 1', step: 17, mark: 'X' }
		]);
	});

	it('refuses marks it does not know and lines past four bars', () => {
		expect(() => gridHits({ snare: 'x..1' })).toThrow(/"1" is not a mark/);
		expect(() => gridHits({ snare: 'x'.repeat(65) })).toThrow(/65 steps/);
	});

	it('gives an accent more and a soft hit about half', () => {
		expect([markVelocity('x', 100), markVelocity('X', 100), markVelocity('o', 100)]).toEqual([
			100, 125, 55
		]);
		expect(markVelocity('X', 120)).toBe(127);
	});
});

describe('gridMiscount', () => {
	it('names the bar or the group a line miscounts, by its own spacing', () => {
		expect(gridMiscount('x... x... x... x... | x... x... x... x....')).toBe('bar 2 has 17');
		expect(gridMiscount('x... x... x.... x...')).toBe('group 3 ("x....") has 5, the others 4');
		expect(gridMiscount('x...x...x...x...x')).toBeNull();
		expect(gridMiscount('x... x... x... x...')).toBeNull();
	});
});
