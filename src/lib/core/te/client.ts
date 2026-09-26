// Transport-agnostic TE SysEx request/response client, one instance per device. It keeps a FIFO
// queue with one request in flight, allocates request ids, matches replies by (command, request id),
// ignores echoed requests, keeps waiting on in-progress statuses, and halts everything when the
// device sends a debug log frame. Timers are injected (core has none of its own), and every frame
// passes policy.assertSendable before `send` sees it. Behaviour follows TE's own client
// (docs/research/60-firmware.md §4.2, §4.4) and research/device/te_sysex_probe.py.

import { assertIntInRange, decodeText, hex2, toBytes } from './bytes';
import { buildRequestFrame, decodeStatus, parseFrame } from './codec';
import type { TeEventFrame, TeResponseFrame } from './codec';
import {
	echoRequest,
	fileInitRequest,
	fileListRequest,
	greetRequest,
	parseFileInitReply,
	parseFileListReply,
	parseGreetReply
} from './commands';
import type { TeFileEntry, TeFileInitOptions, TeFileInitReply } from './commands';
import { TE_DEFAULT_TIMEOUT_MS, TE_REQUEST_ID_MAX } from './constants';
import {
	TeClosedError,
	TeCodecError,
	TeHaltedError,
	TeProtocolError,
	TeStatusError,
	TeTimeoutError
} from './errors';
import type { TeGreetInfo } from './identity';
import { assertSendable } from './policy';

/** `setTimeout`/`clearTimeout`-like functions, injected so core code never touches real timers. */
export interface TeScheduler {
	/** Calls `callback` after `ms` milliseconds; returns a handle for {@link TeScheduler.clearTimeout}. */
	setTimeout(callback: () => void, ms: number): unknown;
	/** Cancels a pending callback. */
	clearTimeout(handle: unknown): void;
}

/** Constructor options for {@link TeClient}. */
export interface TeClientOptions {
	/** Sends one frame (the device/transport choke point). May throw or return a rejecting promise. */
	readonly send: (bytes: Uint8Array) => void | Promise<void>;
	/** SysEx device id from the identity reply (0x21 on the OP-XY). */
	readonly deviceId: number;
	/** Timer functions. */
	readonly scheduler: TeScheduler;
	/** Default reply timeout in ms (TE's default, 20 s, when omitted). */
	readonly timeoutMs?: number;
	/** Random source for the first request id (default `Math.random`); inject for deterministic tests. */
	readonly random?: () => number;
	/** Called for unsolicited frames (no request id) from this device. */
	readonly onEvent?: (event: TeEventFrame) => void;
	/** Called with the text of every device debug frame (the first one halts the client). */
	readonly onDebug?: (text: string) => void;
}

/** What {@link TeClient.request} sends: a command and its raw payload ({@link TeRequestSpec} fits). */
export interface TeRequestInput {
	readonly cmd: number;
	readonly payload?: ArrayLike<number>;
	/** Name for errors and logs; defaults to the policy's name for the frame. */
	readonly name?: string;
}

/** Per-request options. */
export interface TeRequestOptions {
	/** Reply timeout in ms; restarts on every in-progress status. Defaults to the client's. */
	readonly timeoutMs?: number;
	/** Set only for an owner-approved state-changing request; passed to the policy. */
	readonly allowWrites?: boolean;
	/** Called for each in-progress reply (status ≥ 64) while the request stays open. */
	readonly onProgress?: (progress: TeReply) => void;
}

/** Options for the read helpers. */
export interface TeReadOptions {
	/** Reply timeout per request in ms. */
	readonly timeoutMs?: number;
}

/** Options for {@link TeClient.fileList}. */
export interface TeFileListOptions extends TeReadOptions {
	/** Give up (TeProtocolError) if no empty page arrives within this many pages. Default 1024. */
	readonly maxPages?: number;
}

/** A reply frame's content: final (status 0) for a resolved request, or in progress (≥ 64). */
export interface TeReply {
	readonly cmd: number;
	readonly requestId: number;
	readonly status: number;
	/** Unpacked reply data. */
	readonly data: Uint8Array;
}

/** `ready` accepts requests; `halted` after a device debug frame until {@link TeClient.resume}; `closed` is final. */
export type TeClientState = 'ready' | 'halted' | 'closed';

/** What {@link TeClient.handleIncoming} did with a message. */
export type TeDisposition =
	/** Final reply to the request in flight. */
	| 'response'
	/** In-progress reply (status ≥ 64) to the request in flight; its timeout restarted. */
	| 'progress'
	/** Unsolicited frame from this device, passed to `onEvent`. */
	| 'event'
	/** Device debug frame: the client halted. */
	| 'debug'
	/** A TE request (our own, echoed back): ignored. */
	| 'echo'
	/** A TE reply or event that belongs to nothing we are waiting for: ignored. */
	| 'unmatched'
	/** Looked like TE but could not be parsed: ignored. */
	| 'malformed'
	/** Not TE traffic at all. */
	| 'not-te';

interface PendingRequest {
	readonly cmd: number;
	readonly payload: Uint8Array;
	readonly name: string;
	readonly timeoutMs: number;
	readonly allowWrites: boolean;
	readonly onProgress: ((progress: TeReply) => void) | undefined;
	readonly resolve: (reply: TeReply) => void;
	readonly reject: (error: Error) => void;
	requestId: number;
	timer: { handle: unknown } | null;
}

const DEFAULT_MAX_LIST_PAGES = 1024;

/**
 * Request/response client for one TE device. Feed it every incoming MIDI message from that device
 * through {@link TeClient.handleIncoming}; it sends through the injected `send`.
 */
export class TeClient {
	/** SysEx device id used in byte 4 of every frame. */
	readonly deviceId: number;
	readonly #send: TeClientOptions['send'];
	readonly #scheduler: TeScheduler;
	readonly #timeoutMs: number;
	readonly #onEvent: TeClientOptions['onEvent'];
	readonly #onDebug: TeClientOptions['onDebug'];
	readonly #queue: PendingRequest[] = [];
	#inFlight: PendingRequest | null = null;
	#lastRequestId: number;
	#state: TeClientState = 'ready';
	#haltReason: string | null = null;
	#pumping = false;

	/** @throws TeCodecError on an invalid device id, timeout or random source. */
	constructor(options: TeClientOptions) {
		this.deviceId = assertIntInRange(options.deviceId, 0, 0x7f, 'device id');
		this.#send = options.send;
		this.#scheduler = options.scheduler;
		this.#timeoutMs = checkTimeout(options.timeoutMs ?? TE_DEFAULT_TIMEOUT_MS);
		this.#onEvent = options.onEvent;
		this.#onDebug = options.onDebug;
		// Like TE's client: start at a random 0–4094; the first request uses start + 1.
		const random = options.random ?? Math.random;
		this.#lastRequestId = assertIntInRange(
			Math.floor(random() * TE_REQUEST_ID_MAX),
			0,
			TE_REQUEST_ID_MAX,
			'initial request id'
		);
	}

	/** Current state. */
	get state(): TeClientState {
		return this.#state;
	}

	/** Text of the debug frame that halted the client, or null. */
	get haltReason(): string | null {
		return this.#haltReason;
	}

	/** Requests queued or in flight. */
	get pendingCount(): number {
		return this.#queue.length + (this.#inFlight === null ? 0 : 1);
	}

	/**
	 * Queues a request; it is sent when every earlier request has finished. Resolves with the final
	 * reply (status 0). Rejects with TePolicyError (never sent), TeStatusError, TeTimeoutError,
	 * TeHaltedError, TeClosedError, TeCodecError, or whatever `send` threw.
	 */
	request(input: TeRequestInput, options: TeRequestOptions = {}): Promise<TeReply> {
		try {
			this.#assertOpen();
			const cmd = assertIntInRange(input.cmd, 0, 0x7f, 'command');
			const payload = toBytes(input.payload ?? [], 'payload');
			const timeoutMs = checkTimeout(options.timeoutMs ?? this.#timeoutMs);
			const allowWrites = options.allowWrites === true;
			// Fail fast; the frame is checked again, with its real request id, right before sending.
			const probe = buildRequestFrame({ deviceId: this.deviceId, requestId: 0, cmd, payload });
			const verdict = assertSendable(probe, { allowWrites });
			const name = input.name ?? (verdict.kind === 'te' ? verdict.name : `TE 0x${hex2(cmd)}`);
			return new Promise<TeReply>((resolve, reject) => {
				this.#queue.push({
					cmd,
					payload,
					name,
					timeoutMs,
					allowWrites,
					onProgress: options.onProgress,
					resolve,
					reject,
					requestId: -1,
					timer: null
				});
				this.#pump();
			});
		} catch (error) {
			return Promise.reject(toError(error));
		}
	}

	/**
	 * Handles one incoming MIDI message from the device. Never throws for bad input (callbacks may).
	 * A debug frame from any device id halts the client: all pending requests reject.
	 */
	handleIncoming(bytes: ArrayLike<number>): TeDisposition {
		const frame = parseFrame(bytes);
		switch (frame.kind) {
			case 'not-te':
				return 'not-te';
			case 'malformed':
				return 'malformed';
			case 'request':
				return 'echo';
			case 'debug':
				this.#halt(frame.text);
				return 'debug';
			case 'event':
				if (frame.deviceId !== this.deviceId) return 'unmatched';
				this.#onEvent?.(frame);
				return 'event';
			case 'response':
				return this.#handleResponse(frame);
		}
	}

	/** Leaves the halted state (after the owner power-cycled the device). No-op otherwise. */
	resume(): void {
		if (this.#state !== 'halted') return;
		this.#state = 'ready';
		this.#haltReason = null;
	}

	/** Rejects everything pending with TeClosedError; later requests reject too. Idempotent. */
	close(): void {
		if (this.#state === 'closed') return;
		this.#state = 'closed';
		this.#rejectAll(() => new TeClosedError('TE client closed'));
	}

	/** GREET → parsed metadata (`os_version`, `sku`, `serial`, …). */
	async greet(options: TeReadOptions = {}): Promise<TeGreetInfo> {
		const reply = await this.request(greetRequest(), options);
		return parseGreetReply(reply.data);
	}

	/**
	 * ECHO → the returned bytes.
	 * @throws TeProtocolError (as a rejection) when they differ from what was sent.
	 */
	async echo(data: ArrayLike<number>, options: TeReadOptions = {}): Promise<Uint8Array> {
		const spec = echoRequest(data);
		const reply = await this.request(spec, options);
		if (!equalBytes(reply.data, spec.payload)) {
			throw new TeProtocolError(
				`ECHO returned ${reply.data.length} bytes that differ from the ${spec.payload.length} sent`
			);
		}
		return reply.data;
	}

	/** FILE INIT (default: no event subscription, 4 MiB max response) → chunk size. */
	async fileInit(
		init: TeFileInitOptions = {},
		options: TeReadOptions = {}
	): Promise<TeFileInitReply> {
		const reply = await this.request(fileInitRequest(init), options);
		return parseFileInitReply(reply.data);
	}

	/**
	 * Every entry of directory `node` (0 = root): FILE LIST pages 0, 1, 2… until an empty page.
	 * Call {@link TeClient.fileInit} first.
	 * @throws TeProtocolError (as a rejection) on a wrong page number or too many pages.
	 */
	async fileList(node: number, options: TeFileListOptions = {}): Promise<TeFileEntry[]> {
		const maxPages = assertIntInRange(
			options.maxPages ?? DEFAULT_MAX_LIST_PAGES,
			1,
			0x10000,
			'maxPages'
		);
		const entries: TeFileEntry[] = [];
		for (let page = 0; page < maxPages; page++) {
			const reply = await this.request(fileListRequest(page, node), {
				timeoutMs: options.timeoutMs
			});
			if (reply.data.length === 0) return entries; // TE's tool also ends on a reply without a page
			const parsed = parseFileListReply(reply.data);
			if (parsed.page !== page) {
				throw new TeProtocolError(
					`FILE LIST node ${node}: asked for page ${page}, got page ${parsed.page}`
				);
			}
			if (parsed.entries.length === 0) return entries;
			entries.push(...parsed.entries);
		}
		throw new TeProtocolError(`FILE LIST node ${node}: no empty page within ${maxPages} pages`);
	}

	#assertOpen(): void {
		if (this.#state === 'halted') throw new TeHaltedError(this.#haltReason ?? '');
		if (this.#state === 'closed') throw new TeClosedError('TE client closed');
	}

	/** Sends queued requests one at a time. Re-entrant calls (a reply arriving inside `send`) return. */
	#pump(): void {
		if (this.#pumping) return;
		this.#pumping = true;
		try {
			while (this.#state === 'ready' && this.#inFlight === null) {
				const next = this.#queue.shift();
				if (next === undefined) break;
				this.#dispatch(next);
			}
		} finally {
			this.#pumping = false;
		}
	}

	#dispatch(entry: PendingRequest): void {
		this.#lastRequestId = (this.#lastRequestId + 1) % (TE_REQUEST_ID_MAX + 1);
		entry.requestId = this.#lastRequestId;
		let frame: Uint8Array;
		try {
			frame = buildRequestFrame({
				deviceId: this.deviceId,
				requestId: entry.requestId,
				cmd: entry.cmd,
				payload: entry.payload
			});
			assertSendable(frame, { allowWrites: entry.allowWrites });
		} catch (error) {
			entry.reject(toError(error));
			return;
		}
		// In flight before `send`, so a reply delivered synchronously inside `send` still matches.
		this.#inFlight = entry;
		this.#arm(entry);
		let sent: unknown;
		try {
			sent = this.#send(frame);
		} catch (error) {
			this.#fail(entry, toError(error));
			return;
		}
		if (isPromiseLike(sent)) {
			sent.then(undefined, (error: unknown) => this.#fail(entry, toError(error)));
		}
	}

	#handleResponse(frame: TeResponseFrame): TeDisposition {
		const entry = this.#inFlight;
		if (
			entry === null ||
			frame.deviceId !== this.deviceId ||
			frame.requestId !== entry.requestId ||
			frame.cmd !== entry.cmd
		) {
			return 'unmatched';
		}
		const reply: TeReply = {
			cmd: frame.cmd,
			requestId: frame.requestId,
			status: frame.status,
			data: frame.data
		};
		const status = decodeStatus(frame.status);
		if (!status.final) {
			this.#arm(entry);
			entry.onProgress?.(reply);
			return 'progress';
		}
		this.#finish(entry);
		if (status.kind === 'ok') {
			entry.resolve(reply);
		} else {
			entry.reject(
				new TeStatusError({
					requestName: entry.name,
					cmd: entry.cmd,
					requestId: entry.requestId,
					status,
					data: frame.data,
					reason: decodeText(frame.data).replace(/\0+$/, '').trim()
				})
			);
		}
		this.#pump();
		return 'response';
	}

	#arm(entry: PendingRequest): void {
		this.#disarm(entry);
		// A fresh token per arm: a stale callback from an earlier arm can never time out the request.
		const timer: { handle: unknown } = { handle: undefined };
		entry.timer = timer;
		timer.handle = this.#scheduler.setTimeout(() => {
			if (entry.timer === timer) this.#onTimeout(entry);
		}, entry.timeoutMs);
	}

	#disarm(entry: PendingRequest): void {
		if (entry.timer === null) return;
		this.#scheduler.clearTimeout(entry.timer.handle);
		entry.timer = null;
	}

	#onTimeout(entry: PendingRequest): void {
		entry.timer = null;
		this.#fail(entry, new TeTimeoutError(entry.name, entry.cmd, entry.requestId, entry.timeoutMs));
	}

	/** Rejects `entry` if it is still in flight, then moves on to the next request. */
	#fail(entry: PendingRequest, error: Error): void {
		if (this.#inFlight !== entry) return;
		this.#finish(entry);
		entry.reject(error);
		this.#pump();
	}

	#finish(entry: PendingRequest): void {
		this.#disarm(entry);
		if (this.#inFlight === entry) this.#inFlight = null;
	}

	#halt(text: string): void {
		if (this.#state === 'ready') {
			this.#state = 'halted';
			this.#haltReason = text;
			this.#rejectAll(() => new TeHaltedError(text));
		}
		this.#onDebug?.(text);
	}

	#rejectAll(makeError: () => Error): void {
		const pending = [...(this.#inFlight === null ? [] : [this.#inFlight]), ...this.#queue];
		if (this.#inFlight !== null) this.#finish(this.#inFlight);
		this.#queue.length = 0;
		for (const entry of pending) entry.reject(makeError());
	}
}

function checkTimeout(ms: number): number {
	if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
		throw new TeCodecError(`timeout must be a positive number of milliseconds, got ${String(ms)}`);
	}
	return ms;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}
