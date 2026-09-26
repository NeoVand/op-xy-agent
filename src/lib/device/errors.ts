/**
 * Typed errors for the device layer. Everything the transport refuses comes back as a
 * `TransportPolicyError` with a machine-readable `code`, so the UI (and later the agent) can explain
 * exactly why a message was not sent. Nothing refused is ever sent partially.
 */

/** Base class of every error thrown by `src/lib/device`. */
export class DeviceError extends Error {
	override name = 'DeviceError';
}

/** Why the transport refused a message. */
export type TransportPolicyCode =
	/** Not exactly one complete, valid MIDI message (bad bytes, running status, channel 16…). */
	| 'invalid-message'
	/** TE SysEx the deny-list forbids outright: DFU, 0x7F, undocumented commands, SETTINGS SET. */
	| 'te-forbidden'
	/** TE SysEx that writes to the device (FILE PUT/DELETE/…); M1 never allows writes. */
	| 'te-write'
	/** SysEx that is neither the universal identity request nor a documented TE request. */
	| 'sysex-not-allowed'
	/** SysEx while the browser granted MIDI without SysEx permission. */
	| 'sysex-permission'
	/** A system message with no business on the wire here (System Reset, Active Sensing…). */
	| 'system-not-allowed'
	/** A risky message (project load, remote key) without a valid, unused confirmation token. */
	| 'confirmation-required'
	/** A rate-limited message (project load: one per 5 s) sent too soon after the last one. */
	| 'too-soon'
	/** The pacer would have had to hold the message back longer than it allows. */
	| 'rate-limited';

/** The transport's policy refused a message. Nothing was sent. */
export class TransportPolicyError extends DeviceError {
	override name = 'TransportPolicyError';
	/** Machine-readable reason. */
	readonly code: TransportPolicyCode;
	/** For `too-soon` and `rate-limited`: how long to wait before trying again, in ms. */
	readonly retryAfterMs: number | null;

	constructor(
		code: TransportPolicyCode,
		message: string,
		options: { cause?: unknown; retryAfterMs?: number } = {}
	) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.code = code;
		this.retryAfterMs = options.retryAfterMs ?? null;
	}
}

/** There is no open OP-XY output to send to (not connected, unplugged or in MTP mode). */
export class TransportUnavailableError extends DeviceError {
	override name = 'TransportUnavailableError';
}

/** The browser threw while sending (typically: the device vanished mid-send). */
export class TransportSendError extends DeviceError {
	override name = 'TransportSendError';
}

/** `waitForEvent` gave up: no matching MIDI event arrived in time. */
export class ExpectTimeoutError extends DeviceError {
	override name = 'ExpectTimeoutError';
}

/** A session operation that needs a connected, greeted device was called without one. */
export class SessionStateError extends DeviceError {
	override name = 'SessionStateError';
}
