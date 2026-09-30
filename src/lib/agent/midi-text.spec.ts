import { describe, expect, it } from 'vitest';
import { writeMidiFile, type EventAtTick } from '$lib/core/midi/smf';
import { clockTime, describeMidiFile } from './midi-text';

const PPQ = 480;

function note(
	tick: number,
	pitch: number,
	beats: number,
	velocity = 90,
	channel = 0
): EventAtTick[] {
	return [
		{ tick, event: { type: 'noteOn', channel, note: pitch, velocity } },
		{ tick: tick + beats * PPQ, event: { type: 'noteOff', channel, note: pitch, velocity: 0 } }
	];
}

describe('describeMidiFile', () => {
	it('lists every note with its bar, position, pitch, length and velocity under a header', () => {
		const bytes = writeMidiFile(
			[
				{
					name: 'Right hand',
					events: [
						{ tick: 0, event: { type: 'programChange', channel: 0, program: 0 } },
						...note(0, 56, 1 / 3, 64),
						...note(PPQ / 3, 61, 1 / 3, 64),
						...note(PPQ * 3, 64, 1, 70)
					]
				},
				{ name: 'Drums', events: [...note(0, 36, 0.5, 110, 9), ...note(PPQ, 38, 0.5, 100, 9)] }
			],
			{ bpm: 60, timeSignature: [3, 4], name: 'Test' }
		);
		const { text, detail, noteCount, omitted } = describeMidiFile(bytes, 'sonata.mid');
		expect(noteCount).toBe(5);
		expect(omitted).toBe(0);
		expect(detail).toBe('3 tracks · 5 notes · 0:04');
		const lines = text.split('\n');
		expect(lines[0]).toBe(
			'MIDI file “sonata.mid”, read note for note by the app. Format 1, 480 ticks per quarter note, 3 tracks, 0:04 long (2 bars).'
		);
		expect(lines[1]).toBe('Tempo 60 bpm.');
		expect(lines[2]).toBe('Time signature 3/4.');
		expect(text).toContain(
			'- track 2 “Right hand”: channel 1, GM program 1 Acoustic Grand Piano, 3 notes, G#3–E4'
		);
		expect(text).toContain('- track 3 “Drums”: channel 10 (GM drums), 2 notes, notes 36–38');
		expect(text).toContain(
			'[track 2 “Right hand”, channel 1]\n1 0 G#3 0.333 64\n1 0.333 C#4 0.333 64\n2 0 E4 1 70'
		);
		expect(text).toContain(
			'[track 3 “Drums”, channel 10]\n1 0 36 (Bass Drum 1) 0.5 110\n1 1 38 (Acoustic Snare) 0.5 100'
		);
	});

	it('says where each track plays, single notes or chords, what it doubles and who takes turns', () => {
		const bar = (n: number) => (n - 1) * 4 * PPQ;
		// a verse line in bars 1–4 and a chorus line in bars 9–12; chords under both; the verse doubled
		const verse = [1, 2, 3, 4].flatMap((b) => [
			...note(bar(b), 60, 1),
			...note(bar(b) + PPQ, 69, 1)
		]);
		const chorus = [9, 10, 11, 12].flatMap((b) => [
			...note(bar(b), 67, 2),
			...note(bar(b) + 2 * PPQ, 72, 2)
		]);
		const accent = [5, 7, 9].flatMap((b, i) => note(bar(b), i === 1 ? 74 : 72, 4));
		const chords = [1, 5, 9].flatMap((b) => [48, 52, 55].flatMap((p) => note(bar(b), p, 4)));
		const bytes = writeMidiFile(
			[
				{ name: 'Verse', events: verse },
				{ name: 'Chorus', events: chorus },
				{ name: 'Keys', events: chords },
				{ name: 'Double', events: verse.map((e) => ({ ...e })) },
				{ name: 'Accent', events: accent }
			],
			{ bpm: 120 }
		);
		const { text } = describeMidiFile(bytes, 'song.mid');
		expect(text).toContain(
			'“Verse”: channel 1, 8 notes, C4–A4, plays in bars 1–4, a melody line, one note at a time, takes turns with the melody line of track 3 (one melody between them, likely)'
		);
		expect(text).toContain(
			'“Chorus”: channel 1, 8 notes, G4–C5, plays in bars 9–12, a melody line, one note at a time, takes turns with the melody lines of tracks 2, 5 (one melody between them, likely)'
		);
		// two notes that only repeat are an accent, not a melody
		expect(text).toContain(
			'“Accent”: channel 1, 3 notes, C5–D5, plays in bars 5–9, one note at a time'
		);
		expect(text).toContain(
			'“Keys”: channel 1, 9 notes, C3–G3, plays in bars 1, 5, 9, chords of up to 3 notes'
		);
		expect(text).toContain(
			'“Double”: channel 1, 8 notes, C4–A4, plays in bars 1–4, a melody line, one note at a time, doubles track 2 note for note'
		);
	});

	it('shares a note budget between tracks and says what it left out', () => {
		const melody = Array.from({ length: 30 }, (_, i) => note(i * PPQ, 60 + (i % 12), 1)).flat();
		const bass = Array.from({ length: 30 }, (_, i) =>
			note(i * PPQ, 36 + (i % 12), 1, 90, 1)
		).flat();
		const bytes = writeMidiFile([
			{ name: 'Lead', events: melody },
			{ name: 'Bass', events: bass }
		]);
		const { text, omitted, noteCount } = describeMidiFile(bytes, 'long.mid', 20);
		expect(noteCount).toBe(60);
		expect(omitted).toBe(40);
		expect(text).toContain('(20 more notes in this track after bar 3 are not listed)');
		expect(text.match(/\(20 more notes/g)).toHaveLength(2);
	});

	it('mentions tempo, meter and key changes by bar', () => {
		const bytes = writeMidiFile(
			[
				{
					events: [
						{
							tick: 0,
							event: { type: 'meta', subtype: 0x59, name: 'Key Signature', data: [4, 1] }
						},
						...note(0, 61, 4),
						{
							tick: PPQ * 8,
							event: { type: 'meta', subtype: 0x51, name: 'Set Tempo', data: [0x0f, 0x42, 0x40] }
						},
						...note(PPQ * 8, 63, 1)
					]
				}
			],
			{ bpm: 120 }
		);
		const { text } = describeMidiFile(bytes, 'change.mid');
		expect(text).toContain('Tempo 120 bpm; changes: bar 3 → 60 bpm.');
		expect(text).toContain('Key signature C# minor.');
	});

	it('says so when the file has no notes', () => {
		const { text, detail } = describeMidiFile(writeMidiFile([{ events: [] }]), 'empty.mid');
		expect(text).toContain('The file has no notes.');
		expect(detail).toBe('2 tracks · 0 notes · 0:00');
	});

	it('rejects bytes that are not a MIDI file', () => {
		expect(() => describeMidiFile(new TextEncoder().encode('hello'), 'x.mid')).toThrow(/MThd/);
	});
});

describe('clockTime', () => {
	it('formats minutes and seconds', () => {
		expect(clockTime(0)).toBe('0:00');
		expect(clockTime(92.4)).toBe('1:32');
		expect(clockTime(600)).toBe('10:00');
	});
});
