import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { DrumFrame } from '../../screen/frame';
import { attachPeaks, samplesInUse } from './hook';
import { LANE_COLUMNS } from './m1';
import { decodeWave, peaksFromChannels } from './wave';

describe('the sound engine hook', () => {
	it('lists every sample in use once, by id', () => {
		const sim = new OpxySim({ now: () => 0 });
		const files = samplesInUse(sim.state.areas.sample);
		const ids = files.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
		// eight kits of 24 sounds, one keys sample, four pad zones
		expect(files).toHaveLength(8 * 24 + 1 + 4);
		expect(ids).toContain('drum/kit 1/kick 1.wav');
	});

	it('draws measured peaks wherever the file appears once they are attached', () => {
		const sim = new OpxySim({ now: () => 0 });
		// the second kit's kick also sits on track 1's first key, a copy of the same file
		sim.state.areas.sample.tracks[0].keys[0] = { ...sim.state.areas.sample.tracks[1].keys[0]! };
		const audio = Float32Array.from({ length: 4410 }, (_, i) => (i < 441 ? 1 : 0));
		const peaks = peaksFromChannels([audio], 44100, 100);
		const changed = attachPeaks(sim.state.areas.sample, 'drum/kit 2/kick 1.wav', peaks, 0.1);
		expect(changed).toBe(2);
		// loud for the first tenth of the sample: the lane's first tenth of columns
		const lane = decodeWave((sim.frame as DrumFrame).sampler?.waves?.[0] ?? '');
		const tenth = Math.round(LANE_COLUMNS / 10);
		expect(lane.slice(0, tenth - 3).every((v) => v === 16)).toBe(true);
		expect(lane.slice(tenth + 3).every((v) => v === 0)).toBe(true);
	});
});
