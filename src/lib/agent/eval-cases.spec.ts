// The agent eval's cases (evals/agent/cases) stay well-formed: unique ids, required facts, key
// combos that parse in the key grammar and are written in its canonical spelling (the runner drops
// combos it cannot parse, which would silently weaken a case), and official sources to check against.
import { describe, expect, it } from 'vitest';
import { formatKeys, tryParseKeys } from '$lib/core/opxy';
import { DEVICE_TASKS } from '../../../evals/agent/cases/device';
import manualCases from '../../../evals/agent/cases/manual.json';

interface ManualCase {
	readonly id: string;
	readonly chapter: string;
	readonly question: string;
	readonly facts: readonly string[];
	readonly keys: readonly string[];
	readonly source: string;
}

const cases = manualCases as readonly ManualCase[];

describe('manual Q&A cases', () => {
	it('has about forty cases across the guide’s chapters, with unique ids', () => {
		expect(cases.length).toBeGreaterThanOrEqual(40);
		expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
		expect(new Set(cases.map((c) => c.chapter)).size).toBeGreaterThanOrEqual(20);
	});

	it.each(cases.map((c) => [c.id, c] as const))('%s is well-formed', (_, c) => {
		expect(Object.keys(c).sort()).toEqual(['chapter', 'facts', 'id', 'keys', 'question', 'source']);
		expect(c.id).toMatch(/^\d{2}-[a-z0-9-]+$/);
		expect(c.chapter).toMatch(/^\d{1,2} [a-z ]+$/);
		expect(c.id.slice(0, 2)).toBe(c.chapter.split(' ')[0].padStart(2, '0'));
		expect(c.question.trim().length).toBeGreaterThan(10);
		expect(c.facts.length).toBeGreaterThanOrEqual(2);
		expect(c.facts.length).toBeLessThanOrEqual(6);
		for (const fact of c.facts) expect(fact.trim().length).toBeGreaterThan(8);
		expect(c.source).toMatch(/^https:\/\/teenage\.engineering\/guides\/op-xy(\/|$)/);
	});

	it('writes every expected combo in the canonical key grammar', () => {
		const problems: string[] = [];
		for (const c of cases) {
			for (const keys of c.keys) {
				const parsed = tryParseKeys(keys);
				if (!parsed.ok)
					problems.push(`${c.id}: "${keys}" does not parse (${parsed.error.message})`);
				else if (formatKeys(parsed.value) !== keys)
					problems.push(`${c.id}: "${keys}" is spelled "${formatKeys(parsed.value)}"`);
			}
		}
		expect(problems).toEqual([]);
	});
});

describe('device tasks', () => {
	it('has unique ids and a prompt and check for each', () => {
		expect(DEVICE_TASKS.length).toBeGreaterThanOrEqual(15);
		expect(new Set(DEVICE_TASKS.map((t) => t.id)).size).toBe(DEVICE_TASKS.length);
		for (const task of DEVICE_TASKS) {
			expect(task.prompt.trim()).not.toBe('');
			expect(typeof task.check).toBe('function');
		}
	});
});
