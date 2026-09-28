// Claude's markdown answers turned into what the voice gets to say: plain sentences, combos
// spelled for the ear, citations and code left to the screen, long answers cut at a sentence.
import { describe, expect, it } from 'vitest';
import { MORE_ON_SCREEN, speakable, spokenCombo } from './speech';

describe('speakable', () => {
	it('reads markdown as plain sentences and spells key combos', () => {
		expect(
			speakable(
				'Hold `shift` and press `M1` to open the **engine list** [modes.m1].\n\n' +
					'- turn `E2` to pick one\n- press `[+]` to confirm'
			)
		).toBe(
			'Hold shift and press M1 to open the engine list. Turn encoder 2 to pick one. Press plus to confirm.'
		);
	});

	it('says combos the way the guide writes them', () => {
		expect(spokenCombo('shift + M1')).toBe('shift plus M1');
		expect(spokenCombo('shift → step 5')).toBe('shift, then step 5');
		expect(spokenCombo('hold record + play')).toBe('hold record plus play');
	});

	it('leaves code and tables to the screen and says so', () => {
		const text = speakable(
			'Here is the pattern:\n\n```\nx . x .\n```\n\n| step | note |\n| --- | --- |\n| 1 | C3 |'
		);
		expect(text).toBe(`Here is the pattern: ${MORE_ON_SCREEN}`);
		expect(speakable('```\nonly code\n```')).toBe(MORE_ON_SCREEN);
	});

	it('cuts a long answer at a sentence end', () => {
		const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} is here.`).join(
			' '
		);
		const text = speakable(long, 200);
		expect(text.endsWith(`is here. ${MORE_ON_SCREEN}`)).toBe(true);
		expect(text.length).toBeLessThanOrEqual(200 + MORE_ON_SCREEN.length + 1);
	});

	it('keeps a short answer whole and says nothing for an empty one', () => {
		expect(speakable('Tempo is now 96 BPM.')).toBe('Tempo is now 96 BPM.');
		expect(speakable('Done')).toBe('Done.');
		expect(speakable('')).toBe('');
	});
});
