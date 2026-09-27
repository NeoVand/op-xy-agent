/**
 * The sample TE's guide art shows everywhere ("ch mart b.wav": a drum roll, then three hits) as a
 * stand-in file, and helpers that put the simulator into the art's states. Used by the area's
 * scenarios and by the core's sampler and drum scenarios (`../../scenarios.ts`).
 */
import type { EngineId } from '$lib/core/opxy';
import type { OpxySim } from '../../opxy-sim.svelte';
import { defaultTrack, type TrackState } from '../../params';
import { sampleFile, type Region, type SampleFile } from './state';
import { DEMO_SEED } from './wave';

/**
 * TE's sample at a given length. The M1 lanes show a 20 s take one point per column; the record
 * page's card fits the sample to its 171 columns, so TE's picture there is a 14.74 s take.
 */
export function demoFile(seconds = 20): SampleFile {
	return sampleFile('ch mart b.wav', 'user', seconds, DEMO_SEED);
}

/** The record page's input as TE draws it: +11 dB, the level two thirds up, threshold 47. */
export function demoInput(sim: OpxySim): void {
	Object.assign(sim.state.areas.sample.record, { gain: 11, threshold: 47, level: 0.68 });
}

/** TE's markers on the M1 lanes: start at 55 px, end at 365 px, the loop over the same span. */
export function demoRegion(): Region {
	return {
		start: 55 / 480,
		loopStart: 55 / 480,
		loopEnd: 365 / 480,
		end: 365 / 480,
		loop: 'forever',
		crossfade: 50,
		tune: 0,
		gain: 0,
		reverse: false
	};
}

/** Selects instrument track `n` (1–8), loading `engine` first when given. */
export function selectTrack(sim: OpxySim, n: number, engine?: EngineId): TrackState {
	sim.press(`track.${n}`);
	const t = sim.state.tracks[n - 1];
	if (engine && t.engine !== engine) {
		t.engine = engine;
		t.m1 = defaultTrack(engine).m1;
	}
	return t;
}
