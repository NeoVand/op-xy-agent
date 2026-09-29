// SFZ instruments as multisamples: headers inherit, comments and spaced paths read, one region per
// root (the one played at velocity 100), loops, tuning and level carried over. Audio synthesized.
import { describe, expect, it } from 'vitest';
import { buildPreset } from './build';
import { SfzError, parseSfz, sfzNote, sfzSamples } from './sfz';
import type { SamplerRegion } from './patch';
import type { PcmAudio } from './wav';

const SR = 44100;
const tone = (seconds = 1): PcmAudio => ({
	sampleRate: SR,
	channels: [Float32Array.from({ length: seconds * SR }, (_, i) => 0.4 * Math.sin(i / 20))]
});

const TEXT = `
// a small piano, two layers on c4
<control> default_path=samples\\
<global> volume=-3
<group> loop_mode=one_shot
<region> sample=Piano C3.wav pitch_keycenter=c3 lokey=0 hikey=54
/* the soft layer, then the loud one */
<region> sample=Piano C4 soft.wav key=60 lovel=0 hivel=63
<region> sample=Piano C4 loud.wav key=60 lovel=64 hivel=127 volume=2
<group>
<region> sample=Pad E4.wav pitch_keycenter=64 loop_mode=loop_continuous loop_start=1000 loop_end=30999 tune=-12
<region> sample=Pad G#4.wav pitch_keycenter=g#4 transpose=12 loop_start=500 loop_end=20499
<curve> curve_index=1 v000=0 v127=1
`;

describe('SFZ', () => {
	it('reads notes as numbers or names, c4 = 60', () => {
		expect(sfzNote('60')).toBe(60);
		expect(sfzNote('c4')).toBe(60);
		expect(sfzNote('f#3')).toBe(54);
		expect(sfzNote('Eb2')).toBe(39);
		expect(sfzNote('h4')).toBeNull();
		expect(sfzNote(undefined)).toBeNull();
		expect(sfzNote('200')).toBeNull();
	});

	it('parses regions with what they inherit, comments out, paths with spaces kept', () => {
		const regions = parseSfz(TEXT);
		expect(regions.map((r) => r.sample)).toEqual([
			'samples/Piano C3.wav',
			'samples/Piano C4 soft.wav',
			'samples/Piano C4 loud.wav',
			'samples/Pad E4.wav',
			'samples/Pad G#4.wav'
		]);
		expect(regions[0]).toMatchObject({
			volume: '-3',
			loop_mode: 'one_shot',
			pitch_keycenter: 'c3'
		});
		expect(regions[2].volume).toBe('2');
		// the second group starts afresh: no one_shot, the global volume still there
		expect(regions[3].loop_mode).toBe('loop_continuous');
		expect(regions[4].loop_mode).toBeUndefined();
		expect(regions[4].volume).toBe('-3');
	});

	it('makes one zone per root, the layer played at velocity 100, with loops, tuning and level', () => {
		const found = new Set<string>();
		const result = sfzSamples(parseSfz(TEXT), (path) => {
			found.add(path);
			return tone();
		});
		expect(result.warnings).toEqual(['velocity layers: kept the one played at velocity 100']);
		expect(result.samples.map((s) => [s.name, s.root])).toEqual([
			['Piano C3', 48],
			['Piano C4 loud', 60],
			['Pad E4', 64],
			// transposed up an octave: it plays at its own pitch an octave lower
			['Pad G#4', 56]
		]);
		const [c3, c4, e4, gs4] = result.samples.map((s) => s.edit!);
		expect(c3.loop.mode).toBe('off');
		expect(c3.gain).toBe(-3);
		expect(c4.gain).toBe(2);
		expect(e4).toMatchObject({ tune: -12, loop: { mode: 'forever', start: 1000, end: 31000 } });
		expect(gs4.loop).toMatchObject({ mode: 'forever', start: 500, end: 20500 });
		expect(found.has('samples/Piano C4 soft.wav')).toBe(false);
		const built = buildPreset(result.samples, { kind: 'multisampler', name: 'sfz piano' });
		expect(built.warnings).toEqual([]);
		expect((built.patch.regions as SamplerRegion[]).map((r) => r['pitch.keycenter'])).toEqual([
			48, 56, 60, 64
		]);
	});

	it('says which samples are missing, and refuses an instrument with none found', () => {
		const regions = parseSfz(TEXT);
		const some = sfzSamples(regions, (path) => (path.includes('Pad') ? tone() : null));
		expect(some.samples).toHaveLength(2);
		expect(some.warnings.at(-1)).toMatch(/missing 2 samples: samples\/Piano C3.wav/);
		expect(() => sfzSamples(regions, () => null)).toThrow(SfzError);
		expect(parseSfz('no headers here')).toEqual([]);
	});

	it('keeps 24 roots spread over the range when there are more', () => {
		const text = Array.from(
			{ length: 40 },
			(_, i) => `<region> sample=n${i}.wav key=${30 + i}`
		).join('\n');
		const result = sfzSamples(parseSfz(text), () => tone(1));
		expect(result.samples).toHaveLength(24);
		expect(result.samples[0].root).toBe(30);
		expect(result.samples.at(-1)?.root).toBe(69);
		expect(result.warnings[0]).toMatch(/40 roots: kept 24/);
	});
});
