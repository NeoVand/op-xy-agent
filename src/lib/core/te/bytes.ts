// Internal byte helpers shared by the TE modules (not re-exported from index.ts).

import { TeCodecError } from './errors';

/** True when `value` is an integer 0–255. */
export function isByte(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

/** Returns `value` unchanged, or throws a TeCodecError unless it is an integer in [min, max]. */
export function assertIntInRange(value: number, min: number, max: number, what: string): number {
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new TeCodecError(`${what} must be an integer ${min}–${max}, got ${String(value)}`);
	}
	return value;
}

/** Copies `input` into a new Uint8Array; throws a TeCodecError on any value that is not a byte. */
export function toBytes(input: ArrayLike<number>, what: string): Uint8Array {
	const out = new Uint8Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const value = input[i];
		if (!isByte(value)) {
			throw new TeCodecError(`${what}[${i}] is not a byte (0–255): ${String(value)}`);
		}
		out[i] = value;
	}
	return out;
}

/** Big-endian u16 as two bytes. */
export function u16(value: number, what: string): [number, number] {
	assertIntInRange(value, 0, 0xffff, what);
	return [value >> 8, value & 0xff];
}

/** Big-endian u32 as four bytes. */
export function u32(value: number, what: string): [number, number, number, number] {
	assertIntInRange(value, 0, 0xffffffff, what);
	return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/** Reads a big-endian u16; the caller checks bounds. */
export function readU16(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] << 8) | bytes[offset + 1];
}

/** Reads a big-endian u32 (unsigned); the caller checks bounds. */
export function readU32(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) |
			(bytes[offset + 1] << 16) |
			(bytes[offset + 2] << 8) |
			bytes[offset + 3]) >>>
		0
	);
}

/** Decodes bytes as UTF-8 (ASCII in practice); invalid sequences become U+FFFD instead of throwing. */
export function decodeText(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

/**
 * Encodes printable ASCII (0x20–0x7E). TE's own client writes one byte per UTF-16 unit, which would
 * silently mangle anything else, so we refuse it instead.
 */
export function encodeAscii(text: string, what: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 0x20 || code > 0x7e) {
			throw new TeCodecError(
				`${what} must be printable ASCII; character ${i} is U+${code.toString(16).toUpperCase().padStart(4, '0')}`
			);
		}
		out.push(code);
	}
	return out;
}

/** Index of the first NUL at or after `from`, or `bytes.length` when there is none. */
export function nulIndex(bytes: Uint8Array, from: number): number {
	const index = bytes.indexOf(0, from);
	return index === -1 ? bytes.length : index;
}

/** Two-digit uppercase hex, for messages. */
export function hex2(value: number): string {
	return value.toString(16).toUpperCase().padStart(2, '0');
}
