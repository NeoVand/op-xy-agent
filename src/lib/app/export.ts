/**
 * What you made, to take elsewhere (the project card's export, the chat's pattern cards):
 * - the song as MIDI: a track per instrument track that plays, its patterns laid along the song's
 *   order, each looping to its scene's length, a track muted in a scene left out there; one pattern
 *   as MIDI, too;
 * - the song as a WAV, rendered offline through the replica's own sound, without the metronome: each
 *   entry of the song from its scene's start, laid end to end, each ringing out into the next (the
 *   offline render does not move from scene to scene itself). A song of one scene plays it four
 *   times.
 * Steps are quantised as written (groove and micro-timing are the device's, not the file's).
 */
import { encodeWav } from '$lib/core/presets/wav';
import { writeMidiFile, type EventAtTick, type TrackInput } from '$lib/core/midi/smf';
import { lengthSettings, sceneLength, selectScene } from '$lib/sim/areas/arrange/model';
import { snapshot } from '$lib/sim/areas/system/projects';
import type { SimState } from '$lib/sim/params';
import type { Pattern } from '$lib/sim/sequencer';

/** Ticks per quarter note in the files written. */
const PPQ = 480;
/** Ticks per sixteenth. */
const SIXTEENTH = PPQ / 4;
/** A song of one scene plays it this many times. */
const ONE_SCENE_PASSES = 4;
/** How long the last scene rings out after the song ends, and each into the next, s. */
const TAIL = 1.5;

/** A copy of the state to work on: selecting scenes on it never touches the replica. */
const copyOf = (s: SimState): SimState => JSON.parse(JSON.stringify(s)) as SimState;

/** The scenes the song plays, in order (0-based), a one-scene song repeated. */
export function songScenes(s: SimState): number[] {
	const a = s.areas.arrange;
	const order = a.songs[a.song]?.order ?? [];
	if (order.length === 0) return Array.from({ length: ONE_SCENE_PASSES }, () => a.scene);
	return order.length === 1 ? Array.from({ length: ONE_SCENE_PASSES }, () => order[0]) : [...order];
}

/** A pattern's notes from `start` (ticks), looped to `sixteenths`. */
function patternEvents(
	p: Pattern,
	channel: number,
	start: number,
	sixteenths: number
): EventAtTick[] {
	const stepTicks = SIXTEENTH * p.scale;
	const loop = p.length * stepTicks;
	const end = start + sixteenths * SIXTEENTH;
	const events: EventAtTick[] = [];
	for (let pass = start; pass < end; pass += loop) {
		for (let i = 0; i < p.length; i++) {
			for (const n of p.steps[i]?.notes ?? []) {
				const on = Math.round(pass + (i + n.offset) * stepTicks);
				if (on < start || on >= end) continue;
				const off = Math.min(end, on + Math.max(1, Math.round(n.length * stepTicks)));
				const velocity = Math.max(1, Math.min(127, Math.round(n.velocity)));
				events.push(
					{ tick: on, event: { type: 'noteOn', channel, note: n.note, velocity } },
					{ tick: off, event: { type: 'noteOff', channel, note: n.note, velocity: 0 } }
				);
			}
		}
	}
	return events;
}

/** A track's name in the file: "T1 drum". */
const trackName = (s: SimState, t: number) => `T${t + 1} ${s.tracks[t].engine}`;

/** The song as a MIDI file (format 1: a conductor track and a track per instrument track). */
export function songMidi(s: SimState): Uint8Array {
	const work = copyOf(s);
	const events: EventAtTick[][] = Array.from({ length: 8 }, () => []);
	let at = 0;
	for (const scene of songScenes(s)) {
		selectScene(work, scene);
		const length = sceneLength(work);
		work.tracks.forEach((track, t) => {
			if (track.mix.muted) return;
			const p = track.sequence.patterns[track.sequence.current];
			if (p) events[t].push(...patternEvents(p, t, at, length));
		});
		at += length * SIXTEENTH;
	}
	const parts: TrackInput[] = events.flatMap((list, t) =>
		list.length > 0 ? [{ name: trackName(s, t), events: list }] : []
	);
	return writeMidiFile(parts, midiOptions(s));
}

/** One pattern of one instrument track (1–8, 1–16) as a MIDI file, once through. */
export function patternMidi(s: SimState, track: number, pattern: number): Uint8Array {
	const p = s.tracks[track - 1]?.sequence.patterns[pattern - 1];
	const events = p ? patternEvents(p, track - 1, 0, p.length * p.scale) : [];
	return writeMidiFile([{ name: trackName(s, track - 1), events }], midiOptions(s));
}

function midiOptions(s: SimState) {
	const [count, unit] = lengthSettings(s).signature.split('/').map(Number);
	return {
		division: PPQ,
		bpm: s.tempo.bpm,
		timeSignature: [count || 4, unit || 4] as const,
		name: s.project.name || 'op-xy'
	};
}

/** Renders what the replica plays from a saved state (`renderOffline` through the app's sound). */
export type RenderScene = (request: {
	readonly project: string;
	readonly transport: SimState['transport'];
	readonly track: number;
	readonly mode: SimState['mode'];
	readonly seconds: number;
	readonly sampleRate: number;
}) => Promise<{ readonly sampleRate: number; readonly channels: Float32Array[] }>;

/** The song as a WAV file: each entry rendered from its scene's start, ringing into the next. */
export async function songWav(
	s: SimState,
	render: RenderScene,
	options: {
		readonly sampleRate?: number;
		readonly onProgress?: (done: number, of: number) => void;
		readonly signal?: AbortSignal;
	} = {}
): Promise<Uint8Array> {
	const sampleRate = options.sampleRate ?? 44_100;
	const secondsPer16th = 60 / s.tempo.bpm / 4;
	const scenes = songScenes(s);
	const work = copyOf(s);
	// the metronome is for playing along, not for the file
	work.tempo.metronome.on = false;
	const pieces: { start: number; channels: Float32Array[] }[] = [];
	let at = 0;
	for (const [i, scene] of scenes.entries()) {
		if (options.signal?.aborted) throw new DOMException('stopped', 'AbortError');
		selectScene(work, scene);
		const seconds = sceneLength(work) * secondsPer16th;
		work.transport = { playing: true, recording: false, position: 0 };
		const audio = await render({
			project: snapshot(work),
			transport: work.transport,
			track: work.track,
			mode: work.mode,
			seconds: seconds + TAIL,
			sampleRate
		});
		pieces.push({ start: Math.round(at * sampleRate), channels: audio.channels });
		at += seconds;
		options.onProgress?.(i + 1, scenes.length);
	}
	const frames = Math.round((at + TAIL) * sampleRate);
	const out = [new Float32Array(frames), new Float32Array(frames)];
	for (const piece of pieces) {
		out.forEach((channel, c) => {
			const source = piece.channels[c] ?? piece.channels[0];
			for (let f = 0; f < source.length && piece.start + f < frames; f++) {
				channel[piece.start + f] += source[f];
			}
		});
	}
	// kept under full scale where the pieces' tails add up
	let peak = 0;
	for (const channel of out) for (const v of channel) peak = Math.max(peak, Math.abs(v));
	if (peak > 0.99)
		for (const channel of out) for (let f = 0; f < frames; f++) channel[f] *= 0.99 / peak;
	return encodeWav({ sampleRate, channels: out });
}

/** Hands bytes to the browser as a download. */
export function saveFile(bytes: Uint8Array, name: string, type: string): void {
	const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from the project's name: "op-xy song.wav". */
export function fileName(s: SimState, what: string, extension: string): string {
	const base = (s.project.name || 'op-xy').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'op-xy';
	return `${base} ${what}.${extension}`;
}
