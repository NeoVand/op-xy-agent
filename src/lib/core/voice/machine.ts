/**
 * The voice session as a pure state machine: realtime server events and the user's actions go in;
 * out come the new state, the client events to send, the transcript lines that changed and the
 * tool calls to run. The browser session (`voice/session.svelte.ts`) only carries bytes and runs
 * tools; every decision is here, where Node tests reach it (docs/research/71-voice.md §5).
 *
 * - **Push-to-talk** (`turn_detection: null`, WebRTC): key down clears the input buffer and opens
 *   the mic; key up (after a short tail) commits the buffer; once the server confirms the commit
 *   the app asks for a response. A hold too short to be speech is dropped.
 * - **Hands-free**: semantic VAD takes the turns and answers by itself.
 * - **Barge-in**: pressing the key while the voice talks cancels the response and clears the audio
 *   still queued (`response.cancel` + `output_audio_buffer.clear`; with WebRTC the server then
 *   truncates the item to what was heard, so `conversation.item.truncate` is not needed). With
 *   VAD the server does both itself when it hears the user. Either way the line on screen is
 *   marked as cut off.
 * - **Tool outputs** go back as `function_call_output` items. A response is then owed; it is asked
 *   for once the floor is free (no response running, nobody talking, nothing playing, no user turn
 *   the server is about to answer by itself). A response the server starts covers the outputs it
 *   had confirmed adding (`conversation.item.added`), so none is asked for twice.
 */
import { modeUpdate, type VoiceMode } from './config';
import { serverProblem, type VoiceProblem } from './errors';
import type { ClientEvent, RealtimeItem, RealtimeUsage, ServerEvent } from './events';

/** What the voice is doing, for the key's LED and the strip's words. */
export type VoicePhase =
	'idle' | 'connecting' | 'listening' | 'user-speaking' | 'thinking' | 'speaking' | 'error';

/** The call itself. */
export type VoiceConnection = 'idle' | 'connecting' | 'open' | 'closed' | 'failed';

/** A line of the spoken conversation: what the mic heard, or what the voice said. */
export interface VoiceLine {
	/** The realtime item id; the same line updates while it is transcribed or spoken. */
	readonly id: string;
	readonly role: 'user' | 'assistant';
	readonly text: string;
	/** Still being transcribed, or still being spoken. */
	readonly live: boolean;
	/** The user talked over it, so the rest was never said. */
	readonly interrupted: boolean;
}

/** A tool call the model made that has no output yet. */
export interface FunctionCall {
	readonly callId: string;
	readonly name: string;
	/** JSON text. */
	readonly arguments: string;
}

/** One committed user turn and, once transcribed, what was said. */
export interface UserTurn {
	/** 1 for the session's first turn, counting up. */
	readonly index: number;
	readonly id: string;
	/** Null while the transcription is pending ('' when it failed). */
	readonly transcript: string | null;
}

/** Token counts across the session's responses. */
export interface VoiceTokens {
	readonly responses: number;
	readonly textIn: number;
	readonly audioIn: number;
	readonly cachedTextIn: number;
	readonly cachedAudioIn: number;
	readonly textOut: number;
	readonly audioOut: number;
}

/** An item we added that still needs a response to be heard. */
interface Owed {
	/** `call:<id>` for a tool output, `note` for a system note. */
	readonly key: string;
	/** The server confirmed it is in the conversation. */
	readonly confirmed: boolean;
}

/** Everything the session knows. Plain data; `stepVoice` returns a new one. */
export interface VoiceState {
	readonly connection: VoiceConnection;
	readonly mode: VoiceMode;
	/** The mode the session was minted with (a switch while connecting is sent on open). */
	readonly configured: VoiceMode | null;
	/** Push-to-talk: the key is held (the mic is open for this turn). */
	readonly held: boolean;
	/** Hands-free: the user muted the mic. */
	readonly muted: boolean;
	/** VAD heard speech start and not yet stop. */
	readonly hearing: boolean;
	/** Hands-free: the user's turn ended; the server is about to answer it by itself. */
	readonly turnPending: boolean;
	/** Push-to-talk: the buffer was committed; the response is asked for once confirmed. */
	readonly committing: boolean;
	/** `response.create` was sent; `response.created` has not come yet. */
	readonly requested: boolean;
	/** The response being generated (its id; '' when the server gave none), or null. */
	readonly responding: string | null;
	/** The voice's audio is playing. */
	readonly playing: boolean;
	readonly calls: readonly FunctionCall[];
	/** Call ids already run (the same call is reported by several events). */
	readonly seen: readonly string[];
	readonly owed: readonly Owed[];
	/** Owed items a sent `response.create` will cover. */
	readonly inFlight: readonly Owed[];
	/** The last few user turns. */
	readonly turns: readonly UserTurn[];
	/** Turns so far (the index of the last one). */
	readonly turnCount: number;
	/** Lines still changing. */
	readonly lines: readonly VoiceLine[];
	/** Ids of lines already finished (late events for them are dropped). */
	readonly finished: readonly string[];
	readonly tokens: VoiceTokens;
	readonly problem: VoiceProblem | null;
	/** A short tip for the user ("hold the key while you talk"). */
	readonly hint: string | null;
}

/** Something that happened. */
export type VoiceInput =
	/** Connecting started, with the session minted for this mode. */
	| { readonly type: 'connect'; readonly mode: VoiceMode }
	/** The data channel is open. */
	| { readonly type: 'open' }
	/** The call ended: closed by the user (no problem) or dropped. */
	| { readonly type: 'closed'; readonly problem?: VoiceProblem | null }
	/** Connecting failed. */
	| { readonly type: 'failed'; readonly problem: VoiceProblem }
	/** Push-to-talk key down. */
	| { readonly type: 'press' }
	/** Push-to-talk key up, after the tail; `heldMs` is how long it was held. */
	| { readonly type: 'release'; readonly heldMs: number }
	| { readonly type: 'mode'; readonly mode: VoiceMode }
	| { readonly type: 'mute'; readonly muted: boolean }
	/** A tool call finished; `output` is its JSON. */
	| { readonly type: 'result'; readonly callId: string; readonly output: string }
	/** A late result to be spoken (a system note, then a response). */
	| { readonly type: 'announce'; readonly text: string }
	/** The user dismissed the problem or hint on show. */
	| { readonly type: 'dismiss' }
	| { readonly type: 'server'; readonly event: ServerEvent };

/** What one input leads to. */
export interface VoiceStep {
	readonly state: VoiceState;
	/** Client events to send, in order. */
	readonly send: readonly ClientEvent[];
	/** Lines that changed, in order (the same line may appear more than once). */
	readonly lines: readonly VoiceLine[];
	/** Tool calls to start now. */
	readonly run: readonly FunctionCall[];
	/** Whether the microphone track should be open. */
	readonly mic: boolean;
}

/** A hold shorter than this carries no speech worth a turn (and the API wants ≥ 100 ms of audio). */
export const MIN_TURN_MS = 250;
/** Said when a hold was too short. */
export const TOO_SHORT_HINT = 'hold the key while you talk';

const EMPTY_TOKENS: VoiceTokens = {
	responses: 0,
	textIn: 0,
	audioIn: 0,
	cachedTextIn: 0,
	cachedAudioIn: 0,
	textOut: 0,
	audioOut: 0
};

/** A session that has not connected yet. */
export function initialVoiceState(mode: VoiceMode = 'push-to-talk'): VoiceState {
	return {
		connection: 'idle',
		mode,
		configured: null,
		held: false,
		muted: false,
		hearing: false,
		turnPending: false,
		committing: false,
		requested: false,
		responding: null,
		playing: false,
		calls: [],
		seen: [],
		owed: [],
		inFlight: [],
		turns: [],
		turnCount: 0,
		lines: [],
		finished: [],
		tokens: EMPTY_TOKENS,
		problem: null,
		hint: null
	};
}

/** What the voice is doing. */
export function phaseOf(state: VoiceState): VoicePhase {
	switch (state.connection) {
		case 'connecting':
			return 'connecting';
		case 'failed':
			return 'error';
		case 'idle':
		case 'closed':
			return 'idle';
	}
	if (state.held || state.hearing) return 'user-speaking';
	if (state.playing) return 'speaking';
	const waiting =
		state.turnPending ||
		state.committing ||
		state.requested ||
		state.responding !== null ||
		state.calls.length > 0 ||
		state.owed.length > 0;
	return waiting ? 'thinking' : 'listening';
}

/** Whether the microphone track should be open. */
export function micOpen(state: VoiceState): boolean {
	if (state.connection !== 'open') return false;
	return state.mode === 'hands-free' ? !state.muted : state.held;
}

type Draft = { -readonly [K in keyof VoiceState]: VoiceState[K] };

interface Out {
	readonly send: ClientEvent[];
	readonly lines: VoiceLine[];
	readonly run: FunctionCall[];
}

/** Applies one input. Never mutates `state`. */
export function stepVoice(state: VoiceState, input: VoiceInput): VoiceStep {
	const s: Draft = { ...state };
	const out: Out = { send: [], lines: [], run: [] };
	switch (input.type) {
		case 'connect':
			s.connection = 'connecting';
			s.configured = input.mode;
			s.problem = null;
			s.hint = null;
			break;
		case 'open':
			s.connection = 'open';
			if (s.configured !== null && s.configured !== s.mode) out.send.push(modeUpdate(s.mode));
			s.configured = s.mode;
			// A key held while connecting: start its turn with an empty buffer.
			if (s.held) out.send.push({ type: 'input_audio_buffer.clear' });
			break;
		case 'closed':
		case 'failed':
			end(s, out);
			s.connection = input.type;
			s.problem = input.problem ?? null;
			break;
		case 'press':
			if (s.mode !== 'push-to-talk' || s.held) break;
			s.held = true;
			s.hint = null;
			if (s.problem && !s.problem.fatal) s.problem = null;
			if (s.connection !== 'open') break;
			bargeIn(s, out, true);
			out.send.push({ type: 'input_audio_buffer.clear' });
			break;
		case 'release':
			if (!s.held) break;
			s.held = false;
			if (s.connection !== 'open') break;
			if (input.heldMs < MIN_TURN_MS) {
				out.send.push({ type: 'input_audio_buffer.clear' });
				s.hint = TOO_SHORT_HINT;
				break;
			}
			out.send.push({ type: 'input_audio_buffer.commit' });
			s.committing = true;
			break;
		case 'mode':
			if (s.mode === input.mode) break;
			s.mode = input.mode;
			s.held = false;
			s.hearing = false;
			s.turnPending = false;
			s.committing = false;
			if (s.connection !== 'open') break;
			out.send.push(modeUpdate(input.mode), { type: 'input_audio_buffer.clear' });
			s.configured = input.mode;
			break;
		case 'mute':
			s.muted = input.muted;
			break;
		case 'dismiss':
			s.problem = null;
			s.hint = null;
			if (s.connection === 'failed') s.connection = 'closed';
			break;
		case 'result': {
			const call = s.calls.find((c) => c.callId === input.callId);
			if (!call) break;
			s.calls = s.calls.filter((c) => c !== call);
			if (s.connection !== 'open') break;
			out.send.push({
				type: 'conversation.item.create',
				item: { type: 'function_call_output', call_id: call.callId, output: input.output }
			});
			s.owed = [...s.owed, { key: `call:${call.callId}`, confirmed: false }];
			break;
		}
		case 'announce':
			if (s.connection !== 'open') break;
			out.send.push({
				type: 'conversation.item.create',
				item: {
					type: 'message',
					role: 'system',
					content: [{ type: 'input_text', text: input.text }]
				}
			});
			s.owed = [...s.owed, { key: 'note', confirmed: false }];
			break;
		case 'server':
			onServer(s, out, input.event);
			break;
	}
	flush(s, out);
	return { state: s, send: out.send, lines: out.lines, run: out.run, mic: micOpen(s) };
}

function onServer(s: Draft, out: Out, e: ServerEvent): void {
	switch (e.type) {
		case 'input_audio_buffer.speech_started':
			s.hearing = true;
			bargeIn(s, out, false);
			if (e.item_id) touchUser(s, out, e.item_id);
			return;
		case 'input_audio_buffer.speech_stopped':
			s.hearing = false;
			// The server commits the turn and answers it: asking as well would collide.
			if (s.mode === 'hands-free') s.turnPending = true;
			return;
		case 'input_audio_buffer.committed':
			if (e.item_id) {
				addTurn(s, e.item_id, null);
				touchUser(s, out, e.item_id);
			}
			if (s.committing) {
				s.committing = false;
				requestResponse(s, out);
			}
			return;
		case 'conversation.item.input_audio_transcription.delta':
			if (e.item_id && e.delta) appendLine(s, out, e.item_id, 'user', e.delta);
			return;
		case 'conversation.item.input_audio_transcription.completed':
			if (e.item_id) finishUser(s, out, e.item_id, e.transcript ?? '');
			return;
		case 'conversation.item.input_audio_transcription.failed':
			if (e.item_id) finishUser(s, out, e.item_id, null);
			return;
		case 'conversation.item.added':
			if (e.item) confirm(s, e.item);
			return;
		case 'conversation.item.truncated':
			if (e.item_id && s.lines.some((l) => l.id === e.item_id)) finishAssistant(s, out, true);
			return;
		case 'response.created': {
			const id = e.response?.id ?? '';
			// A new response: whatever the voice said before is over.
			finishAssistant(s, out, false);
			s.requested = false;
			s.turnPending = false;
			s.responding = id;
			s.inFlight = [];
			s.owed = s.owed.filter((o) => !o.confirmed);
			if (s.problem && !s.problem.fatal) s.problem = null;
			// The user took the floor before this response started: it must not talk over them.
			if (s.held)
				out.send.push(
					id ? { type: 'response.cancel', response_id: id } : { type: 'response.cancel' }
				);
			return;
		}
		case 'response.output_audio_transcript.delta':
		case 'response.output_text.delta':
			if (e.item_id && e.delta) appendLine(s, out, e.item_id, 'assistant', e.delta);
			return;
		case 'response.output_audio_transcript.done':
			if (e.item_id) setText(s, out, e.item_id, e.transcript);
			return;
		case 'response.output_text.done':
			if (e.item_id) setText(s, out, e.item_id, e.text);
			return;
		case 'response.output_item.done':
			if (e.item) noteCall(s, out, e.item);
			return;
		case 'response.function_call_arguments.done':
			if (e.call_id && e.name) {
				noteCall(s, out, {
					type: 'function_call',
					call_id: e.call_id,
					name: e.name,
					arguments: e.arguments ?? '{}'
				});
			}
			return;
		case 'response.done': {
			const response = e.response ?? {};
			s.responding = null;
			for (const item of response.output ?? []) noteCall(s, out, item);
			if (response.usage) s.tokens = addUsage(s.tokens, response.usage);
			if (response.status === 'cancelled') finishAssistant(s, out, true);
			else if (!s.playing) finishAssistant(s, out, false);
			if (response.status === 'failed') {
				s.problem = serverProblem(response.status_details?.error ?? undefined);
			}
			return;
		}
		case 'output_audio_buffer.started':
			s.playing = true;
			return;
		case 'output_audio_buffer.stopped':
			s.playing = false;
			finishAssistant(s, out, false);
			return;
		case 'output_audio_buffer.cleared':
			s.playing = false;
			finishAssistant(s, out, true);
			return;
		case 'error': {
			const code = e.error?.code ?? null;
			if (code === 'input_audio_buffer_commit_empty') {
				s.committing = false;
				s.hint = TOO_SHORT_HINT;
			} else if (code === 'conversation_already_has_active_response') {
				// Ours was refused: a response is running, and what ours was to cover waits for its end.
				s.requested = false;
				s.responding ??= '';
				s.owed = [...s.inFlight, ...s.owed];
				s.inFlight = [];
			} else {
				const problem = serverProblem(e.error);
				if (problem) s.problem = problem;
			}
			return;
		}
		case 'session.created':
		case 'session.updated':
		case 'input_audio_buffer.cleared':
			return;
	}
}

/**
 * The user takes the floor. `local` (the key went down): cancel the response and clear the audio
 * still queued. With VAD the server does that itself; only the line on screen changes.
 */
function bargeIn(s: Draft, out: Out, local: boolean): void {
	const active = s.responding !== null;
	if (local) {
		if (active) out.send.push({ type: 'response.cancel' });
		if (s.playing) out.send.push({ type: 'output_audio_buffer.clear' });
	}
	if (active || s.playing || s.requested) finishAssistant(s, out, true);
}

/** Asks for a response once the floor is free and something is owed. */
function flush(s: Draft, out: Out): void {
	if (s.connection !== 'open' || s.owed.length === 0) return;
	if (s.requested || s.responding !== null || s.committing || s.turnPending) return;
	if (s.held || s.hearing || s.playing) return;
	requestResponse(s, out);
}

function requestResponse(s: Draft, out: Out): void {
	out.send.push({ type: 'response.create' });
	s.requested = true;
	s.inFlight = [...s.inFlight, ...s.owed];
	s.owed = [];
}

/** The server confirmed an item we added (so a response it starts after this will cover it). */
function confirm(s: Draft, item: RealtimeItem): void {
	const key =
		item.type === 'function_call_output' && item.call_id
			? `call:${item.call_id}`
			: item.type === 'message' && item.role === 'system'
				? 'note'
				: null;
	if (!key) return;
	const index = s.owed.findIndex((o) => o.key === key && !o.confirmed);
	if (index < 0) return;
	s.owed = s.owed.map((o, i) => (i === index ? { ...o, confirmed: true } : o));
}

function noteCall(s: Draft, out: Out, item: RealtimeItem): void {
	if (item.type !== 'function_call' || !item.call_id || !item.name) return;
	// Cut off while its arguments were being written: nothing to run.
	if (item.status && item.status !== 'completed') return;
	if (s.seen.includes(item.call_id)) return;
	const call: FunctionCall = {
		callId: item.call_id,
		name: item.name,
		arguments: item.arguments ?? '{}'
	};
	s.seen = [...s.seen, call.callId].slice(-32);
	s.calls = [...s.calls, call];
	out.run.push(call);
}

function addTurn(s: Draft, id: string, transcript: string | null): void {
	if (s.turns.some((t) => t.id === id)) return;
	s.turnCount += 1;
	s.turns = [...s.turns, { index: s.turnCount, id, transcript }].slice(-16);
}

function upsert(s: Draft, out: Out, line: VoiceLine): void {
	const index = s.lines.findIndex((l) => l.id === line.id);
	s.lines = index < 0 ? [...s.lines, line] : s.lines.map((l, i) => (i === index ? line : l));
	out.lines.push(line);
}

function retire(s: Draft, out: Out, line: VoiceLine): void {
	s.lines = s.lines.filter((l) => l.id !== line.id);
	s.finished = [...s.finished, line.id].slice(-64);
	out.lines.push(line);
}

function blank(id: string, role: VoiceLine['role']): VoiceLine {
	return { id, role, text: '', live: true, interrupted: false };
}

function touchUser(s: Draft, out: Out, id: string): void {
	if (s.finished.includes(id) || s.lines.some((l) => l.id === id)) return;
	upsert(s, out, blank(id, 'user'));
}

function appendLine(s: Draft, out: Out, id: string, role: VoiceLine['role'], delta: string): void {
	if (s.finished.includes(id)) return;
	const line = s.lines.find((l) => l.id === id) ?? blank(id, role);
	upsert(s, out, { ...line, text: line.text + delta });
}

/** The voice's words for a line are complete (its audio may still be playing). */
function setText(s: Draft, out: Out, id: string, text: string | undefined): void {
	if (s.finished.includes(id)) return;
	const line = s.lines.find((l) => l.id === id) ?? blank(id, 'assistant');
	if (text !== undefined && text !== line.text) upsert(s, out, { ...line, text });
	else if (!s.lines.includes(line)) upsert(s, out, line);
}

function finishUser(s: Draft, out: Out, id: string, transcript: string | null): void {
	// The turn gets its words even when the transcript came before the commit's event.
	addTurn(s, id, transcript ?? '');
	s.turns = s.turns.map((t) => (t.id === id ? { ...t, transcript: transcript ?? '' } : t));
	if (s.finished.includes(id)) return;
	const line = s.lines.find((l) => l.id === id) ?? blank(id, 'user');
	retire(s, out, { ...line, text: transcript ?? line.text, live: false });
}

/** The voice finished its lines (or was cut off): they stop changing. */
function finishAssistant(s: Draft, out: Out, interrupted: boolean): void {
	for (const line of s.lines) {
		if (line.role !== 'assistant') continue;
		retire(s, out, { ...line, live: false, interrupted: line.interrupted || interrupted });
	}
}

/** The call is over: lines still changing are finished as they stand. */
function end(s: Draft, out: Out): void {
	for (const line of s.lines) retire(s, out, { ...line, live: false });
	s.held = false;
	s.hearing = false;
	s.turnPending = false;
	s.committing = false;
	s.requested = false;
	s.responding = null;
	s.playing = false;
	s.calls = [];
	s.owed = [];
	s.inFlight = [];
	s.configured = null;
	s.hint = null;
}

function addUsage(tokens: VoiceTokens, usage: RealtimeUsage): VoiceTokens {
	const input = usage.input_token_details ?? {};
	const cached = input.cached_tokens_details ?? {};
	const output = usage.output_token_details ?? {};
	return {
		responses: tokens.responses + 1,
		textIn: tokens.textIn + (input.text_tokens ?? 0),
		audioIn: tokens.audioIn + (input.audio_tokens ?? 0),
		cachedTextIn: tokens.cachedTextIn + (cached.text_tokens ?? 0),
		cachedAudioIn: tokens.cachedAudioIn + (cached.audio_tokens ?? 0),
		textOut: tokens.textOut + (output.text_tokens ?? 0),
		audioOut: tokens.audioOut + (output.audio_tokens ?? 0)
	};
}
