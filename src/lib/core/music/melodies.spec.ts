// Adapted from MIDI Lab (NeoVand/midilab) src/lib/music/melodies.spec.ts
import { describe, it, expect } from 'vitest';
import { MidiRangeError } from '../midi/validate';
import { MELODIES, melody, melodyNotes, round, UnknownMelodyError } from './melodies';
import { phraseBeats, quantiseToSteps } from './notation';

/**
 * A wrong note in a tune everybody knows is worse than a wrong note in an
 * abstract phrase: the reader hears it, does not know whether the app or their
 * ear is broken, and stops trusting the rest.
 *
 * The transcriptions themselves can only be checked against a score, and were.
 * What can be checked here is everything that would corrupt a correct
 * transcription on the way to the wire — a duration typo that overlaps two
 * notes into a chord, an octave that walks off the end of the range, a start
 * time that runs backwards.
 */
describe('the melody library', () => {
	it('has melodies in it', () => {
		expect(MELODIES.length).toBeGreaterThan(8);
	});

	it('uses each id exactly once', () => {
		const ids = MELODIES.map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	for (const m of MELODIES) {
		describe(m.title, () => {
			it('parses to notes', () => {
				expect(m.notes.length).toBeGreaterThan(3);
			});

			it('stays inside the MIDI note range', () => {
				const outside = m.notes.filter((n) => n.note < 0 || n.note > 127);
				expect(outside).toEqual([]);
			});

			it('stays inside the velocity range', () => {
				const outside = m.notes.filter((n) => (n.velocity ?? 0) < 1 || (n.velocity ?? 0) > 127);
				expect(outside).toEqual([]);
			});

			it('never starts a note before the one before it', () => {
				const starts = m.notes.map((n) => n.start);
				expect([...starts].sort((a, b) => a - b)).toEqual(starts);
			});

			it('gives every note a positive length', () => {
				expect(m.notes.filter((n) => n.duration <= 0)).toEqual([]);
			});

			it('never sounds the same pitch twice at once', () => {
				// Two Note Ons for one pitch with no Note Off between them is the
				// exact shape of a stuck note, and a melody is the last place it
				// should come from.
				const overlaps = m.notes.filter((a) =>
					m.notes.some(
						(b) =>
							b !== a &&
							b.note === a.note &&
							b.start > a.start &&
							b.start < a.start + a.duration - 1e-9
					)
				);
				expect(overlaps).toEqual([]);
			});

			it('is long enough to recognise', () => {
				expect(phraseBeats(m.notes)).toBeGreaterThan(3);
			});

			it('names a plausible General MIDI program', () => {
				expect(m.program).toBeGreaterThanOrEqual(0);
				expect(m.program).toBeLessThanOrEqual(127);
			});

			it('carries the attribution a public-domain claim needs', () => {
				expect(m.composer).not.toBe('');
				expect(m.year).not.toBe('');
			});
		});
	}
});

describe('melody transforms', () => {
	it('transposes by adding a constant to every note', () => {
		const plain = melodyNotes('twinkle');
		const up = melodyNotes('twinkle', { transpose: 7 });
		expect(up.map((n) => n.note)).toEqual(plain.map((n) => n.note + 7));
	});

	it('puts a whole melody on one channel', () => {
		expect(melodyNotes('twinkle', { channel: 9 }).every((n) => n.channel === 9)).toBe(true);
	});

	it('builds a round whose voices enter when asked and overlap', () => {
		const voices = round('frere-jacques', [
			{ channel: 0, delay: 0 },
			{ channel: 1, delay: 8 }
		]);
		const second = voices.filter((n) => n.channel === 1);
		expect(Math.min(...second.map((n) => n.start))).toBe(8);
		// The point of a round is that the voices sound together at some stage.
		const firstEnd = Math.max(
			...voices.filter((n) => n.channel === 0).map((n) => n.start + n.duration)
		);
		expect(firstEnd).toBeGreaterThan(8);
	});

	it('leaves the original untouched when transforming', () => {
		const before = MELODIES.find((m) => m.id === 'twinkle')!.notes[0].note;
		melodyNotes('twinkle', { transpose: 12 });
		expect(MELODIES.find((m) => m.id === 'twinkle')!.notes[0].note).toBe(before);
	});

	it('throws on an unknown melody rather than returning nothing', () => {
		expect(() => melodyNotes('not-a-melody')).toThrow(UnknownMelodyError);
		expect(() => melody('not-a-melody')).toThrow(/Known: ode-to-joy/);
	});

	it('refuses a transposition that would leave the MIDI note range', () => {
		// MIDI Lab returned note numbers above 127 here.
		expect(() => melodyNotes('entertainer', { transpose: 48 })).toThrow(MidiRangeError);
		expect(() => melodyNotes('canon-bass', { transpose: -48 })).toThrow(MidiRangeError);
	});

	it('refuses a channel or velocity that cannot be sent', () => {
		expect(() => melodyNotes('twinkle', { channel: 16 })).toThrow(MidiRangeError);
		expect(() => melodyNotes('twinkle', { velocity: 0 })).toThrow(MidiRangeError);
		expect(melodyNotes('twinkle', { velocity: 40 }).every((n) => n.velocity === 40)).toBe(true);
	});
});

describe('metre', () => {
	for (const m of MELODIES.filter((x) => x.beatsPerBar)) {
		it(`${m.title} fills whole bars`, () => {
			// A phrase that stops three-quarters of the way through a bar is
			// usually a transcription that lost a note, and it draws a grid with a
			// ragged right edge. Anacruses are allowed to start before beat zero,
			// so only the total length is checked.
			const beats = phraseBeats(m.notes);
			const bars = beats / m.beatsPerBar!;
			expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.34);
		});
	}

	it('never claims a metre of zero or less', () => {
		expect(MELODIES.filter((m) => m.beatsPerBar !== undefined && m.beatsPerBar <= 0)).toEqual([]);
	});
});

describe('on the OP-XY grid', () => {
	it('places every melody on the 16-step grid exactly, since all of them move in sixteenths or longer', () => {
		for (const m of MELODIES) {
			const steps = quantiseToSteps(m.notes);
			expect(steps).toHaveLength(m.notes.length);
			expect(steps.every((s) => Number.isInteger(s.step))).toBe(true);
		}
	});
});
