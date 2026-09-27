import { describe, expect, it } from 'vitest';
import {
	tempoMeta,
	timeSignatureMeta,
	writeMidiFile,
	type EventAtTick,
	type MetaEvent
} from '../midi/smf';
import { barPosition, keySignatureName, midiFileNotes } from './midifile';

const PPQ = 480;

const on = (tick: number, note: number, velocity = 100, channel = 0): EventAtTick => ({
	tick,
	event: { type: 'noteOn', channel, note, velocity }
});
const off = (tick: number, note: number, channel = 0): EventAtTick => ({
	tick,
	event: { type: 'noteOff', channel, note, velocity: 0 }
});
const keySignature = (tick: number, sharps: number, minor: boolean): EventAtTick => ({
	tick,
	event: {
		type: 'meta',
		subtype: 0x59,
		name: 'Key Signature',
		data: [sharps & 0xff, minor ? 1 : 0]
	} satisfies MetaEvent
});

describe('midiFileNotes', () => {
	it('pairs note-ons with note-offs into beats, per track, sorted by time', () => {
		const bytes = writeMidiFile(
			[
				{
					name: 'Melody',
					events: [on(0, 64), off(PPQ, 64), on(PPQ, 62, 80), off(PPQ * 1.5, 62)]
				},
				{
					name: 'Bass',
					events: [
						{ tick: 0, event: { type: 'programChange', channel: 1, program: 32 } },
						on(0, 40, 90, 1),
						off(PPQ * 2, 40, 1)
					]
				}
			],
			{ bpm: 90, timeSignature: [3, 4] }
		);
		const read = midiFileNotes(bytes);
		expect(read.ticksPerQuarter).toBe(PPQ);
		expect(read.notes).toEqual([
			{ note: 64, start: 0, duration: 1, velocity: 100, channel: 0, track: 1 },
			{ note: 40, start: 0, duration: 2, velocity: 90, channel: 1, track: 2 },
			{ note: 62, start: 1, duration: 0.5, velocity: 80, channel: 0, track: 1 }
		]);
		expect(read.tempos).toEqual([{ beat: 0, bpm: 90 }]);
		expect(read.meters).toEqual([{ beat: 0, numerator: 3, denominator: 4 }]);
		expect(read.tracks.map((t) => [t.name, t.noteCount, t.lowest, t.highest])).toEqual([
			[null, 0, null, null],
			['Melody', 2, 62, 64],
			['Bass', 1, 40, 40]
		]);
		expect(read.tracks[2].programs).toEqual([{ channel: 1, program: 32 }]);
		expect(read.tracks[2].channels).toEqual([1]);
		expect(read.beats).toBe(2);
		// Two beats at 90 bpm.
		expect(read.seconds).toBeCloseTo(4 / 3, 3);
	});

	it('treats a note-on with velocity 0 as a note-off and pairs repeated notes first in, first out', () => {
		const bytes = writeMidiFile([
			{
				events: [
					on(0, 60),
					on(PPQ / 2, 60),
					{ tick: PPQ, event: { type: 'noteOn', channel: 0, note: 60, velocity: 0 } },
					off(PPQ * 2, 60)
				]
			}
		]);
		const notes = midiFileNotes(bytes).notes.map((n) => [n.start, n.duration]);
		expect(notes).toEqual([
			[0, 1],
			[0.5, 1.5]
		]);
	});

	it('ends notes still held at the end of their track, and gives zero-length notes a sliver', () => {
		const bytes = writeMidiFile([
			{ events: [on(0, 67), on(PPQ, 69), off(PPQ, 69), { tick: PPQ * 4, event: tempoMeta(120) }] }
		]);
		const notes = midiFileNotes(bytes).notes;
		expect(notes.find((n) => n.note === 67)?.duration).toBe(4);
		expect(notes.find((n) => n.note === 69)?.duration).toBeCloseTo(1 / 64, 6);
	});

	it('reads tempo, meter and key changes', () => {
		const bytes = writeMidiFile(
			[
				{
					events: [
						keySignature(0, 4, true),
						on(0, 61),
						off(PPQ, 61),
						{ tick: PPQ * 8, event: tempoMeta(60) },
						{ tick: PPQ * 8, event: timeSignatureMeta(6, 8) },
						keySignature(PPQ * 8, -3, false),
						on(PPQ * 8, 63),
						off(PPQ * 9, 63)
					]
				}
			],
			{ bpm: 120 }
		);
		const read = midiFileNotes(bytes);
		expect(read.tempos).toEqual([
			{ beat: 0, bpm: 120 },
			{ beat: 8, bpm: 60 }
		]);
		expect(read.meters).toEqual([
			{ beat: 0, numerator: 4, denominator: 4 },
			{ beat: 8, numerator: 6, denominator: 8 }
		]);
		expect(read.keys).toEqual([
			{ beat: 0, sharps: 4, minor: true },
			{ beat: 8, sharps: -3, minor: false }
		]);
		// 8 beats at 120 bpm, then one at 60.
		expect(read.seconds).toBeCloseTo(5, 3);
	});
});

describe('barPosition', () => {
	const meters = [
		{ beat: 0, numerator: 4, denominator: 4 },
		{ beat: 8, numerator: 3, denominator: 4 },
		{ beat: 14, numerator: 6, denominator: 8 }
	];

	it('counts bars through meter changes', () => {
		expect(barPosition(0, meters)).toEqual({ bar: 1, offset: 0 });
		expect(barPosition(5.5, meters)).toEqual({ bar: 2, offset: 1.5 });
		expect(barPosition(8, meters)).toEqual({ bar: 3, offset: 0 });
		expect(barPosition(13, meters)).toEqual({ bar: 4, offset: 2 });
		// 6/8 is three beats (quarter notes) per bar.
		expect(barPosition(14, meters)).toEqual({ bar: 5, offset: 0 });
		expect(barPosition(18.25, meters)).toEqual({ bar: 6, offset: 1.25 });
	});

	it('assumes 4/4 without meters', () => {
		expect(barPosition(9, [])).toEqual({ bar: 3, offset: 1 });
	});
});

describe('keySignatureName', () => {
	it('names signatures from 7 flats to 7 sharps', () => {
		expect(keySignatureName(0, false)).toBe('C major');
		expect(keySignatureName(0, true)).toBe('A minor');
		expect(keySignatureName(4, true)).toBe('C# minor');
		expect(keySignatureName(-3, false)).toBe('Eb major');
		expect(keySignatureName(-7, false)).toBe('Cb major');
		expect(keySignatureName(8, false)).toBeNull();
	});
});
