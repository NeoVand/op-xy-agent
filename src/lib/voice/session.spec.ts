// The voice session end to end in Node, against the fake realtime API, a fake conductor and manual
// time: a push-to-talk turn from key press to spoken answer, barge-in with the key, hands-free with
// mute, a spoken approval, a late result announced, a missing key, a dropped call and teardown.
import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '$lib/agent/conductor.svelte';
import { FakeRealtimeServer } from '../../../test/fakes/fake-realtime';
import { FakeTime } from '../../../test/fakes/fake-time';
import { VoiceSession, VOICE_MODE_PREFERENCE, VOICE_MODEL_PREFERENCE } from './session.svelte';
import { FakeConductor, type FakeReply } from './testing/fake-conductor.svelte';

// Assembled at runtime so secret scanners never see a key-shaped literal.
const KEY = 'sk-' + 'proj-' + 'test-'.padEnd(40, '0');

function memory(values: Record<string, string> = {}): PreferenceStore {
	return {
		get: (key) => values[key] ?? null,
		set: (key, value) => {
			if (value === null) delete values[key];
			else values[key] = value;
		}
	};
}

function setup(
	options: {
		reply?: (text: string) => FakeReply;
		key?: string | null;
		preferences?: PreferenceStore;
		server?: FakeRealtimeServer;
	} = {}
) {
	const server = options.server ?? new FakeRealtimeServer();
	const time = new FakeTime();
	const conductor = new FakeConductor(options.reply);
	const voice = new VoiceSession({
		apiKey: () => (options.key === undefined ? KEY : options.key),
		conductor: () => conductor,
		environment: () => server.environment(),
		supported: () => true,
		preferences: options.preferences ?? memory(),
		timers: time,
		clock: time,
		patienceMs: 5000,
		transcriptWaitMs: 200
	});
	voice.load();
	return { server, time, conductor, voice };
}

/** Holds the mic key for `ms`, then lets go and waits out the tail. */
async function talk(voice: VoiceSession, time: FakeTime, ms = 800) {
	voice.press();
	await time.advance(ms);
	voice.release();
	await time.advance(250);
}

const voiceLines = (conductor: FakeConductor) =>
	conductor.entries.flatMap((e) =>
		e.kind === 'voice' ? [[e.role, e.text, e.live, e.interrupted]] : []
	);

describe('VoiceSession: push-to-talk', () => {
	it('runs a turn from key press to spoken answer, with Claude in between', async () => {
		const { server, time, conductor, voice } = setup({
			reply: () => ({ answer: 'The tempo is **120** BPM.' })
		});
		voice.press();
		expect(voice.phase).toBe('connecting');
		expect(voice.keyDown).toBe(true);
		await expect.poll(() => voice.phase).toBe('user-speaking');
		// Held while connecting: the turn starts clean and the mic opens.
		expect(server.sentTypes()).toEqual(['input_audio_buffer.clear']);
		expect(server.mic?.enabled).toBe(true);
		expect(voice.microphone).toBe('MacBook Pro Microphone');

		await time.advance(800);
		voice.release();
		expect(voice.keyDown).toBe(false);
		// The tail: the mic stays open a moment for the last syllable.
		expect(server.mic?.enabled).toBe(true);
		await time.advance(250);
		expect(server.sentTypes().at(-1)).toBe('input_audio_buffer.commit');
		expect(server.mic?.enabled).toBe(false);
		expect(voice.phase).toBe('thinking');

		server.heard('what tempo is it');
		expect(server.sentTypes().at(-1)).toBe('response.create');
		expect(voiceLines(conductor)).toEqual([['user', 'what tempo is it', false, false]]);

		const call = server.callsTool('ask_claude', { request: 'What tempo is it?' });
		await expect.poll(() => server.toolOutputs()[call]).toBeTruthy();
		expect(server.toolOutputs()[call]).toEqual({
			status: 'done',
			answer: 'The tempo is 120 BPM.',
			changes: []
		});
		expect(conductor.sent).toEqual([{ text: 'What tempo is it?', options: { via: 'voice' } }]);
		expect(server.sentTypes().slice(-2)).toEqual(['conversation.item.create', 'response.create']);

		server.says('It is at 120.');
		expect(voice.phase).toBe('listening');
		expect(voiceLines(conductor).at(-1)).toEqual(['assistant', 'It is at 120.', false, false]);

		voice.disconnect();
		expect(voice.phase).toBe('idle');
		expect(server.mic?.stopped).toBe(true);
		expect(server.peer?.closed).toBe(true);
	});

	it('stops the voice at once when the key goes down while it talks', async () => {
		const { server, time, conductor, voice } = setup();
		await talk(voice, time);
		await expect.poll(() => server.sentTypes().includes('input_audio_buffer.commit')).toBe(true);
		server.emit({ type: 'response.created', response: { id: 'r1' } });
		server.emit({ type: 'output_audio_buffer.started', response_id: 'r1' });
		server.emit({
			type: 'response.output_audio_transcript.delta',
			item_id: 'm1',
			delta: 'Well, the'
		});
		expect(voice.phase).toBe('speaking');
		const before = server.sent.length;
		voice.press();
		expect(server.sent.slice(before).map((e) => e.type)).toEqual([
			'response.cancel',
			'output_audio_buffer.clear',
			'input_audio_buffer.clear'
		]);
		expect(server.mic?.enabled).toBe(true);
		expect(voiceLines(conductor).at(-1)).toEqual(['assistant', 'Well, the', false, true]);
	});

	it('drops a tap too short to be speech and says to hold the key', async () => {
		const { server, time, voice } = setup();
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		await time.advance(50);
		voice.release();
		await time.advance(250);
		expect(server.sentTypes()).toEqual(['input_audio_buffer.clear', 'input_audio_buffer.clear']);
		expect(voice.hint).toBe('hold the key while you talk');
		voice.dismiss();
		expect(voice.hint).toBeNull();
	});
});

describe('VoiceSession: hands-free', () => {
	it('keeps the mic open, lets the server take turns and mutes on request', async () => {
		const preferences = memory();
		const { server, voice } = setup({ preferences });
		voice.setMode('hands-free');
		expect(preferences.get(VOICE_MODE_PREFERENCE)).toBe('hands-free');
		voice.press();
		await expect.poll(() => voice.phase).toBe('listening');
		const minted = JSON.parse(server.calls[0].body);
		expect(minted.session.audio.input.turn_detection).toMatchObject({ type: 'semantic_vad' });
		expect(server.mic?.enabled).toBe(true);

		server.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
		expect(voice.phase).toBe('user-speaking');
		server.emit({ type: 'input_audio_buffer.speech_stopped', item_id: 'u1' });
		expect(voice.phase).toBe('thinking');
		server.emit({ type: 'response.created', response: { id: 'r1' } });
		server.emit({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
		expect(voice.phase).toBe('listening');

		voice.toggleMute();
		expect(voice.muted).toBe(true);
		expect(server.mic?.enabled).toBe(false);
		voice.toggleMute();
		expect(server.mic?.enabled).toBe(true);

		voice.setMode('push-to-talk');
		expect(server.sent.at(-2)).toMatchObject({
			type: 'session.update',
			session: { audio: { input: { turn_detection: null } } }
		});
		expect(server.mic?.enabled).toBe(false);
	});
});

describe('VoiceSession: Claude and approvals', () => {
	it('approves a change on a spoken yes, and only after the user said it', async () => {
		const { server, conductor, voice } = setup({
			reply: () => ({ changes: ['tempo 120 → 96 bpm'], answer: 'Tempo is now 96.' })
		});
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		voice.release();
		server.heard('set the tempo to 96');
		const ask = server.callsTool('ask_claude', { request: 'Set the tempo to 96 BPM.' });
		await expect.poll(() => server.toolOutputs()[ask]).toBeTruthy();
		expect(server.toolOutputs()[ask]).toMatchObject({
			status: 'needs_approval',
			changes: ['tempo 120 → 96 bpm']
		});

		// The model says yes on its own: refused, nothing decided.
		const early = server.callsTool('answer_approval', { approve: true });
		await expect.poll(() => server.toolOutputs()[early]).toBeTruthy();
		expect(server.toolOutputs()[early]).toMatchObject({ status: 'not_confirmed', heard: null });
		expect(conductor.decisions).toEqual([]);

		server.heard('yes please');
		const yes = server.callsTool('answer_approval', { approve: true });
		await expect.poll(() => server.toolOutputs()[yes]).toBeTruthy();
		expect(server.toolOutputs()[yes]).toMatchObject({
			status: 'done',
			answer: 'Tempo is now 96.',
			changes: ['tempo 120 → 96 bpm']
		});
		expect(conductor.decisions).toEqual([
			{ decision: { kind: 'approve' }, options: { via: 'voice' } }
		]);
	});

	it('waits for the words of a spoken answer before deciding', async () => {
		const { server, time, conductor, voice } = setup({
			reply: () => ({ changes: ['track 2 mute'], answer: 'Muted.' })
		});
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		voice.release();
		const ask = server.callsTool('ask_claude', { request: 'Mute track 2.' });
		await expect.poll(() => server.toolOutputs()[ask]).toBeTruthy();
		// The turn is committed, its transcript not in yet when the model answers.
		server.emit({ type: 'input_audio_buffer.committed', item_id: 'late' });
		const yes = server.callsTool('answer_approval', { approve: true });
		await time.advance(50);
		expect(conductor.decisions).toEqual([]);
		server.emit({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'late',
			transcript: 'sure'
		});
		await expect.poll(() => server.toolOutputs()[yes]).toBeTruthy();
		expect(server.toolOutputs()[yes]).toMatchObject({ status: 'done', answer: 'Muted.' });
	});

	it('says "working" for a long request and announces its end when the floor is free', async () => {
		const { server, time, conductor, voice } = setup({
			reply: () => ({ answer: 'Your song is ready.', hold: true })
		});
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		voice.release();
		const ask = server.callsTool('ask_claude', { request: 'Write a song.' });
		await expect.poll(() => conductor.busy).toBe(true);
		await time.advance(5000);
		await expect.poll(() => server.toolOutputs()[ask]).toMatchObject({ status: 'working' });
		server.says('Claude is still on it.');
		const before = server.sent.length;
		conductor.finish();
		await expect.poll(() => server.sent.length).toBeGreaterThan(before);
		const [note, respond] = server.sent.slice(before);
		expect(note).toMatchObject({
			type: 'conversation.item.create',
			item: { type: 'message', role: 'system' }
		});
		expect(JSON.stringify(note)).toContain('Update from Claude');
		expect(JSON.stringify(note)).toContain('Your song is ready.');
		expect(respond).toEqual({ type: 'response.create' });
	});
});

describe('VoiceSession: problems and teardown', () => {
	it('says voice needs an OpenAI key, and asks OpenAI for nothing', async () => {
		const { server, voice } = setup({ key: null });
		voice.press();
		expect(voice.phase).toBe('error');
		expect(voice.problem?.code).toBe('no-key');
		expect(voice.visible).toBe(true);
		expect(server.calls).toEqual([]);
		voice.dismiss();
		expect(voice.phase).toBe('idle');
		expect(voice.problem).toBeNull();
	});

	it('reports a refused microphone', async () => {
		const { voice } = setup({ server: new FakeRealtimeServer({ micError: 'NotAllowedError' }) });
		voice.press();
		await expect.poll(() => voice.phase).toBe('error');
		expect(voice.problem?.code).toBe('mic-blocked');
		expect(voice.keyDown).toBe(true);
		voice.release();
	});

	it('ends cleanly when the call drops, keeping what was said', async () => {
		const { server, conductor, voice } = setup();
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		server.emit({
			type: 'conversation.item.input_audio_transcription.delta',
			item_id: 'u1',
			delta: 'play the'
		});
		server.peer?.fail();
		expect(voice.phase).toBe('idle');
		expect(voice.problem?.code).toBe('connection');
		expect(voice.keyDown).toBe(false);
		expect(voiceLines(conductor)).toEqual([['user', 'play the', false, false]]);
	});

	it('adds up what the call costs from the responses', async () => {
		const { server, voice } = setup();
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		expect(voice.usd).toBe(0);
		server.emit({
			type: 'response.done',
			response: {
				id: 'r1',
				status: 'completed',
				usage: {
					input_token_details: {
						text_tokens: 1000,
						audio_tokens: 500,
						cached_tokens: 800,
						cached_tokens_details: { text_tokens: 800, audio_tokens: 0 }
					},
					output_token_details: { text_tokens: 50, audio_tokens: 400 }
				}
			}
		});
		// gpt-realtime-2.1: text 4 / cached 0.40 / out 24, audio 32 / out 64 per million tokens.
		const expected = (200 * 4 + 800 * 0.4 + 500 * 32 + 50 * 24 + 400 * 64) / 1_000_000;
		expect(voice.usd).toBeCloseTo(expected, 10);
	});

	it('remembers the model, and lets everything go on dispose', async () => {
		const preferences = memory();
		const { server, voice } = setup({ preferences });
		voice.setModel('gpt-realtime-2.1-mini');
		voice.setModel('not-a-model');
		expect(preferences.get(VOICE_MODEL_PREFERENCE)).toBe('gpt-realtime-2.1-mini');
		voice.press();
		await expect.poll(() => voice.phase).toBe('user-speaking');
		expect(JSON.parse(server.calls[0].body).session.model).toBe('gpt-realtime-2.1-mini');
		voice.dispose();
		expect(server.mic?.stopped).toBe(true);
		expect(server.peer?.closed).toBe(true);
		expect(server.speakers[0].stopped).toBe(true);
		voice.press();
		expect(server.peers).toHaveLength(1);
	});
});
