/**
 * The episodes eval, the agent's north star (docs/AGENT-V2.md, "Evals"; decision D12): simulated
 * users with a goal and a persona (`user-sim.ts`) talk to the real conductor in the app's
 * environment and act on the replica with their own hands (`hands.ts`), following the agent's words
 * or its lit walkthrough (`walkthrough.ts`). Success is read from the replica's state and from who
 * changed what (`changes.ts`): never from what the user or the agent says.
 *
 * An episode (`cases/episodes.ts`) starts from its setup and the person's first message. The agent
 * answers; the person reads the answer, presses keys, looks and listens, then writes again or
 * stops; until they stop or their messages run out. Every run is saved whole to evals/agent/out/:
 * the chat with the person's actions in it, both sides' tool calls, every key press with the screen
 * it left and what it changed, the walkthroughs, the replica before and after. The transcript
 * viewer (`/?transcripts=1` under `vite dev`) lists the runs.
 *
 *   node evals/agent/episodes.mjs [--ids first-jam,pump] [--persona beginner] [--repeat 2]
 *        [--model claude-sonnet-5-5] [--user-model claude-sonnet-5 | gpt-6-sol] [--user-effort medium]
 *        [--concurrency 3] [--max-turns 4] [--budget 15] [--out file.json] [--no-ears] [--index]
 *
 * --persona (or --category) keeps the episodes whose level, temperament or learning style it
 * names; --budget stops starting episodes once the run has spent that many dollars.
 *
 * Real API calls with the owner's keys from $ANTHROPIC_API_KEY / $OPENAI_API_KEY or .env (never
 * printed).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { prepareAttachment, type PreparedAttachment } from '$lib/agent/attachments';
import { entryId, type ChatEntry } from '$lib/agent/chat';
import { createAnthropicClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import { createNodeLabHost } from '$lib/agent/lab/node';
import type { ListenHost } from '$lib/agent/listen-host';
import { loadManualSource, type ManualSource } from '$lib/agent/manual-source';
import { createMemoryStore } from '$lib/agent/memory';
import { createMemoryThreadStore, type ThreadStore } from '$lib/agent/threads';
import type { ScreenReader } from '$lib/agent/tools';
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import { createVirtualOpxy } from '$lib/app/virtual';
import { analyzeAudio, summarize, type ListenSummary } from '$lib/core/listen';
import { ReplicaState } from '$lib/replica';
import { buildFrame } from '$lib/sim/frames';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { describeFrame } from '$lib/sim/screen/render';
import type { SampleData } from '$lib/sound/samples';
import { EPISODES, type Episode, type EpisodeOutcome } from './cases/episodes';
import {
	describeChange,
	diffSummaries,
	summarizeReplica,
	type Change,
	type ReplicaSummary
} from './changes';
import { heardInWords, parseUserKeys, playUserKeys, userView, type UserKeys } from './hands';
import { anthropicKey, openaiKey } from './key';
import { evalAgentModes } from './modes';
import { attachResults, writeIndex, type TraceCall } from './saved';
import { openEars, type Ears } from './render';
import {
	SimulatedUser,
	userModel,
	type Persona,
	type UserEffort,
	type UserMessage,
	type UserModel,
	type UserTurn,
	type UserWorld
} from './user-sim';
import { EvalWalkthrough, type WalkthroughEvent } from './walkthrough';

// ─── results ────────────────────────────────────────────────────────────────────────────────────

/** Something the simulated user did, in order. */
export interface UserAction {
	/** The messages the user had sent when they did it (1 after the first). */
	readonly turn: number;
	readonly kind: 'look' | 'press' | 'listen' | 'say' | 'stop';
	/** Seconds into the episode. */
	readonly at: number;
	/** press: the keys as the grammar spells them (as written, when they did not parse). */
	readonly keys?: string;
	/** What they saw or heard after it (look, press, listen), or what they wrote (say, stop). */
	readonly text: string;
	/** press: what it changed on the replica. */
	readonly changes?: readonly string[];
	/** press: why nothing happened. */
	readonly error?: string;
	/** press: how far a walkthrough got with it ("1 of 3 steps done", "all done"). */
	readonly walkthrough?: readonly string[];
	/** stop: whether they left satisfied. */
	readonly satisfied?: boolean;
}

/** How an episode ended: the user stopped, their messages ran out, or something failed. */
export interface Verdict {
	readonly by: 'user' | 'turns' | 'error';
	readonly satisfied: boolean | null;
	readonly reason: string;
}

/** One message of the simulated user's own conversation, for reading back. */
export interface UserLine {
	readonly role: 'world' | 'person';
	readonly text: string;
	readonly calls?: readonly { readonly name: string; readonly input: unknown }[];
	readonly results?: readonly string[];
}

export interface EpisodeResult {
	readonly id: string;
	/** The persona's level (the transcript viewer lists runs by category). */
	readonly category: string;
	readonly run: number;
	readonly persona: Persona;
	readonly goal: string;
	readonly opening: string;
	/** Success on the replica, nothing forbidden done, no error. */
	readonly pass: boolean;
	/** The success checks passed. */
	readonly success: boolean;
	/** Everything that went wrong: failed checks, then forbidden things done, then an error. */
	readonly fails: readonly string[];
	/** What the agent did that it must not have. */
	readonly violations: readonly string[];
	readonly verdict: Verdict;
	/** Messages the user sent, the first included. */
	readonly turns: number;
	/** The agent's cost, model calls and the user's (the simulated user's model). */
	readonly usd: number;
	readonly calls: number;
	readonly userModel: string;
	readonly userUsd: number;
	readonly userCalls: number;
	readonly seconds: number;
	readonly error: string | null;
	/** The agent's tool calls with their results; `turn` is the user message they answered. */
	readonly trace: readonly TraceCall[];
	readonly actions: readonly UserAction[];
	/** What changed on the replica during each of the agent's turns. */
	readonly agentTurns: readonly { readonly turn: number; readonly changes: readonly string[] }[];
	readonly walkthroughs: readonly WalkthroughEvent[];
	/** The replica after the setup and at the end. */
	readonly start: ReplicaSummary;
	readonly end: ReplicaSummary;
	/** The simulated user's side: what the world showed them and the tools they used. */
	readonly user: readonly UserLine[];
	/** The chat as the app renders it, with the user's actions as notices (the transcript viewer). */
	readonly entries: readonly ChatEntry[];
	/** For the transcript viewer's header: the persona, the goal, the verdict and the costs. */
	readonly brief: readonly string[];
	/** The viewer reads these from every saved run; an episode has no lints or rubric. */
	readonly lints: readonly never[];
	readonly rubric: null;
	/** What the replica played at the end (4 s through the eval's ears), when it played. */
	readonly heard: { readonly text: string; readonly flags: readonly string[] } | null;
}

// ─── the environment ────────────────────────────────────────────────────────────────────────────

/** How long one agent turn may run before it is stopped. */
const TURN_LIMIT_MS = 300_000;
/** What one episode's agent may spend before the episode ends. */
const EPISODE_BUDGET_USD = 2;

interface Options {
	readonly model: string;
	readonly apiKey: string;
	readonly manual: ManualSource;
	readonly ears: Ears | null;
	readonly user: UserModel;
	readonly maxTurns: number | null;
}

interface Env {
	readonly sim: OpxySim;
	readonly replica: ReplicaState;
	readonly virtual: VirtualOpxy;
	readonly walkthrough: EvalWalkthrough;
	readonly conductor: Conductor;
	readonly store: ThreadStore;
	readonly listen: ListenHost | null;
	/** What the person sees now. */
	view(): string;
	/** The replica's music now. */
	summary(): ReplicaSummary;
	/** Stops the simulator's clock. */
	close(): void;
}

/** How often the eval runs the simulator's clock (the app runs it every animation frame). */
const FRAME_MS = 16;
/** How long the user listens at a time (a few seconds, as a person checks a change). */
const USER_LISTEN_SECONDS = 5;

/** The replica's screen for read_screen, as the app reads it (quality.ts reads it the same way). */
function screenReader(sim: OpxySim): ScreenReader {
	return {
		read() {
			const s = sim.state;
			const frame = buildFrame(s);
			return {
				page: frame.page,
				shows: describeFrame(frame),
				mode: s.mode,
				overlay: s.overlay,
				modulePage: s.overlay === null && s.mode !== 'arrange' ? s.pages[s.mode] : null,
				track: s.track + 1,
				engine: s.tracks[s.track].engine,
				shift: s.shift,
				bpm: s.tempo.bpm,
				playing: s.transport.playing
			};
		}
	};
}

/**
 * The app's wiring around one episode: a simulator set up as the episode says, its clock running as
 * the app runs it, a replica whose every event (the agent's animations and the user's presses)
 * reaches it, the virtual OP-XY, the app's walkthrough, the eval's ears, and the real conductor on
 * them.
 */
async function environment(e: Episode, opts: Options): Promise<Env> {
	const sim = new OpxySim();
	const files = new Map<string, SampleData>();
	const virtual = createVirtualOpxy({
		sim,
		sound: {
			available: true,
			enabled: true,
			preview: () => true,
			samples: { setFile: (id, audio) => void files.set(id, audio) }
		}
	});
	e.setup?.({ sim, virtual });
	// the app moves the simulator on every frame (AppSimulator): without it a playing transport
	// never moves, a song never leaves its first scene, and every listen hears the same bar
	let last = performance.now();
	const clock = setInterval(() => {
		const now = performance.now();
		sim.advance(now - last);
		last = now;
	}, FRAME_MS);
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	const walkthrough = new EvalWalkthrough({
		replica,
		read: () => describeFrame(buildFrame(sim.state))
	});
	const store = createMemoryThreadStore();
	const listen = opts.ears?.host(sim, files) ?? null;
	// the app's agent: the lab on the replica (heard through the same ears) and a memory
	const lab = createNodeLabHost({ sim, render: opts.ears?.renderer(files) ?? null });
	const conductor = await Conductor.create({
		...evalAgentModes(),
		client: createAnthropicClient({ apiKey: opts.apiKey }),
		device: null,
		replica,
		screen: screenReader(sim),
		virtual,
		guide: walkthrough,
		presets: { put: () => {}, href: '/presets' },
		projects: {
			usb: true,
			async saveToDevice(name) {
				return { path: `projects/user/${name}.xy`, skipped: [] };
			}
		},
		listen,
		lab,
		memory: createMemoryStore(),
		manual: opts.manual,
		store,
		autoApprove: true,
		confirmWindowMs: 0,
		model: opts.model
	});
	return {
		sim,
		replica,
		virtual,
		walkthrough,
		conductor,
		store,
		listen,
		view: () => userView({ sim, replica, card: walkthrough.card() }),
		summary: () => summarizeReplica(sim, virtual),
		close: () => clearInterval(clock)
	};
}

/** Waits until an animation the agent started on the replica has played out (as a user waits). */
async function animationsDone(replica: ReplicaState, limitMs = 20_000): Promise<void> {
	const until = performance.now() + limitMs;
	while (replica.animating && performance.now() < until) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * What the replica plays for `seconds`, from where its playhead stands (the app's listening summary),
 * or null when it is stopped; a string when the ears failed.
 */
async function hear(env: Env, seconds: number): Promise<ListenSummary | string | null> {
	if (!env.listen || !env.sim.state.transport.playing) return null;
	try {
		const recording = await env.listen.record('replica', seconds, new AbortController().signal);
		const analysis = analyzeAudio(recording.channels, recording.sampleRate, {
			expectedBpm: env.sim.state.tempo.bpm
		});
		return summarize(analysis, { source: 'the replica' });
	} catch (error) {
		return `could not listen: ${error instanceof Error ? error.message : error}`;
	}
}

// ─── one episode ────────────────────────────────────────────────────────────────────────────────

/** Whether a combo plays the keyboard on an instrument track that sounds (not muted). */
function playsKeys(keys: UserKeys, sim: OpxySim): boolean {
	const s = sim.state;
	const played = keys.sequence.chords.some((chord) =>
		chord.terms.some((t) => t.target.kind === 'control' && t.target.id.startsWith('keyboard.'))
	);
	return played && s.mode === 'instrument' && !s.tracks[s.track].mix.muted;
}

/** A user action as a line of the saved chat. */
function actionLine(a: UserAction): string {
	const screen = a.text.split('\n')[0]?.replace(/^screen: /, '') ?? '';
	switch (a.kind) {
		case 'look':
			return `user looked: ${screen}`;
		case 'press': {
			if (a.error) return `user pressed ${a.keys}: nothing happened (${a.error})`;
			const changed = a.changes?.length ? ` · changed ${a.changes.join(', ')}` : '';
			const walked = a.walkthrough?.length ? ` · walkthrough ${a.walkthrough.join(', ')}` : '';
			return `user pressed ${a.keys} → ${screen}${changed}${walked}`;
		}
		case 'listen':
			return `user listened: ${a.text}`;
		case 'say':
			return `user wrote, with no turn left to send it: ${a.text}`;
		case 'stop':
			return `user left, ${a.satisfied ? 'satisfied' : 'not satisfied'}: ${a.text}`;
	}
}

/** The simulated user's conversation, compact: its thinking and the replayed content left out. */
function userLines(messages: readonly UserMessage[]): UserLine[] {
	return messages.map((m) =>
		m.role === 'user'
			? {
					role: 'world',
					text: m.text ?? '',
					...(m.results.length > 0 ? { results: m.results.map((r) => r.content) } : {})
				}
			: {
					role: 'person',
					text: m.text,
					...(m.calls.length > 0
						? { calls: m.calls.map((c) => ({ name: c.name, input: c.input })) }
						: {})
				}
	);
}

async function runEpisode(e: Episode, run: number, opts: Options): Promise<EpisodeResult> {
	const began = performance.now();
	const env = await environment(e, opts);
	try {
		return await play(e, run, opts, env, began);
	} finally {
		// a clock left running would keep the eval from ever exiting
		env.walkthrough.stop();
		env.conductor.dispose();
		env.close();
	}
}

/** The episode itself: the person's first message, then the agent's and the person's turns. */
async function play(
	e: Episode,
	run: number,
	opts: Options,
	env: Env,
	began: number
): Promise<EpisodeResult> {
	const at = () => Math.round((performance.now() - began) / 100) / 10;
	const { conductor, replica, walkthrough } = env;
	const maxTurns = Math.min(e.maxTurns, opts.maxTurns ?? e.maxTurns);

	// the agent's calls, as the chat saw them
	const trace: TraceCall[] = [];
	const open = new Map<string, number>();
	let turn = 0;
	conductor.on((event) => {
		if (event.type === 'tool_start') {
			open.set(event.id, trace.length);
			trace.push({
				id: event.id,
				turn,
				name: event.name,
				input: event.input,
				status: 'running',
				summary: '',
				nested: event.parent !== null
			});
		}
		if (event.type === 'tool_end') {
			const i = open.get(event.id);
			if (i !== undefined) trace[i] = { ...trace[i], status: event.status, summary: event.summary };
		}
	});

	// the user's actions, each at its place in the chat
	const actions: UserAction[] = [];
	const inserts: { at: number; entry: ChatEntry }[] = [];
	const byUser: Change[] = [];
	const byAgent: Change[] = [];
	const agentTurns: { turn: number; changes: string[] }[] = [];
	const note = (action: UserAction, shown = true) => {
		actions.push(action);
		if (!shown) return;
		inserts.push({
			at: conductor.entries.length,
			entry: {
				kind: 'notice',
				id: entryId('user'),
				tone: 'info',
				text: actionLine(action),
				code: null
			}
		});
	};
	const world: UserWorld = {
		look() {
			const view = env.view();
			note({ turn, kind: 'look', at: at(), text: view });
			return view;
		},
		async press(keys) {
			const parsed = parseUserKeys(keys);
			if (!parsed.ok) {
				note({ turn, kind: 'press', at: at(), keys, text: env.view(), error: parsed.error });
				return `Nothing happened: ${parsed.error}.\n${env.view()}`;
			}
			const screen = describeFrame(buildFrame(env.sim.state));
			const before = env.summary();
			// what the person sees while holding a key, and not only once they let go
			let held: string | null = null;
			await playUserKeys(replica, parsed.value, { whileHeld: () => (held ??= env.view()) });
			const changes = diffSummaries(before, env.summary());
			byUser.push(...changes);
			const walked = walkthrough
				.update()
				.map((w) => (w.kind === 'done' ? 'all done' : `${w.index} of ${w.steps} steps done`));
			const view = env.view();
			note({
				turn,
				kind: 'press',
				at: at(),
				keys: parsed.value.text,
				text: view,
				...(changes.length > 0 ? { changes: changes.map(describeChange) } : {}),
				...(walked.length > 0 ? { walkthrough: walked } : {})
			});
			const same = describeFrame(buildFrame(env.sim.state)) === screen;
			const notes = [
				parsed.value.uncounted > 0 ? 'A turn without a count went one click.' : '',
				same ? 'The screen did not change.' : '',
				// in the app a key sounds as it is played; the ears only render what the sequencer plays
				playsKeys(parsed.value, env.sim) ? 'You hear the notes you play.' : ''
			].filter(Boolean);
			const during = held ? [`While you held it:\n${held}`, 'After you let go:'] : [];
			return [...notes, ...during, view].join('\n');
		},
		listen: env.listen
			? async () => {
					// what a person hears, not the analyser's readout the agent gets
					const heard = await hear(env, USER_LISTEN_SECONDS);
					const text =
						heard === null
							? 'Nothing is playing: the replica is stopped.'
							: typeof heard === 'string'
								? 'You cannot hear anything right now.'
								: heardInWords(heard);
					note({ turn, kind: 'listen', at: at(), text });
					return text;
				}
			: null
	};
	const user = new SimulatedUser({
		persona: e.persona,
		goal: e.goal,
		wants: e.wants,
		model: opts.user,
		world
	});

	const file = e.attach?.();
	const attached: PreparedAttachment[] = file
		? [await prepareAttachment(new File([new Uint8Array(file.bytes)], file.name), file.name)]
		: [];
	const start = env.summary();
	let message = e.opening;
	let verdict: Verdict = { by: 'turns', satisfied: null, reason: 'the messages ran out' };
	let error: string | null = null;
	for (;;) {
		turn++;
		// the agent's turn: every change made while it runs is the agent's
		const before = env.summary();
		const from = conductor.entries.length;
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			conductor.stop();
		}, TURN_LIMIT_MS);
		try {
			await conductor.send(message, turn === 1 ? attached : []);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			clearTimeout(timer);
		}
		await animationsDone(replica);
		walkthrough.update();
		const changes = diffSummaries(before, env.summary());
		byAgent.push(...changes);
		agentTurns.push({ turn, changes: changes.map(describeChange) });
		error ??= timedOut
			? `the agent's turn ran past ${TURN_LIMIT_MS / 1000} s`
			: conductor.lastError
				? `${conductor.lastError.code}: ${conductor.lastError.message}`
				: null;
		if (error) {
			verdict = { by: 'error', satisfied: null, reason: error };
			break;
		}
		const fresh = conductor.entries.slice(from);
		const reply = fresh
			.flatMap((x) => (x.kind === 'text' && x.parent === null ? [x.text] : []))
			.join('\n\n');
		const activity = fresh.flatMap((x) =>
			x.kind === 'tool' && x.parent === null
				? [`${x.label}${x.summary ? `: ${x.summary}` : ''}`]
				: []
		);
		// the user's turn
		const last = turn >= maxTurns;
		let next: UserTurn;
		try {
			next = await user.turn({
				reply,
				activity,
				...(turn === 1 ? { opened: { text: e.opening, file: file?.name } } : {}),
				last
			});
		} catch (err) {
			error = `the simulated user failed: ${err instanceof Error ? err.message : String(err)}`;
			verdict = { by: 'error', satisfied: null, reason: error };
			break;
		}
		if (next.kind === 'stop') {
			note({ turn, kind: 'stop', at: at(), text: next.reason, satisfied: next.satisfied });
			verdict = { by: 'user', satisfied: next.satisfied, reason: next.reason };
			break;
		}
		if (last) {
			note({ turn, kind: 'say', at: at(), text: next.text });
			break;
		}
		// the message itself shows as the user's next chat entry
		note({ turn, kind: 'say', at: at(), text: next.text }, false);
		message = next.text;
		if (conductor.usage.usd > EPISODE_BUDGET_USD) {
			error = `the agent spent more than $${EPISODE_BUDGET_USD} on this episode`;
			verdict = { by: 'error', satisfied: null, reason: error };
			break;
		}
	}
	const seconds = (performance.now() - began) / 1000;
	await attachResults(env.store, trace);
	const end = env.summary();
	const outcome: EpisodeOutcome = {
		state: env.sim.state,
		virtual: env.virtual,
		start,
		end,
		byUser,
		byAgent,
		trace: trace.filter((t) => !t.nested),
		satisfied: verdict.by === 'user' ? verdict.satisfied : null,
		turns: turn
	};
	const failed = e.success(outcome);
	const violations = e.forbidden?.(outcome) ?? [];
	// what the replica plays at the end, the analyser's readout (for the reader, not the user)
	const played = await hear(env, 4);
	const heard =
		played === null
			? null
			: typeof played === 'string'
				? { text: played, flags: [] }
				: { text: played.text, flags: [...played.flags] };
	const entries = merge(JSON.parse(JSON.stringify(conductor.entries)) as ChatEntry[], inserts);
	const pass = failed.length === 0 && violations.length === 0 && !error;
	const { persona } = e;
	const said =
		verdict.by === 'user'
			? `the user left ${verdict.satisfied ? 'satisfied' : 'unsatisfied'} ("${verdict.reason}")`
			: verdict.by === 'turns'
				? 'the user ran out of messages'
				: `failed: ${verdict.reason}`;
	const result: EpisodeResult = {
		id: e.id,
		category: persona.level,
		run,
		persona,
		goal: e.goal,
		opening: e.opening,
		pass,
		success: failed.length === 0,
		fails: [...failed, ...violations.map((v) => `forbidden: ${v}`), ...(error ? [error] : [])],
		violations,
		verdict,
		turns: turn,
		usd: conductor.usage.usd,
		calls: conductor.usage.calls,
		userModel: opts.user.id,
		userUsd: user.usd,
		userCalls: user.calls,
		seconds,
		error,
		trace,
		actions,
		agentTurns,
		walkthroughs: [...walkthrough.log],
		start,
		end,
		user: userLines(user.messages),
		entries,
		brief: [
			`${persona.level} · ${persona.temperament} · ${persona.style}: ${e.goal}`,
			`${said}; ${turn} message${turn === 1 ? '' : 's'}; the user (${opts.user.id}) $${user.usd.toFixed(3)}${user.unknownCost ? '+?' : ''}`
		],
		lints: [],
		rubric: null,
		heard
	};
	return result;
}

/** The conductor's entries with the user's actions put where they happened. */
function merge(
	entries: ChatEntry[],
	inserts: readonly { at: number; entry: ChatEntry }[]
): ChatEntry[] {
	const out: ChatEntry[] = [];
	for (let i = 0; i <= entries.length; i++) {
		for (const insert of inserts) if (insert.at === i) out.push(insert.entry);
		if (i < entries.length) out.push(entries[i]);
	}
	return out;
}

// ─── the scorecard ──────────────────────────────────────────────────────────────────────────────

const mean = (xs: readonly number[]) =>
	xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** Pass counts by a persona trait ("beginner 3/5 · intermediate 4/5"). */
function byTrait(results: readonly EpisodeResult[], trait: keyof Persona): string {
	const values = [...new Set(results.map((r) => String(r.persona[trait])))];
	return values
		.map((v) => {
			const rs = results.filter((r) => String(r.persona[trait]) === v);
			return `${v} ${rs.filter((r) => r.pass).length}/${rs.length}`;
		})
		.join(' · ');
}

function scorecard(results: readonly EpisodeResult[], model: string, userId: string): string {
	const lines: string[] = [];
	lines.push(`episodes eval — agent ${model}, simulated user ${userId}, ${results.length} runs`);
	lines.push('');
	lines.push(
		`${'episode'.padEnd(18)}${'persona'.padEnd(40)}result  msgs   agent $   user $     s  verdict`
	);
	for (const r of results) {
		const p = `${r.persona.level} · ${r.persona.temperament} · ${r.persona.style}`;
		const verdict =
			r.verdict.by === 'user'
				? r.verdict.satisfied
					? 'satisfied'
					: 'gave up'
				: r.verdict.by === 'turns'
					? 'out of turns'
					: 'error';
		lines.push(
			`${`${r.id}${r.run ? `#${r.run + 1}` : ''}`.padEnd(18)}${p.padEnd(40)}${(r.pass ? 'PASS' : 'FAIL').padEnd(8)}${String(r.turns).padStart(4)}  ${r.usd.toFixed(3).padStart(8)} ${r.userUsd.toFixed(3).padStart(8)} ${r.seconds.toFixed(0).padStart(5)}  ${verdict}`
		);
		for (const f of r.fails) lines.push(`     ✗ ${f}`);
		const calls = r.trace
			.filter((t) => !t.nested)
			.map((t) => t.name)
			.join(' → ');
		if (calls) lines.push(`     · agent: ${calls}`);
		const presses = r.actions.filter((a) => a.kind === 'press');
		if (presses.length > 0) {
			lines.push(
				`     · user: ${presses.map((a) => `${a.keys}${a.error ? ' ✗' : ''}`).join(' | ')}`
			);
		}
	}
	const agree = results.filter(
		(r) => r.verdict.by === 'user' && r.verdict.satisfied === r.success
	).length;
	const stopped = results.filter((r) => r.verdict.by === 'user').length;
	lines.push('');
	lines.push(`by level: ${byTrait(results, 'level')}`);
	lines.push(`by temperament: ${byTrait(results, 'temperament')}`);
	lines.push(`by learning style: ${byTrait(results, 'style')}`);
	lines.push(
		`the user's word agreed with the replica in ${agree} of the ${stopped} episodes they ended themselves`
	);
	const agent = results.reduce((n, r) => n + r.usd, 0);
	const user = results.reduce((n, r) => n + r.userUsd, 0);
	lines.push(
		`passed ${results.filter((r) => r.pass).length}/${results.length}; agent $${agent.toFixed(2)}, user $${user.toFixed(2)}; mean ${mean(results.map((r) => r.seconds)).toFixed(0)} s, ${mean(results.map((r) => r.turns)).toFixed(1)} messages`
	);
	return lines.join('\n');
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────────

async function pool<T, R>(
	items: readonly T[],
	n: number,
	work: (item: T) => Promise<R | null>
): Promise<R[]> {
	const out: (R | null)[] = new Array(items.length).fill(null);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await work(items[i]);
			}
		})
	);
	return out.filter((r): r is R => r !== null);
}

export async function main(argv: readonly string[]): Promise<void> {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	if (argv.includes('--index')) {
		// only the viewer's list of saved runs, no API calls
		writeIndex('evals/agent/out');
		return;
	}
	const model = flag('--model') ?? 'claude-sonnet-5-5';
	const userId = flag('--user-model') ?? 'claude-sonnet-5';
	const effort = (flag('--user-effort') ?? 'medium') as UserEffort;
	const ids = flag('--ids')?.split(',');
	const trait = flag('--persona') ?? flag('--category');
	const repeat = Math.max(1, Number(flag('--repeat') ?? 1));
	const concurrency = Math.max(1, Number(flag('--concurrency') ?? 3));
	const maxTurns = flag('--max-turns') ? Math.max(1, Number(flag('--max-turns'))) : null;
	const budget = Number(flag('--budget') ?? 15);
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const out = flag('--out') ?? join('evals/agent/out', `episodes-${stamp}.json`);
	for (const id of ids ?? []) {
		if (!EPISODES.some((e) => e.id === id)) console.warn(`no episode "${id}"`);
	}
	const episodes = EPISODES.filter(
		(e) =>
			(!ids || ids.includes(e.id)) &&
			(!trait || [e.persona.level, e.persona.temperament, e.persona.style].includes(trait as never))
	);
	const jobs = episodes.flatMap((e) => Array.from({ length: repeat }, (_, run) => ({ e, run })));
	const apiKey = anthropicKey();
	const user = userModel({ model: userId, effort, anthropicKey, openaiKey });
	const manual = await loadManualSource({ dev: false });
	// the replica's sound, for listening (episodes.mjs serves the page); without it nobody hears
	const earsUrl = argv.includes('--no-ears') ? undefined : process.env.EVAL_EARS_URL;
	const ears = earsUrl ? await openEars(earsUrl) : null;
	console.log(
		`${jobs.length} runs of ${episodes.length} episodes, agent ${model}, simulated user ${userId}${ears ? '' : ', no ears'}`
	);
	const opts: Options = { model, apiKey, manual, ears, user, maxTurns };
	let spent = 0;
	const work = async ({ e, run }: { e: Episode; run: number }) => {
		if (spent >= budget) {
			console.log(
				`skip ${e.id}${repeat > 1 ? `#${run + 1}` : ''}: the run has spent $${spent.toFixed(2)}`
			);
			return null;
		}
		const r = await runEpisode(e, run, opts);
		spent += r.usd + r.userUsd;
		console.log(
			`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${repeat > 1 ? `#${r.run + 1}` : ''}  ${r.turns} msgs  ${r.seconds.toFixed(0)} s  agent $${r.usd.toFixed(3)}  user $${r.userUsd.toFixed(3)}${r.fails.length ? `  ✗ ${r.fails.join('; ')}` : ''}`
		);
		return r;
	};
	let results: EpisodeResult[];
	try {
		// the first run alone writes the agent's cached prompt (tools, role, manual); the rest read it
		const first = jobs.length > 1 && concurrency > 1 ? jobs.slice(0, 1) : [];
		results = [
			...(await pool(first, 1, work)),
			...(await pool(jobs.slice(first.length), concurrency, work))
		];
	} finally {
		await ears?.close();
	}
	const card = scorecard(results, model, userId);
	console.log('\n' + card);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(
		out,
		JSON.stringify({ kind: 'episodes', model, user: userId, stamp, results }, null, 1)
	);
	writeFileSync(out.replace(/\.json$/, '.txt'), card + '\n');
	writeIndex(dirname(out));
	console.log(`\nsaved ${out}`);
}
