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
import { PressLog } from './press-log';
import { nextActivity, startActivity, type Activity } from './activity';
import { attachmentProblem, userContent, type PreparedAttachment } from './attachments';
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
import type { LabHost } from './lab/host';
import type { ListenHost } from './listen-host';
import type { ManualEntry, ManualSource, ManualSourceKind } from './manual-source';
import { DEFAULT_CONDUCTOR_MODEL, modelOptions, type ModelOption } from './models';
import { PolicyGate } from './policy';
import { CONDUCTOR_ROLE, systemBlocks } from './prompts';
import { routeSkills } from './skill-router';
import { loadedSkills, messageTexts, skillIndex, skillNamed, skillText } from './skills';
import { memoryBriefing, type MemoryStore } from './memory';
import { DeviceQueue } from './queue';
import { SUBAGENTS, parentOf, subagentName, type SubagentSpec } from './subagents';
import { titleFrom, type ThreadRecord, type ThreadStore, type ThreadSummary } from './threads';
import {
	createConductorRegistry,
	type AgentEnvironment,
	type AgentTimers,
	type GuideHost,
	type PresetInboxHost,
	type ProjectHost,
	type ScreenReader,
	type SubagentResult,
	type ToolContext,
	type ToolRegistry
} from './tools';
import type { ReplicaChange, VirtualCheckpoint, VirtualOpxy } from './virtual-opxy';
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

/** Manual units retrieved into a message in map mode. */
const RETRIEVED_UNITS = 3;
/** A retrieved unit's marker, so the same unit is not added twice in a thread. */
const MANUAL_UNIT = /<manual-unit id="([^"]+)">/g;

/** Everything the conductor depends on. */
export interface ConductorOptions {
	readonly client: ModelClient;
	readonly device: DeviceStack | null;
	readonly replica: ReplicaState | null;
	/** What the replica's screen shows (read_screen); absent when headless. */
	readonly screen?: ScreenReader | null;
	/** The virtual OP-XY on screen (programming tools, and live tools with no device); absent when headless. */
	readonly virtual?: VirtualOpxy | null;
	/** The replica walkthrough (plan_steps with guide); absent when headless. */
	readonly guide?: GuideHost | null;
	/** The preset maker's inbox (make_kit); absent when headless. */
	readonly presets?: PresetInboxHost | null;
	/** The replica's project to the OP-XY over USB (send_project); absent when headless. */
	readonly projects?: ProjectHost | null;
	/** Listening to the OP-XY or the replica (listen, listen_tracks); absent when headless. */
	readonly listen?: ListenHost | null;
	/** Runs the model's programs on forks of the replica (run_lab); absent when headless. */
	readonly lab?: LabHost | null;
	readonly manual: ManualSource;
	readonly store: ThreadStore;
	/** Remembers the last thread and the chosen model; memory-only when absent. */
	readonly preferences?: PreferenceStore;
	readonly timers?: AgentTimers;
	/** Times an overloaded answer that showed nothing yet is asked for again (default none). */
	readonly overloadRetries?: number;
	/** Conductor model (default: the saved preference, else `claude-sonnet-5-5`). */
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
	/**
	 * How the manual reaches the model: the whole bundle in the system prompt (`full`), or its map
	 * there and the units most relevant to each message retrieved into the turn (`map`).
	 */
	readonly manualMode?: 'full' | 'map';
	/** Add the skills a message clearly needs with it (default true). */
	readonly routeSkills?: boolean;
	/** The agent's memory across conversations; none when absent. */
	readonly memory?: MemoryStore | null;
}

/** How a message reached the conductor. */
export interface SendOptions {
	/** Handed over by the voice front end (M8): marked in the chat, and Claude knows it is heard. */
	readonly via?: 'voice';
}

/** How an approval was answered. */
export interface DecideOptions {
	/** A spoken yes or no, passed on by the voice front end (M8). */
	readonly via?: 'voice';
}

/** A spoken line for the conversation (M8), from the voice front end. */
export interface VoiceLineInput {
	/** The realtime item id; the same line updates while it is transcribed or spoken. */
	readonly id: string;
	readonly role: 'user' | 'assistant';
	readonly text: string;
	readonly live: boolean;
	readonly interrupted: boolean;
}

const PREF_THREAD = 'opxy:agent-thread';
const PREF_MODEL = 'opxy:agent-model';

/** Told to Claude with a request the voice handed over: the answer will be summarised aloud. */
const VOICE_NOTE =
	'The user asked this by voice. A voice assistant will say a one- or two-sentence summary of ' +
	'your answer aloud and the full answer stays on screen, so lead with the answer itself.';

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

/** Whether the replica plays, and what: the song from where, or the scene it loops. */
function playingNow(virtual: VirtualOpxy): string {
	try {
		const status = virtual.status();
		// live recording, which the screen does not say (an agent teaching it could not tell whether
		// the take was still running)
		const track = `T${status.selectedTrack}`;
		// and how notes are played here (an agent teaching a live take never said, and the take
		// stayed empty)
		const keys =
			' The user plays notes on the replica’s keys with the mouse or the computer keyboard (the Z row the lower twelve, the Q row the upper).';
		const recording =
			status.recording === 'armed'
				? ` Recording is armed on ${track} (step 1 flashes red): the first note played starts playback and the take.${keys}`
				: status.recording === 'count-in'
					? ` ${track} counts in to record: the take starts when the count-in bar ends.${keys}`
					: status.recording === 'on'
						? ` Recording is on for ${track} (latched): what is played on the keys lands in its pattern until stop.${keys}`
						: '';
		// a project with nothing in it, said (an agent asked to "make it louder" first read all
		// sixteen tracks to find there was nothing to turn up)
		const empty = status.tracks.every((t) => t.notes === 0)
			? ' Its project holds no notes yet: every pattern is empty.'
			: '';
		// and the tempo (an agent wrote "at the default tempo" without knowing it)
		const bpm = `${Math.round(status.bpm * 10) / 10} bpm`;
		if (!status.playing) return `the replica is stopped, at ${bpm}.${empty}${recording}`;
		// which tracks play notes now, and which are muted (an agent told of a loud hat could check
		// only the track it wrote)
		const name = (t: { track: number }) => (t.track <= 8 ? `T${t.track}` : `aux T${t.track - 8}`);
		const withNotes = status.tracks.filter((t) => t.notes > 0);
		const sounding = withNotes.filter((t) => !t.muted).map(name);
		const muted = withNotes.filter((t) => t.muted).map(name);
		// the browser's own sound switched off: playing, and nothing heard (an agent could not tell
		// whether the user heard the replica at all)
		const silent =
			status.sound === 'off'
				? ' Its sound is off in the browser (the sound switch under the replica): the user hears nothing until it is on.'
				: '';
		const tracks = ` Sounding: ${sounding.length ? sounding.join(', ') : 'no track (no notes in the patterns playing)'}${muted.length ? `; muted: ${muted.join(', ')}` : ''}.${silent}`;
		const a = virtual.readArrangement();
		const queued = a.queued
			? ` Scene ${a.queued} is queued: it takes over when this one ends.`
			: '';
		const scene = a.scenes.find((s) => s.scene === a.scene);
		// the bar only where the scene has more than one
		const bar = a.at && scene && scene.bars > 1 ? `bar ${a.at.bar} of its ${scene.bars}` : '';
		if (a.plays === 'song') {
			const entry = a.at?.entry ? `entry ${a.at.entry} of ${a.song.order.length}` : '';
			const parts = [entry, bar].filter(Boolean);
			const where = parts.length ? ` (${parts.join(', ')})` : '';
			return `the replica is playing its song at ${bpm} (${a.song.loop ? 'looping' : 'once through'}), on scene ${a.scene} now${where}.${tracks}${queued}${recording}`;
		}
		const held = a.song.order.length > 1 ? ' (picked, so the song does not move on)' : '';
		return `the replica is playing scene ${a.scene} at ${bpm}, looping${held}${bar ? `, at ${bar}` : ''}.${tracks}${queued}${recording}`;
	} catch {
		return 'unknown.';
	}
}

/** The one tempo a message names in bpm ("at 100 bpm"), or null for none or several. */
export function askedTempo(text: string): number | null {
	const named = [...text.matchAll(/\b(\d{2,3}(?:\.\d)?)\s*bpm\b/gi)]
		.map((m) => Number(m[1]))
		.filter((n) => n >= 30 && n <= 300);
	return named.length > 0 && named.every((n) => n === named[0]) ? named[0] : null;
}

/**
 * An earlier change line that no longer holds, as what holds now where that reads plainer: "T3
 * plays pattern 1 → 2" gone is T3 on pattern 1 again (an agent misread the bare line after it had
 * put a scene's pattern back).
 */
function backAgain(line: string): string {
	const m = /^(.+?) plays pattern (\d+) → (\d+)/.exec(line);
	if (m) return `${m[1]} plays pattern ${m[2]} again, not ${m[3]}`;
	// one value back as it was, said with the value it has now (an agent read "groove amount 0 →
	// 40" under "no longer so" as the amount being 40 again)
	const one = /^([^:→]+?) (\S+) → (\S+)( [a-z]+)?$/.exec(line);
	if (one) {
		const unit = one[4] ?? '';
		return `${one[1]} ${one[2]}${unit} again, not ${one[3]}${unit}`;
	}
	return `${line}, undone`;
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
	/** What the agent is doing right now, for the live status line; null while no run is active. */
	activity: Activity | null = $state.raw(null);
	/**
	 * The last answer's changes for the replica to light (its changes note's id, and each change
	 * with its keys): set as a turn ends having changed something, and again when its undo is put
	 * back; null once there is nothing to light (a new message, the turn taken back, another thread).
	 */
	litChanges: { readonly id: string; readonly changes: readonly ReplicaChange[] } | null =
		$state.raw(null);
	/** Which take of each lab run's offer is on the replica now (the offer's id → its index). */
	takesOn: Record<string, number> = $state({});

	/** Which manual the agent answers from. */
	readonly manualKind: ManualSourceKind;
	readonly manualLabel: string;

	readonly #client: ModelClient;
	readonly #device: DeviceStack | null;
	readonly #manual: ManualSource;
	readonly #store: ThreadStore;
	readonly #preferences: PreferenceStore;
	readonly #timers: AgentTimers;
	readonly #overloadRetries: number;
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
	/** MIDI files attached in this conversation, by name (import_midi reads them; not UI state). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #files = new Map<string, Uint8Array>();
	#messages: BetaMessageParam[] = [];
	#createdAt = 0;
	#deviceNote: string | null = null;
	#pendingNotes: string[] = [];
	#controller: AbortController | null = null;
	/** The model has answered in this conversation (so the manual is no longer read cold). */
	#answered = false;
	#resolveApproval: ((decision: ApprovalDecision) => void) | null = null;
	#system: Promise<BetaTextBlockParam[]> | null = null;
	readonly #manualMode: 'full' | 'map';
	/** The replica when the user's message arrived, and the changes last reported against it. */
	#checkpoint: VirtualCheckpoint | null = null;
	/** The user's own presses on the replica since the agent last finished, by the keys' names. */
	#presses = new PressLog();
	#stopPresses: (() => void) | null = null;
	/** The replica when the agent last finished: what the user changed since is theirs to tell. */
	#lastSeen: VirtualCheckpoint | null = null;
	#reported = '';
	/** What the user's message says, for checks against it (a tempo it names). */
	#asked = '';
	/** The change lines already given in this answer's earlier lists. */
	#reportedLines: readonly string[] = [];
	/** Each turn's replica before and after it, for its take-back (this page session only). */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #turns = new Map<
		string,
		{
			before: VirtualCheckpoint;
			after: VirtualCheckpoint;
			undone: VirtualCheckpoint | null;
			/** The answer took an earlier one back: not itself one take_back counts. */
			tookBack?: true;
			/** While its note's "before" key is held: the replica before the hold, and during it. */
			held?: { from: VirtualCheckpoint; shown: VirtualCheckpoint };
		}
	>();
	readonly #routeSkills: boolean;
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
		this.#overloadRetries = options.overloadRetries ?? 0;
		this.#subagentModel = options.subagentModel ?? null;
		this.#effort = options.effort ?? 'medium';
		this.#maxIterations = options.maxIterations ?? 16;
		// room for a whole arrangement's calls in one answer (Sonnet 5.5 and Opus 5.5 write 128k)
		this.#maxTokens = options.maxTokens ?? 64_000;
		this.#now = options.now ?? (() => Date.now());
		this.#manualMode = options.manualMode ?? 'full';
		this.#routeSkills = options.routeSkills ?? true;
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
			screen: options.screen ?? null,
			virtual: options.virtual ?? null,
			guide: options.guide ?? null,
			presets: options.presets ?? null,
			projects: options.projects ?? null,
			files: {
				midi: (name) => {
					const files = this.#files;
					if (files.has(name)) return files.get(name) ?? null;
					// the model may drop the extension or change the case
					const want = name.toLowerCase().replace(/\.(mid|midi|smf|kar|rmi)$/, '');
					for (const [known, bytes] of files) {
						if (known.toLowerCase().replace(/\.(mid|midi|smf|kar|rmi)$/, '') === want) return bytes;
					}
					return null;
				},
				midiNames: () => [...this.#files.keys()]
			},
			listen: options.listen ?? null,
			memory: options.memory ?? null,
			lab: options.lab ?? null,
			answers: { takeBack: (answer) => this.#takeBack(answer) },
			takes: { keep: (take) => this.#keepByWord(take) },
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
		this.#stopPresses =
			options.replica?.subscribe((event) => this.#presses.add(event, this.#now())) ?? null;
	}

	/** Builds a conductor and restores the last conversation (or starts a new one). */
	static async create(options: ConductorOptions): Promise<Conductor> {
		const conductor = new Conductor(options);
		const catalog = await options.manual.catalog().catch(() => []);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		conductor.#catalog = new Map(catalog.map((entry) => [entry.id.toLowerCase(), entry]));
		await conductor.#restore();
		conductor.seeReplica();
		return conductor;
	}

	/**
	 * Takes the replica as it stands as seen: what changes on it from here, before a message, is
	 * the user's (an agent asked "what did I just make?" after the user's first key presses could
	 * not tell who had made it). The app calls it again once stored work is back.
	 */
	seeReplica(): void {
		this.#lastSeen = this.#env.virtual?.checkpoint() ?? null;
		this.#presses.clear();
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

	/**
	 * Why these files cannot go with the next message (too many, or the conversation would grow
	 * past what one request can carry), or null.
	 */
	attachmentProblem(attachments: readonly PreparedAttachment[]): string | null {
		return attachmentProblem(this.#messages, attachments);
	}

	/**
	 * Sends a user message, with any files (see `attachments.ts`), and runs the agent until it
	 * answers. Files that `attachmentProblem` refuses are not sent (nor is the message).
	 */
	async send(
		text: string,
		attachments: readonly PreparedAttachment[] = [],
		options: SendOptions = {}
	): Promise<void> {
		const trimmed = text.trim();
		if ((!trimmed && attachments.length === 0) || this.busy || this.#disposed) return;
		if (this.attachmentProblem(attachments)) return;
		// a take left on while the user goes on is the one they have: kept, and the model told
		this.#keepTakesOn();
		if (this.#messages.length === 0) {
			this.threadTitle = titleFrom(trimmed || attachments.map((a) => a.view.name).join(', '));
		}
		this.entries.push({
			kind: 'user',
			id: entryId('user'),
			text: trimmed,
			...(attachments.length > 0 ? { attachments: attachments.map((a) => a.view) } : {}),
			...(options.via ? { via: options.via } : {})
		});
		// busy from here: the context is worked out before the message joins the thread, so the
		// thread gets both at once, and a second send cannot slip in while it is
		this.status = 'running';
		this.litChanges = null;
		this.activity = startActivity(this.#now(), !this.#answered);
		const hands = this.#userChanges();
		this.#checkpoint = this.#env.virtual?.checkpoint() ?? null;
		this.#reported = '';
		this.#reportedLines = [];
		const context = await this.#turnContext(trimmed, attachments);
		this.#asked = trimmed;
		this.#messages.push({ role: 'user', content: userContent(trimmed, attachments) });
		for (const a of attachments) if (a.midi) this.#files.set(a.view.name, a.midi);
		if (options.via === 'voice') this.#pendingNotes.push(VOICE_NOTE);
		// one system message: two in a row would reach the model as two user turns
		const note = [this.#deviceUpdate(), hands, this.#takesWaiting(), context]
			.filter(Boolean)
			.join('\n\n');
		if (note) this.#messages.push({ role: 'system', content: note });
		await this.#run();
	}

	/**
	 * Lets the agent follow up on something the user did in the app (they finished a walkthrough):
	 * `note` reaches the model as the app's message and it answers in the chat; `shown` is the line
	 * the chat shows for it. Nothing happens while the agent is busy or before a conversation.
	 */
	async followUp(note: string, shown: string): Promise<void> {
		if (this.busy || this.#disposed || this.#messages.length === 0) return;
		this.entries.push({
			kind: 'notice',
			id: entryId('notice'),
			tone: 'info',
			text: shown,
			code: null
		});
		this.status = 'running';
		this.litChanges = null;
		this.activity = startActivity(this.#now(), !this.#answered);
		// what the user did is theirs: only the agent's own changes from here are reported
		const hands = this.#userChanges();
		this.#checkpoint = this.#env.virtual?.checkpoint() ?? null;
		this.#reported = '';
		this.#reportedLines = [];
		this.#messages.push({ role: 'system', content: [note, hands].filter(Boolean).join('\n\n') });
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

	/** Answers the pending approval request (from the approval sheet, or a spoken yes or no). */
	decide(decision: ApprovalDecision, options: DecideOptions = {}): void {
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
			note: decision.kind === 'reject' ? decision.note?.trim() || null : null,
			...(options.via ? { via: options.via } : {})
		});
		resolve(decision);
		this.#emit({ type: 'approval_resolved', id: request.id, decision });
	}

	/**
	 * Shows or updates a spoken line (voice, M8): what the mic heard or what the voice said. The
	 * lines are for the user to read; Claude only sees what the voice hands over with `send`. A
	 * line that ends with no words (a cough) is dropped; a finished one is saved with the thread.
	 */
	voiceLine(line: VoiceLineInput): void {
		if (this.#disposed) return;
		const id = `voice-${line.id}`;
		const empty = !line.live && !line.text.trim();
		let index = -1;
		for (let i = this.entries.length - 1; i >= 0; i--) {
			if (this.entries[i].id === id) {
				index = i;
				break;
			}
		}
		const entry = index < 0 ? null : this.entries[index];
		if (entry?.kind === 'voice') {
			if (empty) this.entries.splice(index, 1);
			else {
				entry.text = line.text;
				entry.live = line.live;
				entry.interrupted = line.interrupted;
			}
		} else if (!empty) {
			this.entries.push({
				kind: 'voice',
				id,
				role: line.role,
				text: line.text,
				live: line.live,
				interrupted: line.interrupted
			});
		}
		if (line.live) return;
		// A conversation started by voice takes its title from the first thing heard.
		if (
			line.role === 'user' &&
			!empty &&
			this.#messages.length === 0 &&
			this.threadTitle === 'new conversation'
		) {
			this.threadTitle = titleFrom(line.text);
		}
		void this.#save();
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
		this.#env.lab?.dispose?.();
		this.#listeners.clear();
		this.#journal.onChange(null);
		this.#queue.onChange(null);
		this.#stopPresses?.();
		this.#stopPresses = null;
	}

	// ─── internals ────────────────────────────────────────────────────────────────────────────

	#emit(event: AgentEvent): void {
		applyEvent(this.entries, this.usage, event, parentOf);
		this.activity = nextActivity(this.activity, event, this.entries, {
			now: this.#now(),
			firstTurn: !this.#answered
		});
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
				if (message.role === 'assistant') this.#answered = true;
				if (message.role === 'user') void this.#save();
			}
		};
	}

	async #systemBlocks(): Promise<BetaTextBlockParam[]> {
		this.#system ??= (
			this.#manualMode === 'map' ? this.#manual.map() : this.#manual.promptBundle()
		).then((manual) => systemBlocks(CONDUCTOR_ROLE, manual, [skillIndex()]));
		return this.#system;
	}

	/** Shows what the turn changed on the replica, once it ends (the list the model was given). */
	#noteChanges(): void {
		const virtual = this.#env.virtual;
		if (!virtual || !this.#checkpoint) return;
		let lines: readonly string[];
		try {
			lines = virtual.changesSince(this.#checkpoint);
		} catch {
			return;
		}
		if (lines.length === 0) return;
		// what people read of it, and where each change lives on the device (the replica lights it)
		let changes: readonly ReplicaChange[] | undefined;
		try {
			changes = virtual.changedSince(this.#checkpoint);
		} catch {
			changes = undefined;
		}
		const id = entryId('changes');
		this.#turns.set(id, {
			before: this.#checkpoint,
			after: virtual.checkpoint(),
			undone: null,
			...(this.#calledSinceMessage('take_back') ? { tookBack: true as const } : {})
		});
		this.entries.push({ kind: 'changes', id, lines, changes, undo: 'ready' });
		this.litChanges = changes && changes.length > 0 ? { id, changes } : null;
	}

	/**
	 * Takes back what a turn changed on the replica (its changes note's undo), or puts it back
	 * after that: only where the replica still reads as the turn, or the take-back, left it, so what
	 * the user changed since stays. The model hears of it with the next message.
	 */
	async undoTurn(id: string): Promise<boolean> {
		const virtual = this.#env.virtual;
		const turn = this.#turns.get(id);
		const entry = this.entries.find((e) => e.kind === 'changes' && e.id === id);
		if (!virtual || !turn || entry?.kind !== 'changes' || !entry.undo) return false;
		const list = entry.lines.join('; ');
		if (entry.undo === 'ready') {
			virtual.revert(turn.before, turn.after);
			turn.undone = virtual.checkpoint();
			entry.undo = 'undone';
			if (this.litChanges?.id === id) this.litChanges = null;
			this.#pendingNotes.push(
				`The user took back what your answer changed on the replica (${list}); the replica is as it was before, apart from what they changed since.`
			);
		} else {
			if (!turn.undone) return false;
			virtual.revert(turn.after, turn.undone);
			entry.undo = 'ready';
			if (entry.changes?.length) this.litChanges = { id, changes: entry.changes };
			this.#pendingNotes.push(
				`The user put back what your answer had changed on the replica (${list}).`
			);
		}
		await this.#save();
		return true;
	}

	/**
	 * take_back: what the agent's `answer`-th last answer whose changes still stand changed, taken
	 * back as its changes note's undo would (the note then offers to put it back). Answers taken
	 * back, and the take-backs, are skipped, as an undo steps back: "undo again" is answer 1 again
	 * (an agent had to guess it was answer 3).
	 */
	#takeBack(answer: number): { undone: readonly string[] } | { error: string } {
		const virtual = this.#env.virtual;
		const notes = this.entries.filter(
			(e): e is Extract<ChatEntry, { kind: 'changes' }> =>
				e.kind === 'changes' && e.undo !== 'undone' && !this.#turns.get(e.id)?.tookBack
		);
		const entry = notes.at(-answer);
		if (!virtual || !entry) {
			return {
				error:
					notes.length === 0
						? 'None of your answers in this conversation left changes on the replica that still stand, so there is nothing to take back.'
						: `Only ${notes.length} of your answers left changes that still stand (answer 1 is the last).`
			};
		}
		const turn = this.#turns.get(entry.id);
		if (!turn || !entry.undo) {
			return {
				error:
					'That answer came before the page was loaded, so its changes can no longer be taken back: write the old values again.'
			};
		}
		if (entry.undo === 'undone') {
			return { error: `That answer is taken back already (${entry.lines.join('; ')}).` };
		}
		virtual.revert(turn.before, turn.after);
		turn.undone = virtual.checkpoint();
		entry.undo = 'undone';
		if (this.litChanges?.id === entry.id) this.litChanges = null;
		// what still differs from before the answer: the user's edits since, which stay (an agent
		// told "all three changes reversed" found the user's two kicks still there)
		let kept: readonly string[];
		try {
			kept = virtual.changesSince(turn.before);
		} catch {
			kept = [];
		}
		return { undone: entry.lines, ...(kept.length ? { kept } : {}) };
	}

	/** The takes a lab run's chip shows, when it offered some and none is kept yet. */
	#takesOf(entryId: string) {
		const entry = this.entries.find((e) => e.kind === 'tool' && e.id === entryId);
		if (entry?.kind !== 'tool' || entry.display?.kind !== 'takes') return null;
		return { entry, display: entry.display };
	}

	/**
	 * Puts take `take` of a lab run's offer (its chip's entry) on the replica to hear it with the
	 * loop, the one on before going back first, or none (null). The model is not told: nothing is
	 * decided until one is kept.
	 */
	hearTake(entryId: string, take: number | null): boolean {
		const lab = this.#env.lab;
		const found = this.#takesOf(entryId);
		// not while the agent works: what is on the replica then is the turn's to report
		if (this.busy || !lab?.hear || !found || found.display.kept !== undefined) return false;
		if (!lab.hear(found.display.offer, take)) return false;
		if (take === null) delete this.takesOn[found.display.offer];
		else this.takesOn[found.display.offer] = take;
		return true;
	}

	/** The take on the replica stays (one change the user can undo); the model hears which. */
	keepTake(entryId: string): boolean {
		const lab = this.#env.lab;
		const found = this.#takesOf(entryId);
		if (this.busy || !lab?.keep || !found || found.display.kept !== undefined) return false;
		const kept = lab.keep(found.display.offer);
		if (!kept) return false;
		const { entry, display } = found;
		display.kept = kept.index;
		delete this.takesOn[display.offer];
		const take = display.takes[kept.index];
		const purpose = (entry.input as { purpose?: unknown } | null)?.purpose;
		this.#pendingNotes.push(
			`The user heard the takes of your lab run${typeof purpose === 'string' ? ` “${purpose}”` : ''} and kept “${take?.label ?? kept.index + 1}”: it is on the replica now (${take?.changes.join('; ') ?? 'as offered'}).`
		);
		void this.#save();
		return true;
	}

	/** The latest offer of takes none of which is kept yet, with its chip's entry. */
	#pendingOffer() {
		for (let i = this.entries.length - 1; i >= 0; i--) {
			const e = this.entries[i];
			if (e.kind !== 'tool' || e.display?.kind !== 'takes') continue;
			return e.display.kept === undefined ? { entry: e, display: e.display } : null;
		}
		return null;
	}

	/**
	 * keep_take: the user named a take ("the second one") rather than tapping it; it goes on the
	 * replica and stays, as the tap would have done (an agent wrote the notes out again instead).
	 */
	#keepByWord(word: string): { kept: string; changes: readonly string[] } | { error: string } {
		const lab = this.#env.lab;
		const found = this.#pendingOffer();
		if (!lab?.hear || !lab.keep || !found) {
			return { error: 'No offer of takes is waiting: none was made, or one is kept already.' };
		}
		const { display } = found;
		const w = word.trim().toLowerCase();
		const letter = /^[a-z]$/.test(w) ? w.charCodeAt(0) - 97 : -1;
		const number = /^\d+$/.test(w) ? Number(w) - 1 : -1;
		const named = display.takes.findIndex((t) => t.label.toLowerCase().includes(w));
		const index = [letter, number, named].find((i) => i >= 0 && i < display.takes.length) ?? -1;
		if (index < 0) {
			return {
				error: `No take "${word}": the takes are ${display.takes.map((t, i) => `${i + 1} "${t.label}"`).join(', ')}.`
			};
		}
		if (!lab.hear(display.offer, index))
			return { error: 'That take could not be put on the replica.' };
		const kept = lab.keep(display.offer);
		if (!kept) return { error: 'That take could not be kept.' };
		display.kept = kept.index;
		delete this.takesOn[display.offer];
		const take = display.takes[kept.index];
		return { kept: take?.label ?? String(kept.index + 1), changes: take?.changes ?? [] };
	}

	/** Takes waiting to be heard and kept, for the next message: the agent could not tell. */
	#takesWaiting(): string | null {
		const found = this.#pendingOffer();
		if (!found) return null;
		const { display } = found;
		const on = this.takesOn[display.offer];
		const list = display.takes.map((t, i) => `${i + 1} "${t.label}"`).join(', ');
		return `<takes>\nYour lab run's takes wait to be kept: ${list}; none is kept yet${on !== undefined ? `, and the user is hearing ${on + 1} "${display.takes[on]?.label}" on the replica now` : ''}. When the user names one, keep_take keeps it.\n</takes>`;
	}

	/** Keeps every take left on the replica (the user went on with it playing). */
	#keepTakesOn(): void {
		for (const offer of Object.keys(this.takesOn)) {
			const entry = this.entries.find(
				(e) => e.kind === 'tool' && e.display?.kind === 'takes' && e.display.offer === offer
			);
			if (entry) this.keepTake(entry.id);
			else delete this.takesOn[offer];
		}
	}

	/**
	 * Compares a turn by ear (its changes note's "before" key): while `holding`, the replica sounds
	 * as it was before the turn, and on release it comes back exactly as it was. Only while the
	 * turn stands (not taken back); the model is not told, since nothing was decided.
	 */
	holdTurn(id: string, holding: boolean): boolean {
		const virtual = this.#env.virtual;
		const turn = this.#turns.get(id);
		const entry = this.entries.find((e) => e.kind === 'changes' && e.id === id);
		if (!virtual || !turn || entry?.kind !== 'changes') return false;
		if (holding) {
			if (turn.held || entry.undo !== 'ready') return false;
			const from = virtual.checkpoint();
			virtual.revert(turn.before, turn.after);
			turn.held = { from, shown: virtual.checkpoint() };
			return true;
		}
		if (!turn.held) return false;
		virtual.revert(turn.held.from, turn.held.shown);
		turn.held = undefined;
		return true;
	}

	/**
	 * What changed on the replica since the user's message, after a batch of tools, when it differs
	 * from what was last reported (docs/AGENT-V2.md, grounding): the model describes the outcome
	 * from this, not from what it meant to do.
	 */
	#grounding(): BetaTextBlockParam[] {
		// what the standing changes were about, so the count reads without the earlier lists (an
		// agent looked back through every earlier message to know what "3 changes" stood for)
		const standingAbout = (subjects: readonly string[]) => {
			const unique = subjects.filter((s, i) => subjects.indexOf(s) === i);
			return unique.length > 8
				? `${unique.slice(0, 8).join(', ')} and ${unique.length - 8} more`
				: unique.join(', ');
		};
		const virtual = this.#env.virtual;
		if (!virtual || !this.#checkpoint) return [];
		let lines: readonly string[];
		try {
			lines = virtual.changesSince(this.#checkpoint);
		} catch {
			return [];
		}
		// playback only the transport tool starts or stops: otherwise it was the user (an agent
		// once could not tell, and left it out)
		const own = this.#calledSinceMessage('transport');
		const marked = lines.map((l) =>
			!own && /^playback (started|stopped)$/.test(l)
				? `${l} (by the user: no tool of yours did)`
				: l
		);
		// where playback stands, so an answer never says it plays when it does not (an agent once
		// told a user "playback is running" on a stopped replica)
		const walk = this.#walkthrough();
		// a sound changed, or parts written together, and never heard: how it sounds is a guess
		// (agents judged "warmer" and the balance of a lead over a bass from the values they wrote,
		// and said so only when asked)
		const tracks = marked.flatMap((l) => /^T(\d+) pattern \d+:/.exec(l)?.[1] ?? []);
		const parts = tracks.filter((t, i) => tracks.indexOf(t) === i).length;
		const shaped = marked.some((l) => /^(aux )?T\d+ (shift )?M\d /.test(l));
		const unheard =
			(shaped || parts >= 2) && !this.#heardSinceMessage()
				? ' Not heard in this answer: describe what you wrote or set, not how it sounds (the balance, warmth, the feel), unless you listen first (listen, or lab.listen in run_lab); if you do not, leave listening unmentioned.'
				: '';
		// a tempo the user named that the replica is not at (an agent built a song "at 100 bpm" at
		// 120 and noticed only in its last line)
		const asked = askedTempo(this.#asked);
		const bpm = virtual.status().bpm;
		const tempo =
			asked !== null && Math.abs(bpm - asked) >= 0.5
				? ` The user's message asks for ${asked} bpm; the tempo is ${bpm}.`
				: '';
		const now = `Now: ${playingNow(virtual)}${walk ? ` ${walk}` : ''}${tempo}${unheard}`;
		const report = [...marked, now].join('\n');
		if (report === this.#reported) return [];
		this.#reported = report;
		// later lists in an answer give what is new and count the rest, which the earlier lists
		// gave word for word (an agent found each list repeating all the earlier changes noisy)
		const before = this.#reportedLines;
		const fresh = marked.filter((l) => !before.includes(l));
		const standing = marked.length - fresh.length;
		// an earlier line that no longer holds and has no newer line about the same thing (a pattern
		// written twice reads as its latest line alone): back as it was, which an agent once could
		// not place when the line said only "taken back"
		const about = (l: string) =>
			l.includes(':') ? l.slice(0, l.indexOf(':')) : l.replace(/\s\d.*$/, '');
		const renewed = fresh.map(about);
		const gone = before.filter((l) => !marked.includes(l) && !renewed.includes(about(l)));
		this.#reportedLines = marked;
		const listed = [
			...fresh.map((l) => `- ${l}`),
			...(gone.length
				? [
						`- no longer so, back as at the user\u2019s message (an earlier list gave it): ${gone.map(backAgain).join('; ')}`
					]
				: []),
			...(standing > 0
				? [
						`- and ${standing} change${standing === 1 ? '' : 's'} from the earlier list${before.length === 1 ? '' : 's'}, still as given there (${standingAbout(
							marked
								.filter((l) => before.includes(l))
								.map(about)
								// "T5 plays pattern 1 → 2" is about which pattern T5 plays, not "T5 plays pattern"
								.map((l) => l.replace(/^(T\d+) plays pattern$/, 'which pattern $1 plays'))
						)})`
					]
				: [])
		];
		// a demo puts the replica back, which once read as if it never ran
		const shown = this.#calledSinceMessage('show_on_replica')
			? '; show_on_replica puts the replica back after its demo, so a demo leaves nothing here'
			: '';
		// a plan shown to reach a page moves the screen alone (an agent read "nothing changed" just
		// after the planner had taken the replica to M2, and was unsure which to believe)
		const moved = this.#calledSinceMessage('plan_steps')
			? '; the screen may be on another page now, which is no change to the sound or the patterns'
			: '';
		const text =
			marked.length === 0 && before.length === 0
				? `Nothing changed on the replica during this answer, by your calls or the user (it sounds and is set as it was when the user\u2019s message came${shown}${moved}).\n${now}`
				: fresh.length === 0 && gone.length === 0
					? `Nothing more changed on the replica since the last list: its ${standing} change${standing === 1 ? '' : 's'} still stand${standing === 1 ? 's' : ''}.\n${now}`
					: `What changed on the replica since the user\u2019s message, yours and anything the user did on it meanwhile (describe the outcome from this${before.length ? ', with the earlier lists' : ''}):\n${listed.join('\n')}\n${now}`;
		return [{ type: 'text', text: `<replica-changes>\n${text}\n</replica-changes>` }];
	}

	/**
	 * What changed on the replica since the agent last finished (the user's hands, playback they
	 * started), for the next message: an agent once told a user who had taken two hats out that
	 * nothing had changed, since its own list counts only from the new message.
	 */
	#userChanges(): string | null {
		const virtual = this.#env.virtual;
		if (!virtual || !this.#lastSeen) return null;
		let lines: readonly string[];
		try {
			lines = virtual.changesSince(this.#lastSeen);
		} catch {
			return null;
		}
		const walk = this.#walkthrough();
		// where playback stands with it, and a take running (an agent asked "what now?" mid-take
		// could not tell whether recording was still on)
		const now = `Now: ${playingNow(virtual)}`;
		const recording = virtual.status().recording !== undefined;
		// the keys they pressed, which a change of page or mode leaves no change line for (an agent
		// asked "I pressed some buttons, where am I?" could say where, not what was pressed)
		const pressed = this.#presses.list();
		const keys = pressed.length
			? `The user's own presses on the replica since then, in order: ${pressed.join(', ')}.`
			: null;
		if (lines.length === 0) {
			const parts = [keys, walk, recording || keys ? now : null].filter(Boolean);
			return parts.length ? `<user-changes>\n${parts.join('\n')}\n</user-changes>` : null;
		}
		const since = this.#answered ? 'Since your last answer' : 'Since the chat opened';
		// whose they are, firmly (an agent told a user who had muted two tracks that it was probably
		// them "or a stray key press"), apart from the song moving on as it plays
		const playedOn = lines.filter((l) => l.endsWith('(the song moved on)'));
		const byHand = lines.filter((l) => !playedOn.includes(l));
		const parts = [
			byHand.length
				? `${since}, the user changed the replica by hand (its keys, the mouse or the computer keyboard; none of your tools ran since):\n${byHand.map((l) => `- ${l}`).join('\n')}`
				: null,
			playedOn.length
				? `${byHand.length ? 'And as' : `${since}, as`} the replica played on: ${playedOn.join('; ')}.`
				: null,
			keys,
			walk,
			now
		].filter(Boolean);
		return `<user-changes>\n${parts.join('\n')}\n</user-changes>`;
	}

	/**
	 * A walkthrough lit on the replica, in a sentence: how far the user is (an agent could not tell
	 * mid-way, and read "nothing changed" after lighting one as a failure).
	 */
	#walkthrough(): string | null {
		const p = this.#env.guide?.progress?.() ?? null;
		if (!p) return null;
		const done = p.done.length;
		const held = p.held?.length ? `; held down now: ${p.held.join(', ')}` : '';
		return `A walkthrough is lit (${p.goal}): ${done} of ${p.total} steps done${done ? ` (${p.done.join(', ')})` : ''}${p.next ? `, waiting for the user to do ${p.next}` : ''}${held}.`;
	}

	/** Whether the model has called the tool `name` since the user's message. */
	/** Whether this answer heard the music: listen, listen_tracks, or a lab program that listens. */
	#heardSinceMessage(): boolean {
		const hears = (b: { type: string; name?: string; input?: unknown }) =>
			b.type === 'tool_use' &&
			(b.name === 'listen' ||
				b.name === 'listen_tracks' ||
				(b.name === 'run_lab' && /lab\.listen\(/.test(JSON.stringify(b.input ?? null))));
		for (let i = this.#messages.length - 1; i >= 0; i--) {
			const m = this.#messages[i];
			if (m.role === 'user') {
				if (typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result')) {
					return false;
				}
				continue;
			}
			if (typeof m.content === 'string') continue;
			if (m.content.some((b) => hears(b as { type: string; name?: string; input?: unknown }))) {
				return true;
			}
		}
		return false;
	}

	#calledSinceMessage(name: string): boolean {
		for (let i = this.#messages.length - 1; i >= 0; i--) {
			const m = this.#messages[i];
			if (m.role === 'user') {
				if (typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result')) {
					return false;
				}
				continue;
			}
			if (typeof m.content === 'string') continue;
			if (m.content.some((b) => b.type === 'tool_use' && b.name === name)) return true;
		}
		return false;
	}

	/**
	 * What the app adds to a message (docs/AGENT-V2.md): the skills it clearly needs that the
	 * conversation does not hold yet, and in map mode the manual units that best match it.
	 */
	async #turnContext(
		text: string,
		attachments: readonly PreparedAttachment[]
	): Promise<string | null> {
		const parts: string[] = [];
		const texts = messageTexts(this.#messages);
		// a conversation's first message brings what the agent remembers about the user
		const memory = this.#env.memory;
		if (memory && this.#messages.length === 0) {
			const briefing = await memoryBriefing(memory).catch(() => null);
			if (briefing) parts.push(briefing);
		}
		if (this.#routeSkills) {
			const loaded = loadedSkills(texts);
			const kinds = attachments.map((a) => a.view.kind);
			for (const name of routeSkills({ text, attachments: kinds, loaded })) {
				const skill = skillNamed(name);
				if (!skill) continue;
				parts.push(skillText(skill));
				// the chat shows a routed skill as the chip a loaded one gets
				this.entries.push({
					kind: 'tool',
					id: entryId('skill'),
					agent: 'conductor',
					parent: null,
					name: 'skill',
					label: 'skill',
					toolKind: 'read',
					status: 'ok',
					input: { name },
					summary: name
				});
			}
		}
		if (this.#manualMode === 'map' && text) {
			const seen = texts.flatMap((t) => [...t.matchAll(MANUAL_UNIT)].map((m) => m[1]));
			const hits = await this.#manual.search(text, RETRIEVED_UNITS * 2).catch(() => []);
			for (const hit of hits.filter((h) => !seen.includes(h.id)).slice(0, RETRIEVED_UNITS)) {
				const unit = await this.#manual.unit(hit.id).catch(() => null);
				if (unit) parts.push(`<manual-unit id="${unit.id}">\n${unit.text.trim()}\n</manual-unit>`);
			}
		}
		return parts.length > 0 ? `Added by the app for this message:\n\n${parts.join('\n\n')}` : null;
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
		// The status line is live from the first moment, before the system prompt or the model.
		this.activity = startActivity(this.#now(), !this.#answered);
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
					afterTools: () => this.#grounding(),
					quirks: this.#quirks,
					overloadRetries: this.#overloadRetries,
					wait: (ms) => new Promise((done) => this.#timers.setTimeout(done, ms))
				},
				this.#transcript()
			);
			const failed = result.error !== null && result.error.code !== 'aborted';
			this.lastError = failed ? result.error : null;
			this.#noteChanges();
			this.#lastSeen = this.#env.virtual?.checkpoint() ?? null;
			this.#presses.clear();
			this.status = failed ? 'error' : 'idle';
		} catch (error) {
			const info = normalizeError(error);
			this.lastError = info;
			this.status = 'error';
			this.#emit({ type: 'error', agent: 'conductor', error: info });
		} finally {
			if (this.#controller === controller) this.#controller = null;
			this.activity = null;
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
		this.litChanges = null;
		this.takesOn = {};
		this.todos = [];
		this.usage = emptyUsage();
		this.lastError = null;
		this.status = 'idle';
		this.activity = null;
		this.#answered = false;
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
		this.#answered = record.messages.some((m) => m.role === 'assistant');
		this.#repairTranscript();
		this.entries = record.entries;
		this.litChanges = null;
		this.takesOn = {};
		settleEntries(this.entries, { voice: true });
		// a turn's take-back lives in the page session that made it
		for (const entry of this.entries) if (entry.kind === 'changes') delete entry.undo;
		this.todos = record.todos;
		this.usage = { ...emptyUsage(), ...record.usage };
		this.lastError = null;
		this.status = 'idle';
		this.activity = null;
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
