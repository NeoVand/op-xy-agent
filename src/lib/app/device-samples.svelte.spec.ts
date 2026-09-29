import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { testWav } from '../../../test/fakes/xy-samples';
import { projectSampleFile } from '$lib/sim/areas/sample/state';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { SampleRegistry, type SampleData } from '$lib/sound/samples';
import { createIdbSampleCache, createMemorySampleCache } from './device-samples';
import { DeviceSamples } from './device-samples.svelte';

const KICK = '/fat32/presets/drum/test.preset/kick.wav';

describe('DeviceSamples: the samples of the replica’s project that come from the op-xy', () => {
	it('puts kept audio back as soon as the project names the file (a reload, an undo, a file opened)', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const registry = new SampleRegistry();
		const cache = createMemorySampleCache();
		cache.files.set(KICK, testWav(441));
		const samples = new DeviceSamples({ sim, samples: registry, cache });
		const stop = samples.start();
		flushSync();
		// a new project names none of the unit's files
		expect(registry.ids).toEqual([]);
		sim.state.areas.sample.tracks[0].keys[0] = projectSampleFile(KICK, 0.01);
		sim.state.areas.sample.tracks[1].keys[3] = projectSampleFile(KICK, 0.01);
		flushSync();
		await expect.poll(() => registry.ids).toEqual([KICK]);
		expect((registry.file(KICK) as SampleData).channels[0]).toHaveLength(441);
		expect(samples.status()).toMatchObject({ device: 1, factory: 0, missing: 0 });
		stop();
	});

	it('keeps read files in IndexedDB, where the next visit finds them', async () => {
		const path = `/fat32/samples/user/kept ${Date.now()}.wav`;
		const bytes = testWav(100);
		await createIdbSampleCache().put(path, bytes);
		// another cache (another visit) opens the same database
		expect(await createIdbSampleCache().get(path)).toEqual(bytes);
		expect(await createIdbSampleCache().get('/fat32/samples/user/never read.wav')).toBeNull();
	});
});
