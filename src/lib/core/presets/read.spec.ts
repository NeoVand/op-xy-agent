import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPreset, zipPreset, type SampleInput } from './build';
import { defaultEdit, type SoundEdit } from './edit';
import {
	drumRegion,
	patch,
	samplerRegion,
	serializePatch,
	type DrumRegion,
	type SamplerRegion
} from './patch';
import { PresetReadError, readPreset, unzip, type Inflate, type PresetFile } from './read';
import { encodeWav, type PcmAudio } from './wav';
import { crc32, zip } from './zip';

const SR = 44100;
const inflate: Inflate = async (raw) => new Uint8Array(inflateRawSync(raw));
const text = (s: string) => new TextEncoder().encode(s);
const frames = (seconds: number) => Math.round(seconds * SR);

/** A decaying sine: a kick, or a plucked note. */
const hit = (hz: number, seconds: number, decay: number) =>
	Float32Array.from(
		{ length: frames(seconds) },
		(_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / SR) * Math.exp((-decay * i) / SR)
	);

/** Decaying noise from a seed (a snare, a hat), the same on every run. */
function noise(seconds: number, decay: number, seed: number): Float32Array {
	let s = seed;
	return Float32Array.from({ length: frames(seconds) }, (_, i) => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return (s / 2 ** 31 - 1) * 0.5 * Math.exp((-decay * i) / SR);
	});
}

/** A steady tone with two harmonics: a sustained note that loops. */
const tone = (hz: number, seconds: number) =>
	Float32Array.from({ length: frames(seconds) }, (_, i) => {
		const w = (2 * Math.PI * hz * i) / SR;
		return 0.4 * Math.sin(w) + 0.1 * Math.sin(2 * w) + 0.05 * Math.sin(3 * w);
	});

const audio = (...channels: Float32Array[]): PcmAudio => ({ sampleRate: SR, channels });
const wav = (...channels: Float32Array[]) => encodeWav(audio(...channels));

/** A mono 16-bit AIFF: COMM (the rate as an 80-bit float), then SSND. */
function aiff(samples: Float32Array): Uint8Array {
	const bytes = new Uint8Array(54 + samples.length * 2);
	const v = new DataView(bytes.buffer);
	const put = (at: number, s: string) =>
		[...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
	put(0, 'FORM');
	v.setUint32(4, bytes.length - 8);
	put(8, 'AIFF');
	put(12, 'COMM');
	v.setUint32(16, 18);
	v.setUint16(20, 1);
	v.setUint32(22, samples.length);
	v.setUint16(26, 16);
	// 44100 = 1.34… × 2^15: the biased exponent, then the mantissa with its integer bit
	v.setUint16(28, 16383 + 15);
	v.setUint32(30, 44100 * 2 ** 16);
	put(38, 'SSND');
	v.setUint32(42, 8 + samples.length * 2);
	samples.forEach((x, i) => v.setInt16(54 + i * 2, Math.round(x * 32767)));
	return bytes;
}

interface HandEntry {
	readonly path: string;
	readonly bytes: Uint8Array;
	/** 0 stored (default), 8 deflated, anything else written stored under that number. */
	readonly method?: number;
	readonly flags?: number;
	/** The CRC and sizes after the data (flag bit 3), 0 in the local header, as streamers write. */
	readonly descriptor?: boolean;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** A zip written by hand, entry by entry, with a comment after its end record. */
function handZip(entries: readonly HandEntry[], comment = ''): Uint8Array {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const e of entries) {
		const name = text(e.path);
		const method = e.method ?? 0;
		const data = method === 8 ? new Uint8Array(deflateRawSync(e.bytes)) : e.bytes;
		const crc = crc32(e.bytes);
		const flags = (e.flags ?? 0) | (e.descriptor ? 8 : 0);
		const local = new Uint8Array(30 + name.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true);
		lv.setUint16(6, flags, true);
		lv.setUint16(8, method, true);
		if (!e.descriptor) {
			lv.setUint32(14, crc, true);
			lv.setUint32(18, data.length, true);
			lv.setUint32(22, e.bytes.length, true);
		}
		lv.setUint16(26, name.length, true);
		local.set(name, 30);
		parts.push(local, data);
		const at = offset;
		offset += local.length + data.length;
		if (e.descriptor) {
			const d = new Uint8Array(16);
			const dv = new DataView(d.buffer);
			dv.setUint32(0, 0x08074b50, true);
			dv.setUint32(4, crc, true);
			dv.setUint32(8, data.length, true);
			dv.setUint32(12, e.bytes.length, true);
			parts.push(d);
			offset += d.length;
		}
		const c = new Uint8Array(46 + name.length);
		const cv = new DataView(c.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true);
		cv.setUint16(6, 20, true);
		cv.setUint16(8, flags, true);
		cv.setUint16(10, method, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, e.bytes.length, true);
		cv.setUint16(28, name.length, true);
		cv.setUint32(42, at, true);
		c.set(name, 46);
		central.push(c);
	}
	const note = text(comment);
	const end = new Uint8Array(22 + note.length);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(
		12,
		central.reduce((n, c) => n + c.length, 0),
		true
	);
	ev.setUint32(16, offset, true);
	ev.setUint16(20, note.length, true);
	end.set(note, 22);
	return concat([...parts, ...central, end]);
}

/** What `unzip` made of `bytes`: `opened`, or the error's name and message. */
const unzipped = (bytes: Uint8Array, withInflate?: Inflate) =>
	unzip(bytes, withInflate).then(
		() => 'opened',
		(error: unknown) => String(error)
	);

/** What `readPreset` made of `files`: `opened`, or the error's name and message. */
function opened(files: readonly PresetFile[]): string {
	try {
		readPreset(files);
		return 'opened';
	} catch (error) {
		return String(error);
	}
}

/** A preset folder's files: its patch.json (an object, written as is) and samples. */
const folder = (name: string, json: unknown, samples: Record<string, Uint8Array> = {}) => [
	{
		path: `${name}/patch.json`,
		bytes: text(typeof json === 'string' ? json : JSON.stringify(json))
	},
	...Object.entries(samples).map(([file, bytes]) => ({ path: `${name}/${file}`, bytes }))
];

/** The parts of an edit the round trip keeps. */
const kept = (e: SoundEdit | undefined) =>
	e && {
		gain: e.gain,
		pan: e.pan,
		transpose: e.transpose,
		tune: e.tune,
		reverse: e.reverse,
		playmode: e.playmode,
		loop: e.loop.mode
	};

describe('readPreset: round trips', () => {
	const kick = audio(hit(55, 0.5, 6));
	const snare = audio(noise(0.4, 10, 7), noise(0.4, 10, 11));
	const hat = audio(noise(0.12, 30, 3));
	const kit: SampleInput[] = [
		{
			name: 'Kick 1.wav',
			audio: kick,
			key: 53,
			edit: { ...defaultEdit(kick, 'drum'), gain: -6, pan: -40, playmode: 'gate' }
		},
		{
			name: 'snare.wav',
			audio: snare,
			key: 56,
			edit: {
				...defaultEdit(snare, 'drum'),
				start: 441,
				end: 15000,
				gain: 4,
				pan: 25,
				transpose: -12,
				reverse: true,
				playmode: 'group'
			}
		},
		{
			name: 'hat.wav',
			audio: hat,
			key: 61,
			edit: { ...defaultEdit(hat, 'drum'), fadeIn: 64, transpose: 7, pan: 100, playmode: 'group' }
		}
	];

	for (const crop of [true, false]) {
		it(`brings a drum kit back with its keys and edits (crop: ${crop})`, async () => {
			const built = buildPreset(kit, { kind: 'drum', name: 'Round Trip', crop });
			const back = readPreset(await unzip(zipPreset(built)));
			expect(back.kind).toBe('drum');
			expect(back.name).toBe('round trip');
			expect(back.warnings).toEqual([]);
			expect(back.patch).toEqual(JSON.parse(serializePatch(built.patch)));
			const regions = built.patch.regions as DrumRegion[];
			expect(back.samples.map((s) => s.key)).toEqual([53, 56, 61]);
			for (const [i, s] of back.samples.entries()) {
				const original = kit.find((k) => k.key === s.key)!;
				const o = original.edit!;
				const e = s.edit!;
				expect(s.root).toBeUndefined();
				expect(s.name).toBe(regions[i].sample);
				expect(s.audio.channels).toHaveLength(original.audio.channels.length);
				expect(s.audio.channels[0].length).toBe(regions[i].framecount);
				expect(kept(e)).toEqual(kept(o));
				// fades are in the audio now
				expect([e.fadeIn, e.fadeOut]).toEqual([0, 0]);
				expect([e.start, e.end]).toEqual(crop ? [0, o.end - o.start] : [o.start, o.end]);
				// the sound itself, past the fade in: what was at the region's start is at the edit's
				const at = e.start + 200;
				expect(s.audio.channels[0][at]).toBeCloseTo(original.audio.channels[0][o.start + 200], 3);
			}
			// built again, it is the same preset
			const again = buildPreset(back.samples, { kind: 'drum', name: back.name, crop });
			expect(serializePatch(again.patch)).toBe(serializePatch(built.patch));
		});
	}

	it('brings a multisampler back with its roots, tunes and loops', async () => {
		const low = audio(tone(130.81, 1.5));
		const high = audio(tone(261.63, 1.5));
		const lowEdit = defaultEdit(low, 'multisampler');
		const highEdit = defaultEdit(high, 'multisampler');
		// loops found in the audio
		expect([lowEdit.loop.mode, highEdit.loop.mode]).toEqual(['forever', 'forever']);
		const zones: SampleInput[] = [
			{
				name: 'pad high.wav',
				audio: high,
				root: 60,
				edit: { ...highEdit, tune: 12, loop: { ...highEdit.loop, mode: 'release' } }
			},
			{
				name: 'pad low.wav',
				audio: low,
				root: 48,
				edit: { ...lowEdit, tune: -7, gain: 3, reverse: true }
			}
		];
		const built = buildPreset(zones, { kind: 'multisampler', name: 'pad' });
		const back = readPreset(await unzip(zipPreset(built)));
		expect(back.kind).toBe('multisampler');
		expect(back.name).toBe('pad');
		expect(back.warnings).toEqual([]);
		expect(back.samples.map((s) => s.root)).toEqual([48, 60]);
		expect(back.samples.map((s) => s.name)).toEqual(['c3.wav', 'c4.wav']);
		const regions = built.patch.regions as SamplerRegion[];
		for (const [i, s] of back.samples.entries()) {
			const o = zones.find((z) => z.root === s.root)!.edit!;
			const e = s.edit!;
			expect(s.key).toBeUndefined();
			expect(s.audio.channels[0].length).toBe(regions[i].framecount);
			expect(kept(e)).toEqual(kept(o));
			expect(e.loop).toEqual({
				mode: o.loop.mode,
				start: regions[i]['loop.start'],
				end: regions[i]['loop.end'],
				crossfade: regions[i]['loop.crossfade']
			});
			// the edits start at 0 and keep their rate, so nothing moved
			expect([e.start, e.end, e.loop]).toEqual([o.start, o.end, o.loop]);
		}
		const again = buildPreset(back.samples, { kind: 'multisampler', name: back.name });
		expect(serializePatch(again.patch)).toBe(serializePatch(built.patch));
	});
});

describe('readPreset: regions', () => {
	it('reads the loop from its flags, and keeps a found loop when the region has none', () => {
		const note = tone(220, 1.2);
		const region = (fields: Record<string, unknown>) => ({
			framecount: note.length,
			hikey: 127,
			'pitch.keycenter': 57,
			reverse: false,
			sample: 'a3.wav',
			'sample.end': note.length,
			tune: 0,
			...fields
		});
		const points = { 'loop.start': 20000, 'loop.end': 40000, 'loop.crossfade': 500 };
		const read = (...regions: object[]) =>
			readPreset(folder('keys.preset', { type: 'multisampler', regions }, { 'a3.wav': wav(note) }));
		const loops = read(
			region({ ...points, 'loop.onrelease': true }),
			region(points),
			region({ ...points, 'loop.enabled': false }),
			region({ ...points, 'loop.enabled': false, 'loop.onrelease': true }),
			region({ 'loop.onrelease': true }),
			region({})
		).samples.map((s) => s.edit!.loop);
		expect(loops.map((l) => l.mode)).toEqual([
			'forever',
			'release',
			'off',
			'off',
			'forever',
			'forever'
		]);
		expect(loops[0]).toEqual({ mode: 'forever', start: 20000, end: 40000, crossfade: 500 });
		// no points: the ones the maker finds, as it would for a new sound
		const heard = read(region({})).samples[0];
		const found = defaultEdit(heard.audio, 'multisampler', { trim: false }).loop;
		expect(loops[4]).toEqual(found);
		expect(loops[5]).toEqual(found);
		expect(heard.edit).toMatchObject({ start: 0, end: note.length, fadeIn: 0, fadeOut: 0 });
		expect(heard.root).toBe(57);
		// no sample.end: the region's frame count, never past the file
		const ends = [45000, 99999, undefined].map(
			(framecount) =>
				read(region({ ...points, 'sample.end': undefined, framecount })).samples[0].edit!.end
		);
		expect(ends).toEqual([45000, note.length, note.length]);
		expect(read(region({ sample: 'b3.wav' })).warnings).toEqual([
			'b3.wav is missing: that zone is left out',
			'none of its samples could be opened'
		]);
	});

	it('opens a synth sampler with an AIFF sample, and only its first region', () => {
		const pad = hit(293.66, 1, 1);
		const one = samplerRegion('pad.aif', pad.length, 62, 62, 'off', null);
		const second = samplerRegion('other.wav', 100, 50, 50, 'forever', null);
		const sampler = readPreset(
			folder('pad.preset', patch('sampler', [one, second]), { 'pad.aif': aiff(pad) })
		);
		expect(sampler.kind).toBe('sampler');
		expect(sampler.samples).toHaveLength(1);
		const [s] = sampler.samples;
		expect([s.name, s.root, s.audio.sampleRate, s.audio.channels[0].length]).toEqual([
			'pad.aif',
			62,
			44100,
			pad.length
		]);
		expect(s.edit!.loop).toEqual({
			mode: 'off',
			start: Math.floor(0.2 * pad.length),
			end: Math.floor(0.8 * pad.length),
			crossfade: 0
		});
		expect(sampler.warnings).toEqual(['a synth sampler plays one sample: 1 more is left out']);
		// without a root in the patch the builder finds one in the sample
		const rootless = {
			type: 'sampler',
			regions: [{ ...one, 'pitch.keycenter': undefined }, second, second]
		};
		const found = readPreset(folder('pad.preset', rootless, { 'pad.aif': aiff(pad) }));
		expect(found.samples[0].root).toBeUndefined();
		expect(found.warnings).toEqual([
			'a synth sampler plays one sample: 2 more are left out',
			'pad.aif has no root note in patch.json: it is found from the sample'
		]);
	});

	it('leaves out what it cannot place, clamps what it keeps and says why', () => {
		const kick = hit(60, 0.2, 10);
		const n = kick.length;
		const kit = readPreset(
			folder(
				'odd kit.preset',
				{
					type: 'drum',
					regions: [
						{ ...drumRegion(53, 'kick.wav', n), playmode: 'key', gain: 64, pan: -250 },
						drumRegion(40, 'kick.wav', n),
						{ ...drumRegion(55, 'kick.wav', n + 100), 'sample.start': 1000, 'sample.end': 5000 },
						drumRegion(56, 'snare.wav', n),
						drumRegion(57, 'noise.wav', n),
						{ ...drumRegion(53, 'kick2.wav', n), playmode: 3 },
						{ hikey: 58 },
						'kick.wav',
						{ ...drumRegion(59, 'kick.wav', n), hikey: undefined },
						drumRegion(60, 'empty.wav', 0),
						// the same file again: its warning is not repeated
						drumRegion(61, 'noise.wav', n)
					]
				},
				{
					'kick.wav': wav(kick),
					'kick2.wav': wav(kick),
					'noise.wav': text('not audio'),
					'empty.wav': wav(new Float32Array(0))
				}
			)
		);
		expect(kit.samples.map((s) => [s.name, s.key])).toEqual([
			['kick.wav', 53],
			['kick.wav', 55],
			['kick2.wav', 53]
		]);
		expect(kit.samples[0].edit).toMatchObject({ playmode: 'oneshot', gain: 20, pan: -100 });
		expect(kit.samples[1].edit).toMatchObject({ start: 1000, end: 5000 });
		expect(kit.samples[2].edit!.playmode).toBe('oneshot');
		// slices of one file share its audio
		expect(kit.samples[1].audio).toBe(kit.samples[0].audio);
		expect(kit.warnings).toEqual([
			"kick.wav is on key 40, outside the kit's 53–76: left out",
			'snare.wav is missing: that key is left empty',
			'noise.wav could not be read as WAV or AIFF: left out',
			'kick2.wav shares key 53 with kick.wav: it moves to a free key',
			'region 7 names no sample: left out',
			'region 8 names no sample: left out',
			'kick.wav has no key: left out',
			'empty.wav holds no audio: left out',
			"patch.json's frame count for kick.wav is wrong: the file is trusted"
		]);
	});

	it('opens a kit with a sample missing, with a warning', () => {
		const kick = hit(50, 0.2, 10);
		const regions = [drumRegion(53, 'kick.wav', kick.length), drumRegion(55, 'snare.wav', 5000)];
		const kit = readPreset(folder('kit.preset', patch('drum', regions), { 'kick.wav': wav(kick) }));
		expect(kit.samples.map((s) => s.key)).toEqual([53]);
		expect(kit.warnings).toEqual(['snare.wav is missing: that key is left empty']);
		const none = readPreset(folder('kit.preset', patch('drum', regions)));
		expect(none.samples).toEqual([]);
		expect(none.warnings.at(-1)).toBe('none of its samples could be opened');
		expect(readPreset(folder('kit.preset', patch('drum', []))).warnings).toEqual([
			'the preset holds no samples'
		]);
	});

	it('names every file whose frame count is wrong, once', () => {
		const names = ['a', 'b', 'c', 'd', 'e'].map((s) => `${s}.wav`);
		const regions = names.map((file, i) => drumRegion(53 + i, file, 99));
		const samples = Object.fromEntries(names.map((file) => [file, wav(hit(80, 0.01, 1))]));
		const read = (count: number, from = regions) =>
			readPreset(folder('k.preset', patch('drum', from.slice(0, count)), samples)).warnings;
		// one file on two keys (slices) is named once
		expect(read(2, [regions[0], { ...regions[0], hikey: 60, lokey: 60 }])).toEqual([
			"patch.json's frame count for a.wav is wrong: the file is trusted"
		]);
		expect(read(2)).toEqual([
			"patch.json's frame counts for a.wav and b.wav are wrong: the files are trusted"
		]);
		expect(read(4)).toEqual([
			"patch.json's frame counts for a.wav, b.wav, c.wav and d.wav are wrong: the files are trusted"
		]);
		expect(read(5)).toEqual([
			"patch.json's frame counts for a.wav, b.wav, c.wav and 2 more are wrong: the files are trusted"
		]);
	});
});

describe('readPreset: files', () => {
	it('opens a folder: samples matched exactly, then ignoring case', () => {
		const kick = hit(50, 0.3, 8);
		const snare = noise(0.05, 5, 2);
		const regions = [
			drumRegion(53, 'kick.wav', kick.length),
			drumRegion(54, 'Snare.wav', snare.length)
		];
		const files: PresetFile[] = [
			{ path: 'my kit.preset/patch.json', bytes: text(serializePatch(patch('drum', regions))) },
			{ path: 'my kit.preset/Kick.WAV', bytes: wav(kick) },
			{ path: 'my kit.preset/snare.wav', bytes: wav(noise(0.02, 5, 1)) },
			{ path: 'my kit.preset/Snare.wav', bytes: wav(snare) },
			{ path: 'my kit.preset/._kick.wav', bytes: new Uint8Array(8) },
			{ path: '__MACOSX/my kit.preset/patch.json', bytes: text('{}') }
		];
		const kit = readPreset(files);
		expect(kit.name).toBe('my kit');
		expect(kit.warnings).toEqual([]);
		expect(kit.samples.map((s) => [s.name, s.audio.channels[0].length])).toEqual([
			['Kick.WAV', kick.length],
			['Snare.wav', snare.length]
		]);
	});

	it('names the preset after the folder holding patch.json, at any depth', () => {
		const json = { type: 'drum', regions: [] };
		expect(readPreset(folder('downloads/kits/Drums.PRESET', json)).name).toBe('Drums');
		expect(readPreset([{ path: 'patch.json', bytes: text(JSON.stringify(json)) }]).name).toBe(
			'imported'
		);
		const two = readPreset([...folder('b.preset', json), ...folder('a.preset', json)]);
		expect(two.name).toBe('a');
		expect(two.warnings[0]).toBe('the files hold 2 presets: only "a" is opened');
	});

	it('skips folders and macOS resource forks in a zip', async () => {
		const bytes = zip([
			{ path: 'my kit.preset/', bytes: new Uint8Array(0) },
			{ path: 'my kit.preset/patch.json', bytes: text('{}') },
			{ path: '__MACOSX/my kit.preset/._patch.json', bytes: new Uint8Array(8) },
			{ path: 'my kit.preset/._Kick.WAV', bytes: new Uint8Array(8) },
			{ path: 'my kit.preset\\Kick.WAV', bytes: text('RIFF') }
		]);
		expect((await unzip(bytes)).map((f) => f.path)).toEqual([
			'my kit.preset/patch.json',
			'my kit.preset/Kick.WAV'
		]);
	});

	it('inflates a deflated zip (sizes after the data, a comment at the end)', async () => {
		const kick = hit(45, 0.25, 10);
		const json = text(serializePatch(patch('drum', [drumRegion(60, 'kick.wav', kick.length)])));
		const bytes = handZip(
			[
				{ path: 'Deep Kit.preset/', bytes: new Uint8Array(0) },
				{ path: 'Deep Kit.preset/patch.json', bytes: json, method: 8, descriptor: true },
				{ path: 'Deep Kit.preset/kick.wav', bytes: wav(kick), method: 8, descriptor: true },
				{ path: '__MACOSX/Deep Kit.preset/._kick.wav', bytes: new Uint8Array(64), method: 8 }
			],
			'zipped by hand'
		);
		const files = await unzip(bytes, inflate);
		expect(files.map((f) => f.path)).toEqual([
			'Deep Kit.preset/patch.json',
			'Deep Kit.preset/kick.wav'
		]);
		expect(files[0].bytes).toEqual(json);
		const kit = readPreset(files);
		expect([kit.name, kit.samples[0].key, kit.samples[0].audio.channels[0].length]).toEqual([
			'Deep Kit',
			60,
			kick.length
		]);
		// without an inflater a deflated entry cannot be opened
		await expect(unzip(bytes)).rejects.toThrow(PresetReadError);
		expect(await unzipped(bytes)).toBe(
			'PresetReadError: Deep Kit.preset/patch.json is deflated, and nothing was given to inflate it'
		);
	});
});

describe('errors', () => {
	it('refuses a damaged file: its CRC-32 does not match', async () => {
		const built = buildPreset([{ name: 'kick.wav', audio: audio(hit(50, 0.1, 20)) }], {
			kind: 'drum',
			name: 'crc'
		});
		const bytes = zipPreset(built);
		expect(await unzipped(bytes)).toBe('opened');
		const damaged = bytes.slice();
		// the last byte before the central directory: the WAV's last sample
		damaged[new DataView(damaged.buffer).getUint32(damaged.length - 6, true) - 1] ^= 0xff;
		expect(await unzipped(damaged)).toBe(
			'PresetReadError: crc.preset/kick.wav is damaged: its CRC-32 does not match'
		);
	});

	it('refuses zips it cannot read', async () => {
		const good = handZip([{ path: 'a.preset/patch.json', bytes: text('{}') }]);
		expect(await unzipped(good)).toBe('opened');
		// the end record and the one directory entry
		const end = good.length - 22;
		const cd = new DataView(good.buffer).getUint32(end + 16, true);
		const edited = (at: number, value: number, width: 2 | 4 = 4) => {
			const copy = good.slice();
			const view = new DataView(copy.buffer);
			if (width === 2) view.setUint16(at, value, true);
			else view.setUint32(at, value, true);
			return copy;
		};
		const broken = handZip([{ path: 'a/x', bytes: text('hello hello hello'), method: 8 }]);
		// a reserved block type
		broken[30 + 'a/x'.length] = 0xff;
		const cases: [Uint8Array, string][] = [
			[text('not a zip at all, only text'), 'this is not a zip archive'],
			[new Uint8Array(0), 'this is not a zip archive'],
			[
				handZip([{ path: 'a/x', bytes: text('x'), flags: 1 }]),
				'a/x is encrypted: zip it again without a password'
			],
			[
				handZip([{ path: 'a/x', bytes: text('x'), method: 12 }]),
				'a/x is compressed with method 12, which is not supported'
			],
			// the entry count, then an entry's size, saturated: the real ones are in zip64 records
			[edited(end + 10, 0xffff, 2), 'zip64 archives are not supported'],
			[edited(cd + 20, 0xffffffff), 'zip64 archives are not supported'],
			[edited(end + 4, 1, 2), 'split zip archives are not supported'],
			// the directory past the end record, then not where it says
			[edited(end + 16, 5000), 'the zip archive is damaged'],
			[edited(end + 16, 0), 'the zip archive is damaged'],
			// the entry's local header not where it says, then its data running past the end
			[edited(cd + 42, 1), 'the zip archive is damaged'],
			[edited(cd + 20, 100000), 'the zip archive is damaged'],
			// its size wrong
			[edited(cd + 24, 3), 'a.preset/patch.json is damaged: its CRC-32 does not match'],
			[broken, 'a/x is damaged: it does not inflate']
		];
		for (const [bytes, message] of cases) {
			expect(await unzipped(bytes, inflate)).toBe(`PresetReadError: ${message}`);
		}
	});

	it('refuses files that are not a sample preset', () => {
		const wavetable = { type: 'wavetable', regions: [], engine: { params: [] } };
		const cases: [PresetFile[], string][] = [
			[
				[{ path: 'kit/kick.wav', bytes: wav(hit(50, 0.1, 5)) }],
				'there is no patch.json: this is not an OP-XY preset'
			],
			[folder('x.preset', '{"type": "drum",'), 'patch.json is not valid JSON'],
			[folder('x.preset', [1, 2]), 'patch.json does not hold a preset'],
			[
				folder('x.preset', wavetable),
				'"x" is a synth preset (wavetable): it has no samples to edit'
			],
			[
				folder('x.preset', { type: 'drumkit', regions: [{}] }),
				'"x" is not a drum kit, sampler or multisampler (its type is drumkit)'
			],
			[
				folder('x.preset', { regions: [] }),
				'"x" is not a drum kit, sampler or multisampler (its type is missing)'
			],
			[folder('x.preset', { type: 'drum' }), 'patch.json has no regions']
		];
		for (const [files, message] of cases) expect(opened(files)).toBe(`PresetReadError: ${message}`);
		expect(() => readPreset(folder('x.preset', wavetable))).toThrow(PresetReadError);
	});
});
