/**
 * Simulator states that reproduce TE's guide illustrations, one per picture, so a page can be
 * compared with the art it was drawn from (the /replica dev bench does this side by side) and tests
 * can check that each lands on the right page. Values are the art's, rounded to the device's 0–99
 * steps; where our model cannot say the same thing (a label the art invented, a meter reading)
 * the note says so.
 */
import type { EngineId } from '$lib/core/opxy';
import { demoFile, demoRegion } from './areas/sample/demo';
import { AREA_SCENARIOS } from './areas/scenarios';
import type { OpxySim } from './opxy-sim.svelte';
import { defaultTrack, type TrackState } from './params';
import type { PageName } from './screen/frame';

/** One illustration and how to reach it. */
export interface Scenario {
	readonly id: string;
	/**
	 * File in research/ui-reference/guide-screens (git-ignored research input), or null for a page
	 * TE never drew (our own layout, shown in the bench without a comparison).
	 */
	readonly png: string | null;
	readonly title: string;
	/** The page the simulator should show. */
	readonly page: PageName;
	/** Where the simulator differs from the art on purpose, or cannot match it. */
	readonly note?: string;
	/** Puts a fresh simulator into the illustrated state. */
	readonly setup: (sim: OpxySim) => void;
}

/** Selects instrument track `n` (1–8), loading `engine` first when given. */
function track(sim: OpxySim, n: number, engine?: EngineId): TrackState {
	sim.press(`track.${n}`);
	const t = sim.state.tracks[n - 1];
	if (engine && t.engine !== engine) {
		t.engine = engine;
		t.m1 = defaultTrack(engine).m1;
	}
	return t;
}

/** Opens M-page `n` of the current mode. */
const page = (sim: OpxySim, n: 1 | 2 | 3 | 4) => sim.press(`key.m${n}`);

/** Holds shift without a key event (the art shows the shift layer). */
const holdShift = (sim: OpxySim) => {
	sim.state.shift = true;
};

/** A synth engine's M1 page. */
function engine(id: string, png: string, name: EngineId, n = 3, note?: string): Scenario {
	return {
		id,
		png,
		title: `M1 · ${name}`,
		page: 'synth',
		note,
		setup: (sim) => {
			track(sim, n, name);
			page(sim, 1);
		}
	};
}

const ENGINE_LABELS = 'TE drew this page with placeholder labels; we show the engine’s real ones.';
const PLAIN_HEADER = 'TE’s art for this engine has no grey header ramp; the other engines do.';

/** Every scenario, in the guide's order. */
/** The core's scenarios. */
const CORE_SCENARIOS: readonly Scenario[] = [
	{
		id: 'tempo',
		png: 'tempo-005-tap-tempo-to-tap-the-tempo-11-1-edit-te.png',
		title: 'tempo',
		page: 'tempo',
		setup: (sim) => {
			sim.state.tempo.bpm = 125;
			sim.state.tempo.metronome = { level: 99, on: true };
			sim.press('key.tempo');
		}
	},
	engine('axis', 'synth-engines-007-tone.png', 'axis', 7, `${ENGINE_LABELS} ${PLAIN_HEADER}`),
	engine('dissolve', 'synth-engines-016-swarm.png', 'dissolve', 5),
	engine('epiano', 'synth-engines-025-tone.png', 'epiano', 4, ENGINE_LABELS),
	{
		id: 'midi',
		png: 'synth-engines-034-external-midi-track.png',
		title: 'M1 · midi',
		page: 'midi',
		setup: (sim) => {
			const t = track(sim, 3, 'midi');
			t.midi = { channel: 16, bank: null, program: 8 };
			page(sim, 1);
		}
	},
	engine('hardsync', 'synth-engines-048-freq.png', 'hardsync', 6),
	engine('organ', 'synth-engines-057-type.png', 'organ', 3, ENGINE_LABELS),
	engine('prism', 'synth-engines-066-shape.png', 'prism', 3),
	engine('simple', 'synth-engines-075-shape.png', 'simple', 3, PLAIN_HEADER),
	engine('wavetable', 'synth-engines-084-table.png', 'wavetable', 3),
	{
		id: 'sampler',
		png: 'sample-025-sample-start.png',
		title: 'M1 · synth sampler',
		page: 'drum',
		note: 'Our waveform is a stand-in drawn from a seed (no audio); the loop spans start to end, as TE’s markers show.',
		setup: (sim) => {
			track(sim, 3, 'sampler');
			Object.assign(sim.state.areas.sample.tracks[2].synth, {
				file: demoFile(20),
				root: 55,
				region: { ...demoRegion(), tune: -1.22 }
			});
			page(sim, 1);
		}
	},
	{
		id: 'drum',
		png: 'sample-056-tune.png',
		title: 'M1 · drum sampler (shift)',
		page: 'drum',
		note: 'Our waveform is a stand-in drawn from a seed (no audio); key start and end are whole percents, so the markers sit 1–2 px from TE’s.',
		setup: (sim) => {
			const t = track(sim, 1);
			sim.state.areas.sample.tracks[0].keys[0] = demoFile(20);
			Object.assign(t.drumKeys[0], { start: 11, end: 75, fade: 50, gain: 3 });
			page(sim, 1);
			holdShift(sim);
		}
	},
	{
		id: 'playmode',
		png: 'instrument-012-play-mode.png',
		title: 'M2 · play mode (shift)',
		page: 'playmode',
		setup: (sim) => {
			const t = track(sim, 3);
			t.filter.envAmount = 65;
			page(sim, 2);
			holdShift(sim);
		}
	},
	{
		id: 'sends',
		png: 'instrument-032-aux-out.png',
		title: 'M3 · sends (shift)',
		page: 'sends',
		note: 'The manual orders the sends aux, tape, FX I, FX II; TE’s drawing stacks FX II above FX I.',
		setup: (sim) => {
			const t = track(sim, 3);
			Object.assign(t.filter, { cutoff: 76, resonance: 40, envAmount: 35, keyTracking: 33 });
			t.sends = [50, 31, 77, 25];
			page(sim, 3);
			holdShift(sim);
		}
	},
	{
		id: 'duck',
		png: 'instrument-052-duck-allows-you-to-create-a-pumping-side.png',
		title: 'M4 · duck',
		page: 'lfo',
		setup: (sim) => {
			Object.assign(track(sim, 3).lfo, { type: 'duck', source: 4, amount: 0 });
			page(sim, 4);
		}
	},
	{
		id: 'element',
		png: 'instrument-062-element-uses-the-built-in-gyroscope-and.png',
		title: 'M4 · element',
		page: 'lfo',
		setup: (sim) => {
			Object.assign(track(sim, 3).lfo, { type: 'element', speed: 26, amount: 27, destination: 1 });
			page(sim, 4);
		}
	},
	{
		id: 'random',
		png: 'instrument-071-random-uses-a-random-value-generator-as.png',
		title: 'M4 · random',
		page: 'lfo',
		note: 'The parameter card shows the destination parameter’s name (TE’s art says "res").',
		setup: (sim) => {
			const t = track(sim, 3);
			Object.assign(t.lfo, { type: 'random', speed: 3, amount: -63, destination: 0, parameter: 1 });
			page(sim, 4);
		}
	},
	{
		id: 'tremolo',
		png: 'instrument-082-tremolo-is-great-for-adding-subtle-or-dr.png',
		title: 'M4 · tremolo',
		page: 'lfo',
		setup: (sim) => {
			const t = track(sim, 3);
			Object.assign(t.lfo, { type: 'tremolo', speed: 4, amount: 9, volume: -54 });
			page(sim, 4);
		}
	},
	{
		id: 'value',
		png: 'instrument-093-value-uses-a-continuous-or-triggered-low.png',
		title: 'M4 · value',
		page: 'lfo',
		note: 'The parameter card shows the destination parameter’s name (TE’s art says "hold").',
		setup: (sim) => {
			const t = track(sim, 3);
			Object.assign(t.lfo, {
				type: 'value',
				speed: 12 + 50,
				amount: -9,
				destination: 1,
				parameter: 2
			});
			page(sim, 4);
		}
	},
	{
		id: 'mix',
		png: 'mix-003-17-1-levels-pans-and-sends.png',
		title: 'mix · M1',
		page: 'mix',
		note: 'Bar thickness follows the output; the art shows tracks playing.',
		setup: (sim) => {
			[77, 17, 88, 8, 49, 52, 0, 2].forEach((level, i) => {
				sim.state.tracks[i].mix.level = level;
			});
			sim.state.tracks[4].mix.muted = true;
			sim.press('key.mix');
			sim.press('track.2');
		}
	},
	{
		id: 'project',
		png: 'project-003-system-usage-indicators.png',
		title: 'project',
		page: 'project',
		setup: (sim) => {
			sim.state.project.name = 'demo 1';
			sim.press('key.project');
		}
	},
	{
		id: 'com',
		png: 'com-004-system.png',
		title: 'com',
		page: 'com',
		note: 'TE’s art labels the second stop "sync"; the manual has three sync rates, shown by name.',
		setup: (sim) => {
			sim.state.com = { advertising: true, multiOut: 'sync8', charging: true };
			sim.press('key.com');
		}
	}
];

/** Every scenario: the core's, then each area's (`areas/<area>/scenarios.ts`). */
export const SCENARIOS: readonly Scenario[] = [...CORE_SCENARIOS, ...AREA_SCENARIOS];
