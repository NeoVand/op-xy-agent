import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAKE_MTP_TREE, FakeMtpOpxy, FakeUsbOpxy } from '../../../test/fakes/fake-mtp';
import { testWav, withSamples } from '../../../test/fakes/xy-samples';
import { OP } from '$lib/core/mtp';
import { readProject } from '$lib/core/xy/read';
import type { UsbLike } from '$lib/device/mtp';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { defaultState } from '$lib/sim/params';
import { simToXy, xyToSim } from '$lib/sim/xy';
import { SampleRegistry } from '$lib/sound/samples';
import { createMemorySampleCache } from './device-samples';
import { DeviceSamples } from './device-samples.svelte';
import { ProjectTransfer, type ProjectSamples } from './project-transfer.svelte';

const fixture = (name: string) =>
	new Uint8Array(readFileSync(new URL(`../core/xy/fixtures/${name}`, import.meta.url)));
const blank = fixture('blank-1.1.4.xy');
/** The project the emulated OP-XY has open: a song the Python library wrote from our notes. */
const song = fixture('song.xy');

function setup() {
	const mtp = new FakeMtpOpxy({ ...FAKE_MTP_TREE, 'projects/workspace.xy': song });
	const device = new FakeUsbOpxy(mtp);
	let requests = 0;
	const usb: UsbLike = {
		async requestDevice() {
			requests++;
			return device;
		},
		async getDevices() {
			return [device];
		}
	};
	const sim = new OpxySim({ now: () => 0 });
	const transfer = new ProjectTransfer({ sim, usb, blank: async () => blank });
	return { mtp, device, sim, transfer, requests: () => requests };
}

describe('the replica’s project as a .xy file', () => {
	it('loads the project the OP-XY has open, reading only, and undoes it once', async () => {
		const { mtp, sim, transfer } = setup();
		sim.state.tempo.bpm = 133;
		await transfer.loadFromDevice();
		expect(transfer.error).toBeNull();
		expect(transfer.message).toBe('loaded op-xy project');
		const expected = xyToSim(song).state;
		expect(sim.state.tempo.bpm).toBe(expected.tempo.bpm);
		expect(JSON.stringify(sim.state.tracks.map((t) => t.sequence.patterns))).toBe(
			JSON.stringify(expected.tracks.map((t) => t.sequence.patterns))
		);
		expect(sim.state.project.name).toBe('op-xy project');
		expect(mtp.sessionOpen).toBe(false);
		for (const op of [OP.sendObjectInfo, OP.sendObject, OP.deleteObject]) {
			expect(mtp.operations).not.toContain(op);
		}
		transfer.undo();
		expect(sim.state.tempo.bpm).toBe(133);
		expect(transfer.canUndo).toBe(false);
	});

	it('adds the replica’s project to projects/user, written over the open one, never replacing', async () => {
		const { mtp, sim, transfer } = setup();
		sim.state.tempo.bpm = 101;
		const path = await transfer.saveToDevice('my song');
		expect(path).toBe('projects/user/my song.xy');
		const written = mtp.find('projects/user/my song.xy')!.bytes;
		expect(written).toEqual(simToXy(JSON.parse(JSON.stringify(sim.state)), song).bytes);
		expect(readProject(written).settings.tempo).toBe(101);
		// the open project on the device is left alone
		expect(mtp.find('projects/workspace.xy')!.bytes).toEqual(song);
		const before = mtp.paths();
		expect(await transfer.saveToDevice('my song')).toBeNull();
		expect(transfer.error).toMatch(/already on the device/);
		expect(mtp.paths()).toEqual(before);
		expect(mtp.operations).not.toContain(OP.deleteObject);
		expect(mtp.sessionOpen).toBe(false);
	});

	it('does not call a load or a save failed when the unit leaves MTP mode before answering the close', async () => {
		const { device, mtp, sim, transfer } = setup();
		device.leaveOnClose = true;
		await transfer.loadFromDevice();
		expect(transfer.error).toBeNull();
		expect(transfer.message).toBe('loaded op-xy project');
		expect(sim.state.project.name).toBe('op-xy project');
		const again = setup();
		again.device.leaveOnClose = true;
		expect(await again.transfer.saveToDevice('kept')).toBe('projects/user/kept.xy');
		expect(again.transfer.error).toBeNull();
		expect(again.mtp.find('projects/user/kept.xy')).toBeDefined();
		expect(mtp.operations.at(-1)).toBe(OP.closeSession);
	});

	it('refuses a name the device would not take before asking for the device', async () => {
		const { transfer, requests } = setup();
		expect(await transfer.saveToDevice('My Song!')).toBeNull();
		expect(transfer.error).toMatch(/lowercase/);
		expect(requests()).toBe(0);
	});

	it('downloads over the blank project, then over the last file it read', async () => {
		const { sim, transfer } = setup();
		const first = await transfer.download();
		expect(first?.name).toBe('project 1.xy');
		expect(first?.bytes).toEqual(simToXy(JSON.parse(JSON.stringify(sim.state)), blank).bytes);
		await transfer.openFile(new File([song], 'song.xy'));
		expect(sim.state.project.name).toBe('song');
		const second = await transfer.download();
		// written over the file it read, so what the replica cannot hold (its sounds) stays
		const state = JSON.parse(JSON.stringify(sim.state));
		expect(second?.bytes).toEqual(simToXy(state, song).bytes);
		expect(second?.bytes).not.toEqual(simToXy(state, blank).bytes);
	});

	it('says what is wrong with a file it cannot read', async () => {
		const { sim, transfer } = setup();
		const name = sim.state.project.name;
		await transfer.openFile(new File([new Uint8Array(20)], 'broken.xy'));
		expect(transfer.error).not.toBeNull();
		expect(sim.state.project.name).toBe(name);
	});

	it('starts a new project with the default sounds after a load, keeping the loaded one', async () => {
		const { sim, transfer } = setup();
		let changes = 0;
		const saving = new ProjectTransfer({
			sim,
			usb: null,
			blank: async () => blank,
			changed: () => changes++
		});
		const fresh = defaultState();
		await transfer.loadFromDevice();
		const loaded = sim.state.tracks.map((t) => t.engine);
		const loadedBpm = sim.state.tempo.bpm;
		sim.state.tracks[3].engine = 'organ';

		saving.newProject();
		expect(changes).toBe(1);
		expect(sim.state.tracks.map((t) => t.engine)).toEqual(fresh.tracks.map((t) => t.engine));
		expect(sim.state.tracks[3].engine).toBe('epiano');
		expect(sim.state.tempo.bpm).toBe(fresh.tempo.bpm);
		expect(sim.state.project.name).toMatch(/^project \d+$/);
		expect(saving.message).toContain('the default sounds');
		// the device's hold M1: the open project was autosaved to the folder first
		const kept = sim.state.areas.system.projects.user.find((p) => p.name === 'op-xy project');
		expect(kept?.snapshot).toBeTruthy();

		saving.undo();
		expect(changes).toBe(2);
		expect(sim.state.project.name).toBe('op-xy project');
		expect(sim.state.tempo.bpm).toBe(loadedBpm);
		expect(sim.state.tracks[3].engine).toBe('organ');
		expect(sim.state.tracks.slice(4).map((t) => t.engine)).toEqual(loaded.slice(4));
	});
});

describe('the samples of a project loaded from the op-xy', () => {
	const KICK = '/fat32/presets/drum/test.preset/kick.wav';
	const TAKE = '/fat32/samples/user/take 1.wav';
	const kit = {
		0: { path: KICK, key: 53 },
		1: { path: TAKE, key: 54 },
		2: { path: 'content/samples/snare/snare boop a.wav', key: 55 }
	};
	/** The song with T1's kit (both patterns) naming a preset's kick, a recording and a factory snare. */
	const beat = new Uint8Array(
		withSamples(song, [
			{ t: 0, p: 0, preset: 'drum/test', clear: true, regions: kit },
			{ t: 0, p: 1, preset: 'drum/test', clear: true, regions: kit },
			{ t: 1, clear: true, regions: {} }
		])
	);

	function setup(samples?: (sim: OpxySim) => ProjectSamples) {
		const mtp = new FakeMtpOpxy({
			...FAKE_MTP_TREE,
			'projects/workspace.xy': beat,
			'presets/drum/test.preset/kick.wav': testWav(4410),
			'samples/user/take 1.wav': testWav(2205, 22_050)
		});
		const device = new FakeUsbOpxy(mtp);
		const usb: UsbLike = {
			requestDevice: async () => device,
			getDevices: async () => [device]
		};
		const sim = new OpxySim({ now: () => 0 });
		const registry = new SampleRegistry();
		const cache = createMemorySampleCache();
		const own = samples?.(sim) ?? new DeviceSamples({ sim, samples: registry, cache });
		const transfer = new ProjectTransfer({ sim, usb, blank: async () => blank, samples: own });
		return { mtp, device, sim, registry, cache, transfer };
	}

	it('reads the samples its tracks use in the same session, reading only, and says what came', async () => {
		const { mtp, sim, registry, cache, transfer } = setup();
		await transfer.loadFromDevice();
		expect(transfer.error).toBeNull();
		expect(transfer.message).toBe(
			'loaded op-xy project · 2 samples from your op-xy · 6 factory sounds play the replica’s stand-ins (the op-xy does not share its factory library over usb)'
		);
		expect(sim.state.areas.sample.tracks[0].keys[0]).toMatchObject({ id: KICK, name: 'kick.wav' });
		expect(registry.ids.sort()).toEqual([KICK, TAKE].sort());
		expect([...cache.files.keys()].sort()).toEqual([KICK, TAKE].sort());
		expect(transfer.skipped.filter((line) => /sample/.test(line))).toEqual([]);
		// the project and its samples came over one session, which is closed; nothing was written
		expect(mtp.operations.filter((op) => op === OP.openSession)).toHaveLength(1);
		expect(mtp.operations.at(-1)).toBe(OP.closeSession);
		expect(mtp.sessionOpen).toBe(false);
		for (const op of [OP.sendObjectInfo, OP.sendObject, OP.deleteObject]) {
			expect(mtp.operations).not.toContain(op);
		}

		// after a reload (a new registry, the saved project) the kept files play again
		const later = new SampleRegistry();
		expect(await new DeviceSamples({ sim, samples: later, cache }).restore()).toBe(2);
		expect(later.ids.sort()).toEqual([KICK, TAKE].sort());

		// and the same project opened from disk plays them, and says so
		const other = new OpxySim({ now: () => 0 });
		const heard = new SampleRegistry();
		const disk = new ProjectTransfer({
			sim: other,
			usb: null,
			blank: async () => blank,
			samples: new DeviceSamples({ sim: other, samples: heard, cache })
		});
		await disk.openFile(new File([beat], 'beat.xy'));
		expect(disk.message).toBe('loaded beat · 2 samples kept from your op-xy');
		expect(heard.ids.sort()).toEqual([KICK, TAKE].sort());
	});

	it('says which samples are still on the op-xy when a project from disk names ones it never read', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const transfer = new ProjectTransfer({
			sim,
			usb: null,
			blank: async () => blank,
			samples: new DeviceSamples({ sim, samples: new SampleRegistry() })
		});
		await transfer.openFile(new File([beat], 'beat.xy'));
		expect(transfer.message).toBe(
			'loaded beat · 2 samples on your op-xy: load the project from it over usb to hear them'
		);
		// a project of TE's sounds alone loads as it always did
		await transfer.openFile(new File([song], 'song.xy'));
		expect(transfer.message).toBe('loaded song');
	});

	it('loads the project even when its samples cannot be read', async () => {
		const { sim, transfer, mtp } = setup(() => ({
			read: async () => {
				throw new Error('the op-xy stopped answering over MTP');
			},
			restore: async () => 0,
			status: () => ({ device: 0, factory: 0, missing: 0, skipped: [] })
		}));
		await transfer.loadFromDevice();
		expect(transfer.error).toBeNull();
		expect(sim.state.project.name).toBe('op-xy project');
		expect(transfer.message).toBe('loaded op-xy project · its samples could not be read');
		expect(transfer.skipped).toContain('samples: the op-xy stopped answering over MTP');
		expect(transfer.canUndo).toBe(true);
		expect(mtp.sessionOpen).toBe(false);
	});

	it('shows how far the reading got', async () => {
		const { transfer } = setup((sim) => {
			const real = new DeviceSamples({ sim, samples: new SampleRegistry() });
			return {
				read: (session, storage, progress) =>
					real.read(session, storage, (done, total) => {
						progress?.(done, total);
						seen.push(transfer.message ?? '');
					}),
				restore: () => real.restore(),
				status: () => real.status()
			};
		});
		const seen: string[] = [];
		await transfer.loadFromDevice();
		expect(seen).toEqual([
			'loaded op-xy project · reading its samples from the op-xy: 1 of 2',
			'loaded op-xy project · reading its samples from the op-xy: 2 of 2',
			'loaded op-xy project · reading its samples from the op-xy: 2 of 2'
		]);
		expect(transfer.message).toMatch(/^loaded op-xy project · 2 samples from your op-xy · /);
	});
});
