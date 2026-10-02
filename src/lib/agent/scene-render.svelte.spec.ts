// A ducked pad heard alone, rendered offline in a real browser: its source plays on unheard, so the
// take pumps as the mix does (muted, the kick never started the duck and the take was flat).
import { describe, expect, it } from 'vitest';
import { createVirtualOpxy } from '$lib/app/virtual';
import { analyzeAudio } from '$lib/core/listen';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { renderOffline } from '$lib/sound/offline';
import { SampleRegistry } from '$lib/sound/samples';
import { alone, renderRequest } from './scene-render';

describe('a track heard alone', () => {
	it('pumps when it ducks from another track, and not without the duck', async () => {
		const sim = new OpxySim({ now: () => 0 });
		const virtual = createVirtualOpxy({ sim });
		virtual.writePattern(1, {
			pattern: 1,
			bars: 1,
			notes: [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 110, length: 1 }))
		});
		virtual.writePattern(8, {
			pattern: 1,
			bars: 1,
			notes: [60, 64, 67].map((note) => ({ step: 1, note, velocity: 90, length: 16 }))
		});
		virtual.setMetronome(false);
		Object.assign(sim.state.tracks[7].lfo, { type: 'duck', on: true, source: 1, amount: 80 });
		virtual.transport('play');
		const pump = async (ducked: boolean) => {
			const state = JSON.parse(JSON.stringify(sim.state));
			state.tracks[7].lfo.on = ducked;
			const request = { ...renderRequest(alone(state, 8), 4), sampleRate: 48_000 };
			const audio = await renderOffline(request, new SampleRegistry());
			return analyzeAudio([...audio.channels], audio.sampleRate, { expectedBpm: 120 }).pump;
		};
		expect((await pump(true))?.depthDb).toBeGreaterThan(6);
		expect(await pump(false)).toBeNull();
	});
});
