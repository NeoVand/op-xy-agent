/**
 * The judge of procedure runs: given a procedure of our manual and what the replica showed after
 * each of its steps (`procedures.ts`), did the steps reach the procedure's goal? `reached`,
 * `not_reached` or `unclear` (the replica cannot tell), with a one-line reason. A small model
 * applies "unclear because …" rules unevenly, so it answers three plain questions instead (do the
 * records show the goal; does the goal act on something the start lacks; is it about something the
 * replica does not model) and {@link verdictOf} adds them up. It also quotes the records it relies
 * on, and a quote that is not in that procedure's records has it asked again alone.
 *
 * Claude Haiku 4.5 with structured output, several procedures per request; every verdict is cached
 * by a hash of the judge's version, the model, the prompt and the run as the judge reads it, so a
 * rerun only asks about procedures (or recordings) that changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { usageCost } from '$lib/agent/models';
import { SEED, type ProcedureRun, type StepRecord } from './procedures';

/** The judge's model (cheap; the records are plain text). */
export const JUDGE_MODEL = 'claude-haiku-4-5';
/**
 * Bump when the prompt, the rendering or the request changes in a way that should invalidate the
 * cache (4: temperature 0, and each verdict keeps its cost).
 */
export const JUDGE_VERSION = 4;

/** A judge's verdict on one procedure. */
export type VerdictKind = 'reached' | 'not_reached' | 'unclear';

/** A verdict with its reason. */
export interface Verdict {
	/** From the three answers below ({@link verdictOf}). */
	readonly verdict: VerdictKind;
	/** Whether the records show the goal happened. */
	readonly shown: 'yes' | 'no' | 'cannot_tell';
	/** The goal acts on something the start lacks. */
	readonly startLacks: boolean;
	/** The goal is about something the replica does not model. */
	readonly outsideReplica: boolean;
	readonly reason: string;
	/** The judge's quote from the records its verdict rests on. */
	readonly evidence: string;
	/** Whether that quote is really in the records (a check against judging the wrong procedure). */
	readonly quoted: boolean;
	readonly model: string;
	/** What judging it cost, in dollars: its request's cost shared by the verdicts kept from it. */
	readonly usd: number;
}

const Batch = z.object({
	verdicts: z.array(
		z.object({
			id: z.string().describe('The procedure id, e.g. "p3"'),
			evidence: z
				.string()
				.describe(
					"A short verbatim quote from this procedure's own records that the answer rests on"
				),
			shown: z
				.enum(['yes', 'no', 'cannot_tell'])
				.describe('Do the records show that the goal happened?'),
			start_lacks: z
				.boolean()
				.describe(
					'The goal acts on something the start does not have (see its content and now) and no precondition provided it'
				),
			outside_replica: z
				.boolean()
				.describe('The goal is about something the replica does not model (see the list)'),
			reason: z
				.string()
				.describe('One line: what in the records shows it, or what is missing or wrong')
		})
	)
});

/** The verdict the judge's answers add up to: shown, or not shown for a reason the replica has. */
export function verdictOf(answer: {
	readonly shown: 'yes' | 'no' | 'cannot_tell';
	readonly start_lacks: boolean;
	readonly outside_replica: boolean;
}): VerdictKind {
	if (answer.shown === 'yes') return 'reached';
	if (answer.shown === 'cannot_tell' || answer.start_lacks || answer.outside_replica) {
		return 'unclear';
	}
	return 'not_reached';
}

/** Text as quotes are compared: lower case, one space, no quote marks. */
const loose = (text: string) =>
	text
		.toLowerCase()
		.replace(/["'`“”‘’]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/** Whether the judge's quote is in the run's records (a few words of it at least). */
export function quotes(run: ProcedureRun, evidence: string): boolean {
	const records = loose(renderRun(run));
	const quote = loose(evidence);
	if (quote.length === 0) return false;
	if (records.includes(quote)) return true;
	// quoted with an ellipsis: every piece of three words or more must be there
	const pieces = quote
		.split(/…|\.\.\./)
		.map((p) => p.trim())
		.filter((p) => p.split(' ').length >= 3);
	return pieces.length > 0 && pieces.every((p) => records.includes(p));
}

export const JUDGE_SYSTEM = `You check procedures from a manual for the Teenage Engineering OP-XY (a synthesizer and sequencer) against a software replica of the device.

Each procedure has a goal and steps written as key combos: \`shift + M1\` means hold shift and press M1; \`→\` separates presses made one after the other; \`→ +\` keeps the earlier keys held; \`turn E2\` turns an encoder (E1–E4), \`click E1\` pushes one; \`hold com\` is a long press. Every step was played on the replica, and you get what the replica showed afterwards:
- "screens": the replica's screen as its screen reader describes it, every screen the step went through in order (the last is where it ended);
- "now": where the device stands (mode, selected track and its engine, page, what is open, shift and held keys, counting in, recording, playing); a count-in shows as "counting in" while it runs (a bar, longer than the second after each step), so recording without it had none;
- "LEDs": the step keys 1–16 and track keys T1–T8 (. off, d dim, w white, r red) and other lit keys;
- "changed": what changed in the replica's music and sound, in words (patterns and their notes, sounds, mix, tempo, scenes, song);
- "patterns": the patterns that changed, with their notes, steps with parameter locks and steps with step components counted;
- "also changed": other values of the replica's model that changed (paths in its state);
- "content" (at the start): what the selected track's pattern and the arrangement hold;
- "played as": the keys actually pressed where the combo named any of several keys (Tn, step n, key, E1…E4, M1/M2) or several of a plural (steps, keys); "picked" says why when it was not the first. A placeholder means any member: \`Tn\` is any track, so judge the goal for the one played;
- "turned": how far an encoder turned and why (a recipe's value, a word in the note, or four detents clockwise by default); "offers" lists screens across that encoder's range.
A procedure starts from a new project (track 1 is a drum track, whose engine "drum" is the drum sampler; track 3 a synth) unless it says it continues from another procedure; the preconditions say what was set up first and what could not be (anything outside the replica: cables, computers, other gear, sound coming in).

What the replica does not model, so its records cannot show it: sound; audio coming in (recording takes nothing); other devices, cables and computers (only the pages about them are drawn); the TE boot menu (holding com while switching on just starts the unit); the pitchbend strip and the volume knob; a battery meter in the screen's margin (the level shows only in the system settings' battery section).

For each procedure answer three questions:
- shown: do the records show that the goal happened? "yes" when the page, list, value or state the goal is about appears, or "changed"/"patterns" show the change it asks for (a goal that is only a navigation, "open", "switch to", "show", is shown when the screen or "now" shows that place); "no" when the steps ended somewhere else, the value never changed, a step had no effect where the goal needs one, or an error stopped a step; "cannot_tell" when the records are ambiguous. Where a combo allows several keys, the one "played as" shows is as good a way to follow it as any.
- start_lacks: does the goal act on something the start does not have that no precondition provided? For example notes to move, nudge, transpose, rotate, copy or clear; locks to glide between, copy or clear; a step recorded by mistake; a change to undo; playback to stop; a user preset; other scenes or songs. Check "content" and "now" at the start.
- outside_replica: is the goal about something the replica does not model (the list above)?
Answer each procedure only from its own records (between its tags); do not assume the device behaves differently. Quote the records you rely on in "evidence", word for word. Keep each reason to one line and name the step when one is at fault.`;

// ─── rendering a run as the judge reads it ─────────────────────────────────────────────────────

function renderStep(step: StepRecord, previousLeds: string): string {
	const lines = [`Step ${step.index}: \`${step.keys}\`${step.note ? ` (note: ${step.note})` : ''}`];
	if (step.played) lines.push(`  played as: \`${step.played}\``);
	for (const why of step.picked) lines.push(`  picked: ${why}`);
	for (const turn of step.turns) {
		lines.push(
			`  turned: ${turn.encoder} ${turn.detents > 0 ? '+' : ''}${turn.detents} detents (${turn.why})`
		);
		if (turn.missed) lines.push(`  missed: ${turn.missed}`);
		if (turn.offers) lines.push(`  offers: ${turn.offers.map((o) => `"${o}"`).join(', ')}`);
	}
	for (const f of step.followed) lines.push(`  followed the note: ${f}`);
	lines.push(`  screens: ${step.screens.map((s) => `"${s}"`).join(' → ')}`);
	lines.push(`  now: ${step.context}`);
	if (step.leds !== previousLeds) lines.push(`  LEDs: ${step.leds}`);
	if (step.changes.length) lines.push(`  changed: ${step.changes.join('; ')}`);
	if (step.patterns.length) lines.push(`  patterns: ${step.patterns.join('; ')}`);
	if (step.model.length) lines.push(`  also changed: ${step.model.join('; ')}`);
	if (step.set) {
		const reads = step.set.reads === null ? 'cannot be read' : step.set.reads ? 'yes' : 'no';
		lines.push(`  recipe setting ${step.set.what}: the replica reads it afterwards: ${reads}`);
	}
	if (!step.effect) lines.push('  (nothing changed)');
	for (const e of step.errors) lines.push(`  problem: ${e.kind}: ${e.detail}`);
	return lines.join('\n');
}

/** A run as the judge reads it (also what its cache key is made of). */
export function renderRun(run: ProcedureRun): string {
	const lines = [`Unit: ${run.unitTitle} (${run.unit})`, `Goal: ${run.goal}`];
	if (run.result) lines.push(`The manual says the result is: ${run.result}`);
	for (const p of run.preconditions) {
		const holds = p.holds === null ? '' : p.holds ? ' (holds)' : ' (did NOT hold)';
		lines.push(`Precondition "${p.text}": ${p.kind}, ${p.how}${holds}`);
	}
	const origin = run.start.after
		? `continues where ${run.start.after} ended`
		: run.start.seeded
			? `a new project, ${SEED}`
			: 'a new project';
	lines.push(
		`Start: ${origin}; screen "${run.start.screen}"; now: ${run.start.context}; LEDs: ${run.start.leds}; content: ${run.start.content}`
	);
	let leds = run.start.leds;
	for (const step of run.steps) {
		lines.push(renderStep(step, leds));
		leds = step.leds;
	}
	return lines.join('\n');
}

// ─── the cache ─────────────────────────────────────────────────────────────────────────────────

interface CacheFile {
	readonly version: number;
	readonly entries: Record<string, Verdict>;
}

/** Verdicts by the hash of what was judged, kept in a JSON file. */
export class VerdictCache {
	readonly #path: string;
	readonly #entries: Record<string, Verdict>;

	constructor(path: string) {
		this.#path = path;
		let entries: Record<string, Verdict> = {};
		if (existsSync(path)) {
			try {
				const file = JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
				if (file.version === JUDGE_VERSION) entries = file.entries;
			} catch {
				// a broken cache is rebuilt
			}
		}
		this.#entries = entries;
	}

	get(key: string): Verdict | undefined {
		return this.#entries[key];
	}

	set(key: string, verdict: Verdict): void {
		this.#entries[key] = verdict;
	}

	save(): void {
		mkdirSync(dirname(this.#path), { recursive: true });
		const file: CacheFile = { version: JUDGE_VERSION, entries: this.#entries };
		writeFileSync(this.#path, `${JSON.stringify(file, null, 1)}\n`);
	}
}

/** The cache key of a run for a model: what the judge would read, with the prompt. */
export function verdictKey(run: ProcedureRun, model: string): string {
	return createHash('sha256')
		.update(JSON.stringify([JUDGE_VERSION, model, JUDGE_SYSTEM, renderRun(run)]))
		.digest('hex')
		.slice(0, 24);
}

// ─── judging ───────────────────────────────────────────────────────────────────────────────────

/** What judging cost and did. */
export interface JudgeStats {
	requests: number;
	cached: number;
	judged: number;
	usd: number;
	failed: number;
}

/** Options for {@link judgeRuns}. */
export interface JudgeOptions {
	readonly model?: string;
	/** Procedures per request. */
	readonly batch?: number;
	/** Requests at once. */
	readonly concurrency?: number;
	/** Stop asking once the spend passes this many dollars. */
	readonly budget?: number;
	readonly cache: VerdictCache;
	readonly log?: (line: string) => void;
}

async function askBatch(
	client: Anthropic,
	model: string,
	runs: readonly ProcedureRun[]
): Promise<{ verdicts: Map<number, Omit<Verdict, 'model' | 'usd'>>; usd: number; model: string }> {
	const content = [
		`Judge these ${runs.length} procedures. Answer with one verdict per id.`,
		...runs.map((run, i) => `<procedure id="p${i + 1}">\n${renderRun(run)}\n</procedure>`)
	].join('\n\n');
	const response = await client.messages.parse({
		model,
		max_tokens: 4_000,
		// a judge: the same records should get the same answer (Haiku 4.5 still takes it)
		temperature: 0,
		system: JUDGE_SYSTEM,
		messages: [{ role: 'user', content }],
		output_config: { format: zodOutputFormat(Batch) }
	});
	const verdicts = new Map<number, Omit<Verdict, 'model' | 'usd'>>();
	for (const v of response.parsed_output?.verdicts ?? []) {
		const i = Number(/^p(\d+)$/.exec(v.id.trim())?.[1]) - 1;
		if (i >= 0 && i < runs.length && !verdicts.has(i)) {
			const evidence = v.evidence.trim();
			verdicts.set(i, {
				verdict: verdictOf(v),
				shown: v.shown,
				startLacks: v.start_lacks,
				outsideReplica: v.outside_replica,
				reason: v.reason.trim(),
				evidence,
				quoted: quotes(runs[i], evidence)
			});
		}
	}
	return { verdicts, usd: usageCost(response.model, response.usage) ?? 0, model: response.model };
}

/** Runs `work` over `items`, `n` at a time. */
async function pool<T>(items: readonly T[], n: number, work: (item: T) => Promise<void>) {
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (next < items.length) await work(items[next++]);
		})
	);
}

/**
 * Verdicts for every run, from the cache where it has them and from the judge in batches
 * otherwise. A run the judge leaves out of its answer, or whose evidence it did not quote from
 * that run's own records (a sign it judged another), is asked again alone, once.
 */
export async function judgeRuns(
	client: Anthropic,
	runs: readonly ProcedureRun[],
	options: JudgeOptions
): Promise<{ verdicts: Map<string, Verdict>; stats: JudgeStats }> {
	const model = options.model ?? JUDGE_MODEL;
	const size = Math.max(1, options.batch ?? 6);
	const budget = options.budget ?? 3;
	const log = options.log ?? (() => {});
	const stats: JudgeStats = { requests: 0, cached: 0, judged: 0, usd: 0, failed: 0 };
	const verdicts = new Map<string, Verdict>();
	const todo: ProcedureRun[] = [];
	for (const run of runs) {
		const hit = options.cache.get(verdictKey(run, model));
		if (hit) {
			verdicts.set(run.ref, hit);
			stats.cached++;
		} else todo.push(run);
	}
	const batches: ProcedureRun[][] = [];
	for (let i = 0; i < todo.length; i += size) batches.push(todo.slice(i, i + size));
	const ask = async (batch: readonly ProcedureRun[], retry: boolean): Promise<void> => {
		if (stats.usd >= budget) {
			stats.failed += batch.length;
			log(`budget of $${budget} reached: ${batch.length} procedures left unjudged`);
			return;
		}
		stats.requests++;
		let answer: Awaited<ReturnType<typeof askBatch>>;
		try {
			answer = await askBatch(client, model, batch);
		} catch (error) {
			log(`judge request failed: ${error instanceof Error ? error.message : String(error)}`);
			if (retry) for (const run of batch) await ask([run], false);
			else stats.failed += batch.length;
			return;
		}
		stats.usd += answer.usd;
		// alone, a verdict is kept even with a loose quote (`quoted` says so)
		const kept = (i: number) => {
			const v = answer.verdicts.get(i);
			return v && (v.quoted || !retry || batch.length === 1) ? v : undefined;
		};
		const share = answer.usd / Math.max(1, batch.filter((_, i) => kept(i)).length);
		const missing: ProcedureRun[] = [];
		batch.forEach((run, i) => {
			const v = kept(i);
			if (!v) {
				missing.push(run);
				return;
			}
			const verdict: Verdict = { ...v, model: answer.model, usd: share };
			verdicts.set(run.ref, verdict);
			options.cache.set(verdictKey(run, model), verdict);
			stats.judged++;
		});
		options.cache.save();
		log(
			`judged ${batch.length - missing.length}/${batch.length} ($${stats.usd.toFixed(3)} so far)`
		);
		if (missing.length > 0) {
			if (retry) for (const run of missing) await ask([run], false);
			else stats.failed += missing.length;
		}
	};
	await pool(batches, Math.max(1, options.concurrency ?? 4), (batch) => ask(batch, true));
	return { verdicts, stats };
}
