/**
 * A conductor stand-in for voice tests: the chat as reactive state and scripted replies. A reply
 * answers at once, or first asks approval for changes (answered through `decide`, as the approval
 * sheet does), or waits until the test calls `finish()` (a long request). Test-only; the app never
 * imports it. The real conductor is covered with voice in `bridge.spec.ts`.
 */
import type { PreparedAttachment } from '$lib/agent/attachments';
import { entryId, type ChatEntry } from '$lib/agent/chat';
import type {
	ConductorStatus,
	DecideOptions,
	SendOptions,
	VoiceLineInput
} from '$lib/agent/conductor.svelte';
import type {
	AgentEvent,
	AgentListener,
	ApprovalDecision,
	ApprovalRequest,
	ProposedAction,
	Revision
} from '$lib/agent/types';
import type { VoiceConductor } from '../bridge';

/** How the fake answers one request. */
export interface FakeReply {
	/** The answer (markdown, like Claude's). */
	readonly answer: string;
	/** Changes to ask approval for before answering (their labels). */
	readonly changes?: readonly string[];
	/** The answer when the changes are rejected. */
	readonly rejected?: string;
	/** Wait for `finish()` before answering. */
	readonly hold?: boolean;
}

export class FakeConductor implements VoiceConductor {
	status: ConductorStatus = $state('idle');
	entries: ChatEntry[] = $state([]);
	approval: ApprovalRequest | null = $state.raw(null);
	revisions: Revision[] = $state.raw([]);
	/** What `send` received. */
	readonly sent: { readonly text: string; readonly options: SendOptions }[] = [];
	/** What `decide` received. */
	readonly decisions: { readonly decision: ApprovalDecision; readonly options: DecideOptions }[] =
		[];
	stops = 0;
	readonly #reply: (text: string) => FakeReply;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #listeners = new Set<AgentListener>();
	#resolveApproval: ((decision: ApprovalDecision) => void) | null = null;
	#release: (() => void) | null = null;
	#stopped = false;
	#count = 0;

	constructor(reply: (text: string) => FakeReply = () => ({ answer: 'Done.' })) {
		this.#reply = reply;
	}

	get busy(): boolean {
		return this.status === 'running' || this.status === 'approval';
	}

	on(listener: AgentListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	async send(
		text: string,
		attachments: readonly PreparedAttachment[] = [],
		options: SendOptions = {}
	): Promise<void> {
		if (attachments.length > 0) throw new Error('the voice never sends files');
		if (this.busy || !text.trim()) return;
		this.sent.push({ text, options });
		this.entries.push({
			kind: 'user',
			id: entryId('user'),
			text,
			...(options.via ? { via: options.via } : {})
		});
		this.status = 'running';
		this.#stopped = false;
		const reply = this.#reply(text);
		await Promise.resolve();
		let answer = reply.answer;
		if (reply.changes && reply.changes.length > 0) {
			const n = ++this.#count;
			const actions: ProposedAction[] = reply.changes.map((label, i) => ({
				toolCallId: `toolu_${n}_${i}`,
				tool: 'set_tempo',
				toolLabel: 'set tempo',
				input: {},
				preview: { label }
			}));
			const request: ApprovalRequest = { id: `approval-${n}`, agent: 'conductor', actions };
			const decision = await new Promise<ApprovalDecision>((resolve) => {
				this.#resolveApproval = resolve;
				this.approval = request;
				this.status = 'approval';
				this.#emit({ type: 'approval', request });
			});
			if (decision.kind === 'cancelled') return this.#finish('aborted');
			if (decision.kind === 'reject') answer = reply.rejected ?? 'Left it as it was.';
			else {
				for (const action of actions) this.#applied(action);
			}
		}
		if (reply.hold && !this.#stopped)
			await new Promise<void>((resolve) => (this.#release = resolve));
		if (this.#stopped) return this.#finish('aborted');
		this.entries.push({
			kind: 'text',
			id: entryId('text'),
			agent: 'conductor',
			parent: null,
			text: answer,
			citations: []
		});
		this.#finish('end_turn');
	}

	decide(decision: ApprovalDecision, options: DecideOptions = {}): void {
		const request = this.approval;
		const resolve = this.#resolveApproval;
		if (!request || !resolve) return;
		this.decisions.push({ decision, options });
		this.approval = null;
		this.#resolveApproval = null;
		this.status = 'running';
		this.entries.push({
			kind: 'approval',
			id: entryId('approval'),
			outcome:
				decision.kind === 'approve'
					? 'approved'
					: decision.kind === 'allow-session'
						? 'allowed'
						: decision.kind === 'reject'
							? 'rejected'
							: 'cancelled',
			labels: request.actions.map((a) => a.preview.label),
			note: decision.kind === 'reject' ? (decision.note ?? null) : null,
			...(options.via ? { via: options.via } : {})
		});
		this.#emit({ type: 'approval_resolved', id: request.id, decision });
		resolve(decision);
	}

	stop(): void {
		this.stops++;
		this.#stopped = true;
		if (this.#resolveApproval) this.decide({ kind: 'cancelled' });
		this.#release?.();
	}

	/** Lets a held reply answer. */
	finish(): void {
		this.#release?.();
		this.#release = null;
	}

	voiceLine(line: VoiceLineInput): void {
		const id = `voice-${line.id}`;
		const index = this.entries.findIndex((e) => e.id === id);
		const empty = !line.live && !line.text.trim();
		const entry = index < 0 ? null : this.entries[index];
		if (entry?.kind === 'voice') {
			if (empty) this.entries.splice(index, 1);
			else {
				entry.text = line.text;
				entry.live = line.live;
				entry.interrupted = line.interrupted;
			}
		} else if (!empty) {
			this.entries.push({ ...line, kind: 'voice', id });
		}
	}

	#applied(action: ProposedAction): void {
		const rev = this.revisions.length + 1;
		this.revisions = [
			...this.revisions,
			{
				rev,
				tool: action.tool,
				label: action.preview.label,
				input: action.input,
				inverse: null,
				before: null,
				after: null,
				firmware: null,
				toolCallId: action.toolCallId,
				agent: 'conductor',
				threadId: 'thread-fake',
				session: 'session-fake',
				at: rev,
				undoes: null,
				undoneBy: null
			}
		];
		this.entries.push({
			kind: 'tool',
			id: action.toolCallId,
			agent: 'conductor',
			parent: null,
			name: action.tool,
			label: action.toolLabel,
			toolKind: 'mutate',
			status: 'ok',
			input: action.input,
			summary: action.preview.label
		});
	}

	#finish(stopReason: string): void {
		this.status = 'idle';
		if (stopReason === 'aborted') {
			this.#emit({
				type: 'error',
				agent: 'conductor',
				error: { code: 'aborted', message: 'Stopped.', retryable: true }
			});
		}
		this.#emit({ type: 'done', agent: 'conductor', stopReason });
	}

	#emit(event: AgentEvent): void {
		for (const listener of this.#listeners) listener(event);
	}
}
