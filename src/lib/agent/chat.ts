/**
 * The chat as the UI shows it, built from the agent's event stream by a pure reducer: user
 * messages, streamed answer segments with their citations, progress notes, tool-call chips (nested
 * under the `task` call for subagents), notices and approval records. Plain data, so a thread can be
 * stored in IndexedDB and shown again after a reload.
 */
import type { AttachmentView } from './attachments';
import type { TokenCounts } from './models';
import type { AgentErrorInfo, AgentEvent, Citation, ToolDisplay, ToolKind } from './types';
import type { ReplicaChange } from './virtual-opxy';

/** Tool chip state. */
export type ToolStatus = 'pending' | 'running' | 'ok' | 'error' | 'rejected' | 'stopped';

/** One item in the chat. */
export type ChatEntry =
	| {
			readonly kind: 'user';
			readonly id: string;
			text: string;
			/** Files sent with the message (what the chat shows of them). */
			attachments?: AttachmentView[];
			/** Handed over by the voice front end (M8): the request as the voice passed it on. */
			via?: 'voice';
	  }
	/** A spoken line (M8): what the mic heard, or what the voice said. Shown, never sent to Claude. */
	| {
			readonly kind: 'voice';
			readonly id: string;
			readonly role: 'user' | 'assistant';
			text: string;
			/** Still being transcribed or spoken. */
			live: boolean;
			/** The user talked over it. */
			interrupted: boolean;
	  }
	| {
			readonly kind: 'text';
			readonly id: string;
			readonly agent: string;
			readonly parent: string | null;
			text: string;
			citations: Citation[];
	  }
	| {
			readonly kind: 'progress';
			readonly id: string;
			readonly agent: string;
			readonly parent: string | null;
			text: string;
	  }
	| {
			readonly kind: 'tool';
			readonly id: string;
			readonly agent: string;
			readonly parent: string | null;
			readonly name: string;
			label: string;
			toolKind: ToolKind;
			status: ToolStatus;
			input: unknown;
			summary: string;
			/** What its result shows under the chip (a lab run's takes). */
			display?: ToolDisplay;
	  }
	| {
			readonly kind: 'notice';
			readonly id: string;
			readonly tone: 'info' | 'error';
			readonly text: string;
			readonly code: AgentErrorInfo['code'] | null;
	  }
	/** What a turn changed on the replica (the grounding list), shown once the turn ends. */
	| {
			readonly kind: 'changes';
			readonly id: string;
			readonly lines: readonly string[];
			/** The same changes briefly, with the keys that lead to each (absent in older threads). */
			readonly changes?: readonly ReplicaChange[];
			/** Whether the turn can be taken back (`ready`) or put back (`undone`); absent after a reload. */
			undo?: 'ready' | 'undone';
	  }
	| {
			readonly kind: 'approval';
			readonly id: string;
			readonly outcome: 'approved' | 'allowed' | 'rejected' | 'cancelled';
			readonly labels: readonly string[];
			readonly note: string | null;
			/** Answered by voice (a spoken yes or no) rather than on screen. */
			readonly via?: 'voice';
	  };

/** Running totals for the cost meter. */
export interface UsageTotals extends TokenCounts {
	/** USD spent in this thread (models with a known price). */
	usd: number;
	/** Some responses came from a model without a known price. */
	unknownCost: boolean;
	/** Model calls. */
	calls: number;
}

/** Zeroed totals. */
export function emptyUsage(): UsageTotals {
	return { usd: 0, unknownCost: false, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/** Longest progress note kept per block (the UI shows the tail). */
const PROGRESS_LIMIT = 1200;

let entryCounter = 0;

/** A unique id for entries that do not come with one. */
export function entryId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${++entryCounter}`;
}

function findEntry<K extends ChatEntry['kind']>(
	entries: ChatEntry[],
	kind: K,
	id: string
): Extract<ChatEntry, { kind: K }> | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.kind === kind && entry.id === id) return entry as Extract<ChatEntry, { kind: K }>;
	}
	return undefined;
}

/**
 * Applies one event to the chat (mutating `entries` and `usage` in place, so a Svelte `$state`
 * proxy updates only what changed). Subagent events keep their `parent` (the `task` call id).
 * @param parentOf maps a subagent name to the task call it runs under
 */
export function applyEvent(
	entries: ChatEntry[],
	usage: UsageTotals,
	event: AgentEvent,
	parentOf: (agent: string) => string | null = () => null
): void {
	switch (event.type) {
		case 'text': {
			const id = `${event.turn}:${event.block}`;
			const existing = findEntry(entries, 'text', id);
			if (existing) existing.text += event.delta;
			else
				entries.push({
					kind: 'text',
					id,
					agent: event.agent,
					parent: parentOf(event.agent),
					text: event.delta,
					citations: []
				});
			return;
		}
		case 'text_replace': {
			const entry = findEntry(entries, 'text', `${event.turn}:${event.block}`);
			if (!entry) return;
			if (event.text) entry.text = event.text;
			else entries.splice(entries.indexOf(entry), 1);
			return;
		}
		case 'citation': {
			const entry = findEntry(entries, 'text', `${event.turn}:${event.block}`);
			if (!entry) return;
			const { citation } = event;
			if (!entry.citations.some((c) => c.source === citation.source))
				entry.citations.push(citation);
			return;
		}
		case 'progress': {
			const id = `${event.turn}:${event.block}:progress`;
			const existing = findEntry(entries, 'progress', id);
			if (existing) {
				const text = existing.text + event.delta;
				existing.text = text.length > PROGRESS_LIMIT ? text.slice(-PROGRESS_LIMIT) : text;
			} else {
				entries.push({
					kind: 'progress',
					id,
					agent: event.agent,
					parent: parentOf(event.agent),
					text: event.delta
				});
			}
			return;
		}
		case 'tool_pending': {
			if (findEntry(entries, 'tool', event.id)) return;
			entries.push({
				kind: 'tool',
				id: event.id,
				agent: event.agent,
				parent: event.parent,
				name: event.name,
				label: event.label,
				toolKind: 'read',
				status: 'pending',
				input: null,
				summary: ''
			});
			return;
		}
		case 'tool_input': {
			// A preview while the call is being written; tool_start brings the final input.
			const existing = findEntry(entries, 'tool', event.id);
			if (existing?.status === 'pending') existing.input = event.input;
			return;
		}
		case 'tool_start': {
			const existing = findEntry(entries, 'tool', event.id);
			if (existing) {
				existing.label = event.label;
				existing.toolKind = event.kind;
				existing.status = 'running';
				existing.input = event.input;
			} else {
				entries.push({
					kind: 'tool',
					id: event.id,
					agent: event.agent,
					parent: event.parent,
					name: event.name,
					label: event.label,
					toolKind: event.kind,
					status: 'running',
					input: event.input,
					summary: ''
				});
			}
			return;
		}
		case 'tool_end': {
			const existing = findEntry(entries, 'tool', event.id);
			if (!existing) return;
			existing.status = event.status;
			existing.summary = event.summary;
			if (event.display) existing.display = event.display;
			return;
		}
		case 'usage': {
			const { tokens, usd } = event.report;
			usage.calls++;
			usage.input += tokens.input;
			usage.output += tokens.output;
			usage.cacheRead += tokens.cacheRead;
			usage.cacheWrite += tokens.cacheWrite;
			if (usd === null) usage.unknownCost = true;
			else usage.usd += usd;
			return;
		}
		case 'notice':
			if (event.agent !== 'conductor') return;
			entries.push({
				kind: 'notice',
				id: entryId('notice'),
				tone: 'info',
				text: event.text,
				code: null
			});
			return;
		case 'error':
			if (event.agent !== 'conductor') return;
			entries.push({
				kind: 'notice',
				id: entryId('error'),
				tone: event.error.code === 'aborted' ? 'info' : 'error',
				text: event.error.message,
				code: event.error.code
			});
			return;
		case 'approval_resolved':
		case 'approval':
		case 'revision':
		case 'todos':
		case 'turn':
		case 'done':
			return;
	}
}

/**
 * Marks tool chips that never finished (the page was closed mid-run) as stopped. With `voice`
 * (a stored thread being opened), spoken lines saved mid-sentence are finished as well.
 */
export function settleEntries(
	entries: ChatEntry[],
	options: { readonly voice?: boolean } = {}
): void {
	for (const entry of entries) {
		if (entry.kind === 'tool' && (entry.status === 'pending' || entry.status === 'running')) {
			entry.status = 'stopped';
			if (!entry.summary) entry.summary = 'stopped';
		} else if (options.voice && entry.kind === 'voice' && entry.live) {
			entry.live = false;
		}
	}
}
