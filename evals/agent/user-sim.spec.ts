// The simulated user, without a model: a scripted one plays the person, so the turn loop is
// checked on its own (presses reach the world, a message or a stop ends the turn, the results of
// the calls that ended it go out with the next reply, a person who only presses is asked to write),
// and the OpenAI adapter's requests and replies are checked against a fake fetch.
import { describe, expect, it } from 'vitest';
import {
	SimulatedUser,
	openaiUser,
	turnText,
	userSystemPrompt,
	userTools,
	type UserCall,
	type UserModel,
	type UserReply,
	type UserWorld
} from './user-sim';

let ids = 0;
const call = (name: string, input: Record<string, unknown> = {}): UserCall => ({
	id: `call_${++ids}`,
	name,
	input
});

/** A scripted reply: calls, text, or text written beside calls. */
type Scripted =
	readonly UserCall[] | string | { readonly text: string; readonly calls: readonly UserCall[] };

/** A model that replies from a script, and keeps what it was asked. */
function scripted(replies: readonly Scripted[]) {
	const seen: Parameters<UserModel['reply']>[0][] = [];
	let next = 0;
	const model: UserModel = {
		id: 'scripted',
		async reply(request) {
			seen.push({ ...request, messages: [...request.messages] });
			const r = replies[Math.min(next++, replies.length - 1)];
			const reply: UserReply = {
				text: typeof r === 'string' ? r : 'text' in r ? r.text : '',
				calls: typeof r === 'string' ? [] : 'calls' in r ? r.calls : r,
				native: undefined,
				tokens: { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 },
				usd: 0.001
			};
			return reply;
		}
	};
	return { model, seen };
}

function world() {
	const pressed: string[] = [];
	const w: UserWorld = {
		look: () => 'screen: drum key F3',
		press: async (keys) => {
			pressed.push(keys);
			return `pressed ${keys}`;
		},
		listen: null
	};
	return { w, pressed };
}

const persona = { level: 'beginner', temperament: 'patient', style: 'let me do it' } as const;
const input = { reply: 'Press `T3`, then `M3`.', activity: [], last: false };

describe('SimulatedUser', () => {
	it('presses what it decides to, and ends its turn with a message', async () => {
		const { model, seen } = scripted([
			[call('press', { keys: 'T3' }), call('press', { keys: 'M3' })],
			[call('look'), call('say', { text: 'ok, done. now what?' })],
			[call('stop', { satisfied: true, reason: 'got it' })]
		]);
		const { w, pressed } = world();
		const user = new SimulatedUser({ persona, goal: 'a goal', wants: 'wants', model, world: w });
		expect(await user.turn(input)).toEqual({ kind: 'say', text: 'ok, done. now what?' });
		expect(pressed).toEqual(['T3', 'M3']);
		// the presses' results went back before the model's second reply
		const second = seen[1].messages.at(-1);
		expect(second).toMatchObject({
			role: 'user',
			results: [{ content: 'pressed T3' }, { content: 'pressed M3' }],
			text: null
		});
		expect(await user.turn({ ...input, reply: 'Now turn `E1`.' })).toEqual({
			kind: 'stop',
			satisfied: true,
			reason: 'got it'
		});
		// the results of the calls that ended the turn went out with the next reply
		const third = seen[2].messages.at(-1);
		expect(third).toMatchObject({
			role: 'user',
			results: [{ content: 'screen: drum key F3' }, { content: 'Sent.' }]
		});
		expect(third?.role === 'user' && third.text).toContain('Now turn `E1`.');
		expect(user.calls).toBe(3);
		expect(user.usd).toBeCloseTo(0.003);
	});

	it('takes plain writing as the message, and silence as giving up', async () => {
		const talk = new SimulatedUser({
			persona,
			goal: 'g',
			wants: 'w',
			model: scripted(['hmm, which one is M3?']).model,
			world: world().w
		});
		expect(await talk.turn(input)).toEqual({ kind: 'say', text: 'hmm, which one is M3?' });
		const mute = new SimulatedUser({
			persona,
			goal: 'g',
			wants: 'w',
			model: scripted(['']).model,
			world: world().w
		});
		expect(await mute.turn(input)).toMatchObject({ kind: 'stop', satisfied: false });
	});

	it('sends what the person typed beside a press when the turn ends without a message', async () => {
		const typed = 'I pressed mix then shift+T2 but nothing changed. did it work?';
		const { model, seen } = scripted([{ text: typed, calls: [call('listen')] }, '']);
		const user = new SimulatedUser({ persona, goal: 'g', wants: 'w', model, world: world().w });
		expect(await user.turn(input)).toEqual({ kind: 'say', text: typed });
		// the empty reply was not kept (it cannot be sent back), and nobody was nudged
		expect(user.messages.at(-1)).toMatchObject({ role: 'user', text: null });
		expect(seen).toHaveLength(2);
	});

	it('asks a person who writes nothing once, before taking it as leaving', async () => {
		const { model, seen } = scripted(['', [call('say', { text: 'oh wait, it works' })]]);
		const user = new SimulatedUser({ persona, goal: 'g', wants: 'w', model, world: world().w });
		expect(await user.turn(input)).toEqual({ kind: 'say', text: 'oh wait, it works' });
		expect(seen[1].messages.at(-1)).toMatchObject({
			role: 'user',
			text: 'Say your next message, or stop.'
		});
	});

	it('asks a person who keeps pressing to write, then gives up for them', async () => {
		const { model, seen } = scripted([[call('press', { keys: 'T1' })]]);
		const user = new SimulatedUser({
			persona,
			goal: 'g',
			wants: 'w',
			model,
			world: world().w,
			maxActions: 3
		});
		expect(await user.turn(input)).toMatchObject({ kind: 'stop', satisfied: false });
		const nudges = seen.flatMap((r) => r.messages).filter((m) => m.role === 'user' && m.text);
		expect(
			nudges.some((m) => m.role === 'user' && /say your next message/.test(m.text ?? ''))
		).toBe(true);
	});

	it('tells the person what they see and whether a reply will come', () => {
		const text = turnText(
			{
				reply: 'Done!',
				activity: ['write pattern: track 1, 4 notes'],
				opened: { text: 'hi', file: 'a.mid' },
				last: true
			},
			'screen: x'
		);
		expect(text).toContain('You typed into the chat: "hi", attaching the file a.mid.');
		expect(text).toContain('<reply>\nDone!\n</reply>');
		expect(text).toContain('The chat also showed what it did: write pattern: track 1, 4 notes.');
		expect(text).toContain('What the replica shows now:\nscreen: x');
		expect(text).toMatch(/No more replies will come/);
	});

	it('offers listening only where the eval can hear, and keeps the success private', () => {
		expect(userTools(false).map((t) => t.name)).toEqual(['look', 'press', 'say', 'stop']);
		expect(userTools(true).map((t) => t.name)).toContain('listen');
		const prompt = userSystemPrompt(persona, 'learn the cutoff', 'the bass is brighter');
		expect(prompt).toContain('learn the cutoff');
		expect(prompt).toContain('the bass is brighter This is private');
		expect(prompt).toMatch(/Never mention simulations/);
	});
});

describe('openaiUser', () => {
	it('speaks the Chat Completions API: tool results as tool messages, calls parsed back', async () => {
		const bodies: Record<string, unknown>[] = [];
		const fake = (async (_url: string, init: RequestInit) => {
			bodies.push(JSON.parse(String(init.body)));
			if (bodies.length === 1) {
				return new Response('{"error":{"message":"Unsupported parameter: reasoning_effort"}}', {
					status: 400
				});
			}
			return Response.json({
				choices: [
					{
						message: {
							role: 'assistant',
							content: null,
							tool_calls: [
								{
									id: 'c1',
									type: 'function',
									function: { name: 'press', arguments: '{"keys":"T3"}' }
								}
							]
						}
					}
				],
				usage: {
					prompt_tokens: 1000,
					completion_tokens: 20,
					prompt_tokens_details: { cached_tokens: 800 }
				}
			});
		}) as typeof fetch;
		const model = openaiUser({ apiKey: 'test', model: 'gpt-6-sol', fetch: fake });
		const reply = await model.reply({
			system: 'you are a person',
			tools: userTools(false),
			messages: [
				{ role: 'user', results: [], text: 'hello' },
				{ role: 'assistant', text: '', calls: [{ id: 'c0', name: 'look', input: {} }] },
				{ role: 'user', results: [{ id: 'c0', content: 'screen: x' }], text: null }
			]
		});
		expect(reply.calls).toEqual([{ id: 'c1', name: 'press', input: { keys: 'T3' } }]);
		expect(reply.tokens).toEqual({ input: 200, output: 20, cacheRead: 800, cacheWrite: 0 });
		expect(reply.usd).toBeCloseTo((200 * 2 + 800 * 0.2 + 20 * 10) / 1e6);
		// refused reasoning_effort once: asked again without it
		expect(bodies[0].reasoning_effort).toBe('medium');
		expect(bodies[1].reasoning_effort).toBeUndefined();
		expect(bodies[1].messages).toEqual([
			{ role: 'system', content: 'you are a person' },
			{ role: 'user', content: 'hello' },
			{
				role: 'assistant',
				content: null,
				tool_calls: [{ id: 'c0', type: 'function', function: { name: 'look', arguments: '{}' } }]
			},
			{ role: 'tool', tool_call_id: 'c0', content: 'screen: x' }
		]);
	});
});
