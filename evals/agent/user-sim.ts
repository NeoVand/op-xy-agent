/**
 * The simulated user of the episodes eval (`episodes.ts`): a model playing a person at the replica
 * (a level, a temperament and a way of learning; a goal in their own words and a private picture of
 * success) who types short messages to the agent in the side panel and acts on the replica with
 * tools of their own:
 *
 * - `look`: what the replica shows (its screen, the lit keys, whether it plays, the walkthrough
 *   card and the keys it marks);
 * - `press`: a key combo in the app's grammar, a count after each turn (`turn E1 +5`);
 * - `listen`: what the replica plays, in words, when the eval has its ears;
 * - `say`: the next chat message, which ends the person's turn;
 * - `stop`: leave, satisfied or not.
 *
 * The person sees only the chat and what the world shows them (`UserWorld`); the replica's state is
 * never handed over. Whether an episode succeeded is measured on the replica afterwards, never
 * taken from the person's word (docs/AGENT-V2.md, "Simulated users can be too kind").
 *
 * Claude plays the person through the SDK. An OpenAI model can play them instead, over the Chat
 * Completions API with plain fetch, so the agent is not only judged by its own family.
 */
import Anthropic from '@anthropic-ai/sdk';
import { usageCost, type TokenCounts } from '$lib/agent/models';

// ─── who the person is ──────────────────────────────────────────────────────────────────────────

export type Level = 'beginner' | 'intermediate' | 'veteran';
export type Temperament = 'patient' | 'impatient' | 'vague';
export type LearningStyle = 'do it for me' | 'show me' | 'let me do it';

/** A person at the replica. */
export interface Persona {
	readonly level: Level;
	readonly temperament: Temperament;
	readonly style: LearningStyle;
	/** A line of background in their own terms ("plays guitar, new to sequencers"), if any. */
	readonly about?: string;
}

const LEVELS: Readonly<Record<Level, string>> = {
	beginner:
		'You got your OP-XY very recently and know almost nothing about it. Its words (M1 to M4, the encoders E1 to E4, the LFO, scenes, the bar menu) mean little to you, you do not know where anything is, and you never guess keys nobody told you about. You follow instructions literally, one at a time, and a wall of jargon loses you.',
	intermediate:
		'You have had the OP-XY for a few months. You know the track keys, the step keys, the four M pages and the encoders, play and stop, and how to put notes on steps. The deeper features (LFO types, scenes and songs, grooves, the bar menu) you have hardly used, so you lean on the assistant for them.',
	veteran:
		'You know the OP-XY inside out and use its words (T3, M4, the bar menu, scenes, the duck LFO). You want the precise answer or the thing done, not a tour of the basics, and you notice when something is off.'
};

const TEMPERAMENTS: Readonly<Record<Temperament, string>> = {
	patient:
		'You are relaxed and friendly. You give the assistant a few tries and ask a follow-up when something is unclear.',
	impatient:
		'You are in a hurry. Your replies are a few words. Long explanations annoy you, and if you are not getting anywhere after two or three exchanges you give up.',
	vague:
		'You find it hard to say what you want. You talk about feelings ("boring", "more alive", "idk, something chill") rather than settings, and you answer questions briefly. You know what you like when you hear it.'
};

const STYLES: Readonly<Record<LearningStyle, string>> = {
	'do it for me':
		'You want the assistant to do it for you on the replica. You will press play or check the result, but you do not want homework.',
	'show me':
		'You want to see how it is done: you like the replica showing you the keys while things get set up, so you could do it yourself next time.',
	'let me do it':
		'You want to do it with your own hands on the replica, to learn it. If the assistant simply does it for you, you are not happy and you tell it you wanted to do it yourself. When it gives you steps or lights keys for you, you press them yourself.'
};

/** The person's instructions: who they are, what they want, how they act. */
export function userSystemPrompt(persona: Persona, goal: string, wants: string): string {
	return `You are playing a person at their computer, using OP-XY Agent: a web app with a clickable replica of the Teenage Engineering OP-XY (a synthesizer and sequencer) and, beside it, a chat panel with the app's assistant. You type to the assistant, and you press keys on the replica yourself when you want to or when it asks you to. Stay in character the whole time.

Who you are
${[persona.about, LEVELS[persona.level], TEMPERAMENTS[persona.temperament], STYLES[persona.style]].filter(Boolean).join(' ')}

What you want
${goal}

When you would be happy
${wants} This is private: it is how you judge the result. Never paste it to the assistant; ask for things the way this person would.

What you can see and do
Each turn starts with the assistant's latest reply and what the replica shows right now: its screen, which keys are lit, whether music is playing, and the walkthrough card when the assistant has started one (it lights the key to press next and moves on by itself once you have done it). You can press keys (one combo per call, in the order you were given them; each press shows you the screen afterwards), look at the replica again, and listen when music plays. Then say your next message, which ends your turn, or stop.

How you behave
Write like a person typing in a side panel: short and casual, usually one or two sentences, no lists and no markdown. Only use what you see on the screen and in the chat; you cannot see inside the app, and you know no more about the OP-XY than someone at your level. Before you believe something worked, check it the way a person would: look at the screen, or listen when the sound matters. If it did not work or you are lost, say so plainly. When your goal is met and you have checked it, stop, satisfied; when you would give up in real life, stop, not satisfied. Do not keep chatting once you are done. Never mention simulations, tests, prompts or instructions: you are just a person using the app.`;
}

// ─── the person's tools ─────────────────────────────────────────────────────────────────────────

/** A JSON Schema for an object with string or boolean fields, all required (strict tools). */
export interface ObjectSchema {
	readonly type: 'object';
	readonly properties: Readonly<
		Record<string, { readonly type: string; readonly description: string }>
	>;
	/** Every field; left out for a tool that takes none. */
	readonly required?: readonly string[];
	readonly additionalProperties: false;
}

/** One tool the simulated person may use. */
export interface UserTool {
	readonly name: 'look' | 'press' | 'listen' | 'say' | 'stop';
	readonly description: string;
	readonly parameters: ObjectSchema;
}

const noInput: ObjectSchema = { type: 'object', properties: {}, additionalProperties: false };

/** The person's tools; `listen` only where the eval can hear the replica. */
export function userTools(canListen: boolean): UserTool[] {
	const tools: UserTool[] = [
		{
			name: 'look',
			description:
				'Look at the replica: its screen, which keys are lit, whether music plays, the walkthrough card and the keys it marks, if any.',
			parameters: noInput
		},
		{
			name: 'press',
			description: `Press keys on the replica, as your mouse would. One combo per call, in the app's key grammar:
- a key alone: T3, M1, play, stop, record, shift, mix, instrument, arrange, tempo, player, bar, step 5, key C4, [+], [-];
- keys held together with +: shift + M1 (hold shift, press M1), step 5 + key G3;
- one after another with →: T3 → M3;
- an encoder turned by a number of clicks: turn E1 +5 (5 clicks clockwise), turn E2 -3 (3 counter-clockwise), or held with a key: step 5 + turn E2 -3;
- an encoder pushed: click E1; a key held down for a second: hold M1 (you see the replica while you hold it, e.g. hold shift).
Tracks are T1 to T8, the module keys M1 to M4, the encoders E1 to E4 (dark grey, mid grey, light grey, white), the step keys step 1 to step 16, the keyboard key F3 to key E5. You see the screen afterwards.`,
			parameters: {
				type: 'object',
				properties: {
					keys: { type: 'string', description: 'One key combo, e.g. "T3 → M3" or "turn E1 +12"' }
				},
				required: ['keys'],
				additionalProperties: false
			}
		},
		{
			name: 'say',
			description:
				'Send your next chat message to the assistant (this ends your turn), as you would type it.',
			parameters: {
				type: 'object',
				properties: { text: { type: 'string', description: 'Your message' } },
				required: ['text'],
				additionalProperties: false
			}
		},
		{
			name: 'stop',
			description:
				'Leave the chat: satisfied when you got what you wanted and checked it, not satisfied when you give up.',
			parameters: {
				type: 'object',
				properties: {
					satisfied: { type: 'boolean', description: 'You got what you wanted' },
					reason: { type: 'string', description: 'Why, in a few words, for yourself' }
				},
				required: ['satisfied', 'reason'],
				additionalProperties: false
			}
		}
	];
	if (canListen) {
		tools.splice(1, 0, {
			name: 'listen',
			description:
				'Listen to what the replica plays right now for a few seconds, and hear it described in words (nothing when it is stopped).',
			parameters: noInput
		});
	}
	return tools;
}

// ─── the model behind the person ────────────────────────────────────────────────────────────────

/** A tool call the person made. */
export interface UserCall {
	readonly id: string;
	readonly name: string;
	readonly input: Readonly<Record<string, unknown>>;
}

/**
 * The person's conversation, the same for every model family. Its `user` turns are the world
 * talking to the person (the assistant's reply, what the replica shows, the results of their
 * tools); its `assistant` turns are the person's own (what they wrote and the tools they used).
 */
export type UserMessage =
	| {
			readonly role: 'user';
			readonly results: readonly { readonly id: string; readonly content: string }[];
			readonly text: string | null;
	  }
	| {
			readonly role: 'assistant';
			readonly text: string;
			readonly calls: readonly UserCall[];
			/** The model's own content, replayed as it came (Claude's thinking blocks with it). */
			readonly native?: unknown;
	  };

/** One reply of the model playing the person. */
export interface UserReply {
	readonly text: string;
	readonly calls: readonly UserCall[];
	readonly native: unknown;
	readonly tokens: TokenCounts;
	/** USD for this reply, or null when the model's price is unknown. */
	readonly usd: number | null;
}

/** A model that can play the person. */
export interface UserModel {
	readonly id: string;
	reply(request: {
		readonly system: string;
		readonly messages: readonly UserMessage[];
		readonly tools: readonly UserTool[];
	}): Promise<UserReply>;
}

/** How hard the person thinks (Claude's effort; OpenAI's reasoning effort where it has one). */
export type UserEffort = 'low' | 'medium' | 'high';

/** Room for a short message and some thinking. */
const MAX_TOKENS = 8_000;

/** Claude as the person, through the SDK: adaptive thinking, the prefix cached as it grows. */
export function claudeUser(options: {
	readonly apiKey: string;
	readonly model: string;
	readonly effort?: UserEffort;
}): UserModel {
	const client = new Anthropic({ apiKey: options.apiKey, maxRetries: 4 });
	const toContent = (m: UserMessage): Anthropic.MessageParam => {
		if (m.role === 'assistant') {
			if (m.native)
				return { role: 'assistant', content: m.native as Anthropic.ContentBlockParam[] };
			return {
				role: 'assistant',
				content: [
					...(m.text ? [{ type: 'text' as const, text: m.text }] : []),
					...m.calls.map((c) => ({
						type: 'tool_use' as const,
						id: c.id,
						name: c.name,
						input: c.input
					}))
				]
			};
		}
		return {
			role: 'user',
			content: [
				...m.results.map((r) => ({
					type: 'tool_result' as const,
					tool_use_id: r.id,
					content: r.content
				})),
				...(m.text ? [{ type: 'text' as const, text: m.text }] : [])
			]
		};
	};
	return {
		id: options.model,
		async reply({ system, messages, tools }) {
			const response = await client.messages.create({
				model: options.model,
				max_tokens: MAX_TOKENS,
				// the conversation only grows, so each request reads the one before it from the cache
				cache_control: { type: 'ephemeral' },
				system,
				thinking: { type: 'adaptive' },
				output_config: { effort: options.effort ?? 'medium' },
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
					input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
					strict: true
				})),
				messages: messages.map(toContent)
			});
			const text = response.content
				.flatMap((b) => (b.type === 'text' ? [b.text] : []))
				.join('\n')
				.trim();
			const calls = response.content.flatMap((b) =>
				b.type === 'tool_use'
					? [{ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }]
					: []
			);
			const u = response.usage;
			return {
				text,
				calls,
				native: response.content,
				tokens: {
					input: u.input_tokens ?? 0,
					output: u.output_tokens ?? 0,
					cacheRead: u.cache_read_input_tokens ?? 0,
					cacheWrite: u.cache_creation_input_tokens ?? 0
				},
				usd: usageCost(response.model, u)
			};
		}
	};
}

/**
 * OpenAI's prices in USD per million tokens (input, cached input, output), from its pricing page
 * on 2026-09-30, for the models worth playing the person; others report no cost.
 */
const OPENAI_PRICES: Readonly<Record<string, readonly [number, number, number]>> = {
	'gpt-6-sol': [2, 0.2, 10],
	'gpt-6-luna': [0.1, 0.01, 0.5],
	'gpt-5.6-sol': [4, 0.4, 20],
	'gpt-5.6-luna': [0.2, 0.02, 1.2],
	'gpt-5.5': [5, 0.5, 30],
	'gpt-5.4': [2.5, 0.25, 15],
	'gpt-5.4-mini': [0.75, 0.075, 4.5],
	'gpt-5.2': [1.75, 0.175, 14],
	'gpt-5.1': [1.25, 0.125, 10],
	'gpt-5': [1.25, 0.125, 10],
	'gpt-5-mini': [0.25, 0.025, 2],
	'gpt-4.1': [2, 0.5, 8],
	'gpt-4.1-mini': [0.4, 0.1, 1.6]
};

/** Models that take `reasoning_effort` (a request without it is retried for any that refuse). */
const REASONING = /^(gpt-5|gpt-6|o\d)/;

interface OpenaiMessage {
	readonly role: 'system' | 'user' | 'assistant' | 'tool';
	readonly content: string | null;
	readonly tool_calls?: readonly {
		readonly id: string;
		readonly type: 'function';
		readonly function: { readonly name: string; readonly arguments: string };
	}[];
	readonly tool_call_id?: string;
}

interface OpenaiResponse {
	readonly choices: readonly { readonly message: OpenaiMessage }[];
	readonly usage?: {
		readonly prompt_tokens?: number;
		readonly completion_tokens?: number;
		readonly prompt_tokens_details?: { readonly cached_tokens?: number };
	};
}

/** An OpenAI model as the person, over the Chat Completions API (plain fetch, no SDK). */
export function openaiUser(options: {
	readonly apiKey: string;
	readonly model: string;
	readonly effort?: UserEffort;
	readonly fetch?: typeof fetch;
}): UserModel {
	const send = options.fetch ?? fetch;
	let reasoning = REASONING.test(options.model);
	const toMessages = (m: UserMessage): OpenaiMessage[] => {
		if (m.role === 'assistant') {
			return [
				{
					role: 'assistant',
					content: m.text || null,
					...(m.calls.length > 0
						? {
								tool_calls: m.calls.map((c) => ({
									id: c.id,
									type: 'function' as const,
									function: { name: c.name, arguments: JSON.stringify(c.input) }
								}))
							}
						: {})
				}
			];
		}
		return [
			...m.results.map((r) => ({
				role: 'tool' as const,
				tool_call_id: r.id,
				content: r.content
			})),
			...(m.text ? [{ role: 'user' as const, content: m.text }] : [])
		];
	};
	return {
		id: options.model,
		async reply({ system, messages, tools }) {
			const body = () => ({
				model: options.model,
				messages: [{ role: 'system', content: system }, ...messages.flatMap(toMessages)],
				tools: tools.map((t) => ({
					type: 'function',
					function: {
						name: t.name,
						description: t.description,
						parameters: t.parameters,
						strict: true
					}
				})),
				tool_choice: 'auto',
				max_completion_tokens: MAX_TOKENS,
				...(reasoning ? { reasoning_effort: options.effort ?? 'medium' } : {})
			});
			let data: OpenaiResponse | null = null;
			for (let attempt = 0; attempt < 4 && !data; attempt++) {
				const response = await send('https://api.openai.com/v1/chat/completions', {
					method: 'POST',
					headers: {
						authorization: `Bearer ${options.apiKey}`,
						'content-type': 'application/json'
					},
					body: JSON.stringify(body())
				});
				if (response.ok) {
					data = (await response.json()) as OpenaiResponse;
					break;
				}
				const detail = (await response.text()).slice(0, 400);
				if (response.status === 400 && reasoning && /reasoning/i.test(detail)) {
					reasoning = false;
					continue;
				}
				if (response.status === 429 || response.status >= 500) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
					continue;
				}
				throw new Error(`OpenAI ${response.status}: ${detail}`);
			}
			if (!data) throw new Error('OpenAI did not answer after four tries');
			const message = data.choices[0]?.message;
			const calls = (message?.tool_calls ?? []).map((c) => {
				let input: Record<string, unknown> = {};
				try {
					input = JSON.parse(c.function.arguments || '{}') as Record<string, unknown>;
				} catch {
					// a malformed call runs with no input and its tool says what is missing
				}
				return { id: c.id, name: c.function.name, input };
			});
			const prompt = data.usage?.prompt_tokens ?? 0;
			const cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
			const output = data.usage?.completion_tokens ?? 0;
			const price = OPENAI_PRICES[options.model.replace(/-\d{4}-\d{2}-\d{2}$/, '')];
			return {
				text: (message?.content ?? '').trim(),
				calls,
				native: undefined,
				tokens: { input: prompt - cached, output, cacheRead: cached, cacheWrite: 0 },
				usd: price
					? ((prompt - cached) * price[0] + cached * price[1] + output * price[2]) / 1e6
					: null
			};
		}
	};
}

/** The model for `--user-model`: Claude for claude-…, OpenAI for gpt-… and o…. */
export function userModel(options: {
	readonly model: string;
	readonly effort?: UserEffort;
	readonly anthropicKey: () => string;
	readonly openaiKey: () => string;
}): UserModel {
	if (options.model.startsWith('claude-')) {
		return claudeUser({
			apiKey: options.anthropicKey(),
			model: options.model,
			effort: options.effort
		});
	}
	if (/^(gpt-|o\d)/.test(options.model)) {
		return openaiUser({
			apiKey: options.openaiKey(),
			model: options.model,
			effort: options.effort
		});
	}
	throw new Error(`no simulated user for model "${options.model}" (claude-… or gpt-…)`);
}

// ─── the person, turn by turn ───────────────────────────────────────────────────────────────────

/** What the person acts on: the eval's replica, as their eyes, hands and ears reach it. */
export interface UserWorld {
	/** What they see now. */
	look(): string;
	/** Presses a combo; what they see afterwards, or why nothing happened. */
	press(keys: string): Promise<string>;
	/** What plays now, in words; null where the eval has no ears (the tool is not offered). */
	readonly listen: (() => Promise<string>) | null;
}

/** How the person's turn ended. */
export type UserTurn =
	| { readonly kind: 'say'; readonly text: string }
	| { readonly kind: 'stop'; readonly satisfied: boolean; readonly reason: string };

/** What the person reads at the start of a turn. */
export interface TurnInput {
	/** The assistant's reply. */
	readonly reply: string;
	/** The chips the chat showed for what the assistant did ("write pattern: track 1, 12 notes"). */
	readonly activity: readonly string[];
	/** On the first turn: what the person typed, and the file they attached. */
	readonly opened?: { readonly text: string; readonly file?: string };
	/** No reply will come after this turn: the person can still press, then stops. */
	readonly last: boolean;
}

/** Options for {@link SimulatedUser}. */
export interface SimulatedUserOptions {
	readonly persona: Persona;
	readonly goal: string;
	readonly wants: string;
	readonly model: UserModel;
	readonly world: UserWorld;
	/** Tool calls one turn may make before the person is asked to write or stop (default 30). */
	readonly maxActions?: number;
}

/** The world's words to the person at the start of a turn. */
export function turnText(input: TurnInput, view: string): string {
	const parts: string[] = [];
	if (input.opened) {
		const file = input.opened.file ? `, attaching the file ${input.opened.file}` : '';
		parts.push(`You typed into the chat: "${input.opened.text}"${file}.`);
	}
	parts.push(`The assistant replied:\n<reply>\n${input.reply.trim() || '(nothing)'}\n</reply>`);
	if (input.activity.length > 0) {
		parts.push(`The chat also showed what it did: ${input.activity.join('; ')}.`);
	}
	parts.push(`What the replica shows now:\n${view}`);
	parts.push(
		input.last
			? 'No more replies will come after this one: press anything you still want to try, check it, then stop.'
			: 'Your turn: act on the replica if you want to, then say your next message, or stop.'
	);
	return parts.join('\n\n');
}

/** A model playing a person at the replica, one turn after each of the assistant's replies. */
export class SimulatedUser {
	/** The person's side of things, as their model reads it. */
	readonly messages: UserMessage[] = [];
	readonly system: string;
	readonly tools: readonly UserTool[];
	/** USD so far (models with a known price) and whether some replies had none. */
	usd = 0;
	unknownCost = false;
	/** Model replies so far. */
	calls = 0;
	readonly tokens: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

	readonly #model: UserModel;
	readonly #world: UserWorld;
	readonly #maxActions: number;
	/** Results of the calls that ended the last turn, sent with the next reply. */
	#pending: { id: string; content: string }[] = [];

	constructor(options: SimulatedUserOptions) {
		this.system = userSystemPrompt(options.persona, options.goal, options.wants);
		this.tools = userTools(options.world.listen !== null);
		this.#model = options.model;
		this.#world = options.world;
		this.#maxActions = options.maxActions ?? 30;
	}

	/** The person reads the reply, acts on the replica, then writes or leaves. */
	async turn(input: TurnInput): Promise<UserTurn> {
		this.messages.push({
			role: 'user',
			results: this.#pending.splice(0),
			text: turnText(input, this.#world.look())
		});
		let actions = 0;
		/** The last thing the person wrote this turn outside `say` (typed beside a press, say). */
		let typed = '';
		let nudged = false;
		for (;;) {
			const reply = await this.#model.reply({
				system: this.system,
				messages: this.messages,
				tools: this.tools
			});
			this.#count(reply);
			if (reply.text) typed = reply.text;
			if (reply.calls.length === 0 && !reply.text) {
				// nothing at all: not kept (an empty turn cannot be sent back); asked once to write
				if (typed) return { kind: 'say', text: typed };
				if (nudged) return { kind: 'stop', satisfied: false, reason: 'wrote nothing' };
				nudged = true;
				this.messages.push({ role: 'user', results: [], text: 'Say your next message, or stop.' });
				continue;
			}
			this.messages.push({
				role: 'assistant',
				text: reply.text,
				calls: reply.calls,
				native: reply.native
			});
			// a person who only writes: that is their message
			if (reply.calls.length === 0) return { kind: 'say', text: typed };
			const results: { id: string; content: string }[] = [];
			let ended: UserTurn | null = null;
			for (const call of reply.calls) {
				if (ended) {
					results.push({ id: call.id, content: 'Your turn had already ended.' });
					continue;
				}
				actions++;
				const result = await this.#act(call);
				if (typeof result === 'string') results.push({ id: call.id, content: result });
				else {
					ended = result;
					results.push({
						id: call.id,
						content: result.kind === 'say' ? 'Sent.' : 'You left the chat.'
					});
				}
			}
			if (ended) {
				this.#pending = results;
				return ended;
			}
			if (actions >= this.#maxActions + 4) {
				this.#pending = results;
				return { kind: 'stop', satisfied: false, reason: 'kept pressing keys without writing' };
			}
			this.messages.push({
				role: 'user',
				results,
				text:
					actions >= this.#maxActions
						? 'You have been at it a while: say your next message or stop now.'
						: null
			});
		}
	}

	/** Runs one of the person's calls: what it shows them, or how it ends their turn. */
	async #act(call: UserCall): Promise<string | UserTurn> {
		switch (call.name) {
			case 'look':
				return this.#world.look();
			case 'press': {
				const keys = typeof call.input.keys === 'string' ? call.input.keys : '';
				return keys ? this.#world.press(keys) : 'Which keys? Give them as keys, e.g. "T3".';
			}
			case 'listen':
				return this.#world.listen ? this.#world.listen() : 'You cannot hear anything here.';
			case 'say': {
				const text = typeof call.input.text === 'string' ? call.input.text.trim() : '';
				return text ? { kind: 'say', text } : 'An empty message is not sent.';
			}
			case 'stop':
				return {
					kind: 'stop',
					satisfied: call.input.satisfied === true,
					reason: typeof call.input.reason === 'string' ? call.input.reason : ''
				};
			default:
				return `There is no "${call.name}" here.`;
		}
	}

	#count(reply: UserReply): void {
		this.calls++;
		this.tokens.input += reply.tokens.input;
		this.tokens.output += reply.tokens.output;
		this.tokens.cacheRead += reply.tokens.cacheRead;
		this.tokens.cacheWrite += reply.tokens.cacheWrite;
		if (reply.usd === null) this.unknownCost = true;
		else this.usd += reply.usd;
	}
}
