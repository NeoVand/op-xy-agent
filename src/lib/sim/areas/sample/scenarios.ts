/**
 * Simulator states that reproduce TE's guide art for the sample area (see `../../scenarios.ts`).
 * The M1 pages of the synth sampler (sample-025) and drum sampler (sample-056) are the core's
 * `sampler` and `drum` scenarios; everything else the sample key leads to is here. Each state is
 * reached with the keys and encoders where the simulator can (the slicer's taps and playback are
 * timed with `advance`), and set directly where the art shows something we cannot play (the
 * input level, the multisampler's zones).
 */
import type { OpxySim } from '../../opxy-sim.svelte';
import type { Scenario } from '../../scenarios';
import { demoFile, demoInput, demoRegion, selectTrack } from './demo';
import { defaultRegion, sampleFile } from './state';

const WAVE = 'Our waveform is a stand-in drawn from a seed (no audio).';
/** The slicer's part of TE's sample: its first third (key start 0, end 33) of a 20 s take. */
const SLICED_END = 33;
/** Milliseconds per 0–1 of that part (6.67 s). */
const SLICE_MS = (20000 * SLICED_END) / 99;

/** The slicer on T1's first key, TE's sample trimmed to its first third. */
function openSlicer(sim: OpxySim): void {
	const t = selectTrack(sim, 1);
	sim.state.areas.sample.tracks[0].keys[0] = demoFile(20);
	Object.assign(t.drumKeys[0], { start: 0, end: SLICED_END });
	sim.press('key.m1');
	sim.input({ type: 'press', id: 'keyboard.f3' });
	sim.press('key.m1');
	sim.input({ type: 'release', id: 'keyboard.f3' });
}

/**
 * Plays the sliced part from the start (M1, or a tap starting it in tap mode) until the playhead
 * is `fraction` of the way through.
 */
function playFor(sim: OpxySim, fraction: number): void {
	sim.press('key.m1');
	sim.advance(fraction * SLICE_MS);
}

/** Zone tops TE's multisampler art implies (sample-100 ticks), the selected zone ending on B5. */
const MULTI_TOPS = [39, 52, 64, 83, 87, 88, 90, 92];

export const scenarios: readonly Scenario[] = [
	{
		id: 'sample-key',
		png: 'sample-003-if-you-are-already-in-a-sample-track-the.png',
		title: 'sample · synth sampler record',
		page: 'sample-record',
		note: `${WAVE} TE’s picture is a 14.74 s take (one point per card column).`,
		setup: (sim) => {
			selectTrack(sim, 3, 'sampler');
			sim.state.areas.sample.tracks[2].synth.file = demoFile(14.74);
			demoInput(sim);
			sim.press('key.sample');
		}
	},
	{
		id: 'sample-file',
		png: 'sample-004-if-you-are-not-already-in-a-sample-track.png',
		title: 'sample · record to the library',
		page: 'sample-record',
		setup: (sim) => {
			selectTrack(sim, 3);
			demoInput(sim);
			sim.press('key.sample');
		}
	},
	{
		id: 'sample-drum-record',
		png: 'sample-017-source.png',
		title: 'sample · drum sampler record',
		page: 'sample-record',
		note: `${WAVE} TE draws the soft keys and boxes in #96969b here, #afafb4 elsewhere; we use one grey.`,
		setup: (sim) => {
			selectTrack(sim, 1);
			sim.state.areas.sample.tracks[0].keys[0] = demoFile(14.74);
			demoInput(sim);
			sim.press('key.sample');
		}
	},
	{
		id: 'sample-slice',
		png: 'sample-076-slice-sample.png',
		title: 'slicer · transient (key + M1)',
		page: 'sample-slice',
		note: `${WAVE} Our transient markers sit on the steepest rise (TE puts the first one a column earlier).`,
		setup: (sim) => {
			openSlicer(sim);
			sim.turn(4, 3 - 8);
			playFor(sim, 0.24);
		}
	},
	{
		id: 'sample-transient',
		png: 'sample-080-the-transient-slice-mode-will-divide-you.png',
		title: 'slicer · transient',
		page: 'sample-slice',
		note: `${WAVE} Our transient markers sit on the steepest rise (TE puts the first one a column earlier).`,
		setup: (sim) => {
			openSlicer(sim);
			sim.turn(4, 3 - 8);
			playFor(sim, 0.24);
		}
	},
	{
		id: 'sample-even',
		png: 'sample-087-the-even-slice-mode-will-divide-your-sam.png',
		title: 'slicer · even',
		page: 'sample-slice',
		note: WAVE,
		setup: (sim) => {
			openSlicer(sim);
			sim.turn(1, 1);
			sim.turn(4, 9 - 8);
			const slicer = sim.state.areas.sample.slicer;
			if (slicer) slicer.section = { start: 5 / 480, end: 455 / 480 };
			playFor(sim, 0.215);
		}
	},
	{
		id: 'sample-tap',
		png: 'sample-094-the-tap-slice-mode-allows-you-to-tap-whe.png',
		title: 'slicer · tap',
		page: 'sample-slice',
		note: `${WAVE} The state is a second pass after tapping five points in the first.`,
		setup: (sim) => {
			openSlicer(sim);
			sim.turn(1, 2);
			// first pass: M1 starts the sample, each tap marks a point as it plays
			sim.press('key.m1');
			let at = 0;
			for (const x of [43.64, 93.65, 236.64, 292.63, 406.64]) {
				sim.advance((x / 480) * SLICE_MS - at);
				at = (x / 480) * SLICE_MS;
				sim.press('key.m1');
			}
			sim.advance(SLICE_MS);
			// second pass, part way
			playFor(sim, 0.155);
		}
	},
	{
		id: 'sample-multi-record',
		png: 'sample-100-source.png',
		title: 'sample · multisampler record',
		page: 'sample-record',
		note: `${WAVE} The zones are set to match TE’s ticks; the keyboard plays one octave up.`,
		setup: (sim) => {
			const t = selectTrack(sim, 8);
			sim.press('key.plus');
			const st = sim.state.areas.sample.tracks[7];
			st.zones = MULTI_TOPS.map((note) => ({
				note,
				file:
					note === 83
						? demoFile(14.74)
						: sampleFile(`pad ${note}.wav`, 'pad', 2.4, undefined, note),
				region: defaultRegion()
			}));
			t.drumKey = 71 - 65;
			demoInput(sim);
			sim.press('key.sample');
		}
	},
	{
		id: 'sample-multi',
		png: 'sample-113-sample-start.png',
		title: 'M1 · multisampler',
		page: 'drum',
		note: WAVE,
		setup: (sim) => {
			const t = selectTrack(sim, 8);
			sim.press('key.plus');
			const st = sim.state.areas.sample.tracks[7];
			st.zones = [
				{
					note: 64,
					file: sampleFile('pad e4.wav', 'pad', 2.4, undefined, 64),
					region: defaultRegion()
				},
				{ note: 84, file: demoFile(20), region: demoRegion() }
			];
			t.drumKey = 0;
			sim.press('key.m1');
		}
	},
	{
		id: 'sample-library',
		png: 'sample-132-open-library.png',
		title: 'sample library (shift + sample)',
		page: 'sample-library',
		note: 'The tile shows the selected sample’s own stand-in waveform.',
		setup: (sim) => {
			selectTrack(sim, 1);
			sim.combo('key.shift', 'key.sample');
			sim.turn(2, 2);
		}
	},
	{
		id: 'sample-library-keys',
		png: 'sample-140-in-the-drum-sampler-and-multisampler-you.png',
		title: 'sample library · arrows and clear',
		page: 'sample-library',
		note: 'TE dims the rest of the page to point at the arrows and clear; the device page is sample-132’s.',
		setup: (sim) => {
			selectTrack(sim, 1);
			sim.combo('key.shift', 'key.sample');
			sim.turn(2, 2);
		}
	}
];
