/**
 * Simulator states for the arrange area (see `../../scenarios.ts`), reached with the keys a player
 * would press: the states of TE's guide art, which the pages no longer look like (they follow the
 * device), and states of the owner's unit as the camera caught it.
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

/**
 * The owner's unit in b1-826 (research 59 §2.9): T3 selected with five patterns, the third playing,
 * a rising figure of four notes (42, 48, 58, 64 on steps 1, 5, 9, 13) on its first, in scene 2.
 */
function t3FivePatterns(sim: OpxySim): void {
	sim.press('key.arrange');
	sim.press('track.3');
	const figure = sim.state.tracks[2].sequence.patterns[0];
	[42, 48, 58, 64].forEach((note, i) => {
		figure.steps[4 * i].notes = [{ note, velocity: 100, length: 0.5, offset: 0 }];
	});
	withShift(sim, accidentalKey(2));
	for (let i = 0; i < 4; i++) sim.press(NEW);
	sim.turn(4, -2);
}

const DEVICE =
	'Drawn as the owner’s OS 1.1.33 unit draws it, measured on camera frames (docs/research/59-screen-profiling.md §2.9).';
const ART = `TE’s guide art lays this page out differently; the page follows the device instead. ${DEVICE}`;

export const scenarios: readonly Scenario[] = [
	{
		id: 'arrange-tracks',
		png: 'arrange-003-16-1-switching-tracks-and-patterns-switc.png',
		title: 'arrange · tracks and patterns',
		page: 'arrange',
		note: `${ART} The art’s M1 “clear” and M4 “new” are the other way round on the unit (M1 new, M4 clear or delete).`,
		setup: tapeTrackInScene10
	},
	{
		id: 'arrange-scenes',
		png: 'arrange-020-arrange-mode-allows-you-to-group-pattern.png',
		title: 'arrange · scenes',
		page: 'arrange',
		note: ART,
		setup: tapeTrackInScene10
	},
	{
		id: 'arrange-song',
		png: 'arrange-028-song-mode-allows-you-to-sequence-the-sce.png',
		title: 'arrange · song mode',
		page: 'song',
		note: `${ART} The unit’s count is the number of scenes in the song (08 here), and its keys light and its cursor shows only while shift is held.`,
		setup: (sim) => {
			sim.press('key.arrange');
			withShift(sim, 'key.arrange'); // song mode
			withShift(sim, naturalKey(9)); // song 9
			withShift(sim, 'key.m1'); // clear all: a new song holds scene 1
			withShift(sim, accidentalKey(0), accidentalKey(9), accidentalKey(9)); // 99
			withShift(sim, ...[1, 1, 1, 1, 3, 3, 5].map(accidentalKey));
			withShift(sim, 'key.m2', 'key.m2', 'key.m2'); // the cursor three entries back
		}
	},
	{
		id: 'arrange-device',
		png: null,
		title: 'arrange · T3’s five patterns',
		page: 'arrange',
		note: `${DEVICE} T3 is on its third pattern: the stack runs from the first above the band to the fifth below, each a ramp step darker per pattern away from the white one playing.`,
		setup: t3FivePatterns
	}
];
