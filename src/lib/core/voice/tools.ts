/**
 * The voice model's tools. It has three and does no work itself: `ask_claude` hands a request to
 * the Claude conductor, `answer_approval` passes on the user's spoken yes or no to a change Claude
 * proposed, `stop_claude` stops Claude's work. What they return is JSON the voice model reads and
 * says in a sentence or two (docs/research/71-voice.md §4).
 */

/** A function tool in the realtime session's `tools`. */
export interface RealtimeFunctionTool {
	readonly type: 'function';
	readonly name: string;
	readonly description: string;
	readonly parameters: {
		readonly type: 'object';
		readonly properties: Readonly<Record<string, unknown>>;
		readonly required: readonly string[];
		readonly additionalProperties: false;
	};
}

export const ASK_CLAUDE = 'ask_claude';
export const ANSWER_APPROVAL = 'answer_approval';
export const STOP_CLAUDE = 'stop_claude';

/** Every tool the voice model gets. */
export const VOICE_TOOLS: readonly RealtimeFunctionTool[] = [
	{
		type: 'function',
		name: ASK_CLAUDE,
		description:
			'Hand a question or request about the OP-XY, making music or this app to Claude, the ' +
			'expert agent, and get its answer. Claude answers from the manual, shows keys on the ' +
			'on-screen replica and changes the device (changes need the user’s approval).',
		parameters: {
			type: 'object',
			properties: {
				request: {
					type: 'string',
					description: 'The user’s request, complete and self-contained, in their words.'
				}
			},
			required: ['request'],
			additionalProperties: false
		}
	},
	{
		type: 'function',
		name: ANSWER_APPROVAL,
		description:
			'Pass on the user’s spoken answer to the change Claude asked approval for. Call it only ' +
			'after the user has answered your question.',
		parameters: {
			type: 'object',
			properties: {
				approve: { type: 'boolean', description: 'true when the user said yes, false for no.' },
				note: {
					type: 'string',
					description: 'For a no: what the user wants instead, in their words (optional).'
				}
			},
			required: ['approve'],
			additionalProperties: false
		}
	},
	{
		type: 'function',
		name: STOP_CLAUDE,
		description: 'Stop what Claude is doing, when the user says stop or never mind.',
		parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
	}
];

/** A tool call the voice model made, checked. */
export type VoiceToolCall =
	| { readonly tool: 'ask_claude'; readonly request: string }
	| { readonly tool: 'answer_approval'; readonly approve: boolean; readonly note: string | null }
	| { readonly tool: 'stop_claude' }
	| { readonly tool: 'invalid'; readonly name: string; readonly problem: string };

/** The longest request passed on (the model paraphrases; a runaway one is cut). */
const MAX_REQUEST_CHARS = 4000;

/** Parses and checks a function call's name and JSON arguments. */
export function parseToolCall(name: string, args: string): VoiceToolCall {
	let input: unknown;
	try {
		input = args.trim() ? JSON.parse(args) : {};
	} catch {
		return { tool: 'invalid', name, problem: 'The arguments were not valid JSON.' };
	}
	const fields =
		input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	switch (name) {
		case ASK_CLAUDE: {
			const request = typeof fields.request === 'string' ? fields.request.trim() : '';
			if (!request) return { tool: 'invalid', name, problem: 'request is required.' };
			return { tool: 'ask_claude', request: request.slice(0, MAX_REQUEST_CHARS) };
		}
		case ANSWER_APPROVAL: {
			if (typeof fields.approve !== 'boolean') {
				return { tool: 'invalid', name, problem: 'approve must be true or false.' };
			}
			const note =
				typeof fields.note === 'string' && fields.note.trim() ? fields.note.trim() : null;
			return { tool: 'answer_approval', approve: fields.approve, note };
		}
		case STOP_CLAUDE:
			return { tool: 'stop_claude' };
		default:
			return { tool: 'invalid', name, problem: `There is no tool called ${name}.` };
	}
}

/** What a tool call returns to the voice model. */
export type VoiceToolResult =
	/** Claude answered: say the gist. */
	| { readonly status: 'done'; readonly answer: string; readonly changes: readonly string[] }
	/** Claude waits for the user's decision on these changes. */
	| {
			readonly status: 'needs_approval';
			readonly changes: readonly string[];
			readonly instruction: string;
	  }
	/** Still working after a while: the result comes later as an update. */
	| { readonly status: 'working'; readonly instruction: string }
	/** The spoken answer did not count (no answer yet, or not a clear yes). Nothing changed. */
	| {
			readonly status: 'not_confirmed';
			readonly heard: string | null;
			readonly instruction: string;
	  }
	/** No approval is waiting (the user may have tapped on screen). */
	| { readonly status: 'no_approval'; readonly instruction: string }
	| { readonly status: 'busy'; readonly instruction: string }
	| { readonly status: 'stopped'; readonly instruction: string }
	| { readonly status: 'error'; readonly message: string };

/** How the voice asks for a decision (in every needs_approval result). */
export const APPROVAL_INSTRUCTION =
	'Tell the user in one sentence what would change and ask for a yes or no. Wait for their ' +
	'answer, then call answer_approval. They can also tap approve or reject on screen.';

/** The JSON a tool call returns. */
export function toolOutput(result: VoiceToolResult): string {
	return JSON.stringify(result);
}

/** A late result, added to the voice conversation as a system note (then the model speaks). */
export function updateNote(result: VoiceToolResult): string {
	return `Update from Claude: ${JSON.stringify(result)}`;
}
