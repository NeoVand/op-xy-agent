/**
 * Knowledge and teaching tools: search and read the manual (answers carry search-result
 * citations), animate a key combo on the replica, keep the plan, and delegate to a subagent.
 */
import type { BetaSearchResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { formatKeys, tryParseKeys } from '$lib/core/opxy';
import type { Todo } from '../types';
import { defineTool, errorResult, jsonResult, type ToolResultBlock } from './define';

/** Splits text into citable paragraphs (the text block is the smallest unit a citation points at). */
export function citableBlocks(text: string, maxBlocks = 12): { type: 'text'; text: string }[] {
	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (paragraphs.length <= maxBlocks) return paragraphs.map((p) => ({ type: 'text', text: p }));
	// Too many paragraphs: merge neighbours so the block count stays bounded.
	const size = Math.ceil(paragraphs.length / maxBlocks);
	const merged: { type: 'text'; text: string }[] = [];
	for (let i = 0; i < paragraphs.length; i += size) {
		merged.push({ type: 'text', text: paragraphs.slice(i, i + size).join('\n\n') });
	}
	return merged;
}

function searchResult(title: string, source: string, text: string): BetaSearchResultBlockParam {
	const content = citableBlocks(text);
	return {
		type: 'search_result',
		source,
		title,
		content: content.length > 0 ? content : [{ type: 'text', text: '(this section has no text)' }],
		citations: { enabled: true }
	};
}

/** Longest unit text returned by read_manual_unit. */
const MAX_UNIT_CHARS = 12_000;

export const searchManualTool = defineTool({
	name: 'search_manual',
	label: 'search manual',
	kind: 'read',
	description:
		'Search the OP-XY manual for the units that best match a query (keywords work best: "parameter lock", "shift M1", "tape length"). Returns the best passages as citable search results, each titled with the unit id in brackets that read_manual_unit takes for the full text.',
	input: z.object({
		query: z.string().min(2).max(200).describe('What to look for'),
		limit: z.int().min(1).max(8).optional().describe('How many sections (default 4)')
	}),
	async run(input, ctx) {
		const hits = await ctx.env.manual.search(input.query, input.limit ?? 4);
		if (hits.length === 0) {
			return {
				content: `No manual section matched "${input.query}". Try other words, or answer from the manual in your instructions and say what you could not find.`,
				summary: 'no matches'
			};
		}
		// A tool result that carries search results may contain nothing else, so each result's title
		// carries the id read_manual_unit takes.
		const blocks: ToolResultBlock[] = hits.map((h) =>
			searchResult(
				`${h.title} [${h.id}]${h.origin === 'dev-guide' ? ' (development supplement)' : ''}`,
				h.source || h.id,
				h.snippet
			)
		);
		return {
			content: blocks,
			summary: `${hits.length} match${hits.length === 1 ? '' : 'es'}: ${hits
				.slice(0, 3)
				.map((h) => h.title)
				.join(', ')}`
		};
	}
});

export const readManualUnitTool = defineTool({
	name: 'read_manual_unit',
	label: 'read manual',
	kind: 'read',
	description:
		'Read one manual unit in full, by the id that search_manual returned (or its exact title). Returns it as a citable search result.',
	input: z.object({
		id: z.string().min(1).max(120).describe('Unit id, e.g. "sequencer.parameter-locks"')
	}),
	async run(input, ctx) {
		const unit = await ctx.env.manual.unit(input.id);
		if (!unit) {
			return errorResult(
				`There is no manual unit "${input.id}". Use search_manual to find the right id.`,
				'unit not found'
			);
		}
		const text =
			unit.text.length > MAX_UNIT_CHARS
				? `${unit.text.slice(0, MAX_UNIT_CHARS)}\n\n[truncated]`
				: unit.text;
		return {
			content: [searchResult(unit.title, unit.source || unit.id, text)],
			summary: unit.title
		};
	}
});

export const showOnReplicaTool = defineTool({
	name: 'show_on_replica',
	label: 'show on replica',
	kind: 'ui',
	description:
		'Animate a key combo on the replica next to the chat, so the user sees which keys to press and in what order. Takes one combo in the key grammar ("shift + M1", "record + play", "step 5 + turn E2", "shift → step 1", "hold com"). Sends nothing to the device.',
	input: z.object({
		keys: z.string().min(1).max(120).describe('One key combo in the key grammar'),
		caption: z.string().max(160).optional().describe('What the combo does, in a few words')
	}),
	async run(input, ctx) {
		const parsed = tryParseKeys(input.keys);
		if (!parsed.ok) {
			return errorResult(
				`"${input.keys}" is not in the key grammar: ${parsed.error.message}. Controls are written like shift, record, M1, T3, step 5, E2, key C4.`,
				'not a key combo'
			);
		}
		const keys = formatKeys(parsed.value);
		const replica = ctx.env.replica;
		if (!replica) {
			return jsonResult(
				{ shown: false, keys, reason: 'No replica is on screen.' },
				`${keys} (no replica)`
			);
		}
		const handle = replica.animate(parsed.value);
		return jsonResult(
			{ shown: true, keys, seconds: Math.round(handle.plan.duration / 100) / 10 },
			input.caption ? `${keys}: ${input.caption}` : `showing ${keys}`
		);
	}
});

const todoSchema = z.object({
	content: z.string().min(1).max(200).describe('The step, in a few words'),
	status: z.enum(['pending', 'in_progress', 'completed'])
});

export const writeTodosTool = defineTool({
	name: 'write_todos',
	label: 'plan',
	kind: 'ui',
	description:
		'Write the plan for a multi-step job as a checklist the user sees next to the chat. Send the whole list every time (it replaces the previous one) and keep exactly one step in_progress while working. Skip it for simple questions.',
	input: z.object({ todos: z.array(todoSchema).max(20).describe('The whole plan, in order') }),
	async run(input, ctx) {
		const todos: Todo[] = input.todos.map((t) => ({ content: t.content, status: t.status }));
		ctx.env.plan.set(todos);
		const done = todos.filter((t) => t.status === 'completed').length;
		return {
			content: `Plan saved (${done} of ${todos.length} done).`,
			summary: `plan: ${done} of ${todos.length} done`
		};
	}
});

/** Subagents the `task` tool can start. */
export const SUBAGENT_TYPES = ['manual-expert'] as const;

export const taskTool = defineTool({
	name: 'task',
	label: 'ask the manual expert',
	kind: 'read',
	description:
		'Delegate a research question to a subagent with a fresh context. manual-expert: reads the manual carefully and returns a compact, cited answer with key combos; use it for comparisons, questions spanning several sections, or when exact citations matter. Give it the complete question and any context it needs: it cannot see this conversation.',
	input: z.object({
		subagent_type: z.enum(SUBAGENT_TYPES).describe('Which subagent'),
		description: z.string().min(10).max(4000).describe('The complete task, self-contained')
	}),
	async run(input, ctx) {
		if (!ctx.env.runSubagent)
			return errorResult('Subagents are not available here.', 'no subagents');
		const result = await ctx.env.runSubagent(input.subagent_type, input.description, ctx);
		const sources =
			result.sources.length > 0
				? `\n\nSources the ${input.subagent_type} cited:\n${result.sources.map((s) => `- ${s.title}: ${s.source}`).join('\n')}`
				: '';
		const text = (result.text.trim() || '(the subagent returned no text)') + sources;
		return {
			content: text,
			summary: `${input.subagent_type} answered${result.sources.length ? ` (${result.sources.length} sources)` : ''}`,
			isError: result.stopReason === 'error'
		};
	}
});

/** Knowledge and teaching tools. */
export const KNOWLEDGE_TOOLS = [
	searchManualTool,
	readManualUnitTool,
	showOnReplicaTool,
	writeTodosTool,
	taskTool
];
