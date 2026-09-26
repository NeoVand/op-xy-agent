/**
 * Range checks for MIDI values, shared by every encoder in `core/midi` and `core/music`.
 *
 * The rule (docs/ARCHITECTURE.md): invalid input throws a typed error. It is never clamped and
 * never masked. MIDI Lab's encoder computed `0x80 | channel`, so a human-numbered channel 16 turned
 * a Note Off into a Note On on channel 1. Masking with `& 0x0f` would not have fixed that either,
 * it would only have sent to the wrong channel quietly. The one safe answer at the boundary between
 * intent and bytes is to refuse, and to say exactly which field was wrong.
 */

/** Thrown when a value is outside the range its field allows. Nothing in `core` clamps instead. */
export class MidiRangeError extends RangeError {
	override name = 'MidiRangeError';

	constructor(
		/** Which field was wrong, e.g. `noteOn.channel` or `sysex.data[3]`. */
		readonly field: string,
		/** The offending value, exactly as received. */
		readonly value: unknown,
		/** What the field accepts, in words, e.g. `an integer 0–15`. */
		readonly expected: string,
		hint?: string
	) {
		super(`${field} must be ${expected}, got ${show(value)}${hint ? ` (${hint})` : ''}`);
	}
}

function show(value: unknown): string {
	return typeof value === 'string' || Array.isArray(value) ? JSON.stringify(value) : String(value);
}

/** True for an integer `min ≤ value ≤ max`. Rejects non-numbers, NaN and fractions. */
export function isIntInRange(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** True for a MIDI data byte, an integer 0–127. */
export function isDataByte(value: unknown): value is number {
	return isIntInRange(value, 0, 0x7f);
}

/** Throws `MidiRangeError` unless `value` is an integer in `[min, max]`. */
export function assertIntInRange(
	value: unknown,
	min: number,
	max: number,
	field: string,
	hint?: string
): asserts value is number {
	if (!isIntInRange(value, min, max)) {
		throw new MidiRangeError(field, value, `an integer ${min}–${max}`, hint);
	}
}

/**
 * Throws unless `value` is a wire channel, 0–15. Sixteen gets a pointed hint because it is almost
 * always a human channel number (1–16) passed where the wire value belongs.
 */
export function assertChannel(value: unknown, field = 'channel'): asserts value is number {
	assertIntInRange(
		value,
		0,
		15,
		field,
		value === 16 ? 'wire channels are 0–15; humans count 1–16' : undefined
	);
}

/** Throws unless `value` is a 7-bit data value, 0–127. */
export function assertData7(value: unknown, field: string): asserts value is number {
	assertIntInRange(value, 0, 0x7f, field);
}

/** Throws unless `value` is a 14-bit value, 0–16383 (pitch bend, song position, fine RPN data). */
export function assertData14(value: unknown, field: string): asserts value is number {
	assertIntInRange(value, 0, 0x3fff, field);
}

/**
 * Throws unless every element is a data byte (0–127). The field name in the error points at the
 * first bad element, e.g. `sysex.data[3]`, so a 0x80 inside a SysEx payload is easy to find.
 */
export function assertDataBytes(bytes: unknown, field: string): asserts bytes is ArrayLike<number> {
	if (!isArrayLike(bytes)) {
		throw new MidiRangeError(field, bytes, 'an array of data bytes 0–127');
	}
	for (let i = 0; i < bytes.length; i++) assertData7(bytes[i], `${field}[${i}]`);
}

/**
 * Throws unless every element is a byte (0–255). For raw payloads that are not MIDI data, such as
 * meta-event bodies in a MIDI file.
 */
export function assertBytes(bytes: unknown, field: string): asserts bytes is ArrayLike<number> {
	if (!isArrayLike(bytes)) {
		throw new MidiRangeError(field, bytes, 'an array of bytes 0–255');
	}
	for (let i = 0; i < bytes.length; i++) assertIntInRange(bytes[i], 0, 0xff, `${field}[${i}]`);
}

/** Arrays and typed arrays; a DataView or a string does not count. */
function isArrayLike(value: unknown): value is ArrayLike<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { length?: unknown }).length === 'number'
	);
}
