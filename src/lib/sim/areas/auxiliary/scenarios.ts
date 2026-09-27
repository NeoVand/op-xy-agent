/**
 * Simulator states that reproduce TE's guide art for the auxiliary area (see `../../scenarios.ts`).
 */
import type { OpxySim } from '../../opxy-sim.svelte';
import type { PageNumber } from '../../params';
import type { Scenario } from '../../scenarios';
import { currentPattern, toggleStep } from '../../sequencer';

/** Opens auxiliary track `n` (1–8) on M-page `page` and returns the area's state. */
function aux(sim: OpxySim, n: number, page: PageNumber = 1) {
	sim.press('key.auxiliary');
	sim.press(`track.${n}`);
	sim.press(`key.m${page}`);
	return sim.state.areas.auxiliary;
}

/** Holds a key without releasing it (the art shows it down). */
const hold = (sim: OpxySim, id: string) => sim.input({ type: 'press', id });

const OCTAVE_DOTS =
	'The octave dots mark the scale in force; the dots in TE’s art follow no scale.';

export const scenarios: readonly Scenario[] = [
	{
		id: 'aux-brain',
		png: 'auxiliary-004-brain-track.png',
		title: 'aux T1 · brain',
		page: 'aux-brain',
		note: `The brain keyboard’s C moves the song in c# lydian to c lydian (the title). ${OCTAVE_DOTS}`,
		setup: (sim) => {
			const a = aux(sim, 1);
			Object.assign(a.brain.patterns[0], { key: 1, scale: 3, link: 5 });
			sim.press('keyboard.c4');
		}
	},
	{
		id: 'aux-brain-song',
		png: 'how-to-102-you-ll-notice-in-the-brain-that-the-key.png',
		title: 'aux T1 · brain after recording',
		page: 'aux-brain',
		note:
			'The brain detects c# lydian from a progression recorded on track 3, then the brain keyboard’s ' +
			'C moves it to c. TE drew this picture in its later, lighter palette (a white band, a blue-black ' +
			`root box); we keep the greys of the track’s own picture, auxiliary-004. ${OCTAVE_DOTS}`,
		setup: (sim) => {
			// c# most often, and every note of c# lydian once (g# major's notes, rooted on c#)
			const pattern = currentPattern(sim.state.tracks[2].sequence);
			const notes: [number, number][] = [
				[0, 61],
				[2, 63],
				[4, 61],
				[6, 65],
				[8, 61],
				[10, 67],
				[12, 68],
				[14, 70],
				[15, 72]
			];
			for (const [step, note] of notes) toggleStep(pattern, step, [note]);
			aux(sim, 1);
			sim.press('keyboard.c4');
		}
	},
	{
		id: 'aux-punch',
		png: 'auxiliary-021-punch-in-fx-track.png',
		title: 'aux T2 · punch-in fx',
		page: 'aux-punch',
		setup: (sim) => {
			aux(sim, 2);
		}
	},
	{
		id: 'aux-midi',
		png: 'auxiliary-031-external-midi-track.png',
		title: 'aux T3 · external midi',
		page: 'aux-midi',
		setup: (sim) => {
			Object.assign(aux(sim, 3).midi, { channel: 16, bank: null, program: 8 });
		}
	},
	{
		id: 'aux-cv',
		png: 'auxiliary-057-external-cv-track.png',
		title: 'aux T4 · external cv',
		page: 'aux-cv',
		note: 'The needle shows the last note at 1 V per octave from C4: TE’s −3.9 V is note 13 (C#0).',
		setup: (sim) => {
			aux(sim, 4);
			sim.state.aux[3].sequence.lastNote = 13;
		}
	},
	{
		id: 'aux-audio',
		png: 'auxiliary-064-external-audio-track.png',
		title: 'aux T5 · external audio',
		page: 'aux-audio',
		setup: (sim) => {
			Object.assign(aux(sim, 5).audio, { input: 0, on: true, drive: 25, level: 75, mix: 75 });
		}
	},
	{
		id: 'aux-tape',
		png: 'auxiliary-099-tape-track.png',
		title: 'aux T6 · tape',
		page: 'aux-tape',
		note:
			'Hits on the tape come from routed tracks’ notes; with none routed the strip is clear, where ' +
			'TE’s art shows a few. The dots are the keys held (F#4, then E4: clip 12).',
		setup: (sim) => {
			Object.assign(aux(sim, 6).tape, { pitch: 2, speed: 84, length: 3, mix: 72 });
			hold(sim, 'keyboard.fs4');
			hold(sim, 'keyboard.e4');
			// the head halfway along the three-beat loop
			sim.state.transport.position = 6.07;
		}
	},
	{
		id: 'aux-fx',
		png: 'auxiliary-130-fx-tracks.png',
		title: 'aux T7 · fx I chorus',
		page: 'aux-fx',
		note:
			'Values read 0–99 at the heights of TE’s bars; the art writes units (10 ms, 10 us) and numbers ' +
			'that do not match its own bars.',
		setup: (sim) => {
			aux(sim, 7).fx[0] = { type: 'chorus', params: [78, 17, 37, 74] };
		}
	}
];
