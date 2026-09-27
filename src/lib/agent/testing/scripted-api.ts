/**
 * A scripted stand-in for api.anthropic.com, for tests: a `fetch` that answers the real SDK with
 * server-sent events built from scripted assistant turns, and records every request (URL, headers,
 * JSON body) so tests can assert exactly what went over the wire. Test-only; nothing imports it
 * from app code.
 */

/** A content block of a scripted assistant turn. */
export type ScriptedBlock =
	| {
			readonly type: 'text';
			readonly text: string;
			readonly citations?: readonly Record<string, unknown>[];
	  }
	| { readonly type: 'thinking'; readonly thinking: string; readonly signature: string }
	| {
			readonly type: 'tool_use';
			readonly id: string;
			readonly name: string;
			readonly input: unknown;
	  }
	| { readonly type: 'fallback'; readonly from: { model: string }; readonly to: { model: string } };

/** One scripted response. */
export type ScriptedTurn =
	| {
			readonly content: readonly ScriptedBlock[];
			readonly stop_reason: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens' | 'pause_turn';
			readonly model?: string;
			readonly usage?: {
				readonly input_tokens?: number;
				readonly output_tokens?: number;
				readonly cache_creation_input_tokens?: number;
				readonly cache_read_input_tokens?: number;
			};
			readonly stop_details?: Record<string, unknown> | null;
			/** Stream the first events, then wait until the request is aborted. */
			readonly hang?: boolean;
	  }
	| {
			readonly error: {
				readonly status: number;
				readonly type: string;
				readonly message: string;
				readonly headers?: Readonly<Record<string, string>>;
			};
	  };

/** What the fake server saw. */
export interface CapturedRequest {
	readonly url: string;
	readonly method: string;
	readonly headers: Readonly<Record<string, string>>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly body: any;
}

/** A turn, or a function that picks one after looking at the request. */
export type ScriptStep = ScriptedTurn | ((request: CapturedRequest) => ScriptedTurn);

function sseEvent(type: string, data: unknown): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

let messageCounter = 0;

/** The SSE body for a scripted turn (split into events the way the API streams them). */
export function sseEvents(
	turn: Extract<ScriptedTurn, { content: unknown }>,
	requestModel: string
): string[] {
	const usage = {
		input_tokens: turn.usage?.input_tokens ?? 100,
		output_tokens: 1,
		cache_creation_input_tokens: turn.usage?.cache_creation_input_tokens ?? 0,
		cache_read_input_tokens: turn.usage?.cache_read_input_tokens ?? 0
	};
	const events: string[] = [
		sseEvent('message_start', {
			type: 'message_start',
			message: {
				id: `msg_${++messageCounter}`,
				type: 'message',
				role: 'assistant',
				model: turn.model ?? requestModel,
				content: [],
				stop_reason: null,
				stop_sequence: null,
				stop_details: null,
				usage
			}
		})
	];
	turn.content.forEach((block, index) => {
		if (block.type === 'text') {
			events.push(
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index,
					content_block: { type: 'text', text: '', citations: null }
				})
			);
			const half = Math.ceil(block.text.length / 2);
			for (const piece of [block.text.slice(0, half), block.text.slice(half)]) {
				if (!piece) continue;
				events.push(
					sseEvent('content_block_delta', {
						type: 'content_block_delta',
						index,
						delta: { type: 'text_delta', text: piece }
					})
				);
			}
			for (const citation of block.citations ?? []) {
				events.push(
					sseEvent('content_block_delta', {
						type: 'content_block_delta',
						index,
						delta: { type: 'citations_delta', citation }
					})
				);
			}
		} else if (block.type === 'thinking') {
			events.push(
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index,
					content_block: { type: 'thinking', thinking: '', signature: '' }
				})
			);
			events.push(
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index,
					delta: { type: 'thinking_delta', thinking: block.thinking }
				})
			);
			events.push(
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index,
					delta: { type: 'signature_delta', signature: block.signature }
				})
			);
		} else if (block.type === 'tool_use') {
			events.push(
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index,
					content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} }
				})
			);
			events.push(
				sseEvent('content_block_delta', {
					type: 'content_block_delta',
					index,
					delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
				})
			);
		} else {
			events.push(
				sseEvent('content_block_start', {
					type: 'content_block_start',
					index,
					content_block: block
				})
			);
		}
		events.push(sseEvent('content_block_stop', { type: 'content_block_stop', index }));
	});
	events.push(
		sseEvent('message_delta', {
			type: 'message_delta',
			delta: {
				stop_reason: turn.stop_reason,
				stop_sequence: null,
				stop_details: turn.stop_details ?? null
			},
			usage: { ...usage, output_tokens: turn.usage?.output_tokens ?? 20 }
		})
	);
	events.push(sseEvent('message_stop', { type: 'message_stop' }));
	return events;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
	return Object.fromEntries(new Headers(init?.headers ?? {}).entries());
}

/**
 * Request rules the real API enforces that a fake would otherwise let through: a tool result that
 * carries search results may contain nothing else. Returns the API's error message, or null.
 */
export function requestProblem(body: unknown): string | null {
	const messages = (body as { messages?: unknown[] } | null)?.messages ?? [];
	for (const [m, message] of messages.entries()) {
		const content = (message as { content?: unknown }).content;
		if (!Array.isArray(content)) continue;
		for (const [c, block] of content.entries()) {
			const inner = (block as { type?: string; content?: unknown }).content;
			if ((block as { type?: string }).type !== 'tool_result' || !Array.isArray(inner)) continue;
			const types = inner.map((b) => (b as { type?: string }).type);
			if (types.includes('search_result') && types.some((t) => t !== 'search_result')) {
				return `messages.${m}.content.${c}.tool_result: if any blocks in a tool result are of type \`search_result\`, all blocks must be of that type`;
			}
		}
	}
	return null;
}

/** A scripted API: pass `fetch` to `createAnthropicClient`, inspect `requests` afterwards. */
export function scriptedApi(
	script: readonly ScriptStep[],
	options: { models?: readonly string[] } = {}
) {
	const requests: CapturedRequest[] = [];
	let next = 0;
	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const request: CapturedRequest = {
			url,
			method: init?.method ?? 'GET',
			headers: headersOf(init),
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : null
		};
		requests.push(request);
		if (new URL(url).pathname.startsWith('/v1/models')) {
			const ids = options.models ?? [
				'claude-opus-5-5',
				'claude-sonnet-5',
				'claude-haiku-4-5-20251001'
			];
			return new Response(
				JSON.stringify({
					data: ids.map((id) => ({
						type: 'model',
						id,
						display_name: id,
						created_at: '2026-09-22T00:00:00Z',
						max_input_tokens: null,
						max_tokens: null,
						capabilities: null
					})),
					has_more: false,
					first_id: ids[0] ?? null,
					last_id: ids.at(-1) ?? null
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		}
		const problem = requestProblem(request.body);
		if (problem) {
			return new Response(
				JSON.stringify({
					type: 'error',
					error: { type: 'invalid_request_error', message: problem }
				}),
				{ status: 400, headers: { 'content-type': 'application/json' } }
			);
		}
		const step = script[next++];
		if (!step) throw new Error(`scripted API: no response left for request ${requests.length}`);
		const turn = typeof step === 'function' ? step(request) : step;
		if ('error' in turn) {
			return new Response(
				JSON.stringify({
					type: 'error',
					error: { type: turn.error.type, message: turn.error.message }
				}),
				{
					status: turn.error.status,
					headers: { 'content-type': 'application/json', ...turn.error.headers }
				}
			);
		}
		const events = sseEvents(turn, String(request.body?.model ?? 'claude-opus-5-5'));
		const signal = init?.signal ?? null;
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				if (!turn.hang) {
					for (const event of events) controller.enqueue(encoder.encode(event));
					controller.close();
					return;
				}
				// Stream message_start and the first block's start, then wait for the abort.
				for (const event of events.slice(0, 3)) controller.enqueue(encoder.encode(event));
				const abort = () =>
					controller.error(new DOMException('The operation was aborted.', 'AbortError'));
				if (signal?.aborted) abort();
				else signal?.addEventListener('abort', abort, { once: true });
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
		},
		/** Script steps not consumed yet. */
		get remaining(): number {
			return script.length - next;
		}
	};
}
