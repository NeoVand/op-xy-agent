/**
 * The agent eval: runs the headless conductor (the same code as the app, auto-approving changes)
 * on manual Q&A cases and device tasks, scores the answers with Claude as judge, and prints a
 * scorecard: accuracy per chapter, combo recall, which manual each answer drew on, device task pass
 * rate, latency, cost and cache hits. Started by `run.mjs` through Vite's SSR loader, so `$lib`
 * imports, runes and the dev-only guide supplement work.
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { targetIds, tryParseKeys, type KeySequence } from '$lib/core/opxy';
import { ANTHROPIC_API_URL, createAnthropicClient, type ModelClient } from '$lib/agent/client';
import { Conductor } from '$lib/agent/conductor.svelte';
import {
	loadManualSource,
	type ManualEntry,
	type ManualOrigin,
	type ManualSource
} from '$lib/agent/manual-source';
import { cacheHitRate, DEFAULT_CONDUCTOR_MODEL, type TokenCounts } from '$lib/agent/models';
import { createMemoryThreadStore } from '$lib/agent/threads';
import type { ReplicaState } from '$lib/replica/state.svelte';
import { DEVICE_TASKS, type Check, type DeviceTask } from './cases/device';
import manualCases from './cases/manual.json';
import { connectFakeDevice, recordingReplica, settle, type FakeDevice } from './fake-device';
import { judgeAnswer, type Judgement } from './judge';

/** One manual Q&A case (cases/manual.json). */
interface ManualCase {
	readonly id: string;
	readonly chapter: string;
	readonly question: string;
	readonly facts: readonly string[];
	readonly keys: readonly string[];
	readonly source: string;
}

/** Which manual the agent gets: ours + the dev guide (what `pnpm dev` uses), ours only (production), or the guide only. */
type ManualMode = 'combined' | 'ours' | 'guide';

interface Options {
	readonly manual: ManualMode;
	readonly model: string;
	readonly judges: readonly string[];
	readonly concurrency: number;
	readonly only: 'manual' | 'device' | null;
	readonly ids: readonly string[] | null;
	readonly limit: number | null;
	readonly out: string;
	/** Re-judge the answers saved in this results file instead of running the agent. */
	readonly rejudge: string | null;
}

interface AgentRun {
	readonly answer: string;
	readonly tools: { name: string; input: unknown; status: string }[];
	/** Origins of the manual units the tools returned (search hits and units read, subagents included). */
	readonly looked: ManualOrigin[];
	readonly shown: string[];
	readonly tokens: TokenCounts;
	readonly usd: number;
	readonly calls: number;
	readonly ms: number;
	readonly error: string | null;
}

// ─── setup ──────────────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

/** The Anthropic key: $ANTHROPIC_API_KEY or .env, chosen by its prefix. Never printed. */
function anthropicKey(): string {
	const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
	if (fromEnv?.startsWith('sk-ant-')) return fromEnv;
	let text = '';
	try {
		text = readFileSync(join(ROOT, '.env'), 'utf8');
	} catch {
		// no .env
	}
	for (const line of text.split('\n')) {
		const value = line
			.slice(line.indexOf('=') + 1)
			.trim()
			.replace(/^['"]|['"]$/g, '');
		if (value.startsWith('sk-ant-')) return value;
	}
	throw new Error('No Anthropic key (sk-ant-…) in $ANTHROPIC_API_KEY or .env');
}

function parseOptions(argv: readonly string[]): Options {
	const get = (flag: string) => {
		const index = argv.indexOf(flag);
		return index >= 0 ? argv[index + 1] : undefined;
	};
	const only = get('--only');
	const manual = get('--manual');
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	return {
		manual: manual === 'ours' || manual === 'guide' ? manual : 'combined',
		model: get('--model') ?? DEFAULT_CONDUCTOR_MODEL,
		judges: (get('--judge') ?? 'claude-sonnet-5,claude-haiku-4-5').split(','),
		concurrency: Math.max(1, Number(get('--concurrency') ?? 4)),
		only: only === 'manual' || only === 'device' ? only : null,
		ids: get('--ids')?.split(',') ?? null,
		limit: get('--limit') ? Number(get('--limit')) : null,
		out: get('--out') ?? join(tmpdir(), 'opxy-agent-evals', `eval-${stamp}.json`),
		rejudge: get('--rejudge') ?? null
	};
}

async function pool<T, R>(
	items: readonly T[],
	concurrency: number,
	work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await work(items[index], index);
		}
	});
	await Promise.all(lanes);
	return results;
}

/** The manual for a mode; exits when the mode's manual is not there. */
async function manualFor(mode: ManualMode): Promise<ManualSource> {
	const source =
		mode === 'ours'
			? await loadManualSource({ dev: false })
			: mode === 'guide'
				? await loadManualSource({ ours: null, dev: true })
				: await loadManualSource({ dev: true });
	const expected = { ours: 'manual', guide: 'dev-guide', combined: 'combined' }[mode];
	if (source.kind !== expected) {
		throw new Error(
			`--manual ${mode} needs ${mode === 'ours' ? 'our manual (knowledge/manual/build)' : mode === 'guide' ? 'the local guide scrape (knowledge/official/guide)' : 'our manual and the local guide scrape'}; got ${source.label}`
		);
	}
	return source;
}

/** Wraps a manual so a run can see which origins its lookups returned. */
function recordingManual(manual: ManualSource): { source: ManualSource; looked: ManualOrigin[] } {
	const looked: ManualOrigin[] = [];
	return {
		looked,
		source: {
			...manual,
			promptBundle: () => manual.promptBundle(),
			catalog: () => manual.catalog(),
			async search(query, limit) {
				const hits = await manual.search(query, limit);
				looked.push(...hits.map((h) => h.origin));
				return hits;
			},
			async unit(id) {
				const unit = await manual.unit(id);
				if (unit) looked.push(unit.origin);
				return unit;
			}
		}
	};
}

// ─── running the agent ──────────────────────────────────────────────────────────────────────────

async function runAgent(
	prompt: string,
	env: {
		client: ModelClient;
		manual: ManualSource;
		model: string;
		device: FakeDevice | null;
		replica: ReplicaState;
		shown: string[];
	}
): Promise<AgentRun> {
	const manual = recordingManual(env.manual);
	const conductor = await Conductor.create({
		client: env.client,
		device: env.device?.stack ?? null,
		replica: env.replica,
		manual: manual.source,
		store: createMemoryThreadStore(),
		autoApprove: true,
		confirmWindowMs: 150,
		model: env.model
	});
	const tools: AgentRun['tools'] = [];
	conductor.on((event) => {
		if (event.type === 'tool_start' && event.parent === null)
			tools.push({ name: event.name, input: event.input, status: 'running' });
		if (event.type === 'tool_end' && event.parent === null) {
			const tool = tools.findLast((t) => t.name === event.name && t.status === 'running');
			if (tool) tool.status = event.status;
		}
	});
	const started = performance.now();
	await conductor.send(prompt);
	const ms = performance.now() - started;
	const answer = conductor.entries
		.filter((e) => e.kind === 'text' && e.parent === null)
		.map((e) => (e.kind === 'text' ? e.text : ''))
		.join('\n\n');
	const { usd, calls, input, output, cacheRead, cacheWrite } = conductor.usage;
	const error = conductor.lastError?.message ?? null;
	conductor.dispose();
	return {
		answer,
		tools,
		looked: manual.looked,
		shown: [...env.shown],
		tokens: { input, output, cacheRead, cacheWrite },
		usd,
		calls,
		ms,
		error
	};
}

// ─── scoring ────────────────────────────────────────────────────────────────────────────────────

function parse(combo: string): KeySequence | null {
	const result = tryParseKeys(combo.trim());
	return result.ok ? result.value : null;
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

function combosIn(text: string): KeySequence[] {
	return [...text.matchAll(/`([^`]+)`/g)]
		.map((m) => parse(m[1]))
		.filter((k): k is KeySequence => k !== null);
}

/** Which manual an answer drew on. */
type AnswerSource = 'ours' | 'guide' | 'both' | 'none';

/** Evidence for {@link AnswerSource}: citations in the answer, then what the manual tools returned. */
interface Attribution {
	readonly source: AnswerSource;
	/** Units of our manual the answer cites (`[unit-id]`). */
	readonly citesOurs: readonly string[];
	/** Guide sections the answer links to. */
	readonly citesGuide: readonly string[];
	readonly lookedOurs: number;
	readonly lookedGuide: number;
}

const CITE =
	/\[([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:#[a-z0-9-]+)?(?:\s*[,;]\s*[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:#[a-z0-9-]+)?)*)\](?!\()/g;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * Attributes an answer to our manual, the guide supplement, both or neither: citations decide
 * (our units are cited as `[unit-id]`, guide sections as links to their source); an answer without
 * citations is attributed to what its manual lookups returned; `none` means it cited nothing and
 * looked nothing up (it answered from the prompt without saying where from).
 */
function attribute(
	answer: string,
	looked: readonly ManualOrigin[],
	catalog: CatalogIndex
): Attribution {
	const citesOurs = new Set<string>();
	const citesGuide = new Set<string>();
	for (const match of answer.matchAll(CITE)) {
		for (const ref of match[1].split(/\s*[,;]\s*/)) {
			if (catalog.ours.has(ref.split('#')[0])) citesOurs.add(ref);
		}
	}
	for (const [, text, url] of answer.matchAll(LINK)) {
		const title = text.trim().toLowerCase();
		const oursByTitle = catalog.oursTitles.get(title);
		const guide = catalog.guideByUrl.get(url) ?? catalog.guideByTitle.get(title);
		if (oursByTitle) citesOurs.add(oursByTitle);
		else if (guide) citesGuide.add(guide);
		else if (catalog.oursByUrl.has(url)) citesOurs.add(catalog.oursByUrl.get(url)!);
	}
	const lookedOurs = looked.filter((o) => o === 'manual').length;
	const lookedGuide = looked.filter((o) => o === 'dev-guide').length;
	const pick = (ours: boolean, guide: boolean): AnswerSource =>
		ours && guide ? 'both' : ours ? 'ours' : guide ? 'guide' : 'none';
	const byCitation = pick(citesOurs.size > 0, citesGuide.size > 0);
	return {
		source: byCitation !== 'none' ? byCitation : pick(lookedOurs > 0, lookedGuide > 0),
		citesOurs: [...citesOurs],
		citesGuide: [...citesGuide],
		lookedOurs,
		lookedGuide
	};
}

/** The active manual's units, indexed for attribution. */
interface CatalogIndex {
	readonly ours: ReadonlySet<string>;
	readonly oursTitles: ReadonlyMap<string, string>;
	readonly oursByUrl: ReadonlyMap<string, string>;
	readonly guideByUrl: ReadonlyMap<string, string>;
	readonly guideByTitle: ReadonlyMap<string, string>;
}

function indexCatalog(entries: readonly ManualEntry[]): CatalogIndex {
	const ours = entries.filter((e) => e.origin === 'manual');
	const guide = entries.filter((e) => e.origin === 'dev-guide');
	return {
		ours: new Set(ours.map((e) => e.id)),
		oursTitles: new Map(ours.map((e) => [e.title.toLowerCase(), e.id])),
		oursByUrl: new Map(ours.map((e) => [e.source, e.id])),
		guideByUrl: new Map(guide.map((e) => [e.source, e.id])),
		guideByTitle: new Map(guide.map((e) => [e.title.toLowerCase(), e.id]))
	};
}

interface ManualResult {
	readonly id: string;
	readonly chapter: string;
	readonly question: string;
	readonly attribution: Attribution;
	readonly factScore: number;
	readonly pass: boolean;
	readonly keysExpected: number;
	readonly keysFound: number;
	readonly judgement: Judgement | null;
	readonly run: AgentRun;
}

interface DeviceResult {
	readonly id: string;
	readonly prompt: string;
	readonly checks: Check[];
	readonly pass: boolean;
	readonly run: AgentRun;
}

async function runManualCase(
	c: ManualCase,
	env: {
		client: ModelClient;
		judge: Anthropic;
		manual: ManualSource;
		catalog: CatalogIndex;
		options: Options;
	}
): Promise<ManualResult> {
	const { replica, shown } = recordingReplica();
	const run = await runAgent(c.question, {
		...env,
		model: env.options.model,
		device: null,
		replica,
		shown
	});
	const judgement = await judge(c, run.answer, env);
	return scoreCase(c, run, judgement, attribute(run.answer, run.looked, env.catalog));
}

/** Grades an answer against the case's facts; null when every judge model failed. */
async function judge(
	c: ManualCase,
	answer: string,
	env: { judge: Anthropic; options: Options }
): Promise<Judgement | null> {
	try {
		return await judgeAnswer(env.judge, env.options.judges, {
			question: c.question,
			facts: c.facts,
			answer
		});
	} catch (error) {
		console.error(
			`  judge failed on ${c.id}: ${error instanceof Error ? error.message : String(error)}`
		);
		return null;
	}
}

/** Fact score, combo recall and the pass verdict for one answered case. */
function scoreCase(
	c: ManualCase,
	run: AgentRun,
	judgement: Judgement | null,
	attribution: Attribution
): ManualResult {
	const present = judgement?.present.filter(Boolean).length ?? 0;
	const factScore = c.facts.length === 0 ? 1 : present / c.facts.length;
	const expected = c.keys.map(parse).filter((k): k is KeySequence => k !== null);
	const offered = [
		...combosIn(run.answer),
		...run.shown.map(parse).filter((k): k is KeySequence => k !== null)
	];
	const keysFound = expected.filter((k) => offered.some((o) => comboMatches(k, o))).length;
	const pass =
		factScore >= 0.75 && (judgement?.contradictions.length ?? 1) === 0 && run.error === null;
	return {
		id: c.id,
		chapter: c.chapter,
		question: c.question,
		attribution,
		factScore,
		pass,
		keysExpected: expected.length,
		keysFound,
		judgement,
		run
	};
}

async function runDeviceTask(
	task: DeviceTask,
	env: { client: ModelClient; manual: ManualSource; options: Options }
): Promise<DeviceResult> {
	const device = await connectFakeDevice({ clockMode: task.clockMode });
	try {
		await settle(task.clockMode === 'both' ? 1200 : 30); // let the clock follower measure the tempo
		await task.setup?.(device);
		await settle(80);
		device.mark();
		const { replica, shown } = recordingReplica();
		const run = await runAgent(task.prompt, {
			...env,
			model: env.options.model,
			device,
			replica,
			shown
		});
		await settle(120);
		const checks = task.check({
			received: device.received(),
			tools: run.tools,
			shown: run.shown,
			answer: run.answer,
			device
		});
		if (run.error) checks.push({ name: `no error (${run.error})`, pass: false });
		return { id: task.id, prompt: task.prompt, checks, pass: checks.every((c) => c.pass), run };
	} finally {
		await device.dispose();
	}
}

// ─── report ─────────────────────────────────────────────────────────────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function chapterNumber(chapter: string): number {
	return Number.parseInt(chapter, 10) || 0;
}

/** What the scorecard says about the manual the agent had. */
interface ManualInfo {
	readonly label: string;
	readonly unitCount: number;
}

function scorecard(
	manual: ManualResult[],
	device: DeviceResult[],
	options: Options,
	source: ManualInfo,
	note?: string
): string {
	const lines: string[] = [];
	lines.push(`OP-XY agent eval  ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
	if (note) lines.push(note);
	lines.push(
		`conductor ${options.model}   judge ${options.judges[0]}   manual (${options.manual}): ${source.label}, ${source.unitCount} units`
	);
	if (manual.length > 0) {
		lines.push('', `Manual Q&A: ${manual.length} cases`);
		lines.push(
			`${'chapter'.padEnd(24)}${'cases'.padStart(6)}${'facts'.padStart(8)}${'pass'.padStart(8)}${'combos'.padStart(9)}`
		);
		const chapters = [...new Set(manual.map((m) => m.chapter))].sort(
			(a, b) => chapterNumber(a) - chapterNumber(b)
		);
		for (const chapter of chapters) {
			const rows = manual.filter((m) => m.chapter === chapter);
			const facts = rows.reduce((s, r) => s + r.factScore, 0) / rows.length;
			const expected = rows.reduce((s, r) => s + r.keysExpected, 0);
			const found = rows.reduce((s, r) => s + r.keysFound, 0);
			lines.push(
				`${chapter.slice(0, 23).padEnd(24)}${String(rows.length).padStart(6)}${pct(facts).padStart(8)}${`${rows.filter((r) => r.pass).length}/${rows.length}`.padStart(8)}${(expected ? `${found}/${expected}` : '–').padStart(9)}`
			);
		}
		const facts = manual.reduce((s, r) => s + r.factScore, 0) / manual.length;
		const expected = manual.reduce((s, r) => s + r.keysExpected, 0);
		const found = manual.reduce((s, r) => s + r.keysFound, 0);
		lines.push(
			`${'overall'.padEnd(24)}${String(manual.length).padStart(6)}${pct(facts).padStart(8)}${`${manual.filter((r) => r.pass).length}/${manual.length}`.padStart(8)}${`${found}/${expected}`.padStart(9)}`
		);
		lines.push('', 'Which manual answered (citations first, else what the lookups returned):');
		const sources: [AnswerSource, string][] = [
			['ours', 'our manual'],
			['guide', 'TE guide (dev supplement)'],
			['both', 'both'],
			['none', 'uncited, no lookups']
		];
		for (const [key, label] of sources) {
			const rows = manual.filter((m) => m.attribution.source === key);
			if (rows.length === 0) continue;
			const facts = rows.reduce((s, r) => s + r.factScore, 0) / rows.length;
			lines.push(
				`  ${label.padEnd(28)}${String(rows.length).padStart(4)} cases   facts ${pct(facts).padStart(4)}   pass ${rows.filter((r) => r.pass).length}/${rows.length}`
			);
		}
		const cited = new Set(
			manual.flatMap((m) => m.attribution.citesOurs.map((r) => r.split('#')[0]))
		);
		if (cited.size > 0) lines.push(`  our units cited: ${[...cited].sort().join(', ')}`);
		const failed = manual.filter((m) => !m.pass);
		if (failed.length > 0) {
			lines.push('', 'Q&A cases below the bar (facts < 75%, a contradiction or an error):');
			for (const f of failed) {
				const missing = f.judgement
					? f.judgement.reasons.filter((_, i) => !f.judgement!.present[i])
					: ['(not judged)'];
				lines.push(
					`  ${f.id} [${f.attribution.source}]: facts ${pct(f.factScore)}${f.judgement?.contradictions.length ? `, contradicts: ${f.judgement.contradictions[0]}` : ''}${missing.length ? `; missing: ${missing.slice(0, 2).join(' | ')}` : ''}`
				);
			}
		}
	}
	if (device.length > 0) {
		lines.push('', `Device tasks: ${device.filter((d) => d.pass).length}/${device.length} passed`);
		for (const d of device) {
			const passed = d.checks.filter((c) => c.pass).length;
			const tools = d.run.tools.map((t) => t.name).join(', ') || 'no tools';
			lines.push(
				`  ${d.pass ? 'pass' : 'FAIL'}  ${d.id.padEnd(22)}${`${passed}/${d.checks.length}`.padStart(5)}  ${secs(d.run.ms).padStart(7)}  ${tools}`
			);
			for (const c of d.checks.filter((x) => !x.pass)) lines.push(`        failed: ${c.name}`);
		}
	}
	const runs = [...manual.map((m) => m.run), ...device.map((d) => d.run)];
	const latencies = runs.map((r) => r.ms);
	const tokens = runs.reduce(
		(t, r) => ({
			input: t.input + r.tokens.input,
			output: t.output + r.tokens.output,
			cacheRead: t.cacheRead + r.tokens.cacheRead,
			cacheWrite: t.cacheWrite + r.tokens.cacheWrite
		}),
		{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
	);
	const agentUsd = runs.reduce((s, r) => s + r.usd, 0);
	const judgeUsd = manual.reduce((s, m) => s + (m.judgement?.usd ?? 0), 0);
	const calls = runs.reduce((s, r) => s + r.calls, 0);
	lines.push('');
	lines.push(
		`Latency per request: mean ${secs(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length))}, p50 ${secs(percentile(latencies, 50))}, p95 ${secs(percentile(latencies, 95))}`
	);
	lines.push(
		`Cost: agent $${agentUsd.toFixed(2)} (${calls} model calls) + judge $${judgeUsd.toFixed(2)} = $${(agentUsd + judgeUsd).toFixed(2)}`
	);
	const hit = cacheHitRate(tokens);
	lines.push(
		`Prompt cache: ${hit === null ? '–' : pct(hit)} of prompt tokens read from cache (read ${(tokens.cacheRead / 1e6).toFixed(2)}M, written ${(tokens.cacheWrite / 1e3).toFixed(0)}k, uncached ${(tokens.input / 1e3).toFixed(1)}k; output ${(tokens.output / 1e3).toFixed(1)}k)`
	);
	return lines.join('\n');
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────────

/** Runs the eval with command-line flags (see run.mjs). */
export async function main(argv: readonly string[]): Promise<void> {
	const options = parseOptions(argv);
	const apiKey = anthropicKey();
	const client = createAnthropicClient({ apiKey });
	const judge = new Anthropic({
		apiKey,
		authToken: null,
		baseURL: ANTHROPIC_API_URL,
		logLevel: 'off'
	});
	if (options.rejudge) return rejudge(options, judge);
	const manual = await manualFor(options.manual);
	const catalog = indexCatalog(await manual.catalog());
	const selected = <T extends { id: string }>(items: readonly T[]) => {
		const filtered = options.ids ? items.filter((i) => options.ids!.includes(i.id)) : [...items];
		return options.limit !== null ? filtered.slice(0, options.limit) : filtered;
	};
	const cases = options.only === 'device' ? [] : selected(manualCases as ManualCase[]);
	const tasks = options.only === 'manual' ? [] : selected(DEVICE_TASKS);
	console.log(
		`running ${cases.length} Q&A cases and ${tasks.length} device tasks on ${options.model} (manual: ${manual.label}, ${manual.unitCount} units), ${options.concurrency} at a time`
	);

	const env = { client, judge, manual, catalog, options };
	const manualResults: ManualResult[] = [];
	const report = (label: string, ok: boolean, detail: string) =>
		console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label.padEnd(34)} ${detail}`);
	// The first request writes the prompt cache; the rest read it.
	const [first, ...rest] = cases;
	if (first) {
		const result = await runManualCase(first, env);
		manualResults.push(result);
		report(
			result.id,
			result.pass,
			`facts ${pct(result.factScore)}  ${result.attribution.source.padEnd(5)}  ${secs(result.run.ms)}  $${result.run.usd.toFixed(3)}`
		);
	}
	manualResults.push(
		...(await pool(rest, options.concurrency, async (c) => {
			const result = await runManualCase(c, env);
			report(
				result.id,
				result.pass,
				`facts ${pct(result.factScore)}  ${result.attribution.source.padEnd(5)}  ${secs(result.run.ms)}  $${result.run.usd.toFixed(3)}`
			);
			return result;
		}))
	);
	const runTask = async (task: DeviceTask) => {
		const result = await runDeviceTask(task, env);
		report(
			result.id,
			result.pass,
			`${result.checks.filter((c) => c.pass).length}/${result.checks.length} checks  ${secs(result.run.ms)}`
		);
		return result;
	};
	// Without Q&A cases before them, the first task warms the cache on its own too.
	const deviceResults: DeviceResult[] = [];
	const waiting = [...tasks];
	const warmUp = manualResults.length === 0 ? waiting.shift() : undefined;
	if (warmUp) deviceResults.push(await runTask(warmUp));
	deviceResults.push(...(await pool(waiting, options.concurrency, runTask)));

	const card = scorecard(manualResults, deviceResults, options, manual);
	console.log(`\n${card}`);
	mkdirSync(dirname(options.out), { recursive: true });
	writeFileSync(
		options.out,
		JSON.stringify(
			{
				options: { ...options },
				manualSource: { label: manual.label, unitCount: manual.unitCount },
				scorecard: card,
				manual: manualResults,
				device: deviceResults.map((d) => ({ ...d }))
			},
			null,
			1
		)
	);
	console.log(`\nfull results: ${options.out}`);
}

/** The results file `main` writes. */
interface SavedResults {
	readonly options: Options;
	readonly manualSource?: ManualInfo;
	readonly scorecard: string;
	readonly manual: ManualResult[];
	readonly device: DeviceResult[];
}

/**
 * Re-grades saved answers with the current cases and judge (no agent calls): for a better judge,
 * or after correcting a case whose facts were wrong. Questions must be unchanged.
 */
async function rejudge(options: Options, client: Anthropic): Promise<void> {
	const saved = JSON.parse(readFileSync(options.rejudge!, 'utf8')) as SavedResults;
	const cases = new Map((manualCases as ManualCase[]).map((c) => [c.id, c]));
	const header = /manual \((\w+)\): (.+), (\d+) units/.exec(saved.scorecard);
	const source: ManualInfo = saved.manualSource ?? {
		label: header?.[2] ?? 'unknown manual',
		unitCount: Number(header?.[3] ?? 0)
	};
	const manual = await pool(saved.manual, options.concurrency, async (m) => {
		const c = cases.get(m.id);
		if (!c || c.question !== m.question) {
			console.error(`  ${m.id}: case missing or question changed, kept the old grade`);
			return m;
		}
		const result = scoreCase(
			c,
			m.run,
			await judge(c, m.run.answer, { judge: client, options }),
			m.attribution
		);
		console.log(
			`  ${result.pass ? 'pass' : 'FAIL'}  ${m.id.padEnd(34)} facts ${pct(result.factScore)}`
		);
		return result;
	});
	const card = scorecard(
		manual,
		saved.device,
		{ ...saved.options, judges: options.judges },
		source,
		`re-judged: answers from ${options.rejudge}`
	);
	console.log(`\n${card}`);
	mkdirSync(dirname(options.out), { recursive: true });
	writeFileSync(
		options.out,
		JSON.stringify(
			{
				...saved,
				options: { ...saved.options, judges: options.judges },
				manualSource: source,
				scorecard: card,
				manual
			},
			null,
			1
		)
	);
	console.log(`\nfull results: ${options.out}`);
}
