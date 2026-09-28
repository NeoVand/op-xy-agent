// The voice state machine, event by event: push-to-talk turns, hands-free turns, barge-in both
// ways, tool calls and their outputs (never answered twice, never talked over), announcements,
// transcripts becoming lines, and the end of a call.
import { describe, expect, it } from 'vitest';
import type { VoiceMode } from './config';
import type { ClientEvent, ServerEvent } from './events';
import {
	MIN_TURN_MS,
	TOO_SHORT_HINT,
	initialVoiceState,
	phaseOf,
	stepVoice,
	type FunctionCall,
	type VoiceInput,
	type VoiceLine,
	type VoiceState
} from './machine';

function drive(state: VoiceState = initialVoiceState()) {
	let current = state;
	const sent: ClientEvent[] = [];
	const lines: VoiceLine[] = [];
	const runs: FunctionCall[] = [];
	let mic = false;
	const apply = (input: VoiceInput) => {
		const step = stepVoice(current, input);
		current = step.state;
		sent.push(...step.send);
		lines.push(...step.lines);
		runs.push(...step.run);
		mic = step.mic;
		return step;
	};
	return {
		apply,
		server: (event: ServerEvent) => apply({ type: 'server', event }),
		get state() {
			return current;
		},
		get phase() {
			return phaseOf(current);
		},
		get mic() {
			return mic;
		},
		sent,
		lines,
		runs,
		/** The types of the events sent since the last call. */
		take(): string[] {
			return sent.splice(0).map((e) => e.type);
		}
	};
}

function connected(mode: VoiceMode = 'push-to-talk') {
	const d = drive(initialVoiceState(mode));
	d.apply({ type: 'connect', mode });
	d.apply({ type: 'open' });
	d.take();
	return d;
}

/** The voice says `text` as the response `id`, audio and all. */
function speak(d: ReturnType<typeof drive>, id: string, text: string, item = `item_${id}`) {
	d.server({ type: 'response.created', response: { id } });
	d.server({ type: 'output_audio_buffer.started', response_id: id });
	for (const word of text.split(' ')) {
		d.server({ type: 'response.output_audio_transcript.delta', item_id: item, delta: `${word} ` });
	}
	d.server({ type: 'response.output_audio_transcript.done', item_id: item, transcript: text });
}

const callItem = (callId: string, name = 'ask_claude', args = '{"request":"tempo 96"}') => ({
	type: 'function_call',
	status: 'completed',
	call_id: callId,
	name,
	arguments: args
});

describe('voice machine: push-to-talk', () => {
	it('opens the mic while held, commits on release and asks for a response once committed', () => {
		const d = connected();
		expect(d.phase).toBe('listening');
		expect(d.mic).toBe(false);

		d.apply({ type: 'press' });
		expect(d.take()).toEqual(['input_audio_buffer.clear']);
		expect(d.mic).toBe(true);
		expect(d.phase).toBe('user-speaking');

		d.apply({ type: 'release', heldMs: 900 });
		expect(d.take()).toEqual(['input_audio_buffer.commit']);
		expect(d.mic).toBe(false);
		expect(d.phase).toBe('thinking');

		d.server({ type: 'input_audio_buffer.committed', item_id: 'item_u1' });
		expect(d.take()).toEqual(['response.create']);
		expect(d.state.turnCount).toBe(1);
		expect(d.lines.at(-1)).toEqual({
			id: 'item_u1',
			role: 'user',
			text: '',
			live: true,
			interrupted: false
		});

		d.server({
			type: 'conversation.item.input_audio_transcription.delta',
			item_id: 'item_u1',
			delta: 'set the '
		});
		d.server({
			type: 'conversation.item.input_audio_transcription.completed',
			item_id: 'item_u1',
			transcript: 'set the tempo to 96'
		});
		expect(d.lines.at(-1)).toMatchObject({
			id: 'item_u1',
			text: 'set the tempo to 96',
			live: false
		});
		expect(d.state.turns.at(-1)).toMatchObject({ index: 1, transcript: 'set the tempo to 96' });

		speak(d, 'resp_1', 'one moment');
		expect(d.phase).toBe('speaking');
		d.server({ type: 'response.done', response: { id: 'resp_1', status: 'completed' } });
		// Still playing: the line stays live until the audio stops.
		expect(d.lines.at(-1)).toMatchObject({ role: 'assistant', text: 'one moment', live: true });
		d.server({ type: 'output_audio_buffer.stopped', response_id: 'resp_1' });
		expect(d.lines.at(-1)).toEqual({
			id: 'item_resp_1',
			role: 'assistant',
			text: 'one moment',
			live: false,
			interrupted: false
		});
		expect(d.phase).toBe('listening');
		expect(d.take()).toEqual([]);
	});

	it('drops a hold too short to be speech, and says to hold the key', () => {
		const d = connected();
		d.apply({ type: 'press' });
		d.take();
		d.apply({ type: 'release', heldMs: MIN_TURN_MS - 1 });
		expect(d.take()).toEqual(['input_audio_buffer.clear']);
		expect(d.state.hint).toBe(TOO_SHORT_HINT);
		expect(d.phase).toBe('listening');
		d.apply({ type: 'press' });
		expect(d.state.hint).toBeNull();
	});

	it('treats an empty commit as a short hold, without asking for a response', () => {
		const d = connected();
		d.apply({ type: 'press' });
		d.apply({ type: 'release', heldMs: 600 });
		d.take();
		d.server({
			type: 'error',
			error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty' }
		});
		expect(d.state.committing).toBe(false);
		expect(d.state.hint).toBe(TOO_SHORT_HINT);
		expect(d.state.problem).toBeNull();
		expect(d.phase).toBe('listening');
		expect(d.take()).toEqual([]);
	});

	it('keeps a key held while connecting and starts its turn when the call opens', () => {
		const d = drive();
		d.apply({ type: 'connect', mode: 'push-to-talk' });
		d.apply({ type: 'press' });
		expect(d.take()).toEqual([]);
		expect(d.phase).toBe('connecting');
		expect(d.mic).toBe(false);
		d.apply({ type: 'open' });
		expect(d.take()).toEqual(['input_audio_buffer.clear']);
		expect(d.mic).toBe(true);
	});

	it('barges in: the key cancels the response, clears the queued audio and cuts the line', () => {
		const d = connected();
		speak(d, 'resp_1', 'the arpeggio has five modes and');
		d.take();
		d.apply({ type: 'press' });
		expect(d.sent.map((e) => e.type)).toEqual([
			'response.cancel',
			'output_audio_buffer.clear',
			'input_audio_buffer.clear'
		]);
		d.take();
		expect(d.lines.at(-1)).toMatchObject({ role: 'assistant', live: false, interrupted: true });
		expect(d.phase).toBe('user-speaking');
		const emitted = d.lines.length;
		// The server's confirmations change nothing more on screen.
		d.server({ type: 'output_audio_buffer.cleared', response_id: 'resp_1' });
		d.server({ type: 'response.done', response: { id: 'resp_1', status: 'cancelled' } });
		expect(d.lines.length).toBe(emitted);
		expect(d.take()).toEqual([]);
	});

	it('cancels a response that starts while the user is still holding the key', () => {
		const d = connected();
		d.apply({ type: 'announce', text: 'Update from Claude: {}' });
		expect(d.take()).toEqual(['conversation.item.create', 'response.create']);
		d.apply({ type: 'press' });
		d.take();
		d.server({ type: 'response.created', response: { id: 'resp_9' } });
		expect(d.sent).toEqual([{ type: 'response.cancel', response_id: 'resp_9' }]);
	});
});

describe('voice machine: hands-free', () => {
	it('keeps the mic open, lets the server take turns and marks a line cut off on barge-in', () => {
		const d = connected('hands-free');
		expect(d.mic).toBe(true);
		speak(d, 'resp_1', 'here is how the filter');
		d.take();
		d.server({ type: 'input_audio_buffer.speech_started', item_id: 'item_u2' });
		// With WebRTC and interrupt_response the server cancels and truncates by itself.
		expect(d.take()).toEqual([]);
		expect(d.phase).toBe('user-speaking');
		expect(d.lines.find((l) => l.id === 'item_resp_1' && l.interrupted)).toBeTruthy();
		expect(d.lines.at(-1)).toMatchObject({ id: 'item_u2', role: 'user', live: true });
		d.server({ type: 'input_audio_buffer.speech_stopped', item_id: 'item_u2' });
		d.server({ type: 'input_audio_buffer.committed', item_id: 'item_u2' });
		// The server answers by itself: no response.create from us.
		expect(d.take()).toEqual([]);
		expect(d.state.turnCount).toBe(1);
	});

	it('mutes and unmutes the mic', () => {
		const d = connected('hands-free');
		expect(d.apply({ type: 'mute', muted: true }).mic).toBe(false);
		expect(d.apply({ type: 'mute', muted: false }).mic).toBe(true);
	});

	it('switches turn taking live, and tells the server on open about a switch made while connecting', () => {
		const d = connected();
		d.apply({ type: 'mode', mode: 'hands-free' });
		expect(d.sent).toEqual([
			{
				type: 'session.update',
				session: {
					type: 'realtime',
					audio: {
						input: {
							turn_detection: {
								type: 'semantic_vad',
								eagerness: 'auto',
								create_response: true,
								interrupt_response: true
							}
						}
					}
				}
			},
			{ type: 'input_audio_buffer.clear' }
		]);
		expect(d.mic).toBe(true);
		d.take();
		d.apply({ type: 'mode', mode: 'push-to-talk' });
		expect(d.sent[0]).toMatchObject({
			type: 'session.update',
			session: { audio: { input: { turn_detection: null } } }
		});

		const e = drive();
		e.apply({ type: 'connect', mode: 'push-to-talk' });
		e.apply({ type: 'mode', mode: 'hands-free' });
		expect(e.take()).toEqual([]);
		e.apply({ type: 'open' });
		expect(e.take()).toEqual(['session.update']);
	});
});

describe('voice machine: tool calls', () => {
	it('runs each call once, sends its output and asks for a response when the floor is free', () => {
		const d = connected();
		d.server({ type: 'response.created', response: { id: 'resp_1' } });
		d.server({ type: 'response.output_item.done', item: callItem('call_1') });
		d.server({
			type: 'response.function_call_arguments.done',
			call_id: 'call_1',
			name: 'ask_claude',
			arguments: '{"request":"tempo 96"}'
		});
		d.server({
			type: 'response.done',
			response: { id: 'resp_1', status: 'completed', output: [callItem('call_1')] }
		});
		expect(d.runs).toEqual([
			{ callId: 'call_1', name: 'ask_claude', arguments: '{"request":"tempo 96"}' }
		]);
		expect(d.phase).toBe('thinking');
		expect(d.take()).toEqual([]);

		d.apply({ type: 'result', callId: 'call_1', output: '{"status":"done"}' });
		expect(d.sent).toEqual([
			{
				type: 'conversation.item.create',
				item: { type: 'function_call_output', call_id: 'call_1', output: '{"status":"done"}' }
			},
			{ type: 'response.create' }
		]);
		d.take();
		// A second result for the same call is not sent again.
		d.apply({ type: 'result', callId: 'call_1', output: '{}' });
		expect(d.take()).toEqual([]);
	});

	it('does not run a call cut off while its arguments were written', () => {
		const d = connected();
		d.server({
			type: 'response.output_item.done',
			item: { ...callItem('call_2'), status: 'incomplete' }
		});
		expect(d.runs).toEqual([]);
	});

	it('waits for the voice to finish speaking before asking for the next response', () => {
		const d = connected();
		d.server({ type: 'response.output_item.done', item: callItem('call_1') });
		speak(d, 'resp_2', 'still with you');
		d.server({ type: 'response.done', response: { id: 'resp_2', status: 'completed' } });
		d.take();
		d.apply({ type: 'result', callId: 'call_1', output: '{}' });
		expect(d.take()).toEqual(['conversation.item.create']);
		d.server({ type: 'output_audio_buffer.stopped', response_id: 'resp_2' });
		expect(d.take()).toEqual(['response.create']);
	});

	it('lets a response the server starts cover outputs it had confirmed, and only those', () => {
		const d = connected('hands-free');
		d.server({ type: 'response.output_item.done', item: callItem('call_1') });
		d.server({ type: 'response.output_item.done', item: callItem('call_2', 'stop_claude', '{}') });
		d.server({ type: 'input_audio_buffer.speech_started', item_id: 'item_u1' });
		d.apply({ type: 'result', callId: 'call_1', output: '{}' });
		d.apply({ type: 'result', callId: 'call_2', output: '{}' });
		expect(d.take()).toEqual(['conversation.item.create', 'conversation.item.create']);
		d.server({
			type: 'conversation.item.added',
			item: { type: 'function_call_output', call_id: 'call_1' }
		});
		d.server({ type: 'input_audio_buffer.speech_stopped' });
		// The user's turn: the server starts a response, which saw call_1's output but not call_2's.
		d.server({ type: 'response.created', response: { id: 'resp_3' } });
		expect(d.state.owed).toEqual([{ key: 'call:call_2', confirmed: false }]);
		d.server({
			type: 'conversation.item.added',
			item: { type: 'function_call_output', call_id: 'call_2' }
		});
		d.server({ type: 'response.done', response: { id: 'resp_3', status: 'completed' } });
		expect(d.take()).toEqual(['response.create']);
		d.server({ type: 'response.created', response: { id: 'resp_4' } });
		d.server({ type: 'response.done', response: { id: 'resp_4', status: 'completed' } });
		expect(d.take()).toEqual([]);
		expect(d.phase).toBe('listening');
	});

	it('asks again when the server refused our request because a response was running', () => {
		const d = connected();
		d.apply({ type: 'announce', text: 'Update from Claude: {"status":"done"}' });
		expect(d.take()).toEqual(['conversation.item.create', 'response.create']);
		d.server({
			type: 'error',
			error: { type: 'invalid_request_error', code: 'conversation_already_has_active_response' }
		});
		expect(d.state.problem).toBeNull();
		d.server({ type: 'response.created', response: { id: 'resp_x' } });
		// That response was created before our note: its end frees the floor for ours.
		expect(d.state.owed).toHaveLength(1);
		d.server({ type: 'response.done', response: { id: 'resp_x', status: 'completed' } });
		expect(d.take()).toEqual(['response.create']);
	});

	it('adds an announcement as a system note', () => {
		const d = connected();
		d.apply({ type: 'announce', text: 'Update from Claude: {"status":"done","answer":"Done."}' });
		expect(d.sent[0]).toEqual({
			type: 'conversation.item.create',
			item: {
				type: 'message',
				role: 'system',
				content: [
					{ type: 'input_text', text: 'Update from Claude: {"status":"done","answer":"Done."}' }
				]
			}
		});
	});
});

describe('voice machine: lines, usage and the end of a call', () => {
	it('keeps a failed transcription as far as it got, and ignores late events for finished lines', () => {
		const d = connected('hands-free');
		d.server({
			type: 'conversation.item.input_audio_transcription.delta',
			item_id: 'item_u1',
			delta: 'play the'
		});
		d.server({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'item_u1' });
		expect(d.lines.at(-1)).toMatchObject({ id: 'item_u1', text: 'play the', live: false });
		expect(d.state.turns.at(-1)).toMatchObject({ id: 'item_u1', transcript: '' });
		const emitted = d.lines.length;
		d.server({
			type: 'conversation.item.input_audio_transcription.delta',
			item_id: 'item_u1',
			delta: ' late'
		});
		d.server({ type: 'input_audio_buffer.committed', item_id: 'item_u1' });
		expect(d.lines.length).toBe(emitted);
		expect(d.state.turnCount).toBe(1);
	});

	it('counts tokens and reports a failed response without ending the call', () => {
		const d = connected();
		d.server({ type: 'response.created', response: { id: 'r1' } });
		d.server({
			type: 'response.done',
			response: {
				id: 'r1',
				status: 'failed',
				status_details: { error: { type: 'server_error', message: 'Something broke' } },
				usage: {
					input_tokens: 700,
					output_tokens: 90,
					input_token_details: {
						text_tokens: 600,
						audio_tokens: 100,
						cached_tokens: 512,
						cached_tokens_details: { text_tokens: 512, audio_tokens: 0 }
					},
					output_token_details: { text_tokens: 20, audio_tokens: 70 }
				}
			}
		});
		expect(d.state.tokens).toEqual({
			responses: 1,
			textIn: 600,
			audioIn: 100,
			cachedTextIn: 512,
			cachedAudioIn: 0,
			textOut: 20,
			audioOut: 70
		});
		expect(d.state.problem).toEqual({
			code: 'server',
			message: 'openai: something broke',
			fatal: false
		});
		expect(d.state.connection).toBe('open');
		d.server({ type: 'response.created', response: { id: 'r2' } });
		expect(d.state.problem).toBeNull();
	});

	it('finishes live lines, forgets pending calls and sends nothing once the call ends', () => {
		const d = connected();
		d.server({ type: 'response.output_item.done', item: callItem('call_1') });
		d.server({
			type: 'conversation.item.input_audio_transcription.delta',
			item_id: 'item_u1',
			delta: 'half a'
		});
		d.apply({ type: 'closed' });
		expect(d.lines.at(-1)).toMatchObject({ id: 'item_u1', text: 'half a', live: false });
		expect(d.phase).toBe('idle');
		expect(d.state.calls).toEqual([]);
		d.apply({ type: 'result', callId: 'call_1', output: '{}' });
		d.apply({ type: 'announce', text: 'Update from Claude: {}' });
		expect(d.take()).toEqual([]);
		expect(d.mic).toBe(false);
	});

	it('shows connecting, error and idle phases', () => {
		const d = drive();
		expect(d.phase).toBe('idle');
		d.apply({ type: 'connect', mode: 'push-to-talk' });
		expect(d.phase).toBe('connecting');
		d.apply({
			type: 'failed',
			problem: { code: 'mic-blocked', message: 'the microphone is blocked', fatal: true }
		});
		expect(d.phase).toBe('error');
		expect(d.state.problem?.code).toBe('mic-blocked');
		d.apply({ type: 'connect', mode: 'push-to-talk' });
		expect(d.state.problem).toBeNull();
	});
});
