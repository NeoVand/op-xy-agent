/**
 * The approval gate. Mutate tools wait here for the user's decision, one request per assistant
 * turn (all the changes the model asked for at once): approve, reject with a note, or approve and
 * stop asking for those tools until the page reloads ("allow for this session"). Decisions come
 * only from the user: the app's UI, or a spoken yes or no that the voice checks against the user's
 * own words (`voice/bridge.ts`; never "allow for this session"). Never from model output, tool
 * results or files.
 */
import { asksForApproval, type AnyTool } from './tools/define';
import type { ApprovalDecision, ApprovalRequest, ProposedAction } from './types';

/** Constructor options. */
export interface PolicyGateOptions {
	/** Shows the request to the user and resolves with their decision. */
	readonly requestApproval: (request: ApprovalRequest) => Promise<ApprovalDecision>;
	/** Approve everything without asking (headless tests and smoke runs only). */
	readonly autoApprove?: boolean;
	/** Request ids (injectable for tests). */
	readonly makeId?: () => string;
}

let counter = 0;

/** Per-session approval policy. */
export class PolicyGate {
	readonly #requestApproval: PolicyGateOptions['requestApproval'];
	readonly #autoApprove: boolean;
	readonly #makeId: () => string;
	readonly #grants = new Set<string>();

	constructor(options: PolicyGateOptions) {
		this.#requestApproval = options.requestApproval;
		this.#autoApprove = options.autoApprove ?? false;
		this.#makeId = options.makeId ?? (() => `approval-${Date.now().toString(36)}-${++counter}`);
	}

	/** Whether a call to this tool must wait for the user right now. */
	needsApproval(tool: AnyTool): boolean {
		return asksForApproval(tool) && !this.#autoApprove && !this.#grants.has(tool.name);
	}

	/** Tools the user allowed for this session. */
	get grants(): string[] {
		return [...this.#grants].sort();
	}

	/** Asks for these tools again. */
	revoke(tool?: string): void {
		if (tool === undefined) this.#grants.clear();
		else this.#grants.delete(tool);
	}

	/**
	 * Asks the user about a set of changes. Resolves `cancelled` if `signal` aborts first. An
	 * "allow for this session" decision grants every tool in the request.
	 */
	async review(
		agent: string,
		actions: readonly ProposedAction[],
		signal?: AbortSignal
	): Promise<{ request: ApprovalRequest | null; decision: ApprovalDecision }> {
		if (actions.length === 0 || this.#autoApprove) {
			return { request: null, decision: { kind: 'approve' } };
		}
		const request: ApprovalRequest = { id: this.#makeId(), agent, actions };
		if (signal?.aborted) return { request, decision: { kind: 'cancelled' } };
		const decision = await new Promise<ApprovalDecision>((resolve) => {
			const onAbort = () => resolve({ kind: 'cancelled' });
			signal?.addEventListener('abort', onAbort, { once: true });
			this.#requestApproval(request).then(
				(value) => {
					signal?.removeEventListener('abort', onAbort);
					resolve(value);
				},
				() => {
					signal?.removeEventListener('abort', onAbort);
					resolve({ kind: 'cancelled' });
				}
			);
		});
		if (decision.kind === 'allow-session') {
			for (const action of actions) this.#grants.add(action.tool);
		}
		return { request, decision };
	}
}

/** Whether a decision lets the changes through. */
export function isApproved(decision: ApprovalDecision): boolean {
	return decision.kind === 'approve' || decision.kind === 'allow-session';
}
