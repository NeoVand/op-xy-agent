/**
 * Listening tools (M9): the agent hears what it made.
 *
 * - `listen` records a few seconds of what plays — the OP-XY's USB audio when it is connected,
 *   else the virtual OP-XY in the browser — and returns what the analysis heard (`core/listen`):
 *   short lines in words, the flags worth acting on, and the numbers. It changes nothing; it needs
 *   the transport to be playing, and says so when it is not. With `scene` (or `tracks`) it renders
 *   that scene of the replica looping, offline (`scene-render`), whole or one track at a time:
 *   nothing has to play, and the song, the transport and the mutes are left alone (an agent once
 *   asked for its beat and heard the song's drumless intro, then the song ending).
 * - `listen_tracks` hears instrument tracks one at a time by muting the others (CC9 on the device,
 *   the simulator's mutes on the virtual OP-XY). Mutes are project state, so the user approves it
 *   first, and every mute is put back exactly as it was afterwards, also when it fails or is
 *   stopped. The OP-XY never reports mutes set by hand, so on a device it runs only when the app
 *   knows all eight instrument tracks' mutes (the user sets them with mute_track first); otherwise
 *   putting them back could undo what the user set.
 *
 * Both skip the API's strict grammar (`strict: false`): their input is validated here all the same,
 * and the grammar has little room left.
 */
import { z } from 'zod';
import {
	FLAG_MEANINGS,
	LISTEN_FOCUS,
	summarize,
	summarizeTracks,
	type ListenAnalysis,
	type ListenSummary,
	type TrackTake
} from '$lib/core/listen';
import { encodeCcValue, getTrack, resolveCc } from '$lib/core/opxy';
import type { DeviceStack } from '$lib/device';
import type { SimState } from '$lib/sim/params';
import { deviceSnapshot } from '../device-state';
import type { ListenFrom, ListenHost } from '../listen-host';
import {
	alone,
	drumsPlay,
	keyNote,
	mixDuckNote,
	renderRequest,
	sceneState,
	tracksPlaying,
	writtenKey
} from '../scene-render';
import type { VirtualOpxy } from '../virtual-opxy';
import {
	defineTool,
	errorResult,
	sleep,
	type AgentEnvironment,
	type ToolContext,
	type ToolResult
} from './define';

/** Seconds `listen` records when not told. */
export const LISTEN_SECONDS = 8;
/** Seconds per track `listen_tracks` records when not told. */
export const TRACK_SECONDS = 4;
/** Seconds of each section `scene: "song"` hears when not told. */
export const SECTION_SECONDS = 4;
/** Sections it hears at most. */
const MAX_SECTIONS = 12;
/**
 * How long the other tracks get to fall silent after a mute, ms: a mute stops new notes, and the
 * tails of the ones sounding ring on (delay and reverb returns keep going too).
 */
export const SETTLE_MS = 800;

const INSTRUMENT_TRACKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Where the tools listen. */
type Target =
	| { readonly kind: 'device'; readonly stack: DeviceStack; readonly host: ListenHost }
	| { readonly kind: 'virtual'; readonly virtual: VirtualOpxy; readonly host: ListenHost };

function isResult(value: object): value is ToolResult {
	return 'summary' in value;
}

const deviceReady = (env: AgentEnvironment) => env.device?.session.phase === 'ready';

/** Where to listen: `from`, else the connected OP-XY, else the virtual one. */
function targetOf(
	env: AgentEnvironment,
	from: 'device' | 'virtual' | undefined
): Target | ToolResult {
	const host = env.listen;
	if (!host) {
		return errorResult(
			'Listening is not available here (this setting has no audio). Carry on without it: read_pattern shows what a pattern holds. Mention it only if the user asked you to listen.',
			'no listening here'
		);
	}
	const want = from ?? (deviceReady(env) ? 'device' : 'virtual');
	if (want === 'device') {
		if (!env.device || !deviceReady(env)) {
			return errorResult(
				'No OP-XY is connected, so there is nothing to hear over USB. Listen to the replica (from: virtual), or ask the user to connect the OP-XY.',
				'no op-xy connected'
			);
		}
		return { kind: 'device', stack: env.device, host };
	}
	if (!env.virtual) {
		return errorResult('There is no replica here to listen to.', 'no virtual op-xy');
	}
	return { kind: 'virtual', virtual: env.virtual, host };
}

/** Why there is nothing to hear yet (sound off, transport stopped), or null. */
function notReady(target: Target, env: AgentEnvironment): ToolResult | null {
	if (target.kind === 'virtual') {
		const status = target.virtual.status();
		if (status.sound === 'unavailable') {
			return errorResult(
				"This browser cannot make the replica's sound, so there is nothing to hear. Carry on without listening (read_pattern shows what a pattern holds); mention it only if the user asked you to listen.",
				'no sound here'
			);
		}
		if (status.sound === 'off') {
			return errorResult(
				deviceReady(env)
					? 'The OP-XY is connected, so the app plays no sound itself. To hear the replica, ask the user to switch on "sound on this computer" under it, then listen again.'
					: "The app's sound is off, so the user hears nothing either: tell them once to switch sound on under the replica. Meanwhile read_pattern shows what a pattern holds.",
				'sound is off'
			);
		}
		if (!status.playing) {
			return errorResult(
				'The replica is stopped, so there is nothing to hear. Start it with transport play (or ask the user to press play), then listen again.',
				'stopped: press play'
			);
		}
		return null;
	}
	const s = deviceSnapshot(target.stack);
	if (s.playState === 'stopped' && (s.playSource === 'device' || s.playSource === 'echo')) {
		return errorResult(
			'The OP-XY reports that it is stopped, so there is nothing to hear. Ask the user to press play (or start it with transport play), then listen again.',
			'stopped: press play'
		);
	}
	return null;
}

/** The tempo the sequencer is set to, when known. */
function setTempo(target: Target): number | null {
	if (target.kind === 'virtual') return target.virtual.status().bpm;
	const s = deviceSnapshot(target.stack);
	return s.measuredBpm ?? s.tempoSent ?? null;
}

const sourceText = (target: Target) =>
	target.kind === 'device' ? 'the OP-XY’s USB audio' : 'the replica';

const recordFrom = (target: Target): ListenFrom =>
	target.kind === 'device' ? 'device' : 'replica';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What the flags raised mean, in a line, or null when none were. */
function flagLegend(flags: readonly string[]): string | null {
	const known = [...new Set(flags)].filter((f) => FLAG_MEANINGS[f]);
	return known.length > 0
		? `flags: ${known.map((f) => `${f} = ${FLAG_MEANINGS[f]}`).join('; ')}`
		: null;
}

/** The replica's scene now (1–99), or null on a device. */
const sceneOf = (target: Target): number | null =>
	target.kind === 'virtual' ? target.virtual.readArrangement().scene : null;

/** What the analysis cannot know and the agent should; `from` is the scene the take started on. */
function notesFor(target: Target, analysis: ListenAnalysis, from: number | null): string[] {
	const notes: string[] = [];
	if (target.kind === 'virtual') {
		const status = target.virtual.status();
		if (status.metronome) {
			notes.push("The replica's metronome is on: its click is in what you heard, on every beat.");
		}
		const state = JSON.parse(target.virtual.checkpoint().state) as SimState;
		const key = keyNote(writtenKey(state), analysis.harmony?.key);
		if (key) notes.push(key);
		const duck = mixDuckNote(state, analysis.pump !== null);
		if (duck) notes.push(duck);
		const arrangement = target.virtual.readArrangement();
		if (from !== null && arrangement.scene !== from) {
			notes.push(
				`The song moved on from scene ${from} to scene ${arrangement.scene} while listening, so the take holds both. To hear one scene, listen with scene.`
			);
		}
		if (!status.playing) {
			const song = arrangement.song;
			notes.push(
				song.order.length > 1 && !song.loop
					? 'The transport stopped while listening: the song came to its end (its loop is off), so the take ends in silence. To hear one scene, listen with scene.'
					: 'The transport stopped while listening (stopped by hand, perhaps), so the take ends in silence.'
			);
		}
	} else {
		const s = deviceSnapshot(target.stack);
		if (analysis.silence.silent && s.playState === 'unknown') {
			notes.push(
				'The OP-XY does not report its transport here (com → clock is not "both"), so it may simply have been stopped.'
			);
		}
		if (s.measuredBpm === null && s.tempoSent === null) {
			notes.push('The OP-XY’s tempo is unknown here, so the tempo was not compared with it.');
		}
	}
	return notes;
}

/** One lowercase line for the chip. */
function chipLine(seconds: number, summary: ListenSummary): string {
	const head = `heard ${Math.round(seconds * 10) / 10} s`;
	if (summary.flags.length > 0) return `${head}: ${summary.flags.join(', ')}`;
	const parts: string[] = [];
	if (summary.data.level.lufs !== null) parts.push(`${summary.data.level.lufs} lufs`);
	if (summary.data.rhythm?.bpm) parts.push(`${summary.data.rhythm.bpm} bpm`);
	return parts.length > 0 ? `${head}: ${parts.join(', ')}` : head;
}

// ─── listen ─────────────────────────────────────────────────────────────────────────────────────

export const listenTool = defineTool({
	name: 'listen',
	label: 'listen',
	kind: 'read',
	strict: false,
	description:
		'Listen to what is playing for a few seconds and get back what it sounds like: loudness (LUFS), peaks and clipping, tone against pink noise, stereo width and a mono low end, tempo compared with the set tempo, timing and swing, where the low, mid and high hits sit in the beat, a key and rough chords, silence and dropouts, and flags worth acting on. Hears the connected OP-XY over its USB audio, else the replica in the browser (from chooses). The transport must be playing: if it is stopped this says so, and nothing is recorded. With scene, it renders that scene of the replica looping instead, offline: nothing needs to play, and the song, the transport and the mutes are left alone (a song playing moves on from scene to scene, so this is how to hear one scene); add tracks to hear instrument tracks one at a time, each alone, without touching any mute; scene "song" hears every section of the song side by side. Changes nothing. Use it to check your own work, then revise and listen again.',
	input: z.object({
		seconds: z
			.number()
			.min(1)
			.max(30)
			.optional()
			.describe(`How long to listen, seconds (default ${LISTEN_SECONDS})`),
		focus: z
			.enum(LISTEN_FOCUS)
			.optional()
			.describe(
				'What to put first: mix (level, tone, stereo), drums, tempo, harmony, tone, or all (default)'
			),
		from: z
			.enum(['device', 'virtual'])
			.optional()
			.describe(
				'device: the connected OP-XY; virtual: the replica in the browser (default: the device when connected; the replica with scene or tracks)'
			),
		scene: z
			// a number written as a string too ("1"): an agent sent one and gave up listening
			.union([z.int().min(1).max(99), z.literal('song'), z.string().regex(/^[1-9][0-9]?$/)])
			.optional()
			.describe(
				`A scene of the replica to hear looping, 1–99, rendered offline: it need not be playing, and the song isn't started. "song": each scene of the song in its order, ${SECTION_SECONDS} s each unless seconds says, side by side (how the sections compare: a break that drops, a hook that lands)`
			),
		tracks: z
			.union([z.literal('each'), z.array(z.int().min(1).max(8)).min(1).max(8)])
			.optional()
			.describe(
				`Instrument tracks to hear one at a time, each alone, in the scene rendered offline (each: every track with notes there; default scene: the one the replica is on), ${TRACK_SECONDS} s each unless seconds says`
			)
	}),
	async run(input, ctx) {
		if (input.scene !== undefined || input.tracks !== undefined) {
			const scene =
				typeof input.scene === 'string' && input.scene !== 'song'
					? Number(input.scene)
					: input.scene;
			return offline({ ...input, scene: scene as number | 'song' | undefined }, ctx);
		}
		const target = targetOf(ctx.env, input.from);
		if (isResult(target)) return target;
		const blocked = notReady(target, ctx.env);
		if (blocked) return blocked;
		const seconds = input.seconds ?? LISTEN_SECONDS;
		const from = sceneOf(target);
		let analysis: ListenAnalysis;
		try {
			const recording = await target.host.record(recordFrom(target), seconds, ctx.signal);
			analysis = await target.host.analyze(recording, { expectedBpm: setTempo(target) });
		} catch (error) {
			if (ctx.signal.aborted) throw error;
			return errorResult(`Nothing was heard: ${message(error)}`, 'could not listen');
		}
		// with no drums playing, timing is not flagged (pitched onsets blur): known on the replica
		const percussive =
			target.kind === 'virtual'
				? target.virtual
						.status()
						.tracks.some((t) => t.track <= 8 && t.engine === 'drum' && t.notes > 0 && !t.muted)
				: undefined;
		const summary = summarize(analysis, {
			focus: input.focus,
			source: sourceText(target),
			...(percussive === undefined ? {} : { percussive })
		});
		const legend = flagLegend(summary.flags);
		const lines = [
			summary.text,
			...notesFor(target, analysis, from).map((n) => `note: ${n}`),
			...(legend ? [legend] : []),
			`numbers: ${JSON.stringify(summary.data)}`
		];
		return { content: lines.join('\n'), summary: chipLine(analysis.seconds, summary) };
	}
});

interface OfflineInput {
	readonly seconds?: number;
	readonly focus?: (typeof LISTEN_FOCUS)[number];
	readonly from?: 'device' | 'virtual';
	readonly scene?: number | 'song';
	readonly tracks?: 'each' | readonly number[];
}

/**
 * listen with `scene: "song"`: each scene of the song, in its order, rendered offline for a few
 * seconds, a line each and how they compare (an agent wanted to know how loud each section was
 * next to the others, and could hear only one scene at a time).
 */
async function sections(
	input: OfflineInput,
	ctx: ToolContext,
	arrangement: ReturnType<VirtualOpxy['readArrangement']>,
	render: NonNullable<ListenHost['render']>
): Promise<ToolResult> {
	const virtual = ctx.env.virtual!;
	const host = ctx.env.listen!;
	const order = arrangement.song.order.length > 0 ? arrangement.song.order : [arrangement.scene];
	const distinct = [...new Set(order)].slice(0, MAX_SECTIONS);
	const where = (scene: number) => {
		const at = order.flatMap((s, i) => (s === scene ? [i + 1] : []));
		return at.length === 1 ? `entry ${at[0]}` : `entries ${at.join(', ')}`;
	};
	const seconds = input.seconds ?? SECTION_SECONDS;
	const base = JSON.parse(virtual.checkpoint().state) as SimState;
	const heard: { scene: number; lufs: number | null; line: string; flags: string[] }[] = [];
	try {
		for (const scene of distinct) {
			const state = sceneState(base, scene);
			const recording = await render(renderRequest(state, seconds), ctx.signal);
			const analysis = await host.analyze(recording, { expectedBpm: state.tempo.bpm });
			const summary = summarize(analysis, { source: `scene ${scene}` });
			const d = summary.data;
			const tone = d.tone?.vsPink
				? Object.entries(d.tone.vsPink)
						.filter(([, v]) => v !== null)
						.map(([band, v]) => `${band} ${v}`)
						.join(', ')
				: null;
			const parts = [
				d.level.lufs !== null ? `${d.level.lufs} LUFS` : 'silent',
				`peak ${d.level.peakDbfs} dBFS`,
				...(tone ? [`vs pink: ${tone}`] : []),
				...(d.rhythm ? [`${d.rhythm.onsets} onsets`] : []),
				...(summary.flags.length > 0 ? [`worth a look: ${summary.flags.join(', ')}`] : [])
			];
			heard.push({
				scene,
				lufs: d.level.lufs,
				line: `scene ${scene} (${where(scene)}): ${parts.join('; ')}`,
				flags: [...summary.flags]
			});
		}
	} catch (error) {
		if (ctx.signal.aborted) throw error;
		return errorResult(`Nothing was heard: ${message(error)}`, 'could not listen');
	}
	// the song's moves from one section to the next, in loudness
	const lufs = new Map(heard.map((h) => [h.scene, h.lufs]));
	const moves: string[] = [];
	for (let i = 1; i < order.length; i++) {
		const [a, b] = [order[i - 1], order[i]];
		const [la, lb] = [lufs.get(a), lufs.get(b)];
		if (a === b || la === undefined || lb === undefined || la === null || lb === null) continue;
		const step = `scene ${a} → ${b}: ${lb - la >= 0 ? '+' : ''}${Math.round((lb - la) * 10) / 10} LU`;
		if (!moves.includes(step)) moves.push(step);
	}
	const audible = heard.filter((h) => h.lufs !== null);
	const loud = [...audible].sort((x, y) => y.lufs! - x.lufs!);
	const legend = flagLegend(heard.flatMap((h) => h.flags));
	return {
		content: [
			`heard ${heard.length} scene${heard.length === 1 ? '' : 's'} of the song, ${seconds} s each, rendered offline (song: ${order.join(' ')})`,
			...heard.map((h) => h.line),
			...(loud.length >= 2
				? [
						`compared: loudest scene ${loud[0].scene}, quietest scene ${loud.at(-1)!.scene}, ${Math.round((loud[0].lufs! - loud.at(-1)!.lufs!) * 10) / 10} LU apart`
					]
				: []),
			...(moves.length > 0 ? [`from one section to the next: ${moves.join('; ')}`] : []),
			...(distinct.length < new Set(order).size
				? [`(the first ${MAX_SECTIONS} scenes of the song only)`]
				: []),
			...(legend ? [legend] : [])
		].join('\n'),
		summary: `heard ${heard.length} section${heard.length === 1 ? '' : 's'} of the song`
	};
}

/**
 * listen with `scene` or `tracks`: a copy of the replica's project looping the scene, rendered
 * offline through its own sound, whole or each track alone (the copy's mutes, never the replica's).
 */
async function offline(input: OfflineInput, ctx: ToolContext): Promise<ToolResult> {
	if (input.from === 'device') {
		return errorResult(
			"scene and tracks render the replica offline; the OP-XY's own audio can only be heard as it plays. Ask the user to play that scene on the OP-XY and listen without them, or leave from out to render the replica's.",
			'offline: replica only'
		);
	}
	const { virtual, listen: host } = ctx.env;
	if (!virtual) return errorResult('There is no replica here to listen to.', 'no virtual op-xy');
	if (!host?.render) {
		return errorResult(
			'Rendering offline is not available here. Listen without scene and tracks while the replica plays the scene (write_arrangement or the user picks it), or read_pattern to see what it holds.',
			'no offline render'
		);
	}
	const render = host.render.bind(host);
	const arrangement = virtual.readArrangement();
	if (input.scene === 'song') {
		if (input.tracks !== undefined) {
			return errorResult(
				'scene "song" hears the sections whole; for tracks alone, name one scene.',
				'song or tracks'
			);
		}
		return sections(input, ctx, arrangement, render);
	}
	const scene = input.scene ?? arrangement.scene;
	const scenes = arrangement.scenes.map((s) => s.scene);
	if (!scenes.includes(scene)) {
		return errorResult(
			`Scene ${scene} is empty: the replica's scenes are ${scenes.join(', ')}.`,
			`scene ${scene} is empty`
		);
	}
	const state = sceneState(JSON.parse(virtual.checkpoint().state) as SimState, scene);
	const expectedBpm = state.tempo.bpm;
	const source = `scene ${scene} of the replica, rendered offline`;
	const notes = virtual.status().metronome
		? [
				"The replica's metronome is on: its click is in what you heard, on every beat (set_metronome off silences it)."
			]
		: [];
	try {
		if (input.tracks === undefined) {
			const seconds = input.seconds ?? LISTEN_SECONDS;
			const recording = await render(renderRequest(state, seconds), ctx.signal);
			const analysis = await host.analyze(recording, { expectedBpm });
			const summary = summarize(analysis, {
				focus: input.focus,
				source,
				percussive: drumsPlay(state)
			});
			const key = keyNote(writtenKey(state), analysis.harmony?.key);
			const duck = mixDuckNote(state, analysis.pump !== null);
			const legend = flagLegend(summary.flags);
			return {
				content: [
					summary.text,
					...[...notes, ...(key ? [key] : []), ...(duck ? [duck] : [])].map((n) => `note: ${n}`),
					...(legend ? [legend] : []),
					`numbers: ${JSON.stringify(summary.data)}`
				].join('\n'),
				summary: chipLine(analysis.seconds, summary).replace(/^heard/, `heard scene ${scene},`)
			};
		}
		const tracks =
			input.tracks === 'each'
				? tracksPlaying(state)
				: [...new Set(input.tracks)].sort((a, b) => a - b);
		if (tracks.length === 0) {
			return errorResult(
				`No instrument track has notes in scene ${scene}, so there is nothing to hear alone.`,
				'nothing to hear'
			);
		}
		const playing = tracksPlaying(state);
		const silent = tracks
			.filter((t) => !playing.includes(t))
			.map((t) => `T${t} has no notes in scene ${scene}, so its take is silence.`);
		const seconds = input.seconds ?? TRACK_SECONDS;
		const takes: TrackTake[] = [];
		for (const track of tracks) {
			const recording = await render(renderRequest(alone(state, track), seconds), ctx.signal);
			const analysis = await host.analyze(recording, { expectedBpm });
			const name = state.tracks[track - 1].engine;
			takes.push({ track, name, percussive: name === 'drum', analysis });
		}
		const summary = summarizeTracks(takes, { source });
		const legend = flagLegend(summary.tracks.flatMap((t) => t.flags));
		return {
			content: [
				summary.text,
				...silent,
				...notes,
				...(legend ? [legend] : []),
				`numbers: ${JSON.stringify(trackNumbers(summary))}`
			].join('\n'),
			summary: `heard ${takes.length} track${takes.length === 1 ? '' : 's'} of scene ${scene} alone`
		};
	} catch (error) {
		if (ctx.signal.aborted) throw error;
		return errorResult(`Nothing was heard: ${message(error)}`, 'could not listen');
	}
}

// ─── listen_tracks ──────────────────────────────────────────────────────────────────────────────

interface TracksSnapshot {
	readonly target: 'device' | 'virtual' | null;
	/** Instrument tracks 1–8: muted, or null where the app cannot know. */
	readonly mutes: readonly (boolean | null)[];
	readonly tracks: readonly number[];
}

/** The mutes of instrument tracks 1–8 as the app knows them. */
function mutesOf(target: Target): (boolean | null)[] {
	if (target.kind === 'virtual') {
		const tracks = target.virtual.status().tracks;
		return INSTRUMENT_TRACKS.map((t) => tracks[t - 1]?.muted ?? null);
	}
	return INSTRUMENT_TRACKS.map((t) => target.stack.mirror.mutes[t - 1] ?? null);
}

/** The tracks to hear: those asked for, else those with notes (virtual) or all eight (device). */
function tracksOf(target: Target, asked: readonly number[] | undefined): number[] {
	if (asked && asked.length > 0) return [...new Set(asked)].sort((a, b) => a - b);
	if (target.kind === 'device') return [...INSTRUMENT_TRACKS];
	const tracks = target.virtual.status().tracks;
	return INSTRUMENT_TRACKS.filter((t) => (tracks[t - 1]?.notes ?? 0) > 0);
}

/** The track's engine (virtual) or its name (device, whose engines the app cannot read). */
function trackName(target: Target, track: number): string {
	if (target.kind === 'virtual') return target.virtual.status().tracks[track - 1]?.engine ?? '';
	return getTrack(track).name;
}

function mutesText(mutes: readonly (boolean | null)[]): string {
	if (mutes.some((m) => m === null)) return 'unknown (the OP-XY does not report mutes)';
	const muted = INSTRUMENT_TRACKS.filter((t) => mutes[t - 1]);
	return muted.length === 0
		? 'no instrument track muted'
		: `muted: ${muted.map((t) => `T${t}`).join(', ')}`;
}

const DEVICE_MUTES_UNKNOWN =
	'The OP-XY never reports mutes set by hand, so the app cannot put them back exactly and did not start. Ask the user which instrument tracks are muted on the device now, set all eight to that with mute_track (they approve it once), then call listen_tracks again: it will put every mute back the way they are.';

/**
 * Heard tracks whose duck listens to another instrument track: alone, that track was muted, so the
 * duck never moved in the take (the episodes: the agent heard no pump and rewrote the bass as a
 * manual one). Only the replica says how its tracks' LFOs are set.
 */
function silencedDucks(target: Target, tracks: readonly number[]): string[] {
	if (target.kind !== 'virtual') return [];
	return ducksIn(JSON.parse(target.virtual.checkpoint().state) as SimState, tracks);
}

/** `silencedDucks` in a project's state. */
function ducksIn(state: SimState, tracks: readonly number[]): string[] {
	return tracks.flatMap((track) => {
		const lfo = state.tracks[track - 1]?.lfo;
		if (lfo?.type !== 'duck' || !lfo.on || lfo.source === track) return [];
		if (!(INSTRUMENT_TRACKS as readonly number[]).includes(lfo.source)) return [];
		return [
			`T${track} ducks from T${lfo.source}, which was muted while T${track} played alone, so the duck did not move in its take; the whole mix (listen) is where to hear it.`
		];
	});
}

/** The numbers worth keeping from each track's take. */
function trackNumbers(summary: ReturnType<typeof summarizeTracks>) {
	return summary.tracks.map((t) => ({
		track: t.track,
		flags: t.flags,
		level: t.data.level,
		tone: t.data.tone,
		rhythm: t.data.rhythm && {
			onsets: t.data.rhythm.onsets,
			tightnessMs: t.data.rhythm.tightnessMs,
			swing: t.data.rhythm.swing
		}
	}));
}

/** Sets one instrument track's mute on the target. */
function setMute(target: Target, track: number, muted: boolean, ctx: ToolContext): void {
	if (target.kind === 'virtual') {
		target.virtual.setMuted(track, muted);
		return;
	}
	const cc = resolveCc({ track, param: 'mute' });
	target.stack.transport.send(
		{
			type: 'controlChange',
			channel: cc.channel,
			controller: cc.cc,
			value: encodeCcValue(cc, muted)
		},
		{ source: 'agent', cause: ctx.toolCallId }
	);
}

export const listenTracksTool = defineTool({
	name: 'listen_tracks',
	label: 'listen to tracks',
	kind: 'mutate',
	approval: 'device',
	device: true,
	strict: false,
	description: `Hear instrument tracks one at a time, each alone: mutes the other instrument tracks, listens (${TRACK_SECONDS} s per track by default), moves on, and afterwards puts every mute back exactly as it was, also if it fails or is stopped. Returns a line per track (loudness, where its energy sits, its hits, key and chords) and how they compare (tracks crowding the same band). The user approves it first, since mutes are project state. On the connected OP-XY (CC9) it runs only when the app knows all eight instrument tracks' mutes, because the device never reports mutes set by hand: if not, set them with mute_track first as the user says they are. The transport must be playing. On the replica, listen with scene and tracks hears the tracks alone offline without touching a mute or asking: prefer it there.`,
	input: z.object({
		tracks: z
			.array(z.int().min(1).max(8))
			.min(1)
			.max(8)
			.optional()
			.describe(
				'Instrument tracks to hear alone, 1–8 (default: those with notes on the replica; all eight on a device)'
			),
		seconds: z
			.number()
			.min(2)
			.max(10)
			.optional()
			.describe(`Seconds per track (default ${TRACK_SECONDS})`),
		from: z
			.enum(['device', 'virtual'])
			.optional()
			.describe('device or virtual (default: the device when connected)')
	}),
	snapshot(input, env): TracksSnapshot {
		const target = targetOf(env, input.from);
		if (isResult(target)) return { target: null, mutes: [], tracks: input.tracks ?? [] };
		return { target: target.kind, mutes: mutesOf(target), tracks: tracksOf(target, input.tracks) };
	},
	preview(input, before) {
		const seconds = input.seconds ?? TRACK_SECONDS;
		const list = before.tracks.map((t) => `T${t}`).join(', ') || 'no tracks';
		const total = Math.round(before.tracks.length * (seconds + SETTLE_MS / 1000));
		return {
			label: `hear ${list} alone, ${seconds} s each`,
			before: before.target ? mutesText(before.mutes) : 'unknown',
			after: 'every mute put back as it was',
			note: `Mutes the other instrument tracks one track at a time (about ${total} s in all)${before.target === 'device' ? ' with CC9 on the OP-XY' : ''}, then puts every mute back.`
		};
	},
	async run(input, ctx) {
		const target = targetOf(ctx.env, input.from);
		if (isResult(target)) return target;
		const blocked = notReady(target, ctx.env);
		if (blocked) return blocked;
		const tracks = tracksOf(target, input.tracks);
		if (tracks.length === 0) {
			return errorResult(
				'No instrument track has notes in the pattern it plays, so there is nothing to hear alone.',
				'nothing to hear'
			);
		}
		const known = mutesOf(target);
		if (known.some((m) => m === null)) return errorResult(DEVICE_MUTES_UNKNOWN, 'mutes unknown');
		const before = known as boolean[];
		const seconds = input.seconds ?? TRACK_SECONDS;
		const expectedBpm = setTempo(target);
		// what is set now, so only changes are sent
		const now = [...before];
		const apply = (want: readonly boolean[]) => {
			INSTRUMENT_TRACKS.forEach((t, i) => {
				if (now[i] === want[i]) return;
				setMute(target, t, want[i], ctx);
				now[i] = want[i];
			});
		};
		const takes: TrackTake[] = [];
		let failure: unknown = null;
		let restored: string | null = null;
		try {
			for (const track of tracks) {
				apply(INSTRUMENT_TRACKS.map((t) => t !== track));
				await sleep(SETTLE_MS, ctx.env.timers, ctx.signal);
				const recording = await target.host.record(recordFrom(target), seconds, ctx.signal);
				const analysis = await target.host.analyze(recording, { expectedBpm });
				const name = trackName(target, track);
				takes.push({ track, name, percussive: name === 'drum', analysis });
			}
		} catch (error) {
			failure = error;
		} finally {
			try {
				apply(before);
			} catch (error) {
				restored = message(error);
			}
		}
		const putBack = restored
			? `Could not put the mutes back (${restored}): tell the user they were ${mutesText(before)}.`
			: 'Every mute was put back as it was.';
		if (failure !== null) {
			return errorResult(
				ctx.signal.aborted
					? `Stopped before it finished. ${putBack}`
					: `Could not finish listening: ${message(failure)} ${putBack}`,
				ctx.signal.aborted ? 'stopped' : 'could not listen'
			);
		}
		const summary = summarizeTracks(takes, { source: sourceText(target) });
		const click =
			target.kind === 'virtual' && target.virtual.status().metronome
				? "The replica's metronome is on: its click is in every take, on every beat."
				: null;
		const numbers = trackNumbers(summary);
		return {
			content: [
				summary.text,
				...(click ? [click] : []),
				...silencedDucks(target, tracks),
				putBack,
				`numbers: ${JSON.stringify(numbers)}`
			].join('\n'),
			summary: restored
				? 'heard the tracks; mutes not put back'
				: `heard ${takes.length} track${takes.length === 1 ? '' : 's'} alone`,
			isError: restored !== null
		};
	}
});

/** Every listening tool. */
export const LISTEN_TOOLS = [listenTool, listenTracksTool];
