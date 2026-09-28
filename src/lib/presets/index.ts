/**
 * OP-XY sample presets from your own recordings: drum kits, the synth sampler and multisampled
 * instruments, written as the device writes them (`patch.json` plus 16-bit, 44.1 kHz WAVs) and
 * zipped for Field Kit or MTP. See docs/research/30-presets-samples.md.
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
export { decodeAudioFile, parsePcm } from './decode';
