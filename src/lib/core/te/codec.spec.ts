import { describe, expect, it } from 'vitest';
import {
	buildRequestFrame,
	buildResponseFrame,
	decodeStatus,
	isCanonicalPacked7,
	pack7,
	packed7Length,
	parseFrame,
	requestIdFromBytes,
	unpack7,
	unpacked7Length,
	type TeFrame
} from './codec';
import { TE_CMD } from './constants';
import { TeCodecError } from './errors';
import {
	ascii,
	CAPTURE_DISCOVER,
	CAPTURE_ECHO,
	CAPTURE_FILES,
	CAPTURE_SETTINGS,
	hex,
	LIST_ROOT_REPLY,
	OPXY_IDENTITY_REPLY
} from './fixtures';

/** Small seeded PRNG (mulberry32) so the property tests are reproducible. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomBytes(random: () => number, length: number): Uint8Array {
	return Uint8Array.from({ length }, () => Math.floor(random() * 256));
}

function expectKind<K extends TeFrame['kind']>(
	frame: TeFrame,
	kind: K
): Extract<TeFrame, { kind: K }> {
	expect(frame.kind).toBe(kind);
	return frame as Extract<TeFrame, { kind: K }>;
}

describe('pack7 / unpack7', () => {
	it('matches the packing vectors in 60-firmware.md §4', () => {
		expect(pack7(hex('07 D0 00 2C'))).toEqual(hex('02 07 50 00 2C'));
		expect(pack7(hex('DE AD BE EF'))).toEqual(hex('0F 5E 2D 3E 6F'));
		expect(pack7(hex('01 03 E8'))).toEqual(hex('04 01 03 68')); // SETTINGS INIT 1000
		expect(pack7(hex('01 00 00 40 00 00'))).toEqual(hex('00 01 00 00 40 00 00')); // FILE INIT
		expect(pack7(hex('04 00 00 00 00'))).toEqual(hex('00 04 00 00 00 00')); // FILE LIST p0 n0
	});

	it('packs the probe pattern exactly as the OP-XY echoed it', () => {
		const raw = hex('DE AD BE EF 00 7F 80 FF 01');
		const packed = hex('4F 5E 2D 3E 6F 00 7F 00 01 7F 01');
		expect(pack7(raw)).toEqual(packed);
		expect(unpack7(packed)).toEqual(raw);
	});

	it('handles empty input', () => {
		expect(pack7([])).toEqual(new Uint8Array(0));
		expect(unpack7([])).toEqual(new Uint8Array(0));
	});

	it('round-trips random buffers of every length 0–600', () => {
		const random = prng(0x7e033);
		for (let n = 0; n <= 600; n++) {
			const raw = randomBytes(random, n);
			const packed = pack7(raw);
			expect(packed.length).toBe(n + Math.ceil(n / 7));
			expect(packed7Length(n)).toBe(packed.length);
			expect(unpacked7Length(packed.length)).toBe(n);
			expect(packed.every((b) => b <= 0x7f)).toBe(true);
			expect(unpack7(packed)).toEqual(raw);
			expect(isCanonicalPacked7(packed)).toBe(true);
		}
	});

	it('round-trips 300 more random buffers of random length', () => {
		const random = prng(42);
		for (let k = 0; k < 300; k++) {
			const raw = randomBytes(random, Math.floor(random() * 601));
			expect(unpack7(pack7(raw))).toEqual(raw);
		}
	});

	it('round-trips uniform and alternating patterns', () => {
		for (const fill of [0x00, 0x7f, 0x80, 0xff]) {
			const raw = new Uint8Array(50).fill(fill);
			expect(unpack7(pack7(raw))).toEqual(raw);
		}
		const alternating = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 0xff : 0x00));
		expect(unpack7(pack7(alternating))).toEqual(alternating);
	});

	it('stores the high bit of raw byte i in flag bit i', () => {
		for (let i = 0; i < 7; i++) {
			const raw = new Uint8Array(7);
			raw[i] = 0x80 | i;
			const packed = pack7(raw);
			expect(packed[0]).toBe(1 << i);
			expect(packed[1 + i]).toBe(i);
		}
	});

	it('accepts plain number arrays', () => {
		expect(pack7([0xde, 0xad])).toEqual(hex('03 5E 2D'));
		expect(unpack7([0x03, 0x5e, 0x2d])).toEqual(hex('DE AD'));
	});

	it('rejects raw values that are not bytes', () => {
		for (const bad of [256, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => pack7([0x01, bad])).toThrow(TeCodecError);
		}
	});

	it('rejects packed values that are not 7-bit data bytes', () => {
		for (const bad of [0x80, 0xf7, 256, -1, 0.5]) {
			expect(() => unpack7([0x00, bad])).toThrow(TeCodecError);
		}
	});

	it('ignores a lone trailing flag byte and unused flag bits, like TE’s decoder', () => {
		expect(unpack7(hex('00 01 02 03 04 05 06 07 7F'))).toEqual(hex('01 02 03 04 05 06 07'));
		expect(unpack7(hex('7E 05'))).toEqual(hex('05'));
		expect(unpack7(hex('7F'))).toEqual(new Uint8Array(0));
	});

	it('flags non-canonical packing', () => {
		expect(isCanonicalPacked7(hex('00 01 02 03 04 05 06 07 7F'))).toBe(false); // lone flag byte
		expect(isCanonicalPacked7(hex('7E 05'))).toBe(false); // flag bits for missing bytes
		expect(isCanonicalPacked7(hex('7F'))).toBe(false);
		expect(isCanonicalPacked7([0x00, 0x80])).toBe(false); // not 7-bit
		expect(isCanonicalPacked7(hex('01 05'))).toBe(true);
	});

	it('computes packed and unpacked lengths', () => {
		expect([0, 1, 7, 8, 14, 15].map(packed7Length)).toEqual([0, 2, 8, 10, 16, 18]);
		expect([0, 1, 2, 8, 9, 10, 16].map(unpacked7Length)).toEqual([0, 0, 1, 7, 7, 8, 14]);
		expect(() => packed7Length(-1)).toThrow(TeCodecError);
		expect(() => unpacked7Length(1.5)).toThrow(TeCodecError);
	});
});

describe('buildRequestFrame', () => {
	// The worked examples of 60-firmware.md §4.3 (device 0x21, request ids 1–6).
	const vectors: [string, number, number, number[], string][] = [
		['GREET', 1, TE_CMD.GREET, [], 'F0 00 20 76 21 40 60 01 01 F7'],
		[
			'ECHO DE AD BE EF',
			2,
			TE_CMD.ECHO,
			[0xde, 0xad, 0xbe, 0xef],
			'F0 00 20 76 21 40 60 02 02 0F 5E 2D 3E 6F F7'
		],
		[
			'SETTINGS INIT',
			3,
			TE_CMD.SETTINGS,
			[0x01, 0x03, 0xe8],
			'F0 00 20 76 21 40 60 03 06 04 01 03 68 F7'
		],
		[
			'SETTINGS GET_ALL 0',
			4,
			TE_CMD.SETTINGS,
			[0x02, 0x00, 0x00],
			'F0 00 20 76 21 40 60 04 06 00 02 00 00 F7'
		],
		[
			'FILE INIT (read)',
			5,
			TE_CMD.FILE,
			[0x01, 0x00, 0x00, 0x40, 0x00, 0x00],
			'F0 00 20 76 21 40 60 05 05 00 01 00 00 40 00 00 F7'
		],
		[
			'FILE LIST p0 n0',
			6,
			TE_CMD.FILE,
			[0x04, 0x00, 0x00, 0x00, 0x00],
			'F0 00 20 76 21 40 60 06 05 00 04 00 00 00 00 F7'
		]
	];

	it.each(vectors)('%s', (_name, requestId, cmd, payload, expected) => {
		expect(buildRequestFrame({ deviceId: 0x21, requestId, cmd, payload })).toEqual(hex(expected));
	});

	it('reproduces the request frames the probe sent to the real device', () => {
		const sent = [
			{
				capture: CAPTURE_FILES,
				index: 0,
				requestId: 1515,
				cmd: TE_CMD.FILE,
				payload: '01 00 00 40 00 00'
			},
			{
				capture: CAPTURE_FILES,
				index: 2,
				requestId: 1516,
				cmd: TE_CMD.FILE,
				payload: '04 00 00 00 00'
			},
			{
				capture: CAPTURE_FILES,
				index: 4,
				requestId: 1517,
				cmd: TE_CMD.FILE,
				payload: '04 00 01 00 00'
			},
			{
				capture: CAPTURE_ECHO,
				index: 0,
				requestId: 1290,
				cmd: TE_CMD.ECHO,
				payload: 'DE AD BE EF 00 7F 80 FF 01'
			},
			{
				capture: CAPTURE_SETTINGS,
				index: 0,
				requestId: 2336,
				cmd: TE_CMD.SETTINGS,
				payload: '01 03 E8'
			},
			{
				capture: CAPTURE_DISCOVER,
				index: 2,
				requestId: 2151,
				cmd: TE_CMD.FILE,
				payload: '0B 00 00'
			}
		];
		for (const { capture, index, requestId, cmd, payload } of sent) {
			const frame = buildRequestFrame({ deviceId: 0x21, requestId, cmd, payload: hex(payload) });
			expect(frame).toEqual(capture.frames[index].bytes);
		}
	});

	it('spreads the 12-bit request id over bytes 6 and 7', () => {
		const idBytes = (requestId: number) => {
			const frame = buildRequestFrame({ deviceId: 0x21, requestId, cmd: TE_CMD.GREET });
			return [frame[6], frame[7]];
		};
		expect(idBytes(0)).toEqual([0x60, 0x00]);
		expect(idBytes(127)).toEqual([0x60, 0x7f]);
		expect(idBytes(128)).toEqual([0x61, 0x00]);
		expect(idBytes(4095)).toEqual([0x7f, 0x7f]);
		for (const requestId of [0, 1, 127, 128, 1290, 2306, 4095]) {
			const [b6, b7] = idBytes(requestId);
			expect(requestIdFromBytes(b6, b7)).toBe(requestId);
		}
	});

	it('rejects out-of-range fields', () => {
		const ok = { deviceId: 0x21, requestId: 1, cmd: TE_CMD.GREET };
		for (const bad of [
			{ ...ok, deviceId: 0x80 },
			{ ...ok, deviceId: -1 },
			{ ...ok, deviceId: 1.5 },
			{ ...ok, requestId: 4096 },
			{ ...ok, requestId: -1 },
			{ ...ok, cmd: 0x80 },
			{ ...ok, payload: [0x100] }
		]) {
			expect(() => buildRequestFrame(bad)).toThrow(TeCodecError);
		}
	});
});

describe('buildResponseFrame', () => {
	it('reproduces real device replies', () => {
		const listData = hex(
			'00 00 00 01 0E 00 00 00 00 64 72 75 6D 00 00 02 0E 00 00 00 00 73 79 6E 74 68 00'
		);
		expect(
			buildResponseFrame({
				deviceId: 0x21,
				requestId: 2306,
				cmd: TE_CMD.FILE,
				status: 0,
				data: listData
			})
		).toEqual(LIST_ROOT_REPLY);
		expect(
			buildResponseFrame({ deviceId: 0x21, requestId: 2336, cmd: TE_CMD.SETTINGS, status: 2 })
		).toEqual(CAPTURE_SETTINGS.frames[1].bytes);
	});

	it('round-trips through parseFrame', () => {
		const random = prng(7);
		for (let k = 0; k < 50; k++) {
			const fields = {
				deviceId: Math.floor(random() * 128),
				requestId: Math.floor(random() * 4096),
				cmd: Math.floor(random() * 128),
				status: Math.floor(random() * 128),
				data: randomBytes(random, Math.floor(random() * 100))
			};
			expect(parseFrame(buildResponseFrame(fields))).toEqual({ kind: 'response', ...fields });
		}
	});

	it('rejects an out-of-range status', () => {
		expect(() =>
			buildResponseFrame({ deviceId: 0x21, requestId: 1, cmd: TE_CMD.GREET, status: 0x80 })
		).toThrow(TeCodecError);
	});
});

describe('parseFrame', () => {
	it('parses the real FILE LIST root reply', () => {
		const frame = expectKind(parseFrame(LIST_ROOT_REPLY), 'response');
		expect(frame).toMatchObject({ deviceId: 0x21, requestId: 2306, cmd: TE_CMD.FILE, status: 0 });
		expect(frame.data).toEqual(
			hex('00 00 00 01 0E 00 00 00 00 64 72 75 6D 00 00 02 0E 00 00 00 00 73 79 6E 74 68 00')
		);
	});

	it('parses the real FILE INIT reply', () => {
		const frame = expectKind(parseFrame(CAPTURE_FILES.frames[1].bytes), 'response');
		expect(frame).toMatchObject({ requestId: 1515, cmd: TE_CMD.FILE, status: 0 });
		expect(frame.data).toEqual(hex('0C 00 02 00 00'));
	});

	it('parses the real ECHO reply', () => {
		const frame = expectKind(parseFrame(CAPTURE_ECHO.frames[1].bytes), 'response');
		expect(frame.data).toEqual(hex('DE AD BE EF 00 7F 80 FF 01'));
	});

	it('parses the real SETTINGS reply: status 2 and no data', () => {
		const frame = expectKind(parseFrame(CAPTURE_SETTINGS.frames[1].bytes), 'response');
		expect(frame).toMatchObject({ requestId: 2336, cmd: TE_CMD.SETTINGS, status: 2 });
		expect(frame.data).toEqual(new Uint8Array(0));
	});

	it('parses the real status-3 replies to FILE INFO and METADATA GET', () => {
		for (const index of [3, 5]) {
			const frame = expectKind(parseFrame(CAPTURE_DISCOVER.frames[index].bytes), 'response');
			expect(frame.status).toBe(3);
			expect(frame.data.length).toBe(0);
		}
	});

	it('parses our own request as a request (what an echo looks like)', () => {
		const frame = expectKind(parseFrame(CAPTURE_ECHO.frames[0].bytes), 'request');
		expect(frame).toMatchObject({ deviceId: 0x21, requestId: 1290, cmd: TE_CMD.ECHO });
		expect(frame.payload).toEqual(hex('DE AD BE EF 00 7F 80 FF 01'));
	});

	it('reports a request without the request-id flag with a null id', () => {
		expect(parseFrame(hex('F0 00 20 76 21 40 40 00 01 F7'))).toEqual({
			kind: 'request',
			deviceId: 0x21,
			requestId: null,
			cmd: TE_CMD.GREET,
			payload: new Uint8Array(0)
		});
	});

	it('parses an unsolicited event (no request id)', () => {
		const data = [8, 0x00, 0x05, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, ...ascii('kick'), 0];
		const bytes = [...hex('F0 00 20 76 21 40 00 00 05 00'), ...pack7(data), 0xf7];
		expect(parseFrame(bytes)).toEqual({
			kind: 'event',
			deviceId: 0x21,
			cmd: TE_CMD.FILE,
			status: 0,
			data: Uint8Array.from(data)
		});
	});

	it('parses a firmware debug frame, with or without F7', () => {
		const text = 'err lfs 6327';
		const bytes = [...hex('F0 00 20 76 21 33'), ...ascii(text)];
		expect(parseFrame([...bytes, 0xf7])).toEqual({ kind: 'debug', deviceId: 0x21, text });
		expect(parseFrame(bytes)).toEqual({ kind: 'debug', deviceId: 0x21, text });
		expect(parseFrame(hex('F0 00 20 76 21 33 F7'))).toEqual({
			kind: 'debug',
			deviceId: 0x21,
			text: ''
		});
	});

	it('returns not-te for everything that is not TE protocol traffic', () => {
		for (const bytes of [
			[],
			[0xf0],
			[0x90, 60, 100],
			[0xf8],
			OPXY_IDENTITY_REPLY,
			hex('F0 7E 7F 06 01 F7'),
			hex('F0 43 10 4C 00 00 7E 00 F7'),
			hex('F0 00 20 77 21 40 60 01 01 F7'),
			hex('F0 00 20 76 21 10 60 01 01 F7') // TE manufacturer, another SysEx format
		]) {
			expect(parseFrame(bytes)).toEqual({ kind: 'not-te' });
		}
	});

	it('returns malformed for broken TE frames', () => {
		for (const text of [
			'F0 00 20 76',
			'F0 00 20 76 F7',
			'F0 00 20 76 21 F7',
			'F0 00 20 76 21 40 60 01 01', // no F7
			'F0 00 20 76 21 40 F7',
			'F0 00 20 76 21 40 60 01 F7', // no command byte
			'F0 00 20 76 21 40 20 01 01 F7', // response without a status byte
			'F0 00 20 76 21 40 60 01 01 90 F7', // status byte inside
			'F0 00 20 76 90 40 60 01 01 F7'
		]) {
			expect(parseFrame(hex(text)).kind, text).toBe('malformed');
		}
		expect(parseFrame([0xf0, 0x00, 0x20, 0x76, 0x21, 0x40, 0x60, 0x01, 0x101, 0xf7]).kind).toBe(
			'malformed'
		);
	});

	it('never throws on random input that starts like TE SysEx', () => {
		const random = prng(99);
		const kinds = new Set(['request', 'response', 'event', 'debug', 'malformed', 'not-te']);
		for (let k = 0; k < 2000; k++) {
			const tail = randomBytes(random, Math.floor(random() * 20));
			const bytes = [...hex('F0 00 20 76'), ...tail];
			expect(kinds.has(parseFrame(bytes).kind)).toBe(true);
		}
	});
});

describe('decodeStatus', () => {
	it('names the four generic statuses', () => {
		expect(decodeStatus(0)).toEqual({ code: 0, kind: 'ok', label: 'ok', final: true });
		expect(decodeStatus(1)).toEqual({ code: 1, kind: 'error', label: 'error', final: true });
		expect(decodeStatus(2)).toEqual({
			code: 2,
			kind: 'command-not-found',
			label: 'command not found',
			final: true
		});
		expect(decodeStatus(3)).toEqual({
			code: 3,
			kind: 'bad-request',
			label: 'bad request',
			final: true
		});
	});

	it('classifies every status byte by range', () => {
		for (let code = 4; code < 128; code++) {
			const status = decodeStatus(code);
			const expected = code < 16 ? 'reserved' : code < 64 ? 'specific-error' : 'in-progress';
			expect(status.kind).toBe(expected);
			expect(status.final).toBe(code < 64);
		}
	});

	it('rejects values that are not status bytes', () => {
		for (const bad of [-1, 128, 1.5]) expect(() => decodeStatus(bad)).toThrow(TeCodecError);
	});
});
