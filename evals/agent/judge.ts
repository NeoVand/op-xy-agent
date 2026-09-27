/**
 * Claude as judge: decides, fact by fact, whether an agent answer states what a correct answer must
 * state, and lists contradictions. Uses structured outputs so the verdict is always valid JSON.
 * Sonnet 5 by default (Haiku 4.5 is cheaper but misreads equivalent statements and combos more
 * often), with the next model in the list as the fallback if one fails.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { tokenCounts, usageCost, type TokenCounts } from '$lib/agent/models';

const Verdict = z.object({
	facts: z.array(
		z.object({
			index: z.int().describe('0-based index of the required fact'),
			present: z.boolean().describe('The answer clearly states this fact (same meaning is enough)'),
			why: z.string().describe('A few words: where the answer says it, or what is missing or wrong')
		})
	),
	contradictions: z
		.array(z.string())
		.describe('Statements in the answer that contradict a required fact')
});

const SYSTEM = `You grade answers written by an assistant that explains the Teenage Engineering OP-XY synthesizer.

For every required fact, decide whether the answer conveys it:
- Present: the answer states it or something with the same meaning, even if worded differently, more specifically or as one step among others. Key combos may be written like \`shift + M1\` (hold shift, press M1), \`step 5 + turn E2\` (hold a step, turn the second encoder), \`bar + [+]\` (hold bar, press plus); a combo in backticks states the action it spells. E1–E4 are the dark grey, mid grey, light grey and white encoders. Equivalent spellings count, and so do logically or mathematically equivalent statements ("the tempo is twice the value" states "the value is half the tempo").
- Not present: missing, too vague to be useful, or contradicted.
A contradiction is a statement that cannot be true at the same time as a required fact; other wording, extra detail, an example or a statement about something else is not one. List every contradiction. Judge only against the required facts; extra correct material neither helps nor hurts.`;

/** The judge's result for one answer. */
export interface Judgement {
	readonly present: readonly boolean[];
	readonly reasons: readonly string[];
	readonly contradictions: readonly string[];
	readonly model: string;
	readonly tokens: TokenCounts;
	readonly usd: number;
}

/** Grades one answer against its required facts. */
export async function judgeAnswer(
	client: Anthropic,
	models: readonly string[],
	input: { readonly question: string; readonly facts: readonly string[]; readonly answer: string }
): Promise<Judgement> {
	const content = [
		`Question the user asked:\n${input.question}`,
		`Required facts:\n${input.facts.map((f, i) => `${i}. ${f}`).join('\n')}`,
		`Answer to grade:\n<answer>\n${input.answer.trim() || '(no answer)'}\n</answer>`
	].join('\n\n');
	let lastError: unknown = null;
	for (const model of models) {
		try {
			const response = await client.messages.parse({
				model,
				max_tokens: 2_000,
				system: SYSTEM,
				messages: [{ role: 'user', content }],
				output_config: { format: zodOutputFormat(Verdict) }
			});
			const verdict = response.parsed_output;
			if (!verdict) throw new Error('the judge returned no verdict');
			const present = input.facts.map(
				(_, i) => verdict.facts.find((f) => f.index === i)?.present ?? false
			);
			const reasons = input.facts.map(
				(_, i) => verdict.facts.find((f) => f.index === i)?.why ?? ''
			);
			return {
				present,
				reasons,
				contradictions: verdict.contradictions,
				model: response.model,
				tokens: tokenCounts(response.usage),
				usd: usageCost(response.model, response.usage) ?? 0
			};
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
