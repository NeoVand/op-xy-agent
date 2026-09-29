/**
 * One call that hears everything in a recording: levels and loudness, silence and dropouts, tone,
 * stereo, onsets, tempo and the timing grid, where each band's hits sit in the beat (the drum
 * picture), key and chords. The result is plain data (numbers, strings and arrays, no typed arrays)
 * so it crosses a worker's `postMessage` and goes into the agent's JSON as it is.
 */
import { ListenError } from './errors';
import {
	chordHints,
	chromagram,
	estimateKey,
	keySpelling,
	respellChord,
	type ChordSpan,
	type KeyEstimate
} from './harmony';
import { levelStats, type LevelStats } from './level';
import { detectOnsets, type OnsetBand } from './onsets';
import { silenceStats, type SilenceStats } from './silence';
import { spectrumStats, type SpectrumStats } from './spectrum';
import { stereoStats, type StereoStats } from './stereo';
import {
	beatGrid,
	beatPositions,
	estimateTempo,
	type BeatPositions,
	type GridStats,
	type TempoEstimate
} from './tempo';

/** Options for {@link analyzeAudio}. */
export interface ListenOptions {
	/** The tempo the sequencer is set to, when known (the virtual OP-XY's, or the device's clock). */
	readonly expectedBpm?: number | null;
}

/** Hits in one band and where they sit in the beat. */
export type BandHits = BeatPositions & { readonly count: number };

/** Timing. */
export interface RhythmStats {
	readonly onsets: number;
	/** Onsets per second. */
	readonly onsetRate: number;
	readonly tempo: TempoEstimate | null;
	/** Onsets on a beat grid (at the set tempo when the rhythm supports it). */
	readonly grid: GridStats | null;
	/** Each band's hits on the grid: low (kicks, bass), mid (snares, most notes), high (hats). */
	readonly drums: Readonly<Record<OnsetBand, BandHits>> | null;
}

/** Key and chords. */
export interface HarmonyStats {
	readonly key: KeyEstimate | null;
	readonly chords: readonly ChordSpan[];
}

/** Everything heard in a recording. */
export interface ListenAnalysis {
	readonly sampleRate: number;
	readonly seconds: number;
	readonly channels: number;
	readonly level: LevelStats;
	readonly silence: SilenceStats;
	/** Null when silent (as are the rest). */
	readonly spectrum: SpectrumStats | null;
	readonly stereo: StereoStats | null;
	readonly rhythm: RhythmStats | null;
	readonly harmony: HarmonyStats | null;
}

/** The set tempo is used for the grid when the rhythm supports it at least this well. */
const GRID_SUPPORT = 0.8;
/** Without it, the heard tempo is, when at least this sure. */
const GRID_CONFIDENCE = 0.3;
/** Chord segments without a beat grid, seconds. */
const CHORD_SECONDS = 0.5;

/**
 * Hears `channels` (one or two of equal length) at `sampleRate`.
 * @throws {ListenError} for no channels, more than two, unequal lengths, a bad rate, or NaNs
 */
export function analyzeAudio(
	channels: readonly ArrayLike<number>[],
	sampleRate: number,
	options: ListenOptions = {}
): ListenAnalysis {
	if (channels.length < 1 || channels.length > 2) {
		throw new ListenError(`expected one or two channels, got ${channels.length}`);
	}
	const n = channels[0].length;
	if (channels.some((c) => c.length !== n)) throw new ListenError('channels differ in length');
	if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) {
		throw new ListenError(`not a usable sample rate: ${sampleRate}`);
	}
	for (const channel of channels) {
		for (let i = 0; i < n; i++) {
			if (!Number.isFinite(channel[i])) throw new ListenError(`sample ${i} is not a number`);
		}
	}
	const level = levelStats(channels, sampleRate);
	const silence = silenceStats(channels, sampleRate);
	const base = { sampleRate, seconds: n / sampleRate, channels: channels.length, level, silence };
	if (silence.silent) {
		return { ...base, spectrum: null, stereo: null, rhythm: null, harmony: null };
	}

	const onsets = detectOnsets(channels, sampleRate);
	const expectedBpm = options.expectedBpm ?? null;
	const tempo = estimateTempo(onsets.pulse, onsets.frameRate, { expectedBpm });
	const gridBpm =
		tempo?.expected && tempo.expected.support >= GRID_SUPPORT
			? tempo.expected.bpm
			: tempo && tempo.confidence >= GRID_CONFIDENCE
				? tempo.bpm
				: null;
	const grid = gridBpm !== null ? beatGrid(onsets.onsets, gridBpm) : null;
	const drums = grid
		? {
				low: beatPositions(onsets.bands.low, grid.bpm, grid.phase),
				mid: beatPositions(onsets.bands.mid, grid.bpm, grid.phase),
				high: beatPositions(onsets.bands.high, grid.bpm, grid.phase)
			}
		: null;

	const chroma = chromagram(channels, sampleRate);
	const chords = grid
		? chordHints(chroma, 60 / grid.bpm, grid.phase)
		: chordHints(chroma, CHORD_SECONDS);

	// chords spelled the way the key is written (F minor's Db, not C#)
	const key = estimateKey(chroma.total);
	const names = key ? keySpelling(key.pitchClass, key.mode) : null;
	const spelled = names
		? chords.map((c) => ({ ...c, chord: respellChord(c.chord, names) }))
		: chords;
	return {
		...base,
		spectrum: spectrumStats(channels, sampleRate),
		stereo: stereoStats(channels, sampleRate),
		rhythm: {
			onsets: onsets.onsets.length,
			onsetRate: onsets.onsets.length / Math.max(1e-9, n / sampleRate),
			tempo,
			grid,
			drums
		},
		harmony: { key, chords: spelled }
	};
}
