import { describe, expect, it } from 'vitest';
import {
	buildPreset,
	crc32,
	detectNote,
	encodeWav,
	findLoop,
	noteFromName,
	noteName,
	parseAiff,
	parsePcm,
	parseWav,
	prepare,
	resample,
	safeName,
	safeStem,
	serializePatch,
	zip,
	type PcmAudio
} from './index';

const SR = 44100;

const sine = (hz: number, seconds: number, sr = SR, amp = 0.5) =>
	Float32Array.from(
		{ length: Math.round(seconds * sr) },
		(_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr)
	);

/** A decaying tone with some harmonics, like a plucked note. */
const tone = (hz: number, seconds: number): Float32Array =>
	Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => {
		const t = i / SR;
		const w = 2 * Math.PI * hz * t;
		return 0.5 * (Math.sin(w) + 0.3 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w)) * Math.exp(-t * 0.3);
	});

const audio = (...channels: Float32Array[]): PcmAudio => ({ sampleRate: SR, channels });

/** The entries of a stored zip, read back from its central directory. */
function unzip(bytes: Uint8Array): { path: string; bytes: Uint8Array; crc: number }[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = bytes.length - 22;
	expect(view.getUint32(end, true)).toBe(0x06054b50);
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const out = [];
	for (let i = 0; i < count; i++) {
		expect(view.getUint32(at, true)).toBe(0x02014b50);
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const local = view.getUint32(at + 42, true);
		const path = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
		expect(view.getUint32(local, true)).toBe(0x04034b50);
		const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		out.push({ path, bytes: bytes.subarray(data, data + size), crc });
		at += 46 + nameLength;
	}
	return out;
}

/**
 * An AIFF (or AIFF-C) file: COMM with the rate as an 80-bit float, INST with the base note when
 * given, then SSND. `write` puts one sample; values run 0.25, 0.5 … by channel.
 */
function aiffFile(options: {
	bits: number;
	channels: number;
	rate: number;
	compression?: string;
	root?: number;
	width?: number;
	write: (v: DataView, at: number, x: number) => void;
}): Uint8Array {
	const frames = 4;
	const width = options.width ?? options.bits / 8;
	const aifc = options.compression !== undefined;
	const comm = aifc ? 24 : 18;
	const inst = options.root === undefined ? 0 : 8 + 20;
	const ssnd = 8 + 8 + frames * options.channels * width;
	const bytes = new Uint8Array(12 + 8 + comm + inst + ssnd);
	const v = new DataView(bytes.buffer);
	const put = (at: number, text: string) =>
		[...text].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
	put(0, 'FORM');
	v.setUint32(4, bytes.length - 8);
	put(8, aifc ? 'AIFC' : 'AIFF');
	put(12, 'COMM');
	v.setUint32(16, comm);
	v.setUint16(20, options.channels);
	v.setUint32(22, frames);
	v.setUint16(26, options.bits);
	// the rate as an 80-bit extended float: exponent, then a 64-bit mantissa with its integer bit
	const exponent = Math.floor(Math.log2(options.rate));
	v.setUint16(28, 16383 + exponent);
	v.setUint32(30, options.rate * 2 ** (31 - exponent));
	if (aifc) put(38, options.compression!);
	let at = 20 + comm;
	if (options.root !== undefined) {
		put(at, 'INST');
		v.setUint32(at + 4, 20);
		v.setInt8(at + 8, options.root);
		at += inst;
	}
	put(at, 'SSND');
	v.setUint32(at + 4, ssnd - 8);
	at += 16;
	for (let f = 0; f < frames; f++)
		for (let c = 0; c < options.channels; c++)
			options.write(v, at + (f * options.channels + c) * width, (c + 1) * 0.25);
	return bytes;
}

describe('AIFF', () => {
	it('reads big-endian PCM, the rate from its 80-bit float and the INST base note', () => {
		const bytes = aiffFile({
			bits: 16,
			channels: 2,
			rate: 44100,
			root: 57,
			write: (v, at, x) => v.setInt16(at, Math.round(x * 32767))
		});
		const pcm = parseAiff(bytes);
		expect(pcm.sampleRate).toBe(44100);
		expect(pcm.root).toBe(57);
		expect(pcm.channels).toHaveLength(2);
		expect(pcm.channels[0][3]).toBeCloseTo(0.25, 4);
		expect(pcm.channels[1][3]).toBeCloseTo(0.5, 4);
		expect(parsePcm(bytes)).toEqual(pcm);
	});

	it('reads 24-bit, little-endian sowt and float AIFF-C, and refuses compressed audio', () => {
		const pcm24 = parseAiff(
			aiffFile({
				bits: 24,
				channels: 1,
				rate: 48000,
				write: (v, at, x) => {
					const n = Math.round(-x * 8388607) & 0xffffff;
					v.setUint8(at, n >> 16);
					v.setUint8(at + 1, (n >> 8) & 0xff);
					v.setUint8(at + 2, n & 0xff);
				}
			})
		);
		expect(pcm24.sampleRate).toBe(48000);
		expect(pcm24.root).toBeUndefined();
		expect(pcm24.channels[0][1]).toBeCloseTo(-0.25, 5);
		const sowt = parseAiff(
			aiffFile({
				bits: 16,
				channels: 1,
				rate: 22050,
				compression: 'sowt',
				write: (v, at, x) => v.setInt16(at, Math.round(x * 32767), true)
			})
		);
		expect(sowt.sampleRate).toBe(22050);
		expect(sowt.channels[0][0]).toBeCloseTo(0.25, 4);
		const float = parseAiff(
			aiffFile({
				bits: 32,
				channels: 3,
				rate: 96000,
				compression: 'fl32',
				write: (v, at, x) => v.setFloat32(at, x)
			})
		);
		expect(float.channels).toHaveLength(2);
		expect(float.channels[1][2]).toBeCloseTo(0.5, 6);
		const packed = aiffFile({
			bits: 16,
			channels: 1,
			rate: 44100,
			compression: 'ima4',
			write: () => {}
		});
		expect(() => parseAiff(packed)).toThrow(/ima4/);
		expect(parsePcm(packed)).toBeNull();
		expect(parsePcm(new TextEncoder().encode('ID3 not a wav'))).toBeNull();
	});
});

describe('WAV', () => {
	it('writes what the device writes: fmt 16, smpl 36 with the root, data — an 88-byte header', () => {
		const wav = encodeWav({ sampleRate: SR, channels: [sine(440, 0.1)], root: 60 });
		expect(wav.length - 0.1 * SR * 2).toBe(88);
		const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
		expect([text(0), text(8), text(12), text(36), text(80)]).toEqual([
			'RIFF',
			'WAVE',
			'fmt ',
			'smpl',
			'data'
		]);
		const back = parseWav(wav);
		expect(back.root).toBe(60);
		expect(back.sampleRate).toBe(SR);
		expect(back.channels[0][100]).toBeCloseTo(sine(440, 0.1)[100], 3);
	});

	it('reads 24-bit and float files, keeping two channels at most', () => {
		const frames = 4;
		const make = (
			format: number,
			bits: number,
			channels: number,
			write: (v: DataView, at: number, x: number) => void
		) => {
			const bytes = new Uint8Array(44 + frames * channels * (bits / 8));
			const v = new DataView(bytes.buffer);
			const put = (at: number, s: string) =>
				[...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
			put(0, 'RIFF');
			v.setUint32(4, bytes.length - 8, true);
			put(8, 'WAVE');
			put(12, 'fmt ');
			v.setUint32(16, 16, true);
			v.setUint16(20, format, true);
			v.setUint16(22, channels, true);
			v.setUint32(24, 48000, true);
			v.setUint16(34, bits, true);
			put(36, 'data');
			v.setUint32(40, frames * channels * (bits / 8), true);
			for (let f = 0; f < frames; f++)
				for (let c = 0; c < channels; c++)
					write(v, 44 + (f * channels + c) * (bits / 8), (c + 1) * 0.25);
			return bytes;
		};
		const pcm24 = parseWav(
			make(1, 24, 1, (v, at, x) => {
				const n = Math.round(x * 8388607);
				v.setUint8(at, n & 0xff);
				v.setUint8(at + 1, (n >> 8) & 0xff);
				v.setUint8(at + 2, (n >> 16) & 0xff);
			})
		);
		expect(pcm24.channels[0][2]).toBeCloseTo(0.25, 5);
		const float = parseWav(make(3, 32, 3, (v, at, x) => v.setFloat32(at, x, true)));
		expect(float.channels).toHaveLength(2);
		expect(float.channels[1][0]).toBeCloseTo(0.5, 6);
		expect(float.sampleRate).toBe(48000);
		expect(() => parseWav(new Uint8Array(12))).toThrow();
	});
});

describe('notes in file names (C4 = 60)', () => {
	it('reads the note that stands apart from the words around it', () => {
		expect(noteFromName('piano-c4.wav')).toBe(60);
		expect(noteFromName('Cello_Bb2 mf.wav')).toBe(46);
		expect(noteFromName('pad F#3.aif')).toBe(54);
		expect(noteFromName('strings c3 take2 c4.wav')).toBe(60);
		expect(noteFromName('take1.wav')).toBeNull();
		expect(noteFromName('bass01.wav')).toBeNull();
		expect(noteFromName('kick.wav')).toBeNull();
		expect([60, 54, 21].map(noteName)).toEqual(['c4', 'f#3', 'a0']);
	});
});

describe('preparing samples', () => {
	it('resamples 48 kHz to 44.1 kHz keeping pitch and level', () => {
		const [out] = resample([sine(1000, 0.5, 48000)], 48000, SR);
		expect(out.length).toBe(Math.floor(0.5 * 48000 * (SR / 48000)));
		let crossings = 0;
		for (let i = 2000; i < 20000; i++) if (out[i - 1] < 0 && out[i] >= 0) crossings++;
		expect((crossings * SR) / 18000).toBeCloseTo(1000, -1);
		let peak = 0;
		for (let i = 2000; i < 20000; i++) peak = Math.max(peak, Math.abs(out[i]));
		expect(peak).toBeCloseTo(0.5, 2);
	});

	it('trims silence, cuts at 20 s and normalises to −1 dBFS on request', () => {
		const padded = new Float32Array(SR * 2);
		padded.set(sine(440, 0.5, SR, 0.25), SR / 2);
		const trimmed = prepare(audio(padded));
		expect(trimmed.channels[0].length).toBeLessThan(0.52 * SR);
		expect(trimmed.channels[0].length).toBeGreaterThan(0.49 * SR);
		const long = prepare(audio(sine(440, 21)), { trim: false });
		expect(long.channels[0].length).toBe(20 * SR);
		const loud = prepare(audio(sine(440, 0.5, SR, 0.25)), { normalize: true });
		expect(Math.max(...loud.channels[0])).toBeCloseTo(10 ** (-1 / 20), 2);
	});

	it('hears the note of a sustained tone, and none in noise', () => {
		expect(detectNote(audio(tone(220, 1.5)))).toBe(57);
		expect(detectNote(audio(tone(261.63, 1.5)))).toBe(60);
		let seed = 1;
		const noise = Float32Array.from(
			{ length: SR },
			() => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5
		);
		expect(detectNote(audio(noise))).toBeNull();
	});

	it('finds a loop on rising zero crossings with a matching splice, and none in a short sample', () => {
		const x = tone(110, 3);
		const loop = findLoop(audio(x));
		expect(loop).not.toBeNull();
		const { start, end, crossfade } = loop!;
		expect(x[start - 1] < 0 && x[start] >= 0).toBe(true);
		expect(x[end - 1] < 0 && x[end] >= 0).toBe(true);
		expect(start).toBeGreaterThan(0.29 * x.length);
		expect(end).toBeGreaterThan(0.85 * x.length);
		expect(crossfade).toBeLessThanOrEqual((end - start) / 3);
		expect(findLoop(audio(tone(110, 0.3)))).toBeNull();
	});

	it('names files the device takes', () => {
		expect(safeName('My Kick (Hard)!!.WAV', 20)).toBe('my kick (hard)');
		expect(safeName('808_snare#2.wav', 20)).toBe('808-snare#2');
		expect(safeName('***', 20)).toBe('untitled');
		expect(safeName('a very long preset name indeed', 12)).toBe('a very long');
		expect(safeName('(draft) kit', 24)).toBe('draft) kit');
		expect(safeStem('My Kick (Hard)!!.WAV')).toBe('my-kick-hard');
		expect(safeStem('808_snare#2.wav')).toBe('808-snare#2');
		expect(safeStem('#1 a very long sample name.wav')).toBe('1-a-very-long-sa');
		expect(safeStem('***.wav')).toBe('sample');
	});

	it('keeps every sample path within what a project holds', () => {
		const long = 'x'.repeat(40);
		const built = buildPreset(
			[
				{ name: `${long} kick.wav`, audio: audio(tone(55, 0.2)) },
				{ name: `${long} kick.wav`, audio: audio(tone(60, 0.2)) }
			],
			{ kind: 'drum', name: 'a very long preset name indeed' }
		);
		expect(built.folder).toBe('a very long preset name.preset');
		const files = built.patch.regions.map((r) => r.sample);
		expect(files).toEqual(['x'.repeat(13) + '.wav', 'x'.repeat(11) + '-2.wav']);
		for (const file of files) {
			// with a folder of up to 7 characters: /fat32/presets/<folder>/<name>.preset/<file>
			expect(`/fat32/presets/1234567/${built.folder}/${file}`.length).toBeLessThanOrEqual(71);
		}
	});
});

describe('building presets', () => {
	it('lays a drum kit out as TE’s factory kits: kick on 53, snare on 55, hats on 61 and 63', () => {
		const built = buildPreset(
			[
				{ name: 'Snare Tight.wav', audio: audio(tone(200, 0.3)) },
				{ name: 'Kick 1.wav', audio: audio(tone(55, 0.4)) },
				{ name: 'hat.wav', audio: audio(tone(8000, 0.1)) },
				{ name: 'open hat.wav', audio: audio(tone(7000, 0.3)) },
				{ name: 'weird noise.wav', audio: audio(tone(300, 0.2)) }
			],
			{ kind: 'drum', name: 'My Kit' }
		);
		expect(built.folder).toBe('my kit.preset');
		const keys = Object.fromEntries(built.patch.regions.map((r) => [r.sample, r.hikey]));
		expect(keys).toEqual({
			'kick-1.wav': 53,
			'snare-tight.wav': 55,
			'hat.wav': 61,
			'open-hat.wav': 63,
			'weird-noise.wav': 54
		});
		expect(built.patch.regions.map((r) => r.hikey)).toEqual([53, 54, 55, 61, 63]);
		expect(built.files[0].path).toBe('my kit.preset/patch.json');
		const json = new TextDecoder().decode(built.files[0].bytes);
		expect(json).toBe(serializePatch(built.patch));
		expect(json.startsWith('{"engine":{"bendrange":8191,"highpass":0,"modulation":')).toBe(true);
		// one line, as the device writes it
		expect(json).toBe(JSON.stringify(JSON.parse(json)));
		expect(built.warnings).toEqual([]);
	});

	it('spreads a multisample over the keyboard by root, zones filling down, each looped', () => {
		const built = buildPreset(
			[
				{ name: 'keys-g4.wav', audio: audio(tone(392, 2)) },
				{ name: 'keys-c3.wav', audio: audio(tone(130.81, 2)) },
				{ name: 'keys-c4.wav', audio: audio(tone(261.63, 2)) }
			],
			{ kind: 'multisampler', name: 'keys' }
		);
		const zones = built.patch.regions.map((r) => [r.sample, r['pitch.keycenter'], r.hikey]);
		expect(zones).toEqual([
			['c3.wav', 48, 54],
			['c4.wav', 60, 63],
			['g4.wav', 67, 127]
		]);
		for (const r of built.patch.regions) {
			expect(r).toMatchObject({ 'loop.onrelease': true });
			expect((r as { 'loop.crossfade': number })['loop.crossfade']).toBeGreaterThan(0);
		}
		// every WAV carries its root in smpl, at 44.1 kHz and 16 bits
		const c4 = parseWav(built.files.find((f) => f.path.endsWith('/c4.wav'))!.bytes);
		expect(c4.root).toBe(60);
		expect(c4.sampleRate).toBe(SR);
	});

	it('finds roots in smpl, then names, then the pitch; drops what has none or doubles one', () => {
		const built = buildPreset(
			[
				{ name: 'lead.wav', audio: { ...audio(tone(440, 2)), root: 69 } },
				{ name: 'lead two.wav', audio: audio(tone(220, 2)) },
				{ name: 'noise.wav', audio: audio(new Float32Array(SR)) },
				{ name: 'lead-a4.wav', audio: audio(tone(440, 2)) }
			],
			{ kind: 'multisampler', name: 'lead', loop: 'off' }
		);
		expect(built.patch.regions.map((r) => r['pitch.keycenter'])).toEqual([57, 69]);
		expect(
			built.patch.regions.every(
				(r) => (r as { 'loop.enabled'?: boolean })['loop.enabled'] === false
			)
		).toBe(true);
		expect(built.warnings.some((w) => w.includes('noise.wav'))).toBe(true);
		expect(built.warnings.some((w) => w.includes('lead-a4.wav'))).toBe(true);
	});

	it('plays one sample across the keyboard on the synth sampler', () => {
		const built = buildPreset(
			[
				{ name: 'bass-a1.wav', audio: audio(tone(55, 2)) },
				{ name: 'extra.wav', audio: audio(tone(55, 2)) }
			],
			{ kind: 'sampler', name: 'bass', loop: 'release' }
		);
		expect(built.patch.type).toBe('sampler');
		expect(built.patch.regions).toHaveLength(1);
		expect(built.patch.regions[0]).toMatchObject({ 'pitch.keycenter': 33, hikey: 33 });
		expect(built.patch.regions[0]).not.toHaveProperty('loop.onrelease');
		expect(built.warnings).toHaveLength(1);
	});

	it('zips the folder so it unzips byte for byte', () => {
		const built = buildPreset([{ name: 'kick.wav', audio: audio(tone(55, 0.2)) }], {
			kind: 'drum',
			name: 'k'
		});
		const entries = unzip(zip(built.files));
		expect(entries.map((e) => e.path)).toEqual(['k.preset/patch.json', 'k.preset/kick.wav']);
		for (const [i, e] of entries.entries()) {
			expect(e.bytes).toEqual(built.files[i].bytes);
			expect(e.crc).toBe(crc32(built.files[i].bytes));
		}
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});
});
