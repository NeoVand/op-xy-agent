/**
 * A fake Web MIDI implementation: a host (the browser + OS MIDI layer) that grants or denies access,
 * owns ports, and fires `statechange` when ports come, go, open or close. It follows the Web MIDI
 * spec where the device layer depends on it:
 *
 * - `open()` on a connected port → `open`; on a disconnected one → `pending`. A device that
 *   disconnects while open leaves the port `pending`, and it becomes `open` again when the device
 *   returns (Chrome keeps disconnected ports in its maps with `state: 'disconnected'`).
 * - Adding a `midimessage` listener does not open a port; only open ports deliver.
 * - `send()` throws `InvalidStateError` on a disconnected port, `TypeError` for bytes that are not
 *   complete MIDI messages, and `InvalidAccessError` for SysEx without SysEx permission. Timestamps
 *   in the future delay delivery; omitted or past ones mean "now".
 *
 * Used by the unit tests now and by e2e tests later (no Node-only imports).
 */
import type {
	AccessEnvironment,
	Clock,
	MidiAccessLike,
	MidiAccessRequest,
	MidiConnectionEventLike,
	MidiInputLike,
	MidiMessageListener,
	MidiOutputLike,
	MidiPortConnection,
	MidiPortLike,
	MidiPortState,
	MidiStateChangeListener,
	PermissionStateLike,
	Timers
} from '$lib/device/types';

/** Identity of a fake port. */
export interface FakePortInit {
	readonly id: string;
	readonly name: string;
	readonly manufacturer?: string;
	readonly version?: string;
}

/** Shared behaviour of fake inputs and outputs. */
abstract class FakeMidiPort implements MidiPortLike {
	readonly id: string;
	readonly name: string;
	readonly manufacturer: string;
	readonly version: string;
	abstract readonly type: 'input' | 'output';
	state: MidiPortState = 'disconnected';
	connection: MidiPortConnection = 'closed';
	/** Calls to `open()` / `close()`, for assertions. */
	openCalls = 0;
	closeCalls = 0;
	/** When set, the next `open()` rejects with a DOMException of this name. */
	failOpenWith: string | null = null;
	/** Set by the host when the port is registered. */
	host: FakeMidiHost | null = null;

	constructor(init: FakePortInit) {
		this.id = init.id;
		this.name = init.name;
		this.manufacturer = init.manufacturer ?? 'teenage engineering';
		this.version = init.version ?? '1.0';
	}

	async open(): Promise<this> {
		this.openCalls++;
		if (this.failOpenWith !== null) {
			const name = this.failOpenWith;
			this.failOpenWith = null;
			throw new DOMException('the port is in use by another application', name);
		}
		this.setConnection(this.state === 'connected' ? 'open' : 'pending');
		return this;
	}

	async close(): Promise<this> {
		this.closeCalls++;
		this.setConnection('closed');
		return this;
	}

	/** Changes `connection`, firing `statechange` when it actually changed. */
	setConnection(connection: MidiPortConnection): void {
		if (this.connection === connection) return;
		this.connection = connection;
		this.host?.fireStateChange(this);
	}

	/** Host side: the device behind the port appeared or vanished. */
	setDeviceState(state: MidiPortState): void {
		if (this.state === state) return;
		this.state = state;
		if (state === 'disconnected' && this.connection === 'open') this.connection = 'pending';
		if (state === 'connected' && this.connection === 'pending') this.connection = 'open';
		this.host?.fireStateChange(this);
	}
}

/** A fake input port. The device side calls `deliver`. */
export class FakeMidiInput extends FakeMidiPort implements MidiInputLike {
	readonly type = 'input' as const;
	#listeners: MidiMessageListener[] = [];

	addEventListener(type: 'midimessage', listener: MidiMessageListener): void {
		if (type === 'midimessage' && !this.#listeners.includes(listener)) {
			this.#listeners = [...this.#listeners, listener];
		}
	}

	removeEventListener(type: 'midimessage', listener: MidiMessageListener): void {
		if (type === 'midimessage') this.#listeners = this.#listeners.filter((l) => l !== listener);
	}

	/** Listeners attached. */
	get listenerCount(): number {
		return this.#listeners.length;
	}

	/**
	 * Device side: one message arrives. Only a connected, open port delivers (returns false
	 * otherwise).
	 */
	deliver(bytes: ArrayLike<number>, timeStamp: number): boolean {
		if (this.state !== 'connected' || this.connection !== 'open') return false;
		const event = { data: Uint8Array.from(bytes), timeStamp };
		for (const listener of this.#listeners) listener(event);
		return true;
	}
}

/** One call to `FakeMidiOutput.send`. */
export interface FakeSend {
	readonly bytes: Uint8Array;
	/** The timestamp passed to `send`, if any. */
	readonly timestamp: number | undefined;
	/** When `send` was called. */
	readonly calledAt: number;
}

/** A fake output port. The device side sets `onDeliver`. */
export class FakeMidiOutput extends FakeMidiPort implements MidiOutputLike {
	readonly type = 'output' as const;
	/** Every accepted `send`, in order. */
	readonly sent: FakeSend[] = [];
	/** Device side: called with each message at its delivery time. */
	onDeliver: ((bytes: Uint8Array) => void) | null = null;

	send(data: ArrayLike<number>, timestamp?: number): void {
		const host = this.host;
		if (!host) throw new Error(`fake output ${this.id} is not registered with a host`);
		if (this.state !== 'connected') {
			throw new DOMException(`${this.name} is disconnected`, 'InvalidStateError');
		}
		const bytes = Uint8Array.from(data);
		const sysex = validateMidi(data);
		if (sysex && !host.sysexEnabled) {
			throw new DOMException('SysEx needs SysEx permission', 'InvalidAccessError');
		}
		// Sending on a closed port opens it implicitly (Web MIDI spec).
		if (this.connection === 'closed') this.setConnection('open');
		const now = host.clock.now();
		this.sent.push({ bytes, timestamp, calledAt: now });
		const delay = timestamp === undefined ? 0 : Math.max(0, timestamp - now);
		host.timers.setTimeout(() => {
			if (this.state === 'connected') this.onDeliver?.(bytes);
		}, delay);
	}
}

/**
 * Throws `TypeError` unless `data` is a sequence of complete MIDI messages (no running status, data
 * bytes 0–127, SysEx terminated). Returns whether it contains SysEx.
 */
function validateMidi(data: ArrayLike<number>): boolean {
	let sysex = false;
	let i = 0;
	while (i < data.length) {
		const status = data[i];
		if (!Number.isInteger(status) || status < 0x80 || status > 0xff) {
			throw new TypeError(`byte ${i} (${String(status)}) is not a status byte`);
		}
		if (status === 0xf0) {
			sysex = true;
			let j = i + 1;
			while (j < data.length && data[j] < 0x80) j++;
			if (data[j] !== 0xf7) throw new TypeError('unterminated SysEx');
			i = j + 1;
			continue;
		}
		const length = messageLength(status);
		if (length === 0) throw new TypeError(`undefined status byte ${status.toString(16)}`);
		for (let k = 1; k < length; k++) {
			const value = data[i + k];
			if (value === undefined || !Number.isInteger(value) || value < 0 || value > 0x7f) {
				throw new TypeError(`incomplete message at byte ${i}`);
			}
		}
		i += length;
	}
	return sysex;
}

function messageLength(status: number): number {
	if (status < 0xf0) {
		const kind = status & 0xf0;
		return kind === 0xc0 || kind === 0xd0 ? 2 : 3;
	}
	switch (status) {
		case 0xf1:
		case 0xf3:
			return 2;
		case 0xf2:
			return 3;
		case 0xf6:
		case 0xf8:
		case 0xfa:
		case 0xfb:
		case 0xfc:
		case 0xfe:
		case 0xff:
			return 1;
		default:
			return 0;
	}
}

/** Granted access. Its port maps are live views of the host's. */
export class FakeMidiAccess implements MidiAccessLike {
	readonly sysexEnabled: boolean;
	readonly #host: FakeMidiHost;
	#listeners: MidiStateChangeListener[] = [];

	constructor(host: FakeMidiHost, sysexEnabled: boolean) {
		this.#host = host;
		this.sysexEnabled = sysexEnabled;
	}

	get inputs(): ReadonlyMap<string, FakeMidiInput> {
		return this.#host.inputs;
	}

	get outputs(): ReadonlyMap<string, FakeMidiOutput> {
		return this.#host.outputs;
	}

	addEventListener(type: 'statechange', listener: MidiStateChangeListener): void {
		if (type === 'statechange' && !this.#listeners.includes(listener)) {
			this.#listeners = [...this.#listeners, listener];
		}
	}

	removeEventListener(type: 'statechange', listener: MidiStateChangeListener): void {
		if (type === 'statechange') this.#listeners = this.#listeners.filter((l) => l !== listener);
	}

	/** `statechange` listeners attached. */
	get listenerCount(): number {
		return this.#listeners.length;
	}

	/** Host side: fires `statechange`. */
	dispatch(event: MidiConnectionEventLike): void {
		for (const listener of this.#listeners) listener(event);
	}
}

/** Options for `FakeMidiHost`. */
export interface FakeMidiHostOptions {
	readonly clock: Clock;
	readonly timers: Timers;
}

/** The browser + OS MIDI layer. */
export class FakeMidiHost {
	readonly clock: Clock;
	readonly timers: Timers;
	readonly inputs = new Map<string, FakeMidiInput>();
	readonly outputs = new Map<string, FakeMidiOutput>();
	/** Every `requestMIDIAccess` call's options. */
	readonly requests: MidiAccessRequest[] = [];
	/** When set, `requestMIDIAccess` rejects with a DOMException of this name. */
	denyWith: string | null = null;
	/** Whether a SysEx request is granted SysEx (false: MIDI only). */
	grantSysex = true;
	/** Whether the current grant includes SysEx. */
	sysexEnabled = false;
	/** What the Permissions API reports. */
	permission: PermissionStateLike | null = 'prompt';
	/** Whether the browser has Web MIDI at all. */
	supported = true;
	secureContext = true;
	userAgent = 'Mozilla/5.0 (FakeOS) FakeBrowser/1.0';
	/** Remove disconnected ports from the maps instead of keeping them as `disconnected`. */
	removeOnDisconnect = false;
	readonly #accesses: FakeMidiAccess[] = [];

	constructor(options: FakeMidiHostOptions) {
		this.clock = options.clock;
		this.timers = options.timers;
	}

	/** `navigator.requestMIDIAccess`. */
	readonly request = async (options: MidiAccessRequest): Promise<FakeMidiAccess> => {
		this.requests.push({ ...options });
		await Promise.resolve();
		if (this.denyWith !== null) {
			if (this.denyWith === 'NotAllowedError') this.permission = 'denied';
			throw new DOMException('MIDI access denied', this.denyWith);
		}
		this.sysexEnabled = options.sysex && this.grantSysex;
		this.permission = 'granted';
		const access = new FakeMidiAccess(this, this.sysexEnabled);
		this.#accesses.push(access);
		return access;
	};

	/** The environment the access controller resolves in `init()`. */
	environment(): AccessEnvironment {
		return {
			requestMIDIAccess: this.supported ? this.request : null,
			secureContext: this.secureContext,
			userAgent: this.userAgent,
			queryPermission: async () => this.permission
		};
	}

	/** Access objects handed out so far. */
	get accesses(): readonly FakeMidiAccess[] {
		return this.#accesses;
	}

	/** Registers ports and connects them (a device was plugged in). */
	plug(...ports: Array<FakeMidiInput | FakeMidiOutput>): void {
		for (const port of ports) {
			port.host = this;
			if (port.type === 'input') this.inputs.set(port.id, port);
			else this.outputs.set(port.id, port);
			port.setDeviceState('connected');
		}
	}

	/** Disconnects ports (a device was unplugged or left MIDI mode). */
	unplug(...ports: Array<FakeMidiInput | FakeMidiOutput>): void {
		for (const port of ports) {
			port.setDeviceState('disconnected');
			if (this.removeOnDisconnect) {
				if (port.type === 'input') this.inputs.delete(port.id);
				else this.outputs.delete(port.id);
				this.fireStateChange(port);
			}
		}
	}

	/** Fires `statechange` on every access. */
	fireStateChange(port: MidiPortLike): void {
		for (const access of this.#accesses) access.dispatch({ port });
	}
}
