/**
 * Little-endian reads and writes on the decoded image, which is packed and little-endian
 * throughout (docs/research/10-xy-format.md §3), plus the byte-buffer helpers the codec shares.
 */

/** An unsigned byte read as signed (−128…127). */
export const i8 = (b: Uint8Array, at: number): number => (b[at] << 24) >> 24;

/** A u16 at `at`. */
export const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);

/** A u32 at `at`. */
export const u32 = (b: Uint8Array, at: number): number =>
	(b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** An i32 at `at`. */
export const i32 = (b: Uint8Array, at: number): number =>
	b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);

/** Writes the low 16 bits of `value` at `at`. */
export function setU16(b: Uint8Array, at: number, value: number): void {
	b[at] = value & 0xff;
	b[at + 1] = (value >>> 8) & 0xff;
}

/** Writes the low 32 bits of `value` (signed or not) at `at`. */
export function setU32(b: Uint8Array, at: number, value: number): void {
	b[at] = value & 0xff;
	b[at + 1] = (value >>> 8) & 0xff;
	b[at + 2] = (value >>> 16) & 0xff;
	b[at + 3] = (value >>> 24) & 0xff;
}

/** The buffers one after the other in a new buffer. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** Whether two buffers hold the same bytes. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/** A byte as two hex digits, for messages. */
export const hex2 = (value: number): string => `0x${value.toString(16).padStart(2, '0')}`;
