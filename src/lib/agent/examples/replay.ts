/**
 * The chat's examples, played without a key (`recorded.json`, written by `evals/agent/examples.mjs`
 * from real runs of the agent): what the model said and called, turn by turn, streamed back through
 * a paced stand-in for the API while everything else is real, so the conductor runs each tool on
 * the replica, the chat shows what it did and the replica plays it. A recording was made from a new
 * project, so the page starts each example on one (and puts the user's own back afterwards).
 *
 * Loaded on the first play: the panel lists the examples from `list.json` alone.
 */
import { createAnthropicClient } from '../client';
import { Conductor, type ConductorOptions } from '../conductor.svelte';
import { loadManualSource } from '../manual-source';
import { PacedTurn, pacedApi, type CapturedRequest } from '../testing/paced-api';
import { createMemoryThreadStore } from '../threads';
import recorded from './recorded.json';

/** One response of the model as recorded: its thinking note, its text, then the tools it called. */
export interface RecordedResponse {
	readonly thinking?: string;
	readonly text?: string;
	readonly tools: readonly {
		readonly id: string;
		readonly name: string;
		readonly input: unknown;
	}[];
}

/** One exchange: the user's message, the conductor's responses and the manual expert's. */
export interface RecordedTurn {
	readonly user: string;
	readonly conductor: readonly RecordedResponse[];
	readonly subagent: readonly RecordedResponse[];
}

export interface RecordedExample {
	readonly id: string;
	readonly title: string;
	readonly about: string;
	readonly turns: readonly RecordedTurn[];
}

export const RECORDED: readonly RecordedExample[] = recorded as readonly RecordedExample[];

/** A placeholder, never a key: every request is answered inside this page. */
const NOT_A_KEY = 'example-not-a-key';
/** A marker only this module's sessions carry (the thread store is memory, never saved). */
export const EXAMPLE_SESSION = 'op-xy-agent:example';

/** A little deterministic unevenness in the streaming, as the live API has. */
const jitter = (base: number) => (index: number) =>
	Math.round(base * (0.6 + ((index * 37) % 9) / 10));

/** What the conductor is built with, as the app's own agent is (its replica, virtual OP-XY…). */
export type ExampleEnvironment = Omit<
	ConductorOptions,
	'client' | 'manual' | 'store' | 'session' | 'preferences'
>;

/** An example ready to play: its conductor for the chat, and the play itself. */
export interface ExamplePlayer {
	readonly example: RecordedExample;
	readonly conductor: Conductor;
	/** Plays every turn in order; resolves when the last answer is written (or it was stopped). */
	play(): Promise<void>;
	/** Stops it where it is. */
	stop(): void;
}

/** Builds the player for example `id` on the app's environment. */
export async function createExamplePlayer(
	id: string,
	environment: ExampleEnvironment
): Promise<ExamplePlayer> {
	const example = RECORDED.find((e) => e.id === id);
	if (!example) throw new Error(`there is no example “${id}”`);
	const at = { turn: 0, conductor: 0, subagent: 0 };
	let stopped = false;

	function respond(request: CapturedRequest): PacedTurn {
		const body = request.body as { model?: string; tools?: readonly { name: string }[] };
		const lead = body.tools?.some((t) => t.name === 'task') ?? false;
		const turn = example?.turns[at.turn];
		const index = lead ? at.conductor++ : at.subagent++;
		const response = (lead ? turn?.conductor : turn?.subagent)?.[index];
		const paced = new PacedTurn(body.model ?? 'claude-sonnet-5')
			.wait(index === 0 ? 900 : 400)
			.start({ input: 0, cacheRead: 0 });
		if (!response) return paced.text('…').stop('end_turn');
		if (response.thinking) paced.thinking(response.thinking, { size: 4, every: 90 });
		if (response.text) paced.wait(150).text(response.text, { size: 2, every: jitter(40) });
		for (const call of response.tools) {
			paced.wait(120).toolUse(call.id, call.name, call.input, { size: 6, every: 30 });
		}
		return paced.stop(response.tools.length > 0 ? 'tool_use' : 'end_turn');
	}

	const api = pacedApi(respond);
	const conductor = await Conductor.create({
		...environment,
		client: createAnthropicClient({ apiKey: NOT_A_KEY, fetch: api.fetch, maxRetries: 0 }),
		manual: await loadManualSource(),
		store: createMemoryThreadStore(),
		preferences: { get: () => null, set: () => {} },
		session: EXAMPLE_SESSION,
		// a recording decides nothing: what it changes goes on without asking, as it was recorded
		autoApprove: true,
		confirmWindowMs: 0
	});

	return {
		example,
		conductor,
		async play() {
			for (const [i, turn] of example.turns.entries()) {
				if (stopped) return;
				Object.assign(at, { turn: i, conductor: 0, subagent: 0 });
				if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
				if (stopped) return;
				await conductor.send(turn.user);
			}
		},
		stop() {
			stopped = true;
			conductor.stop();
		}
	};
}
