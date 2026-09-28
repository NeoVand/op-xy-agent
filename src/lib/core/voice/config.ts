/**
 * The realtime session the voice front end asks for: model, instructions, voice, turn taking,
 * input transcription and the three tools, in the shape of `POST /v1/realtime/client_secrets` and
 * `session.update` (docs/research/71-voice.md §2). The user's own OpenAI key is used for exactly
 * one call, minting a short-lived client secret; everything after runs on that secret.
 */
import type { ClientEvent } from './events';
import { VoiceError } from './errors';
import { VOICE_TOOLS, type RealtimeFunctionTool } from './tools';

/** The only host the OpenAI key (and the client secret) are sent to. */
export const OPENAI_API_URL = 'https://api.openai.com';
/** Mints a client secret (`ek_…`) with the user's key. */
export const CLIENT_SECRETS_URL = `${OPENAI_API_URL}/v1/realtime/client_secrets`;
/** The WebRTC SDP exchange, authorised by the client secret. */
export const CALLS_URL = `${OPENAI_API_URL}/v1/realtime/calls`;
/** The data channel that carries the realtime events. */
export const EVENTS_CHANNEL = 'oai-events';

/** How turns are taken: hold a key to talk, or the server hears when you start and stop. */
export type VoiceMode = 'push-to-talk' | 'hands-free';

/** `reasoning.effort` of the realtime model. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** The default voice (one of OpenAI's two most natural, per its realtime guide). */
export const DEFAULT_VOICE = 'marin';
/** Input transcription: the realtime guide's recommendation, which streams deltas. */
export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-live-transcribe';
/** A cap on one spoken reply, so a long answer cannot be read out at length. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
/** Seconds a client secret stays valid: only the SDP exchange, a second later, needs it. */
export const CLIENT_SECRET_TTL_SECONDS = 120;

/**
 * Words the transcription should expect (`keywords`): the device's names, keys and pages, which a
 * general model mishears ("op x y", "em one").
 */
export const TRANSCRIPTION_KEYWORDS: readonly string[] = [
	'OP-XY',
	'Teenage Engineering',
	'M1',
	'M2',
	'M3',
	'M4',
	'shift',
	'encoder',
	'arpeggio',
	'maestro',
	'brain',
	'punch-in',
	'p-lock',
	'sequencer',
	'sampler',
	'multisample',
	'prism',
	'wavetable',
	'epiano',
	'dissolve',
	'hardsync',
	'axis',
	'BPM',
	'LFO'
];

/**
 * The voice model's instructions: a friendly front desk that hands every OP-XY question or action
 * to Claude and says the result briefly. Kept short on purpose; Claude holds the knowledge.
 */
export const VOICE_INSTRUCTIONS = [
	'You are the voice of op-xy agent, an app for the Teenage Engineering OP-XY synthesizer, and a',
	'friendly front desk. Claude, the app’s expert agent, does the real work: it knows the manual,',
	'shows keys on the on-screen replica and controls the connected device.',
	'',
	'- Hand every question or request about the OP-XY, music making or the app to Claude with',
	'  ask_claude, complete and self-contained, in the user’s words. First say a very short',
	'  acknowledgement, like "one moment".',
	'- When a result comes back, say the gist in one or two short sentences, in the user’s',
	'  language. Never read lists, tables, citations or key-by-key steps aloud unless asked: they',
	'  are on screen.',
	'- If a result says needs_approval, say plainly what would change and ask for a yes or no. Wait',
	'  for the answer, then call answer_approval (approve true for yes, false for no; put what they',
	'  want instead in note). Never answer for the user. They can also tap approve on screen.',
	'- If the user says stop or never mind while Claude works, call stop_claude.',
	'- A message that starts "Update from Claude" is a late result: tell the user briefly.',
	'- For small talk, answer briefly yourself. Keep every reply short and warm.'
].join('\n');

/** `audio.input.turn_detection`. */
export type TurnDetection =
	| {
			readonly type: 'semantic_vad';
			readonly eagerness: 'low' | 'medium' | 'high' | 'auto';
			readonly create_response: boolean;
			readonly interrupt_response: boolean;
	  }
	| {
			readonly type: 'server_vad';
			readonly threshold?: number;
			readonly prefix_padding_ms?: number;
			readonly silence_duration_ms?: number;
			readonly create_response: boolean;
			readonly interrupt_response: boolean;
	  };

/**
 * Turn taking per mode. Push-to-talk turns detection off (`null`): the app commits the audio and
 * asks for a response when the key comes up. Hands-free uses semantic VAD, which waits for the end
 * of a thought rather than a pause, answers by itself and stops talking when the user starts
 * (with WebRTC the server also cuts the audio not yet played).
 */
export function turnDetection(mode: VoiceMode): TurnDetection | null {
	if (mode === 'push-to-talk') return null;
	return {
		type: 'semantic_vad',
		eagerness: 'auto',
		create_response: true,
		interrupt_response: true
	};
}

/** What {@link sessionConfig} needs. */
export interface VoiceSessionOptions {
	readonly model: string;
	readonly mode: VoiceMode;
	readonly voice?: string;
	readonly instructions?: string;
	/** Reasoning effort, or null to leave the model's default (and send none). */
	readonly reasoning?: ReasoningEffort | null;
	/** Input transcription model, or null for no transcripts. */
	readonly transcription?: string | null;
	readonly keywords?: readonly string[];
	readonly tools?: readonly RealtimeFunctionTool[];
	readonly maxOutputTokens?: number;
}

/** The session object, as `client_secrets` and `session.update` take it. */
export interface RealtimeSessionConfig {
	readonly type: 'realtime';
	readonly model: string;
	readonly instructions: string;
	readonly output_modalities: readonly ['audio'];
	readonly audio: {
		readonly input: {
			readonly noise_reduction: { readonly type: 'near_field' };
			readonly transcription: {
				readonly model: string;
				readonly keywords?: readonly string[];
			} | null;
			readonly turn_detection: TurnDetection | null;
		};
		readonly output: { readonly voice: string };
	};
	readonly tools: readonly RealtimeFunctionTool[];
	readonly tool_choice: 'auto';
	readonly max_output_tokens: number;
	readonly reasoning?: { readonly effort: ReasoningEffort };
}

/** Builds the realtime session for the voice front end. */
export function sessionConfig(options: VoiceSessionOptions): RealtimeSessionConfig {
	const transcription =
		options.transcription === null
			? null
			: {
					model: options.transcription ?? DEFAULT_TRANSCRIPTION_MODEL,
					...((options.keywords ?? TRANSCRIPTION_KEYWORDS).length > 0
						? { keywords: [...(options.keywords ?? TRANSCRIPTION_KEYWORDS)] }
						: {})
				};
	return {
		type: 'realtime',
		model: options.model,
		instructions: options.instructions ?? VOICE_INSTRUCTIONS,
		output_modalities: ['audio'],
		audio: {
			input: {
				// A person at a laptop or a headset, close to the mic.
				noise_reduction: { type: 'near_field' },
				transcription,
				turn_detection: turnDetection(options.mode)
			},
			output: { voice: options.voice ?? DEFAULT_VOICE }
		},
		tools: [...(options.tools ?? VOICE_TOOLS)],
		tool_choice: 'auto',
		max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
		...(options.reasoning ? { reasoning: { effort: options.reasoning } } : {})
	};
}

/** The same session without a reasoning setting (for a model that takes none). */
export function withoutReasoning(config: RealtimeSessionConfig): RealtimeSessionConfig {
	const copy = { ...config };
	delete (copy as { reasoning?: unknown }).reasoning;
	return copy;
}

/** Switches turn taking in a live session. */
export function modeUpdate(mode: VoiceMode): ClientEvent {
	return {
		type: 'session.update',
		session: { type: 'realtime', audio: { input: { turn_detection: turnDetection(mode) } } }
	};
}

/** The body of `POST /v1/realtime/client_secrets` (the API allows 10 s to 2 h). */
export function clientSecretRequest(
	session: RealtimeSessionConfig,
	ttlSeconds: number = CLIENT_SECRET_TTL_SECONDS
): {
	readonly expires_after: { readonly anchor: 'created_at'; readonly seconds: number };
	readonly session: RealtimeSessionConfig;
} {
	const seconds = Math.min(7200, Math.max(10, Math.round(ttlSeconds)));
	return { expires_after: { anchor: 'created_at', seconds }, session };
}

/** A minted client secret. Never log or store its value. */
export interface ClientSecret {
	readonly value: string;
	/** Unix seconds, when the API said. */
	readonly expiresAt: number | null;
}

/** Reads the client-secret response (`{ value: 'ek_…', expires_at, session }`). */
export function parseClientSecret(body: unknown): ClientSecret {
	const value = (body as { value?: unknown } | null)?.value;
	const expires = (body as { expires_at?: unknown } | null)?.expires_at;
	if (typeof value !== 'string' || !value.startsWith('ek_')) {
		throw new VoiceError({
			code: 'server',
			message: 'openai sent no session key',
			fatal: true
		});
	}
	return { value, expiresAt: typeof expires === 'number' ? expires : null };
}

/** Whether an error body blames the reasoning setting (retry without it). */
export function blamesReasoning(body: unknown): boolean {
	const error = (body as { error?: { param?: unknown; message?: unknown } } | null)?.error;
	const text = `${typeof error?.param === 'string' ? error.param : ''} ${
		typeof error?.message === 'string' ? error.message : ''
	}`;
	return /reasoning/i.test(text);
}
