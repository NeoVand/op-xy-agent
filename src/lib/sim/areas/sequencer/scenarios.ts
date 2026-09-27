/**
 * Simulator states that show the sequencer area's pages (see `../../scenarios.ts`). TE's guide has
 * no picture of any of them, so each names a picture that does not exist (the dev bench and
 * `scripts/compare-screens.mjs` then show ours alone) and says the layout is ours.
 */
import type { Scenario } from '../../scenarios';
import type { OpxySim } from '../../opxy-sim.svelte';

const OURS = 'No guide art for this page: our layout in TE’s visual language.';

/** Holds a key or encoder push down (no release). */
const hold = (sim: OpxySim, id: string) => sim.input({ type: 'press', id });

/** Taps a step with `note` as the last note played. */
function place(sim: OpxySim, key: string, steps: readonly number[]): void {
	sim.press(`keyboard.${key}`);
	for (const step of steps) sim.press(`step.${step}`);
}

export const scenarios: readonly Scenario[] = [
	{
		id: 'bar',
		png: 'none-sequencer-bar.png',
		title: 'bar menu (bar held)',
		page: 'bar',
		note: OURS,
		setup: (sim) => {
			sim.press('track.3');
			place(sim, 'c4', [1, 4, 7, 11, 13]);
			hold(sim, 'key.bar');
			sim.press('key.plus'); // a second bar
			sim.press('step.12'); // which plays 12 of its steps
			sim.turn(1, -24); // quantise 76
			sim.turn(3, 9); // groove 21
		}
	},
	{
		id: 'components',
		png: 'none-sequencer-components.png',
		title: 'step components (shift held)',
		page: 'components',
		note: OURS,
		setup: (sim) => {
			sim.press('track.1');
			place(sim, 'fs3', [3, 7, 11, 15]);
			hold(sim, 'key.shift');
			sim.press('step.7');
			sim.press('step.15');
			sim.press('keyboard.a3'); // natural 3: multiply
			sim.press('keyboard.as3'); // accidental 3: three hits
		}
	},
	{
		id: 'arpeggio',
		png: 'none-sequencer-arpeggio.png',
		title: 'player · arpeggio',
		page: 'player',
		note: OURS,
		setup: (sim) => {
			sim.press('track.3');
			sim.press('key.player');
			sim.press('key.player'); // on
			sim.turn(2, 2); // up/down
			sim.turn(3, 1); // two octaves
			for (const key of ['c4', 'e4', 'g4']) hold(sim, `keyboard.${key}`);
		}
	},
	{
		id: 'maestro',
		png: 'none-sequencer-maestro.png',
		title: 'player · maestro',
		page: 'player',
		note: OURS,
		setup: (sim) => {
			sim.press('track.4');
			sim.combo('key.shift', 'key.player'); // maestro
			sim.press('key.player'); // on
			hold(sim, 'key.shift');
			for (const key of ['d4', 'f4', 'a4', 'c5']) sim.press(`keyboard.${key}`);
			sim.input({ type: 'release', id: 'key.shift' });
			sim.turn(1, 30); // roll
		}
	},
	{
		id: 'lock',
		png: 'none-sequencer-lock.png',
		title: 'M3 · a step held, cutoff locked',
		page: 'lock',
		note: OURS,
		setup: (sim) => {
			sim.press('track.3');
			place(sim, 'c4', [1, 5, 9, 13]);
			sim.press('key.m3');
			hold(sim, 'step.5');
			sim.turn(1, -40);
			sim.turn(2, 30);
		}
	}
];
