// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/messages.spec.ts
import { describe, expect, it } from 'vitest';
import {
	assertValid,
	bendToUnit,
	binary,
	ch1,
	clamp7,
	combine14,
	dataByteCount,
	describe as describeMessage,
	encode,
	family,
	hex,
	hexBytes,
	isChannelMessage,
	isRealTime,
	magnitude,
	parse,
	RunningStatusParser,
	shortLabel,
	split14,
	unitToBend,
	type DescribeProfile,
	type MidiMessage
} from './messages';
import { MidiRangeError } from './validate';

const bytes = (...b: number[]) => Uint8Array.from(b);

const samples: Array<[string, number[], MidiMessage]> = [
	['note on', [0x90, 60, 100], { type: 'noteOn', channel: 0, note: 60, velocity: 100 }],
	['note off', [0x85, 60, 64], { type: 'noteOff', channel: 5, note: 60, velocity: 64 }],
	[
		'control change',
		[0xb2, 74, 96],
		{ type: 'controlChange', channel: 2, controller: 74, value: 96 }
	],
	['program change', [0xcf, 40], { type: 'programChange', channel: 15, program: 40 }],
	['channel pressure', [0xd0, 88], { type: 'channelAftertouch', channel: 0, pressure: 88 }],
	['poly pressure', [0xa1, 60, 20], { type: 'polyAftertouch', channel: 1, note: 60, pressure: 20 }],
	['pitch bend centre', [0xe0, 0x00, 0x40], { type: 'pitchBend', channel: 0, value: 8192 }],
	['clock', [0xf8], { type: 'clock' }],
	['song position', [0xf2, 0x10, 0x02], { type: 'songPosition', beats: combine14(2, 0x10) }],
	['song select', [0xf3, 5], { type: 'songSelect', song: 5 }],
	['MTC quarter frame', [0xf1, 0x35], { type: 'mtcQuarterFrame', messageType: 3, value: 5 }],
	['tune request', [0xf6], { type: 'tuneRequest' }],
	['start', [0xfa], { type: 'start' }],
	['continue', [0xfb], { type: 'continue' }],
	['stop', [0xfc], { type: 'stop' }],
	['active sensing', [0xfe], { type: 'activeSensing' }],
	['reset', [0xff], { type: 'reset' }],
	['sysex', [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7], { type: 'sysex', data: [0x7e, 0x7f, 6, 1] }]
];

describe('parse and encode', () => {
	for (const [name, wire, message] of samples) {
		it(`parses ${name}`, () => expect(parse(wire)).toEqual(message));
		it(`encodes ${name}`, () => expect(encode(message)).toEqual(Uint8Array.from(wire)));
	}

	it('parses a Uint8Array as well as an array', () => {
		expect(parse(bytes(0x90, 60, 100))).toEqual(samples[0][2]);
	});

	it('treats a velocity-zero Note On as a Note Off', () => {
		expect(parse([0x90, 60, 0])).toEqual({ type: 'noteOff', channel: 0, note: 60, velocity: 0 });
	});

	it('sends pitch bend LSB first', () => {
		// 8192 + 1 → MSB 64, LSB 1. The fine byte goes on the wire first.
		expect(encode({ type: 'pitchBend', channel: 0, value: 8193 })).toEqual(bytes(0xe0, 1, 64));
	});

	it('round-trips sysex without its framing bytes', () => {
		const msg = parse([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
		expect(msg).toEqual({ type: 'sysex', data: [0x7e, 0x7f, 0x06, 0x01] });
		expect(encode(msg)).toEqual(bytes(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7));
	});

	it('encodes a velocity-zero Note On as written; it reads back as a Note Off', () => {
		const wire = encode({ type: 'noteOn', channel: 3, note: 60, velocity: 0 });
		expect(wire).toEqual(bytes(0x93, 60, 0));
		expect(parse(wire).type).toBe('noteOff');
	});
});

describe('parse never guesses', () => {
	const unknown = (b: number[]) => ({ type: 'unknown', bytes: b });

	it('returns unknown for empty input and stray data bytes', () => {
		expect(parse([])).toEqual(unknown([]));
		expect(parse([60, 100])).toEqual(unknown([60, 100]));
		expect(parse([300])).toEqual(unknown([300]));
	});

	it('returns unknown for a truncated message instead of filling zeros', () => {
		// MIDI Lab read this as a Note Off with velocity 0.
		expect(parse([0x90, 60])).toEqual(unknown([0x90, 60]));
		expect(parse([0xc0])).toEqual(unknown([0xc0]));
		expect(parse([0xf2, 1])).toEqual(unknown([0xf2, 1]));
	});

	it('returns unknown for extra bytes and for data bytes of 0x80 or more', () => {
		expect(parse([0x90, 60, 100, 1]).type).toBe('unknown');
		expect(parse([0x90, 0x80, 100]).type).toBe('unknown');
		expect(parse([0xb0, 7, 200]).type).toBe('unknown');
		expect(parse([0xf8, 0]).type).toBe('unknown');
	});

	it('returns unknown for undefined status bytes and a lone End Of Exclusive', () => {
		for (const status of [0xf4, 0xf5, 0xf7, 0xf9, 0xfd]) {
			expect(parse([status]).type).toBe('unknown');
		}
	});

	it('returns unknown for an unterminated or corrupted SysEx', () => {
		expect(parse([0xf0, 0x7e, 0x7f]).type).toBe('unknown');
		expect(parse([0xf0]).type).toBe('unknown');
		expect(parse([0xf0, 0xf7]).type).toBe('unknown');
		expect(parse([0xf0, 0x43, 0x90, 0xf7]).type).toBe('unknown');
	});
});

describe('encode refuses what it cannot send', () => {
	it('refuses channel 16 instead of turning a Note Off into a Note On on channel 1', () => {
		// MIDI Lab computed 0x80 | 16 = 0x90.
		expect(() => encode({ type: 'noteOff', channel: 16, note: 60, velocity: 0 })).toThrow(
			MidiRangeError
		);
		expect(() => encode({ type: 'noteOff', channel: 16, note: 60, velocity: 0 })).toThrow(
			/noteOff\.channel must be an integer 0–15, got 16 \(wire channels are 0–15; humans count 1–16\)/
		);
	});

	it('refuses channel 16 on every channel message', () => {
		const onSixteen: MidiMessage[] = [
			{ type: 'noteOn', channel: 16, note: 60, velocity: 100 },
			{ type: 'polyAftertouch', channel: 16, note: 60, pressure: 1 },
			{ type: 'controlChange', channel: 16, controller: 7, value: 100 },
			{ type: 'programChange', channel: 16, program: 1 },
			{ type: 'channelAftertouch', channel: 16, pressure: 1 },
			{ type: 'pitchBend', channel: 16, value: 8192 }
		];
		for (const msg of onSixteen) {
			expect(() => encode(msg)).toThrow(new RegExp(`^${msg.type}\\.channel must be`));
		}
	});

	it('refuses negative and fractional channels', () => {
		expect(() => encode({ type: 'programChange', channel: -1, program: 0 })).toThrow(
			MidiRangeError
		);
		expect(() => encode({ type: 'programChange', channel: 1.5, program: 0 })).toThrow(
			MidiRangeError
		);
	});

	it('refuses data values above 127 rather than clamping them', () => {
		const bad: Array<[MidiMessage, string]> = [
			[{ type: 'noteOn', channel: 0, note: 128, velocity: 1 }, 'noteOn.note'],
			[{ type: 'noteOn', channel: 0, note: 60, velocity: 130 }, 'noteOn.velocity'],
			[{ type: 'polyAftertouch', channel: 0, note: -1, pressure: 1 }, 'polyAftertouch.note'],
			[{ type: 'polyAftertouch', channel: 0, note: 1, pressure: 128 }, 'polyAftertouch.pressure'],
			[
				{ type: 'controlChange', channel: 0, controller: 128, value: 0 },
				'controlChange.controller'
			],
			[{ type: 'controlChange', channel: 0, controller: 7, value: 0.5 }, 'controlChange.value'],
			[{ type: 'programChange', channel: 0, program: 128 }, 'programChange.program'],
			[{ type: 'channelAftertouch', channel: 0, pressure: 999 }, 'channelAftertouch.pressure'],
			[{ type: 'pitchBend', channel: 0, value: 16384 }, 'pitchBend.value'],
			[{ type: 'songPosition', beats: -1 }, 'songPosition.beats'],
			[{ type: 'songSelect', song: 128 }, 'songSelect.song'],
			[{ type: 'mtcQuarterFrame', messageType: 8, value: 0 }, 'mtcQuarterFrame.messageType'],
			[{ type: 'mtcQuarterFrame', messageType: 0, value: 16 }, 'mtcQuarterFrame.value']
		];
		for (const [msg, field] of bad) {
			let caught: unknown;
			try {
				encode(msg);
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeInstanceOf(MidiRangeError);
			expect((caught as MidiRangeError).field).toBe(field);
		}
	});

	it('refuses a SysEx payload byte of 0x80 or more', () => {
		expect(() => encode({ type: 'sysex', data: [0x43, 0x80, 0x01] })).toThrow(
			/^sysex\.data\[1\] must be an integer 0–127, got 128$/
		);
		expect(() => encode({ type: 'sysex', data: [0xf7] })).toThrow(MidiRangeError);
	});

	it('refuses an empty SysEx payload', () => {
		expect(() => encode({ type: 'sysex', data: [] })).toThrow(/at least one data byte/);
	});

	it('refuses to re-encode unknown bytes', () => {
		expect(() => encode(parse([0x90, 60]))).toThrow(/do not form a valid message/);
	});

	it('refuses a message type it does not know', () => {
		const bogus = { type: 'noteBlast', channel: 0 } as unknown as MidiMessage;
		expect(() => encode(bogus)).toThrow(/^type must be a MIDI message type, got "noteBlast"$/);
	});

	it('exposes the same checks as assertValid', () => {
		expect(() => assertValid({ type: 'clock' })).not.toThrow();
		expect(() =>
			assertValid({ type: 'noteOn', channel: 0, note: 60, velocity: 100 })
		).not.toThrow();
		expect(() => assertValid({ type: 'noteOn', channel: 16, note: 60, velocity: 1 })).toThrow(
			MidiRangeError
		);
	});
});

describe('14-bit and bend helpers', () => {
	it('splits and recombines', () => {
		for (const v of [0, 1, 8191, 8192, 8193, 16383]) {
			const { msb, lsb } = split14(v);
			expect(combine14(msb, lsb)).toBe(v);
		}
	});

	it('refuses values that do not fit instead of clamping them', () => {
		expect(() => split14(16384)).toThrow(MidiRangeError);
		expect(() => split14(-1)).toThrow(MidiRangeError);
		expect(() => split14(1.5)).toThrow(MidiRangeError);
		expect(() => combine14(128, 0)).toThrow(MidiRangeError);
		expect(() => combine14(0, 128)).toThrow(MidiRangeError);
	});

	it('maps bend to a signed unit range with an exact centre', () => {
		expect(bendToUnit(8192)).toBe(0);
		expect(bendToUnit(16383)).toBeCloseTo(1, 5);
		expect(bendToUnit(0)).toBeCloseTo(-1, 5);
		expect(unitToBend(0)).toBe(8192);
		expect(unitToBend(1)).toBe(16383);
		expect(unitToBend(-1)).toBe(0);
	});

	it('refuses a bend outside −1…+1', () => {
		expect(() => unitToBend(1.01)).toThrow(MidiRangeError);
		expect(() => unitToBend(Number.NaN)).toThrow(MidiRangeError);
		expect(() => bendToUnit(16384)).toThrow(MidiRangeError);
	});

	it('clamps for UI controls, which is the only place clamping belongs', () => {
		expect(clamp7(-5)).toBe(0);
		expect(clamp7(64.4)).toBe(64);
		expect(clamp7(300)).toBe(127);
	});
});

describe('formatting helpers', () => {
	it('formats hex and binary, and marks anything that is not a byte', () => {
		expect(hex(0x0a)).toBe('0A');
		expect(hex(0xf0, true)).toBe('0xF0');
		expect(hex(256)).toBe('??');
		expect(hexBytes([0x90, 60, 100])).toBe('90 3C 64');
		expect(hexBytes([1, -1])).toBe('01 ??');
		expect(binary(0x90)).toBe('10010000');
		expect(binary(1.5)).toBe('????????');
	});
});

describe('message helpers', () => {
	it('numbers channels for humans only on the display path', () => {
		expect(ch1({ type: 'noteOn', channel: 15, note: 1, velocity: 1 })).toBe(16);
		expect(ch1({ type: 'clock' })).toBeNull();
	});

	it('tells channel and real-time messages apart', () => {
		expect(isChannelMessage({ type: 'programChange', channel: 0, program: 0 })).toBe(true);
		expect(isChannelMessage({ type: 'start' })).toBe(false);
		for (const type of ['clock', 'start', 'continue', 'stop', 'activeSensing', 'reset'] as const) {
			expect(isRealTime({ type })).toBe(true);
		}
		expect(isRealTime({ type: 'songPosition', beats: 0 })).toBe(false);
	});

	it('counts data bytes for every kind of status', () => {
		expect(dataByteCount(0x90)).toBe(2);
		expect(dataByteCount(0xc3)).toBe(1);
		expect(dataByteCount(0xd0)).toBe(1);
		expect(dataByteCount(0xe0)).toBe(2);
		expect(dataByteCount(0xf0)).toBe(-1);
		expect(dataByteCount(0xf1)).toBe(1);
		expect(dataByteCount(0xf2)).toBe(2);
		expect(dataByteCount(0xf3)).toBe(1);
		expect(dataByteCount(0xf4)).toBe(0);
		expect(dataByteCount(0xf7)).toBe(0);
		expect(dataByteCount(0xf8)).toBe(0);
		expect(dataByteCount(0x40)).toBe(0);
	});

	it('gives magnitudes to the messages that carry one', () => {
		expect(magnitude({ type: 'noteOn', channel: 0, note: 1, velocity: 90 })?.value).toBe(90);
		expect(magnitude({ type: 'noteOff', channel: 0, note: 1, velocity: 9 })).toEqual({
			value: 9,
			max: 127
		});
		expect(magnitude({ type: 'controlChange', channel: 0, controller: 1, value: 5 })?.value).toBe(
			5
		);
		expect(magnitude({ type: 'channelAftertouch', channel: 0, pressure: 7 })?.value).toBe(7);
		expect(magnitude({ type: 'polyAftertouch', channel: 0, note: 1, pressure: 8 })?.value).toBe(8);
		expect(magnitude({ type: 'pitchBend', channel: 0, value: 100 })).toEqual({
			value: 100,
			max: 16383,
			centre: 8192
		});
		expect(magnitude({ type: 'clock' })).toBeNull();
	});
});

describe('running status', () => {
	it('reuses the previous status byte', () => {
		const p = new RunningStatusParser();
		expect(p.push([0x90, 60, 100, 64, 96, 67, 92])).toEqual([
			{ type: 'noteOn', channel: 0, note: 60, velocity: 100 },
			{ type: 'noteOn', channel: 0, note: 64, velocity: 96 },
			{ type: 'noteOn', channel: 0, note: 67, velocity: 92 }
		]);
	});

	it('lets real-time bytes interleave mid-message', () => {
		const p = new RunningStatusParser();
		expect(p.push([0x90, 60, 0xf8, 100])).toEqual([
			{ type: 'clock' },
			{ type: 'noteOn', channel: 0, note: 60, velocity: 100 }
		]);
	});

	it('survives being fed one byte at a time', () => {
		const p = new RunningStatusParser();
		const out = [0xb0, 7, 127].flatMap((b) => p.push([b]));
		expect(out).toEqual([{ type: 'controlChange', channel: 0, controller: 7, value: 127 }]);
	});

	it('collects a sysex block, even with real-time bytes inside it', () => {
		const p = new RunningStatusParser();
		expect(p.push([0xf0, 0x43, 0xf8, 0x10, 0xf7])).toEqual([
			{ type: 'clock' },
			{ type: 'sysex', data: [0x43, 0x10] }
		]);
	});

	it('ends a sysex at any other status byte, which then counts as itself', () => {
		const p = new RunningStatusParser();
		expect(p.push([0xf0, 0x43, 0x10, 0x90, 60, 100])).toEqual([
			{ type: 'sysex', data: [0x43, 0x10] },
			{ type: 'noteOn', channel: 0, note: 60, velocity: 100 }
		]);
	});

	it('cancels running status after a sysex and after system common messages', () => {
		const p = new RunningStatusParser();
		expect(p.push([0x90, 60, 100, 0xf0, 0x7d, 0xf7, 61, 100])).toEqual([
			{ type: 'noteOn', channel: 0, note: 60, velocity: 100 },
			{ type: 'sysex', data: [0x7d] }
		]);
		expect(p.push([0x90, 60, 100, 0xf2, 1, 2, 64, 90])).toEqual([
			{ type: 'noteOn', channel: 0, note: 60, velocity: 100 },
			{ type: 'songPosition', beats: combine14(2, 1) }
		]);
	});

	it('handles one-byte system messages and undefined statuses', () => {
		const p = new RunningStatusParser();
		expect(p.push([0xf6, 0xf4, 0xf7])).toEqual([
			{ type: 'tuneRequest' },
			{ type: 'unknown', bytes: [0xf4] },
			{ type: 'unknown', bytes: [0xf7] }
		]);
	});

	it('drops data bytes that arrive before any status byte', () => {
		const p = new RunningStatusParser();
		expect(p.push([60, 100, 0xc0, 5])).toEqual([{ type: 'programChange', channel: 0, program: 5 }]);
	});

	it('forgets everything on reset', () => {
		const p = new RunningStatusParser();
		p.push([0x90, 60]);
		p.reset();
		expect(p.push([100, 64, 90])).toEqual([]);
		p.push([0xf0, 1]);
		p.reset();
		expect(p.push([2, 0xf7])).toEqual([{ type: 'unknown', bytes: [0xf7] }]);
	});
});

describe('families', () => {
	it('puts channel mode messages with the system group, not with controllers', () => {
		expect(family(parse([0xb0, 74, 10]))).toBe('cc');
		expect(family(parse([0xb0, 123, 0]))).toBe('common');
	});

	it('groups every other kind', () => {
		expect(family(parse([0x90, 60, 1]))).toBe('note');
		expect(family(parse([0x80, 60, 1]))).toBe('note');
		expect(family(parse([0xe0, 0, 64]))).toBe('expr');
		expect(family(parse([0xa0, 60, 1]))).toBe('expr');
		expect(family(parse([0xd0, 1]))).toBe('expr');
		expect(family(parse([0xc0, 1]))).toBe('program');
		for (const b of [[0xf8], [0xfa], [0xfb], [0xfc], [0xf2, 0, 0], [0xf1, 0]]) {
			expect(family(parse(b))).toBe('clock');
		}
		expect(family(parse([0xf0, 0x7d, 0xf7]))).toBe('sysex');
		expect(family(parse([0xf6]))).toBe('common');
		expect(family(parse([0xf5]))).toBe('common');
	});
});

describe('descriptions', () => {
	const cc = (controller: number, value: number, channel = 0): MidiMessage => ({
		type: 'controlChange',
		channel,
		controller,
		value
	});
	const opxy: DescribeProfile = {
		ccName: (controller) => (controller === 32 ? 'filter cutoff' : undefined),
		programName: (program) => (program === 3 ? 'axis pad' : undefined),
		noteName: (note, channel) => (channel === 0 && note === 53 ? 'kick' : undefined)
	};

	it('makes no General MIDI assumption about CC 32 by default', () => {
		const text = describeMessage(cc(32, 100));
		expect(text).toBe(
			'Controller 32 set to 100 on channel 1. What it controls is up to the receiving device.'
		);
		expect(text).not.toMatch(/Bank/);
		expect(shortLabel(cc(32, 100))).toBe('CC 32 = 100');
	});

	it('names CC 32 as filter cutoff through an OP-XY-style profile', () => {
		expect(describeMessage(cc(32, 100), { profile: opxy })).toBe(
			'Filter cutoff (CC 32) set to 100 on channel 1.'
		);
		expect(shortLabel(cc(32, 100), { profile: opxy })).toBe('filter cutoff = 100');
		// The profile falls back when it has no name.
		expect(shortLabel(cc(33, 1), { profile: opxy })).toBe('CC 33 = 1');
	});

	it('uses General MIDI wording only when asked', () => {
		expect(describeMessage(cc(32, 5), { gm: true })).toBe('Bank Select fine = 5 on channel 1.');
		expect(shortLabel(cc(32, 5), { gm: true })).toBe('Bank LSB = 5');
		expect(describeMessage(cc(0, 2), { gm: true })).toMatch(/^Bank Select coarse = 2/);
		expect(describeMessage(cc(1, 3), { gm: true })).toBe('Modulation wheel 3 of 127 on channel 1.');
		expect(describeMessage(cc(6, 3), { gm: true })).toMatch(/^Data Entry 3/);
		expect(describeMessage(cc(38, 3), { gm: true })).toBe('Data Entry fine = 3 on channel 1.');
		expect(describeMessage(cc(7, 90), { gm: true })).toMatch(/^Channel volume 90 of 127/);
		expect(describeMessage(cc(11, 90), { gm: true })).toMatch(/^Expression 90 of 127/);
		expect(describeMessage(cc(64, 127), { gm: true })).toMatch(/^Sustain pedal down/);
		expect(describeMessage(cc(64, 0), { gm: true })).toMatch(/^Sustain pedal up/);
		expect(describeMessage(cc(99, 1), { gm: true })).toMatch(/non-registered parameter, coarse/);
		expect(describeMessage(cc(98, 1), { gm: true })).toMatch(/non-registered parameter, fine/);
		expect(describeMessage(cc(101, 0), { gm: true })).toMatch(/registered parameter, coarse/);
		expect(describeMessage(cc(100, 0), { gm: true })).toMatch(/registered parameter, fine/);
		expect(describeMessage(cc(74, 9), { gm: true })).toMatch(/^Cutoff set to 9 of 127.*convention/);
		expect(describeMessage(cc(3, 9), { gm: true })).toMatch(/leaves this one undefined/);
	});

	it('describes pan positions under GM', () => {
		expect(describeMessage(cc(10, 64), { gm: true })).toMatch(/dead centre/);
		expect(describeMessage(cc(10, 0), { gm: true })).toMatch(/100% left/);
		expect(describeMessage(cc(10, 127), { gm: true })).toMatch(/100% right/);
	});

	it('always describes channel mode messages, which no device reassigns', () => {
		expect(describeMessage(cc(120, 0))).toMatch(/^All Sound Off on channel 1/);
		expect(describeMessage(cc(121, 0))).toMatch(/^Reset All Controllers/);
		expect(describeMessage(cc(122, 127))).toMatch(/^Local Control on/);
		expect(describeMessage(cc(122, 0))).toMatch(/^Local Control off/);
		expect(describeMessage(cc(123, 0))).toMatch(/^All Notes Off/);
		expect(describeMessage(cc(124, 0))).toMatch(/^Omni Mode Off/);
		expect(describeMessage(cc(125, 0))).toMatch(/^Omni Mode On/);
		expect(describeMessage(cc(126, 1))).toMatch(/using 1 channel\./);
		expect(describeMessage(cc(126, 4))).toMatch(/using 4 channels\./);
		expect(describeMessage(cc(127, 0))).toMatch(/^Poly Mode On/);
		expect(shortLabel(cc(123, 0))).toBe('All Notes Off = 0');
	});

	it('names programs through the profile, GM on request, and neither by default', () => {
		const pc: MidiMessage = { type: 'programChange', channel: 1, program: 3 };
		expect(describeMessage(pc)).toBe(
			'Switch on channel 2 to program 3 (counting from 0; 4 on devices that count from 1). What that program is depends on the receiving device.'
		);
		expect(describeMessage(pc, { profile: opxy })).toMatch(/: axis pad\.$/);
		expect(describeMessage(pc, { gm: true })).toMatch(/Honky-tonk Piano/);
		expect(shortLabel(pc)).toBe('Program 3');
		expect(shortLabel(pc, { profile: opxy })).toBe('Program 3 · axis pad');
		expect(shortLabel(pc, { gm: true })).toBe('Program 3 · Honky-tonk Piano');
	});

	it('names notes with the octave convention, device names and GM drums on request', () => {
		const on = (note: number, channel = 0): MidiMessage => ({
			type: 'noteOn',
			channel,
			note,
			velocity: 100
		});
		expect(describeMessage(on(60))).toBe(
			'Start playing C4 (note 60) on channel 1, struck at velocity 100, firm.'
		);
		expect(describeMessage(on(60), { octaveConvention: 'c3' })).toMatch(/C3 \(note 60\)/);
		expect(describeMessage(on(53), { profile: opxy })).toMatch(/kick \(note 53\)/);
		expect(describeMessage(on(36, 9))).toMatch(/C2 \(note 36\)/);
		expect(describeMessage(on(36, 9), { gm: true })).toMatch(/Bass Drum 1 \(note 36\)/);
		expect(describeMessage(on(36, 9), { gm: true, drumChannel: null })).toMatch(/C2/);
		expect(describeMessage(on(60), { channel: false })).not.toMatch(/channel/);
		expect(shortLabel(on(53), { profile: opxy })).toBe('kick on · v100');
		expect(
			shortLabel({ type: 'polyAftertouch', channel: 0, note: 53, pressure: 9 }, { profile: opxy })
		).toBe('kick pressure 9');
		expect(shortLabel(on(61))).toBe('C♯4 on · v100');
	});

	it('flavours velocity', () => {
		const at = (velocity: number) =>
			describeMessage({ type: 'noteOn', channel: 0, note: 60, velocity });
		expect(at(10)).toMatch(/barely touched/);
		expect(at(30)).toMatch(/soft\.$/);
		expect(at(64)).toMatch(/moderate/);
		expect(at(127)).toMatch(/hammered/);
	});

	it('describes note offs, pressure and bends', () => {
		expect(describeMessage({ type: 'noteOff', channel: 0, note: 60, velocity: 0 })).toBe(
			'Stop playing C4 (note 60) on channel 1.'
		);
		expect(describeMessage({ type: 'noteOff', channel: 0, note: 60, velocity: 40 })).toMatch(
			/released at velocity 40/
		);
		expect(shortLabel({ type: 'noteOff', channel: 0, note: 60, velocity: 0 })).toBe('C4 off');
		expect(describeMessage({ type: 'polyAftertouch', channel: 0, note: 60, pressure: 5 })).toMatch(
			/this note only/
		);
		expect(shortLabel({ type: 'polyAftertouch', channel: 0, note: 60, pressure: 5 })).toBe(
			'C4 pressure 5'
		);
		expect(describeMessage({ type: 'channelAftertouch', channel: 0, pressure: 5 })).toMatch(
			/every note/
		);
		expect(shortLabel({ type: 'channelAftertouch', channel: 0, pressure: 5 })).toBe('Pressure 5');
		expect(describeMessage({ type: 'pitchBend', channel: 0, value: 8192 })).toMatch(/centre/);
		expect(describeMessage({ type: 'pitchBend', channel: 0, value: 16383 })).toMatch(/up 100%/);
		expect(describeMessage({ type: 'pitchBend', channel: 0, value: 0 })).toMatch(/down 100%/);
		expect(shortLabel({ type: 'pitchBend', channel: 0, value: 8292 })).toBe('Bend +100');
		expect(shortLabel({ type: 'pitchBend', channel: 0, value: 8092 })).toBe('Bend -100');
	});

	it('names the OP-XY in its identity reply as Teenage Engineering', () => {
		const reply = parse([
			0xf0, 0x7e, 0x21, 0x06, 0x02, 0x00, 0x20, 0x76, 0x21, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
			0x00, 0xf7
		]);
		expect(shortLabel(reply)).toBe('SysEx · Identity Reply · Teenage Engineering');
		expect(describeMessage(reply)).toBe(
			'Universal Non-Real Time Identity Reply from Teenage Engineering.'
		);
	});

	it('describes other SysEx', () => {
		const sx = (...data: number[]): MidiMessage => ({ type: 'sysex', data });
		expect(shortLabel(sx(0x7e, 0x7f, 0x06, 0x01))).toBe('SysEx · Identity Request');
		expect(describeMessage(sx(0x7e, 0x7f, 0x06, 0x01))).toMatch(/what are you/);
		expect(shortLabel(sx(0x7f, 0x7f, 0x04, 0x01))).toBe('SysEx · Universal · Device Control');
		expect(shortLabel(sx(0x7e, 0x7f, 0x09, 0x01))).toBe('SysEx · Universal · General MIDI System');
		expect(shortLabel(sx(0x7e, 0x7f, 0x60))).toBe('SysEx · Universal · sub-ID 0x60');
		expect(describeMessage(sx(0x7f, 0x7f, 0x06, 0x02))).toBe(
			'Universal Real Time System Exclusive, MIDI Machine Control Command: 4 bytes between F0 and F7.'
		);
		expect(describeMessage(sx(0x7e, 0x7f, 0x60))).toMatch(/sub-ID 0x60/);
		expect(shortLabel(sx(0x00, 0x20, 0x76, 0x21, 0x40))).toBe(
			'SysEx · Teenage Engineering · 5 data bytes'
		);
		expect(describeMessage(sx(0x41, 0x10))).toMatch(/addressed to Roland Corporation/);
		expect(shortLabel(sx())).toBe('SysEx · empty');
		expect(describeMessage(sx())).toBe('An empty System Exclusive message.');
	});

	it('describes system messages and unknown bytes', () => {
		const cases: Array<[MidiMessage, string, RegExp]> = [
			[{ type: 'songPosition', beats: 8 }, 'Song position 8', /2\.00 beats/],
			[{ type: 'songSelect', song: 2 }, 'Song 2', /^Select song 2\.$/],
			[{ type: 'mtcQuarterFrame', messageType: 3, value: 1 }, 'MTC frame 3', /piece 3 of 8/],
			[{ type: 'clock' }, 'Clock', /Twenty-four/],
			[{ type: 'start' }, 'Start', /very beginning/],
			[{ type: 'continue' }, 'Continue', /resume/],
			[{ type: 'stop' }, 'Stop', /^Stop playback\.$/],
			[{ type: 'activeSensing' }, 'Active Sensing', /heartbeat/],
			[{ type: 'reset' }, 'System Reset', /power-on/],
			[{ type: 'tuneRequest' }, 'Tune Request', /retune/],
			[{ type: 'unknown', bytes: [0x90, 60] }, 'Unrecognised (90 3C)', /90 3C/]
		];
		for (const [msg, label, sentence] of cases) {
			expect(shortLabel(msg)).toBe(label);
			expect(describeMessage(msg)).toMatch(sentence);
		}
	});
});
