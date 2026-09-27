/**
 * One agent loop on the Messages API, shared by the conductor and its subagents:
 * stream → (tool_use → tools → tool_result) → … → end.
 *
 * API hygiene for Opus 5.5-era models (docs/research/70-agent-harness.md §4):
 * - **Append-only transcript.** Assistant content is stored exactly as the API returned it
 *   (thinking blocks and their signatures untouched) and never edited afterwards; tool results for
 *   every `tool_use` go back in one user message.
 * - **Cache layout.** `tools` (name-sorted, strict) → `system` (frozen; breakpoint on its last
 *   block) → `messages` (top-level automatic caching for the growing tail).
 * - **Thinking** is adaptive with `display: 'updates'` (between-tool progress notes) or
 *   `'summarized'` where supported; `tool_choice` is never forced.
 * - **Mid-conversation system messages** carry live device state on models that accept them; on
 *   others they are rendered as `<system-reminder>` text in the user turn (rendering is
 *   deterministic, so the cached prefix stays stable).
 * - **Refusals** (`stop_reason: 'refusal'`) are not appended; server-side fallbacks
 *   (`fallbacks: 'default'`) are requested where the model supports them.
 */
import type {
	BetaContentBlock,
	BetaMessage,
	BetaMessageParam,
	BetaMessageStreamParams,
	BetaTextBlockParam,
	BetaTextCitation,
	BetaToolResultBlockParam
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ModelClient } from './client';
import { normalizeError } from './errors';
import {
	BETA_FALLBACK_DEFAULT,
	BETA_THINKING_UPDATES,
	profileFor,
	tokenCounts,
	usageCost,
	type ModelProfile,
	type TokenCounts
} from './models';
import type { ToolCallRequest } from './executor';
import type { ToolRegistry } from './tools/define';
import type { AgentErrorInfo, AgentEvent, AgentName, Citation } from './types';

/** Effort levels (`output_config.effort`). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** The conversation, append-only. */
export interface Transcript {
	readonly messages: readonly BetaMessageParam[];
	append(message: BetaMessageParam): void;
}

/** A plain array-backed transcript. */
export function arrayTranscript(messages: BetaMessageParam[] = []): Transcript {
	return {
		messages,
		append(message) {
			messages.push(message);
		}
	};
}

/** How to run one loop. */
export interface LoopConfig {
	readonly agent: AgentName;
	readonly client: ModelClient;
	readonly model: string;
	/** Frozen system prefix; the last block carries the cache breakpoint. */
	readonly system: readonly BetaTextBlockParam[];
	readonly registry: ToolRegistry;
	readonly effort?: Effort | null;
	readonly maxTokens: number;
	/** Model calls per loop before it stops itself. */
	readonly maxIterations: number;
	readonly signal: AbortSignal;
	readonly emit: (event: AgentEvent) => void;
	/** Runs one turn's tool calls; must resolve with one result per call, in order. */
	readonly runTools: (calls: readonly ToolCallRequest[]) => Promise<BetaToolResultBlockParam[]>;
	/** The `task` call this loop runs under (subagents), for nesting in the UI. */
	readonly parent?: string | null;
	/** Turn ids (injectable for tests). */
	readonly makeTurnId?: () => string;
	/** Models that rejected a feature at runtime; the loop stops using it for them. */
	readonly quirks?: ModelQuirks;
}

/** Features a model turned out not to accept (learned from 400s, kept per session). */
export interface ModelQuirks {
	readonly noFallbacks: Set<string>;
	readonly noSystemMessages: Set<string>;
	readonly noThinkingUpdates: Set<string>;
}

/** Empty quirk sets. */
export function createQuirks(): ModelQuirks {
	return { noFallbacks: new Set(), noSystemMessages: new Set(), noThinkingUpdates: new Set() };
}

/** What a finished loop reports. */
export interface LoopResult {
	/** Stop reason of the last response, `error` or `aborted` when it did not finish. */
	readonly stopReason: string | null;
	/** Text of the last assistant message. */
	readonly text: string;
	readonly citations: readonly Citation[];
	readonly error: AgentErrorInfo | null;
	readonly tokens: TokenCounts;
	readonly usd: number | null;
	readonly iterations: number;
}

let turnCounter = 0;

function defaultTurnId(): string {
	return `turn-${Date.now().toString(36)}-${++turnCounter}`;
}

function systemText(content: BetaMessageParam['content']): string {
	if (typeof content === 'string') return content;
	return content
		.map((block) => (block.type === 'text' ? block.text : ''))
		.filter(Boolean)
		.join('\n');
}

/**
 * Renders the stored transcript for one model: `system` messages stay system messages only where
 * the API accepts them (the model supports them, they follow a user turn, and they are last or
 * followed by an assistant turn); otherwise they become `<system-reminder>` user text.
 */
export function renderMessages(
	messages: readonly BetaMessageParam[],
	supportsSystem: boolean
): BetaMessageParam[] {
	const out: BetaMessageParam[] = [];
	messages.forEach((message, i) => {
		if (message.role !== 'system') {
			out.push(message);
			return;
		}
		const next = messages[i + 1];
		const keep =
			supportsSystem &&
			out.at(-1)?.role === 'user' &&
			(next === undefined || next.role === 'assistant');
		out.push(
			keep
				? message
				: {
						role: 'user',
						content: [
							{
								type: 'text',
								text: `<system-reminder>\n${systemText(message.content)}\n</system-reminder>`
							}
						]
					}
		);
	});
	return out;
}

/** The request for one step of the loop. */
export function buildRequest(
	config: Pick<LoopConfig, 'model' | 'system' | 'registry' | 'effort' | 'maxTokens' | 'quirks'>,
	messages: readonly BetaMessageParam[]
): BetaMessageStreamParams {
	const profile: ModelProfile = profileFor(config.model);
	const quirks = config.quirks;
	const betas: string[] = [];
	const supportsSystem = profile.midConversationSystem && !quirks?.noSystemMessages.has(profile.id);
	const params: BetaMessageStreamParams = {
		model: config.model,
		max_tokens: Math.min(config.maxTokens, profile.maxOutputTokens),
		system: [...config.system],
		messages: renderMessages(messages, supportsSystem),
		cache_control: { type: 'ephemeral' }
	};
	const tools = config.registry.apiTools();
	if (tools.length > 0) params.tools = tools;
	if (profile.thinking === 'adaptive') {
		const updates =
			profile.thinkingDisplay === 'updates' && !quirks?.noThinkingUpdates.has(profile.id);
		params.thinking = { type: 'adaptive', display: updates ? 'updates' : 'summarized' };
		if (updates) betas.push(BETA_THINKING_UPDATES);
	}
	if (profile.effort && config.effort) params.output_config = { effort: config.effort };
	if (profile.fallbacks && !quirks?.noFallbacks.has(profile.id)) {
		params.fallbacks = 'default';
		betas.push(BETA_FALLBACK_DEFAULT);
	}
	if (betas.length > 0) params.betas = betas;
	return params;
}

/**
 * After a mid-output fallback, blocks before the last `fallback` block that are model-internal
 * (thinking, tool use) must not be echoed back; everything else is kept as it came.
 */
export function sanitizeAssistantContent(content: readonly BetaContentBlock[]): BetaContentBlock[] {
	const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
	if (lastFallback < 0) return [...content];
	return content.filter(
		(block, i) =>
			i >= lastFallback ||
			!(
				block.type === 'thinking' ||
				block.type === 'redacted_thinking' ||
				block.type === 'tool_use' ||
				block.type === 'server_tool_use'
			)
	);
}

function toCitation(citation: BetaTextCitation): Citation | null {
	if (citation.type === 'search_result_location') {
		return {
			title: citation.title ?? citation.source,
			source: citation.source,
			citedText: citation.cited_text
		};
	}
	if (citation.type === 'web_search_result_location') {
		return {
			title: citation.title ?? citation.url,
			source: citation.url,
			citedText: citation.cited_text
		};
	}
	return null;
}

function messageText(message: BetaMessage | null): { text: string; citations: Citation[] } {
	if (!message) return { text: '', citations: [] };
	const parts: string[] = [];
	const citations: Citation[] = [];
	for (const block of message.content) {
		if (block.type !== 'text') continue;
		parts.push(block.text);
		for (const c of block.citations ?? []) {
			const citation = toCitation(c);
			if (
				citation &&
				!citations.some((x) => x.source === citation.source && x.citedText === citation.citedText)
			) {
				citations.push(citation);
			}
		}
	}
	return { text: parts.join(''), citations };
}

/** Learns from a 400 which optional feature the model rejected; true when a retry makes sense. */
function learnQuirk(error: unknown, model: string, quirks: ModelQuirks | undefined): boolean {
	if (!quirks) return false;
	const status = (error as { status?: unknown }).status;
	if (status !== 400) return false;
	const body = (error as { error?: { error?: { message?: unknown } } }).error;
	const message = typeof body?.error?.message === 'string' ? body.error.message : '';
	const id = profileFor(model).id;
	if (/fallback/i.test(message) && !quirks.noFallbacks.has(id)) {
		quirks.noFallbacks.add(id);
		return true;
	}
	if (/role.*system|system.*role/i.test(message) && !quirks.noSystemMessages.has(id)) {
		quirks.noSystemMessages.add(id);
		return true;
	}
	if (/display|updates/i.test(message) && !quirks.noThinkingUpdates.has(id)) {
		quirks.noThinkingUpdates.add(id);
		return true;
	}
	return false;
}

const ABORTED: AgentErrorInfo = { code: 'aborted', message: 'Stopped.', retryable: true };

/** Tool-call markup written out as answer text: the model lost track of the tool protocol. */
const TOOL_MARKUP = /<(?:antml:)?(?:invoke|parameter)\s+name=|<\/?(?:antml:)?function_calls>/;
/** Length of the passage whose repetition marks a runaway, and how often it may appear. */
const REPEAT_CHARS = 160;
const REPEAT_LIMIT = 4;

/**
 * Where a streamed answer ran away, or -1 while it is fine: tool-call markup written as text
 * (cut at the start of its line), or the same passage repeated over and over (cut before the
 * first repetition). Both end in a loop that only stops at max_tokens, so the loop cuts early.
 */
export function runawayCut(text: string): number {
	const markup = TOOL_MARKUP.exec(text);
	if (markup) {
		const lineStart = text.lastIndexOf('\n', markup.index) + 1;
		return text.slice(lineStart, markup.index).trim() === '' ? lineStart : markup.index;
	}
	if (text.length < REPEAT_CHARS * REPEAT_LIMIT) return -1;
	const tail = text.slice(-REPEAT_CHARS);
	let count = 0;
	let first = -1;
	for (let at = text.indexOf(tail); at >= 0; at = text.indexOf(tail, at + tail.length)) {
		if (first < 0) first = at;
		if (++count >= REPEAT_LIMIT) return first;
	}
	return -1;
}

const RUNAWAY_NOTE = '(The rest of this answer was cut: it started repeating itself.)';

/** Characters of streamed tool input between two input previews (bounds the partial parses). */
const INPUT_PREVIEW_CHARS = 32;

/** A tool call's input as far as it has streamed (the SDK parses partial JSON), or undefined. */
function partialInput(message: BetaMessage | undefined, index: number): unknown {
	try {
		const block = message?.content[index];
		return block?.type === 'tool_use' ? block.input : undefined;
	} catch {
		return undefined; // not parseable yet
	}
}

/**
 * The message a runaway stream leaves: the blocks before the runaway one, that block's text up to
 * the cut, the stop reason of a finished answer, and output tokens estimated from what streamed.
 */
function runawayMessage(
	snapshot: BetaMessage,
	block: number,
	cut: number,
	streamedChars: number
): BetaMessage {
	const content: BetaContentBlock[] = [];
	for (const [index, b] of snapshot.content.entries()) {
		if (index > block) break;
		if (index < block) content.push(b);
		else if (b.type === 'text') {
			const text = b.text.slice(0, cut).trimEnd();
			if (text) content.push({ ...b, text, citations: b.citations ?? null });
		}
	}
	if (!content.some((b) => b.type === 'text')) {
		content.push({ type: 'text', text: RUNAWAY_NOTE, citations: null });
	}
	return {
		...snapshot,
		content,
		stop_reason: 'end_turn',
		usage: {
			...snapshot.usage,
			output_tokens: Math.max(snapshot.usage.output_tokens ?? 0, Math.ceil(streamedChars / 3.5))
		}
	};
}

/** Runs the loop until the model ends its turn, fails, is stopped or hits the step limit. */
export async function runLoop(config: LoopConfig, transcript: Transcript): Promise<LoopResult> {
	const { agent, emit, signal } = config;
	const parent = config.parent ?? null;
	const makeTurnId = config.makeTurnId ?? defaultTurnId;
	const totals: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	let usd: number | null = 0;
	let last: BetaMessage | null = null;
	let iterations = 0;

	const finish = (stopReason: string | null, error: AgentErrorInfo | null): LoopResult => {
		const { text, citations } = messageText(last);
		if (error) emit({ type: 'error', agent, error });
		emit({ type: 'done', agent, stopReason });
		return { stopReason, text, citations, error, tokens: totals, usd, iterations };
	};

	while (iterations < config.maxIterations) {
		if (signal.aborted) return finish('aborted', ABORTED);
		iterations++;
		const turn = makeTurnId();
		let message: BetaMessage;
		try {
			const params = buildRequest(config, transcript.messages);
			emit({ type: 'turn', agent, turn, model: config.model });
			const stream = config.client.stream(params, { signal });
			const texts: string[] = [];
			let streamedChars = 0;
			let runaway: { block: number; cut: number; snapshot: BetaMessage | undefined } | null = null;
			// Tool calls being written, by block index: their input is previewed as it streams, every
			// INPUT_PREVIEW_CHARS characters and once more when the block is complete.
			const calls = new Map<number, { id: string; chars: number; shown: number }>();
			const preview = (index: number) => {
				const call = calls.get(index);
				if (!call) return;
				call.shown = call.chars;
				const input = partialInput(stream.currentMessage, index);
				if (input !== undefined) emit({ type: 'tool_input', agent, id: call.id, input, parent });
			};
			for await (const event of stream) {
				if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
					const { id, name } = event.content_block;
					calls.set(event.index, { id, chars: 0, shown: -1 });
					emit({
						type: 'tool_pending',
						agent,
						id,
						name,
						label: config.registry.get(name)?.label ?? name.replace(/_/g, ' '),
						parent
					});
				} else if (event.type === 'content_block_stop') {
					const call = calls.get(event.index);
					if (call && call.shown !== call.chars) preview(event.index);
					calls.delete(event.index);
				} else if (event.type === 'content_block_delta') {
					const { delta, index } = event;
					if (delta.type === 'text_delta') {
						emit({ type: 'text', agent, turn, block: index, delta: delta.text });
						streamedChars += delta.text.length;
						texts[index] = (texts[index] ?? '') + delta.text;
						const cut = runawayCut(texts[index]);
						if (cut >= 0) {
							runaway = { block: index, cut, snapshot: stream.currentMessage };
							break; // ends the stream (the iterator aborts it)
						}
					} else if (delta.type === 'thinking_delta' && delta.thinking) {
						streamedChars += delta.thinking.length;
						emit({ type: 'progress', agent, turn, block: index, delta: delta.thinking });
					} else if (delta.type === 'citations_delta') {
						const citation = toCitation(delta.citation);
						if (citation) emit({ type: 'citation', agent, turn, block: index, citation });
					} else if (delta.type === 'input_json_delta') {
						const call = calls.get(index);
						if (call) {
							call.chars += delta.partial_json.length;
							if (call.shown < 0 || call.chars - call.shown >= INPUT_PREVIEW_CHARS) preview(index);
						}
					}
				}
			}
			if (runaway?.snapshot) {
				stream.abort();
				message = runawayMessage(runaway.snapshot, runaway.block, runaway.cut, streamedChars);
				const kept = message.content[runaway.block];
				emit({
					type: 'text_replace',
					agent,
					turn,
					block: runaway.block,
					text: kept?.type === 'text' ? kept.text : RUNAWAY_NOTE
				});
				emit({
					type: 'notice',
					agent,
					text: 'Stopped the answer early: it started repeating itself.'
				});
			} else {
				message = await stream.finalMessage();
			}
		} catch (error) {
			if (signal.aborted) return finish('aborted', ABORTED);
			if (learnQuirk(error, config.model, config.quirks)) {
				iterations--;
				continue;
			}
			return finish('error', normalizeError(error));
		}

		const counts = tokenCounts(message.usage);
		totals.input += counts.input;
		totals.output += counts.output;
		totals.cacheRead += counts.cacheRead;
		totals.cacheWrite += counts.cacheWrite;
		const cost = usageCost(message.model, message.usage);
		usd = usd === null || cost === null ? null : usd + cost;
		emit({ type: 'usage', report: { agent, model: message.model, tokens: counts, usd: cost } });
		if (
			message.content.some((b) => b.type === 'fallback') ||
			profileFor(message.model).id !== profileFor(config.model).id
		) {
			emit({ type: 'notice', agent, text: `Answered by ${message.model} (server-side fallback).` });
		}

		if (message.stop_reason === 'refusal') {
			last = null;
			const category = message.stop_details?.category;
			return finish('refusal', {
				code: 'refusal',
				message: `The model declined this request${category ? ` (${category.replace(/_/g, ' ')})` : ''}. Rephrase it, or start a new conversation.`,
				retryable: false
			});
		}

		const content = sanitizeAssistantContent(message.content);
		last = { ...message, content };
		transcript.append({ role: 'assistant', content });
		const calls: ToolCallRequest[] = content
			.filter((b) => b.type === 'tool_use')
			.map((b) => ({ id: b.id, name: b.name, input: b.input }));

		if (message.stop_reason === 'tool_use' && calls.length > 0) {
			const results = await config.runTools(calls);
			transcript.append({ role: 'user', content: results });
			if (signal.aborted) return finish('aborted', ABORTED);
			continue;
		}
		if (calls.length > 0) {
			// Cut off inside a tool call (max_tokens): every tool_use still needs its result.
			transcript.append({
				role: 'user',
				content: calls.map((c) => ({
					type: 'tool_result',
					tool_use_id: c.id,
					is_error: true,
					content: 'Not run: the response was cut off before this call was complete.'
				}))
			});
		}
		if (message.stop_reason === 'pause_turn') continue;
		if (message.stop_reason === 'max_tokens') {
			return finish('max_tokens', {
				code: 'max-tokens',
				message:
					'The answer hit the length limit and was cut off. Ask for the rest, or for a shorter answer.',
				retryable: true
			});
		}
		if (message.stop_reason === 'model_context_window_exceeded') {
			return finish('model_context_window_exceeded', {
				code: 'context',
				message: 'This conversation no longer fits the model. Start a new conversation.',
				retryable: false
			});
		}
		return finish(message.stop_reason, null);
	}
	emit({ type: 'notice', agent, text: `Stopped after ${config.maxIterations} steps.` });
	return finish('max_iterations', null);
}
