import { describe, expect, it } from 'vitest';
import {
	assertSysEx,
	describeSysEx,
	formatHexString,
	identityRequest,
	isIdentityRequest,
	knownManufacturers,
	parseHexString,
	parseIdentityReply,
	rolandChecksum,
	SysExError,
	universalSubIdName,
	validateSysEx,
	yamahaChecksum
} from './sysex';
import { MidiRangeError } from './validate';

/** The owner's OP-XY on OS 1.1.33 (docs/research/90-device-probe.md). No serial number in it. */
const OPXY_IDENTITY_REPLY = [
	0xf0, 0x7e, 0x21, 0x06, 0x02, 0x00, 0x20, 0x76, 0x21, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
	0xf7
];

describe('Universal Identity Request', () => {
	it('builds the all-call request the probe sent, F0 7E 7F 06 01 F7', () => {
		expect(identityRequest()).toEqual(Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7));
		expect(identityRequest(0x21)).toEqual(Uint8Array.of(0xf0, 0x7e, 0x21, 0x06, 0x01, 0xf7));
	});

	it('refuses a device ID that is not a data byte', () => {
		expect(() => identityRequest(0x80)).toThrow(MidiRangeError);
	});

	it('recognises a request, such as the OP-XY echoing ours back', () => {
		expect(isIdentityRequest(identityRequest())).toBe(true);
		expect(isIdentityRequest([0xf0, 0x7e, 0x21, 0x06, 0x01, 0xf7])).toBe(true);
		expect(isIdentityRequest(OPXY_IDENTITY_REPLY)).toBe(false);
		expect(isIdentityRequest([0xf0, 0x7e, 0x80, 0x06, 0x01, 0xf7])).toBe(false);
		expect(isIdentityRequest([0xf0, 0x7f, 0x7f, 0x06, 0x01, 0xf7])).toBe(false);
	});
});

describe('Universal Identity Reply', () => {
	it("decodes the OP-XY's reply", () => {
		expect(parseIdentityReply(OPXY_IDENTITY_REPLY)).toEqual({
			deviceId: 0x21,
			manufacturerId: [0x00, 0x20, 0x76],
			manufacturer: 'Teenage Engineering',
			family: 0x21,
			member: 1,
			version: [0, 0, 0, 0],
			versionString: '0.0.0.0'
		});
	});

	it('accepts the payload without framing, and a Uint8Array', () => {
		const payload = OPXY_IDENTITY_REPLY.slice(1, -1);
		expect(parseIdentityReply(payload)?.manufacturer).toBe('Teenage Engineering');
		expect(parseIdentityReply(Uint8Array.from(OPXY_IDENTITY_REPLY))?.deviceId).toBe(0x21);
	});

	it('decodes one-byte manufacturer IDs and 14-bit family codes, LSB first', () => {
		const roland = [0xf0, 0x7e, 0x10, 0x06, 0x02, 0x41, 0x05, 0x02, 0x7f, 0x00, 1, 2, 3, 4, 0xf7];
		expect(parseIdentityReply(roland)).toMatchObject({
			deviceId: 0x10,
			manufacturerId: [0x41],
			manufacturer: 'Roland Corporation',
			family: 0x0105,
			member: 0x7f,
			versionString: '1.2.3.4'
		});
	});

	it('tolerates trailing bytes after the version', () => {
		const padded = [...OPXY_IDENTITY_REPLY.slice(0, -1), 0x00, 0x00, 0xf7];
		expect(parseIdentityReply(padded)?.member).toBe(1);
	});

	it('returns null for anything that is not a complete reply', () => {
		expect(parseIdentityReply(identityRequest())).toBeNull();
		expect(parseIdentityReply(OPXY_IDENTITY_REPLY.slice(0, 12))).toBeNull(); // no F7
		expect(parseIdentityReply([...OPXY_IDENTITY_REPLY.slice(0, 12), 0xf7])).toBeNull(); // short
		expect(parseIdentityReply([0xf0, 0x7f, 0x21, 0x06, 0x02, 0x41, 0xf7])).toBeNull();
		expect(parseIdentityReply([0xf0, 0x7e, 0x21, 0x06, 0x02, 0x41, 0x80, 0xf7])).toBeNull();
		expect(parseIdentityReply([0xf0])).toBeNull();
		expect(parseIdentityReply([])).toBeNull();
	});
});

describe('checksums', () => {
	it('computes the Roland checksum of a GS reset (address 40 00 7F, data 00 → 41)', () => {
		expect(rolandChecksum([0x40, 0x00, 0x7f, 0x00])).toBe(0x41);
		expect(rolandChecksum([])).toBe(0);
		expect(yamahaChecksum([0x40, 0x00, 0x7f, 0x00])).toBe(0x41);
	});

	it('refuses status bytes in the checksummed range', () => {
		expect(() => rolandChecksum([0x40, 0x80])).toThrow(MidiRangeError);
	});
});

describe('validation', () => {
	it('accepts F0, data bytes, F7', () => {
		expect(validateSysEx([0xf0, 0x7d, 0xf7])).toEqual({ ok: true });
		expect(() => assertSysEx(OPXY_IDENTITY_REPLY)).not.toThrow();
	});

	it('explains what is wrong', () => {
		expect(validateSysEx([0xf0, 0xf7])).toEqual({
			ok: false,
			problem: 'Too short to be a SysEx message.'
		});
		expect(validateSysEx([0x90, 0x01, 0xf7])).toMatchObject({ problem: 'Must begin with F0.' });
		expect(validateSysEx([0xf0, 0x01, 0x02])).toMatchObject({ problem: 'Must end with F7.' });
		expect(validateSysEx([0xf0, 0x01, 0x90, 0xf7])).toMatchObject({
			problem: 'Byte 2 is 0x90 — everything between F0 and F7 must be a data byte (00–7F).'
		});
		expect(validateSysEx([0xf0, 1.5, 0xf7])).toMatchObject({
			problem: expect.stringMatching(/1\.5/)
		});
		expect(() => assertSysEx([0xf0, 0x90, 0xf7])).toThrow(SysExError);
	});
});

describe('hex text', () => {
	it('parses the usual ways people write bytes', () => {
		const request = Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7);
		expect(parseHexString('F0 7E 7F 06 01 F7')).toEqual(request);
		expect(parseHexString('f07e7f0601f7')).toEqual(request);
		expect(parseHexString('0xF0, 0x7E,0x7F;06\n01 F7 ')).toEqual(request);
		expect(parseHexString('')).toEqual(new Uint8Array());
	});

	it('refuses a dangling nibble or a stray character instead of dropping it', () => {
		expect(() => parseHexString('F0 7E 7')).toThrow(/odd number of hex digits/);
		expect(() => parseHexString('F0 zz')).toThrow(SysExError);
		expect(() => parseHexString('0x')).toThrow(/is not hex/);
	});

	it('formats bytes in lines', () => {
		expect(formatHexString([0xf0, 0x7e, 0x0a])).toBe('F0 7E 0A');
		expect(formatHexString([1, 2, 3, 4, 5], 2)).toBe('01 02\n03 04\n05');
		expect(formatHexString([])).toBe('');
		expect(() => formatHexString([1], 0)).toThrow(MidiRangeError);
		expect(() => formatHexString([256])).toThrow(MidiRangeError);
	});
});

describe('describing SysEx', () => {
	it('keeps the real-time and non-real-time sub-ID tables apart', () => {
		expect(universalSubIdName(false, 0x04)).toBe('MIDI Time Code Cueing');
		expect(universalSubIdName(true, 0x04)).toBe('Device Control');
		expect(universalSubIdName(false, 0x06)).toBe('General Information (Identity)');
		expect(universalSubIdName(true, 0x06)).toBe('MIDI Machine Control Command');
		expect(universalSubIdName(true, 0x60)).toBeUndefined();
	});

	it('summarises universal and manufacturer messages', () => {
		expect(describeSysEx(OPXY_IDENTITY_REPLY.slice(1, -1))).toEqual({
			kind: 'universal-nonrealtime',
			manufacturer: 'Universal Non-Real Time',
			summary:
				'General Information (Identity), variant 0x02 — understood by any compliant device, whoever made it.'
		});
		expect(describeSysEx([0x7f, 0x7f, 0x04])).toMatchObject({
			kind: 'universal-realtime',
			summary: expect.stringMatching(/^Device Control —/)
		});
		expect(describeSysEx([0x7e, 0x7f, 0x60, 0x01]).summary).toMatch(/^sub-ID 0x60, variant 0x01/);
		expect(describeSysEx([0x7e, 0x7f]).summary).toMatch(/^no sub-ID —/);
		expect(describeSysEx([0x00, 0x20, 0x76, 0x21, 0x40])).toMatchObject({
			kind: 'manufacturer',
			manufacturer: 'Teenage Engineering'
		});
		expect(describeSysEx([])).toEqual({
			kind: 'invalid',
			manufacturer: '—',
			summary: 'Empty message.'
		});
	});

	it('lists every known manufacturer, sorted by name', () => {
		const all = knownManufacturers();
		expect(all).toContainEqual({ id: '00 20 76', name: 'Teenage Engineering' });
		expect(all).toContainEqual({ id: '41', name: 'Roland Corporation' });
		const names = all.map((m) => m.name);
		expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
	});
});
