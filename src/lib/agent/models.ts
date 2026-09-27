/**
 * The Claude models the agent knows how to drive, their prices and the API features each one
 * accepts, plus the USD cost of a response's `usage`.
 *
 * Prices and capabilities come from docs/research/70-agent-harness.md §5 (2026-09-26) and the
 * claude-api reference. The Models API (`GET /v1/models`) tells us which models a key can use; this
 * matrix tells us how to call them. A model the matrix does not know gets a conservative profile
 * (no thinking parameter, no effort, no mid-conversation system messages) and an unknown price.
 */

/** USD per million tokens. */
export interface ModelPricing {
	readonly input: number;
	/** Cache write with the default 5-minute TTL. */
	readonly cacheWrite5m: number;
	/** Cache write with the 1-hour TTL. */
	readonly cacheWrite1h: number;
	readonly cacheRead: number;
	readonly output: number;
}

/** How a model thinks, as far as the request is concerned. */
export type ThinkingMode =
	/** Adaptive thinking, always on: send `{ type: 'adaptive', display }`. */
	| 'adaptive'
	/** No `thinking` parameter (older models that would need `budget_tokens`, or unknown ones). */
	| 'off';

/** What the agent knows about calling one model. */
export interface ModelProfile {
	/** Canonical id without a date suffix. */
	readonly id: string;
	/** Short lowercase label for the UI ("opus 5.5"). */
	readonly label: string;
	readonly pricing: ModelPricing | null;
	readonly contextTokens: number;
	readonly maxOutputTokens: number;
	readonly thinking: ThinkingMode;
	/**
	 * `thinking.display`: `updates` returns the model's between-tool-call progress notes (beta),
	 * `summarized` a reasoning summary. Null when thinking is off.
	 */
	readonly thinkingDisplay: 'updates' | 'summarized' | null;
	/** Accepts `output_config.effort`. */
	readonly effort: boolean;
	/** Accepts `{ role: 'system' }` messages after the first user turn. */
	readonly midConversationSystem: boolean;
	/** Accepts server-side refusal fallbacks (`fallbacks: 'default'`). */
	readonly fallbacks: boolean;
	/** Prompts shorter than this are never cached. */
	readonly cacheMinTokens: number;
	/** What we use it for, shown in the model picker. */
	readonly role: string;
}

/** The conductor's default: best quality for teaching and programming (research §5). */
export const DEFAULT_CONDUCTOR_MODEL = 'claude-opus-5-5';
/** The manual expert's default: half the price of Opus, fast, excellent with citations. */
export const DEFAULT_SUBAGENT_MODEL = 'claude-sonnet-5';

/** Beta header for `thinking.display: 'updates'`. */
export const BETA_THINKING_UPDATES = 'thinking-display-updates-2026-08-18';
/** Beta header for `fallbacks: 'default'`. */
export const BETA_FALLBACK_DEFAULT = 'server-side-fallback-2026-07-01';

const opus4: ModelPricing = {
	input: 5,
	cacheWrite5m: 6.25,
	cacheWrite1h: 10,
	cacheRead: 0.5,
	output: 25
};

/** Every model the agent has a profile for, best first (the picker's order). */
export const MODEL_MATRIX: readonly ModelProfile[] = [
	{
		id: 'claude-opus-5-5',
		label: 'opus 5.5',
		pricing: { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'updates',
		effort: true,
		midConversationSystem: true,
		fallbacks: true,
		cacheMinTokens: 512,
		role: 'conductor (default)'
	},
	{
		id: 'claude-sonnet-5',
		label: 'sonnet 5',
		pricing: { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 },
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 1024,
		role: 'manual expert, budget conductor'
	},
	{
		id: 'claude-fable-5-1',
		label: 'fable 5.1',
		pricing: { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25, output: 50 },
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'updates',
		effort: true,
		midConversationSystem: true,
		fallbacks: true,
		cacheMinTokens: 512,
		role: 'hardest jobs'
	},
	{
		id: 'claude-haiku-4-5',
		label: 'haiku 4.5',
		pricing: { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 },
		contextTokens: 200_000,
		maxOutputTokens: 64_000,
		thinking: 'off',
		thinkingDisplay: null,
		effort: false,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 4096,
		role: 'fast lookups'
	},
	{
		id: 'claude-opus-5',
		label: 'opus 5',
		pricing: opus4,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: true,
		fallbacks: true,
		cacheMinTokens: 512,
		role: 'previous opus'
	},
	{
		id: 'claude-fable-5',
		label: 'fable 5',
		pricing: { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1, output: 50 },
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'updates',
		effort: true,
		midConversationSystem: true,
		fallbacks: false,
		cacheMinTokens: 512,
		role: 'previous fable'
	},
	{
		id: 'claude-opus-4-8',
		label: 'opus 4.8',
		pricing: opus4,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: true,
		fallbacks: false,
		cacheMinTokens: 1024,
		role: 'legacy'
	},
	{
		id: 'claude-opus-4-7',
		label: 'opus 4.7',
		pricing: opus4,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 2048,
		role: 'legacy'
	},
	{
		id: 'claude-sonnet-4-6',
		label: 'sonnet 4.6',
		pricing: { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 1024,
		role: 'legacy'
	},
	{
		id: 'claude-opus-4-6',
		label: 'opus 4.6',
		pricing: opus4,
		contextTokens: 1_000_000,
		maxOutputTokens: 128_000,
		thinking: 'adaptive',
		thinkingDisplay: 'summarized',
		effort: true,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 4096,
		role: 'legacy'
	}
];

/** Strips a date suffix: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
export function canonicalModelId(id: string): string {
	return id.trim().replace(/-\d{8}$/, '');
}

/** The profile for a model id (dated ids included); a conservative one for unknown models. */
export function profileFor(modelId: string): ModelProfile {
	const id = canonicalModelId(modelId);
	const known = MODEL_MATRIX.find((m) => m.id === id);
	if (known) return known;
	return {
		id,
		label: id.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2'),
		pricing: null,
		contextTokens: 200_000,
		maxOutputTokens: 32_000,
		thinking: 'off',
		thinkingDisplay: null,
		effort: false,
		midConversationSystem: false,
		fallbacks: false,
		cacheMinTokens: 4096,
		role: 'untested with this app'
	};
}

/** The token counts of one response (the API's `usage`, fields that matter for cost). */
export interface UsageLike {
	readonly input_tokens: number;
	readonly output_tokens: number;
	readonly cache_creation_input_tokens?: number | null;
	readonly cache_read_input_tokens?: number | null;
	readonly cache_creation?: {
		readonly ephemeral_5m_input_tokens?: number | null;
		readonly ephemeral_1h_input_tokens?: number | null;
	} | null;
}

/** Token counts in the shape the UI accumulates. */
export interface TokenCounts {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** Normalises a `usage` object (nulls become 0). */
export function tokenCounts(usage: UsageLike): TokenCounts {
	return {
		input: usage.input_tokens ?? 0,
		output: usage.output_tokens ?? 0,
		cacheRead: usage.cache_read_input_tokens ?? 0,
		cacheWrite: usage.cache_creation_input_tokens ?? 0
	};
}

/**
 * USD cost of one response, or null when the model's price is unknown. Cache writes are split by
 * TTL when the API reports the breakdown; otherwise they count as 5-minute writes (all we send).
 */
export function usageCost(modelId: string, usage: UsageLike): number | null {
	const pricing = profileFor(modelId).pricing;
	if (!pricing) return null;
	const counts = tokenCounts(usage);
	const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
	const fiveMinutes = Math.max(0, counts.cacheWrite - oneHour);
	const micro =
		counts.input * pricing.input +
		fiveMinutes * pricing.cacheWrite5m +
		oneHour * pricing.cacheWrite1h +
		counts.cacheRead * pricing.cacheRead +
		counts.output * pricing.output;
	return micro / 1_000_000;
}

/**
 * Share of the prompt served from cache: reads / (reads + writes + uncached input), 0–1. Null when
 * the prompt was empty.
 */
export function cacheHitRate(counts: Pick<TokenCounts, 'input' | 'cacheRead' | 'cacheWrite'>) {
	const total = counts.input + counts.cacheRead + counts.cacheWrite;
	return total === 0 ? null : counts.cacheRead / total;
}

/** One entry of the model picker. */
export interface ModelOption {
	readonly id: string;
	readonly label: string;
	readonly role: string;
	/** "$4 / $20" per MTok input / output, or null when unknown. */
	readonly price: string | null;
	/** The matrix has a profile for it (tested with this app). */
	readonly known: boolean;
}

function formatPrice(pricing: ModelPricing | null): string | null {
	if (!pricing) return null;
	const f = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
	return `${f(pricing.input)} / ${f(pricing.output)}`;
}

/**
 * The picker's options: the models the key can use (from the Models API, ids possibly dated) that
 * are Claude chat models, known ones first in matrix order, then unknown ones by id. Without an
 * API list, the matrix itself.
 */
export function modelOptions(available: readonly string[] | null): ModelOption[] {
	const ids = available ?? MODEL_MATRIX.map((m) => m.id);
	const seen = new Set<string>();
	const options: ModelOption[] = [];
	for (const raw of ids) {
		const id = canonicalModelId(raw);
		if (!id.startsWith('claude-') || seen.has(id)) continue;
		seen.add(id);
		const profile = profileFor(id);
		options.push({
			id: raw,
			label: profile.label,
			role: profile.role,
			price: formatPrice(profile.pricing),
			known: MODEL_MATRIX.some((m) => m.id === id)
		});
	}
	const rank = (o: ModelOption) => {
		const index = MODEL_MATRIX.findIndex((m) => m.id === canonicalModelId(o.id));
		return index < 0 ? MODEL_MATRIX.length : index;
	};
	return options.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
