// The chat reducer: streamed text grows one entry in place (so the UI updates per delta), tool chips
// appear with their friendly label as soon as a call starts being written, previews of the input
// fill in while it streams, and the final input and outcome replace them.
import { describe, expect, it } from 'vitest';
import { parentOf } from './agent-names';
import { applyEvent, emptyUsage, settleEntries, type ChatEntry } from './chat';
import type { AgentEvent } from './types';

function reducer() {
	const entries: ChatEntry[] = [];
	const usage = emptyUsage();
	return {
		entries,
		apply(...events: AgentEvent[]) {
			for (const event of events) applyEvent(entries, usage, event, parentOf);
		}
	};
}

describe('applyEvent', () => {
	it('grows one text entry per block, delta by delta, in place', () => {
		const r = reducer();
		r.apply({ type: 'text', agent: 'conductor', turn: 't', block: 0, delta: 'Hold ' });
		const entry = r.entries[0];
		r.apply({ type: 'text', agent: 'conductor', turn: 't', block: 0, delta: 'shift.' });
		expect(r.entries).toHaveLength(1);
		expect(r.entries[0]).toBe(entry);
		expect(entry).toMatchObject({ kind: 'text', text: 'Hold shift.', parent: null });
	});

	it('shows a chip with its label while the call is written, previews its input, then runs it', () => {
		const r = reducer();
		r.apply({
			type: 'tool_pending',
			agent: 'conductor',
			id: 'toolu_1',
			name: 'task',
			label: 'ask the manual expert',
			parent: null
		});
		expect(r.entries[0]).toMatchObject({
			kind: 'tool',
			label: 'ask the manual expert',
			status: 'pending',
			input: null
		});
		r.apply({
			type: 'tool_input',
			agent: 'conductor',
			id: 'toolu_1',
			input: { subagent_type: 'manual-expert', description: 'What does' },
			parent: null
		});
		expect(r.entries[0]).toMatchObject({ input: { description: 'What does' } });
		r.apply({
			type: 'tool_start',
			agent: 'conductor',
			id: 'toolu_1',
			name: 'task',
			label: 'ask the manual expert',
			kind: 'read',
			input: { subagent_type: 'manual-expert', description: 'What does shift + M1 do?' },
			parent: null
		});
		expect(r.entries[0]).toMatchObject({
			status: 'running',
			input: { description: 'What does shift + M1 do?' }
		});
		// A late preview never overwrites the final input.
		r.apply({
			type: 'tool_input',
			agent: 'conductor',
			id: 'toolu_1',
			input: { description: 'What' },
			parent: null
		});
		expect(r.entries[0]).toMatchObject({ input: { description: 'What does shift + M1 do?' } });
		r.apply({
			type: 'tool_end',
			agent: 'conductor',
			id: 'toolu_1',
			name: 'task',
			status: 'ok',
			summary: 'manual expert answered',
			parent: null
		});
		expect(r.entries[0]).toMatchObject({ status: 'ok', summary: 'manual expert answered' });
	});

	it('nests subagent entries under their task call', () => {
		const r = reducer();
		r.apply(
			{
				type: 'progress',
				agent: 'manual-expert:toolu_task',
				turn: 's',
				block: 0,
				delta: 'Searching.'
			},
			{
				type: 'tool_pending',
				agent: 'manual-expert:toolu_task',
				id: 'toolu_s1',
				name: 'search_manual',
				label: 'search manual',
				parent: 'toolu_task'
			}
		);
		expect(r.entries.map((e) => ('parent' in e ? e.parent : null))).toEqual([
			'toolu_task',
			'toolu_task'
		]);
	});

	it('marks chips that never finished as stopped', () => {
		const r = reducer();
		r.apply({
			type: 'tool_pending',
			agent: 'conductor',
			id: 'toolu_1',
			name: 'set_tempo',
			label: 'set tempo',
			parent: null
		});
		settleEntries(r.entries);
		expect(r.entries[0]).toMatchObject({ status: 'stopped', summary: 'stopped' });
	});
});
