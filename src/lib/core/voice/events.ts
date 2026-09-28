/**
 * The events of OpenAI's realtime API that the voice front end sends and reads, as plain data
 * (docs/research/71-voice.md §3). Only the fields we use are typed; the server sends more. Names
 * follow the GA interface (`response.output_audio_transcript.delta`, `conversation.item.added`),
 * as the reference listed them on 2026-09-28.
 */

/** A conversation item as the server describes it (message, function call or its output). */
export interface RealtimeItem {
	readonly id?: string;
	readonly type?: string;
	readonly role?: string;
	/** `completed`, `incomplete` or `in_progress`. */
	readonly status?: string;
	/** Function calls: the tool's name, the call id and its JSON arguments. */
	readonly name?: string;
	readonly call_id?: string;
	readonly arguments?: string;
}

/** Token counts of one response (`response.done`). */
export interface RealtimeUsage {
	readonly input_tokens?: number;
	readonly output_tokens?: number;
	readonly input_token_details?: {
		readonly text_tokens?: number;
		readonly audio_tokens?: number;
		readonly cached_tokens?: number;
		readonly cached_tokens_details?: {
			readonly text_tokens?: number;
			readonly audio_tokens?: number;
		};
	};
	readonly output_token_details?: {
		readonly text_tokens?: number;
		readonly audio_tokens?: number;
	};
}

/** The server's `error` payload. */
export interface RealtimeErrorBody {
	readonly type?: string;
	readonly code?: string | null;
	readonly message?: string;
	readonly event_id?: string | null;
}

/** The server events the voice session reacts to. Others are dropped by {@link parseServerEvent}. */
export type ServerEvent =
	| { readonly type: 'error'; readonly error?: RealtimeErrorBody }
	| { readonly type: 'session.created' | 'session.updated' }
	| {
			readonly type: 'input_audio_buffer.speech_started';
			readonly item_id?: string;
			readonly audio_start_ms?: number;
	  }
	| { readonly type: 'input_audio_buffer.speech_stopped'; readonly item_id?: string }
	| { readonly type: 'input_audio_buffer.committed'; readonly item_id?: string }
	| { readonly type: 'input_audio_buffer.cleared' }
	/** An item joined the conversation (ours included: the server confirms what we add). */
	| { readonly type: 'conversation.item.added'; readonly item?: RealtimeItem }
	| {
			readonly type: 'conversation.item.input_audio_transcription.delta';
			readonly item_id?: string;
			readonly delta?: string;
	  }
	| {
			readonly type: 'conversation.item.input_audio_transcription.completed';
			readonly item_id?: string;
			readonly transcript?: string;
	  }
	| {
			readonly type: 'conversation.item.input_audio_transcription.failed';
			readonly item_id?: string;
	  }
	| { readonly type: 'conversation.item.truncated'; readonly item_id?: string }
	| { readonly type: 'response.created'; readonly response?: { readonly id?: string } }
	| {
			readonly type: 'response.done';
			readonly response?: {
				readonly id?: string;
				/** `completed`, `cancelled`, `failed` or `incomplete`. */
				readonly status?: string;
				readonly status_details?: { readonly error?: RealtimeErrorBody | null } | null;
				readonly output?: readonly RealtimeItem[];
				readonly usage?: RealtimeUsage | null;
			};
	  }
	| { readonly type: 'response.output_item.done'; readonly item?: RealtimeItem }
	| {
			readonly type: 'response.output_audio_transcript.delta' | 'response.output_text.delta';
			readonly item_id?: string;
			readonly delta?: string;
	  }
	| {
			readonly type: 'response.output_audio_transcript.done';
			readonly item_id?: string;
			readonly transcript?: string;
	  }
	| {
			readonly type: 'response.output_text.done';
			readonly item_id?: string;
			readonly text?: string;
	  }
	| {
			readonly type: 'response.function_call_arguments.done';
			readonly call_id?: string;
			readonly name?: string;
			readonly arguments?: string;
			readonly item_id?: string;
	  }
	/** WebRTC only: the server started, finished or cut the audio it plays to us. */
	| {
			readonly type:
				| 'output_audio_buffer.started'
				| 'output_audio_buffer.stopped'
				| 'output_audio_buffer.cleared';
			readonly response_id?: string;
	  };

/** The type strings of {@link ServerEvent}. */
export type ServerEventType = ServerEvent['type'];

const SERVER_EVENT_TYPES: ReadonlySet<string> = new Set<ServerEventType>([
	'error',
	'session.created',
	'session.updated',
	'input_audio_buffer.speech_started',
	'input_audio_buffer.speech_stopped',
	'input_audio_buffer.committed',
	'input_audio_buffer.cleared',
	'conversation.item.added',
	'conversation.item.input_audio_transcription.delta',
	'conversation.item.input_audio_transcription.completed',
	'conversation.item.input_audio_transcription.failed',
	'conversation.item.truncated',
	'response.created',
	'response.done',
	'response.output_item.done',
	'response.output_audio_transcript.delta',
	'response.output_text.delta',
	'response.output_audio_transcript.done',
	'response.output_text.done',
	'response.function_call_arguments.done',
	'output_audio_buffer.started',
	'output_audio_buffer.stopped',
	'output_audio_buffer.cleared'
]);

/**
 * One data-channel message as a server event, or null for anything else: malformed JSON, no type,
 * or an event the session has no use for (audio deltas, rate limits, deltas of function arguments).
 */
export function parseServerEvent(data: unknown): ServerEvent | null {
	let value: unknown = data;
	if (typeof data === 'string') {
		try {
			value = JSON.parse(data);
		} catch {
			return null;
		}
	}
	if (value === null || typeof value !== 'object') return null;
	const type = (value as { type?: unknown }).type;
	if (typeof type !== 'string' || !SERVER_EVENT_TYPES.has(type)) return null;
	return value as ServerEvent;
}

/** The output of a tool call, handed back to the model. */
export interface FunctionCallOutputItem {
	readonly type: 'function_call_output';
	readonly call_id: string;
	/** JSON text. */
	readonly output: string;
}

/** A system note added to the conversation (a late result from Claude). */
export interface SystemMessageItem {
	readonly type: 'message';
	readonly role: 'system';
	readonly content: readonly { readonly type: 'input_text'; readonly text: string }[];
}

/** The client events the voice session sends over the `oai-events` data channel. */
export type ClientEvent =
	| { readonly type: 'session.update'; readonly session: Readonly<Record<string, unknown>> }
	| { readonly type: 'input_audio_buffer.clear' }
	| { readonly type: 'input_audio_buffer.commit' }
	| { readonly type: 'response.create' }
	| { readonly type: 'response.cancel'; readonly response_id?: string }
	| { readonly type: 'output_audio_buffer.clear' }
	| {
			readonly type: 'conversation.item.create';
			readonly item: FunctionCallOutputItem | SystemMessageItem;
	  };
