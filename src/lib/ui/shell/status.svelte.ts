/**
 * What the app shell displays about the device connection (status bar, stage). The device layer will
 * feed this later; for now it only knows whether the browser supports Web MIDI. Detecting support
 * reads `navigator` and never requests MIDI access, so it cannot prompt or touch a device.
 */
import { createContext } from 'svelte';

/** Connection state shown in the status bar. */
export type MidiState = 'idle' | 'connecting' | 'connected' | 'live' | 'error';

/** Whether the browser exposes Web MIDI; `unknown` until checked in the browser. */
export type WebMidiSupport = 'unknown' | 'available' | 'unavailable';

/** Reactive shell status. Create one in the root layout and share it with {@link setShellStatus}. */
export class ShellStatus {
	webMidi: WebMidiSupport = $state('unknown');
	midi: MidiState = $state('idle');
	device: string | null = $state(null);
	firmware: string | null = $state(null);
	view: 'simulated' | 'mirroring' = $state('simulated');

	/** Check Web MIDI support. Call in the browser (onMount); pass a navigator stub in tests. */
	detect(nav: Navigator = navigator): void {
		this.webMidi = 'requestMIDIAccess' in nav ? 'available' : 'unavailable';
	}
}

/** Typed context for the shell status. */
export const [getShellStatus, setShellStatus] = createContext<ShellStatus>();
