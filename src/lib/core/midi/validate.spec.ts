import { describe, expect, it } from 'vitest';
import {
	assertBytes,
	assertChannel,
	assertData14,
	assertData7,
	assertDataBytes,
	assertIntInRange,
	isDataByte,
	isIntInRange,
	MidiRangeError
} from './validate';

describe('MidiRangeError', () => {
	it('is a typed RangeError that names the field, the value and the range', () => {
		const err = new MidiRangeError('noteOn.note', 128, 'an integer 0–127');
		expect(err).toBeInstanceOf(RangeError);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe('MidiRangeError');
		expect(err.field).toBe('noteOn.note');
		expect(err.value).toBe(128);
		expect(err.expected).toBe('an integer 0–127');
		expect(err.message).toBe('noteOn.note must be an integer 0–127, got 128');
	});

	it('quotes strings and arrays and appends a hint', () => {
		expect(new MidiRangeError('kind', 'x', "'rpn'").message).toBe(`kind must be 'rpn', got "x"`);
		expect(new MidiRangeError('data', [], 'bytes', 'why').message).toBe(
			'data must be bytes, got [] (why)'
		);
	});
});

describe('range predicates', () => {
	it('accepts only integers inside the range', () => {
		expect(isIntInRange(5, 0, 10)).toBe(true);
		expect(isIntInRange(0, 0, 10)).toBe(true);
		expect(isIntInRange(10, 0, 10)).toBe(true);
		expect(isIntInRange(11, 0, 10)).toBe(false);
		expect(isIntInRange(-1, 0, 10)).toBe(false);
		expect(isIntInRange(1.5, 0, 10)).toBe(false);
		expect(isIntInRange(Number.NaN, 0, 10)).toBe(false);
		expect(isIntInRange('5', 0, 10)).toBe(false);
		expect(isIntInRange(undefined, 0, 10)).toBe(false);
	});

	it('knows a data byte', () => {
		expect(isDataByte(0)).toBe(true);
		expect(isDataByte(127)).toBe(true);
		expect(isDataByte(128)).toBe(false);
	});
});

describe('assertions', () => {
	it('refuses channel 16 with a hint about human numbering', () => {
		expect(() => assertChannel(15)).not.toThrow();
		expect(() => assertChannel(16)).toThrow(/wire channels are 0–15; humans count 1–16/);
		expect(() => assertChannel(-1, 'remapTo')).toThrow(/^remapTo must be an integer 0–15, got -1$/);
		expect(() => assertChannel(2.5)).toThrow(MidiRangeError);
	});

	it('checks 7-bit and 14-bit values', () => {
		expect(() => assertData7(127, 'v')).not.toThrow();
		expect(() => assertData7(128, 'v')).toThrow(MidiRangeError);
		expect(() => assertData14(16383, 'v')).not.toThrow();
		expect(() => assertData14(16384, 'v')).toThrow(MidiRangeError);
		expect(() => assertIntInRange(3, 1, 2, 'n', 'extra')).toThrow(/\(extra\)$/);
	});

	it('points at the first bad element of a data array', () => {
		expect(() => assertDataBytes([1, 2, 3], 'data')).not.toThrow();
		expect(() => assertDataBytes(Uint8Array.of(1, 0x80), 'data')).toThrow(
			/^data\[1\] must be an integer 0–127, got 128$/
		);
		expect(() => assertDataBytes('abc', 'data')).toThrow(/an array of data bytes/);
		expect(() => assertDataBytes(null, 'data')).toThrow(MidiRangeError);
	});

	it('checks raw byte arrays', () => {
		expect(() => assertBytes([0, 255], 'body')).not.toThrow();
		expect(() => assertBytes([256], 'body')).toThrow(/^body\[0\] must be an integer 0–255/);
		expect(() => assertBytes(42, 'body')).toThrow(/an array of bytes/);
	});
});
