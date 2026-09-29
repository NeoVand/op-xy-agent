// The synth core in a real AudioWorklet (Chromium, offline rendering): the engine hands a synth
// track's notes to the worklet, which plays them on that track's channel, lets them go on time and
// reports them ended; the Web Audio voices keep the engines the core does not play.
import { describe, expect, inject, it } from 'vitest';
import type { EngineId } from '$lib/core/opxy';
import { defaultState, defaultTrack, type TrackState } from '$lib/sim/params';
import { SoundEngine } from '../engine';
import { presetGain } from '../mapping';
import { rms as levelOf } from './analysis';
import { throughCore } from './engines/audition';
import { SynthHost } from './host';
import { CORE_ENGINES } from './protocol';
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
	engines: ReadonlySet<EngineId> = new Set<EngineId>(['prism'])
) {
	const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
	const host = await SynthHost.create(context, workletUrl);
	expect(host).not.toBeNull();
	const errors: string[] = [];
	host!.node.addEventListener('processorerror', (e) => errors.push(String(e)));
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

	it('moves a sounding core note to a step’s locks and back to what it started with', async () => {
		const settings = prism();
		Object.assign(settings.filter, { on: true, cutoff: 25, resonance: 0, envAmount: 0 });
		settings.amp = { attack: 0, decay: 0, sustain: 99, release: 5 };
		const { buffer } = await render(1.2, (engine) => {
			engine.noteOn({ track: 2, settings, note: 48, velocity: 100, time: 0.05, duration: 1 });
			engine.automate(2, { 'filter.cutoff': 90 }, 0.5);
			engine.automate(2, null, 0.75);
		});
		const bright = (from: number, to: number) => {
			const data = buffer.getChannelData(0).subarray(Math.round(from * SR), Math.round(to * SR));
			let level = 0;
			let slope = 0;
			for (let i = 1; i < data.length; i++) {
				level += data[i] * data[i];
				slope += (data[i] - data[i - 1]) ** 2;
			}
			return Math.sqrt(slope / Math.max(level, 1e-12));
		};
		expect(bright(0.55, 0.7)).toBeGreaterThan(2 * bright(0.2, 0.45));
		expect(bright(0.8, 1)).toBeLessThan(bright(0.55, 0.7) / 2);
	});

	it('leaves the engines it does not play to the Web Audio voices', async () => {
		const { buffer } = await render(0.5, (engine) => {
			engine.noteOn({
				track: 3,
				settings: defaultTrack('multisampler'),
				note: 60,
				velocity: 100,
				time: 0,
				duration: 0.3
			});
		});
		expect(rms(buffer, 0.05, 0.25)).toBeGreaterThan(0.01);
	});

	it('runs 24 voices of all eight engines faster than real time', { retry: 1 }, async () => {
		const seconds = 4;
		const engines = [...CORE_ENGINES];
		const started = performance.now();
		const { buffer } = await render(
			seconds,
			(engine) => {
				for (let v = 0; v < 24; v++) {
					engine.noteOn({
						track: v % 8,
						settings: defaultTrack(engines[v % engines.length]),
						note: 40 + v,
						velocity: 90,
						time: 0.05,
						duration: seconds - 0.5
					});
				}
			},
			CORE_ENGINES
		);
		const wall = (performance.now() - started) / 1000;
		// the render's own share: the helper waits 0.1 s around it
		const factor = seconds / Math.max(0.01, wall - 0.1);
		console.log(`24 voices, all engines: ${factor.toFixed(1)}× real time`);
		expect(rms(buffer, 1, 3)).toBeGreaterThan(0.05);
		// faster than real time where it means something: a laptop does 11×. CI's shared runners,
		// with the rest of the suite beside them, have landed anywhere from 0.99× to 1.7×, so there
		// the bar only catches a real slowdown (half their speed), and a retry covers a bad moment
		expect(factor).toBeGreaterThan(inject('ci') ? 0.5 : 1);
	});

	it('scales every engine alike on its way out, so each keeps its measured level', async () => {
		// each engine's own output is fitted to the device's (its spec, in dBFS); what follows it
		// (velocity, level, the strip, the worklet) must scale them all alike, and the preset volume
		// is unity at the volume each engine was measured at
		const engines = [...CORE_ENGINES];
		const gains = new Map<EngineId, number>();
		for (const id of engines) {
			const settings = defaultTrack(id);
			const state = defaultState();
			state.tracks[2] = settings;
			const played = await render(
				1.2,
				(engine) => {
					engine.sync(state, 0);
					engine.noteOn({ track: 2, settings, note: 57, velocity: 100, time: 0.05, duration: 1 });
				},
				new Set([id])
			);
			const alone = levelOf(throughCore(id, settings.m1, 1.2).subarray(0.25 * SR, 0.95 * SR));
			gains.set(id, rms(played.buffer, 0.3, 1) / alone / presetGain(settings.playMode.volume, id));
		}
		const db = (id: EngineId) => 20 * Math.log10(gains.get(id)! / gains.get('prism')!);
		console.log(
			`chain gain against prism: ${engines.map((id) => `${id} ${db(id).toFixed(2)} dB`).join(', ')}`
		);
		for (const id of engines) expect(Math.abs(db(id)), id).toBeLessThan(1);
	});
});
