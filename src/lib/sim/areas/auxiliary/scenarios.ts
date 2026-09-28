/**
 * Simulator states for the auxiliary area (see `../../scenarios.ts`): TE's guide art where it drew
 * a page, and the pages only the device showed (`png: null`). The pages are drawn as the owner's
 * device draws them on OS 1.1.33 (docs/research/59-screen-profiling.md §2.13), so they differ from
 * TE's art where the device does; each note says how.
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

/** How the device's brain page differs from TE's picture. */
const BRAIN_DEVICE =
	'The device draws the band in the FX page’s greys (a white card, the root box dark, the scale box ' +
	'mid grey, the link box white), labels the link “link” and shows root and scale only while set by ' +
	'hand.';

const DEVICE = 'TE’s guide has no picture of this page; drawn after the device as a camera saw it.';

export const scenarios: readonly Scenario[] = [
	{
		id: 'aux-brain',
		png: 'auxiliary-004-brain-track.png',
		title: 'aux T1 · brain',
		page: 'aux-brain',
		note: `The brain keyboard’s C moves the song in c# lydian to c lydian (the title), set by hand. ${OCTAVE_DOTS} ${BRAIN_DEVICE}`,
		setup: (sim) => {
			const a = aux(sim, 1);
			Object.assign(a.brain.patterns[0], { auto: false, key: 1, scale: 3, link: 5 });
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
			'C moves it to c. TE drew this picture in its later, lighter palette, as the device draws the ' +
			`page; automatic, the device leaves the root and scale boxes empty. ${OCTAVE_DOTS}`,
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
		note:
			'TE’s dot matrix without TE’s dog: idle, the device runs one lit dot along it as a heartbeat ' +
			'trace, here at the top of its spike (b1-892), and its dots are 10 px across where TE drew 11.',
		setup: (sim) => {
			aux(sim, 2);
			sim.advance(1340);
		}
	},
	{
		id: 'aux-midi',
		png: 'auxiliary-031-external-midi-track.png',
		title: 'aux T3 · external midi',
		page: 'aux-midi',
		note:
			'The device writes the channel in two digits in narrower, taller figures, keeps only the lower ' +
			'arrow and no soft labels, and draws the band white with the channel on black.',
		setup: (sim) => {
			Object.assign(aux(sim, 3).midi, { channel: 16, bank: null, program: 8 });
		}
	},
	{
		id: 'aux-cv',
		png: 'auxiliary-057-external-cv-track.png',
		title: 'aux T4 · external cv',
		page: 'aux-cv',
		note:
			'The needle shows the last note at 1 V per octave from C4: TE’s −3.9 V is note 13 (C#0). The ' +
			'device’s meter has a white body and a white needle; its scale is set in the heavier weight.',
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
		note:
			'Switched on, as TE drew it; the device was seen only with the mic off, crossed in red under ' +
			'“fdbk block”. Its drive reads 00–20.',
		setup: (sim) => {
			Object.assign(aux(sim, 5).audio, { input: 0, on: true, drive: 20, level: 75, mix: 75 });
		}
	},
	{
		id: 'aux-tape',
		png: 'auxiliary-099-tape-track.png',
		title: 'aux T6 · tape',
		page: 'aux-tape',
		note:
			'Hits on the tape come from routed tracks’ notes; with none routed the strip is clear, where ' +
			'TE’s art shows a few. The dots are the keys held (F#4, then E4). The device writes the speed ' +
			'in percent by the reels, “mix” over its box, the pitch (x2) at the keyboard’s left and the ' +
			'loop length right of the keys, where TE’s art had the clip number.',
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
			'that do not match its own bars. The device labels each column in 12 px heavy, draws an 8 px ' +
			'marker at the value (white on the ink column) and one line on each edge strip.',
		setup: (sim) => {
			aux(sim, 7).fx[0] = { type: 'chorus', params: [78, 17, 37, 74] };
		}
	},
	{
		id: 'aux-brain-routing',
		png: null,
		title: 'aux T1 · M2 brain routing',
		page: 'aux-route',
		note: `${DEVICE} Tracks 3–8 routed in, as in a new project (b1-4009…4031).`,
		setup: (sim) => {
			aux(sim, 1, 2);
		}
	},
	{
		id: 'aux-punch-key',
		png: null,
		title: 'aux T2 · punch-in key held',
		page: 'aux-punch',
		note: `${DEVICE} F3 held: a frame of its waving hand (b1-899), which the device animates.`,
		setup: (sim) => {
			aux(sim, 2);
			hold(sim, 'keyboard.f3');
		}
	},
	{
		id: 'aux-midi-set',
		png: null,
		title: 'aux T3 · M2 CC slots',
		page: 'aux-cc',
		note: `${DEVICE} Slot 1 sends CC 9, the others are off (b1-4124).`,
		setup: (sim) => {
			aux(sim, 3, 2).midi.slots[0] = { cc: 9, value: 0 };
		}
	},
	{
		id: 'aux-midi-lfo',
		png: null,
		title: 'aux T3 · M4 lfo',
		page: 'aux-lfo',
		note: `${DEVICE} Switched on; aimed at nothing, it reads “no cc set” (steps-788).`,
		setup: (sim) => {
			aux(sim, 3, 4).pages[2].lfo.on = true;
		}
	},
	{
		id: 'aux-audio-routing',
		png: null,
		title: 'aux T5 · M2 aux out routing',
		page: 'aux-route',
		note: `${DEVICE} Track 5 sent out at 39 (b1-4320).`,
		setup: (sim) => {
			aux(sim, 5, 2);
			sim.state.tracks.forEach((t, i) => (t.sends[0] = i === 4 ? 39.4 : 0));
		}
	},
	{
		id: 'aux-audio-filter',
		png: null,
		title: 'aux T5 · M3 filter',
		page: 'aux-filter',
		note: `${DEVICE} Switched on, the high-pass at half its lane (steps-889).`,
		setup: (sim) => {
			const p = aux(sim, 5, 3).pages[4];
			Object.assign(p, { filterOn: true, highpass: 49.9 });
		}
	},
	{
		id: 'aux-audio-lfo',
		png: null,
		title: 'aux T5 · M4 lfo',
		page: 'aux-lfo',
		note: `${DEVICE} Aimed at the filter’s high-pass, free and fast, full amount (steps-927).`,
		setup: (sim) => {
			const l = aux(sim, 5, 4).pages[4].lfo;
			Object.assign(l, { on: true, speed: 111, amount: 99, destination: 1, parameter: 0 });
		}
	},
	{
		id: 'aux-fx-delay',
		png: null,
		title: 'aux T7 · fx I delay',
		page: 'aux-fx',
		note: `${DEVICE} A new project’s delay: 1/8 dotted (steps-999).`,
		setup: (sim) => {
			aux(sim, 7);
		}
	},
	{
		id: 'aux-fx-list',
		png: null,
		title: 'aux T7 · effect list',
		page: 'aux-fx-list',
		note: `${DEVICE} shift + T7 on the delay (b1-4649).`,
		setup: (sim) => {
			aux(sim, 7);
			sim.combo('key.shift', 'track.7');
		}
	}
];
