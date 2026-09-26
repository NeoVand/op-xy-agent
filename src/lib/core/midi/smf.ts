// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/smf.ts

/**
 * Standard MIDI Files (SMF 1.0), read and written from scratch.
 *
 * A `.mid` file is a header chunk plus track chunks. Inside a track every event is preceded by a
 * delta time (ticks since the previous event) encoded as a variable-length quantity: seven bits per
 * byte, top bit set when another byte follows. Tracks use running status like a live cable, but the
 * wire parser (`RunningStatusParser`) does not fit here: delta times sit between events and SysEx
 * and meta events carry explicit lengths, so the file reader tracks running status itself.
 *
 * What changed from MIDI Lab:
 * - The writer grows one `Uint8Array` instead of spreading a whole track into `Array.push`, which
 *   threw a RangeError for tracks somewhere between 120 and 150 KB.
 * - The reader checks every read against the chunk it is in and throws `SmfFormatError` (with the
 *   byte offset) for truncated or corrupt files, instead of reading `undefined`.
 * - Text meta events fall back to Latin-1 when they are not valid UTF-8.
 * - SMPTE time division is kept as SMPTE (`division.kind === 'smpte'`), not turned into fake ticks.
 * - Tempo changes are honoured: `tempoMap()` and `tickToMs()` convert ticks to wall-clock time, and
 *   `summarise()` / `flatten()` use them instead of "the last tempo wins".
 */

import { dataByteCount, encode, parse, Status, type MidiMessage } from './messages';
import { assertBytes, assertIntInRange, isDataByte, MidiRangeError } from './validate';

/** Thrown for a file that is truncated, corrupt or not a Standard MIDI File. */
export class SmfFormatError extends Error {
	override name = 'SmfFormatError';

	constructor(
		message: string,
		/** Byte offset in the file where the problem was found. */
		readonly offset: number
	) {
		super(`${message} (at byte ${offset})`);
	}
}

/** 0: one track. 1: simultaneous tracks sharing a tempo map. 2: independent sequences. */
export type SmfFormat = 0 | 1 | 2;

/** SMPTE frame rates a MIDI file can declare; 29.97 is 30 drop-frame. */
export type SmpteRate = 24 | 25 | 29.97 | 30;

/** How ticks relate to time: per quarter note (musical) or per SMPTE frame (absolute). */
export type TimeDivision =
	| { kind: 'ppq'; ticksPerQuarter: number }
	| { kind: 'smpte'; framesPerSecond: SmpteRate; ticksPerFrame: number };

/** A meta event (`FF <type> <length> <data>`), with the useful ones decoded. */
export interface MetaEvent {
	type: 'meta';
	subtype: number;
	name: string;
	data: number[];
	/** Text events (types 01–0F). */
	text?: string;
	/** How `text` was decoded: UTF-8 when valid, otherwise Latin-1. */
	textEncoding?: 'utf-8' | 'latin-1';
	sequenceNumber?: number;
	channelPrefix?: number;
	port?: number;
	/** Set Tempo, as stored: microseconds per quarter note. */
	usPerQuarter?: number;
	/** Set Tempo in BPM, for display. */
	tempo?: number;
	timeSignature?: {
		numerator: number;
		denominator: number;
		clocksPerClick: number;
		thirtySecondsPerQuarter: number;
	};
	keySignature?: { sharps: number; minor: boolean };
}

/**
 * An `F7` escape event: raw bytes sent as they are, such as a System Real Time message. (An `F7`
 * packet that continues a divided SysEx is merged into that SysEx instead.)
 */
export interface EscapeEvent {
	type: 'escape';
	data: number[];
}

/** Anything a track can hold. */
export type SmfEvent = MidiMessage | MetaEvent | EscapeEvent;

/** An event as the reader returns it. */
export interface TrackEvent {
	/** Ticks since the previous event in this track. */
	delta: number;
	/** Ticks since the start of the track. */
	tick: number;
	event: SmfEvent;
}

/** A track as the reader returns it. */
export interface MidiTrack {
	/** The first Track Name meta event, if any. */
	name?: string;
	events: TrackEvent[];
}

/** A parsed file. */
export interface MidiFile {
	format: SmfFormat;
	division: TimeDivision;
	tracks: MidiTrack[];
}

/** An event to write. The writer works from absolute ticks; a `delta` field is ignored. */
export interface EventAtTick {
	tick: number;
	event: SmfEvent;
}

/** A track to write. Read results (`MidiTrack`) can be passed as they are. */
export interface TrackInput {
	/**
	 * Ignored by `encodeMidiFile` (the name lives in the Track Name meta event, which is written like
	 * any other event); `writeMidiFile` adds a Track Name event from it when the track has none.
	 */
	name?: string;
	events: readonly EventAtTick[];
}

/** A file to write. Read results (`MidiFile`) can be passed as they are. */
export interface FileInput {
	format: SmfFormat;
	division: TimeDivision;
	tracks: readonly TrackInput[];
}

/* -------------------------------------------------------------------------- */
/* Variable-length quantities                                                  */
/* -------------------------------------------------------------------------- */

/** The largest value a MIDI-file VLQ may hold: four bytes, 28 bits. */
export const VLQ_MAX = 0x0fffffff;

/** Encode an integer 0–0x0FFFFFFF as a variable-length quantity, most significant group first. */
export function encodeVlq(value: number): number[] {
	assertIntInRange(value, 0, VLQ_MAX, 'value');
	const out = [value & 0x7f];
	for (let v = value >>> 7; v > 0; v >>>= 7) out.unshift((v & 0x7f) | 0x80);
	return out;
}

/**
 * Decode the variable-length quantity starting at `offset`, reading no further than `end`. Throws
 * `SmfFormatError` if the data ends first or the number runs past four bytes.
 */
export function decodeVlq(
	bytes: ArrayLike<number>,
	offset: number,
	end: number = bytes.length
): { value: number; next: number } {
	assertIntInRange(offset, 0, Number.MAX_SAFE_INTEGER, 'offset');
	const limit = Math.min(end, bytes.length);
	let value = 0;
	for (let at = offset; at < offset + 4; at++) {
		if (at >= limit) throw new SmfFormatError('data ends inside a variable-length number', at);
		const byte = bytes[at];
		if (!isByteValue(byte)) throw new SmfFormatError(`${String(byte)} is not a byte`, at);
		value = (value << 7) | (byte & 0x7f);
		if ((byte & 0x80) === 0) return { value, next: at + 1 };
	}
	throw new SmfFormatError('variable-length number longer than four bytes', offset);
}

/** A step-by-step breakdown of a VLQ, for explaining the encoding. */
export function explainVlq(value: number): { bytes: number[]; steps: string[] } {
	const bytes = encodeVlq(value);
	const steps = bytes.map((b) => {
		const more = (b & 0x80) !== 0;
		return `0x${b.toString(16).toUpperCase().padStart(2, '0')} → carries ${b & 0x7f}${more ? ', and another byte follows' : ', last byte'}`;
	});
	return { bytes, steps };
}

function isByteValue(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

/* -------------------------------------------------------------------------- */
/* Meta events                                                                 */
/* -------------------------------------------------------------------------- */

const META_NAMES: Readonly<Record<number, string>> = {
	0x00: 'Sequence Number',
	0x01: 'Text',
	0x02: 'Copyright',
	0x03: 'Track Name',
	0x04: 'Instrument Name',
	0x05: 'Lyric',
	0x06: 'Marker',
	0x07: 'Cue Point',
	0x08: 'Program Name',
	0x09: 'Device Name',
	0x20: 'Channel Prefix',
	0x21: 'Port',
	0x2f: 'End of Track',
	0x51: 'Set Tempo',
	0x54: 'SMPTE Offset',
	0x58: 'Time Signature',
	0x59: 'Key Signature',
	0x7f: 'Sequencer Specific'
};

const isTextType = (subtype: number) => subtype >= 0x01 && subtype <= 0x0f;

function metaName(subtype: number): string {
	return (
		META_NAMES[subtype] ??
		(isTextType(subtype) ? 'Text' : `Meta 0x${subtype.toString(16).padStart(2, '0')}`)
	);
}

/** UTF-8 when the bytes are valid UTF-8, otherwise Latin-1 (common in older files). */
function decodeText(data: number[]): { text: string; encoding: 'utf-8' | 'latin-1' } {
	try {
		const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(data));
		return { text, encoding: 'utf-8' };
	} catch {
		let text = '';
		for (const code of data) text += String.fromCharCode(code);
		return { text, encoding: 'latin-1' };
	}
}

function decodeMeta(subtype: number, data: number[], offset: number): MetaEvent {
	const meta: MetaEvent = { type: 'meta', subtype, name: metaName(subtype), data };
	if (isTextType(subtype)) {
		const { text, encoding } = decodeText(data);
		meta.text = text;
		meta.textEncoding = encoding;
	}
	switch (subtype) {
		case 0x00:
			if (data.length === 2) meta.sequenceNumber = (data[0] << 8) | data[1];
			break;
		case 0x20:
			if (data.length === 1 && data[0] <= 15) meta.channelPrefix = data[0];
			break;
		case 0x21:
			if (data.length === 1) meta.port = data[0];
			break;
		case 0x51: {
			// Tempo decides how every later tick maps to time, so a broken one is an error, not a shrug.
			if (data.length !== 3) {
				throw new SmfFormatError(`Set Tempo needs 3 data bytes, not ${data.length}`, offset);
			}
			const us = (data[0] << 16) | (data[1] << 8) | data[2];
			if (us === 0) throw new SmfFormatError('Set Tempo of 0 µs per quarter note', offset);
			meta.usPerQuarter = us;
			meta.tempo = 60_000_000 / us;
			break;
		}
		case 0x58:
			if (data.length >= 2) {
				meta.timeSignature = {
					numerator: data[0],
					denominator: 2 ** data[1],
					clocksPerClick: data[2] ?? 24,
					thirtySecondsPerQuarter: data[3] ?? 8
				};
			}
			break;
		case 0x59: {
			const sharps = (data[0] << 24) >> 24;
			if (data.length === 2 && sharps >= -7 && sharps <= 7 && data[1] <= 1) {
				meta.keySignature = { sharps, minor: data[1] === 1 };
			}
			break;
		}
	}
	return meta;
}

/** True for meta events. */
export function isMeta(event: SmfEvent): event is MetaEvent {
	return event.type === 'meta';
}

function isEndOfTrack(event: SmfEvent): boolean {
	return event.type === 'meta' && event.subtype === 0x2f;
}

/** A text meta event (types 01–0F, e.g. 03 Track Name), stored as UTF-8. */
export function textMeta(subtype: number, text: string): MetaEvent {
	assertIntInRange(subtype, 0x01, 0x0f, 'subtype');
	return {
		type: 'meta',
		subtype,
		name: metaName(subtype),
		data: Array.from(new TextEncoder().encode(text)),
		text,
		textEncoding: 'utf-8'
	};
}

/** A Set Tempo meta event. The tempo must fit the event's 24-bit microseconds-per-quarter field. */
export function tempoMeta(bpm: number): MetaEvent {
	const us = Math.round(60_000_000 / bpm);
	if (!(Number.isFinite(bpm) && bpm > 0 && us >= 1 && us <= 0xffffff)) {
		throw new MidiRangeError('bpm', bpm, 'a tempo from about 3.6 to 60,000,000 BPM');
	}
	return {
		type: 'meta',
		subtype: 0x51,
		name: 'Set Tempo',
		data: [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff],
		usPerQuarter: us,
		tempo: 60_000_000 / us
	};
}

/**
 * A Time Signature meta event. The denominator must be a power of two from 1 to 128; MIDI Lab wrote
 * `log2(3)` into the file for 4/3.
 */
export function timeSignatureMeta(
	numerator: number,
	denominator: number,
	clocksPerClick = 24,
	thirtySecondsPerQuarter = 8
): MetaEvent {
	assertIntInRange(numerator, 1, 255, 'numerator');
	const power = Math.log2(denominator);
	if (!(Number.isInteger(power) && power >= 0 && power <= 7)) {
		throw new MidiRangeError('denominator', denominator, 'a power of two from 1 to 128');
	}
	assertIntInRange(clocksPerClick, 0, 255, 'clocksPerClick');
	assertIntInRange(thirtySecondsPerQuarter, 1, 255, 'thirtySecondsPerQuarter');
	return {
		type: 'meta',
		subtype: 0x58,
		name: 'Time Signature',
		data: [numerator, power, clocksPerClick, thirtySecondsPerQuarter],
		timeSignature: { numerator, denominator, clocksPerClick, thirtySecondsPerQuarter }
	};
}

/**
 * An End of Track meta event. Every track ends with one anyway; put one in explicitly to make a
 * track longer than its last note, e.g. a one-bar loop whose last note ends early.
 */
export function endOfTrackMeta(): MetaEvent {
	return { type: 'meta', subtype: 0x2f, name: 'End of Track', data: [] };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** A cursor that refuses to read past `end`. */
class ByteReader {
	pos: number;

	constructor(
		private readonly bytes: Uint8Array,
		start: number,
		private readonly end: number
	) {
		this.pos = start;
	}

	get remaining(): number {
		return this.end - this.pos;
	}

	need(count: number, what: string): void {
		if (count > this.end - this.pos) throw new SmfFormatError(`data ends inside ${what}`, this.pos);
	}

	u8(what: string): number {
		this.need(1, what);
		return this.bytes[this.pos++];
	}

	u16(what: string): number {
		this.need(2, what);
		const value = (this.bytes[this.pos] << 8) | this.bytes[this.pos + 1];
		this.pos += 2;
		return value;
	}

	u32(what: string): number {
		this.need(4, what);
		const b = this.bytes;
		const p = this.pos;
		this.pos += 4;
		return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
	}

	take(count: number, what: string): number[] {
		this.need(count, what);
		const out = Array.from(this.bytes.subarray(this.pos, this.pos + count));
		this.pos += count;
		return out;
	}

	vlq(what: string): number {
		if (this.remaining <= 0) throw new SmfFormatError(`data ends before ${what}`, this.pos);
		const { value, next } = decodeVlq(this.bytes, this.pos, this.end);
		this.pos = next;
		return value;
	}

	id(what: string): string {
		return String.fromCharCode(...this.take(4, what));
	}
}

/** Status bytes the MIDI specification leaves undefined; nothing can be read after one. */
const UNDEFINED_STATUS = new Set([0xf4, 0xf5, 0xf9, 0xfd]);

function readDivision(raw: number, offset: number): TimeDivision {
	if ((raw & 0x8000) === 0) {
		if (raw === 0) throw new SmfFormatError('time division of 0 ticks per quarter note', offset);
		return { kind: 'ppq', ticksPerQuarter: raw };
	}
	// The high byte is a negative frame rate in two's complement: 0xE8 is −24.
	const code = 256 - (raw >> 8);
	const ticksPerFrame = raw & 0xff;
	const rate = code === 29 ? 29.97 : code;
	if (!(rate === 24 || rate === 25 || rate === 29.97 || rate === 30) || ticksPerFrame === 0) {
		throw new SmfFormatError(`unsupported SMPTE time division 0x${raw.toString(16)}`, offset);
	}
	return { kind: 'smpte', framesPerSecond: rate, ticksPerFrame };
}

/**
 * Read a Standard MIDI File. Throws `SmfFormatError` (with the byte offset) when the data is not an
 * SMF, is truncated, or is corrupt: every read is bounds-checked against its chunk. Unknown chunk
 * types are skipped, as the specification asks.
 */
export function readMidiFile(input: ArrayBuffer | ArrayBufferView): MidiFile {
	const bytes = ArrayBuffer.isView(input)
		? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
		: new Uint8Array(input);
	const r = new ByteReader(bytes, 0, bytes.length);

	if (r.id('the header chunk') !== 'MThd') {
		throw new SmfFormatError('not a Standard MIDI File: it does not start with "MThd"', 0);
	}
	const headerLength = r.u32('the header chunk');
	if (headerLength < 6) {
		throw new SmfFormatError(`header chunk is ${headerLength} bytes; it needs at least 6`, 4);
	}
	r.need(headerLength, 'the header chunk');
	const format = r.u16('the header chunk');
	if (format > 2) throw new SmfFormatError(`unknown SMF format ${format}`, 8);
	const trackCount = r.u16('the header chunk');
	const division = readDivision(r.u16('the header chunk'), 12);
	r.pos = 8 + headerLength; // longer headers are allowed; the extra bytes are skipped

	const tracks: MidiTrack[] = [];
	while (tracks.length < trackCount) {
		if (r.remaining === 0) {
			throw new SmfFormatError(
				`file ends after ${tracks.length} of ${trackCount} track chunks`,
				r.pos
			);
		}
		const id = r.id('a chunk header');
		const length = r.u32('a chunk header');
		r.need(length, `the "${id}" chunk`);
		const start = r.pos;
		r.pos += length;
		if (id === 'MTrk') tracks.push(readTrack(bytes, start, start + length));
	}
	return { format: format as SmfFormat, division, tracks };
}

function readTrack(bytes: Uint8Array, start: number, end: number): MidiTrack {
	const r = new ByteReader(bytes, start, end);
	const track: MidiTrack = { events: [] };
	let tick = 0;
	// Running status: the last channel status byte. It carries across meta and SysEx events here,
	// which a conforming file never relies on, so tolerating it can only help with sloppy ones.
	let running = 0;
	// A SysEx sent in packets: an F0 packet without its F7, awaiting F7 continuation packets.
	let divided: number[] | null = null;

	while (r.remaining > 0) {
		const delta = r.vlq('a delta time');
		tick += delta;
		const at = r.pos;
		const first = r.u8('an event');

		if (first === 0xff) {
			const subtype = r.u8('a meta event');
			const data = r.take(r.vlq('a meta event length'), 'a meta event');
			const meta = decodeMeta(subtype, data, at);
			track.events.push({ delta, tick, event: meta });
			divided = null;
			if (subtype === 0x03 && track.name === undefined) track.name = meta.text;
			if (subtype === 0x2f) break; // anything after End of Track is not part of the track
			continue;
		}

		if (first === Status.SysExStart || first === Status.SysExEnd) {
			const packet = r.take(r.vlq('a SysEx length'), 'a SysEx event');
			if (first === Status.SysExEnd && !divided) {
				track.events.push({ delta, tick, event: { type: 'escape', data: packet } });
				continue;
			}
			const closed = packet[packet.length - 1] === Status.SysExEnd;
			const body = closed ? packet.slice(0, -1) : packet;
			if (!body.every(isDataByte)) {
				throw new SmfFormatError('SysEx event contains a byte of 0x80 or more', at);
			}
			if (first === Status.SysExStart) {
				track.events.push({ delta, tick, event: { type: 'sysex', data: body } });
				divided = closed ? null : body;
			} else {
				// A continuation packet: its bytes belong to the SysEx the F0 packet started.
				for (const byte of body) divided?.push(byte);
				if (closed) divided = null;
			}
			continue;
		}

		let status = first;
		if (first < 0x80) {
			if (running === 0) throw new SmfFormatError('data byte where a status byte belongs', at);
			status = running;
			r.pos = at; // that byte was the first data byte
		} else if (first < 0xf0) {
			running = first;
		} else if (UNDEFINED_STATUS.has(first)) {
			throw new SmfFormatError(`undefined status byte 0x${first.toString(16)}`, at);
		} else {
			// System Common or Real Time inside a track: outside the SMF spec, but unambiguous.
			running = 0;
		}
		const data = r.take(dataByteCount(status), 'a MIDI event');
		if (!data.every(isDataByte)) {
			throw new SmfFormatError('MIDI event has a data byte of 0x80 or more', at);
		}
		track.events.push({ delta, tick, event: parse([status, ...data]) });
		divided = null;
	}
	return track;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/** A byte buffer that doubles as needed; no spreading, so track size is only bounded by memory. */
class ByteWriter {
	#buf = new Uint8Array(256);
	#length = 0;

	get length(): number {
		return this.#length;
	}

	#reserve(count: number): void {
		const needed = this.#length + count;
		if (needed <= this.#buf.length) return;
		let size = this.#buf.length * 2;
		while (size < needed) size *= 2;
		const next = new Uint8Array(size);
		next.set(this.#buf.subarray(0, this.#length));
		this.#buf = next;
	}

	u8(value: number): void {
		this.#reserve(1);
		this.#buf[this.#length++] = value;
	}

	u16(value: number): void {
		this.u8((value >> 8) & 0xff);
		this.u8(value & 0xff);
	}

	u32(value: number): void {
		this.u16((value >>> 16) & 0xffff);
		this.u16(value & 0xffff);
	}

	bytes(source: ArrayLike<number>): void {
		this.#reserve(source.length);
		this.#buf.set(source, this.#length);
		this.#length += source.length;
	}

	vlq(value: number): void {
		this.bytes(encodeVlq(value));
	}

	ascii(text: string): void {
		for (let i = 0; i < text.length; i++) this.u8(text.charCodeAt(i));
	}

	setU32(at: number, value: number): void {
		this.#buf[at] = (value >>> 24) & 0xff;
		this.#buf[at + 1] = (value >>> 16) & 0xff;
		this.#buf[at + 2] = (value >>> 8) & 0xff;
		this.#buf[at + 3] = value & 0xff;
	}

	result(): Uint8Array {
		return this.#buf.slice(0, this.#length);
	}
}

/** Options for `encodeMidiFile`. */
export interface EncodeOptions {
	/**
	 * Omit repeated channel status bytes (SMF running status); files get smaller. Default false:
	 * every event carries its status byte, which every reader accepts.
	 */
	runningStatus?: boolean;
}

function encodeDivision(division: TimeDivision): number {
	if (division.kind === 'ppq') {
		assertIntInRange(division.ticksPerQuarter, 1, 0x7fff, 'division.ticksPerQuarter');
		return division.ticksPerQuarter;
	}
	const rate = division.framesPerSecond;
	if (!(rate === 24 || rate === 25 || rate === 29.97 || rate === 30)) {
		throw new MidiRangeError('division.framesPerSecond', rate, '24, 25, 29.97 or 30');
	}
	assertIntInRange(division.ticksPerFrame, 1, 255, 'division.ticksPerFrame');
	return ((256 - (rate === 29.97 ? 29 : rate)) << 8) | division.ticksPerFrame;
}

/**
 * Serialise a file exactly as given: format, division and every track's events (sorted by tick,
 * keeping the order of events that share a tick). Each track gets one End of Track, at its latest
 * End of Track event or its last event, whichever is later, so re-encoding a file read from disk
 * keeps each track's length. Channel messages are validated (`MidiRangeError` on channel 16, a data
 * value of 128, …). System Common and Real Time messages are written as `F7` escapes, the form the
 * specification allows in a file.
 */
export function encodeMidiFile(file: FileInput, opts: EncodeOptions = {}): Uint8Array {
	const { format, tracks } = file;
	if (format !== 0 && format !== 1 && format !== 2) {
		throw new MidiRangeError('format', format, '0, 1 or 2');
	}
	if (format === 0) assertIntInRange(tracks.length, 1, 1, 'tracks.length', 'format 0 is one track');
	else assertIntInRange(tracks.length, 1, 0xffff, 'tracks.length');

	const w = new ByteWriter();
	w.ascii('MThd');
	w.u32(6);
	w.u16(format);
	w.u16(tracks.length);
	w.u16(encodeDivision(file.division));
	tracks.forEach((track, i) => writeTrack(w, track, `tracks[${i}]`, opts.runningStatus ?? false));
	return w.result();
}

function writeTrack(w: ByteWriter, track: TrackInput, field: string, useRunning: boolean): void {
	track.events.forEach((e, i) =>
		assertIntInRange(e.tick, 0, Number.MAX_SAFE_INTEGER, `${field}.events[${i}].tick`)
	);
	const ordered = [...track.events].sort((a, b) => a.tick - b.tick);

	w.ascii('MTrk');
	const lengthAt = w.length;
	w.u32(0);
	const bodyStart = w.length;
	let last = 0;
	let running = 0;
	let end = 0;
	for (const { tick, event } of ordered) {
		end = Math.max(end, tick);
		if (isEndOfTrack(event)) continue;
		writeDelta(w, tick - last, tick, field);
		last = tick;
		running = writeEvent(w, event, running, useRunning, field);
	}
	writeDelta(w, end - last, end, field);
	w.bytes([0xff, 0x2f, 0x00]);
	w.setU32(lengthAt, w.length - bodyStart);
}

function writeDelta(w: ByteWriter, delta: number, tick: number, field: string): void {
	if (delta > VLQ_MAX) {
		throw new MidiRangeError(
			`${field} tick`,
			tick,
			`within ${VLQ_MAX} ticks of the event before it (a delta time holds 28 bits)`
		);
	}
	w.vlq(delta);
}

/** Writes one event and returns the running status in effect afterwards. */
function writeEvent(
	w: ByteWriter,
	event: SmfEvent,
	running: number,
	useRunning: boolean,
	field: string
): number {
	if (event.type === 'meta') {
		assertIntInRange(event.subtype, 0, 0x7f, `${field} meta subtype`);
		assertBytes(event.data, `${field} meta data`);
		w.u8(0xff);
		w.u8(event.subtype);
		w.vlq(event.data.length);
		w.bytes(event.data);
		return 0; // meta and SysEx events cancel running status
	}
	if (event.type === 'escape') {
		assertBytes(event.data, `${field} escape data`);
		w.u8(Status.SysExEnd);
		w.vlq(event.data.length);
		w.bytes(event.data);
		return 0;
	}
	const bytes = encode(event);
	const status = bytes[0];
	if (status === Status.SysExStart) {
		w.u8(status);
		w.vlq(bytes.length - 1);
		w.bytes(bytes.subarray(1));
		return 0;
	}
	if (status > Status.SysExStart) {
		w.u8(Status.SysExEnd);
		w.vlq(bytes.length);
		w.bytes(bytes);
		return 0;
	}
	w.bytes(useRunning && status === running ? bytes.subarray(1) : bytes);
	return status;
}

/** Options for `writeMidiFile`. */
export interface WriteOptions {
	/** Ticks per quarter note (default 480). */
	division?: number;
	/** Tempo at the start (default 120 BPM). */
	bpm?: number;
	/** Time signature at the start as `[numerator, denominator]` (default 4/4). */
	timeSignature?: readonly [number, number];
	/** Sequence name, written as the conductor track's name. */
	name?: string;
	/** Omit repeated channel status bytes (see `EncodeOptions`). */
	runningStatus?: boolean;
}

const atZero = (event: SmfEvent): EventAtTick => ({ tick: 0, event });

/**
 * Write a format-1 file: a conductor track (name, tempo, time signature) plus one track per part.
 * A part's `name` becomes its Track Name unless its events already contain one. More tempo changes
 * can go in as `tempoMeta()` events in any part.
 */
export function writeMidiFile(parts: readonly TrackInput[], opts: WriteOptions = {}): Uint8Array {
	const { division = 480, bpm = 120, timeSignature = [4, 4], name, runningStatus } = opts;
	const conductor: EventAtTick[] = [];
	if (name !== undefined) conductor.push(atZero(textMeta(0x03, name)));
	conductor.push(atZero(tempoMeta(bpm)), atZero(timeSignatureMeta(...timeSignature)));

	const tracks = parts.map((part): TrackInput => {
		const named = part.events.some((e) => e.event.type === 'meta' && e.event.subtype === 0x03);
		if (part.name === undefined || named) return part;
		return { events: [atZero(textMeta(0x03, part.name)), ...part.events] };
	});
	return encodeMidiFile(
		{
			format: 1,
			division: { kind: 'ppq', ticksPerQuarter: division },
			tracks: [{ events: conductor }, ...tracks]
		},
		{ runningStatus }
	);
}

/* -------------------------------------------------------------------------- */
/* Time: the tempo map                                                         */
/* -------------------------------------------------------------------------- */

/** The tempo before any Set Tempo event: 500,000 µs per quarter note, i.e. 120 BPM (SMF 1.0). */
export const DEFAULT_US_PER_QUARTER = 500_000;

/** A tempo in force from `tick` on, and the wall-clock time at which it starts. */
export interface TempoPoint {
	tick: number;
	usPerQuarter: number;
	/** Milliseconds from the start of the file to `tick`. */
	ms: number;
}

/** Everything needed to turn ticks into milliseconds. */
export interface TempoMap {
	division: TimeDivision;
	/** Sorted by tick; the first point is always at tick 0. */
	points: readonly TempoPoint[];
}

/**
 * Build the tempo map. Formats 0 and 1 share one map, gathered from every track (tempo belongs in
 * the first track, but misplaced events are honoured). Format 2 tracks are independent, so pass
 * which track's map you want. Ignored for SMPTE files, where ticks are absolute.
 */
export function tempoMap(file: FileInput, track = 0): TempoMap {
	let sources = file.tracks;
	if (file.format === 2) {
		assertIntInRange(track, 0, file.tracks.length - 1, 'track');
		sources = [file.tracks[track]];
	}
	const changes: Array<{ tick: number; us: number }> = [];
	for (const t of sources) {
		for (const { tick, event } of t.events) {
			if (event.type === 'meta' && event.usPerQuarter !== undefined) {
				changes.push({ tick, us: event.usPerQuarter });
			}
		}
	}
	changes.sort((a, b) => a.tick - b.tick);

	const ppq = file.division.kind === 'ppq' ? file.division.ticksPerQuarter : 1;
	const points: TempoPoint[] = [{ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER, ms: 0 }];
	for (const { tick, us } of changes) {
		const prev = points[points.length - 1];
		if (tick === prev.tick) {
			prev.usPerQuarter = us; // several at one tick: the last one wins
			continue;
		}
		const ms = prev.ms + ((tick - prev.tick) * prev.usPerQuarter) / ppq / 1000;
		points.push({ tick, usPerQuarter: us, ms });
	}
	return { division: file.division, points };
}

/** Milliseconds from the start of the file to `tick` (fractional ticks allowed). */
export function tickToMs(map: TempoMap, tick: number): number {
	if (!(Number.isFinite(tick) && tick >= 0)) {
		throw new MidiRangeError('tick', tick, 'a finite number of ticks ≥ 0');
	}
	const division = map.division;
	if (division.kind === 'smpte') {
		return (tick / (division.framesPerSecond * division.ticksPerFrame)) * 1000;
	}
	const points = map.points;
	let lo = 0;
	let hi = points.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (points[mid].tick <= tick) lo = mid;
		else hi = mid - 1;
	}
	const p = points[lo];
	return p.ms + ((tick - p.tick) * p.usPerQuarter) / division.ticksPerQuarter / 1000;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */
/* -------------------------------------------------------------------------- */

/** An overview of a file. */
export interface FileSummary {
	format: SmfFormat;
	division: TimeDivision;
	trackCount: number;
	eventCount: number;
	noteCount: number;
	channelsUsed: number[];
	durationTicks: number;
	/** Wall-clock length, following every tempo change. */
	durationSeconds: number;
	/** Tempo at the start, in BPM. */
	tempo: number;
	/** How many Set Tempo events the file holds. */
	tempoChanges: number;
	/** The first time signature, e.g. `3/4`; `4/4` when the file does not say. */
	timeSignature: string;
	names: string[];
}

/** Summarise a file: counts, channels, names, the starting tempo and the real duration. */
export function summarise(file: FileInput): FileSummary {
	let eventCount = 0;
	let noteCount = 0;
	let durationTicks = 0;
	let durationMs = 0;
	let tempoChanges = 0;
	let signatureTick = Infinity;
	let timeSignature = '4/4';
	const channels = new Set<number>();
	const names: string[] = [];
	const shared = file.format === 2 ? null : tempoMap(file);

	for (const [i, track] of file.tracks.entries()) {
		const map = shared ?? tempoMap(file, i);
		if (track.name !== undefined) names.push(track.name);
		for (const { tick, event } of track.events) {
			eventCount++;
			durationTicks = Math.max(durationTicks, tick);
			durationMs = Math.max(durationMs, tickToMs(map, tick));
			if (event.type === 'meta') {
				if (event.usPerQuarter !== undefined) tempoChanges++;
				const sig = event.timeSignature;
				if (sig && tick < signatureTick) {
					signatureTick = tick;
					timeSignature = `${sig.numerator}/${sig.denominator}`;
				}
			} else if (event.type !== 'escape') {
				if (event.type === 'noteOn') noteCount++;
				if ('channel' in event) channels.add(event.channel);
			}
		}
	}

	const first = shared ?? (file.tracks.length > 0 ? tempoMap(file, 0) : null);
	const startTempo = first?.points[0].usPerQuarter ?? DEFAULT_US_PER_QUARTER;
	return {
		format: file.format,
		division: file.division,
		trackCount: file.tracks.length,
		eventCount,
		noteCount,
		channelsUsed: [...channels].sort((a, b) => a - b),
		durationTicks,
		durationSeconds: durationMs / 1000,
		tempo: 60_000_000 / startTempo,
		tempoChanges,
		timeSignature,
		names
	};
}

/** A MIDI message with its place in time, from `flatten()`. */
export interface TimedEvent {
	tick: number;
	/** Milliseconds from the start, following the tempo map. */
	ms: number;
	/** Index of the track it came from. */
	track: number;
	message: MidiMessage;
}

/**
 * Every MIDI message in the file (meta and escape events left out) in playback order, each stamped
 * with its time in milliseconds from the tempo map. Events at the same moment keep track order,
 * then file order.
 */
export function flatten(file: FileInput): TimedEvent[] {
	const shared = file.format === 2 ? null : tempoMap(file);
	const out: TimedEvent[] = [];
	file.tracks.forEach((track, i) => {
		const map = shared ?? tempoMap(file, i);
		for (const { tick, event } of track.events) {
			if (event.type === 'meta' || event.type === 'escape') continue;
			out.push({ tick, ms: tickToMs(map, tick), track: i, message: event });
		}
	});
	return out.sort((a, b) => a.ms - b.ms);
}
