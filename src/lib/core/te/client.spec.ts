import { describe, expect, it } from 'vitest';
import { TeClient, type TeClientOptions, type TeScheduler } from './client';
import {
	buildResponseFrame,
	pack7,
	parseFrame,
	type TeEventFrame,
	type TeRequestFrame
} from './codec';
import {
	fileDeleteRequest,
	fileInfoRequest,
	fileMetadataGetRequest,
	greetRequest
} from './commands';
import { TE_CMD, TE_DEFAULT_TIMEOUT_MS, TE_FILE } from './constants';
import {
	TeClosedError,
	TeCodecError,
	TeHaltedError,
	TePolicyError,
	TeProtocolError,
	TeStatusError,
	TeTimeoutError
} from './errors';
import {
	ascii,
	CAPTURE_DISCOVER,
	CAPTURE_ECHO,
	CAPTURE_EMPTY_DIRS,
	CAPTURE_FILES,
	CAPTURE_SETTINGS,
	hex,
	OPXY_IDENTITY_REPLY,
	SYNTHETIC_GREET_TEXT,
	type Capture
} from './fixtures';

/** Manual clock: timers fire only inside advance(). */
class FakeScheduler implements TeScheduler {
	now = 0;
	readonly timers = new Map<number, { at: number; callback: () => void }>();
	#nextId = 1;
	#cancellable: boolean;

	/** `cancellable: false` simulates a scheduler whose clearTimeout does nothing. */
	constructor(cancellable = true) {
		this.#cancellable = cancellable;
	}

	setTimeout(callback: () => void, ms: number): number {
		const id = this.#nextId++;
		this.timers.set(id, { at: this.now + ms, callback });
		return id;
	}

	clearTimeout(handle: unknown): void {
		if (this.#cancellable) this.timers.delete(handle as number);
	}

	get pending(): number {
		return this.timers.size;
	}

	advance(ms: number): void {
		const target = this.now + ms;
		for (;;) {
			let due: [number, { at: number; callback: () => void }] | undefined;
			for (const entry of this.timers) {
				if (entry[1].at <= target && (due === undefined || entry[1].at < due[1].at)) due = entry;
			}
			if (due === undefined) break;
			this.timers.delete(due[0]);
			this.now = due[1].at;
			due[1].callback();
		}
		this.now = target;
	}
}

/** A random source that makes the client's first request id `firstId`. */
function randomFor(firstId: number): () => number {
	const start = (firstId + 4095) % 4096;
	return () => (start + 0.5) / 4095;
}

function asRequest(bytes: Uint8Array): TeRequestFrame {
	const frame = parseFrame(bytes);
	if (frame.kind !== 'request' || frame.requestId === null) throw new Error('not a request');
	return frame;
}

function setup(options: Partial<TeClientOptions> = {}) {
	const scheduler = new FakeScheduler();
	const sent: Uint8Array[] = [];
	const client = new TeClient({
		deviceId: 0x21,
		scheduler,
		send: (bytes) => {
			sent.push(bytes);
		},
		random: randomFor(1),
		timeoutMs: 1000,
		...options
	});
	const lastRequest = () => asRequest(sent[sent.length - 1]);
	/** Answers the most recent request (or `to`) with `status` and `data`. */
	const reply = (status = 0, data: ArrayLike<number> = [], to = lastRequest()) =>
		client.handleIncoming(
			buildResponseFrame({
				deviceId: 0x21,
				requestId: to.requestId ?? 0,
				cmd: to.cmd,
				status,
				data
			})
		);
	return { client, scheduler, sent, lastRequest, reply };
}

type Answer = { status: number; data?: ArrayLike<number> } | null;

/** A client whose device answers synchronously inside `send` (null = stay silent). */
function responder(
	answer: (request: TeRequestFrame) => Answer,
	options: Partial<TeClientOptions> = {}
) {
	const scheduler = new FakeScheduler();
	const requests: TeRequestFrame[] = [];
	const client: TeClient = new TeClient({
		deviceId: 0x21,
		scheduler,
		random: randomFor(1),
		timeoutMs: 1000,
		send: (bytes) => {
			const request = asRequest(bytes);
			requests.push(request);
			const result = answer(request);
			if (result === null) return;
			client.handleIncoming(
				buildResponseFrame({
					deviceId: 0x21,
					requestId: request.requestId ?? 0,
					cmd: request.cmd,
					status: result.status,
					data: result.data
				})
			);
		},
		...options
	});
	return { client, scheduler, requests };
}

/**
 * Replays a captured session: every frame the client sends must equal the probe's frame byte for
 * byte, and the device's captured reply is fed back.
 */
function replay(capture: Capture) {
	const outbound = capture.frames.filter((f) => f.dir === 'out').map((f) => f.bytes);
	const inbound = capture.frames.filter((f) => f.dir === 'in').map((f) => f.bytes);
	const sent: Uint8Array[] = [];
	const client: TeClient = new TeClient({
		deviceId: 0x21,
		scheduler: new FakeScheduler(),
		random: randomFor(capture.firstRequestId),
		send: (bytes) => {
			const index = sent.length;
			sent.push(bytes);
			expect(bytes).toEqual(outbound[index]);
			expect(client.handleIncoming(inbound[index])).toBe('response');
		}
	});
	return { client, sent, outbound };
}

function fileEntry(id: number, name: string): number[] {
	return [id >> 8, id & 0xff, 0x05, 0, 0, 0x10, 0x00, ...ascii(name), 0];
}

describe('replays of the real OP-XY sessions (OS 1.1.33)', () => {
	it('ECHO round trip', async () => {
		const { client, sent } = replay(CAPTURE_ECHO);
		const probe = hex('DE AD BE EF 00 7F 80 FF 01');
		await expect(client.echo(probe)).resolves.toEqual(probe);
		expect(sent).toHaveLength(1);
	});

	it('FILE INIT then FILE LIST of the root: drum and synth', async () => {
		const { client, sent, outbound } = replay(CAPTURE_FILES);
		await expect(client.fileInit()).resolves.toEqual({ leadingByte: 0x0c, chunkSize: 131072 });
		await expect(client.fileList(0)).resolves.toEqual([
			{ id: 1, flags: 0x0e, size: 0, name: 'drum' },
			{ id: 2, flags: 0x0e, size: 0, name: 'synth' }
		]);
		expect(sent).toHaveLength(outbound.length);
	});

	it('FILE LIST of drum and synth: both empty', async () => {
		const { client } = replay(CAPTURE_EMPTY_DIRS);
		await expect(client.fileList(1)).resolves.toEqual([]);
		await expect(client.fileList(2)).resolves.toEqual([]);
	});

	it('SETTINGS INIT is answered with status 2 "command not found"', async () => {
		const { client } = replay(CAPTURE_SETTINGS);
		const error = await client
			.request({ cmd: TE_CMD.SETTINGS, payload: [0x01, 0x03, 0xe8] })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TeStatusError);
		expect(error).toMatchObject({
			status: 2,
			statusInfo: { kind: 'command-not-found' },
			requestId: 2336,
			reason: ''
		});
		expect((error as Error).message).toBe('SETTINGS INIT failed with status 2 (command not found)');
	});

	it('FILE INFO and METADATA GET (EP-133 layout) are answered with status 3 "bad request"', async () => {
		const { client } = replay(CAPTURE_DISCOVER);
		await client.fileInit();
		for (const spec of [fileInfoRequest(0), fileMetadataGetRequest(0, 0)]) {
			const error = await client.request(spec).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(TeStatusError);
			expect(error).toMatchObject({ status: 3, statusInfo: { kind: 'bad-request' } });
		}
	});
});

describe('requests', () => {
	it('greet() sends GREET and parses the reply (fake serial)', async () => {
		const h = setup();
		const promise = h.client.greet();
		expect(h.sent).toEqual([hex('F0 00 20 76 21 40 60 01 01 F7')]);
		expect(h.reply(0, ascii(SYNTHETIC_GREET_TEXT))).toBe('response');
		await expect(promise).resolves.toMatchObject({
			product: 'OP-XY',
			os_version: '1.1.33',
			serial: 'TESTSERIAL',
			sku: 'TE033AS001'
		});
	});

	it('keeps one request in flight and sends the rest in order', async () => {
		const h = setup();
		const a = h.client.request(greetRequest());
		const b = h.client.echo([1, 2, 3]);
		const c = h.client.fileInit();
		expect(h.sent).toHaveLength(1);
		expect(h.client.pendingCount).toBe(3);
		h.reply(0, ascii('product:OP-XY'));
		expect(h.sent).toHaveLength(2);
		expect(h.lastRequest()).toMatchObject({ cmd: TE_CMD.ECHO, requestId: 2 });
		h.reply(0, [1, 2, 3]);
		expect(h.lastRequest()).toMatchObject({ cmd: TE_CMD.FILE, requestId: 3 });
		h.reply(0, hex('0C 00 02 00 00'));
		await expect(a).resolves.toMatchObject({ cmd: TE_CMD.GREET, requestId: 1, status: 0 });
		await expect(b).resolves.toEqual(Uint8Array.from([1, 2, 3]));
		await expect(c).resolves.toEqual({ leadingByte: 0x0c, chunkSize: 131072 });
		expect(h.client.pendingCount).toBe(0);
		expect(h.scheduler.pending).toBe(0);
	});

	it('allocates request ids from a random start and wraps after 4095', async () => {
		const h = setup({ random: randomFor(4095) });
		for (const expected of [4095, 0, 1]) {
			const promise = h.client.request(greetRequest());
			expect(h.lastRequest().requestId).toBe(expected);
			h.reply(0);
			await promise;
		}
	});

	it('starts request ids at random 0–4094 (first id 1–4095)', () => {
		const low = setup({ random: () => 0 });
		void low.client.greet();
		expect(low.lastRequest().requestId).toBe(1);
		const high = setup({ random: () => 0.99999999 });
		void high.client.greet();
		expect(high.lastRequest().requestId).toBe(4095);
		expect(() => setup({ random: () => -0.5 })).toThrow(TeCodecError);
		expect(() => setup({ random: () => Number.NaN })).toThrow(TeCodecError);
	});

	it('handles replies delivered synchronously inside send', async () => {
		const { client, requests, scheduler } = responder((request) => ({
			status: 0,
			data: request.payload
		}));
		const results = await Promise.all([client.echo([1]), client.echo([2]), client.echo([3])]);
		expect(results).toEqual([Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)]);
		expect(requests.map((r) => r.requestId)).toEqual([1, 2, 3]);
		expect(scheduler.pending).toBe(0);
	});

	it('names requests after the policy when no name is given', async () => {
		const h = setup();
		const promise = h.client.request({ cmd: TE_CMD.FILE, payload: [TE_FILE.INFO, 0x00, 0x01] });
		h.reply(3);
		await expect(promise).rejects.toThrow('FILE INFO failed with status 3 (bad request)');
	});

	it('rejects invalid requests without sending anything', async () => {
		const h = setup();
		await expect(h.client.request({ cmd: 0x80 })).rejects.toBeInstanceOf(TeCodecError);
		await expect(h.client.request({ cmd: TE_CMD.ECHO, payload: [256] })).rejects.toBeInstanceOf(
			TeCodecError
		);
		await expect(h.client.request(greetRequest(), { timeoutMs: 0 })).rejects.toBeInstanceOf(
			TeCodecError
		);
		expect(h.sent).toHaveLength(0);
	});
});

describe('incoming traffic', () => {
	it('ignores our own request echoed back', async () => {
		const h = setup();
		const promise = h.client.greet();
		expect(h.client.handleIncoming(h.sent[0])).toBe('echo');
		expect(h.client.pendingCount).toBe(1);
		h.reply(0, ascii('product:OP-XY'));
		await expect(promise).resolves.toEqual({ product: 'OP-XY' });
	});

	it('ignores replies with another request id, command or device id', async () => {
		const h = setup();
		const promise = h.client.greet();
		const request = h.lastRequest();
		const requestId = request.requestId ?? 0;
		const others = [
			{ deviceId: 0x21, requestId: (requestId + 1) % 4096, cmd: TE_CMD.GREET, status: 0 },
			{ deviceId: 0x21, requestId, cmd: TE_CMD.ECHO, status: 0 },
			{ deviceId: 0x22, requestId, cmd: TE_CMD.GREET, status: 0 }
		];
		for (const fields of others) {
			expect(h.client.handleIncoming(buildResponseFrame(fields))).toBe('unmatched');
		}
		expect(h.client.pendingCount).toBe(1);
		h.reply(0);
		await expect(promise).resolves.toEqual({});
	});

	it('ignores foreign and malformed messages', () => {
		const h = setup();
		expect(h.client.handleIncoming([0x90, 60, 100])).toBe('not-te');
		expect(h.client.handleIncoming(OPXY_IDENTITY_REPLY)).toBe('not-te');
		expect(h.client.handleIncoming(hex('F0 00 20 76 21 40 60 01 01'))).toBe('malformed');
		expect(h.client.handleIncoming(hex('F0 00 20 76 21 40 20 01 01 00 F7'))).toBe('unmatched');
		expect(h.client.state).toBe('ready');
	});

	it('passes unsolicited events from this device to onEvent', () => {
		const events: TeEventFrame[] = [];
		const h = setup({ onEvent: (event) => events.push(event) });
		const deleted = [10, 0x00, 0x07]; // FILE_DELETED, node 7 (EP-style event)
		const event = [...hex('F0 00 20 76 21 40 00 00 05 00'), ...pack7(deleted), 0xf7];
		expect(h.client.handleIncoming(event)).toBe('event');
		expect(events).toEqual([
			{ kind: 'event', deviceId: 0x21, cmd: TE_CMD.FILE, status: 0, data: Uint8Array.from(deleted) }
		]);
		const foreign = [...hex('F0 00 20 76 22 40 00 00 05 00'), ...pack7(deleted), 0xf7];
		expect(h.client.handleIncoming(foreign)).toBe('unmatched');
		expect(events).toHaveLength(1);
	});
});

describe('timeouts and statuses', () => {
	it('rejects with TeTimeoutError, then sends the next request', async () => {
		const h = setup();
		const first = h.client.greet().catch((e: unknown) => e);
		const second = h.client.greet();
		h.scheduler.advance(999);
		expect(h.sent).toHaveLength(1);
		h.scheduler.advance(1);
		const error = await first;
		expect(error).toBeInstanceOf(TeTimeoutError);
		expect(error).toMatchObject({ cmd: TE_CMD.GREET, requestId: 1, timeoutMs: 1000 });
		expect((error as Error).message).toContain('GREET');
		expect(h.sent).toHaveLength(2);
		// A late reply to the first request is ignored.
		expect(h.reply(0, [], asRequest(h.sent[0]))).toBe('unmatched');
		h.reply(0, ascii('mode:normal'));
		await expect(second).resolves.toEqual({ mode: 'normal' });
	});

	it('uses TE’s 20 s default and per-request timeouts', async () => {
		const h = setup({ timeoutMs: undefined });
		const slow = h.client.greet().catch((e: unknown) => e);
		h.scheduler.advance(TE_DEFAULT_TIMEOUT_MS - 1);
		expect(h.client.pendingCount).toBe(1);
		h.scheduler.advance(1);
		expect(await slow).toBeInstanceOf(TeTimeoutError);
		const quick = h.client.greet({ timeoutMs: 50 }).catch((e: unknown) => e);
		h.scheduler.advance(50);
		expect(await quick).toMatchObject({ timeoutMs: 50 });
	});

	it('keeps waiting on in-progress statuses (≥ 64) and restarts the timeout', async () => {
		const progress: number[] = [];
		const h = setup();
		const promise = h.client.request(greetRequest(), {
			onProgress: (reply) => progress.push(reply.status)
		});
		h.scheduler.advance(900);
		expect(h.reply(64, [50])).toBe('progress');
		h.scheduler.advance(900); // 1800 ms since sending: past the original timeout
		expect(h.reply(127)).toBe('progress');
		h.scheduler.advance(999);
		expect(h.reply(0, [1])).toBe('response');
		await expect(promise).resolves.toMatchObject({ status: 0, data: Uint8Array.of(1) });
		expect(progress).toEqual([64, 127]);
		expect(h.scheduler.pending).toBe(0);
	});

	it('times out a full timeout after the last in-progress reply', async () => {
		const h = setup();
		const promise = h.client.greet().catch((e: unknown) => e);
		h.scheduler.advance(500);
		h.reply(64);
		h.scheduler.advance(999);
		expect(h.client.pendingCount).toBe(1);
		h.scheduler.advance(1);
		expect(await promise).toBeInstanceOf(TeTimeoutError);
	});

	it('ignores a stale timer when the scheduler cannot cancel', async () => {
		const scheduler = new FakeScheduler(false);
		const h = setup({ scheduler });
		const promise = h.client.greet();
		scheduler.advance(900);
		h.reply(64);
		scheduler.advance(200); // the first timer fires at 1000 and must be ignored
		expect(h.client.pendingCount).toBe(1);
		h.reply(0);
		await expect(promise).resolves.toEqual({});
	});

	it('rejects error statuses with TeStatusError and the device’s reason', async () => {
		const h = setup();
		const cases: [number, string][] = [
			[1, 'error'],
			[2, 'command not found'],
			[3, 'bad request'],
			[4, 'reserved'],
			[16, 'command-specific error'],
			[63, 'command-specific error']
		];
		for (const [status, label] of cases) {
			const promise = h.client.request(fileInfoRequest(1)).catch((e: unknown) => e);
			h.reply(status, ascii(' no such node \0'));
			const error = await promise;
			expect(error).toBeInstanceOf(TeStatusError);
			expect(error).toMatchObject({ status, reason: 'no such node', cmd: TE_CMD.FILE });
			expect((error as Error).message).toBe(
				`FILE INFO failed with status ${status} (${label}): no such node`
			);
		}
	});
});

describe('safety', () => {
	it('never sends a forbidden frame', async () => {
		const h = setup();
		const forbidden = [
			h.client.request(
				{ cmd: TE_CMD.DFU, payload: [0x01, 0x01, 0x00, 0xc8] },
				{ allowWrites: true }
			),
			h.client.request({ cmd: TE_CMD.DFU }),
			h.client.request({ cmd: TE_CMD.PRODUCT_SPECIFIC }),
			h.client.request({ cmd: 0x04 }),
			h.client.request(
				{ cmd: TE_CMD.SETTINGS, payload: [0x03, 0x00, 0x01, 0x31, 0x00] },
				{ allowWrites: true }
			),
			h.client.request({ cmd: TE_CMD.FILE, payload: [0x09] })
		];
		for (const promise of forbidden) {
			const error = await promise.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(TePolicyError);
			expect(error).toMatchObject({ code: 'forbidden' });
		}
		expect(h.sent).toHaveLength(0);
	});

	it('sends writes only with allowWrites', async () => {
		const h = setup();
		await expect(h.client.request(fileDeleteRequest(5))).rejects.toMatchObject({
			name: 'TePolicyError',
			code: 'write-not-allowed'
		});
		expect(h.sent).toHaveLength(0);
		const promise = h.client.request(fileDeleteRequest(5), { allowWrites: true });
		expect(h.lastRequest()).toMatchObject({ cmd: TE_CMD.FILE, payload: hex('06 00 05') });
		h.reply(0);
		await expect(promise).resolves.toMatchObject({ status: 0 });
	});

	it('halts on a debug frame: rejects everything, refuses new requests until resumed', async () => {
		const debug: string[] = [];
		const h = setup({ onDebug: (text) => debug.push(text) });
		const settled = Promise.allSettled([h.client.greet(), h.client.echo([1]), h.client.fileInit()]);
		const frame = [...hex('F0 00 20 76 21 33'), ...ascii('err lfs 6327'), 0xf7];
		expect(h.client.handleIncoming(frame)).toBe('debug');
		for (const result of await settled) {
			expect(result.status).toBe('rejected');
			expect((result as PromiseRejectedResult).reason).toBeInstanceOf(TeHaltedError);
		}
		expect(h.client.state).toBe('halted');
		expect(h.client.haltReason).toBe('err lfs 6327');
		expect(h.client.pendingCount).toBe(0);
		expect(h.scheduler.pending).toBe(0);
		expect(debug).toEqual(['err lfs 6327']);
		await expect(h.client.greet()).rejects.toMatchObject({
			name: 'TeHaltedError',
			debugText: 'err lfs 6327'
		});
		expect(h.sent).toHaveLength(1); // only the first GREET ever left
		expect(h.reply(0, [], asRequest(h.sent[0]))).toBe('unmatched');

		// Another debug line (any device id) is reported but keeps the first reason.
		expect(h.client.handleIncoming([...hex('F0 00 20 76 05 33'), ...ascii('more'), 0xf7])).toBe(
			'debug'
		);
		expect(debug).toEqual(['err lfs 6327', 'more']);
		expect(h.client.haltReason).toBe('err lfs 6327');

		h.client.resume();
		expect(h.client.state).toBe('ready');
		expect(h.client.haltReason).toBeNull();
		const promise = h.client.greet();
		h.reply(0, ascii('mode:normal'));
		await expect(promise).resolves.toEqual({ mode: 'normal' });
	});

	it('halts on a truncated debug frame too', () => {
		const h = setup();
		void h.client.greet().catch(() => undefined);
		expect(h.client.handleIncoming(hex('F0 00 20 76 21 33 45 52 52'))).toBe('debug');
		expect(h.client.state).toBe('halted');
		expect(h.client.haltReason).toBe('ERR');
	});
});

describe('transport failures and closing', () => {
	it('rejects when send throws, then carries on with the next request', async () => {
		const scheduler = new FakeScheduler();
		const sent: Uint8Array[] = [];
		let failures = 2;
		const client = new TeClient({
			deviceId: 0x21,
			scheduler,
			random: randomFor(1),
			send: (bytes) => {
				if (failures === 2) {
					failures--;
					throw new Error('port closed');
				}
				if (failures === 1) {
					failures--;
					throw 'not an Error'; // a sloppy transport
				}
				sent.push(bytes);
			}
		});
		const a = client.greet().catch((e: unknown) => e);
		const b = client.greet().catch((e: unknown) => e);
		const c = client.greet();
		expect(await a).toMatchObject({ message: 'port closed' });
		expect(await b).toMatchObject({ message: 'not an Error' });
		expect(sent).toHaveLength(1);
		expect(scheduler.pending).toBe(1);
		client.handleIncoming(
			buildResponseFrame({ deviceId: 0x21, requestId: 3, cmd: TE_CMD.GREET, status: 0 })
		);
		await expect(c).resolves.toEqual({});
	});

	it('rejects when send returns a rejected promise', async () => {
		const scheduler = new FakeScheduler();
		const client = new TeClient({
			deviceId: 0x21,
			scheduler,
			send: () => Promise.reject(new Error('async failure'))
		});
		await expect(client.greet()).rejects.toThrow('async failure');
		expect(scheduler.pending).toBe(0);
		expect(client.pendingCount).toBe(0);
	});

	it('close() rejects everything pending and every later request', async () => {
		const debug: string[] = [];
		const h = setup({ onDebug: (text) => debug.push(text) });
		const settled = Promise.allSettled([h.client.greet(), h.client.greet()]);
		h.client.close();
		for (const result of await settled) {
			expect((result as PromiseRejectedResult).reason).toBeInstanceOf(TeClosedError);
		}
		expect(h.client.state).toBe('closed');
		expect(h.scheduler.pending).toBe(0);
		await expect(h.client.greet()).rejects.toBeInstanceOf(TeClosedError);
		h.client.close();
		h.client.resume();
		expect(h.client.handleIncoming([...hex('F0 00 20 76 21 33'), ...ascii('bye'), 0xf7])).toBe(
			'debug'
		);
		expect(h.client.state).toBe('closed');
		expect(debug).toEqual(['bye']);
	});

	it('validates constructor options', () => {
		expect(() => setup({ deviceId: 0x80 })).toThrow(TeCodecError);
		for (const timeoutMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => setup({ timeoutMs })).toThrow(TeCodecError);
		}
	});
});

describe('helpers', () => {
	it('echo() rejects when the device returns different bytes', async () => {
		const { client } = responder(() => ({ status: 0, data: [9, 9] }));
		await expect(client.echo([1, 2])).rejects.toBeInstanceOf(TeProtocolError);
	});

	it('fileInit() sends the subscribe flag when asked, and rejects short replies', async () => {
		const { client, requests } = responder(() => ({ status: 0, data: [0x0c, 0x00] }));
		await expect(client.fileInit({ flags: 1 })).rejects.toBeInstanceOf(TeProtocolError);
		expect(requests[0].payload).toEqual(hex('01 01 00 40 00 00'));
	});

	it('fileList() follows pages until an empty one', async () => {
		const pages = [
			[0, 0, ...fileEntry(3, 'a.wav'), ...fileEntry(4, 'b.wav')],
			[0, 1, ...fileEntry(5, 'c.wav')],
			[0, 2]
		];
		const { client, requests } = responder((request) => ({
			status: 0,
			data: pages[request.payload[2]]
		}));
		const entries = await client.fileList(0x0102);
		expect(entries.map((e) => [e.id, e.name, e.size])).toEqual([
			[3, 'a.wav', 4096],
			[4, 'b.wav', 4096],
			[5, 'c.wav', 4096]
		]);
		expect(requests.map((r) => Array.from(r.payload))).toEqual([
			[0x04, 0x00, 0x00, 0x01, 0x02],
			[0x04, 0x00, 0x01, 0x01, 0x02],
			[0x04, 0x00, 0x02, 0x01, 0x02]
		]);
	});

	it('fileList() ends on a reply without a page number', async () => {
		const { client } = responder(() => ({ status: 0, data: [] }));
		await expect(client.fileList(0)).resolves.toEqual([]);
	});

	it('fileList() rejects a wrong page number', async () => {
		const { client } = responder(() => ({ status: 0, data: [0, 5, ...fileEntry(1, 'x')] }));
		await expect(client.fileList(0)).rejects.toThrow('asked for page 0, got page 5');
	});

	it('fileList() gives up after maxPages non-empty pages', async () => {
		const { client, requests } = responder((request) => ({
			status: 0,
			data: [0, request.payload[2], ...fileEntry(1, 'x')]
		}));
		await expect(client.fileList(0, { maxPages: 2 })).rejects.toThrow(
			'no empty page within 2 pages'
		);
		expect(requests).toHaveLength(2);
		await expect(client.fileList(0, { maxPages: 0 })).rejects.toBeInstanceOf(TeCodecError);
	});

	it('fileList() passes status errors through', async () => {
		const { client } = responder(() => ({ status: 3 }));
		await expect(client.fileList(0)).rejects.toBeInstanceOf(TeStatusError);
	});

	it('fileList() applies the timeout to every page', async () => {
		const { client, scheduler } = responder(() => null);
		const promise = client.fileList(0, { timeoutMs: 10 }).catch((e: unknown) => e);
		scheduler.advance(10);
		expect(await promise).toMatchObject({ name: 'TeTimeoutError', timeoutMs: 10 });
	});
});
