import { describe, expect, it } from 'vitest';
import { buildRequestFrame, pack7 } from './codec';
import { TE_CMD, TE_DFU, TE_FILE, TE_SETTINGS } from './constants';
import { TePolicyError } from './errors';
import { ascii, hex, OPXY_IDENTITY_REPLY } from './fixtures';
import { TE_IDENTITY_REQUEST } from './identity';
import { assertSendable, classifyOutgoing, type TeSafety } from './policy';

const DOCUMENTED = new Set<number>([TE_CMD.GREET, TE_CMD.ECHO, TE_CMD.FILE, TE_CMD.SETTINGS]);

/** A well-formed request frame (device 0x21, request id 1) as a plain array. */
function frame(
	cmd: number,
	payload: ArrayLike<number> = [],
	deviceId = 0x21,
	requestId = 1
): number[] {
	return Array.from(buildRequestFrame({ deviceId, requestId, cmd, payload }));
}

/** A frame assembled by hand: header bytes 4–8, then already-packed bytes. */
function raw(header: number[], packed: ArrayLike<number> = [], end = true): number[] {
	return [0xf0, 0x00, 0x20, 0x76, ...header, ...Array.from(packed), ...(end ? [0xf7] : [])];
}

function safetyOf(bytes: ArrayLike<number>): TeSafety | 'other' {
	const result = classifyOutgoing(bytes);
	return result.kind === 'te' ? result.safety : 'other';
}

function expectBlocked(bytes: ArrayLike<number>, allowWrites = true): TePolicyError {
	expect(safetyOf(bytes)).toBe('forbidden');
	let caught: unknown;
	try {
		assertSendable(bytes, { allowWrites });
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(TePolicyError);
	expect((caught as TePolicyError).code).toBe('forbidden');
	return caught as TePolicyError;
}

const DFU_ENTER = [TE_DFU.ENTER, 0x01, 0x00, 0xc8];

describe('DFU (0x03) is refused in every form', () => {
	it('for every sub-command byte, and with no payload', () => {
		expect(classifyOutgoing(frame(TE_CMD.DFU))).toMatchObject({
			kind: 'te',
			cmd: 3,
			sub: null,
			name: 'DFU',
			safety: 'forbidden'
		});
		for (let sub = 0; sub < 256; sub++) {
			expect(classifyOutgoing(frame(TE_CMD.DFU, [sub]))).toMatchObject({
				cmd: 3,
				sub,
				safety: 'forbidden'
			});
		}
	});

	it('for the documented sub-commands, by name', () => {
		const begin = [
			TE_DFU.BEGIN,
			0,
			1,
			0,
			1,
			0,
			33,
			0,
			0,
			0xb0,
			0x00,
			0x08,
			0x40,
			0x01,
			0x05,
			0xd2,
			0x11,
			0x40,
			0
		];
		const chunk = [TE_DFU.CHUNK, 0, ...Array.from({ length: 235 }, (_, i) => i & 0xff)];
		const cases: [number[], string][] = [
			[DFU_ENTER, 'DFU ENTER'],
			[begin, 'DFU BEGIN'],
			[chunk, 'DFU CHUNK'],
			[[TE_DFU.PERFORM], 'DFU PERFORM'],
			[[TE_DFU.EXIT], 'DFU EXIT']
		];
		for (const [payload, name] of cases) {
			expect(expectBlocked(frame(TE_CMD.DFU, payload)).classification.name).toBe(name);
		}
	});

	it('for every device id and many request ids', () => {
		for (let deviceId = 0; deviceId < 128; deviceId++) {
			for (const requestId of [0, 1, 127, 128, 2306, 4095]) {
				expect(safetyOf(frame(TE_CMD.DFU, DFU_ENTER, deviceId, requestId))).toBe('forbidden');
			}
		}
	});

	it('whatever byte 6 says (request, response or event flags)', () => {
		for (let flags = 0; flags < 128; flags++) {
			expect(safetyOf(raw([0x21, 0x40, flags, 0x01, TE_CMD.DFU], pack7(DFU_ENTER)))).toBe(
				'forbidden'
			);
		}
	});

	it('whatever the marker byte is', () => {
		for (let marker = 0; marker < 128; marker++) {
			expect(safetyOf(raw([0x21, marker, 0x60, 0x01, TE_CMD.DFU], pack7(DFU_ENTER)))).toBe(
				'forbidden'
			);
		}
	});

	it('with a non-canonical or undecodable payload', () => {
		expect(safetyOf(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.DFU], hex('7F')))).toBe('forbidden');
		expect(safetyOf(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.DFU], hex('7E 01')))).toBe('forbidden');
	});

	it('without F7, and cut short at any length', () => {
		const full = frame(TE_CMD.DFU, DFU_ENTER);
		for (let length = 1; length <= full.length; length++) {
			expectBlocked(full.slice(0, length));
		}
	});

	it('with real-time bytes interleaved anywhere', () => {
		const full = frame(TE_CMD.DFU, DFU_ENTER);
		for (const rt of [0xf8, 0xfa, 0xfe, 0xff]) {
			for (let at = 0; at <= full.length; at++) {
				const bytes = [...full.slice(0, at), rt, ...full.slice(at)];
				expect(safetyOf(bytes)).toBe('forbidden');
				if (at > 0 && at < full.length) {
					expect(classifyOutgoing(bytes)).toMatchObject({ cmd: TE_CMD.DFU });
				}
			}
		}
	});

	it('inside a longer message, next to harmless messages or a valid request', () => {
		const dfu = frame(TE_CMD.DFU, DFU_ENTER);
		const greet = frame(TE_CMD.GREET);
		for (const bytes of [
			[0x90, 60, 100, ...dfu],
			[...dfu, 0xb0, 7, 100],
			[...greet, ...dfu],
			[...dfu, ...greet],
			[...hex('F0 7E 7F 06 01 F7'), ...dfu]
		]) {
			expect(classifyOutgoing(bytes)).toMatchObject({ cmd: TE_CMD.DFU, safety: 'forbidden' });
		}
	});

	it('when a value would wrap to 0x03 in Web MIDI (0x103, -253, 3.5…)', () => {
		const dfu = frame(TE_CMD.DFU, DFU_ENTER);
		for (const sneaky of [0x103, 0x203, -253, 3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			const bytes = dfu.map((b, i) => (i === 8 ? sneaky : b));
			expect(expectBlocked(bytes).classification.name).toBe('invalid MIDI data');
		}
	});

	it('when split across two sends: both halves are refused', () => {
		const dfu = frame(TE_CMD.DFU, DFU_ENTER);
		for (let cut = 1; cut < dfu.length; cut++) {
			expectBlocked(dfu.slice(0, cut)); // SysEx without F7
			expectBlocked(dfu.slice(cut)); // stray F7
		}
	});

	it('even with allowWrites', () => {
		expect(expectBlocked(frame(TE_CMD.DFU, DFU_ENTER), true).message).toContain('DFU');
	});
});

describe('PRODUCT_SPECIFIC (0x7F) and undocumented commands', () => {
	it('refuses 0x7F with any payload', () => {
		for (const payload of [[], [0x00], [0x01, 0x02, 0x03], [0xff]]) {
			expect(classifyOutgoing(frame(TE_CMD.PRODUCT_SPECIFIC, payload))).toMatchObject({
				cmd: 0x7f,
				name: 'PRODUCT_SPECIFIC',
				safety: 'forbidden'
			});
		}
	});

	it('refuses every command number that is not documented', () => {
		let refused = 0;
		for (let cmd = 0; cmd < 128; cmd++) {
			if (DOCUMENTED.has(cmd)) continue;
			for (const payload of [[], [0x01], [0x01, 0x00, 0x00, 0x40, 0x00, 0x00]]) {
				expectBlocked(frame(cmd, payload));
			}
			refused++;
		}
		expect(refused).toBe(124);
	});
});

describe('documented reads pass', () => {
	const reads: [string, number, number[]][] = [
		['GREET', TE_CMD.GREET, []],
		['ECHO', TE_CMD.ECHO, [0xde, 0xad, 0xbe, 0xef]],
		['ECHO', TE_CMD.ECHO, []],
		['FILE INIT', TE_CMD.FILE, [0x01, 0x00, 0x00, 0x40, 0x00, 0x00]],
		['FILE INIT', TE_CMD.FILE, [0x01, 0x01, 0x00, 0x40, 0x00, 0x00]],
		['FILE LIST', TE_CMD.FILE, [0x04, 0x00, 0x01, 0x00, 0x02]],
		['FILE INFO', TE_CMD.FILE, [0x0b, 0x00, 0x01]],
		['FILE GET (open)', TE_CMD.FILE, [0x03, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]],
		['FILE GET (page)', TE_CMD.FILE, [0x03, 0x01, 0x00, 0x00]],
		['FILE METADATA GET', TE_CMD.FILE, [0x07, 0x02, 0x00, 0x01, 0x00, 0x00]],
		[
			'FILE METADATA GET',
			TE_CMD.FILE,
			[0x07, 0x02, 0x00, 0x01, 0x00, 0x00, ...ascii('formats'), 0]
		],
		['SETTINGS INIT', TE_CMD.SETTINGS, [0x01, 0x03, 0xe8]],
		['SETTINGS GET_ALL', TE_CMD.SETTINGS, [0x02, 0x00, 0x00]]
	];

	it.each(reads)('%s', (name, cmd, payload) => {
		const bytes = frame(cmd, payload);
		const expected = { kind: 'te', deviceId: 0x21, cmd, name, safety: 'read' };
		expect(classifyOutgoing(bytes)).toMatchObject(expected);
		expect(assertSendable(bytes, { allowWrites: false })).toMatchObject(expected);
	});

	it('reports the sub-command', () => {
		expect(classifyOutgoing(frame(TE_CMD.FILE, [0x04, 0, 0, 0, 0]))).toMatchObject({
			sub: TE_FILE.LIST
		});
		expect(classifyOutgoing(frame(TE_CMD.GREET))).toMatchObject({ sub: null });
		expect(classifyOutgoing(frame(TE_CMD.SETTINGS, [0x01, 0x03, 0xe8]))).toMatchObject({
			sub: TE_SETTINGS.INIT
		});
	});
});

describe('FILE writes need allowWrites', () => {
	const writes: [string, number[]][] = [
		[
			'FILE PUT (open)',
			[0x02, 0x00, 0x05, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, ...ascii('a'), 0]
		],
		[
			'FILE PUT (open)',
			[0x02, 0x00, 0x05, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0, ...ascii('{}')]
		],
		['FILE PUT (data)', [0x02, 0x01, 0x00, 0x00, 0xde, 0xad]],
		['FILE PUT (data)', [0x02, 0x01, 0x00, 0x01]],
		['FILE DELETE', [0x06, 0x00, 0x05]],
		['FILE MOVE', [0x0c, 0x00, 0x05, 0x00, 0x02, 0x00, 0x00]],
		['FILE PLAYBACK', [0x05, 0x01, 0x00, 0x05, 0, 0, 0, 0, 0, 0, 0, 0]],
		['FILE PLAYBACK', [0x05, 0x02, 0x00, 0x05, 0, 0, 0, 0, 0, 0, 0, 0]],
		['FILE METADATA SET', [0x07, 0x01, 0x00, 0x05, ...ascii('{"a":1}'), 0]],
		['FILE METADATA SET (paged)', [0x07, 0x04, 0x00, 0x00, 0x05, 0x00, 0x00, 0x01, 0x00]],
		['FILE METADATA SET (paged)', [0x07, 0x04, 0x01, 0x00, 0x00, ...ascii('{"a"')]]
	];

	it.each(writes)('%s', (name, payload) => {
		const bytes = frame(TE_CMD.FILE, payload);
		expect(classifyOutgoing(bytes)).toMatchObject({ cmd: TE_CMD.FILE, name, safety: 'write' });
		let caught: unknown;
		try {
			assertSendable(bytes, { allowWrites: false });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(TePolicyError);
		expect((caught as TePolicyError).code).toBe('write-not-allowed');
		expect(() => assertSendable(bytes, { allowWrites: 1 as unknown as boolean })).toThrow(
			TePolicyError
		);
		expect(assertSendable(bytes, { allowWrites: true })).toMatchObject({ safety: 'write' });
	});
});

describe('SETTINGS SET is always refused', () => {
	it('even with allowWrites', () => {
		const set = frame(TE_CMD.SETTINGS, [TE_SETTINGS.SET, 0x00, 0x01, ...ascii('1'), 0]);
		expect(expectBlocked(set).classification.name).toBe('SETTINGS SET');
		expectBlocked(frame(TE_CMD.SETTINGS, [TE_SETTINGS.SET]));
	});
});

describe('undocumented sub-commands and layouts are refused', () => {
	it('FILE sub-commands outside the documented set', () => {
		const known = new Set<number>(Object.values(TE_FILE));
		for (let sub = 0; sub < 256; sub++) {
			if (known.has(sub)) continue;
			expectBlocked(frame(TE_CMD.FILE, [sub, 0x00, 0x00, 0x00, 0x00]));
		}
		expectBlocked(frame(TE_CMD.FILE, []));
	});

	it('SETTINGS sub-commands outside INIT/GET_ALL', () => {
		for (let sub = 0; sub < 256; sub++) {
			if (sub === TE_SETTINGS.INIT || sub === TE_SETTINGS.GET_ALL) continue;
			expectBlocked(frame(TE_CMD.SETTINGS, [sub, 0x00, 0x00]));
		}
		expectBlocked(frame(TE_CMD.SETTINGS, []));
	});

	it('documented commands with undocumented payloads', () => {
		const blocked: [number, number[]][] = [
			[TE_CMD.GREET, [0x00]],
			[TE_CMD.FILE, [0x01, 0x02, 0x00, 0x40, 0x00, 0x00]], // INIT flag 2
			[TE_CMD.FILE, [0x01, 0x81, 0x00, 0x40, 0x00, 0x00]],
			[TE_CMD.FILE, [0x01, 0x00, 0x00, 0x40, 0x00]], // INIT too short
			[TE_CMD.FILE, [0x04, 0x00, 0x00, 0x00]], // LIST too short
			[TE_CMD.FILE, [0x04, 0x00, 0x00, 0x00, 0x00, 0x00]], // LIST too long
			[TE_CMD.FILE, [0x0b, 0x00]], // INFO too short
			[TE_CMD.FILE, [0x03, 0x02, 0x00, 0x00]], // GET type 2
			[TE_CMD.FILE, [0x03, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]], // GET open + extra
			[TE_CMD.FILE, [0x03]],
			[TE_CMD.FILE, [0x07]], // METADATA without operation
			[TE_CMD.FILE, [0x07, 0x03, 0x00, 0x01]],
			[TE_CMD.FILE, [0x07, 0x02, 0x00, 0x01, 0x00]], // METADATA GET too short
			[TE_CMD.FILE, [0x07, 0x02, 0x00, 0x01, 0x00, 0x00, 0x61]], // key without NUL
			[TE_CMD.FILE, [0x07, 0x02, 0x00, 0x01, 0x00, 0x00, 0x61, 0x00, 0x62, 0x00]], // NUL inside
			[TE_CMD.FILE, [0x07, 0x01, 0x00, 0x05, 0x61]], // METADATA SET without NUL
			[TE_CMD.FILE, [0x07, 0x04, 0x02, 0x00, 0x00]], // SET_PAGED type 2
			[TE_CMD.FILE, [0x07, 0x04, 0x00, 0x00, 0x05]], // SET_PAGED init too short
			[TE_CMD.FILE, [0x02, 0x02, 0x00, 0x00]], // PUT type 2
			[TE_CMD.FILE, [0x02, 0x00, 0x05, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0x61]], // no NUL
			[TE_CMD.FILE, [0x02, 0x01, 0x00]], // PUT data too short
			[TE_CMD.FILE, [0x06, 0x00]], // DELETE too short
			[TE_CMD.FILE, [0x0c, 0x00, 0x05, 0x00, 0x02]], // MOVE too short
			[TE_CMD.FILE, [0x05, 0x03, 0x00, 0x05, 0, 0, 0, 0, 0, 0, 0, 0]], // PLAYBACK action 3
			[TE_CMD.FILE, [0x05, 0x01, 0x00, 0x05]] // PLAYBACK too short
		];
		for (const [cmd, payload] of blocked) expectBlocked(frame(cmd, payload));
	});
});

describe('malformed and non-canonical frames are refused', () => {
	it('frames that are not requests with a request id', () => {
		for (const flags of [0x00, 0x20, 0x40, 0x3f, 0x5f]) {
			expectBlocked(raw([0x21, 0x40, flags, 0x01, TE_CMD.GREET]));
		}
	});

	it('non-canonical packed-7 payloads', () => {
		expectBlocked(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.GREET], hex('7F'))); // lone flag byte
		expectBlocked(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.FILE], hex('40 04 00 00 00 00'))); // unused flag bit
		expectBlocked(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.FILE], hex('00 04 00 00 00 00 00'))); // extra byte → LIST too long
		// A flag bit that turns sub-command 0x04 (LIST) into 0x84.
		expectBlocked(raw([0x21, 0x40, 0x60, 0x01, TE_CMD.FILE], hex('01 04 00 00 00 00')));
	});

	it('truncated TE frames', () => {
		for (const text of [
			'F0 00 20 76 F7',
			'F0 00 20 76 21 F7',
			'F0 00 20 76 21 40 F7',
			'F0 00 20 76 21 40 60 F7',
			'F0 00 20 76 21 40 60 01 F7'
		]) {
			expectBlocked(hex(text));
		}
	});

	it('TE SysEx in any other format (debug marker, unknown markers)', () => {
		for (const marker of [0x00, 0x10, 0x33, 0x41, 0x7f]) {
			expectBlocked(raw([0x21, marker, 0x60, 0x01, TE_CMD.GREET]));
		}
	});

	it('unterminated SysEx that could still become TE, and stray F7', () => {
		for (const bytes of [
			[0xf0],
			[0xf0, 0x00],
			[0xf0, 0x00, 0x20],
			hex('F0 00 20 76'),
			frame(TE_CMD.GREET).slice(0, -1),
			[...frame(TE_CMD.GREET).slice(0, -1), 0x90, 60, 100], // cut by a status byte
			[0xf7],
			[0x01, 0x02, 0xf7]
		]) {
			expectBlocked(bytes);
		}
	});

	it('more than one TE frame per message', () => {
		const greet = frame(TE_CMD.GREET);
		const result = expectBlocked([...greet, ...frame(TE_CMD.FILE, [0x04, 0, 0, 0, 0], 0x21, 2)]);
		expect(result.classification.reason).toContain('one request at a time');
		expectBlocked([...greet, ...greet]);
	});

	it('values that are not bytes', () => {
		for (const bad of [-1, 256, 1.5, Number.NaN]) {
			expectBlocked([0x90, 60, bad]);
		}
	});
});

describe('non-TE traffic is "other"', () => {
	it('passes through untouched', () => {
		for (const bytes of [
			[],
			[0x90, 60, 100],
			[0x80, 60, 0],
			[0xb0, 7, 100],
			[0xf8],
			[0xfa],
			[0xfc],
			TE_IDENTITY_REQUEST,
			OPXY_IDENTITY_REPLY,
			hex('F0 43 10 4C 00 00 7E 00 F7'), // another manufacturer
			hex('F0 00 20 77 21 40 60 01 03 F7'), // same prefix, not TE
			hex('F0 00 21 76 F7'),
			hex('F0 00 F7'),
			hex('F0 F7'),
			hex('F0 7E 7F 06 01'), // unterminated, but can never become TE
			[...hex('F0 7E 7F 06 01 F7'), 0x90, 60, 100]
		]) {
			expect(classifyOutgoing(bytes)).toEqual({ kind: 'other' });
			expect(assertSendable(bytes, { allowWrites: false })).toEqual({ kind: 'other' });
		}
	});

	it('accepts one TE request next to other messages', () => {
		const bytes = [0x90, 60, 100, ...frame(TE_CMD.GREET), 0x80, 60, 0];
		expect(classifyOutgoing(bytes)).toMatchObject({ name: 'GREET', safety: 'read' });
	});
});

describe('TePolicyError', () => {
	it('carries the code and the classification', () => {
		const error = expectBlocked(frame(TE_CMD.DFU, DFU_ENTER));
		expect(error.name).toBe('TePolicyError');
		expect(error.classification).toMatchObject({ kind: 'te', cmd: 3, name: 'DFU ENTER' });
		expect(error.message).toMatch(/blocked TE SysEx DFU ENTER/);
	});
});
