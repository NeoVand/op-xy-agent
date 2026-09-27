/**
 * A paced stand-in for api.anthropic.com: a `fetch` that streams server-sent events to the real SDK
 * with pauses between them, the way the live API trickles out thinking notes, tool calls and text.
 * The dev-only demo run (`demo.dev.ts`) plays a whole conversation with it, and UI tests use it to
 * check that the chat renders each delta as it arrives. Production code never imports it.
 */
import {
	FAKE_MODEL_IDS,
	captureRequest,
	modelsResponse,
	sseEvent,
	type CapturedRequest
} from './scripted-api';

export type { CapturedRequest } from './scripted-api';

/** One raw stream event and the pause before it (ms). */
export interface PacedEvent {
	readonly wait: number;
	readonly data: { readonly type: string } & Record<string, unknown>;
}

/** How a block streams: how much per delta and how long between deltas. */
export interface Pace {
	/** Words per text delta, or pieces for thinking and tool input. */
	readonly size?: number;
	/** Milliseconds between deltas, or a function of the delta's index (for jitter). */
	readonly every?: number | ((index: number) => number);
}

let messageCounter = 0;

/** Splits text into runs of `words` words, each keeping the whitespace that follows it. */
export function wordChunks(text: string, words = 1): string[] {
	const tokens = text.match(/\S+\s*|\s+/g) ?? [];
	const chunks: string[] = [];
	for (let i = 0; i < tokens.length; i += words) chunks.push(tokens.slice(i, i + words).join(''));
	return chunks;
}

/** Splits text into `pieces` parts of about equal length. */
export function pieces(text: string, count: number): string[] {
	const size = Math.max(1, Math.ceil(text.length / Math.max(1, count)));
	const out: string[] = [];
	for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
	return out;
}

/** Builds one paced assistant response, block by block. */
export class PacedTurn {
	readonly events: PacedEvent[] = [];
	readonly #model: string;
	#pause = 0;
	#index = 0;
	#outputTokens = 0;

	constructor(model = 'claude-opus-5-5') {
		this.#model = model;
	}

	/** Pauses before the next event. */
	wait(ms: number): this {
		this.#pause += ms;
		return this;
	}

	#push(data: PacedEvent['data']): void {
		this.events.push({ wait: this.#pause, data });
		this.#pause = 0;
	}

	#deltas(parts: readonly string[], pace: Pace, delta: (part: string) => Record<string, unknown>) {
		const every = pace.every ?? 60;
		parts.forEach((part, i) => {
			if (i > 0) this.wait(typeof every === 'function' ? every(i) : every);
			this.#push({ type: 'content_block_delta', index: this.#index, delta: delta(part) });
		});
	}

	/** `message_start`, with the usage the API reports up front. */
	start(usage: { input?: number; cacheRead?: number; cacheWrite?: number } = {}): this {
		this.#push({
			type: 'message_start',
			message: {
				id: `msg_paced_${++messageCounter}`,
				type: 'message',
				role: 'assistant',
				model: this.#model,
				content: [],
				stop_reason: null,
				stop_sequence: null,
				stop_details: null,
				usage: {
					input_tokens: usage.input ?? 100,
					output_tokens: 1,
					cache_creation_input_tokens: usage.cacheWrite ?? 0,
					cache_read_input_tokens: usage.cacheRead ?? 0
				}
			}
		});
		return this;
	}

	/** A thinking block whose note arrives in pieces (progress with display "updates"). */
	thinking(note: string, pace: Pace = {}): this {
		this.#push({
			type: 'content_block_start',
			index: this.#index,
			content_block: { type: 'thinking', thinking: '', signature: '' }
		});
		this.#deltas(pieces(note, pace.size ?? 3), pace, (thinking) => ({
			type: 'thinking_delta',
			thinking
		}));
		this.#push({
			type: 'content_block_delta',
			index: this.#index,
			delta: { type: 'signature_delta', signature: `sig-paced-${messageCounter}-${this.#index}` }
		});
		return this.#stopBlock(note.length);
	}

	/** A text block streamed a few words at a time. */
	text(text: string, pace: Pace = {}): this {
		this.#push({
			type: 'content_block_start',
			index: this.#index,
			content_block: { type: 'text', text: '', citations: null }
		});
		this.#deltas(wordChunks(text, pace.size ?? 1), pace, (part) => ({
			type: 'text_delta',
			text: part
		}));
		return this.#stopBlock(text.length);
	}

	/** A tool call whose JSON input streams in pieces. */
	toolUse(id: string, name: string, input: unknown, pace: Pace = {}): this {
		this.#push({
			type: 'content_block_start',
			index: this.#index,
			content_block: { type: 'tool_use', id, name, input: {} }
		});
		const json = JSON.stringify(input);
		this.#deltas(pieces(json, pace.size ?? 4), pace, (partial_json) => ({
			type: 'input_json_delta',
			partial_json
		}));
		return this.#stopBlock(json.length);
	}

	#stopBlock(chars: number): this {
		this.#push({ type: 'content_block_stop', index: this.#index });
		this.#index++;
		this.#outputTokens += Math.ceil(chars / 3.5);
		return this;
	}

	/** `message_delta` with the stop reason, then `message_stop`. */
	stop(reason: 'end_turn' | 'tool_use'): this {
		this.#push({
			type: 'message_delta',
			delta: { stop_reason: reason, stop_sequence: null, stop_details: null },
			usage: { output_tokens: Math.max(1, this.#outputTokens) }
		});
		this.#push({ type: 'message_stop' });
		return this;
	}

	/** Total duration of the response in ms. */
	get duration(): number {
		return this.events.reduce((sum, e) => sum + e.wait, 0) + this.#pause;
	}
}

/** Timers the paced stream uses (injectable for tests). */
export interface PacedTimers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const GLOBAL_TIMERS: PacedTimers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * A paced API: `fetch` for `createAnthropicClient`. `respond` picks each Messages API response after
 * looking at the request (which agent asks, which tool results came back). The stream honours the
 * request's abort signal like the real one.
 */
export function pacedApi(
	respond: (request: CapturedRequest) => PacedTurn,
	options: { readonly models?: readonly string[]; readonly timers?: PacedTimers } = {}
) {
	const requests: CapturedRequest[] = [];
	const timers = options.timers ?? GLOBAL_TIMERS;
	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = captureRequest(input, init);
		requests.push(request);
		if (new URL(request.url).pathname.startsWith('/v1/models')) {
			return modelsResponse(options.models ?? FAKE_MODEL_IDS);
		}
		const { events } = respond(request);
		const signal = init?.signal ?? null;
		const encoder = new TextEncoder();
		let timer: unknown = null;
		let abort: (() => void) | null = null;
		const stopTimer = () => {
			if (timer !== null) timers.clearTimeout(timer);
			timer = null;
		};
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				let next = 0;
				abort = () => {
					stopTimer();
					try {
						controller.error(new DOMException('The operation was aborted.', 'AbortError'));
					} catch {
						// Already closed or cancelled.
					}
				};
				// Events without a pause go out together, like events sharing a network packet.
				const send = () => {
					timer = null;
					do {
						const { data } = events[next++];
						controller.enqueue(encoder.encode(sseEvent(data.type, data)));
					} while (next < events.length && events[next].wait === 0);
					schedule();
				};
				const schedule = () => {
					if (next >= events.length) {
						if (abort) signal?.removeEventListener('abort', abort);
						controller.close();
						return;
					}
					timer = timers.setTimeout(send, events[next].wait);
				};
				if (signal?.aborted) return abort();
				signal?.addEventListener('abort', abort, { once: true });
				schedule();
			},
			cancel() {
				stopTimer();
				if (abort) signal?.removeEventListener('abort', abort);
			}
		});
		return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
	};
	return {
		fetch: fetchImpl as typeof fetch,
		requests,
		/** Requests to the Messages API only. */
		get messageRequests(): CapturedRequest[] {
			return requests.filter((r) => new URL(r.url).pathname === '/v1/messages');
		}
	};
}
