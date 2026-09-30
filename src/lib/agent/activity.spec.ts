// The live status line in words: tool input summaries, word counts, elapsed time, and the activity
// reducer fed event by event the way the conductor feeds it (the chat first, then the activity).
import { describe, expect, it } from 'vitest';
import {
	countWords,
	formatElapsed,
	inputSummary,
	lastLine,
	nextActivity,
	startActivity,
	type Activity
} from './activity';
import { parentOf } from './agent-names';
import { applyEvent, emptyUsage, type ChatEntry } from './chat';
import type { AgentEvent, ApprovalRequest } from './types';

function harness(firstTurn = true) {
	const entries: ChatEntry[] = [];
	const usage = emptyUsage();
	let now = 10_000;
	let activity: Activity | null = startActivity(now, firstTurn);
	return {
		entries,
		get activity() {
			return activity;
		},
		/** Applies one event `ms` after the previous one; returns the new activity. */
		emit(event: AgentEvent, ms = 0): Activity | null {
			now += ms;
			applyEvent(entries, usage, event, parentOf);
			activity = nextActivity(activity, event, entries, { now, firstTurn });
			return activity;
		}
	};
}

const C = 'conductor';
const pending = (id: string, name: string, label: string, agent = C): AgentEvent => ({
	type: 'tool_pending',
	agent,
	id,
	name,
	label,
	parent: parentOf(agent)
});
const start = (
	id: string,
	name: string,
	label: string,
	input: unknown,
	kind: 'read' | 'ui' | 'mutate' = 'read',
	agent = C
): AgentEvent => ({
	type: 'tool_start',
	agent,
	id,
	name,
	label,
	kind,
	input,
	parent: parentOf(agent)
});
const end = (id: string, name: string, summary: string, agent = C): AgentEvent => ({
	type: 'tool_end',
	agent,
	id,
	name,
	status: 'ok',
	summary,
	parent: parentOf(agent)
});

describe('inputSummary', () => {
	it('says what each tool was asked, in a few words', () => {
		expect(inputSummary('show_on_replica', { keys: 'shift + M1', caption: 'x' })).toBe(
			'shift + M1'
		);
		expect(inputSummary('search_manual', { query: 'parameter lock' })).toBe('“parameter lock”');
		expect(inputSummary('read_manual_unit', { id: 'instrument.engine' })).toBe('instrument.engine');
		expect(inputSummary('set_tempo', { bpm: 96 })).toBe('96 bpm');
		expect(inputSummary('select_track', { track: 3 })).toBe('track 3');
		expect(inputSummary('mute_track', { track: 2, muted: true })).toBe('track 2 mute');
		expect(inputSummary('mute_track', { track: 2, muted: false })).toBe('track 2 unmute');
		expect(inputSummary('transport', { action: 'play' })).toBe('play');
		expect(inputSummary('play_notes', { track: 1, steps: [{}, {}] })).toBe('track 1, 2 steps');
		expect(inputSummary('write_todos', { todos: [{}] })).toBe('1 step');
		expect(inputSummary('device_status', {})).toBe('');
		// a lab program says what it is for, never its code
		expect(inputSummary('run_lab', { code: 'const f = lab.fork();', purpose: 'try two' })).toBe(
			'try two'
		);
		expect(inputSummary('some_new_tool', { level: 7, name: 'x' })).toBe('7');
	});

	it('clips long input to one line and copes with partial or missing input', () => {
		const description = `What does shift + M1 do?\n\n${'Explain it in detail. '.repeat(10)}`;
		const summary = inputSummary('task', { description });
		expect(summary.length).toBeLessThanOrEqual(72);
		expect(summary.startsWith('What does shift + M1 do? Explain')).toBe(true);
		expect(summary.endsWith('…')).toBe(true);
		expect(inputSummary('set_tempo', {})).toBe('');
		expect(inputSummary('mute_track', { track: 4 })).toBe('track 4');
		expect(inputSummary('show_on_replica', null)).toBe('');
		expect(inputSummary('search_manual', 'not an object')).toBe('');
	});
});

describe('text helpers', () => {
	it('counts words and finds the last line', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('  Hold `shift`\nand press\tM1. ')).toBe(5);
		expect(lastLine('first\nsecond line\n\n  ')).toBe('second line');
		expect(lastLine(' \n ')).toBe('');
	});

	it('formats elapsed time with tenths under a minute', () => {
		expect(formatElapsed(0)).toBe('0.0s');
		expect(formatElapsed(-50)).toBe('0.0s');
		expect(formatElapsed(4_240)).toBe('4.2s');
		expect(formatElapsed(59_960)).toBe('1m 00s');
		expect(formatElapsed(65_400)).toBe('1m 05s');
	});
});

describe('nextActivity', () => {
	it('reads the manual first, then shows thinking notes without restarting the clock', () => {
		const h = harness(true);
		expect(h.activity).toMatchObject({
			phase: 'thinking',
			label: 'reading the manual and thinking'
		});
		const turn = h.emit({ type: 'turn', agent: C, turn: 't1', model: 'claude-opus-5-5' }, 30);
		expect(turn?.label).toBe('reading the manual and thinking');
		expect(turn?.since).toBe(10_000);
		const note = h.emit(
			{ type: 'progress', agent: C, turn: 't1', block: 0, delta: 'Looking up\nthe M1 page.' },
			2_000
		);
		expect(note).toMatchObject({ phase: 'thinking', label: 'thinking', detail: 'the M1 page.' });
		expect(note?.since).toBe(10_000);
	});

	it('says plain "thinking" once the conversation has an answer', () => {
		const h = harness(false);
		expect(h.activity?.label).toBe('thinking');
		expect(h.emit({ type: 'turn', agent: C, turn: 't2', model: 'm' })?.label).toBe('thinking');
	});

	it('follows a tool call from being written to running, approval and its end', () => {
		const h = harness(false);
		const writing = h.emit(pending('toolu_1', 'set_tempo', 'set tempo'), 500);
		expect(writing).toMatchObject({ phase: 'tool', label: 'preparing set tempo', detail: '' });
		const since = writing?.since;
		const preview = h.emit({
			type: 'tool_input',
			agent: C,
			id: 'toolu_1',
			input: { bpm: 9 },
			parent: null
		});
		expect(preview?.detail).toBe('9 bpm');
		const running = h.emit(start('toolu_1', 'set_tempo', 'set tempo', { bpm: 96 }, 'mutate'), 200);
		expect(running).toMatchObject({ label: 'calling set tempo', detail: '96 bpm', writes: true });
		expect(running?.since).toBe(since);
		const request: ApprovalRequest = {
			id: 'approval-1',
			agent: C,
			actions: [
				{
					toolCallId: 'toolu_1',
					tool: 'set_tempo',
					toolLabel: 'set tempo',
					input: { bpm: 96 },
					preview: { label: 'tempo 120 → 96 bpm' }
				}
			]
		};
		const asking = h.emit({ type: 'approval', request }, 10);
		expect(asking).toMatchObject({
			phase: 'approval',
			label: 'waiting for your approval',
			detail: 'tempo 120 → 96 bpm'
		});
		const approved = h.emit(
			{ type: 'approval_resolved', id: 'approval-1', decision: { kind: 'approve' } },
			3_000
		);
		expect(approved).toMatchObject({ phase: 'tool', label: 'calling set tempo' });
		expect(approved?.since).toBe(asking!.since + 3_000);
		expect(h.emit(end('toolu_1', 'set_tempo', 'tempo 96 bpm'))).toMatchObject({
			phase: 'thinking',
			label: 'thinking'
		});
	});

	it('names the call being written, and counts parallel calls while they run', () => {
		const h = harness(false);
		h.emit(pending('a', 'show_on_replica', 'show on replica'));
		h.emit({ type: 'tool_input', agent: C, id: 'a', input: { keys: 'shift + M1' }, parent: null });
		expect(h.emit(pending('b', 'search_manual', 'search manual'))?.label).toBe(
			'preparing search manual'
		);
		h.emit(start('a', 'show_on_replica', 'show on replica', { keys: 'shift + M1' }, 'ui'));
		expect(h.emit(start('b', 'search_manual', 'search manual', { query: 'M1' }))).toMatchObject({
			label: 'calling show on replica and 1 more',
			detail: 'shift + M1',
			writes: false
		});
		expect(h.emit(end('a', 'show_on_replica', 'showing shift + M1'))).toMatchObject({
			label: 'calling search manual',
			detail: '“M1”'
		});
	});

	it('shows a subagent at work under its own name, step by step, on one clock', () => {
		const h = harness(false);
		const sub = 'manual-expert:toolu_task';
		h.emit(pending('toolu_task', 'task', 'ask the manual expert'));
		const started = h.emit(
			start('toolu_task', 'task', 'ask the manual expert', {
				subagent_type: 'manual-expert',
				description: 'What does shift + M1 do?'
			}),
			100
		);
		expect(started).toMatchObject({
			phase: 'subagent',
			label: 'manual expert',
			detail: 'reading the manual'
		});
		const since = started?.since;
		const steps: (string | undefined)[] = [];
		const step = (event: AgentEvent) => {
			const next = h.emit(event, 250);
			expect(next?.since).toBe(since);
			steps.push(next?.detail);
		};
		step({ type: 'turn', agent: sub, turn: 's1', model: 'claude-sonnet-5' });
		step({ type: 'progress', agent: sub, turn: 's1', block: 0, delta: 'Searching the manual.' });
		step(pending('toolu_s1', 'search_manual', 'search manual', sub));
		step({
			type: 'tool_input',
			agent: sub,
			id: 'toolu_s1',
			input: { query: 'shift M1' },
			parent: 'toolu_task'
		});
		step(start('toolu_s1', 'search_manual', 'search manual', { query: 'shift M1' }, 'read', sub));
		step(end('toolu_s1', 'search_manual', '2 matches', sub));
		step({ type: 'turn', agent: sub, turn: 's2', model: 'claude-sonnet-5' });
		step({ type: 'text', agent: sub, turn: 's2', block: 0, delta: 'Hold shift and ' });
		step({ type: 'text', agent: sub, turn: 's2', block: 0, delta: 'press M1.' });
		expect(steps).toEqual([
			'reading the manual',
			'Searching the manual.',
			'search manual',
			'search manual “shift M1”',
			'search manual “shift M1”',
			'thinking',
			'thinking',
			'writing 3 words',
			'writing 5 words'
		]);
		expect(h.emit(end('toolu_task', 'task', 'manual expert answered'))).toMatchObject({
			phase: 'thinking'
		});
	});

	it('counts the words of the answer being written, one block at a time', () => {
		const h = harness(false);
		const first = h.emit({ type: 'text', agent: C, turn: 't1', block: 1, delta: 'Hold ' }, 100);
		expect(first).toMatchObject({
			phase: 'writing',
			label: 'writing',
			detail: '1 word',
			key: 't1:1'
		});
		const more = h.emit({ type: 'text', agent: C, turn: 't1', block: 1, delta: 'shift now.' }, 50);
		expect(more).toMatchObject({ detail: '3 words' });
		expect(more?.since).toBe(first?.since);
		const next = h.emit({ type: 'text', agent: C, turn: 't2', block: 0, delta: 'Done.' }, 900);
		expect(next?.key).toBe('t2:0');
		expect(next?.since).toBe(first!.since + 950);
	});

	it('keeps the same object when nothing visible changed, and ends with the conductor', () => {
		const h = harness(false);
		const before = h.activity;
		expect(
			h.emit({
				type: 'usage',
				report: {
					agent: C,
					model: 'm',
					tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
					usd: 0
				}
			})
		).toBe(before);
		expect(h.emit({ type: 'done', agent: 'manual-expert:toolu_x', stopReason: 'end_turn' })).toBe(
			before
		);
		expect(h.emit({ type: 'done', agent: C, stopReason: 'end_turn' })).toBeNull();
	});

	it('tracks nothing while no run is active', () => {
		expect(
			nextActivity(null, { type: 'turn', agent: C, turn: 't', model: 'm' }, [], {
				now: 1,
				firstTurn: true
			})
		).toBeNull();
	});
});
