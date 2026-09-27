import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { ReplicaState } from '$lib/replica';
import { createFakeRig, type FakeRigOptions } from '../../../test/fakes/rig';
import { AppSimulator, type FrameClock } from './simulator.svelte';

/** Animation frames on the rig's fake time. */
function fakeFrames(rig: ReturnType<typeof createFakeRig>): FrameClock {
	return {
		request: (callback) => rig.time.setTimeout(() => callback(rig.time.now()), 16),
		cancel: (handle) => rig.time.clearTimeout(handle),
		now: () => rig.time.now()
	};
}

async function setup(options: FakeRigOptions & { connect?: boolean } = {}) {
	const rig = createFakeRig(options);
	const replica = new ReplicaState({ timers: rig.time });
	const simulator = new AppSimulator({ replica, stack: rig.stack, frames: fakeFrames(rig) });
	const stop = simulator.start();
	if (options.connect ?? true) await rig.connect();
	flushSync();
	return { rig, replica, simulator, sim: simulator.sim, stop };
}

describe('AppSimulator: the replica drives the virtual OP-XY', () => {
	it("shows the page the replica's keys lead to, and the agent's demonstrations too", async () => {
		const { replica, simulator, rig } = await setup({ connect: false });
		// a new project opens on track 1, a drum sampler: its M1 page
		expect(simulator.frame.page).toBe('drum');
		replica.press('key.m2', 'pointer');
		replica.release('key.m2', 'pointer');
		expect(simulator.frame.page).toBe('envelope');
		// a teaching animation (never sent to the device) still moves the simulator: shift + M1
		// opens the engine list
		replica.animate('shift + M1');
		await rig.time.advance(3000);
		expect(simulator.frame.page).toBe('list');
		expect(simulator.sim.state.picker?.kind).toBe('engine');
	});

	it('lights LED windows, and leaves what another writer lit until it changes that key', async () => {
		const { replica, rig } = await setup({ connect: false });
		expect(replica.led('track.1')).toBe('white');
		expect(replica.led('step.3')).toBe('off');
		// the bridge lights a key the device plays; the simulator leaves it alone
		replica.setLed('keyboard.c4', 'white');
		replica.press('step.3', 'pointer');
		replica.release('step.3', 'pointer');
		flushSync();
		expect(replica.led('step.3')).toBe('white');
		expect(replica.led('keyboard.c4')).toBe('white');
		// holding and letting go of that key is the simulator's change: now it applies
		replica.press('keyboard.c4', 'pointer');
		flushSync();
		replica.release('keyboard.c4', 'pointer');
		flushSync();
		expect(replica.led('keyboard.c4')).toBe('off');
		await rig.time.advance(10);
	});

	it('runs the playhead on the page clock while playing without a device clock', async () => {
		const { replica, sim, rig } = await setup({ connect: false });
		replica.press('key.play', 'pointer');
		replica.release('key.play', 'pointer');
		flushSync();
		await rig.time.advance(500); // four sixteenths at 120 BPM
		expect(sim.state.transport.position).toBeGreaterThan(3);
		replica.press('key.stop', 'pointer');
		replica.release('key.stop', 'pointer');
		flushSync();
		await rig.time.advance(200);
		expect(sim.state.transport).toMatchObject({ playing: false, position: 0 });
	});
});

describe('AppSimulator: following a connected OP-XY', () => {
	it('plays on the device clock and stops with the device', async () => {
		const { rig, sim, simulator } = await setup({ opxy: { clockMode: 'both' } });
		await rig.time.advance(1500);
		flushSync();
		expect(simulator.deviceClock).toBe(true);
		rig.opxy.pressPlay();
		await rig.time.advance(250); // half a beat at 120 BPM: 12 ticks, 2 steps
		expect(sim.state.transport.playing).toBe(true);
		expect(sim.state.transport.position).toBeGreaterThan(1.5);
		expect(sim.state.transport.position).toBeLessThan(2.6);
		rig.opxy.pressStop();
		await rig.time.advance(50);
		expect(sim.state.transport).toMatchObject({ playing: false, position: 0 });
	});

	it("takes the device's measured tempo, ignoring clock jitter, and what the app sets", async () => {
		const { rig, sim, stack } = await setup({ opxy: { clockMode: 'both' } }).then((s) => ({
			...s,
			stack: s.rig.stack
		}));
		await rig.time.advance(2500);
		flushSync();
		expect(sim.state.tempo.bpm).toBe(120);
		stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 80, value: 46 },
			{ source: 'agent' }
		);
		await rig.time.advance(3000);
		flushSync();
		expect(sim.state.tempo.bpm).toBeCloseTo(92, 0);
	});

	it('selects the track the app selected with CC102', async () => {
		const { rig, sim } = await setup();
		rig.stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 102, value: 4 },
			{ source: 'agent' }
		);
		flushSync();
		expect(sim.state.track).toBe(4);
	});

	it('stops listening when stopped', async () => {
		const { replica, simulator, stop } = await setup({ connect: false });
		stop();
		replica.press('key.m3', 'pointer');
		expect(simulator.frame.page).toBe('drum');
	});
});
