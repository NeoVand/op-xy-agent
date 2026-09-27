/**
 * The conductor: the app's agent, running in the browser on the Anthropic SDK with the user's own
 * key (decision D4: our own small harness, shaped like Deep Agents).
 *
 * It owns one conversation at a time and exposes it as reactive state for the agent panel: the
 * chat, the plan (`write_todos`), the pending approval, the revision journal with undo, the cost
 * meter and the model picker. Underneath:
 *
 * - `runLoop` streams the Messages API with the frozen, cached system prefix
 *   (role + device facts + manual bundle) and an append-only transcript;
 * - the `ToolExecutor` gates every tool call: approvals for mutate tools, the single-flight device
 *   queue for anything that sends MIDI, the journal for reversible changes;
 * - `task` runs subagents (the manual expert) in fresh nested loops;
 * - live device state reaches the model as a device note, added only when it changed;
 * - threads persist in IndexedDB.
 *
 * Everything is injected (client, device stack, replica, manual, store, timers), so the whole
 * conductor runs headless in Node against the fake OP-XY (`test/fakes`) and a scripted client.
 */
import type {
	BetaMessageParam,
	BetaTextBlockParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { DeviceStack } from '$lib/device';
import type { ReplicaState } from '$lib/replica';
import {
	applyEvent,
	emptyUsage,
	entryId,
	settleEntries,
	type ChatEntry,
	type UsageTotals
} from './chat';
import type { ModelClient } from './client';
import { describeDevice, deviceSnapshot } from './device-state';
import { normalizeError } from './errors';
import { ToolExecutor } from './executor';
import { Journal } from './journal';
import {
	arrayTranscript,
	createQuirks,
	runLoop,
	type Effort,
	type ModelQuirks,
	type Transcript
} from './loop';
import type { ManualEntry, ManualSource, ManualSourceKind } from './manual-source';
import { DEFAULT_CONDUCTOR_MODEL, modelOptions, type ModelOption } from './models';
import { PolicyGate } from './policy';
import { CONDUCTOR_ROLE, systemBlocks } from './prompts';
import { DeviceQueue } from './queue';
import { SUBAGENTS, parentOf, subagentName, type SubagentSpec } from './subagents';
import { titleFrom, type ThreadRecord, type ThreadStore, type ThreadSummary } from './threads';
import {
	createConductorRegistry,
	type AgentEnvironment,
	type AgentTimers,
	type SubagentResult,
	type ToolContext,
	type ToolRegistry
} from './tools';
import type {
	AgentErrorInfo,
	AgentEvent,
	AgentListener,
	ApprovalDecision,
	ApprovalRequest,
	Revision,
	Todo
} from './types';

/** Where the conductor stands. */
export type ConductorStatus = 'idle' | 'running' | 'approval' | 'error';

/** A tiny key-value store for preferences (localStorage in the browser). */
export interface PreferenceStore {
	get(key: string): string | null;
	set(key: string, value: string | null): void;
}

/** Everything the conductor depends on. */
export interface ConductorOptions {
	readonly client: ModelClient;
	readonly device: DeviceStack | null;
	readonly replica: ReplicaState | null;
	readonly manual: ManualSource;
	readonly store: ThreadStore;
	/** Remembers the last thread and the chosen model; memory-only when absent. */
	readonly preferences?: PreferenceStore;
	readonly timers?: AgentTimers;
	/** Conductor model (default: the saved preference, else `claude-opus-5-5`). */
	readonly model?: string;
	/** Model for every subagent (default: each subagent's own). */
	readonly subagentModel?: string;
	readonly effort?: Effort;
	/** Approve every change without asking (headless tests and smoke runs only). */
	readonly autoApprove?: boolean;
	/** How long device tools wait to see the device confirm a change (default 150 ms). */
	readonly confirmWindowMs?: number;
	readonly maxIterations?: number;
	readonly maxTokens?: number;
	/** Epoch ms (tests). */
	readonly now?: () => number;
	/** This page session's id (tests). */
	readonly session?: string;
}

const PREF_THREAD = 'opxy:agent-thread';
const PREF_MODEL = 'opxy:agent-model';

const GLOBAL_TIMERS: AgentTimers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

function randomId(prefix: string): string {
	const random =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function memoryPreferences(): PreferenceStore {
	const values: Record<string, string> = {};
	return {
		get: (key) => values[key] ?? null,
		set: (key, value) => {
			if (value === null) delete values[key];
			else values[key] = value;
		}
	};
}

/** The agent behind the panel. Create with {@link Conductor.create}. */
export class Conductor {
	/** Where the conductor stands. */
	status: ConductorStatus = $state('idle');
	/** The chat. */
	entries: ChatEntry[] = $state([]);
	/** The plan (`write_todos`). */
	todos: Todo[] = $state.raw([]);
	/** Tokens and USD for this thread. */
	usage: UsageTotals = $state(emptyUsage());
	/** Changes waiting for the user's decision. */
	approval: ApprovalRequest | null = $state.raw(null);
	/** Applied device changes, oldest first. */
	revisions: Revision[] = $state.raw([]);
	/** The conductor's model. */
	model: string = $state(DEFAULT_CONDUCTOR_MODEL);
	/** Models for the picker (from the Models API once loaded). */
	models: ModelOption[] = $state.raw(modelOptions(null));
	/** True once the Models API answered for this key. */
	modelsLoaded = $state(false);
	/** The last run's error, if it failed. */
	lastError: AgentErrorInfo | null = $state.raw(null);
	threadId = $state('');
	threadTitle = $state('new conversation');
	/** Stored threads, newest first. */
	threads: ThreadSummary[] = $state.raw([]);
	/** A device job is running (a preview playing, a change being sent). */
	deviceBusy = $state(false);
	/** Tools the user allowed for this session. */
	grants: string[] = $state.raw([]);

	/** Which manual the agent answers from. */
	readonly manualKind: ManualSourceKind;
	readonly manualLabel: string;

	readonly #client: ModelClient;
	readonly #device: DeviceStack | null;
	readonly #manual: ManualSource;
	readonly #store: ThreadStore;
	readonly #preferences: PreferenceStore;
	readonly #timers: AgentTimers;
	readonly #subagentModel: string | null;
	readonly #effort: Effort;
	readonly #maxIterations: number;
	readonly #maxTokens: number;
	readonly #now: () => number;
	// Plain collections below are bookkeeping, not UI state: nothing renders them.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #listeners = new Set<AgentListener>();
	readonly #registry: ToolRegistry;
	readonly #gate: PolicyGate;
	readonly #queue = new DeviceQueue();
	readonly #journal: Journal;
	readonly #executor: ToolExecutor;
	readonly #quirks: ModelQuirks = createQuirks();
	readonly #env: AgentEnvironment;
	#messages: BetaMessageParam[] = [];
	#createdAt = 0;
	#deviceNote: string | null = null;
	#pendingNotes: string[] = [];
	#controller: AbortController | null = null;
	#resolveApproval: ((decision: ApprovalDecision) => void) | null = null;
	#system: Promise<BetaTextBlockParam[]> | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #subagentSystems = new Map<string, Promise<BetaTextBlockParam[]>>();
	#disposed = false;
	/** The manual's units by lowercase id, for citations (fixed for the session, not UI state). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#catalog: ReadonlyMap<string, ManualEntry> = new Map();

	private constructor(options: ConductorOptions) {
		this.#client = options.client;
		this.#device = options.device;
		this.#manual = options.manual;
		this.#store = options.store;
		this.#preferences = options.preferences ?? memoryPreferences();
		this.#timers = options.timers ?? GLOBAL_TIMERS;
		this.#subagentModel = options.subagentModel ?? null;
		this.#effort = options.effort ?? 'medium';
		this.#maxIterations = options.maxIterations ?? 16;
		this.#maxTokens = options.maxTokens ?? 16_000;
		this.#now = options.now ?? (() => Date.now());
		this.manualKind = options.manual.kind;
		this.manualLabel = options.manual.label;
		this.model = options.model ?? this.#preferences.get(PREF_MODEL) ?? DEFAULT_CONDUCTOR_MODEL;
		this.#registry = createConductorRegistry();
		this.#gate = new PolicyGate({
			autoApprove: options.autoApprove,
			requestApproval: (request) => this.#askUser(request)
		});
		this.#journal = new Journal({
			session: options.session ?? randomId('session'),
			threadId: '',
			now: this.#now
		});
		this.#journal.onChange((list) => (this.revisions = [...list]));
		this.#queue.onChange(() => (this.deviceBusy = this.#queue.busy));
		this.#executor = new ToolExecutor({
			gate: this.#gate,
			queue: this.#queue,
			journal: this.#journal,
			emit: (event) => this.#emit(event),
			firmware: () => this.#device?.session.firmware?.osVersion ?? null
		});
		this.#env = {
			device: options.device,
			replica: options.replica,
			manual: options.manual,
			timers: this.#timers,
			confirmWindowMs: options.confirmWindowMs ?? 150,
			plan: {
				get: () => this.todos,
				set: (items) => {
					this.todos = [...items];
					this.#emit({ type: 'todos', items: this.todos });
				}
			},
			abortDeviceWork: (reason) => this.#queue.abortAll(reason),
			runSubagent: (type, description, ctx) => this.#runSubagent(type, description, ctx)
		};
	}

	/** Builds a conductor and restores the last conversation (or starts a new one). */
	static async create(options: ConductorOptions): Promise<Conductor> {
		const conductor = new Conductor(options);
		const catalog = await options.manual.catalog().catch(() => []);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		conductor.#catalog = new Map(catalog.map((entry) => [entry.id.toLowerCase(), entry]));
		await conductor.#restore();
		return conductor;
	}

	/**
	 * What a manual citation in an answer points at: `unit-id` or `unit-id#fact-id` → the unit's
	 * title and its https source (TE's page); null for units this manual does not have.
	 */
	citation(ref: string): { readonly title: string; readonly href: string | null } | null {
		const entry = this.#catalog.get(ref.split('#')[0].trim().toLowerCase());
		if (!entry) return null;
		return { title: entry.title, href: /^https:\/\//.test(entry.source) ? entry.source : null };
	}

	/** True while a run is in progress (streaming, running tools or waiting for approval). */
	get busy(): boolean {
		return this.status === 'running' || this.status === 'approval';
	}

	/** Listens to the raw event stream; returns the unsubscribe function. */
	on(listener: AgentListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Sends a user message and runs the agent until it answers. */
	async send(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed || this.busy || this.#disposed) return;
		if (this.#messages.length === 0) this.threadTitle = titleFrom(trimmed);
		this.entries.push({ kind: 'user', id: entryId('user'), text: trimmed });
		this.#messages.push({ role: 'user', content: [{ type: 'text', text: trimmed }] });
		const note = this.#deviceUpdate();
		if (note) this.#messages.push({ role: 'system', content: note });
		await this.#run();
	}

	/** Runs the agent again on the conversation as it is (after an error). */
	async retry(): Promise<void> {
		if (this.busy || this.#disposed || this.#messages.length === 0) return;
		const last = this.#messages.at(-1);
		if (last?.role === 'assistant') return;
		await this.#run();
	}

	/** Stops the run: aborts the stream, cancels a pending approval and stops device work. */
	stop(): void {
		this.#controller?.abort('stopped');
		this.#queue.abortAll('stopped');
		if (this.#resolveApproval) this.decide({ kind: 'cancelled' });
	}

	/** Answers the pending approval request. */
	decide(decision: ApprovalDecision): void {
		const request = this.approval;
		const resolve = this.#resolveApproval;
		if (!request || !resolve) return;
		this.approval = null;
		this.#resolveApproval = null;
		if (this.status === 'approval') this.status = 'running';
		if (decision.kind === 'allow-session') {
			const tools = [...this.grants, ...request.actions.map((a) => a.tool)];
			this.grants = tools.filter((tool, i) => tools.indexOf(tool) === i).sort();
		}
		const outcome =
			decision.kind === 'approve'
				? 'approved'
				: decision.kind === 'allow-session'
					? 'allowed'
					: decision.kind === 'reject'
						? 'rejected'
						: 'cancelled';
		this.entries.push({
			kind: 'approval',
			id: entryId('approval'),
			outcome,
			labels: request.actions.map((a) => a.preview.label),
			note: decision.kind === 'reject' ? decision.note?.trim() || null : null
		});
		resolve(decision);
		this.#emit({ type: 'approval_resolved', id: request.id, decision });
	}

	/** Asks for approval again for every tool allowed for this session. */
	revokeGrants(): void {
		this.#gate.revoke();
		this.grants = [];
	}

	/** Undoes a revision on the device (the click is the user's approval). */
	async undo(rev: number): Promise<boolean> {
		const revision = this.#journal.get(rev);
		const outcome = await this.#executor.undo(rev, this.#registry, this.#env);
		if (outcome.ok) {
			const label = revision?.inverse?.label ?? `change ${rev} undone`;
			this.#pendingNotes.push(
				`The user undid change ${rev} (${revision?.label ?? 'a change'}) from the app: ${label}.`
			);
			this.entries.push({
				kind: 'notice',
				id: entryId('undo'),
				tone: 'info',
				text: `Undone: ${label}.`,
				code: null
			});
		} else {
			this.entries.push({
				kind: 'notice',
				id: entryId('undo'),
				tone: 'error',
				text: `Could not undo change ${rev}: ${outcome.message}`,
				code: null
			});
		}
		await this.#save();
		return outcome.ok;
	}

	/** Why a revision cannot be undone, or null. */
	undoBlocker(rev: number): string | null {
		return this.#journal.undoBlocker(rev);
	}

	/** Chooses the conductor's model (from the next message on) and remembers it. */
	setModel(id: string): void {
		if (!id || id === this.model) return;
		this.model = id;
		this.#preferences.set(PREF_MODEL, id);
	}

	/** Asks the Models API which models this key can use (also validates the key). */
	async loadModels(): Promise<boolean> {
		try {
			const ids = await this.#client.listModels();
			this.models = modelOptions(ids);
			this.modelsLoaded = true;
			return true;
		} catch (error) {
			const info = normalizeError(error);
			if (info.code === 'auth') {
				this.lastError = info;
				this.status = 'error';
			}
			return false;
		}
	}

	/** Starts a new conversation (the current one stays in the list). */
	async newThread(): Promise<void> {
		this.stop();
		if (this.#messages.length > 0) await this.#save();
		this.#startThread();
		await this.#refreshThreads();
	}

	/** Opens a stored conversation. */
	async openThread(id: string): Promise<void> {
		if (id === this.threadId) return;
		this.stop();
		if (this.#messages.length > 0) await this.#save();
		const record = await this.#store.load(id);
		if (record) this.#loadThread(record);
		await this.#refreshThreads();
	}

	/** Deletes a stored conversation (starts a new one if it was open). */
	async deleteThread(id: string): Promise<void> {
		await this.#store.remove(id);
		if (id === this.threadId) this.#startThread();
		await this.#refreshThreads();
	}

	/** Stops everything and detaches listeners. */
	dispose(): void {
		this.#disposed = true;
		this.stop();
		this.#listeners.clear();
		this.#journal.onChange(null);
		this.#queue.onChange(null);
	}

	// ─── internals ────────────────────────────────────────────────────────────────────────────

	#emit(event: AgentEvent): void {
		applyEvent(this.entries, this.usage, event, parentOf);
		for (const listener of this.#listeners) {
			try {
				listener(event);
			} catch (error) {
				queueMicrotask(() => {
					throw error;
				});
			}
		}
	}

	#askUser(request: ApprovalRequest): Promise<ApprovalDecision> {
		return new Promise((resolve) => {
			this.#resolveApproval?.({ kind: 'cancelled' });
			this.approval = request;
			this.#resolveApproval = resolve;
			this.status = 'approval';
			this.#emit({ type: 'approval', request });
		});
	}

	/** The device note plus queued notes, when something changed since the last one. */
	#deviceUpdate(): string | null {
		const parts: string[] = [];
		const note = describeDevice(deviceSnapshot(this.#device));
		if (note !== this.#deviceNote) {
			parts.push(note);
			this.#deviceNote = note;
		}
		parts.push(...this.#pendingNotes.splice(0));
		return parts.length > 0 ? parts.join('\n\n') : null;
	}

	#transcript(): Transcript {
		return {
			messages: this.#messages,
			append: (message) => {
				this.#messages.push(message);
				if (message.role === 'user') void this.#save();
			}
		};
	}

	async #systemBlocks(): Promise<BetaTextBlockParam[]> {
		this.#system ??= this.#manual
			.promptBundle()
			.then((bundle) => systemBlocks(CONDUCTOR_ROLE, bundle));
		return this.#system;
	}

	async #subagentBlocks(spec: SubagentSpec): Promise<BetaTextBlockParam[]> {
		let blocks = this.#subagentSystems.get(spec.name);
		if (!blocks) {
			blocks = this.#manual.promptBundle().then((bundle) => systemBlocks(spec.role, bundle));
			this.#subagentSystems.set(spec.name, blocks);
		}
		return blocks;
	}

	async #run(): Promise<void> {
		const controller = new AbortController();
		this.#controller = controller;
		this.status = 'running';
		this.lastError = null;
		try {
			const system = await this.#systemBlocks();
			const result = await runLoop(
				{
					agent: 'conductor',
					client: this.#client,
					model: this.model,
					system,
					registry: this.#registry,
					effort: this.#effort,
					maxTokens: this.#maxTokens,
					maxIterations: this.#maxIterations,
					signal: controller.signal,
					emit: (event) => this.#emit(event),
					runTools: (calls) =>
						this.#executor.execute({
							agent: 'conductor',
							registry: this.#registry,
							calls,
							env: this.#env,
							signal: controller.signal
						}),
					quirks: this.#quirks
				},
				this.#transcript()
			);
			const failed = result.error !== null && result.error.code !== 'aborted';
			this.lastError = failed ? result.error : null;
			this.status = failed ? 'error' : 'idle';
		} catch (error) {
			const info = normalizeError(error);
			this.lastError = info;
			this.status = 'error';
			this.#emit({ type: 'error', agent: 'conductor', error: info });
		} finally {
			if (this.#controller === controller) this.#controller = null;
			settleEntries(this.entries);
			await this.#save();
		}
	}

	async #runSubagent(type: string, description: string, ctx: ToolContext): Promise<SubagentResult> {
		const spec = SUBAGENTS[type];
		if (!spec) return { text: `Unknown subagent "${type}".`, sources: [], stopReason: 'error' };
		const agent = subagentName(spec.name, ctx.toolCallId);
		const registry = this.#registry.subset(spec.tools);
		const env: AgentEnvironment = { ...this.#env, runSubagent: undefined };
		const system = await this.#subagentBlocks(spec);
		const result = await runLoop(
			{
				agent,
				client: this.#client,
				model: this.#subagentModel ?? spec.model,
				system,
				registry,
				effort: spec.effort,
				maxTokens: spec.maxTokens,
				maxIterations: spec.maxIterations,
				signal: ctx.signal,
				emit: (event) => this.#emit(event),
				runTools: (calls) =>
					this.#executor.execute({
						agent,
						registry,
						calls,
						env,
						signal: ctx.signal,
						parent: ctx.toolCallId
					}),
				parent: ctx.toolCallId,
				quirks: this.#quirks
			},
			arrayTranscript([{ role: 'user', content: [{ type: 'text', text: description }] }])
		);
		const sources: { title: string; source: string }[] = [];
		for (const c of result.citations) {
			if (!sources.some((s) => s.source === c.source))
				sources.push({ title: c.title, source: c.source });
		}
		const failed = result.error !== null;
		return {
			text:
				failed && !result.text
					? `The ${spec.name} could not finish: ${result.error?.message}`
					: result.text,
			sources,
			stopReason: failed ? 'error' : result.stopReason
		};
	}

	#startThread(): void {
		this.threadId = randomId('thread');
		this.threadTitle = 'new conversation';
		this.#createdAt = this.#now();
		this.#messages = [];
		this.entries = [];
		this.todos = [];
		this.usage = emptyUsage();
		this.lastError = null;
		this.status = 'idle';
		this.#deviceNote = null;
		this.#pendingNotes = [];
		this.#journal.reset(this.threadId);
		this.#preferences.set(PREF_THREAD, this.threadId);
	}

	#loadThread(record: ThreadRecord): void {
		this.threadId = record.id;
		this.threadTitle = record.title;
		this.#createdAt = record.createdAt;
		this.#messages = record.messages;
		this.#repairTranscript();
		this.entries = record.entries;
		settleEntries(this.entries);
		this.todos = record.todos;
		this.usage = { ...emptyUsage(), ...record.usage };
		this.lastError = null;
		this.status = 'idle';
		this.#deviceNote = record.deviceNote;
		this.#pendingNotes = [];
		this.#journal.reset(record.id, record.revisions);
		this.#preferences.set(PREF_THREAD, record.id);
	}

	/**
	 * A thread saved mid-run can end with tool calls that never got results; the API would reject
	 * it. Append (never edit) the missing results.
	 */
	#repairTranscript(): void {
		const last = this.#messages.at(-1);
		if (!last || last.role !== 'assistant' || typeof last.content === 'string') return;
		const calls = last.content.filter((b) => b.type === 'tool_use');
		if (calls.length === 0) return;
		this.#messages.push({
			role: 'user',
			content: calls.map((c) => ({
				type: 'tool_result' as const,
				tool_use_id: (c as { id: string }).id,
				is_error: true,
				content: 'Interrupted: the page was closed before this finished. Nothing more was sent.'
			}))
		});
	}

	async #restore(): Promise<void> {
		const id = this.#preferences.get(PREF_THREAD);
		const record = id ? await this.#store.load(id).catch(() => null) : null;
		if (record) this.#loadThread(record);
		else this.#startThread();
		await this.#refreshThreads();
	}

	async #refreshThreads(): Promise<void> {
		try {
			this.threads = await this.#store.list();
		} catch {
			this.threads = [];
		}
	}

	async #save(): Promise<void> {
		if (this.#messages.length === 0 && this.entries.length === 0) return;
		const record: ThreadRecord = {
			id: this.threadId,
			title: this.threadTitle,
			createdAt: this.#createdAt,
			updatedAt: this.#now(),
			model: this.model,
			messages: this.#messages,
			entries: $state.snapshot(this.entries) as ChatEntry[],
			todos: this.todos,
			usage: $state.snapshot(this.usage) as UsageTotals,
			revisions: [...this.#journal.list()],
			deviceNote: this.#deviceNote
		};
		try {
			await this.#store.save(record);
			this.#preferences.set(PREF_THREAD, this.threadId);
			await this.#refreshThreads();
		} catch {
			// Storage full or unavailable: the conversation keeps working in memory.
		}
	}
}
