// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/messages.ts

/**
 * The MIDI 1.0 message language: a typed union, a parser, a validating encoder and plain-English
 * descriptions. Every monitor row, every agent narration and every byte we send goes through this
 * one type.
 *
 * ## Channel numbering
 * `channel` is always the wire value, 0–15, because that is what is in the byte. Humans count 1–16;
 * display paths go through `ch1()`, byte paths use `channel` directly. Mixing the two is the most
 * common MIDI bug, so they stay lexically distinct instead of relying on care.
 *
 * ## Two boundaries, two attitudes
 * `parse()` never throws: anything that is not a complete, well-formed message comes back as
 * `unknown`, so a monitor can always show what arrived. `encode()` is the opposite boundary. Every
 * field goes through `assertValid()`, and anything out of range throws `MidiRangeError`. Nothing is
 * clamped or masked. In MIDI Lab `channel: 16` became a Note On on channel 1; here it cannot be
 * encoded at all.
 *
 * ## Descriptions make no General MIDI assumptions
 * On the OP-XY CC 32 is filter cutoff, not Bank Select LSB. `describe()` and `shortLabel()` name
 * controllers, programs and drum keys only from a `DescribeProfile` (the device layer supplies one)
 * or when `gm: true` asks for General MIDI wording.
 */

import { GM_DRUMS, gmCcInfo, gmProgramName, manufacturerName } from './constants';
import { DEFAULT_OCTAVE_CONVENTION, noteName, type OctaveConvention } from './notes';
import { universalSubIdName } from './sysex';
import {
	assertChannel,
	assertData14,
	assertData7,
	assertDataBytes,
	assertIntInRange,
	isDataByte,
	isIntInRange,
	MidiRangeError
} from './validate';

/* -------------------------------------------------------------------------- */
/* Status bytes                                                                */
/* -------------------------------------------------------------------------- */

/** Status bytes. Channel statuses carry the channel in their low nibble. */
export const Status = {
	NoteOff: 0x80,
	NoteOn: 0x90,
	PolyAftertouch: 0xa0,
	ControlChange: 0xb0,
	ProgramChange: 0xc0,
	ChannelAftertouch: 0xd0,
	PitchBend: 0xe0,
	SysExStart: 0xf0,
	MtcQuarterFrame: 0xf1,
	SongPosition: 0xf2,
	SongSelect: 0xf3,
	TuneRequest: 0xf6,
	SysExEnd: 0xf7,
	Clock: 0xf8,
	Start: 0xfa,
	Continue: 0xfb,
	Stop: 0xfc,
	ActiveSensing: 0xfe,
	Reset: 0xff
} as const;

/* -------------------------------------------------------------------------- */
/* The message union                                                           */
/* -------------------------------------------------------------------------- */

/** Fields shared by channel messages. */
export interface ChannelScoped {
	/** Wire value 0–15. Display as `channel + 1`. */
	channel: number;
}

/** One MIDI 1.0 message. `unknown` holds bytes that do not form a valid message. */
export type MidiMessage =
	| ({ type: 'noteOn'; note: number; velocity: number } & ChannelScoped)
	| ({ type: 'noteOff'; note: number; velocity: number } & ChannelScoped)
	| ({ type: 'polyAftertouch'; note: number; pressure: number } & ChannelScoped)
	| ({ type: 'controlChange'; controller: number; value: number } & ChannelScoped)
	| ({ type: 'programChange'; program: number } & ChannelScoped)
	| ({ type: 'channelAftertouch'; pressure: number } & ChannelScoped)
	| ({ type: 'pitchBend'; value: number } & ChannelScoped)
	| { type: 'sysex'; data: number[] }
	| { type: 'mtcQuarterFrame'; messageType: number; value: number }
	| { type: 'songPosition'; beats: number }
	| { type: 'songSelect'; song: number }
	| { type: 'tuneRequest' }
	| { type: 'clock' }
	| { type: 'start' }
	| { type: 'continue' }
	| { type: 'stop' }
	| { type: 'activeSensing' }
	| { type: 'reset' }
	| { type: 'unknown'; bytes: number[] };

/** The `type` discriminant of every message. */
export type MessageType = MidiMessage['type'];

/** The messages addressed to a channel. */
export type ChannelMessage = Extract<MidiMessage, ChannelScoped>;

/** Every message `encode()` accepts: all but `unknown`, whose bytes are never re-sent. */
export type EncodableMessage = Exclude<MidiMessage, { type: 'unknown' }>;

/** The seven message families, for grouping and colour in the UI. */
export type MessageFamily = 'note' | 'cc' | 'expr' | 'program' | 'clock' | 'sysex' | 'common';

/** Which family a message belongs to. */
export function family(msg: MidiMessage): MessageFamily {
	switch (msg.type) {
		case 'noteOn':
		case 'noteOff':
			return 'note';
		case 'controlChange':
			// Channel Mode messages (120–127) are structural, not continuous control.
			return msg.controller >= 120 ? 'common' : 'cc';
		case 'pitchBend':
		case 'polyAftertouch':
		case 'channelAftertouch':
			return 'expr';
		case 'programChange':
			return 'program';
		case 'clock':
		case 'start':
		case 'stop':
		case 'continue':
		case 'songPosition':
		case 'mtcQuarterFrame':
			return 'clock';
		case 'sysex':
			return 'sysex';
		default:
			return 'common';
	}
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Human-facing channel number, 1–16, or null for messages without a channel. */
export function ch1(msg: MidiMessage): number | null {
	return 'channel' in msg ? msg.channel + 1 : null;
}

/** True for messages addressed to a channel. */
export function isChannelMessage(msg: MidiMessage): msg is ChannelMessage {
	return 'channel' in msg;
}

/** True for System Real Time messages, which may arrive in the middle of any other message. */
export function isRealTime(msg: MidiMessage): boolean {
	return (
		msg.type === 'clock' ||
		msg.type === 'start' ||
		msg.type === 'continue' ||
		msg.type === 'stop' ||
		msg.type === 'activeSensing' ||
		msg.type === 'reset'
	);
}

/** Combine two 7-bit halves into one 14-bit value (0–16383). Both halves must be 0–127. */
export function combine14(msb: number, lsb: number): number {
	assertData7(msb, 'msb');
	assertData7(lsb, 'lsb');
	return (msb << 7) | lsb;
}

/** Split a 14-bit value (0–16383) into its MSB/LSB halves. */
export function split14(value: number): { msb: number; lsb: number } {
	assertData14(value, 'value');
	return { msb: value >> 7, lsb: value & 0x7f };
}

/**
 * Round and clamp to 0–127. **For UI controls only**, where a drag past the end should stick at the
 * end. Protocol code validates instead (see `assertValid`).
 */
export function clamp7(v: number): number {
	return Math.max(0, Math.min(127, Math.round(v)));
}

/** Pitch bend (0–16383) as a signed −1…+1 float, where 0 is the 8192 centre. */
export function bendToUnit(value: number): number {
	assertData14(value, 'value');
	return value >= 8192 ? (value - 8192) / 8191 : (value - 8192) / 8192;
}

/** A signed −1…+1 bend amount as a 14-bit pitch bend value. Outside −1…+1 throws. */
export function unitToBend(unit: number): number {
	if (!(unit >= -1 && unit <= 1)) {
		throw new MidiRangeError('unit', unit, 'a number from -1 to 1');
	}
	return Math.round(unit >= 0 ? 8192 + unit * 8191 : 8192 + unit * 8192);
}

const isByte = (b: number) => isIntInRange(b, 0, 0xff);

/** A byte as two uppercase hex digits (`?? ` for anything that is not a byte). */
export function hex(byte: number, prefix = false): string {
	const digits = isByte(byte) ? byte.toString(16).toUpperCase().padStart(2, '0') : '??';
	return (prefix ? '0x' : '') + digits;
}

/** Bytes as space-separated hex, e.g. `90 3C 64`. Never throws, so it can show any input. */
export function hexBytes(bytes: ArrayLike<number>): string {
	return Array.from(bytes, (b) => hex(b)).join(' ');
}

/** A byte as eight binary digits. */
export function binary(byte: number): string {
	return isByte(byte) ? byte.toString(2).padStart(8, '0') : '????????';
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** Complete length of each fixed-size System message, status byte included. */
const SYSTEM_LENGTH: Readonly<Record<number, number>> = {
	[Status.MtcQuarterFrame]: 2,
	[Status.SongPosition]: 3,
	[Status.SongSelect]: 2,
	[Status.TuneRequest]: 1,
	[Status.Clock]: 1,
	[Status.Start]: 1,
	[Status.Continue]: 1,
	[Status.Stop]: 1,
	[Status.ActiveSensing]: 1,
	[Status.Reset]: 1
};

type BareSystemType =
	'tuneRequest' | 'clock' | 'start' | 'continue' | 'stop' | 'activeSensing' | 'reset';

const BARE_SYSTEM: Readonly<Record<number, BareSystemType>> = {
	[Status.TuneRequest]: 'tuneRequest',
	[Status.Clock]: 'clock',
	[Status.Start]: 'start',
	[Status.Continue]: 'continue',
	[Status.Stop]: 'stop',
	[Status.ActiveSensing]: 'activeSensing',
	[Status.Reset]: 'reset'
};

/**
 * Parse one complete message. Web MIDI delivers complete messages, so this is the common path; use
 * `RunningStatusParser` for raw streams, where running status can omit repeated status bytes.
 *
 * Never throws. A truncated message, extra bytes, a data byte of 0x80 or more, an undefined status
 * (F4, F5, F9, FD), a lone F7, or a SysEx that is empty or unterminated all come back as `unknown`,
 * so anything `parse` accepts can be re-encoded. (MIDI Lab filled missing bytes with zeros, which
 * turned a truncated Note On into a Note Off.)
 */
export function parse(bytes: ArrayLike<number>): MidiMessage {
	const b = Array.from(bytes);
	const unknown: MidiMessage = { type: 'unknown', bytes: b };
	const status = b[0];
	if (!isIntInRange(status, 0x80, 0xff)) return unknown;

	if (status === Status.SysExStart) {
		const data = b.slice(1, -1);
		const framed = b.length >= 3 && b[b.length - 1] === Status.SysExEnd;
		return framed && data.every(isDataByte) ? { type: 'sysex', data } : unknown;
	}

	const length = status < 0xf0 ? 1 + dataByteCount(status) : SYSTEM_LENGTH[status];
	if (b.length !== length || !b.slice(1).every(isDataByte)) return unknown;
	const [, d1, d2] = b;

	if (status < 0xf0) {
		const channel = status & 0x0f;
		switch (status & 0xf0) {
			case Status.NoteOff:
				return { type: 'noteOff', channel, note: d1, velocity: d2 };
			case Status.NoteOn:
				// Velocity 0 is a Note Off in disguise, a running-status trick every device still honours.
				return d2 === 0
					? { type: 'noteOff', channel, note: d1, velocity: 0 }
					: { type: 'noteOn', channel, note: d1, velocity: d2 };
			case Status.PolyAftertouch:
				return { type: 'polyAftertouch', channel, note: d1, pressure: d2 };
			case Status.ControlChange:
				return { type: 'controlChange', channel, controller: d1, value: d2 };
			case Status.ProgramChange:
				return { type: 'programChange', channel, program: d1 };
			case Status.ChannelAftertouch:
				return { type: 'channelAftertouch', channel, pressure: d1 };
			default:
				// 0xE0, the only channel status left. The fine byte comes first on the wire.
				return { type: 'pitchBend', channel, value: combine14(d2, d1) };
		}
	}

	switch (status) {
		case Status.MtcQuarterFrame:
			return { type: 'mtcQuarterFrame', messageType: d1 >> 4, value: d1 & 0x0f };
		case Status.SongPosition:
			return { type: 'songPosition', beats: combine14(d2, d1) };
		case Status.SongSelect:
			return { type: 'songSelect', song: d1 };
		default:
			return { type: BARE_SYSTEM[status] };
	}
}

/**
 * How many data bytes follow a status byte: 0–2, or −1 for SysEx ("until F7"). Undefined statuses
 * (F4, F5, F9, FD) and F7 carry no data and return 0.
 */
export function dataByteCount(status: number): number {
	if (status >= 0x80 && status < 0xf0) {
		const kind = status & 0xf0;
		return kind === Status.ProgramChange || kind === Status.ChannelAftertouch ? 1 : 2;
	}
	if (status === Status.SysExStart) return -1;
	return (SYSTEM_LENGTH[status] ?? 1) - 1;
}

/**
 * A streaming parser for raw MIDI byte streams (DIN, serial, recorded dumps) that understands
 * running status, where a sender omits a repeated status byte. Real Time bytes may interleave
 * anywhere, even inside a SysEx; any status byte other than Real Time ends a SysEx (MIDI 1.0);
 * System Common messages cancel running status; stray data bytes with no status are dropped.
 */
export class RunningStatusParser {
	/** Running status: the last channel status byte, or 0 for none. */
	#status = 0;
	/** The message being assembled, status byte first. */
	#buffer: number[] = [];
	/** The SysEx payload being collected, or null outside a SysEx. */
	#sysex: number[] | null = null;

	/** Forget everything, including running status. */
	reset(): void {
		this.#status = 0;
		this.#buffer = [];
		this.#sysex = null;
	}

	/** Feed bytes; returns every message they complete, in order. */
	push(bytes: ArrayLike<number>): MidiMessage[] {
		const out: MidiMessage[] = [];
		for (let i = 0; i < bytes.length; i++) {
			const byte = bytes[i];
			if (byte >= 0xf8) {
				out.push(parse([byte]));
				continue;
			}
			if (this.#sysex) {
				if (byte < 0x80) {
					this.#sysex.push(byte);
					continue;
				}
				out.push({ type: 'sysex', data: this.#sysex });
				this.#sysex = null;
				if (byte === Status.SysExEnd) continue;
				// Any other status byte ends the SysEx and then counts as itself.
			}
			if (byte >= 0x80) this.#statusByte(byte, out);
			else this.#dataByte(byte, out);
		}
		return out;
	}

	#statusByte(byte: number, out: MidiMessage[]): void {
		if (byte === Status.SysExStart) {
			this.#sysex = [];
			this.#status = 0;
			this.#buffer = [];
			return;
		}
		this.#status = byte < 0xf0 ? byte : 0;
		this.#buffer = [byte];
		if (dataByteCount(byte) === 0) {
			out.push(parse(this.#buffer));
			this.#buffer = [];
		}
	}

	#dataByte(byte: number, out: MidiMessage[]): void {
		if (this.#buffer.length === 0) {
			if (this.#status === 0) return;
			this.#buffer = [this.#status];
		}
		this.#buffer.push(byte);
		if (this.#buffer.length === 1 + dataByteCount(this.#buffer[0])) {
			out.push(parse(this.#buffer));
			this.#buffer = [];
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Validation and encoding                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Check every field of a message against its range and throw `MidiRangeError` on the first one that
 * is wrong: channels 0–15, data 0–127, 14-bit values 0–16383, SysEx payload bytes 0–127 (and at
 * least one), MTC piece 0–7 with nibble 0–15. `unknown` messages are refused outright.
 */
export function assertValid(msg: MidiMessage): asserts msg is EncodableMessage {
	switch (msg.type) {
		case 'noteOn':
		case 'noteOff':
			assertChannel(msg.channel, `${msg.type}.channel`);
			assertData7(msg.note, `${msg.type}.note`);
			assertData7(msg.velocity, `${msg.type}.velocity`);
			return;
		case 'polyAftertouch':
			assertChannel(msg.channel, 'polyAftertouch.channel');
			assertData7(msg.note, 'polyAftertouch.note');
			assertData7(msg.pressure, 'polyAftertouch.pressure');
			return;
		case 'controlChange':
			assertChannel(msg.channel, 'controlChange.channel');
			assertData7(msg.controller, 'controlChange.controller');
			assertData7(msg.value, 'controlChange.value');
			return;
		case 'programChange':
			assertChannel(msg.channel, 'programChange.channel');
			assertData7(msg.program, 'programChange.program');
			return;
		case 'channelAftertouch':
			assertChannel(msg.channel, 'channelAftertouch.channel');
			assertData7(msg.pressure, 'channelAftertouch.pressure');
			return;
		case 'pitchBend':
			assertChannel(msg.channel, 'pitchBend.channel');
			assertData14(msg.value, 'pitchBend.value');
			return;
		case 'sysex':
			assertDataBytes(msg.data, 'sysex.data');
			if (msg.data.length === 0) {
				throw new MidiRangeError(
					'sysex.data',
					msg.data,
					'at least one data byte (a manufacturer ID)'
				);
			}
			return;
		case 'mtcQuarterFrame':
			assertIntInRange(msg.messageType, 0, 7, 'mtcQuarterFrame.messageType');
			assertIntInRange(msg.value, 0, 15, 'mtcQuarterFrame.value');
			return;
		case 'songPosition':
			assertData14(msg.beats, 'songPosition.beats');
			return;
		case 'songSelect':
			assertData7(msg.song, 'songSelect.song');
			return;
		case 'tuneRequest':
		case 'clock':
		case 'start':
		case 'continue':
		case 'stop':
		case 'activeSensing':
		case 'reset':
			return;
		case 'unknown':
			throw new MidiRangeError(
				'type',
				'unknown',
				'an encodable message type',
				`the bytes ${hexBytes(msg.bytes)} do not form a valid message; build a typed message instead`
			);
		default:
			throw new MidiRangeError('type', (msg as { type: unknown }).type, 'a MIDI message type');
	}
}

/**
 * Encode a message to wire bytes. Validates first (`assertValid`) and throws `MidiRangeError` on
 * any out-of-range field; it never clamps and never masks. Pitch bend and song position go LSB
 * first.
 */
export function encode(msg: MidiMessage): Uint8Array {
	assertValid(msg);
	switch (msg.type) {
		case 'noteOff':
			return Uint8Array.of(Status.NoteOff | msg.channel, msg.note, msg.velocity);
		case 'noteOn':
			return Uint8Array.of(Status.NoteOn | msg.channel, msg.note, msg.velocity);
		case 'polyAftertouch':
			return Uint8Array.of(Status.PolyAftertouch | msg.channel, msg.note, msg.pressure);
		case 'controlChange':
			return Uint8Array.of(Status.ControlChange | msg.channel, msg.controller, msg.value);
		case 'programChange':
			return Uint8Array.of(Status.ProgramChange | msg.channel, msg.program);
		case 'channelAftertouch':
			return Uint8Array.of(Status.ChannelAftertouch | msg.channel, msg.pressure);
		case 'pitchBend': {
			const { msb, lsb } = split14(msg.value);
			return Uint8Array.of(Status.PitchBend | msg.channel, lsb, msb);
		}
		case 'sysex': {
			const out = new Uint8Array(msg.data.length + 2);
			out[0] = Status.SysExStart;
			out.set(msg.data, 1);
			out[out.length - 1] = Status.SysExEnd;
			return out;
		}
		case 'mtcQuarterFrame':
			return Uint8Array.of(Status.MtcQuarterFrame, (msg.messageType << 4) | msg.value);
		case 'songPosition': {
			const { msb, lsb } = split14(msg.beats);
			return Uint8Array.of(Status.SongPosition, lsb, msb);
		}
		case 'songSelect':
			return Uint8Array.of(Status.SongSelect, msg.song);
		case 'tuneRequest':
			return Uint8Array.of(Status.TuneRequest);
		case 'clock':
			return Uint8Array.of(Status.Clock);
		case 'start':
			return Uint8Array.of(Status.Start);
		case 'continue':
			return Uint8Array.of(Status.Continue);
		case 'stop':
			return Uint8Array.of(Status.Stop);
		case 'activeSensing':
			return Uint8Array.of(Status.ActiveSensing);
		case 'reset':
			return Uint8Array.of(Status.Reset);
	}
}

/* -------------------------------------------------------------------------- */
/* Description                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Device-specific names for descriptions; each method returns undefined to fall back. A profile
 * built from the OP-XY's CC map (`core/opxy`) makes CC 32 on an instrument track read as filter
 * cutoff instead of a bare controller number.
 */
export interface DescribeProfile {
	/** Name of a controller on a wire channel, e.g. `filter cutoff`. */
	ccName?(controller: number, channel: number): string | undefined;
	/** Name of a program on a wire channel. */
	programName?(program: number, channel: number): string | undefined;
	/** Name of what a note triggers on a wire channel, e.g. a drum sound. */
	noteName?(note: number, channel: number): string | undefined;
}

/** Options for `describe` and `shortLabel`. */
export interface DescribeOptions {
	/** Octave label convention for note names. */
	octaveConvention?: OctaveConvention;
	/** Mention the channel in the sentence (default true). */
	channel?: boolean;
	/** Device-specific names, consulted first. */
	profile?: DescribeProfile;
	/** Opt in to General MIDI wording for controllers, programs and drum keys. Off by default. */
	gm?: boolean;
	/** With `gm`, the wire channel read as GM percussion. Default 9 (channel 10); null for none. */
	drumChannel?: number | null;
}

/**
 * The magnitude a message carries, if any: enough to draw it as a bar as well as a sentence.
 * `centre` is set for bipolar values, so a bend draws out from the middle.
 */
export function magnitude(
	msg: MidiMessage
): { value: number; max: number; centre?: number } | null {
	switch (msg.type) {
		case 'noteOn':
		case 'noteOff':
			return { value: msg.velocity, max: 127 };
		case 'controlChange':
			return { value: msg.value, max: 127 };
		case 'channelAftertouch':
		case 'polyAftertouch':
			return { value: msg.pressure, max: 127 };
		case 'pitchBend':
			return { value: msg.value, max: 16383, centre: 8192 };
		default:
			return null;
	}
}

/** A device or GM name for a note, or undefined for a plain pitch. */
function namedNote(note: number, channel: number, opts: DescribeOptions): string | undefined {
	const named = opts.profile?.noteName?.(note, channel);
	if (named) return named;
	const drums = opts.drumChannel === undefined ? 9 : opts.drumChannel;
	return opts.gm && channel === drums ? GM_DRUMS[note] : undefined;
}

function pitchName(note: number, opts: DescribeOptions): string {
	return noteName(note, { convention: opts.octaveConvention ?? DEFAULT_OCTAVE_CONVENTION });
}

function sentenceCase(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A short label for monitor rows and tooltips. */
export function shortLabel(msg: MidiMessage, opts: DescribeOptions = {}): string {
	switch (msg.type) {
		case 'noteOn':
			return `${namedNote(msg.note, msg.channel, opts) ?? pitchName(msg.note, opts)} on · v${msg.velocity}`;
		case 'noteOff':
			return `${namedNote(msg.note, msg.channel, opts) ?? pitchName(msg.note, opts)} off`;
		case 'controlChange': {
			const named =
				opts.profile?.ccName?.(msg.controller, msg.channel) ??
				(opts.gm || msg.controller >= 120 ? gmCcInfo(msg.controller).short : undefined);
			return `${named ?? `CC ${msg.controller}`} = ${msg.value}`;
		}
		case 'programChange': {
			const named =
				opts.profile?.programName?.(msg.program, msg.channel) ??
				(opts.gm ? gmProgramName(msg.program) : undefined);
			return named ? `Program ${msg.program} · ${named}` : `Program ${msg.program}`;
		}
		case 'pitchBend': {
			const delta = msg.value - 8192;
			return `Bend ${delta >= 0 ? '+' : ''}${delta}`;
		}
		case 'channelAftertouch':
			return `Pressure ${msg.pressure}`;
		case 'polyAftertouch':
			return `${namedNote(msg.note, msg.channel, opts) ?? pitchName(msg.note, opts)} pressure ${msg.pressure}`;
		case 'sysex':
			return `SysEx · ${sysexHeadline(msg.data)}`;
		case 'songPosition':
			return `Song position ${msg.beats}`;
		case 'songSelect':
			return `Song ${msg.song}`;
		case 'mtcQuarterFrame':
			return `MTC frame ${msg.messageType}`;
		case 'clock':
			return 'Clock';
		case 'start':
			return 'Start';
		case 'continue':
			return 'Continue';
		case 'stop':
			return 'Stop';
		case 'activeSensing':
			return 'Active Sensing';
		case 'reset':
			return 'System Reset';
		case 'tuneRequest':
			return 'Tune Request';
		case 'unknown':
			return `Unrecognised (${hexBytes(msg.bytes)})`;
	}
}

/** A full plain-English sentence describing a message. */
export function describe(msg: MidiMessage, opts: DescribeOptions = {}): string {
	const showChannel = opts.channel ?? true;
	const on = showChannel && 'channel' in msg ? ` on channel ${msg.channel + 1}` : '';
	const pitch = (note: number, channel: number) =>
		`${namedNote(note, channel, opts) ?? pitchName(note, opts)} (note ${note})`;

	switch (msg.type) {
		case 'noteOn':
			return `Start playing ${pitch(msg.note, msg.channel)}${on}, struck at velocity ${msg.velocity}${velocityFlavour(msg.velocity)}.`;
		case 'noteOff':
			return `Stop playing ${pitch(msg.note, msg.channel)}${on}${msg.velocity ? `, released at velocity ${msg.velocity}` : ''}.`;
		case 'polyAftertouch':
			return `Pressure ${msg.pressure} applied to ${pitch(msg.note, msg.channel)} alone${on}: this note only, not the whole chord.`;
		case 'controlChange':
			return describeControlChange(msg.controller, msg.value, msg.channel, on, opts);
		case 'programChange':
			return describeProgramChange(msg.program, msg.channel, on, opts);
		case 'channelAftertouch':
			return `Pressure ${msg.pressure} applied to every note${on}.`;
		case 'pitchBend': {
			const delta = msg.value - 8192;
			if (delta === 0) return `Pitch bend returned to centre${on}.`;
			const pct = Math.round((Math.abs(delta) / (delta > 0 ? 8191 : 8192)) * 100);
			return `Bend pitch ${delta > 0 ? 'up' : 'down'} ${pct}% of the configured bend range${on} (raw value ${msg.value} of 16383, centre 8192).`;
		}
		case 'sysex':
			return describeSysExSentence(msg.data);
		case 'songPosition':
			return `Jump to song position ${msg.beats}: that is ${msg.beats} sixteenth notes from the start (${(msg.beats / 4).toFixed(2)} beats).`;
		case 'songSelect':
			return `Select song ${msg.song}.`;
		case 'mtcQuarterFrame':
			return `MIDI Time Code quarter frame, piece ${msg.messageType} of 8, nibble ${msg.value}. Eight of these spell out one timecode position.`;
		case 'clock':
			return 'One clock tick. Twenty-four of these make a quarter note.';
		case 'start':
			return 'Start: begin playback from the very beginning.';
		case 'continue':
			return 'Continue: resume playback from wherever the song position pointer left off.';
		case 'stop':
			return 'Stop playback.';
		case 'activeSensing':
			return 'Active Sensing: a heartbeat. If it stops arriving, the receiver assumes the cable was pulled and silences its notes.';
		case 'reset':
			return 'System Reset: return to power-on state. Rarely sent; some devices ignore it.';
		case 'tuneRequest':
			return 'Tune Request: asks analogue oscillators to retune themselves.';
		case 'unknown':
			return `These bytes do not form a valid MIDI message: ${hexBytes(msg.bytes)}.`;
	}
}

function velocityFlavour(v: number): string {
	if (v <= 20) return ', barely touched';
	if (v <= 45) return ', soft';
	if (v <= 80) return ', moderate';
	if (v <= 110) return ', firm';
	return ', hammered';
}

function describeProgramChange(
	program: number,
	channel: number,
	on: string,
	opts: DescribeOptions
): string {
	const which = `program ${program} (counting from 0; ${program + 1} on devices that count from 1)`;
	const named = opts.profile?.programName?.(program, channel);
	if (named) return `Switch${on} to ${which}: ${named}.`;
	if (opts.gm) {
		return `Switch${on} to ${which}. Under General MIDI that is ${gmProgramName(program)}, but the device decides what it actually means.`;
	}
	return `Switch${on} to ${which}. What that program is depends on the receiving device.`;
}

function describeControlChange(
	cc: number,
	value: number,
	channel: number,
	on: string,
	opts: DescribeOptions
): string {
	// Channel Mode messages are reserved by the MIDI 1.0 specification; no device reassigns them.
	if (cc >= 120) return describeChannelMode(cc, value, on);
	const named = opts.profile?.ccName?.(cc, channel);
	if (named) return `${sentenceCase(named)} (CC ${cc}) set to ${value}${on}.`;
	if (opts.gm) return describeGmCc(cc, value, on);
	return `Controller ${cc} set to ${value}${on}. What it controls is up to the receiving device.`;
}

function describeChannelMode(cc: number, value: number, on: string): string {
	switch (cc) {
		case 120:
			return `All Sound Off${on}. Every voice is cut instantly, ignoring release tails and the sustain pedal.`;
		case 121:
			return `Reset All Controllers${on}: bend back to centre, mod wheel to zero, pedals up.`;
		case 122:
			return value >= 64
				? `Local Control on${on}: the keyboard is reconnected to its own sound engine.`
				: `Local Control off${on}: the keyboard stops playing its own sounds and becomes a pure controller. This is the fix for doubled notes when a sequencer echoes MIDI back.`;
		case 123:
			return `All Notes Off${on}: every held note is released, as if you lifted your hands. The sustain pedal still applies.`;
		case 124:
			return `Omni Mode Off${on}: listen only to this channel.`;
		case 125:
			return `Omni Mode On${on}: listen to every channel.`;
		case 126:
			return `Mono Mode On${on}: one note at a time, using ${value} channel${value === 1 ? '' : 's'}.`;
		default:
			return `Poly Mode On${on}: normal polyphonic behaviour.`;
	}
}

/** MIDI Lab's controller wording, now opt-in: what a General MIDI device takes these to mean. */
function describeGmCc(cc: number, value: number, on: string): string {
	switch (cc) {
		case 64:
			return value >= 64
				? `Sustain pedal down${on}: notes keep ringing after their Note Off arrives.`
				: `Sustain pedal up${on}: everything being sustained is released now.`;
		case 98:
		case 99:
			return `Select non-registered parameter, ${cc === 99 ? 'coarse' : 'fine'} half = ${value}${on}. Nothing changes until a Data Entry follows.`;
		case 100:
		case 101:
			return `Select registered parameter, ${cc === 101 ? 'coarse' : 'fine'} half = ${value}${on}.`;
		case 6:
			return `Data Entry ${value}${on}: sets the coarse value of whichever RPN or NRPN was last selected.`;
		case 38:
			return `Data Entry fine = ${value}${on}.`;
		case 0:
			return `Bank Select coarse = ${value}${on}. Held in waiting; the next Program Change picks a sound from this bank.`;
		case 32:
			return `Bank Select fine = ${value}${on}.`;
		case 7:
			return `Channel volume ${value} of 127${on}: the mix fader for this channel.`;
		case 10: {
			const where =
				value === 64
					? 'dead centre'
					: value < 64
						? `${Math.round(((64 - value) / 64) * 100)}% left`
						: `${Math.round(((value - 64) / 63) * 100)}% right`;
			return `Pan ${value}${on}: ${where}.`;
		}
		case 11:
			return `Expression ${value} of 127${on}: a percentage of the channel volume, for swells within a phrase.`;
		case 1:
			return `Modulation wheel ${value} of 127${on}.`;
		default: {
			const info = gmCcInfo(cc);
			return info.standard
				? `${info.short} set to ${value} of 127${on}, by General MIDI convention. The receiver has the final say.`
				: `Controller ${cc} set to ${value}${on}. The MIDI specification leaves this one undefined, so it means whatever the receiving device says it means.`;
		}
	}
}

function isIdentity(data: number[], variant: number): boolean {
	return data[0] === 0x7e && data[2] === 0x06 && data[3] === variant;
}

/**
 * The one-line name of a SysEx block. `data` is what sits between F0 and F7, so a bare byte count
 * always reads two short of the bytes on screen; name the message where it is nameable.
 */
function sysexHeadline(data: number[]): string {
	if (data.length === 0) return 'empty';
	if (isIdentity(data, 0x01)) return 'Identity Request';
	if (isIdentity(data, 0x02)) return `Identity Reply · ${manufacturerName(data.slice(4))}`;
	if (data[0] === 0x7e || data[0] === 0x7f) {
		const name = universalSubIdName(data[0] === 0x7f, data[2]);
		return `Universal · ${name ?? `sub-ID ${hex(data[2], true)}`}`;
	}
	return `${manufacturerName(data)} · ${data.length} data bytes`;
}

function describeSysExSentence(data: number[]): string {
	if (data.length === 0) return 'An empty System Exclusive message.';
	if (isIdentity(data, 0x01)) {
		return 'Universal Non-Real Time Identity Request: "what are you?" Every compliant device answers with its manufacturer, family and firmware version.';
	}
	if (isIdentity(data, 0x02)) {
		return `Universal Non-Real Time Identity Reply from ${manufacturerName(data.slice(4))}.`;
	}
	if (data[0] === 0x7e || data[0] === 0x7f) {
		const realtime = data[0] === 0x7f;
		const kind = realtime ? 'Universal Real Time' : 'Universal Non-Real Time';
		const name = universalSubIdName(realtime, data[2]) ?? `sub-ID ${hex(data[2], true)}`;
		return `${kind} System Exclusive, ${name}: ${data.length} bytes between F0 and F7.`;
	}
	return `System Exclusive addressed to ${manufacturerName(data)}: ${data.length} bytes between F0 and F7, all of them manufacturer-private. Only that maker's devices know what it means.`;
}
