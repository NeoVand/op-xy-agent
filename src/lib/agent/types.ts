/**
 * Shared types of the agent layer: the typed event stream the conductor emits (research note
 * docs/research/70-agent-harness.md §4), plan items, approval requests, revisions and errors.
 * Plain data only, so everything here survives `structuredClone` into IndexedDB.
 */
import type { TokenCounts } from './models';

/** Which agent produced something: the conductor or a subagent name (`manual-expert`). */
export type AgentName = string;

/** A plan item (`write_todos`). */
export interface Todo {
	readonly content: string;
	readonly status: 'pending' | 'in_progress' | 'completed';
}

/** How a tool relates to the world; decides its default policy and how the UI draws it. */
export type ToolKind = 'read' | 'ui' | 'propose' | 'mutate';

/** What a proposed change will do, for the approval sheet and the revision list. */
export interface ToolPreview {
	/** One lowercase line: "tempo 120 → 96 bpm". */
	readonly label: string;
	/** State before, when known ("120 bpm"); null when the app cannot know it. */
	readonly before?: string | null;
	/** State after ("96 bpm"). */
	readonly after?: string | null;
	/** A caveat worth reading before approving. */
	readonly note?: string | null;
}

/** A tool call that undoes another one. */
export interface InverseCall {
	readonly tool: string;
	readonly input: Readonly<Record<string, unknown>>;
	/** "tempo back to 120 bpm". */
	readonly label: string;
	/** True when the previous state was assumed rather than known (e.g. a mute state never sent). */
	readonly assumed?: boolean;
}

/** One tool call waiting for the user's decision. */
export interface ProposedAction {
	readonly toolCallId: string;
	readonly tool: string;
	/** Friendly tool label ("set tempo"). */
	readonly toolLabel: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly preview: ToolPreview;
}

/** Changes the agent wants to make, shown in the approval sheet; one per assistant turn. */
export interface ApprovalRequest {
	readonly id: string;
	readonly agent: AgentName;
	readonly actions: readonly ProposedAction[];
}

/** The user's answer to an approval request. */
export type ApprovalDecision =
	| { readonly kind: 'approve' }
	/** Also stops asking for these tools until the page is reloaded. */
	| { readonly kind: 'allow-session' }
	| { readonly kind: 'reject'; readonly note?: string }
	/** The run was stopped before the user answered. */
	| { readonly kind: 'cancelled' };

/** One applied device change, reversible when `inverse` is set. */
export interface Revision {
	readonly rev: number;
	readonly tool: string;
	/** "tempo 120 → 96 bpm". */
	readonly label: string;
	readonly input: Readonly<Record<string, unknown>>;
	readonly inverse: InverseCall | null;
	readonly before: unknown;
	readonly after: unknown;
	/** Device firmware when the change was sent (e.g. `1.1.33`), null when unknown. */
	readonly firmware: string | null;
	readonly toolCallId: string;
	readonly agent: AgentName;
	readonly threadId: string;
	/** The page session it happened in; undo is offered only in the same session. */
	readonly session: string;
	/** Epoch ms. */
	readonly at: number;
	/** The revision this one undid, if it is an undo. */
	readonly undoes: number | null;
	/** Set when a later revision undid this one. */
	undoneBy: number | null;
}

/** A normalised failure the UI can explain. */
export interface AgentErrorInfo {
	readonly code:
		| 'auth'
		| 'permission'
		| 'rate-limit'
		| 'overloaded'
		| 'network'
		| 'refusal'
		| 'bad-request'
		| 'context'
		| 'max-tokens'
		| 'aborted'
		| 'unknown';
	/** One or two plain sentences for the user. */
	readonly message: string;
	/** Seconds to wait before retrying, when the API said so. */
	readonly retryAfter?: number | null;
	/** Whether a retry can help. */
	readonly retryable: boolean;
}

/** A source the model cited (search-result citations). */
export interface Citation {
	readonly title: string;
	readonly source: string;
	readonly citedText: string;
}

/** Usage of one model response, with its cost. */
export interface UsageReport {
	readonly agent: AgentName;
	readonly model: string;
	readonly tokens: TokenCounts;
	/** USD, null when the price is unknown. */
	readonly usd: number | null;
}

/** Everything the conductor reports while it works. */
export type AgentEvent =
	| {
			readonly type: 'turn';
			readonly agent: AgentName;
			readonly turn: string;
			readonly model: string;
	  }
	| {
			readonly type: 'text';
			readonly agent: AgentName;
			readonly turn: string;
			readonly block: number;
			readonly delta: string;
	  }
	| {
			readonly type: 'citation';
			readonly agent: AgentName;
			readonly turn: string;
			readonly block: number;
			readonly citation: Citation;
	  }
	/**
	 * Replaces a streamed text block: a runaway answer cut back to the part before it ran away, or
	 * (empty) a working note taken out of the answer on its way to the progress notes.
	 */
	| {
			readonly type: 'text_replace';
			readonly agent: AgentName;
			readonly turn: string;
			readonly block: number;
			readonly text: string;
	  }
	/** Progress notes (thinking blocks with display "updates", or summaries). */
	| {
			readonly type: 'progress';
			readonly agent: AgentName;
			readonly turn: string;
			readonly block: number;
			readonly delta: string;
	  }
	/** The model started writing a tool call (input still streaming). */
	| {
			readonly type: 'tool_pending';
			readonly agent: AgentName;
			readonly id: string;
			readonly name: string;
			/** Friendly tool label ("set tempo"). */
			readonly label: string;
			readonly parent: string | null;
	  }
	/** The input of a tool call being written, parsed as far as it has streamed (a preview). */
	| {
			readonly type: 'tool_input';
			readonly agent: AgentName;
			readonly id: string;
			readonly input: unknown;
			readonly parent: string | null;
	  }
	| {
			readonly type: 'tool_start';
			readonly agent: AgentName;
			readonly id: string;
			readonly name: string;
			readonly label: string;
			readonly kind: ToolKind;
			readonly input: unknown;
			readonly parent: string | null;
	  }
	| {
			readonly type: 'tool_end';
			readonly agent: AgentName;
			readonly id: string;
			readonly name: string;
			readonly status: 'ok' | 'error' | 'rejected' | 'stopped';
			readonly summary: string;
			readonly parent: string | null;
	  }
	| { readonly type: 'todos'; readonly items: readonly Todo[] }
	| { readonly type: 'approval'; readonly request: ApprovalRequest }
	| {
			readonly type: 'approval_resolved';
			readonly id: string;
			readonly decision: ApprovalDecision;
	  }
	| { readonly type: 'revision'; readonly revision: Revision }
	| { readonly type: 'usage'; readonly report: UsageReport }
	/** Something worth telling the user that is not an error (a fallback model answered…). */
	| { readonly type: 'notice'; readonly agent: AgentName; readonly text: string }
	| { readonly type: 'error'; readonly agent: AgentName; readonly error: AgentErrorInfo }
	| {
			readonly type: 'done';
			readonly agent: AgentName;
			readonly stopReason: string | null;
	  };

/** Listener for the event stream. */
export type AgentListener = (event: AgentEvent) => void;
