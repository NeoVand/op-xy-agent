/**
 * What the agent evals save and share (the quality eval and the episodes eval): the agent's tool
 * calls with the results read back from its thread, and the transcript viewer's list of saved runs.
 *
 * It is a module of its own because an eval with a runner beside it cannot be imported: Vite
 * resolves `./quality` to `quality.mjs` before `quality.ts`, and that runner starts the whole eval.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { ThreadStore } from '$lib/agent/threads';

/** One tool call as the chat saw it. */
export interface TraceCall {
	readonly id: string;
	readonly turn: number;
	readonly name: string;
	readonly input: unknown;
	readonly status: string;
	readonly summary: string;
	/** What the tool gave the model back (from the saved thread), when it could be read. */
	readonly result?: string;
	/** A subagent's call (the manual expert's reads), not the conductor's. */
	readonly nested: boolean;
}

/** Fills in each call's result from the saved thread (tool_result blocks by tool_use id). */
export async function attachResults(store: ThreadStore, trace: TraceCall[]): Promise<void> {
	const results = new Map<string, string>();
	for (const summary of await store.list()) {
		const thread = await store.load(summary.id);
		for (const message of thread?.messages ?? []) {
			if (typeof message.content === 'string') continue;
			for (const block of message.content) {
				if (block.type !== 'tool_result') continue;
				const content = block.content;
				const text =
					typeof content === 'string'
						? content
						: (content ?? []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
				results.set(block.tool_use_id, text);
			}
		}
	}
	trace.forEach((call, i) => {
		const result = results.get(call.id);
		if (result !== undefined) trace[i] = { ...call, result };
	});
}

/** One saved run, as the transcript viewer lists it. */
export interface RunEntry {
	readonly file: string;
	readonly model: string;
	readonly stamp: string;
	readonly runs: number;
	readonly passed: number;
}

/**
 * Lists every saved run in `dir/index.json`, newest first, for the transcript viewer (which fetches
 * it, so a run saved while the dev server runs shows up at once).
 */
export function writeIndex(dir: string): void {
	const entries: RunEntry[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json') || name === 'index.json') continue;
		try {
			const saved = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
				model?: string;
				stamp?: string;
				results?: { pass: boolean }[];
			};
			if (!Array.isArray(saved.results)) continue;
			entries.push({
				file: basename(name),
				model: saved.model ?? '',
				stamp: saved.stamp ?? '',
				runs: saved.results.length,
				passed: saved.results.filter((r) => r.pass).length
			});
		} catch {
			// not a run
		}
	}
	entries.sort((a, b) => b.stamp.localeCompare(a.stamp));
	writeFileSync(join(dir, 'index.json'), JSON.stringify(entries, null, 1));
}
