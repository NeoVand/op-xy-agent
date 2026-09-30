// What the conductor adds to a message (docs/AGENT-V2.md): the skill a message clearly needs rides
// with it, in the same system note as the device update, once per thread; in map mode the system
// prompt carries the manual's map and each message brings the units that match it; after tools
// change the replica, the model is told what changed before it answers.
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { createAnthropicClient } from './client';
import { Conductor } from './conductor.svelte';
import { createUnitSource } from './manual-index';
import { createMemoryStore } from './memory';
import { createMemoryThreadStore } from './threads';
import { scriptedApi, type ScriptedTurn } from './testing/scripted-api';

const KEY = 'sk-ant-' + 'api03-' + 'test-'.padEnd(40, '0');

const MANUAL = createUnitSource({
	kind: 'manual',
	label: 'test manual',
	header: '# Test manual',
	units: [
		{
			id: 'tempo.tempo-screen',
			title: 'Tempo, tap tempo and metronome',
			text: 'Press tempo to open the tempo page; E1 sets the BPM.',
			source: 'https://example.test/manual#tempo'
		},
		{
			id: 'instrument.filter',
			title: 'The filter',
			text: 'M3 opens the filter page; E1 sets the cutoff.',
			source: 'https://example.test/manual#filter'
		}
	]
});

const answer = (text: string): ScriptedTurn => ({
	content: [{ type: 'text', text }],
	stop_reason: 'end_turn'
});

async function setup(options: { manualMode?: 'full' | 'map' } = {}) {
	const api = scriptedApi([answer('One.'), answer('Two.')]);
	const conductor = await Conductor.create({
		client: createAnthropicClient({ apiKey: KEY, fetch: api.fetch, maxRetries: 0 }),
		device: null,
		replica: null,
		manual: MANUAL,
		store: createMemoryThreadStore(),
		confirmWindowMs: 0,
		session: 'session-test',
		...options
	});
	return { api, conductor };
}

/** All the text a request's messages carry. */
const requestText = (body: { messages: { content: unknown }[] }) => JSON.stringify(body.messages);

describe('the conductor adds what a message needs', () => {
	it('the skill it clearly needs, once a thread', async () => {
		const { api, conductor } = await setup();
		await conductor.send('why does track 3 sound so dark?');
		const first = api.messageRequests[0].body;
		expect(requestText(first)).toContain('<skill name=\\"shape-a-sound\\">');
		// with the device note, in one system message after the user's
		expect(first.messages).toHaveLength(2);
		await conductor.send('and my pad sounds dull too');
		const second = api.messageRequests[1].body;
		expect(requestText(second).split('<skill name=\\"shape-a-sound\\">')).toHaveLength(2);
		expect(conductor.entries.filter((e) => e.kind === 'text').map((e) => e.kind)).toHaveLength(2);
	});

	it('in map mode, the map in the system prompt and the matching units with the message', async () => {
		const { api, conductor } = await setup({ manualMode: 'map' });
		await conductor.send('how do I set the tempo?');
		const body = api.messageRequests[0].body;
		const manual = body.system.at(-1).text;
		expect(manual).toContain('[tempo.tempo-screen] Tempo, tap tempo and metronome');
		expect(manual).not.toContain('E1 sets the BPM');
		expect(requestText(body)).toContain('<manual-unit id=\\"tempo.tempo-screen\\">');
		expect(requestText(body)).toContain('E1 sets the BPM');
	});

	it('in full mode, the whole manual and no retrieval', async () => {
		const { api, conductor } = await setup();
		await conductor.send('how do I set the tempo?');
		const body = api.messageRequests[0].body;
		expect(body.system.at(-1).text).toContain('E1 sets the BPM');
		expect(requestText(body)).not.toContain('<manual-unit');
	});
});

describe('the conductor grounds its answer', () => {
	it('in what changed on the replica, after the tools and before the answer', async () => {
		const api = scriptedApi([
			{
				content: [{ type: 'tool_use', id: 'toolu_t', name: 'set_tempo', input: { bpm: 100 } }],
				stop_reason: 'tool_use'
			},
			answer('It runs at 100 now.')
		]);
		const sim = new OpxySim({ now: () => 0 });
		const conductor = await Conductor.create({
			client: createAnthropicClient({ apiKey: KEY, fetch: api.fetch, maxRetries: 0 }),
			device: null,
			replica: null,
			virtual: createVirtualOpxy({ sim }),
			manual: MANUAL,
			store: createMemoryThreadStore(),
			confirmWindowMs: 0,
			autoApprove: true,
			session: 'session-test'
		});
		await conductor.send('slow it down to 100');
		const second = api.messageRequests[1].body;
		const results = second.messages.at(-1);
		expect(results.role).toBe('user');
		expect(results.content[0].type).toBe('tool_result');
		const note = results.content.at(-1);
		expect(note.type).toBe('text');
		expect(note.text).toMatch(/^<replica-changes>\n/);
		expect(note.text).toContain('- tempo 120 → 100 bpm');
		// and the chat shows the same list once the turn ends, each change with the keys it is on
		expect(conductor.entries.at(-1)).toMatchObject({
			kind: 'changes',
			lines: ['tempo 120 → 100 bpm'],
			changes: [{ brief: 'tempo 120 → 100 bpm', controls: ['key.tempo'] }],
			undo: 'ready'
		});
		// which the replica lights until the next message
		expect(conductor.litChanges?.changes.map((c) => c.brief)).toEqual(['tempo 120 → 100 bpm']);
	});

	it('takes a turn back from its changes note, keeps what the user did since, and puts it back', async () => {
		const api = scriptedApi([
			{
				content: [
					{ type: 'tool_use', id: 'toolu_t', name: 'set_tempo', input: { bpm: 100 } },
					{
						type: 'tool_use',
						id: 'toolu_p',
						name: 'write_pattern',
						input: { track: 3, notes: [{ step: 1, note: 48 }] }
					}
				],
				stop_reason: 'tool_use'
			},
			answer('Done.'),
			answer('Fine.')
		]);
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		const conductor = await Conductor.create({
			client: createAnthropicClient({ apiKey: KEY, fetch: api.fetch, maxRetries: 0 }),
			device: null,
			replica: null,
			virtual,
			manual: MANUAL,
			store: createMemoryThreadStore(),
			confirmWindowMs: 0,
			autoApprove: true,
			session: 'session-test'
		});
		await conductor.send('slow it down and give me a bass note');
		const note = conductor.entries.at(-1)!;
		expect(note.kind).toBe('changes');
		// the user changes the pattern the turn wrote; the tempo still reads as the turn left it
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 5, note: 50, velocity: 90, length: 1 }]
		});
		expect(conductor.litChanges?.id).toBe(note.id);
		expect(await conductor.undoTurn(note.id)).toBe(true);
		expect(sim.state.tempo.bpm).toBe(120);
		// taken back: nothing of it is lit
		expect(conductor.litChanges).toBeNull();
		expect(virtual.readPattern(3).notes.map((n) => n.step)).toEqual([5]);
		expect(conductor.entries.at(-1)).toMatchObject({ kind: 'changes', undo: 'undone' });
		expect(await conductor.undoTurn(note.id)).toBe(true);
		expect(sim.state.tempo.bpm).toBe(100);
		// put back: it lights again, until the next message
		expect(conductor.litChanges?.id).toBe(note.id);
		// the model hears of both with the next message
		await conductor.send('thanks');
		expect(conductor.litChanges).toBeNull();
		const text = JSON.stringify(api.messageRequests[2].body.messages.at(-1));
		expect(text).toMatch(/The user took back what your answer changed on the replica/);
		expect(text).toMatch(/The user put back what your answer had changed/);
	});
});

describe('the conductor remembers', () => {
	it('adds what it remembers about the user to a conversation’s first message only', async () => {
		const api = scriptedApi([answer('Hi again.'), answer('Sure.')]);
		const conductor = await Conductor.create({
			client: createAnthropicClient({ apiKey: KEY, fetch: api.fetch, maxRetries: 0 }),
			device: null,
			replica: null,
			manual: MANUAL,
			store: createMemoryThreadStore(),
			memory: createMemoryStore([{ path: '/memories/user.md', text: 'Level: beginner' }]),
			confirmWindowMs: 0,
			session: 'session-test'
		});
		await conductor.send('hello');
		expect(requestText(api.messageRequests[0].body)).toContain('Level: beginner');
		await conductor.send('make a beat');
		const second = api.messageRequests[1].body;
		expect(requestText(second).split('<memory>')).toHaveLength(2);
	});
});

describe('the conductor follows up', () => {
	it('on what the user did in the app, as the app’s message, and shows a line for it', async () => {
		const api = scriptedApi([answer('Try it.'), answer('That opened the filter.')]);
		const conductor = await Conductor.create({
			client: createAnthropicClient({ apiKey: KEY, fetch: api.fetch, maxRetries: 0 }),
			device: null,
			replica: null,
			manual: MANUAL,
			store: createMemoryThreadStore(),
			confirmWindowMs: 0,
			session: 'session-test'
		});
		// nothing to follow up before a conversation
		await conductor.followUp('note', 'shown');
		expect(api.messageRequests).toHaveLength(0);
		await conductor.send('walk me through opening the filter');
		await conductor.followUp('The user finished the walkthrough.', 'walkthrough done: filter');
		const body = api.messageRequests[1].body;
		expect(body.messages.at(-1).role).toBe('user');
		expect(requestText(body)).toContain('The user finished the walkthrough.');
		const kinds = conductor.entries.map((e) => e.kind);
		expect(kinds.slice(-2)).toEqual(['notice', 'text']);
	});
});
