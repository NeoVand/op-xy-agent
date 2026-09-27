/**
 * DEVELOPMENT ONLY: a scripted agent run for building and checking the chat without an API key.
 * Open `/?demo=1` under `vite dev`. The agent panel imports this module only inside an
 * `import.meta.env.DEV` branch, which production builds drop, so none of it ships (`pnpm build` plus
 * a grep of the output for {@link DEMO_MARKER} verifies it).
 *
 * Everything but api.anthropic.com is real: the SDK, the conductor, its tools, the manual expert,
 * the chat reducer and the activity line. The API is a paced fake (`testing/paced-api.ts`) that plays
 * a realistic run whatever you ask: a couple of seconds of silence while the cached prompt is read,
 * thinking notes, `show_on_replica` (the replica really animates), a `task` for the manual expert
 * (which really searches and reads our manual), then the answer streamed word by word. Nothing is
 * stored and no device is attached, so the demo can never send MIDI.
 */
import type { ReplicaState } from '$lib/replica';
import { createAnthropicClient } from './client';
import { Conductor } from './conductor.svelte';
import { loadManualSource } from './manual-source';
import { PacedTurn, pacedApi, type CapturedRequest } from './testing/paced-api';
import { createMemoryThreadStore } from './threads';

/** A string only this module contains: the production bundle must not. */
export const DEMO_MARKER = 'op-xy-agent:demo-run';

/** Asked on its own when the demo page opens. */
export const DEMO_QUESTION = 'what does shift + M1 do?';

/** A placeholder, never a key: every request is answered by the fake fetch inside this page. */
const NOT_A_KEY = 'demo-not-a-key';

/** Builds a conductor that talks to the paced fake API. */
export async function createDemoConductor(replica: ReplicaState | null): Promise<Conductor> {
	const api = pacedApi(respond);
	const client = createAnthropicClient({ apiKey: NOT_A_KEY, fetch: api.fetch, maxRetries: 0 });
	return Conductor.create({
		client,
		device: null,
		replica,
		manual: await loadManualSource(),
		store: createMemoryThreadStore(),
		preferences: { get: () => null, set: () => {} },
		session: DEMO_MARKER
	});
}

// ─── the script ─────────────────────────────────────────────────────────────────────────────────

let run = 0;

/** A little deterministic unevenness, so deltas do not tick like a metronome. */
function jitter(base: number): (index: number) => number {
	return (index) => Math.round(base * (0.6 + ((index * 37) % 9) / 10));
}

interface RequestBody {
	readonly tools?: readonly { readonly name: string }[];
	readonly messages: readonly { readonly role: string; readonly content: unknown }[];
}

/** Content blocks of the last user message (tool results come back in one). */
function lastUserBlocks(body: RequestBody): Record<string, unknown>[] {
	const last = body.messages.findLast((m) => m.role === 'user');
	return Array.isArray(last?.content) ? (last.content as Record<string, unknown>[]) : [];
}

/** Ids of the calls whose results the request carries. */
function resultIds(body: RequestBody): string[] {
	return lastUserBlocks(body)
		.filter((b) => b.type === 'tool_result')
		.map((b) => String(b.tool_use_id));
}

/** The unit id in the first search result's title ("Engine page (M1) [instrument.engine]"). */
function firstUnitId(body: RequestBody): string {
	for (const block of lastUserBlocks(body)) {
		const content = block.type === 'tool_result' ? block.content : null;
		if (!Array.isArray(content)) continue;
		for (const result of content as { title?: string }[]) {
			const id = /\[([^\]]+)\]/.exec(result.title ?? '')?.[1];
			if (id) return id;
		}
	}
	return 'instrument.engine';
}

function respond(request: CapturedRequest): PacedTurn {
	const body = request.body as RequestBody;
	const conductor = body.tools?.some((t) => t.name === 'task') ?? false;
	const results = resultIds(body);
	if (conductor) return results.length === 0 ? plan(++run) : answer();
	if (results.some((id) => id.includes('_search_'))) return readUnit(firstUnitId(body));
	if (results.some((id) => id.includes('_read_'))) return expertAnswer();
	return search();
}

/** The conductor, first call: a long cold read of the cached prompt, a note, two tool calls. */
function plan(n: number): PacedTurn {
	return new PacedTurn('claude-opus-5-5')
		.wait(700)
		.start({ input: 60, cacheRead: 131_000 })
		.wait(1600)
		.thinking(
			'Looking up shift + M1. I will show the combo on the replica and ask the manual expert for the exact steps.',
			{ size: 6, every: jitter(110) }
		)
		.wait(300)
		.toolUse(
			`toolu_demo_show_${n}`,
			'show_on_replica',
			{ keys: 'shift + M1', caption: 'opens the engine list' },
			{ size: 3, every: 90 }
		)
		.wait(250)
		.toolUse(
			`toolu_demo_task_${n}`,
			'task',
			{
				subagent_type: 'manual-expert',
				description:
					'What does shift + M1 do on the OP-XY (OS 1.1.33)? Explain what the engine list shows, how to pick an engine and what M1 shows afterwards. Cite the manual units you use.'
			},
			{ size: 12, every: jitter(110) }
		)
		.stop('tool_use');
}

/** The manual expert, first call: reads its prompt, then searches. */
function search(): PacedTurn {
	return new PacedTurn('claude-sonnet-5')
		.wait(600)
		.start({ input: 40, cacheRead: 128_000 })
		.wait(900)
		.thinking('Searching the manual for the engine list.', { size: 3, every: 120 })
		.wait(200)
		.toolUse(
			`toolu_demo_search_${run}`,
			'search_manual',
			{ query: 'shift M1 engine list' },
			{ size: 2, every: 100 }
		)
		.stop('tool_use');
}

/** The manual expert, second call: reads the best unit in full. */
function readUnit(id: string): PacedTurn {
	return new PacedTurn('claude-sonnet-5')
		.wait(500)
		.start({ input: 900, cacheRead: 128_000 })
		.wait(500)
		.thinking(`The engine page unit has the steps; reading it in full.`, { size: 3, every: 110 })
		.wait(150)
		.toolUse(`toolu_demo_read_${run}`, 'read_manual_unit', { id }, { size: 2, every: 90 })
		.stop('tool_use');
}

/** The manual expert's report, streamed. */
function expertAnswer(): PacedTurn {
	return new PacedTurn('claude-sonnet-5')
		.wait(600)
		.start({ input: 2400, cacheRead: 128_000 })
		.wait(400)
		.text(
			'`shift + M1` opens the engine list for the selected instrument track [instrument.engine]. ' +
				'It holds all twelve engines: eight synths, three samplers and the midi engine. ' +
				'Turn `E1` to highlight one and click `E1` (or press `M1`) to load it. ' +
				'`M1` then shows the new engine’s parameters; the other pages keep working as before.',
			{ size: 1, every: jitter(45) }
		)
		.stop('end_turn');
}

/** The conductor's answer, streamed word by word. */
function answer(): PacedTurn {
	return new PacedTurn('claude-opus-5-5')
		.wait(600)
		.start({ input: 700, cacheRead: 131_200 })
		.wait(300)
		.thinking('Putting the answer together.', { size: 2, every: 120 })
		.wait(250)
		.text(
			'`shift + M1` opens the **engine list** for the selected instrument track [instrument.engine].\n\n' +
				'1. Hold `shift` and press `M1`: the list shows all twelve engines, eight synths, three samplers and midi.\n' +
				'2. Turn `E1` to highlight an engine.\n' +
				'3. Click `E1` (or press `M1` again) to load it.\n\n' +
				'`M1` on its own is the engine page: its four encoders edit the loaded engine’s own parameters, so what they do changes with the engine. ' +
				'I showed the combo on the replica. To swap the whole sound for a finished patch instead, load a preset.',
			{ size: 1, every: jitter(50) }
		)
		.stop('end_turn');
}
