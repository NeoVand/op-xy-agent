/**
 * What can go wrong with voice, in plain words the voice strip can show: a missing or rejected
 * key, a blocked microphone, a dropped call, an error the realtime server reported. Mapped from
 * HTTP statuses, the server's error codes and the names of `getUserMedia` errors, never from
 * message text.
 */
import type { RealtimeErrorBody } from './events';

/** The kind of problem. */
export type VoiceProblemCode =
	| 'no-key'
	| 'no-claude'
	| 'auth'
	| 'permission'
	| 'quota'
	| 'rate-limit'
	| 'bad-request'
	| 'network'
	| 'unavailable'
	| 'mic-blocked'
	| 'no-mic'
	| 'mic-busy'
	| 'unsupported'
	| 'connection'
	| 'server';

/** A problem the UI can explain. */
export interface VoiceProblem {
	readonly code: VoiceProblemCode;
	/** One lowercase line, in the device's voice. */
	readonly message: string;
	/** The session cannot go on (it closes); otherwise the next turn may work. */
	readonly fatal: boolean;
}

/** A voice step that failed, carrying the problem to show. */
export class VoiceError extends Error {
	override name = 'VoiceError';
	constructor(readonly problem: VoiceProblem) {
		super(problem.message);
	}
}

/** No OpenAI key saved. */
export const NO_KEY: VoiceProblem = {
	code: 'no-key',
	message: 'voice needs your openai key',
	fatal: true
};

/** Voice hands everything to Claude, which needs the Anthropic key. */
export const NO_CLAUDE: VoiceProblem = {
	code: 'no-claude',
	message: 'voice hands your questions to claude: add your anthropic key first',
	fatal: true
};

function apiMessage(body: unknown): string | null {
	const error = (body as { error?: { message?: unknown } } | null)?.error;
	return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : null;
}

function apiCode(body: unknown): string | null {
	const error = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
	if (typeof error?.code === 'string') return error.code;
	return typeof error?.type === 'string' ? error.type : null;
}

/** A failed call to api.openai.com (minting the client secret or the SDP exchange). */
export function openAiProblem(status: number, body: unknown): VoiceProblem {
	const code = apiCode(body);
	if (status === 401) {
		return { code: 'auth', message: 'openai rejected the key: check it in settings', fatal: true };
	}
	if (status === 403) {
		return {
			code: 'permission',
			message: 'this openai key may not use realtime voice (check its project permissions)',
			fatal: true
		};
	}
	if (status === 429) {
		return code === 'insufficient_quota'
			? { code: 'quota', message: 'the openai account is out of credit', fatal: true }
			: {
					code: 'rate-limit',
					message: 'openai is rate limiting this key: try again soon',
					fatal: true
				};
	}
	if (status === 400 || status === 404 || status === 422) {
		const detail = apiMessage(body);
		return {
			code: 'bad-request',
			message: `openai did not accept the voice session${detail ? `: ${detail.toLowerCase()}` : ''}`,
			fatal: true
		};
	}
	if (status >= 500) {
		return { code: 'unavailable', message: 'openai is not answering right now', fatal: true };
	}
	return { code: 'server', message: `openai answered ${status}`, fatal: true };
}

/** A fetch that never got an answer. */
export const NETWORK_PROBLEM: VoiceProblem = {
	code: 'network',
	message: 'could not reach api.openai.com',
	fatal: true
};

/** A `getUserMedia` failure, by the DOMException's name. */
export function micProblem(name: string): VoiceProblem {
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return {
				code: 'mic-blocked',
				message: 'the microphone is blocked: allow it for this site',
				fatal: true
			};
		case 'NotFoundError':
		case 'OverconstrainedError':
			return { code: 'no-mic', message: 'no microphone found', fatal: true };
		case 'NotReadableError':
		case 'AbortError':
			return {
				code: 'mic-busy',
				message: 'the microphone is in use by another app',
				fatal: true
			};
		default:
			return {
				code: 'unsupported',
				message: 'this browser cannot use the microphone',
				fatal: true
			};
	}
}

/** The call dropped or never opened. */
export const CONNECTION_LOST: VoiceProblem = {
	code: 'connection',
	message: 'the voice connection dropped',
	fatal: true
};

/** Server error codes that need no word to the user (the session handles them itself). */
const BENIGN_CODES: ReadonlySet<string> = new Set([
	'input_audio_buffer_commit_empty',
	'conversation_already_has_active_response',
	'response_cancel_not_active'
]);

/**
 * A server `error` event as a problem, or null when it needs no word (a benign race). Server
 * errors do not end the session; the call's own state says when it ends.
 */
export function serverProblem(error: RealtimeErrorBody | undefined): VoiceProblem | null {
	const code = error?.code ?? null;
	if (code && BENIGN_CODES.has(code)) return null;
	const message = error?.message?.trim();
	return {
		code: 'server',
		message: `openai: ${message ? message.toLowerCase() : (code ?? 'something went wrong')}`,
		fatal: false
	};
}
