/**
 * The sample area in a real browser, where the simulator's state is a deep Svelte `$state` proxy
 * (the server tests run it as plain objects): a take saved to a key and the user folder at once,
 * measured peaks reaching every copy, the slicer filling keys, the library loading a sample, and
 * the record page's frame following the recorder.
 */
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { OpxySim } from '../../opxy-sim.svelte';
import { SCENARIOS } from '../../scenarios';
import type { DrumFrame } from '../../screen/frame';
import { demoFile } from './demo';
import { attachPeaks, samplesInUse } from './hook';
import { decodeWave, peaksFromChannels } from './wave';

/** A simulator with a clock the test moves. */
function rig() {
	const clock = { t: 0 };
	const sim = new OpxySim({ now: () => clock.t });
	const wait = (ms: number) => {
		clock.t += ms;
		sim.advance(ms);
	};
	return { sim, wait };
}

/** Records for `ms` on the open record page with the threshold at 0. */
function take(sim: OpxySim, wait: (ms: number) => void, ms: number): void {
	sim.state.areas.sample.record.threshold = 0;
	sim.input({ type: 'press', id: 'key.m1' });
	wait(ms);
	sim.input({ type: 'release', id: 'key.m1' });
}

describe('the sample area with reactive state', () => {
	it('keeps a take on the drum key and in the user folder, and measured peaks reach both', () => {
		const { sim, wait } = rig();
		sim.press('key.sample');
		take(sim, wait, 1500);
		const area = sim.state.areas.sample;
		expect(area.user.map((f) => f.name)).toEqual(['take 1.wav']);
		expect(area.tracks[0].keys[0]?.name).toBe('take 1.wav');
		expect(area.tracks[0].keys[0]?.peaks?.channels[0].length).toBeGreaterThan(10);
		expect(sim.state.tracks[0].drumKeys[0]).toMatchObject({ start: 0, end: 99 });

		const audio = Float32Array.from({ length: 4410 }, (_, i) => (i < 441 ? 1 : 0));
		expect(attachPeaks(area, 'user/take 1.wav', peaksFromChannels([audio], 44100, 100), 0.1)).toBe(
			2
		);
		expect(area.user[0].seconds).toBe(0.1);
		sim.press('key.sample');
		const lane = decodeWave((sim.frame as DrumFrame).sampler?.waves?.[0] ?? '');
		expect(lane.slice(0, 20).every((v) => v === 16)).toBe(true);
		expect(samplesInUse(area).filter((f) => f.id === 'user/take 1.wav')).toHaveLength(1);
	});

	it('plays and deletes the library record page’s take', () => {
		const { sim, wait } = rig();
		sim.press('track.3');
		sim.press('key.sample');
		take(sim, wait, 1000);
		const area = sim.state.areas.sample;
		expect(area.record.take?.name).toBe('take 1.wav');
		sim.press('key.m2');
		expect(area.record.playing).toBe(true);
		wait(1500);
		expect(area.record.playing).toBe(false);
		sim.press('key.m4');
		expect(area.user).toHaveLength(0);
		expect(area.record.take).toBeNull();
	});

	it('slices a key and fills the keyboard with copies that choke each other', () => {
		const { sim } = rig();
		sim.state.areas.sample.tracks[0].keys[0] = demoFile(20);
		Object.assign(sim.state.tracks[0].drumKeys[0], { start: 0, end: 33 });
		sim.input({ type: 'press', id: 'keyboard.f3' });
		sim.press('key.m1');
		sim.input({ type: 'release', id: 'keyboard.f3' });
		expect(sim.frame.page).toBe('sample-slice');
		sim.turn(4, -5);
		sim.press('key.m4');
		expect(sim.frame.page).toBe('drum');
		const keys = sim.state.areas.sample.tracks[0].keys;
		expect(keys.slice(0, 3).map((k) => k?.name)).toEqual(Array(3).fill('ch mart b.wav'));
		expect(sim.state.tracks[0].drumKeys.slice(0, 3).map((k) => k.playMode)).toEqual(
			Array(3).fill('mute group')
		);
		expect(keys[3]?.name).toBe('snare 2.wav');
	});

	it('browses the library into a kit and loads a sound onto the chosen key', () => {
		const { sim } = rig();
		sim.combo('key.shift', 'key.sample');
		sim.turn(1, 1);
		sim.turn(2, 1);
		sim.click(3);
		sim.turn(2, 2);
		sim.press('keyboard.a3');
		sim.click(4);
		expect(sim.state.areas.sample.tracks[0].keys[4]?.id).toBe('drum/kit 2/snare 1.wav');
	});

	it('updates the record page as the recorder runs', () => {
		const { sim, wait } = rig();
		const timers: string[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				const frame = sim.frame;
				if (frame.page === 'sample-record') timers.push(frame.timer);
			});
		});
		sim.press('key.sample');
		flushSync();
		sim.state.areas.sample.record.threshold = 0;
		sim.input({ type: 'press', id: 'key.m1' });
		for (let i = 0; i < 3; i++) {
			wait(1000);
			flushSync();
		}
		sim.input({ type: 'release', id: 'key.m1' });
		flushSync();
		stop();
		expect(timers[0]).toBe('20:00');
		expect(timers).toContain('17:00');
		expect(sim.state.areas.sample.user).toHaveLength(1);
	});

	it('reaches every sample scenario’s page', () => {
		const ids = (id: string) => id === 'sampler' || id === 'drum' || id.startsWith('sample-');
		const scenarios = SCENARIOS.filter((s) => ids(s.id));
		expect(scenarios).toHaveLength(13);
		for (const scenario of scenarios) {
			const sim = new OpxySim({ now: () => 0 });
			scenario.setup(sim);
			expect(sim.frame.page, scenario.id).toBe(scenario.page);
		}
	});
});
