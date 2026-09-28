/**
 * Listening (M9): what a recording of the OP-XY or the replica sounds like, in numbers the agent can
 * critique — loudness after BS.1770, tone against pink noise, stereo, onsets, tempo against the set
 * tempo, the timing grid with swing, where each band's hits sit in the beat, key and chords, silence
 * and dropouts — and a short summary in words. Pure: it takes Float32Array channels at a sample
 * rate, so the browser's capture (`device/listen`) and Node tests feed it alike. Methods, thresholds
 * and their test evidence: docs/research/61-listening.md.
 */
export {
	analyzeAudio,
	type BandHits,
	type HarmonyStats,
	type ListenAnalysis,
	type ListenOptions,
	type RhythmStats
} from './analyze';
export { ListenError } from './errors';
export {
	PITCH_CLASSES,
	chordHints,
	chromagram,
	estimateKey,
	nameChord,
	type ChordSpan,
	type Chromagram,
	type KeyEstimate,
	type PitchClass
} from './harmony';
export {
	ABSOLUTE_GATE,
	DB_FLOOR,
	amplitudeDb,
	kWeighting,
	levelStats,
	loudness,
	powerDb,
	type LevelStats,
	type LoudnessStats
} from './level';
export {
	ONSET_BANDS,
	detectOnsets,
	mono,
	type Onset,
	type OnsetAnalysis,
	type OnsetBand
} from './onsets';
export { SILENCE_DB, silenceStats, type Dropout, type SilenceStats } from './silence';
export {
	BANDS,
	THIRD_OCTAVES,
	spectrumStats,
	welch,
	type BandLevel,
	type BandName,
	type SpectrumStats
} from './spectrum';
export { LOW_END_HZ, stereoStats, type StereoStats } from './stereo';
export {
	FLAG_LIMITS,
	LISTEN_FOCUS,
	flagsOf,
	summarize,
	summarizeTracks,
	type ListenFocus,
	type ListenSummary,
	type SummaryData,
	type SummaryOptions,
	type TrackTake
} from './summary';
export {
	TEMPO_RANGE,
	beatGrid,
	beatPositions,
	estimateTempo,
	tempoRelation,
	type BeatPositions,
	type ExpectedTempo,
	type GridStats,
	type TempoEstimate,
	type TempoRelation
} from './tempo';
