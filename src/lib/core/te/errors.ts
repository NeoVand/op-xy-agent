// Typed errors for the TE SysEx module. Everything thrown or rejected by src/lib/core/te is a
// TeError, so callers can tell protocol trouble from their own bugs with one instanceof check.

import type { TeStatusInfo } from './codec';
import type { TeOutgoingClass } from './policy';

/** Base class of every error raised by the TE SysEx module. */
export class TeError extends Error {
	name = 'TeError';
}

/** Invalid input to an encoder or builder (not a byte, out of range, non-ASCII name…). */
export class TeCodecError extends TeError {
	name = 'TeCodecError';
}

/** A reply that does not have the shape we expect (truncated entry, wrong page, echo mismatch…). */
export class TeProtocolError extends TeError {
	name = 'TeProtocolError';
}

/** Why the outgoing policy refused a message. */
export type TePolicyErrorCode = 'forbidden' | 'write-not-allowed';

/** The outgoing deny-list refused to let a message through. Nothing was sent. */
export class TePolicyError extends TeError {
	name = 'TePolicyError';
	/** `forbidden` can never be sent; `write-not-allowed` needs an approved write. */
	readonly code: TePolicyErrorCode;
	/** What the policy decided the message was. */
	readonly classification: TeOutgoingClass;

	constructor(code: TePolicyErrorCode, classification: TeOutgoingClass) {
		super(
			code === 'forbidden'
				? `blocked TE SysEx ${classification.name}: ${classification.reason}`
				: `TE SysEx ${classification.name} changes device state and needs an approved write`
		);
		this.code = code;
		this.classification = classification;
	}
}

/** Fields describing a request that the device answered with an error status. */
export interface TeStatusErrorFields {
	/** Request name for messages, e.g. "FILE INFO". */
	readonly requestName: string;
	/** Command number of the request. */
	readonly cmd: number;
	/** Request id the device echoed. */
	readonly requestId: number;
	/** Decoded status byte. */
	readonly status: TeStatusInfo;
	/** Unpacked reply data (TE sends an ASCII reason here, often empty). */
	readonly data: Uint8Array;
	/** `data` decoded as text and trimmed. */
	readonly reason: string;
}

/** The device answered with a status other than ok (0) or in-progress (≥ 64). */
export class TeStatusError extends TeError {
	name = 'TeStatusError';
	/** Command number of the failed request. */
	readonly cmd: number;
	/** Request id of the failed request. */
	readonly requestId: number;
	/** Raw status byte (1 error, 2 command not found, 3 bad request, 16–63 specific error…). */
	readonly status: number;
	/** Decoded status. */
	readonly statusInfo: TeStatusInfo;
	/** Unpacked reply data. */
	readonly data: Uint8Array;
	/** Reply data as trimmed text; empty when the device gave no reason. */
	readonly reason: string;

	constructor(fields: TeStatusErrorFields) {
		const suffix = fields.reason ? `: ${fields.reason}` : '';
		super(
			`${fields.requestName} failed with status ${fields.status.code} (${fields.status.label})${suffix}`
		);
		this.cmd = fields.cmd;
		this.requestId = fields.requestId;
		this.status = fields.status.code;
		this.statusInfo = fields.status;
		this.data = fields.data;
		this.reason = fields.reason;
	}
}

/** No final reply arrived in time. */
export class TeTimeoutError extends TeError {
	name = 'TeTimeoutError';
	/** Command number of the request. */
	readonly cmd: number;
	/** Request id that went unanswered. */
	readonly requestId: number;
	/** The timeout that elapsed, in milliseconds. */
	readonly timeoutMs: number;

	constructor(requestName: string, cmd: number, requestId: number, timeoutMs: number) {
		super(`no reply to ${requestName} (request id ${requestId}) within ${timeoutMs} ms`);
		this.cmd = cmd;
		this.requestId = requestId;
		this.timeoutMs = timeoutMs;
	}
}

/**
 * The device sent a firmware debug log frame, so all TE traffic stopped. The owner should
 * power-cycle the device before the client is resumed.
 */
export class TeHaltedError extends TeError {
	name = 'TeHaltedError';
	/** Text of the debug frame that halted the client. */
	readonly debugText: string;

	constructor(debugText: string) {
		super(`TE traffic halted after a device debug frame: ${debugText}`);
		this.debugText = debugText;
	}
}

/** The client was closed (for example the device was unplugged). */
export class TeClosedError extends TeError {
	name = 'TeClosedError';
}
