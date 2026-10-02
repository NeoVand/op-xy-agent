// Slides as the replica plays them: legato glides into a note only from one that runs past its
// start; mono glides every note; nothing slides with portamento off or in poly.
import { describe, expect, it } from 'vitest';
import { playModeOf, slidesNote } from './slides';

const legato = 'play mode legato, portamento 20, bend 2 semitones, volume 44';
const line = (lengths: number[]) => lengths.map((length, i) => ({ step: 1 + i * 2, length }));

describe('slides', () => {
	it('reads the play mode page', () => {
		expect(playModeOf('play mode poly, portamento off, bend 3 semitones, volume 51')).toEqual({
			mode: 'poly',
			portamento: 0
		});
		expect(playModeOf(legato)).toEqual({ mode: 'legato', portamento: 20 });
	});

	it('says no note slides in legato when each ends just where the next begins', () => {
		expect(slidesNote(3, legato, line([2, 2, 2]))).toBe(
			"T3 plays legato with portamento 20, but no note runs past the next one's start (those on steps 1, 3 end just where the next begins), so none slides: for a slide, make the note longer than the gap (2.5 steps for notes 2 apart)."
		);
	});

	it('names the notes that slide in legato, and those that start afresh', () => {
		expect(slidesNote(3, legato, line([2.5, 2, 1]))).toBe(
			"T3 plays legato with portamento 20: the notes on step 1 run past the next one's start and slide into it. Those on step 3 end just where the next begins, so they start it afresh: make one longer than the gap to slide it."
		);
	});

	it('glides every note in mono with portamento up, and none with it off or in poly', () => {
		expect(
			slidesNote(3, 'play mode mono, portamento 10, bend 2 semitones, volume 44', line([1, 1]))
		).toMatch(/^T3 plays mono with portamento 10: every note slides from the one before/);
		expect(
			slidesNote(3, 'play mode legato, portamento off, bend 2 semitones, volume 44', line([3, 3]))
		).toBeNull();
		expect(
			slidesNote(3, 'play mode poly, portamento 30, bend 2 semitones, volume 44', line([3, 3]))
		).toBeNull();
	});
});
