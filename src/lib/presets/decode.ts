/**
 * Audio files into the preset builder, in the browser. WAV and AIFF are read directly, so their exact
 * samples and root notes (`smpl`, `INST`) come through, and AIFF works in every browser; anything
 * else the browser can decode (FLAC, MP3, Ogg, …) goes through an OfflineAudioContext at 44.1 kHz,
 * the rate presets are written at anyway.
 */
import { parseAiff } from './aiff';
import { PRESET_RATE } from './audio';
import { parseWav, type PcmAudio } from './wav';

/** Reads WAV or AIFF bytes by their header; null for anything else or a format they can't hold. */
export function parsePcm(bytes: Uint8Array): PcmAudio | null {
	const magic = String.fromCharCode(...bytes.subarray(0, 4));
	try {
		if (magic === 'RIFF') return parseWav(bytes);
		if (magic === 'FORM') return parseAiff(bytes);
	} catch {
		// an unusual WAV or AIFF: let the browser try
	}
	return null;
}

/** Decodes a dropped or picked audio file. */
export async function decodeAudioFile(file: File): Promise<PcmAudio> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const pcm = parsePcm(bytes);
	if (pcm) return pcm;
	const context = new OfflineAudioContext(2, 1, PRESET_RATE);
	const buffer = await context.decodeAudioData(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
	const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) =>
		buffer.getChannelData(c).slice()
	);
	return { sampleRate: buffer.sampleRate, channels };
}
