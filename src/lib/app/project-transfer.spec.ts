import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAKE_MTP_TREE, FakeMtpOpxy, FakeUsbOpxy } from '../../../test/fakes/fake-mtp';
import { OP } from '$lib/core/mtp';
import { readProject } from '$lib/core/xy/read';
import type { UsbLike } from '$lib/device/mtp';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { defaultState } from '$lib/sim/params';
import { simToXy, xyToSim } from '$lib/sim/xy';
import { ProjectTransfer } from './project-transfer.svelte';

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
