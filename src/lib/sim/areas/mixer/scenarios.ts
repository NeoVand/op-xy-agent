/**
 * Simulator states for the mixer area's pages (see `../../scenarios.ts`), so each can be looked at in
 * the /replica bench. TE's guide has no picture of any of them (`png: null`): the mix pages follow
 * the device as a camera saw it, the midi engine's CC pages are ours.
 */
import type { OpxySim } from '../../opxy-sim.svelte';
import type { Scenario } from '../../scenarios';
import { defaultTrack } from '../../params';
import type { CcSlot } from './state';

const OURS = 'Our layout: TE’s guide has no picture of this page (see areas/mixer/draw.ts).';
const DEVICE =
	'TE’s guide has no picture of this page; drawn after the device as a camera saw it (docs/research/59-screen-profiling.md §2.10).';

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
		id: 'mix-sends',
		png: null,
		title: 'mix · M1 FX sends',
		page: 'mix-sends',
		note: `${DEVICE} T3 sent to FX I and FX II: the popup fades a second after the last turn, as on the device; turn E1 or E2 to bring it back.`,
		setup: (sim) => {
			sim.press('key.mix');
			sim.press('track.3');
			sim.turn(1, 60);
			sim.turn(2, 25);
		}
	},
	{
		id: 'mix-eq',
		png: null,
		title: 'mix · M2 eq',
		page: 'mix-eq',
		note: `${DEVICE} Lows boosted, mids cut, highs lifted; blend at 60 bends the rows a fifth of the way to where E4 takes them, and the knob shows how far the EQ is from flat.`,
		setup: (sim) => {
			Object.assign(sim.state.areas.mixer.eq, { low: 30, mid: -20, high: 24, blend: 60 });
			sim.press('key.mix');
			sim.press('key.m2');
		}
	},
	{
		id: 'mix-saturator',
		png: null,
		title: 'mix · M3 saturator',
		page: 'mix-saturator',
		note: `${DEVICE} Driven and clipped, a little darker, mixed in at 70: each cap rides its ladder in its encoder’s style.`,
		setup: (sim) => {
			Object.assign(sim.state.areas.mixer.saturator, { gain: 60, clip: 45, tone: -10, mix: 70 });
			sim.press('key.mix');
			sim.press('key.m3');
		}
	},
	{
		id: 'mix-master',
		png: null,
		title: 'mix · M4 master',
		page: 'mix-master',
		note: `${DEVICE} The groups’ and the master’s levels, the compressor’s bar between the strips; the VU needle rests on −20 while nothing plays.`,
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
		png: null,
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
		png: null,
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
