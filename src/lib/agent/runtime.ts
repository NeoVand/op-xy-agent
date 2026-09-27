/**
 * The agent's browser entry point, loaded lazily by the agent panel (one chunk with the SDK, the
 * tools, the manual index and the conductor), so the home page does not pay for it until a key is
 * present.
 */
import type { DeviceStack } from '$lib/device';
import type { ReplicaState } from '$lib/replica';
import { createAnthropicClient } from './client';
import { Conductor, type PreferenceStore } from './conductor.svelte';
import { loadManualSource } from './manual-source';
import { createIdbThreadStore } from './threads';

/** What the panel hands over. */
export interface BrowserConductorOptions {
	/** The Anthropic key from the key store; used only by the SDK client for api.anthropic.com. */
	readonly apiKey: string;
	readonly device: DeviceStack | null;
	readonly replica: ReplicaState | null;
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
		manual,
		store: createIdbThreadStore(),
		preferences: browserPreferences()
	});
}
