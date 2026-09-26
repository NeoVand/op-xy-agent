/**
 * A complete fake setup for device-layer tests: manual time, a fake Web MIDI host, an emulated OP-XY
 * and the real device stack wired to them.
 */
import { createDeviceStack, type DeviceStack, type DeviceStackOptions } from '$lib/device/stack';
import { FakeMidiHost } from './fake-midi';
import { FakeOpxy, type FakeOpxyOptions } from './fake-opxy';
import { FakeTime } from './fake-time';

/** Options for `createFakeRig`. */
export interface FakeRigOptions {
	/** Emulated device settings. */
	readonly opxy?: Omit<FakeOpxyOptions, 'host' | 'clock' | 'timers'>;
	/** Plug the device in before the test starts (default true). */
	readonly plugged?: boolean;
	/** Extra stack options (transport tuning, session timeouts…). */
	readonly stack?: Partial<Omit<DeviceStackOptions, 'environment' | 'clock' | 'timers' | 'frames'>>;
	/** Start the stack's listeners (default true). */
	readonly start?: boolean;
}

/** Everything a device test needs. */
export interface FakeRig {
	readonly time: FakeTime;
	readonly host: FakeMidiHost;
	readonly opxy: FakeOpxy;
	readonly stack: DeviceStack;
	/** Stops the stack's listeners. */
	readonly stop: () => void;
	/** Runs `session.connect()` to completion, advancing fake time as needed. */
	connect(): Promise<void>;
}

/** Builds a fake rig. */
export function createFakeRig(options: FakeRigOptions = {}): FakeRig {
	const time = new FakeTime();
	const host = new FakeMidiHost({ clock: time, timers: time });
	const opxy = new FakeOpxy({ host, clock: time, timers: time, ...options.opxy });
	if (options.plugged ?? true) opxy.plugIn();
	const stack = createDeviceStack({
		...options.stack,
		environment: () => host.environment(),
		clock: time,
		timers: time,
		frames: time
	});
	const stop = options.start === false ? () => {} : stack.start();
	return {
		time,
		host,
		opxy,
		stack,
		stop,
		async connect() {
			const done = stack.session.connect();
			await time.advance(50);
			await done;
		}
	};
}
