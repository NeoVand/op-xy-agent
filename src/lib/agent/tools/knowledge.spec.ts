// Manual and teaching tools: search results the API accepts (a tool result that carries search
// results may contain nothing else, so ids travel in the titles), full units, the dev supplement
// marked as such, and combos checked against the key grammar before the replica sees them.
import { describe, expect, it } from 'vitest';
import { createUnitSource } from '../manual-index';
import { combineSources, type ManualSource } from '../manual-source';
import type { AgentEnvironment, AnyTool, ToolContext, ToolResult } from './define';
import { readManualUnitTool, searchManualTool, showOnReplicaTool } from './knowledge';

const ours = createUnitSource({
	kind: 'manual',
	label: 'our manual',
	header: '# Ours',
	units: [
		{
			id: 'sequencer.parameter-locks',
			title: 'Parameter locks',
			text: 'Hold a step and turn an encoder.\n\nThe step keeps that value.',
			source: 'https://teenage.engineering/guides/op-xy/sequencer#parameter-locks'
		}
	]
});

const guide = createUnitSource({
	kind: 'dev-guide',
	label: 'TE guide (dev only)',
	header: '# Guide',
	units: [
		{
			id: '7.4',
			title: '7.4 parameter locks',
			text: 'Locks on steps.',
			source: 'https://teenage.engineering/guides/op-xy/sequencer#p-locks'
		}
	]
});

function run(tool: AnyTool, input: unknown, manual: ManualSource): Promise<ToolResult> {
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		manual,
		timers: {
			setTimeout: (callback, ms) => setTimeout(callback, ms),
			clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
		},
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const ctx: ToolContext = {
		toolCallId: 'toolu_x',
		agent: 'conductor',
		signal: new AbortController().signal,
		env
	};
	return tool.run(tool.input.parse(input), ctx);
}

describe('search_manual', () => {
	it('returns only search results, titled with the unit id', async () => {
		const result = await run(searchManualTool, { query: 'parameter lock' }, ours);
		expect(Array.isArray(result.content)).toBe(true);
		const blocks = result.content as readonly { type: string; title?: string; source?: string }[];
		expect(blocks.length).toBeGreaterThan(0);
		expect(blocks.every((b) => b.type === 'search_result')).toBe(true);
		expect(blocks[0]).toMatchObject({
			title: 'Parameter locks [sequencer.parameter-locks]',
			source: 'https://teenage.engineering/guides/op-xy/sequencer#parameter-locks',
			citations: { enabled: true }
		});
	});

	it('marks hits from the development supplement', async () => {
		const result = await run(
			searchManualTool,
			{ query: 'parameter locks', limit: 2 },
			combineSources(ours, guide)
		);
		const titles = (result.content as readonly { title: string }[]).map((b) => b.title);
		expect(titles).toEqual([
			'Parameter locks [sequencer.parameter-locks]',
			'7.4 parameter locks [7.4] (development supplement)'
		]);
	});

	it('says so when nothing matches', async () => {
		const result = await run(searchManualTool, { query: 'zzzz qqqq' }, ours);
		expect(result.content).toMatch(/^No manual section matched/);
	});
});

describe('read_manual_unit', () => {
	it('returns one citable search result', async () => {
		const result = await run(readManualUnitTool, { id: 'sequencer.parameter-locks' }, ours);
		const blocks = result.content as readonly { type: string; content: { text: string }[] }[];
		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe('search_result');
		expect(blocks[0].content.map((c) => c.text)).toEqual([
			'Hold a step and turn an encoder.',
			'The step keeps that value.'
		]);
	});

	it('is an error for unknown ids', async () => {
		const result = await run(readManualUnitTool, { id: 'com.nope' }, ours);
		expect(result.isError).toBe(true);
	});
});

describe('show_on_replica', () => {
	it('rejects text that is not a key combo', async () => {
		const result = await run(showOnReplicaTool, { keys: 'hold record + play' }, ours);
		expect(result.isError).toBe(true);
	});

	it('reports that no replica is on screen', async () => {
		const result = await run(showOnReplicaTool, { keys: 'shift + M1' }, ours);
		expect(JSON.parse(String(result.content))).toMatchObject({ shown: false, keys: 'shift + M1' });
	});
});
