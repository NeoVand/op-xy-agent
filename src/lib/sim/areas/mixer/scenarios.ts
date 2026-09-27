/**
 * Simulator states for the mixer area's pages (see `../../scenarios.ts`), so each can be looked at in
 * the /replica bench and by scripts/compare-screens.mjs. TE's guide has no picture of any of them:
 * `png` then names a file that does not exist, one per scenario (the core test wants every scenario's
 * file unique), and both tools report the picture missing instead of comparing it with another page.
 */
import type { OpxySim } from '../../opxy-sim.svelte';
import type { Scenario } from '../../scenarios';
import { defaultTrack } from '../../params';
import type { CcSlot } from './state';

/** The `png` of a page TE never drew. */
const noArt = (id: string) => `(no guide art) ${id}`;

const OURS = 'Our layout: TE’s guide has no picture of this page (see areas/mixer/draw.ts).';

/** Selects instrument track `n` (1–8) and loads the midi engine with these CC slots. */
function midiTrack(sim: OpxySim, n: number, slots: readonly CcSlot[]): void {
	sim.press(`track.${n}`);
	const t = sim.state.tracks[n - 1];
	t.engine = 'midi';
	t.m1 = defaultTrack('midi').m1;
	sim.state.areas.mixer.midiCc[n - 1] = slots.map((slot) => ({ ...slot }));
}

export const scenarios: readonly Scenario[] = [
	{
		id: 'mix-eq',
		png: noArt('mix-eq'),
		title: 'mix · M2 eq',
		page: 'mix-eq',
		note: `${OURS} Lows boosted, mids cut, highs lifted, blend at 60: the hatching is what blend still holds back.`,
		setup: (sim) => {
			Object.assign(sim.state.areas.mixer.eq, { low: 30, mid: -20, high: 24, blend: 60 });
			sim.press('key.mix');
			sim.press('key.m2');
		}
	},
	{
		id: 'mix-saturator',
		png: noArt('mix-saturator'),
		title: 'mix · M3 saturator',
		page: 'mix-saturator',
		note: `${OURS} Driven and clipped, a little darker, mixed in at 70: grey is the saturated signal, white what is heard.`,
		setup: (sim) => {
			Object.assign(sim.state.areas.mixer.saturator, { gain: 60, clip: 45, tone: -10, mix: 70 });
			sim.press('key.mix');
			sim.press('key.m3');
		}
	},
	{
		id: 'mix-master',
		png: noArt('mix-master'),
		title: 'mix · M4 master',
		page: 'mix-master',
		note: `${OURS} Mix M1’s strips carry the two groups, the compressor’s curve and the master level.`,
		setup: (sim) => {
			Object.assign(sim.state.areas.mixer.master, {
				percussion: 70,
				melodic: 55,
				compressor: 40,
				level: 62
			});
			sim.press('key.mix');
			sim.press('key.m4');
		}
	},
	{
		id: 'midi-cc',
		png: noArt('midi-cc'),
		title: 'M2 · midi cc set I',
		page: 'midi-engine-cc',
		note: `${OURS} After the midi M1 page (synth-engines-034): cutoff, resonance, an off slot, the mod wheel.`,
		setup: (sim) => {
			midiTrack(sim, 3, [
				{ cc: 74, value: 64 },
				{ cc: 71, value: 20 },
				{ cc: null, value: 0 },
				{ cc: 1, value: 127 },
				{ cc: 10, value: 64 },
				{ cc: null, value: 0 },
				{ cc: 91, value: 30 },
				{ cc: 93, value: 0 }
			]);
			sim.press('key.m2');
		}
	},
	{
		id: 'midi-cc-shift',
		png: noArt('midi-cc-shift'),
		title: 'M3 · midi cc set II (shift)',
		page: 'midi-engine-cc',
		note: `${OURS} With shift held the boxes show the CC numbers that shift + turn picks.`,
		setup: (sim) => {
			midiTrack(sim, 3, [
				{ cc: 74, value: 64 },
				{ cc: 71, value: 20 },
				{ cc: null, value: 0 },
				{ cc: 1, value: 127 },
				{ cc: 10, value: 64 },
				{ cc: null, value: 0 },
				{ cc: 91, value: 30 },
				{ cc: 93, value: 0 }
			]);
			sim.press('key.m3');
			sim.state.shift = true;
		}
	}
];
