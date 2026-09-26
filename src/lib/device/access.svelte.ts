// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/access.svelte.ts

/**
 * Web MIDI access for one OP-XY, as reactive state: permission (including SysEx), finding the
 * device's input/output pair, opening and closing it explicitly, and following hot-plug.
 *
 * ## Status machine
 * `unsupported` (no Web MIDI, or not a secure page) · `idle` · `requesting` · `granted` · `denied`
 * (the user or a setting refused) · `error` (the system MIDI layer failed). The UI renders from
 * `status` plus `problem`, which always carries guidance a person can act on.
 *
 * ## Rules kept from MIDI Lab, and gaps it had that are closed here
 * - Nothing happens on construction or import. `init()` (call it in `onMount`) only detects support
 *   and reads the permission state; it never prompts. MIDI is requested only by `request()`, from a
 *   user action, because current Chromium prompts for any MIDI access.
 * - SysEx is requested explicitly (TE's identity, GREET and FILE need it) and a partial grant, MIDI
 *   without SysEx, is reported as its own problem rather than silently degrading.
 * - Nothing is auto-opened ("how MIDI loops are born"). `openPair()` opens the OP-XY explicitly;
 *   only after that does the controller remember to reopen it when the device comes back.
 * - Ports are closed explicitly, and on `pagehide`, so other applications can use them. MIDI Lab
 *   only ever nulled `onmidimessage`, which leaves the port open.
 * - Hot-plug is followed through `statechange`. The OP-XY vanishing (unplugged, or switched to MTP
 *   mode, which removes its MIDI interface) is a disconnect with an explanation, never an error.
 *
 * Only `device/transport.ts` sends. This class hands it the open output through `output` and hands
 * incoming messages to whoever subscribes with `onMessage` (the transport, via the device stack).
 */
import { Emitter } from './emitter';
import {
	accessProblem,
	CHROME_152_MAC_HINT,
	errorName,
	findOpxyPair,
	isChromium152OnMac,
	isOpxyPortName,
	NO_DEVICE_HINT,
	portInfo,
	problemFromError,
	type AccessProblem,
	type PortInfo,
	type PortPair
} from './ports';
import type {
	AccessEnvironment,
	LifecycleTarget,
	MidiAccessLike,
	MidiConnectionEventLike,
	MidiInputLike,
	MidiMessageEventLike,
	MidiOutputLike,
	PageTransitionLike,
	PermissionStateLike
} from './types';

/** Where access stands. */
export type AccessStatus = 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

/** The OP-XY's port pair, as snapshots. */
export interface PairInfo {
	readonly input: PortInfo;
	readonly output: PortInfo;
}

/** The OP-XY appeared or disappeared. */
export interface PairChange {
	readonly kind: 'connected' | 'disconnected';
	readonly pair: PairInfo | null;
}

/** Constructor options. */
export interface MidiAccessControllerOptions {
	/** Resolves the browser environment. Called by `init()`, never by the constructor. */
	readonly environment: () => AccessEnvironment;
	/** Which port names count as the OP-XY (default: `isOpxyPortName`). */
	readonly matchName?: (name: string | null) => boolean;
}

/** Reactive Web MIDI access and OP-XY port pairing. */
export class MidiAccessController {
	/** Where access stands. */
	status: AccessStatus = $state('idle');
	/** The last problem, with guidance; null when all is well. */
	problem: AccessProblem | null = $state(null);
	/** Whether the granted access includes SysEx. */
	sysex = $state(false);
	/** The MIDI (SysEx) permission as the browser reports it, read without prompting. */
	permission: PermissionStateLike | 'unknown' = $state('unknown');
	/** Every input port the browser lists. */
	inputs: PortInfo[] = $state([]);
	/** Every output port the browser lists. */
	outputs: PortInfo[] = $state([]);
	/** The connected OP-XY, or null. */
	pair: PairInfo | null = $state(null);
	/** True while the pair is open (explicitly, by `openPair`). */
	opened = $state(false);
	/** Extra guidance when no device is found (e.g. the Chrome 152 bug). */
	hints: string[] = $state([]);

	#options: MidiAccessControllerOptions;
	#env: AccessEnvironment | null = null;
	#access: MidiAccessLike | null = null;
	#requesting: Promise<boolean> | null = null;
	#pairPorts: PortPair | null = null;
	#listenInput: MidiInputLike | null = null;
	#openOutput: MidiOutputLike | null = null;
	/** The user opened the pair and has not closed it: reopen it when the device returns. */
	#wantOpen = false;
	#messages = new Emitter<[data: Uint8Array, timeStamp: number]>();
	#pairChanges = new Emitter<[change: PairChange]>();

	constructor(options: MidiAccessControllerOptions) {
		this.#options = options;
	}

	/**
	 * Detects support and reads the permission state, without prompting and without touching any
	 * device. Idempotent. Call it in the browser (`onMount`); `request()` calls it too.
	 */
	init(): void {
		if (this.#env) return;
		const env = this.#options.environment();
		this.#env = env;
		if (!env.secureContext) {
			this.#setUnsupported(accessProblem('insecure-context'));
		} else if (!env.requestMIDIAccess) {
			this.#setUnsupported(accessProblem('unsupported-browser'));
		} else {
			void this.#readPermission();
		}
	}

	/** True when this browser can do Web MIDI at all (after `init`). */
	get supported(): boolean {
		return this.status !== 'unsupported';
	}

	/**
	 * Asks the browser for MIDI access (SysEx included by default). Call from a user action: the
	 * browser may show a permission prompt. Resolves true when access was granted (possibly without
	 * SysEx; see `sysex` and `problem`). Concurrent calls share one request.
	 */
	request(options: { readonly sysex?: boolean } = {}): Promise<boolean> {
		this.init();
		if (this.#requesting) return this.#requesting;
		const env = this.#env;
		if (!env?.requestMIDIAccess || this.status === 'unsupported') return Promise.resolve(false);
		const requestAccess = env.requestMIDIAccess;
		const sysex = options.sysex ?? true;
		this.status = 'requesting';
		this.problem = null;
		this.#requesting = (async () => {
			try {
				const access = await requestAccess({ sysex });
				this.#attach(access);
				this.sysex = access.sysexEnabled;
				this.status = 'granted';
				if (sysex && !access.sysexEnabled) this.problem = accessProblem('sysex-denied');
				void this.#readPermission();
				return true;
			} catch (error) {
				const problem = problemFromError(error);
				this.problem = problem;
				this.status = problem.code === 'permission-denied' ? 'denied' : 'error';
				void this.#readPermission();
				return false;
			} finally {
				this.#requesting = null;
			}
		})();
		return this.#requesting;
	}

	/**
	 * Opens the OP-XY's input and output explicitly and starts delivering its messages to
	 * `onMessage` listeners. Resolves false when there is no device or a port would not open.
	 * Idempotent; after it the pair is reopened automatically when the device returns.
	 */
	async openPair(): Promise<boolean> {
		const pair = this.#pairPorts;
		if (!pair) return false;
		this.#wantOpen = true;
		this.#listenTo(pair.input);
		this.#openOutput = pair.output;
		try {
			await Promise.all([pair.input.open(), pair.output.open()]);
		} catch (error) {
			this.problem = { ...accessProblem('open-failed'), errorName: errorName(error) };
			this.opened = false;
			return false;
		}
		// The device may have vanished, or the pair been closed, while the ports were opening.
		if (this.#pairPorts !== pair || !this.#wantOpen) return false;
		this.opened = true;
		if (this.problem?.code === 'open-failed') this.problem = null;
		this.refresh();
		return true;
	}

	/** Stops listening and closes the pair, so other applications can use it. Idempotent. */
	async closePair(): Promise<void> {
		this.#wantOpen = false;
		await this.#releasePorts();
	}

	/** Closes the pair and lets go of MIDI access entirely (status back to `idle`). */
	async close(): Promise<void> {
		await this.closePair();
		this.#detach();
		this.#pairPorts = null;
		this.pair = null;
		this.inputs = [];
		this.outputs = [];
		this.sysex = false;
		if (this.status !== 'unsupported') this.status = 'idle';
	}

	/**
	 * Closes the ports on `pagehide` and reopens them on `pageshow` from the back/forward cache, if
	 * they were open. Returns the function that stops listening.
	 */
	bindLifecycle(target: LifecycleTarget): () => void {
		const onHide = () => {
			void this.#releasePorts();
		};
		const onShow = (event: PageTransitionLike) => {
			if (event.persisted && this.#wantOpen) void this.openPair();
		};
		target.addEventListener('pagehide', onHide);
		target.addEventListener('pageshow', onShow);
		return () => {
			target.removeEventListener('pagehide', onHide);
			target.removeEventListener('pageshow', onShow);
		};
	}

	/** Subscribes to messages from the open OP-XY input. Returns the unsubscribe function. */
	onMessage(listener: (data: Uint8Array, timeStamp: number) => void): () => void {
		return this.#messages.on(listener);
	}

	/** Subscribes to the OP-XY appearing and disappearing. Returns the unsubscribe function. */
	onPairChange(listener: (change: PairChange) => void): () => void {
		return this.#pairChanges.on(listener);
	}

	/**
	 * The open OP-XY output, or null when not open or not present. For `device/transport.ts` only:
	 * nothing else may send.
	 */
	get output(): MidiOutputLike | null {
		const output = this.#openOutput;
		return this.opened && output !== null && output.state === 'connected' ? output : null;
	}

	/** The OP-XY input's id and name, for labelling incoming events. */
	get inputPort(): { readonly id: string; readonly name: string } | null {
		const input = this.#listenInput;
		return input ? { id: input.id, name: input.name ?? input.id } : null;
	}

	/** Whether the current access can send SysEx. */
	get sysexEnabled(): boolean {
		return this.#access?.sysexEnabled ?? false;
	}

	/** Re-reads the port lists and the OP-XY pair (runs on every `statechange`). */
	refresh(): void {
		const access = this.#access;
		if (!access) return;
		this.inputs = [...access.inputs.values()].map(portInfo);
		this.outputs = [...access.outputs.values()].map(portInfo);
		const previous = this.#pairPorts;
		const found = findOpxyPair(
			access.inputs.values(),
			access.outputs.values(),
			this.#options.matchName ?? isOpxyPortName
		);
		const replaced =
			previous !== null &&
			found !== null &&
			(previous.input !== found.input || previous.output !== found.output);
		// Keep the same pair object while the ports are the same, so identity checks stay meaningful.
		const next = found !== null && previous !== null && !replaced ? previous : found;
		this.#pairPorts = next;
		this.pair = next ? { input: portInfo(next.input), output: portInfo(next.output) } : null;
		this.hints = next ? [] : this.#noDeviceHints();
		if (previous !== null && (next === null || replaced)) {
			// Unplugged or switched to MTP. An open port goes to `pending` and the browser reopens it
			// if the same device returns; we keep the intent to reopen and report a disconnect.
			this.opened = false;
			this.#pairChanges.emit({ kind: 'disconnected', pair: null });
		}
		if (next !== null && (previous === null || replaced)) {
			if (this.#wantOpen) void this.openPair();
			this.#pairChanges.emit({ kind: 'connected', pair: this.pair });
		}
	}

	#setUnsupported(problem: AccessProblem): void {
		this.status = 'unsupported';
		this.problem = problem;
	}

	async #readPermission(): Promise<void> {
		const env = this.#env;
		if (!env) return;
		try {
			this.permission = (await env.queryPermission(true)) ?? 'unknown';
		} catch {
			this.permission = 'unknown';
		}
	}

	#attach(access: MidiAccessLike): void {
		if (this.#access === access) return;
		this.#detach();
		this.#access = access;
		access.addEventListener('statechange', this.#onStateChange);
		this.refresh();
	}

	#detach(): void {
		this.#access?.removeEventListener('statechange', this.#onStateChange);
		this.#access = null;
	}

	#onStateChange = (event: MidiConnectionEventLike): void => {
		void event;
		this.refresh();
	};

	#onMidiMessage = (event: MidiMessageEventLike): void => {
		const data = event.data;
		if (!data || data.length === 0) return;
		this.#messages.emit(data, event.timeStamp);
	};

	/** Moves the message listener to `input` (the pair may come back as new port objects). */
	#listenTo(input: MidiInputLike): void {
		if (this.#listenInput === input) return;
		this.#listenInput?.removeEventListener('midimessage', this.#onMidiMessage);
		input.addEventListener('midimessage', this.#onMidiMessage);
		this.#listenInput = input;
	}

	async #releasePorts(): Promise<void> {
		const input = this.#listenInput;
		const output = this.#openOutput;
		input?.removeEventListener('midimessage', this.#onMidiMessage);
		this.#listenInput = null;
		this.#openOutput = null;
		this.opened = false;
		// Closing a port that is already gone can reject; there is nothing left to release then.
		await Promise.all([input?.close().catch(() => {}), output?.close().catch(() => {})]);
	}

	#noDeviceHints(): string[] {
		if (this.status !== 'granted' && this.status !== 'requesting') return [];
		const ua = this.#env?.userAgent ?? '';
		return isChromium152OnMac(ua) ? [NO_DEVICE_HINT, CHROME_152_MAC_HINT] : [NO_DEVICE_HINT];
	}
}
