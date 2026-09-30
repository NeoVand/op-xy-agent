/**
 * The manual verifier (docs/AGENT-V2.md, "the truth triangle", phase V2.8): the replica checks the
 * manual. Every procedure of our manual is played on the replica's simulator the way the app shows
 * it (`procedures.ts`) and a judge reads what the screens showed (`judge.ts`); every parameter
 * name is compared with the label the replica gives that encoder (`parameters.ts`). The report
 * lists every check (`evals/manual/out/report.json`) and, for the owner, every failure grouped by
 * unit (`docs/research/63-manual-verification.md`), with the precision measured on a sample
 * checked by hand (`evals/manual/sample.json`).
 *
 *   node evals/manual/verify.mjs [--units sequencer,howto.pluck] [--no-judge] [--batch 8]
 *        [--concurrency 4] [--budget 3] [--model claude-haiku-4-5] [--print]
 *
 * The judge uses the owner's key from $ANTHROPIC_API_KEY or .env (never printed).
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadManual, type ManualUnit } from '$lib/manual';
import { anthropicKey } from '../agent/key';
import {
	JUDGE_MODEL,
	JUDGE_VERSION,
	VerdictCache,
	judgeRuns,
	renderRun,
	type JudgeStats,
	type Verdict,
	type VerdictKind
} from './judge';
import { checkParameters, type ParameterCheck, type ParameterStatus } from './parameters';
import { SEED, runUnit, stepProblems, type ProcedureRun } from './procedures';

export const OUT_DIR = 'evals/manual/out';
export const REPORT_JSON = `${OUT_DIR}/report.json`;
export const CACHE_FILE = `${OUT_DIR}/judge-cache.json`;
export const REPORT_MD = 'docs/research/63-manual-verification.md';
export const SAMPLE_FILE = 'evals/manual/sample.json';

// ─── results ───────────────────────────────────────────────────────────────────────────────────

/** A procedure's check: the run, the judge's verdict and the deterministic problems. */
export interface ProcedureCheck {
	readonly ref: string;
	readonly unit: string;
	readonly unitTitle: string;
	readonly goal: string;
	readonly verdict: VerdictKind | 'unjudged';
	readonly reason: string | null;
	/** The judge's quote from the records, and whether it is really there. */
	readonly evidence: string | null;
	readonly quoted: boolean | null;
	/**
	 * A procedure not reached on a new project is run again on the seeded one (`SEED` in
	 * `procedures.ts`); the seeded run stands where it reaches the goal (`onNewProject` then keeps
	 * the first verdict), and otherwise the new project's does (`onSeeded` keeps the second).
	 */
	readonly onNewProject: OtherVerdict | null;
	readonly onSeeded: OtherVerdict | null;
	/** Found without the judge: combos that do not parse, controls the replica ignores, … */
	readonly problems: readonly string[];
	/** Not reached, or a problem that kept a step from being played as the app plays it. */
	readonly failed: boolean;
	readonly run: ProcedureRun;
}

/** The verdict of the start that does not stand (see {@link ProcedureCheck.onNewProject}). */
export interface OtherVerdict {
	readonly verdict: VerdictKind;
	readonly reason: string;
}

/** What a person found checking a flagged item by hand. */
export type Finding = 'manual' | 'replica' | 'verifier' | 'judge';

/** One hand-checked item of `sample.json`. */
export interface SampleItem {
	/** A procedure's `unit#id`, or a parameter's `unit screen/layer/encoder`. */
	readonly ref: string;
	readonly finding: Finding;
	/** What is wrong and what to do, in our words. */
	readonly note: string;
}

/** The hand-checked sample. */
export interface Sample {
	readonly procedures: readonly SampleItem[];
	readonly parameters: readonly SampleItem[];
	/** Found while checking by hand, on procedures the verifier did not flag. */
	readonly observations: readonly SampleItem[];
}

/** The whole report. */
export interface Report {
	readonly generated: string;
	readonly manual: { readonly bundleHash: string; readonly units: number };
	readonly judge: {
		readonly model: string;
		readonly version: number;
		/** This run's requests (cached verdicts cost nothing). */
		readonly stats: JudgeStats;
		/** What every verdict in the report cost when it was judged, cached or not, in dollars. */
		readonly cost: number;
	} | null;
	readonly procedures: readonly ProcedureCheck[];
	readonly parameters: readonly ParameterCheck[];
}

/** A parameter check's reference, as the sample writes it. */
export const parameterRef = (p: ParameterCheck) => `${p.unit} ${p.screen}/${p.layer}/${p.encoder}`;

/** Parameter statuses that ask for a person's attention. */
const PARAMETER_FLAGS: readonly ParameterStatus[] = [
	'mismatch',
	'missing',
	'unreachable',
	'unmapped',
	'review'
];

/** Whether a check asks for a person's attention. */
export const isFlagged = (c: ProcedureCheck | ParameterCheck) =>
	'status' in c ? PARAMETER_FLAGS.includes(c.status) : c.failed;

/**
 * A procedure's check from its run and verdict. It fails when the judge saw the goal not reached,
 * or a step could not be played as written (a combo that does not parse, a control the simulator
 * ignores, a recipe setting it does not read); a switch the animation cannot press is played into
 * the simulator and only noted.
 */
export function procedureCheck(
	run: ProcedureRun,
	verdict: Verdict | undefined,
	other: { readonly newProject?: Verdict; readonly seeded?: Verdict } = {}
): ProcedureCheck {
	const problems = stepProblems(run);
	const v = verdict?.verdict ?? 'unjudged';
	const brief = (o: Verdict | undefined) => (o ? { verdict: o.verdict, reason: o.reason } : null);
	return {
		ref: run.ref,
		unit: run.unit,
		unitTitle: run.unitTitle,
		goal: run.goal,
		verdict: v,
		reason: verdict?.reason ?? null,
		evidence: verdict?.evidence ?? null,
		quoted: verdict?.quoted ?? null,
		onNewProject: brief(other.newProject),
		onSeeded: brief(other.seeded),
		problems,
		failed: v === 'not_reached' || problems.some((p) => !p.includes(': not-animated:')),
		run
	};
}

// ─── the markdown report ───────────────────────────────────────────────────────────────────────

/** A table cell: one line, pipes escaped, long text cut. */
function cell(text: string | null | undefined, max = 220): string {
	const flat = (text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const count = <T>(items: readonly T[], test: (item: T) => boolean) => items.filter(test).length;

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((100 * n) / of)} %`);

const VERDICT_WORDS: Readonly<Record<ProcedureCheck['verdict'], string>> = {
	reached: 'reached',
	not_reached: 'not reached',
	unclear: 'unclear',
	unjudged: 'not judged'
};

const FINDING_WORDS: Readonly<Record<Finding, string>> = {
	manual: 'manual',
	replica: 'replica',
	verifier: 'verifier',
	judge: 'judge'
};

/** The step a failing procedure went wrong at, as the judge or the problems name it. */
function failingStep(c: ProcedureCheck): string {
	const named = /\bstep (\d+)\b/i.exec(`${c.reason ?? ''} ${c.problems.join(' ')}`);
	const step = named ? c.run.steps[Number(named[1]) - 1] : undefined;
	return step ? `step ${step.index} \`${step.keys}\`` : '';
}

/** What the replica showed where a failing procedure went wrong: its last screen there. */
function shown(c: ProcedureCheck): string {
	const named = /\bstep (\d+)\b/i.exec(`${c.reason ?? ''} ${c.problems.join(' ')}`);
	const step = c.run.steps[(named ? Number(named[1]) : c.run.steps.length) - 1];
	return step ? `"${step.screens[step.screens.length - 1]}"` : '';
}

/** The report for the owner, compact: totals, the sample, then every failure by unit. */
export function renderMarkdown(report: Report, sample: Sample): string {
	const procs = report.procedures;
	const params = report.parameters;
	const judged = procs.filter((p) => p.verdict !== 'unjudged');
	const flaggedProcs = procs.filter(isFlagged);
	const flaggedParams = params.filter(isFlagged);
	const byRef = new Map(procs.map((p) => [p.ref, p]));
	const byParam = new Map(params.map((p) => [parameterRef(p), p]));
	const flaggedRef = (ref: string) => {
		const check = byRef.get(ref) ?? byParam.get(ref);
		return check !== undefined && isFlagged(check);
	};
	const sampled = [...sample.procedures, ...sample.parameters].filter((s) => flaggedRef(s.ref));
	const found = (f: Finding) => count(sampled, (s) => s.finding === f);
	const read = new Map([...sample.procedures, ...sample.parameters].map((s) => [s.ref, s]));
	const status = (s: ParameterStatus) => count(params, (p) => p.status === s);
	const problemKinds = (kind: string) =>
		count(procs, (p) => p.problems.some((x) => x.includes(`: ${kind}`)));
	const seededReached = count(procs, (p) => p.onNewProject !== null);
	const seededNot = count(procs, (p) => p.onSeeded !== null);
	const flaggedCount = flaggedProcs.length + flaggedParams.length;
	const which =
		sampled.length === flaggedCount
			? `all ${sampled.length} flagged items, checked by hand`
			: `a hand-checked sample of ${sampled.length} of the ${flaggedCount} flagged items`;
	const precision =
		sampled.length === 0
			? 'No flagged item has been checked by hand yet, so the precision is not known.'
			: `**Precision, measured on ${which}: ${pct(found('manual'), sampled.length)}** (${found('manual')} are real problems in the manual); counting the ${found('replica')} that ${found('replica') === 1 ? 'is' : 'are'} the replica’s own, ${pct(found('manual') + found('replica'), sampled.length)} of the flags point at something worth fixing. The rest are the verifier’s limits (${found('verifier')}) and the judge’s misreadings (${found('judge')}).${sample.observations.length ? ` Replaying them also turned up ${sample.observations.length} notes on procedures the verifier did not flag (after the flags).` : ''}`;
	const out: string[] = [];
	out.push('# 63 — The manual checked on the replica');
	out.push('');
	out.push(
		`> Generated by \`node evals/manual/verify.mjs\` on ${report.generated.slice(0, 10)} (manual bundle \`${report.manual.bundleHash}\`, ${report.manual.units} units${report.judge ? `, judge ${report.judge.model}` : ''}). Do not edit by hand: rerun it, and record hand checks in \`evals/manual/sample.json\`. Everything below is our words: our manual’s goals and combos, the simulator’s screen descriptions and the judge’s reasons.`
	);
	out.push('');
	out.push(
		'The truth triangle of `docs/AGENT-V2.md`: the device checks the replica, the replica checks the manual. Each of the manual’s procedures is played on the replica’s simulator the way the app shows it (the replica’s key animation driving the simulator), from a new project with its preconditions set up where a small table knows how; a recipe continues from its previous procedure, and a procedure not reached is played once more on a project with something to act on. After each step the verifier writes down every screen, where the device stands, the LEDs and what changed in the model; Claude Haiku reads that and says whether the goal was reached. Each parameter row is checked on the page it names: the replica’s label for that encoder and layer against the manual’s name. A flag is a place where the manual and the replica disagree; either may be wrong, so each needs a verdict.'
	);
	out.push('');
	out.push(precision);
	out.push('');
	out.push('## Totals');
	out.push('');
	out.push('| check | total | result |');
	out.push('| --- | --- | --- |');
	out.push(
		`| procedures run | ${procs.length} | ${count(judged, (p) => p.verdict === 'reached')} reached, ${count(judged, (p) => p.verdict === 'not_reached')} not reached, ${count(judged, (p) => p.verdict === 'unclear')} unclear${procs.length > judged.length ? `, ${procs.length - judged.length} not judged` : ''} |`
	);
	out.push(
		`| run again on the seeded project | ${seededReached + seededNot} | ${seededReached} reached there, where the seed changed what the steps did (that run stands); ${seededNot} did not (the new project’s run stands) |`
	);
	out.push(
		`| procedure steps | ${procs.reduce((n, p) => n + p.run.steps.length, 0)} | ${problemKinds('parse')} procedures with a combo that does not parse, ${problemKinds('unknown-control')} with a control the replica ignores, ${problemKinds('not-animated')} with one its animation cannot press, ${count(procs, (p) => p.problems.some((x) => x.includes('does not read') || x.includes('no number of detents')))} with a recipe setting the replica does not read |`
	);
	out.push(
		`| parameters | ${params.length} | ${status('match')} match, ${status('close')} close (one name contains the other), ${status('mismatch')} mismatch, ${status('missing')} missing, ${status('unlabelled')} unlabelled, ${status('review')} clicks to review, ${status('unreachable') + status('unmapped')} pages not reached |`
	);
	out.push(
		`| flagged for a verdict | ${flaggedProcs.length + flaggedParams.length} | ${flaggedProcs.length} procedures, ${flaggedParams.length} parameters |`
	);
	if (report.judge) {
		const s = report.judge.stats;
		out.push(
			`| verdicts of the judge | ${s.cached + s.judged} | $${report.judge.cost.toFixed(2)} for all of them when judged (a run from an empty cache pays a little more, for answers asked again); this run judged ${s.judged} in ${s.requests} requests for $${s.usd.toFixed(2)} and took ${s.cached} from the cache${s.failed ? `, ${s.failed} failed` : ''} |`
		);
	}
	out.push('');
	out.push('## Precision: the flags checked by hand');
	out.push('');
	if (sampled.length === 0) {
		out.push('No flagged item has been checked by hand yet (`evals/manual/sample.json`).');
	} else {
		out.push(
			`Each item was read against its unit, replayed on the simulator step by step and, where the simulator decides, checked in its code. “Manual”: the manual is wrong or leaves something out; “replica”: the replica differs from what the manual rightly says, or cannot show it; “verifier” and “judge”: this tool’s own limits.`
		);
		out.push('');
		out.push('| item | flagged as | by hand | why |');
		out.push('| --- | --- | --- | --- |');
		for (const s of sampled) {
			const p = byRef.get(s.ref);
			const q = byParam.get(s.ref);
			const as = p
				? VERDICT_WORDS[p.verdict] + (p.problems.length ? ', problem' : '')
				: (q?.status ?? '');
			out.push(
				`| \`${cell(s.ref, 80)}\` | ${as} | ${FINDING_WORDS[s.finding]} | ${cell(s.note, 600)} |`
			);
		}
	}
	out.push('');
	out.push('## Procedures flagged, by unit');
	out.push('');
	out.push(
		'Not reached by the judge, or a step the replica could not play as the app plays it. “By hand” is filled where the sample covers the item; the last column is for the owner (manual wrong, replica wrong, or check on the unit).'
	);
	out.push('');
	out.push('| unit | procedure: goal | the replica showed | judge | by hand | verdict |');
	out.push('| --- | --- | --- | --- | --- | --- |');
	let unit = '';
	for (const c of flaggedProcs) {
		const first = c.unit !== unit;
		unit = c.unit;
		const where = failingStep(c);
		const seeded = c.onSeeded ? ` (seeded project: ${VERDICT_WORDS[c.onSeeded.verdict]})` : '';
		const showedText = [c.reason, ...c.problems].filter(Boolean).join('; ');
		const mine = read.get(c.ref);
		out.push(
			`| ${first ? `\`${c.unit}\`` : ''} | \`#${c.run.procedure}\` ${cell(c.goal, 90)}${where ? ` (${where})` : ''} | ${cell(showedText, 240)} ${cell(shown(c), 120)} | ${VERDICT_WORDS[c.verdict]}${seeded} | ${mine ? `${FINDING_WORDS[mine.finding]}: ${cell(mine.note, 200)}` : ''} | |`
		);
	}
	out.push('');
	out.push('## Parameter names flagged');
	out.push('');
	out.push(
		'| unit | screen / layer / encoder | the manual | the replica | status | by hand | verdict |'
	);
	out.push('| --- | --- | --- | --- | --- | --- | --- |');
	for (const p of flaggedParams) {
		const mine = read.get(parameterRef(p));
		out.push(
			`| \`${p.unit}\` | ${p.screen} / ${p.layer} / ${p.encoder} | ${cell(p.name, 60)} | ${cell(p.label ?? p.does ?? p.detail, 140)} | ${p.status} | ${mine ? `${FINDING_WORDS[mine.finding]}: ${cell(mine.note, 200)}` : ''} | |`
		);
	}
	out.push('');
	if (sample.observations.length > 0) {
		out.push('## Noticed by hand, not flagged');
		out.push('');
		out.push(
			'Found while replaying the flagged items: procedures the verifier passed, or could not see go wrong, that still look wrong or incomplete, or that passed for the wrong reason.'
		);
		out.push('');
		out.push('| procedure | judge | by hand | verdict |');
		out.push('| --- | --- | --- | --- |');
		for (const o of sample.observations) {
			const c = byRef.get(o.ref);
			out.push(
				`| \`${cell(o.ref, 80)}\` | ${c ? VERDICT_WORDS[c.verdict] : ''} | ${FINDING_WORDS[o.finding]}: ${cell(o.note, 400)} | |`
			);
		}
		out.push('');
	}
	const close = params.filter((p) => p.status === 'close' || p.status === 'unlabelled');
	out.push(
		`<details><summary>Parameters that agree in substance (${close.length}: one name contains the other, or the page names no encoder)</summary>`
	);
	out.push('');
	out.push('| unit | screen / layer / encoder | the manual | the replica |');
	out.push('| --- | --- | --- | --- |');
	for (const p of close) {
		out.push(
			`| \`${p.unit}\` | ${p.screen} / ${p.layer} / ${p.encoder} | ${cell(p.name, 60)} | ${cell(p.label ?? p.detail, 140)} |`
		);
	}
	out.push('');
	out.push('</details>');
	out.push('');
	const unclear = procs.filter((p) => p.verdict === 'unclear' && !p.failed);
	out.push(
		`<details><summary>Procedures the replica cannot show (${unclear.length}, judged unclear)</summary>`
	);
	out.push('');
	out.push('| procedure | why |');
	out.push('| --- | --- |');
	for (const c of unclear) out.push(`| \`${c.ref}\` | ${cell(c.reason, 200)} |`);
	out.push('');
	out.push('</details>');
	out.push('');
	out.push('## How it plays a procedure, and its limits');
	out.push('');
	out.push(
		[
			'- **The app’s path.** Each step’s combo goes through `ReplicaState.animate` with the replica observed into `OpxySim.input`, as in the app, on a clock of the verifier’s own (the page clock’s frames, a second to read the screen after each step). The one exception: the animation only highlights the power switch, so a combo with `power` is played into the simulator directly and noted.',
			'- **Choices a person makes.** A placeholder, range or alternative (`Tn`, `step n`, `key`, `E1…E4`, `M2/M3`) is played as its first candidate, and different placeholders get different keys. A candidate that changes nothing (tried on a copy of the simulator) is passed over for the next on a procedure’s last step, where its note asks for another key (a destination, another track), and for a key, step or scene placeholder on any step; a track key chosen earlier stays, since the next steps carry on with it. A plural is one member, except held together while another key is pressed (`keys + step n`: a triad) or where its note says “both” or “every other”. A turn is four detents clockwise unless the step says more: a recipe’s `set` turns until the navigator reads the value, a note that names a position (“until cv shows”, “highlight duck”) turns to the nearest position showing it, “counter-clockwise” and “fully” are followed. Five conditions in notes are followed as written (“press it again if the page shows off”, “click an encoder until the filter envelope is in front”, …).',
			`- **Preconditions** are set up from a small table in \`procedures.ts\` (modes, pages, playing, a player, the value LFO, a drum or non-sampler track, notes in the pattern, scenes, the power off); the rest are listed as outside the replica (cables, computers, other gear, sound coming in) or not set up. A recipe (\`howto\`) runs as one sequence. A procedure not reached on a new project is played again on a seeded one (${SEED}); that run stands only where it reaches the goal and its steps did something the first run’s did not, so the seed can clear a flag but never raise one, and a second reading of the same evidence does not count.`,
			'- **The judge** (Claude Haiku 4.5 at temperature 0, structured output, several procedures a request) answers three questions from a procedure’s own records: do they show the goal reached; did the start lack what the goal acts on; does the goal lie outside what the replica models. Yes to the first is reached, yes to another is unclear, otherwise not reached. It quotes its evidence from the records; an answer whose quote is not in them (a mix-up between the procedures of one request) is asked again alone. What a record cannot show once it is over is written out: a step that starts recording says whether it counted in. Answers are cached by a hash of the prompt and the records, so a rerun pays only for what changed.',
			'- **What cannot be judged here.** The replica has no sound for the judge, no audio input, no other gear and no files on a computer; such goals come out unclear. It draws no TE boot menu, so the procedures of units on it are marked unclear without asking the judge. It is the simulator’s behaviour that is checked: where the simulator follows our manual rather than a capture of the device, agreement proves little, and a flag can be the simulator’s fault. Misses are not measured: the sample checks flags, not the procedures judged reached, and the notes after the flags show that a small judge sometimes passes a procedure for the wrong reason.',
			'- **Parameters** are compared by name only (not ranges or CCs). On pages of the device map the label is the map’s; a click is compared with what it does, because the map names clicks in the manual’s own words. List pages (system settings, the sample library) name no encoders and come out unlabelled.'
		].join('\n')
	);
	out.push('');
	return out.join('\n');
}

// ─── running ───────────────────────────────────────────────────────────────────────────────────

/** A seeded `Math.random`, so the simulator's random parts repeat run to run (and cache hits do). */
function seedRandom(seed: number): void {
	let s = seed >>> 0;
	Math.random = () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Every procedure of the units, run on the replica (the refs in `seed` on the seeded project). */
export function runProcedures(
	units: readonly ManualUnit[],
	seed: ReadonlySet<string> = new Set()
): ProcedureRun[] {
	return units.filter((u) => u.procedures.length > 0).flatMap((u) => runUnit(u, seed));
}

/**
 * The procedures to run again on the seeded project: every one the judge did not see reach its
 * goal on a new project, which may have lacked what the goal acts on (a recipe carries its own
 * material and is never seeded).
 */
export function needsSeed(runs: readonly ProcedureRun[], verdicts: ReadonlyMap<string, Verdict>) {
	return new Set(
		runs
			.filter((run) => {
				const v = verdicts.get(run.ref);
				return (
					v !== undefined &&
					v.verdict !== 'reached' &&
					!run.outside &&
					!run.unit.startsWith('howto.')
				);
			})
			.map((run) => run.ref)
	);
}

/** The verdict of a procedure on a screen the replica does not draw: unclear, without the judge. */
export function outsideVerdict(run: ProcedureRun): Verdict {
	return {
		verdict: 'unclear',
		shown: 'cannot_tell',
		startLacks: false,
		outsideReplica: true,
		reason: `It works in ${run.outside ?? 'something the replica does not draw'}; not judged.`,
		evidence: '',
		quoted: true,
		model: 'none',
		usd: 0
	};
}

/** What a run's steps did, apart from where it started: the screens, the changes, the model's diff. */
const didWhat = (run: ProcedureRun) =>
	JSON.stringify(run.steps.map((s) => [s.screens, s.changes, s.patterns, s.model]));

/**
 * Whether a seeded run's verdict replaces the new project's: only where it reaches the goal and its
 * steps did something the new project's did not (the seed mattered). On the same evidence, a second
 * reading by the judge is no better than the first.
 */
export function seedStands(first: ProcedureRun, seeded: ProcedureRun, verdict: Verdict): boolean {
	return verdict.verdict === 'reached' && didWhat(first) !== didWhat(seeded);
}

/** What the verdicts cost when judged: the standing ones and the ones set aside. */
function costOf(
	verdicts: ReadonlyMap<string, Verdict>,
	others: ReadonlyMap<string, { newProject?: Verdict; seeded?: Verdict }>
): number {
	const all = [
		...verdicts.values(),
		...[...others.values()].flatMap((o) => [o.newProject, o.seeded])
	];
	return all.reduce((sum, v) => sum + (v?.usd ?? 0), 0);
}

function readSample(): Sample {
	if (!existsSync(SAMPLE_FILE)) return { procedures: [], parameters: [], observations: [] };
	const file = JSON.parse(readFileSync(SAMPLE_FILE, 'utf8')) as Partial<Sample>;
	return {
		procedures: file.procedures ?? [],
		parameters: file.parameters ?? [],
		observations: file.observations ?? []
	};
}

export async function main(argv: readonly string[]): Promise<void> {
	const flag = (name: string) => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const only = flag('--units')?.split(',');
	const judge = !argv.includes('--no-judge');
	const model = flag('--model') ?? JUDGE_MODEL;
	seedRandom(63);
	const manual = loadManual();
	const units = manual.units.filter(
		(u) => !only || only.some((o) => u.id === o || u.id.startsWith(`${o}.`) || u.area === o)
	);
	const t0 = performance.now();
	let runs = runProcedures(units);
	console.log(`${runs.length} procedures run in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
	// procedures on a screen the replica does not draw are unclear without asking
	const verdicts = new Map<string, Verdict>(
		runs.filter((run) => run.outside).map((run) => [run.ref, outsideVerdict(run)])
	);
	/** For the procedures run again on the seeded project, the verdict that does not stand. */
	const others = new Map<string, { newProject?: Verdict; seeded?: Verdict }>();
	let stats: JudgeStats | null = null;
	if (judge) {
		const client = new Anthropic({ apiKey: anthropicKey(), maxRetries: 3 });
		const cache = new VerdictCache(CACHE_FILE);
		const budget = Number(flag('--budget') ?? 3);
		const ask = (these: readonly ProcedureRun[], spent: number) =>
			judgeRuns(client, these, {
				model,
				cache,
				batch: Number(flag('--batch') ?? 6),
				concurrency: Number(flag('--concurrency') ?? 4),
				budget: budget - spent,
				log: (line) => console.log(`  ${line}`)
			});
		const first = await ask(
			runs.filter((run) => !run.outside),
			0
		);
		for (const [ref, v] of first.verdicts) verdicts.set(ref, v);
		stats = first.stats;
		// maybe nothing to act on in a new project: once more on one with patterns and scenes,
		// which stands only where it reaches the goal
		const seed = needsSeed(runs, verdicts);
		if (seed.size > 0) {
			const again = runProcedures(units, seed).filter((run) => seed.has(run.ref));
			const second = await ask(again, stats.usd);
			let reached = 0;
			for (const run of again) {
				const v = second.verdicts.get(run.ref);
				const first = verdicts.get(run.ref);
				const firstRun = runs.find((r) => r.ref === run.ref);
				if (!v || !first || !firstRun) continue;
				if (seedStands(firstRun, run, v)) {
					reached++;
					others.set(run.ref, { newProject: first });
					verdicts.set(run.ref, v);
					runs = runs.map((r) => (r.ref === run.ref ? run : r));
				} else {
					others.set(run.ref, { seeded: v });
				}
			}
			for (const key of ['requests', 'cached', 'judged', 'failed', 'usd'] as const) {
				stats[key] += second.stats[key];
			}
			console.log(
				`  ${seed.size} procedures run again on the seeded project, ${reached} reached there as the seed let them`
			);
		}
		console.log(
			`judge ${model}: ${stats.cached} cached, ${stats.judged} judged in ${stats.requests} requests, $${stats.usd.toFixed(3)}${stats.failed ? `, ${stats.failed} failed` : ''}`
		);
	}
	const t1 = performance.now();
	const parameters = checkParameters(units);
	console.log(
		`${parameters.length} parameters checked in ${((performance.now() - t1) / 1000).toFixed(1)} s`
	);
	const report: Report = {
		generated: new Date().toISOString(),
		manual: { bundleHash: manual.bundle_hash, units: units.length },
		judge: stats ? { model, version: JUDGE_VERSION, stats, cost: costOf(verdicts, others) } : null,
		procedures: runs.map((run) => procedureCheck(run, verdicts.get(run.ref), others.get(run.ref))),
		parameters
	};
	mkdirSync(dirname(REPORT_JSON), { recursive: true });
	writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 1)}\n`);
	console.log(`wrote ${REPORT_JSON}`);
	// the owner's report covers the whole manual: a partial run only writes the JSON
	if (!only && judge) {
		writeFileSync(REPORT_MD, renderMarkdown(report, readSample()));
		console.log(`wrote ${REPORT_MD} (run prettier on it before committing)`);
	}
	if (argv.includes('--print')) {
		for (const c of report.procedures.filter(isFlagged)) {
			console.log(`\n${c.ref}: ${c.verdict} — ${c.reason ?? ''}`);
			for (const p of c.problems) console.log(`  ${p}`);
			console.log(renderRun(c.run).replace(/^/gm, '    '));
		}
	}
	const flagged = report.procedures.filter(isFlagged).length;
	console.log(
		`\n${report.procedures.length} procedures: ${count(report.procedures, (p) => p.verdict === 'reached')} reached, ${count(report.procedures, (p) => p.verdict === 'not_reached')} not reached, ${count(report.procedures, (p) => p.verdict === 'unclear')} unclear, ${flagged} flagged; ${parameters.length} parameters: ${count(parameters, (p) => p.status === 'match' || p.status === 'close')} agree, ${count(parameters, isFlagged)} flagged`
	);
}
