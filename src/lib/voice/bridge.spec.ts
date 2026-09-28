// The voice's tools on the real conductor (the SDK over a scripted API, the fake OP-XY): a spoken
// request becomes a normal user turn with the same tools and approvals, its answer comes back fit
// to say, and an approval is decided by voice only when the user themselves said yes after the
// question. Results that come later (the user tapped approve, a long request) arrive as updates.
import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '$lib/agent/chat';
import type { VoiceToolResult } from '$lib/core/voice';
import { createFakeRig } from '../../../test/fakes/rig';
import { FakeTime } from '../../../test/fakes/fake-time';
import { createAnthropicClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import { createUnitSource } from '$lib/agent/manual-index';
import { PacedTurn, pacedApi } from '$lib/agent/testing/paced-api';
import { scriptedApi, type ScriptStep } from '$lib/agent/testing/scripted-api';
import { createMemoryThreadStore } from '$lib/agent/threads';
import { ClaudeBridge, answerOf, changesOf, type SpokenEvidence } from './bridge';

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
			text: 'Hold shift and press M1 to open the engine list.',
			source: 'https://example.test/manual#m1'
		}
	]
});

/** What the user said, turn by turn, as the voice session would report it. */
function speech() {
	const turns: { readonly index: number; readonly transcript: string }[] = [];
	const evidence: SpokenEvidence = {
		turns: () => turns.length,
		async answerSince(since) {
			const turn = turns.findLast((t) => t.index > since);
			return turn ? turn.transcript : null;
		}
	};
	return {
		evidence,
		say: (text: string) => turns.push({ index: turns.length + 1, transcript: text })
	};
}

async function setup(
	script: ScriptStep[],
	options: { conductor?: boolean; fetch?: (time: FakeTime) => typeof fetch } = {}
) {
	const rig = createFakeRig();
	await rig.connect();
	const api = scriptedApi(script);
	const time = new FakeTime();
	const conductor = await Conductor.create({
		client: createAnthropicClient({
			apiKey: KEY,
			fetch: options.fetch?.(time) ?? api.fetch,
			maxRetries: 0
		}),
		device: rig.stack,
		replica: null,
		manual: MANUAL,
		store: createMemoryThreadStore(),
		preferences: { get: () => null, set: () => {} },
		confirmWindowMs: 0,
		session: 'session-test'
	});
	const { evidence, say } = speech();
	const updates: VoiceToolResult[] = [];
	const bridge = new ClaudeBridge({
		conductor: () => (options.conductor === false ? null : conductor),
		evidence,
		timers: time,
		patienceMs: 1000,
		transcriptWaitMs: 100,
		onUpdate: (result) => updates.push(result)
	});
	return { rig, api, conductor, bridge, time, say, updates };
}

const setTempo = (bpm: number): ScriptStep => ({
	content: [{ type: 'tool_use', id: `toolu_tempo_${bpm}`, name: 'set_tempo', input: { bpm } }],
	stop_reason: 'tool_use'
});

const answer = (text: string): ScriptStep => ({
	content: [{ type: 'text', text }],
	stop_reason: 'end_turn'
});

describe('ask_claude', () => {
	it('sends the request as a user turn marked voice and returns the answer fit to say', async () => {
		const { api, conductor, bridge } = await setup([
			answer('Hold `shift` and press `M1` to open the engine list [modes.m1].')
		]);
		const result = await bridge.handle({ tool: 'ask_claude', request: 'What does shift M1 do?' });
		expect(result).toEqual({
			status: 'done',
			answer: 'Hold shift and press M1 to open the engine list.',
			changes: []
		});
		expect(conductor.entries[0]).toMatchObject({
			kind: 'user',
			text: 'What does shift M1 do?',
			via: 'voice'
		});
		// Claude is told the answer will be heard, in the conversation's tail (the cache stays warm).
		const messages = api.messageRequests[0].body.messages as { role: string; content: unknown }[];
		expect(JSON.stringify(messages.at(-1))).toContain('asked this by voice');
		expect(conductor.threadTitle).toBe('What does shift M1 do?');
	});

	it('says what is waiting for approval, and a spoken yes after the question approves it', async () => {
		const { rig, conductor, bridge, say } = await setup([
			setTempo(96),
			answer('Tempo is now 96 BPM.')
		]);
		say('set the tempo to 96');
		const asked = await bridge.ask('Set the tempo to 96 BPM.');
		expect(asked).toMatchObject({
			status: 'needs_approval',
			changes: [expect.stringMatching(/96 bpm/)]
		});
		expect(conductor.status).toBe('approval');

		// The model may not answer for the user: nothing was said since the question.
		expect(await bridge.answer(true, null)).toMatchObject({ status: 'not_confirmed', heard: null });
		expect(conductor.status).toBe('approval');

		say('yes, go ahead');
		const done = await bridge.answer(true, null);
		expect(done).toMatchObject({
			status: 'done',
			answer: 'Tempo is now 96 BPM.',
			changes: [expect.stringMatching(/96 bpm/)]
		});
		await rig.time.advance(5);
		expect(rig.opxy.bpm).toBe(96);
		expect(conductor.entries.find((e) => e.kind === 'approval')).toMatchObject({
			outcome: 'approved',
			via: 'voice'
		});
	});

	it('does not take an unclear answer as a yes, and passes a spoken no on with its words', async () => {
		const { rig, conductor, bridge, say } = await setup([
			setTempo(140),
			answer('Okay, leaving it.')
		]);
		await bridge.ask('Make it faster.');
		say('hmm, what?');
		expect(await bridge.answer(true, null)).toMatchObject({
			status: 'not_confirmed',
			heard: 'hmm, what?'
		});
		expect(conductor.status).toBe('approval');

		say('no, keep it at 120');
		expect(await bridge.answer(false, 'keep it at 120')).toMatchObject({
			status: 'done',
			answer: 'Okay, leaving it.',
			changes: []
		});
		await rig.time.advance(5);
		expect(rig.opxy.bpm).not.toBe(140);
		expect(conductor.entries.find((e) => e.kind === 'approval')).toMatchObject({
			outcome: 'rejected',
			note: 'keep it at 120',
			via: 'voice'
		});
	});

	it('reports the result later when the user decides on screen instead', async () => {
		const { conductor, bridge, updates } = await setup([
			setTempo(100),
			answer('Tempo is 100 BPM.')
		]);
		expect((await bridge.ask('Tempo 100 please.')).status).toBe('needs_approval');
		conductor.decide({ kind: 'approve' });
		await expect.poll(() => updates.length).toBe(1);
		expect(updates[0]).toMatchObject({ status: 'done', answer: 'Tempo is 100 BPM.' });
		expect(await bridge.answer(true, null)).toMatchObject({ status: 'no_approval' });
	});

	it('answers "working" when a request runs long, and reports its end as an update', async () => {
		const { conductor, bridge, time, updates } = await setup([], {
			fetch: (timers) =>
				pacedApi(
					() => new PacedTurn().start().wait(3000).text('Your song is ready.').stop('end_turn'),
					{ timers }
				).fetch
		});
		const asking = bridge.ask('Write me a whole song.');
		await expect.poll(() => conductor.status).toBe('running');
		await time.advance(1000);
		expect(await asking).toMatchObject({ status: 'working' });
		expect(updates).toEqual([]);
		await time.advance(2500);
		await expect.poll(() => updates.length).toBe(1);
		expect(updates[0]).toEqual({ status: 'done', answer: 'Your song is ready.', changes: [] });
	});

	it('stops Claude when asked, without a second word about it', async () => {
		const { conductor, bridge, time, updates } = await setup([
			{ content: [{ type: 'text', text: 'Composing' }], stop_reason: 'end_turn', hang: true }
		]);
		const asking = bridge.ask('Write me a whole song.');
		await expect.poll(() => conductor.status).toBe('running');
		await time.advance(1000);
		expect(await asking).toMatchObject({ status: 'working' });
		expect(bridge.stop()).toMatchObject({ status: 'stopped' });
		await expect.poll(() => conductor.busy).toBe(false);
		await time.flush();
		expect(updates).toEqual([]);
		expect(bridge.stop()).toMatchObject({ instruction: 'Claude was not working on anything.' });
	});

	it('does not queue a request behind one typed in the chat', async () => {
		const { conductor, bridge } = await setup([
			{ content: [{ type: 'text', text: 'Thinking' }], stop_reason: 'end_turn', hang: true }
		]);
		void conductor.send('a typed question');
		await expect.poll(() => conductor.status).toBe('running');
		expect(await bridge.ask('And another thing')).toMatchObject({ status: 'busy' });
		conductor.stop();
	});

	it('says plainly when Claude is not set up, and when there is nothing to stop', async () => {
		const { bridge } = await setup([], { conductor: false });
		expect(await bridge.ask('hello')).toMatchObject({ status: 'error' });
		expect(bridge.stop()).toMatchObject({ status: 'stopped' });
		expect(await bridge.handle({ tool: 'invalid', name: 'x', problem: 'nope' })).toEqual({
			status: 'error',
			message: 'x: nope'
		});
	});
});

describe('spoken lines in the conversation', () => {
	it('updates a line as it is heard, drops one that ends empty, and keeps finished ones', async () => {
		const store = createMemoryThreadStore();
		const conductor = await Conductor.create({
			client: createAnthropicClient({ apiKey: KEY, fetch: scriptedApi([]).fetch, maxRetries: 0 }),
			device: null,
			replica: null,
			manual: MANUAL,
			store,
			preferences: { get: () => null, set: () => {} }
		});
		const line = { id: 'item_u1', role: 'user', text: '', live: true, interrupted: false } as const;
		conductor.voiceLine(line);
		conductor.voiceLine({ ...line, text: 'set the tempo' });
		expect(conductor.entries).toEqual([
			{
				kind: 'voice',
				id: 'voice-item_u1',
				role: 'user',
				text: 'set the tempo',
				live: true,
				interrupted: false
			}
		]);
		conductor.voiceLine({
			id: 'item_a1',
			role: 'assistant',
			text: 'One',
			live: true,
			interrupted: false
		});
		conductor.voiceLine({ ...line, text: 'set the tempo to 96', live: false });
		// Saved while the voice's line was still being spoken.
		await expect.poll(async () => (await store.load(conductor.threadId))?.entries.length).toBe(2);
		const midSentence = await store.load(conductor.threadId);
		expect(conductor.threadTitle).toBe('set the tempo to 96');

		conductor.voiceLine({
			id: 'item_u2',
			role: 'user',
			text: '  ',
			live: false,
			interrupted: false
		});
		conductor.voiceLine({
			id: 'item_a1',
			role: 'assistant',
			text: '',
			live: false,
			interrupted: false
		});
		expect(conductor.entries.map((e) => e.id)).toEqual(['voice-item_u1']);

		// A thread saved mid-sentence opens with its lines finished.
		await store.save({ ...midSentence!, id: 'thread-old', updatedAt: 1 });
		await conductor.openThread('thread-old');
		expect(conductor.entries.map((e) => e.kind === 'voice' && e.live)).toEqual([false, false]);
	});
});

describe('answers and changes of a run', () => {
	it('reads the text after the last user message, and the changes its tools made', () => {
		const entries: ChatEntry[] = [
			{ kind: 'user', id: 'u1', text: 'old' },
			{
				kind: 'text',
				id: 't1',
				agent: 'conductor',
				parent: null,
				text: 'old answer',
				citations: []
			},
			{ kind: 'user', id: 'u2', text: 'new', via: 'voice' },
			{
				kind: 'voice',
				id: 'v1',
				role: 'assistant',
				text: 'one moment',
				live: false,
				interrupted: false
			},
			{
				kind: 'text',
				id: 't2',
				agent: 'conductor',
				parent: null,
				text: 'Setting it.',
				citations: []
			},
			{
				kind: 'text',
				id: 't3',
				agent: 'manual-expert:x',
				parent: 'x',
				text: 'nested',
				citations: []
			},
			{
				kind: 'tool',
				id: 'toolu_1',
				agent: 'conductor',
				parent: null,
				name: 'set_tempo',
				label: 'set tempo',
				toolKind: 'mutate',
				status: 'ok',
				input: {},
				summary: ''
			},
			{ kind: 'text', id: 't4', agent: 'conductor', parent: null, text: 'Done: 96.', citations: [] }
		];
		expect(answerOf(entries)).toBe('Setting it.\n\nDone: 96.');
		const revision = { toolCallId: 'toolu_1', label: 'tempo 120 → 96 bpm' };
		const old = { toolCallId: 'toolu_0', label: 'track 2 mute' };
		expect(changesOf(entries, [old, revision] as never)).toEqual(['tempo 120 → 96 bpm']);
	});
});
