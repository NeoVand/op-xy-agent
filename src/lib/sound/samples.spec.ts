import { describe, expect, it } from 'vitest';
import { SoundError } from './errors';
import { SampleRegistry, sampleChannels, sampleSeconds, type SampleData } from './samples';

const take = (length = 480): SampleData => ({
	sampleRate: 48000,
	channels: [new Float32Array(length).fill(0.1)]
});

describe('the sample registry', () => {
	it("keeps each sample file's audio by its id and tells listeners", () => {
		const samples = new SampleRegistry();
		const heard: string[] = [];
		const stop = samples.onChange((id) => heard.push(id));
		const kick = take();
		samples.setFile('drum/kit 1/kick 1.wav', kick);
		expect(samples.file('drum/kit 1/kick 1.wav')).toBe(kick);
		expect(samples.file('drum/kit 1/kick 2.wav')).toBeNull();
		expect(samples.ids).toEqual(['drum/kit 1/kick 1.wav']);
		samples.setFile('drum/kit 1/kick 1.wav', null);
		expect(samples.file('drum/kit 1/kick 1.wav')).toBeNull();
		// clearing what has no audio changes nothing
		samples.setFile('user/take 1.wav', null);
		stop();
		samples.setFile('user/take 2.wav', take());
		expect(heard).toEqual(['drum/kit 1/kick 1.wav', 'drum/kit 1/kick 1.wav']);
	});

	it('forgets everything on clear', () => {
		const samples = new SampleRegistry();
		samples.setFile('a', take());
		samples.setFile('b', take());
		const heard: string[] = [];
		samples.onChange((id) => heard.push(id));
		samples.clear();
		expect(samples.ids).toEqual([]);
		expect(heard).toEqual(['a', 'b']);
	});

	it('refuses files without an id or without audio', () => {
		const samples = new SampleRegistry();
		expect(() => samples.setFile('', take())).toThrow(SoundError);
		expect(() => samples.setFile('a', take(0))).toThrow(SoundError);
		expect(() => samples.setFile('a', { sampleRate: 0, channels: [new Float32Array(4)] })).toThrow(
			SoundError
		);
		expect(() => samples.setFile('a', { sampleRate: 48000, channels: [] })).toThrow(SoundError);
	});

	it('measures a sample: its channels and its length', () => {
		const stereo: SampleData = {
			sampleRate: 48000,
			channels: [new Float32Array(24000), new Float32Array(24000)]
		};
		expect(sampleChannels(stereo)).toHaveLength(2);
		expect(sampleSeconds(stereo)).toBe(0.5);
	});
});
