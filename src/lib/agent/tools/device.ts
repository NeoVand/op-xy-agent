/**
 * Device tools: read the device state, start and stop playback, set the tempo, select and mute
 * tracks, preview notes, panic. Each one builds typed MIDI messages with core/opxy (CC map, tempo
 * scaling) and sends them through the device layer's transport, the app's single send choke point,
 * with `source: 'agent'` (or `'user'` for undo) and the tool call id as `cause`.
 *
 * Facts they rely on (verified on OS 1.1.33, docs/research/90-device-probe.md): CC80 = BPM / 2
 * (40–220), CC9 is a mute level (0 = unmuted), CC102 selects a track zero-based on channel 1,
 * MIDI start/stop run the transport, the device echoes transport only with COM → clock "both",
 * and it never reports tempo edits, mutes or track selection made by hand.
 *
 * Nothing dangerous exists as a tool: no project load (CC86), no remote keys, no files, no SysEx.
 */
import { z } from 'zod';
import type { MidiMessage } from '$lib/core/midi/messages';
import { parseNoteName } from '$lib/core/midi/notes';
import {
	CC80_TEMPO_RANGE,
	ccToTempo,
	encodeCcValue,
	getTrack,
	resolveCc,
	tempoToCc
} from '$lib/core/opxy';
import type { DeviceStack } from '$lib/device';
import { DeviceError } from '$lib/device/errors';
import { deviceSnapshot } from '../device-state';
import {
	defineTool,
	errorResult,
	jsonResult,
	sleep,
	type AgentEnvironment,
	type ToolContext,
	type ToolResult
} from './define';

// ─── helpers ────────────────────────────────────────────────────────────────────────────────────

/** Who a tool's messages are attributed to on the MIDI bus. */
export type SendAttribution = 'agent' | 'user';

/** Tool call ids starting with this prefix are undo operations started by the user. */
export const UNDO_CALL_PREFIX = 'undo:';

function attribution(ctx: ToolContext): SendAttribution {
	return ctx.toolCallId.startsWith(UNDO_CALL_PREFIX) ? 'user' : 'agent';
}

const NOT_CONNECTED =
	'No OP-XY is connected, so nothing was sent. Ask the user to connect it with the connect button on the device stage (USB, Chrome or Edge), then try again.';

/** The device stack when an OP-XY is connected and ready; otherwise an error result. */
function connected(env: AgentEnvironment): DeviceStack | ToolResult {
	const stack = env.device;
	if (!stack || stack.session.phase !== 'ready')
		return errorResult(NOT_CONNECTED, 'no op-xy connected');
	return stack;
}

function isResult(value: DeviceStack | ToolResult): value is ToolResult {
	return 'summary' in value;
}

/** Sends one message through the transport; a refusal becomes a readable error. */
function send(stack: DeviceStack, ctx: ToolContext, message: MidiMessage): void {
	stack.transport.send(message, { source: attribution(ctx), cause: ctx.toolCallId });
}

/** The error message of anything thrown by the transport (policy refusals, unplugged device). */
function sendError(error: unknown): ToolResult {
	const detail = error instanceof Error ? error.message : String(error);
	return errorResult(`The app refused or failed to send this: ${detail}`, 'not sent');
}

/** Rounds a tempo to what CC80 can express (2-BPM steps, 40–220). */
export function deviceTempo(bpm: number): number {
	const clamped = Math.min(CC80_TEMPO_RANGE.max, Math.max(CC80_TEMPO_RANGE.min, bpm));
	return ccToTempo(tempoToCc(clamped));
}

function formatBpm(bpm: number): string {
	return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

// ─── device_status ──────────────────────────────────────────────────────────────────────────────

export const deviceStatusTool = defineTool({
	name: 'device_status',
	label: 'device status',
	kind: 'read',
	description:
		'Read what the app knows about the OP-XY right now: whether it is connected, firmware, play state and who reported it, whether the device sends clock (and the measured tempo), and the sent-state cache (tempo, selected track and mutes as this app last sent them; the user may have changed them by hand). Sends nothing.',
	input: z.object({}),
	async run(_input, ctx) {
		const s = deviceSnapshot(ctx.env.device);
		const data = {
			connected: s.connected,
			phase: s.phase,
			device: s.connected
				? {
						product: s.product,
						firmware: s.firmware,
						firmwareRelation: s.firmwareRelation,
						warnings: s.firmwareWarnings
					}
				: null,
			transport: { playState: s.playState, reportedBy: s.playSource },
			clock: { deviceSendsClock: s.clockOut, measuredBpm: s.measuredBpm },
			sentState: { tempoBpm: s.tempoSent, selectedTrack: s.selectedTrack, mutes: s.mutes },
			notes: [
				'sentState is what this app last sent; the OP-XY never reports tempo edits, mutes or track selection made by hand.',
				s.clockOut
					? 'The device sends clock, so play state and tempo are confirmed by the device.'
					: 'The device sends no clock (com → system settings → midi → clock is not "both"): play state and tempo cannot be confirmed.'
			]
		};
		const summary = s.connected
			? `connected, os ${s.firmware ?? 'unknown'}, ${s.playState}`
			: 'no op-xy connected';
		return jsonResult(data, summary);
	}
});

// ─── transport ──────────────────────────────────────────────────────────────────────────────────

interface TransportSnapshot {
	readonly playState: 'playing' | 'stopped' | 'unknown';
	readonly reported: boolean;
}

export const transportTool = defineTool({
	name: 'transport',
	label: 'transport',
	kind: 'mutate',
	approval: 'auto',
	device: true,
	description:
		'Start or stop the OP-XY sequencer (MIDI start / stop). Changes playback only, never the project. "play" while the device reports it is already playing sends nothing, because start would restart the pattern from the top.',
	input: z.object({
		action: z.enum(['play', 'stop']).describe('play starts the sequencer, stop stops it')
	}),
	snapshot(_input, env): TransportSnapshot {
		const s = deviceSnapshot(env.device);
		return {
			playState: s.playState,
			reported: s.playSource === 'device' || s.playSource === 'echo'
		};
	},
	preview(input, before) {
		return {
			label: input.action === 'play' ? 'start playback' : 'stop playback',
			before: before.playState === 'unknown' ? 'unknown' : before.playState,
			after: input.action === 'play' ? 'playing' : 'stopped'
		};
	},
	inverse(input, before) {
		const opposite = input.action === 'play' ? 'stop' : 'play';
		return {
			tool: 'transport',
			input: { action: opposite },
			label: opposite === 'stop' ? 'stop playback' : 'start playback',
			assumed: before.playState === 'unknown'
		};
	},
	async run(input, ctx) {
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		const { mirror } = stack;
		const reported = mirror.playSource === 'device' || mirror.playSource === 'echo';
		if (input.action === 'play' && mirror.playState === 'playing' && reported) {
			return jsonResult(
				{
					sent: null,
					playState: 'playing',
					note: 'Already playing (reported by the device); nothing sent.'
				},
				'already playing',
				{ applied: false }
			);
		}
		try {
			send(stack, ctx, { type: input.action === 'play' ? 'start' : 'stop' });
		} catch (error) {
			return sendError(error);
		}
		const expected = input.action === 'play' ? 'playing' : 'stopped';
		if (ctx.env.confirmWindowMs > 0)
			await sleep(ctx.env.confirmWindowMs, ctx.env.timers, ctx.signal);
		const confirmed = mirror.playSource === 'echo' && mirror.playState === expected;
		return jsonResult(
			{
				sent: input.action === 'play' ? 'MIDI start' : 'MIDI stop',
				playState: expected,
				confirmedByDevice: confirmed,
				note: confirmed
					? 'The device echoed it.'
					: 'Not confirmed: the device reports transport only when com → system settings → midi → clock is "both".'
			},
			confirmed
				? `${expected} (confirmed by the device)`
				: `${input.action === 'play' ? 'start' : 'stop'} sent`,
			{ applied: true, after: expected }
		);
	}
});

// ─── set_tempo ──────────────────────────────────────────────────────────────────────────────────

interface TempoSnapshot {
	readonly bpm: number | null;
	readonly from: 'measured' | 'sent' | null;
}

export const setTempoTool = defineTool({
	name: 'set_tempo',
	label: 'set tempo',
	kind: 'mutate',
	device: true,
	description:
		'Set the project tempo on the OP-XY (CC80). Changes the project (autosave keeps it), so the user approves it in the app. The device steps in 2 BPM: odd tempos round to the nearest even BPM, and the result says which tempo was sent.',
	input: z.object({
		bpm: z.number().min(CC80_TEMPO_RANGE.min).max(CC80_TEMPO_RANGE.max).describe('Tempo in BPM')
	}),
	snapshot(_input, env): TempoSnapshot {
		const s = deviceSnapshot(env.device);
		if (s.measuredBpm !== null) return { bpm: s.measuredBpm, from: 'measured' };
		if (s.tempoSent !== null) return { bpm: s.tempoSent, from: 'sent' };
		return { bpm: null, from: null };
	},
	preview(input, before) {
		const target = deviceTempo(input.bpm);
		return {
			label: `tempo ${before.bpm !== null ? `${formatBpm(before.bpm)} → ` : ''}${target} bpm`,
			before:
				before.bpm === null
					? 'unknown'
					: `${formatBpm(before.bpm)} bpm${before.from === 'sent' ? ' (last sent by the app)' : ''}`,
			after: `${target} bpm`,
			note:
				target !== input.bpm
					? `The device steps in 2 bpm, so ${formatBpm(input.bpm)} becomes ${target}.`
					: null
		};
	},
	inverse(_input, before) {
		if (before.bpm === null) return null;
		const back = deviceTempo(before.bpm);
		const exact = Math.abs(back - before.bpm) < 0.5;
		return {
			tool: 'set_tempo',
			input: { bpm: back },
			label: exact
				? `tempo back to ${back} bpm`
				: `tempo back to ${back} bpm (nearest to ${formatBpm(before.bpm)})`
		};
	},
	async run(input, ctx) {
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		const target = resolveCc({ param: 'global.tempo' });
		const value = encodeCcValue(target, input.bpm);
		const bpm = ccToTempo(value);
		const previous = deviceSnapshot(stack);
		try {
			send(stack, ctx, {
				type: 'controlChange',
				channel: target.channel,
				controller: target.cc,
				value
			});
		} catch (error) {
			return sendError(error);
		}
		return jsonResult(
			{
				sent: `CC${target.cc} = ${value}`,
				tempoBpm: bpm,
				previousBpm: previous.measuredBpm ?? previous.tempoSent,
				note: [
					bpm !== input.bpm
						? `${formatBpm(input.bpm)} BPM is not reachable over CC80; sent ${bpm}.`
						: null,
					previous.clockOut
						? 'The device clock will reflect the new tempo within a couple of beats (device_status).'
						: 'The device sends no clock, so the new tempo cannot be confirmed from here.'
				]
					.filter(Boolean)
					.join(' ')
			},
			`tempo ${bpm} bpm sent`,
			{ applied: true, after: bpm }
		);
	}
});

// ─── select_track ───────────────────────────────────────────────────────────────────────────────

export const selectTrackTool = defineTool({
	name: 'select_track',
	label: 'select track',
	kind: 'ui',
	device: true,
	description:
		'Select a track on the OP-XY (CC102), the way pressing its track key does: 1–8 instrument tracks, 9–16 auxiliary tracks. Changes what the device shows, not the project. The device does not report selections made by hand.',
	input: z.object({ track: z.int().min(1).max(16).describe('Track number') }),
	async run(input, ctx) {
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		const target = resolveCc({ param: 'track.select' });
		const value = encodeCcValue(target, input.track);
		const track = getTrack(input.track);
		try {
			send(stack, ctx, {
				type: 'controlChange',
				channel: target.channel,
				controller: target.cc,
				value
			});
		} catch (error) {
			return sendError(error);
		}
		return jsonResult(
			{
				sent: `CC${target.cc} = ${value}`,
				selected: input.track,
				name: track.name,
				alias: track.alias
			},
			`${track.name} selected`
		);
	}
});

// ─── mute_track ─────────────────────────────────────────────────────────────────────────────────

interface MuteSnapshot {
	readonly muted: boolean | null;
}

export const muteTrackTool = defineTool({
	name: 'mute_track',
	label: 'mute track',
	kind: 'mutate',
	device: true,
	description:
		"Mute or unmute one track on the OP-XY (CC9 on the track's channel). Changes the project, so the user approves it in the app. Mutes stop new notes; tails keep ringing. The device never reports mutes made by hand, so the previous state is known only if this app set it.",
	input: z.object({
		track: z.int().min(1).max(16).describe('Track number'),
		muted: z.boolean().describe('true mutes, false unmutes')
	}),
	snapshot(input, env): MuteSnapshot {
		const muted = env.device?.mirror.mutes[input.track - 1] ?? null;
		return { muted };
	},
	preview(input, before) {
		const name = getTrack(input.track).name;
		return {
			label: `${name} ${input.muted ? 'mute' : 'unmute'}`,
			before: before.muted === null ? 'unknown' : before.muted ? 'muted' : 'unmuted',
			after: input.muted ? 'muted' : 'unmuted'
		};
	},
	inverse(input, before) {
		if (before.muted === input.muted) return null;
		const back = before.muted ?? !input.muted;
		const name = getTrack(input.track).name;
		return {
			tool: 'mute_track',
			input: { track: input.track, muted: back },
			label: `${name} ${back ? 'muted' : 'unmuted'} again`,
			assumed: before.muted === null
		};
	},
	async run(input, ctx) {
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		const target = resolveCc({ track: input.track, param: 'mute' });
		const value = encodeCcValue(target, input.muted);
		try {
			send(stack, ctx, {
				type: 'controlChange',
				channel: target.channel,
				controller: target.cc,
				value
			});
		} catch (error) {
			return sendError(error);
		}
		const name = getTrack(input.track).name;
		return jsonResult(
			{
				sent: `CC${target.cc} = ${value} on channel ${target.channel + 1}`,
				track: input.track,
				muted: input.muted,
				note: 'Sent; the device does not confirm mutes.'
			},
			`${name} ${input.muted ? 'muted' : 'unmuted'}`,
			{ applied: true, after: input.muted }
		);
	}
});

// ─── play_notes ─────────────────────────────────────────────────────────────────────────────────

/** Longest preview, in seconds. */
export const MAX_PREVIEW_SECONDS = 20;

const noteSchema = z
	.union([z.int().min(0).max(127), z.string().min(2).max(4)])
	.describe('A MIDI note number (60 = middle C) or a note name such as "C4" or "F#3" (C4 = 60)');

const stepSchema = z.object({
	notes: z.array(noteSchema).max(8).describe('Notes sounding together; empty for a rest'),
	beats: z.number().min(0.125).max(8).describe('Length of this step in beats'),
	velocity: z.int().min(1).max(127).optional().describe('How hard (default 100)')
});

/** Note numbers of a step; unparseable names are reported. */
function resolveNotes(notes: readonly (number | string)[]): { notes: number[]; invalid: string[] } {
	const out = new Set<number>();
	const invalid: string[] = [];
	for (const note of notes) {
		const value = typeof note === 'number' ? note : parseNoteName(note, 'c4');
		if (value === null) invalid.push(String(note));
		else out.add(value);
	}
	return { notes: [...out], invalid };
}

export const playNotesTool = defineTool({
	name: 'play_notes',
	label: 'play notes',
	kind: 'mutate',
	approval: 'auto',
	device: true,
	description: `Play a short preview on one instrument track of the OP-XY: a note, a chord or a little melody, paced in real time and always ending with note-offs. At most ${MAX_PREVIEW_SECONDS} seconds and 64 steps. On drum tracks (1 and 2 in a fresh project) the drum sounds sit on notes 53–76. Audible only: it records nothing unless the user is recording.`,
	input: z.object({
		track: z.int().min(1).max(8).describe('Instrument track 1–8 (plays on its MIDI channel)'),
		bpm: z
			.number()
			.min(CC80_TEMPO_RANGE.min)
			.max(CC80_TEMPO_RANGE.max)
			.optional()
			.describe('Tempo for the beat lengths (default: the device tempo if known, else 120)'),
		steps: z.array(stepSchema).min(1).max(64).describe('Steps in order')
	}),
	async run(input, ctx) {
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		const snapshot = deviceSnapshot(stack);
		const bpm = input.bpm ?? snapshot.measuredBpm ?? snapshot.tempoSent ?? 120;
		const beatMs = 60_000 / bpm;
		const steps = input.steps.map((step) => ({ ...step, ...resolveNotes(step.notes) }));
		const invalid = steps.flatMap((s) => s.invalid);
		if (invalid.length > 0) {
			return errorResult(
				`Unknown note names: ${invalid.join(', ')}. Use MIDI numbers (60 = middle C) or names like C4, F#3, Bb2.`,
				'bad note names'
			);
		}
		const totalMs = steps.reduce((sum, s) => sum + s.beats * beatMs, 0);
		if (totalMs > MAX_PREVIEW_SECONDS * 1000) {
			return errorResult(
				`That preview would last ${(totalMs / 1000).toFixed(1)} s; the limit is ${MAX_PREVIEW_SECONDS} s. Shorten it or raise the tempo.`,
				'preview too long'
			);
		}
		const channel = input.track - 1;
		const sounding = new Set<number>();
		const noteOff = (note: number) => {
			sounding.delete(note);
			try {
				send(stack, ctx, { type: 'noteOff', channel, note, velocity: 0 });
			} catch {
				// Unplugged mid-preview: nothing left to silence on this device.
			}
		};
		let played = 0;
		try {
			for (const step of steps) {
				const lengthMs = step.beats * beatMs;
				const gateMs =
					step.notes.length > 0 ? Math.max(15, Math.min(lengthMs - 10, lengthMs * 0.9)) : lengthMs;
				for (const note of step.notes) {
					send(stack, ctx, { type: 'noteOn', channel, note, velocity: step.velocity ?? 100 });
					sounding.add(note);
				}
				await sleep(gateMs, ctx.env.timers, ctx.signal);
				for (const note of step.notes) noteOff(note);
				if (lengthMs > gateMs) await sleep(lengthMs - gateMs, ctx.env.timers, ctx.signal);
				played++;
			}
		} catch (error) {
			if (error instanceof DeviceError) return sendError(error);
			throw error;
		} finally {
			for (const note of [...sounding]) noteOff(note);
		}
		const track = getTrack(input.track);
		return jsonResult(
			{
				played,
				steps: steps.length,
				track: input.track,
				bpm: Math.round(bpm * 10) / 10,
				seconds: Math.round(totalMs / 100) / 10
			},
			`played ${played} step${played === 1 ? '' : 's'} on ${track.name}`
		);
	}
});

// ─── panic ──────────────────────────────────────────────────────────────────────────────────────

export const panicTool = defineTool({
	name: 'panic',
	label: 'panic',
	kind: 'mutate',
	approval: 'auto',
	device: true,
	priority: true,
	description:
		'Silence the OP-XY at once: stops any preview in progress, then sends note-offs for every note this app started plus sustain off, all notes off and all sound off on all 16 channels. Always allowed; use it when something keeps sounding.',
	input: z.object({}),
	async run(_input, ctx) {
		ctx.env.abortDeviceWork('panic');
		const stack = connected(ctx.env);
		if (isResult(stack)) return stack;
		try {
			const events = stack.transport.panic({ source: attribution(ctx), cause: ctx.toolCallId });
			return jsonResult({ sentMessages: events.length }, `panic: ${events.length} messages sent`);
		} catch (error) {
			return sendError(error);
		}
	}
});

/** Every device tool. */
export const DEVICE_TOOLS = [
	deviceStatusTool,
	transportTool,
	setTempoTool,
	selectTrackTool,
	muteTrackTool,
	playNotesTool,
	panicTool
];
