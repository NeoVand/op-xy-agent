import { describe, expect, it } from 'vitest';
import { defaultState } from '../../params';
import { emptySequence, toggleStep } from '../../sequencer';
import { lastHit, soloed, trackMeter } from './meters';

/** A one-bar sequence with notes on `steps` (velocity 127 unless given). */
function sequence(steps: number[], velocity = 127) {
	const seq = emptySequence();
	for (const i of steps) toggleStep(seq.patterns[0], i, [60], velocity);
	return seq;
}

describe('mixer meters', () => {
	it('finds the latest hit at or before the playhead, wrapping round the pattern', () => {
		expect(lastHit(emptySequence(), 5)).toBeNull();
		expect(lastHit(sequence([0]), 3.5)).toEqual({ elapsed: 3.5, velocity: 1 });
		// the second time round, step 15 of the first pass is 1.2 steps back
		expect(lastHit(sequence([15]), 16.2)?.elapsed).toBeCloseTo(1.2, 9);
		// but nothing plays before the start
		expect(lastHit(sequence([15]), 0.5)).toBeNull();
	});

	it('counts in the track’s own steps and takes a chord’s loudest note', () => {
		const seq = sequence([1], 64);
		seq.patterns[0].scale = 2; // each step lasts two sixteenths
		expect(lastHit(seq, 3)).toEqual({ elapsed: 0.5, velocity: 64 / 127 });
		seq.patterns[0].steps[1].notes.push({ note: 64, velocity: 127, length: 1, offset: 0 });
		expect(lastHit(seq, 3)?.velocity).toBe(1);
	});

	it('solos held track keys only in mix mode, and never with a mute modifier held', () => {
		const s = defaultState();
		s.held = ['track.2', 'track.5', 'key.m1'];
		expect(soloed(s)).toEqual([]);
		s.mode = 'mix';
		expect(soloed(s)).toEqual([1, 4]);
		s.shift = true;
		expect(soloed(s)).toEqual([]);
		s.shift = false;
		s.held.push('key.instrument');
		expect(soloed(s)).toEqual([]);
	});

	it('scales a hit by the track’s level and lets it fall away', () => {
		const s = defaultState();
		s.transport = { playing: true, recording: false, position: 0 };
		const track = { mix: { level: 99, muted: false }, sequence: sequence([0]) };
		expect(trackMeter(s, track, 0, [])).toBe(1);
		s.transport.position = 1.5;
		expect(trackMeter(s, track, 0, [])).toBeCloseTo(Math.exp(-1), 9);
		expect(trackMeter(s, track, 0, [3])).toBe(0);
		expect(trackMeter(s, { ...track, mix: { level: 0, muted: false } }, 0, [])).toBe(0);
	});
});
