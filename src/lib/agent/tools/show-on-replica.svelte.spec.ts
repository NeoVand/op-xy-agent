// show_on_replica demonstrates and then puts the replica back, so a user who tries the steps starts
// where they were (the episodes: a demo that muted track 2 had the user's own shift + T2 unmute it).
// On the app's real simulator, driven by the replica's keys on the rig's fake time.
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { AppSimulator, type FrameClock } from '$lib/app/simulator.svelte';
import { ReplicaState } from '$lib/replica';
import { buildFrame } from '$lib/sim/frames';
import { describeFrame } from '$lib/sim/screen/render';
import { createFakeRig } from '../../../../test/fakes/rig';
import type { AgentEnvironment, ToolContext } from './define';
import { showOnReplicaTool } from './knowledge';

function setup() {
	const rig = createFakeRig();
	const frames: FrameClock = {
		request: (callback) => rig.time.setTimeout(() => callback(rig.time.now()), 16),
		cancel: (handle) => rig.time.clearTimeout(handle),
		now: () => rig.time.now()
	};
	const replica = new ReplicaState({ timers: rig.time });
	const simulator = new AppSimulator({ replica, stack: rig.stack, frames });
	simulator.start();
	flushSync();
	const env = {
		device: null,
		replica,
		screen: {
			read: () => ({
				shows: describeFrame(buildFrame(simulator.sim.state)),
				mode: simulator.sim.state.mode
			})
		},
		virtual: createVirtualOpxy({ sim: simulator.sim }),
		manual: null,
		timers: rig.time,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	} as unknown as AgentEnvironment;
	const show = (keys: string) => {
		const ctx: ToolContext = {
			toolCallId: 'toolu_show',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		};
		return showOnReplicaTool.run(showOnReplicaTool.input.parse({ keys }), ctx);
	};
	return { rig, replica, sim: simulator.sim, show };
}

describe('show_on_replica', () => {
	it('shows a combo, lets it be seen, then puts the replica back as it was', async () => {
		const { rig, sim, show } = setup();
		const pending = show('mix → shift + T2');
		// while it is shown: mix mode, track 2 muted
		await rig.time.advance(2500);
		expect(sim.state.mode).toBe('mix');
		expect(sim.state.tracks[1].mix.muted).toBe(true);
		await rig.time.advance(3000);
		const result = JSON.parse(String((await pending).content));
		expect(result).toMatchObject({ shown: true, replica: expect.stringMatching(/^back where/) });
		// what the demo led to, read before the replica went back, and what it did there
		expect(result.screenAtEnd).toMatch(/mix/);
		// and where it started, so a combo that needs another page first shows as such
		expect(result.startedFrom).toMatch(/^instrument mode, the screen on /);
		// and each combo's screen, rehearsed on a copy
		expect(result.steps.map((s: { keys: string }) => s.keys)).toEqual(['mix', 'shift + T2']);
		expect(result.whileShown).toContain('T2 muted');
		expect(sim.state.mode).toBe('instrument');
		expect(sim.state.tracks[1].mix.muted).toBe(false);
	});

	it('says how the transport ended, which the screen does not show', async () => {
		const { rig, sim, show } = setup();
		const pending = show('record + play');
		await rig.time.advance(6000);
		const result = JSON.parse(String((await pending).content));
		expect(result.transportAtEnd).toMatch(/^recording armed on T1: the first note played starts/);
		// and back as it was
		expect(sim.state.transport.playing).toBe(false);
	});

	it('leaves what the user did when they take over while it plays', async () => {
		const { rig, replica, sim, show } = setup();
		const pending = show('mix → shift + T2');
		await rig.time.advance(2500);
		replica.press('key.m2', 'pointer');
		replica.release('key.m2', 'pointer');
		await rig.time.advance(3000);
		const result = JSON.parse(String((await pending).content));
		expect(result.replica).toMatch(/took over/);
		expect(sim.state.tracks[1].mix.muted).toBe(true);
	});
});
