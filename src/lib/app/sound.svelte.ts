/**
 * The replica's sound when no OP-XY makes it: Web Audio synthesis (`$lib/sound`) played from the
 * app's simulator. Keyboard keys on the replica play the active track's engine at once (a drum track
 * its kit sound); while the simulator's transport runs, the lookahead scheduler plays every track's
 * pattern and the metronome.
 *
 * - **When:** on by default while the replica is simulated, and remembered. While a real OP-XY is
 *   connected (session ready) the device makes the sound, so the computer stays quiet unless the
 *   listener turns on "sound on this computer" (for that visit only).
 * - **Browsers:** an AudioContext may only start on a user gesture, so it is created (or resumed) on
 *   the first press anywhere on the page. That listener runs in the capture phase, before the
 *   replica's own, so the very first key sounds. After a stretch of silence the context is
 *   suspended; the next gesture or note resumes it.
 * - **Bundle:** the engine loads on first use (`import('$lib/sound/runtime')`), prefetched while the
 *   page is idle, so this module and the page's first bundle stay small.
 * - **Time:** while sound runs, the simulator's playhead follows the audio clock
 *   (`AppSimulator.playheadClock`), so the step LEDs light with what plays; the replica's level
 *   meter shows the output.
 *
 * Start it after the simulator: both observe the replica, and the sound reads what the simulator
 * made of each event (which track is active, whether the transport runs).
 */
import { createContext, untrack } from 'svelte';
import { KEYBOARD_FIRST_NOTE, KEYBOARD_NOTE_NAMES } from '$lib/core/opxy';
import {
	browserClock,
	browserTimers,
	type Clock,
	type DeviceStack,
	type Timers
} from '$lib/device';
import type { ReplicaEvent, ReplicaState } from '$lib/replica';
import { METER_SEGMENTS } from '$lib/replica/geometry';
import { SampleRegistry } from '$lib/sound/samples';
import type { AppSimulator } from './simulator.svelte';

/** Where the choice made while simulated is remembered ("on" / "off"). */
export const SOUND_STORAGE_KEY = 'opxy:sound';

/** The engine's chunk, loaded on first use. */
export type SoundRuntime = typeof import('$lib/sound/runtime');
type Engine = InstanceType<SoundRuntime['SoundEngine']>;
type Scheduler = InstanceType<SoundRuntime['Scheduler']>;

/** Input that counts as the gesture browsers want before audio may start. */
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
/** How far the scheduler looks ahead while the page is hidden and its timers are throttled (s). */
const HIDDEN_LOOKAHEAD = 1.2;
/** Seconds of silence, after every tail has died away, before the context is suspended. */
const IDLE_SECONDS = 15;
/** A key pressed while the engine was loading still sounds if it loaded within this (ms). */
const PENDING_MS = 400;
/** The replica keyboard's velocity (what the bridge sends the device, too). */
const VELOCITY = 100;
/** The level meter's floor: quieter than this lights nothing; 0 dBFS lights every LED. */
const METER_FLOOR_DB = -48;
/** How much of the meter's height falls away per tick (rising is instant). */
const METER_FALL = 0.035;

/** A keyboard key going down or up, on the track it plays. */
interface LiveEvent {
	readonly kind: 'on' | 'off';
	readonly key: string;
	readonly track: number;
	readonly note: number;
}

/** Options for {@link AppSound}. */
export interface AppSoundOptions {
	readonly simulator: AppSimulator;
	readonly replica: ReplicaState;
	/** The app's device stack (a ready session means the OP-XY makes the sound); null for none. */
	readonly stack: DeviceStack | null;
	/** Recordings for the sampler engines (default a new, empty registry). */
	readonly samples?: SampleRegistry;
	/** Where the choice is remembered (default localStorage, looked up when needed). */
	readonly storage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
	/** Makes the audio context (default the browser's). */
	readonly createContext?: () => AudioContext;
	/** Loads the engine (default a dynamic import, so it gets a chunk of its own). */
	readonly load?: () => Promise<SoundRuntime>;
	readonly timers?: Timers;
	/** Milliseconds, for how long a key has waited for the engine. */
	readonly clock?: Clock;
	/** Where gestures are heard (default the document). */
	readonly gestures?: () => EventTarget | null;
	/** Whether the page is hidden (default the document's visibility). */
	readonly hidden?: () => boolean;
}

/** The replica's sound. Create once (root layout), then `start()` in onMount, after the simulator. */
export class AppSound {
	/** Recordings the sampler engines play: whatever captures or loads audio hands it over here. */
	readonly samples: SampleRegistry;

	readonly #simulator: AppSimulator;
	readonly #replica: ReplicaState;
	readonly #stack: DeviceStack | null;
	readonly #storage: () => Pick<Storage, 'getItem' | 'setItem'> | null;
	readonly #createContext: () => AudioContext;
	readonly #load: () => Promise<SoundRuntime>;
	readonly #timers: Timers;
	readonly #clock: Clock;
	readonly #gestures: () => EventTarget | null;
	readonly #hidden: () => boolean;

	/** The choice while simulated (remembered) and while connected (this visit). */
	#simulated = $state(true);
	#here = $state(false);
	#running = $state(false);
	#unavailable = $state(false);

	#context: AudioContext | null = null;
	#loading: Promise<SoundRuntime | null> | null = null;
	#engine: Engine | null = null;
	#scheduler: Scheduler | null = null;
	#tickMs = 25;
	#timer: unknown = null;
	#suspendTimer: unknown = null;
	/** Keyboard keys sounding and the track each plays on (bookkeeping, never rendered). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #live = new Map<string, LiveEvent>();
	/** Keys pressed before the engine had loaded. */
	#pending: { at: number; event: LiveEvent }[] = [];
	#bendTrack: number | null = null;
	#meter = 0;
	#lit = 0;
	#stop: (() => void) | null = null;

	constructor(options: AppSoundOptions) {
		this.#simulator = options.simulator;
		this.#replica = options.replica;
		this.#stack = options.stack;
		this.samples = options.samples ?? new SampleRegistry();
		this.#storage = options.storage ?? (() => localStorage);
		this.#createContext =
			options.createContext ?? (() => new AudioContext({ latencyHint: 'interactive' }));
		this.#load = options.load ?? (() => import('$lib/sound/runtime'));
		this.#timers = options.timers ?? browserTimers;
		this.#clock = options.clock ?? browserClock;
		this.#gestures =
			options.gestures ?? (() => (typeof document === 'undefined' ? null : document));
		this.#hidden =
			options.hidden ??
			(() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
	}

	/** True while a real OP-XY is connected: then it makes the sound. */
	get connected(): boolean {
		return this.#stack?.session.phase === 'ready';
	}

	/**
	 * Whether this computer makes sound: the choice for being simulated (on by default,
	 * remembered), or while connected the choice to hear the replica here too (off by default).
	 */
	get enabled(): boolean {
		return this.connected ? this.#here : this.#simulated;
	}

	set enabled(on: boolean) {
		if (this.connected) {
			this.#here = on;
			return;
		}
		this.#simulated = on;
		try {
			this.#storage()?.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
		} catch {
			// private mode or blocked storage: the choice holds for this visit
		}
	}

	/** Turns sound on or off (whichever choice applies now). */
	toggle(): void {
		this.enabled = !this.enabled;
	}

	/** True while audio runs: from the first gesture until silence suspends it. */
	get running(): boolean {
		return this.#running;
	}

	/** False when this browser cannot make sound (no Web Audio, or the engine failed to load). */
	get available(): boolean {
		return !this.#unavailable;
	}

	/** Starts listening. Idempotent; returns `stop`. */
	start(): () => void {
		if (this.#stop) return this.#stop;
		this.#simulated = this.#recall();
		const stops: (() => void)[] = [this.#replica.observe((event) => this.#onReplica(event))];
		const target = this.#gestures();
		if (target) {
			const unlock = () => this.#unlock();
			for (const type of GESTURES) {
				target.addEventListener(type, unlock, { capture: true, passive: true });
			}
			stops.push(() => {
				for (const type of GESTURES) target.removeEventListener(type, unlock, { capture: true });
			});
		}
		stops.push(
			$effect.root(() => {
				$effect(() => {
					const on = this.enabled;
					untrack(() => (on ? this.#activate() : this.#deactivate()));
				});
				$effect(() => {
					// the transport started without a key (the agent, a device): wake the sound up
					if (this.enabled && this.#simulator.sim.state.transport.playing) {
						untrack(() => this.#unlock());
					}
				});
			})
		);
		this.#stop = () => {
			for (const stop of stops) stop();
			this.#stop = null;
			this.#close();
		};
		return this.#stop;
	}

	stop(): void {
		this.#stop?.();
	}

	#recall(): boolean {
		try {
			return this.#storage()?.getItem(SOUND_STORAGE_KEY) !== 'off';
		} catch {
			return true;
		}
	}

	// ─────────────────────────────────────────────────────────── the audio context

	#activate(): void {
		this.#prefetch();
		this.#resume();
		this.#follow();
	}

	#deactivate(): void {
		this.#engine?.silence();
		this.#scheduler?.reset();
		this.#live.clear();
		this.#pending = [];
		this.#bendTrack = null;
		this.#follow();
		this.#showMeter(0);
		const context = this.#context;
		if (context?.state !== 'running') return;
		// let the quick fades finish, then stop the audio thread
		this.#clearSuspend();
		this.#suspendTimer = this.#timers.setTimeout(() => {
			this.#suspendTimer = null;
			if (!this.enabled) void context.suspend().catch(() => {});
		}, 200);
	}

	/** A gesture (or a transport start): make sure audio can run. */
	#unlock(): void {
		if (!this.enabled) return;
		this.#ensureContext();
		this.#resume();
	}

	#resume(): void {
		const context = this.#context;
		if (!context || context.state === 'running' || context.state === 'closed') return;
		this.#clearSuspend();
		void context.resume().catch(() => {});
	}

	#clearSuspend(): void {
		if (this.#suspendTimer !== null) this.#timers.clearTimeout(this.#suspendTimer);
		this.#suspendTimer = null;
	}

	#ensureContext(): AudioContext | null {
		if (this.#context || this.#unavailable) return this.#context;
		let context: AudioContext;
		try {
			context = this.#createContext();
		} catch {
			this.#unavailable = true;
			return null;
		}
		this.#context = context;
		context.addEventListener('statechange', () => this.#onStateChange());
		void this.#build();
		this.#onStateChange();
		return context;
	}

	/** The context started, stopped or was closed. */
	#onStateChange(): void {
		this.#running = this.#context?.state === 'running';
		this.#follow();
	}

	/** The audio clock in ms, for the simulator's playhead (one function, so it compares equal). */
	#audioClock = (): number => (this.#context?.currentTime ?? 0) * 1000;

	/** The loop runs, and the playhead follows the audio clock, only while sound does. */
	#follow(): void {
		const live = this.#running && this.enabled;
		this.#simulator.playheadClock = live ? this.#audioClock : null;
		if (live) this.#startLoop();
		else this.#stopLoop();
	}

	#prefetch(): void {
		if (this.#loading) return;
		const idle = globalThis.requestIdleCallback;
		if (typeof idle === 'function') idle(() => void this.#fetch(), { timeout: 4000 });
		else this.#timers.setTimeout(() => void this.#fetch(), 1500);
	}

	#fetch(): Promise<SoundRuntime | null> {
		this.#loading ??= this.#load().catch((error: unknown) => {
			console.error('the sound engine did not load', error);
			this.#unavailable = true;
			return null;
		});
		return this.#loading;
	}

	/** Builds the engine and scheduler once both the chunk and the context exist. */
	async #build(): Promise<void> {
		const runtime = await this.#fetch();
		const context = this.#context;
		if (!runtime || !context || this.#engine || !this.#stop) return;
		const simulator = this.#simulator;
		const engine = new runtime.SoundEngine({ context, samples: this.samples });
		this.#engine = engine;
		this.#tickMs = runtime.TICK_MS;
		this.#scheduler = new runtime.Scheduler({
			state: () => simulator.sim.state,
			now: () => context.currentTime,
			sink: engine.sink,
			follow: () => simulator.deviceClock
		});
		engine.sync(simulator.sim.state);
		this.#flush();
		this.#follow();
	}

	#close(): void {
		this.#stopLoop();
		this.#clearSuspend();
		this.#engine?.dispose();
		this.#engine = null;
		this.#scheduler = null;
		this.#live.clear();
		this.#pending = [];
		this.#showMeter(0);
		const context = this.#context;
		this.#context = null;
		this.#onStateChange();
		if (context && context.state !== 'closed') void context.close().catch(() => {});
	}

	// ─────────────────────────────────────────────────────────── the loop

	#startLoop(): void {
		if (this.#timer === null && this.#engine) this.#tick();
	}

	#stopLoop(): void {
		if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
		this.#timer = null;
	}

	/** Every 25 ms: the simulator's settings to the engine, the patterns ahead, the meter. */
	#tick = (): void => {
		this.#timer = null;
		const engine = this.#engine;
		const scheduler = this.#scheduler;
		const context = this.#context;
		if (!engine || !scheduler || !context || context.state !== 'running' || !this.enabled) return;
		const state = this.#simulator.sim.state;
		engine.sync(state);
		scheduler.tick(this.#hidden() ? HIDDEN_LOOKAHEAD : undefined);
		this.#meterTick(engine);
		if (!state.transport.playing && context.currentTime > engine.quietAt + IDLE_SECONDS) {
			// long silent: rest the audio thread until the next gesture or note
			this.#showMeter(0);
			void context.suspend().catch(() => {});
			return;
		}
		this.#timer = this.#timers.setTimeout(this.#tick, this.#tickMs);
	};

	#meterTick(engine: Engine): void {
		const peak = engine.level();
		const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
		const level = Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
		this.#showMeter(Math.max(level, this.#meter - METER_FALL));
	}

	/** Lights the replica's meter, touching it only when the number of lit LEDs changes. */
	#showMeter(level: number): void {
		this.#meter = level;
		const lit = Math.round(level * METER_SEGMENTS);
		if (lit === this.#lit) return;
		this.#lit = lit;
		this.#replica.setMeter(lit / METER_SEGMENTS);
	}

	// ─────────────────────────────────────────────────────────── live playing

	#onReplica(event: ReplicaEvent): void {
		if (!this.enabled) return;
		switch (event.type) {
			case 'press':
				if (event.id.startsWith('keyboard.')) this.#noteOn(event.id);
				else if (event.id === 'key.play' || event.id === 'key.stop') {
					// the simulator has moved its transport already: schedule from it now, not next tick
					this.#unlock();
					this.#scheduler?.tick();
				}
				return;
			case 'release':
				if (event.id.startsWith('keyboard.')) this.#noteOff(event.id);
				return;
			case 'bend':
				this.#bend(event.value);
				return;
		}
	}

	#noteOn(key: string): void {
		const { state } = this.#simulator.sim;
		// with shift or bar held the keys are functions (octave, track scale…), not notes
		if (state.held.includes('key.shift') || state.held.includes('key.bar')) return;
		const index = (KEYBOARD_NOTE_NAMES as readonly string[]).indexOf(key.slice('keyboard.'.length));
		if (index < 0) return;
		const event: LiveEvent = {
			kind: 'on',
			key,
			track: state.track,
			note: KEYBOARD_FIRST_NOTE + index
		};
		this.#live.set(key, event);
		this.#unlock();
		this.#send(event);
	}

	#noteOff(key: string): void {
		const on = this.#live.get(key);
		if (!on) return;
		this.#live.delete(key);
		this.#send({ ...on, kind: 'off' });
	}

	/** Plays a live event now, or keeps it until the engine has loaded. */
	#send(event: LiveEvent): void {
		if (this.#engine && this.#context) this.#play(this.#engine, this.#context, event);
		else this.#pending.push({ at: this.#clock.now(), event });
	}

	#play(engine: Engine, context: AudioContext, event: LiveEvent): void {
		const time = context.currentTime;
		if (event.kind === 'off') {
			engine.noteOff(event.track, event.key, time);
			return;
		}
		const settings = this.#simulator.sim.state.tracks[event.track];
		if (!settings) return;
		engine.noteOn({
			track: event.track,
			settings,
			note: event.note,
			velocity: VELOCITY,
			time,
			key: event.key
		});
	}

	/** The engine arrived: play what was pressed meanwhile, unless it would come in late. */
	#flush(): void {
		const engine = this.#engine;
		const context = this.#context;
		const pending = this.#pending;
		this.#pending = [];
		if (!engine || !context) return;
		const now = this.#clock.now();
		for (const { at, event } of pending) {
			if (event.kind === 'on' && now - at > PENDING_MS) continue;
			this.#play(engine, context, event);
		}
	}

	#bend(value: number): void {
		const engine = this.#engine;
		const context = this.#context;
		if (!engine || !context) return;
		const track = this.#simulator.sim.state.track;
		// the pad bends the track the keyboard plays; one bent before goes back
		if (this.#bendTrack !== null && this.#bendTrack !== track) {
			engine.bend(this.#bendTrack, 0, context.currentTime);
		}
		engine.bend(track, value, context.currentTime);
		this.#bendTrack = value === 0 ? null : track;
	}
}

/** Typed context for the app's {@link AppSound}: `setAppSound` in the root layout. */
export const [getAppSound, setAppSound] = createContext<AppSound>();
