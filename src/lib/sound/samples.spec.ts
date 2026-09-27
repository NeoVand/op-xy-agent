import { describe, expect, it } from 'vitest';
import { SoundError } from './errors';
import { SampleRegistry, type Sample } from './samples';

const take = (length = 480): Sample => ({
	source: { sampleRate: 48000, channels: [new Float32Array(length).fill(0.1)] }
});

describe('the sample registry', () => {
	it('keeps a sampler recording per track and tells listeners', () => {
		const samples = new SampleRegistry();
		const heard: number[] = [];
		const stop = samples.onChange((track) => heard.push(track));
		const sample = { ...take(), root: 48 };
		samples.setSample(2, sample);
		expect(samples.sample(2)).toBe(sample);
		expect(samples.sample(3)).toBeNull();
		samples.setSample(2, null);
		expect(samples.sample(2)).toBeNull();
		stop();
		samples.setSample(4, take());
		expect(heard).toEqual([2, 2]);
	});

	it('finds the multisampler zone covering a note, else the one whose root is nearest', () => {
		const samples = new SampleRegistry();
		const low = { ...take(), root: 48, low: 40, high: 54 };
		const high = { ...take(), root: 72, low: 66, high: 80 };
		samples.setZones(7, [low, high]);
		expect(samples.zone(7, 50)).toBe(low);
		expect(samples.zone(7, 70)).toBe(high);
		expect(samples.zone(7, 62)).toBe(high);
		expect(samples.zone(7, 20)).toBe(low);
		expect(samples.zone(6, 60)).toBeNull();
		samples.setZones(7, []);
		expect(samples.zone(7, 50)).toBeNull();
	});

	it('lets a drum key play a recording instead of the kit, until cleared', () => {
		const samples = new SampleRegistry();
		const kick = take();
		samples.setDrumKey(0, 0, kick);
		expect(samples.drumKey(0, 0)).toBe(kick);
		expect(samples.drumKey(1, 0)).toBeNull();
		samples.clear(0);
		expect(samples.drumKey(0, 0)).toBeNull();
	});

	it('refuses tracks, keys, notes and samples that cannot be', () => {
		const samples = new SampleRegistry();
		expect(() => samples.setSample(8, take())).toThrow(SoundError);
		expect(() => samples.setDrumKey(0, 24, take())).toThrow(SoundError);
		expect(() => samples.setSample(0, take(0))).toThrow(SoundError);
		expect(() => samples.setSample(0, { ...take(), root: 128 })).toThrow(SoundError);
		expect(() => samples.setSample(0, { ...take(), loop: { start: 1, end: 0.5 } })).toThrow(
			SoundError
		);
		expect(() => samples.setZones(0, [{ ...take(), low: 60, high: 50 }])).toThrow(SoundError);
	});
});
