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
 * (which really searches and reads our manual), then the answer streamed word by word. Ask it for
 * a beat and it writes one on the replica instead (`write_pattern`, with the virtual OP-XY when the
 * page hands it the simulator), so the changes note, the change glow, the pattern card and the quick
 * replies show. Nothing is stored and no device is attached, so the demo can never send MIDI.
 */
import type { AppSimulator } from '$lib/app/simulator.svelte';
import { createVirtualOpxy } from '$lib/app/virtual';
import { BrowserLabHost } from './lab/host';
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

/** Builds a conductor that talks to the paced fake API (writing on the replica with `simulator`). */
export async function createDemoConductor(
	replica: ReplicaState | null,
	simulator: AppSimulator | null = null
): Promise<Conductor> {
	const api = pacedApi(respond);
	const client = createAnthropicClient({ apiKey: NOT_A_KEY, fetch: api.fetch, maxRetries: 0 });
	return Conductor.create({
		client,
		device: null,
		replica,
		virtual: simulator ? createVirtualOpxy({ sim: simulator.sim }) : undefined,
		lab: simulator ? new BrowserLabHost({ sim: simulator.sim }) : null,
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

/** The text of the user's last message. */
function lastUserText(body: RequestBody): string {
	const last = body.messages.findLast((m) => m.role === 'user');
	if (typeof last?.content === 'string') return last.content;
	return lastUserBlocks(body)
		.map((b) => (b.type === 'text' ? String(b.text) : ''))
		.join(' ');
}

function respond(request: CapturedRequest): PacedTurn {
	const body = request.body as RequestBody;
	const conductor = body.tools?.some((t) => t.name === 'task') ?? false;
	const results = resultIds(body);
	if (conductor && results.some((id) => id.includes('_beat_'))) return beatAnswer();
	if (conductor && results.some((id) => id.includes('_takes_'))) return takesAnswer();
	if (conductor && results.some((id) => id.includes('_bass_'))) return partAnswer('bass');
	if (conductor && results.some((id) => id.includes('_chords_'))) return partAnswer('chords');
	if (conductor && results.length === 0) {
		const asked = lastUserText(body);
		if (/\b(choose|pick|options|takes|basslines)\b/i.test(asked)) return takes(++run);
		if (/\bbass/i.test(asked)) return part(++run, 'bass');
		if (/\b(chords?|keys|pad)\b/i.test(asked)) return part(++run, 'chords');
		if (/\b(beat|groove|drums?)\b/i.test(asked)) return beat(++run);
	}
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
			{ keys: 'shift + M1', caption: 'brings up the preset browser' },
			{ size: 3, every: 90 }
		)
		.wait(250)
		.toolUse(
			`toolu_demo_task_${n}`,
			'task',
			{
				subagent_type: 'manual-expert',
				description:
					'What does shift + M1 do on the OP-XY (OS 1.1.33)? Explain what the browser shows, how to change the engine from it and what M1 shows afterwards. Cite the manual units you use.'
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
		.thinking('Searching the manual for shift + M1.', { size: 3, every: 120 })
		.wait(200)
		.toolUse(
			`toolu_demo_search_${run}`,
			'search_manual',
			{ query: 'shift M1 preset browser engine' },
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
			'On OS 1.1.33 `shift + M1` brings up the preset browser for the selected instrument track, by engine [instrument.engine]. ' +
				'The engines sit in the middle with the track’s own boxed, and that engine’s presets on the right. ' +
				'Turn `E1` to an engine (its first preset is highlighted) and click `E2` to load it [instrument.preset-browser]. ' +
				'That changes the engine with the whole sound, and `M1` then shows the new engine’s parameters.',
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
			'`shift + M1` brings up the **preset browser** for the selected instrument track: on OS 1.1.33 it is where you change engine [instrument.engine].\n\n' +
				'1. Hold `shift` and press `M1`: the engines are listed in the middle, the track’s own boxed, its presets on the right.\n' +
				'2. Turn `E1` to an engine; its first preset is highlighted (`E2` picks another).\n' +
				'3. Click `E2` to load it.\n\n' +
				'Loading changes the whole sound, the engine included, and lands on `M1`, the engine page: its four encoders edit the loaded engine’s own parameters. ' +
				'I showed the combo on the replica. A click of `E1` in the browser swaps to the category view [instrument.preset-browser].',
			{ size: 1, every: jitter(50) }
		)
		.stop('end_turn');
}

/** Asked for a beat: a four-on-the-floor house beat on track 1, written on the replica. */
function beat(n: number): PacedTurn {
	const kick = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 118 }));
	const clap = [5, 13].map((step) => ({ step, note: 58, velocity: 100 }));
	const hats = [3, 7, 11, 15].map((step) => ({ step, note: 63, velocity: 84 }));
	const ghost = [8, 16].map((step) => ({ step, note: 61, velocity: 52 }));
	return new PacedTurn('claude-opus-5-5')
		.wait(700)
		.start({ input: 60, cacheRead: 131_000 })
		.wait(500)
		.thinking('A house beat: kick on every beat, clap on 2 and 4, open hats on the offbeats.', {
			size: 5,
			every: jitter(100)
		})
		.wait(200)
		.toolUse(
			`toolu_demo_beat_${n}`,
			'write_pattern',
			{ track: 1, pattern: 1, bars: 1, notes: [...kick, ...clap, ...hats, ...ghost] },
			{ size: 8, every: 60 }
		)
		.stop('tool_use');
}

/** The beat's answer, streamed, ending on an offer. */
function beatAnswer(): PacedTurn {
	return new PacedTurn('claude-opus-5-5')
		.wait(500)
		.start({ input: 900, cacheRead: 131_200 })
		.wait(300)
		.text(
			'A house beat on T1: the kick on every beat, the clap on 2 and 4, open hats on the offbeats and two soft closed hats pushing into the next beat. Press `play` to hear it, or click the steps in the card to change it.\n\nWant me to add a bassline, or make it a song?',
			{ size: 1, every: jitter(45) }
		)
		.stop('end_turn');
}

/** Asked for a bassline (track 3) or chords (track 4): a pitched part in A minor, written on the replica. */
function part(n: number, kind: 'bass' | 'chords'): PacedTurn {
	const notes =
		kind === 'bass'
			? [
					{ step: 1, note: 45, velocity: 110, length: 2 },
					{ step: 4, note: 45, velocity: 80, length: 1 },
					{ step: 7, note: 52, velocity: 96, length: 1 },
					{ step: 9, note: 41, velocity: 110, length: 2 },
					{ step: 12, note: 43, velocity: 88, length: 1 },
					{ step: 15, note: 48, velocity: 92, length: 2 }
				]
			: [
					[57, 60, 64],
					[53, 57, 60],
					[48, 52, 55],
					[55, 59, 62]
				].flatMap((chord, i) =>
					chord.map((note) => ({ step: i * 4 + 1, note, velocity: 90, length: 3 }))
				);
	return new PacedTurn('claude-opus-5-5')
		.wait(600)
		.start({ input: 60, cacheRead: 131_000 })
		.wait(400)
		.thinking(
			kind === 'bass'
				? 'A bassline in A minor under the beat.'
				: 'Am, F, C and G, a bar each beat.',
			{
				size: 4,
				every: jitter(100)
			}
		)
		.toolUse(
			`toolu_demo_${kind}_${n}`,
			'write_pattern',
			{ track: kind === 'bass' ? 3 : 4, pattern: 1, bars: 1, notes },
			{ size: 8, every: 60 }
		)
		.stop('tool_use');
}

function partAnswer(kind: 'bass' | 'chords'): PacedTurn {
	return new PacedTurn('claude-opus-5-5')
		.wait(400)
		.start({ input: 900, cacheRead: 131_200 })
		.wait(300)
		.text(
			kind === 'bass'
				? 'A bassline in A minor on T3: the root on the one, a push before the fifth, down to F for the second half. Click the notes in the card to move it around.'
				: 'Am, F, C and G on T4, a beat each. Click a chord’s name in the card to hear it.\n\nShould I voice them wider, or add a seventh?',
			{ size: 1, every: jitter(45) }
		)
		.stop('end_turn');
}

/** Asked for options: three basslines offered from the lab as takes, to hear and keep one. */
function takes(n: number): PacedTurn {
	const code = [
		'const takes = {',
		'  "walking": [[1, 45], [5, 48], [9, 52], [13, 50]],',
		'  "octave bounce": [[1, 45], [3, 57], [5, 45], [7, 57], [9, 41], [11, 53], [13, 43], [15, 55]],',
		'  "offbeat": [[3, 45], [7, 45], [11, 41], [15, 43]]',
		'};',
		'for (const [label, hits] of Object.entries(takes)) {',
		'  const f = lab.fork();',
		'  f.writePattern(3, { pattern: 1, bars: 1, notes: hits.map(([step, note]) => ({ step, note, velocity: 100, length: 2 })) });',
		'  lab.offer(f, label);',
		'}',
		'return Object.keys(takes);'
	].join('\n');
	return new PacedTurn('claude-opus-5-5')
		.wait(600)
		.start({ input: 60, cacheRead: 131_000 })
		.wait(400)
		.thinking(
			'Three basslines in A minor, each moving differently, for the user to hear against the beat.',
			{
				size: 5,
				every: jitter(100)
			}
		)
		.toolUse(
			`toolu_demo_takes_${n}`,
			'run_lab',
			{ purpose: 'three basslines', code },
			{ size: 12, every: 50 }
		)
		.stop('tool_use');
}

function takesAnswer(): PacedTurn {
	return new PacedTurn('claude-opus-5-5')
		.wait(400)
		.start({ input: 900, cacheRead: 131_200 })
		.wait(300)
		.text(
			'Three basslines for T3 wait under the run: **walking** climbs through the chord, **octave bounce** jumps between octaves, **offbeat** leaves the beats to the kick. Tap each to hear it with the loop, and keep the one you like.',
			{ size: 1, every: jitter(45) }
		)
		.stop('end_turn');
}
