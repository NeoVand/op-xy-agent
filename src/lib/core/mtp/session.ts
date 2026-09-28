/**
 * An MTP session with the OP-XY over any byte pipe (WebUSB in the app, a fake in tests), ported
 * from our read-only probe (`research/device/mtp_list_lib.py`) that ran against the owner's unit on
 * OS 1.1.33. Transaction ids count up from 1 for every operation, GetDeviceInfo and OpenSession
 * included, as the probe did. Every operation passes the policy first (`policy.ts`): reads always,
 * new files and folders only after `allowWrites()`, nothing that deletes, moves or overwrites.
 */
import { ALL, CONTAINER, HEADER_BYTES, OP, RESPONSE, ROOT, responseText } from './codes';
import {
	MtpFormatError,
	containerLength,
	encodeContainer,
	encodeData,
	encodeObjectInfo,
	parseContainer,
	parseDeviceInfo,
	parseObjectInfo,
	parseStorageInfo,
	parseU32Array,
	type Container,
	type DeviceInfo,
	type StorageInfo
} from './datasets';
import { MtpPolicyError, checkMtpOperation } from './policy';

/** The bulk endpoints, as bytes. */
export interface MtpPipe {
	/** Sends bytes on bulk OUT: one whole container per call. */
	send(bytes: Uint8Array): Promise<void>;
	/** The next bulk IN transfer: part of a container, a whole one, or empty (a zero-length packet). */
	receive(): Promise<Uint8Array>;
}

export class MtpError extends Error {
	override name = 'MtpError';
	constructor(
		readonly operation: number,
		readonly response: number
	) {
		super(`MTP 0x${operation.toString(16).padStart(4, '0')} failed: ${responseText(response)}`);
	}
}

/** A file or folder on the device. */
export interface MtpEntry {
	readonly handle: number;
	readonly storageId: number;
	readonly parent: number;
	readonly name: string;
	readonly folder: boolean;
	readonly size: number;
	readonly format: number;
}

/** Empty transfers in a row after which the pipe counts as stuck. */
const MAX_EMPTY_TRANSFERS = 64;

export class MtpSession {
	readonly #pipe: MtpPipe;
	#transactionId = 0;
	#chunks: Uint8Array[] = [];
	#buffered = 0;
	#open = false;
	#writes = false;

	constructor(pipe: MtpPipe) {
		this.#pipe = pipe;
	}

	get isOpen(): boolean {
		return this.#open;
	}

	get writesAllowed(): boolean {
		return this.#writes;
	}

	/** Lets new files and folders through. Call only once the owner has approved this write. */
	allowWrites(on = true): void {
		this.#writes = on;
	}

	/** One operation: the command, the data we send (if any), then the device's data and response. */
	async transaction(
		code: number,
		params: readonly number[] = [],
		data?: Uint8Array
	): Promise<{ params: number[]; data: Uint8Array }> {
		checkMtpOperation(code, this.#writes);
		const id = ++this.#transactionId;
		await this.#pipe.send(encodeContainer(CONTAINER.command, code, id, params));
		if (data) await this.#pipe.send(encodeData(code, id, data));
		const received: Uint8Array[] = [];
		for (;;) {
			const container = await this.#next();
			if (container.transactionId !== id) {
				throw new MtpFormatError(`expected transaction ${id}, got ${container.transactionId}`);
			}
			if (container.type === CONTAINER.data) {
				received.push(container.payload);
			} else if (container.type === CONTAINER.response) {
				if (container.code !== RESPONSE.ok) throw new MtpError(code, container.code);
				return { params: [...container.params], data: join(received) };
			} else {
				throw new MtpFormatError(`unexpected container type ${container.type}`);
			}
		}
	}

	/** The next whole container from bulk IN, however the transfers cut it. */
	async #next(): Promise<Container> {
		while (this.#buffered < HEADER_BYTES) await this.#pull();
		const length = containerLength(this.#take(HEADER_BYTES, false)) as number;
		while (this.#buffered < length) await this.#pull();
		return parseContainer(this.#take(length, true));
	}

	async #pull(): Promise<void> {
		for (let empty = 0; empty < MAX_EMPTY_TRANSFERS; empty++) {
			const bytes = await this.#pipe.receive();
			if (bytes.length > 0) {
				this.#chunks.push(bytes);
				this.#buffered += bytes.length;
				return;
			}
		}
		throw new MtpFormatError('the device keeps sending empty transfers');
	}

	/** The first `n` buffered bytes, removed from the buffer when `consume`. */
	#take(n: number, consume: boolean): Uint8Array {
		const first = this.#chunks[0];
		let out: Uint8Array;
		if (first.length >= n) out = first.subarray(0, n);
		else {
			out = new Uint8Array(n);
			let at = 0;
			for (const chunk of this.#chunks) {
				const part = chunk.subarray(0, Math.min(chunk.length, n - at));
				out.set(part, at);
				at += part.length;
				if (at === n) break;
			}
		}
		if (consume) {
			let left = n;
			while (left > 0) {
				const chunk = this.#chunks[0];
				if (chunk.length <= left) {
					this.#chunks.shift();
					left -= chunk.length;
				} else {
					this.#chunks[0] = chunk.subarray(left);
					left = 0;
				}
			}
			this.#buffered -= n;
		}
		return out;
	}

	async deviceInfo(): Promise<DeviceInfo> {
		return parseDeviceInfo((await this.transaction(OP.getDeviceInfo)).data);
	}

	async open(sessionId = 1): Promise<void> {
		await this.transaction(OP.openSession, [sessionId]);
		this.#open = true;
	}

	/** Ends the session; the OP-XY then leaves MTP mode by itself and its MIDI port returns. */
	async close(): Promise<void> {
		try {
			await this.transaction(OP.closeSession);
		} finally {
			this.#open = false;
			this.#writes = false;
		}
	}

	async storageIds(): Promise<number[]> {
		return parseU32Array((await this.transaction(OP.getStorageIds)).data);
	}

	async storageInfo(storageId: number): Promise<StorageInfo> {
		return parseStorageInfo((await this.transaction(OP.getStorageInfo, [storageId])).data);
	}

	/** The files and folders in `parent` (the storage's top level by default). */
	async list(storageId: number, parent = ROOT): Promise<MtpEntry[]> {
		const handles = parseU32Array(
			(await this.transaction(OP.getObjectHandles, [storageId, ALL, parent])).data
		);
		const entries: MtpEntry[] = [];
		for (const handle of handles) entries.push(await this.entry(handle));
		return entries;
	}

	async entry(handle: number): Promise<MtpEntry> {
		const info = parseObjectInfo((await this.transaction(OP.getObjectInfo, [handle])).data);
		return {
			handle,
			storageId: info.storageId,
			parent: info.parent,
			name: info.name,
			folder: info.format === 0x3001,
			size: info.size,
			format: info.format
		};
	}

	/** The entry at a `/`-separated path (names compared without case, as on FAT32), or null. */
	async resolve(storageId: number, path: string): Promise<MtpEntry | null> {
		let found: MtpEntry | null = null;
		for (const part of path.split('/').filter(Boolean)) {
			const children = await this.list(storageId, found ? found.handle : ROOT);
			found = children.find((c) => sameName(c.name, part)) ?? null;
			if (!found) return null;
		}
		return found;
	}

	/** A file's bytes. */
	async read(handle: number): Promise<Uint8Array> {
		return (await this.transaction(OP.getObject, [handle])).data;
	}

	/** A new folder in `parent`, or the one already there with that name. Writes. */
	async folder(storageId: number, parent: number, name: string): Promise<number> {
		const existing = (await this.list(storageId, parent)).find((c) => sameName(c.name, name));
		if (existing) {
			if (!existing.folder) throw new MtpPolicyError(`"${name}" is a file, not a folder`);
			return existing.handle;
		}
		const reply = await this.transaction(
			OP.sendObjectInfo,
			[storageId, parent],
			encodeObjectInfo({ storageId, parent, name, folder: true })
		);
		return reply.params[2];
	}

	/** A new file in `parent`; refuses when the name is taken, so nothing is ever overwritten. */
	async write(storageId: number, parent: number, name: string, bytes: Uint8Array): Promise<number> {
		// refuse before reading anything when writes are off
		checkMtpOperation(OP.sendObjectInfo, this.#writes);
		if ((await this.list(storageId, parent)).some((c) => sameName(c.name, name))) {
			throw new MtpPolicyError(`"${name}" is already on the device: nothing was overwritten`);
		}
		const reply = await this.transaction(
			OP.sendObjectInfo,
			[storageId, parent],
			encodeObjectInfo({ storageId, parent, name, size: bytes.length })
		);
		await this.transaction(OP.sendObject, [], bytes);
		return reply.params[2];
	}
}

/** FAT32 compares names without case. */
export const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function join(parts: readonly Uint8Array[]): Uint8Array {
	if (parts.length === 1) return parts[0].slice();
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
