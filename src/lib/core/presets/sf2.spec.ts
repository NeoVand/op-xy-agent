import { describe, expect, it } from 'vitest';
import { buildPreset } from './build';
import type { DrumRegion, SamplerRegion } from './patch';
import { Sf2Error, parseSoundFont, soundFontSamples } from './sf2';

const SR = 44100;

/** The generator operators the fonts below use (SoundFont 2.01 §8.1.2). */
const G = {
	startAddrsOffset: 0,
	endloopAddrsOffset: 3,
	pan: 17,
	instrument: 41,
	keyRange: 43,
	velRange: 44,
	initialAttenuation: 48,
	coarseTune: 51,
	fineTune: 52,
	sampleID: 53,
	sampleModes: 54,
	scaleTuning: 56,
	exclusiveClass: 57,
	overridingRootKey: 58
} as const;

/** A generator: its operator and 16-bit amount. */
type Gen = readonly [oper: number, amount: number];
/** A range generator's amount: the low byte, then the high one. */
const range = (lo: number, hi = lo) => lo | (hi << 8);
/** A signed amount as its 16 bits. */
const short = (v: number) => v & 0xffff;

/** A sine as 16-bit points. */
const sine = (hz: number, seconds = 1, amp = 0.5) =>
	Int16Array.from({ length: Math.round(seconds * SR) }, (_, i) =>
		Math.round(amp * 32767 * Math.sin((2 * Math.PI * hz * i) / SR))
	);

interface TestSample {
	readonly name: string;
	readonly points: Int16Array;
	readonly pitch: number;
	readonly correction?: number;
	/** Loop points from the sample's start (none: an empty loop at its start). */
	readonly loop?: readonly [number, number];
	/** 1 mono (default), 2 right, 4 left, 0x8001 in ROM. */
	readonly type?: number;
	readonly link?: number;
}

interface TestOwner {
	readonly name: string;
	/** Each zone's generators, in order: an instrument's end with a sample, a preset's with an instrument. */
	readonly zones: readonly (readonly Gen[])[];
}

interface TestPreset extends TestOwner {
	readonly bank: number;
	readonly program: number;
}

interface TestFont {
	readonly samples: readonly TestSample[];
	readonly instruments: readonly TestOwner[];
	readonly presets: readonly TestPreset[];
	/** `ifil` (default 2.1). */
	readonly version?: readonly [number, number];
	/** Write an `sm24` chunk with this low byte for every point. */
	readonly sm24?: number;
}

const bytesOf = (text: string, size = text.length) => {
	const out = new Uint8Array(size);
	for (let i = 0; i < Math.min(text.length, size); i++) out[i] = text.charCodeAt(i);
	return out;
};

const concat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

/** A RIFF chunk: id, size, body and a pad byte after an odd body. */
const chunk = (id: string, body: Uint8Array) => {
	const head = bytesOf(id, 8);
	new DataView(head.buffer).setUint32(4, body.length, true);
	return concat(head, body, new Uint8Array(body.length % 2));
};

const list = (type: string, ...chunks: Uint8Array[]) =>
	chunk('LIST', concat(bytesOf(type), ...chunks));

/** Fixed-size records, each written at its offset. */
function records<T>(
	size: number,
	rows: readonly T[],
	write: (v: DataView, at: number, row: T, index: number) => void
): Uint8Array {
	const out = new Uint8Array(size * rows.length);
	const v = new DataView(out.buffer);
	rows.forEach((row, i) => write(v, i * size, row, i));
	return out;
}

const name20 = (v: DataView, at: number, name: string) =>
	bytesOf(name, 20).forEach((b, i) => v.setUint8(at + i, b));

/** The bags and generators of presets or instruments, terminal records included. */
function hydra(owners: readonly TestOwner[]) {
	const first: number[] = [];
	const bags: number[] = [];
	const gens: Gen[] = [];
	for (const o of owners) {
		first.push(bags.length);
		for (const zone of o.zones) {
			bags.push(gens.length);
			gens.push(...zone);
		}
	}
	first.push(bags.length);
	bags.push(gens.length);
	gens.push([0, 0]);
	return { first, bags, gens };
}

/**
 * A SoundFont 2 file as the specification lays it out: INFO (ifil, isng, INAM), sdta (smpl, each
 * sample followed by 46 zero points, and sm24 when asked), pdta (the nine hydra chunks, each with
 * its terminal record).
 */
function writeSf2(font: TestFont): Uint8Array {
	let next = 0;
	const placed = font.samples.map((s) => {
		const start = next;
		next += s.points.length + 46;
		return { ...s, start, end: start + s.points.length };
	});
	const smpl = new Uint8Array(2 * next);
	const sv = new DataView(smpl.buffer);
	for (const s of placed) s.points.forEach((x, i) => sv.setInt16(2 * (s.start + i), x, true));

	const p = hydra(font.presets);
	const i = hydra(font.instruments);
	const bag = (rows: readonly number[]) =>
		records(4, rows, (v, at, gen) => v.setUint16(at, gen, true));
	const gen = (rows: readonly Gen[]) =>
		records(4, rows, (v, at, [oper, amount]) => {
			v.setUint16(at, oper, true);
			v.setUint16(at + 2, amount, true);
		});
	const phdr = records(
		38,
		[...font.presets, { name: 'EOP', bank: 0, program: 0, zones: [] }],
		(v, at, preset, n) => {
			name20(v, at, preset.name);
			v.setUint16(at + 20, preset.program, true);
			v.setUint16(at + 22, preset.bank, true);
			v.setUint16(at + 24, p.first[n], true);
		}
	);
	const inst = records(22, [...font.instruments, { name: 'EOI', zones: [] }], (v, at, o, n) => {
		name20(v, at, o.name);
		v.setUint16(at + 20, i.first[n], true);
	});
	const shdr = records(46, [...placed, null], (v, at, s) => {
		name20(v, at, s ? s.name : 'EOS');
		if (!s) return;
		const [loopStart, loopEnd] = s.loop ?? [0, 0];
		v.setUint32(at + 20, s.start, true);
		v.setUint32(at + 24, s.end, true);
		v.setUint32(at + 28, s.start + loopStart, true);
		v.setUint32(at + 32, s.start + loopEnd, true);
		v.setUint32(at + 36, SR, true);
		v.setUint8(at + 40, s.pitch);
		v.setInt8(at + 41, s.correction ?? 0);
		v.setUint16(at + 42, s.link ?? 0, true);
		v.setUint16(at + 44, s.type ?? 1, true);
	});
	const noModulators = new Uint8Array(10);

	const [major, minor] = font.version ?? [2, 1];
	const ifil = new Uint8Array(4);
	new DataView(ifil.buffer).setUint16(0, major, true);
	new DataView(ifil.buffer).setUint16(2, minor, true);
	const sm24 = font.sm24 === undefined ? [] : [chunk('sm24', new Uint8Array(next).fill(font.sm24))];
	return chunk(
		'RIFF',
		concat(
			bytesOf('sfbk'),
			list(
				'INFO',
				chunk('ifil', ifil),
				chunk('isng', bytesOf('EMU8000\0')),
				chunk('INAM', bytesOf('Test Font\0'))
			),
			list('sdta', chunk('smpl', smpl), ...sm24),
			list(
				'pdta',
				chunk('phdr', phdr),
				chunk('pbag', bag(p.bags)),
				chunk('pmod', noModulators),
				chunk('pgen', gen(p.gens)),
				chunk('inst', inst),
				chunk('ibag', bag(i.bags)),
				chunk('imod', noModulators),
				chunk('igen', gen(i.gens)),
				chunk('shdr', shdr)
			)
		)
	);
}

const C4 = sine(261.63);
const C5 = sine(523.25);
const C6 = sine(1046.5);
const LOOP = [11025, 33075] as const;

/**
 * A sine "piano" in bank 0 and a two-key kit in bank 128, the kit first in the file. The piano's
 * instrument has a global zone (6 dB down), three zones and one its preset's key range rules out;
 * its preset adds 3 cents and 2 dB down, and tries a root key, which only an instrument may set.
 */
const BASE: TestFont = {
	samples: [
		{ name: 'Sine C4', points: C4, pitch: 60, loop: LOOP },
		// the header's pitch is off on purpose: its zone's overridingRootKey wins
		{ name: 'Sine C5', points: C5, pitch: 60, loop: LOOP },
		{ name: 'Sine C6', points: C6, pitch: 84, correction: -5, loop: LOOP }
	],
	instruments: [
		{
			name: 'Sine',
			zones: [
				[[G.initialAttenuation, 60]],
				[
					[G.keyRange, range(0, 66)],
					[G.startAddrsOffset, 100],
					[G.sampleModes, 1],
					[G.sampleID, 0]
				],
				[
					[G.keyRange, range(67, 78)],
					[G.overridingRootKey, 72],
					[G.fineTune, 12],
					[G.endloopAddrsOffset, short(-75)],
					[G.sampleModes, 3],
					[G.sampleID, 1]
				],
				[
					[G.keyRange, range(79, 127)],
					[G.initialAttenuation, 0],
					[G.sampleID, 2]
				],
				[
					[G.keyRange, range(110, 127)],
					[G.sampleID, 0]
				]
			]
		},
		{
			name: 'Kit',
			zones: [
				[
					[G.keyRange, range(36)],
					[G.overridingRootKey, 36],
					[G.sampleID, 0]
				],
				[
					[G.keyRange, range(42)],
					[G.exclusiveClass, 1],
					[G.sampleID, 1]
				]
			]
		}
	],
	presets: [
		{ name: 'Test Kit', bank: 128, program: 0, zones: [[[G.instrument, 1]]] },
		{
			name: 'Sine Piano',
			bank: 0,
			program: 0,
			zones: [
				[
					[G.keyRange, range(0, 100)],
					[G.fineTune, 3],
					[G.initialAttenuation, 20],
					[G.overridingRootKey, 50],
					[G.instrument, 0]
				]
			]
		}
	]
};

/** A font of `zones` on one short sample, as one preset. */
const oneInstrument = (
	zones: readonly (readonly Gen[])[],
	preset: Partial<TestPreset> = {}
): TestFont => ({
	samples: [{ name: 'Tone', points: sine(440, 0.1), pitch: 69 }],
	instruments: [{ name: 'Tones', zones }],
	presets: [{ name: 'Tones', bank: 0, program: 0, zones: [[[G.instrument, 0]]], ...preset }]
});

const peak = (c: Float32Array) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Where a chunk's id first appears in a written file, to break the file on purpose. */
const find = (bytes: Uint8Array, id: string) => {
	const at = new TextDecoder('latin1').decode(bytes).indexOf(id);
	expect(at).toBeGreaterThan(0);
	return at;
};

describe('parseSoundFont', () => {
	it('lists the presets by bank and program, with their zones and whether they are kits', () => {
		const sf = parseSoundFont(writeSf2(BASE));
		expect(sf.name).toBe('Test Font');
		expect(sf.presets).toEqual([
			{ index: 1, name: 'Sine Piano', bank: 0, program: 0, zones: 3, drum: false },
			{ index: 0, name: 'Test Kit', bank: 128, program: 0, zones: 2, drum: true }
		]);
		expect(sf.samples.map((s) => [s.name, s.originalPitch, s.pitchCorrection])).toEqual([
			['Sine C4', 60, 0],
			['Sine C5', 60, 0],
			['Sine C6', 84, -5]
		]);
		expect(sf.sm24).toBeNull();
	});

	it('resolves zones: instrument zones over the global zone, preset generators added on top', () => {
		const [a, b, c] = parseSoundFont(writeSf2(BASE)).zones[1];
		expect(a).toMatchObject({
			layer: 0,
			order: 0,
			instrument: 'Sine',
			sample: 0,
			keyLo: 0,
			keyHi: 66,
			velLo: 0,
			velHi: 127,
			rootKey: 60,
			fineTune: 3,
			attenuation: 80,
			sampleMode: 1,
			startOffset: 100
		});
		// the preset's overridingRootKey is for instruments only: ignored
		expect(b).toMatchObject({
			keyLo: 67,
			keyHi: 78,
			rootKey: 72,
			fineTune: 15,
			attenuation: 80,
			sampleMode: 3,
			loopEndOffset: -75
		});
		// the instrument zone's key range meets the preset's
		expect(c).toMatchObject({
			keyLo: 79,
			keyHi: 100,
			rootKey: 84,
			fineTune: 3,
			attenuation: 20,
			sampleMode: 0,
			scaleTuning: 100,
			exclusiveClass: 0
		});
	});

	it('guesses kits outside bank 128 by their names and by how their zones lie', () => {
		const font: TestFont = {
			samples: [{ name: 'Tone', points: sine(440, 0.05), pitch: 69 }],
			instruments: [
				{
					name: 'Two Hits',
					zones: [
						[
							[G.keyRange, range(36)],
							[G.sampleID, 0]
						],
						[
							[G.keyRange, range(38)],
							[G.sampleID, 0]
						]
					]
				},
				{
					name: 'Wide',
					zones: [
						[
							[G.keyRange, range(0, 60)],
							[G.sampleID, 0]
						],
						[
							[G.keyRange, range(61, 127)],
							[G.sampleID, 0]
						]
					]
				},
				{
					name: 'Hits',
					zones: Array.from({ length: 10 }, (_, n): Gen[] => [
						[G.keyRange, range(40 + n)],
						[G.overridingRootKey, 40 + n],
						[G.sampleID, 0]
					])
				}
			],
			presets: [
				{ name: 'Rock Kit', bank: 0, program: 0, zones: [[[G.instrument, 0]]] },
				{ name: 'Steel Drums', bank: 0, program: 1, zones: [[[G.instrument, 1]]] },
				{ name: 'Perc. Organ', bank: 0, program: 2, zones: [[[G.instrument, 1]]] },
				{ name: 'Untitled', bank: 0, program: 3, zones: [[[G.instrument, 2]]] }
			]
		};
		expect(parseSoundFont(writeSf2(font)).presets.map((p) => [p.name, p.drum])).toEqual([
			['Rock Kit', true],
			['Steel Drums', false],
			['Perc. Organ', false],
			['Untitled', true]
		]);
	});

	it('throws Sf2Error for what is not a whole SoundFont 2', () => {
		const good = writeSf2(BASE);
		let seed = 1;
		const noise = Uint8Array.from({ length: 4096 }, () => {
			seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
			return seed >>> 24;
		});
		expect(() => parseSoundFont(noise)).toThrow(Sf2Error);
		expect(() => parseSoundFont(concat(good.subarray(0, 12), noise))).toThrow(Sf2Error);
		expect(() => parseSoundFont(good.subarray(0, 8))).toThrow(Sf2Error);
		const half = good.subarray(0, good.length >> 1);
		expect(() => parseSoundFont(half)).toThrow(Sf2Error);
		expect(() => parseSoundFont(half)).toThrow(/truncated/);
		const wave = good.slice();
		wave.set(bytesOf('WAVE'), 8);
		expect(() => parseSoundFont(wave)).toThrow(Sf2Error);
		const infoOnly = chunk(
			'RIFF',
			concat(bytesOf('sfbk'), list('INFO', chunk('INAM', bytesOf('x\0'))))
		);
		expect(() => parseSoundFont(infoOnly)).toThrow(Sf2Error);
		expect(() => parseSoundFont(writeSf2({ ...BASE, version: [3, 1] }))).toThrow(/sf3/);
		// a zone that plays a sample, or an instrument, the file does not have
		const noSample: TestFont = {
			...BASE,
			instruments: [{ name: 'Bad', zones: [[[G.sampleID, 9]]] }, BASE.instruments[1]]
		};
		expect(() => parseSoundFont(writeSf2(noSample))).toThrow(/sample it does not have/);
		const noInstrument: TestFont = {
			...BASE,
			presets: [{ name: 'Bad', bank: 0, program: 0, zones: [[[G.instrument, 5]]] }]
		};
		expect(() => parseSoundFont(writeSf2(noInstrument))).toThrow(/instrument it does not have/);
	});

	it('throws Sf2Error for a hydra out of order, a chunk missing, or compressed samples', () => {
		const font = oneInstrument([[[G.sampleID, 0]]]);
		const patched = (id: string, at: number, value: number) => {
			const bytes = writeSf2(font);
			new DataView(bytes.buffer).setUint16(find(bytes, id) + 8 + at, value, true);
			return bytes;
		};
		// the preset's first bag after its last; the instrument zone's first generator after its last
		expect(() => parseSoundFont(patched('phdr', 24, 5))).toThrow(
			/zones of "Tones" are out of order/
		);
		expect(() => parseSoundFont(patched('ibag', 0, 50))).toThrow(/generators of "Tones"/);
		const renamed = (id: string) => {
			const bytes = writeSf2(font);
			bytes.set(bytesOf('JUNK'), find(bytes, id));
			return bytes;
		};
		expect(() => parseSoundFont(renamed('shdr'))).toThrow(/shdr chunk is missing/);
		expect(() => parseSoundFont(renamed('smpl'))).toThrow(/no smpl chunk/);
		const packed = { ...font, samples: [{ ...font.samples[0], type: 0x11 }] };
		expect(() => parseSoundFont(writeSf2(packed))).toThrow(/sf3/);
	});
});

describe('soundFontSamples', () => {
	it('imports a melodic preset as a multisampler: roots, loops, tune, gain and audio', () => {
		const piano = soundFontSamples(parseSoundFont(writeSf2(BASE)), 1);
		expect(piano.kind).toBe('multisampler');
		expect(piano.name).toBe('Sine Piano');
		expect(piano.warnings).toEqual([]);
		expect(piano.samples.map((s) => s.root)).toEqual([60, 72, 84]);
		expect(piano.samples.map((s) => s.name)).toEqual([
			'Sine Piano c4',
			'Sine Piano c5',
			'Sine Piano c6'
		]);
		const edits = piano.samples.map((s) => s.edit!);
		expect(edits.map((e) => e.loop.mode)).toEqual(['forever', 'release', 'off']);
		expect(edits.map((e) => [e.loop.start, e.loop.end, e.loop.crossfade])).toEqual([
			[10925, 32975, 0],
			[11025, 33000, 0],
			[11025, 33075, 0]
		]);
		expect(edits.map((e) => e.tune)).toEqual([3, 15, -2]);
		expect(edits.map((e) => e.gain)).toEqual([-8, -8, -2]);
		expect(edits.map((e) => [e.start, e.end])).toEqual([
			[0, 44000],
			[0, 44100],
			[0, 44100]
		]);
		const audio = piano.samples.map((s) => s.audio);
		expect(audio.map((a) => [a.sampleRate, a.channels.length, a.channels[0].length])).toEqual([
			[SR, 1, 44000],
			[SR, 1, 44100],
			[SR, 1, 44100]
		]);
		// the first zone starts 100 points into its sample
		expect(audio[0].channels[0][0]).toBe(Math.fround(C4[100] / 32768));
		expect(audio[0].channels[0][1000]).toBeCloseTo(
			0.5 * Math.sin((2 * Math.PI * 261.63 * 1100) / SR),
			4
		);
		expect(peak(audio[2].channels[0])).toBeCloseTo(0.5, 3);
	});

	it('builds: the roots become the key centers, the loops and levels come along', () => {
		const piano = soundFontSamples(parseSoundFont(writeSf2(BASE)), 1);
		const built = buildPreset(piano.samples, { kind: 'multisampler', name: 'sf test' });
		expect(built.warnings.filter((w) => /root/.test(w))).toEqual([]);
		const regions = built.patch.regions as SamplerRegion[];
		expect(regions.map((r) => r['pitch.keycenter'])).toEqual([60, 72, 84]);
		expect(regions.map((r) => r.hikey)).toEqual([66, 78, 127]);
		expect(regions.map((r) => r.tune)).toEqual([3, 15, -2]);
		expect(regions.map((r) => r.gain)).toEqual([-8, -8, -2]);
		expect(regions.map((r) => [r['loop.start'], r['loop.end']])).toEqual([
			[10925, 32975],
			[11025, 33000],
			[11025, 33075]
		]);
		// forever, until release, off (note 30 §2.6)
		expect(regions.map((r) => [r['loop.onrelease'], r['loop.enabled']])).toEqual([
			[true, undefined],
			[undefined, undefined],
			[undefined, false]
		]);
	});

	it('imports a kit on keys 53 on, choking where the SoundFont has an exclusive class', () => {
		const kit = soundFontSamples(parseSoundFont(writeSf2(BASE)), 0);
		expect(kit.kind).toBe('drum');
		expect(kit.name).toBe('Test Kit');
		expect(kit.warnings).toEqual([]);
		expect(kit.samples.map((s) => [s.name, s.key, s.root])).toEqual([
			['Sine C4', 53, 60],
			['Sine C5', 54, 60]
		]);
		expect(kit.samples.map((s) => s.edit!.playmode)).toEqual(['oneshot', 'group']);
		// key 42 plays a sample recorded at 60: 18 semitones down
		expect(kit.samples.map((s) => s.edit!.transpose)).toEqual([0, -18]);
		const built = buildPreset(kit.samples, { kind: 'drum', name: 'sf kit' });
		const regions = built.patch.regions as DrumRegion[];
		expect(regions.map((r) => [r.hikey, r.playmode, r.transpose])).toEqual([
			[53, 'oneshot', 0],
			[54, 'group', -18]
		]);
	});

	it('reads 24-bit samples (sm24), and ignores sm24 in files older than 2.04', () => {
		const deep = parseSoundFont(writeSf2({ ...BASE, version: [2, 4], sm24: 0x80 }));
		expect(deep.sm24).not.toBeNull();
		const c6 = soundFontSamples(deep, 1).samples[2].audio.channels[0];
		expect(c6[10]).toBe(Math.fround((C6[10] * 256 + 0x80) / 8388608));
		const old = parseSoundFont(writeSf2({ ...BASE, sm24: 0x80 }));
		expect(old.sm24).toBeNull();
		expect(soundFontSamples(old, 1).samples[2].audio.channels[0][10]).toBe(
			Math.fround(C6[10] / 32768)
		);
	});

	it('joins a stereo pair as left and right, and keeps the fade-out past its loop', () => {
		const left = sine(261.63, 1, 0.5);
		const right = sine(261.63, 1, 0.25);
		const loop = [11025, 44095] as const;
		const font: TestFont = {
			samples: [
				{ name: 'Pad C4 L', points: left, pitch: 60, loop, type: 4, link: 1 },
				{ name: 'Pad C4 R', points: right, pitch: 60, loop, type: 2, link: 0 }
			],
			instruments: [
				// the right half comes first: the left still goes on the left
				{
					name: 'Pad',
					zones: [
						[
							[G.sampleModes, 1],
							[G.pan, short(500)],
							[G.sampleID, 1]
						],
						[
							[G.sampleModes, 1],
							[G.pan, short(-500)],
							[G.sampleID, 0]
						]
					]
				},
				{
					name: 'Half',
					zones: [
						[
							[G.sampleModes, 1],
							[G.pan, short(-250)],
							[G.sampleID, 0]
						]
					]
				}
			],
			presets: [
				{ name: 'Stereo Pad', bank: 0, program: 0, zones: [[[G.instrument, 0]]] },
				{ name: 'Left Only', bank: 0, program: 1, zones: [[[G.instrument, 1]]] }
			]
		};
		const sf = parseSoundFont(writeSf2(font));
		const pad = soundFontSamples(sf, 0);
		expect(pad.warnings).toEqual([]);
		expect(pad.samples.map((s) => [s.name, s.root])).toEqual([['Stereo Pad c4', 60]]);
		const [{ audio, edit }] = pad.samples;
		expect(audio.channels.map((c) => c.length)).toEqual([44100, 44100]);
		expect(audio.channels[0][100]).toBe(Math.fround(left[100] / 32768));
		expect(audio.channels[1][100]).toBe(Math.fround(right[100] / 32768));
		expect(edit!.loop).toEqual({ mode: 'forever', start: 11025, end: 44095, crossfade: 0 });
		expect(edit!.fadeOut).toBe(5);
		// as a kit sound: the pair's mark leaves its name and its pans only placed its halves
		const drum = soundFontSamples(sf, 0, { kind: 'drum' }).samples[0];
		expect([drum.name, drum.audio.channels.length, drum.edit!.pan]).toEqual(['Pad C4', 2, 0]);
		const half = soundFontSamples(sf, 1, { kind: 'drum' }).samples[0];
		expect([half.name, half.audio.channels.length, half.edit!.pan]).toEqual(['Pad C4 L', 1, -50]);
	});

	it('keeps the layer played at velocity 100, else the loudest, and the first of stacked layers', () => {
		const font: TestFont = {
			samples: [
				{ name: 'Soft', points: sine(261.63, 0.2), pitch: 60 },
				{ name: 'Hard', points: sine(523.25, 0.2), pitch: 72 },
				{ name: 'Pad', points: sine(1046.5, 0.2), pitch: 84 }
			],
			instruments: [
				{
					name: 'Layers',
					zones: [
						[
							[G.velRange, range(0, 90)],
							[G.sampleID, 0]
						],
						[
							[G.velRange, range(91, 127)],
							[G.sampleID, 1]
						]
					]
				},
				{
					name: 'Quiet',
					zones: [
						[
							[G.velRange, range(0, 40)],
							[G.sampleID, 0]
						],
						[
							[G.velRange, range(41, 80)],
							[G.sampleID, 1]
						]
					]
				},
				{ name: 'Pad', zones: [[[G.sampleID, 2]]] },
				{
					name: 'Gapped',
					zones: [
						[
							[G.velRange, range(0, 40)],
							[G.sampleID, 0]
						],
						[
							[G.velRange, range(110, 127)],
							[G.sampleID, 2]
						]
					]
				}
			],
			presets: [
				{ name: 'Layered', bank: 0, program: 0, zones: [[[G.instrument, 0]]] },
				{ name: 'Quiet', bank: 0, program: 1, zones: [[[G.instrument, 1]]] },
				{ name: 'Stacked', bank: 0, program: 2, zones: [[[G.instrument, 2]], [[G.instrument, 0]]] },
				{ name: 'Gapped', bank: 0, program: 3, zones: [[[G.instrument, 3]]] }
			]
		};
		const sf = parseSoundFont(writeSf2(font));
		const layered = soundFontSamples(sf, 0);
		expect(layered.samples.map((s) => s.root)).toEqual([72]);
		expect(layered.warnings).toEqual(['velocity layers: kept the one played at velocity 100']);
		const quiet = soundFontSamples(sf, 1);
		expect(quiet.samples.map((s) => s.root)).toEqual([72]);
		expect(quiet.warnings).toEqual(['velocity layers: kept the loudest']);
		const stacked = soundFontSamples(sf, 2);
		expect(stacked.samples.map((s) => s.root)).toEqual([84]);
		expect(stacked.warnings).toEqual([
			'velocity layers: kept the one played at velocity 100',
			'layered sounds: kept the first layer on each key'
		]);
		// nothing at 100: the layer above it is nearer than the one below
		const gapped = soundFontSamples(sf, 3);
		expect(gapped.samples.map((s) => s.root)).toEqual([84]);
		expect(gapped.warnings).toEqual(['velocity layers: kept the loudest']);
	});

	it('says what does not come across: short loops, scale tuning, roots and pitches out of range', () => {
		const font: TestFont = {
			samples: [
				{ name: 'Tone', points: sine(440, 0.1), pitch: 69, loop: [1000, 1040] },
				{ name: '', points: sine(440, 0.1), pitch: 69 }
			],
			instruments: [
				{
					name: 'Edges',
					zones: [
						// a 40-point loop, shorter than the editor keeps; half a semitone a key
						[
							[G.keyRange, range(0, 40)],
							[G.sampleModes, 1],
							[G.scaleTuning, 50],
							[G.sampleID, 0]
						],
						// tuned 5 semitones down from a root of 127: centered on 132
						[
							[G.keyRange, range(41, 127)],
							[G.overridingRootKey, 127],
							[G.coarseTune, short(-5)],
							[G.sampleID, 1]
						]
					]
				},
				{
					name: 'Low',
					zones: [
						[
							[G.keyRange, range(20)],
							[G.overridingRootKey, 127],
							[G.sampleID, 1]
						]
					]
				}
			],
			presets: [
				{ name: 'Edges', bank: 0, program: 0, zones: [[[G.instrument, 0]]] },
				{ name: 'Empty', bank: 0, program: 1, zones: [[[G.fineTune, 5]]] },
				{ name: 'Low Kit', bank: 128, program: 0, zones: [[[G.instrument, 1]]] }
			]
		};
		const sf = parseSoundFont(writeSf2(font));
		const edges = soundFontSamples(sf, 0);
		expect(edges.samples.map((s) => [s.root, s.edit!.loop.mode])).toEqual([
			[69, 'forever'],
			[127, 'off']
		]);
		expect(edges.samples[0].edit!.loop.end - edges.samples[0].edit!.loop.start).toBe(88);
		expect(edges.warnings).toEqual([
			'roots beyond midi 0–127: clamped',
			'scale tuning other than 100 cents a key: played as a keyboard plays',
			'loops shorter than 88 frames were lengthened: they may sound out of tune'
		]);
		// only a global zone: nothing to play
		expect(sf.presets.find((p) => p.name === 'Empty')?.zones).toBe(0);
		const empty = soundFontSamples(sf, 1);
		expect([empty.kind, empty.samples.length, empty.warnings]).toEqual([
			'multisampler',
			0,
			['this preset plays no samples']
		]);
		// key 20 of a sample rooted at 127: 107 semitones down, as far as the device goes
		const low = soundFontSamples(sf, 2);
		expect(low.samples.map((s) => [s.name, s.key, s.edit!.transpose])).toEqual([
			['Low Kit g#0', 53, -48]
		]);
		expect(low.warnings).toEqual(['drum pitches beyond ±48 semitones: clamped']);
	});

	it('moves whole semitones of tuning into the root, a zone tuned up centering lower', () => {
		const tuned = soundFontSamples(
			parseSoundFont(
				writeSf2(
					oneInstrument(
						[
							// 2 semitones and 150 cents up: key 69 sounds 350 cents up, as center 66 + 50 cents
							[
								[G.keyRange, range(0, 63)],
								[G.coarseTune, 2],
								[G.fineTune, 80],
								[G.sampleID, 0]
							],
							// 1 semitone and 29 cents down: key 70 sounds 29 cents flat
							[
								[G.keyRange, range(64, 127)],
								[G.coarseTune, short(-1)],
								[G.fineTune, short(-99)],
								[G.sampleID, 0]
							]
						],
						{
							zones: [
								[
									[G.fineTune, 70],
									[G.instrument, 0]
								]
							]
						}
					)
				)
			),
			0
		);
		expect(tuned.samples.map((s) => [s.root, s.edit!.tune])).toEqual([
			[66, 50],
			[70, -29]
		]);
		// the same root twice: the zone over more keys stays
		const shared = soundFontSamples(
			parseSoundFont(
				writeSf2(
					oneInstrument([
						[
							[G.keyRange, range(0, 59)],
							[G.sampleID, 0]
						],
						[
							[G.keyRange, range(60, 127)],
							[G.initialAttenuation, 30],
							[G.sampleID, 0]
						]
					])
				)
			),
			0
		);
		expect(shared.samples.map((s) => [s.root, s.edit!.gain])).toEqual([[69, -3]]);
		expect(shared.warnings).toEqual([
			'zones sharing a root: kept the one that plays the most keys'
		]);
	});

	it('picks 24 zones spread over the range when there are more', () => {
		const zones = Array.from({ length: 30 }, (_, n): Gen[] => [
			[G.keyRange, range(30 + 2 * n, 31 + 2 * n)],
			[G.overridingRootKey, 30 + 2 * n],
			[G.sampleID, 0]
		]);
		const many = soundFontSamples(parseSoundFont(writeSf2(oneInstrument(zones))), 0);
		expect(many.kind).toBe('multisampler');
		expect(many.samples.map((s) => s.root)).toEqual([
			30, 32, 34, 38, 40, 42, 44, 48, 50, 52, 54, 58, 60, 62, 64, 68, 70, 72, 74, 78, 80, 82, 84, 88
		]);
		expect(many.warnings).toEqual([
			'a multisample holds 24 zones: kept 24 of 30, spread over its range'
		]);
	});

	it('keeps 24 kit sounds from the first kick on, and says when choke groups merge', () => {
		const zones = Array.from({ length: 61 }, (_, n): Gen[] => {
			const key = 27 + n;
			const choke = key === 42 || key === 46 ? 1 : key === 40 ? 2 : 0;
			return [
				[G.keyRange, range(key)],
				[G.overridingRootKey, key],
				...(choke ? [[G.exclusiveClass, choke] as const] : []),
				[G.sampleID, 0]
			];
		});
		const big = soundFontSamples(
			parseSoundFont(writeSf2(oneInstrument(zones, { name: 'Standard', bank: 128 }))),
			0
		);
		expect(big.kind).toBe('drum');
		expect(big.samples.map((s) => s.key)).toEqual(Array.from({ length: 24 }, (_, i) => 53 + i));
		expect(big.samples.every((s) => s.edit!.transpose === 0)).toBe(true);
		// keys 35–58: 40 (class 2), 42 and 46 (class 1) choke
		const choking = big.samples.filter((s) => s.edit!.playmode === 'group').map((s) => s.key);
		expect(choking).toEqual([58, 60, 64]);
		expect(big.warnings).toEqual([
			'a kit holds 24 sounds: kept midi notes 35–58, 37 left out',
			'several choke groups: on the device they all choke each other'
		]);
	});

	it('leaves out samples the file does not hold, and plays once where a loop marks a one-shot', () => {
		const font: TestFont = {
			samples: [
				{ name: 'In ROM', points: sine(261.63, 0.1), pitch: 60, type: 0x8001 },
				{ name: 'Once', points: sine(523.25, 0.2), pitch: 72, loop: [8816, 8818] }
			],
			instruments: [
				{
					name: 'Mixed',
					zones: [
						[
							[G.keyRange, range(0, 59)],
							[G.sampleID, 0]
						],
						// offset past its own end: nothing left to play
						[
							[G.keyRange, range(0, 59)],
							[G.startAddrsOffset, 20000],
							[G.sampleID, 1]
						],
						[
							[G.keyRange, range(60, 127)],
							[G.sampleModes, 1],
							[G.sampleID, 1]
						]
					]
				}
			],
			presets: [{ name: 'Mixed', bank: 0, program: 0, zones: [[[G.instrument, 0]]] }]
		};
		const mixed = soundFontSamples(parseSoundFont(writeSf2(font)), 0);
		expect(mixed.samples.map((s) => [s.root, s.edit!.loop.mode])).toEqual([[72, 'off']]);
		expect(mixed.warnings).toEqual(['zones whose samples the file does not hold: left out']);
	});

	it('imports as the kind asked for, and throws for a preset it does not have', () => {
		const sf = parseSoundFont(writeSf2(BASE));
		const tuned = soundFontSamples(sf, 0, { kind: 'multisampler' });
		expect(tuned.kind).toBe('multisampler');
		expect(tuned.samples.map((s) => s.root)).toEqual([36, 60]);
		expect(peak(tuned.samples[0].audio.channels[0])).toBeGreaterThan(0.4);
		expect(() => soundFontSamples(sf, 2)).toThrow(Sf2Error);
	});
});
