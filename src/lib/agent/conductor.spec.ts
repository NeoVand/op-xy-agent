// The conductor end to end against a scripted API (the real SDK over a fake fetch) and the fake
// OP-XY from test/fakes: request shape (cache layout, thinking, betas, strict tools), streaming into
// the chat, thinking blocks passed back unchanged, parallel tool calls serialised on the device
// queue, approvals, journal and undo, subagents, errors and persistence.
import { describe, expect, it } from 'vitest';
import type { MidiEvent } from '$lib/core/midi/bus';
import { createFakeRig } from '../../../test/fakes/rig';
import { ATTACHMENT_LIMITS, type PreparedAttachment } from './attachments';
import { createAnthropicClient } from './client';
import { Conductor, type PreferenceStore } from './conductor.svelte';
import { createUnitSource } from './manual-index';
import { createMemoryThreadStore, type ThreadStore } from './threads';
import { PacedTurn, pacedApi } from './testing/paced-api';
import { scriptedApi, type ScriptStep } from './testing/scripted-api';
import type { AgentEvent, ApprovalDecision } from './types';

// Assembled at runtime so secret scanners never see a key-shaped literal.
const KEY = 'sk-ant-' + 'api03-' + 'test-'.padEnd(40, '0');

const MANUAL = createUnitSource({
	kind: 'manual',
	label: 'test manual',
	header: '# Test manual',
	units: [
		{
			id: 'modes.m1',
			title: 'M1 page',
			text: 'Press M1 to show the engine page.\n\nHold shift and press M1 to open the engine picker.',
			source: 'https://example.test/manual#m1'
		},
		{
			id: 'tempo',
			title: 'Tempo',
			text: 'Press tempo to open the tempo page.',
			source: 'https://example.test/manual#tempo'
		}
	]
});

function memoryPreferences(): PreferenceStore {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		set: (key, value) => (value === null ? values.delete(key) : values.set(key, value))
	};
}

interface SetupOptions {
	readonly model?: string;
	readonly autoApprove?: boolean;
	readonly decide?: (
		request: Extract<AgentEvent, { type: 'approval' }>['request']
	) => ApprovalDecision;
	readonly store?: ThreadStore;
	readonly preferences?: PreferenceStore;
	readonly connect?: boolean;
	/** Another fake API (a paced one) instead of the script. */
	readonly fetch?: typeof fetch;
}

async function setup(script: ScriptStep[], options: SetupOptions = {}) {
	const rig = createFakeRig();
	if (options.connect !== false) await rig.connect();
	const api = scriptedApi(script);
	const client = createAnthropicClient({
		apiKey: KEY,
		fetch: options.fetch ?? api.fetch,
		maxRetries: 0
	});
	const conductor = await Conductor.create({
		client,
		device: rig.stack,
		replica: null,
		manual: MANUAL,
		store: options.store ?? createMemoryThreadStore(),
		preferences: options.preferences ?? memoryPreferences(),
		confirmWindowMs: 0,
		autoApprove: options.autoApprove,
		model: options.model,
		session: 'session-test'
	});
	const events: AgentEvent[] = [];
	const bus: MidiEvent[] = [];
	rig.stack.bus.subscribe((event) => {
		if (event.direction === 'out') bus.push(event);
	});
	conductor.on((event) => {
		events.push(event);
		if (event.type === 'approval' && options.decide) {
			const decision = options.decide(event.request);
			queueMicrotask(() => conductor.decide(decision));
		}
	});
	return { rig, api, conductor, events, bus };
}

/** Hex of the CC messages the fake device received. */
function receivedCcs(rig: ReturnType<typeof createFakeRig>): number[][] {
	return rig.opxy.received.filter((b) => (b[0] & 0xf0) === 0xb0).map((b) => [...b]);
}

describe('conductor: requests and streaming', () => {
	/** Tools sent without strict mode, to keep the strict ones under the API's grammar size limit. */
	const LOOSE_TOOLS = [
		'device_map',
		'listen',
		'listen_tracks',
		'make_kit',
		'play_notes',
		'plan_steps'
	];

	it('sends a cache-friendly, strict request and streams the answer into the chat', async () => {
		const { api, conductor, events } = await setup([
			{
				content: [{ type: 'text', text: 'Hold `shift` and press `M1` to pick an engine.' }],
				stop_reason: 'end_turn',
				usage: { input_tokens: 50, cache_creation_input_tokens: 2000, output_tokens: 30 }
			}
		]);
		await conductor.send('what does shift + M1 do?');

		expect(api.messageRequests).toHaveLength(1);
		const request = api.messageRequests[0];
		const url = new URL(request.url);
		expect(url.origin).toBe('https://api.anthropic.com');
		expect(url.pathname).toBe('/v1/messages');
		expect(api.requests.every((r) => new URL(r.url).origin === 'https://api.anthropic.com')).toBe(
			true
		);
		expect(request.headers['x-api-key']).toBe(KEY);
		expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
		expect(request.headers['anthropic-beta']).toContain('thinking-display-updates-2026-08-18');
		expect(request.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');

		const body = request.body;
		expect(body.model).toBe('claude-opus-5-5');
		expect(body.stream).toBe(true);
		expect(body.thinking).toEqual({ type: 'adaptive', display: 'updates' });
		expect(body.output_config).toEqual({ effort: 'medium' });
		expect(body.fallbacks).toBe('default');
		expect(body.cache_control).toEqual({ type: 'ephemeral' });
		expect(body.tool_choice).toBeUndefined();
		expect(body.betas).toBeUndefined();

		// Frozen system prefix: role, device facts, manual; the breakpoint only on the manual.
		expect(body.system).toHaveLength(3);
		expect(body.system.map((b: { cache_control?: unknown }) => b.cache_control ?? null)).toEqual([
			null,
			null,
			{ type: 'ephemeral' }
		]);
		expect(body.system[2].text).toContain('# Test manual');
		expect(body.system[1].text).toContain('CC80');

		// Tools: sorted by name, strict, closed objects.
		const names = body.tools.map((t: { name: string }) => t.name);
		expect(names).toEqual([...names].sort());
		expect(names).toContain('set_tempo');
		expect(names).not.toContain('load_project');
		for (const tool of body.tools) {
			// all but the ones kept out of the API's grammar size limit (evals/agent/grammar.mjs)
			expect(tool.strict).toBe(!LOOSE_TOOLS.includes(tool.name));
			expect(tool.input_schema.additionalProperties).toBe(false);
		}

		// The device note travels as a mid-conversation system message (Opus 5.5 supports them).
		expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'system']);
		expect(body.messages[1].content).toContain('OP-XY connected');

		const text = conductor.entries.find((e) => e.kind === 'text');
		expect(text?.kind === 'text' && text.text).toBe(
			'Hold `shift` and press `M1` to pick an engine.'
		);
		expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1);
		expect(conductor.usage.calls).toBe(1);
		expect(conductor.usage.usd).toBeCloseTo((50 * 4 + 2000 * 5 + 30 * 20) / 1e6, 9);
		expect(conductor.status).toBe('idle');
	});

	it('passes thinking blocks back unchanged and keeps the transcript append-only', async () => {
		let secondBody: { messages: { role: string; content: unknown }[] } | null = null;
		const { conductor, events } = await setup([
			{
				content: [
					{ type: 'thinking', thinking: 'Checking the device first.', signature: 'sig-abc-123' },
					{ type: 'tool_use', id: 'toolu_1', name: 'device_status', input: {} }
				],
				stop_reason: 'tool_use'
			},
			(request) => {
				secondBody = request.body;
				return { content: [{ type: 'text', text: 'It is connected.' }], stop_reason: 'end_turn' };
			}
		]);
		await conductor.send('is my op-xy connected?');
		expect(secondBody).not.toBeNull();
		const messages = secondBody!.messages;
		expect(messages.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
		const assistant = messages[2].content as Record<string, unknown>[];
		expect(assistant[0]).toEqual({
			type: 'thinking',
			thinking: 'Checking the device first.',
			signature: 'sig-abc-123'
		});
		expect(assistant[1]).toMatchObject({
			type: 'tool_use',
			id: 'toolu_1',
			name: 'device_status',
			input: {}
		});
		const results = messages[3].content as Record<string, unknown>[];
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
		expect(JSON.parse(String(results[0].content)).connected).toBe(true);
		expect(
			events.some((e) => e.type === 'progress' && e.delta === 'Checking the device first.')
		).toBe(true);
	});

	it('renders device notes as <system-reminder> text and drops unsupported features on Sonnet 5', async () => {
		const { api, conductor } = await setup(
			[{ content: [{ type: 'text', text: 'Sure.' }], stop_reason: 'end_turn' }],
			{ model: 'claude-sonnet-5' }
		);
		await conductor.send('hello');
		const body = api.messageRequests[0].body;
		expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'user']);
		expect(body.messages[1].content[0].text).toMatch(/^<system-reminder>\nDevice note/);
		expect(body.fallbacks).toBeUndefined();
		expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
		expect(api.messageRequests[0].headers['anthropic-beta']).toBeUndefined();
	});

	it('resolves manual citations to the unit title and its https source', async () => {
		const { conductor } = await setup([]);
		expect(conductor.citation('modes.m1')).toEqual({
			title: 'M1 page',
			href: 'https://example.test/manual#m1'
		});
		expect(conductor.citation('MODES.M1#engine-picker')?.title).toBe('M1 page');
		expect(conductor.citation('nope.unit')).toBeNull();
	});
});

describe('conductor: files', () => {
	const scale: PreparedAttachment = {
		view: {
			id: 'file-1',
			kind: 'image',
			name: 'scale.png',
			size: 1234,
			detail: '800 × 200',
			thumb: 'data:image/jpeg;base64,AAAA'
		},
		blocks: [
			{ type: 'text', text: 'Image “scale.png” (800 × 200 px):' },
			{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }
		],
		bytes: 12
	};

	it('sends files before the text, shows them in the chat and keeps them in the thread', async () => {
		const store = createMemoryThreadStore();
		const { api, conductor } = await setup(
			[
				{
					content: [{ type: 'text', text: 'A C major scale, one octave up.' }],
					stop_reason: 'end_turn'
				}
			],
			{ store }
		);
		await conductor.send('what is this?', [scale]);
		const body = api.messageRequests[0].body;
		expect(body.messages[0]).toEqual({
			role: 'user',
			content: [...scale.blocks, { type: 'text', text: 'what is this?' }]
		});
		expect(conductor.entries[0]).toEqual({
			kind: 'user',
			id: expect.any(String),
			text: 'what is this?',
			attachments: [scale.view]
		});
		const saved = await store.load(conductor.threadId);
		expect(saved?.messages[0].content).toEqual(body.messages[0].content);
		expect(saved?.entries[0]).toMatchObject({ attachments: [scale.view] });
	});

	it('sends files without text and names the thread after them', async () => {
		const { api, conductor } = await setup([
			{ content: [{ type: 'text', text: 'Got it.' }], stop_reason: 'end_turn' }
		]);
		await conductor.send('  ', [scale]);
		expect(api.messageRequests[0].body.messages[0].content).toEqual(scale.blocks);
		expect(conductor.threadTitle).toBe('scale.png');
		expect(conductor.entries[0]).toMatchObject({ kind: 'user', text: '' });
	});

	it('refuses files that would not fit a request and sends nothing', async () => {
		const { api, conductor } = await setup([]);
		const huge = { ...scale, bytes: ATTACHMENT_LIMITS.conversationBytes + 1 };
		expect(conductor.attachmentProblem([huge])).toMatch(/too large/);
		expect(conductor.attachmentProblem([scale])).toBeNull();
		await conductor.send('look', [huge]);
		expect(api.messageRequests).toHaveLength(0);
		expect(conductor.entries).toHaveLength(0);
	});
});

describe('conductor: device tools, approvals, journal', () => {
	it('serialises parallel device calls in order, asks once, journals and undoes', async () => {
		let resultsMessage: { content: Record<string, unknown>[] } | null = null;
		const approvals: string[][] = [];
		const { rig, conductor, bus } = await setup(
			[
				{
					content: [
						{ type: 'text', text: 'Setting it up.' },
						{ type: 'tool_use', id: 'toolu_tempo', name: 'set_tempo', input: { bpm: 96 } },
						{
							type: 'tool_use',
							id: 'toolu_mute',
							name: 'mute_track',
							input: { track: 2, muted: true }
						},
						{
							type: 'tool_use',
							id: 'toolu_search',
							name: 'search_manual',
							input: { query: 'tempo' }
						}
					],
					stop_reason: 'tool_use'
				},
				(request) => {
					resultsMessage = request.body.messages.at(-1);
					return {
						content: [{ type: 'text', text: 'Tempo 96, track 2 muted.' }],
						stop_reason: 'end_turn'
					};
				}
			],
			{
				decide: (request) => {
					approvals.push(request.actions.map((a) => a.preview.label));
					return { kind: 'approve' };
				}
			}
		);
		// A tempo the app sent earlier, so the change has a known "before".
		rig.stack.transport.send(
			{ type: 'controlChange', channel: 0, controller: 80, value: 60 },
			{ source: 'user' }
		);
		await rig.time.advance(5);

		await conductor.send('set the tempo to 96 and mute track 2');
		await rig.time.advance(5);

		expect(approvals).toEqual([['tempo 120 → 96 bpm', 'track 2 mute']]);
		expect(rig.opxy.bpm).toBe(96);
		expect(rig.opxy.mutes[1]).toBe(true);
		const ccs = receivedCcs(rig);
		const tempoAt = ccs.findIndex((b) => b[1] === 80 && b[2] === 48);
		const muteAt = ccs.findIndex((b) => b[0] === 0xb1 && b[1] === 9 && b[2] === 127);
		expect(tempoAt).toBeGreaterThanOrEqual(0);
		expect(muteAt).toBeGreaterThan(tempoAt);
		expect(bus.find((e) => e.cause === 'toolu_tempo')?.source).toBe('agent');

		// One user message with every result, in call order.
		const results = resultsMessage!.content;
		expect(results.map((r) => r.tool_use_id)).toEqual([
			'toolu_tempo',
			'toolu_mute',
			'toolu_search'
		]);
		expect(results.every((r) => r.is_error === undefined)).toBe(true);
		expect(String(results[0].content)).toContain('CC80 = 48');
		// The API accepts a tool result with search results only if every block is one.
		const search = results[2].content as Record<string, unknown>[];
		expect(search.length).toBeGreaterThan(0);
		expect(search.every((b) => b.type === 'search_result')).toBe(true);

		expect(conductor.revisions.map((r) => r.label)).toEqual(['tempo 120 → 96 bpm', 'track 2 mute']);
		expect(conductor.revisions[0].inverse).toEqual({
			tool: 'set_tempo',
			input: { bpm: 120 },
			label: 'tempo back to 120 bpm'
		});
		expect(conductor.revisions[0].firmware).toBe('1.1.33');
		expect(conductor.revisions[1].inverse).toMatchObject({
			input: { track: 2, muted: false },
			assumed: true
		});

		expect(await conductor.undo(1)).toBe(true);
		await rig.time.advance(5);
		expect(rig.opxy.bpm).toBe(120);
		expect(conductor.revisions).toHaveLength(3);
		expect(conductor.revisions[0].undoneBy).toBe(3);
		expect(conductor.revisions[2].undoes).toBe(1);
		expect(bus.find((e) => e.cause === 'undo:1')?.source).toBe('user');
		expect(conductor.undoBlocker(1)).toMatch(/already undone/);
	});

	it('returns a rejection with the note and sends nothing', async () => {
		let result: Record<string, unknown> | null = null;
		const { rig, conductor } = await setup(
			[
				{
					content: [{ type: 'tool_use', id: 'toolu_1', name: 'set_tempo', input: { bpm: 140 } }],
					stop_reason: 'tool_use'
				},
				(request) => {
					result = request.body.messages.at(-1).content[0];
					return {
						content: [{ type: 'text', text: 'Okay, leaving it.' }],
						stop_reason: 'end_turn'
					};
				}
			],
			{ decide: () => ({ kind: 'reject', note: 'keep it at 120' }) }
		);
		await conductor.send('make it faster');
		await rig.time.advance(5);
		expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true });
		expect(String(result!.content)).toContain('keep it at 120');
		expect(receivedCcs(rig).some((b) => b[1] === 80)).toBe(false);
		expect(conductor.revisions).toHaveLength(0);
		const record = conductor.entries.find((e) => e.kind === 'approval');
		expect(record).toMatchObject({ outcome: 'rejected', note: 'keep it at 120' });
	});

	it('stops asking for a tool the user allowed for the session', async () => {
		let asked = 0;
		const { conductor } = await setup(
			[
				{
					content: [
						{ type: 'tool_use', id: 't1', name: 'mute_track', input: { track: 3, muted: true } }
					],
					stop_reason: 'tool_use'
				},
				{ content: [{ type: 'text', text: 'Muted.' }], stop_reason: 'end_turn' },
				{
					content: [
						{ type: 'tool_use', id: 't2', name: 'mute_track', input: { track: 4, muted: true } }
					],
					stop_reason: 'tool_use'
				},
				{ content: [{ type: 'text', text: 'Muted too.' }], stop_reason: 'end_turn' }
			],
			{
				decide: () => {
					asked++;
					return { kind: 'allow-session' };
				}
			}
		);
		await conductor.send('mute track 3');
		await conductor.send('and track 4');
		expect(asked).toBe(1);
		expect(conductor.grants).toEqual(['mute_track']);
		expect(conductor.revisions).toHaveLength(2);
	});

	it('rejects invalid tool input with the zod error and sends nothing', async () => {
		let result: Record<string, unknown> | null = null;
		const { rig, conductor } = await setup([
			{
				content: [{ type: 'tool_use', id: 't1', name: 'set_tempo', input: { bpm: 500 } }],
				stop_reason: 'tool_use'
			},
			(request) => {
				result = request.body.messages.at(-1).content[0];
				return { content: [{ type: 'text', text: 'Too fast.' }], stop_reason: 'end_turn' };
			}
		]);
		await conductor.send('tempo 500');
		expect(result).toMatchObject({ is_error: true });
		expect(String(result!.content)).toMatch(/Invalid input for set_tempo/);
		expect(receivedCcs(rig).some((b) => b[1] === 80)).toBe(false);
	});

	it('explains that no device is connected instead of sending', async () => {
		let result: Record<string, unknown> | null = null;
		const { conductor } = await setup(
			[
				{
					content: [{ type: 'tool_use', id: 't1', name: 'transport', input: { action: 'play' } }],
					stop_reason: 'tool_use'
				},
				(request) => {
					result = request.body.messages.at(-1).content[0];
					return {
						content: [{ type: 'text', text: 'Connect it first.' }],
						stop_reason: 'end_turn'
					};
				}
			],
			{ connect: false }
		);
		await conductor.send('press play');
		expect(result).toMatchObject({ is_error: true });
		expect(String(result!.content)).toMatch(/No OP-XY is connected/);
	});
});

describe('conductor: subagents', () => {
	it('runs the manual expert in a fresh loop and hands back a cited answer', async () => {
		let subagentFirst: Record<string, unknown> | null = null;
		let taskResult: Record<string, unknown> | null = null;
		const { conductor, events } = await setup([
			{
				content: [
					{
						type: 'tool_use',
						id: 'toolu_task',
						name: 'task',
						input: {
							subagent_type: 'manual-expert',
							description: 'What does shift + M1 do? Cite the manual.'
						}
					}
				],
				stop_reason: 'tool_use'
			},
			(request) => {
				subagentFirst = request.body;
				return {
					content: [
						{
							type: 'tool_use',
							id: 'toolu_s1',
							name: 'search_manual',
							input: { query: 'shift M1' }
						}
					],
					stop_reason: 'tool_use'
				};
			},
			{
				content: [
					{
						type: 'text',
						text: 'shift + M1 opens the engine picker.',
						citations: [
							{
								type: 'search_result_location',
								source: 'https://example.test/manual#m1',
								title: 'M1 page',
								cited_text: 'Hold shift and press M1 to open the engine picker.',
								search_result_index: 0,
								start_block_index: 1,
								end_block_index: 2
							}
						]
					}
				],
				stop_reason: 'end_turn'
			},
			(request) => {
				taskResult = request.body.messages.at(-1).content[0];
				return {
					content: [{ type: 'text', text: 'It opens the engine picker.' }],
					stop_reason: 'end_turn'
				};
			}
		]);
		await conductor.send('what does shift + M1 do?');

		const sub = subagentFirst as unknown as Record<string, unknown> & {
			tools: { name: string }[];
			system: { text: string }[];
			messages: unknown[];
		};
		expect(sub.model).toBe('claude-sonnet-5');
		expect(sub.tools.map((t) => t.name)).toEqual(['read_manual_unit', 'search_manual']);
		expect(sub.system[0].text).toMatch(/manual expert/);
		expect(sub.messages).toHaveLength(1);
		expect(sub.output_config).toEqual({ effort: 'low' });

		expect(taskResult).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_task' });
		expect(String(taskResult!.content)).toContain('shift + M1 opens the engine picker.');
		expect(String(taskResult!.content)).toContain('M1 page: https://example.test/manual#m1');

		const nested = events.find((e) => e.type === 'tool_start' && e.name === 'search_manual');
		expect(nested && nested.type === 'tool_start' && nested.parent).toBe('toolu_task');
		expect(conductor.usage.calls).toBe(4);
	});
});

describe('conductor: errors, stop and persistence', () => {
	it('cuts a runaway answer (tool calls written as text) and keeps the sound part', async () => {
		const runaway =
			'<invoke name="show_on_replica">\n<parameter name="keys">mix</parameter>\n</invoke>\n';
		const { api, conductor } = await setup([
			{
				content: [
					{ type: 'text', text: `Use the master page: \`mix → M4\`.\n\n${runaway.repeat(40)}` }
				],
				stop_reason: 'max_tokens'
			},
			{ content: [{ type: 'text', text: 'Sure.' }], stop_reason: 'end_turn' }
		]);
		await conductor.send('turn the drums down');
		expect(conductor.status).toBe('idle');
		expect(conductor.lastError).toBeNull();
		const texts = conductor.entries.filter((e) => e.kind === 'text');
		expect(texts.map((e) => e.kind === 'text' && e.text)).toEqual([
			'Use the master page: `mix → M4`.'
		]);
		expect(
			conductor.entries.some((e) => e.kind === 'notice' && /repeating itself/.test(e.text))
		).toBe(true);
		expect(conductor.usage.calls).toBe(1);

		await conductor.send('thanks');
		const messages = api.messageRequests[1].body.messages;
		const answer = messages.find((m: { role: string }) => m.role === 'assistant');
		expect(answer.content).toEqual([
			{ type: 'text', text: 'Use the master page: `mix → M4`.', citations: null }
		]);
	});

	it('does not append a refused turn and reports it plainly', async () => {
		const { api, conductor } = await setup([
			{
				content: [{ type: 'text', text: 'partial' }],
				stop_reason: 'refusal',
				stop_details: { type: 'refusal', category: 'cyber', explanation: null }
			},
			{ content: [{ type: 'text', text: 'Hello.' }], stop_reason: 'end_turn' }
		]);
		await conductor.send('something odd');
		expect(conductor.status).toBe('error');
		expect(conductor.lastError?.code).toBe('refusal');
		await conductor.send('hello');
		// The refused answer is gone; the unanswered device note is followed by a user turn, so it is
		// rendered as reminder text (a system message must be last or followed by the assistant).
		const messages = api.messageRequests[1].body.messages;
		expect(messages.map((m: { role: string }) => m.role)).toEqual(['user', 'user', 'user']);
		expect(messages[1].content[0].text).toMatch(/^<system-reminder>/);
		expect(JSON.stringify(messages)).not.toContain('partial');
	});

	it.each([
		[{ status: 401, type: 'authentication_error', message: 'invalid x-api-key' }, 'auth'],
		[{ status: 529, type: 'overloaded_error', message: 'Overloaded' }, 'overloaded'],
		[
			{
				status: 429,
				type: 'rate_limit_error',
				message: 'slow down',
				headers: { 'retry-after': '7' }
			},
			'rate-limit'
		]
	] as const)('maps API error %o to %s', async (error, code) => {
		const { conductor } = await setup([{ error }]);
		await conductor.send('hi');
		expect(conductor.status).toBe('error');
		expect(conductor.lastError?.code).toBe(code);
		if (code === 'rate-limit') expect(conductor.lastError?.retryAfter).toBe(7);
		const notice = conductor.entries.find((e) => e.kind === 'notice');
		expect(notice).toMatchObject({ tone: 'error' });
	});

	it('stops a streaming turn without appending a partial answer', async () => {
		const { api, conductor } = await setup([
			{ content: [{ type: 'text', text: 'A long answer' }], stop_reason: 'end_turn', hang: true },
			{ content: [{ type: 'text', text: 'Short.' }], stop_reason: 'end_turn' }
		]);
		const run = conductor.send('explain everything');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(conductor.status).toBe('running');
		conductor.stop();
		await run;
		expect(conductor.status).toBe('idle');
		expect(conductor.lastError).toBeNull();
		await conductor.send('short version');
		expect(api.messageRequests).toHaveLength(2);
		const messages = api.messageRequests[1].body.messages;
		expect(messages.map((m: { role: string }) => m.role)).toEqual(['user', 'user', 'user']);
		expect(JSON.stringify(messages)).not.toContain('A long answer');
		expect(conductor.status).toBe('idle');
		expect(conductor.entries.at(-1)).toMatchObject({ kind: 'text', text: 'Short.' });
	});

	it('restores the last conversation from the store', async () => {
		const store = createMemoryThreadStore();
		const preferences = memoryPreferences();
		const first = await setup(
			[{ content: [{ type: 'text', text: 'Hi there.' }], stop_reason: 'end_turn' }],
			{
				store,
				preferences
			}
		);
		await first.conductor.send('hello');
		const second = await setup([], { store, preferences });
		expect(second.conductor.threadId).toBe(first.conductor.threadId);
		expect(second.conductor.threadTitle).toBe('hello');
		expect(second.conductor.entries.map((e) => e.kind)).toEqual(['user', 'text']);
		expect(second.conductor.threads).toHaveLength(1);
		await second.conductor.newThread();
		expect(second.conductor.entries).toHaveLength(0);
		expect(second.conductor.threadId).not.toBe(first.conductor.threadId);
	});

	it('lists the models the key can use', async () => {
		const { conductor } = await setup([]);
		expect(await conductor.loadModels()).toBe(true);
		expect(conductor.models.map((m) => m.label)).toEqual(['opus 5.5', 'sonnet 5', 'haiku 4.5']);
	});
});

describe('conductor: what it is doing (the live status line)', () => {
	it('is live from the first moment, follows each phase and ends with the run', async () => {
		const { conductor } = await setup([
			{
				content: [
					{ type: 'thinking', thinking: 'Asking the manual expert.', signature: 'sig-1' },
					{
						type: 'tool_use',
						id: 'toolu_task',
						name: 'task',
						input: { subagent_type: 'manual-expert', description: 'What does shift + M1 do?' }
					}
				],
				stop_reason: 'tool_use'
			},
			{
				content: [
					{ type: 'tool_use', id: 'toolu_s1', name: 'search_manual', input: { query: 'shift M1' } }
				],
				stop_reason: 'tool_use'
			},
			{
				content: [{ type: 'text', text: 'shift + M1 opens the engine picker.' }],
				stop_reason: 'end_turn'
			},
			{ content: [{ type: 'text', text: 'It opens the engine picker.' }], stop_reason: 'end_turn' }
		]);
		const seen: string[] = [];
		conductor.on(() => {
			const a = conductor.activity;
			const line = a ? `${a.phase}: ${a.label}${a.detail ? ` / ${a.detail}` : ''}` : 'idle';
			if (seen.at(-1) !== line) seen.push(line);
		});
		const run = conductor.send('what does shift + M1 do?');
		// Before any response: the status line is already up.
		expect(conductor.activity).toMatchObject({
			phase: 'thinking',
			label: 'reading the manual and thinking'
		});
		await run;
		expect(conductor.activity).toBeNull();
		expect(seen).toEqual([
			'thinking: reading the manual and thinking',
			'thinking: thinking / Asking the manual expert.',
			'tool: preparing ask the manual expert',
			'tool: preparing ask the manual expert / What does shift + M1 do?',
			'subagent: manual expert / reading the manual',
			'subagent: manual expert / search manual',
			'subagent: manual expert / search manual “shift M1”',
			'subagent: manual expert / thinking',
			// The scripted API streams each text in two halves ("shift + M1 opens t", "he engine…").
			'subagent: manual expert / writing 5 words',
			'subagent: manual expert / writing 7 words',
			'thinking: thinking',
			'writing: writing / 4 words',
			'writing: writing / 5 words',
			'idle'
		]);
	});

	it('settles each tool chip when its own call finishes, not when the slowest does', async () => {
		const { conductor, events } = await setup([
			{
				content: [
					{ type: 'tool_use', id: 'toolu_status', name: 'device_status', input: {} },
					{
						type: 'tool_use',
						id: 'toolu_task',
						name: 'task',
						input: { subagent_type: 'manual-expert', description: 'What is the M1 page for?' }
					}
				],
				stop_reason: 'tool_use'
			},
			{ content: [{ type: 'text', text: 'M1 shows the engine page.' }], stop_reason: 'end_turn' },
			{ content: [{ type: 'text', text: 'M1 is the engine page.' }], stop_reason: 'end_turn' }
		]);
		await conductor.send('what is M1 for, and is my op-xy connected?');
		const at = (predicate: (e: AgentEvent) => boolean) => events.findIndex(predicate);
		const statusEnd = at((e) => e.type === 'tool_end' && e.id === 'toolu_status');
		const subagentDone = at((e) => e.type === 'done' && e.agent.startsWith('manual-expert:'));
		const taskEnd = at((e) => e.type === 'tool_end' && e.id === 'toolu_task');
		expect(statusEnd).toBeGreaterThanOrEqual(0);
		expect(statusEnd).toBeLessThan(subagentDone);
		expect(subagentDone).toBeLessThan(taskEnd);
	});

	it('names the chip at once and previews its input while the model writes it', async () => {
		const todos = [
			'Open the engine list with shift + M1',
			'Turn E1 to highlight an engine',
			'Click E1 to load it',
			'Check the M1 page for the new parameters',
			'Save the project'
		].map((content, i) => ({ content, status: i === 0 ? 'in_progress' : 'pending' }));
		const api = pacedApi((request) => {
			const last = request.body.messages.findLast((m: { role: string }) => m.role === 'user');
			const answered = JSON.stringify(last?.content ?? '').includes('tool_result');
			return answered
				? new PacedTurn().start().text('Plan is up.').stop('end_turn')
				: new PacedTurn()
						.start()
						.toolUse('toolu_plan', 'write_todos', { todos }, { size: 12, every: 4 })
						.stop('tool_use');
		});
		const { conductor, events } = await setup([], { fetch: api.fetch });
		await conductor.send('plan how to change the engine');
		const pendingEvent = events.find((e) => e.type === 'tool_pending');
		expect(pendingEvent).toMatchObject({ name: 'write_todos', label: 'plan' });
		const previews = events.flatMap((e) =>
			e.type === 'tool_input' && e.id === 'toolu_plan' ? [e.input as { todos?: unknown[] }] : []
		);
		// Throttled (fewer previews than the 12 deltas), growing, and complete at the end.
		expect(previews.length).toBeGreaterThanOrEqual(3);
		expect(previews.length).toBeLessThan(12);
		const counts = previews.map((p) => p.todos?.length ?? 0);
		expect(counts).toEqual([...counts].sort((a, b) => a - b));
		expect(previews.at(-1)).toEqual({ todos });
		const startIndex = events.findIndex((e) => e.type === 'tool_start' && e.id === 'toolu_plan');
		expect(events.findIndex((e) => e.type === 'tool_input')).toBeLessThan(startIndex);
		expect(conductor.todos).toHaveLength(5);
	});
});
