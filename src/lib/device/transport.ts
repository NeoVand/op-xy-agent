/**
 * THE single send choke point. Every byte the app sends to the OP-XY goes through `Transport.send`
 * (or `panic`, which uses the same path); no other module may call `MIDIOutput.send`
 * (docs/ARCHITECTURE.md, "safety is enforced in one place"; transport.spec.ts checks the codebase).
 *
 * The pipeline, in order, for exactly one MIDI message per call:
 *
 * 1. **Validate** with core/midi: typed messages go through `encode` (ranges are asserted, never
 *    clamped); raw bytes must `parse` as one complete message.
 * 2. **TE deny-list** with core/te's `assertSendable`: DFU (0x03), PRODUCT_SPECIFIC (0x7F),
 *    undocumented commands, SETTINGS SET and malformed frames can never be sent. TE writes (FILE
 *    PUT/DELETE/…) are refused too: M1 never writes to the device.
 * 3. **SysEx allowlist**: SysEx that is not TE may only be the universal identity request.
 *    System Reset, Active Sensing and friends are refused.
 * 4. **Risk** from core/opxy's CC map: CC86 (project load) and CC106 (remote key) need a
 *    single-use confirmation token minted by `confirm()` after the user explicitly approved that
 *    exact message, and CC86 is spaced ≥ 5 s apart (repeated project loads crashed firmware before
 *    1.0.40). CCs that change stored state are flagged `stateChanging` for the journal.
 * 5. **Pace** with a token bucket: bursts are spread with Web MIDI timestamps, and a message that
 *    would wait too long is refused instead of queued (scheduled Web MIDI messages cannot be taken
 *    back). Note-offs and "all notes off" are never refused.
 * 6. **Send**, remember the bytes for echo detection (~500 ms), publish exactly one `MidiBus` event
 *    with its `source` and `cause`, and hand a `SentRecord` to the journal hook `onSent`.
 *
 * Incoming messages enter through `receive`, which publishes them as `source: 'device'` and marks
 * echoes of our own sends (`isEcho`), so the monitor and the mirror never mistake them for the
 * device acting on its own.
 */
import type { MidiBus, MidiEvent } from '$lib/core/midi/bus';
import {
	encode,
	hexBytes,
	parse,
	type EncodableMessage,
	type MidiMessage
} from '$lib/core/midi/messages';
import { isIdentityRequest } from '$lib/core/midi/sysex';
import { listGlobalCcs, type CcRisk, type CcTarget, type RiskLevel } from '$lib/core/opxy';
import { assertSendable, TePolicyError, type TeOutgoingClass } from '$lib/core/te';
import { ccTargets } from './describe';
import { EchoRegistry, ECHO_WINDOW_MS } from './echo';
import { TransportPolicyError, TransportSendError, TransportUnavailableError } from './errors';
import { TokenBucket } from './rate';
import type { Clock, MidiOutputLike, SendSource } from './types';

// ─── policy (pure) ──────────────────────────────────────────────────────────────────────────────

/** What kind of message the policy let through. */
export type OutgoingKind = 'channel' | 'system' | 'identity-request' | 'te-request';

/** The policy's verdict on one outgoing message that may be sent. */
export interface PolicyVerdict {
	/** The exact bytes that go on the wire (a private copy). */
	readonly bytes: Uint8Array;
	/** The same message, parsed. */
	readonly message: EncodableMessage;
	readonly kind: OutgoingKind;
	/** The TE deny-list's classification, for TE SysEx. */
	readonly te: TeOutgoingClass | null;
	/** What a CC means on the OP-XY (global and track targets); empty for other messages. */
	readonly targets: readonly CcTarget[];
	/** The combined risk of `targets`; null when the message carries no documented risk. */
	readonly risk: CcRisk | null;
	/** Sending needs a confirmation token from `Transport.confirm`. */
	readonly needsConfirmation: boolean;
	/** Minimum time between two sends of this controller, in ms (0 = none). */
	readonly minIntervalMs: number;
	/** Changes stored state (project or scene data, persisted by autosave): journal it. */
	readonly stateChanging: boolean;
	/** Releases sound (note off, all notes/sound off, sustain up): never refused by the pacer. */
	readonly releases: boolean;
	/** A CC the map does not document on this channel; it inherits the CC's global risk, if any. */
	readonly unmapped: boolean;
}

const RISK_ORDER: Readonly<Record<RiskLevel, number>> = {
	safe: 0,
	ui: 1,
	audible: 2,
	transport: 3,
	state: 4,
	destructive: 5
};

/** The strictest combination of several targets' risks, or null when there are none. */
function combineRisk(targets: readonly CcTarget[]): CcRisk | null {
	if (targets.length === 0) return null;
	let worst = targets[0].risk;
	for (const t of targets) if (RISK_ORDER[t.risk.level] > RISK_ORDER[worst.level]) worst = t.risk;
	return {
		level: worst.level,
		confirm: targets.some((t) => t.risk.confirm),
		minIntervalMs: Math.max(...targets.map((t) => t.risk.minIntervalMs)),
		persistent: targets.some((t) => t.risk.persistent),
		reason: worst.reason ?? targets.find((t) => t.risk.reason !== null)?.risk.reason ?? null
	};
}

function isMessageObject(input: MidiMessage | ArrayLike<number>): input is MidiMessage {
	return typeof (input as { type?: unknown }).type === 'string';
}

function copyBytes(input: ArrayLike<number>): Uint8Array {
	const out = new Uint8Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const value = input[i];
		if (!Number.isInteger(value) || value < 0 || value > 0xff) {
			throw new TransportPolicyError(
				'invalid-message',
				`byte ${i} is ${String(value)}; MIDI bytes are integers 0–255`
			);
		}
		out[i] = value;
	}
	return out;
}

/** Bytes and parsed message for one outgoing message, or a policy error. */
function toWire(input: MidiMessage | ArrayLike<number>): {
	bytes: Uint8Array;
	message: EncodableMessage;
} {
	let bytes: Uint8Array;
	if (isMessageObject(input)) {
		try {
			bytes = encode(input);
		} catch (error) {
			throw new TransportPolicyError(
				'invalid-message',
				`cannot send this ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	} else {
		bytes = copyBytes(input);
	}
	const message = parse(bytes);
	if (message.type === 'unknown') {
		throw new TransportPolicyError(
			'invalid-message',
			`${hexBytes(bytes) || '(nothing)'} is not exactly one complete MIDI message; send one message per call, with its status byte`
		);
	}
	return { bytes, message };
}

function base(
	bytes: Uint8Array,
	message: EncodableMessage,
	kind: OutgoingKind
): Omit<PolicyVerdict, 'te' | 'targets' | 'risk' | 'unmapped' | 'releases'> {
	return {
		bytes,
		message,
		kind,
		needsConfirmation: false,
		minIntervalMs: 0,
		stateChanging: false
	};
}

const NO_TARGETS: readonly CcTarget[] = [];

/**
 * Runs the whole outgoing policy on one message without sending anything. Returns the verdict for a
 * message that may be sent (it may still need a confirmation token or spacing), or throws a
 * `TransportPolicyError` saying exactly why not.
 */
export function evaluateOutgoing(input: MidiMessage | ArrayLike<number>): PolicyVerdict {
	const { bytes, message } = toWire(input);

	let te: TeOutgoingClass | null = null;
	try {
		// M1 never writes to the device, so TE writes are refused along with everything forbidden.
		const verdict = assertSendable(bytes, { allowWrites: false });
		if (verdict.kind === 'te') te = verdict;
	} catch (error) {
		if (error instanceof TePolicyError) {
			throw new TransportPolicyError(
				error.code === 'forbidden' ? 'te-forbidden' : 'te-write',
				error.message,
				{ cause: error }
			);
		}
		throw error;
	}

	const plain = { te: null, targets: NO_TARGETS, risk: null, unmapped: false, releases: false };
	switch (message.type) {
		case 'sysex':
			if (te) return { ...base(bytes, message, 'te-request'), ...plain, te };
			if (isIdentityRequest(bytes)) {
				return { ...base(bytes, message, 'identity-request'), ...plain };
			}
			throw new TransportPolicyError(
				'sysex-not-allowed',
				`SysEx ${preview(bytes)} is not allowed: only the universal identity request and documented TE requests are sent`
			);
		case 'start':
		case 'stop':
		case 'continue':
		case 'clock':
		case 'songPosition':
			return { ...base(bytes, message, 'system'), ...plain };
		case 'reset':
		case 'activeSensing':
		case 'tuneRequest':
		case 'songSelect':
		case 'mtcQuarterFrame':
			throw new TransportPolicyError(
				'system-not-allowed',
				`${message.type} (${hexBytes(bytes)}) is not sent to the OP-XY: it has no documented use there and can disrupt the device`
			);
		case 'controlChange': {
			let targets = ccTargets(message.controller, message.channel);
			let unmapped = false;
			if (targets.length === 0) {
				// Not documented on this channel: inherit the controller's global meaning, so CC106 on
				// channel 16 is still treated as a remote key rather than as harmless.
				targets = listGlobalCcs().filter((t) => t.cc === message.controller);
				unmapped = true;
			}
			const risk = combineRisk(targets);
			const releases =
				message.controller === 120 ||
				message.controller === 123 ||
				(message.controller === 64 && message.value < 64);
			return {
				...base(bytes, message, 'channel'),
				te: null,
				targets,
				risk,
				unmapped,
				releases,
				needsConfirmation: risk?.confirm ?? false,
				minIntervalMs: risk?.minIntervalMs ?? 0,
				stateChanging: risk?.persistent ?? false
			};
		}
		default:
			return { ...base(bytes, message, 'channel'), ...plain, releases: message.type === 'noteOff' };
	}
}

function preview(bytes: Uint8Array): string {
	return bytes.length <= 12
		? hexBytes(bytes)
		: `${hexBytes(bytes.subarray(0, 8))} … (${bytes.length} bytes)`;
}

// ─── confirmation tokens ────────────────────────────────────────────────────────────────────────

/**
 * Permission to send one specific risky message once. Minted only by `Transport.confirm` (the class
 * itself is not exported) and checked by identity. Its fields are frozen and informational: the
 * transport verifies against its own private copy of the bytes and expiry, so a token cannot be
 * edited to let a different message through.
 */
class ConfirmationToken {
	readonly #brand = true;
	/** The message this token lets through, as hex. */
	readonly message: string;
	/** Why the user approved it, for the journal. */
	readonly reason: string;
	/** When it stops being valid (`performance.now()` domain). */
	readonly expiresAt: number;

	constructor(message: string, reason: string, expiresAt: number) {
		this.message = message;
		this.reason = reason;
		this.expiresAt = expiresAt;
		Object.freeze(this);
	}

	/** True for real tokens (a structurally similar plain object is not one). */
	static is(value: unknown): value is ConfirmationToken {
		return typeof value === 'object' && value !== null && #brand in value;
	}
}

export type { ConfirmationToken };

// ─── transport ──────────────────────────────────────────────────────────────────────────────────

/** What the transport needs from the access layer (`MidiAccessController` provides it). */
export interface TransportPorts {
	/** The open OP-XY output, or null when there is none. */
	readonly output: MidiOutputLike | null;
	/** The OP-XY input's id and name, for labelling incoming events. */
	readonly inputPort: { readonly id: string; readonly name: string } | null;
	/** Whether the browser granted SysEx. */
	readonly sysexEnabled: boolean;
}

/** Per-message options. */
export interface SendOptions {
	/** Who asked: the user, the replica, the agent or the app itself. */
	readonly source: SendSource;
	/** What caused it, e.g. an agent tool-call id or `session`, for the journal and undo. */
	readonly cause?: string;
	/** Delivery time (`performance.now()` domain) for scheduled sends; omit for "as soon as paced". */
	readonly at?: number;
	/** Required for risky messages (project load, remote keys); see `Transport.confirm`. */
	readonly confirmation?: ConfirmationToken;
}

/** What the journal hook receives for every message that went out. */
export interface SentRecord {
	/** The bus event (time, bytes, message, source, cause). */
	readonly event: MidiEvent;
	/** The policy verdict: kind, CC targets, risk, `stateChanging`… */
	readonly verdict: PolicyVerdict;
	/** A confirmation token was used. */
	readonly confirmed: boolean;
}

/** Constructor options. */
export interface TransportOptions {
	readonly ports: TransportPorts;
	readonly bus: MidiBus;
	readonly clock: Clock;
	/** Journal hook: called after each successful send. */
	readonly onSent?: (record: SentRecord) => void;
	/** Messages that may go at once (default 64). */
	readonly burst?: number;
	/** Sustained messages per second (default 1000, one per millisecond). */
	readonly perSecond?: number;
	/** Longest a paced message may be held back before it is refused (default 1000 ms). */
	readonly maxDelayMs?: number;
	/** How long sends are remembered for echo detection (default 500 ms). */
	readonly echoWindowMs?: number;
	/** Spacing between panic messages (default 2 ms). */
	readonly panicSpacingMs?: number;
	/** How long a confirmation token stays valid (default 30 s). */
	readonly confirmationTtlMs?: number;
	/**
	 * When set, `confirm` refuses unless this returns true (in the browser:
	 * `navigator.userActivation.isActive`), so only a real click or key press can mint a token.
	 */
	readonly userActivation?: () => boolean;
}

/** What the transport remembers about a token it minted: the only copy that is checked. */
interface TokenState {
	used: boolean;
	readonly bytes: Uint8Array;
	readonly expiresAt: number;
}

/** The single send choke point; see the module comment for the pipeline. */
export class Transport {
	readonly #ports: TransportPorts;
	readonly #bus: MidiBus;
	readonly #clock: Clock;
	readonly #onSent: ((record: SentRecord) => void) | undefined;
	readonly #bucket: TokenBucket;
	readonly #maxDelayMs: number;
	readonly #echoes: EchoRegistry;
	readonly #panicSpacingMs: number;
	readonly #tokenTtlMs: number;
	readonly #userActivation: (() => boolean) | undefined;
	readonly #tokens = new WeakMap<ConfirmationToken, TokenState>();
	/** Last delivery time per spaced controller (kept across reconnects on purpose). */
	readonly #lastSpaced = new Map<number, number>();
	/** Sounding notes we started: `channel * 128 + note` → count. */
	readonly #sounding = new Map<number, number>();
	/** Incoming byte arrays that were echoes of our sends (the bus event carries the same array). */
	#echoBytes = new WeakSet<Uint8Array>();
	/** Latest delivery time given to a paced message, so paced sends never overtake each other. */
	#lastPacedAt = Number.NEGATIVE_INFINITY;

	constructor(options: TransportOptions) {
		this.#ports = options.ports;
		this.#bus = options.bus;
		this.#clock = options.clock;
		this.#onSent = options.onSent;
		this.#bucket = new TokenBucket({
			capacity: options.burst ?? 64,
			perSecond: options.perSecond ?? 1000,
			now: options.clock.now()
		});
		this.#maxDelayMs = options.maxDelayMs ?? 1000;
		this.#echoes = new EchoRegistry(options.echoWindowMs ?? ECHO_WINDOW_MS);
		this.#panicSpacingMs = options.panicSpacingMs ?? 2;
		this.#tokenTtlMs = options.confirmationTtlMs ?? 30_000;
		this.#userActivation = options.userActivation;
	}

	/**
	 * Sends one message (a typed `MidiMessage` or its raw bytes) through the full policy. Returns the
	 * bus event. Throws `TransportPolicyError` (nothing sent), `TransportUnavailableError` (no open
	 * device) or `TransportSendError` (the browser refused).
	 */
	send(input: MidiMessage | ArrayLike<number>, options: SendOptions): MidiEvent {
		return this.#deliver(evaluateOutgoing(input), options, null);
	}

	/**
	 * Mints a single-use token that lets exactly this message through the confirmation gate once,
	 * within the token lifetime. Only the approval UI may call it, right after the user explicitly
	 * approved this message. Forbidden messages cannot be confirmed: the policy runs first.
	 */
	confirm(input: MidiMessage | ArrayLike<number>, reason: string): ConfirmationToken {
		const verdict = evaluateOutgoing(input);
		if (this.#userActivation && !this.#userActivation()) {
			throw new TransportPolicyError(
				'confirmation-required',
				'a confirmation can only be created from a user action (a click or key press)'
			);
		}
		const now = this.#clock.now();
		const expiresAt = now + this.#tokenTtlMs;
		const token = new ConfirmationToken(hexBytes(verdict.bytes), reason, expiresAt);
		this.#tokens.set(token, { used: false, bytes: verdict.bytes, expiresAt });
		return token;
	}

	/**
	 * Silences the device: a note-off for every note we started, then sustain off (CC64 = 0), All
	 * Notes Off (CC123) and All Sound Off (CC120) on all 16 channels, spaced `panicSpacingMs` apart
	 * so the device's input buffer is not flooded. Never refused by the pacer. Returns the events.
	 */
	panic(options: { readonly source?: SendSource; readonly cause?: string } = {}): MidiEvent[] {
		if (!this.#ports.output) throw unavailable();
		const messages: MidiMessage[] = [];
		for (const key of this.#sounding.keys()) {
			messages.push({ type: 'noteOff', channel: key >> 7, note: key & 0x7f, velocity: 0 });
		}
		for (let channel = 0; channel < 16; channel++) {
			messages.push({ type: 'controlChange', channel, controller: 64, value: 0 });
			messages.push({ type: 'controlChange', channel, controller: 123, value: 0 });
			messages.push({ type: 'controlChange', channel, controller: 120, value: 0 });
		}
		const start = Math.max(this.#clock.now(), this.#lastPacedAt);
		const sendOptions: SendOptions = {
			source: options.source ?? 'system',
			cause: options.cause ?? 'panic'
		};
		const events = messages.map((message, i) =>
			this.#deliver(evaluateOutgoing(message), sendOptions, start + i * this.#panicSpacingMs)
		);
		this.#sounding.clear();
		return events;
	}

	/**
	 * Publishes one incoming message from the OP-XY as a `device` event, marking it as an echo when
	 * it repeats something we sent in the last ~500 ms.
	 */
	receive(data: ArrayLike<number>, timeStamp?: number): MidiEvent {
		const bytes = Uint8Array.from(data);
		const time = timeStamp !== undefined && timeStamp > 0 ? timeStamp : this.#clock.now();
		if (this.#echoes.match(bytes, time)) this.#echoBytes.add(bytes);
		const port = this.#ports.inputPort;
		return this.#bus.emit({
			time,
			portId: port?.id ?? 'unknown',
			portName: port?.name ?? 'unknown',
			direction: 'in',
			source: 'device',
			bytes,
			message: parse(bytes)
		});
	}

	/** True for an incoming event that repeats one of our own recent sends. */
	isEcho(event: MidiEvent): boolean {
		return event.direction === 'in' && this.#echoBytes.has(event.bytes);
	}

	/** Notes we started that have not been released. */
	get soundingNotes(): number {
		let count = 0;
		for (const n of this.#sounding.values()) count += n;
		return count;
	}

	/**
	 * Forgets per-connection state (sounding notes, echo memory) when the device goes away. Spacing
	 * for risky controllers is kept: unplugging must not reset the project-load rate limit.
	 */
	reset(): void {
		this.#sounding.clear();
		this.#echoes.clear();
		this.#echoBytes = new WeakSet();
	}

	/** Steps 4–6 of the pipeline. `at` is set for panic messages, which bypass the pacer. */
	#deliver(verdict: PolicyVerdict, options: SendOptions, at: number | null): MidiEvent {
		const output = this.#ports.output;
		if (!output) throw unavailable();
		if (verdict.message.type === 'sysex' && !this.#ports.sysexEnabled) {
			throw new TransportPolicyError(
				'sysex-permission',
				'SysEx needs the browser\'s "control and reprogram your MIDI devices" permission, which was not granted'
			);
		}
		const now = this.#clock.now();
		const spaced =
			verdict.minIntervalMs > 0 && verdict.message.type === 'controlChange'
				? verdict.message.controller
				: null;
		if (spaced !== null) {
			const last = this.#lastSpaced.get(spaced);
			if (last !== undefined && now - last < verdict.minIntervalMs) {
				const retryAfterMs = Math.ceil(last + verdict.minIntervalMs - now);
				throw new TransportPolicyError(
					'too-soon',
					`CC${spaced} may be sent at most once every ${verdict.minIntervalMs} ms; try again in ${retryAfterMs} ms`,
					{ retryAfterMs }
				);
			}
		}
		const token = verdict.needsConfirmation
			? this.#checkToken(options.confirmation, verdict, now)
			: null;
		const when = at ?? this.#pace(verdict, options.at, now);
		try {
			output.send(verdict.bytes, when > now ? when : undefined);
		} catch (error) {
			if (at === null) this.#bucket.refund();
			throw new TransportSendError(
				`the browser refused to send ${preview(verdict.bytes)}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
		// Committed: the message is on its way.
		if (token) token.used = true;
		if (spaced !== null) this.#lastSpaced.set(spaced, when);
		if (options.at === undefined) this.#lastPacedAt = Math.max(this.#lastPacedAt, when);
		this.#track(verdict.message);
		this.#echoes.remember(verdict.bytes, when);
		const event = this.#bus.emit({
			time: when,
			portId: output.id,
			portName: output.name ?? output.id,
			direction: 'out',
			source: options.source,
			cause: options.cause,
			bytes: verdict.bytes,
			message: verdict.message
		});
		try {
			this.#onSent?.({ event, verdict, confirmed: token !== null });
		} catch (error) {
			console.error('[transport] the onSent journal hook threw; the message was sent', error);
		}
		return event;
	}

	/** Delivery time for a paced message; refuses when it would wait longer than allowed. */
	#pace(verdict: PolicyVerdict, requestedAt: number | undefined, now: number): number {
		const wait = this.#bucket.reserve(now);
		if (wait > this.#maxDelayMs && !verdict.releases) {
			this.#bucket.refund();
			throw new TransportPolicyError(
				'rate-limited',
				`too many messages at once: ${preview(verdict.bytes)} would wait ${Math.round(wait)} ms (limit ${this.#maxDelayMs} ms)`,
				{ retryAfterMs: Math.ceil(wait - this.#maxDelayMs) }
			);
		}
		const earliest = now + wait;
		return requestedAt === undefined
			? Math.max(earliest, this.#lastPacedAt)
			: Math.max(earliest, requestedAt);
	}

	#checkToken(
		token: ConfirmationToken | undefined,
		verdict: PolicyVerdict,
		now: number
	): TokenState {
		const what = `${preview(verdict.bytes)} (${verdict.targets.map((t) => t.name).join(', ') || 'risky message'})`;
		const state =
			token !== undefined && ConfirmationToken.is(token) ? this.#tokens.get(token) : undefined;
		if (token === undefined || state === undefined) {
			throw new TransportPolicyError(
				'confirmation-required',
				`${what} needs the user's explicit confirmation: ${verdict.risk?.reason ?? 'risky'}`
			);
		}
		if (state.used) {
			throw new TransportPolicyError(
				'confirmation-required',
				`the confirmation for ${what} was already used`
			);
		}
		if (now > state.expiresAt) {
			throw new TransportPolicyError(
				'confirmation-required',
				`the confirmation for ${what} expired`
			);
		}
		if (!sameBytes(state.bytes, verdict.bytes)) {
			throw new TransportPolicyError(
				'confirmation-required',
				`that confirmation is for ${preview(state.bytes)}, not ${preview(verdict.bytes)}`
			);
		}
		return state;
	}

	/** Keeps the ledger of notes we started, for panic. */
	#track(message: EncodableMessage): void {
		if (message.type === 'noteOn') {
			const key = message.channel * 128 + message.note;
			this.#sounding.set(key, (this.#sounding.get(key) ?? 0) + 1);
		} else if (message.type === 'noteOff') {
			const key = message.channel * 128 + message.note;
			const count = this.#sounding.get(key);
			if (count === undefined) return;
			if (count <= 1) this.#sounding.delete(key);
			else this.#sounding.set(key, count - 1);
		} else if (
			message.type === 'controlChange' &&
			(message.controller === 120 || message.controller === 123)
		) {
			for (const key of [...this.#sounding.keys()]) {
				if (key >> 7 === message.channel) this.#sounding.delete(key);
			}
		}
	}
}

function unavailable(): TransportUnavailableError {
	return new TransportUnavailableError(
		'the OP-XY is not connected (or its port is not open), so nothing was sent'
	);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
