// The policy gate, the revision journal and the executor that ties them to the device queue:
// one approval per turn, grants for the session, rejections with notes, device calls serialised in
// call order (a queued change waits for its approval inside its slot), journal entries with inverses
// and undo on the user's behalf.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolExecutor, type ToolCallRequest } from './executor';
import { Journal } from './journal';
import { NO_MANUAL } from './manual-source';
import { PolicyGate, isApproved } from './policy';
import { DeviceQueue } from './queue';
import {
	defineTool,
	sleep,
	ToolRegistry,
	type AgentEnvironment,
	type AnyTool
} from './tools/define';
import type { AgentEvent, ApprovalDecision, ApprovalRequest, ProposedAction } from './types';

const action = (tool: string): ProposedAction => ({
	toolCallId: `call-${tool}`,
	tool,
	toolLabel: tool,
	input: {},
	preview: { label: tool }
});

describe('PolicyGate', () => {
	it('asks once per request and returns the decision', async () => {
		const requests: ApprovalRequest[] = [];
		const gate = new PolicyGate({
			requestApproval: async (request) => {
				requests.push(request);
				return { kind: 'reject', note: 'no' };
			},
			makeId: () => 'req-1'
		});
		const { request, decision } = await gate.review('conductor', [
			action('set_tempo'),
			action('mute_track')
		]);
		expect(requests).toHaveLength(1);
		expect(request?.id).toBe('req-1');
		expect(request?.actions.map((a) => a.tool)).toEqual(['set_tempo', 'mute_track']);
		expect(decision).toEqual({ kind: 'reject', note: 'no' });
		expect(isApproved(decision)).toBe(false);
	});

	it('grants every tool in an allow-session request until revoked', async () => {
		const gate = new PolicyGate({ requestApproval: async () => ({ kind: 'allow-session' }) });
		const mutate = { name: 'set_tempo', kind: 'mutate' } as AnyTool;
		expect(gate.needsApproval(mutate)).toBe(true);
		await gate.review('conductor', [action('set_tempo')]);
		expect(gate.needsApproval(mutate)).toBe(false);
		expect(gate.grants).toEqual(['set_tempo']);
		gate.revoke('set_tempo');
		expect(gate.needsApproval(mutate)).toBe(true);
	});

	it('never asks for read and ui tools, nor for mutate tools marked auto', () => {
		const gate = new PolicyGate({ requestApproval: async () => ({ kind: 'approve' }) });
		expect(gate.needsApproval({ name: 'a', kind: 'read' } as AnyTool)).toBe(false);
		expect(gate.needsApproval({ name: 'b', kind: 'ui' } as AnyTool)).toBe(false);
		expect(gate.needsApproval({ name: 'c', kind: 'mutate', approval: 'auto' } as AnyTool)).toBe(
			false
		);
	});

	it('resolves cancelled when the run is stopped while waiting', async () => {
		const gate = new PolicyGate({ requestApproval: () => new Promise<ApprovalDecision>(() => {}) });
		const controller = new AbortController();
		const pending = gate.review('conductor', [action('set_tempo')], controller.signal);
		controller.abort();
		expect((await pending).decision).toEqual({ kind: 'cancelled' });
	});

	it('approves everything without asking in auto mode', async () => {
		let asked = false;
		const gate = new PolicyGate({
			autoApprove: true,
			requestApproval: async () => {
				asked = true;
				return { kind: 'reject' };
			}
		});
		expect(gate.needsApproval({ name: 'x', kind: 'mutate' } as AnyTool)).toBe(false);
		expect((await gate.review('conductor', [action('x')])).decision).toEqual({ kind: 'approve' });
		expect(asked).toBe(false);
	});
});

describe('Journal', () => {
	const base = {
		label: 'tempo 120 → 96 bpm',
		input: { bpm: 96 },
		before: { bpm: 120 },
		after: 96,
		firmware: '1.1.33',
		agent: 'conductor'
	};

	it('numbers revisions, links undos and tells why something cannot be undone', () => {
		let now = 1000;
		const journal = new Journal({ session: 's1', threadId: 't1', now: () => now++ });
		const first = journal.record({
			...base,
			tool: 'set_tempo',
			toolCallId: 'c1',
			inverse: { tool: 'set_tempo', input: { bpm: 120 }, label: 'tempo back to 120 bpm' }
		});
		const blind = journal.record({ ...base, tool: 'set_tempo', toolCallId: 'c2', inverse: null });
		expect([first.rev, blind.rev]).toEqual([1, 2]);
		expect(first).toMatchObject({
			threadId: 't1',
			session: 's1',
			at: 1000,
			undoneBy: null,
			undoes: null
		});
		expect(journal.undoBlocker(1)).toBeNull();
		expect(journal.undoBlocker(2)).toMatch(/unknown/);
		expect(journal.undoBlocker(9)).toMatch(/no revision/);
		const undo = journal.record({
			...base,
			tool: 'set_tempo',
			toolCallId: 'undo:1',
			inverse: null,
			undoes: 1
		});
		expect(journal.get(1)?.undoneBy).toBe(undo.rev);
		expect(journal.undoBlocker(1)).toMatch(/already undone/);
	});

	it('keeps revisions from an earlier page session as history only', () => {
		const earlier = new Journal({ session: 'old', threadId: 't1' });
		earlier.record({
			...base,
			tool: 'set_tempo',
			toolCallId: 'c1',
			inverse: { tool: 'set_tempo', input: { bpm: 120 }, label: 'back' }
		});
		const now = new Journal({ session: 'new', threadId: 't1', restore: earlier.list() });
		expect(now.undoBlocker(1)).toMatch(/reloaded/);
	});
});

// ─── executor ───────────────────────────────────────────────────────────────────────────────────

interface Harness {
	executor: ToolExecutor;
	registry: ToolRegistry;
	env: AgentEnvironment;
	journal: Journal;
	events: AgentEvent[];
	log: string[];
	approvals: ApprovalRequest[];
}

function harness(
	decide: (request: ApprovalRequest) => ApprovalDecision = () => ({ kind: 'approve' })
): Harness {
	const log: string[] = [];
	const approvals: ApprovalRequest[] = [];
	const events: AgentEvent[] = [];
	let value = 10;
	const queue = new DeviceQueue();
	const timers = {
		setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
		clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>)
	};
	const tools: AnyTool[] = [
		defineTool({
			name: 'set_value',
			label: 'set value',
			kind: 'mutate',
			device: true,
			description: 'sets the value',
			input: z.object({ to: z.int().min(0).max(100) }),
			snapshot: () => ({ value }),
			preview: (input, before) => ({ label: `value ${before.value} → ${input.to}` }),
			inverse: (_input, before) => ({
				tool: 'set_value',
				input: { to: before.value },
				label: `back to ${before.value}`
			}),
			async run(input, ctx) {
				log.push(`set ${input.to} start`);
				await sleep(5, timers, ctx.signal);
				value = input.to;
				log.push(`set ${input.to} end`);
				return { content: `value ${value}`, summary: `value ${value}`, after: value };
			}
		}),
		defineTool({
			name: 'blip',
			label: 'blip',
			kind: 'mutate',
			approval: 'auto',
			device: true,
			description: 'a device job that needs no approval',
			input: z.object({}),
			async run() {
				log.push('blip');
				return { content: 'blip', summary: 'blip' };
			}
		}),
		defineTool({
			name: 'look',
			label: 'look',
			kind: 'read',
			description: 'reads',
			input: z.object({}),
			async run() {
				log.push('look');
				return { content: 'seen', summary: 'seen' };
			}
		}),
		defineTool({
			name: 'wait',
			label: 'wait',
			kind: 'mutate',
			approval: 'auto',
			device: true,
			description: 'waits until stopped',
			input: z.object({}),
			async run(_input, ctx) {
				await sleep(60_000, timers, ctx.signal);
				return { content: 'done', summary: 'done' };
			}
		})
	];
	const registry = new ToolRegistry(tools);
	const journal = new Journal({ session: 's', threadId: 't' });
	const gate = new PolicyGate({
		requestApproval: async (request) => {
			approvals.push(request);
			log.push('asked');
			return decide(request);
		}
	});
	const executor = new ToolExecutor({
		gate,
		queue,
		journal,
		emit: (event) => events.push(event),
		firmware: () => '1.1.33'
	});
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		manual: NO_MANUAL,
		timers,
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: (reason) => queue.abortAll(reason)
	};
	return { executor, registry, env, journal, events, log, approvals };
}

const call = (id: string, name: string, input: unknown = {}): ToolCallRequest => ({
	id,
	name,
	input
});

describe('ToolExecutor', () => {
	it('asks once for the turn, keeps device calls in order and returns results in call order', async () => {
		const h = harness();
		const results = await h.executor.execute({
			agent: 'conductor',
			registry: h.registry,
			env: h.env,
			signal: new AbortController().signal,
			calls: [
				call('1', 'set_value', { to: 20 }),
				call('2', 'look'),
				call('3', 'blip'),
				call('4', 'set_value', { to: 30 })
			]
		});
		expect(h.approvals).toHaveLength(1);
		expect(h.approvals[0].actions.map((a) => a.preview.label)).toEqual([
			'value 10 → 20',
			'value 10 → 30'
		]);
		// The read ran at once; device jobs strictly in order, blip after the first set completes.
		expect(h.log.indexOf('look')).toBeLessThan(h.log.indexOf('set 20 end'));
		const deviceOrder = h.log.filter((l) => l !== 'look' && l !== 'asked');
		expect(deviceOrder).toEqual([
			'set 20 start',
			'set 20 end',
			'blip',
			'set 30 start',
			'set 30 end'
		]);
		expect(results.map((r) => r.tool_use_id)).toEqual(['1', '2', '3', '4']);
		expect(results.every((r) => !r.is_error)).toBe(true);
		expect(h.journal.list().map((r) => r.label)).toEqual(['value 10 → 20', 'value 20 → 30']);
		expect(h.journal.list()[1].inverse).toMatchObject({ input: { to: 20 } });
		const ends = h.events.filter((e) => e.type === 'tool_end');
		expect(ends).toHaveLength(4);
	});

	it('rejects with the note, runs nothing that needed approval, still runs auto jobs', async () => {
		const h = harness(() => ({ kind: 'reject', note: 'not now' }));
		const results = await h.executor.execute({
			agent: 'conductor',
			registry: h.registry,
			env: h.env,
			signal: new AbortController().signal,
			calls: [call('1', 'set_value', { to: 50 }), call('2', 'blip')]
		});
		expect(results[0]).toMatchObject({ is_error: true });
		expect(String(results[0].content)).toContain('"not now"');
		expect(String(results[0].content)).toContain('Nothing was sent');
		expect(results[1].is_error).toBeUndefined();
		expect(h.log).toEqual(['asked', 'blip']);
		expect(h.journal.list()).toHaveLength(0);
		const end = h.events.find((e) => e.type === 'tool_end' && e.id === '1');
		expect(end && end.type === 'tool_end' && end.status).toBe('rejected');
	});

	it('turns invalid input and unknown tools into error results', async () => {
		const h = harness();
		const results = await h.executor.execute({
			agent: 'conductor',
			registry: h.registry,
			env: h.env,
			signal: new AbortController().signal,
			calls: [call('1', 'set_value', { to: 500 }), call('2', 'nope')]
		});
		expect(results.map((r) => r.is_error)).toEqual([true, true]);
		expect(String(results[0].content)).toMatch(/Invalid input for set_value/);
		expect(String(results[1].content)).toMatch(/no tool named "nope"/);
		expect(h.approvals).toHaveLength(0);
	});

	it('reports stopped work when the run is aborted', async () => {
		const h = harness();
		const controller = new AbortController();
		const pending = h.executor.execute({
			agent: 'conductor',
			registry: h.registry,
			env: h.env,
			signal: controller.signal,
			calls: [call('1', 'wait'), call('2', 'blip')]
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		controller.abort();
		const results = await pending;
		expect(results.map((r) => r.is_error)).toEqual([true, true]);
		expect(String(results[0].content)).toMatch(/Stopped/);
		expect(h.log).not.toContain('blip');
	});

	it('undoes a revision on the user’s behalf and journals the undo', async () => {
		const h = harness();
		await h.executor.execute({
			agent: 'conductor',
			registry: h.registry,
			env: h.env,
			signal: new AbortController().signal,
			calls: [call('1', 'set_value', { to: 42 })]
		});
		const outcome = await h.executor.undo(1, h.registry, h.env);
		expect(outcome.ok).toBe(true);
		expect(outcome.ok && outcome.revision).toMatchObject({
			undoes: 1,
			agent: 'user',
			toolCallId: 'undo:1'
		});
		expect(h.log.at(-1)).toBe('set 10 end');
		expect(h.journal.get(1)?.undoneBy).toBe(2);
		expect(await h.executor.undo(1, h.registry, h.env)).toMatchObject({ ok: false });
		// The undo can itself be undone (a redo).
		expect((await h.executor.undo(2, h.registry, h.env)).ok).toBe(true);
		expect(h.log.at(-1)).toBe('set 42 end');
	});
});
