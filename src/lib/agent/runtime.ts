/**
 * The agent's browser entry point, loaded lazily by the agent panel (one chunk with the SDK, the
 * tools, the manual index and the conductor), so the home page does not pay for it until a key is
 * present.
 */
import type { AppSimulator } from '$lib/app/simulator.svelte';
import type { DeviceStack } from '$lib/device';
import type { ReplicaState } from '$lib/replica';
import { describeFrame } from '$lib/sim/screen/render';
import { createAnthropicClient } from './client';
import { Conductor, type PreferenceStore } from './conductor.svelte';
import { loadManualSource } from './manual-source';
import { createIdbThreadStore } from './threads';
import type { ScreenReader } from './tools';

/** What the panel hands over. */
export interface BrowserConductorOptions {
	/** The Anthropic key from the key store; used only by the SDK client for api.anthropic.com. */
	readonly apiKey: string;
	readonly device: DeviceStack | null;
	readonly replica: ReplicaState | null;
	/** The replica's virtual OP-XY, so the agent can read its screen (read_screen). */
	readonly simulator?: AppSimulator | null;
}

/** read_screen's view of the simulator: the page in words plus where the interface stands. */
function screenReader(simulator: AppSimulator): ScreenReader {
	return {
		read() {
			const s = simulator.sim.state;
			const frame = simulator.frame;
			const modulePage = s.overlay === null && s.mode !== 'arrange' ? s.pages[s.mode] : null;
			return {
				page: frame.page,
				shows: describeFrame(frame),
				mode: s.mode,
				overlay: s.overlay,
				modulePage,
				track: s.track + 1,
				engine: s.tracks[s.track].engine,
				shift: s.shift,
				bpm: s.tempo.bpm,
				playing: s.transport.playing
			};
		}
	};
}

/** Preferences in localStorage (last thread, chosen model), ignoring blocked storage. */
function browserPreferences(): PreferenceStore {
	const storage = (): Storage | null => {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			return null;
		}
	};
	return {
		get(key) {
			try {
				return storage()?.getItem(key) ?? null;
			} catch {
				return null;
			}
		},
		set(key, value) {
			try {
				if (value === null) storage()?.removeItem(key);
				else storage()?.setItem(key, value);
			} catch {
				// Blocked storage: preferences last for this page only.
			}
		}
	};
}

/** Builds the conductor for the app (restores the last conversation from IndexedDB). */
export async function createBrowserConductor(options: BrowserConductorOptions): Promise<Conductor> {
	const client = createAnthropicClient({ apiKey: options.apiKey });
	const manual = await loadManualSource();
	return Conductor.create({
		client,
		device: options.device,
		replica: options.replica,
		screen: options.simulator ? screenReader(options.simulator) : null,
		manual,
		store: createIdbThreadStore(),
		preferences: browserPreferences()
	});
}
