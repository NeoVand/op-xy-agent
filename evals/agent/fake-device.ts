/**
 * The emulated OP-XY from test/fakes on real timers (the unit-test rig uses manual time), wired to
 * the real device stack, plus a replica whose animations are recorded. Nothing here touches real
 * MIDI hardware.
 */
import { formatKeys, type KeySequence } from '$lib/core/opxy';
import { createDeviceStack, type DeviceStack } from '$lib/device/stack';
import { ReplicaState } from '$lib/replica/state.svelte';
import { FakeMidiHost } from '../../test/fakes/fake-midi';
import { FakeOpxy } from '../../test/fakes/fake-opxy';

/** A connected fake OP-XY. */
export interface FakeDevice {
	readonly opxy: FakeOpxy;
	readonly stack: DeviceStack;
	/** Everything the device received since `mark()` (bytes as arrays). */
	received(): number[][];
	/** Forgets what was received so far (call after a task's setup). */
	mark(): void;
	dispose(): Promise<void>;
}

const clock = { now: () => performance.now() };
const timers = {
	setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
	clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};
const frames = {
	request: (callback: (time: number) => void) => setTimeout(() => callback(clock.now()), 16),
	cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Plugs in and connects a fake OP-XY (OS 1.1.33). */
export async function connectFakeDevice(
	options: { clockMode?: 'in' | 'both' } = {}
): Promise<FakeDevice> {
	const host = new FakeMidiHost({ clock, timers });
	const opxy = new FakeOpxy({ host, clock, timers, clockMode: options.clockMode ?? 'in' });
	opxy.plugIn();
	const stack = createDeviceStack({ environment: () => host.environment(), clock, timers, frames });
	const stop = stack.start();
	await stack.session.connect();
	let from = opxy.received.length;
	return {
		opxy,
		stack,
		received: () => opxy.received.slice(from).map((bytes) => [...bytes]),
		mark: () => {
			from = opxy.received.length;
		},
		async dispose() {
			stop();
			await stack.session.disconnect();
			opxy.unplug();
		}
	};
}

/** A replica that records every combo it is asked to show. */
export function recordingReplica(): { replica: ReplicaState; shown: string[] } {
	const replica = new ReplicaState();
	const shown: string[] = [];
	const animate = replica.animate.bind(replica);
	replica.animate = (keys: string | KeySequence, options) => {
		shown.push(typeof keys === 'string' ? keys : formatKeys(keys));
		return animate(keys, options);
	};
	return { replica, shown };
}

/** Waits for real time to pass (so the fake device processes what was sent). */
export function settle(ms = 60): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
