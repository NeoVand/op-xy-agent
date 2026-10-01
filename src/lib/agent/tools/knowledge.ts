/**
 * Knowledge and teaching tools: search and read the manual (answers carry search-result
 * citations), animate a key combo on the replica, keep the plan, and delegate to a subagent.
 */
import type { BetaSearchResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { formatKeys, tryParseKeys } from '$lib/core/opxy';
import type { Todo } from '../types';
import { defineTool, errorResult, jsonResult, sleep, type ToolResultBlock } from './define';

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

/** How long a demonstration's result stays on the replica before it goes back, ms. */
export const DEMO_HOLD_MS = 700;

export const showOnReplicaTool = defineTool({
	name: 'show_on_replica',
	label: 'show on replica',
	kind: 'ui',
	description:
		'Animate a key combo on the replica next to the chat, so the user sees which keys to press and in what order. Takes one combo in the key grammar ("shift + M1", "record + play", "step 5 + turn E2", "shift → step 1", "hold com"); → chains several ("T3 → shift + M3"); the keys before a + stay held, and + at the start of the next combo keeps them held ("key G3 + record → + step 5 → + step 13": the snare held while its steps are pressed; "hold" goes only on a last key). The keys play from wherever the replica stands, as presses would (start with the track key when the user names a track, and write the same steps in your answer as you showed); once the result has been seen the replica goes back to where it was, so the user can try it from there, and the call returns then. Nothing stays changed: to leave the replica changed, use the key planner with show. Sends nothing to the device. When the user asks how to do something on the device, play the main combination once, before you write the answer, and do not mention that you did.',
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
		ctx.env.guide?.stop();
		// A demonstration leaves nothing behind (docs/research episodes: a demo that muted track 2
		// or entered a kick left the user's own try starting from somewhere else). Unless the user
		// takes over while it plays: then what they did stays.
		const virtual = ctx.env.virtual;
		const before = virtual?.checkpoint() ?? null;
		let tookOver = false;
		const stop = replica.subscribe((event) => {
			if (event.source === 'pointer' || event.source === 'keyboard') tookOver = true;
		});
		const handle = replica.animate(parsed.value);
		const onAbort = () => handle.cancel();
		ctx.signal.addEventListener('abort', onAbort, { once: true });
		let outcome: 'finished' | 'cancelled';
		try {
			outcome = await handle.done;
			if (outcome === 'finished') await sleep(DEMO_HOLD_MS, ctx.env.timers, ctx.signal);
		} catch {
			outcome = 'cancelled';
		} finally {
			ctx.signal.removeEventListener('abort', onAbort);
			stop();
		}
		// a demo cut short by another one is the other's to put back
		const putBack =
			before !== null &&
			!tookOver &&
			(outcome === 'finished' || ctx.signal.aborted) &&
			virtual!.revert(before);
		const caption = input.caption ? `${keys}: ${input.caption}` : `showed ${keys}`;
		return jsonResult(
			{
				shown: outcome === 'finished',
				keys,
				seconds: Math.round(handle.plan.duration / 100) / 10,
				replica: putBack
					? 'back where it was: the user can try it from there'
					: tookOver
						? 'the user took over while it played; what they did stays'
						: 'unchanged'
			},
			caption
		);
	}
});

export const readScreenTool = defineTool({
	name: 'read_screen',
	label: 'read screen',
	kind: 'read',
	description:
		"What the replica's screen shows right now: the app's simulation of the OP-XY's interface (it follows the user's presses on the replica and your show_on_replica animations; it cannot see the real device's screen). Gives the page and its values, the mode, the selected track and engine, shift, tempo and the simulated transport. Use it first whenever the user mentions what their screen shows, asks where they are or seems lost, and to check where a combo landed; answer from what it shows.",
	input: z.object({}),
	async run(_input, ctx) {
		const screen = ctx.env.screen;
		if (!screen) {
			return jsonResult(
				{ available: false, reason: 'No replica screen in this view.' },
				'no screen'
			);
		}
		const reading = screen.read();
		return jsonResult(
			reading,
			reading.shows.length > 60 ? `${reading.shows.slice(0, 57)}…` : reading.shows
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
			summary: `${input.subagent_type.replace(/-/g, ' ')} answered${result.sources.length ? ` (${result.sources.length} sources)` : ''}`,
			isError: result.stopReason === 'error'
		};
	}
});

/** Knowledge and teaching tools. */
export const KNOWLEDGE_TOOLS = [
	searchManualTool,
	readManualUnitTool,
	showOnReplicaTool,
	readScreenTool,
	writeTodosTool,
	taskTool
];
