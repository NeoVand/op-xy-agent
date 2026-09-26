/**
 * Browser capabilities the app shell needs before any device is involved: whether Web MIDI exists.
 * Detecting support reads `navigator` and never requests MIDI access, so it cannot prompt or touch a
 * device. Connection state comes from the device layer's session (see src/routes/+layout.svelte).
 */
import { createContext } from 'svelte';

/** Connection state shown in the status bar. */
export type MidiState = 'idle' | 'connecting' | 'connected' | 'live' | 'error';

/** Whether the browser exposes Web MIDI; `unknown` until checked in the browser. */
export type WebMidiSupport = 'unknown' | 'available' | 'unavailable';

/** Reactive shell status. Create one in the root layout and share it with {@link setShellStatus}. */
export class ShellStatus {
	webMidi: WebMidiSupport = $state('unknown');

	/** Check Web MIDI support. Call in the browser (onMount); pass a navigator stub in tests. */
	detect(nav: Navigator = navigator): void {
		this.webMidi = 'requestMIDIAccess' in nav ? 'available' : 'unavailable';
	}
}

/** Typed context for the shell status. */
export const [getShellStatus, setShellStatus] = createContext<ShellStatus>();
