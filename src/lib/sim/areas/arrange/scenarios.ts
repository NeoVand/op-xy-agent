/**
 * Simulator states that reproduce TE's guide art for the arrange area (see `../../scenarios.ts`),
 * reached with the keys a player would press.
 */
import type { OpxySim } from '../../opxy-sim.svelte';
import type { Scenario } from '../../scenarios';
import { accidentalKey, naturalKey } from './model';
import { PATTERN_KEYS } from './state';

/** Holds shift while pressing each key in turn. */
function withShift(sim: OpxySim, ...ids: string[]): void {
	sim.input({ type: 'press', id: 'key.shift' });
	for (const id of ids) sim.press(id);
	sim.input({ type: 'release', id: 'key.shift' });
}

/** The module key that adds a pattern. */
const NEW = `key.m${PATTERN_KEYS.indexOf('new') + 1}`;

/**
 * The picture of arrange-003 and arrange-020: the auxiliary tracks in scene 10; the brain plays a
 * short figure, external midi and FX I have more patterns stacked after their first, and the tape
 * track is selected with its three patterns open, the second one playing.
 */
function tapeTrackInScene10(sim: OpxySim): void {
	sim.press('key.arrange');
	sim.press('key.arrange'); // again: the auxiliary tracks
	const brain = sim.state.aux[0].sequence.patterns[0];
	[60, 60, 61, 63, 61, 61].forEach((note, i) => {
		brain.steps[4 + i].notes = [{ note, velocity: 100, length: 1, offset: 0 }];
	});
	for (const track of ['track.3', 'track.7']) {
		sim.press(track);
		for (let i = 0; i < 3; i++) sim.press(NEW);
		sim.turn(4, -3);
	}
	sim.press('track.6');
	sim.press(NEW);
	sim.press(NEW);
	sim.turn(4, -1);
	withShift(sim, accidentalKey(0), accidentalKey(1), accidentalKey(0));
}

const LABELS =
	'TE’s art labels M1 “clear” and M4 “new”, the reverse of the guide text; we follow the manual (M1 new, M4 clear) until a unit settles it (PATTERN_KEYS).';

export const scenarios: readonly Scenario[] = [
	{
		id: 'arrange-tracks',
		png: 'arrange-003-16-1-switching-tracks-and-patterns-switc.png',
		title: 'arrange · tracks and patterns',
		page: 'arrange',
		note: LABELS,
		setup: tapeTrackInScene10
	},
	{
		id: 'arrange-scenes',
		png: 'arrange-020-arrange-mode-allows-you-to-group-pattern.png',
		title: 'arrange · scenes',
		page: 'arrange',
		note: `TE redrew this picture in neutral greys (#323232 … #cdcdcd, a dimmer white) with some pictograms half lit; we keep the screen’s ramp as on every other page. ${LABELS}`,
		setup: tapeTrackInScene10
	},
	{
		id: 'arrange-song',
		png: 'arrange-028-song-mode-allows-you-to-sequence-the-sce.png',
		title: 'arrange · song mode',
		page: 'song',
		note: 'We read “count” as the slot at the cursor (06 with the cursor before the sixth entry, as drawn).',
		setup: (sim) => {
			sim.press('key.arrange');
			withShift(sim, 'key.arrange'); // song mode
			withShift(sim, naturalKey(9)); // song 9
			withShift(sim, 'key.m1'); // clear all: a new song holds scene 1
			withShift(sim, accidentalKey(0), accidentalKey(9), accidentalKey(9)); // 99
			withShift(sim, ...[1, 1, 1, 1, 3, 3, 5].map(accidentalKey));
			withShift(sim, 'key.m2', 'key.m2', 'key.m2'); // the cursor three entries back
		}
	}
];
