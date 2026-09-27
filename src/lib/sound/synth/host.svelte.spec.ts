// The synth core in a real AudioWorklet (Chromium, offline rendering): the engine hands a synth
// track's notes to the worklet, which plays them on that track's channel, lets them go on time and
// reports them ended; the Web Audio voices keep the engines the core does not play.
import { describe, expect, it } from 'vitest';
import { defaultTrack, type TrackState } from '$lib/sim/params';
import { SoundEngine } from '../engine';
import { SynthHost } from './host';
import workletUrl from './worklet?worker&url';

const SR = 48000;

/** RMS of the left channel between `from` and `to` seconds. */
function rms(buffer: AudioBuffer, from: number, to: number): number {
	const data = buffer.getChannelData(0).subarray(Math.round(from * SR), Math.round(to * SR));
	let sum = 0;
	for (const v of data) sum += v * v;
	return Math.sqrt(sum / Math.max(1, data.length));
}

async function render(
	seconds: number,
	play: (engine: SoundEngine, host: SynthHost) => void,
	engines = new Set(['prism'] as const)
) {
	const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
	const host = await SynthHost.create(context, workletUrl);
	expect(host).not.toBeNull();
	const errors: string[] = [];
	host!.node.onprocessorerror = (e) => errors.push(String(e));
	const engine = new SoundEngine({ context });
	engine.useSynth(host, engines);
	play(engine, host!);
	// an offline context renders faster than the port delivers: let the messages arrive first
	await new Promise((resolve) => setTimeout(resolve, 50));
	const buffer = await context.startRendering();
	expect(errors).toEqual([]);
	// let the worklet's replies land
	await new Promise((resolve) => setTimeout(resolve, 50));
	return { buffer, engine };
}

const prism = (): TrackState => defaultTrack('prism');

describe('the synth core in its worklet', () => {
	it('plays a sequenced note on time and lets it go', async () => {
		const { buffer, engine } = await render(1, (engine) => {
			engine.noteOn({
				track: 2,
				settings: prism(),
				note: 57,
				velocity: 100,
				time: 0.2,
				duration: 0.3
			});
		});
		expect(rms(buffer, 0, 0.19)).toBe(0);
		expect(rms(buffer, 0.25, 0.45)).toBeGreaterThan(0.02);
		expect(rms(buffer, 0.7, 1)).toBeLessThan(1e-3);
		// the core said the voice ended, so the engine let go of it
		expect(engine.voices).toBe(0);
	});

	it('holds a live note until its key comes up', async () => {
		const { buffer } = await render(1, (engine) => {
			engine.noteOn({
				track: 0,
				settings: prism(),
				note: 60,
				velocity: 100,
				time: 0,
				key: 'keyboard.c4'
			});
			engine.noteOff(0, 'keyboard.c4', 0.5);
		});
		expect(rms(buffer, 0.3, 0.45)).toBeGreaterThan(0.02);
		expect(rms(buffer, 0.7, 1)).toBeLessThan(1e-3);
	});

	it('leaves the engines it does not play to the Web Audio voices', async () => {
		const { buffer } = await render(0.5, (engine) => {
			engine.noteOn({
				track: 3,
				settings: defaultTrack('epiano'),
				note: 60,
				velocity: 100,
				time: 0,
				duration: 0.3
			});
		});
		expect(rms(buffer, 0.05, 0.25)).toBeGreaterThan(0.01);
	});

	it('runs 24 voices faster than real time', async () => {
		const seconds = 4;
		const started = performance.now();
		const { buffer } = await render(seconds, (engine) => {
			for (let v = 0; v < 24; v++) {
				engine.noteOn({
					track: v % 8,
					settings: prism(),
					note: 40 + v,
					velocity: 90,
					time: 0.05,
					duration: seconds - 0.5
				});
			}
		});
		const wall = (performance.now() - started) / 1000;
		// the render's own share: the helper waits 0.1 s around it
		const factor = seconds / Math.max(0.01, wall - 0.1);
		console.log(`24 voices: ${factor.toFixed(1)}× real time`);
		expect(rms(buffer, 1, 3)).toBeGreaterThan(0.05);
		expect(factor).toBeGreaterThan(1.5);
	});
});
