// Opening a voice call against the fake realtime API: the microphone before anything is minted,
// the user's key sent once and only to the client-secret endpoint, the short-lived secret only to
// the SDP exchange, the OP-XY's own input skipped, and everything let go on failure or hang-up.
import { describe, expect, it } from 'vitest';
import { CONNECTION_LOST, VoiceError, sessionConfig, type ServerEvent } from '$lib/core/voice';
import { FAKE_CLIENT_SECRET, FakeRealtimeServer } from '../../../test/fakes/fake-realtime';
import { FakeTime } from '../../../test/fakes/fake-time';
import { connectRealtime } from './rtc';

// Assembled at runtime so secret scanners never see a key-shaped literal.
const KEY = 'sk-' + 'proj-' + 'test-'.padEnd(40, '0');

function setup(server = new FakeRealtimeServer(), extra: { signal?: AbortSignal } = {}) {
	const time = new FakeTime();
	const events: ServerEvent[] = [];
	const closes: unknown[] = [];
	const connecting = connectRealtime({
		apiKey: KEY,
		session: sessionConfig({ model: 'gpt-realtime-2.1', mode: 'push-to-talk', reasoning: 'low' }),
		environment: server.environment(),
		timers: time,
		onEvent: (event) => events.push(event),
		onClose: (problem) => closes.push(problem),
		signal: extra.signal
	});
	return { server, time, events, closes, connecting };
}

async function failure(promise: Promise<unknown>): Promise<VoiceError> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof VoiceError) return error;
		throw error;
	}
	throw new Error('expected the call to fail');
}

describe('connectRealtime', () => {
	it('opens the mic, mints a secret with the key, then makes the WebRTC call with the secret', async () => {
		const { server, connecting } = setup();
		const link = await connecting;

		expect(server.constraints[0]).toEqual({
			audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
		});
		expect(server.calls.map((c) => [c.method, c.url])).toEqual([
			['POST', 'https://api.openai.com/v1/realtime/client_secrets'],
			['POST', 'https://api.openai.com/v1/realtime/calls']
		]);
		const [mint, call] = server.calls;
		expect(mint.headers.authorization).toBe(`Bearer ${KEY}`);
		expect(mint.headers['content-type']).toBe('application/json');
		const body = JSON.parse(mint.body);
		expect(body.expires_after).toEqual({ anchor: 'created_at', seconds: 120 });
		expect(body.session).toMatchObject({
			type: 'realtime',
			model: 'gpt-realtime-2.1',
			audio: { input: { turn_detection: null }, output: { voice: 'marin' } },
			reasoning: { effort: 'low' }
		});
		// The user's key goes to the mint only; the short-lived secret to the SDP exchange only.
		expect(call.headers.authorization).toBe(`Bearer ${FAKE_CLIENT_SECRET}`);
		expect(call.headers['content-type']).toBe('application/sdp');
		expect(call.body).toBe(server.peer?.local?.sdp);
		expect(server.calls.filter((c) => JSON.stringify(c).includes(KEY))).toEqual([mint]);
		expect(server.calls.every((c) => !c.url.includes(KEY) && !c.url.includes('ek_'))).toBe(true);

		expect(server.peer?.remote?.type).toBe('answer');
		expect(server.channel?.label).toBe('oai-events');
		expect(server.peer?.tracks.map((t) => t.track)).toEqual([server.mic]);
		expect(server.mic?.enabled).toBe(false);
		expect(link.microphone).toBe('MacBook Pro Microphone');
		expect(server.speakers[0].streams).toHaveLength(1);
	});

	it('carries events both ways, opens and closes the mic, and lets everything go on hang-up', async () => {
		const { server, events, closes, connecting } = setup();
		const link = await connecting;
		server.emit({ type: 'response.created', response: { id: 'r1' } });
		server.emit({ type: 'response.output_audio.delta', delta: 'AAAA' });
		server.channel?.dispatchEvent(new MessageEvent('message', { data: 'not json' }));
		expect(events).toEqual([{ type: 'response.created', response: { id: 'r1' } }]);

		link.send({ type: 'input_audio_buffer.clear' });
		expect(server.sent).toEqual([{ type: 'input_audio_buffer.clear' }]);
		link.setMic(true);
		expect(server.mic?.enabled).toBe(true);

		link.close();
		expect(server.mic?.stopped).toBe(true);
		expect(server.peer?.closed).toBe(true);
		expect(server.speakers[0].stopped).toBe(true);
		expect(closes).toEqual([]);
		link.send({ type: 'input_audio_buffer.commit' });
		server.emit({ type: 'response.created', response: { id: 'r2' } });
		expect(server.sent).toHaveLength(1);
		expect(events).toHaveLength(1);
	});

	it('skips the OP-XY when it is the default input', async () => {
		const server = new FakeRealtimeServer({
			devices: [
				{ deviceId: 'default', kind: 'audioinput', label: 'Default - OP-XY (2367:8021)' },
				{ deviceId: 'opxy', kind: 'audioinput', label: 'OP-XY (2367:8021)' },
				{ deviceId: 'mbp', kind: 'audioinput', label: 'MacBook Pro Microphone' }
			]
		});
		const { connecting } = setup(server);
		const link = await connecting;
		expect(server.mics.map((m) => [m.label, m.stopped])).toEqual([
			['OP-XY (2367:8021)', true],
			['MacBook Pro Microphone', false]
		]);
		expect(server.constraints[1]).toMatchObject({ audio: { deviceId: { exact: 'mbp' } } });
		expect(link.microphone).toBe('MacBook Pro Microphone');
	});

	it('asks for nothing when the microphone is refused', async () => {
		const { server, connecting } = setup(new FakeRealtimeServer({ micError: 'NotAllowedError' }));
		const error = await failure(connecting);
		expect(error.problem.code).toBe('mic-blocked');
		expect(server.calls).toEqual([]);
	});

	it('lets go of the mic when the key is rejected', async () => {
		const server = new FakeRealtimeServer({
			mint: () =>
				new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
					status: 401
				})
		});
		const { connecting } = setup(server);
		const error = await failure(connecting);
		expect(error.problem).toMatchObject({ code: 'auth', fatal: true });
		expect(error.message).not.toContain(KEY);
		expect(server.mic?.stopped).toBe(true);
		expect(server.peers).toEqual([]);
	});

	it('mints again without reasoning when the model takes none', async () => {
		let first = true;
		const server = new FakeRealtimeServer({
			mint: () => {
				if (first) {
					first = false;
					return new Response(
						JSON.stringify({ error: { param: 'session.reasoning', message: 'Unknown parameter' } }),
						{ status: 400 }
					);
				}
				return new Response(JSON.stringify({ value: 'ek_second', expires_at: 1 }), { status: 200 });
			}
		});
		const { connecting } = setup(server);
		await connecting;
		const mints = server.calls.filter((c) => c.url.endsWith('/client_secrets'));
		expect(mints).toHaveLength(2);
		expect(JSON.parse(mints[0].body).session.reasoning).toEqual({ effort: 'low' });
		expect(JSON.parse(mints[1].body).session.reasoning).toBeUndefined();
		expect(server.calls.at(-1)?.headers.authorization).toBe('Bearer ek_second');
	});

	it('reports a call that drops, once, and lets everything go', async () => {
		const { server, closes, connecting } = setup();
		await connecting;
		server.peer?.fail();
		server.channel?.close();
		expect(closes).toEqual([CONNECTION_LOST]);
		expect(server.mic?.stopped).toBe(true);
		expect(server.peer?.closed).toBe(true);
	});

	it('reports an unplugged microphone', async () => {
		const { server, closes, connecting } = setup();
		await connecting;
		server.mic?.end();
		expect(closes).toEqual([{ code: 'no-mic', message: 'the microphone went away', fatal: true }]);
	});

	it('gives up when the events channel never opens', async () => {
		const { server, time, connecting } = setup(new FakeRealtimeServer({ autoOpen: false }));
		const failed = failure(connecting);
		await time.advance(15_000);
		expect((await failed).problem).toEqual(CONNECTION_LOST);
		expect(server.peer?.closed).toBe(true);
		expect(server.mic?.stopped).toBe(true);
	});

	it('stops when aborted while connecting', async () => {
		const controller = new AbortController();
		const { server, connecting } = setup(new FakeRealtimeServer({ autoOpen: false }), {
			signal: controller.signal
		});
		const failed = failure(connecting);
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		expect((await failed).problem.code).toBe('connection');
		expect(server.mic?.stopped).toBe(true);
	});
});
