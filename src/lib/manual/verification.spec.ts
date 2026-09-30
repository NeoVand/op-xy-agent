/**
 * The deterministic parts of the manual verifier (`evals/manual/`, docs/research/63): the
 * precondition table, playing a procedure through the replica's animation into the simulator and
 * writing down what it showed, the problems found without a judge, the parameter-name check, and
 * how verdicts are combined. The judge itself (a model) is not called here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ManualUnit } from '$lib/manual';
import type { DeviceMap } from '$lib/sim/device-map';
import { quotes, verdictOf, type Verdict } from '../../../evals/manual/judge';
import { checkParameters, compareClick, compareNames } from '../../../evals/manual/parameters';
import {
	Bench,
	preconditionRule,
	runProcedure,
	stepProblems,
	type ProcedureRun
} from '../../../evals/manual/procedures';
// with its extension: `verify.mjs`, the script that runs it, sits beside it and would win
import {
	procedureCheck,
	renderMarkdown,
	seedStands,
	type Report
} from '../../../evals/manual/verify.ts';

type Step = { keys: string; note?: string };

/** A unit of our own for the tests (only the fields the verifier reads). */
function unit(
	procedures: { id: string; steps: Step[]; preconditions?: string[] }[],
	parameters: { screen: string; encoder: string; layer: string; name: string }[] = [],
	id = 'test.unit'
): ManualUnit {
	return {
		id,
		title: 'A test unit',
		area: 'instrument',
		context: { modes: [], screens: [] },
		procedures: procedures.map((p) => ({
			goal: `the goal of ${p.id}`,
			preconditions: [],
			result: null,
			source: 'https://example.invalid/guide',
			...p
		})),
		parameters
	} as unknown as ManualUnit;
}

/** Plays one procedure of steps on a new project. */
function play(steps: Step[], preconditions: string[] = []): ProcedureRun {
	const u = unit([{ id: 'p', steps, preconditions }]);
	return runProcedure(new Bench(), u, u.procedures[0]);
}

const verdict = (v: Verdict['verdict'], reason = 'why'): Verdict => ({
	verdict: v,
	shown: v === 'reached' ? 'yes' : 'no',
	startLacks: false,
	outsideReplica: false,
	reason,
	evidence: '',
	quoted: true,
	model: 'test',
	usd: 0
});

describe('preconditions', () => {
	it('sets up modes, pages and playback it knows how to reach', () => {
		for (const text of [
			'instrument mode',
			'mix mode',
			'the midi section is open',
			'playback is running'
		]) {
			expect(preconditionRule(text)?.kind, text).toBe('set-up');
		}
	});

	it('knows what already holds, what lies outside the replica, and leaves the rest', () => {
		expect(preconditionRule('the track is selected')?.kind).toBe('already');
		expect(preconditionRule('a computer is connected by USB-C')?.kind).toBe('outside');
		expect(preconditionRule('the moon is full')).toBeNull();
	});

	it('starts a procedure where its precondition puts the device', () => {
		const run = play([{ keys: 'T2' }], ['mix mode', 'the moon is full']);
		expect(run.start.context).toMatch(/^mix mode, T1/);
		expect(run.preconditions.map((p) => [p.kind, p.holds])).toEqual([
			['set-up', true],
			['not-set-up', null]
		]);
		expect(run.steps[0].screens.at(-1)).toContain('instrument track 2');
	});
});

describe('playing a procedure the way the app shows it', () => {
	it('records the filter type list that shift + M3 opens', () => {
		const run = play([{ keys: 'shift + M3' }]);
		const [step] = run.steps;
		expect(step.screens).toContain('ladder');
		expect(step.context).toContain('filter type list open');
		expect(stepProblems(run)).toEqual([]);
	});

	it('reports a combo that does not parse', () => {
		const run = play([{ keys: 'shift + + M3' }]);
		expect(run.steps[0].errors.map((e) => e.kind)).toEqual(['parse']);
		expect(stepProblems(run)[0]).toMatch(/^step 1 `shift \+ \+ M3`: parse: /);
	});

	it('reports a control the simulator ignores', () => {
		const run = play([{ keys: 'turn volume' }]);
		expect(stepProblems(run)).toEqual([
			'step 1 `turn volume`: unknown-control: the simulator ignores volume'
		]);
	});

	it('says whether a recording counted in, which the screen cannot show afterwards', () => {
		const released = play([{ keys: 'record + play → play' }]).steps[0];
		const held = play([{ keys: 'record + play → + play' }]).steps[0];
		expect(released.context).toContain('recording began at once, with no count-in');
		expect(held.context).toContain('counting in');
		expect(held.context).toContain('recording began after a count-in');
	});

	it('plays held plural keys as a chord and "every other step" as eight steps', () => {
		const chord = play([{ keys: 'keys + step n' }]).steps[0];
		expect(chord.played).toBe('key F3 + key A3 + key C4 + step 1');
		expect(chord.patterns[0]).toContain('pitches none → 53 57 60');
		const hats = play([{ keys: 'key C#4 + record → + steps', note: 'press every other step' }])
			.steps[0];
		expect(hats.leds).toMatch(/^steps w\.w\.w\.w\.w\.w\.w\.w\.,/);
	});

	it('passes over a track key that changes nothing on the last step', () => {
		const step = play([{ keys: 'Tn' }]).steps[0];
		expect(step.played).toBe('T2');
		expect(step.picked[0]).toContain('`Tn` as `T1` changed nothing here');
	});
});

describe('parameter names', () => {
	it('compares names through synonyms and containment', () => {
		expect(compareNames('env amount', 'envelope amount').status).toBe('match');
		expect(compareNames('filter cutoff', 'cutoff').status).toBe('close');
		expect(compareNames('groove amount', 'swing').status).toBe('mismatch');
		expect(compareClick('reset', 'resets the value to 0').status).toBe('match');
		expect(compareClick('input on / off', 'mic off → on').status).toBe('review');
	});

	it('reads the labels of the filter page (M3) and reports a wrong name with both', () => {
		// the committed map, so the test does not build it (the checker walks the simulator there)
		const map = JSON.parse(readFileSync('knowledge/opxy/device-map.json', 'utf8')) as DeviceMap;
		const filter = unit(
			[],
			[
				{ screen: 'M3', encoder: 'E1', layer: 'base', name: 'cutoff' },
				{ screen: 'M3', encoder: 'E4', layer: 'base', name: 'drive' }
			],
			'instrument.filter'
		);
		const [cutoff, drive] = checkParameters([filter], map);
		expect(cutoff).toMatchObject({ status: 'match', label: 'cutoff', page: 'instrument.m3' });
		expect(drive).toMatchObject({ status: 'mismatch', name: 'drive', label: 'key tracking' });
		expect(drive.detail).toBe('the manual says "drive", the replica "key tracking"');
	});
});

describe('verdicts', () => {
	it('turns the three answers into a verdict', () => {
		const answer = { shown: 'no', start_lacks: false, outside_replica: false } as const;
		expect(verdictOf({ ...answer, shown: 'yes' })).toBe('reached');
		expect(verdictOf(answer)).toBe('not_reached');
		expect(verdictOf({ ...answer, start_lacks: true })).toBe('unclear');
		expect(verdictOf({ ...answer, shown: 'cannot_tell' })).toBe('unclear');
	});

	it('accepts evidence only when it is quoted from the procedure’s own records', () => {
		const run = play([{ keys: 'shift + M3' }]);
		expect(quotes(run, 'now: instrument mode, T1 (drum), M3, filter type list open')).toBe(true);
		expect(quotes(run, 'now: mix mode, T2 (drum), M1')).toBe(false);
	});

	it('lets a seeded run stand only where the seed changed what the steps did', () => {
		const empty = play([{ keys: 'shift + M3' }]);
		const other = play([{ keys: 'T2' }]);
		expect(seedStands(empty, other, verdict('reached'))).toBe(true);
		expect(seedStands(empty, empty, verdict('reached'))).toBe(false);
		expect(seedStands(empty, other, verdict('not_reached'))).toBe(false);
	});

	it('writes the owner’s report with the failures, the hand check and a verdict column', () => {
		const run = play([{ keys: 'turn volume' }]);
		const check = procedureCheck(run, verdict('not_reached', 'step 1 changed nothing'));
		const report: Report = {
			generated: '2026-09-30T00:00:00.000Z',
			manual: { bundleHash: 'test', units: 1 },
			judge: null,
			procedures: [check],
			parameters: []
		};
		const md = renderMarkdown(report, {
			procedures: [{ ref: check.ref, finding: 'manual', note: 'a wrong key' }],
			parameters: [],
			observations: []
		});
		expect(check.failed).toBe(true);
		expect(md).toContain('**Precision, measured on all 1 flagged items, checked by hand: 100 %**');
		expect(md).toContain(
			'| unit | procedure: goal | the replica showed | judge | by hand | verdict |'
		);
		expect(md).toContain('| `test.unit` | `#p` the goal of p (step 1 `turn volume`)');
		expect(md).toContain('manual: a wrong key | |');
	});
});
