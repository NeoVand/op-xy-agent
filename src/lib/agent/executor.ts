/**
 * Runs the tool calls of one assistant turn through the policy gate:
 *
 * 1. validate every input with zod (strict schemas cannot carry ranges);
 * 2. ask the user once for all the changes that need approval (mutate tools);
 * 3. run read and UI tools concurrently, and every device tool on the single-flight queue in the
 *    order the model wrote them (a queued change waits for its approval inside its slot, so later
 *    device calls never overtake it); panic skips the queue and interrupts it;
 * 4. journal every applied reversible change with its inverse, before/after and firmware;
 * 5. return one `tool_result` per call, in call order, for a single user message.
 *
 * Tools never throw at the model: failures, rejections and stops become `is_error` results that
 * say what happened and that nothing (more) was sent.
 */
import type { BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { isApproved, type PolicyGate } from './policy';
import { QueueAbortedError, type DeviceQueue } from './queue';
import type { Journal } from './journal';
import {
	ToolAbortedError,
	type AgentEnvironment,
	type AnyTool,
	type ParsedCall,
	type ToolRegistry,
	type ToolResult
} from './tools/define';
import { UNDO_CALL_PREFIX } from './tools/device';
import type {
	AgentEvent,
	AgentName,
	ApprovalDecision,
	ProposedAction,
	Revision,
	ToolPreview
} from './types';

/** One `tool_use` block. */
export interface ToolCallRequest {
	readonly id: string;
	readonly name: string;
	readonly input: unknown;
}

/** Constructor options. */
export interface ToolExecutorOptions {
	readonly gate: PolicyGate;
	readonly queue: DeviceQueue;
	readonly journal: Journal;
	readonly emit: (event: AgentEvent) => void;
	/** Firmware of the connected device, for the journal. */
	readonly firmware: () => string | null;
	/** Longest string result handed to the model (default 24 000 characters). */
	readonly maxResultChars?: number;
}

/** Arguments of {@link ToolExecutor.execute}. */
export interface ExecuteArgs {
	readonly agent: AgentName;
	readonly registry: ToolRegistry;
	readonly calls: readonly ToolCallRequest[];
	readonly env: AgentEnvironment;
	readonly signal: AbortSignal;
	/** The `task` call a subagent runs under, for nesting in the UI. */
	readonly parent?: string | null;
}

/** Result of an undo. */
export type UndoOutcome =
	| { readonly ok: true; readonly revision: Revision; readonly summary: string }
	| { readonly ok: false; readonly message: string };

type Status = 'ok' | 'error' | 'rejected' | 'stopped';

interface Outcome {
	readonly result: ToolResult;
	readonly status: Status;
}

const STOPPED_TEXT =
	'Stopped before it finished (the user pressed stop, or panic interrupted device work). Nothing more was sent.';

function isAbort(error: unknown, signal?: AbortSignal): boolean {
	return (
		error instanceof ToolAbortedError ||
		error instanceof QueueAbortedError ||
		(error instanceof Error && error.name === 'AbortError') ||
		(signal?.aborted ?? false)
	);
}

function rejectionText(decision: ApprovalDecision): string {
	if (decision.kind === 'reject') {
		const note = decision.note?.trim();
		return `The user rejected this change in the app${note ? `, with this note: "${note}"` : ''}. Nothing was sent to the device.`;
	}
	return 'The run was stopped before the user decided. Nothing was sent to the device.';
}

function defaultPreview(tool: AnyTool, input: unknown): ToolPreview {
	return { label: `${tool.label} ${JSON.stringify(input)}` };
}

/** Executes tool calls with approvals, the device queue and the journal. */
export class ToolExecutor {
	readonly #gate: PolicyGate;
	readonly #queue: DeviceQueue;
	readonly #journal: Journal;
	readonly #emit: (event: AgentEvent) => void;
	readonly #firmware: () => string | null;
	readonly #maxChars: number;

	constructor(options: ToolExecutorOptions) {
		this.#gate = options.gate;
		this.#queue = options.queue;
		this.#journal = options.journal;
		this.#emit = options.emit;
		this.#firmware = options.firmware;
		this.#maxChars = options.maxResultChars ?? 24_000;
	}

	/** Runs one turn's calls; resolves with their results in call order. Never rejects. */
	async execute(args: ExecuteArgs): Promise<BetaToolResultBlockParam[]> {
		const { agent, registry, calls, env, signal } = args;
		const parent = args.parent ?? null;
		const prepared = calls.map((call) => ({ call, parsed: registry.parse(call.name, call.input) }));

		for (const { call, parsed } of prepared) {
			this.#emit({
				type: 'tool_start',
				agent,
				id: call.id,
				name: call.name,
				label: parsed.tool?.label ?? call.name,
				kind: parsed.tool?.kind ?? 'read',
				input: call.input,
				parent
			});
		}

		const needing = new Set<string>();
		const actions: ProposedAction[] = [];
		for (const { call, parsed } of prepared) {
			if (!parsed.ok || !this.#gate.needsApproval(parsed.tool)) continue;
			needing.add(call.id);
			const tool = parsed.tool;
			let preview: ToolPreview;
			try {
				const before = tool.snapshot?.(parsed.input, env);
				preview = tool.preview?.(parsed.input, before, env) ?? defaultPreview(tool, parsed.input);
			} catch {
				preview = defaultPreview(tool, parsed.input);
			}
			actions.push({
				toolCallId: call.id,
				tool: tool.name,
				toolLabel: tool.label,
				input: parsed.input as Record<string, unknown>,
				preview
			});
		}
		const review =
			actions.length > 0
				? this.#gate.review(agent, actions, signal).then((r) => r.decision)
				: Promise.resolve<ApprovalDecision>({ kind: 'approve' });

		const settle = async ({ call, parsed }: (typeof prepared)[number]): Promise<Outcome> => {
			const outcome = await this.#outcome(call, parsed, needing, review, agent, env, signal);
			// Each chip settles when its own call does: a quick call next to a long one (a subagent,
			// a queued device job) must not look busy until the slowest finishes.
			this.#emit({
				type: 'tool_end',
				agent,
				id: call.id,
				name: call.name,
				status: outcome.status,
				summary: outcome.result.summary,
				parent,
				...(outcome.result.display ? { display: outcome.result.display } : {})
			});
			return outcome;
		};
		const outcomes = await Promise.all(prepared.map(settle));
		return prepared.map(({ call }, i) => this.#block(call.id, outcomes[i].result));
	}

	/** Runs one call (waiting for its approval inside its queue slot); never rejects. */
	async #outcome(
		call: ToolCallRequest,
		parsed: ParsedCall,
		needing: ReadonlySet<string>,
		review: Promise<ApprovalDecision>,
		agent: AgentName,
		env: AgentEnvironment,
		signal: AbortSignal
	): Promise<Outcome> {
		if (!parsed.ok) {
			return {
				status: 'error',
				result: { content: parsed.error, summary: 'invalid input', isError: true }
			};
		}
		const tool = parsed.tool;
		const job = async (jobSignal: AbortSignal): Promise<Outcome> => {
			if (needing.has(call.id)) {
				const decision = await review;
				if (!isApproved(decision)) {
					return {
						status: decision.kind === 'reject' ? 'rejected' : 'stopped',
						result: {
							content: rejectionText(decision),
							summary: decision.kind === 'reject' ? 'rejected' : 'stopped',
							isError: true,
							applied: false
						}
					};
				}
			}
			return this.#run(tool, parsed.input, call.id, agent, env, jobSignal, null);
		};
		try {
			if (tool.device && !tool.priority) return await this.#queue.run(tool.label, job, signal);
			return await job(signal);
		} catch (error) {
			if (isAbort(error, signal)) {
				return {
					status: 'stopped',
					result: { content: STOPPED_TEXT, summary: 'stopped', isError: true }
				};
			}
			const message = error instanceof Error ? error.message : String(error);
			return {
				status: 'error',
				result: { content: `The tool failed: ${message}`, summary: 'failed', isError: true }
			};
		}
	}

	/**
	 * Undoes a revision: runs its inverse on the device queue on the user's behalf and journals it
	 * (the new revision can itself be undone, which redoes the change).
	 */
	async undo(rev: number, registry: ToolRegistry, env: AgentEnvironment): Promise<UndoOutcome> {
		const blocker = this.#journal.undoBlocker(rev);
		if (blocker) return { ok: false, message: blocker };
		const revision = this.#journal.get(rev);
		const inverse = revision?.inverse;
		if (!revision || !inverse) return { ok: false, message: `revision ${rev} cannot be undone` };
		const parsed = registry.parse(inverse.tool, inverse.input);
		if (!parsed.ok) return { ok: false, message: parsed.error };
		const callId = `${UNDO_CALL_PREFIX}${rev}`;
		try {
			const outcome = await this.#queue.run(`undo ${rev}`, (signal) =>
				this.#run(parsed.tool, parsed.input, callId, 'user', env, signal, rev)
			);
			if (outcome.status !== 'ok') return { ok: false, message: String(outcome.result.content) };
			const undo = this.#journal.list().find((r) => r.undoes === rev && r.toolCallId === callId);
			if (!undo) return { ok: false, message: 'the undo was sent but not recorded' };
			return { ok: true, revision: undo, summary: outcome.result.summary };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async #run(
		tool: AnyTool,
		input: unknown,
		toolCallId: string,
		agent: AgentName,
		env: AgentEnvironment,
		signal: AbortSignal,
		undoes: number | null
	): Promise<Outcome> {
		const before = tool.snapshot?.(input, env);
		const inverse = tool.inverse?.(input, before, env) ?? null;
		const preview = tool.preview?.(input, before, env) ?? null;
		const result = await tool.run(input, { toolCallId, agent, signal, env });
		if (result.isError) return { status: 'error', result };
		// a tool whose undo is known only after it ran hands it back with the result
		const undo = result.inverse !== undefined ? result.inverse : inverse;
		if (tool.kind === 'mutate' && (tool.inverse || undo) && result.applied !== false) {
			const revision = this.#journal.record({
				tool: tool.name,
				label: preview?.label ?? tool.label,
				input: input as Record<string, unknown>,
				inverse: undo,
				before: before ?? null,
				after: result.after ?? null,
				firmware: this.#firmware(),
				toolCallId,
				agent,
				undoes
			});
			this.#emit({ type: 'revision', revision });
		}
		return { status: 'ok', result };
	}

	#block(toolUseId: string, result: ToolResult): BetaToolResultBlockParam {
		const content =
			typeof result.content === 'string'
				? result.content.length > this.#maxChars
					? `${result.content.slice(0, this.#maxChars)}\n[truncated]`
					: result.content
				: [...result.content];
		return {
			type: 'tool_result',
			tool_use_id: toolUseId,
			content,
			...(result.isError ? { is_error: true } : {})
		};
	}
}
