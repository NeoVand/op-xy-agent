// Installing a preset from the page, in a real browser, on the emulated OP-XY in MTP mode behind a
// stubbed `navigator.usb`: nothing touches USB until the owner has read what will be added and
// clicked install; then the preset lands in presets/<folder>/ and the session closes.
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { FakeUsbOpxy } from '../../../../test/fakes/fake-mtp';
import { OP } from '$lib/core/mtp';
import PresetInstall from './PresetInstall.svelte';

const preset = {
	folder: 'kit.preset',
	files: [
		{ path: 'kit.preset/patch.json', bytes: new TextEncoder().encode('{"type":"drum"}') },
		{ path: 'kit.preset/kick.wav', bytes: new Uint8Array(4000) }
	]
};

function stubUsb(device: FakeUsbOpxy) {
	const requests: unknown[] = [];
	Object.defineProperty(navigator, 'usb', {
		configurable: true,
		value: {
			async requestDevice(options: unknown) {
				requests.push(options);
				return device;
			},
			async getDevices() {
				return [device];
			}
		}
	});
	return requests;
}

afterEach(() => {
	Reflect.deleteProperty(navigator, 'usb');
});

describe('installing a preset over USB from the page', () => {
	it('says what it will add, waits for the click, then writes and lets go', async () => {
		const device = new FakeUsbOpxy();
		const requests = stubUsb(device);
		render(PresetInstall, { build: async () => preset });

		await page.getByRole('button', { name: 'install on the op-xy…' }).click();
		await expect.element(page.getByText('presets/mine/kit.preset')).toBeVisible();
		await expect
			.element(page.getByText(/Nothing on the device is deleted\s+or\s+replaced/))
			.toBeVisible();
		expect(requests).toEqual([]);
		expect(device.mtp.operations).toEqual([]);

		await page.getByRole('button', { name: 'install', exact: true }).click();
		await expect.element(page.getByText(/Installed as/)).toBeVisible();
		expect(requests).toEqual([{ filters: [{ vendorId: 0x2367, productId: 0x0021 }] }]);
		expect(device.mtp.find('presets/mine/kit.preset/kick.wav')!.bytes.length).toBe(4000);
		expect(device.mtp.sessionOpen).toBe(false);
		expect(device.opened).toBe(false);
		expect(device.mtp.operations).not.toContain(OP.deleteObject);
	});

	it('refuses a folder name the paths do not fit under, and reports a preset already there', async () => {
		const device = new FakeUsbOpxy();
		device.mtp.add('presets/mine/kit.preset/patch.json', '{}');
		stubUsb(device);
		render(PresetInstall, { build: async () => preset });
		await page.getByRole('button', { name: 'install on the op-xy…' }).click();

		const folder = page.getByRole('textbox', { name: 'folder on the device' });
		await folder.fill('Kits!');
		await expect.element(page.getByText(/up to 7 lowercase letters/)).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'install', exact: true })).toBeDisabled();

		await folder.fill('mine');
		await page.getByRole('button', { name: 'install', exact: true }).click();
		await expect.element(page.getByText(/already on the device/)).toBeVisible();
		expect(device.mtp.operations).not.toContain(OP.sendObject);
		expect(device.mtp.sessionOpen).toBe(false);
	});
});
