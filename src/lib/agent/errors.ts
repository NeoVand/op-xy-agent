/**
 * Turns SDK errors into plain, honest messages the UI can show, using the SDK's typed error classes
 * (never string matching on messages). Overloads, rate limits and connection errors are retried by
 * the SDK first (2 retries with backoff); what reaches this function is what is left.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AgentErrorInfo } from './types';

function apiMessage(error: InstanceType<typeof Anthropic.APIError>): string | null {
	const body = error.error as { error?: { message?: unknown } } | undefined;
	const message = body?.error?.message;
	return typeof message === 'string' && message.trim() ? message.trim() : null;
}

function retryAfterSeconds(error: InstanceType<typeof Anthropic.APIError>): number | null {
	const value = error.headers?.get?.('retry-after');
	if (!value) return null;
	const seconds = Number(value);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}

/** A user-facing description of any error thrown while talking to the API. */
export function normalizeError(error: unknown): AgentErrorInfo {
	if (error instanceof Anthropic.APIUserAbortError) {
		return { code: 'aborted', message: 'Stopped.', retryable: true };
	}
	if (error instanceof Anthropic.AuthenticationError) {
		return {
			code: 'auth',
			message:
				'Anthropic rejected the API key. Check it in settings: it may be mistyped, revoked or from another provider.',
			retryable: false
		};
	}
	if (error instanceof Anthropic.PermissionDeniedError) {
		return {
			code: 'permission',
			message: `This key is not allowed to do that${apiMessage(error) ? ` (${apiMessage(error)})` : ''}. Try another model or check the key's workspace.`,
			retryable: false
		};
	}
	if (error instanceof Anthropic.NotFoundError) {
		return {
			code: 'bad-request',
			message: `Anthropic could not find that${apiMessage(error) ? `: ${apiMessage(error)}` : ''}. The selected model may not be available to this key; pick another in settings.`,
			retryable: false
		};
	}
	if (error instanceof Anthropic.RateLimitError) {
		const wait = retryAfterSeconds(error);
		return {
			code: 'rate-limit',
			message: `The rate limit for this key was reached${wait !== null ? `; try again in ${wait} s` : '; wait a moment and try again'}.`,
			retryAfter: wait,
			retryable: true
		};
	}
	if (error instanceof Anthropic.BadRequestError) {
		const detail = apiMessage(error) ?? 'the request was not accepted';
		const context = /too long|context window|maximum context/i.test(detail);
		return {
			code: context ? 'context' : 'bad-request',
			message: context
				? 'This conversation no longer fits the model. Start a new conversation.'
				: `Anthropic did not accept the request: ${detail}`,
			retryable: false
		};
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return {
			code: 'network',
			message: 'Could not reach api.anthropic.com. Check your connection and try again.',
			retryable: true
		};
	}
	if (error instanceof Anthropic.APIError) {
		const overloaded = error.status === 529 || error.type === 'overloaded_error';
		if (overloaded) {
			return {
				code: 'overloaded',
				message: 'Anthropic is overloaded right now. Try again in a moment, or pick another model.',
				retryable: true
			};
		}
		if (error.type === 'rate_limit_error') {
			return {
				code: 'rate-limit',
				message: 'The rate limit for this key was reached; try again shortly.',
				retryable: true
			};
		}
		return {
			code: 'unknown',
			message: `Anthropic returned an error${error.status ? ` (${error.status})` : ''}${apiMessage(error) ? `: ${apiMessage(error)}` : ''}. Try again.`,
			retryable: true
		};
	}
	const text = error instanceof Error ? error.message : String(error);
	return { code: 'unknown', message: `Something went wrong: ${text}`, retryable: true };
}
