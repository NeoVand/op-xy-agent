/**
 * What the strip under the replica shows of what plays: the transport, the tempo, where the
 * playhead is (bar and beat of the scene, in the project's time signature), the song as its scenes
 * (the one playing, the one cued, how far the playing one has got) and each instrument track's
 * mute. Plain data from the simulator's state, so the strip only draws it.
 */
import { lengthSettings, sceneLength } from '$lib/sim/areas/arrange/model';
import { clamp, formatBpm, type SimState } from '$lib/sim/params';

/** One entry of the song. */
export interface SongBlock {
	/** The scene it plays, as the device numbers them (1–99). */
	readonly scene: number;
	readonly playing: boolean;
	/** Taken at the next scene end. */
	readonly cued: boolean;
	/** How far the playing scene has got, 0–1 (null on the others). */
	readonly progress: number | null;
}

export interface NowPlayingView {
	readonly playing: boolean;
	readonly recording: boolean;
	/** "120", "96.5". */
	readonly bpm: string;
	/** Bar and beat of the scene playing: "2.3"; "1.1" while stopped, "0.4" in a count-in. */
	readonly position: string;
	/** The scene playing now (1–99). */
	readonly scene: number;
	/** The song chosen, entry by entry. */
	readonly song: readonly SongBlock[];
	/** A song plays: its blocks can be cued. */
	readonly songPlaying: boolean;
	/** Instrument tracks 1–8: muted or not. */
	readonly muted: readonly boolean[];
}

/** Sixteenths in a beat and beats in a bar, for a time signature ("6/8": eighths, six of them). */
function meter(signature: string): { beat: number; beats: number } {
	const [count, unit] = signature.split('/').map(Number);
	return { beat: unit === 8 ? 2 : 4, beats: count || 4 };
}

/** Bar and beat at `position` sixteenths into a scene. */
export function barBeat(position: number, signature: string): string {
	const { beat, beats } = meter(signature);
	const bar = beat * beats;
	if (position < 0) {
		// a count-in: the bar before the first
		const into = ((position % bar) + bar) % bar;
		return `0.${Math.floor(into / beat) + 1}`;
	}
	return `${Math.floor(position / bar) + 1}.${Math.floor((position % bar) / beat) + 1}`;
}

export function nowPlaying(s: SimState): NowPlayingView {
	const a = s.areas.arrange;
	const t = s.transport;
	const running = a.playing && t.playing;
	const order = a.songs[a.song]?.order ?? [];
	return {
		playing: t.playing,
		recording: t.recording,
		bpm: formatBpm(s.tempo.bpm),
		position: t.playing ? barBeat(t.position, lengthSettings(s).signature) : '1.1',
		scene: a.scene + 1,
		song: order.map((scene, i) => ({
			scene: scene + 1,
			playing: running && i === a.position,
			cued: running && i === a.cue,
			progress:
				running && i === a.position ? clamp(t.position / Math.max(1, sceneLength(s)), 0, 1) : null
		})),
		songPlaying: running,
		muted: s.tracks.map((track) => track.mix.muted)
	};
}
