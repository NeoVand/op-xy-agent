/**
 * The quality eval: realistic requests — hard manual questions, showing things on the replica,
 * composing and playing, a made kit played on the replica, follow-ups, and requests the agent must
 * turn down — run through the real conductor in the app's environment (a replica driving the
 * simulator, the virtual OP-XY, the screen, walkthroughs, the preset maker, our manual). Each case
 * is scored three ways:
 *
 * - its own checks: what it left on the virtual OP-XY, or the facts a correct answer states;
 * - lints on every answer and tool call: tool errors, repeated calls, tool names or research words
 *   in the answer, key combos that do not parse, citations of units that do not exist, preambles,
 *   tables, length;
 * - a rubric from a judge model (correct, helpful, clear, concise, tone, tools; 1–5 each).
 *
 * Every run is saved whole (the chat entries the app would render, the tool trace, the scores) so a
 * transcript can be read, diffed against another run, or replayed in the chat UI.
 *
 *   node evals/agent/quality.mjs [--model claude-sonnet-5-5] [--judge claude-opus-5-5] [--index: only list the saved runs]
 *        [--ids a,b] [--category compose] [--repeat 2] [--concurrency 3] [--out file.json]
 *
 * Real API calls with the owner's key from $ANTHROPIC_API_KEY or .env (never printed).
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { prepareAttachment, type PreparedAttachment } from '$lib/agent/attachments';
import { createAnthropicClient } from '$lib/agent/client';
import { createNodeLabHost } from '$lib/agent/lab/node';
import type { ChatEntry } from '$lib/agent/chat';
import { Conductor } from '$lib/agent/conductor.svelte';
import { loadManualSource, type ManualSource } from '$lib/agent/manual-source';
import { createMemoryThreadStore, type ThreadStore } from '$lib/agent/threads';
import { CONDUCTOR_TOOLS, type ScreenReader } from '$lib/agent/tools';
import { createVirtualOpxy } from '$lib/app/virtual';
import { ReplicaState } from '$lib/replica';
import { parseCombo } from '$lib/replica/glyphs/art';
import { targetIds, tryParseKeys, type KeySequence } from '$lib/core/opxy';
import { buildFrame } from '$lib/sim/frames';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { describeFrame } from '$lib/sim/screen/render';
import type { SampleData } from '$lib/sound/samples';
import { analyzeAudio, summarize } from '$lib/core/listen';
import type { ListenHost } from '$lib/agent/listen-host';
import { QUALITY_CASES, type Draft, type Outcome, type QualityCase } from './cases/quality';
import { judgeAnswer, type Judgement } from './judge';
import { anthropicKey } from './key';
import { openEars, type Ears } from './render';

// ─── results ────────────────────────────────────────────────────────────────────────────────────

/** One tool call as the chat saw it. */
export interface TraceCall {
	readonly id: string;
	readonly turn: number;
	readonly name: string;
	readonly input: unknown;
	readonly status: string;
	readonly summary: string;
	/** What the tool gave the model back (from the saved thread), when it could be read. */
	readonly result?: string;
	/** A subagent's call (the manual expert's reads), not the conductor's. */
	readonly nested: boolean;
}

/** A problem with an answer or a call, found by rule. */
export interface Lint {
	readonly code: string;
	readonly severity: 'error' | 'warn';
	readonly detail: string;
}

const Score = z.object({
	score: z.int().min(1).max(5),
	why: z.string().describe('One short sentence')
});

const Rubric = z.object({
	correct: Score.describe(
		'Everything it states or claims to have done is right: against the manual, the required facts if given, and the tool results'
	),
	helpful: Score.describe(
		'It does or answers what the user asked, completely, and leaves them able to act (the keys, the next step)'
	),
	clear: Score.describe(
		'The answer comes first; the order is the order of doing; easy to scan at the instrument'
	),
	concise: Score.describe('No filler, repetition, padding or detail that does not help'),
	tone: Score.describe(
		'Sounds like a knowledgeable fellow musician: direct, warm, confident; not robotic, not salesy, no internal jargon'
	),
	tools: Score.describe(
		'The right tools, no needless or repeated calls, results used correctly, and what the answer says happened matches the trace'
	),
	issues: z
		.array(z.string())
		.describe(
			'Concrete problems a picky product owner would fix, most important first; empty if none'
		)
});
type RubricScores = z.infer<typeof Rubric>;

const AXES = ['correct', 'helpful', 'clear', 'concise', 'tone', 'tools'] as const;

interface RubricResult {
	readonly scores: RubricScores | null;
	readonly model: string;
	readonly usd: number;
	readonly error: string | null;
}

export interface CaseResult {
	readonly id: string;
	readonly category: string;
	readonly run: number;
	readonly turns: readonly string[];
	/** The agent's answer to each turn. */
	readonly answers: readonly string[];
	readonly trace: readonly TraceCall[];
	/** The chat as the app renders it, for the transcript viewer. */
	readonly entries: readonly ChatEntry[];
	readonly fails: readonly string[];
	readonly facts: Judgement | null;
	readonly lints: readonly Lint[];
	readonly rubric: RubricResult | null;
	readonly pass: boolean;
	readonly usd: number;
	readonly judgeUsd: number;
	readonly seconds: number;
	readonly calls: number;
	readonly error: string | null;
	/** What the replica played when the agent was done (4 s through the eval's ears), if playing. */
	readonly heard: { readonly text: string; readonly flags: readonly string[] } | null;
}

// ─── the environment ────────────────────────────────────────────────────────────────────────────

interface Env {
	readonly sim: OpxySim;
	readonly replica: ReplicaState;
	readonly conductor: Conductor;
	readonly store: ThreadStore;
	/** The eval's ears on this environment's replica, when the eval has them. */
	readonly listen: ListenHost | null;
	readonly outcome: () => Omit<Outcome, 'answers' | 'trace'>;
}

async function environment(
	c: QualityCase,
	model: string,
	apiKey: string,
	manual: ManualSource,
	ears: Ears | null
): Promise<Env> {
	const sim = new OpxySim();
	c.setup?.(sim);
	// the app's wiring: every replica event, the agent's animations included, reaches the simulator
	const replica = new ReplicaState();
	replica.observe((event) => sim.input(event));
	// the browser's sound, as far as the agent can tell: on, every preview written down, and a made
	// kit's audio taken in (as AppSound's sample store does), for the ears to play
	const heard: { track: number; note: number; velocity: number; seconds: number }[] = [];
	const files = new Map<string, SampleData>();
	const virtual = createVirtualOpxy({
		sim,
		sound: {
			available: true,
			enabled: true,
			preview(track, note, velocity, seconds) {
				heard.push({ track: track + 1, note, velocity, seconds });
				return true;
			},
			samples: { setFile: (id, audio) => void files.set(id, audio) }
		}
	});
	const screen: ScreenReader = {
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
	const guided: string[] = [];
	const drafts: Draft[] = [];
	// the OP-XY over USB, as far as send_project can tell: it takes every project it is sent
	const sent: string[] = [];
	const store = createMemoryThreadStore();
	const listen = ears?.host(sim, files) ?? null;
	// the lab runs the agent's programs in this process, and hears its forks through the ears
	const lab = createNodeLabHost({ sim, render: ears?.renderer(files) ?? null });
	const conductor = await Conductor.create({
		client: createAnthropicClient({ apiKey }),
		device: null,
		replica,
		screen,
		virtual,
		guide: { start: (goal) => void guided.push(goal), stop: () => {} },
		presets: { put: (draft) => drafts.push(draft), href: '/presets' },
		projects: {
			usb: true,
			async saveToDevice(name) {
				sent.push(name);
				return { path: `projects/user/${name}.xy`, skipped: [] };
			}
		},
		listen,
		lab,
		manual,
		store,
		autoApprove: true,
		confirmWindowMs: 0,
		model
	});
	return {
		sim,
		replica,
		conductor,
		store,
		listen,
		outcome: () => ({ state: sim.state, sim, virtual, guided, drafts, heard, sent })
	};
}

// ─── lints ──────────────────────────────────────────────────────────────────────────────────────

const ALL_TOOL_NAMES = CONDUCTOR_TOOLS.map((t) => t.name);
/** Tool names a user never needs to read (plain words such as "transport" or "listen" are fine). */
const TOOL_NAMES = ALL_TOOL_NAMES.filter((name) => name.includes('_'));

/** Words from our research notes and code that a user should never read. */
const JARGON: readonly [RegExp, string][] = [
	[/\bowner'?s (unit|device|op-xy)\b|\bthe owner\b/i, 'the owner'],
	[/\bq15\b|\blanes?\b(?!\s*cc)/i, 'lane / q15'],
	[/\bsimulator\b/i, 'simulator'],
	[/\bvirtual op-?xy\b/i, 'virtual OP-XY'],
	[/\btool (call|result)s?\b|\bfunction call\b|\bI called\b/i, 'tool talk'],
	[/\bresearch (?:note )?\d{2}\b|\bnote \d{2} §|docs\/research/i, 'research note']
];

const PREAMBLE =
	/^(great|good|nice) (question|idea)|^(sure|certainly|absolutely|of course)\b|^i'?d be (happy|glad)|^happy to\b|^okay[,!]|^alright[,!]/i;

const LENGTH: Record<string, number> = {
	demo: 1500,
	docs: 1800,
	show: 1300,
	compose: 1500,
	kit: 1500,
	multi: 1600,
	edge: 900
};

/** Backticked text that looks like a key combo but is not one the chat can draw. */
function badCombos(text: string): string[] {
	const bad: string[] = [];
	for (const [, code] of text.matchAll(/`([^`\n]+)`/g)) {
		const looksLikeKeys =
			/(\s\+\s|→|->)/.test(code) ||
			/^(turn|click|hold)\s/i.test(code) ||
			/^(M[1-4]|T[1-8]|E[1-4]|step \d+|shift|record|play|stop)$/i.test(code.trim());
		if (looksLikeKeys && parseCombo(code) === null) bad.push(code);
	}
	return bad;
}

const CITATION = /\[([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:#[a-z0-9-]+)?\](?!\()/g;

function lint(
	c: QualityCase,
	answers: readonly string[],
	trace: readonly TraceCall[],
	units: ReadonlySet<string>,
	agentError: string | null
): Lint[] {
	const out: Lint[] = [];
	if (agentError) out.push({ code: 'agent-error', severity: 'error', detail: agentError });
	trace.forEach((call, i) => {
		if (call.nested || call.status !== 'error') return;
		const unavailable = /not available|unavailable|no audio|headless|no listening/i.test(
			`${call.summary} ${call.result ?? ''}`
		);
		// a lab program that failed and was then fixed in the same turn: the loop the lab is for
		const fixed =
			call.name === 'run_lab' &&
			trace
				.slice(i + 1)
				.some(
					(c) => !c.nested && c.turn === call.turn && c.name === 'run_lab' && c.status === 'ok'
				);
		out.push({
			code: unavailable ? 'tool-unavailable' : fixed ? 'lab-retry' : 'tool-error',
			severity: unavailable || fixed ? 'warn' : 'error',
			detail: `${call.name}: ${call.summary}`
		});
	});
	const seen = new Set<string>();
	for (const call of trace) {
		if (call.nested) continue;
		const key = `${call.turn}|${call.name}|${JSON.stringify(call.input)}`;
		if (seen.has(key))
			out.push({
				code: 'repeat-call',
				severity: 'warn',
				detail: `${call.name} twice with the same input`
			});
		seen.add(key);
	}
	answers.forEach((answer, turn) => {
		const where = answers.length > 1 ? ` (turn ${turn + 1})` : '';
		if (!answer.trim()) out.push({ code: 'empty', severity: 'error', detail: `no answer${where}` });
		for (const name of TOOL_NAMES) {
			if (new RegExp(`\\b${name}\\b`).test(answer))
				out.push({ code: 'tool-name', severity: 'error', detail: `says "${name}"${where}` });
		}
		// a plain-word tool name set in code, the way a tool is named ("`listen`")
		for (const name of ALL_TOOL_NAMES) {
			if (!name.includes('_') && answer.includes(`\`${name}\``))
				out.push({
					code: 'tool-name',
					severity: 'error',
					detail: `names the tool \`${name}\`${where}`
				});
		}
		for (const [pattern, label] of JARGON) {
			const m = pattern.exec(answer);
			if (m) out.push({ code: 'jargon', severity: 'warn', detail: `${label}: "${m[0]}"${where}` });
		}
		for (const code of badCombos(answer))
			out.push({ code: 'bad-combo', severity: 'warn', detail: `\`${code}\`${where}` });
		for (const m of answer.matchAll(CITATION)) {
			if (!units.has(m[1]))
				out.push({ code: 'bad-citation', severity: 'error', detail: `[${m[1]}]${where}` });
		}
		if (/^\s*\|.*\|\s*$/m.test(answer) && /^\s*\|?\s*:?-{3,}/m.test(answer))
			out.push({ code: 'table', severity: 'warn', detail: `a table${where}` });
		if (PREAMBLE.test(answer.trim()))
			out.push({ code: 'preamble', severity: 'warn', detail: answer.trim().slice(0, 40) });
		const limit = LENGTH[c.category] ?? 1600;
		if (answer.length > limit)
			out.push({
				code: 'long',
				severity: 'warn',
				detail: `${answer.length} characters${where} (limit ${limit})`
			});
		if (/\{\s*"[a-z_]+"\s*:/.test(answer))
			out.push({ code: 'json', severity: 'error', detail: `raw JSON in the answer${where}` });
	});
	if (c.keys?.length) {
		const found = combosIn(answers.at(-1) ?? '');
		const missing = c.keys.filter((k) => {
			const want = tryParseKeys(k);
			return !want.ok || !found.some((got) => comboMatches(want.value, got));
		});
		if (missing.length > c.keys.length / 2)
			out.push({
				code: 'missing-keys',
				severity: 'warn',
				detail: missing.map((k) => `\`${k}\``).join(', ')
			});
	}
	if (c.category === 'docs' && !c.noCitation) {
		const last = answers.at(-1) ?? '';
		if (![...last.matchAll(CITATION)].length)
			out.push({ code: 'no-citation', severity: 'warn', detail: 'cites no manual unit' });
	}
	return out;
}

/** Whether an answer's combo satisfies an expected one (placeholders accept any member). */
function comboMatches(expected: KeySequence, actual: KeySequence): boolean {
	if (expected.chords.length !== actual.chords.length) return false;
	return expected.chords.every((chord, c) => {
		const other = actual.chords[c];
		if (chord.terms.length !== other.terms.length) return false;
		return chord.terms.every((term, t) => {
			const got = other.terms[t];
			if (term.gesture !== got.gesture) return false;
			const allowed = new Set(targetIds(term.target));
			return targetIds(got.target).every((id) => allowed.has(id));
		});
	});
}

/** The key combos an answer writes in backticks. */
function combosIn(text: string): KeySequence[] {
	return [...text.matchAll(/`([^`]+)`/g)].flatMap((m) => {
		const parsed = tryParseKeys(m[1].trim());
		return parsed.ok ? [parsed.value] : [];
	});
}

// ─── the rubric ─────────────────────────────────────────────────────────────────────────────────

const RUBRIC_SYSTEM = `You review answers from the AI agent inside OP-XY Agent, a web app next to a replica of the Teenage Engineering OP-XY synthesizer. The agent teaches the device from its manual, shows key presses on the replica, programs and plays patterns on it, makes drum kits, and controls a connected OP-XY over MIDI. Its users are musicians at their instrument.

What a great answer looks like here:
- The answer or the result first, then the keys to press in order, then only details that matter.
- Key combinations in backticks in the device's key grammar (\`shift + M1\`, \`turn E2\`, \`T3\`); the chat draws them as the device's own keys.
- Short paragraphs or a few numbered steps; bold used sparingly; no preamble, no filler, no tables.
- Manual units cited at the end in square brackets (e.g. [sequencer.parameter-locks]) when it answers from the manual.
- It says honestly what it did and what it could not do; it never claims an action the tool trace does not show, and never mentions tool names or internal words (simulator, lanes, the owner).
- When it programs music, what it wrote fits the request (genre, key, tempo, instruments) and it tells the user what they will hear and what to try next, briefly.

Score each axis 1–5 (5 = nothing to improve, 4 = small nit, 3 = noticeable problem, 2 = a real failure, 1 = broken). Be strict and specific; a typical good answer is a 4. List concrete issues a picky product owner would fix.

Correctness: check claims against the manual below, the required facts and the tool results (shown in full after each call). Mark a claim wrong only when one of those shows it wrong; a claim you cannot verify is an issue to list, not a correctness failure. The tool results are the truth about what happened on the replica.`;

/** How much of an attached file the judge reads: its header, track list and first notes. */
const ATTACHED_FOR_JUDGE = 5_000;

/** The text the model received for each attachment (a document block's, or a text block's). */
function attachedText(attached: readonly PreparedAttachment[]): string[] {
	return attached.flatMap((a) =>
		a.blocks.flatMap((b) => {
			if (b.type === 'text') return [b.text];
			if (b.type === 'document' && b.source.type === 'text') return [b.source.data];
			return [];
		})
	);
}

function renderForJudge(
	c: QualityCase,
	answers: readonly string[],
	trace: readonly TraceCall[],
	fails: readonly string[],
	heard: CaseResult['heard'] = null,
	attached: readonly string[] = []
): string {
	const parts: string[] = [];
	c.turns.forEach((turn, i) => {
		parts.push(`USER (turn ${i + 1}): ${turn}`);
		if (i === 0) {
			for (const text of attached) {
				parts.push(
					`ATTACHED (what the agent received; the first ${ATTACHED_FOR_JUDGE} characters of ${text.length}):\n${text.slice(0, ATTACHED_FOR_JUDGE)}`
				);
			}
		}
		const calls = trace.filter((t) => t.turn === i && !t.nested);
		if (calls.length) {
			parts.push(
				'TOOLS: ' +
					calls
						.map(
							(t) =>
								`${t.name}(${JSON.stringify(t.input).slice(0, 600)}) → ${t.status}: ${(t.result ?? t.summary).slice(0, 4000)}`
						)
						.join('\n       ')
			);
		} else parts.push('TOOLS: none');
		parts.push(`AGENT (turn ${i + 1}):\n<answer>\n${answers[i] ?? '(no answer)'}\n</answer>`);
	});
	if (c.facts?.length)
		parts.push(
			`Facts a correct final answer must state:\n${c.facts.map((f) => `- ${f}`).join('\n')}`
		);
	if (c.intent) parts.push(`What the case expects: ${c.intent}`);
	if (fails.length)
		parts.push(`Automatic checks that failed:\n${fails.map((f) => `- ${f}`).join('\n')}`);
	if (heard)
		parts.push(
			`What the replica played when the agent was done (measured by the app's listening, 4 s; the metronome's click counts among the hits when it is on):\n${heard.text}`
		);
	return parts.join('\n\n');
}

async function rubric(
	client: Anthropic,
	model: string,
	manual: string,
	c: QualityCase,
	answers: readonly string[],
	trace: readonly TraceCall[],
	fails: readonly string[],
	heard: CaseResult['heard'] = null,
	attached: readonly string[] = []
): Promise<RubricResult> {
	try {
		const response = await client.messages.parse({
			model,
			max_tokens: 4_000,
			system: [
				{ type: 'text', text: RUBRIC_SYSTEM },
				{
					type: 'text',
					text: `The manual the agent answers from (judge its facts against this; the OP-XY has surprising conventions, e.g. a higher envelope release value is a shorter release, so check before calling something wrong):\n\n${manual}`,
					cache_control: { type: 'ephemeral', ttl: '1h' }
				}
			],
			messages: [
				{ role: 'user', content: renderForJudge(c, answers, trace, fails, heard, attached) }
			],
			output_config: { format: zodOutputFormat(Rubric) }
		});
		const u = response.usage;
		const price = model.includes('opus') ? { i: 4, o: 20 } : { i: 2, o: 10 };
		const usd =
			((u.input_tokens ?? 0) * price.i +
				(u.cache_creation_input_tokens ?? 0) * price.i * 2 +
				(u.cache_read_input_tokens ?? 0) * price.i * 0.1 +
				(u.output_tokens ?? 0) * price.o) /
			1e6;
		return { scores: response.parsed_output ?? null, model, usd, error: null };
	} catch (e) {
		return { scores: null, model, usd: 0, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Writes the judge's cached prefix once, so parallel judgements read it instead of each writing it. */
async function warmJudge(client: Anthropic, model: string, manual: string): Promise<void> {
	const c: QualityCase = { id: 'warm', category: 'edge', turns: ['hi'] };
	await rubric(client, model, manual, c, ['hello'], [], []);
}

// ─── running a case ─────────────────────────────────────────────────────────────────────────────

async function runCase(
	c: QualityCase,
	run: number,
	opts: {
		model: string;
		judge: string;
		apiKey: string;
		manual: ManualSource;
		bundle: string;
		units: ReadonlySet<string>;
		ears: Ears | null;
	}
): Promise<CaseResult> {
	const env = await environment(c, opts.model, opts.apiKey, opts.manual, opts.ears);
	const { conductor } = env;
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
	const answers: string[] = [];
	const started = performance.now();
	let error: string | null = null;
	// the first turn's attachments, read from disk the way the app reads a dropped file
	const attached: PreparedAttachment[] = [];
	for (const path of c.attach ?? []) {
		const name = basename(path);
		attached.push(
			await prepareAttachment(new File([new Uint8Array(readFileSync(path))], name), name)
		);
	}
	for (const [i, message] of c.turns.entries()) {
		turn = i;
		const before = conductor.entries.length;
		try {
			await conductor.send(message, i === 0 ? attached : []);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		answers.push(
			conductor.entries
				.slice(before)
				.filter((e) => e.kind === 'text' && e.parent === null)
				.map((e) => (e.kind === 'text' ? e.text : ''))
				.join('\n\n')
		);
		if (error) break;
	}
	const seconds = (performance.now() - started) / 1000;
	await attachResults(env.store, trace);
	const agentError =
		error ??
		(conductor.lastError ? `${conductor.lastError.code}: ${conductor.lastError.message}` : null);
	const outcome: Outcome = { ...env.outcome(), answers, trace };
	const fails = [...(c.check?.(outcome) ?? []), ...toolExpectations(c, trace)];
	// what the user would hear now: silence or a tempo that is not the set one means it did not work
	const heard = await hearEnd(env);
	if (heard?.flags.includes('silent')) fails.push('the replica plays silence');
	if (heard?.flags.includes('off-tempo')) fails.push('what plays is off the set tempo');
	const judgeClient = new Anthropic({ apiKey: opts.apiKey });
	const facts = c.facts?.length
		? await judgeAnswer(judgeClient, [opts.judge, 'claude-sonnet-5-5'], {
				question: c.turns.join('\n\n(then) '),
				facts: c.facts,
				answer: answers.at(-1) ?? ''
			}).catch(() => null)
		: null;
	if (facts) {
		const present = facts.present.filter(Boolean).length / facts.present.length;
		if (present < 0.75)
			fails.push(
				`facts ${Math.round(present * 100)}%: missing ${facts.present
					.map((p, i) => (p ? null : c.facts![i]))
					.filter(Boolean)
					.join('; ')}`
			);
		for (const x of facts.contradictions) fails.push(`contradicts: ${x}`);
	}
	const lints = lint(c, answers, trace, opts.units, agentError);
	const judged = await rubric(
		judgeClient,
		opts.judge,
		opts.bundle,
		c,
		answers,
		trace,
		fails,
		heard,
		attachedText(attached)
	);
	const low = judged.scores ? AXES.filter((a) => judged.scores![a].score <= 2) : [];
	const pass =
		fails.length === 0 &&
		!lints.some((l) => l.severity === 'error') &&
		low.length === 0 &&
		!agentError;
	const entries = JSON.parse(JSON.stringify(conductor.entries)) as ChatEntry[];
	const result: CaseResult = {
		id: c.id,
		category: c.category,
		run,
		turns: c.turns,
		answers,
		trace,
		entries,
		fails,
		facts,
		lints,
		rubric: judged,
		pass,
		usd: conductor.usage.usd,
		judgeUsd: judged.usd + (facts?.usd ?? 0),
		seconds,
		calls: conductor.usage.calls,
		error: agentError,
		heard
	};
	conductor.dispose();
	return result;
}

/** Four seconds of what the replica plays once the agent is done, while the transport runs. */
async function hearEnd(env: Env): Promise<CaseResult['heard']> {
	if (!env.listen || !env.sim.state.transport.playing) return null;
	try {
		const recording = await env.listen.record('replica', 4, new AbortController().signal);
		const analysis = analyzeAudio(recording.channels, recording.sampleRate, {
			expectedBpm: env.sim.state.tempo.bpm
		});
		const summary = summarize(analysis, { source: 'the replica' });
		return { text: summary.text, flags: summary.flags };
	} catch (error) {
		return {
			text: `could not listen: ${error instanceof Error ? error.message : error}`,
			flags: []
		};
	}
}

/** Fills in each call's result from the saved thread (tool_result blocks by tool_use id). */
async function attachResults(store: ThreadStore, trace: TraceCall[]): Promise<void> {
	const results = new Map<string, string>();
	for (const summary of await store.list()) {
		const thread = await store.load(summary.id);
		for (const message of thread?.messages ?? []) {
			if (typeof message.content === 'string') continue;
			for (const block of message.content) {
				if (block.type !== 'tool_result') continue;
				const content = block.content;
				const text =
					typeof content === 'string'
						? content
						: (content ?? []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
				results.set(block.tool_use_id, text);
			}
		}
	}
	trace.forEach((call, i) => {
		const result = results.get(call.id);
		if (result !== undefined) trace[i] = { ...call, result };
	});
}

/** The case's expectations about which tools it uses. */
function toolExpectations(c: QualityCase, trace: readonly TraceCall[]): string[] {
	const t = c.tools;
	if (!t) return [];
	const names = trace.filter((x) => !x.nested).map((x) => x.name);
	const fails: string[] = [];
	for (const name of t.must ?? []) if (!names.includes(name)) fails.push(`did not call ${name}`);
	for (const group of t.oneOf ?? [])
		if (!group.some((n) => names.includes(n))) fails.push(`called none of ${group.join(', ')}`);
	for (const name of t.not ?? []) if (names.includes(name)) fails.push(`called ${name}`);
	if (t.max !== undefined && names.length > t.max)
		fails.push(`${names.length} tool calls (at most ${t.max})`);
	return fails;
}

// ─── the scorecard ──────────────────────────────────────────────────────────────────────────────

function mean(xs: readonly number[]): number {
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function scorecard(results: readonly CaseResult[], model: string, judge: string): string {
	const lines: string[] = [];
	lines.push(`quality eval — conductor ${model}, judge ${judge}, ${results.length} runs`);
	const categories = [...new Set(results.map((r) => r.category))];
	lines.push('');
	lines.push(
		'category   runs  pass   ' +
			AXES.map((a) => a.padStart(7)).join('') +
			'   lints(e/w)   $/run   s/run'
	);
	for (const cat of [...categories, 'all']) {
		const rs = cat === 'all' ? results : results.filter((r) => r.category === cat);
		const axis = (a: (typeof AXES)[number]) =>
			mean(rs.flatMap((r) => (r.rubric?.scores ? [r.rubric.scores[a].score] : [])))
				.toFixed(2)
				.padStart(7);
		const e = rs.reduce((n, r) => n + r.lints.filter((l) => l.severity === 'error').length, 0);
		const w = rs.reduce((n, r) => n + r.lints.filter((l) => l.severity === 'warn').length, 0);
		lines.push(
			`${cat.padEnd(9)} ${String(rs.length).padStart(5)}  ${`${rs.filter((r) => r.pass).length}/${rs.length}`.padStart(5)}  ${AXES.map(axis).join('')}   ${`${e}/${w}`.padStart(9)}   ${mean(rs.map((r) => r.usd)).toFixed(3)}   ${mean(rs.map((r) => r.seconds)).toFixed(1)}`
		);
	}
	const codes = new Map<string, number>();
	for (const r of results) for (const l of r.lints) codes.set(l.code, (codes.get(l.code) ?? 0) + 1);
	lines.push('');
	lines.push(
		'lints: ' +
			([...codes]
				.sort((a, b) => b[1] - a[1])
				.map(([k, n]) => `${k} ${n}`)
				.join(', ') || 'none')
	);
	lines.push('');
	for (const r of results) {
		const s = r.rubric?.scores;
		const axes = s ? AXES.map((a) => s[a].score).join('') : '------';
		lines.push(
			`${r.pass ? 'PASS' : 'FAIL'} ${`${r.id}${r.run ? `#${r.run + 1}` : ''}`.padEnd(26)} ${axes}  ${r.seconds.toFixed(0).padStart(3)} s  $${r.usd.toFixed(3)}  ${
				r.trace
					.filter((t) => !t.nested)
					.map((t) => t.name)
					.join(' → ') || 'no tools'
			}`
		);
		for (const f of r.fails) lines.push(`     ✗ ${f}`);
		for (const l of r.lints)
			lines.push(`     ${l.severity === 'error' ? '!' : '·'} ${l.code}: ${l.detail}`);
		for (const issue of s?.issues.slice(0, 3) ?? []) lines.push(`     ~ ${issue}`);
		// the level, rhythm and harmony lines of what the replica played at the end
		const played = r.heard?.text
			.split('\n')
			.filter((l) => /^(level|rhythm|harmony):/.test(l))
			.map((l) => l.replace(/^(\w+): /, '').split(/[;,] /)[0]);
		if (played?.length) lines.push(`     ♪ ${played.join(' · ')}`);
	}
	const total = results.reduce((n, r) => n + r.usd, 0);
	const judging = results.reduce((n, r) => n + r.judgeUsd, 0);
	lines.push('');
	lines.push(
		`passed ${results.filter((r) => r.pass).length}/${results.length}; agent $${total.toFixed(2)}, judge $${judging.toFixed(2)}; mean ${mean(results.map((r) => r.seconds)).toFixed(1)} s`
	);
	return lines.join('\n');
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────────

async function pool<T, R>(
	items: readonly T[],
	n: number,
	work: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await work(items[i]);
			}
		})
	);
	return out;
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
	const judge = flag('--judge') ?? 'claude-opus-5-5';
	const ids = flag('--ids')?.split(',');
	const category = flag('--category');
	const repeat = Math.max(1, Number(flag('--repeat') ?? 1));
	const concurrency = Math.max(1, Number(flag('--concurrency') ?? 3));
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const out = flag('--out') ?? join('evals/agent/out', `quality-${stamp}.json`);
	const apiKey = anthropicKey();
	const manual = await loadManualSource({ dev: false });
	const units = new Set((await manual.catalog()).map((e) => e.id));
	const bundle = await manual.promptBundle();
	const cases = QUALITY_CASES.filter(
		(c) =>
			(!ids || ids.includes(c.id)) &&
			(!category || c.category === category) &&
			// a case whose files are not on this computer is skipped
			(c.attach ?? []).every((path) => existsSync(path))
	);
	const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, run) => ({ c, run })));
	// the replica's sound for listen (quality.mjs serves the page); without it listening fails
	const earsUrl = argv.includes('--no-ears') ? undefined : process.env.EVAL_EARS_URL;
	const ears = earsUrl ? await openEars(earsUrl) : null;
	await warmJudge(new Anthropic({ apiKey }), judge, bundle);
	console.log(`${jobs.length} runs of ${cases.length} cases, conductor ${model}, judge ${judge}`);
	// the first run alone writes the agent's cached prompt (tools, role, manual); the rest read it
	const first = jobs.length > 1 && concurrency > 1 ? [jobs[0]] : [];
	const report = (r: CaseResult) => {
		const s = r.rubric?.scores;
		console.log(
			`${r.pass ? 'PASS' : 'FAIL'} ${r.id}${repeat > 1 ? `#${r.run + 1}` : ''}  ${s ? AXES.map((a) => s[a].score).join('') : '------'}  ${r.seconds.toFixed(0)} s  $${r.usd.toFixed(3)}`
		);
		return r;
	};
	const warmed = await pool(first, 1, async ({ c, run }) =>
		report(await runCase(c, run, { model, judge, apiKey, manual, bundle, units, ears }))
	);
	const rest = await pool(jobs.slice(first.length), concurrency, async ({ c, run }) => {
		return report(await runCase(c, run, { model, judge, apiKey, manual, bundle, units, ears }));
	});
	await ears?.close();
	const results = [...warmed, ...rest];
	const card = scorecard(results, model, judge);
	console.log('\n' + card);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, JSON.stringify({ model, judge, stamp, results }, null, 1));
	writeFileSync(out.replace(/\.json$/, '.txt'), card + '\n');
	writeIndex(dirname(out));
	console.log(`\nsaved ${out}`);
}

/** One saved run, as the transcript viewer lists it. */
export interface RunEntry {
	readonly file: string;
	readonly model: string;
	readonly stamp: string;
	readonly runs: number;
	readonly passed: number;
}

/**
 * Lists every saved run in `dir/index.json`, newest first, for the transcript viewer (which fetches
 * it, so a run saved while the dev server runs shows up at once).
 */
function writeIndex(dir: string): void {
	const entries: RunEntry[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json') || name === 'index.json') continue;
		try {
			const saved = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
				model?: string;
				stamp?: string;
				results?: { pass: boolean }[];
			};
			if (!Array.isArray(saved.results)) continue;
			entries.push({
				file: basename(name),
				model: saved.model ?? '',
				stamp: saved.stamp ?? '',
				runs: saved.results.length,
				passed: saved.results.filter((r) => r.pass).length
			});
		} catch {
			// not a run
		}
	}
	entries.sort((a, b) => b.stamp.localeCompare(a.stamp));
	writeFileSync(join(dir, 'index.json'), JSON.stringify(entries, null, 1));
}
