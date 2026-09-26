// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/smf.spec.ts
import { describe, expect, it } from 'vitest';
import type { MidiMessage } from './messages';
import {
	decodeVlq,
	encodeMidiFile,
	encodeVlq,
	endOfTrackMeta,
	explainVlq,
	flatten,
	isMeta,
	readMidiFile,
	SmfFormatError,
	summarise,
	tempoMap,
	tempoMeta,
	textMeta,
	tickToMs,
	timeSignatureMeta,
	VLQ_MAX,
	writeMidiFile,
	type EventAtTick,
	type FileInput,
	type MidiFile,
	type TrackEvent
} from './smf';
import { MidiRangeError } from './validate';

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const chunk = (id: string, body: number[]) => [...ascii(id), ...be32(body.length), ...body];
const EOT = [0x00, 0xff, 0x2f, 0x00];

/** A file from raw track bodies. `division` is the two header bytes. */
function smf(format: number, division: [number, number], ...tracks: number[][]): Uint8Array {
	const header = chunk('MThd', [0, format, 0, tracks.length, ...division]);
	return Uint8Array.from([...header, ...tracks.flatMap((body) => chunk('MTrk', body))]);
}
const PPQ_96: [number, number] = [0x00, 0x60];

/** The events of a one-track file built from `body`. */
const eventsOf = (body: number[]) => readMidiFile(smf(0, PPQ_96, body)).tracks[0].events;
const messagesOf = (file: MidiFile, track: number) =>
	file.tracks[track].events.filter((e) => !isMeta(e.event));

const note = (tick: number, n: number, velocity: number, channel = 0): EventAtTick => ({
	tick,
	event:
		velocity > 0
			? { type: 'noteOn', channel, note: n, velocity }
			: { type: 'noteOff', channel, note: n, velocity: 0 }
});

function formatError(fn: () => unknown): SmfFormatError {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(SmfFormatError);
		return err as SmfFormatError;
	}
	throw new Error('expected an SmfFormatError');
}

describe('variable-length quantities', () => {
	// The canonical examples from the Standard MIDI File specification.
	const cases: Array<[number, number[]]> = [
		[0, [0x00]],
		[0x40, [0x40]],
		[0x7f, [0x7f]],
		[0x80, [0x81, 0x00]],
		[0x2000, [0xc0, 0x00]],
		[0x3fff, [0xff, 0x7f]],
		[0x100000, [0xc0, 0x80, 0x00]],
		[0x0fffffff, [0xff, 0xff, 0xff, 0x7f]]
	];

	it('encodes the spec examples', () => {
		for (const [value, bytes] of cases) expect(encodeVlq(value)).toEqual(bytes);
	});

	it('round-trips', () => {
		for (const [value] of cases) {
			const bytes = encodeVlq(value);
			expect(decodeVlq(bytes, 0)).toEqual({ value, next: bytes.length });
		}
	});

	it('refuses values a file cannot hold', () => {
		expect(() => encodeVlq(-1)).toThrow(MidiRangeError);
		expect(() => encodeVlq(1.5)).toThrow(MidiRangeError);
		expect(() => encodeVlq(VLQ_MAX + 1)).toThrow(MidiRangeError);
	});

	it('refuses truncated, overlong and non-byte input', () => {
		expect(formatError(() => decodeVlq([0x81], 0)).message).toMatch(/ends inside/);
		expect(formatError(() => decodeVlq([0x81, 0x00], 0, 1)).offset).toBe(1);
		expect(formatError(() => decodeVlq([0x81, 0x80, 0x80, 0x80, 0x00], 0)).message).toMatch(
			/longer than four bytes/
		);
		expect(formatError(() => decodeVlq([300], 0)).message).toMatch(/not a byte/);
		expect(() => decodeVlq([0], -1)).toThrow(MidiRangeError);
	});

	it('explains itself', () => {
		expect(explainVlq(0x80)).toEqual({
			bytes: [0x81, 0x00],
			steps: ['0x81 → carries 1, and another byte follows', '0x00 → carries 0, last byte']
		});
	});
});

describe('midi files', () => {
	const events: TrackEvent[] = [
		{ delta: 0, tick: 0, event: { type: 'programChange', channel: 0, program: 4 } },
		{ delta: 0, tick: 0, event: { type: 'noteOn', channel: 0, note: 60, velocity: 100 } },
		{ delta: 480, tick: 480, event: { type: 'noteOff', channel: 0, note: 60, velocity: 0 } },
		{ delta: 0, tick: 480, event: { type: 'noteOn', channel: 0, note: 64, velocity: 88 } },
		{ delta: 960, tick: 1440, event: { type: 'noteOff', channel: 0, note: 64, velocity: 0 } }
	];

	it('writes a file that reads back identically', () => {
		const file = readMidiFile(writeMidiFile([{ name: 'Lead', events }], { bpm: 96, name: 'Test' }));

		expect(file.format).toBe(1);
		expect(file.division).toEqual({ kind: 'ppq', ticksPerQuarter: 480 });
		// Conductor track plus one part.
		expect(file.tracks).toHaveLength(2);

		const summary = summarise(file);
		expect(summary.noteCount).toBe(2);
		expect(summary.tempo).toBeCloseTo(96, 1);
		expect(summary.channelsUsed).toEqual([0]);
		expect(summary.durationTicks).toBe(1440);
		expect(summary.names).toEqual(['Test', 'Lead']);
		expect(summary.timeSignature).toBe('4/4');
	});

	it('preserves every event through the round trip', () => {
		const file = readMidiFile(writeMidiFile([{ events }]));
		expect(messagesOf(file, 1)).toEqual(events.map((e) => ({ ...e })));
	});

	it('ends every track with exactly one End of Track', () => {
		const file = readMidiFile(writeMidiFile([{ events }]));
		for (const track of file.tracks) {
			const last = track.events[track.events.length - 1].event;
			expect(isMeta(last) && last.subtype).toBe(0x2f);
			expect(track.events.filter((e) => isMeta(e.event) && e.event.subtype === 0x2f)).toHaveLength(
				1
			);
		}
	});

	it('writes a 200 KB track and reads it back (MIDI Lab threw past ~120 KB)', () => {
		const big: EventAtTick[] = [];
		for (let i = 0; i < 30_000; i++) {
			big.push(note(i * 10, 36 + (i % 48), 1 + (i % 127), i % 16));
			big.push(note(i * 10 + 5, 36 + (i % 48), 0, i % 16));
		}
		const bytes = writeMidiFile([{ events: big }]);
		expect(bytes.length).toBeGreaterThan(200_000);

		const file = readMidiFile(bytes);
		const back = messagesOf(file, 1);
		expect(back).toHaveLength(big.length);
		expect(back.map(({ tick, event }) => ({ tick, event }))).toEqual(big);
		expect(summarise(file).noteCount).toBe(30_000);
	});

	it('accepts an ArrayBuffer and a view into a larger buffer', () => {
		const bytes = writeMidiFile([{ events }]);
		expect(readMidiFile(bytes.buffer.slice(0) as ArrayBuffer).tracks).toHaveLength(2);
		const padded = new Uint8Array(bytes.length + 8);
		padded.set(bytes, 4);
		expect(readMidiFile(padded.subarray(4, 4 + bytes.length)).tracks).toHaveLength(2);
		expect(readMidiFile(new DataView(padded.buffer, 4, bytes.length)).tracks).toHaveLength(2);
	});

	it('round-trips a format 0 file', () => {
		const input: FileInput = {
			format: 0,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [{ events: [note(0, 60, 90), note(96, 60, 0)] }]
		};
		const file = readMidiFile(encodeMidiFile(input));
		expect(file.format).toBe(0);
		expect(file.tracks).toHaveLength(1);
		expect(messagesOf(file, 0).map((e) => e.tick)).toEqual([0, 96]);
	});
});

describe('tempo', () => {
	// 120 BPM for four beats, then 60 BPM; one note held for eight beats.
	const file: FileInput = {
		format: 1,
		division: { kind: 'ppq', ticksPerQuarter: 480 },
		tracks: [
			{
				events: [
					{ tick: 0, event: tempoMeta(120) },
					{ tick: 1920, event: tempoMeta(60) }
				]
			},
			{ events: [note(0, 60, 100), note(3840, 60, 0)] }
		]
	};

	it('follows a tempo change mid-file', () => {
		const map = tempoMap(readMidiFile(encodeMidiFile(file)));
		expect(map.points).toEqual([
			{ tick: 0, usPerQuarter: 500_000, ms: 0 },
			{ tick: 1920, usPerQuarter: 1_000_000, ms: 2000 }
		]);
		expect(tickToMs(map, 960)).toBe(1000);
		expect(tickToMs(map, 1920)).toBe(2000);
		expect(tickToMs(map, 2400)).toBe(3000);
		expect(tickToMs(map, 3840)).toBe(6000);
		expect(tickToMs(map, 2160.5)).toBeCloseTo(2501.04, 2);
	});

	it('uses the tempo map for duration and playback times, not the last tempo', () => {
		const back = readMidiFile(encodeMidiFile(file));
		const summary = summarise(back);
		// "Last tempo wins" would have said 8 seconds.
		expect(summary.durationSeconds).toBe(6);
		expect(summary.tempo).toBe(120);
		expect(summary.tempoChanges).toBe(2);
		expect(flatten(back).map((e) => e.ms)).toEqual([0, 6000]);
	});

	it('starts at 120 BPM, honours misplaced tempo events and lets the last of a tick win', () => {
		expect(tempoMap({ ...file, tracks: [{ events: [] }] }).points).toEqual([
			{ tick: 0, usPerQuarter: 500_000, ms: 0 }
		]);
		const late = tempoMap({
			...file,
			tracks: [
				{ events: [] },
				{
					events: [
						{ tick: 480, event: tempoMeta(60) },
						{ tick: 480, event: tempoMeta(30) }
					]
				}
			]
		});
		expect(late.points).toEqual([
			{ tick: 0, usPerQuarter: 500_000, ms: 0 },
			{ tick: 480, usPerQuarter: 2_000_000, ms: 500 }
		]);
	});

	it('keeps format 2 tracks on their own tempo maps', () => {
		const independent: FileInput = {
			format: 2,
			division: { kind: 'ppq', ticksPerQuarter: 480 },
			tracks: [
				{ events: [{ tick: 0, event: tempoMeta(60) }, note(0, 60, 1), note(480, 60, 0)] },
				{ events: [note(0, 62, 1), note(480, 62, 0)] }
			]
		};
		expect(tickToMs(tempoMap(independent, 0), 480)).toBe(1000);
		expect(tickToMs(tempoMap(independent, 1), 480)).toBe(500);
		expect(() => tempoMap(independent, 2)).toThrow(MidiRangeError);
		expect(summarise(independent)).toMatchObject({ durationSeconds: 1, tempo: 60 });
		expect(flatten(independent).map((e) => [e.track, e.ms])).toEqual([
			[0, 0],
			[1, 0],
			[1, 500],
			[0, 1000]
		]);
	});

	it('counts SMPTE ticks in absolute time', () => {
		// E7 = −25 fps, 0x28 = 40 ticks per frame: 1000 ticks per second.
		const file = readMidiFile(
			smf(0, [0xe7, 0x28], [0x00, 0x90, 60, 100, 0x87, 0x68, 0x80, 60, 0, ...EOT])
		);
		expect(file.division).toEqual({ kind: 'smpte', framesPerSecond: 25, ticksPerFrame: 40 });
		expect(tickToMs(tempoMap(file), 1000)).toBe(1000);
		expect(summarise(file).durationSeconds).toBe(1);
		const dropFrame = readMidiFile(smf(0, [0xe3, 0x50], EOT));
		expect(dropFrame.division).toEqual({
			kind: 'smpte',
			framesPerSecond: 29.97,
			ticksPerFrame: 80
		});
	});

	it('refuses a negative or non-finite tick', () => {
		const map = tempoMap(file);
		expect(() => tickToMs(map, -1)).toThrow(MidiRangeError);
		expect(() => tickToMs(map, Number.NaN)).toThrow(MidiRangeError);
	});
});

describe('running status in tracks', () => {
	it('reads events that omit a repeated status byte', () => {
		const events = eventsOf([0x00, 0x90, 60, 100, 0x60, 62, 100, 0x60, 60, 0, ...EOT]);
		expect(events.slice(0, 3)).toEqual([
			{ delta: 0, tick: 0, event: { type: 'noteOn', channel: 0, note: 60, velocity: 100 } },
			{ delta: 96, tick: 96, event: { type: 'noteOn', channel: 0, note: 62, velocity: 100 } },
			{ delta: 96, tick: 192, event: { type: 'noteOff', channel: 0, note: 60, velocity: 0 } }
		]);
	});

	it('tolerates running status carried across a meta event, as sloppy writers do', () => {
		const events = eventsOf([0x00, 0x90, 60, 100, 0x00, 0xff, 0x01, 0x01, 0x41, 0x00, 62, 100]);
		expect(events.map((e) => e.event.type)).toEqual(['noteOn', 'meta', 'noteOn']);
	});

	it('refuses a data byte when there is no status to run', () => {
		expect(formatError(() => eventsOf([0x00, 60, 100])).message).toMatch(
			/data byte where a status/
		);
	});

	it('writes running status on request, restarting it after meta and SysEx events', () => {
		const input: FileInput = {
			format: 0,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [
				{
					events: [
						note(0, 60, 100),
						note(10, 62, 100),
						{ tick: 20, event: textMeta(0x06, 'mark') },
						note(30, 64, 100),
						{ tick: 40, event: { type: 'sysex', data: [0x7d, 0x01] } },
						note(50, 65, 100)
					]
				}
			]
		};
		const plain = encodeMidiFile(input);
		const packed = encodeMidiFile(input, { runningStatus: true });
		expect(packed.length).toBe(plain.length - 1); // only 62 can reuse 60's status byte
		expect(readMidiFile(packed)).toEqual(readMidiFile(plain));
	});
});

describe('SysEx and escape events', () => {
	it('reads a SysEx event without its F7', () => {
		expect(eventsOf([0x00, 0xf0, 0x05, 0x7e, 0x7f, 0x06, 0x01, 0xf7, ...EOT])[0].event).toEqual({
			type: 'sysex',
			data: [0x7e, 0x7f, 0x06, 0x01]
		});
	});

	it('joins a SysEx sent in packets', () => {
		const events = eventsOf([
			0x00,
			0xf0,
			0x03,
			0x43,
			0x12,
			0x00,
			0x10,
			0xf7,
			0x03,
			0x01,
			0x02,
			0xf7,
			0x00,
			0x90,
			60,
			1,
			...EOT
		]);
		expect(events[0]).toEqual({
			delta: 0,
			tick: 0,
			event: { type: 'sysex', data: [0x43, 0x12, 0x00, 0x01, 0x02] }
		});
		expect(events[1].tick).toBe(16);
	});

	it('keeps packets open across more than one continuation', () => {
		const events = eventsOf([
			0x00,
			0xf0,
			0x01,
			0x43,
			0x00,
			0xf7,
			0x01,
			0x01,
			0x00,
			0xf7,
			0x02,
			0x02,
			0xf7,
			...EOT
		]);
		expect(events[0].event).toEqual({ type: 'sysex', data: [0x43, 0x01, 0x02] });
		expect(events).toHaveLength(2);
	});

	it('reads an F7 event outside a divided SysEx as an escape', () => {
		expect(eventsOf([0x00, 0xf7, 0x01, 0xf8, ...EOT])[0].event).toEqual({
			type: 'escape',
			data: [0xf8]
		});
		// A MIDI event closes a divided SysEx, so a later F7 packet is an escape again.
		const events = eventsOf([
			0x00,
			0xf0,
			0x01,
			0x43,
			0x00,
			0x90,
			60,
			1,
			0x00,
			0xf7,
			0x01,
			0xfa,
			...EOT
		]);
		expect(events.map((e) => e.event.type)).toEqual(['sysex', 'noteOn', 'escape', 'meta']);
	});

	it('writes and reads back a 64 KB SysEx event in one piece', () => {
		const data = Array.from({ length: 65_536 }, (_, i) => i % 128);
		const input: FileInput = {
			format: 0,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [{ events: [{ tick: 0, event: { type: 'sysex', data } }] }]
		};
		expect(readMidiFile(encodeMidiFile(input)).tracks[0].events[0].event).toEqual({
			type: 'sysex',
			data
		});
	});

	it('refuses a status byte inside SysEx data', () => {
		expect(formatError(() => eventsOf([0x00, 0xf0, 0x03, 0x43, 0x80, 0xf7])).message).toMatch(
			/SysEx event contains/
		);
	});

	it('writes SysEx and escapes, and stores System Real Time as an escape', () => {
		const input: FileInput = {
			format: 0,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [
				{
					events: [
						{ tick: 0, event: { type: 'sysex', data: [0x7e, 0x7f, 0x06, 0x01] } },
						{ tick: 1, event: { type: 'escape', data: [0xfa] } },
						{ tick: 2, event: { type: 'clock' } }
					]
				}
			]
		};
		const back = readMidiFile(encodeMidiFile(input)).tracks[0].events.map((e) => e.event);
		expect(back).toEqual([
			{ type: 'sysex', data: [0x7e, 0x7f, 0x06, 0x01] },
			{ type: 'escape', data: [0xfa] },
			{ type: 'escape', data: [0xf8] },
			endOfTrackMeta()
		]);
	});
});

describe('System messages inside a track', () => {
	it('accepts defined System Common and Real Time messages, which cancel running status', () => {
		const events = eventsOf([0x00, 0xf2, 0x01, 0x02, 0x00, 0xf8, ...EOT]);
		expect(events.map((e) => e.event.type)).toEqual(['songPosition', 'clock', 'meta']);
		expect(() => eventsOf([0x00, 0x90, 60, 1, 0x00, 0xf8, 0x00, 62, 1])).toThrow(SmfFormatError);
	});

	it('refuses undefined status bytes, which cannot be skipped safely', () => {
		expect(formatError(() => eventsOf([0x00, 0xf4, ...EOT])).message).toMatch(
			/undefined status byte 0xf4/
		);
	});

	it('refuses a data byte of 0x80 or more inside a MIDI event', () => {
		expect(formatError(() => eventsOf([0x00, 0x90, 60, 0x90])).message).toMatch(
			/data byte of 0x80/
		);
	});
});

describe('meta events', () => {
	const metaOf = (type: number, ...data: number[]) =>
		eventsOf([0x00, 0xff, type, data.length, ...data, ...EOT])[0].event;

	it('decodes numbers, prefixes and signatures', () => {
		expect(metaOf(0x00, 0x00, 0x07)).toMatchObject({ name: 'Sequence Number', sequenceNumber: 7 });
		expect(metaOf(0x20, 0x03)).toMatchObject({ name: 'Channel Prefix', channelPrefix: 3 });
		expect(metaOf(0x21, 0x02)).toMatchObject({ name: 'Port', port: 2 });
		expect(metaOf(0x58, 3, 2, 24, 8)).toMatchObject({
			timeSignature: {
				numerator: 3,
				denominator: 4,
				clocksPerClick: 24,
				thirtySecondsPerQuarter: 8
			}
		});
		expect(metaOf(0x58, 6, 3)).toMatchObject({
			timeSignature: {
				numerator: 6,
				denominator: 8,
				clocksPerClick: 24,
				thirtySecondsPerQuarter: 8
			}
		});
		expect(metaOf(0x59, 0xfd, 1)).toMatchObject({ keySignature: { sharps: -3, minor: true } });
		expect(metaOf(0x59, 2, 0)).toMatchObject({ keySignature: { sharps: 2, minor: false } });
		expect(metaOf(0x51, 0x07, 0xa1, 0x20)).toMatchObject({ usPerQuarter: 500_000, tempo: 120 });
	});

	it('leaves malformed optional fields undecoded rather than guessing', () => {
		expect(metaOf(0x00, 0x07)).not.toHaveProperty('sequenceNumber');
		expect(metaOf(0x20, 0x10)).not.toHaveProperty('channelPrefix');
		expect(metaOf(0x21)).not.toHaveProperty('port');
		expect(metaOf(0x58, 4)).not.toHaveProperty('timeSignature');
		expect(metaOf(0x59, 0x08, 0)).not.toHaveProperty('keySignature');
		expect(metaOf(0x59, 0x00, 2)).not.toHaveProperty('keySignature');
		expect(metaOf(0x59, 0x00)).not.toHaveProperty('keySignature');
	});

	it('refuses a broken tempo, because every later tick depends on it', () => {
		expect(formatError(() => metaOf(0x51, 0x07, 0xa1)).message).toMatch(/needs 3 data bytes/);
		expect(formatError(() => metaOf(0x51, 0, 0, 0)).message).toMatch(/0 µs/);
	});

	it('decodes text as UTF-8 when it is, and as Latin-1 when it is not', () => {
		expect(metaOf(0x03, ...Array.from(new TextEncoder().encode('Café')))).toMatchObject({
			name: 'Track Name',
			text: 'Café',
			textEncoding: 'utf-8'
		});
		expect(metaOf(0x01, 0x43, 0x61, 0x66, 0xe9)).toMatchObject({
			text: 'Café',
			textEncoding: 'latin-1'
		});
	});

	it('names every kind, including reserved text types and unknown ones', () => {
		expect(metaOf(0x0a, 0x41)).toMatchObject({ name: 'Text', text: 'A' });
		expect(metaOf(0x60, 0x01)).toMatchObject({ name: 'Meta 0x60' });
		expect(metaOf(0x7f, 0x00, 0x20, 0x76)).toMatchObject({ name: 'Sequencer Specific' });
	});

	it('takes the first Track Name as the track name', () => {
		const file = readMidiFile(
			smf(0, PPQ_96, [0x00, 0xff, 0x03, 0x01, 0x41, 0x00, 0xff, 0x03, 0x01, 0x42, ...EOT])
		);
		expect(file.tracks[0].name).toBe('A');
	});

	it('builds tempo, time signature, text and End of Track events', () => {
		expect(tempoMeta(120).data).toEqual([0x07, 0xa1, 0x20]);
		expect(timeSignatureMeta(6, 8).data).toEqual([6, 3, 24, 8]);
		expect(textMeta(0x03, 'Lead')).toMatchObject({ name: 'Track Name', data: ascii('Lead') });
		expect(endOfTrackMeta()).toEqual({
			type: 'meta',
			subtype: 0x2f,
			name: 'End of Track',
			data: []
		});
	});

	it('refuses what the events cannot hold', () => {
		expect(() => textMeta(0x10, 'x')).toThrow(MidiRangeError);
		expect(() => tempoMeta(0)).toThrow(MidiRangeError);
		expect(() => tempoMeta(3)).toThrow(MidiRangeError); // 20 s per beat overflows 24 bits
		expect(() => tempoMeta(Number.POSITIVE_INFINITY)).toThrow(MidiRangeError);
		expect(() => timeSignatureMeta(4, 3)).toThrow(/power of two/);
		expect(() => timeSignatureMeta(4, 256)).toThrow(MidiRangeError);
		expect(() => timeSignatureMeta(0, 4)).toThrow(MidiRangeError);
		expect(() => timeSignatureMeta(4, 4, 256)).toThrow(MidiRangeError);
		expect(() => timeSignatureMeta(4, 4, 24, 0)).toThrow(MidiRangeError);
	});
});

describe('track boundaries', () => {
	it('stops at End of Track and ignores what follows it in the chunk', () => {
		expect(eventsOf([...EOT, 0x00, 0x90, 60, 100])).toEqual([
			{ delta: 0, tick: 0, event: endOfTrackMeta() }
		]);
	});

	it('accepts a track without End of Track', () => {
		expect(eventsOf([0x00, 0x90, 60, 100]).map((e) => e.event.type)).toEqual(['noteOn']);
	});

	it('keeps the length a track declares with its End of Track when re-encoding', () => {
		const loop: FileInput = {
			format: 0,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [
				{ events: [note(0, 60, 100), note(48, 60, 0), { tick: 384, event: endOfTrackMeta() }] }
			]
		};
		const once = readMidiFile(encodeMidiFile(loop));
		const twice = readMidiFile(encodeMidiFile(once));
		for (const file of [once, twice]) {
			const last = file.tracks[0].events.at(-1);
			expect(last).toEqual({ delta: 336, tick: 384, event: endOfTrackMeta() });
			expect(file.tracks[0].events).toHaveLength(3);
		}
	});
});

describe('corrupt and truncated files', () => {
	it('throws SmfFormatError for every truncation of a valid file', () => {
		const bytes = writeMidiFile([{ name: 'Lead', events: [note(0, 60, 100), note(480, 60, 0)] }]);
		for (let length = 0; length < bytes.length; length++) {
			const err = formatError(() => readMidiFile(bytes.slice(0, length)));
			expect(err.name).toBe('SmfFormatError');
			expect(err.offset).toBeGreaterThanOrEqual(0);
		}
	});

	it('checks events against the end of their own chunk', () => {
		expect(formatError(() => eventsOf([0x00, 0xff, 0x03, 0x10, 0x41])).message).toMatch(
			/ends inside a meta event/
		);
		expect(formatError(() => eventsOf([0x00, 0xff])).message).toMatch(/ends inside a meta event/);
		expect(formatError(() => eventsOf([0x00, 0xff, 0x03])).message).toMatch(
			/ends before a meta event length/
		);
		expect(formatError(() => eventsOf([0x81])).message).toMatch(/variable-length number/);
		expect(formatError(() => eventsOf([0x00, 0x90, 60])).message).toMatch(
			/ends inside a MIDI event/
		);
		expect(formatError(() => eventsOf([0x00, 0xf0, 0x05, 0x01])).message).toMatch(
			/ends inside a SysEx event/
		);
	});

	it('names what is wrong with a header', () => {
		expect(formatError(() => readMidiFile(Uint8Array.from(ascii('RIFF....')))).message).toMatch(
			/not a Standard MIDI File/
		);
		const withHeader = (header: number[]) => Uint8Array.from(chunk('MThd', header));
		expect(formatError(() => readMidiFile(withHeader([0, 1, 0, 0]))).message).toMatch(/at least 6/);
		expect(formatError(() => readMidiFile(withHeader([0, 3, 0, 0, 0, 96]))).message).toMatch(
			/unknown SMF format 3/
		);
		expect(formatError(() => readMidiFile(withHeader([0, 0, 0, 0, 0, 0]))).message).toMatch(
			/0 ticks per quarter/
		);
		expect(formatError(() => readMidiFile(withHeader([0, 0, 0, 0, 0xe9, 0x28]))).message).toMatch(
			/unsupported SMPTE/
		);
		expect(formatError(() => readMidiFile(withHeader([0, 0, 0, 0, 0xe7, 0x00]))).message).toMatch(
			/unsupported SMPTE/
		);
	});

	it('notices missing tracks and chunks that run past the end of the file', () => {
		const one = smf(1, PPQ_96, EOT);
		const claimsTwo = Uint8Array.from(one);
		claimsTwo[11] = 2;
		expect(formatError(() => readMidiFile(claimsTwo)).message).toMatch(/after 1 of 2 track chunks/);
		const overlong = Uint8Array.from(one);
		overlong[21] = 0x40;
		expect(formatError(() => readMidiFile(overlong)).message).toMatch(
			/ends inside the "MTrk" chunk/
		);
	});

	it('skips unknown chunk types and extra header bytes, as the specification asks', () => {
		const header = chunk('MThd', [0, 0, 0, 1, 0, 96, 0xaa, 0xbb]);
		const bytes = Uint8Array.from([
			...header,
			...chunk('XFIH', [1, 2, 3]),
			...chunk('MTrk', [0x00, 0x90, 60, 1, ...EOT])
		]);
		const file = readMidiFile(bytes);
		expect(file.tracks).toHaveLength(1);
		expect(file.tracks[0].events[0].event.type).toBe('noteOn');
	});

	it('reads a header-only file with no tracks', () => {
		const empty = readMidiFile(Uint8Array.from(chunk('MThd', [0, 1, 0, 0, 0, 96])));
		expect(empty.tracks).toEqual([]);
		expect(summarise(empty)).toMatchObject({ trackCount: 0, tempo: 120, durationSeconds: 0 });
		expect(summarise({ ...empty, format: 2 }).tempo).toBe(120);
	});
});

describe('writing validates what it writes', () => {
	const one = (
		events: EventAtTick[],
		division: FileInput['division'] = { kind: 'ppq', ticksPerQuarter: 96 }
	): FileInput => ({
		format: 0,
		division,
		tracks: [{ events }]
	});

	it('refuses channel 16 and other invalid messages', () => {
		expect(() =>
			encodeMidiFile(
				one([{ tick: 0, event: { type: 'noteOn', channel: 16, note: 60, velocity: 1 } }])
			)
		).toThrow(/noteOn\.channel/);
		expect(() =>
			encodeMidiFile(one([{ tick: 0, event: { type: 'unknown', bytes: [0xf4] } }]))
		).toThrow(MidiRangeError);
	});

	it('refuses bad ticks, meta and escape bytes', () => {
		expect(() => encodeMidiFile(one([note(-1, 60, 1)]))).toThrow(/events\[0\]\.tick/);
		expect(() => encodeMidiFile(one([note(VLQ_MAX + 1, 60, 1)]))).toThrow(
			/delta time holds 28 bits/
		);
		expect(() =>
			encodeMidiFile(one([{ tick: 0, event: { type: 'meta', subtype: 0x80, name: '', data: [] } }]))
		).toThrow(MidiRangeError);
		expect(() =>
			encodeMidiFile(
				one([{ tick: 0, event: { type: 'meta', subtype: 0x01, name: '', data: [256] } }])
			)
		).toThrow(MidiRangeError);
		expect(() => encodeMidiFile(one([{ tick: 0, event: { type: 'escape', data: [-1] } }]))).toThrow(
			MidiRangeError
		);
	});

	it('refuses impossible headers', () => {
		expect(() => encodeMidiFile({ ...one([]), format: 3 as 0 })).toThrow(/0, 1 or 2/);
		expect(() => encodeMidiFile({ ...one([]), tracks: [{ events: [] }, { events: [] }] })).toThrow(
			/format 0 is one track/
		);
		expect(() => encodeMidiFile({ ...one([]), format: 1, tracks: [] })).toThrow(MidiRangeError);
		expect(() => encodeMidiFile(one([], { kind: 'ppq', ticksPerQuarter: 0 }))).toThrow(
			MidiRangeError
		);
		expect(() => encodeMidiFile(one([], { kind: 'ppq', ticksPerQuarter: 0x8000 }))).toThrow(
			MidiRangeError
		);
		expect(() =>
			encodeMidiFile(one([], { kind: 'smpte', framesPerSecond: 23 as 24, ticksPerFrame: 40 }))
		).toThrow(/24, 25, 29.97 or 30/);
		expect(() =>
			encodeMidiFile(one([], { kind: 'smpte', framesPerSecond: 25, ticksPerFrame: 0 }))
		).toThrow(MidiRangeError);
	});

	it('writes SMPTE divisions that read back the same', () => {
		for (const framesPerSecond of [24, 25, 29.97, 30] as const) {
			const division = { kind: 'smpte', framesPerSecond, ticksPerFrame: 40 } as const;
			expect(readMidiFile(encodeMidiFile(one([], division))).division).toEqual(division);
		}
	});

	it('refuses writeMidiFile options that would corrupt the conductor track', () => {
		expect(() => writeMidiFile([], { bpm: 0 })).toThrow(MidiRangeError);
		expect(() => writeMidiFile([], { timeSignature: [4, 3] })).toThrow(/power of two/);
		expect(() => writeMidiFile([], { division: 0 })).toThrow(MidiRangeError);
	});

	it('names parts without doubling an existing Track Name', () => {
		const named = {
			name: 'Bass',
			events: [{ tick: 0, event: textMeta(0x03, 'Keep') }, note(0, 40, 1)]
		};
		const file = readMidiFile(writeMidiFile([named, { name: 'Lead', events: [note(0, 60, 1)] }]));
		expect(file.tracks.map((t) => t.name)).toEqual([undefined, 'Keep', 'Lead']);
		expect(
			file.tracks[1].events.filter((e) => isMeta(e.event) && e.event.subtype === 0x03)
		).toHaveLength(1);
	});
});

describe('analysis', () => {
	it('reports the first time signature, and 4/4 when there is none', () => {
		const input: FileInput = {
			format: 1,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [
				{ events: [{ tick: 384, event: timeSignatureMeta(6, 8) }] },
				{ events: [{ tick: 0, event: timeSignatureMeta(3, 4) }] }
			]
		};
		expect(summarise(input).timeSignature).toBe('3/4');
		expect(summarise({ ...input, tracks: [{ events: [] }] }).timeSignature).toBe('4/4');
	});

	it('flattens tracks into playback order, leaving meta and escape events out', () => {
		const input: FileInput = {
			format: 1,
			division: { kind: 'ppq', ticksPerQuarter: 96 },
			tracks: [
				{
					events: [
						{ tick: 0, event: tempoMeta(60) },
						{ tick: 0, event: { type: 'escape', data: [0xfa] } }
					]
				},
				{ events: [note(96, 60, 1), note(192, 60, 0)] },
				{ events: [note(0, 64, 1), note(96, 64, 0)] }
			]
		};
		const flat = flatten(input);
		expect(
			flat.map((e) => [
				e.track,
				e.tick,
				e.ms,
				(e.message as Extract<MidiMessage, { note: number }>).note
			])
		).toEqual([
			[2, 0, 0, 64],
			[1, 96, 1000, 60],
			[2, 96, 1000, 64],
			[1, 192, 2000, 60]
		]);
		expect(summarise(input)).toMatchObject({ eventCount: 6, noteCount: 2, channelsUsed: [0] });
		const withSysEx = {
			...input,
			tracks: [
				...input.tracks,
				{ events: [{ tick: 0, event: { type: 'sysex' as const, data: [0x7d] } }] }
			]
		};
		expect(summarise(withSysEx)).toMatchObject({ eventCount: 7, channelsUsed: [0] });
	});
});
