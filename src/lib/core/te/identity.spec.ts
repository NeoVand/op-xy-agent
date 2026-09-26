import { describe, expect, it } from 'vitest';
import { OPXY_DEVICE_ID, OPXY_SKU } from './constants';
import { hex, OPXY_IDENTITY_REPLY, SYNTHETIC_GREET_TEXT } from './fixtures';
import {
	formatTeSku,
	isIdentityRequest,
	parseGreetMetadata,
	parseTeIdentityReply,
	redactGreetInfo,
	TE_GREET_KEYS,
	TE_IDENTITY_REQUEST
} from './identity';

describe('parseTeIdentityReply', () => {
	it('decodes the OP-XY reply: device id 0x21, SKU TE033AS001', () => {
		expect(parseTeIdentityReply(OPXY_IDENTITY_REPLY)).toEqual({
			deviceId: OPXY_DEVICE_ID,
			familyCode: 33,
			member: 1,
			sku: OPXY_SKU,
			softwareRevision: [0, 0, 0, 0]
		});
	});

	it('reads 14-bit family and member codes LSB first', () => {
		// EP-136 is TE032AS101 in TE's updater: family 32, member 101.
		const ep136 = hex('F0 7E 05 06 02 00 20 76 20 00 65 00 01 02 03 04 F7');
		expect(parseTeIdentityReply(ep136)).toMatchObject({
			deviceId: 5,
			familyCode: 32,
			member: 101,
			sku: 'TE032AS101',
			softwareRevision: [1, 2, 3, 4]
		});
		const wide = hex('F0 7E 21 06 02 00 20 76 01 01 7F 7F 00 00 00 00 F7');
		expect(parseTeIdentityReply(wide)).toMatchObject({ familyCode: 129, member: 16383 });
	});

	it('returns null for anything that is not a TE identity reply', () => {
		const reply = Array.from(OPXY_IDENTITY_REPLY);
		const variants: number[][] = [
			[],
			Array.from(TE_IDENTITY_REQUEST),
			reply.slice(0, 16),
			[...reply.slice(0, 16), 0x00, 0xf7],
			reply.map((b, i) => (i === 16 ? 0x00 : b)), // no F7
			reply.map((b, i) => (i === 1 ? 0x7f : b)), // realtime universal
			reply.map((b, i) => (i === 4 ? 0x01 : b)), // identity request sub-id
			reply.map((b, i) => (i === 6 ? 0x21 : b)), // another manufacturer
			reply.map((b, i) => (i === 9 ? 0x80 : b)), // not a data byte
			reply.map((b, i) => (i === 9 ? 1.5 : b)) // not a byte at all
		];
		for (const bytes of variants) expect(parseTeIdentityReply(bytes)).toBeNull();
	});
});

describe('formatTeSku', () => {
	it('pads family and member to three digits', () => {
		expect(formatTeSku(33, 1)).toBe('TE033AS001');
		expect(formatTeSku(2, 2)).toBe('TE002AS002');
		expect(formatTeSku(32, 101)).toBe('TE032AS101');
		expect(formatTeSku(1000, 5)).toBe('TE1000AS005');
	});
});

describe('isIdentityRequest', () => {
	it('recognises identity requests to any device id', () => {
		expect(isIdentityRequest(TE_IDENTITY_REQUEST)).toBe(true);
		expect(isIdentityRequest(hex('F0 7E 21 06 01 F7'))).toBe(true);
	});

	it('rejects everything else', () => {
		expect(isIdentityRequest(OPXY_IDENTITY_REPLY)).toBe(false);
		expect(isIdentityRequest(hex('F0 7E 7F 06 02 F7'))).toBe(false);
		expect(isIdentityRequest(hex('F0 7F 7F 06 01 F7'))).toBe(false);
		expect(isIdentityRequest(hex('F0 7E 7F 06 01 00 F7'))).toBe(false);
		expect(isIdentityRequest([0xf0, 0x7e, 0x80, 0x06, 0x01, 0xf7])).toBe(false);
	});
});

describe('parseGreetMetadata', () => {
	it('parses a GREET text in the OP-XY’s format (fake serials)', () => {
		expect(parseGreetMetadata(SYNTHETIC_GREET_TEXT)).toEqual({
			product: 'OP-XY',
			mode: 'normal',
			serial: 'TESTSERIAL',
			dsp_serial: 'TESTDSPSERIAL',
			os_version: '1.1.33',
			sw_version: '1.1.33',
			hw_rev: '2',
			sku: 'TE033AS001'
		});
	});

	it('trims whitespace and NUL terminators', () => {
		expect(parseGreetMetadata(' product: OP-XY ;\tmode:normal\0\0')).toEqual({
			product: 'OP-XY',
			mode: 'normal'
		});
	});

	it('skips junk, keeps colons inside values and empty values', () => {
		expect(parseGreetMetadata('junk;:nokey;;a:b:c;empty:;x:1')).toEqual({
			a: 'b:c',
			empty: '',
			x: '1'
		});
		expect(parseGreetMetadata('')).toEqual({});
	});

	it('keeps the last value of a repeated key', () => {
		expect(parseGreetMetadata('mode:normal;mode:bootloader')).toEqual({ mode: 'bootloader' });
	});

	it('cannot pollute prototypes', () => {
		const info = parseGreetMetadata('__proto__:polluted;constructor:x');
		expect(Object.getPrototypeOf(info)).toBe(Object.prototype);
		expect(Object.hasOwn(info, '__proto__')).toBe(true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('lists the keys the OP-XY sends', () => {
		const sent = Object.keys(parseGreetMetadata(SYNTHETIC_GREET_TEXT));
		for (const key of sent) expect(TE_GREET_KEYS).toContain(key);
	});
});

describe('redactGreetInfo', () => {
	it('replaces unit-identifying values and leaves the rest', () => {
		const info = parseGreetMetadata(`${SYNTHETIC_GREET_TEXT};chip_id:ABC`);
		const redacted = redactGreetInfo(info);
		expect(redacted).toMatchObject({
			serial: '<redacted>',
			dsp_serial: '<redacted>',
			chip_id: '<redacted>',
			os_version: '1.1.33',
			sku: 'TE033AS001'
		});
		expect(info.serial).toBe('TESTSERIAL');
		expect(redactGreetInfo({ product: 'OP-XY' })).toEqual({ product: 'OP-XY' });
	});
});
