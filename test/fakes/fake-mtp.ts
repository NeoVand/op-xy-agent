/**
 * An emulated OP-XY in MTP mode (`com → M4`) behind a fake bulk pipe, answering like the owner's
 * unit on OS 1.1.33 (docs/research/90-device-probe.md, session 1): DeviceInfo `teenage engineering`
 * / `OP-XY` / `1.1.33` with a FAKE serial, one storage "OP-XY" (8.59 GB, 8.36 GB free), and the
 * tree it showed: projects/{user/, templates/, workspace.xy}, samples/user/, presets/{snapshot/,
 * a sound pack}/, how_to_import.txt (file contents here are made up).
 *
 * Replies come back cut into odd-sized transfers, with a zero-length packet after any container
 * that fills whole 512-byte packets, so the host's reassembly is exercised. Every command is logged
 * in `operations`, so tests can assert what never reached the device. Operations the fake does not
 * implement (delete, move, …) answer "operation not supported".
 */
import {
	CONTAINER,
	FORMAT,
	OP,
	RESPONSE,
	ROOT,
	containerLength,
	encodeContainer,
	encodeData,
	encodeString,
	parseContainer,
	parseObjectInfo,
	type Container,
	type MtpPipe
} from '$lib/core/mtp';
import type { UsbDeviceLike, UsbEndpointLike } from '$lib/device/mtp';

export const FAKE_MTP_STORAGE = 0x00010001;

/** The operations the owner's unit listed (22), as far as the log names them. */
const OPERATIONS = [
	0x1001, 0x1002, 0x1003, 0x1004, 0x1005, 0x1006, 0x1007, 0x1008, 0x1009, 0x100b, 0x100c, 0x100d,
	0x1014, 0x1015, 0x1016, 0x1019, 0x101b, 0x9801, 0x9802, 0x9803, 0x9804, 0x9805
];

export interface FakeMtpObject {
	readonly handle: number;
	readonly parent: number;
	readonly name: string;
	readonly folder: boolean;
	bytes: Uint8Array;
}

/** The owner's tree, with made-up contents; `workspace.xy` fills exactly two 512-byte packets. */
export const FAKE_MTP_TREE: Record<string, string | Uint8Array> = {
	'how_to_import.txt': 'made-up text standing in for the unit’s own file\n',
	'projects/user/': '',
	'projects/templates/': '',
	'projects/workspace.xy': Uint8Array.from({ length: 1012 }, (_, i) =>
		i < 4 ? [0x09, 0x14, 0x07, 0x86][i] : (i * 7) & 0xff
	),
	'samples/user/': '',
	'presets/snapshot/': '',
	'presets/pack/nt-demo.preset/patch.json': '{"type":"drum"}'
};

const u16 = (v: number) => [v & 0xff, v >> 8];
const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const u64 = (v: number) => [...u32(v % 2 ** 32), ...u32(Math.floor(v / 2 ** 32))];
const u16s = (list: readonly number[]) => [...u32(list.length), ...list.flatMap(u16)];
const str = (text: string) => [...encodeString(text)];

export class FakeMtpOpxy implements MtpPipe {
	readonly operations: number[] = [];
	readonly objects = new Map<number, FakeMtpObject>();
	sessionOpen = false;
	/** The largest transfer the fake returns: replies are cut into pieces of at most this. */
	transferSize = 700;
	#nextHandle = 1;
	#inbound = new Uint8Array(0);
	#outbound: Uint8Array[] = [];
	#awaiting: { code: number; tid: number; params: readonly number[] } | null = null;
	#pendingFile: { handle: number; parent: number; name: string; size: number } | null = null;

	constructor(tree: Record<string, string | Uint8Array> = FAKE_MTP_TREE) {
		for (const [path, content] of Object.entries(tree)) this.add(path, content);
	}

	/** Adds a file, or a folder when the path ends in `/`, creating the folders above it. */
	add(path: string, content: string | Uint8Array = ''): FakeMtpObject {
		const parts = path.split('/');
		const folder = path.endsWith('/');
		const names = folder ? parts.slice(0, -1) : parts;
		let parent = ROOT;
		let made: FakeMtpObject | undefined;
		names.forEach((name, i) => {
			const last = i === names.length - 1;
			const existing = this.children(parent).find((o) => o.name === name);
			if (existing && !last) {
				parent = existing.handle;
				return;
			}
			const bytes = last && !folder ? toBytes(content) : new Uint8Array(0);
			made = this.#create(parent, name, !(last && !folder), bytes);
			parent = made.handle;
		});
		return made as FakeMtpObject;
	}

	/** The object at a path, if any. */
	find(path: string): FakeMtpObject | undefined {
		let parent = ROOT;
		let found: FakeMtpObject | undefined;
		for (const name of path.split('/').filter(Boolean)) {
			found = this.children(parent).find((o) => o.name === name);
			if (!found) return undefined;
			parent = found.handle;
		}
		return found;
	}

	children(parent: number): FakeMtpObject[] {
		return [...this.objects.values()].filter((o) => o.parent === parent);
	}

	/** Paths of every object, folders ending in `/`. */
	paths(): string[] {
		const path = (o: FakeMtpObject): string => {
			const up = this.objects.get(o.parent);
			return `${up ? path(up) + '/' : ''}${o.name}`;
		};
		return [...this.objects.values()].map((o) => path(o) + (o.folder ? '/' : '')).sort();
	}

	async send(bytes: Uint8Array): Promise<void> {
		const joined = new Uint8Array(this.#inbound.length + bytes.length);
		joined.set(this.#inbound);
		joined.set(bytes, this.#inbound.length);
		this.#inbound = joined;
		for (;;) {
			const length = containerLength(this.#inbound);
			if (length === null || this.#inbound.length < length) break;
			const container = parseContainer(this.#inbound.slice(0, length));
			this.#inbound = this.#inbound.slice(length);
			this.#handle(container);
		}
	}

	async receive(): Promise<Uint8Array> {
		const next = this.#outbound.shift();
		if (!next) throw new Error('FakeMtpOpxy: the host waits for a reply that will never come');
		return next;
	}

	#create(parent: number, name: string, folder: boolean, bytes: Uint8Array): FakeMtpObject {
		const object = { handle: this.#nextHandle++, parent, name, folder, bytes };
		this.objects.set(object.handle, object);
		return object;
	}

	#handle(c: Container) {
		if (c.type === CONTAINER.command) {
			this.operations.push(c.code);
			if (c.code === OP.sendObjectInfo || c.code === OP.sendObject) {
				this.#awaiting = { code: c.code, tid: c.transactionId, params: c.params };
				return;
			}
			this.#command(c.code, c.transactionId, c.params);
		} else if (c.type === CONTAINER.data) {
			const pending = this.#awaiting;
			this.#awaiting = null;
			if (!pending || pending.tid !== c.transactionId) {
				return this.#reply(c.code, c.transactionId, RESPONSE.generalError);
			}
			this.#dataIn(pending, c.payload);
		}
	}

	#command(code: number, tid: number, params: readonly number[]) {
		if (code === OP.getDeviceInfo) return this.#reply(code, tid, RESPONSE.ok, [], deviceInfo());
		if (code === OP.openSession) {
			if (this.sessionOpen) return this.#reply(code, tid, RESPONSE.sessionAlreadyOpen);
			this.sessionOpen = true;
			return this.#reply(code, tid, RESPONSE.ok);
		}
		if (!this.sessionOpen) return this.#reply(code, tid, RESPONSE.sessionNotOpen);
		switch (code) {
			case OP.closeSession:
				this.sessionOpen = false;
				return this.#reply(code, tid, RESPONSE.ok);
			case OP.getStorageIds:
				return this.#reply(code, tid, RESPONSE.ok, [], Uint8Array.from(u32s([FAKE_MTP_STORAGE])));
			case OP.getStorageInfo:
				if (params[0] !== FAKE_MTP_STORAGE)
					return this.#reply(code, tid, RESPONSE.invalidStorageId);
				return this.#reply(code, tid, RESPONSE.ok, [], storageInfo());
			case OP.getObjectHandles: {
				const parent = params[2] === 0 ? ROOT : params[2];
				if (parent !== ROOT && !this.objects.get(parent)?.folder) {
					return this.#reply(code, tid, RESPONSE.invalidParentObject);
				}
				const handles = this.children(parent).map((o) => o.handle);
				return this.#reply(code, tid, RESPONSE.ok, [], Uint8Array.from(u32s(handles)));
			}
			case OP.getObjectInfo: {
				const object = this.objects.get(params[0]);
				if (!object) return this.#reply(code, tid, RESPONSE.invalidObjectHandle);
				return this.#reply(code, tid, RESPONSE.ok, [], objectInfo(object));
			}
			case OP.getObject: {
				const object = this.objects.get(params[0]);
				if (!object || object.folder) return this.#reply(code, tid, RESPONSE.invalidObjectHandle);
				return this.#reply(code, tid, RESPONSE.ok, [], object.bytes);
			}
			default:
				return this.#reply(code, tid, RESPONSE.operationNotSupported);
		}
	}

	#dataIn(pending: { code: number; tid: number; params: readonly number[] }, payload: Uint8Array) {
		const { code, tid } = pending;
		if (!this.sessionOpen) return this.#reply(code, tid, RESPONSE.sessionNotOpen);
		if (code === OP.sendObjectInfo) {
			const info = parseObjectInfo(payload);
			const parent = pending.params[1];
			if (parent !== ROOT && !this.objects.get(parent)?.folder) {
				return this.#reply(code, tid, RESPONSE.invalidParentObject);
			}
			if (info.format === FORMAT.association) {
				const folder = this.#create(parent, info.name, true, new Uint8Array(0));
				return this.#reply(code, tid, RESPONSE.ok, [FAKE_MTP_STORAGE, parent, folder.handle]);
			}
			const handle = this.#nextHandle++;
			this.#pendingFile = { handle, parent, name: info.name, size: info.size };
			return this.#reply(code, tid, RESPONSE.ok, [FAKE_MTP_STORAGE, parent, handle]);
		}
		const file = this.#pendingFile;
		this.#pendingFile = null;
		if (!file || file.size !== payload.length) {
			return this.#reply(code, tid, RESPONSE.incompleteTransfer);
		}
		this.objects.set(file.handle, { ...file, folder: false, bytes: payload.slice() });
		return this.#reply(code, tid, RESPONSE.ok);
	}

	#reply(op: number, tid: number, code: number, params: number[] = [], data?: Uint8Array) {
		if (data) this.#queue(encodeData(op, tid, data));
		this.#queue(encodeContainer(CONTAINER.response, code, tid, params));
	}

	#queue(bytes: Uint8Array) {
		for (let at = 0; at < bytes.length; at += this.transferSize) {
			this.#outbound.push(bytes.slice(at, at + this.transferSize));
		}
		// a container that fills whole packets ends with a zero-length packet
		if (bytes.length % 512 === 0) this.#outbound.push(new Uint8Array(0));
	}
}

const u32s = (list: readonly number[]) => [...u32(list.length), ...list.flatMap(u32)];

const toBytes = (content: string | Uint8Array) =>
	typeof content === 'string' ? new TextEncoder().encode(content) : content;

function deviceInfo(): Uint8Array {
	return Uint8Array.from([
		...u16(100),
		...u32(6),
		...u16(100),
		...str('microsoft.com: 1.0;'),
		...u16(0),
		...u16s(OPERATIONS),
		...u16s([]),
		...u16s([]),
		...u16s([]),
		...u16s([FORMAT.undefined, FORMAT.association]),
		...str('teenage engineering'),
		...str('OP-XY'),
		...str('1.1.33'),
		...str('TESTSERIAL')
	]);
}

function storageInfo(): Uint8Array {
	return Uint8Array.from([
		...u16(3),
		...u16(2),
		...u16(0),
		...u64(8_590_000_000),
		...u64(8_360_000_000),
		...u32(0xffffffff),
		...str('OP-XY'),
		...str('')
	]);
}

function objectInfo(o: FakeMtpObject): Uint8Array {
	return Uint8Array.from([
		...u32(FAKE_MTP_STORAGE),
		...u16(o.folder ? FORMAT.association : FORMAT.undefined),
		...u16(0),
		...u32(o.bytes.length),
		...new Array(26).fill(0),
		// PTP gives top-level objects parent 0
		...u32(o.parent === ROOT ? 0 : o.parent),
		...u16(o.folder ? 1 : 0),
		...u32(0),
		...u32(0),
		...str(o.name),
		...str('20260926T120000'),
		...str('20260926T120000'),
		...str('')
	]);
}

const BULK_IN: UsbEndpointLike = {
	endpointNumber: 9,
	direction: 'in',
	type: 'bulk',
	packetSize: 512
};
const BULK_OUT: UsbEndpointLike = {
	endpointNumber: 10,
	direction: 'out',
	type: 'bulk',
	packetSize: 512
};
export const MTP_INTERRUPT_ENDPOINT: UsbEndpointLike = {
	endpointNumber: 3,
	direction: 'in',
	type: 'interrupt',
	packetSize: 64
};

/**
 * The OP-XY in MTP mode as WebUSB shows it (PID 0x0021, one vendor-class interface with bulk IN 9,
 * bulk OUT 10 and interrupt IN 3), passing bytes to a `FakeMtpOpxy`. `sent` records the size of
 * every bulk OUT transfer (zero-length packets included); `hang` makes reads never return.
 */
export class FakeUsbOpxy implements UsbDeviceLike {
	readonly vendorId = 0x2367;
	readonly productId = 0x0021;
	opened = false;
	claimed: number[] = [];
	sent: number[] = [];
	configuration: UsbDeviceLike['configuration'] = null;
	hang = false;
	/** Leave MTP mode as soon as CloseSession arrives, before answering it (the owner's unit does). */
	leaveOnClose = false;
	#gone = false;
	constructor(readonly mtp = new FakeMtpOpxy()) {}
	async open() {
		this.opened = true;
	}
	async close() {
		this.opened = false;
	}
	async selectConfiguration() {
		this.configuration = {
			interfaces: [
				{
					interfaceNumber: 0,
					alternate: {
						interfaceClass: 0xff,
						endpoints: [BULK_IN, BULK_OUT, MTP_INTERRUPT_ENDPOINT]
					}
				}
			]
		};
	}
	async claimInterface(n: number) {
		this.claimed.push(n);
	}
	async releaseInterface(n: number) {
		this.claimed = this.claimed.filter((c) => c !== n);
	}
	async transferOut(endpoint: number, data: Uint8Array<ArrayBuffer>) {
		if (endpoint !== BULK_OUT.endpointNumber)
			throw new Error(`FakeUsbOpxy: OUT to endpoint ${endpoint}`);
		if (this.#gone) throw new Error('A transfer error has occurred.');
		this.sent.push(data.length);
		if (data.length > 0) await this.mtp.send(data);
		if (this.leaveOnClose && this.mtp.operations.at(-1) === OP.closeSession) this.#gone = true;
		return { status: 'ok' as const };
	}
	async transferIn(endpoint: number) {
		if (endpoint !== BULK_IN.endpointNumber)
			throw new Error(`FakeUsbOpxy: IN from endpoint ${endpoint}`);
		if (this.hang) return new Promise<never>(() => {});
		if (this.#gone)
			throw new Error(
				"Failed to execute 'transferIn' on 'USBDevice': A transfer error has occurred."
			);
		const bytes = await this.mtp.receive();
		return {
			status: 'ok' as const,
			data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		};
	}
}
