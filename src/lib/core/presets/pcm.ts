/** WAV or AIFF bytes into audio, told apart by their header (`RIFF` or `FORM`). */
import { parseAiff } from './aiff';
import { parseWav, type PcmAudio } from './wav';

/** Reads WAV or AIFF bytes; null for anything else or a variant neither parser takes. */
export function parsePcm(bytes: Uint8Array): PcmAudio | null {
	const magic = String.fromCharCode(...bytes.subarray(0, 4));
	try {
		if (magic === 'RIFF') return parseWav(bytes);
		if (magic === 'FORM') return parseAiff(bytes);
	} catch {
		// an unusual WAV or AIFF: the caller can let the browser try
	}
	return null;
}
