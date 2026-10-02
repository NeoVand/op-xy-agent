/**
 * The replica's sound when no OP-XY makes it: Web Audio synthesis (`$lib/sound`) played from the
 * app's simulator. Keyboard keys on the replica play the active track's engine at once (a drum track
 * its kit sound), in the keyboard's octave, or through the track's player when it is on (hold,
 * maestro, arpeggio); while the simulator's transport runs, the lookahead scheduler plays every
 * track's pattern, the arpeggio and the metronome.
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
import type { EngineId } from '$lib/core/opxy';
import {
	browserClock,
	browserTimers,
	type Clock,
	type DeviceStack,
	type Timers
} from '$lib/device';
import type { ReplicaEvent, ReplicaState } from '$lib/replica';
import { METER_SEGMENTS } from '$lib/replica/geometry';
import { guardCurve, volumeGain } from '$lib/sound/volume';
import { attachPeaks, samplesInUse } from '$lib/sim/areas/sample/hook';
import { peaksFromChannels } from '$lib/sim/areas/sample/wave';
import {
	KEYBOARD_BASE,
	activeTrack,
	keyNote,
	keyboardIndex,
	octaveKey,
	seq
} from '$lib/sim/areas/sequencer/model';
import { playerNotes, playerOf } from '$lib/sim/areas/sequencer/players';
import { maestroEvents } from '$lib/sim/sequencer-playback';
import { heldTriggers } from '$lib/sound/punch/held';
import { SampleRegistry, sampleChannels, sampleSeconds } from '$lib/sound/samples';
import type { AppSimulator } from './simulator.svelte';

/** Where the choice made while simulated is remembered ("on" / "off"). */
export const SOUND_STORAGE_KEY = 'opxy:sound';
/** Where the choice between the rebuilt synth engines and the first ones is kept. */
export const ENGINES_STORAGE_KEY = 'opxy:engines';
/** No engines for the synth core: the first engines play everything. */
const NO_ENGINES: ReadonlySet<EngineId> = new Set();

/** The engine's chunk, loaded on first use. */
export type SoundRuntime = typeof import('$lib/sound/runtime');
type Engine = InstanceType<SoundRuntime['SoundEngine']>;
type Scheduler = InstanceType<SoundRuntime['Scheduler']>;
type SynthHost = NonNullable<Awaited<ReturnType<SoundRuntime['SynthHost']['create']>>>;

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
/** A peak (0–1) as a meter's height: its decibels between the floor and 0 dBFS. */
function meterLevel(peak: number): number {
	const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
	return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
}

/** Each track's meter moves in steps this fine (a change of step re-renders it). */
const TRACK_METER_STEPS = 8;
const SILENT_TRACKS: readonly number[] = Array.from({ length: 8 }, () => 0);

/** A keyboard key (or a player's note) going down or up, on the track it plays. */
interface LiveEvent {
	readonly kind: 'on' | 'off';
	readonly key: string;
	readonly track: number;
	readonly note: number;
	/** Seconds after it is played: the later notes of a maestro strum, a preview's end. */
	readonly delay?: number;
	/** 1–127 (default: the keyboard's). */
	readonly velocity?: number;
}

/** Options for {@link AppSound}. */
export interface AppSoundOptions {
	readonly simulator: AppSimulator;
	readonly replica: ReplicaState;
	/** The app's device stack (a ready session means the OP-XY makes the sound); null for none. */
	readonly stack: DeviceStack | null;
	/** The audio of the simulator's sample files (default a new, empty registry). */
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
	/**
	 * The audio of the simulator's sample files, by file id: whatever captures or decodes audio
	 * hands it over here (`samples.setFile(file.id, buffer)`), and every key or zone holding that
	 * file plays it, its measured waveform on the sampler pages.
	 */
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
	/** The rebuilt synth engines (remembered; off plays the first, Web Audio ones), once loaded. */
	#newEngines = $state(true);
	#synthReady = $state(false);
	#synth: SynthHost | null = null;
	#coreEngines: ReadonlySet<EngineId> = NO_ENGINES;

	#context: AudioContext | null = null;
	/** Everything the engine plays on its way out, where listening taps it (`listenTap`). */
	#master: GainNode | null = null;
	/** The replica's volume pot, after the listening tap, and the guard after it. */
	#volume: GainNode | null = null;
	#guard: AudioNode[] = [];
	#loading: Promise<SoundRuntime | null> | null = null;
	#engine: Engine | null = null;
	#scheduler: Scheduler | null = null;
	#tickMs = 25;
	#timer: unknown = null;
	#suspendTimer: unknown = null;
	/** Numbers the agent's preview notes (their keys). */
	#previews = 0;
	/** Keyboard keys sounding and the track each plays on (bookkeeping, never rendered). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #live = new Map<string, LiveEvent>();
	/** Notes a player sounds: their track and audio start time (bookkeeping, never rendered). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #playerLive = new Map<number, { track: number; start: number }>();
	/** Keys pressed before the engine had loaded. */
	#pending: { at: number; event: LiveEvent }[] = [];
	#bendTrack: number | null = null;
	#meter = 0;
	#lit = 0;
	/** Each instrument track's level, 0–1 in steps (its meter), while this computer plays. */
	#trackLevels = $state.raw<readonly number[]>(SILENT_TRACKS);
	/** The levels unstepped, falling away as the master meter does. */
	#trackPeaks: number[] = [...SILENT_TRACKS];
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

	/**
	 * Whether the rebuilt synth engines play (the synth core, per sample in a worklet), or the first
	 * Web Audio ones; remembered. Notes already sounding finish as they started.
	 */
	get newEngines(): boolean {
		return this.#newEngines;
	}

	set newEngines(on: boolean) {
		this.#newEngines = on;
		try {
			this.#storage()?.setItem(ENGINES_STORAGE_KEY, on ? 'new' : 'first');
		} catch {
			// private mode or blocked storage: the choice holds for this visit
		}
		this.#applyEngines();
	}

	/** True once the rebuilt engines can play (their worklet has loaded). */
	get synthReady(): boolean {
		return this.#synthReady;
	}

	/** True while audio runs: from the first gesture until silence suspends it. */
	get running(): boolean {
		return this.#running;
	}

	/** False when this browser cannot make sound (no Web Audio, or the engine failed to load). */
	get available(): boolean {
		return !this.#unavailable;
	}

	/**
	 * How loud each instrument track plays here, after its fader, 0–1 in eighths (a meter each;
	 * all 0 while this computer makes no sound).
	 */
	get trackLevels(): readonly number[] {
		return this.#trackLevels;
	}

	/**
	 * Sounds one note on instrument track `track` (0–7) for `seconds`: the agent's previews on the
	 * virtual OP-XY. Plays as soon as the engine is ready; false when sound is off or unavailable, or
	 * the connected OP-XY makes the sound.
	 */
	preview(track: number, note: number, velocity: number, seconds: number): boolean {
		if (!this.enabled || !this.available || track < 0 || track > 7) return false;
		const key = `preview.${this.#previews++}`;
		this.#unlock();
		this.#send({ kind: 'on', key, track, note, velocity });
		this.#send({ kind: 'off', key, track, note, delay: Math.max(0.02, seconds) });
		return true;
	}

	/** Cuts every sound at once, release tails and previews too (the agent's panic on the replica). */
	silence(): void {
		this.#engine?.silence();
		this.#live.clear();
		this.#playerLive.clear();
		this.#pending = [];
	}

	/**
	 * What the replica plays, for the agent's listening (`$lib/device/listen`): the audio context
	 * and the node the whole sound passes through on its way out. Wakes the audio as a gesture
	 * would; null while this computer makes no sound (off, unavailable, or the connected OP-XY
	 * plays), and until the engine has loaded.
	 */
	listenTap(): { readonly context: AudioContext; readonly output: AudioNode } | null {
		if (!this.enabled || !this.available) return null;
		this.#unlock();
		return this.#context && this.#master ? { context: this.#context, output: this.#master } : null;
	}

	/** Starts listening. Idempotent; returns `stop`. */
	start(): () => void {
		if (this.#stop) return this.#stop;
		this.#simulated = this.#recall();
		// the rebuilt engines always play now: a choice of the first ones stored by an older version
		// is not read (they remain the fallback when the synth core cannot start)
		const stops: (() => void)[] = [
			this.#replica.observe((event) => this.#onReplica(event)),
			this.samples.onChange((id) => this.#measure(id))
		];
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
					// the volume pot: eased, so a turn never clicks
					const position = this.#replica.volume;
					untrack(() => {
						const node = this.#volume;
						const context = this.#context;
						if (!node || !context) return;
						node.gain.cancelScheduledValues(context.currentTime);
						node.gain.setTargetAtTime(volumeGain(position), context.currentTime, 0.02);
					});
				});
				$effect(() => {
					// the transport started without a key (the agent, a device): wake the sound up
					if (this.enabled && this.#simulator.sim.state.transport.playing) {
						untrack(() => this.#unlock());
					}
				});
				$effect(() => {
					// a file loaded after its audio arrived (a kit, a copy) gets its measured picture too
					const files = samplesInUse(this.#simulator.sim.state.areas.sample);
					untrack(() => {
						for (const file of files)
							if (!file.peaks && this.samples.file(file.id)) this.#measure(file.id);
					});
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

	/**
	 * A sample file's audio arrived: the simulator's sampler pages draw its measured peaks and know
	 * its true length (the sample area's hook), wherever the file appears.
	 */
	#measure(id: string): void {
		const source = this.samples.file(id);
		if (!source) return;
		const peaks = peaksFromChannels(sampleChannels(source), source.sampleRate);
		attachPeaks(this.#simulator.sim.state.areas.sample, id, peaks, sampleSeconds(source));
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
		this.#playerLive.clear();
		this.#pending = [];
		this.#bendTrack = null;
		this.#follow();
		this.#showMeter(0);
		this.#trackPeaks = [...SILENT_TRACKS];
		this.#showTracks(SILENT_TRACKS);
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
		const master = context.createGain();
		// the volume pot comes after the tap the listening tools read, as the device's USB audio comes
		// before its analog pot; a guard (the signal halved into a ±2 curve) keeps a turned-up pot from
		// clipping
		const volume = context.createGain();
		volume.gain.value = volumeGain(this.#replica.volume);
		const scale = context.createGain();
		scale.gain.value = 0.5;
		const guard = context.createWaveShaper();
		guard.curve = guardCurve();
		guard.oversample = '2x';
		master.connect(volume).connect(scale).connect(guard).connect(context.destination);
		this.#master = master;
		this.#volume = volume;
		this.#guard = [scale, guard];
		const engine = new runtime.SoundEngine({ context, samples: this.samples, destination: master });
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
		void this.#loadSynth(runtime, context, engine);
		void this.#loadPunch(runtime, context, engine);
	}

	/** Loads the punch-in processor's worklet; until then only the effects on notes are heard. */
	async #loadPunch(runtime: SoundRuntime, context: AudioContext, engine: Engine): Promise<void> {
		// a runtime without it (the tests' fakes) goes without
		if (!runtime.PunchHost) return;
		const host = await runtime.PunchHost.create(context, runtime.punchWorklet);
		if (!host) return;
		if (this.#engine !== engine) {
			host.dispose();
			return;
		}
		engine.usePunch(host);
	}

	/** The punch-in keys held now (aux T2, or shift + keys) reach the engine. */
	#punchKeys(): void {
		const context = this.#context;
		if (this.#engine && context) {
			this.#engine.punch(heldTriggers(this.#simulator.sim.state), context.currentTime);
		}
	}

	/**
	 * Loads the synth core's worklet and hands it the engines it plays; until it is ready (or where
	 * the browser has no AudioWorklet) the Web Audio voices play them.
	 */
	async #loadSynth(runtime: SoundRuntime, context: AudioContext, engine: Engine): Promise<void> {
		// a runtime without the core (the tests' fakes) keeps the Web Audio voices
		if (!runtime.SynthHost) return;
		const host = await runtime.SynthHost.create(context, runtime.synthWorklet);
		if (!host) return;
		if (this.#engine !== engine) {
			host.dispose();
			return;
		}
		this.#synth = host;
		this.#coreEngines = runtime.CORE_ENGINES;
		this.#synthReady = true;
		this.#applyEngines();
	}

	/** Hands the engine the synth core's engines, or none (the first engines play everything). */
	#applyEngines(): void {
		if (!this.#synth || !this.#engine) return;
		this.#engine.useSynth(this.#synth, this.#newEngines ? this.#coreEngines : NO_ENGINES);
	}

	#close(): void {
		this.#stopLoop();
		this.#clearSuspend();
		this.#engine?.dispose();
		this.#engine = null;
		this.#master?.disconnect();
		this.#master = null;
		this.#volume?.disconnect();
		this.#volume = null;
		for (const node of this.#guard) node.disconnect();
		this.#guard = [];
		this.#synth = null;
		this.#synthReady = false;
		this.#scheduler = null;
		this.#live.clear();
		this.#playerLive.clear();
		this.#pending = [];
		this.#showMeter(0);
		this.#trackPeaks = [...SILENT_TRACKS];
		this.#showTracks(SILENT_TRACKS);
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
		this.#punchKeys();
		scheduler.tick(this.#hidden() ? HIDDEN_LOOKAHEAD : undefined);
		// a running arpeggio moves on with the transport
		if (this.#playerLive.size > 0 || playerOf(state).on) this.#followPlayer();
		this.#meterTick(engine);
		if (!state.transport.playing && context.currentTime > engine.quietAt + IDLE_SECONDS) {
			// long silent: rest the audio thread until the next gesture or note
			this.#showMeter(0);
			this.#trackPeaks = [...SILENT_TRACKS];
			this.#showTracks(SILENT_TRACKS);
			void context.suspend().catch(() => {});
			return;
		}
		this.#timer = this.#timers.setTimeout(this.#tick, this.#tickMs);
	};

	#meterTick(engine: Engine): void {
		this.#showMeter(Math.max(meterLevel(engine.level()), this.#meter - METER_FALL));
		const levels = engine.trackLevels();
		this.#trackPeaks = this.#trackPeaks.map((was, t) =>
			Math.max(meterLevel(levels[t] ?? 0), was - METER_FALL)
		);
		this.#showTracks(this.#trackPeaks);
	}

	/** Each track's meter, touched only when one of them moves a step. */
	#showTracks(peaks: readonly number[]): void {
		const stepped = peaks.map((p) => Math.round(p * TRACK_METER_STEPS) / TRACK_METER_STEPS);
		if (stepped.every((v, t) => v === this.#trackLevels[t])) return;
		this.#trackLevels = stepped;
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
		// a punch-in effect starts or ends with its key (or shift) at once, not at the next tick
		if (event.type === 'press' || event.type === 'release') this.#punchKeys();
		switch (event.type) {
			case 'press':
				if (event.id.startsWith('keyboard.')) {
					this.#unlock();
					if (playerOf(this.#simulator.sim.state).on) this.#playerKey(event.id);
					else this.#noteOn(event.id);
				} else if (event.id === 'key.play' || event.id === 'key.stop') {
					// the simulator has moved its transport already: schedule from it now, not next tick
					this.#unlock();
					this.#scheduler?.tick();
					this.#followPlayer();
				} else if (event.id === 'key.player') this.#followPlayer();
				return;
			case 'release':
				if (event.id.startsWith('keyboard.')) {
					this.#noteOff(event.id);
					this.#followPlayer();
				}
				return;
			case 'bend':
				this.#bend(event.value);
				return;
		}
	}

	/** A keyboard key while the player is on: what the player sounds follows at once. */
	#playerKey(id: string): void {
		const { state } = this.#simulator.sim;
		const index = keyboardIndex(id.slice('keyboard.'.length));
		this.#followPlayer(index >= 0 ? keyNote(state, index) : undefined);
		// the arpeggio takes the key on the audio clock: no waiting for the next tick
		if (state.transport.playing) this.#scheduler?.tick();
	}

	/**
	 * While the pattern's player is on (manual: players/*), the keyboard sounds what the simulator
	 * says it sounds (`playerNotes`, which its LEDs show): hold keeps the last notes played, maestro
	 * plays its chord from any key (strummed by its roll when `pressed` just went down), and the
	 * arpeggio, stopped, plays the notes it would run over. While the transport plays, the scheduler
	 * runs the arpeggio on the audio clock. Notes that joined start, notes that left stop.
	 */
	#followPlayer(pressed?: number): void {
		const { state } = this.#simulator.sim;
		const player = playerOf(state);
		const track = activeTrack(state) ? state.track : null;
		const scheduled = player.type === 'arpeggio' && state.transport.playing;
		const want = player.on && track !== null && !scheduled ? (playerNotes(state) ?? []) : [];
		const now = this.#context?.currentTime ?? 0;
		for (const [note, live] of this.#playerLive) {
			if (want.includes(note)) continue;
			this.#playerLive.delete(note);
			// a strummed note let go before it came in still starts, then fades from its release
			const delay = Math.max(0, live.start - now);
			this.#send({ kind: 'off', key: `player:${note}`, track: live.track, note, delay });
		}
		// shift or bar held: the keys are functions (maestro takes its chord), nothing new sounds
		if (track === null || state.held.includes('key.shift') || state.held.includes('key.bar')) {
			return;
		}
		const strum = pressed !== undefined && player.type === 'maestro' ? this.#strum(pressed) : [];
		for (const note of want) {
			if (this.#playerLive.has(note) || note < 0 || note > 127) continue;
			const delay = strum.find((e) => e.note === note)?.time ?? 0;
			this.#playerLive.set(note, { track, start: now + delay });
			this.#send({ kind: 'on', key: `player:${note}`, track, note, delay });
		}
	}

	/** When each note of maestro's chord on `key` comes in (s): its strum order and roll. */
	#strum(key: number): { note: number; time: number }[] {
		const { state } = this.#simulator.sim;
		const { maestro } = playerOf(state);
		// the simulator has counted this press already
		const hit = Math.max(0, seq(state).hits - 1);
		const sixteenth = 15 / state.tempo.bpm;
		return maestroEvents(maestro.chord, key, maestro, hit).map((e) => ({
			note: e.note,
			time: e.time * sixteenth
		}));
	}

	#noteOn(key: string): void {
		const { state } = this.#simulator.sim;
		// with shift or bar held the keys are functions (octave, track scale…), not notes; on an
		// auxiliary track they are not this engine's either
		if (state.held.includes('key.shift') || state.held.includes('key.bar')) return;
		const index = keyboardIndex(key.slice('keyboard.'.length));
		if (index < 0) return;
		let note: number;
		if (activeTrack(state)) {
			// in the keyboard's octave (the − and + keys; melodic tracks only)
			note = keyNote(state, index);
		} else if (state.mode === 'auxiliary' && (state.auxTrack === 6 || state.auxTrack === 7)) {
			// the FX tracks' keyboard plays the last instrument track chosen (manual: auxiliary/fx-sends)
			const drum = state.tracks[state.track].engine === 'drum';
			const octave = seq(state).octaves[octaveKey('instrument', state.track)] ?? 0;
			note = KEYBOARD_BASE + index + (drum ? 0 : 12 * octave);
		} else return;
		const event: LiveEvent = { kind: 'on', key, track: state.track, note };
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
		const time = context.currentTime + (event.delay ?? 0);
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
			velocity: event.velocity ?? VELOCITY,
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
