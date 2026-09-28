import { describe, expect, it } from 'vitest';
import { FakeUsbOpxy, MTP_INTERRUPT_ENDPOINT } from '../../../test/fakes/fake-mtp';
import { FakeTime } from '../../../test/fakes/fake-time';
import { OP } from '$lib/core/mtp';
import { MtpConnection, MtpUsbError, findMtpInterface, type UsbLike } from './mtp';

describe('the OP-XY’s MTP mode over WebUSB', () => {
	it('asks for PID 0x0021, claims the bulk interface and reads through it', async () => {
		const device = new FakeUsbOpxy();
		const filters: unknown[] = [];
		const usb: UsbLike = {
			async requestDevice(options) {
				filters.push(...options.filters);
				return device;
			},
			async getDevices() {
				return [device];
			}
		};
		const connection = await MtpConnection.request(usb);
		expect(filters).toEqual([{ vendorId: 0x2367, productId: 0x0021 }]);
		expect(device.claimed).toEqual([0]);
		expect((await connection.session.deviceInfo()).model).toBe('OP-XY');
		await connection.session.open();
		const workspace = await connection.session.resolve(0x00010001, 'projects/workspace.xy');
		expect((await connection.session.read(workspace!.handle)).length).toBe(1012);
		await connection.close();
		expect(device.mtp.sessionOpen).toBe(false);
		expect(device.claimed).toEqual([]);
		expect(device.opened).toBe(false);
		expect(device.mtp.operations.at(-1)).toBe(OP.closeSession);
		expect(await MtpConnection.granted(usb)).toBeInstanceOf(MtpConnection);
	});

	it('ends a send that fills whole packets with a zero-length packet', async () => {
		const device = new FakeUsbOpxy();
		const connection = await MtpConnection.open(device);
		await connection.session.open();
		connection.session.allowWrites();
		const presets = await connection.session.resolve(0x00010001, 'presets');
		device.sent = [];
		// 500 bytes + the 12-byte header: one whole 512-byte packet
		await connection.session.write(0x00010001, presets!.handle, 'a.txt', new Uint8Array(500));
		expect(device.sent.slice(-3)).toEqual([12, 512, 0]);
		expect(device.mtp.find('presets/a.txt')!.bytes.length).toBe(500);
	});

	it('gives up on a device that stops answering', async () => {
		const time = new FakeTime();
		const device = new FakeUsbOpxy();
		const connection = await MtpConnection.open(device, { timers: time, timeoutMs: 5000 });
		device.hang = true;
		const pending = connection.session.deviceInfo();
		const failed = expect(pending).rejects.toBeInstanceOf(MtpUsbError);
		await time.advance(5000);
		await failed;
	});

	it('refuses a USB device without an MTP interface', () => {
		const device = new FakeUsbOpxy();
		device.configuration = {
			interfaces: [
				{
					interfaceNumber: 0,
					alternate: { interfaceClass: 1, endpoints: [MTP_INTERRUPT_ENDPOINT] }
				}
			]
		};
		expect(() => findMtpInterface(device)).toThrow(/MTP mode/);
	});
});
