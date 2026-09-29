import { describe, expect, it } from 'vitest';
import { FAKE_MTP_STORAGE, FAKE_MTP_TREE, FakeMtpOpxy } from '../../../../test/fakes/fake-mtp';
import {
	CONTAINER,
	MtpError,
	MtpPaths,
	MtpPolicyError,
	MtpSession,
	OP,
	PRESET_FOLDER,
	RESPONSE,
	checkMtpOperation,
	encodeContainer,
	encodeObjectInfo,
	encodeString,
	installPreset,
	parseContainer,
	parseObjectInfo,
	responseText
} from './index';

async function openSession(fake = new FakeMtpOpxy()) {
	const session = new MtpSession(fake);
	await session.open();
	return { fake, session };
}

const preset = {
	folder: 'kit.preset',
	files: [
		{ path: 'kit.preset/patch.json', bytes: new TextEncoder().encode('{"type":"drum"}') },
		{ path: 'kit.preset/kick.wav', bytes: Uint8Array.from({ length: 3000 }, (_, i) => i & 0xff) }
	]
};

describe('MTP containers and datasets', () => {
	it('round-trips containers, strings and ObjectInfo', () => {
		const command = parseContainer(
			encodeContainer(CONTAINER.command, OP.getObjectHandles, 7, [1, 0, 0xffffffff])
		);
		expect(command).toMatchObject({
			type: 1,
			code: 0x1007,
			transactionId: 7,
			params: [1, 0, 0xffffffff]
		});
		expect([...encodeString('')]).toEqual([0]);
		expect([...encodeString('ab')]).toEqual([3, 0x61, 0, 0x62, 0, 0, 0]);
		const info = parseObjectInfo(
			encodeObjectInfo({ storageId: 0x10001, parent: 42, name: 'c#4.wav', size: 1234 })
		);
		expect(info).toMatchObject({
			storageId: 0x10001,
			parent: 42,
			name: 'c#4.wav',
			size: 1234,
			format: 0x3000
		});
		const folder = parseObjectInfo(
			encodeObjectInfo({ storageId: 1, parent: 5, name: 'mine', folder: true })
		);
		expect(folder).toMatchObject({ format: 0x3001, associationType: 1, size: 0, name: 'mine' });
		expect(responseText(RESPONSE.invalidObjectHandle)).toBe('0x2009 (no such object)');
	});

	it('lets reads through, new objects only with writes on, and never deletes or moves', () => {
		expect(() => checkMtpOperation(OP.getObject, false)).not.toThrow();
		expect(() => checkMtpOperation(OP.sendObject, false)).toThrow(MtpPolicyError);
		expect(() => checkMtpOperation(OP.sendObject, true)).not.toThrow();
		for (const op of [
			OP.deleteObject,
			OP.moveObject,
			OP.copyObject,
			OP.formatStore,
			OP.resetDevice,
			OP.setObjectPropValue,
			OP.setDevicePropValue,
			OP.powerDown,
			0x9999
		]) {
			expect(() => checkMtpOperation(op, true)).toThrow(/never sent/);
		}
	});
});

describe('an MTP session with the OP-XY', () => {
	it('reads the device info and storage the owner’s unit reported', async () => {
		const fake = new FakeMtpOpxy();
		const session = new MtpSession(fake);
		const info = await session.deviceInfo();
		expect(info).toMatchObject({
			manufacturer: 'teenage engineering',
			model: 'OP-XY',
			deviceVersion: '1.1.33',
			vendorExtension: 'microsoft.com: 1.0;'
		});
		expect(info.operations).toHaveLength(22);
		await session.open();
		expect(session.isOpen).toBe(true);
		const [storage] = await session.storageIds();
		expect(storage).toBe(FAKE_MTP_STORAGE);
		const space = await session.storageInfo(storage);
		expect(space.description).toBe('OP-XY');
		expect(space.capacity).toBe(8_590_000_000);
		expect(space.free).toBe(8_360_000_000);
		await session.close();
		expect(fake.sessionOpen).toBe(false);
		// transaction ids count from 1, GetDeviceInfo included, as the probe did
		expect(fake.operations).toEqual([
			OP.getDeviceInfo,
			OP.openSession,
			OP.getStorageIds,
			OP.getStorageInfo,
			OP.closeSession
		]);
	});

	it('lists folders and reads a file however the transfers cut it', async () => {
		for (const transferSize of [7, 512, 700, 1 << 16]) {
			const fake = new FakeMtpOpxy();
			fake.transferSize = transferSize;
			const { session } = await openSession(fake);
			const top = await session.list(FAKE_MTP_STORAGE);
			expect(top.map((e) => `${e.name}${e.folder ? '/' : ''}`).sort()).toEqual([
				'how_to_import.txt',
				'presets/',
				'projects/',
				'samples/'
			]);
			const workspace = await session.resolve(FAKE_MTP_STORAGE, 'Projects/WORKSPACE.xy');
			expect(workspace).toMatchObject({ name: 'workspace.xy', folder: false, size: 1012 });
			const bytes = await session.read(workspace!.handle);
			expect(bytes).toEqual(fake.find('projects/workspace.xy')!.bytes);
			expect([...bytes.subarray(0, 4)]).toEqual([0x09, 0x14, 0x07, 0x86]);
			expect(await session.resolve(FAKE_MTP_STORAGE, 'projects/missing.xy')).toBeNull();
		}
	});

	it('reports the device’s refusals as errors', async () => {
		const session = new MtpSession(new FakeMtpOpxy());
		await expect(session.storageIds()).rejects.toThrow(/session not open/);
		await session.open();
		await expect(session.read(9999)).rejects.toBeInstanceOf(MtpError);
		await expect(session.open()).rejects.toThrow(/already open/);
	});

	it('never lets a delete or a write reach the device without approval', async () => {
		const { fake, session } = await openSession();
		const workspace = await session.resolve(FAKE_MTP_STORAGE, 'projects/workspace.xy');
		await expect(session.transaction(OP.deleteObject, [workspace!.handle])).rejects.toThrow(
			MtpPolicyError
		);
		await expect(
			session.write(FAKE_MTP_STORAGE, workspace!.parent, 'x.txt', new Uint8Array(3))
		).rejects.toThrow(/approval/);
		await expect(installPreset(session, preset, 'mine')).rejects.toThrow(/approval/);
		expect(fake.operations).not.toContain(OP.deleteObject);
		expect(fake.operations).not.toContain(OP.sendObjectInfo);
		expect(fake.operations).not.toContain(OP.sendObject);
		expect(fake.find('presets/mine')).toBeUndefined();
	});
});

describe('many paths on one storage', () => {
	it('lists each folder once, compares names without case, and only reads', async () => {
		const fake = new FakeMtpOpxy({
			...FAKE_MTP_TREE,
			'presets/drum/kit.preset/a.wav': 'a',
			'presets/drum/kit.preset/b.wav': 'bb',
			'presets/drum/other.preset/c.wav': 'ccc'
		});
		const { session } = await openSession(fake);
		const listings = () => fake.operations.filter((op) => op === OP.getObjectHandles).length;
		const before = listings();
		const paths = new MtpPaths(session, FAKE_MTP_STORAGE);
		expect(await paths.resolve('presets/drum/kit.preset/a.wav')).toMatchObject({
			name: 'a.wav',
			folder: false,
			size: 1
		});
		expect(await paths.resolve('Presets/DRUM/kit.preset/B.WAV')).toMatchObject({ size: 2 });
		expect(await paths.resolve('presets/drum/kit.preset/missing.wav')).toBeNull();
		// a file is no folder
		expect(await paths.resolve('presets/drum/kit.preset/a.wav/deeper')).toBeNull();
		expect(await paths.resolve('/presets/drum/other.preset/c.wav')).toMatchObject({ size: 3 });
		// the top, presets, drum, kit.preset and other.preset: one listing each for five paths
		expect(listings() - before).toBe(5);
		expect(paths.listed).toBe(5);
		for (const op of [OP.sendObjectInfo, OP.sendObject, OP.deleteObject]) {
			expect(fake.operations).not.toContain(op);
		}
	});
});

describe('installing a preset over MTP', () => {
	it('adds presets/<folder>/<name>.preset with its files, and refuses to replace it', async () => {
		const { fake, session } = await openSession();
		session.allowWrites();
		const progress: string[] = [];
		const where = await installPreset(session, preset, 'mine', (p) =>
			progress.push(`${p.done}/${p.total}`)
		);
		expect(where).toBe('presets/mine/kit.preset');
		expect(progress).toEqual(['0/2', '1/2', '2/2']);
		expect(fake.find('presets/mine/kit.preset/patch.json')!.bytes).toEqual(preset.files[0].bytes);
		expect(fake.find('presets/mine/kit.preset/kick.wav')!.bytes).toEqual(preset.files[1].bytes);
		const before = fake.paths();
		// a second install of the same name adds nothing and overwrites nothing
		await expect(installPreset(session, preset, 'mine')).rejects.toThrow(/already on the device/);
		// a file of the same name in the folder is refused too
		await expect(
			session.write(
				FAKE_MTP_STORAGE,
				fake.find('presets/mine/kit.preset')!.handle,
				'KICK.wav',
				new Uint8Array(2)
			)
		).rejects.toThrow(/nothing was overwritten/);
		expect(fake.paths()).toEqual(before);
		// the existing folder is reused for the next preset
		await installPreset(session, { ...preset, folder: 'kit 2.preset' }, 'mine');
		expect(
			fake.paths().filter((p) => p.startsWith('presets/mine/') && p.endsWith('.preset/'))
		).toEqual(['presets/mine/kit 2.preset/', 'presets/mine/kit.preset/']);
		expect(fake.operations).not.toContain(OP.deleteObject);
	});

	it('only takes folder names the preset paths fit under', async () => {
		expect(PRESET_FOLDER.test('mine')).toBe(true);
		expect(PRESET_FOLDER.test('my kits')).toBe(true);
		for (const bad of ['', 'Mine', 'too-long', '-dash', 'a/b', 'snap:'])
			expect(PRESET_FOLDER.test(bad)).toBe(false);
		const { fake, session } = await openSession();
		session.allowWrites();
		await expect(installPreset(session, preset, 'too-long')).rejects.toThrow(/folder name/);
		expect(fake.operations).not.toContain(OP.sendObjectInfo);
	});
});
