/**
 * The browser surface the device layer depends on, as small structural interfaces.
 *
 * Everything in `src/lib/device` receives these through its constructor, so the whole layer runs in
 * Node against fakes (`test/fakes/`) and nothing touches `navigator`, `performance` or timers at
 * import time. The DOM's own `MIDIAccess`, `MIDIInput` and `MIDIOutput` satisfy the Web MIDI
 * interfaces below as they are, without casts: only the members we use are listed, and events go
 * through `addEventListener` (the `on…` handler properties carry `this` types that would not fit).
 */

/** Whether a port receives from the device (`input`) or sends to it (`output`). */
export type MidiPortType = 'input' | 'output';

/** Whether the hardware behind a port is present. */
export type MidiPortState = 'connected' | 'disconnected';

/**
 * Whether the page holds the port open. `pending` means "opened, but the device is currently
 * unplugged": the browser reopens it by itself when the device returns.
 */
export type MidiPortConnection = 'open' | 'closed' | 'pending';

/** One MIDI port (`MIDIPort`). */
export interface MidiPortLike {
	readonly id: string;
	readonly name: string | null;
	readonly manufacturer: string | null;
	readonly version: string | null;
	readonly type: MidiPortType;
	readonly state: MidiPortState;
	readonly connection: MidiPortConnection;
	/** Opens the port explicitly (adding a listener does not). */
	open(): Promise<unknown>;
	/** Closes the port; another application may then use it. */
	close(): Promise<unknown>;
}

/** A `midimessage` event: one complete MIDI message. */
export interface MidiMessageEventLike {
	readonly data: Uint8Array | null;
	/** `performance.now()` domain; 0 when the browser did not stamp it. */
	readonly timeStamp: number;
}

/** Listener for `midimessage`. */
export type MidiMessageListener = (event: MidiMessageEventLike) => void;

/** An input port (`MIDIInput`). */
export interface MidiInputLike extends MidiPortLike {
	addEventListener(type: 'midimessage', listener: MidiMessageListener): void;
	removeEventListener(type: 'midimessage', listener: MidiMessageListener): void;
}

/**
 * An output port (`MIDIOutput`). **Only `device/transport.ts` may call `send`**: it is the single
 * choke point where every outgoing byte is validated and checked against the safety policy.
 */
export interface MidiOutputLike extends MidiPortLike {
	/** `timestamp` is in the `performance.now()` domain; omitted or past means "now". */
	send(data: ArrayLike<number>, timestamp?: number): void;
}

/** A `statechange` event: a port appeared, disappeared, opened or closed. */
export interface MidiConnectionEventLike {
	readonly port: MidiPortLike | null;
}

/** Listener for `statechange`. */
export type MidiStateChangeListener = (event: MidiConnectionEventLike) => void;

/** Granted Web MIDI access (`MIDIAccess`). */
export interface MidiAccessLike {
	readonly inputs: ReadonlyMap<string, MidiInputLike>;
	readonly outputs: ReadonlyMap<string, MidiOutputLike>;
	/** True when the user granted SysEx, which TE's protocol (identity, GREET, FILE) needs. */
	readonly sysexEnabled: boolean;
	addEventListener(type: 'statechange', listener: MidiStateChangeListener): void;
	removeEventListener(type: 'statechange', listener: MidiStateChangeListener): void;
}

/** Options for `navigator.requestMIDIAccess`. */
export interface MidiAccessRequest {
	readonly sysex: boolean;
	readonly software?: boolean;
}

/** `navigator.requestMIDIAccess`, bound. */
export type RequestMidiAccess = (options: MidiAccessRequest) => Promise<MidiAccessLike>;

/** Milliseconds in the `performance.now()` domain, the clock Web MIDI timestamps use. */
export interface Clock {
	now(): number;
}

/** `setTimeout` / `clearTimeout`. The same shape as core/te's `TeScheduler`. */
export interface Timers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** `requestAnimationFrame` / `cancelAnimationFrame`, for batching UI updates. */
export interface FrameScheduler {
	request(callback: (time: number) => void): unknown;
	cancel(handle: unknown): void;
}

/** A page lifecycle event (`pagehide` / `pageshow`). */
export interface PageTransitionLike {
	/** True when the page goes into (or comes back from) the back/forward cache. */
	readonly persisted: boolean;
}

/** Where `pagehide` / `pageshow` fire: `window` in the browser. */
export interface LifecycleTarget {
	addEventListener(
		type: 'pagehide' | 'pageshow',
		listener: (event: PageTransitionLike) => void
	): void;
	removeEventListener(
		type: 'pagehide' | 'pageshow',
		listener: (event: PageTransitionLike) => void
	): void;
}

/** A permission's state as the Permissions API reports it. */
export type PermissionStateLike = 'granted' | 'denied' | 'prompt';

/** Everything the access layer needs from the browser, resolved when `init()` runs. */
export interface AccessEnvironment {
	/** `navigator.requestMIDIAccess`, or null when the browser has no Web MIDI. */
	readonly requestMIDIAccess: RequestMidiAccess | null;
	/** `window.isSecureContext`: Web MIDI needs https or localhost. */
	readonly secureContext: boolean;
	/** `navigator.userAgent`, used only to recognise known browser bugs. */
	readonly userAgent: string;
	/** Reads the MIDI permission state without prompting; null when the browser cannot tell. */
	readonly queryPermission: (sysex: boolean) => Promise<PermissionStateLike | null>;
}

/** Who asked for a message to be sent. Incoming messages are `device`. */
export type SendSource = 'user' | 'replica' | 'agent' | 'system';
