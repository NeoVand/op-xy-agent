/**
 * Device tools: read the device state, start and stop playback, set the tempo, select and mute
 * tracks, set sound parameters, preview notes, panic. Each one builds typed MIDI messages with core/opxy (CC map, tempo
 * scaling) and sends them through the device layer's transport, the app's single send choke point,
 * with `source: 'agent'` (or `'user'` for undo) and the tool call id as `cause`.
 *
 * Facts they rely on (verified on OS 1.1.33, docs/research/90-device-probe.md): CC80 = BPM / 2
 * (40–220), CC9 is a mute level (0 = unmuted), CC102 selects a track zero-based on channel 1,
 * MIDI start/stop run the transport, the device echoes transport only with COM → clock "both",
 * and it never reports tempo edits, mutes or track selection made by hand.
 *
 * With no OP-XY connected, the live tools act on the virtual OP-XY on screen instead (the replica's
 * simulator, which the browser plays; `env.virtual`), and say so in their result.
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
import { shown } from '$lib/sim/params';
import { DeviceError } from '$lib/device/errors';
import { deviceSnapshot } from '../device-state';
import type { VirtualOpxy } from '../virtual-opxy';
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

function isResult<T extends object>(value: T | ToolResult): value is ToolResult {
	return 'summary' in value;
}

/** Where a live tool acts: the connected OP-XY, else the virtual one on screen. */
type Target = { readonly device: DeviceStack } | { readonly virtual: VirtualOpxy };

function whereTo(env: AgentEnvironment): Target | ToolResult {
	const stack = env.device;
	if (stack && stack.session.phase === 'ready') return { device: stack };
	if (env.virtual) return { virtual: env.virtual };
	return errorResult(NOT_CONNECTED, 'no op-xy connected');
}

/** The virtual OP-XY when no device is connected, else null (for snapshots). */
function virtualTarget(env: AgentEnvironment): VirtualOpxy | null {
	const stack = env.device;
	return stack && stack.session.phase === 'ready' ? null : (env.virtual ?? null);
}

const ON_VIRTUAL =
	'No OP-XY is connected, so this happened on the virtual OP-XY on screen (the browser plays it).';

/** Sends one message through the transport; a refusal becomes a readable error. */
function send(stack: DeviceStack, ctx: ToolContext, message: MidiMessage): void {
	stack.transport.send(message, { source: attribution(ctx), cause: ctx.toolCallId });
}

/** The error message of anything thrown by the transport (policy refusals, unplugged device). */
function sendError(error: unknown): ToolResult {
	const detail = error instanceof Error ? error.message : String(error);
	return errorResult(`The app refused or failed to send this: ${detail}`, 'not sent');
}

/** A tempo as the virtual OP-XY keeps it (tenths, 40–220). */
function virtualTempo(bpm: number): number {
	const clamped = Math.min(CC80_TEMPO_RANGE.max, Math.max(CC80_TEMPO_RANGE.min, bpm));
	return Math.round(clamped * 10) / 10;
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
		'Read what the app knows about the OP-XY right now: whether it is connected, firmware, play state and who reported it, whether the device sends clock (and the measured tempo), and the sent-state cache (tempo, selected track and mutes as this app last sent them; the user may have changed them by hand). Also the virtual OP-XY on screen: tempo, transport, tracks (engine, patterns, notes, mutes), scenes and song, and whether the browser sound is on. Sends nothing.',
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
			virtual: ctx.env.virtual?.status() ?? null,
			notes: [
				'sentState is what this app last sent; the OP-XY never reports tempo edits, mutes or track selection made by hand.',
				s.clockOut
					? 'The device sends clock, so play state and tempo are confirmed by the device.'
					: 'The device sends no clock (com → system settings → midi → clock is not "both"): play state and tempo cannot be confirmed.'
			]
		};
		const summary = s.connected
			? `connected, os ${s.firmware ?? 'unknown'}, ${s.playState}`
			: ctx.env.virtual
				? 'no op-xy connected: the virtual one plays'
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
		'Start or stop the OP-XY sequencer (MIDI start / stop). Changes playback only, never the project. "play" while the device reports it is already playing sends nothing, because start would restart the pattern from the top. With no OP-XY connected it starts or stops the virtual OP-XY on screen (its song from the first scene, when the song has more than one entry).',
	input: z.object({
		action: z.enum(['play', 'stop']).describe('play starts the sequencer, stop stops it')
	}),
	snapshot(_input, env): TransportSnapshot {
		const virtual = virtualTarget(env);
		if (virtual)
			return { playState: virtual.status().playing ? 'playing' : 'stopped', reported: true };
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
		const where = whereTo(ctx.env);
		if (isResult(where)) return where;
		if ('virtual' in where) {
			const virtual = where.virtual;
			if (input.action === 'play' && virtual.status().playing) {
				return jsonResult(
					{ target: 'virtual', playState: 'playing', note: 'Already playing.' },
					'already playing',
					{ applied: false }
				);
			}
			virtual.transport(input.action);
			const playState = virtual.status().playing ? 'playing' : 'stopped';
			return jsonResult(
				{ target: 'virtual', playState, note: ON_VIRTUAL },
				`${playState} on the virtual op-xy`,
				{ applied: true, after: playState }
			);
		}
		const stack = where.device;
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
	readonly from: 'measured' | 'sent' | 'virtual' | null;
}

export const setTempoTool = defineTool({
	name: 'set_tempo',
	label: 'set tempo',
	kind: 'mutate',
	device: true,
	description:
		'Set the project tempo on the OP-XY (CC80). Changes the project (autosave keeps it), so the user approves it in the app. The device steps in 2 BPM: odd tempos round to the nearest even BPM, and the result says which tempo was sent. With no OP-XY connected it sets the virtual OP-XY on screen, to the tenth of a BPM.',
	input: z.object({
		bpm: z.number().min(CC80_TEMPO_RANGE.min).max(CC80_TEMPO_RANGE.max).describe('Tempo in BPM')
	}),
	snapshot(_input, env): TempoSnapshot {
		const virtual = virtualTarget(env);
		if (virtual) return { bpm: virtual.status().bpm, from: 'virtual' };
		const s = deviceSnapshot(env.device);
		if (s.measuredBpm !== null) return { bpm: s.measuredBpm, from: 'measured' };
		if (s.tempoSent !== null) return { bpm: s.tempoSent, from: 'sent' };
		return { bpm: null, from: null };
	},
	preview(input, before) {
		const target = before.from === 'virtual' ? virtualTempo(input.bpm) : deviceTempo(input.bpm);
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
		const back = before.from === 'virtual' ? virtualTempo(before.bpm) : deviceTempo(before.bpm);
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
		const where = whereTo(ctx.env);
		if (isResult(where)) return where;
		if ('virtual' in where) {
			const previous = where.virtual.status().bpm;
			where.virtual.setTempo(input.bpm);
			const bpm = where.virtual.status().bpm;
			return jsonResult(
				{ target: 'virtual', tempoBpm: bpm, previousBpm: previous, note: ON_VIRTUAL },
				`tempo ${formatBpm(bpm)} bpm on the virtual op-xy`,
				{ applied: true, after: bpm }
			);
		}
		const stack = where.device;
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
		'Select a track on the OP-XY (CC102), the way pressing its track key does: 1–8 instrument tracks, 9–16 auxiliary tracks. Changes what the device shows, not the project. The device does not report selections made by hand. With no OP-XY connected it selects the track on the virtual OP-XY on screen.',
	input: z.object({ track: z.int().min(1).max(16).describe('Track number') }),
	async run(input, ctx) {
		const where = whereTo(ctx.env);
		if (isResult(where)) return where;
		if ('virtual' in where) {
			where.virtual.selectTrack(input.track);
			const track = getTrack(input.track);
			return jsonResult(
				{ target: 'virtual', selected: input.track, name: track.name, note: ON_VIRTUAL },
				`${track.name} selected on the virtual op-xy`
			);
		}
		const stack = where.device;
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
		"Mute or unmute one track on the OP-XY (CC9 on the track's channel). Changes the project, so the user approves it in the app. Mutes stop new notes; tails keep ringing. The device never reports mutes made by hand, so the previous state is known only if this app set it. With no OP-XY connected it mutes the track on the virtual OP-XY on screen.",
	input: z.object({
		track: z.int().min(1).max(16).describe('Track number'),
		muted: z.boolean().describe('true mutes, false unmutes')
	}),
	snapshot(input, env): MuteSnapshot {
		const virtual = virtualTarget(env);
		if (virtual) return { muted: virtual.status().tracks[input.track - 1]?.muted ?? null };
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
		const where = whereTo(ctx.env);
		if (isResult(where)) return where;
		if ('virtual' in where) {
			where.virtual.setMuted(input.track, input.muted);
			const name = getTrack(input.track).name;
			return jsonResult(
				{ target: 'virtual', track: input.track, muted: input.muted, note: ON_VIRTUAL },
				`${name} ${input.muted ? 'muted' : 'unmuted'} on the virtual op-xy`,
				{ applied: true, after: input.muted }
			);
		}
		const stack = where.device;
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

// ─── set_sound ──────────────────────────────────────────────────────────────────────────────────

/**
 * The sound parameters `set_sound` may send, by the name the model uses, with their CC-map ids.
 * Only lanes seen answering on the owner's unit on OS 1.1.33 (note 59 §3, probe log session 1):
 * FX II's send (CC39) and the play-mode page (CC28–31) were never tried, so they are left out.
 */
export const SOUND_PARAMS = {
	'engine p1': 'engine.p1',
	'engine p2': 'engine.p2',
	'engine p3': 'engine.p3',
	'engine p4': 'engine.p4',
	'amp attack': 'ampEnv.attack',
	'amp decay': 'ampEnv.decay',
	'amp sustain': 'ampEnv.sustain',
	'amp release': 'ampEnv.release',
	'filter attack': 'filterEnv.attack',
	'filter decay': 'filterEnv.decay',
	'filter sustain': 'filterEnv.sustain',
	'filter release': 'filterEnv.release',
	cutoff: 'filter.cutoff',
	resonance: 'filter.resonance',
	'env amount': 'filter.envAmount',
	'key tracking': 'filter.keyTracking',
	'fx i send': 'send.fx1',
	level: 'level',
	pan: 'pan'
} as const;

type SoundParam = keyof typeof SOUND_PARAMS;
const SOUND_PARAM_NAMES = Object.keys(SOUND_PARAMS) as [SoundParam, ...SoundParam[]];

/** What a 0–99 lane shows for a CC value (the envelope sweeps' law: `shown(cc × 99 / 127)`). */
export function laneShows(cc: number): number {
	return shown((cc * 99) / 127);
}

/** The CC value that makes a 0–99 lane show `value`: the lowest that does, and 127 for 99. */
export function laneCc(value: number): number {
	const want = Math.min(99, Math.max(0, Math.round(value)));
	// 126 shows 99 too, but only 127 turns the lane fully up (a release of 99 stops notes at once)
	if (want === 99) return 127;
	for (let cc = 0; cc <= 127; cc++) if (laneShows(cc) >= want) return cc;
	return 127;
}

/** Pan −100…100 as CC10 (64 = centre). */
const panCc = (pan: number) => Math.min(127, Math.max(0, Math.round(64 + (pan * 64) / 100)));
const ccPan = (cc: number) => Math.max(-100, Math.min(100, Math.round(((cc - 64) * 100) / 64)));

/** A value as `set_sound` takes it back from a CC it sent. */
const fromCc = (param: SoundParam, cc: number) => (param === 'pan' ? ccPan(cc) : laneShows(cc));

interface SoundSnapshot {
	/** The value this app last sent for the parameter; null = never (the device reports none). */
	readonly value: number | null;
}

export const setSoundTool = defineTool({
	name: 'set_sound',
	label: 'set sound',
	kind: 'mutate',
	device: true,
	description:
		"Set one sound parameter of an instrument track on the connected OP-XY over MIDI (its CC on the track's channel): engine p1–p4 (the four M1 values; synth engines only, the samplers ignore them), the amp and filter envelopes, cutoff, resonance, env amount, key tracking, the FX I send, the track's mix level and pan. Values as the screen shows them, 0–99 (pan −100 left … 100 right). Changes the project's sound, so the user approves it. The device never reports parameter values: what it had before is known only if this app set it. Only for a connected OP-XY; for the virtual OP-XY use plan_steps with show, which also shows the keys.",
	input: z.object({
		track: z.int().min(1).max(8).describe('Instrument track 1–8'),
		param: z.enum(SOUND_PARAM_NAMES).describe('Which parameter'),
		value: z.number().min(-100).max(100).describe('As the screen shows it: 0–99; pan −100…100')
	}),
	snapshot(input, env): SoundSnapshot {
		const target = resolveCc({ track: input.track, param: SOUND_PARAMS[input.param] });
		const sent = env.device?.mirror.sentCcs[`${target.channel}:${target.cc}`];
		return { value: sent ? fromCc(input.param, sent.value) : null };
	},
	preview(input, before) {
		const name = getTrack(input.track).name;
		return {
			label: `${name} ${input.param} ${before.value !== null ? `${before.value} → ` : ''}${input.value}`,
			before: before.value === null ? 'unknown' : `${before.value} (last sent by the app)`,
			after: String(input.value)
		};
	},
	inverse(input, before) {
		if (before.value === null || before.value === input.value) return null;
		return {
			tool: 'set_sound',
			input: { track: input.track, param: input.param, value: before.value },
			label: `${getTrack(input.track).name} ${input.param} back to ${before.value}`
		};
	},
	async run(input, ctx) {
		const stack = ctx.env.device;
		if (!stack || stack.session.phase !== 'ready') {
			return errorResult(
				'No OP-XY is connected, so nothing was sent. To set it on the virtual OP-XY, use plan_steps with show.',
				'no op-xy connected'
			);
		}
		const target = resolveCc({ track: input.track, param: SOUND_PARAMS[input.param] });
		const value = input.param === 'pan' ? panCc(input.value) : laneCc(input.value);
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
		const shows = fromCc(input.param, value);
		const name = getTrack(input.track).name;
		return jsonResult(
			{
				sent: `CC${target.cc} = ${value} on channel ${target.channel + 1}`,
				track: input.track,
				param: input.param,
				shows,
				note: [
					input.param.startsWith('engine')
						? 'A sampler engine ignores its M1 CCs; a synth engine shows the new value.'
						: null,
					'The device does not confirm parameter changes; its screen shows the new value if the page is open.'
				]
					.filter(Boolean)
					.join(' ')
			},
			`${name} ${input.param} ${shows}`,
			{ applied: true, after: shows }
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
	description: `Play a short preview on one instrument track of the OP-XY: a note, a chord or a little melody, paced in real time and always ending with note-offs. At most ${MAX_PREVIEW_SECONDS} seconds and 64 steps. On drum tracks (1 and 2 in a fresh project) the drum sounds sit on notes 53–76. Audible only: it records nothing unless the user is recording. With no OP-XY connected the browser plays it with the virtual OP-XY's sound for that track (the app's sound switch must be on).`,
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
		const where = whereTo(ctx.env);
		if (isResult(where)) return where;
		const virtual = 'virtual' in where ? where.virtual : null;
		const stack = 'device' in where ? where.device : null;
		const snapshot = stack ? deviceSnapshot(stack) : null;
		const bpm =
			input.bpm ??
			(virtual ? virtual.status().bpm : (snapshot?.measuredBpm ?? snapshot?.tempoSent ?? 120));
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
		if (virtual) {
			if (input.track > 8) {
				return errorResult('Previews play on instrument tracks 1–8.', 'not an instrument track');
			}
			let played = 0;
			for (const step of steps) {
				const lengthMs = step.beats * beatMs;
				const gateMs = Math.max(15, Math.min(lengthMs - 10, lengthMs * 0.9));
				for (const note of step.notes) {
					if (!virtual.preview(input.track, note, step.velocity ?? 100, gateMs / 1000)) {
						return errorResult(
							"No OP-XY is connected and the app's sound is off, so nothing played. Ask the user to switch on sound under the replica (or connect the OP-XY).",
							'sound is off'
						);
					}
				}
				await sleep(lengthMs, ctx.env.timers, ctx.signal);
				played++;
			}
			return jsonResult(
				{
					target: 'virtual',
					played,
					steps: steps.length,
					track: input.track,
					bpm: Math.round(bpm * 10) / 10,
					seconds: Math.round(totalMs / 100) / 10,
					note: ON_VIRTUAL
				},
				`played ${played} step${played === 1 ? '' : 's'} on the virtual op-xy`
			);
		}
		if (!stack) return errorResult(NOT_CONNECTED, 'no op-xy connected');
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
	setSoundTool,
	playNotesTool,
	panicTool
];
