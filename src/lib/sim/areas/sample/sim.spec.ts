import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import type { ScreenFrame } from '../../screen/frame';
import type { SampleLibraryFrame, SampleRecordFrame } from './frames';
import { inputLevel, recordingStart, timerText } from './record';
import { formatGain } from './sim';
import { MAX_SECONDS } from './state';
import { UNIT_SECONDS, decodeWave } from './wave';

/** A simulator with a clock the test moves. */
function rig() {
	const clock = { t: 0 };
	const sim = new OpxySim({ now: () => clock.t });
	/** Moves both the simulator's time and the context clock. */
	const wait = (ms: number) => {
		clock.t += ms;
		sim.advance(ms);
	};
	return { sim, clock, wait };
}

function page<P extends ScreenFrame['page']>(sim: OpxySim, name: P) {
	const frame = sim.frame;
	expect(frame.page).toBe(name);
	return frame as Extract<ScreenFrame, { page: P }>;
}

const record = (sim: OpxySim) => page(sim, 'sample-record') as SampleRecordFrame;
const library = (sim: OpxySim) => page(sim, 'sample-library') as SampleLibraryFrame;

describe('the sample key (manual: sampler/sampling)', () => {
	it('opens the record page for the track’s engine', () => {
		const { sim } = rig();
		sim.press('key.sample');
		expect(record(sim)).toMatchObject({ target: 'drum', header: 'timer', timer: '20:00' });
		sim.press('track.3');
		expect(record(sim)).toMatchObject({ target: 'library', header: 'prompt', name: null });
		sim.press('track.8');
		expect(record(sim).target).toBe('multisampler');
		expect(record(sim).keyboard).not.toBeNull();
	});

	it('shows the synth sampler’s prompt and the sample a take replaces, with no soft keys', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		sim.press('key.sample');
		expect(record(sim)).toMatchObject({
			target: 'sampler',
			header: 'prompt',
			name: 'keys c4.wav',
			nameTone: 'light',
			soft: { record: false, play: null, arrows: false, clear: null }
		});
	});

	it('closes with the lit track key or the sample key again, from any mode', () => {
		const { sim } = rig();
		sim.press('key.mix');
		sim.press('key.sample');
		expect(sim.frame.page).toBe('sample-record');
		sim.press('track.1');
		expect(sim.frame.page).toBe('mix');
		sim.press('key.sample');
		sim.press('key.sample');
		expect(sim.state.overlay).toBeNull();
	});

	it('turns the source, input channel (shift), gain and threshold', () => {
		const { sim } = rig();
		sim.press('key.sample');
		sim.turn(1, 1);
		expect(record(sim).source).toBe('line in');
		sim.input({ type: 'press', id: 'key.shift' });
		sim.turn(1, 1);
		expect(record(sim)).toMatchObject({ channel: '1', gain: '0' });
		sim.input({ type: 'release', id: 'key.shift' });
		expect(record(sim).channel).toBeNull();
		sim.turn(3, 11);
		expect(record(sim).gain).toBe('+11');
		sim.turn(3, -40);
		expect(record(sim).gain).toBe('–24');
		sim.turn(4, 27);
		expect(record(sim).threshold).toBeCloseTo(47 / 99);
		sim.turn(1, -5);
		expect(record(sim).source).toBe('mic');
	});

	it('formats gain and the timer like the screen', () => {
		expect(formatGain(11)).toBe('+11');
		expect(formatGain(0)).toBe('0');
		expect(formatGain(-6.4)).toBe('–6');
		expect(timerText(0)).toBe('20:00');
		expect(timerText(6070)).toBe('13:93');
		expect(timerText(25000)).toBe('00:00');
	});
});

describe('recording', () => {
	it('waits for the threshold, counts down while recording and keeps the take', () => {
		const { sim, wait } = rig();
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 99;
		sim.input({ type: 'press', id: 'key.m1' });
		expect(record(sim)).toMatchObject({ armed: true, recording: false, timer: '20:00' });
		// a threshold the input never reaches: nothing is kept
		wait(3000);
		sim.input({ type: 'release', id: 'key.m1' });
		expect(sim.state.areas.sample.user).toHaveLength(0);

		sim.state.areas.sample.record.threshold = 20;
		sim.input({ type: 'press', id: 'key.m1' });
		wait(4000);
		const live = record(sim);
		expect(live.recording).toBe(true);
		expect(live.timer).not.toBe('20:00');
		expect(decodeWave(live.wave).some((v) => v > 0)).toBe(true);
		sim.input({ type: 'release', id: 'key.m1' });
		const area = sim.state.areas.sample;
		expect(area.user.map((f) => f.name)).toEqual(['take 1.wav']);
		// the take lands on the selected drum key, and plays while held when it is long
		expect(area.tracks[0].keys[0]?.name).toBe('take 1.wav');
		expect(area.tracks[0].keys[0]?.peaks?.channels[0].length).toBeGreaterThan(10);
		expect(sim.state.tracks[0].drumKeys[0]).toMatchObject({ start: 0, end: 99, playMode: 'key' });
		expect(record(sim)).toMatchObject({ name: 'take 1.wav', recording: false, armed: false });
	});

	it('measures time from the context clock when the app’s clock does not run', () => {
		const { sim, clock } = rig();
		sim.press('key.sample');
		sim.input({ type: 'press', id: 'key.m1' });
		clock.t += 5000;
		sim.input({ type: 'release', id: 'key.m1' });
		const take = sim.state.areas.sample.user[0];
		expect(take).toBeDefined();
		expect(take.seconds).toBeGreaterThan(3);
		expect(take.seconds).toBeLessThanOrEqual(5);
	});

	it('stops by itself after 20 seconds', () => {
		const { sim, wait } = rig();
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'key.m1' });
		for (let i = 0; i < 25; i++) wait(1000);
		const area = sim.state.areas.sample;
		expect(area.record.trigger).toBeNull();
		expect(area.user[0].seconds).toBe(MAX_SECONDS);
		sim.input({ type: 'release', id: 'key.m1' });
		expect(area.user).toHaveLength(1);
	});

	it('tunes the synth sampler to the key that started it', () => {
		const { sim, wait } = rig();
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'keyboard.a3' });
		wait(2000);
		sim.input({ type: 'release', id: 'keyboard.a3' });
		const synth = sim.state.areas.sample.tracks[2].synth;
		expect(synth.root).toBe(57);
		expect(synth.file?.name).toBe('take 1.wav');
		expect(synth.region).toMatchObject({ loopStart: 0.2, loopEnd: 0.8, loop: 'forever' });
	});

	it('records multisampler zones on the keys it is given, at the keyboard’s octave', () => {
		const { sim, wait } = rig();
		sim.press('track.8');
		sim.press('key.plus');
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 0;
		sim.press('keyboard.c4');
		sim.input({ type: 'press', id: 'key.m1' });
		wait(1500);
		sim.input({ type: 'release', id: 'key.m1' });
		const zones = sim.state.areas.sample.tracks[7].zones;
		expect(zones.map((z) => z.note)).toEqual([57, 64, 71, 72, 76]);
		expect(record(sim).keyboard).toMatchObject({ low: 65, selected: 72, zone: { lo: 72, hi: 72 } });
	});

	it('plays and deletes a take on the library record page (M2, M4)', () => {
		const { sim, wait } = rig();
		sim.press('track.3');
		sim.press('key.sample');
		expect(record(sim).soft).toMatchObject({ record: true, play: false, clear: false });
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'key.m1' });
		wait(1000);
		sim.input({ type: 'release', id: 'key.m1' });
		expect(record(sim).soft).toMatchObject({ play: true, clear: true });
		sim.press('key.m2');
		expect(sim.state.areas.sample.record.playing).toBe(true);
		wait(1500);
		expect(sim.state.areas.sample.record.playing).toBe(false);
		sim.press('key.m2');
		sim.press('key.m4');
		expect(sim.state.areas.sample.user).toHaveLength(0);
		expect(record(sim).name).toBeNull();
	});

	it('keeps a take when the page closes before the key comes up', () => {
		const { sim, wait } = rig();
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'key.m1' });
		wait(1000);
		sim.press('key.tempo');
		sim.input({ type: 'release', id: 'key.m1' });
		expect(sim.state.areas.sample.user).toHaveLength(1);
	});

	it('follows the stand-in input: TE’s demo on a 20 s loop, louder with gain', () => {
		expect(inputLevel(0, 0)).toBeCloseTo(0.25 / 16);
		expect(inputLevel(6 * UNIT_SECONDS * 1000, 0)).toBeCloseTo(0.25);
		expect(inputLevel(6 * UNIT_SECONDS * 1000, 24)).toBe(1);
		expect(inputLevel(20000 + 6 * UNIT_SECONDS * 1000, 0)).toBeCloseTo(0.25);
		// at 0 dB a threshold of 20 waits for the roll's first spike
		const rec = {
			...rig().sim.state.areas.sample.record,
			trigger: 'key.m1',
			held: 1000,
			threshold: 20
		};
		expect(recordingStart(rec)).toBeCloseTo(6 * UNIT_SECONDS * 1000, 0);
		expect(recordingStart({ ...rec, held: 100 })).toBeNull();
	});
});

describe('keys on the drum sampler and multisampler record pages', () => {
	it('selects keys, steps through filled ones (M2, M3) and clears (M4)', () => {
		const { sim } = rig();
		const st = sim.state.areas.sample.tracks[0];
		st.keys = st.keys.map((f, i) => (i % 5 === 0 ? f : null));
		sim.press('key.sample');
		sim.press('keyboard.gs3');
		expect(sim.state.tracks[0].drumKey).toBe(3);
		expect(record(sim).name).toBeNull();
		expect(record(sim).soft.clear).toBe(false);
		sim.press('key.m3');
		expect(sim.state.tracks[0].drumKey).toBe(5);
		sim.press('key.m2');
		sim.press('key.m2');
		expect(sim.state.tracks[0].drumKey).toBe(0);
		sim.press('key.m2');
		expect(sim.state.tracks[0].drumKey).toBe(0);
		sim.press('key.m4');
		expect(st.keys[0]).toBeNull();
	});

	it('lights the selected key and dims the keys that hold samples', () => {
		const { sim } = rig();
		const st = sim.state.areas.sample.tracks[0];
		st.keys = st.keys.map((f, i) => (i < 2 ? f : null));
		sim.press('key.sample');
		expect(sim.leds['keyboard.f3']).toBe('white');
		expect(sim.leds['keyboard.fs3']).toBe('dim');
		expect(sim.leds['keyboard.g3']).toBe('off');
	});

	it('clears the multisampler zone the selected key plays', () => {
		const { sim } = rig();
		sim.press('track.8');
		sim.press('key.sample');
		sim.press('keyboard.e4');
		sim.press('key.m4');
		expect(sim.state.areas.sample.tracks[7].zones.map((z) => z.note)).toEqual([57, 71, 76]);
		// D4 now falls in B4's zone, which clear removes in turn
		sim.press('keyboard.d4');
		expect(record(sim).keyboard?.zone).toEqual({ lo: 58, hi: 71 });
		sim.press('key.m4');
		expect(sim.state.areas.sample.tracks[7].zones.map((z) => z.note)).toEqual([57, 76]);
	});
});

describe('the sample library (manual: sampler/sample-library)', () => {
	it('opens with shift + sample on the folders and samples TE’s art shows', () => {
		const { sim } = rig();
		sim.combo('key.shift', 'key.sample');
		const lib = library(sim);
		expect(lib.folders.items.slice(0, 8)).toEqual([
			'bass',
			'drum',
			'keys',
			'lead',
			'organ',
			'pad',
			'pluck',
			'sampler'
		]);
		expect(lib.folders.selected).toBe(0);
		expect(lib.files.items[2]).toBe('cherry');
		expect(lib.files.thumb.size).toBeCloseTo(8 / 18);
		expect(lib.keyControls).toBe(true);
		expect(lib.tile).not.toBeNull();
	});

	it('browses with E1 (folder) and E2–E4 (sample), previewing as it lands', () => {
		const { sim } = rig();
		sim.combo('key.shift', 'key.sample');
		sim.turn(3, 5);
		expect(library(sim).files.items[library(sim).files.selected ?? -1]).toBe('grits');
		expect(sim.state.areas.sample.library.previewing).toBe(true);
		sim.press('key.stop');
		expect(sim.state.areas.sample.library.previewing).toBe(false);
		sim.turn(1, 1);
		expect(library(sim).files.items.slice(0, 2)).toEqual(['[kit 1]', '[kit 2]']);
		expect(library(sim).tile).toBeNull();
	});

	it('enters sub-folders with a click, goes back up with M1, and loads a sample', () => {
		const { sim } = rig();
		sim.combo('key.shift', 'key.sample');
		sim.turn(1, 1);
		sim.turn(2, 1);
		sim.click(3);
		expect(library(sim).folders.items[library(sim).folders.selected ?? -1]).toBe('kit 2');
		expect(library(sim).files.items[0]).toBe('kick 1');
		sim.press('key.m1');
		expect(library(sim).files.items[library(sim).files.selected ?? -1]).toBe('[kit 2]');
		sim.click(2);
		sim.turn(2, 2);
		sim.press('keyboard.a3');
		sim.click(4);
		const key = sim.state.areas.sample.tracks[0].keys[4];
		expect(key?.id).toBe('drum/kit 2/snare 1.wav');
		expect(sim.state.tracks[0].drumKeys[4]).toMatchObject({ start: 0, end: 99 });
	});

	it('browses for the held key (key + sample) and steps keys with M2 / M3, clears with M4', () => {
		const { sim } = rig();
		sim.input({ type: 'press', id: 'keyboard.b3' });
		sim.press('key.sample');
		sim.input({ type: 'release', id: 'keyboard.b3' });
		expect(sim.frame.page).toBe('sample-library');
		expect(sim.state.tracks[0].drumKey).toBe(6);
		expect(sim.leds['keyboard.b3']).toBe('white');
		sim.press('key.m3');
		expect(sim.state.tracks[0].drumKey).toBe(7);
		sim.press('key.m4');
		expect(sim.state.areas.sample.tracks[0].keys[7]).toBeNull();
		sim.press('key.sample');
		expect(sim.frame.page).toBe('sample-record');
	});

	it('loads into the synth sampler (root from the file) and the multisampler (a zone on the key)', () => {
		const { sim } = rig();
		sim.press('track.3');
		sim.state.tracks[2].engine = 'sampler';
		sim.combo('key.shift', 'key.sample');
		expect(library(sim).keyControls).toBe(false);
		sim.turn(2, 1);
		sim.click(1);
		expect(sim.state.areas.sample.tracks[2].synth.file?.name).toBe('apes are us.wav');
		sim.press('track.8');
		sim.combo('key.shift', 'key.sample');
		sim.press('keyboard.c4');
		sim.click(1);
		const zones = sim.state.areas.sample.tracks[7].zones;
		expect(zones.find((z) => z.note === 60)?.file.name).toBe('apes are us.wav');
	});

	it('only previews on tracks without a sampler', () => {
		const { sim } = rig();
		sim.press('track.4');
		sim.combo('key.shift', 'key.sample');
		sim.click(1);
		expect(sim.state.areas.sample.tracks[3].synth.file?.name).toBe('keys c4.wav');
		expect(library(sim).keyControls).toBe(false);
	});

	it('lists recordings in the user folder', () => {
		const { sim, wait } = rig();
		sim.press('key.sample');
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'key.m1' });
		wait(800);
		sim.input({ type: 'release', id: 'key.m1' });
		sim.combo('key.shift', 'key.sample');
		sim.turn(1, 8);
		expect(library(sim).files.items).toEqual(['take 1']);
	});
});

describe('the keyboard octave', () => {
	it('follows − and + (without shift) and passes them on', () => {
		const { sim } = rig();
		sim.press('key.plus');
		sim.press('key.plus');
		sim.press('key.minus');
		expect(sim.state.areas.sample.octave).toBe(1);
		sim.combo('key.shift', 'key.plus');
		expect(sim.state.areas.sample.octave).toBe(1);
		for (let i = 0; i < 10; i++) sim.press('key.minus');
		expect(sim.state.areas.sample.octave).toBe(-4);
	});
});
