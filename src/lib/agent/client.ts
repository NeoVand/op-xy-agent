/**
 * The model client: a thin seam over `@anthropic-ai/sdk` so the loop can be tested with a scripted
 * stream and so exactly one place decides how the user's key is used.
 *
 * Security (docs/research/70-agent-harness.md §9): the key is sent only to `api.anthropic.com`,
 * over HTTPS, in the `x-api-key` header, straight from this page (`dangerouslyAllowBrowser: true`
 * makes the SDK send the CORS header the API requires). No proxy, no logging (`logLevel: 'off'`),
 * no environment fallbacks: the base URL and credentials are pinned explicitly.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
	BetaMessage,
	BetaMessageStreamParams,
	BetaRawMessageStreamEvent
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

/** The only host the Anthropic key is ever sent to. */
export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

/** A streaming response: its raw events, then the accumulated message. */
export interface ModelStream extends AsyncIterable<BetaRawMessageStreamEvent> {
	/** The complete message (content blocks exactly as the API sent them, thinking signatures included). */
	finalMessage(): Promise<BetaMessage>;
	/** The message as streamed so far (what is left of it when the stream is aborted). */
	readonly currentMessage?: BetaMessage | undefined;
	abort(): void;
}

/** What the loop needs from a model provider. */
export interface ModelClient {
	stream(params: BetaMessageStreamParams, options?: { readonly signal?: AbortSignal }): ModelStream;
	/** Ids of the models this key can use (free call; also validates the key). */
	listModels(options?: { readonly signal?: AbortSignal }): Promise<string[]>;
}

/** Options for {@link createAnthropicClient}. */
export interface AnthropicClientOptions {
	readonly apiKey: string;
	/** Custom fetch (tests). */
	readonly fetch?: typeof fetch;
	/** SDK retries for 408/409/429/5xx and connection errors (default 2). */
	readonly maxRetries?: number;
	/** Per-request timeout in ms (default 10 minutes). */
	readonly timeoutMs?: number;
}

/**
 * Opt-in network timing for diagnosing streaming (`localStorage['opxy:debug'] = 'stream'`): logs when
 * each chunk of a Messages API response arrives, relative to the request. Never logs content or keys.
 */
function debugStreaming(): boolean {
	try {
		return (globalThis.localStorage?.getItem('opxy:debug') ?? '').includes('stream');
	} catch {
		return false;
	}
}

function timedFetch(base: typeof fetch): typeof fetch {
	return async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const started = performance.now();
		const response = await base(input, init);
		if (!url.includes('/v1/messages') || !response.body) return response;
		const [forApp, forLog] = response.body.tee();
		void (async () => {
			const reader = forLog.getReader();
			let bytes = 0;
			let chunks = 0;
			for (;;) {
				const { done, value } = await reader.read();
				const at = Math.round(performance.now() - started);
				if (done) {
					console.info(`[opxy stream] done +${at}ms chunks=${chunks} bytes=${bytes}`);
					return;
				}
				chunks += 1;
				bytes += value.length;
				console.info(`[opxy stream] chunk ${chunks} +${at}ms ${value.length}B`);
			}
		})();
		return new Response(forApp, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	};
}

/** The browser (and Node) client for the Anthropic API. */
export function createAnthropicClient(options: AnthropicClientOptions): ModelClient {
	const baseFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const sdk = new Anthropic({
		apiKey: options.apiKey,
		authToken: null,
		baseURL: ANTHROPIC_API_URL,
		dangerouslyAllowBrowser: true,
		logLevel: 'off',
		maxRetries: options.maxRetries ?? 2,
		timeout: options.timeoutMs ?? 10 * 60_000,
		fetch: debugStreaming() ? timedFetch(baseFetch) : baseFetch
	});
	return {
		stream(params, streamOptions) {
			return sdk.beta.messages.stream(params, { signal: streamOptions?.signal });
		},
		async listModels(listOptions) {
			const ids: string[] = [];
			for await (const model of sdk.models.list({ limit: 100 }, { signal: listOptions?.signal })) {
				ids.push(model.id);
			}
			return ids;
		}
	};
}
