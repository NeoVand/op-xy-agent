/**
 * MTP containers and datasets: little-endian integers, PTP strings (a length byte counting UTF-16
 * code units with the terminating null, then UTF-16LE), and the DeviceInfo, StorageInfo and
 * ObjectInfo datasets.
 */
import { CONTAINER, FORMAT, GENERIC_FOLDER, HEADER_BYTES } from './codes';

export class MtpFormatError extends Error {
	override name = 'MtpFormatError';
}

/** One container as it travels over USB. */
export interface Container {
	readonly type: number;
	readonly code: number;
	readonly transactionId: number;
	/** Command and response parameters (u32 each); a data container's payload is in `payload`. */
	readonly params: readonly number[];
	readonly payload: Uint8Array;
}

/** A command or response container with up to five u32 parameters. */
export function encodeContainer(
	type: number,
	code: number,
	transactionId: number,
	params: readonly number[] = []
): Uint8Array {
	const bytes = new Uint8Array(HEADER_BYTES + 4 * params.length);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, bytes.length, true);
	view.setUint16(4, type, true);
	view.setUint16(6, code, true);
	view.setUint32(8, transactionId, true);
	params.forEach((p, i) => view.setUint32(HEADER_BYTES + 4 * i, p >>> 0, true));
	return bytes;
}

/** A data container carrying `payload`. */
export function encodeData(code: number, transactionId: number, payload: Uint8Array): Uint8Array {
	const bytes = new Uint8Array(HEADER_BYTES + payload.length);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, bytes.length, true);
	view.setUint16(4, CONTAINER.data, true);
	view.setUint16(6, code, true);
	view.setUint32(8, transactionId, true);
	bytes.set(payload, HEADER_BYTES);
	return bytes;
}

/** The declared length of the container starting at `bytes[0]`, or null before a full header. */
export function containerLength(bytes: Uint8Array): number | null {
	if (bytes.length < HEADER_BYTES) return null;
	const length = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
	if (length < HEADER_BYTES) throw new MtpFormatError(`container length ${length} is too short`);
	return length;
}

/** Reads one whole container (exactly `containerLength` bytes). */
export function parseContainer(bytes: Uint8Array): Container {
	const length = containerLength(bytes);
	if (length === null || bytes.length < length) throw new MtpFormatError('incomplete container');
	const view = new DataView(bytes.buffer, bytes.byteOffset, length);
	const type = view.getUint16(4, true);
	const payload = bytes.subarray(HEADER_BYTES, length);
	const params: number[] = [];
	if (type !== CONTAINER.data) {
		for (let at = HEADER_BYTES; at + 4 <= length; at += 4) params.push(view.getUint32(at, true));
	}
	return {
		type,
		code: view.getUint16(6, true),
		transactionId: view.getUint32(8, true),
		params,
		payload
	};
}

/** A reader over a dataset. */
class Reader {
	readonly #view: DataView;
	at = 0;
	constructor(readonly bytes: Uint8Array) {
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}
	#need(n: number) {
		if (this.at + n > this.bytes.length) throw new MtpFormatError('dataset ends early');
	}
	u8() {
		this.#need(1);
		return this.#view.getUint8(this.at++);
	}
	u16() {
		this.#need(2);
		const v = this.#view.getUint16(this.at, true);
		this.at += 2;
		return v;
	}
	u32() {
		this.#need(4);
		const v = this.#view.getUint32(this.at, true);
		this.at += 4;
		return v;
	}
	u64() {
		const low = this.u32();
		return this.u32() * 2 ** 32 + low;
	}
	u16s() {
		return Array.from({ length: this.u32() }, () => this.u16());
	}
	u32s() {
		return Array.from({ length: this.u32() }, () => this.u32());
	}
	string() {
		const units = this.u8();
		this.#need(2 * units);
		let text = '';
		for (let i = 0; i < units; i++) text += String.fromCharCode(this.u16());
		return text.replace(/\0+$/, '');
	}
}

/** A PTP string: its length byte (with the null) and UTF-16LE; the empty string is one zero byte. */
export function encodeString(text: string): Uint8Array {
	if (text.length === 0) return new Uint8Array(1);
	if (text.length > 254) throw new MtpFormatError('an MTP string holds at most 254 characters');
	const bytes = new Uint8Array(1 + 2 * (text.length + 1));
	const view = new DataView(bytes.buffer);
	bytes[0] = text.length + 1;
	for (let i = 0; i < text.length; i++) view.setUint16(1 + 2 * i, text.charCodeAt(i), true);
	return bytes;
}

/** A u32 array dataset (as GetStorageIDs and GetObjectHandles return). */
export const parseU32Array = (bytes: Uint8Array): number[] =>
	bytes.length === 0 ? [] : new Reader(bytes).u32s();

export interface DeviceInfo {
	readonly standardVersion: number;
	readonly vendorExtensionId: number;
	readonly vendorExtensionVersion: number;
	readonly vendorExtension: string;
	readonly functionalMode: number;
	readonly operations: readonly number[];
	readonly events: readonly number[];
	readonly deviceProperties: readonly number[];
	readonly captureFormats: readonly number[];
	readonly playbackFormats: readonly number[];
	readonly manufacturer: string;
	readonly model: string;
	readonly deviceVersion: string;
	readonly serialNumber: string;
}

export function parseDeviceInfo(bytes: Uint8Array): DeviceInfo {
	const r = new Reader(bytes);
	return {
		standardVersion: r.u16(),
		vendorExtensionId: r.u32(),
		vendorExtensionVersion: r.u16(),
		vendorExtension: r.string(),
		functionalMode: r.u16(),
		operations: r.u16s(),
		events: r.u16s(),
		deviceProperties: r.u16s(),
		captureFormats: r.u16s(),
		playbackFormats: r.u16s(),
		manufacturer: r.string(),
		model: r.string(),
		deviceVersion: r.string(),
		serialNumber: r.string()
	};
}

export interface StorageInfo {
	readonly storageType: number;
	readonly filesystemType: number;
	readonly access: number;
	readonly capacity: number;
	readonly free: number;
	readonly freeObjects: number;
	readonly description: string;
	readonly label: string;
}

export function parseStorageInfo(bytes: Uint8Array): StorageInfo {
	const r = new Reader(bytes);
	return {
		storageType: r.u16(),
		filesystemType: r.u16(),
		access: r.u16(),
		capacity: r.u64(),
		free: r.u64(),
		freeObjects: r.u32(),
		description: r.string(),
		label: r.string()
	};
}

export interface ObjectInfo {
	readonly storageId: number;
	readonly format: number;
	readonly protection: number;
	/** Size in bytes (a u32: 4 GB and more reads as 0xFFFFFFFF). */
	readonly size: number;
	readonly parent: number;
	readonly associationType: number;
	readonly name: string;
	readonly created: string;
	readonly modified: string;
}

export function parseObjectInfo(bytes: Uint8Array): ObjectInfo {
	const r = new Reader(bytes);
	const storageId = r.u32();
	const format = r.u16();
	const protection = r.u16();
	const size = r.u32();
	// thumb format u16, thumb size u32, thumb w/h, image w/h, bit depth: 26 bytes we skip
	r.at += 2 + 4 * 6;
	const parent = r.u32();
	const associationType = r.u16();
	r.at += 4 + 4; // association description, sequence number
	return {
		storageId,
		format,
		protection,
		size,
		parent,
		associationType,
		name: r.string(),
		created: r.string(),
		modified: r.string()
	};
}

/** The ObjectInfo a SendObjectInfo carries: a file of `size` bytes, or a folder. */
export function encodeObjectInfo(options: {
	storageId: number;
	parent: number;
	name: string;
	size?: number;
	folder?: boolean;
}): Uint8Array {
	const name = encodeString(options.name);
	const bytes = new Uint8Array(52 + name.length + 3);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, options.storageId, true);
	view.setUint16(4, options.folder ? FORMAT.association : FORMAT.undefined, true);
	view.setUint32(8, options.folder ? 0 : (options.size ?? 0), true);
	view.setUint32(38, options.parent, true);
	view.setUint16(42, options.folder ? GENERIC_FOLDER : 0, true);
	bytes.set(name, 52);
	// capture date, modification date and keywords left empty
	return bytes;
}
