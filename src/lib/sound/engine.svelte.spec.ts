import { describe, expect, it } from 'vitest';
import { ENGINE_IDS, type EngineId } from '$lib/core/opxy';
import { defaultState, defaultTrack, type SimState, type TrackState } from '$lib/sim/params';
import { currentPattern, toggleStep } from '$lib/sim/sequencer';
import { SoundEngine } from './engine';
import { SampleRegistry } from './samples';
import { Scheduler } from './scheduler';

const SR = 44100;

/** Peak and RMS of a rendered buffer, both channels, optionally from `from` seconds on. */
function measure(buffer: AudioBuffer, from = 0, to = buffer.duration) {
	let peak = 0;
	let sum = 0;
	let count = 0;
	let finite = true;
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = Math.floor(from * SR); i < Math.min(data.length, Math.floor(to * SR)); i++) {
			const v = data[i];
			if (!Number.isFinite(v)) finite = false;
			peak = Math.max(peak, Math.abs(v));
			sum += v * v;
			count++;
		}
	}
	return { peak, rms: Math.sqrt(sum / Math.max(1, count)), finite };
}

/** Renders `seconds` of whatever `play` schedules on a fresh engine. */
async function render(
	seconds: number,
	play: (engine: SoundEngine, context: OfflineAudioContext) => void,
	samples?: SampleRegistry
) {
	const context = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
	const engine = new SoundEngine({ context, samples });
	play(engine, context);
	const buffer = await context.startRendering();
	// let the voices' ended events land
	await new Promise((resolve) => setTimeout(resolve, 20));
	return { buffer, engine };
}

/** A track running `engine` with a fixed state. */
const track = (engine: EngineId, patch: (t: TrackState) => void = () => {}) => {
	const t = defaultTrack(engine);
	patch(t);
	return t;
};

/** A beat on the default project: drums, a prism line, epiano chords, the metronome. */
function beat(): SimState {
	const s = defaultState();
	const drums = currentPattern(s.tracks[0].sequence);
	for (const step of [0, 8]) toggleStep(drums, step, [53]);
	for (const step of [4, 12]) toggleStep(drums, step, [55]);
	for (let step = 0; step < 16; step += 2) toggleStep(drums, step, [61], 90);
	const bass = currentPattern(s.tracks[2].sequence);
	[0, 3, 6, 10, 12].forEach((step, i) => toggleStep(bass, step, [36 + [0, 0, 3, 5, 7][i]]));
	const keys = currentPattern(s.tracks[3].sequence);
	toggleStep(keys, 0, [60, 64, 67], 80);
	toggleStep(keys, 8, [62, 65, 69], 80);
	keys.steps[0].notes.forEach((n) => (n.length = 6));
	s.tempo.metronome.on = true;
	s.transport.playing = true;
	return s;
}

describe('the sound engine, rendered offline', () => {
	it('plays a multi-track pattern in time, audible and never clipping', async () => {
		const state = beat();
		// a bar (and the next downbeat, just inside the look-ahead), then time for every tail
		const { buffer, engine } = await render(3.6, (engine, context) => {
			engine.sync(state);
			const scheduler = new Scheduler({
				state: () => state,
				now: () => context.currentTime,
				sink: engine.sink,
				lookahead: 2
			});
			scheduler.tick();
		});
		const all = measure(buffer);
		expect(all.finite).toBe(true);
		expect(all.rms).toBeGreaterThan(0.02);
		expect(all.peak).toBeLessThanOrEqual(0.97);
		// the kick on step 0 lands at the start: loud in the first 50 ms
		expect(measure(buffer, 0, 0.06).rms).toBeGreaterThan(0.02);
		// every voice has finished and let go of its nodes
		expect(engine.voices).toBe(0);
	});

	it('gives every synth engine a voice and keeps the midi engine silent', async () => {
		for (const id of ENGINE_IDS) {
			const note = id === 'drum' ? 55 : 60;
			const { buffer } = await render(0.6, (engine) => {
				engine.noteOn({
					track: 2,
					settings: track(id),
					note,
					velocity: 100,
					time: 0.01,
					duration: 0.3
				});
			});
			const { rms, peak, finite } = measure(buffer);
			expect(finite, id).toBe(true);
			expect(peak, id).toBeLessThanOrEqual(0.97);
			if (id === 'midi') expect(rms, id).toBe(0);
			else expect(rms, id).toBeGreaterThan(0.005);
		}
	});

	it('sounds every M1 extreme of every synth engine without blowing up', async () => {
		const synths = [
			'prism',
			'epiano',
			'organ',
			'wavetable',
			'axis',
			'dissolve',
			'hardsync',
			'simple'
		] as const;
		for (const id of synths) {
			for (const m1 of [
				[0, 0, 0, 0],
				[99, 99, 99, 99]
			] as [number, number, number, number][]) {
				const { buffer } = await render(0.4, (engine) => {
					const settings = track(id, (t) => (t.m1 = m1));
					engine.noteOn({ track: 4, settings, note: 45, velocity: 127, time: 0, duration: 0.25 });
				});
				const { rms, peak, finite } = measure(buffer);
				expect(finite, `${id} ${m1}`).toBe(true);
				expect(rms, `${id} ${m1}`).toBeGreaterThan(0.002);
				expect(peak, `${id} ${m1}`).toBeLessThanOrEqual(0.97);
			}
		}
	});

	it('mutes a muted track, and lets a released note fade', async () => {
		const muted = await render(0.5, (engine) => {
			const s = defaultState();
			s.tracks[2].mix.muted = true;
			engine.sync(s);
			engine.noteOn({
				track: 2,
				settings: s.tracks[2],
				note: 60,
				velocity: 100,
				time: 0.05,
				duration: 0.3
			});
		});
		expect(measure(muted.buffer, 0.1).rms).toBeLessThan(1e-4);
		const released = await render(0.8, (engine) => {
			engine.noteOn({
				track: 2,
				settings: track('prism'),
				note: 60,
				velocity: 100,
				time: 0,
				key: 'keyboard.c4'
			});
			engine.noteOff(2, 'keyboard.c4', 0.2);
		});
		expect(measure(released.buffer, 0.05, 0.2).rms).toBeGreaterThan(0.01);
		expect(measure(released.buffer, 0.4).rms).toBeLessThan(1e-4);
	});

	it('sends to the reverb on FX II: a tail rings on after the note', async () => {
		const tail = async (send: number) => {
			const { buffer } = await render(1.5, (engine) => {
				const s = defaultState();
				s.tracks[3].sends[3] = send;
				engine.sync(s);
				engine.noteOn({
					track: 3,
					settings: s.tracks[3],
					note: 64,
					velocity: 110,
					time: 0,
					duration: 0.2
				});
			});
			return measure(buffer, 0.6).rms;
		};
		expect(await tail(99)).toBeGreaterThan(10 * (await tail(0)) + 1e-4);
	});

	it('plays a drum key tuned, reversed and trimmed as its settings say', async () => {
		const energy = async (patch: (t: TrackState) => void) => {
			const { buffer } = await render(1.2, (engine) => {
				engine.noteOn({
					track: 0,
					settings: track('drum', patch),
					note: 63,
					velocity: 100,
					time: 0
				});
			});
			return [measure(buffer, 0, 0.1).rms, measure(buffer, 0.5, 1.1).rms];
		};
		// the open hat (D#4, key 10) rings on; reversed it swells into the end instead
		const [head, rest] = await energy(() => {});
		const [revHead, revRest] = await energy((t) => (t.drumKeys[10].reverse = true));
		expect(head).toBeGreaterThan(revHead);
		expect(revRest).toBeGreaterThan(rest);
		// trimmed to its first fifth, nothing is left after it
		const [, trimmed] = await energy((t) => (t.drumKeys[10].end = 20));
		expect(trimmed).toBeLessThan(1e-4);
	});

	it("plays a sampler track's recording from the registry, pitched from its root", async () => {
		const samples = new SampleRegistry();
		const tone = Float32Array.from(
			{ length: SR },
			(_, i) => 0.5 * Math.sin((2 * Math.PI * 220 * i) / SR)
		);
		samples.setSample(7, { source: { sampleRate: SR, channels: [tone] }, root: 57 });
		const { buffer } = await render(
			0.5,
			(engine) => {
				engine.noteOn({
					track: 7,
					settings: track('sampler'),
					note: 69,
					velocity: 127,
					time: 0,
					duration: 0.4
				});
			},
			samples
		);
		// an octave up from A3: 440 Hz, about 88 crossings in 0.1 s
		const data = buffer.getChannelData(0).subarray(Math.round(SR * 0.1), Math.round(SR * 0.2));
		let crossings = 0;
		for (let i = 1; i < data.length; i++) if (data[i - 1] < 0 !== data[i] < 0) crossings++;
		expect(crossings).toBeGreaterThan(80);
		expect(crossings).toBeLessThan(96);
	});

	it('never runs more than 24 voices, stealing the oldest', async () => {
		const { buffer, engine } = await render(0.5, (engine) => {
			for (let i = 0; i < 40; i++) {
				engine.noteOn({
					track: i % 8 === 0 ? 1 : i % 8,
					settings: track('prism'),
					note: 40 + i,
					velocity: 60,
					time: 0.01 + i * 0.002,
					key: `k${i}`
				});
			}
			expect(engine.voices).toBeLessThanOrEqual(40);
		});
		expect(measure(buffer).peak).toBeLessThanOrEqual(0.97);
		// held notes keep 24 voices at the end of the render
		expect(engine.voices).toBeLessThanOrEqual(24);
		expect(engine.voices).toBeGreaterThan(0);
	});

	it('slides a legato line and glides with portamento', async () => {
		const settings = track('simple', (t) => {
			t.playMode.mode = 2;
			t.playMode.portamento = 60;
			t.m1 = [0, 0, 0, 0];
		});
		const { buffer, engine } = await render(0.8, (engine) => {
			engine.noteOn({ track: 5, settings, note: 57, velocity: 100, time: 0, key: 'a' });
			engine.noteOn({ track: 5, settings, note: 69, velocity: 100, time: 0.3, key: 'b' });
			// one voice carries the line
			expect(engine.voices).toBe(1);
		});
		const crossings = (from: number) => {
			const data = buffer
				.getChannelData(0)
				.subarray(Math.round(SR * from), Math.round(SR * (from + 0.1)));
			let n = 0;
			for (let i = 1; i < data.length; i++) if (data[i - 1] < 0 !== data[i] < 0) n++;
			return n;
		};
		expect(crossings(0.15)).toBeLessThan(50);
		expect(crossings(0.65)).toBeGreaterThan(80);
		expect(engine.voices).toBe(1);
	});
});
