/**
 * The app's virtual OP-XY: one UI simulator (`$lib/sim`, decision D10) behind the app-wide replica,
 * so the replica's screen and LED windows behave like the device wherever it is drawn.
 *
 * - **In:** every replica event (someone playing the replica, and the agent's teaching animations,
 *   which should end on the page a combo leads to) through `replica.observe`.
 * - **Out:** the screen frame (`frame`, `tick`) and the LED windows. LEDs are applied as changes
 *   only, so what the device bridge lights (the notes the OP-XY plays) stays lit until the
 *   simulator itself changes that key.
 * - **Time:** the page's clock always runs the simulator's timers (holds, flashing LEDs, the record
 *   countdown, the boot screen) and, while it plays, moves the playhead, unless a connected OP-XY
 *   sends its clock (COM → clock "both"): then its Start / Stop and every F8 tick drive the
 *   transport, so the steps chase in time with the device. The simulator's millisecond clock is the
 *   same page clock.
 * - **Device facts:** the device's tempo (measured, else what the app last set) and the track the
 *   app selected with CC102 carry over.
 *
 * It never sends anything to the device: that is the bridge's job (`bridge.svelte.ts`).
 */
import { getContext, hasContext, setContext, untrack } from 'svelte';
import type { MidiEvent } from '$lib/core/midi/bus';
import type { KeyId } from '$lib/core/opxy';
import type { DeviceStack } from '$lib/device';
import type { KeyLedState, ReplicaState } from '$lib/replica';
import type { ScreenFrameSource } from '$lib/replica/screen';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { ScreenFrame } from '$lib/sim/screen/frame';

/** Animation frames (the browser's, or a fake in tests). */
export interface FrameClock {
	request(callback: (now: number) => void): unknown;
	cancel(handle: unknown): void;
	now(): number;
}

/** Options for {@link AppSimulator}. */
export interface AppSimulatorOptions {
	readonly replica: ReplicaState;
	/** The app's device stack; null runs the simulator alone. */
	readonly stack: DeviceStack | null;
	readonly frames?: FrameClock;
	/** Measured tempo changes smaller than this (BPM) are clock jitter, not a new tempo. */
	readonly tempoHysteresis?: number;
}

const BROWSER_FRAMES: FrameClock = {
	request: (callback) => requestAnimationFrame(callback),
	cancel: (handle) => cancelAnimationFrame(handle as number),
	now: () => performance.now()
};

/** The replica's virtual OP-XY. Create once (root layout), then `start()` in onMount. */
export class AppSimulator implements ScreenFrameSource {
	readonly sim: OpxySim;

	readonly #replica: ReplicaState;
	readonly #stack: DeviceStack | null;
	readonly #frames: FrameClock;
	readonly #hysteresis: number;
	/** The LED states last applied to the replica. */
	#applied: Partial<Record<KeyId, KeyLedState>> = {};
	#stop: (() => void) | null = null;

	constructor(options: AppSimulatorOptions) {
		this.#replica = options.replica;
		this.#stack = options.stack;
		this.#frames = options.frames ?? BROWSER_FRAMES;
		this.#hysteresis = options.tempoHysteresis ?? 0.3;
		const frames = this.#frames;
		this.sim = new OpxySim({ now: () => frames.now() });
	}

	/** What the screen shows. */
	get frame(): ScreenFrame {
		return this.sim.frame;
	}

	/** Animation step for pages that move on their own. */
	get tick(): number {
		const t = this.sim.state.transport;
		return t.playing ? Math.floor(t.position) : 0;
	}

	/** True while a connected OP-XY's clock drives the transport. */
	get deviceClock(): boolean {
		return this.#stack?.session.phase === 'ready' && this.#stack.mirror.clockOut;
	}

	/** Starts listening and drawing. Idempotent; returns `stop`. */
	start(): () => void {
		if (this.#stop) return this.#stop;
		const stops: (() => void)[] = [this.#replica.observe((event) => this.sim.input(event))];
		if (this.#stack) stops.push(this.#stack.bus.subscribe((event) => this.#onBus(event)));
		stops.push(
			$effect.root(() => {
				$effect(() => this.#applyLeds(this.sim.leds));
				$effect(() => this.#followTempo());
				$effect(() => this.#followTrack());
			})
		);
		stops.push(this.#runClock());
		this.#stop = () => {
			for (const stop of stops) stop();
			this.#stop = null;
		};
		return this.#stop;
	}

	stop(): void {
		this.#stop?.();
	}

	/** Applies what changed since the last time, leaving other writers' LEDs alone. */
	#applyLeds(next: Partial<Record<KeyId, KeyLedState>>): void {
		const changes: Partial<Record<KeyId, KeyLedState>> = {};
		let any = false;
		for (const [id, state] of Object.entries(next) as [KeyId, KeyLedState][]) {
			if (this.#applied[id] !== state) {
				changes[id] = state;
				any = true;
			}
		}
		this.#applied = next;
		if (any) untrack(() => this.#replica.setLeds(changes));
	}

	/**
	 * The page's clock, every frame: the simulator's timers run, and a playing transport moves unless
	 * the device's clock moves it (its F8 ticks, see {@link #onBus}).
	 */
	#runClock(): () => void {
		const frames = this.#frames;
		let last = frames.now();
		const step = (now: number) => {
			untrack(() => this.sim.advance(now - last, { transport: !this.deviceClock }));
			last = now;
			handle = frames.request(step);
		};
		let handle = frames.request(step);
		return () => frames.cancel(handle);
	}

	#followTempo(): void {
		const mirror = this.#stack?.mirror;
		if (!mirror) return;
		const measured = mirror.measuredBpm;
		const sent = mirror.tempoSent;
		untrack(() => {
			const current = this.sim.state.tempo.bpm;
			if (measured !== null) {
				if (Math.abs(measured - current) >= this.#hysteresis) this.sim.setTempo(measured);
			} else if (sent !== null && sent !== current) {
				this.sim.setTempo(sent);
			}
		});
	}

	#followTrack(): void {
		const track = this.#stack?.mirror.selectedTrack ?? null;
		if (track !== null && track <= 8) untrack(() => this.sim.selectTrack(track - 1));
	}

	#onBus(event: MidiEvent): void {
		if (event.direction !== 'in') return;
		switch (event.message.type) {
			case 'clock':
				this.sim.clockTick();
				return;
			case 'start':
			case 'continue':
			case 'stop':
				this.sim.follow(event.message.type);
				return;
		}
	}
}

const SIMULATOR = Symbol('opxy.app.simulator');

/** Makes the app's simulator available to every component below (root layout). */
export function setAppSimulator(simulator: AppSimulator): AppSimulator {
	return setContext(SIMULATOR, simulator);
}

/** The app's simulator, or null outside the app shell (isolated renders, tests). */
export function getAppSimulator(): AppSimulator | null {
	return hasContext(SIMULATOR) ? getContext<AppSimulator>(SIMULATOR) : null;
}
