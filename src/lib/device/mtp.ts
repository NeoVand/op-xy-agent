/**
 * The OP-XY's MTP mode over WebUSB (Chrome, Edge). In MTP mode (`com → M4`) the unit re-enumerates
 * as PID 0x0021 with one vendor-class interface (bulk IN, bulk OUT, interrupt IN) that WebUSB may
 * open, and its MIDI ports disappear until the session closes (docs/research/90-device-probe.md,
 * session 1). This module finds the bulk endpoints, frames transfers for `core/mtp`'s session
 * (zero-length packets after whole-packet sends, a timeout on reads) and tidies up on close.
 *
 * WebUSB has no DOM typings in our lib set, so the few members we use are typed here.
 */
import { MtpSession, OPXY_MTP_USB, type MtpPipe } from '$lib/core/mtp';
import type { Timers } from './types';

export interface UsbEndpointLike {
	readonly endpointNumber: number;
	readonly direction: 'in' | 'out';
	readonly type: 'bulk' | 'interrupt' | 'isochronous';
	readonly packetSize: number;
}

export interface UsbInterfaceLike {
	readonly interfaceNumber: number;
	readonly alternate: {
		readonly interfaceClass: number;
		readonly endpoints: readonly UsbEndpointLike[];
	};
}

export interface UsbTransferResult {
	readonly status?: 'ok' | 'stall' | 'babble';
}

export interface UsbDeviceLike {
	readonly vendorId: number;
	readonly productId: number;
	readonly opened: boolean;
	readonly configuration: { readonly interfaces: readonly UsbInterfaceLike[] } | null;
	open(): Promise<void>;
	close(): Promise<void>;
	selectConfiguration(value: number): Promise<void>;
	claimInterface(interfaceNumber: number): Promise<void>;
	releaseInterface(interfaceNumber: number): Promise<void>;
	transferIn(endpoint: number, length: number): Promise<UsbTransferResult & { data?: DataView }>;
	transferOut(endpoint: number, data: Uint8Array<ArrayBuffer>): Promise<UsbTransferResult>;
	clearHalt?(direction: 'in' | 'out', endpoint: number): Promise<void>;
}

export interface UsbLike {
	requestDevice(options: {
		filters: { vendorId: number; productId?: number }[];
	}): Promise<UsbDeviceLike>;
	getDevices(): Promise<UsbDeviceLike[]>;
}

export class MtpUsbError extends Error {
	override name = 'MtpUsbError';
}

/** The browser's WebUSB, or null where there is none (Firefox, Safari, Node). */
export function browserUsb(): UsbLike | null {
	const nav = globalThis.navigator as (Navigator & { usb?: UsbLike }) | undefined;
	return nav?.usb ?? null;
}

/** The largest single read; a transfer ends early at the device's short packet. */
const READ_BYTES = 1 << 20;

export interface MtpConnectionOptions {
	readonly timers?: Timers;
	/** How long one read may wait for the device before the connection counts as lost. */
	readonly timeoutMs?: number;
}

/** An open MTP connection: the USB device, its claimed interface and a session on it. */
export class MtpConnection {
	readonly session: MtpSession;
	#closed = false;

	private constructor(
		readonly device: UsbDeviceLike,
		readonly interfaceNumber: number,
		pipe: MtpPipe
	) {
		this.session = new MtpSession(pipe);
	}

	/** Asks the browser for the OP-XY in MTP mode (needs a click), opens it and claims MTP. */
	static async request(usb: UsbLike, options: MtpConnectionOptions = {}): Promise<MtpConnection> {
		const device = await usb.requestDevice({ filters: [{ ...OPXY_MTP_USB }] });
		return MtpConnection.open(device, options);
	}

	/** An OP-XY in MTP mode the browser already has permission for, if one is plugged in. */
	static async granted(
		usb: UsbLike,
		options: MtpConnectionOptions = {}
	): Promise<MtpConnection | null> {
		const device = (await usb.getDevices()).find(
			(d) => d.vendorId === OPXY_MTP_USB.vendorId && d.productId === OPXY_MTP_USB.productId
		);
		return device ? MtpConnection.open(device, options) : null;
	}

	static async open(
		device: UsbDeviceLike,
		options: MtpConnectionOptions = {}
	): Promise<MtpConnection> {
		if (!device.opened) await device.open();
		if (!device.configuration) await device.selectConfiguration(1);
		const found = findMtpInterface(device);
		await device.claimInterface(found.interfaceNumber);
		const pipe = bulkPipe(device, found.bulkIn, found.bulkOut, options);
		return new MtpConnection(device, found.interfaceNumber, pipe);
	}

	/** Closes the session (the OP-XY then goes back to MIDI by itself) and lets go of the device. */
	async close(): Promise<void> {
		if (this.#closed) return;
		this.#closed = true;
		try {
			if (this.session.isOpen) await this.session.close();
		} finally {
			await this.device.releaseInterface(this.interfaceNumber).catch(() => {});
			await this.device.close().catch(() => {});
		}
	}
}

/** The interface with a bulk IN and a bulk OUT endpoint (the OP-XY has one, class 0xFF). */
export function findMtpInterface(device: UsbDeviceLike): {
	interfaceNumber: number;
	bulkIn: UsbEndpointLike;
	bulkOut: UsbEndpointLike;
} {
	for (const iface of device.configuration?.interfaces ?? []) {
		const endpoints = iface.alternate.endpoints;
		const bulkIn = endpoints.find((e) => e.type === 'bulk' && e.direction === 'in');
		const bulkOut = endpoints.find((e) => e.type === 'bulk' && e.direction === 'out');
		if (bulkIn && bulkOut) return { interfaceNumber: iface.interfaceNumber, bulkIn, bulkOut };
	}
	throw new MtpUsbError('this USB device has no MTP interface (is the OP-XY in MTP mode?)');
}

/** Bytes over the two bulk endpoints, as `MtpSession` wants them. */
export function bulkPipe(
	device: UsbDeviceLike,
	bulkIn: UsbEndpointLike,
	bulkOut: UsbEndpointLike,
	options: MtpConnectionOptions = {}
): MtpPipe {
	const timers = options.timers ?? globalThis;
	const timeoutMs = options.timeoutMs ?? 10_000;
	return {
		async send(bytes) {
			const out = await device.transferOut(bulkOut.endpointNumber, new Uint8Array(bytes));
			if (out.status === 'stall') {
				await device.clearHalt?.('out', bulkOut.endpointNumber);
				throw new MtpUsbError('the OP-XY stalled a send');
			}
			// a transfer that fills whole packets needs a zero-length packet to end it
			if (bytes.length > 0 && bytes.length % bulkOut.packetSize === 0) {
				await device.transferOut(bulkOut.endpointNumber, new Uint8Array(0));
			}
		},
		async receive() {
			let timer: unknown;
			const timeout = new Promise<never>((_, reject) => {
				timer = timers.setTimeout(
					() => reject(new MtpUsbError('the OP-XY stopped answering over MTP')),
					timeoutMs
				);
			});
			try {
				const result = await Promise.race([
					device.transferIn(bulkIn.endpointNumber, READ_BYTES),
					timeout
				]);
				if (result.status === 'stall') {
					await device.clearHalt?.('in', bulkIn.endpointNumber);
					throw new MtpUsbError('the OP-XY stalled a read');
				}
				const data = result.data;
				return data
					? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
					: new Uint8Array(0);
			} finally {
				timers.clearTimeout(timer);
			}
		}
	};
}
