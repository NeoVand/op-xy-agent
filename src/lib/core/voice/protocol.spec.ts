// The voice front end's protocol pieces: the session it asks for, the client secret, parsing
// server events and tool calls, the problems it can explain, telling a spoken yes from a no, and
// picking a microphone that is not the OP-XY.
import { describe, expect, it } from 'vitest';
import { spokenAnswer } from './approval';
import {
	CALLS_URL,
	CLIENT_SECRETS_URL,
	TRANSCRIPTION_KEYWORDS,
	VOICE_INSTRUCTIONS,
	blamesReasoning,
	clientSecretRequest,
	modeUpdate,
	parseClientSecret,
	sessionConfig,
	withoutReasoning
} from './config';
import { VoiceError, micProblem, openAiProblem, serverProblem } from './errors';
import { parseServerEvent } from './events';
import { isOpxyInput, pickMicrophone } from './mic';
import { VOICE_TOOLS, parseToolCall, toolOutput, updateNote } from './tools';

describe('voice session config', () => {
	it('asks for push-to-talk with no turn detection, transcripts, the three tools and a voice', () => {
		const config = sessionConfig({
			model: 'gpt-realtime-2.1',
			mode: 'push-to-talk',
			reasoning: 'low'
		});
		expect(config).toMatchObject({
			type: 'realtime',
			model: 'gpt-realtime-2.1',
			instructions: VOICE_INSTRUCTIONS,
			output_modalities: ['audio'],
			audio: {
				input: {
					noise_reduction: { type: 'near_field' },
					transcription: { model: 'gpt-live-transcribe', keywords: TRANSCRIPTION_KEYWORDS },
					turn_detection: null
				},
				output: { voice: 'marin' }
			},
			tool_choice: 'auto',
			max_output_tokens: 2048,
			reasoning: { effort: 'low' }
		});
		expect(config.tools.map((t) => t.name)).toEqual([
			'ask_claude',
			'answer_approval',
			'stop_claude'
		]);
		expect(VOICE_INSTRUCTIONS.length).toBeLessThan(1600);
		expect(TRANSCRIPTION_KEYWORDS).toContain('OP-XY');
	});

	it('lets the server take turns hands-free, and leaves out what is switched off', () => {
		const config = sessionConfig({
			model: 'gpt-realtime-2.1-mini',
			mode: 'hands-free',
			reasoning: null,
			transcription: null,
			voice: 'cedar'
		});
		expect(config.audio.input.turn_detection).toEqual({
			type: 'semantic_vad',
			eagerness: 'auto',
			create_response: true,
			interrupt_response: true
		});
		expect(config.audio.input.transcription).toBeNull();
		expect(config.audio.output.voice).toBe('cedar');
		expect('reasoning' in config).toBe(false);
		expect(
			'reasoning' in
				withoutReasoning(sessionConfig({ model: 'm', mode: 'hands-free', reasoning: 'low' }))
		).toBe(false);
	});

	it('switches turn taking with a session.update that names the session type', () => {
		expect(modeUpdate('push-to-talk')).toEqual({
			type: 'session.update',
			session: { type: 'realtime', audio: { input: { turn_detection: null } } }
		});
	});

	it('mints a short-lived secret for api.openai.com only', () => {
		expect(new URL(CLIENT_SECRETS_URL).origin).toBe('https://api.openai.com');
		expect(new URL(CALLS_URL).pathname).toBe('/v1/realtime/calls');
		const session = sessionConfig({ model: 'gpt-realtime-2.1', mode: 'push-to-talk' });
		expect(clientSecretRequest(session)).toEqual({
			expires_after: { anchor: 'created_at', seconds: 120 },
			session
		});
		expect(clientSecretRequest(session, 1).expires_after.seconds).toBe(10);
		expect(clientSecretRequest(session, 99_999).expires_after.seconds).toBe(7200);
		expect(parseClientSecret({ value: 'ek_abc', expires_at: 1_790_000_000 })).toEqual({
			value: 'ek_abc',
			expiresAt: 1_790_000_000
		});
		expect(() => parseClientSecret({ value: 'sk-oops' })).toThrow(VoiceError);
		expect(() => parseClientSecret(null)).toThrow(VoiceError);
	});

	it('knows when a refusal blames the reasoning setting', () => {
		expect(
			blamesReasoning({ error: { param: 'session.reasoning', message: 'Unknown parameter' } })
		).toBe(true);
		expect(blamesReasoning({ error: { message: 'reasoning.effort is not supported' } })).toBe(true);
		expect(blamesReasoning({ error: { message: 'Invalid voice' } })).toBe(false);
		expect(blamesReasoning(null)).toBe(false);
	});
});

describe('voice events and tools', () => {
	it('parses the server events the session uses and drops the rest', () => {
		expect(parseServerEvent('{"type":"response.created","response":{"id":"r1"}}')).toEqual({
			type: 'response.created',
			response: { id: 'r1' }
		});
		expect(parseServerEvent({ type: 'output_audio_buffer.started', response_id: 'r1' })).toEqual({
			type: 'output_audio_buffer.started',
			response_id: 'r1'
		});
		expect(parseServerEvent('{"type":"response.output_audio.delta","delta":"AAAA"}')).toBeNull();
		expect(parseServerEvent('{"type":"rate_limits.updated"}')).toBeNull();
		expect(parseServerEvent('not json')).toBeNull();
		expect(parseServerEvent('{"no":"type"}')).toBeNull();
		expect(parseServerEvent(42)).toBeNull();
	});

	it('declares strict function tools', () => {
		for (const tool of VOICE_TOOLS) {
			expect(tool.type).toBe('function');
			expect(tool.parameters.additionalProperties).toBe(false);
			expect(tool.description.length).toBeGreaterThan(20);
		}
	});

	it('checks tool calls and their arguments', () => {
		expect(parseToolCall('ask_claude', '{"request":"  set the tempo to 96  "}')).toEqual({
			tool: 'ask_claude',
			request: 'set the tempo to 96'
		});
		expect(parseToolCall('ask_claude', '{"request":""}')).toMatchObject({ tool: 'invalid' });
		expect(parseToolCall('ask_claude', '{"request":')).toMatchObject({ tool: 'invalid' });
		expect(parseToolCall('answer_approval', '{"approve":true}')).toEqual({
			tool: 'answer_approval',
			approve: true,
			note: null
		});
		expect(parseToolCall('answer_approval', '{"approve":false,"note":" keep 120 "}')).toEqual({
			tool: 'answer_approval',
			approve: false,
			note: 'keep 120'
		});
		expect(parseToolCall('answer_approval', '{"approve":"yes"}')).toMatchObject({
			tool: 'invalid'
		});
		expect(parseToolCall('stop_claude', '')).toEqual({ tool: 'stop_claude' });
		expect(parseToolCall('format_disk', '{}')).toMatchObject({
			tool: 'invalid',
			name: 'format_disk'
		});
		const long = parseToolCall('ask_claude', JSON.stringify({ request: 'x'.repeat(9000) }));
		expect(long.tool === 'ask_claude' && long.request.length).toBe(4000);
	});

	it('returns results as JSON, and late ones as an update note', () => {
		const result = { status: 'done', answer: 'Tempo is 96.', changes: [] } as const;
		expect(JSON.parse(toolOutput(result))).toEqual(result);
		expect(updateNote(result)).toBe(`Update from Claude: ${toolOutput(result)}`);
	});
});

describe('voice problems', () => {
	it('explains failed calls to api.openai.com by status and code', () => {
		expect(openAiProblem(401, null)).toMatchObject({ code: 'auth', fatal: true });
		expect(openAiProblem(403, null).code).toBe('permission');
		expect(openAiProblem(429, { error: { code: 'insufficient_quota' } }).code).toBe('quota');
		expect(openAiProblem(429, { error: { type: 'requests' } }).code).toBe('rate-limit');
		expect(openAiProblem(400, { error: { message: 'Invalid model' } }).message).toBe(
			'openai did not accept the voice session: invalid model'
		);
		expect(openAiProblem(503, null).code).toBe('unavailable');
		expect(openAiProblem(418, null).code).toBe('server');
	});

	it('explains microphone failures by the error name', () => {
		expect(micProblem('NotAllowedError').code).toBe('mic-blocked');
		expect(micProblem('NotFoundError').code).toBe('no-mic');
		expect(micProblem('NotReadableError').code).toBe('mic-busy');
		expect(micProblem('TypeError').code).toBe('unsupported');
	});

	it('keeps quiet about benign server errors', () => {
		expect(serverProblem({ code: 'input_audio_buffer_commit_empty' })).toBeNull();
		expect(serverProblem({ code: 'conversation_already_has_active_response' })).toBeNull();
		expect(serverProblem({ code: 'invalid_value', message: 'Bad thing' })).toEqual({
			code: 'server',
			message: 'openai: bad thing',
			fatal: false
		});
	});
});

describe('spoken answers', () => {
	it.each([
		['yes', 'yes'],
		['Yeah, go ahead.', 'yes'],
		['sure', 'yes'],
		['OK do it', 'yes'],
		['Ja, bitte.', 'yes'],
		['oui', 'yes'],
		['はい', 'yes'],
		['no', 'no'],
		['No thanks.', 'no'],
		["don't", 'no'],
		['yes, wait', 'no'],
		['not yet', 'no'],
		['nein', 'no'],
		['what did you say?', null],
		['the tempo', null],
		['', null],
		['I know', null]
	] as const)('%j is %s', (said, expected) => {
		expect(spokenAnswer(said)).toBe(expected);
	});
});

describe('picking a microphone', () => {
	const devices = [
		{ deviceId: 'default', kind: 'audioinput', label: 'Default - OP-XY (2367:8021)' },
		{ deviceId: 'opxy', kind: 'audioinput', label: 'OP-XY (2367:8021)' },
		{ deviceId: 'mbp', kind: 'audioinput', label: 'MacBook Pro Microphone' },
		{ deviceId: 'out', kind: 'audiooutput', label: 'MacBook Pro Speakers' }
	];

	it('never picks the OP-XY, even as the default', () => {
		expect(isOpxyInput('OP-XY (2367:8021)')).toBe(true);
		expect(isOpxyInput('teenage engineering op xy')).toBe(true);
		expect(isOpxyInput('MacBook Pro Microphone')).toBe(false);
		expect(pickMicrophone(devices)).toBe('mbp');
		expect(pickMicrophone(devices, { preferred: 'opxy' })).toBe('mbp');
	});

	it('keeps a preferred input, else the default, else none', () => {
		const more = [...devices, { deviceId: 'usb', kind: 'audioinput', label: 'USB Mic' }];
		expect(pickMicrophone(more, { preferred: 'usb' })).toBe('usb');
		expect(
			pickMicrophone([
				{ deviceId: 'default', kind: 'audioinput', label: 'Default - USB Mic' },
				{ deviceId: 'usb', kind: 'audioinput', label: 'USB Mic' }
			])
		).toBe('default');
		expect(pickMicrophone(devices.slice(0, 2))).toBeNull();
	});
});
