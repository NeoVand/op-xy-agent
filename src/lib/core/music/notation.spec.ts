// Parser cases adapted from MIDI Lab (NeoVand/midilab) src/lib/music/melodies.spec.ts
import { describe, expect, it } from 'vitest';
import { MidiRangeError } from '../midi/validate';
import {
	after,
	NotationError,
	phrase,
	phraseBeats,
	QuantiseError,
	quantiseToSteps,
	together
} from './notation';
import type { NoteSpec } from './types';

function notationError(fn: () => unknown): NotationError {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(NotationError);
		return err as NotationError;
	}
	throw new Error('expected a NotationError');
}

describe('the notation parser', () => {
	it('advances by the written duration, not the sounding one', () => {
		// Gate shortens what you hear without moving what comes next; if these
		// two were confused every phrase would slowly drift.
		const n = phrase('C4 D4 E4', { gate: 0.5 });
		expect(n.map((x) => x.start)).toEqual([0, 1, 2]);
		expect(n.map((x) => x.duration)).toEqual([0.5, 0.5, 0.5]);
	});

	it('keeps a duration until it is changed', () => {
		const n = phrase('C4/0.25 D4 E4 F4/1 G4');
		expect(n.map((x) => x.start)).toEqual([0, 0.25, 0.5, 0.75, 1.75]);
		expect(phrase('C4/.5 D4').map((x) => x.start)).toEqual([0, 0.5]);
	});

	it('leaves a gap for a rest', () => {
		const n = phrase('C4/1 _/2 D4/1');
		expect(n.map((x) => x.start)).toEqual([0, 3]);
	});

	it('gives every note of a chord the same start', () => {
		const n = phrase('C4+E4+G4/2');
		expect(n.map((x) => x.note)).toEqual([60, 64, 67]);
		expect(n.every((x) => x.start === 0)).toBe(true);
	});

	it('ignores bar lines unless asked to check them', () => {
		expect(phrase('C4 | D4').map((x) => x.start)).toEqual([0, 1]);
		expect(phrase('| C4 | | D4 |').map((x) => x.start)).toEqual([0, 1]);
	});

	it('reads accidentals both ways round', () => {
		expect(phrase('F#4 Gb4 F♯4').map((x) => x.note)).toEqual([66, 66, 66]);
	});

	it('puts middle C at 60', () => {
		expect(phrase('C4')[0].note).toBe(60);
	});

	it('makes an accent louder and a ghost quieter than a plain note', () => {
		const [plain, loud, quiet] = phrase('C4 D4> E4-');
		expect(plain.velocity).toBe(88);
		expect(loud.velocity).toBe(106);
		expect(quiet.velocity).toBe(54);
	});

	it('shortens a staccato note without moving the next one', () => {
		const n = phrase('C4. D4');
		expect(n[0].duration).toBeLessThan(0.5);
		expect(n[1].start).toBe(1);
	});

	it('applies options to every note', () => {
		const n = phrase('C4 D4', { velocity: 70, channel: 9, gate: 1, transpose: 12 });
		expect(n).toEqual([
			{ note: 72, start: 0, duration: 1, velocity: 70, channel: 9 },
			{ note: 74, start: 1, duration: 1, velocity: 70, channel: 9 }
		]);
	});

	it('returns nothing for an empty phrase', () => {
		expect(phrase('')).toEqual([]);
		expect(phrase('  \n ')).toEqual([]);
	});
});

describe('explicit velocity', () => {
	it('reads C4@96 and lets the default fill the rest', () => {
		expect(phrase('C4@96 D4').map((n) => n.velocity)).toEqual([96, 88]);
	});

	it('goes after the duration and before the marks', () => {
		const [n] = phrase('C4+E4/0.5@100>');
		expect(n).toMatchObject({ start: 0, velocity: 118 });
		expect(phrase('C4/0.5@100.')[0].duration).toBeCloseTo(0.17, 5);
	});

	it('lets accents and ghosts saturate at the ends of the range', () => {
		expect(phrase('C4@120>')[0].velocity).toBe(127);
		expect(phrase('C4@20-')[0].velocity).toBe(1);
		expect(phrase('C4>>')[0].velocity).toBe(124);
	});

	it('refuses a velocity outside 1–127 or in the wrong place', () => {
		expect(notationError(() => phrase('C4@0')).message).toMatch(/velocity 0 is outside 1–127/);
		expect(() => phrase('C4@128')).toThrow(NotationError);
		expect(notationError(() => phrase('C4@loud')).message).toMatch(/whole number after @/);
		expect(notationError(() => phrase('C4@96/0.5')).message).toMatch(/after the duration/);
	});
});

describe('ties', () => {
	it('joins a note to the same pitch in the next token', () => {
		expect(phrase('C4/2~ C4/1 D4')).toEqual([
			// Only the last segment is shortened by the gate: 2 + 1 × 0.9.
			{ note: 60, start: 0, duration: 2.9, velocity: 88, channel: 0 },
			{ note: 62, start: 3, duration: 0.9, velocity: 88, channel: 0 }
		]);
	});

	it('crosses bar lines and chains through several tokens', () => {
		const n = phrase('C4/2~ | C4/4~ | C4/2', { beatsPerBar: 4, pickup: true, gate: 1 });
		expect(n).toEqual([{ note: 60, start: 0, duration: 8, velocity: 88, channel: 0 }]);
	});

	it('ties every note of a chord; the next chord may add new notes', () => {
		const n = phrase('C4+E4~ C4+E4+G4@60');
		expect(n.map((x) => [x.note, x.start, x.duration, x.velocity])).toEqual([
			[60, 0, 1.9, 88],
			[64, 0, 1.9, 88],
			[67, 1, 0.9, 60]
		]);
	});

	it('keeps the first velocity and releases with the last articulation', () => {
		const [n] = phrase('C4@50~ C4@120.');
		expect(n.velocity).toBe(50);
		expect(n.duration).toBeCloseTo(1.34, 5);
	});

	it('refuses a tie that is not continued', () => {
		expect(notationError(() => phrase('C4~ D4')).message).toMatch(/C4 is tied, but this token/);
		expect(notationError(() => phrase('C4+E4~ C4')).message).toMatch(/E4 is tied/);
		expect(notationError(() => phrase('C4~ _')).message).toMatch(/not rest/);
		expect(notationError(() => phrase('C4 D4~')).message).toMatch(/ends inside a tie \(D4\)/);
	});

	it('refuses ties written in the wrong place or combined with staccato', () => {
		expect(notationError(() => phrase('C4~> C4')).message).toMatch(/at the very end/);
		expect(notationError(() => phrase('C4.~ C4')).message).toMatch(/cannot be staccato/);
		expect(notationError(() => phrase('_~ C4')).message).toMatch(/a rest cannot carry/);
	});
});

describe('bar checks', () => {
	it('accepts full bars', () => {
		expect(phrase('C4 D4 E4 F4 | G4/4 |', { beatsPerBar: 4 })).toHaveLength(5);
		expect(phrase('| C4/1.5 |', { beatsPerBar: 1.5 })).toHaveLength(1);
	});

	it('refuses a bar that is too long or too short, pointing at its bar line', () => {
		const long = notationError(() => phrase('C4 D4 E4 F4 G4 | C4/4', { beatsPerBar: 4 }));
		expect(long.message).toMatch(/^bar 1 lasts 5 beats, but a bar here is 4/);
		expect(long.token).toBe('|');
		expect(long.offset).toBe(15);
		expect(() => phrase('C4/4 | C4/1 D4', { beatsPerBar: 4 })).toThrow(/bar 2 lasts 2 beats/);
		expect(() => phrase('C4 D4 | C4/4', { beatsPerBar: 4 })).toThrow(/bar 1 lasts 2 beats/);
	});

	it('allows an upbeat when asked, and a last bar that completes it', () => {
		const opts = { beatsPerBar: 3, pickup: true };
		expect(phrase('D4 | G4/3 | G4/2', opts)).toHaveLength(3);
		expect(phrase('D4 | G4/3 | G4/3', opts)).toHaveLength(3);
		expect(phrase('D4', opts)).toHaveLength(1);
		expect(() => phrase('D4 | G4/3 | G4/1', opts)).toThrow(/bar 3 lasts 1 beats/);
		expect(() => phrase('D4 | G4/1 | G4/3', opts)).toThrow(/bar 2 lasts 1 beats/);
	});

	it('refuses an empty bar', () => {
		expect(notationError(() => phrase('C4/4 | | C4/4', { beatsPerBar: 4 })).message).toMatch(
			/^empty bar/
		);
	});

	it('needs spaces around bar lines', () => {
		expect(notationError(() => phrase('C4|D4')).message).toMatch(/needs spaces around it/);
	});
});

describe('strict tokens', () => {
	it('refuses a pitch it cannot read rather than guessing', () => {
		expect(notationError(() => phrase('H4')).message).toMatch(/unparseable pitch "H4"/);
		expect(() => phrase('C4++E4')).toThrow(/unparseable pitch ""/);
		expect(notationError(() => phrase('/2')).message).toMatch(/missing pitch/);
	});

	it('refuses a duration it cannot read, including numbers JavaScript would accept', () => {
		for (const bad of ['C4/wat', 'C4/1e2', 'C4/0x10', 'C4/-1', 'C4/', 'C4/1/2', 'C4/ 2']) {
			expect(() => phrase(bad)).toThrow(NotationError);
		}
		expect(notationError(() => phrase('C4/0')).message).toMatch(/longer than zero/);
	});

	it('refuses the same pitch twice in a chord, the shape of a stuck note', () => {
		expect(notationError(() => phrase('C4+C4')).message).toMatch(/twice in one chord/);
	});

	it('refuses a rest with a velocity or articulation', () => {
		expect(() => phrase('_@90')).toThrow(/a rest cannot carry/);
		expect(() => phrase('_>')).toThrow(/a rest cannot carry/);
		expect(() => phrase('_.')).toThrow(/a rest cannot carry/);
	});

	it('refuses a transposition that leaves the range', () => {
		expect(notationError(() => phrase('C8', { transpose: 60 })).message).toMatch(
			/C8 transposed by 60 lands outside 0–127/
		);
	});

	it('says where the problem is', () => {
		const err = notationError(() => phrase('C4 D4\n  X9 E4'));
		expect(err.token).toBe('X9');
		expect(err.offset).toBe(8);
		expect(err.message).toBe('unparseable pitch "X9" (at "X9", character 8)');
	});

	it('refuses options that cannot produce valid MIDI', () => {
		expect(() => phrase('C4', { channel: 16 })).toThrow(MidiRangeError);
		expect(() => phrase('C4', { velocity: 0 })).toThrow(MidiRangeError);
		expect(() => phrase('C4', { gate: 0 })).toThrow(MidiRangeError);
		expect(() => phrase('C4', { gate: 1.1 })).toThrow(MidiRangeError);
		expect(() => phrase('C4', { transpose: 0.5 })).toThrow(MidiRangeError);
		expect(() => phrase('C4', { beatsPerBar: 0 })).toThrow(MidiRangeError);
	});
});

describe('phrase helpers', () => {
	it('measures, shifts and layers phrases', () => {
		const a = phrase('C4 D4');
		expect(phraseBeats(a)).toBeCloseTo(1.9, 9);
		expect(phraseBeats([])).toBe(0);
		expect(after(4, a).map((n) => n.start)).toEqual([4, 5]);
		expect(() => after(Number.NaN, a)).toThrow(MidiRangeError);
		const layered = together(after(0.5, phrase('E4')), a);
		expect(layered.map((n) => n.note)).toEqual([60, 64, 62]);
	});
});

describe('quantiseToSteps', () => {
	const n = (
		start: number,
		duration = 0.25,
		note = 60,
		extra: Partial<NoteSpec> = {}
	): NoteSpec => ({
		note,
		start,
		duration,
		...extra
	});

	it('puts sixteenths on the 16-step grid, keeping lengths exact', () => {
		expect(quantiseToSteps(phrase('C4/0.25 D4 E4/0.5 _/1 G4/2'))).toEqual([
			{ step: 0, length: 0.9, note: 60, velocity: 88, channel: 0 },
			{ step: 1, length: 0.9, note: 62, velocity: 88, channel: 0 },
			{ step: 2, length: 1.8, note: 64, velocity: 88, channel: 0 },
			{ step: 8, length: 7.2, note: 67, velocity: 88, channel: 0 }
		]);
	});

	it('fills in the default velocity and channel', () => {
		expect(quantiseToSteps([n(1)])).toEqual([
			{ step: 4, length: 1, note: 60, velocity: 96, channel: 0 }
		]);
	});

	it('refuses a note between steps unless asked to round it', () => {
		const triplets = phrase('C4/0.3333333333 D4 E4', { gate: 1 });
		const err = (() => {
			try {
				quantiseToSteps(triplets);
			} catch (e) {
				return e as QuantiseError;
			}
		})();
		expect(err).toBeInstanceOf(QuantiseError);
		expect(err?.message).toMatch(/^D4 at beat 0\.333333 falls between steps/);
		expect(quantiseToSteps(triplets, { mode: 'nearest' }).map((s) => s.step)).toEqual([0, 1, 3]);
		// Or use a grid that has room for them: 12 steps per 4/4 bar.
		expect(quantiseToSteps(triplets, { stepsPerBar: 12 }).map((s) => s.step)).toEqual([0, 1, 2]);
	});

	it('refuses two of the same pitch on one step', () => {
		expect(() => quantiseToSteps([n(0), n(0.1)], { mode: 'nearest' })).toThrow(
			/C4 on channel 1 lands on step 0 twice/
		);
		// Different pitches or channels on one step are a chord, which is fine.
		expect(quantiseToSteps([n(0), n(0, 0.25, 64), n(0, 0.25, 60, { channel: 1 })])).toHaveLength(3);
	});

	it('refuses a strict overlap, and trims one that rounding caused', () => {
		const overlapping = [n(0, 1), n(0.8, 1)];
		expect(() => quantiseToSteps([n(0, 1), n(0.75, 1)])).toThrow(/still sounding/);
		expect(
			quantiseToSteps(overlapping, { mode: 'nearest' }).map((s) => [s.step, s.length])
		).toEqual([
			[0, 3],
			[3, 4]
		]);
	});

	it('refuses notes past the pattern limit', () => {
		expect(() => quantiseToSteps([n(16)], { maxSteps: 64 })).toThrow(
			/step 64, past the 64-step limit/
		);
		expect(quantiseToSteps([n(15.75)], { maxSteps: 64 })[0].step).toBe(63);
	});

	it('supports other bar lengths', () => {
		// 3/4 with 12 steps per bar: still sixteenths.
		expect(quantiseToSteps([n(2.75)], { stepsPerBar: 12, beatsPerBar: 3 })[0].step).toBe(11);
	});

	it('sorts by step, then pitch', () => {
		const out = quantiseToSteps([n(1, 0.25, 64), n(1, 0.25, 60), n(0, 0.25, 67)]);
		expect(out.map((s) => [s.step, s.note])).toEqual([
			[0, 67],
			[4, 60],
			[4, 64]
		]);
	});

	it('refuses notes and options that make no sense', () => {
		expect(() => quantiseToSteps([n(-1)])).toThrow(/notes\[0\]\.start/);
		expect(() => quantiseToSteps([n(0, 0)])).toThrow(/notes\[0\]\.duration/);
		expect(() => quantiseToSteps([n(0, 1, 128)])).toThrow(/notes\[0\]\.note/);
		expect(() => quantiseToSteps([n(0, 1, 60, { velocity: 0 })])).toThrow(/velocity/);
		expect(() => quantiseToSteps([n(0, 1, 60, { channel: 16 })])).toThrow(/channel/);
		expect(() => quantiseToSteps([], { stepsPerBar: 0 })).toThrow(MidiRangeError);
		expect(() => quantiseToSteps([], { beatsPerBar: -4 })).toThrow(MidiRangeError);
		expect(() => quantiseToSteps([], { mode: 'round' as 'strict' })).toThrow(MidiRangeError);
		expect(() => quantiseToSteps([], { maxSteps: 0 })).toThrow(MidiRangeError);
	});
});
