// Manual and teaching tools: search results the API accepts (a tool result that carries search
// results may contain nothing else, so ids travel in the titles), full units, the dev supplement
// marked as such, and combos checked against the key grammar before the replica sees them.
import { describe, expect, it } from 'vitest';
import { createUnitSource } from '../manual-index';
import { combineSources, type ManualSource } from '../manual-source';
import { createVirtualOpxy } from '$lib/app/virtual';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import type { AgentEnvironment, AnyTool, ScreenReader, ToolContext, ToolResult } from './define';
import {
	readManualUnitTool,
	readScreenTool,
	searchManualTool,
	showOnReplicaTool
} from './knowledge';

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

function run(
	tool: AnyTool,
	input: unknown,
	manual: ManualSource,
	screen: ScreenReader | null = null
): Promise<ToolResult> {
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		screen,
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
	it('warns when a walkthrough’s lone step press would take a note off', async () => {
		const virtual = createVirtualOpxy({ sim: new OpxySim({ now: () => 0 }) });
		virtual.writePattern(3, {
			pattern: 1,
			bars: 1,
			notes: [{ step: 7, note: 48, velocity: 100, length: 2 }]
		});
		const started: string[] = [];
		const env: AgentEnvironment = {
			device: null,
			replica: null,
			virtual,
			guide: { start: (goal) => void started.push(goal), stop: () => {} },
			manual: ours,
			timers: {
				setTimeout: (callback, ms) => setTimeout(callback, ms),
				clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
			},
			confirmWindowMs: 0,
			plan: { get: () => [], set: () => {} },
			abortDeviceWork: () => {}
		};
		const ctx: ToolContext = {
			toolCallId: 'toolu_g',
			agent: 'conductor',
			signal: new AbortController().signal,
			env
		};
		const guided = (keys: string) =>
			showOnReplicaTool
				.run(showOnReplicaTool.input.parse({ keys, guide: true }), ctx)
				.then((r) => JSON.parse(String(r.content)));
		const lock = await guided('instrument → T3 → M3 → step 7');
		expect(lock.caution).toMatch(/^step 7 pressed alone takes off the note there/);
		// a step with no note gets one: nothing to warn of
		const kick = await guided('instrument → T1 → step 1');
		expect(kick.caution).toBeUndefined();
	});
});

describe('read_screen', () => {
	it("reports the replica screen's page and state", async () => {
		const reading = {
			page: 'lfo',
			shows: 'value lfo: amount 0, destination syn',
			mode: 'instrument',
			overlay: null,
			modulePage: 4,
			track: 3,
			engine: 'prism',
			shift: false,
			bpm: 120,
			playing: false
		};
		const result = await run(readScreenTool, {}, ours, { read: () => reading });
		expect(result.isError).toBeFalsy();
		expect(JSON.parse(result.content as string)).toEqual(reading);
		expect(result.summary).toBe('value lfo: amount 0, destination syn');
	});

	it('says when there is no screen', async () => {
		const result = await run(readScreenTool, {}, ours);
		expect(JSON.parse(result.content as string)).toMatchObject({ available: false });
	});
});
