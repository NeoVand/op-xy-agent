/**
 * The app's copy of the samples a project names (`device-samples.ts`): read from the OP-XY when a
 * project is loaded from it over USB (`ProjectTransfer`), kept on this computer, and put back
 * whenever the project's files change without the device: a reload, an undo, a `.xy` opened from
 * disk, a project loaded from the replica's projects folder. One task runs at a time, so audio put
 * back from the copy never lands after (and over) newer audio read from the device.
 *
 * Create once (root layout, after the sound) and `start()` in onMount.
 */
import { createContext, untrack } from 'svelte';
import type { MtpSession } from '$lib/core/mtp';
import type { SimState } from '$lib/sim/params';
import {
	heldSamples,
	readDeviceSamples,
	restoreCachedSamples,
	sampleStatus,
	type SampleCache,
	type SampleReport,
	type SampleSink
} from './device-samples';

/** Options for {@link DeviceSamples}. */
export interface DeviceSamplesOptions {
	/** The replica's simulator: its sample area says which files the project holds. */
	readonly sim: { readonly state: SimState };
	/** Where decoded audio goes (the app sound's registry). */
	readonly samples: SampleSink;
	/** Where read files are kept (none: nothing outlives the page). */
	readonly cache?: SampleCache | null;
}

/** The samples of the replica's project that come from the OP-XY. */
export class DeviceSamples {
	readonly #sim: { readonly state: SimState };
	readonly #sink: SampleSink;
	readonly #cache: SampleCache | null;
	/** Paths looked up in the copy already this visit (bookkeeping, nothing draws it). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #tried = new Set<string>();
	#queue: Promise<unknown> = Promise.resolve();

	constructor(options: DeviceSamplesOptions) {
		this.#sim = options.sim;
		this.#sink = options.samples;
		this.#cache = options.cache ?? null;
	}

	/**
	 * Reads the drive samples the replica's project holds over an open MTP session (lists and reads
	 * only), hands their audio to the sound and keeps them. `progress` hears files done of the total.
	 */
	read(
		session: Pick<MtpSession, 'list' | 'read'>,
		storage: number,
		progress?: (done: number, total: number) => void
	): Promise<SampleReport> {
		return this.#serial(() =>
			readDeviceSamples({
				session,
				storage,
				area: this.#sim.state.areas.sample,
				sink: this.#sink,
				cache: this.#cache,
				progress
			})
		);
	}

	/** Puts kept audio back for the project's drive samples that have none. Returns how many. */
	restore(): Promise<number> {
		const cache = this.#cache;
		if (!cache) return Promise.resolve(0);
		return this.#serial(() =>
			restoreCachedSamples({
				area: this.#sim.state.areas.sample,
				sink: this.#sink,
				cache,
				tried: this.#tried
			})
		);
	}

	/** Which of the project's samples play the unit's audio, which are TE's, which have none. */
	status(): SampleReport {
		return sampleStatus(this.#sim.state.areas.sample, this.#sink);
	}

	/** Puts kept audio back whenever the project's drive samples change. Returns `stop`. */
	start(): () => void {
		return $effect.root(() => {
			$effect(() => {
				const paths = heldSamples(this.#sim.state.areas.sample).map((h) => h.path);
				if (paths.length > 0) untrack(() => void this.restore());
			});
		});
	}

	#serial<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#queue.then(task, task);
		this.#queue = run.catch(() => {});
		return run;
	}
}

/** Typed context for the app's {@link DeviceSamples}: `setDeviceSamples` in the root layout. */
export const [getDeviceSamples, setDeviceSamples] = createContext<DeviceSamples>();
