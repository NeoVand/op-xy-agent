import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MidiBus, type MidiEvent } from '$lib/core/midi/bus';
import { MidiRangeError } from '$lib/core/midi/validate';
import {
	buildRequestFrame,
	fileDeleteRequest,
	fileListRequest,
	filePutInitRequest,
	greetRequest,
	TE_CMD,
	TE_SETTINGS,
	TePolicyError
} from '$lib/core/te';
import { FakeMidiHost } from '../../../test/fakes/fake-midi';
import { FakeOpxy, type FakeOpxyOptions } from '../../../test/fakes/fake-opxy';
import { FakeTime } from '../../../test/fakes/fake-time';
import { TransportPolicyError, TransportSendError, TransportUnavailableError } from './errors';
import {
	evaluateOutgoing,
	Transport,
	type SentRecord,
	type TransportOptions,
	type TransportPorts
} from './transport';
import type { MidiOutputLike } from './types';

interface MutablePorts {
	output: MidiOutputLike | null;
	inputPort: TransportPorts['inputPort'];
	sysexEnabled: boolean;
}

async function setup(
	options: Partial<Omit<TransportOptions, 'ports' | 'bus' | 'clock'>> = {},
	device: Omit<FakeOpxyOptions, 'host' | 'clock' | 'timers'> = {}
) {
	const time = new FakeTime();
	const host = new FakeMidiHost({ clock: time, timers: time });
	host.sysexEnabled = true;
	const opxy = new FakeOpxy({ host, clock: time, timers: time, ...device });
	opxy.plugIn();
	await opxy.input.open();
	await opxy.output.open();
	const ports: MutablePorts = {
		output: opxy.output,
		inputPort: { id: opxy.input.id, name: opxy.input.name },
		sysexEnabled: true
	};
	const bus = new MidiBus();
	const events: MidiEvent[] = [];
	bus.subscribe((event) => events.push(event));
	const sent: SentRecord[] = [];
	const transport = new Transport({
		ports,
		bus,
		clock: time,
		onSent: (record) => sent.push(record),
		...options
	});
	// Wire the input the way the device stack does.
	opxy.input.addEventListener('midimessage', (event) => {
		if (event.data) transport.receive(event.data, event.timeStamp);
	});
	const outgoing = () => events.filter((e) => e.direction === 'out');
	const incoming = () => events.filter((e) => e.direction === 'in');
	return { time, host, opxy, ports, bus, events, sent, transport, outgoing, incoming };
}

function policyCode(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		if (error instanceof TransportPolicyError) return error.code;
		throw error;
	}
	return undefined;
}

const cc = (channel: number, controller: number, value: number) =>
	({ type: 'controlChange', channel, controller, value }) as const;

const hex = (text: string) => text.split(' ').map((b) => Number.parseInt(b, 16));

describe('evaluateOutgoing: validation', () => {
	it('accepts one typed message or its bytes', () => {
		expect(evaluateOutgoing(cc(0, 7, 100)).bytes).toEqual(Uint8Array.of(0xb0, 7, 100));
		expect(evaluateOutgoing([0x90, 60, 100]).message).toEqual({
			type: 'noteOn',
			channel: 0,
			note: 60,
			velocity: 100
		});
	});

	it('copies the bytes, so later mutation cannot change what is sent', () => {
		const input = [0xb0, 7, 100];
		const verdict = evaluateOutgoing(input);
		input[2] = 1;
		expect(verdict.bytes[2]).toBe(100);
	});

	it('refuses channel 16, with the range error as the cause', () => {
		let error: unknown;
		try {
			evaluateOutgoing(cc(16, 7, 100));
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(TransportPolicyError);
		expect((error as TransportPolicyError).code).toBe('invalid-message');
		expect((error as TransportPolicyError).cause).toBeInstanceOf(MidiRangeError);
	});

	it.each([
		['an incomplete message', [0x90, 60]],
		['running status (no status byte)', [60, 100]],
		['two messages in one call', [0x90, 60, 100, 0x80, 60, 0]],
		['a value that is not a byte', [0x90, 300, 1]],
		['a fraction', [0x90, 60.5, 1]],
		['nothing at all', []],
		['an unterminated SysEx', [0xf0, 0x7e, 0x7f, 0x06, 0x01]]
	])('refuses %s', (_label, bytes) => {
		expect(policyCode(() => evaluateOutgoing(bytes))).toBe('invalid-message');
	});

	it('refuses a message of type unknown', () => {
		expect(policyCode(() => evaluateOutgoing({ type: 'unknown', bytes: [0x90] }))).toBe(
			'invalid-message'
		);
	});
});

describe('evaluateOutgoing: SysEx policy', () => {
	it('allows the universal identity request, to any device id', () => {
		expect(evaluateOutgoing(hex('F0 7E 7F 06 01 F7')).kind).toBe('identity-request');
		expect(evaluateOutgoing(hex('F0 7E 21 06 01 F7')).kind).toBe('identity-request');
	});

	it('allows documented read-only TE requests', () => {
		for (const spec of [greetRequest(), fileListRequest(0, 0)]) {
			const frame = buildRequestFrame({ deviceId: 0x21, requestId: 5, ...spec });
			const verdict = evaluateOutgoing(frame);
			expect(verdict.kind).toBe('te-request');
			expect(verdict.te?.safety).toBe('read');
		}
	});

	it('never allows DFU, in any form', () => {
		for (const payload of [[0x01, 0x01, 0x00, 0xc8], [0x05], []]) {
			const frame = buildRequestFrame({ deviceId: 0x21, requestId: 1, cmd: TE_CMD.DFU, payload });
			let error: unknown;
			try {
				evaluateOutgoing(frame);
			} catch (e) {
				error = e;
			}
			expect((error as TransportPolicyError).code).toBe('te-forbidden');
			expect((error as TransportPolicyError).cause).toBeInstanceOf(TePolicyError);
		}
	});

	it('refuses undocumented and product-specific TE commands and SETTINGS SET', () => {
		const frame = (cmd: number, payload: number[] = []) =>
			buildRequestFrame({ deviceId: 0x21, requestId: 2, cmd, payload });
		expect(policyCode(() => evaluateOutgoing(frame(0x10)))).toBe('te-forbidden');
		expect(policyCode(() => evaluateOutgoing(frame(TE_CMD.PRODUCT_SPECIFIC)))).toBe('te-forbidden');
		expect(
			policyCode(() => evaluateOutgoing(frame(TE_CMD.SETTINGS, [TE_SETTINGS.SET, 0, 1, 0x31, 0])))
		).toBe('te-forbidden');
		// A TE debug frame (byte 5 = 0x33) is not a request we may send.
		expect(policyCode(() => evaluateOutgoing(hex('F0 00 20 76 21 33 41 42 F7')))).toBe(
			'te-forbidden'
		);
	});

	it('refuses TE writes: M1 never writes to the device', () => {
		const put = filePutInitRequest({ parentId: 1, flags: 0x05, size: 4, name: 'kick.wav' });
		const del = fileDeleteRequest(3);
		for (const spec of [put, del]) {
			const frame = buildRequestFrame({ deviceId: 0x21, requestId: 3, ...spec });
			expect(policyCode(() => evaluateOutgoing(frame))).toBe('te-write');
		}
	});

	it.each([
		['manufacturer SysEx (Yamaha)', 'F0 43 10 4C 00 00 7E 00 F7'],
		['a universal non-realtime message other than identity (GM on)', 'F0 7E 7F 09 01 F7'],
		['an identity reply', 'F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7'],
		['universal realtime (master volume)', 'F0 7F 7F 04 01 00 40 F7']
	])('refuses %s', (_label, bytes) => {
		expect(policyCode(() => evaluateOutgoing(hex(bytes)))).toBe('sysex-not-allowed');
	});
});

describe('evaluateOutgoing: system messages and risk', () => {
	it.each([
		['System Reset', [0xff]],
		['Active Sensing', [0xfe]],
		['Tune Request', [0xf6]],
		['Song Select', [0xf3, 1]],
		['MTC quarter frame', [0xf1, 0x10]]
	])('refuses %s', (_label, bytes) => {
		expect(policyCode(() => evaluateOutgoing(bytes))).toBe('system-not-allowed');
	});

	it('allows start, stop, continue and clock', () => {
		for (const bytes of [[0xfa], [0xfc], [0xfb], [0xf8]]) {
			expect(evaluateOutgoing(bytes).kind).toBe('system');
		}
	});

	it('flags state-changing CCs for the journal', () => {
		expect(evaluateOutgoing(cc(3, 80, 60))).toMatchObject({ stateChanging: true, unmapped: false });
		expect(evaluateOutgoing(cc(0, 80, 60)).targets.map((t) => t.param)).toEqual(['global.tempo']);
		const mute = evaluateOutgoing(cc(2, 9, 127));
		expect(mute.stateChanging).toBe(true);
		expect(mute.targets.map((t) => `${t.param}@${t.track}`)).toEqual(['mute@3']);
		expect(evaluateOutgoing(cc(0, 102, 2)).stateChanging).toBe(false);
		expect(evaluateOutgoing(cc(0, 104, 127)).stateChanging).toBe(false);
		expect(evaluateOutgoing([0x90, 60, 100]).stateChanging).toBe(false);
	});

	it('requires confirmation and 5 s spacing for CC86 (project load)', () => {
		const verdict = evaluateOutgoing(cc(0, 86, 3));
		expect(verdict).toMatchObject({ needsConfirmation: true, minIntervalMs: 5000 });
		expect(verdict.risk?.level).toBe('destructive');
	});

	it('treats CC106 as a remote key on every channel, documented or not', () => {
		expect(evaluateOutgoing(cc(0, 106, 51)).needsConfirmation).toBe(true);
		const other = evaluateOutgoing(cc(15, 106, 51));
		expect(other).toMatchObject({ needsConfirmation: true, unmapped: true });
	});

	it('marks releases, which the pacer never refuses', () => {
		expect(evaluateOutgoing([0x80, 60, 0]).releases).toBe(true);
		expect(evaluateOutgoing([0x90, 60, 0]).releases).toBe(true);
		expect(evaluateOutgoing(cc(0, 123, 0)).releases).toBe(true);
		expect(evaluateOutgoing(cc(0, 120, 0)).releases).toBe(true);
		expect(evaluateOutgoing(cc(0, 64, 0)).releases).toBe(true);
		expect(evaluateOutgoing(cc(0, 64, 127)).releases).toBe(false);
		expect(evaluateOutgoing([0x90, 60, 1]).releases).toBe(false);
	});
});

describe('Transport.send', () => {
	it('sends one message, publishes one bus event and tells the journal', async () => {
		const { transport, opxy, outgoing, sent, time } = await setup();
		const event = transport.send(cc(0, 80, 60), { source: 'user', cause: 'lab:tempo' });
		expect(event).toMatchObject({
			direction: 'out',
			source: 'user',
			cause: 'lab:tempo',
			portId: 'opxy-out',
			portName: 'OP-XY',
			time: time.now()
		});
		expect(outgoing()).toEqual([event]);
		expect(opxy.output.sent.map((s) => [...s.bytes])).toEqual([[0xb0, 80, 60]]);
		expect(opxy.output.sent[0].timestamp).toBeUndefined();
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ event, confirmed: false });
		expect(sent[0].verdict.stateChanging).toBe(true);
		await time.advance(5);
		expect(opxy.bpm).toBe(120);
	});

	it('sends nothing and publishes nothing when the policy refuses', async () => {
		const { transport, opxy, events, sent, time } = await setup();
		const dfu = buildRequestFrame({ deviceId: 0x21, requestId: 7, cmd: TE_CMD.DFU, payload: [5] });
		expect(() => transport.send(dfu, { source: 'agent' })).toThrow(TransportPolicyError);
		expect(() => transport.send(hex('F0 43 10 4C 00 00 7E 00 F7'), { source: 'agent' })).toThrow(
			TransportPolicyError
		);
		expect(() => transport.send([0xff], { source: 'agent' })).toThrow(TransportPolicyError);
		await time.advance(10);
		expect(opxy.output.sent).toEqual([]);
		expect(opxy.dfuFrames).toBe(0);
		expect(events).toEqual([]);
		expect(sent).toEqual([]);
	});

	it('refuses SysEx without SysEx permission but still sends channel messages', async () => {
		const { transport, ports } = await setup();
		ports.sysexEnabled = false;
		expect(policyCode(() => transport.send(hex('F0 7E 7F 06 01 F7'), { source: 'system' }))).toBe(
			'sysex-permission'
		);
		expect(() => transport.send(cc(0, 7, 90), { source: 'user' })).not.toThrow();
	});

	it('throws TransportUnavailableError without an open device', async () => {
		const { transport, ports, events } = await setup();
		ports.output = null;
		expect(() => transport.send(cc(0, 7, 90), { source: 'user' })).toThrow(
			TransportUnavailableError
		);
		expect(() => transport.panic()).toThrow(TransportUnavailableError);
		expect(events).toEqual([]);
	});

	it('wraps a browser refusal in TransportSendError and publishes nothing', async () => {
		const { transport, opxy, events } = await setup();
		// The device vanished, but the port reference is still around.
		opxy.unplug();
		let error: unknown;
		try {
			transport.send(cc(0, 7, 90), { source: 'user' });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(TransportSendError);
		expect((error as TransportSendError).cause).toBeInstanceOf(DOMException);
		expect(events).toEqual([]);
	});

	it('honours an explicit delivery time', async () => {
		const { transport, opxy, time } = await setup();
		const at = time.now() + 50;
		const event = transport.send([0x90, 60, 100], { source: 'replica', at });
		expect(event.time).toBe(at);
		expect(opxy.output.sent[0].timestamp).toBe(at);
		await time.advance(49);
		expect(opxy.activeNotes.size).toBe(0);
		await time.advance(1);
		expect(opxy.activeNotes.size).toBe(1);
	});

	it('keeps sending when the journal hook throws', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { transport, opxy } = await setup({
			onSent: () => {
				throw new Error('journal broke');
			}
		});
		transport.send(cc(0, 7, 1), { source: 'user' });
		expect(opxy.output.sent).toHaveLength(1);
		expect(errors).toHaveBeenCalledOnce();
		errors.mockRestore();
	});
});

describe('Transport: confirmation tokens and spacing', () => {
	it('lets CC86 through only with a fresh, matching, unused token', async () => {
		const { transport, opxy, sent, time } = await setup();
		const load = cc(0, 86, 3);
		expect(policyCode(() => transport.send(load, { source: 'agent' }))).toBe(
			'confirmation-required'
		);

		const token = transport.confirm(load, 'owner approved loading project 3');
		expect(token.reason).toBe('owner approved loading project 3');
		transport.send(load, { source: 'agent', confirmation: token });
		expect(sent.at(-1)?.confirmed).toBe(true);
		await time.advance(5);
		expect(opxy.projectLoads).toEqual([3]);

		await time.advance(6000);
		expect(policyCode(() => transport.send(load, { source: 'agent', confirmation: token }))).toBe(
			'confirmation-required'
		);
		const forValue4 = transport.confirm(cc(0, 86, 4), 'approved');
		expect(
			policyCode(() => transport.send(load, { source: 'agent', confirmation: forValue4 }))
		).toBe('confirmation-required');
		const forged = { ...token } as typeof token;
		expect(policyCode(() => transport.send(load, { source: 'agent', confirmation: forged }))).toBe(
			'confirmation-required'
		);
		expect(opxy.output.sent).toHaveLength(1);
	});

	it('cannot be edited to let a different message through', async () => {
		const { transport, opxy, time } = await setup();
		const token = transport.confirm(cc(0, 86, 3), 'approved loading project 3');
		expect(Object.isFrozen(token)).toBe(true);
		expect(() => {
			(token as { message: string }).message = 'B0 56 07';
		}).toThrow(TypeError);
		expect(
			policyCode(() => transport.send(cc(0, 86, 7), { source: 'agent', confirmation: token }))
		).toBe('confirmation-required');
		transport.send(cc(0, 86, 3), { source: 'agent', confirmation: token });
		await time.advance(5);
		expect(opxy.projectLoads).toEqual([3]);
	});

	it('expires tokens', async () => {
		const { transport, time } = await setup({ confirmationTtlMs: 1000 });
		const token = transport.confirm(cc(0, 86, 1), 'approved');
		await time.advance(1001);
		expect(
			policyCode(() => transport.send(cc(0, 86, 1), { source: 'agent', confirmation: token }))
		).toBe('confirmation-required');
	});

	it('spaces project loads at least 5 s apart without burning the token', async () => {
		const { transport, time } = await setup();
		transport.send(cc(0, 86, 1), {
			source: 'agent',
			confirmation: transport.confirm(cc(0, 86, 1), 'approved')
		});
		await time.advance(1000);
		const next = transport.confirm(cc(5, 86, 2), 'approved');
		let error: unknown;
		try {
			transport.send(cc(5, 86, 2), { source: 'agent', confirmation: next });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(TransportPolicyError);
		expect((error as TransportPolicyError).code).toBe('too-soon');
		expect((error as TransportPolicyError).retryAfterMs).toBe(4000);
		await time.advance(4000);
		expect(() =>
			transport.send(cc(5, 86, 2), { source: 'agent', confirmation: next })
		).not.toThrow();
	});

	it('keeps the project-load spacing across a reset (reconnect)', async () => {
		const { transport } = await setup();
		transport.send(cc(0, 86, 1), {
			source: 'agent',
			confirmation: transport.confirm(cc(0, 86, 1), 'approved')
		});
		transport.reset();
		const token = transport.confirm(cc(0, 86, 2), 'approved');
		expect(
			policyCode(() => transport.send(cc(0, 86, 2), { source: 'agent', confirmation: token }))
		).toBe('too-soon');
	});

	it('cannot confirm a forbidden message', async () => {
		const { transport } = await setup();
		const dfu = buildRequestFrame({ deviceId: 0x21, requestId: 1, cmd: TE_CMD.DFU, payload: [1] });
		expect(policyCode(() => transport.confirm(dfu, 'please'))).toBe('te-forbidden');
	});

	it('mints tokens only during a user action when a gate is configured', async () => {
		let active = false;
		const { transport } = await setup({ userActivation: () => active });
		expect(policyCode(() => transport.confirm(cc(0, 86, 1), 'agent says so'))).toBe(
			'confirmation-required'
		);
		active = true;
		expect(transport.confirm(cc(0, 86, 1), 'clicked approve').message).toBe('B0 56 01');
	});
});

describe('Transport: pacing', () => {
	it('spreads a burst beyond the bucket with Web MIDI timestamps', async () => {
		const { transport, opxy, time } = await setup({ burst: 4, perSecond: 1000 });
		const now = time.now();
		const times = Array.from(
			{ length: 8 },
			(_, i) => transport.send(cc(0, 7, i), { source: 'agent' }).time - now
		);
		expect(times).toEqual([0, 0, 0, 0, 1, 2, 3, 4]);
		expect(
			opxy.output.sent.map((s) => (s.timestamp === undefined ? 0 : s.timestamp - now))
		).toEqual(times);
	});

	it('spaces a burst of 2,000 messages one millisecond apart, in order', async () => {
		const { transport, time } = await setup({ burst: 64, perSecond: 1000, maxDelayMs: 5000 });
		const now = time.now();
		const times = Array.from(
			{ length: 2000 },
			(_, i) => transport.send(cc(i % 16, 7, i % 128), { source: 'agent' }).time - now
		);
		expect(times.slice(0, 64).every((t) => t === 0)).toBe(true);
		expect(times[64]).toBeCloseTo(1);
		expect(times[1999]).toBeCloseTo(1936);
		for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
	});

	it('refuses what would wait too long, but never refuses a release', async () => {
		const { transport, time } = await setup({ burst: 2, perSecond: 10, maxDelayMs: 250 });
		const now = time.now();
		const times = [0, 1, 2, 3].map(
			(i) => transport.send(cc(0, 7, i), { source: 'agent' }).time - now
		);
		expect(times).toEqual([0, 0, 100, 200]);
		let error: unknown;
		try {
			transport.send(cc(0, 7, 9), { source: 'agent' });
		} catch (e) {
			error = e;
		}
		expect((error as TransportPolicyError).code).toBe('rate-limited');
		expect((error as TransportPolicyError).retryAfterMs).toBe(50);
		expect(transport.send([0x80, 60, 0], { source: 'agent' }).time - now).toBe(300);
		expect(transport.send(cc(0, 123, 0), { source: 'agent' }).time - now).toBe(400);
	});

	it('recovers as time passes', async () => {
		const { transport, time } = await setup({ burst: 1, perSecond: 10, maxDelayMs: 0 });
		transport.send(cc(0, 7, 1), { source: 'agent' });
		expect(policyCode(() => transport.send(cc(0, 7, 2), { source: 'agent' }))).toBe('rate-limited');
		await time.advance(100);
		expect(() => transport.send(cc(0, 7, 2), { source: 'agent' })).not.toThrow();
	});
});

describe('Transport: echoes', () => {
	it('marks the identity request the OP-XY sends back, not its reply', async () => {
		const { transport, incoming, time } = await setup();
		transport.send(hex('F0 7E 7F 06 01 F7'), { source: 'system', cause: 'session:identity' });
		await time.advance(10);
		const [reply, echo] = incoming();
		expect([...reply.bytes]).toEqual(hex('F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7'));
		expect(transport.isEcho(reply)).toBe(false);
		expect([...echo.bytes]).toEqual(hex('F0 7E 7F 06 01 F7'));
		expect(transport.isEcho(echo)).toBe(true);
		expect(echo.source).toBe('device');
	});

	it('matches each send at most once and only within the window', async () => {
		const { transport, opxy, incoming, time } = await setup({}, { echoAll: true });
		transport.send(cc(0, 7, 64), { source: 'user' });
		await time.advance(5);
		opxy.emit([0xb0, 7, 64]);
		await time.advance(5);
		const [first, second] = incoming();
		expect(transport.isEcho(first)).toBe(true);
		expect(transport.isEcho(second)).toBe(false);

		transport.send(cc(0, 7, 65), { source: 'user' });
		opxy.echoAll = false;
		opxy.emit([0xb0, 7, 65], 600);
		await time.advance(700);
		expect(transport.isEcho(incoming()[2])).toBe(false);
	});

	it('never marks outgoing events or unrelated device messages', async () => {
		const { transport, opxy, outgoing, incoming, time } = await setup();
		transport.send([0xfa], { source: 'user' });
		opxy.emit([0x90, 60, 100]);
		await time.advance(5);
		expect(transport.isEcho(outgoing()[0])).toBe(false);
		expect(incoming().every((e) => !transport.isEcho(e))).toBe(true);
	});

	it('forgets pending echoes on reset', async () => {
		const { transport, opxy, incoming, time } = await setup();
		transport.send(cc(0, 7, 64), { source: 'user' });
		transport.reset();
		opxy.emit([0xb0, 7, 64]);
		await time.advance(5);
		expect(transport.isEcho(incoming()[0])).toBe(false);
	});
});

describe('Transport: panic', () => {
	it('sends sustain off, All Notes Off and All Sound Off on all 16 channels, paced', async () => {
		const { transport, opxy, time } = await setup();
		const now = time.now();
		const events = transport.panic();
		expect(events).toHaveLength(48);
		expect(events.every((e) => e.source === 'system' && e.cause === 'panic')).toBe(true);
		expect(events.map((e) => e.time - now)).toEqual(events.map((_, i) => i * 2));
		for (let channel = 0; channel < 16; channel++) {
			const mine = events.filter((e) => e.bytes[0] === (0xb0 | channel)).map((e) => e.bytes[1]);
			expect(mine).toEqual([64, 123, 120]);
		}
		await time.advance(200);
		expect(opxy.allNotesOff).toBe(16);
		expect(opxy.allSoundOff).toBe(16);
	});

	it('releases every note we started first, then clears the ledger', async () => {
		const { transport, opxy, time } = await setup();
		transport.send([0x90, 60, 100], { source: 'agent' });
		transport.send([0x92, 64, 90], { source: 'agent' });
		transport.send([0x92, 64, 90], { source: 'agent' });
		transport.send([0x91, 50, 90], { source: 'agent' });
		transport.send([0x81, 50, 0], { source: 'agent' });
		expect(transport.soundingNotes).toBe(3);
		const events = transport.panic({ source: 'user', cause: 'lab:panic' });
		expect(events.slice(0, 2).map((e) => [...e.bytes])).toEqual([
			[0x80, 60, 0],
			[0x82, 64, 0]
		]);
		expect(events[0]).toMatchObject({ source: 'user', cause: 'lab:panic' });
		expect(transport.soundingNotes).toBe(0);
		await time.advance(200);
		expect(opxy.activeNotes.size).toBe(0);
	});

	it('clears a channel from the ledger on All Notes Off', async () => {
		const { transport } = await setup();
		transport.send([0x90, 60, 100], { source: 'agent' });
		transport.send([0x91, 61, 100], { source: 'agent' });
		transport.send(cc(0, 123, 0), { source: 'agent' });
		expect(transport.soundingNotes).toBe(1);
	});

	it('is never refused by the pacer, and later sends queue behind it', async () => {
		const { transport, time } = await setup({ burst: 1, perSecond: 1, maxDelayMs: 0 });
		transport.send(cc(0, 7, 1), { source: 'agent' });
		const now = time.now();
		const events = transport.panic();
		expect(events).toHaveLength(48);
		await time.advance(2000);
		const after = transport.send([0x90, 60, 1], { source: 'agent' });
		expect(after.time).toBeGreaterThanOrEqual(events[47].time);
		expect(events[47].time - now).toBe(94);
	});
});

describe('the single send choke point', () => {
	const root = fileURLToPath(new URL('../..', import.meta.url));

	function sourceFiles(): string[] {
		const files = (readdirSync(root, { recursive: true }) as string[])
			.filter((file) => /\.(ts|svelte)$/.test(file))
			.filter((file) => !/\.(spec|test)\.ts$/.test(file))
			.map((file) => join(root, file));
		// The scan must actually see the device layer, or it proves nothing.
		expect(files.some((f) => f.endsWith(`device${sep}transport.ts`))).toBe(true);
		expect(files.some((f) => f.endsWith(`device${sep}access.svelte.ts`))).toBe(true);
		return files;
	}

	it('no module but device/transport.ts calls send() on a MIDI output', () => {
		const outputSend = /\b(?:[\w$]*[oO]utput[\w$]*|[\w$]*Port|port)\s*\??\.\s*send\s*\(/;
		const mapSend = /\boutputs\b[^\n;]*\.send\s*\(/;
		const offending = (text: string) => outputSend.test(text) || mapSend.test(text);
		// The heuristic catches the usual shapes and leaves the transport's own API alone.
		for (const snippet of [
			'output.send(bytes)',
			'this.#openOutput?.send(bytes, at)',
			'midiPort.send([0xfa])',
			'port.send(x)',
			'access.outputs.get(id)?.send(bytes)'
		]) {
			expect(offending(snippet), snippet).toBe(true);
		}
		expect(offending('transport.send(message, { source })')).toBe(false);
		expect(offending('stack.transport.send(x)')).toBe(false);

		const offenders = sourceFiles()
			.filter((file) => relative(root, file).split(sep).join('/') !== 'lib/device/transport.ts')
			.filter((file) => offending(readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('only device/env.ts calls requestMIDIAccess', () => {
		const offenders = sourceFiles()
			.filter((file) => relative(root, file).split(sep).join('/') !== 'lib/device/env.ts')
			.filter((file) => /\.requestMIDIAccess\s*\(/.test(readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('core never imports the device layer', () => {
		const core = sourceFiles().filter((file) =>
			relative(root, file).split(sep).join('/').startsWith('lib/core/')
		);
		expect(core.length).toBeGreaterThan(10);
		const offenders = core.filter((file) =>
			/from\s+['"](?:\$lib\/device|\.\.\/\.\.\/device|\.\.\/device)/.test(
				readFileSync(file, 'utf8')
			)
		);
		expect(offenders).toEqual([]);
	});
});
