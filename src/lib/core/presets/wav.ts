/**
 * WAV in and out for OP-XY presets (docs/research/30-presets-samples.md §3). Reading takes PCM of
 * 8, 16, 24 or 32 bits and 32-bit float, plain or WAVE_FORMAT_EXTENSIBLE, and the `smpl` chunk's
 * unity note (the device reads a sample's pitch from it). Writing produces exactly what the device
 * writes: a 16-byte `fmt` (PCM, 16-bit), a 36-byte `smpl` with the root note and no loops, then
 * `data`: an 88-byte header in front of the frames.
 */

/** Audio as the preset builder handles it: float channels (one or two) at a sample rate. */
export interface PcmAudio {
	readonly sampleRate: number;
	readonly channels: readonly Float32Array[];
	/** The `smpl` chunk's MIDI unity note, when the file has one. */
	readonly root?: number;
}

const ascii = (b: Uint8Array, at: number, n: number) =>
	String.fromCharCode(...b.subarray(at, at + n));

/** Reads a WAV file; throws on anything that is not RIFF/WAVE PCM or float. */
export function parseWav(bytes: Uint8Array): PcmAudio {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
		throw new Error('not a WAV file');
	}
	let format = 0;
	let channels = 0;
	let sampleRate = 0;
	let bits = 0;
	let data: Uint8Array | null = null;
	let root: number | undefined;
	for (let at = 12; at + 8 <= bytes.length;) {
		const id = ascii(bytes, at, 4);
		const size = view.getUint32(at + 4, true);
		const body = at + 8;
		if (id === 'fmt ') {
			format = view.getUint16(body, true);
			channels = view.getUint16(body + 2, true);
			sampleRate = view.getUint32(body + 4, true);
			bits = view.getUint16(body + 14, true);
			// WAVE_FORMAT_EXTENSIBLE: the real format is the sub-format GUID's first two bytes
			if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
		} else if (id === 'data') {
			data = bytes.subarray(body, Math.min(bytes.length, body + size));
		} else if (id === 'smpl' && size >= 16) {
			const unity = view.getUint32(body + 12, true);
			if (unity <= 127) root = unity;
		}
		at = body + size + (size % 2);
	}
	if (!data || channels < 1 || sampleRate <= 0) throw new Error('WAV file without audio');
	const float = format === 3;
	if (!(format === 1 || float) || (float && bits !== 32) || ![8, 16, 24, 32].includes(bits)) {
		throw new Error(`unsupported WAV format ${format} at ${bits} bits`);
	}
	const stride = (bits / 8) * channels;
	const frames = Math.floor(data.length / stride);
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	// keep at most two channels: the OP-XY plays mono and stereo
	const kept = Math.min(2, channels);
	const out = Array.from({ length: kept }, () => new Float32Array(frames));
	for (let f = 0; f < frames; f++) {
		for (let c = 0; c < kept; c++) {
			const at = f * stride + (c * bits) / 8;
			let v: number;
			if (float) v = dv.getFloat32(at, true);
			else if (bits === 8) v = (dv.getUint8(at) - 128) / 128;
			else if (bits === 16) v = dv.getInt16(at, true) / 32768;
			else if (bits === 24) {
				const x = dv.getUint8(at) | (dv.getUint8(at + 1) << 8) | (dv.getInt8(at + 2) << 16);
				v = x / 8388608;
			} else v = dv.getInt32(at, true) / 2147483648;
			out[c][f] = v;
		}
	}
	return { sampleRate, channels: out, root };
}

/** Writes 16-bit PCM WAV as the device does, with the root note in `smpl` when given. */
export function encodeWav(audio: PcmAudio): Uint8Array {
	const channels = audio.channels.length;
	const frames = audio.channels[0]?.length ?? 0;
	const dataBytes = frames * channels * 2;
	const smpl = audio.root === undefined ? 0 : 8 + 36;
	const total = 12 + 8 + 16 + smpl + 8 + dataBytes;
	const bytes = new Uint8Array(total);
	const view = new DataView(bytes.buffer);
	const put = (at: number, text: string) => {
		for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
	};
	put(0, 'RIFF');
	view.setUint32(4, total - 8, true);
	put(8, 'WAVE');
	put(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, audio.sampleRate, true);
	view.setUint32(28, audio.sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	let at = 36;
	if (audio.root !== undefined) {
		put(at, 'smpl');
		view.setUint32(at + 4, 36, true);
		// manufacturer, product, sample period, then the unity note; no loops
		view.setUint32(at + 8 + 12, Math.max(0, Math.min(127, Math.round(audio.root))), true);
		at += 44;
	}
	put(at, 'data');
	view.setUint32(at + 4, dataBytes, true);
	at += 8;
	for (let f = 0; f < frames; f++) {
		for (let c = 0; c < channels; c++) {
			const v = Math.max(-1, Math.min(1, audio.channels[c][f]));
			view.setInt16(at, Math.round(v < 0 ? v * 32768 : v * 32767), true);
			at += 2;
		}
	}
	return bytes;
}
