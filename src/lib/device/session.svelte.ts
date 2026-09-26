/**
 * One connection to an OP-XY, from "connect" to a known device: permission → open the port pair →
 * universal identity request → TE client → GREET → firmware profile and capabilities. Reconnects
 * when the device comes back after being unplugged or switched to MTP mode.
 *
 * Every step here is read-only (docs/research/90-device-probe.md: identity, GREET, FILE INIT/LIST
 * verified on OS 1.1.33), and every byte goes through the transport's policy. The GREET reply holds
 * the unit's serial numbers: it is redacted the moment it arrives and never stored, shown or logged.
 *
 * Timeouts: the identity request is tried a few times (TE's updater retries it too); GREET gets
 * ~2 s. A device that stays silent still ends in `ready`, with the reason in `warnings`, because
 * notes, CCs and transport work without SysEx.
 */
import type { MidiBus } from '$lib/core/midi/bus';
import { identityRequest } from '$lib/core/midi/sysex';
import {
	OPXY_SKU,
	parseTeIdentityReply,
	redactGreetInfo,
	TeClient,
	type TeFileEntry,
	type TeIdentity
} from '$lib/core/te';
import type { MidiAccessController, PairChange } from './access.svelte';
import { ExpectTimeoutError, SessionStateError } from './errors';
import { waitForEvent } from './expect';
import type { DeviceMirror } from './mirror.svelte';
import type { AccessProblem } from './ports';
import { NO_DEVICE_HINT } from './ports';
import {
	deviceInfoFromGreet,
	firmwareProfile,
	remoteKeyCapability,
	type DeviceInfo,
	type FirmwareProfile,
	type RemoteKeyCapability
} from './profile';
import type { Transport } from './transport';
import type { SendSource, Timers } from './types';

/** Where the session stands. */
export type SessionPhase =
	| 'idle'
	| 'requesting-access'
	| 'waiting-for-device'
	| 'opening'
	| 'identifying'
	| 'greeting'
	| 'ready'
	| 'disconnected'
	| 'error';

/** The outcome of one probe step. */
export type ProbeStatus = 'unknown' | 'ok' | 'no-reply' | 'failed' | 'skipped' | 'halted';

/** What the app can do with this unit, as far as the probe tells. */
export interface DeviceCapabilities {
	/** The browser granted SysEx. */
	readonly sysex: boolean;
	/** The universal identity request was answered. */
	readonly identity: ProbeStatus;
	/** TE's protocol answered GREET. */
	readonly teProtocol: ProbeStatus;
	/** FILE INIT/LIST worked (after the first listing). */
	readonly files: ProbeStatus;
	/** F8 clock arrives, so play state and tempo can be followed (COM → clock "both"). */
	readonly clockOut: 'observed' | 'not-seen';
	/** CC106/107: unsupported on OS 1.1.33. */
	readonly remoteKeys: RemoteKeyCapability;
}

/** Constructor options. */
export interface DeviceSessionOptions {
	readonly access: MidiAccessController;
	readonly transport: Transport;
	readonly bus: MidiBus;
	readonly timers: Timers;
	/** Reset when the device goes away; its clock detection feeds `capabilities.clockOut`. */
	readonly mirror?: DeviceMirror;
	/** Wait per identity attempt (default 800 ms). */
	readonly identityTimeoutMs?: number;
	/** Identity attempts (default 3). */
	readonly identityAttempts?: number;
	/** GREET timeout (default 2000 ms). */
	readonly greetTimeoutMs?: number;
	/** Timeout per FILE request (default 2000 ms). */
	readonly fileTimeoutMs?: number;
}

/** Shown when the device disappears while connected. */
export const DISCONNECTED_NOTICE =
	'The OP-XY disconnected. If you switched it to MTP mode (com → M4), its MIDI ports are gone until you leave MTP. It reconnects by itself when it comes back.';

/** A connection to one OP-XY, as reactive state. */
export class DeviceSession {
	/** Where the session stands. */
	phase: SessionPhase = $state('idle');
	/** Why the session is in `error`, with guidance. */
	problem: AccessProblem | null = $state(null);
	/** A short explanation for `waiting-for-device` and `disconnected`. */
	notice: string | null = $state(null);
	/** The universal identity reply (device id 0x21, SKU TE033AS001 on an OP-XY). */
	identity: TeIdentity | null = $state(null);
	/** Device info from GREET; never contains serial numbers. */
	info: DeviceInfo | null = $state(null);
	/** The firmware relative to OS 1.1.33, with warnings. */
	firmware: FirmwareProfile | null = $state(null);
	/** Identity probe outcome. */
	identityStatus: ProbeStatus = $state('unknown');
	/** GREET / TE protocol outcome. */
	teStatus: ProbeStatus = $state('unknown');
	/** FILE browsing outcome. */
	fileStatus: ProbeStatus = $state('unknown');
	/** Problems found while connecting, in plain language (firmware warnings are separate). */
	warnings: string[] = $state([]);

	readonly #access: MidiAccessController;
	readonly #transport: Transport;
	readonly #bus: MidiBus;
	readonly #timers: Timers;
	readonly #mirror: DeviceMirror | undefined;
	readonly #identityTimeoutMs: number;
	readonly #identityAttempts: number;
	readonly #greetTimeoutMs: number;
	readonly #fileTimeoutMs: number;
	#te: TeClient | null = null;
	#fileSessionOpen = false;
	/** The user wants to be connected (so reconnect when the device returns). */
	#wanted = false;
	/** Bumped on every (re)attach and disconnect; a probe from an older generation stops. */
	#generation = 0;
	#stops: Array<() => void> | null = null;
	/** Who TE requests are attributed to on the bus. */
	#origin: { source: SendSource; cause: string } = { source: 'system', cause: 'session' };

	constructor(options: DeviceSessionOptions) {
		this.#access = options.access;
		this.#transport = options.transport;
		this.#bus = options.bus;
		this.#timers = options.timers;
		this.#mirror = options.mirror;
		this.#identityTimeoutMs = options.identityTimeoutMs ?? 800;
		this.#identityAttempts = options.identityAttempts ?? 3;
		this.#greetTimeoutMs = options.greetTimeoutMs ?? 2000;
		this.#fileTimeoutMs = options.fileTimeoutMs ?? 2000;
	}

	/** True once the device is identified (or known to be silent) and usable. */
	get ready(): boolean {
		return this.phase === 'ready';
	}

	/** What the app can do with this unit. */
	get capabilities(): DeviceCapabilities {
		return {
			sysex: this.#access.sysex,
			identity: this.identityStatus,
			teProtocol: this.teStatus,
			files: this.fileStatus,
			clockOut: this.#mirror?.clockOut ? 'observed' : 'not-seen',
			remoteKeys: remoteKeyCapability(this.firmware?.osVersion ?? null)
		};
	}

	/** Firmware warnings followed by connection warnings. */
	get allWarnings(): string[] {
		return [...(this.firmware?.warnings ?? []), ...this.warnings];
	}

	/** Follows hot-plug and feeds incoming TE frames to the TE client. Idempotent. */
	start(): () => void {
		this.#stops ??= [
			this.#access.onPairChange((change) => this.#onPairChange(change)),
			this.#bus.subscribe((event) => {
				if (event.direction === 'in') this.#te?.handleIncoming(event.bytes);
			})
		];
		return () => this.stop();
	}

	/** Stops following hot-plug and TE traffic. */
	stop(): void {
		for (const stop of this.#stops ?? []) stop();
		this.#stops = null;
	}

	/**
	 * Connects: asks for MIDI + SysEx permission if needed (call from a user action), opens the
	 * OP-XY and probes it. Resolves when the session is `ready`, `waiting-for-device` or `error`.
	 */
	async connect(): Promise<void> {
		this.start();
		this.#wanted = true;
		this.problem = null;
		this.#access.init();
		if (this.#access.status === 'unsupported') {
			this.#fail(this.#access.problem);
			return;
		}
		if (this.#access.status !== 'granted') {
			this.phase = 'requesting-access';
			const granted = await this.#access.request({ sysex: true });
			if (!granted) {
				this.#fail(this.#access.problem);
				return;
			}
		}
		await this.#attach();
	}

	/** Closes the device's ports and forgets it (no reconnecting). */
	async disconnect(): Promise<void> {
		this.#wanted = false;
		this.#generation++;
		this.#teardown();
		await this.#access.closePair();
		this.#clearDevice();
		this.phase = 'idle';
		this.notice = null;
		this.problem = null;
	}

	/**
	 * Lists a directory on the device over TE FILE (0 = root: `drum/`, `synth/` on OS 1.1.33).
	 * Read-only: FILE INIT (no event subscription) once per connection, then FILE LIST pages.
	 */
	async listFiles(
		node = 0,
		options: { readonly source?: SendSource } = {}
	): Promise<TeFileEntry[]> {
		const te = this.#te;
		if (this.phase !== 'ready' || te === null || this.teStatus !== 'ok') {
			throw new SessionStateError('reading files needs a connected OP-XY that answered GREET');
		}
		if (this.firmware?.mode !== 'normal') {
			throw new SessionStateError('files are only read while the OP-XY runs normally');
		}
		this.#origin = { source: options.source ?? 'user', cause: 'files' };
		try {
			if (!this.#fileSessionOpen) {
				await te.fileInit({}, { timeoutMs: this.#fileTimeoutMs });
				this.#fileSessionOpen = true;
			}
			const entries = await te.fileList(node, { timeoutMs: this.#fileTimeoutMs });
			this.fileStatus = 'ok';
			return entries;
		} catch (error) {
			this.fileStatus = te.state === 'halted' ? 'halted' : 'failed';
			throw error;
		} finally {
			this.#origin = { source: 'system', cause: 'session' };
		}
	}

	#fail(problem: AccessProblem | null): void {
		this.#wanted = false;
		this.problem = problem;
		this.phase = 'error';
	}

	/** Opens the pair (if present) and probes it. */
	async #attach(): Promise<void> {
		const generation = ++this.#generation;
		if (!this.#access.pair) {
			this.phase = 'waiting-for-device';
			this.notice = NO_DEVICE_HINT;
			return;
		}
		this.phase = 'opening';
		const opened = await this.#access.openPair();
		if (generation !== this.#generation) return;
		if (!opened) {
			if (this.#access.pair) {
				this.problem = this.#access.problem;
				this.phase = 'error';
			} else {
				this.phase = 'waiting-for-device';
				this.notice = NO_DEVICE_HINT;
			}
			return;
		}
		this.notice = null;
		this.problem = null;
		await this.#probe(generation);
	}

	async #probe(generation: number): Promise<void> {
		this.#clearDevice();
		if (!this.#access.sysexEnabled) {
			this.identityStatus = 'skipped';
			this.teStatus = 'skipped';
			this.fileStatus = 'skipped';
			this.warnings.push(
				'SysEx is not allowed, so the firmware version and device info cannot be read. Notes, CCs and transport still work.'
			);
			this.firmware = firmwareProfile(null);
			this.phase = 'ready';
			return;
		}

		this.phase = 'identifying';
		const identity = await this.#identify(generation);
		if (generation !== this.#generation) return;
		if (identity === null) {
			this.identityStatus = 'no-reply';
			this.teStatus = 'skipped';
			this.fileStatus = 'skipped';
			this.warnings.push(
				'The device did not answer the MIDI identity request, so its firmware cannot be read. Check that it is an OP-XY and not busy (an update or MTP in progress).'
			);
			this.firmware = firmwareProfile(null);
			this.phase = 'ready';
			return;
		}
		this.identity = identity;
		this.identityStatus = 'ok';
		if (identity.sku !== OPXY_SKU) {
			this.warnings.push(
				`This device identifies as ${identity.sku}, not an OP-XY (${OPXY_SKU}); only the OP-XY is supported.`
			);
		}

		const te = new TeClient({
			deviceId: identity.deviceId,
			send: (bytes) => {
				this.#transport.send(bytes, { ...this.#origin });
			},
			scheduler: this.#timers,
			timeoutMs: this.#greetTimeoutMs,
			onDebug: () => this.#onDebugFrame()
		});
		this.#te = te;
		this.#fileSessionOpen = false;
		this.phase = 'greeting';
		let info: DeviceInfo | null = null;
		try {
			// The raw reply carries serial numbers: redact it at once; it is never stored or logged.
			info = deviceInfoFromGreet(
				redactGreetInfo(await te.greet({ timeoutMs: this.#greetTimeoutMs }))
			);
			this.teStatus = 'ok';
		} catch (error) {
			if (generation !== this.#generation) return;
			this.teStatus = te.state === 'halted' ? 'halted' : 'failed';
			this.warnings.push(
				`The device did not answer TE's GREET request (${error instanceof Error ? error.message : String(error)}), so its firmware version is unknown.`
			);
		}
		if (generation !== this.#generation) return;
		this.info = info;
		this.firmware = firmwareProfile(info);
		if (info?.product && info.product !== 'OP-XY') {
			this.warnings.push(`GREET reports product "${info.product}", not OP-XY.`);
		}
		this.phase = 'ready';
	}

	/** Sends the universal identity request (retrying) and waits for a TE identity reply. */
	async #identify(generation: number): Promise<TeIdentity | null> {
		for (let attempt = 0; attempt < this.#identityAttempts; attempt++) {
			const abort = new AbortController();
			// Listen before sending, so a fast reply cannot slip past.
			const reply = waitForEvent(
				this.#bus,
				(event) => event.direction === 'in' && parseTeIdentityReply(event.bytes) !== null,
				{
					timeoutMs: this.#identityTimeoutMs,
					timers: this.#timers,
					signal: abort.signal,
					description: 'identity reply'
				}
			);
			try {
				this.#transport.send(identityRequest(), { source: 'system', cause: 'session:identity' });
			} catch (error) {
				abort.abort();
				await reply.catch(() => undefined);
				// A device that vanished meanwhile is reported as a disconnect, not as a warning.
				if (generation === this.#generation) {
					this.warnings.push(
						`The identity request could not be sent (${error instanceof Error ? error.message : String(error)}).`
					);
				}
				return null;
			}
			try {
				return parseTeIdentityReply((await reply).bytes);
			} catch (error) {
				if (!(error instanceof ExpectTimeoutError)) throw error;
				if (generation !== this.#generation) return null;
			}
		}
		return null;
	}

	#onPairChange(change: PairChange): void {
		if (change.kind === 'disconnected') {
			if (!this.#wanted) return;
			this.#generation++;
			this.#teardown();
			this.phase = 'disconnected';
			this.notice = DISCONNECTED_NOTICE;
		} else if (
			this.#wanted &&
			(this.phase === 'disconnected' || this.phase === 'waiting-for-device')
		) {
			void this.#attach();
		}
	}

	#onDebugFrame(): void {
		this.teStatus = 'halted';
		this.warnings.push(
			'The OP-XY sent a firmware debug message, so all TE traffic stopped. Power-cycle the device, then connect again.'
		);
	}

	/** Drops per-connection state in the TE client, the transport and the mirror. */
	#teardown(): void {
		this.#te?.close();
		this.#te = null;
		this.#fileSessionOpen = false;
		this.#transport.reset();
		this.#mirror?.reset();
	}

	#clearDevice(): void {
		this.identity = null;
		this.info = null;
		this.firmware = null;
		this.identityStatus = 'unknown';
		this.teStatus = 'unknown';
		this.fileStatus = 'unknown';
		this.warnings = [];
	}
}
