/**
 * The agent's browser entry point, loaded lazily by the agent panel (one chunk with the SDK, the
 * tools, the manual index and the conductor), so the home page does not pay for it until a key is
 * present.
 */
import type { AppSimulator } from '$lib/app/simulator.svelte';
import { createVirtualOpxy, type VirtualSound } from '$lib/app/virtual';
import type { DeviceStack } from '$lib/device';
import type { ReplicaState } from '$lib/replica';
import { describeFrame } from '$lib/sim/screen/render';
import { createAnthropicClient } from './client';
import { Conductor, type PreferenceStore } from './conductor.svelte';
import { loadManualSource } from './manual-source';
import type { ListenHost } from './listen-host';
import { createIdbThreadStore } from './threads';
import type { GuideHost, PresetInboxHost, ProjectHost, ScreenReader } from './tools';

// listening's browser side (worklet and worker included) loads with this chunk, not with the page
export { createBrowserCapture } from '$lib/device/listen/browser';

/** What the panel hands over. */
export interface BrowserConductorOptions {
	/** The Anthropic key from the key store; used only by the SDK client for api.anthropic.com. */
	readonly apiKey: string;
	readonly device: DeviceStack | null;
	readonly replica: ReplicaState | null;
	/** The replica's virtual OP-XY: its screen (read_screen), and what the agent plays and programs. */
	readonly simulator?: AppSimulator | null;
	/** Its sound in the browser (the agent's note previews with no device connected). */
	readonly sound?: VirtualSound | null;
	/** Told after every change the agent makes to the virtual OP-XY, so it is saved. */
	readonly persistence?: { markDirty(): void } | null;
	/** The replica walkthrough that plan_steps with guide starts. */
	readonly guide?: GuideHost | null;
	/** The preset maker's inbox, where make_kit leaves a kit. */
	readonly presets?: PresetInboxHost | null;
	/** The replica's project to the OP-XY over USB (send_project). */
	readonly projects?: ProjectHost | null;
	/** Listening (from `createBrowserCapture`, below): the OP-XY's USB audio or the replica's sound. */
	readonly listen?: ListenHost | null;
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
		virtual: options.simulator
			? createVirtualOpxy({
					sim: options.simulator.sim,
					sound: options.sound ?? null,
					changed: () => options.persistence?.markDirty()
				})
			: null,
		guide: options.guide ?? null,
		presets: options.presets ?? null,
		projects: options.projects ?? null,
		listen: options.listen ?? null,
		manual,
		store: createIdbThreadStore(),
		preferences: browserPreferences()
	});
}
