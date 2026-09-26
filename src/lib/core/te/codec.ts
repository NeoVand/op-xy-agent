// TE SysEx codec: packed-7 encoding, request/response framing, frame parsing and status decoding.
// Protocol facts: docs/research/60-firmware.md §4.2 (derived from TE's public web apps). The scheme
// matches research/device/te_sysex_probe.py, which the real OP-XY (OS 1.1.33) answered correctly.

import { assertIntInRange, decodeText, hex2, isByte, toBytes } from './bytes';
import {
	SYSEX_END,
	SYSEX_START,
	TE_DEBUG_MARKER,
	TE_FLAG_HAS_REQUEST_ID,
	TE_FLAG_IS_REQUEST,
	TE_MANUFACTURER_ID,
	TE_PROTOCOL_MARKER,
	TE_REQUEST_ID_MAX,
	TE_STATUS
} from './constants';
import { TeCodecError } from './errors';

// ─── packed-7 ────────────────────────────────────────────────────────────────────────────────────

/** Encoded length of `rawLength` bytes: the bytes plus one flag byte per started group of seven. */
export function packed7Length(rawLength: number): number {
	assertIntInRange(rawLength, 0, Number.MAX_SAFE_INTEGER, 'raw length');
	return rawLength + Math.ceil(rawLength / 7);
}

/** Decoded length of `packedLength` packed bytes. A trailing lone flag byte decodes to nothing. */
export function unpacked7Length(packedLength: number): number {
	assertIntInRange(packedLength, 0, Number.MAX_SAFE_INTEGER, 'packed length');
	const rest = packedLength % 8;
	return Math.floor(packedLength / 8) * 7 + Math.max(0, rest - 1);
}

/**
 * TE packed-7 encoding: each group of up to seven raw bytes becomes one flag byte (bit i = high bit of
 * raw byte i) followed by the seven low parts. Example: `07 D0 00 2C` → `02 07 50 00 2C`.
 * @throws TeCodecError when a value is not a byte.
 */
export function pack7(raw: ArrayLike<number>): Uint8Array {
	const bytes = toBytes(raw, 'raw');
	const out = new Uint8Array(packed7Length(bytes.length));
	let o = 0;
	for (let i = 0; i < bytes.length; i += 7) {
		const flagIndex = o++;
		const end = Math.min(i + 7, bytes.length);
		let flags = 0;
		for (let j = i; j < end; j++) {
			flags |= (bytes[j] >> 7) << (j - i);
			out[o++] = bytes[j] & 0x7f;
		}
		out[flagIndex] = flags;
	}
	return out;
}

/**
 * Inverse of {@link pack7}. Like TE's decoder it ignores a trailing lone flag byte and unused flag
 * bits; {@link isCanonicalPacked7} tells whether the input is exactly what pack7 would produce.
 * @throws TeCodecError when a value is not a 7-bit data byte.
 */
export function unpack7(packed: ArrayLike<number>): Uint8Array {
	for (let i = 0; i < packed.length; i++) {
		const value = packed[i];
		if (!Number.isInteger(value) || value < 0 || value > 0x7f) {
			throw new TeCodecError(`packed[${i}] is not a 7-bit data byte: ${String(value)}`);
		}
	}
	const out = new Uint8Array(unpacked7Length(packed.length));
	let o = 0;
	for (let i = 0; i < packed.length; i += 8) {
		const flags = packed[i];
		const end = Math.min(i + 8, packed.length);
		for (let j = i + 1; j < end; j++) {
			out[o++] = (((flags >> (j - i - 1)) & 1) << 7) | packed[j];
		}
	}
	return out;
}

/** True when `packed` is valid packed-7 and byte-for-byte what {@link pack7} produces for its content. */
export function isCanonicalPacked7(packed: ArrayLike<number>): boolean {
	let decoded: Uint8Array;
	try {
		decoded = unpack7(packed);
	} catch {
		return false;
	}
	const again = pack7(decoded);
	if (again.length !== packed.length) return false;
	for (let i = 0; i < again.length; i++) {
		if (again[i] !== packed[i]) return false;
	}
	return true;
}

// ─── framing ─────────────────────────────────────────────────────────────────────────────────────

/** Fields of a TE request frame. */
export interface TeRequestFrameFields {
	/** SysEx device id from the identity reply (0x21 on the OP-XY), 0–127. */
	readonly deviceId: number;
	/** 12-bit request id, 0–4095. */
	readonly requestId: number;
	/** Command number, 0–127. */
	readonly cmd: number;
	/** Raw payload bytes; the builder packs them. */
	readonly payload?: ArrayLike<number>;
}

/** Fields of a TE response frame (what the device sends back). */
export interface TeResponseFrameFields {
	/** SysEx device id, 0–127. */
	readonly deviceId: number;
	/** Request id being answered, 0–4095. */
	readonly requestId: number;
	/** Command number being answered, 0–127. */
	readonly cmd: number;
	/** Status byte, 0–127. */
	readonly status: number;
	/** Raw reply data; the builder packs it. */
	readonly data?: ArrayLike<number>;
}

/**
 * Builds `F0 00 20 76 <dev> 40 <0x60 | rid[11:7]> <rid[6:0]> <cmd> <packed payload…> F7`.
 * Every frame still has to pass `policy.assertSendable` before it is sent.
 * @throws TeCodecError on out-of-range fields or payload values.
 */
export function buildRequestFrame(fields: TeRequestFrameFields): Uint8Array {
	const deviceId = assertIntInRange(fields.deviceId, 0, 0x7f, 'device id');
	const requestId = assertIntInRange(fields.requestId, 0, TE_REQUEST_ID_MAX, 'request id');
	const cmd = assertIntInRange(fields.cmd, 0, 0x7f, 'command');
	const flags = TE_FLAG_IS_REQUEST | TE_FLAG_HAS_REQUEST_ID | (requestId >> 7);
	return assemble(
		[deviceId, TE_PROTOCOL_MARKER, flags, requestId & 0x7f, cmd],
		pack7(fields.payload ?? [])
	);
}

/**
 * Builds a device-side response frame `F0 00 20 76 <dev> 40 <0x20 | rid[11:7]> <rid[6:0]> <cmd>
 * <status> <packed data…> F7`. The app never sends these; they are for fakes and tests.
 * @throws TeCodecError on out-of-range fields or data values.
 */
export function buildResponseFrame(fields: TeResponseFrameFields): Uint8Array {
	const deviceId = assertIntInRange(fields.deviceId, 0, 0x7f, 'device id');
	const requestId = assertIntInRange(fields.requestId, 0, TE_REQUEST_ID_MAX, 'request id');
	const cmd = assertIntInRange(fields.cmd, 0, 0x7f, 'command');
	const status = assertIntInRange(fields.status, 0, 0x7f, 'status');
	const flags = TE_FLAG_HAS_REQUEST_ID | (requestId >> 7);
	const header = [deviceId, TE_PROTOCOL_MARKER, flags, requestId & 0x7f, cmd, status];
	return assemble(header, pack7(fields.data ?? []));
}

function assemble(header: readonly number[], packed: Uint8Array): Uint8Array {
	const out = new Uint8Array(4 + header.length + packed.length + 1);
	out.set([SYSEX_START, ...TE_MANUFACTURER_ID, ...header]);
	out.set(packed, 4 + header.length);
	out[out.length - 1] = SYSEX_END;
	return out;
}

/** The 12-bit request id carried in byte 6 (low 5 bits) and byte 7. */
export function requestIdFromBytes(byte6: number, byte7: number): number {
	return ((byte6 & 0x1f) << 7) | (byte7 & 0x7f);
}

/** A TE request: normally our own request echoed back by the device, which must be ignored. */
export interface TeRequestFrame {
	readonly kind: 'request';
	readonly deviceId: number;
	/** Null when the request-id flag is not set. */
	readonly requestId: number | null;
	readonly cmd: number;
	/** Unpacked payload. */
	readonly payload: Uint8Array;
}

/** A reply to one of our requests. */
export interface TeResponseFrame {
	readonly kind: 'response';
	readonly deviceId: number;
	readonly requestId: number;
	readonly cmd: number;
	/** Status byte; see {@link decodeStatus}. */
	readonly status: number;
	/** Unpacked data (an ASCII reason for error statuses). */
	readonly data: Uint8Array;
}

/** An unsolicited frame (no request id), e.g. a FILE event on EP devices. */
export interface TeEventFrame {
	readonly kind: 'event';
	readonly deviceId: number;
	readonly cmd: number;
	/** Status byte, laid out as in a response. */
	readonly status: number;
	/** Unpacked data; for FILE events the first byte is the event type. */
	readonly data: Uint8Array;
}

/** A firmware debug log line (`… 33 <ASCII> F7`). Stop all TE traffic when one arrives. */
export interface TeDebugFrame {
	readonly kind: 'debug';
	readonly deviceId: number;
	readonly text: string;
}

/** Starts like a TE protocol frame but cannot be parsed. */
export interface TeMalformedFrame {
	readonly kind: 'malformed';
	readonly reason: string;
}

/** Anything that is not a TE protocol or debug frame (notes, CCs, identity replies, other SysEx…). */
export interface TeForeignFrame {
	readonly kind: 'not-te';
}

/** Result of {@link parseFrame}. */
export type TeFrame =
	| TeRequestFrame
	| TeResponseFrame
	| TeEventFrame
	| TeDebugFrame
	| TeMalformedFrame
	| TeForeignFrame;

const NOT_TE: TeForeignFrame = { kind: 'not-te' };

function malformed(reason: string): TeMalformedFrame {
	return { kind: 'malformed', reason };
}

/**
 * Classifies one incoming MIDI message. Never throws: anything unexpected is `malformed` or
 * `not-te`. A debug frame is reported even when truncated, because it means "stop".
 */
export function parseFrame(input: ArrayLike<number>): TeFrame {
	const n = input.length;
	if (
		n < 4 ||
		input[0] !== SYSEX_START ||
		input[1] !== TE_MANUFACTURER_ID[0] ||
		input[2] !== TE_MANUFACTURER_ID[1] ||
		input[3] !== TE_MANUFACTURER_ID[2]
	) {
		return NOT_TE;
	}
	for (let i = 0; i < n; i++) {
		if (!isByte(input[i])) return malformed(`value at index ${i} is not a byte`);
	}
	const bytes = Uint8Array.from(input);
	const hasEnd = bytes[n - 1] === SYSEX_END;
	const end = hasEnd ? n - 1 : n;
	if (end < 6 || bytes[4] > 0x7f || bytes[5] > 0x7f) {
		return malformed('truncated TE frame (no device id or marker byte)');
	}
	const deviceId = bytes[4];
	const marker = bytes[5];
	if (marker === TE_DEBUG_MARKER) {
		return { kind: 'debug', deviceId, text: decodeText(bytes.subarray(6, end)) };
	}
	if (marker !== TE_PROTOCOL_MARKER) return NOT_TE;
	if (!hasEnd) return malformed('TE frame does not end with F7');
	for (let i = 6; i < end; i++) {
		if (bytes[i] > 0x7f)
			return malformed(`byte 0x${hex2(bytes[i])} at index ${i} inside a TE frame`);
	}
	if (n < 10) return malformed('truncated TE frame (no command byte)');
	const flags = bytes[6];
	const cmd = bytes[8];
	const requestId = requestIdFromBytes(flags, bytes[7]);
	const hasRequestId = (flags & TE_FLAG_HAS_REQUEST_ID) !== 0;
	if ((flags & TE_FLAG_IS_REQUEST) !== 0) {
		return {
			kind: 'request',
			deviceId,
			requestId: hasRequestId ? requestId : null,
			cmd,
			payload: unpack7(bytes.subarray(9, end))
		};
	}
	if (n < 11) return malformed('TE response without a status byte');
	const status = bytes[9];
	const data = unpack7(bytes.subarray(10, end));
	return hasRequestId
		? { kind: 'response', deviceId, requestId, cmd, status, data }
		: { kind: 'event', deviceId, cmd, status, data };
}

// ─── status ──────────────────────────────────────────────────────────────────────────────────────

/** Category of a status byte. */
export type TeStatusKind =
	| 'ok'
	| 'error'
	| 'command-not-found'
	| 'bad-request'
	| 'reserved'
	| 'specific-error'
	| 'in-progress';

/** A decoded status byte. */
export interface TeStatusInfo {
	/** The raw status byte. */
	readonly code: number;
	readonly kind: TeStatusKind;
	/** Human-readable label, e.g. "command not found". */
	readonly label: string;
	/** False only for in-progress statuses (≥ 64): the request stays open and its timeout restarts. */
	readonly final: boolean;
}

/**
 * Decodes a response status byte: 0 ok, 1 error, 2 command not found, 3 bad request, 4–15 reserved,
 * 16–63 command-specific error, ≥ 64 command-specific success / in progress.
 * @throws TeCodecError when `code` is not 0–127.
 */
export function decodeStatus(code: number): TeStatusInfo {
	assertIntInRange(code, 0, 0x7f, 'status');
	if (code === TE_STATUS.OK) return { code, kind: 'ok', label: 'ok', final: true };
	if (code === TE_STATUS.ERROR) return { code, kind: 'error', label: 'error', final: true };
	if (code === TE_STATUS.COMMAND_NOT_FOUND) {
		return { code, kind: 'command-not-found', label: 'command not found', final: true };
	}
	if (code === TE_STATUS.BAD_REQUEST) {
		return { code, kind: 'bad-request', label: 'bad request', final: true };
	}
	if (code < TE_STATUS.SPECIFIC_ERROR_START) {
		return { code, kind: 'reserved', label: 'reserved', final: true };
	}
	if (code <= TE_STATUS.SPECIFIC_ERROR_END) {
		return { code, kind: 'specific-error', label: 'command-specific error', final: true };
	}
	return {
		code,
		kind: 'in-progress',
		label: 'command-specific success / in progress',
		final: false
	};
}
