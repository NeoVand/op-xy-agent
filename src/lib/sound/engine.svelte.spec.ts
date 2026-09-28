import { describe, expect, it } from 'vitest';
import { ENGINE_IDS, type EngineId } from '$lib/core/opxy';
import type { Region as SampleRegion } from '$lib/sim/areas/sample/state';
import { defaultState, defaultTrack, type SimState, type TrackState } from '$lib/sim/params';
import { currentPattern, setLock, toggleStep } from '$lib/sim/sequencer';
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

/** A sine at `hz`, `seconds` long, at half scale. */
const tone = (hz: number, seconds: number) =>
	Float32Array.from(
		{ length: Math.round(SR * seconds) },
		(_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR)
	);

/** How bright the left channel is between `from` and `to`: its slope's RMS over its own. */
function brightness(buffer: AudioBuffer, from: number, to: number): number {
	const data = buffer.getChannelData(0).subarray(Math.round(SR * from), Math.round(SR * to));
	let level = 0;
	let slope = 0;
	for (let i = 1; i < data.length; i++) {
		level += data[i] * data[i];
		slope += (data[i] - data[i - 1]) ** 2;
	}
	return Math.sqrt(slope / Math.max(level, 1e-12));
}

/** Zero crossings of the left channel over 0.1 s from `from` (twice the frequency / 10). */
function crossings(buffer: AudioBuffer, from: number): number {
	const data = buffer
		.getChannelData(0)
		.subarray(Math.round(SR * from), Math.round(SR * (from + 0.1)));
	let n = 0;
	for (let i = 1; i < data.length; i++) if (data[i - 1] < 0 !== data[i] < 0) n++;
	return n;
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
	// the bass and pluck presets release for seconds: short ones end every tail inside the render
	s.tracks[2].amp.release = 20;
	s.tracks[3].amp.release = 20;
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

	it('lets a note ring on when its track is muted (mutes stop notes), and a released note fade', async () => {
		const muted = await render(0.5, (engine) => {
			const s = defaultState();
			engine.sync(s, 0);
			engine.noteOn({
				track: 2,
				settings: s.tracks[2],
				note: 60,
				velocity: 100,
				time: 0.05,
				duration: 0.3
			});
			const later = defaultState();
			later.tracks[2].mix.muted = true;
			engine.sync(later, 0.1);
		});
		expect(measure(muted.buffer, 0.15, 0.3).rms).toBeGreaterThan(0.01);
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

	it('moves a sounding note with a lock on an empty step, and lets go at the next step', async () => {
		const s = defaultState();
		const t = s.tracks[2];
		Object.assign(t.filter, { on: true, cutoff: 25, resonance: 0, envAmount: 0, keyTracking: 0 });
		t.amp = { attack: 0, decay: 0, sustain: 99, release: 5 };
		t.m1 = [67, 15, 0, 0]; // a bright saw on these (Web Audio) voices
		const p = currentPattern(t.sequence);
		toggleStep(p, 0, [48]);
		p.steps[0].notes[0].length = 16;
		setLock(p, 8, 'filter.cutoff', 90); // an empty step, halfway through the note
		s.transport.playing = true;
		const { buffer } = await render(1.8, (engine, context) => {
			engine.sync(s);
			new Scheduler({
				state: () => s,
				now: () => context.currentTime,
				sink: engine.sink,
				lookahead: 1.8
			}).tick();
		});
		// a sixteenth is 0.125 s: step 8 opens the filter, step 9 closes it again
		const before = brightness(buffer, 0.6, 0.95);
		const locked = brightness(buffer, 1.03, 1.12);
		const after = brightness(buffer, 1.3, 1.6);
		expect(locked).toBeGreaterThan(2 * before);
		expect(after).toBeLessThan(locked / 2);
	});

	it('sends to the reverb on FX II: a tail rings on after the note', async () => {
		const tail = async (send: number) => {
			const { buffer } = await render(1.5, (engine) => {
				const s = defaultState();
				s.tracks[3].sends[3] = send;
				// a short release, so what rings on is the reverb, not the pluck preset's long tail
				s.tracks[3].amp.release = 20;
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

	it("plays the synth sampler's sample file from the registry, pitched from its root", async () => {
		const samples = new SampleRegistry();
		const s = defaultState();
		s.tracks[7] = track('sampler');
		const synth = s.areas.sample.tracks[7].synth;
		synth.root = 57;
		synth.region.loop = 'off';
		samples.setFile(synth.file!.id, { sampleRate: SR, channels: [tone(220, 1)] });
		const { buffer } = await render(
			0.5,
			(engine) => {
				engine.sync(s, 0);
				engine.noteOn({
					track: 7,
					settings: s.tracks[7],
					note: 69,
					velocity: 127,
					time: 0,
					duration: 0.4
				});
			},
			samples
		);
		// an octave up from A3: 440 Hz, about 88 crossings in 0.1 s
		expect(crossings(buffer, 0.1)).toBeGreaterThan(80);
		expect(crossings(buffer, 0.1)).toBeLessThan(96);
	});

	it("loops the synth sampler's region while the note is held, and plays it backwards reversed", async () => {
		const run = async (patch: (region: SampleRegion) => void) => {
			const samples = new SampleRegistry();
			const s = defaultState();
			s.tracks[7] = track('sampler');
			const synth = s.areas.sample.tracks[7].synth;
			synth.root = 57;
			patch(synth.region);
			// 0.2 s that fades in: loud at its end, silent at its start
			const ramp = tone(220, 0.2).map((v, i, all) => (v * i) / all.length);
			samples.setFile(synth.file!.id, { sampleRate: SR, channels: [ramp] });
			const { buffer } = await render(
				0.9,
				(engine) => {
					engine.sync(s, 0);
					engine.noteOn({
						track: 7,
						settings: s.tracks[7],
						note: 57,
						velocity: 127,
						time: 0,
						duration: 0.7
					});
				},
				samples
			);
			return buffer;
		};
		const once = await run((r) => (r.loop = 'off'));
		const looped = await run((r) => (r.loop = 'forever'));
		// past the sample's 0.2 s only the loop still sounds
		expect(measure(once, 0.3, 0.6).rms).toBeLessThan(1e-4);
		expect(measure(looped, 0.3, 0.6).rms).toBeGreaterThan(0.01);
		// reversed, the loud end comes first
		const back = await run((r) => {
			r.loop = 'off';
			r.reverse = true;
		});
		expect(measure(back, 0, 0.05).rms).toBeGreaterThan(measure(once, 0, 0.05).rms * 3);
	});

	it('plays the multisampler zone covering each note, from the note it was sampled on', async () => {
		const samples = new SampleRegistry();
		const s = defaultState();
		s.tracks[6] = track('multisampler');
		// the default zones: A3, E4, B4, E5
		const [a3, e4] = s.areas.sample.tracks[6].zones;
		for (const zone of [a3, e4]) zone.region.loop = 'off';
		samples.setFile(a3.file.id, { sampleRate: SR, channels: [tone(220, 1)] });
		samples.setFile(e4.file.id, { sampleRate: SR, channels: [tone(329.63, 1)] });
		const { buffer } = await render(
			1.2,
			(engine) => {
				engine.sync(s, 0);
				const play = (note: number, time: number) =>
					engine.noteOn({
						track: 6,
						settings: s.tracks[6],
						note,
						velocity: 127,
						time,
						duration: 0.4
					});
				// G3 from the A3 zone (196 Hz), D4 from the E4 zone (293.7 Hz)
				play(55, 0);
				play(62, 0.6);
			},
			samples
		);
		expect(crossings(buffer, 0.1)).toBeGreaterThan(36);
		expect(crossings(buffer, 0.1)).toBeLessThan(43);
		expect(crossings(buffer, 0.7)).toBeGreaterThan(55);
		expect(crossings(buffer, 0.7)).toBeLessThan(63);
	});

	it('leaves an empty drum key silent and plays the kit sound a loaded file names', async () => {
		const ring = async (patch: (s: SimState) => void) => {
			const s = defaultState();
			// dry: no echo or reverb tail
			s.tracks[0].sends = [0, 0, 0, 0];
			patch(s);
			const { buffer } = await render(1.6, (engine) => {
				engine.sync(s, 0);
				engine.noteOn({ track: 0, settings: s.tracks[0], note: 53, velocity: 110, time: 0 });
			});
			return [measure(buffer, 0, 0.2).rms, crossings(buffer, 0.2)];
		};
		const [kick, kickBright] = await ring(() => {});
		expect(kick).toBeGreaterThan(0.01);
		const [empty] = await ring((s) => (s.areas.sample.tracks[0].keys[0] = null));
		expect(empty).toBe(0);
		// a crash loaded on the kick's key: a hiss of high partials, not a low thump
		const [crash, crashBright] = await ring((s) => {
			s.areas.sample.tracks[0].keys[0] = s.areas.sample.tracks[0].keys[15];
		});
		expect(crash).toBeGreaterThan(0.005);
		expect(crashBright).toBeGreaterThan(kickBright * 10);
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

describe('the sound engine follows the mixer', () => {
	/** RMS of one note on `track` after the engine took `patch`'s state. */
	const level = async (trackIndex: number, patch: (s: SimState) => void, pitch = 60) => {
		const { buffer } = await render(0.5, (engine) => {
			const s = defaultState();
			patch(s);
			engine.sync(s);
			const note = s.tracks[trackIndex].engine === 'drum' ? 53 : pitch;
			engine.noteOn({
				track: trackIndex,
				settings: s.tracks[trackIndex],
				note,
				velocity: 100,
				time: 0.1,
				duration: 0.3
			});
		});
		return measure(buffer, 0.1).rms;
	};

	it('hears only the soloed tracks while track keys are held in mix mode', async () => {
		const solo = (s: SimState) => {
			s.mode = 'mix';
			s.held = ['track.3'];
		};
		expect(await level(2, solo)).toBeGreaterThan(0.005);
		expect(await level(3, solo)).toBeLessThan(1e-4);
	});

	it('takes the master level and the group levels from mix M4', async () => {
		const plain = await level(2, () => {});
		expect(await level(2, (s) => (s.areas.mixer.master.level = 0))).toBeLessThan(1e-4);
		// percussion down to nothing leaves the melodic tracks alone
		expect(await level(0, (s) => (s.areas.mixer.master.percussion = 0))).toBeLessThan(1e-4);
		expect(await level(2, (s) => (s.areas.mixer.master.percussion = 0))).toBeCloseTo(plain, 3);
		expect(await level(2, (s) => (s.areas.mixer.master.melodic = 99))).toBeGreaterThan(plain * 1.5);
	});

	it('cuts the lows with the master EQ', async () => {
		// a soft sine at C2 (65 Hz), well under the low shelf's corner
		const low = (patch: (s: SimState) => void) =>
			level(
				2,
				(s) => {
					s.tracks[2].engine = 'sampler';
					patch(s);
				},
				36
			);
		const flat = await low(() => {});
		const cut = await low((s) => Object.assign(s.areas.mixer.eq, { low: -50, blend: 99 }));
		// about −12 dB down there
		expect(cut).toBeLessThan(flat * 0.4);
	});

	it('bends a note along its curve (the bend component)', async () => {
		const up = Float32Array.from({ length: 32 }, (_, i) => (1200 * i) / 31);
		const { buffer } = await render(0.8, (engine) => {
			const settings = track('sampler');
			engine.noteOn({
				track: 7,
				settings,
				note: 57,
				velocity: 110,
				time: 0,
				duration: 0.6,
				bend: up
			});
		});
		const crossings = (from: number) => {
			const data = buffer
				.getChannelData(0)
				.subarray(Math.round(SR * from), Math.round(SR * (from + 0.05)));
			let n = 0;
			for (let i = 1; i < data.length; i++) if (data[i - 1] < 0 !== data[i] < 0) n++;
			return n;
		};
		// A3 (220 Hz) rising an octave over the note: about twice the crossings at the end
		expect(crossings(0.52) / crossings(0.02)).toBeGreaterThan(1.7);
	});

	it("places a note of its own in the stereo field (the arpeggio's stereo spread)", async () => {
		const { buffer } = await render(0.5, (engine) => {
			const s = defaultState();
			s.tracks[2].sends = [0, 0, 0, 0];
			engine.sync(s, 0);
			engine.noteOn({
				track: 2,
				settings: s.tracks[2],
				note: 60,
				velocity: 100,
				time: 0,
				duration: 0.3,
				pan: -1
			});
		});
		const rms = (channel: number) => {
			const data = buffer.getChannelData(channel);
			let sum = 0;
			for (const v of data) sum += v * v;
			return Math.sqrt(sum / data.length);
		};
		expect(rms(0)).toBeGreaterThan(0.01);
		expect(rms(1)).toBeLessThan(rms(0) * 0.01);
	});
});
