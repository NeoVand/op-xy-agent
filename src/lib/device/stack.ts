/**
 * Wires the device layer together: one bus, the access controller, the transport (the only sender),
 * the mirror, the monitor and the session. Construction has no side effects; `start()` (call it in
 * `onMount`) detects Web MIDI support, routes incoming messages through the transport, and starts
 * the subscribers. Nothing asks for MIDI access until `session.connect()`.
 */
import { MidiBus } from '$lib/core/midi/bus';
import { MidiAccessController } from './access.svelte';
import {
	browserAccessEnvironment,
	browserClock,
	browserFrames,
	browserTimers,
	browserUserActivation
} from './env';
import { DeviceMirror } from './mirror.svelte';
import { MidiMonitor } from './monitor.svelte';
import { DeviceSession, type DeviceSessionOptions } from './session.svelte';
import { Transport, type TransportOptions } from './transport';
import type { AccessEnvironment, Clock, FrameScheduler, LifecycleTarget, Timers } from './types';

/** Everything the stack needs from its environment (the browser, or fakes in tests). */
export interface DeviceStackOptions {
	/** Resolved when `start()` runs. */
	readonly environment: () => AccessEnvironment;
	readonly clock: Clock;
	readonly timers: Timers;
	readonly frames: FrameScheduler;
	/** Where `pagehide` / `pageshow` fire (`window`); resolved when `start()` runs. */
	readonly lifecycle?: () => LifecycleTarget | null;
	/** Transport tuning (rates, windows, confirmation gate). */
	readonly transport?: Omit<TransportOptions, 'ports' | 'bus' | 'clock'>;
	/** Session timeouts. */
	readonly session?: Omit<
		DeviceSessionOptions,
		'access' | 'transport' | 'bus' | 'timers' | 'mirror'
	>;
	/** Monitor sizes. */
	readonly monitor?: { readonly capacity?: number; readonly visible?: number };
}

/** The wired device layer. */
export interface DeviceStack {
	readonly bus: MidiBus;
	readonly access: MidiAccessController;
	readonly transport: Transport;
	readonly mirror: DeviceMirror;
	readonly monitor: MidiMonitor;
	readonly session: DeviceSession;
	/** Starts everything that listens; returns the function that stops it again. */
	start(): () => void;
}

/** Builds the device layer. */
export function createDeviceStack(options: DeviceStackOptions): DeviceStack {
	const bus = new MidiBus();
	const access = new MidiAccessController({ environment: options.environment });
	const transport = new Transport({
		...options.transport,
		ports: access,
		bus,
		clock: options.clock
	});
	const isEcho = (event: Parameters<Transport['isEcho']>[0]) => transport.isEcho(event);
	const mirror = new DeviceMirror({ bus, clock: options.clock, timers: options.timers, isEcho });
	const monitor = new MidiMonitor({ bus, frames: options.frames, isEcho, ...options.monitor });
	const session = new DeviceSession({
		...options.session,
		access,
		transport,
		bus,
		timers: options.timers,
		mirror
	});

	function start(): () => void {
		access.init();
		const stops = [
			access.onMessage((data, timeStamp) => {
				transport.receive(data, timeStamp);
			}),
			mirror.start(),
			monitor.start(),
			session.start()
		];
		const target = options.lifecycle?.() ?? null;
		if (target) stops.push(access.bindLifecycle(target));
		return () => {
			for (const stop of stops) stop();
		};
	}

	return { bus, access, transport, mirror, monitor, session, start };
}

/** The real browser: Web MIDI, `performance.now()`, timers, animation frames and `window`. */
export function browserDeviceOptions(): DeviceStackOptions {
	return {
		environment: browserAccessEnvironment,
		clock: browserClock,
		timers: browserTimers,
		frames: browserFrames,
		lifecycle: () => (typeof window === 'undefined' ? null : window),
		transport: { userActivation: browserUserActivation }
	};
}
