import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { ReplicaState } from '$lib/replica';
import { sampleFile } from '$lib/sim/areas/sample/state';
import { currentPattern } from '$lib/sim/sequencer';
import type { NoteRequest } from '$lib/sound/engine';
import { createFakeRig } from '../../../test/fakes/rig';
import { AppSimulator, type FrameClock } from './simulator.svelte';
import { AppSound, SOUND_STORAGE_KEY, type SoundRuntime } from './sound.svelte';

/** An AudioContext that starts suspended and changes state when asked. */
class FakeContext extends EventTarget {
	state: AudioContextState = 'suspended';
	currentTime = 0;
	resumes = 0;
	async resume() {
		this.resumes++;
		this.#set('running');
	}
	async suspend() {
		this.#set('suspended');
	}
	async close() {
		this.#set('closed');
	}
	#set(state: AudioContextState) {
		this.state = state;
		this.dispatchEvent(new Event('statechange'));
	}
}

/** Records what the app asks of the engine. */
class FakeEngine {
	readonly calls: string[] = [];
	/** Each note's start time, in order. */
	readonly starts: number[] = [];
	readonly sink = { note() {}, click() {}, stop() {} };
	quietAt = 0;
	noteOn(r: NoteRequest) {
		this.calls.push(`on ${r.track} ${r.note} ${r.settings.engine} ${r.key}`);
		this.starts.push(r.time);
	}
	noteOff(track: number, key: string) {
		this.calls.push(`off ${track} ${key}`);
	}
	bend(track: number, value: number) {
		this.calls.push(`bend ${track} ${value}`);
	}
	silence() {
		this.calls.push('silence');
	}
	sync() {}
	dispose() {}
	level() {
		return 0.5;
	}
}

class FakeScheduler {
	ticks = 0;
	tick() {
		this.ticks++;
	}
	reset() {}
}

function setup(options: { connect?: boolean; stored?: string; slowLoad?: boolean } = {}) {
	const rig = createFakeRig();
	const replica = new ReplicaState({ timers: rig.time });
	const frames: FrameClock = {
		request: (callback) => rig.time.setTimeout(() => callback(rig.time.now()), 16),
		cancel: (handle) => rig.time.clearTimeout(handle),
		now: () => rig.time.now()
	};
	const simulator = new AppSimulator({ replica, stack: rig.stack, frames });
	const store = new Map<string, string>(
		options.stored ? [[SOUND_STORAGE_KEY, options.stored]] : []
	);
	const storage = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value)
	};
	const contexts: FakeContext[] = [];
	const engines: FakeEngine[] = [];
	const schedulers: FakeScheduler[] = [];
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => (release = resolve));
	let loads = 0;
	const runtime = {
		SoundEngine: class extends FakeEngine {
			constructor() {
				super();
				engines.push(this);
			}
		},
		Scheduler: class extends FakeScheduler {
			constructor() {
				super();
				schedulers.push(this);
			}
		},
		TICK_MS: 25,
		LOOKAHEAD: 0.1
	} as unknown as SoundRuntime;
	const gestures = new EventTarget();
	const sound = new AppSound({
		simulator,
		replica,
		stack: rig.stack,
		storage: () => storage,
		createContext: () => {
			const context = new FakeContext();
			contexts.push(context);
			return context as unknown as AudioContext;
		},
		load: async () => {
			loads++;
			if (options.slowLoad) await gate;
			return runtime;
		},
		timers: rig.time,
		clock: rig.time,
		gestures: () => gestures,
		hidden: () => false
	});
	const stops = [simulator.start(), sound.start()];
	const press = (id: Parameters<ReplicaState['press']>[0]) => {
		replica.press(id, 'pointer');
		flushSync();
	};
	const release_ = (id: Parameters<ReplicaState['press']>[0]) => {
		replica.release(id, 'pointer');
		flushSync();
	};
	/** Lets promises (context state, the engine's chunk) settle. */
	const settle = async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve();
		await rig.time.advance(1);
		flushSync();
	};
	return {
		rig,
		replica,
		simulator,
		sound,
		store,
		contexts,
		engines,
		schedulers,
		gestures,
		press,
		release: release_,
		settle,
		finishLoading: () => release(),
		loads: () => loads,
		stop: () => stops.forEach((stop) => stop())
	};
}

describe('AppSound: the replica sounds while simulated', () => {
	it('waits for a gesture before making an audio context, then loads the engine', async () => {
		const { gestures, contexts, engines, settle, sound } = setup();
		expect(sound.enabled).toBe(true);
		await settle();
		expect(contexts).toHaveLength(0);
		gestures.dispatchEvent(new Event('pointerdown'));
		await settle();
		expect(contexts).toHaveLength(1);
		expect(contexts[0].state).toBe('running');
		expect(engines).toHaveLength(1);
		expect(sound.running).toBe(true);
	});

	it("plays the active track's engine on keyboard keys: on at press, off at release", async () => {
		const { press, release, engines, settle } = setup();
		press('keyboard.c4');
		await settle();
		release('keyboard.c4');
		// a new project opens on T1, a drum track
		expect(engines[0].calls).toEqual(['on 0 60 drum keyboard.c4', 'off 0 keyboard.c4']);
		press('track.3');
		press('keyboard.a3');
		release('keyboard.a3');
		expect(engines[0].calls.slice(2)).toEqual(['on 2 57 prism keyboard.a3', 'off 2 keyboard.a3']);
	});

	it('still plays a key pressed while the engine was loading', async () => {
		const { press, engines, settle, finishLoading } = setup({ slowLoad: true });
		press('keyboard.e4');
		await settle();
		expect(engines).toHaveLength(0);
		finishLoading();
		await settle();
		expect(engines[0].calls).toEqual(['on 0 64 drum keyboard.e4']);
	});

	it('leaves keys alone that shift or bar turn into functions', async () => {
		const { replica, press, engines, settle } = setup();
		press('keyboard.c4');
		await settle();
		replica.press('key.shift', 'pointer');
		press('keyboard.d4');
		replica.release('key.shift', 'pointer');
		expect(engines[0].calls.filter((c) => c.startsWith('on'))).toEqual([
			'on 0 60 drum keyboard.c4'
		]);
	});

	it('ticks the scheduler and lends the audio clock to the playhead while it plays', async () => {
		const { press, schedulers, simulator, settle, rig } = setup();
		press('keyboard.c4');
		await settle();
		expect(simulator.playheadClock).not.toBeNull();
		const before = schedulers[0].ticks;
		press('key.play');
		// the press itself schedules at once, then the loop every 25 ms
		expect(schedulers[0].ticks).toBe(before + 1);
		await rig.time.advance(100);
		expect(schedulers[0].ticks).toBeGreaterThanOrEqual(before + 4);
		expect(simulator.sim.state.transport.playing).toBe(true);
	});

	it('lights the replica level meter with the output', async () => {
		const { press, replica, settle, rig } = setup();
		press('keyboard.c4');
		await settle();
		await rig.time.advance(50);
		// a 0.5 peak is −6 dBFS: seven eighths of the way up a 48 dB meter
		expect(replica.meter).toBeCloseTo(11 / 13, 2);
	});

	it('switches off at once, remembers it, and gives the playhead back to the page clock', async () => {
		const { press, sound, engines, simulator, store, settle } = setup();
		press('keyboard.c4');
		await settle();
		sound.toggle();
		flushSync();
		expect(sound.enabled).toBe(false);
		expect(engines[0].calls.at(-1)).toBe('silence');
		expect(simulator.playheadClock).toBeNull();
		expect(store.get(SOUND_STORAGE_KEY)).toBe('off');
		press('keyboard.d4');
		expect(engines[0].calls.filter((c) => c.startsWith('on'))).toHaveLength(1);
	});

	it("plays in the keyboard's octave, and leaves the keys to an auxiliary track", async () => {
		const { press, release, engines, settle } = setup();
		press('track.3');
		release('track.3');
		press('key.plus');
		release('key.plus');
		press('keyboard.a3');
		await settle();
		release('keyboard.a3');
		expect(engines[0].calls).toEqual(['on 2 69 prism keyboard.a3', 'off 2 keyboard.a3']);
		press('key.auxiliary');
		release('key.auxiliary');
		press('keyboard.c4');
		release('keyboard.c4');
		expect(engines[0].calls).toHaveLength(2);
	});

	it('plays through the hold player: the last notes played sound on until the next', async () => {
		const { press, release, engines, settle, simulator } = setup();
		press('track.3');
		release('track.3');
		const player = currentPattern(simulator.sim.state.tracks[2].sequence).player;
		player.type = 'hold';
		player.on = true;
		press('keyboard.c4');
		await settle();
		press('keyboard.e4');
		release('keyboard.c4');
		release('keyboard.e4');
		expect(engines[0].calls).toEqual(['on 2 60 prism player:60', 'on 2 64 prism player:64']);
		// a new note with nothing held starts a new set
		press('keyboard.g4');
		release('keyboard.g4');
		expect(engines[0].calls.slice(2)).toEqual([
			'off 2 player:60',
			'off 2 player:64',
			'on 2 67 prism player:67'
		]);
		// stop lets go of what it kept
		press('key.stop');
		expect(engines[0].calls.at(-1)).toBe('off 2 player:67');
	});

	it("plays maestro's chord from any key, strummed by its roll", async () => {
		const { press, release, engines, settle, simulator } = setup();
		press('track.3');
		release('track.3');
		const player = currentPattern(simulator.sim.state.tracks[2].sequence).player;
		player.type = 'maestro';
		player.on = true;
		player.maestro.chord = [60, 64, 67];
		player.maestro.roll = 99;
		press('keyboard.d4');
		await settle();
		expect(engines[0].calls).toEqual([
			'on 2 62 prism player:62',
			'on 2 66 prism player:66',
			'on 2 69 prism player:69'
		]);
		// roll 99: a quarter of a sixteenth apart (120 bpm)
		expect(engines[0].starts[1] - engines[0].starts[0]).toBeCloseTo(0.03125);
		expect(engines[0].starts[2] - engines[0].starts[0]).toBeCloseTo(0.0625);
		release('keyboard.d4');
		expect(engines[0].calls.slice(3).sort()).toEqual([
			'off 2 player:62',
			'off 2 player:66',
			'off 2 player:69'
		]);
	});

	it('hands the arpeggio to the scheduler while the transport plays', async () => {
		const { press, release, engines, schedulers, settle, simulator } = setup();
		press('track.3');
		release('track.3');
		currentPattern(simulator.sim.state.tracks[2].sequence).player.on = true;
		// stopped, it sounds the notes it would run over (as its LEDs show)
		press('keyboard.c4');
		await settle();
		expect(engines[0].calls).toEqual(['on 2 60 prism player:60']);
		press('key.play');
		expect(engines[0].calls.at(-1)).toBe('off 2 player:60');
		const ticks = schedulers[0].ticks;
		press('keyboard.e4');
		release('keyboard.e4');
		expect(schedulers[0].ticks).toBe(ticks + 1);
		expect(engines[0].calls).toHaveLength(2);
	});

	it("draws a sample file's measured waveform once its audio arrives, wherever it appears", () => {
		const { sound, simulator } = setup();
		const area = simulator.sim.state.areas.sample;
		const audio = {
			sampleRate: 1000,
			channels: [Float32Array.from({ length: 500 }, (_, i) => (i % 2 ? 0.5 : -0.25))]
		};
		const kick = area.tracks[0].keys[0]!;
		expect(kick.peaks).toBeNull();
		sound.samples.setFile(kick.id, audio);
		expect(kick.peaks?.channels[0][0]).toBe(0.5);
		expect(kick.seconds).toBe(0.5);
		// a file loaded after its audio arrived gets its picture too
		sound.samples.setFile('user/take 9.wav', audio);
		area.tracks[0].keys[1] = sampleFile('take 9.wav', 'user', 3);
		flushSync();
		expect(area.tracks[0].keys[1]?.peaks).not.toBeNull();
		expect(area.tracks[0].keys[1]?.seconds).toBe(0.5);
	});

	it('starts switched off when that was the last choice', async () => {
		const { sound, press, contexts, settle } = setup({ stored: 'off' });
		expect(sound.enabled).toBe(false);
		press('keyboard.c4');
		await settle();
		expect(contexts).toHaveLength(0);
	});
});

describe('AppSound: a connected OP-XY makes the sound', () => {
	it('stays silent while a device is connected, unless sound on this computer is switched on', async () => {
		const { rig, sound, press, release, engines, settle, store } = setup();
		await rig.connect();
		flushSync();
		expect(sound.connected).toBe(true);
		expect(sound.enabled).toBe(false);
		press('keyboard.c4');
		release('keyboard.c4');
		await settle();
		expect(engines).toHaveLength(0);
		sound.toggle();
		flushSync();
		expect(sound.enabled).toBe(true);
		press('keyboard.g4');
		await settle();
		expect(engines[0].calls).toEqual(['on 0 67 drum keyboard.g4']);
		// the choice while connected is for this visit only; the simulated one is untouched
		expect(store.has(SOUND_STORAGE_KEY)).toBe(false);
	});

	it('goes quiet when a device connects while it plays', async () => {
		const { rig, sound, press, engines, settle } = setup();
		press('keyboard.c4');
		await settle();
		await rig.connect();
		flushSync();
		expect(sound.enabled).toBe(false);
		expect(engines[0].calls.at(-1)).toBe('silence');
	});
});
