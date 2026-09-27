/**
 * The app's virtual OP-XY: one UI simulator (`$lib/sim`, decision D10) behind the app-wide replica,
 * so the replica's screen and LED windows behave like the device wherever it is drawn.
 *
 * - **In:** every replica event (someone playing the replica, and the agent's teaching animations,
 *   which should end on the page a combo leads to) through `replica.observe`.
 * - **Out:** the screen frame (`frame`, `tick`) and the LED windows. LEDs are applied as changes
 *   only, so what the device bridge lights (the notes the OP-XY plays) stays lit until the
 *   simulator itself changes that key.
 * - **Time:** while it plays, the page's clock moves the playhead, unless a connected OP-XY sends
 *   its clock (COM → clock "both"): then its Start / Stop and every F8 tick drive the transport, so
 *   the steps chase in time with the device. While the computer makes the sound (`sound.svelte.ts`)
 *   the playhead follows the audio clock instead (`playheadClock`), so the steps light with what
 *   plays.
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
	readonly sim = new OpxySim();

	readonly #replica: ReplicaState;
	readonly #stack: DeviceStack | null;
	readonly #frames: FrameClock;
	readonly #hysteresis: number;
	/** The LED states last applied to the replica. */
	#applied: Partial<Record<KeyId, KeyLedState>> = {};
	#stop: (() => void) | null = null;
	#playheadClock = $state.raw<(() => number) | null>(null);

	constructor(options: AppSimulatorOptions) {
		this.#replica = options.replica;
		this.#stack = options.stack;
		this.#frames = options.frames ?? BROWSER_FRAMES;
		this.#hysteresis = options.tempoHysteresis ?? 0.3;
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

	/**
	 * A clock (ms) the page's playhead follows instead of the frames' time, or null for the frames.
	 * The sound engine sets its audio clock while it runs, so the steps and the sound share one
	 * timeline; it must stop advancing only when the sound does.
	 */
	get playheadClock(): (() => number) | null {
		return this.#playheadClock;
	}

	set playheadClock(clock: (() => number) | null) {
		this.#playheadClock = clock;
	}

	/** Starts listening and drawing. Idempotent; returns `stop`. */
	start(): () => void {
		if (this.#stop) return this.#stop;
		const stops: (() => void)[] = [this.#replica.observe((event) => this.sim.input(event))];
		if (this.#stack) stops.push(this.#stack.bus.subscribe((event) => this.#onBus(event)));
		stops.push(
			$effect.root(() => {
				$effect(() => this.#applyLeds(this.sim.leds));
				$effect(() => this.#runClock());
				$effect(() => this.#followTempo());
				$effect(() => this.#followTrack());
			})
		);
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
	 * The page's clock moves the playhead while playing, unless the device's clock does: each frame
	 * advances it by the time since the last one, read from the frames or from `playheadClock`.
	 */
	#runClock(): (() => void) | void {
		if (!this.sim.state.transport.playing || this.deviceClock) return;
		const { sim } = this;
		const frames = this.#frames;
		// switching clocks restarts this effect, so each loop reads one clock throughout
		const clock = this.#playheadClock;
		const read = (frame: number) => (clock ? clock() : frame);
		let last = read(frames.now());
		let handle = frames.request(function step(now: number) {
			const time = read(now);
			untrack(() => sim.advance(time - last));
			last = time;
			handle = frames.request(step);
		});
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
