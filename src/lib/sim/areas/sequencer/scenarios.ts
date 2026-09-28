/**
 * Simulator states that show the sequencer area's pages (see `../../scenarios.ts`). TE's guide has
 * no picture of any of them (`png: null`): each says whether the page follows the device's own
 * screen (camera captures, research 59) or is our layout.
 */
import type { Scenario } from '../../scenarios';
import type { OpxySim } from '../../opxy-sim.svelte';
import { BAR_SLIDE_MS } from './model';

const OURS = 'No guide art for this page: our layout in TE’s visual language.';
/** A page rebuilt from camera captures of the owner's unit (research 59 §2.7, §2.8, §2.12). */
const DEVICE = 'No guide art for this page: drawn as the device draws it (camera captures).';

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
		png: null,
		title: 'bar menu (bar held)',
		page: 'bar',
		note: DEVICE,
		setup: (sim) => {
			sim.press('track.3');
			place(sim, 'c4', [1, 4, 7, 11, 13]);
			hold(sim, 'key.bar');
			sim.press('key.plus'); // a second bar
			sim.press('step.12'); // which plays 12 of its steps
			sim.turn(1, -24); // quantise 76
			sim.turn(3, 9); // groove 21
			sim.advance(BAR_SLIDE_MS); // the clear labels in place
		}
	},
	{
		id: 'components',
		png: null,
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
		png: null,
		title: 'player · arpeggio',
		page: 'player',
		note: DEVICE,
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
		png: null,
		title: 'player · maestro',
		page: 'player',
		note: DEVICE,
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
		png: null,
		title: 'M3 · a step held, cutoff locked',
		page: 'lock',
		note: `${DEVICE} The box is orange while the lock is being written.`,
		setup: (sim) => {
			sim.press('track.3');
			place(sim, 'c4', [1, 5, 9, 13]);
			sim.press('key.m3');
			hold(sim, 'step.5');
			sim.turn(1, -40);
			sim.turn(2, 30);
		}
	},
	{
		id: 'octave',
		png: null,
		title: 'octave popup ([+])',
		page: 'popup',
		note: `${DEVICE} It goes after about a second, as on the device.`,
		setup: (sim) => {
			sim.press('track.3'); // a new project's T3 plays an octave down
			sim.press('key.plus'); // +0
		}
	}
];
