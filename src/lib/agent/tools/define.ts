/**
 * Tool definitions and the registry.
 *
 * A tool is declared once with a zod schema (`defineTool`). The registry turns the schemas into
 * **strict** JSON Schema for the API (`strict: true`, `additionalProperties: false`) and re-validates
 * every call with zod on our side, because strict schemas cannot carry numeric ranges, lengths or
 * item counts (those move into the description text, where the model still reads them).
 *
 * The tool list is sorted by name and serialised deterministically, so the `tools` prefix of every
 * request is byte-identical and stays in the prompt cache (docs/research/70-agent-harness.md §4, §7).
 *
 * Kinds set the default policy: `read` and `ui` run at once, `propose` never touches the device,
 * `mutate` waits for the user's approval unless the tool says `approval: 'auto'`. `device: true`
 * tools run one at a time on the single-flight device queue.
 */
import type {
	BetaSearchResultBlockParam,
	BetaTextBlockParam,
	BetaTool
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import type { DeviceStack } from '$lib/device';
import type { ReplicaState } from '$lib/replica';
import type { ListenHost } from '../listen-host';
import type { ManualSource } from '../manual-source';
import type { AgentName, InverseCall, Todo, ToolKind, ToolPreview } from '../types';
import type { SampleInput } from '$lib/core/presets';
import type { VirtualOpxy } from '../virtual-opxy';

/** `setTimeout` / `clearTimeout`, injectable for tests. */
export interface AgentTimers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** What a subagent returns to the `task` tool. */
export interface SubagentResult {
	readonly text: string;
	readonly sources: readonly { readonly title: string; readonly source: string }[];
	readonly stopReason: string | null;
}

/** Everything tools can reach. Injected, so the whole layer runs in Node against fakes. */
export interface AgentEnvironment {
	/** The app's device stack; null when there is none (tools then explain how to connect). */
	readonly device: DeviceStack | null;
	/** The replica the agent animates; null when headless. */
	readonly replica: ReplicaState | null;
	/** What the replica's screen shows (the app's simulation of the OP-XY); absent when headless. */
	readonly screen?: ScreenReader | null;
	/**
	 * The virtual OP-XY on screen: live tools fall back to it when no device is connected, and the
	 * programming tools write to it. Absent when headless.
	 */
	readonly virtual?: VirtualOpxy | null;
	/** Walks the user through steps on the replica, one lit step at a time; absent when headless. */
	readonly guide?: GuideHost | null;
	/** The preset maker's inbox, where make_kit leaves a kit; absent when headless. */
	readonly presets?: PresetInboxHost | null;
	/** The replica's project going to the OP-XY over USB (send_project); absent when headless. */
	readonly projects?: ProjectHost | null;
	/** Files the user attached in this conversation that tools read themselves (import_midi). */
	readonly files?: AttachedFiles | null;
	/** Records what the OP-XY or the replica plays and hears it (`listen`); absent when headless. */
	readonly listen?: ListenHost | null;
	readonly manual: ManualSource;
	readonly timers: AgentTimers;
	/** How long device tools wait to see the device confirm a change (e.g. echoed start); 0 = no wait. */
	readonly confirmWindowMs: number;
	/** The plan board behind `write_todos`. */
	readonly plan: { get(): readonly Todo[]; set(items: readonly Todo[]): void };
	/** Aborts every queued and running device job (panic). */
	readonly abortDeviceWork: (reason: string) => void;
	/** Runs a subagent for the `task` tool; absent inside subagents (no recursion). */
	readonly runSubagent?: (
		type: string,
		description: string,
		ctx: ToolContext
	) => Promise<SubagentResult>;
}

/** Where make_kit leaves a kit: the app's preset inbox (`$lib/app/preset-inbox.svelte.ts`). */
export interface PresetInboxHost {
	put(draft: { readonly name: string; readonly samples: readonly SampleInput[] }): void;
	/** The preset maker's address, for the answer's link. */
	readonly href: string;
}

/** Files attached in this conversation, as tools read them (kept in memory, by name). */
export interface AttachedFiles {
	/** A MIDI file's bytes by the name the chat shows, or null. */
	midi(name: string): Uint8Array | null;
	/** The names of the MIDI files attached so far. */
	midiNames(): readonly string[];
}

/** The app's project transfer (`$lib/app/project-transfer.svelte.ts`) as send_project sees it. */
export interface ProjectHost {
	/** Whether this browser can reach USB devices (WebUSB). */
	readonly usb: boolean;
	/**
	 * Adds the replica's project to the OP-XY as `projects/user/<name>.xy` over MTP (the OP-XY in
	 * MTP mode); never replaces a file. What the device file could not carry comes back in skipped.
	 */
	saveToDevice(
		name: string
	): Promise<
		{ readonly path: string; readonly skipped: readonly string[] } | { readonly error: string }
	>;
}

/** The app's walkthrough (`$lib/app/guide.svelte.ts`) as the tools see it. */
export interface GuideHost {
	/** Starts lighting `steps` on the replica, each until the screen shows where it leads. */
	start(
		goal: string,
		steps: readonly { readonly keys: string; readonly clicks?: number; readonly screen: string }[]
	): void;
	/** Ends a walkthrough (an animation on the replica would clear its marks). */
	stop(): void;
}

/** What the replica's screen shows now (the app's UI simulator, not the real device's screen). */
export interface ScreenReading {
	/** The page the screen draws ("tempo", "lfo", "mix", …). */
	readonly page: string;
	/** The page in words, with its values. */
	readonly shows: string;
	readonly mode: string;
	/** A page opened over the mode (tempo, project, com, sample, players, bar), or null. */
	readonly overlay: string | null;
	/** The M-page of the mode, when it has them. */
	readonly modulePage: number | null;
	/** The selected instrument track (1–8) and its engine. */
	readonly track: number;
	readonly engine: string;
	readonly shift: boolean;
	readonly bpm: number;
	/** The simulated transport. */
	readonly playing: boolean;
}

/** Reads the replica's screen. */
export interface ScreenReader {
	read(): ScreenReading;
}

/** Per-call context handed to `run`. */
export interface ToolContext {
	readonly toolCallId: string;
	readonly agent: AgentName;
	/** Aborted when the user stops the run (or panic interrupts device work). */
	readonly signal: AbortSignal;
	readonly env: AgentEnvironment;
}

/** A block a tool may return besides plain text: search results carry citations. */
export type ToolResultBlock = BetaTextBlockParam | BetaSearchResultBlockParam;

/** What a tool reports back. */
export interface ToolResult {
	/** What the model reads: usually compact JSON, or text / search-result blocks. */
	readonly content: string | readonly ToolResultBlock[];
	/** One lowercase line for the tool chip. */
	readonly summary: string;
	/** The tool failed; the model gets `is_error: true`. */
	readonly isError?: boolean;
	/** For mutate tools: whether anything was actually sent (false: "already playing"). */
	readonly applied?: boolean;
	/** The state after the change, for the journal. */
	readonly after?: unknown;
}

/** A tool as the registry stores it. `S` is the snapshot type taken before a change. */
export interface ToolDefinition<I = unknown, S = unknown> {
	/** API name: lowercase snake case. */
	readonly name: string;
	/** Friendly lowercase label for chips and the approval sheet ("set tempo"). */
	readonly label: string;
	readonly kind: ToolKind;
	readonly description: string;
	readonly input: z.ZodType<I>;
	/** Sends MIDI: runs on the single-flight device queue. */
	readonly device?: boolean;
	/** Skips the queue and interrupts it (panic only). */
	readonly priority?: boolean;
	/** Override the kind's default policy (`mutate` asks, everything else runs). */
	readonly approval?: 'ask' | 'auto';
	/**
	 * false sends the schema without `strict`: the API then does not compile it into its grammar,
	 * which has a size limit that a schema with many optional fields can push the whole tool set
	 * over. The input is still validated with zod on arrival.
	 */
	readonly strict?: boolean;
	/** Captures the state the call is about to change (before approval and again before running). */
	snapshot?(input: I, env: AgentEnvironment): S;
	/** What the change will do, for the approval sheet and the journal. */
	preview?(input: I, before: S, env: AgentEnvironment): ToolPreview;
	/** The call that undoes this one, when the previous state is known (or safely assumable). */
	inverse?(input: I, before: S, env: AgentEnvironment): InverseCall | null;
	run(input: I, ctx: ToolContext): Promise<ToolResult>;
}

/** A tool with its types erased, as stored in a registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any, any>;

/**
 * Declares a tool; the input type is inferred from the zod schema.
 * @example defineTool({ name: 'set_tempo', kind: 'mutate', input: z.object({ bpm: z.number() }), … })
 */
export function defineTool<Schema extends z.ZodType, S = undefined>(
	definition: ToolDefinition<z.output<Schema>, S> & { readonly input: Schema }
): AnyTool {
	return definition as AnyTool;
}

/** Invalid tool declarations (duplicate names, bad names, non-object schemas). */
export class ToolDefinitionError extends Error {
	override name = 'ToolDefinitionError';
}

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

// ─── strict JSON Schema ─────────────────────────────────────────────────────────────────────────

type JsonSchema = Record<string, unknown>;

/** String formats the API accepts in strict schemas. */
const STRICT_FORMATS = new Set([
	'date-time',
	'time',
	'date',
	'duration',
	'email',
	'hostname',
	'uri',
	'ipv4',
	'ipv6',
	'uuid'
]);

/** zod writes these for unbounded integers; they say nothing. */
const SAFE_LIMIT = Number.MAX_SAFE_INTEGER;

function isMeaningfulBound(value: unknown): value is number {
	return typeof value === 'number' && Math.abs(value) < SAFE_LIMIT;
}

function rangeText(min: unknown, max: unknown, unit = ''): string | null {
	const lo = isMeaningfulBound(min) ? min : null;
	const hi = isMeaningfulBound(max) ? max : null;
	const u = unit ? ` ${unit}` : '';
	if (lo !== null && hi !== null) return lo === hi ? `exactly ${lo}${u}` : `${lo}–${hi}${u}`;
	if (lo !== null) return `at least ${lo}${u}`;
	if (hi !== null) return `at most ${hi}${u}`;
	return null;
}

/** Constraints strict mode cannot express, as words appended to the description. */
function constraintNotes(node: JsonSchema): string[] {
	const notes: string[] = [];
	const type = node.type;
	if (type === 'number' || type === 'integer') {
		const range = rangeText(node.minimum, node.maximum);
		if (range) notes.push(`range ${range}`);
		if (isMeaningfulBound(node.exclusiveMinimum))
			notes.push(`greater than ${node.exclusiveMinimum}`);
		if (isMeaningfulBound(node.exclusiveMaximum)) notes.push(`less than ${node.exclusiveMaximum}`);
		if (typeof node.multipleOf === 'number') notes.push(`a multiple of ${node.multipleOf}`);
	} else if (type === 'string') {
		const length = rangeText(node.minLength, node.maxLength, 'characters');
		if (length) notes.push(length);
		if (typeof node.pattern === 'string') notes.push(`matching /${node.pattern}/`);
		if (typeof node.format === 'string' && !STRICT_FORMATS.has(node.format)) {
			notes.push(`format ${node.format}`);
		}
	} else if (type === 'array') {
		const min = typeof node.minItems === 'number' && node.minItems > 1 ? node.minItems : null;
		const items = rangeText(min, node.maxItems, 'items');
		if (items) notes.push(items);
	}
	if (node.default !== undefined) notes.push(`default ${JSON.stringify(node.default)}`);
	return notes;
}

function strictify(node: JsonSchema, path: string): JsonSchema {
	const out: JsonSchema = {};
	const anyOf = node.anyOf ?? node.oneOf;
	if (Array.isArray(anyOf)) {
		out.anyOf = anyOf.map((branch, i) => strictify(branch as JsonSchema, `${path}|${i}`));
	} else if (node.type !== undefined) {
		out.type = node.type;
	} else if (node.const === undefined && node.enum === undefined) {
		throw new ToolDefinitionError(
			`${path}: every schema node needs a type (got ${JSON.stringify(node)})`
		);
	}
	if (node.enum !== undefined) out.enum = node.enum;
	if (node.const !== undefined) out.const = node.const;
	const notes = constraintNotes(node);
	const description = [typeof node.description === 'string' ? node.description : '', ...notes]
		.filter(Boolean)
		.join('; ');
	if (description) out.description = description;
	if (node.type === 'object') {
		const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
		out.properties = Object.fromEntries(
			Object.entries(properties).map(([key, value]) => [key, strictify(value, `${path}.${key}`)])
		);
		if (Array.isArray(node.required) && node.required.length > 0) out.required = node.required;
		out.additionalProperties = false;
	} else if (node.type === 'array') {
		if (node.items && typeof node.items === 'object') {
			out.items = strictify(node.items as JsonSchema, `${path}[]`);
		}
		if (node.minItems === 1) out.minItems = 1;
	} else if (
		node.type === 'string' &&
		typeof node.format === 'string' &&
		STRICT_FORMATS.has(node.format)
	) {
		out.format = node.format;
	}
	return out;
}

/**
 * The strict JSON Schema for a tool's zod input schema: inlined (no `$ref`), every object closed
 * with `additionalProperties: false`, unsupported constraints moved into descriptions.
 * @throws {ToolDefinitionError} when the schema is not an object or cannot be represented
 */
export function strictJsonSchema(schema: z.ZodType, name = 'tool'): BetaTool.InputSchema {
	let raw: JsonSchema;
	try {
		raw = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'throw' }) as JsonSchema;
	} catch (error) {
		throw new ToolDefinitionError(
			`${name}: the input schema cannot be expressed as JSON Schema (${error instanceof Error ? error.message : String(error)})`,
			{ cause: error }
		);
	}
	if (raw.type !== 'object') {
		throw new ToolDefinitionError(`${name}: the input schema must be a z.object()`);
	}
	return strictify(raw, name) as BetaTool.InputSchema;
}

/**
 * The API compiles strict schemas into a grammar and refuses a request whose strict tools have more
 * than 24 optional parameters in all ("Schemas contains too many optional parameters"), or whose
 * grammar grows too large, so a registry over the count is refused here, where a test catches it.
 */
export const MAX_OPTIONAL_PARAMETERS = 24;

/** Properties not listed as required, at any depth of a strict schema. */
export function optionalParameters(node: JsonSchema): number {
	let count = 0;
	if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
		const properties = node.properties as Record<string, JsonSchema>;
		const required = new Set(Array.isArray(node.required) ? node.required : []);
		for (const [key, value] of Object.entries(properties)) {
			if (!required.has(key)) count++;
			count += optionalParameters(value);
		}
	}
	if (node.items && typeof node.items === 'object')
		count += optionalParameters(node.items as JsonSchema);
	for (const branch of [...((node.anyOf as JsonSchema[] | undefined) ?? [])])
		count += optionalParameters(branch);
	return count;
}

// ─── registry ───────────────────────────────────────────────────────────────────────────────────

/** Outcome of validating a call's input. */
export type ParsedCall =
	| { readonly ok: true; readonly tool: AnyTool; readonly input: unknown }
	| { readonly ok: false; readonly tool: AnyTool | null; readonly error: string };

/** A fixed, name-sorted set of tools. */
export class ToolRegistry {
	readonly #tools: readonly AnyTool[];
	readonly #byName: ReadonlyMap<string, AnyTool>;
	#api: BetaTool[] | null = null;

	constructor(tools: readonly AnyTool[]) {
		const byName = new Map<string, AnyTool>();
		for (const tool of tools) {
			if (!NAME_RE.test(tool.name)) {
				throw new ToolDefinitionError(
					`"${tool.name}" is not a valid tool name (lowercase snake case)`
				);
			}
			if (byName.has(tool.name))
				throw new ToolDefinitionError(`tool "${tool.name}" is defined twice`);
			if (tool.priority && !tool.device) {
				throw new ToolDefinitionError(`${tool.name}: only device tools can have priority`);
			}
			byName.set(tool.name, tool);
		}
		this.#tools = [...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		this.#byName = byName;
	}

	/** Tools in name order. */
	list(): readonly AnyTool[] {
		return this.#tools;
	}

	/** Tool names in order. */
	get names(): string[] {
		return this.#tools.map((t) => t.name);
	}

	get(name: string): AnyTool | undefined {
		return this.#byName.get(name);
	}

	/** A registry with only the named tools (for subagents). */
	subset(names: readonly string[]): ToolRegistry {
		return new ToolRegistry(
			names.map((name) => {
				const tool = this.#byName.get(name);
				if (!tool) throw new ToolDefinitionError(`unknown tool "${name}"`);
				return tool;
			})
		);
	}

	/**
	 * The `tools` array for the API: sorted, strict, byte-stable (computed once). Strict schemas
	 * guarantee the shape; ranges are re-checked by {@link ToolRegistry.parse}.
	 */
	apiTools(): BetaTool[] {
		if (!this.#api) {
			const api = this.#tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				input_schema: strictJsonSchema(tool.input, tool.name),
				strict: tool.strict !== false
			}));
			// the budget counts the schemas the API compiles: the strict ones
			const optional = api
				.filter((tool) => tool.strict)
				.reduce((sum, tool) => sum + optionalParameters(tool.input_schema as JsonSchema), 0);
			if (optional > MAX_OPTIONAL_PARAMETERS) {
				throw new ToolDefinitionError(
					`the tools have ${optional} optional parameters; the API takes at most ${MAX_OPTIONAL_PARAMETERS}`
				);
			}
			this.#api = api;
		}
		return this.#api;
	}

	/** Validates a call's input with the tool's zod schema (ranges, lengths, refinements). */
	parse(name: string, input: unknown): ParsedCall {
		const tool = this.#byName.get(name);
		if (!tool) {
			return { ok: false, tool: null, error: `There is no tool named "${name}".` };
		}
		const result = tool.input.safeParse(input);
		if (result.success) return { ok: true, tool, input: result.data };
		return {
			ok: false,
			tool,
			error: `Invalid input for ${name}:\n${z.prettifyError(result.error)}`
		};
	}
}

/** Whether a tool must wait for the user's approval by default (before session grants). */
export function asksForApproval(tool: AnyTool): boolean {
	return (tool.approval ?? (tool.kind === 'mutate' ? 'ask' : 'auto')) === 'ask';
}

// ─── helpers for tool implementations ───────────────────────────────────────────────────────────

/** Rejected promise reason for aborted waits. */
export class ToolAbortedError extends Error {
	override name = 'ToolAbortedError';
}

/** Waits `ms`, rejecting with {@link ToolAbortedError} when `signal` aborts. */
export function sleep(ms: number, timers: AgentTimers, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new ToolAbortedError('stopped'));
			return;
		}
		const onAbort = () => {
			timers.clearTimeout(handle);
			reject(new ToolAbortedError('stopped'));
		};
		const handle = timers.setTimeout(
			() => {
				signal?.removeEventListener('abort', onAbort);
				resolve();
			},
			Math.max(0, ms)
		);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/** A successful result whose content is compact JSON. */
export function jsonResult(
	data: unknown,
	summary: string,
	extra: Partial<ToolResult> = {}
): ToolResult {
	return { content: JSON.stringify(data), summary, ...extra };
}

/** A failed result: the model reads `message` and can correct itself or tell the user. */
export function errorResult(message: string, summary = message): ToolResult {
	return { content: message, summary, isError: true, applied: false };
}
