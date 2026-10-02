// Envelope stages in seconds on the measured laws: attack 50 about 1.4 s and 75 about 24 s, a
// release shorter as its value rises.
import { describe, expect, it } from 'vitest';
import { envelopeTimes, stageSeconds, timeText } from './times';

describe('envelope times', () => {
	it('reads an attack on the measured law', () => {
		expect(timeText(stageSeconds('attack', 50))).toBe('1.4 s');
		expect(timeText(stageSeconds('attack', 75))).toBe('24 s');
		expect(timeText(stageSeconds('attack', 0))).toBe('1 ms');
	});

	it('reads a release shorter as its value rises', () => {
		expect(stageSeconds('release', 99)).toBeLessThan(stageSeconds('release', 30));
	});

	it('reads an envelope page', () => {
		expect(envelopeTimes('amp envelope: attack 50, decay 44, sustain 76, release 30')).toBe(
			'attack 1.4 s, decay 1.4 s, release 3.2 s'
		);
		expect(envelopeTimes('svf filter: cutoff 40')).toBeNull();
	});

	it('writes minutes past ninety seconds', () => {
		expect(timeText(360)).toBe('6 min');
	});
});
