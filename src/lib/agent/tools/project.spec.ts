// send_project against a fake project transfer: it waits for approval (a mutate tool), checks the
// name the OP-XY takes, reports the path and what the file could not carry, and explains a refusal
// (no USB in this browser, the OP-XY not in MTP mode).
import { describe, expect, it } from 'vitest';
import { FakeTime } from '../../../../test/fakes/fake-time';
import { NO_MANUAL } from '../manual-source';
import type { AgentEnvironment, ProjectHost, ToolContext, ToolResult } from './define';
import { createConductorRegistry } from './index';
import { sendProjectTool } from './project';

function setup(host: ProjectHost | null) {
	const env: AgentEnvironment = {
		device: null,
		replica: null,
		projects: host,
		manual: NO_MANUAL,
		timers: new FakeTime(),
		confirmWindowMs: 0,
		plan: { get: () => [], set: () => {} },
		abortDeviceWork: () => {}
	};
	const ctx: ToolContext = {
		toolCallId: 'toolu_p',
		agent: 'conductor',
		signal: new AbortController().signal,
		env
	};
	return (input: unknown): Promise<ToolResult> =>
		sendProjectTool.run(sendProjectTool.input.parse(input), ctx);
}

function fakeHost(outcome: 'ok' | 'fail', usb = true) {
	const saved: string[] = [];
	const host: ProjectHost = {
		usb,
		async saveToDevice(name) {
			saved.push(name);
			return outcome === 'ok'
				? { path: `projects/user/${name}.xy`, skipped: ['track 8: the multisampler zones'] }
				: { error: 'No device selected.' };
		}
	};
	return { host, saved };
}

describe('send_project', () => {
	it('adds the project to the OP-XY after approval and says where', async () => {
		const { host, saved } = fakeHost('ok');
		const result = await setup(host)({ name: 'house jam' });
		expect(result.isError).toBeFalsy();
		expect(saved).toEqual(['house jam']);
		expect(JSON.parse(String(result.content))).toMatchObject({
			saved: 'projects/user/house jam.xy',
			notCarried: ['track 8: the multisampler zones']
		});
		const tool = createConductorRegistry().get('send_project');
		expect(tool?.kind).toBe('mutate');
		expect(tool?.approval).not.toBe('auto');
		expect(
			sendProjectTool.preview?.({ name: 'house jam' }, undefined as never, undefined as never)
		).toMatchObject({
			label: 'add "house jam" to the op-xy\'s projects',
			after: 'projects/user/house jam.xy'
		});
	});

	it('lowercases a name and refuses one the OP-XY would not take', async () => {
		const { host, saved } = fakeHost('ok');
		const send = setup(host);
		await send({ name: 'House Jam' });
		expect(saved).toEqual(['house jam']);
		const bad = await send({ name: 'jam/2' });
		expect(bad).toMatchObject({ isError: true, summary: 'bad name' });
		expect(saved).toHaveLength(1);
	});

	it('explains a failed send, no USB, and no transfer at all', async () => {
		const failed = await setup(fakeHost('fail').host)({ name: 'x' });
		expect(failed.isError).toBe(true);
		expect(String(failed.content)).toMatch(/MTP mode \(com → M4\)/);
		expect(await setup(fakeHost('ok', false).host)({ name: 'x' })).toMatchObject({
			isError: true,
			summary: 'no usb here'
		});
		expect(await setup(null)({ name: 'x' })).toMatchObject({ isError: true });
	});
});
