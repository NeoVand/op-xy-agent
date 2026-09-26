import { describe, expect, it } from 'vitest';
import { buildRequestFrame, decodeStatus, parseFrame, type TeResponseFrame } from './codec';
import {
	echoRequest,
	fileDeleteRequest,
	fileFlagNames,
	fileGetDataRequest,
	fileGetInitRequest,
	fileInfoRequest,
	fileInitRequest,
	fileListRequest,
	fileMetadataGetRequest,
	fileMetadataSetRequest,
	filePutDataRequest,
	filePutInitRequest,
	greetRequest,
	parseFileGetDataReply,
	parseFileGetInitReply,
	parseFileInfoReply,
	parseFileInitReply,
	parseFileListReply,
	parseFileMetadataGetReply,
	parseFilePutInitReply,
	parseGreetReply,
	type TeRequestSpec
} from './commands';
import { TE_CMD, TE_FILE_INIT_FLAG_SUBSCRIBE, TE_FILE_NODE_FLAG } from './constants';
import { TeCodecError, TePolicyError, TeProtocolError } from './errors';
import {
	ascii,
	CAPTURE_DISCOVER,
	CAPTURE_EMPTY_DIRS,
	CAPTURE_FILES,
	hex,
	LIST_ROOT_REPLY,
	SYNTHETIC_GREET_TEXT
} from './fixtures';
import { assertSendable, classifyOutgoing } from './policy';

function frameOf(spec: TeRequestSpec, requestId = 1): Uint8Array {
	return buildRequestFrame({ deviceId: 0x21, requestId, cmd: spec.cmd, payload: spec.payload });
}

function responseData(bytes: Uint8Array): Uint8Array {
	const frame = parseFrame(bytes);
	expect(frame.kind).toBe('response');
	return (frame as TeResponseFrame).data;
}

describe('GREET and ECHO', () => {
	it('builds GREET (read) as in 60-firmware.md §4.3', () => {
		const spec = greetRequest();
		expect(spec).toMatchObject({ cmd: TE_CMD.GREET, name: 'GREET', safety: 'read' });
		expect(spec.payload).toEqual(new Uint8Array(0));
		expect(frameOf(spec)).toEqual(hex('F0 00 20 76 21 40 60 01 01 F7'));
	});

	it('parses GREET reply data', () => {
		expect(parseGreetReply(ascii(SYNTHETIC_GREET_TEXT))).toMatchObject({
			product: 'OP-XY',
			os_version: '1.1.33',
			serial: 'TESTSERIAL',
			sku: 'TE033AS001'
		});
	});

	it('builds ECHO (read) as in 60-firmware.md §4.3', () => {
		const spec = echoRequest([0xde, 0xad, 0xbe, 0xef]);
		expect(spec).toMatchObject({ cmd: TE_CMD.ECHO, name: 'ECHO', safety: 'read' });
		expect(frameOf(spec, 2)).toEqual(hex('F0 00 20 76 21 40 60 02 02 0F 5E 2D 3E 6F F7'));
		expect(() => echoRequest([0x100])).toThrow(TeCodecError);
	});
});

describe('FILE INIT', () => {
	it('builds the read-only session opener the probe used', () => {
		const spec = fileInitRequest();
		expect(spec).toMatchObject({ cmd: TE_CMD.FILE, name: 'FILE INIT', safety: 'read' });
		expect(spec.payload).toEqual(hex('01 00 00 40 00 00'));
		expect(frameOf(spec, 1515)).toEqual(CAPTURE_FILES.frames[0].bytes);
	});

	it('encodes flags and the max response length (u32 BE)', () => {
		expect(fileInitRequest({ flags: TE_FILE_INIT_FLAG_SUBSCRIBE }).payload).toEqual(
			hex('01 01 00 40 00 00')
		);
		expect(fileInitRequest({ maxResponseLength: 0x12345678 }).payload).toEqual(
			hex('01 00 12 34 56 78')
		);
	});

	it('refuses undocumented flags and out-of-range lengths', () => {
		expect(() => fileInitRequest({ flags: 2 })).toThrow(TeCodecError);
		expect(() => fileInitRequest({ maxResponseLength: -1 })).toThrow(TeCodecError);
		expect(() => fileInitRequest({ maxResponseLength: 2 ** 32 })).toThrow(TeCodecError);
	});

	it('parses the real reply: chunk size 131072', () => {
		expect(parseFileInitReply(responseData(CAPTURE_FILES.frames[1].bytes))).toEqual({
			leadingByte: 0x0c,
			chunkSize: 131072
		});
		expect(parseFileInitReply(hex('0C 00 02 00 00'))).toEqual({
			leadingByte: 0x0c,
			chunkSize: 0x20000
		});
	});

	it('reads the chunk size as unsigned and rejects short replies', () => {
		expect(parseFileInitReply(hex('00 FF FF FF FF')).chunkSize).toBe(0xffffffff);
		expect(() => parseFileInitReply(hex('0C 00 02 00'))).toThrow(TeProtocolError);
	});
});

describe('FILE LIST', () => {
	it('builds page/node requests (read)', () => {
		expect(fileListRequest(0, 0)).toMatchObject({ name: 'FILE LIST', safety: 'read' });
		expect(fileListRequest(0, 0).payload).toEqual(hex('04 00 00 00 00'));
		expect(fileListRequest(1, 0x0102).payload).toEqual(hex('04 00 01 01 02'));
		expect(frameOf(fileListRequest(0, 0), 6)).toEqual(
			hex('F0 00 20 76 21 40 60 06 05 00 04 00 00 00 00 F7')
		);
		expect(frameOf(fileListRequest(0, 1), 1850)).toEqual(CAPTURE_EMPTY_DIRS.frames[0].bytes);
		expect(() => fileListRequest(0x10000, 0)).toThrow(TeCodecError);
		expect(() => fileListRequest(0, -1)).toThrow(TeCodecError);
	});

	it('parses the real root listing: drum (1) and synth (2), dir|read|write', () => {
		const page = parseFileListReply(responseData(LIST_ROOT_REPLY));
		expect(page).toEqual({
			page: 0,
			entries: [
				{ id: 1, flags: 0x0e, size: 0, name: 'drum' },
				{ id: 2, flags: 0x0e, size: 0, name: 'synth' }
			]
		});
		for (const entry of page.entries)
			expect(fileFlagNames(entry.flags)).toEqual(['dir', 'read', 'write']);
	});

	it('parses the real empty pages', () => {
		expect(parseFileListReply(responseData(CAPTURE_FILES.frames[5].bytes))).toEqual({
			page: 1,
			entries: []
		});
		expect(parseFileListReply(responseData(CAPTURE_EMPTY_DIRS.frames[1].bytes))).toEqual({
			page: 0,
			entries: []
		});
	});

	it('reads sizes as unsigned u32 and accepts a missing final NUL', () => {
		const data = Uint8Array.from([
			0x00,
			0x03,
			0x12,
			0x34,
			0x05,
			0xff,
			0xff,
			0xff,
			0xfe,
			...ascii('kick.wav')
		]);
		expect(parseFileListReply(data).entries).toEqual([
			{ id: 0x1234, flags: 0x05, size: 0xfffffffe, name: 'kick.wav' }
		]);
	});

	it('rejects truncated replies', () => {
		expect(() => parseFileListReply(hex('00'))).toThrow(TeProtocolError);
		expect(() => parseFileListReply(hex('00 00 00 01 0E 00 00'))).toThrow(TeProtocolError);
	});

	it('names every node flag', () => {
		expect(fileFlagNames(0)).toEqual([]);
		expect(fileFlagNames(0x7f)).toEqual([
			'file',
			'dir',
			'read',
			'write',
			'delete',
			'move',
			'playback'
		]);
		expect(fileFlagNames(TE_FILE_NODE_FLAG.FILE | TE_FILE_NODE_FLAG.READ)).toEqual([
			'file',
			'read'
		]);
	});
});

describe('FILE INFO and METADATA GET (EP-133 layout; status 3 on OP-XY 1.1.33)', () => {
	it('build exactly the frames the OP-XY refused with "bad request"', () => {
		expect(fileInfoRequest(0)).toMatchObject({ name: 'FILE INFO', safety: 'read' });
		expect(frameOf(fileInfoRequest(0), 2151)).toEqual(CAPTURE_DISCOVER.frames[2].bytes);
		expect(frameOf(fileMetadataGetRequest(0, 0), 2152)).toEqual(CAPTURE_DISCOVER.frames[4].bytes);
		for (const index of [3, 5]) {
			const frame = parseFrame(CAPTURE_DISCOVER.frames[index].bytes) as TeResponseFrame;
			expect(decodeStatus(frame.status).kind).toBe('bad-request');
		}
	});

	it('appends an optional NUL-terminated key to METADATA GET', () => {
		const spec = fileMetadataGetRequest(1, 2, 'formats');
		expect(spec).toMatchObject({ name: 'FILE METADATA GET', safety: 'read' });
		expect(spec.payload).toEqual(
			Uint8Array.from([0x07, 0x02, 0x00, 0x01, 0x00, 0x02, ...ascii('formats'), 0])
		);
		expect(() => fileMetadataGetRequest(1, 0, '')).toThrow(TeCodecError);
		expect(() => fileMetadataGetRequest(1, 0, 'ké')).toThrow(TeCodecError);
	});

	it('parses EP-133-style replies', () => {
		const info = Uint8Array.from([
			0x00,
			0x05,
			0x00,
			0x01,
			0x05,
			0x00,
			0x00,
			0x10,
			0x00,
			...ascii('kick'),
			0
		]);
		expect(parseFileInfoReply(info)).toEqual({
			id: 5,
			parentId: 1,
			flags: 0x05,
			size: 4096,
			name: 'kick'
		});
		expect(() => parseFileInfoReply(hex('00 05 00 01 05 00 00 10'))).toThrow(TeProtocolError);

		const json = '{"channels":1}';
		expect(parseFileMetadataGetReply(Uint8Array.from([0x00, 0x00, ...ascii(json), 0]))).toEqual({
			page: 0,
			text: json,
			last: true
		});
		expect(parseFileMetadataGetReply(Uint8Array.from([0x00, 0x01, ...ascii('{"a"')]))).toEqual({
			page: 1,
			text: '{"a"',
			last: false
		});
		expect(parseFileMetadataGetReply(hex('00 02'))).toEqual({ page: 2, text: '', last: true });
		expect(() => parseFileMetadataGetReply(hex('00'))).toThrow(TeProtocolError);
	});
});

describe('FILE GET (read)', () => {
	it('builds open and page requests', () => {
		expect(fileGetInitRequest(5)).toMatchObject({ name: 'FILE GET (open)', safety: 'read' });
		expect(fileGetInitRequest(5).payload).toEqual(hex('03 00 00 05 00 00 00 00'));
		expect(fileGetInitRequest(0x1234, 0x01020304).payload).toEqual(hex('03 00 12 34 01 02 03 04'));
		expect(fileGetDataRequest(7)).toMatchObject({ name: 'FILE GET (page)', safety: 'read' });
		expect(fileGetDataRequest(7).payload).toEqual(hex('03 01 00 07'));
	});

	it('parses open and page replies', () => {
		const open = Uint8Array.from([0x00, 0x05, 0x05, 0x00, 0x00, 0x00, 0x2c, ...ascii('a.wav'), 0]);
		expect(parseFileGetInitReply(open)).toEqual({ id: 5, flags: 0x05, size: 44, name: 'a.wav' });
		expect(parseFileGetDataReply(hex('00 03 DE AD'))).toEqual({ page: 3, data: hex('DE AD') });
		expect(() => parseFileGetInitReply(hex('00 05 05 00 00 00'))).toThrow(TeProtocolError);
		expect(() => parseFileGetDataReply(hex('00'))).toThrow(TeProtocolError);
	});
});

describe('FILE PUT, DELETE and METADATA SET (write)', () => {
	const put = {
		parentId: 1,
		flags: TE_FILE_NODE_FLAG.FILE | TE_FILE_NODE_FLAG.READ,
		size: 44100,
		name: 'zz probe'
	};

	it('builds PUT open as TE’s tool does', () => {
		const spec = filePutInitRequest(put);
		expect(spec).toMatchObject({ cmd: TE_CMD.FILE, name: 'FILE PUT (open)', safety: 'write' });
		expect(spec.payload).toEqual(
			Uint8Array.from([
				0x02,
				0x00,
				0x05,
				0x00,
				0x00,
				0x00,
				0x01,
				0x00,
				0x00,
				0xac,
				0x44,
				...ascii('zz probe'),
				0
			])
		);
	});

	it('appends inline metadata after the name without a terminator', () => {
		const metadata = '{"channels":1,"samplerate":44100,"format":"s16"}';
		const spec = filePutInitRequest({ ...put, fileId: 9, metadata });
		expect(Array.from(spec.payload.subarray(3, 5))).toEqual([0x00, 0x09]);
		expect(spec.payload.subarray(-metadata.length)).toEqual(ascii(metadata));
		expect(spec.payload[spec.payload.length - metadata.length - 1]).toBe(0);
	});

	it('validates PUT flags, name and metadata', () => {
		expect(() => filePutInitRequest({ ...put, flags: TE_FILE_NODE_FLAG.READ })).toThrow(
			TeCodecError
		);
		expect(() => filePutInitRequest({ ...put, flags: 0x03 })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, flags: 0x80 })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, name: '' })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, name: 'x'.repeat(55) })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, name: 'café' })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, name: 'a\nb' })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, metadata: '{"n":"é"}' })).toThrow(TeCodecError);
		expect(() => filePutInitRequest({ ...put, size: 2 ** 32 })).toThrow(TeCodecError);
		expect(filePutInitRequest({ ...put, name: 'x'.repeat(54) }).payload.length).toBe(11 + 54 + 1);
		expect(filePutInitRequest({ ...put, flags: TE_FILE_NODE_FLAG.DIR }).payload[2]).toBe(0x02);
	});

	it('builds PUT data pages; an empty page ends the transfer', () => {
		const spec = filePutDataRequest(2, [0xde, 0xad]);
		expect(spec).toMatchObject({ name: 'FILE PUT (data)', safety: 'write' });
		expect(spec.payload).toEqual(hex('02 01 00 02 DE AD'));
		expect(filePutDataRequest(3, []).payload).toEqual(hex('02 01 00 03'));
		expect(parseFilePutInitReply(hex('00 2A'))).toEqual({ fileId: 42 });
		expect(() => parseFilePutInitReply(hex('00'))).toThrow(TeProtocolError);
	});

	it('builds DELETE and METADATA SET', () => {
		expect(fileDeleteRequest(5)).toMatchObject({ name: 'FILE DELETE', safety: 'write' });
		expect(fileDeleteRequest(5).payload).toEqual(hex('06 00 05'));
		const spec = fileMetadataSetRequest(5, '{"sound.rootnote":60}');
		expect(spec).toMatchObject({ name: 'FILE METADATA SET', safety: 'write' });
		expect(spec.payload).toEqual(
			Uint8Array.from([0x07, 0x01, 0x00, 0x05, ...ascii('{"sound.rootnote":60}'), 0])
		);
		expect(() => fileMetadataSetRequest(5, '')).toThrow(TeCodecError);
	});
});

describe('builders agree with the outgoing policy', () => {
	const specs: TeRequestSpec[] = [
		greetRequest(),
		echoRequest([]),
		echoRequest([0xde, 0xad, 0xbe, 0xef, 0x00, 0x7f, 0x80, 0xff, 0x01]),
		fileInitRequest(),
		fileInitRequest({ flags: TE_FILE_INIT_FLAG_SUBSCRIBE }),
		fileListRequest(3, 2),
		fileInfoRequest(1),
		fileMetadataGetRequest(1),
		fileMetadataGetRequest(1, 0, 'formats'),
		fileGetInitRequest(1, 100),
		fileGetDataRequest(0),
		filePutInitRequest({ parentId: 1, flags: 0x05, size: 10, name: 'a' }),
		filePutInitRequest({ parentId: 2, flags: 0x02, size: 0, name: 'kit', metadata: '{}' }),
		filePutDataRequest(0, [1, 2, 3]),
		filePutDataRequest(1, []),
		fileDeleteRequest(1),
		fileMetadataSetRequest(1, '{}')
	];

	it.each(specs.map((spec) => [spec.name, spec] as const))('%s', (_name, spec) => {
		const frame = frameOf(spec, 77);
		expect(classifyOutgoing(frame)).toMatchObject({
			kind: 'te',
			cmd: spec.cmd,
			name: spec.name,
			safety: spec.safety
		});
		if (spec.safety === 'write') {
			expect(() => assertSendable(frame, { allowWrites: false })).toThrow(TePolicyError);
		}
		expect(assertSendable(frame, { allowWrites: true })).toMatchObject({ safety: spec.safety });
	});
});
