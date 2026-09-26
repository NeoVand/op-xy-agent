// Behaviour of the shared fakes in test/fakes/ (an emulated OP-XY behind fake Web MIDI). The spec
// lives here because the Node test project only collects specs under src/.
import { describe, expect, it } from 'vitest';
import {
	buildRequestFrame,
	echoRequest,
	fileInitRequest,
	fileListRequest,
	greetRequest,
	parseFileListReply,
	parseFrame,
	parseGreetReply,
	TE_CMD
} from '$lib/core/te';
import { FakeMidiHost } from '../../../test/fakes/fake-midi';
import {
	FAKE_OPXY_IDENTITY_REPLY,
	FAKE_SERIAL,
	FakeOpxy,
	type FakeOpxyOptions
} from '../../../test/fakes/fake-opxy';
import { FakeTime } from '../../../test/fakes/fake-time';

/** A plugged-in fake OP-XY whose ports are open, with everything it sends collected. */
async function device(options: Omit<FakeOpxyOptions, 'host' | 'clock' | 'timers'> = {}) {
	const time = new FakeTime();
	const host = new FakeMidiHost({ clock: time, timers: time });
	host.sysexEnabled = true;
	const opxy = new FakeOpxy({ host, clock: time, timers: time, ...options });
	opxy.plugIn();
	await opxy.input.open();
	await opxy.output.open();
	const heard: Array<{ bytes: number[]; time: number }> = [];
	opxy.input.addEventListener('midimessage', (event) => {
		if (event.data) heard.push({ bytes: [...event.data], time: event.timeStamp });
	});
	const send = (bytes: ArrayLike<number>, at?: number) => opxy.output.send(bytes, at);
	return { time, host, opxy, heard, send };
}

let rid = 100;
const request = (spec: { cmd: number; payload: Uint8Array }) =>
	buildRequestFrame({ deviceId: 0x21, requestId: rid++, ...spec });

function reply(heard: Array<{ bytes: number[] }>, index = -1) {
	const frame = parseFrame(heard.at(index)?.bytes ?? []);
	if (frame.kind !== 'response') throw new Error(`expected a TE response, got ${frame.kind}`);
	return frame;
}

describe('FakeOpxy: identity and TE protocol', () => {
	it('answers the identity request, then sends the request back', async () => {
		const { send, heard, time } = await device();
		send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
		await time.advance(5);
		expect(heard.map((h) => h.bytes)).toEqual([
			[...FAKE_OPXY_IDENTITY_REPLY],
			[0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]
		]);
	});

	it('answers GREET with metadata and a fake serial', async () => {
		const { send, heard, time } = await device({ osVersion: '1.1.21', mode: 'bootloader' });
		send(request(greetRequest()));
		await time.advance(5);
		const greet = parseGreetReply(reply(heard).data);
		expect(greet).toMatchObject({
			product: 'OP-XY',
			os_version: '1.1.21',
			mode: 'bootloader',
			serial: FAKE_SERIAL,
			hw_rev: '2',
			sku: 'TE033AS001'
		});
	});

	it('echoes ECHO payloads and never echoes TE requests themselves', async () => {
		const { send, heard, time } = await device();
		send(request(echoRequest([0xde, 0xad, 0xbe, 0xef, 0x00, 0x7f, 0x80, 0xff, 0x01])));
		await time.advance(5);
		expect(heard).toHaveLength(1);
		expect([...reply(heard).data]).toEqual([0xde, 0xad, 0xbe, 0xef, 0x00, 0x7f, 0x80, 0xff, 0x01]);
	});

	it('serves FILE INIT and the drum/synth listing like OS 1.1.33', async () => {
		const { send, heard, time, opxy } = await device();
		send(request(fileInitRequest()));
		await time.advance(5);
		expect([...reply(heard).data]).toEqual([0x0c, 0x00, 0x02, 0x00, 0x00]);
		expect(opxy.fileSessionOpen).toBe(true);

		send(request(fileListRequest(0, 0)));
		send(request(fileListRequest(1, 0)));
		send(request(fileListRequest(0, 1)));
		await time.advance(5);
		const root = parseFileListReply(reply(heard, 1).data);
		expect(root.entries.map((e) => [e.id, e.name, e.flags, e.size])).toEqual([
			[1, 'drum', 0x0e, 0],
			[2, 'synth', 0x0e, 0]
		]);
		expect(parseFileListReply(reply(heard, 2).data)).toEqual({ page: 1, entries: [] });
		expect(parseFileListReply(reply(heard, 3).data)).toEqual({ page: 0, entries: [] });
	});

	it('refuses what OS 1.1.33 refuses and never answers DFU', async () => {
		const { send, heard, time, opxy } = await device();
		send(
			buildRequestFrame({
				deviceId: 0x21,
				requestId: 1,
				cmd: TE_CMD.SETTINGS,
				payload: [1, 3, 0xe8]
			})
		);
		send(
			buildRequestFrame({ deviceId: 0x21, requestId: 2, cmd: TE_CMD.FILE, payload: [0x0b, 0, 0] })
		);
		send(
			buildRequestFrame({ deviceId: 0x21, requestId: 3, cmd: TE_CMD.DFU, payload: [1, 1, 0, 0xc8] })
		);
		await time.advance(5);
		expect(heard.map((h) => reply([h]).status)).toEqual([2, 3]);
		expect(opxy.dfuFrames).toBe(1);
	});

	it('can stay silent (TE or identity)', async () => {
		const { send, heard, time } = await device({ respondToTe: false, respondToIdentity: false });
		send(request(greetRequest()));
		send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
		await time.advance(5);
		expect(heard.map((h) => h.bytes)).toEqual([[0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]]);
	});
});

describe('FakeOpxy: transport, clock and CCs', () => {
	it('sends no transport or clock with the stock clock-in setting', async () => {
		const { send, heard, time, opxy } = await device();
		send([0xfa]);
		await time.advance(1000);
		expect(opxy.playing).toBe(true);
		opxy.pressStop();
		await time.advance(5);
		expect(opxy.playing).toBe(false);
		expect(heard).toEqual([]);
	});

	it('with clock both: F8 at the tempo even while stopped, FA/FC for every start and stop', async () => {
		const { send, heard, time, opxy } = await device({ clockMode: 'both' });
		await time.advance(1000);
		expect(heard.filter((h) => h.bytes[0] === 0xf8)).toHaveLength(48);
		send([0xb0, 80, 64]);
		await time.advance(1);
		expect(opxy.bpm).toBe(128);
		heard.length = 0;
		await time.advance(1000);
		expect(heard.filter((h) => h.bytes[0] === 0xf8).length).toBeGreaterThanOrEqual(50);

		heard.length = 0;
		opxy.pressPlay();
		send([0xfc]);
		send([0xb0, 104, 127]);
		send([0xb5, 105, 127]);
		await time.advance(5);
		expect(heard.filter((h) => h.bytes[0] !== 0xf8).map((h) => h.bytes[0])).toEqual([
			0xfa, 0xfc, 0xfa, 0xfc
		]);
		expect(opxy.playing).toBe(false);
	});

	it('clamps CC80 tempo to 40–220 and applies CC9, CC102 and CC86', async () => {
		const { send, time, opxy } = await device();
		send([0xb0, 80, 0]);
		await time.advance(1);
		expect(opxy.bpm).toBe(40);
		send([0xb3, 80, 127]);
		send([0xb2, 9, 64]);
		send([0xb0, 102, 2]);
		send([0xb0, 86, 7]);
		await time.advance(1);
		expect(opxy.bpm).toBe(220);
		expect(opxy.mutes[2]).toBe(true);
		expect(opxy.selectedTrack).toBe(3);
		expect(opxy.projectLoads).toEqual([7]);
		send([0xb2, 9, 0]);
		send([0xb5, 102, 4]);
		await time.advance(1);
		expect(opxy.mutes[2]).toBe(false);
		expect(opxy.selectedTrack).toBe(3);
	});

	it('ignores remote keys (CC106/107) like OS 1.1.33, but counts them', async () => {
		const { send, time, opxy, heard } = await device({ clockMode: 'both' });
		send([0xb0, 106, 51]);
		send([0xb0, 107, 51]);
		await time.advance(5);
		expect(opxy.remoteKeyMessages).toBe(2);
		expect(opxy.playing).toBe(false);
		expect(heard.every((h) => h.bytes[0] === 0xf8)).toBe(true);
	});

	it('tracks notes and All Notes Off, and echoes everything with echo on', async () => {
		const { send, time, opxy, heard } = await device({ echoAll: true });
		send([0x90, 60, 100]);
		send([0x91, 62, 100]);
		send([0xb0, 123, 0]);
		await time.advance(5);
		expect([...opxy.activeNotes]).toEqual([128 + 62]);
		expect(opxy.allNotesOff).toBe(1);
		expect(heard.map((h) => h.bytes)).toEqual([
			[0x90, 60, 100],
			[0x91, 62, 100],
			[0xb0, 123, 0]
		]);
	});
});

describe('FakeOpxy and FakeMidiHost: hot-plug and Web MIDI rules', () => {
	it('drops pending replies and stops the clock when unplugged; resumes when plugged back in', async () => {
		const { send, time, opxy, heard } = await device({ clockMode: 'both', latencyMs: 10 });
		send(request(greetRequest()));
		await time.advance(2);
		opxy.unplug();
		expect(opxy.input.state).toBe('disconnected');
		expect(opxy.input.connection).toBe('pending');
		await time.advance(1000);
		expect(heard.filter((h) => h.bytes[0] !== 0xf8)).toEqual([]);
		const before = heard.length;
		opxy.plugIn();
		expect(opxy.input.connection).toBe('open');
		await time.advance(100);
		expect(heard.length).toBeGreaterThan(before);
	});

	it('enforces Web MIDI send rules', async () => {
		const { send, host, opxy } = await device();
		expect(() => send([0x90, 60])).toThrow(TypeError);
		expect(() => send([60, 100])).toThrow(TypeError);
		expect(() => send([0xf0, 0x01])).toThrow(TypeError);
		expect(() => send([0xf4])).toThrow(TypeError);
		host.sysexEnabled = false;
		expect(() => send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])).toThrow(
			expect.objectContaining({ name: 'InvalidAccessError' })
		);
		opxy.unplug();
		expect(() => send([0xfa])).toThrow(expect.objectContaining({ name: 'InvalidStateError' }));
	});

	it('delays delivery until a future timestamp', async () => {
		const { send, time, opxy } = await device();
		send([0x90, 60, 100], time.now() + 30);
		await time.advance(29);
		expect(opxy.activeNotes.size).toBe(0);
		await time.advance(1);
		expect(opxy.activeNotes.size).toBe(1);
	});

	it('grants, denies and reports permission like a browser', async () => {
		const time = new FakeTime();
		const host = new FakeMidiHost({ clock: time, timers: time });
		const env = host.environment();
		expect(await env.queryPermission(true)).toBe('prompt');
		host.grantSysex = false;
		const access = await host.request({ sysex: true });
		expect(access.sysexEnabled).toBe(false);
		expect(await env.queryPermission(true)).toBe('granted');
		host.denyWith = 'NotAllowedError';
		await expect(host.request({ sysex: true })).rejects.toMatchObject({ name: 'NotAllowedError' });
		expect(host.requests).toHaveLength(2);
		host.supported = false;
		expect(host.environment().requestMIDIAccess).toBeNull();
	});
});
