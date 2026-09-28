/**
 * The virtual OP-XY remembers your work across reloads, as the device does across power cycles:
 * the open project (its tracks, patterns, sounds, scenes, songs, mixer and tempo, via the system
 * area's project snapshot) and what the device keeps apart from projects (the projects folder with
 * its saved versions, the preset library, the system settings, the user tunings).
 *
 * Saves follow input: a replica event (or `markDirty()`, for changes made without one) marks the
 * state changed and a save follows a moment later; hiding the page saves at once. Nothing is saved
 * before the stored work has been put back, so a slow load never overwrites it with a blank
 * project. Loading merges what was saved onto today's defaults, so a project saved by an older
 * version of the app gains any fields added since instead of breaking, and it comes back the way
 * the device boots: no gesture half done (a held step, an armed recording, an open slicer).
 *
 * Storage is IndexedDB (a database of its own, `opxy-sim`), or memory where IndexedDB is missing.
 */
import { createContext } from 'svelte';
import type { ReplicaState } from '$lib/replica';
import { restore, snapshot } from '$lib/sim/areas/system/projects';
import type { SystemState } from '$lib/sim/areas/system/state';
import { DEFAULT_LEVEL, defaultState, type SimState } from '$lib/sim/params';

/**
 * Bumped when a save can no longer simply be merged onto the defaults; older versions that can be
 * brought up to date are ({@link upgradeV1}, {@link upgradeGrooves}).
 */
export const SAVE_VERSION = 3;

/** What is stored. */
export interface SavedSim {
	readonly version: number;
	readonly savedAt: number;
	/** The open project's name. */
	readonly name: string;
	/** The open project's content (the system area's snapshot, JSON). */
	readonly project: string;
	/** The device-wide part of the system area (JSON of {@link LIBRARY_KEYS}). */
	readonly library: string;
}

/** Where saves live. */
export interface SimStore {
	load(): Promise<SavedSim | null>;
	save(saved: SavedSim): Promise<void>;
	clear(): Promise<void>;
}

/** The system area's fields that outlive projects. */
const LIBRARY_KEYS = [
	'projects',
	'presets',
	'system',
	'tunings'
] as const satisfies readonly (keyof SystemState)[];

type Library = Pick<SystemState, (typeof LIBRARY_KEYS)[number]>;

// ───────────────────────────────────────────────────────────────────────── merging

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `saved` laid over `defaults`: objects merge key by key (keys only the defaults know are kept, so
 * new fields appear); arrays keep the saved length, each object element merged over the default at
 * its index (or the default's first element); anything else keeps the saved value when its type
 * matches the default's, else the default.
 */
export function mergeDefaults<T>(saved: unknown, defaults: T): T {
	if (Array.isArray(defaults)) {
		if (!Array.isArray(saved)) return defaults;
		return saved.map((item, i) => {
			const template = defaults[i] ?? defaults[0];
			return template === undefined ? item : mergeDefaults(item, template);
		}) as T;
	}
	if (isObject(defaults)) {
		if (!isObject(saved)) return defaults;
		const out: Record<string, unknown> = { ...saved };
		for (const [key, value] of Object.entries(defaults)) {
			out[key] = key in saved ? mergeDefaults(saved[key], value) : value;
		}
		return out as T;
	}
	if (defaults === null || defaults === undefined) return (saved ?? defaults) as T;
	return (typeof saved === typeof defaults ? saved : defaults) as T;
}

// ───────────────────────────────────────────────────────────────────────── upgrading

/** The old default mixer level (unity before a new project's own level was known). */
const V1_LEVEL = 80;

/**
 * A version 1 save predates the device's own new-project sounds: its patterns, songs, settings and
 * the owner's own presets come back, but the instrument tracks take a new project's sounds and
 * presets, levels still at the old default take the new one, and the factory presets their device
 * names. Works on the parsed JSON, in place.
 */
export function upgradeV1(project: unknown, library: unknown): void {
	const fresh = defaultState();
	const level = (mix: unknown) =>
		isObject(mix) && mix.level === V1_LEVEL ? { ...mix, level: DEFAULT_LEVEL } : mix;
	if (isObject(project)) {
		if (Array.isArray(project.tracks)) {
			project.tracks = project.tracks.map((track: unknown, k) => {
				const sound = fresh.tracks[k];
				if (!isObject(track) || !sound) return track;
				return {
					...track,
					engine: sound.engine,
					m1: sound.m1,
					amp: sound.amp,
					filterEnv: sound.filterEnv,
					playMode: sound.playMode,
					filter: sound.filter,
					sends: sound.sends,
					lfo: sound.lfo,
					parked: null,
					mix: level(track.mix)
				};
			});
		}
		if (Array.isArray(project.aux)) {
			project.aux = project.aux.map((aux: unknown) =>
				isObject(aux) ? { ...aux, mix: level(aux.mix) } : aux
			);
		}
		project.trackPresets = fresh.areas.system.trackPresets;
		project.presetSettings = fresh.areas.system.presetSettings;
	}
	if (isObject(library) && isObject(library.presets) && Array.isArray(library.presets.library)) {
		const own = library.presets.library.filter((p: unknown) => isObject(p) && p.user === true);
		library.presets.library = [...fresh.areas.system.presets.library, ...own];
	}
}

/** Where the seven grooves of versions 1–2 sit in the device's eleven (danish came in third). */
const OLD_GROOVES = [0, 1, 3, 4, 5, 6, 7];

/** A version 1–2 save's groove type, moved to the same groove in today's list. In place. */
export function upgradeGrooves(project: unknown): void {
	if (!isObject(project) || !isObject(project.tempo)) return;
	const groove = project.tempo.groove;
	if (typeof groove === 'number') project.tempo.groove = OLD_GROOVES[groove] ?? 0;
}

// ───────────────────────────────────────────────────────────────────── capture / apply

/** The state's work, ready to store. */
export function captureSim(state: SimState, now = Date.now()): SavedSim {
	const system = state.areas.system;
	const library: Partial<Library> = {};
	for (const key of LIBRARY_KEYS) (library as Record<string, unknown>)[key] = system[key];
	return {
		version: SAVE_VERSION,
		savedAt: now,
		name: state.project.name,
		project: snapshot(state),
		library: JSON.stringify(library)
	};
}

/**
 * Clears what only means something mid-gesture, so reloaded work starts idle like a booted device:
 * the sequencer's gestures, clipboards and undo; queued, armed or half-typed scenes and a playing
 * song; an open effect list; the recorder, an open slicer and the library cursor.
 */
export function settleSession(state: SimState): void {
	const fresh = defaultState().areas;
	const areas = state.areas;
	areas.sequencer = fresh.sequencer;
	Object.assign(areas.arrange, {
		view: fresh.arrange.view,
		queued: null,
		armed: false,
		entry: null,
		playing: false,
		position: 0,
		cue: null,
		clipboard: fresh.arrange.clipboard
	});
	areas.auxiliary.picker = null;
	Object.assign(areas.sample, {
		record: fresh.sample.record,
		slicer: null,
		page: fresh.sample.page,
		library: fresh.sample.library,
		clipboard: null
	});
}

/**
 * Puts saved work back into `state` (merged onto the defaults, gestures idle). Returns false,
 * changing nothing, when the save is from an incompatible version or does not parse.
 */
export function applySaved(state: SimState, saved: SavedSim): boolean {
	const { version } = saved;
	if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return false;
	let project: unknown;
	let library: unknown;
	try {
		project = JSON.parse(saved.project);
		library = JSON.parse(saved.library);
	} catch {
		return false;
	}
	if (version === 1) upgradeV1(project, library);
	if (version < 3) upgradeGrooves(project);
	const fresh = defaultState();
	const freshProject = JSON.parse(snapshot(fresh)) as Record<string, unknown>;
	restore(state, JSON.stringify(mergeDefaults(project, freshProject)), saved.name);
	settleSession(state);
	const system = state.areas.system;
	for (const key of LIBRARY_KEYS) {
		const value = isObject(library) ? library[key] : undefined;
		if (value !== undefined) {
			(system as unknown as Record<string, unknown>)[key] = mergeDefaults(
				value,
				fresh.areas.system[key]
			);
		}
	}
	return true;
}

// ───────────────────────────────────────────────────────────────────────── stores

/** Saves in memory (tests, and browsers without IndexedDB). */
export function createMemorySimStore(): SimStore {
	let saved: SavedSim | null = null;
	return {
		async load() {
			return saved;
		},
		async save(next) {
			saved = next;
		},
		async clear() {
			saved = null;
		}
	};
}

const DB_NAME = 'opxy-sim';
const STORE = 'state';
const KEY = 'current';

/** Saves in IndexedDB; memory when it is unavailable (private windows) or fails to open. */
export function createIdbSimStore(): SimStore {
	const memory = createMemorySimStore();
	type Db = import('idb').IDBPDatabase;
	let db: Promise<Db | null> | null = null;
	const open = (): Promise<Db | null> => {
		db ??= (async () => {
			if (typeof indexedDB === 'undefined') return null;
			try {
				const { openDB } = await import('idb');
				return await openDB(DB_NAME, 1, {
					upgrade(database) {
						if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
					}
				});
			} catch {
				return null;
			}
		})();
		return db;
	};
	return {
		async load() {
			const database = await open();
			if (!database) return memory.load();
			return ((await database.get(STORE, KEY)) as SavedSim | undefined) ?? null;
		},
		async save(saved) {
			const database = await open();
			if (!database) return memory.save(saved);
			await database.put(STORE, saved, KEY);
		},
		async clear() {
			const database = await open();
			if (!database) return memory.clear();
			await database.delete(STORE, KEY);
		}
	};
}

// ──────────────────────────────────────────────────────────────────────── keeping

/** Timers (the browser's, or fakes in tests). */
export interface PersistTimers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** Options for {@link SimPersistence}. */
export interface SimPersistenceOptions {
	readonly state: SimState;
	readonly replica: ReplicaState;
	readonly store: SimStore;
	readonly timers?: PersistTimers;
	/** Milliseconds after the last change before a save. */
	readonly delay?: number;
}

const BROWSER_TIMERS: PersistTimers = {
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Keeps the virtual OP-XY's work in a {@link SimStore}. Create once; `start()` after mount. */
export class SimPersistence {
	readonly #state: SimState;
	readonly #replica: ReplicaState;
	readonly #store: SimStore;
	readonly #timers: PersistTimers;
	readonly #delay: number;
	#ready = false;
	#pending: unknown = null;
	#last: string | null = null;
	#stop: (() => void) | null = null;

	constructor(options: SimPersistenceOptions) {
		this.#state = options.state;
		this.#replica = options.replica;
		this.#store = options.store;
		this.#timers = options.timers ?? BROWSER_TIMERS;
		this.#delay = options.delay ?? 1500;
	}

	/** True once the stored work has been put back (or there was none). */
	get ready(): boolean {
		return this.#ready;
	}

	/** Puts the stored work back, then saves as things change. Returns `stop`. */
	async start(): Promise<() => void> {
		if (this.#stop) return this.#stop;
		const stops: (() => void)[] = [];
		this.#stop = () => {
			for (const stop of stops) stop();
			this.#timers.clearTimeout(this.#pending);
			this.#stop = null;
		};
		try {
			const saved = await this.#store.load();
			if (saved && applySaved(this.#state, saved)) this.#last = saved.project + saved.library;
		} catch {
			// unreadable storage: start from the defaults
		}
		this.#ready = true;
		stops.push(this.#replica.observe(() => this.#changed()));
		if (typeof document !== 'undefined') {
			const onHide = () => {
				if (document.visibilityState === 'hidden') void this.flush();
			};
			const onPageHide = () => void this.flush();
			document.addEventListener('visibilitychange', onHide);
			window.addEventListener('pagehide', onPageHide);
			stops.push(() => {
				document.removeEventListener('visibilitychange', onHide);
				window.removeEventListener('pagehide', onPageHide);
			});
		}
		return this.#stop;
	}

	stop(): void {
		this.#stop?.();
	}

	/** Something changed without input (the agent programming the machine): save soon. */
	markDirty(): void {
		this.#changed();
	}

	/** Saves now when anything changed since the last save. */
	async flush(): Promise<void> {
		if (!this.#ready) return;
		this.#timers.clearTimeout(this.#pending);
		this.#pending = null;
		const saved = captureSim(this.#state);
		const key = saved.project + saved.library;
		if (key === this.#last) return;
		this.#last = key;
		try {
			await this.#store.save(saved);
		} catch {
			this.#last = null; // try again next time
		}
	}

	/** Forgets the stored work (the next change saves afresh). */
	async clear(): Promise<void> {
		this.#last = null;
		await this.#store.clear();
	}

	#changed(): void {
		if (!this.#ready) return;
		this.#timers.clearTimeout(this.#pending);
		this.#pending = this.#timers.setTimeout(() => void this.flush(), this.#delay);
	}
}

/** Typed context for the app's {@link SimPersistence}: `setSimPersistence` in the root layout. */
export const [getSimPersistence, setSimPersistence] = createContext<SimPersistence>();
