// Typed builders and parsers for the TE commands the app uses: GREET (0x01), ECHO (0x02) and FILE
// (0x05). Each builder returns a TeRequestSpec that states the safety class it intends; policy.ts
// derives the class on its own from the frame bytes, and commands.spec.ts checks that they agree.
//
// FILE layouts follow TE's EP sample tool (docs/research/60-firmware.md §4.3,
// knowledge/firmware/te-sysex.json). On the OP-XY (OS 1.1.33) only INIT and LIST are verified. INFO
// and METADATA GET in the EP-133 layout were answered with status 3 "bad request"
// (docs/research/90-device-probe.md, FILE discovery R1/R2), and GET, PUT, DELETE and METADATA SET
// have never been sent to it.

import {
	assertIntInRange,
	decodeText,
	encodeAscii,
	nulIndex,
	readU16,
	readU32,
	toBytes,
	u16,
	u32
} from './bytes';
import {
	TE_CMD,
	TE_FILE,
	TE_FILE_DEFAULT_MAX_RESPONSE_LENGTH,
	TE_FILE_GET_TYPE,
	TE_FILE_INIT_FLAG_SUBSCRIBE,
	TE_FILE_METADATA,
	TE_FILE_NODE_FLAG,
	TE_FILE_PUT_TYPE
} from './constants';
import { TeCodecError, TeProtocolError } from './errors';
import { parseGreetMetadata, type TeGreetInfo } from './identity';
import type { TeSafety } from './policy';

/** A request ready for the client: command, raw payload, a name for logs, and its safety class. */
export interface TeRequestSpec {
	/** Command number (byte 8). */
	readonly cmd: number;
	/** Raw (unpacked) payload; the frame builder packs it. */
	readonly payload: Uint8Array;
	/** Name for logs and approval prompts, e.g. "FILE LIST". */
	readonly name: string;
	/** Class this builder intends: `read` is harmless, `write` changes device state and needs approval. */
	readonly safety: Exclude<TeSafety, 'forbidden'>;
}

function spec(
	cmd: number,
	name: string,
	safety: TeRequestSpec['safety'],
	payload: ArrayLike<number>
): TeRequestSpec {
	return { cmd, name, safety, payload: toBytes(payload, `${name} payload`) };
}

function requireLength(data: Uint8Array, min: number, what: string): void {
	if (data.length < min) {
		throw new TeProtocolError(`${what}: expected at least ${min} bytes, got ${data.length}`);
	}
}

// ─── GREET / ECHO (read) ─────────────────────────────────────────────────────────────────────────

/** GREET (0x01), no payload; the reply is ASCII metadata. **Safety: read.** Verified on OP-XY 1.1.33. */
export function greetRequest(): TeRequestSpec {
	return spec(TE_CMD.GREET, 'GREET', 'read', []);
}

/** Parses GREET reply data (`product:OP-XY;mode:normal;…`). */
export function parseGreetReply(data: Uint8Array): TeGreetInfo {
	return parseGreetMetadata(decodeText(data));
}

/**
 * ECHO (0x02): the device returns the payload unchanged, which tests packed-7 end to end.
 * **Safety: read.** Verified on OP-XY 1.1.33.
 */
export function echoRequest(data: ArrayLike<number>): TeRequestSpec {
	return spec(TE_CMD.ECHO, 'ECHO', 'read', data);
}

// ─── FILE: read ──────────────────────────────────────────────────────────────────────────────────

/** Options for FILE INIT. */
export interface TeFileInitOptions {
	/** 0 (default), or {@link TE_FILE_INIT_FLAG_SUBSCRIBE} to receive file events. */
	readonly flags?: number;
	/** Largest reply the device may send, in bytes (u32). Default 4 MiB, like TE's tool. */
	readonly maxResponseLength?: number;
}

/**
 * FILE INIT `[01, flags, maxResponseLength u32]` opens a FILE session. **Safety: read.** Verified
 * on OP-XY 1.1.33 with flags 0.
 * @throws TeCodecError on undocumented flags or an out-of-range length.
 */
export function fileInitRequest(options: TeFileInitOptions = {}): TeRequestSpec {
	const flags = options.flags ?? 0;
	if (flags !== 0 && flags !== TE_FILE_INIT_FLAG_SUBSCRIBE) {
		throw new TeCodecError(
			`FILE INIT flags must be 0 or ${TE_FILE_INIT_FLAG_SUBSCRIBE} (subscribe); got ${String(flags)}`
		);
	}
	const maxResponseLength = options.maxResponseLength ?? TE_FILE_DEFAULT_MAX_RESPONSE_LENGTH;
	return spec(TE_CMD.FILE, 'FILE INIT', 'read', [
		TE_FILE.INIT,
		flags,
		...u32(maxResponseLength, 'max response length')
	]);
}

/** FILE INIT reply. */
export interface TeFileInitReply {
	/** First reply byte; meaning unknown (0x0C on OP-XY 1.1.33, perhaps a protocol version). */
	readonly leadingByte: number;
	/** Largest message the device handles, in bytes (131072 = 128 KiB on OP-XY 1.1.33). */
	readonly chunkSize: number;
}

/**
 * Parses FILE INIT reply data `[?, chunkSize u32]`.
 * @throws TeProtocolError when shorter than 5 bytes.
 */
export function parseFileInitReply(data: Uint8Array): TeFileInitReply {
	requireLength(data, 5, 'FILE INIT reply');
	return { leadingByte: data[0], chunkSize: readU32(data, 1) };
}

/**
 * FILE LIST `[04, page u16, node u16]`: one page of a directory (node 0 is the root).
 * **Safety: read.** Verified on OP-XY 1.1.33.
 */
export function fileListRequest(page: number, node: number): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE LIST', 'read', [
		TE_FILE.LIST,
		...u16(page, 'page'),
		...u16(node, 'node id')
	]);
}

/** One directory entry from FILE LIST. */
export interface TeFileEntry {
	/** Node id (u16). */
	readonly id: number;
	/** Node flags; see {@link TE_FILE_NODE_FLAG} and {@link fileFlagNames}. */
	readonly flags: number;
	/** Size in bytes (u32; 0 for directories). */
	readonly size: number;
	readonly name: string;
}

/** One FILE LIST page. An empty page ends the listing. */
export interface TeFileListPage {
	readonly page: number;
	readonly entries: readonly TeFileEntry[];
}

/**
 * Parses FILE LIST reply data: `page u16`, then entries `{id u16, flags u8, size u32 BE, name, 00}`.
 * Like TE's tool it accepts a missing NUL after the last name.
 * @throws TeProtocolError on a missing page number or a truncated entry.
 */
export function parseFileListReply(data: Uint8Array): TeFileListPage {
	requireLength(data, 2, 'FILE LIST reply');
	const entries: TeFileEntry[] = [];
	let offset = 2;
	while (offset < data.length) {
		if (data.length - offset < 7) {
			throw new TeProtocolError(`FILE LIST reply: truncated entry at byte ${offset}`);
		}
		const nameEnd = nulIndex(data, offset + 7);
		entries.push({
			id: readU16(data, offset),
			flags: data[offset + 2],
			size: readU32(data, offset + 3),
			name: decodeText(data.subarray(offset + 7, nameEnd))
		});
		offset = nameEnd + 1;
	}
	return { page: readU16(data, 0), entries };
}

/** Name of a FILE node flag. */
export type TeFileFlagName = 'file' | 'dir' | 'read' | 'write' | 'delete' | 'move' | 'playback';

const FLAG_NAMES: readonly (readonly [number, TeFileFlagName])[] = [
	[TE_FILE_NODE_FLAG.FILE, 'file'],
	[TE_FILE_NODE_FLAG.DIR, 'dir'],
	[TE_FILE_NODE_FLAG.READ, 'read'],
	[TE_FILE_NODE_FLAG.WRITE, 'write'],
	[TE_FILE_NODE_FLAG.DELETE, 'delete'],
	[TE_FILE_NODE_FLAG.MOVE, 'move'],
	[TE_FILE_NODE_FLAG.PLAYBACK, 'playback']
];

/** Names of the flags set in `flags`, lowest bit first (0x0E → dir, read, write). */
export function fileFlagNames(flags: number): TeFileFlagName[] {
	return FLAG_NAMES.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name);
}

/**
 * FILE INFO `[0B, id u16]`. **Safety: read.** OP-XY 1.1.33 answers status 3 "bad request" for nodes
 * 0–2: its FILE dialect is not the EP-133 one, so this layout is unconfirmed on the OP-XY.
 */
export function fileInfoRequest(id: number): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE INFO', 'read', [TE_FILE.INFO, ...u16(id, 'node id')]);
}

/** FILE INFO reply (EP-133 layout). */
export interface TeFileInfo {
	readonly id: number;
	readonly parentId: number;
	readonly flags: number;
	readonly size: number;
	readonly name: string;
}

/**
 * Parses FILE INFO reply data `{id u16, parent u16, flags u8, size u32, name, 00}` (EP-133 layout).
 * @throws TeProtocolError when shorter than 9 bytes.
 */
export function parseFileInfoReply(data: Uint8Array): TeFileInfo {
	requireLength(data, 9, 'FILE INFO reply');
	return {
		id: readU16(data, 0),
		parentId: readU16(data, 2),
		flags: data[4],
		size: readU32(data, 5),
		name: decodeText(data.subarray(9, nulIndex(data, 9)))
	};
}

/**
 * FILE METADATA GET `[07, 02, id u16, page u16]` plus an optional `key, 00`. **Safety: read.**
 * OP-XY 1.1.33 answers status 3 "bad request" for nodes 0–2 (see {@link fileInfoRequest}).
 */
export function fileMetadataGetRequest(id: number, page = 0, key?: string): TeRequestSpec {
	if (key === '') throw new TeCodecError('metadata key must not be empty');
	return spec(TE_CMD.FILE, 'FILE METADATA GET', 'read', [
		TE_FILE.METADATA,
		TE_FILE_METADATA.GET,
		...u16(id, 'node id'),
		...u16(page, 'page'),
		...(key === undefined ? [] : [...encodeAscii(key, 'metadata key'), 0])
	]);
}

/** One page of FILE METADATA GET text. */
export interface TeFileMetadataPage {
	readonly page: number;
	/** JSON text fragment; concatenate pages until `last`. */
	readonly text: string;
	/** True when the page is empty or ends with a NUL (TE's end-of-metadata rule). */
	readonly last: boolean;
}

/**
 * Parses FILE METADATA GET reply data `page u16` + NUL-terminated JSON text.
 * @throws TeProtocolError when shorter than 2 bytes.
 */
export function parseFileMetadataGetReply(data: Uint8Array): TeFileMetadataPage {
	requireLength(data, 2, 'FILE METADATA GET reply');
	return {
		page: readU16(data, 0),
		text: decodeText(data.subarray(2, nulIndex(data, 2))),
		last: data.length === 2 || data[data.length - 1] === 0
	};
}

/**
 * FILE GET open `[03, 00, id u16, offset u32]`. **Safety: read**, but page no further than the
 * `size` in the reply: EP units corrupt their FILE session when read past the end. Never sent to
 * the OP-XY yet.
 */
export function fileGetInitRequest(id: number, offset = 0): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE GET (open)', 'read', [
		TE_FILE.GET,
		TE_FILE_GET_TYPE.INIT,
		...u16(id, 'file id'),
		...u32(offset, 'offset')
	]);
}

/** FILE GET open reply. */
export interface TeFileGetInfo {
	readonly id: number;
	readonly flags: number;
	readonly size: number;
	readonly name: string;
}

/**
 * Parses FILE GET open reply data `{id u16, flags u8, size u32, name, 00}`.
 * @throws TeProtocolError when shorter than 7 bytes.
 */
export function parseFileGetInitReply(data: Uint8Array): TeFileGetInfo {
	requireLength(data, 7, 'FILE GET reply');
	return {
		id: readU16(data, 0),
		flags: data[2],
		size: readU32(data, 3),
		name: decodeText(data.subarray(7, nulIndex(data, 7)))
	};
}

/** FILE GET page `[03, 01, page u16]`. **Safety: read.** Never sent to the OP-XY yet. */
export function fileGetDataRequest(page: number): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE GET (page)', 'read', [
		TE_FILE.GET,
		TE_FILE_GET_TYPE.DATA,
		...u16(page, 'page')
	]);
}

/** One page of file data (FILE GET). */
export interface TeFileDataPage {
	readonly page: number;
	readonly data: Uint8Array;
}

/**
 * Parses FILE GET page reply data `page u16` + bytes.
 * @throws TeProtocolError when shorter than 2 bytes.
 */
export function parseFileGetDataReply(data: Uint8Array): TeFileDataPage {
	requireLength(data, 2, 'FILE GET page reply');
	return { page: readU16(data, 0), data: data.slice(2) };
}

// ─── FILE: write (owner approval, a fresh backup and a journal entry first; 60-firmware.md §8) ────

/** Fields of a FILE PUT open request. */
export interface TeFilePutInit {
	/** Existing id to overwrite, or 0 (default) to let the device assign one. */
	readonly fileId?: number;
	/** Directory node id (on the OP-XY 1.1.33: 1 = `drum`, 2 = `synth`). */
	readonly parentId: number;
	/** Exactly one of FILE (1) / DIR (2) plus capability bits; TE's tool sends FILE | READ. */
	readonly flags: number;
	/** Total size in bytes (u32). */
	readonly size: number;
	/** 1–54 printable ASCII characters (TE's limit). */
	readonly name: string;
	/** Optional inline JSON (printable ASCII), appended after the name's NUL with no terminator, as TE does. */
	readonly metadata?: string;
}

/** Longest file name TE's tool sends in FILE PUT. */
export const TE_FILE_NAME_MAX_LENGTH = 54;

/**
 * FILE PUT open `[02, 00, flags, fileId u16, parentId u16, size u32, name, 00, metadata?]`; the
 * reply carries the file id. **Safety: write** (creates or overwrites device content). Never sent
 * to the OP-XY yet.
 * @throws TeCodecError on invalid flags, name or metadata.
 */
export function filePutInitRequest(put: TeFilePutInit): TeRequestSpec {
	const flags = assertIntInRange(put.flags, 0, 0x7f, 'FILE PUT flags');
	const kind = flags & (TE_FILE_NODE_FLAG.FILE | TE_FILE_NODE_FLAG.DIR);
	if (kind !== TE_FILE_NODE_FLAG.FILE && kind !== TE_FILE_NODE_FLAG.DIR) {
		throw new TeCodecError('FILE PUT flags must include exactly one of FILE (1) and DIR (2)');
	}
	if (put.name.length < 1 || put.name.length > TE_FILE_NAME_MAX_LENGTH) {
		throw new TeCodecError(`FILE PUT name must be 1–${TE_FILE_NAME_MAX_LENGTH} characters`);
	}
	return spec(TE_CMD.FILE, 'FILE PUT (open)', 'write', [
		TE_FILE.PUT,
		TE_FILE_PUT_TYPE.INIT,
		flags,
		...u16(put.fileId ?? 0, 'file id'),
		...u16(put.parentId, 'parent id'),
		...u32(put.size, 'size'),
		...encodeAscii(put.name, 'FILE PUT name'),
		0,
		...(put.metadata === undefined ? [] : encodeAscii(put.metadata, 'FILE PUT metadata'))
	]);
}

/**
 * Parses FILE PUT open reply data `fileId u16`.
 * @throws TeProtocolError when shorter than 2 bytes.
 */
export function parseFilePutInitReply(data: Uint8Array): { readonly fileId: number } {
	requireLength(data, 2, 'FILE PUT reply');
	return { fileId: readU16(data, 0) };
}

/**
 * FILE PUT page `[02, 01, page u16, bytes…]`; an empty page ends the transfer.
 * **Safety: write.** Never sent to the OP-XY yet.
 */
export function filePutDataRequest(page: number, data: ArrayLike<number>): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE PUT (data)', 'write', [
		TE_FILE.PUT,
		TE_FILE_PUT_TYPE.DATA,
		...u16(page, 'page'),
		...toBytes(data, 'FILE PUT data')
	]);
}

/** FILE DELETE `[06, id u16]`. **Safety: write** (removes device content). Never sent to the OP-XY yet. */
export function fileDeleteRequest(id: number): TeRequestSpec {
	return spec(TE_CMD.FILE, 'FILE DELETE', 'write', [TE_FILE.DELETE, ...u16(id, 'file id')]);
}

/**
 * FILE METADATA SET `[07, 01, id u16, json, 00]`. **Safety: write.** Never sent to the OP-XY yet.
 * @throws TeCodecError when `json` is empty or not printable ASCII.
 */
export function fileMetadataSetRequest(id: number, json: string): TeRequestSpec {
	if (json === '') throw new TeCodecError('metadata JSON must not be empty');
	return spec(TE_CMD.FILE, 'FILE METADATA SET', 'write', [
		TE_FILE.METADATA,
		TE_FILE_METADATA.SET,
		...u16(id, 'file id'),
		...encodeAscii(json, 'metadata JSON'),
		0
	]);
}
