// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/sysex.ts

/**
 * System Exclusive: the manufacturer-private escape hatch.
 *
 * Everything else in MIDI is a tiny, fixed, universally understood message. SysEx is an arbitrarily
 * long block addressed to one manufacturer and meaning whatever they decided: patch dumps,
 * settings, file transfers and firmware updates. That last one is why browsers put SysEx behind a
 * separate permission, and why this app sends only allowlisted SysEx (the policy lives in
 * `core/te/policy.ts`; this module only builds, parses and describes).
 *
 * Byte buffers built here are `Uint8Array`. Inputs accept any `ArrayLike<number>`, so a Web MIDI
 * event's `data`, a plain array or a `Uint8Array` all work.
 */

import { MANUFACTURERS_1BYTE, MANUFACTURERS_3BYTE, manufacturerName } from './constants';
import {
	assertBytes,
	assertData7,
	assertDataBytes,
	assertIntInRange,
	isDataByte
} from './validate';

/** SysEx start byte. */
export const SYSEX_START = 0xf0;
/** End Of Exclusive. */
export const SYSEX_END = 0xf7;

/** First payload byte of a Universal Non-Real Time message. */
export const UNIVERSAL_NON_REALTIME = 0x7e;
/** First payload byte of a Universal Real Time message. */
export const UNIVERSAL_REALTIME = 0x7f;
/** Device ID meaning "every device, please answer". */
export const ALL_CALL = 0x7f;

/** Thrown for malformed SysEx input, including hex text that does not spell whole bytes. */
export class SysExError extends Error {
	override name = 'SysExError';
}

/**
 * The Universal Identity Request, `F0 7E <device> 06 01 F7`: "identify yourself". Read-only; every
 * compliant device answers with its manufacturer, family and version.
 */
export function identityRequest(deviceId = ALL_CALL): Uint8Array {
	assertData7(deviceId, 'deviceId');
	return Uint8Array.of(SYSEX_START, UNIVERSAL_NON_REALTIME, deviceId, 0x06, 0x01, SYSEX_END);
}

/**
 * True when `bytes` is exactly a Universal Identity Request to any device ID. The OP-XY echoes
 * foreign SysEx back to the host by default, so the input side needs to recognise its own request.
 */
export function isIdentityRequest(bytes: ArrayLike<number>): boolean {
	return (
		bytes.length === 6 &&
		bytes[0] === SYSEX_START &&
		bytes[1] === UNIVERSAL_NON_REALTIME &&
		isDataByte(bytes[2]) &&
		bytes[3] === 0x06 &&
		bytes[4] === 0x01 &&
		bytes[5] === SYSEX_END
	);
}

/** What a Universal Identity Reply says about the device. */
export interface IdentityReply {
	/** SysEx device ID the reply came from (0x21 on the OP-XY). */
	deviceId: number;
	/** One or three bytes. */
	manufacturerId: number[];
	manufacturer: string;
	/** 14-bit family code, sent LSB first. */
	family: number;
	/** 14-bit family member, sent LSB first. */
	member: number;
	/** The four software revision bytes as sent. */
	version: number[];
	/** The revision bytes joined with dots, e.g. `0.0.0.0`. */
	versionString: string;
}

/**
 * Parse a Universal Identity Reply, `F0 7E <device> 06 02 <manufacturer> <family ×2> <member ×2>
 * <version ×4> F7`. Accepts the whole message or only the payload between F0 and F7. Returns null
 * for anything that is not a complete, well-formed reply (MIDI Lab filled missing bytes with
 * zeros).
 *
 * The owner's OP-XY on OS 1.1.33 replies `F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7`:
 * device 0x21, Teenage Engineering, family 0x21, member 1, and an all-zero version, so the OS
 * version has to come from TE's GREET command instead (docs/research/90-device-probe.md).
 */
export function parseIdentityReply(bytes: ArrayLike<number>): IdentityReply | null {
	const data = payload(bytes);
	if (!data || !data.every(isDataByte)) return null;
	if (data[0] !== UNIVERSAL_NON_REALTIME || data[2] !== 0x06 || data[3] !== 0x02) return null;
	const idLength = data[4] === 0x00 ? 3 : 1;
	const at = 4 + idLength;
	// Some devices append extra bytes after the version; only a short reply is refused.
	if (data.length < at + 8) return null;
	const manufacturerId = data.slice(4, at);
	const version = data.slice(at + 4, at + 8);
	return {
		deviceId: data[1],
		manufacturerId,
		manufacturer: manufacturerName(manufacturerId),
		family: data[at] | (data[at + 1] << 7),
		member: data[at + 2] | (data[at + 3] << 7),
		version,
		versionString: version.join('.')
	};
}

/** The bytes between F0 and F7, or the input itself when it carries no framing. */
function payload(bytes: ArrayLike<number>): number[] | null {
	const all = Array.from(bytes);
	if (all[0] !== SYSEX_START) return all;
	return all.length >= 2 && all[all.length - 1] === SYSEX_END ? all.slice(1, -1) : null;
}

/**
 * Roland-style checksum: the value that makes the addressed data bytes sum to 0 modulo 128.
 * Every byte must be a data byte (0–127); a status byte here is a bug in the caller.
 */
export function rolandChecksum(bytes: ArrayLike<number>): number {
	assertDataBytes(bytes, 'bytes');
	let sum = 0;
	for (let i = 0; i < bytes.length; i++) sum += bytes[i];
	return (128 - (sum % 128)) % 128;
}

/** Yamaha-style checksum over a data block: the same arithmetic as Roland, different framing. */
export function yamahaChecksum(bytes: ArrayLike<number>): number {
	return rolandChecksum(bytes);
}

/** The outcome of `validateSysEx`. */
export type SysExValidation = { ok: true } | { ok: false; problem: string };

/** Is this a well-formed SysEx message: F0, data bytes only, F7? */
export function validateSysEx(bytes: ArrayLike<number>): SysExValidation {
	if (bytes.length < 3) return { ok: false, problem: 'Too short to be a SysEx message.' };
	if (bytes[0] !== SYSEX_START) return { ok: false, problem: 'Must begin with F0.' };
	if (bytes[bytes.length - 1] !== SYSEX_END) return { ok: false, problem: 'Must end with F7.' };
	for (let i = 1; i < bytes.length - 1; i++) {
		if (!isDataByte(bytes[i])) {
			return {
				ok: false,
				problem: `Byte ${i} is ${showByte(bytes[i])} — everything between F0 and F7 must be a data byte (00–7F).`
			};
		}
	}
	return { ok: true };
}

/** Throws `SysExError` unless `validateSysEx` accepts the bytes. */
export function assertSysEx(bytes: ArrayLike<number>): void {
	const result = validateSysEx(bytes);
	if (!result.ok) throw new SysExError(result.problem);
}

function showByte(value: number): string {
	return Number.isInteger(value) && value >= 0 && value <= 0xff
		? `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
		: String(value);
}

/**
 * Parse hex text such as `F0 7E 7F 06 01 F7`, `0xF0,0x7E` or `f07e7f0601f7`. Tokens are separated
 * by whitespace, commas or semicolons, and each must spell whole bytes. Throws `SysExError` on an
 * odd digit count or a stray character (MIDI Lab silently dropped both).
 */
export function parseHexString(input: string): Uint8Array {
	const out: number[] = [];
	for (const token of input.split(/[\s,;]+/)) {
		if (token === '') continue;
		const digits = token.replace(/^0x/i, '');
		if (!/^[0-9a-f]*$/i.test(digits) || digits === '') {
			throw new SysExError(`"${token}" is not hex.`);
		}
		if (digits.length % 2 !== 0) {
			throw new SysExError(`"${token}" has an odd number of hex digits; bytes take two each.`);
		}
		for (let i = 0; i < digits.length; i += 2) out.push(parseInt(digits.slice(i, i + 2), 16));
	}
	return Uint8Array.from(out);
}

/** Format bytes as uppercase hex, `perLine` bytes to a line. */
export function formatHexString(bytes: ArrayLike<number>, perLine = 16): string {
	assertBytes(bytes, 'bytes');
	assertIntInRange(perLine, 1, Number.MAX_SAFE_INTEGER, 'perLine');
	const all = Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0'));
	const lines: string[] = [];
	for (let i = 0; i < all.length; i += perLine) lines.push(all.slice(i, i + perLine).join(' '));
	return lines.join('\n');
}

/**
 * Universal Non-Real Time sub-IDs (the byte after the device ID in a `7E` message), per the MIDI
 * 1.0 specification. Real Time (`7F`) messages use a different table; MIDI Lab mixed the two.
 */
const NON_REALTIME_SUBIDS: Readonly<Record<number, string>> = {
	0x01: 'Sample Dump Header',
	0x02: 'Sample Data Packet',
	0x03: 'Sample Dump Request',
	0x04: 'MIDI Time Code Cueing',
	0x05: 'Sample Dump Extensions',
	0x06: 'General Information (Identity)',
	0x07: 'File Dump',
	0x08: 'MIDI Tuning Standard',
	0x09: 'General MIDI System',
	0x0a: 'Downloadable Sounds',
	0x0b: 'File Reference',
	0x0c: 'MIDI Visual Control',
	0x0d: 'MIDI Capability Inquiry (MIDI-CI)',
	0x7b: 'End of File',
	0x7c: 'Wait',
	0x7d: 'Cancel',
	0x7e: 'NAK',
	0x7f: 'ACK'
};

/** Universal Real Time sub-IDs (the byte after the device ID in a `7F` message). */
const REALTIME_SUBIDS: Readonly<Record<number, string>> = {
	0x01: 'MIDI Time Code',
	0x02: 'MIDI Show Control',
	0x03: 'Notation Information',
	0x04: 'Device Control',
	0x05: 'Real Time MTC Cueing',
	0x06: 'MIDI Machine Control Command',
	0x07: 'MIDI Machine Control Response',
	0x08: 'MIDI Tuning Standard (Real Time)',
	0x09: 'Controller Destination Setting',
	0x0a: 'Key-based Instrument Control',
	0x0b: 'Scalable Polyphony MIP',
	0x0c: 'Mobile Phone Control'
};

/** Name of a Universal SysEx sub-ID, or undefined when the specification does not name it. */
export function universalSubIdName(realtime: boolean, subId: number): string | undefined {
	return (realtime ? REALTIME_SUBIDS : NON_REALTIME_SUBIDS)[subId];
}

/** A readable summary of a SysEx payload. */
export interface SysExDescription {
	kind: 'universal-nonrealtime' | 'universal-realtime' | 'manufacturer' | 'invalid';
	manufacturer: string;
	summary: string;
}

/** Summarise a SysEx payload (the bytes between F0 and F7). */
export function describeSysEx(data: ArrayLike<number>): SysExDescription {
	if (data.length === 0) return { kind: 'invalid', manufacturer: '—', summary: 'Empty message.' };
	if (data[0] === UNIVERSAL_NON_REALTIME || data[0] === UNIVERSAL_REALTIME) {
		const realtime = data[0] === UNIVERSAL_REALTIME;
		const subId = data[2];
		const sub =
			subId === undefined
				? 'no sub-ID'
				: (universalSubIdName(realtime, subId) ?? `sub-ID ${showByte(subId)}`);
		const variant = data[3] === undefined ? '' : `, variant ${showByte(data[3])}`;
		return {
			kind: realtime ? 'universal-realtime' : 'universal-nonrealtime',
			manufacturer: realtime ? 'Universal Real Time' : 'Universal Non-Real Time',
			summary: `${sub}${variant} — understood by any compliant device, whoever made it.`
		};
	}
	return {
		kind: 'manufacturer',
		manufacturer: manufacturerName(data),
		summary: `${data.length} bytes between F0 and F7, all of them private. Only that manufacturer's devices know what they mean; everything else on the wire ignores them.`
	};
}

/** Every manufacturer name in the tables, sorted by name, for reference views. */
export function knownManufacturers(): Array<{ id: string; name: string }> {
	const out: Array<{ id: string; name: string }> = [];
	for (const [k, v] of Object.entries(MANUFACTURERS_1BYTE)) {
		out.push({ id: Number(k).toString(16).toUpperCase().padStart(2, '0'), name: v });
	}
	for (const [k, v] of Object.entries(MANUFACTURERS_3BYTE)) {
		out.push({ id: `00 ${k.replace(':', ' ').toUpperCase()}`, name: v });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}
