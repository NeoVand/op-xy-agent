/**
 * OP-XY sample presets from your own recordings: drum kits, the synth sampler and multisampled
 * instruments, written as the device writes them (`patch.json` plus 16-bit, 44.1 kHz WAVs) and
 * zipped for Field Kit or MTP. See docs/research/30-presets-samples.md. Pure: decoding compressed
 * audio in the browser is `src/lib/ui/presets/decode.ts`.
 */
export { buildPreset, zipPreset, safeName, safeStem, drumKeys, DRUM_LAYOUT } from './build';
export type { BuiltPreset, PresetOptions, SampleInput } from './build';
export {
	noteFromName,
	noteName,
	detectNote,
	findLoop,
	prepare,
	resample,
	PRESET_RATE
} from './audio';
export { serializePatch, DRUM_FIRST_KEY, DRUM_KEYS, MAX_ZONES } from './patch';
export type { Patch, PresetKind, LoopMode } from './patch';
export { parseWav, encodeWav } from './wav';
export type { PcmAudio } from './wav';
export { zip, crc32 } from './zip';
export { parseAiff } from './aiff';
export { parsePcm } from './pcm';
export { findOnsets, equalSlices, loopTempo, sliceAudio, snapToZero } from './slice';
export type { LoopTempo, OnsetOptions } from './slice';
export {
	generateKit,
	mutateVoice,
	randomKit,
	renderVoice,
	voiceValue,
	DEFAULT_PITCH,
	KIT_STYLES,
	MAX_DECAY,
	VOICE_RANGES,
	VOICE_TYPES
} from './generate';
export type { KitStyle, Voice, VoiceParam, VoiceType } from './generate';
export {
	GROOVES,
	GROOVE_BPM,
	MELODIES,
	groovePattern,
	melodyPattern,
	partKeys,
	slicePattern
} from './beat';
export type { BeatEvent, BeatPattern, Groove, Melody } from './beat';
export { guessMode, nearestZero, overview, zoneFor, zonesFor } from './bench';
export type { BenchMode, DroppedSound, ModeGuess, Zone } from './bench';
export { DEVICE_LIMITS, megabytes, presetProblems, presetStats, wavBytes } from './limits';
export type { PresetProblem, PresetStats, SoundSize } from './limits';
export { MAX_SECONDS, mono } from './audio';
export {
	DRUM_KINDS,
	TE_LAYOUT,
	TE_SLOT_NAMES,
	classifyDrum,
	drumFeatures,
	kindFromName,
	kindFromSound,
	nameWords,
	placeDrums
} from './classify';
export type { DrumFeatures, DrumGuess, DrumKind, Placeable } from './classify';
export { EDIT_RANGES, MIN_SPAN, audibleSpan, clampEdit, defaultEdit, renderEdit } from './edit';
export type { LoopEdit, RenderOptions, RenderedSound, SoundEdit } from './edit';
export type { DrumPlayMode } from './patch';
