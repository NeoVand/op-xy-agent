/**
 * The voice's tools, carried out on the Claude conductor. The voice model is only a front desk:
 * `ask_claude` sends the user's request to the conductor as a normal user turn (so it shows in the
 * conversation and runs with the same tools, approvals and undo) and returns at the conductor's
 * next stop: its answer, a change waiting for approval, an error or a stop.
 *
 * Approvals by voice (docs/research/71-voice.md §6). The conductor asks through the same gate as
 * the approval sheet, and a spoken answer is passed to the same `decide`. Decisions come from the
 * user, never from a model, so a spoken answer only counts when
 * - the approval is the one the voice asked about,
 * - the user spoke after the question was put to them, and
 * - for a yes, the transcript of what they said is a clear yes (`spokenAnswer`).
 * A no needs the first two only (refusing is the safe direction). "Allow for this session" is not
 * offered by voice. The user can always tap the sheet instead.
 *
 * A request that runs long returns "working"; its result (or an approval it reaches) comes later
 * as an update, spoken when the floor is free. So does the end of a run the voice followed when
 * the user decided on screen.
 */
import type { PreparedAttachment } from '$lib/agent/attachments';
import type { ChatEntry } from '$lib/agent/chat';
import type {
	ConductorStatus,
	DecideOptions,
	SendOptions,
	VoiceLineInput
} from '$lib/agent/conductor.svelte';
import type {
	AgentErrorInfo,
	AgentListener,
	ApprovalDecision,
	ApprovalRequest,
	ProposedAction,
	Revision
} from '$lib/agent/types';
import {
	APPROVAL_INSTRUCTION,
	spokenAnswer,
	type VoiceToolCall,
	type VoiceToolResult
} from '$lib/core/voice';
import type { Timers } from '$lib/device/types';
import { speakable } from './speech';

/** What the bridge needs of the conductor (the real `Conductor` has it all). */
export interface VoiceConductor {
	readonly status: ConductorStatus;
	readonly busy: boolean;
	readonly entries: readonly ChatEntry[];
	readonly approval: ApprovalRequest | null;
	readonly revisions: readonly Revision[];
	send(
		text: string,
		attachments: readonly PreparedAttachment[],
		options: SendOptions
	): Promise<void>;
	decide(decision: ApprovalDecision, options: DecideOptions): void;
	stop(): void;
	on(listener: AgentListener): () => void;
	voiceLine(line: VoiceLineInput): void;
}

/** What the user said, as the voice session heard it. */
export interface SpokenEvidence {
	/** How many user turns have been heard so far. */
	turns(): number;
	/**
	 * The transcript of the user's latest turn after turn `since`, waiting up to `waitMs` for it:
	 * null when they have not spoken since, '' when the words never arrived.
	 */
	answerSince(since: number, waitMs: number): Promise<string | null>;
}

/** Options for {@link ClaudeBridge}. */
export interface ClaudeBridgeOptions {
	readonly conductor: () => VoiceConductor | null;
	readonly evidence: SpokenEvidence;
	readonly timers: Timers;
	/** A result the voice should hear although no tool call waits for it. */
	readonly onUpdate: (result: VoiceToolResult) => void;
	/** How long a request runs before the voice hears "still working" (default 20 s). */
	readonly patienceMs?: number;
	/** How long to wait for the words of a spoken answer (default 2.5 s). */
	readonly transcriptWaitMs?: number;
}

/** Where the conductor stopped. */
type Stop =
	| { readonly kind: 'approval'; readonly request: ApprovalRequest }
	| {
			readonly kind: 'finished';
			readonly stopReason: string | null;
			readonly error: AgentErrorInfo | null;
	  };

/** The text of the conductor's answers after the last user message (the current run's). */
export function answerOf(entries: readonly ChatEntry[]): string {
	let start = entries.length;
	while (start > 0 && entries[start - 1].kind !== 'user') start--;
	return entries
		.slice(start)
		.flatMap((e) =>
			e.kind === 'text' && e.agent === 'conductor' && e.parent === null ? [e.text] : []
		)
		.join('\n\n')
		.trim();
}

/** The changes the current run applied to the device or the virtual OP-XY, by their labels. */
export function changesOf(entries: readonly ChatEntry[], revisions: readonly Revision[]): string[] {
	let start = entries.length;
	while (start > 0 && entries[start - 1].kind !== 'user') start--;
	const calls = new Set(entries.slice(start).flatMap((e) => (e.kind === 'tool' ? [e.id] : [])));
	return revisions.filter((r) => calls.has(r.toolCallId)).map((r) => r.label);
}

/** One proposed change as the voice should say it. */
export function describeAction(action: ProposedAction): string {
	const { label, note } = action.preview;
	return note ? `${label} (${note})` : label;
}

/** Carries out the voice model's tool calls on the conductor. */
export class ClaudeBridge {
	readonly #conductor: () => VoiceConductor | null;
	readonly #evidence: SpokenEvidence;
	readonly #timers: Timers;
	readonly #onUpdate: (result: VoiceToolResult) => void;
	readonly #patienceMs: number;
	readonly #transcriptWaitMs: number;
	#subscribed: VoiceConductor | null = null;
	#unsubscribe: (() => void) | null = null;
	#waiters: ((stop: Stop) => void)[] = [];
	#lastError: AgentErrorInfo | null = null;
	/** The voice follows the current run: it started it, or put its approval to the user. */
	#following = false;
	/** The approval the voice asked the user about, and how many turns had been heard then. */
	#asked: { readonly id: string; readonly turn: number } | null = null;
	#disposed = false;

	constructor(options: ClaudeBridgeOptions) {
		this.#conductor = options.conductor;
		this.#evidence = options.evidence;
		this.#timers = options.timers;
		this.#onUpdate = options.onUpdate;
		this.#patienceMs = options.patienceMs ?? 20_000;
		this.#transcriptWaitMs = options.transcriptWaitMs ?? 2500;
	}

	/** Carries out one tool call. */
	async handle(call: VoiceToolCall): Promise<VoiceToolResult> {
		switch (call.tool) {
			case 'ask_claude':
				return this.ask(call.request);
			case 'answer_approval':
				return this.answer(call.approve, call.note);
			case 'stop_claude':
				return this.stop();
			case 'invalid':
				return { status: 'error', message: `${call.name}: ${call.problem}` };
		}
	}

	/** `ask_claude`: the request goes to the conductor as a user turn. */
	async ask(request: string): Promise<VoiceToolResult> {
		const conductor = this.#attach();
		if (!conductor) {
			return {
				status: 'error',
				message: 'Claude is not set up: the user needs to add an Anthropic key in settings.'
			};
		}
		if (conductor.approval) {
			const result = this.#approvalResult(conductor.approval);
			return {
				...result,
				instruction: `A change is already waiting for approval, so the new request was not sent. ${APPROVAL_INSTRUCTION}`
			};
		}
		if (conductor.busy) {
			return {
				status: 'busy',
				instruction: this.#following
					? 'Claude is still working on the previous request; its result will come as an update.'
					: 'Claude is busy with a request from the chat. Ask the user to try again in a moment.'
			};
		}
		const stop = this.#nextStop();
		this.#lastError = null;
		void conductor.send(request, [], { via: 'voice' });
		if (!conductor.busy) {
			stop.cancel();
			return { status: 'error', message: 'Claude could not take the request.' };
		}
		this.#following = true;
		return this.#result(await this.#patient(stop));
	}

	/** `answer_approval`: the user's spoken yes or no, checked, then passed to the same `decide`. */
	async answer(approve: boolean, note: string | null): Promise<VoiceToolResult> {
		const conductor = this.#attach();
		const request = conductor?.approval ?? null;
		if (!conductor || !request) {
			return { status: 'no_approval', instruction: 'Nothing is waiting for approval now.' };
		}
		if (this.#asked?.id !== request.id) {
			// Not put to the user yet: ask first.
			return this.#approvalResult(request);
		}
		const heard = await this.#evidence.answerSince(this.#asked.turn, this.#transcriptWaitMs);
		if (conductor.approval?.id !== request.id) {
			return {
				status: 'no_approval',
				instruction: 'The user already answered on screen; the result comes as an update.'
			};
		}
		if (heard === null) {
			return {
				status: 'not_confirmed',
				heard: null,
				instruction: 'The user has not answered yet. Ask them, and wait for their answer.'
			};
		}
		if (approve && spokenAnswer(heard) !== 'yes') {
			return {
				status: 'not_confirmed',
				heard,
				instruction:
					'That was not a clear yes, so nothing changed. Ask again; they can also tap approve.'
			};
		}
		const stop = this.#nextStop();
		this.#following = true;
		conductor.decide(
			approve ? { kind: 'approve' } : { kind: 'reject', note: note ?? (heard || undefined) },
			{ via: 'voice' }
		);
		return this.#result(await this.#patient(stop));
	}

	/** `stop_claude`. */
	stop(): VoiceToolResult {
		const conductor = this.#conductor();
		if (!conductor?.busy) {
			return { status: 'stopped', instruction: 'Claude was not working on anything.' };
		}
		// This answer says it; the run's end needs no update of its own.
		this.#following = false;
		conductor.stop();
		return { status: 'stopped', instruction: 'Claude stopped. Nothing more was changed.' };
	}

	/** Lets go of the conductor; pending waits resolve as stopped. */
	dispose(): void {
		this.#disposed = true;
		this.#unsubscribe?.();
		this.#unsubscribe = null;
		this.#subscribed = null;
		for (const waiter of this.#waiters.splice(0)) {
			waiter({ kind: 'finished', stopReason: 'aborted', error: null });
		}
	}

	// ─── internals ────────────────────────────────────────────────────────────────────────────

	/** The conductor, with the bridge listening to its events. */
	#attach(): VoiceConductor | null {
		const conductor = this.#disposed ? null : this.#conductor();
		if (conductor !== this.#subscribed) {
			this.#unsubscribe?.();
			this.#unsubscribe = conductor ? conductor.on((event) => this.#onEvent(event)) : null;
			this.#subscribed = conductor;
			this.#following = false;
			this.#asked = null;
		}
		return conductor;
	}

	#onEvent: AgentListener = (event) => {
		switch (event.type) {
			case 'approval':
				this.#stopped({ kind: 'approval', request: event.request });
				return;
			case 'error':
				if (event.agent === 'conductor') this.#lastError = event.error;
				return;
			case 'done':
				if (event.agent !== 'conductor') return;
				this.#stopped({ kind: 'finished', stopReason: event.stopReason, error: this.#lastError });
				this.#lastError = null;
				return;
			default:
				return;
		}
	};

	#stopped(stop: Stop): void {
		const waiters = this.#waiters.splice(0);
		if (waiters.length > 0) {
			for (const waiter of waiters) waiter(stop);
			return;
		}
		// Nobody waits: a late result, spoken if the voice follows this run.
		if (this.#following && !this.#disposed) this.#onUpdate(this.#result(stop));
	}

	#nextStop(): { readonly promise: Promise<Stop>; cancel(): void } {
		let resolve: (stop: Stop) => void = () => {};
		const promise = new Promise<Stop>((r) => (resolve = r));
		this.#waiters.push(resolve);
		return {
			promise,
			cancel: () => {
				this.#waiters = this.#waiters.filter((w) => w !== resolve);
			}
		};
	}

	/** The next stop, or null when it takes longer than the voice should stay silent. */
	async #patient(stop: { readonly promise: Promise<Stop>; cancel(): void }): Promise<Stop | null> {
		let handle: unknown = null;
		const timeout = new Promise<null>((resolve) => {
			handle = this.#timers.setTimeout(() => resolve(null), this.#patienceMs);
		});
		const result = await Promise.race([stop.promise, timeout]);
		this.#timers.clearTimeout(handle);
		// Past its patience the stop arrives as an update instead.
		if (result === null) stop.cancel();
		return result;
	}

	#approvalResult(
		request: ApprovalRequest
	): Extract<VoiceToolResult, { status: 'needs_approval' }> {
		this.#following = true;
		this.#asked = { id: request.id, turn: this.#evidence.turns() };
		return {
			status: 'needs_approval',
			changes: request.actions.map(describeAction),
			instruction: APPROVAL_INSTRUCTION
		};
	}

	#result(stop: Stop | null): VoiceToolResult {
		if (stop === null) {
			return {
				status: 'working',
				instruction: 'Claude is still working on it. Tell the user; the result comes as an update.'
			};
		}
		if (stop.kind === 'approval') return this.#approvalResult(stop.request);
		this.#following = false;
		this.#asked = null;
		if (stop.stopReason === 'aborted') {
			return { status: 'stopped', instruction: 'Claude was stopped before it finished.' };
		}
		if (stop.error) return { status: 'error', message: stop.error.message };
		const conductor = this.#conductor();
		const entries = conductor?.entries ?? [];
		return {
			status: 'done',
			answer: speakable(answerOf(entries)) || 'Done.',
			changes: changesOf(entries, conductor?.revisions ?? [])
		};
	}
}
