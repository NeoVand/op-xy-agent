/**
 * AIFF and AIFF-C in for OP-XY presets (docs/research/30-presets-samples.md §3): the device plays
 * both, but browsers other than Safari cannot decode AIFF, so it is read here. PCM of 8 to 32 bits
 * (big-endian, or little-endian `sowt`) and 32/64-bit float, with the `INST` chunk's base note as
 * the root (note 30 §3.4: `smpl`, then `INST`, then a note in the file name).
 */
import type { PcmAudio } from './wav';

const ascii = (b: Uint8Array, at: number, n: number) =>
	String.fromCharCode(...b.subarray(at, at + n));

/** An 80-bit IEEE 754 extended float (big-endian), as AIFF stores its sample rate. */
function extended(view: DataView, at: number): number {
	const exponent = view.getUint16(at) & 0x7fff;
	const sign = view.getUint16(at) & 0x8000 ? -1 : 1;
	const mantissa = view.getUint32(at + 2) * 2 ** 32 + view.getUint32(at + 6);
	if (exponent === 0 && mantissa === 0) return 0;
	return sign * mantissa * 2 ** (exponent - 16383 - 63);
}

/** Reads an AIFF or AIFF-C file; throws on anything else or on compressed audio. */
export function parseAiff(bytes: Uint8Array): PcmAudio {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const form = bytes.length >= 12 ? ascii(bytes, 8, 4) : '';
	if (ascii(bytes, 0, 4) !== 'FORM' || (form !== 'AIFF' && form !== 'AIFC')) {
		throw new Error('not an AIFF file');
	}
	let channels = 0;
	let frames = 0;
	let bits = 0;
	let sampleRate = 0;
	let compression = 'NONE';
	let data: Uint8Array | null = null;
	let root: number | undefined;
	for (let at = 12; at + 8 <= bytes.length;) {
		const id = ascii(bytes, at, 4);
		const size = view.getUint32(at + 4);
		const body = at + 8;
		if (id === 'COMM' && size >= 18) {
			channels = view.getUint16(body);
			frames = view.getUint32(body + 2);
			bits = view.getUint16(body + 6);
			sampleRate = extended(view, body + 8);
			if (form === 'AIFC' && size >= 22) compression = ascii(bytes, body + 18, 4);
		} else if (id === 'SSND' && size >= 8) {
			const offset = view.getUint32(body);
			data = bytes.subarray(body + 8 + offset, Math.min(bytes.length, body + size));
		} else if (id === 'INST' && size >= 1) {
			const note = view.getInt8(body);
			if (note >= 0) root = note;
		}
		at = body + size + (size % 2);
	}
	if (!data || channels < 1 || sampleRate <= 0) throw new Error('AIFF file without audio');
	const float = compression === 'fl32' || compression === 'FL32' || compression === 'fl64';
	const little = compression === 'sowt';
	if (!(float || little || compression === 'NONE')) {
		throw new Error(`compressed AIFF (${compression}) is not supported`);
	}
	const width = compression === 'fl64' ? 8 : float ? 4 : Math.ceil(bits / 8);
	if (!float && (width < 1 || width > 4)) throw new Error(`unsupported AIFF at ${bits} bits`);
	const stride = width * channels;
	const count = Math.min(frames, Math.floor(data.length / stride));
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	// keep at most two channels: the OP-XY plays mono and stereo
	const kept = Math.min(2, channels);
	const out = Array.from({ length: kept }, () => new Float32Array(count));
	for (let f = 0; f < count; f++) {
		for (let c = 0; c < kept; c++) {
			const at = f * stride + c * width;
			let v: number;
			if (compression === 'fl64') v = dv.getFloat64(at);
			else if (float) v = dv.getFloat32(at);
			else {
				// signed integer of `width` bytes, most significant first unless `sowt`
				let x = 0;
				for (let b = 0; b < width; b++) {
					const byte = dv.getUint8(little ? at + width - 1 - b : at + b);
					x = x * 256 + byte;
				}
				const full = 2 ** (8 * width);
				if (x >= full / 2) x -= full;
				v = x / (full / 2);
			}
			out[c][f] = v;
		}
	}
	return { sampleRate, channels: out, root };
}
