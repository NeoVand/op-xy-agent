import { describe, expect, it } from 'vitest';
import { defaultRegion, type Region } from '$lib/sim/areas/sample/state';
import { DUCK_METRONOME, defaultTrack, type Lfo } from '$lib/sim/params';
import {
	DUCK_ON_BEAT,
	DUCK_ON_NOTHING,
	bendCents,
	cutoffHz,
	engineControls,
	envAmountCents,
	envelopeSeconds,
	glideSeconds,
	keyTrackCents,
	LEVEL_UNITY,
	levelGain,
	lfoHz,
	lfoRoute,
	noteHz,
	playMode,
	presetGain,
	regionSeconds,
	resonanceQ,
	sampleRegion,
	sendGain,
	sweep,
	velocityGain,
	type AxisControls,
	type PrismControls
} from './mapping';

const lfo = (patch: Partial<Lfo>): Lfo => ({ ...defaultTrack('prism').lfo, ...patch });

describe('mapping: envelopes, filter and voice settings', () => {
	it('sweeps times and frequencies exponentially, never reaching zero', () => {
		expect(sweep(0, 20, 20000)).toBe(20);
		expect(sweep(99, 20, 20000)).toBeCloseTo(20000);
		// every detent is the same ratio
		expect(sweep(51, 1, 100) / sweep(50, 1, 100)).toBeCloseTo(
			sweep(11, 1, 100) / sweep(10, 1, 100)
		);
		// release is a handle position: 99 (the handle on the end) is the shortest
		const sharp = envelopeSeconds({ attack: 0, decay: 0, sustain: 0, release: 99 });
		expect(sharp).toEqual({ attack: 0.0015, decay: 0.02, sustain: 0, release: 0.015 });
		// the device's measured law: about 2 s at half, minutes at the top
		const half = envelopeSeconds({ attack: 49.5, decay: 49.5, sustain: 49.5, release: 49.5 });
		expect(half.attack).toBeGreaterThan(1.8);
		expect(half.attack).toBeLessThan(2.2);
		expect(half.release).toBeCloseTo(half.attack - 0.0015 + 0.015, 6);
		const slow = envelopeSeconds({ attack: 99, decay: 99, sustain: 99, release: 0 });
		expect(slow.attack).toBeGreaterThan(300);
		expect(slow.release).toBeGreaterThan(300);
		expect(slow.sustain).toBe(1);
		// a new project's bass (T3, release lane 26129 of 32767) stops in about a tenth of a second
		const bass = envelopeSeconds({
			attack: 0,
			decay: 30,
			sustain: 40,
			release: (26129 / 32767) * 99
		});
		expect(bass.release).toBeLessThan(0.15);
	});

	it('maps the filter: cutoff 20 Hz–20 kHz, flat to peaky resonance, envelope and key tracking in cents', () => {
		expect(cutoffHz(0)).toBe(20);
		expect(cutoffHz(99)).toBeCloseTo(20000);
		expect(resonanceQ(0, 'svf')).toBe(-3);
		expect(resonanceQ(99, 'z lowpass')).toBeGreaterThan(resonanceQ(99, 'svf'));
		// a full amount sweeps as far as the cutoff dial does, in a straight line
		expect(envAmountCents(0)).toBe(0);
		expect(envAmountCents(99)).toBeCloseTo(1200 * Math.log2(1000));
		expect(envAmountCents(-99)).toBeCloseTo(-1200 * Math.log2(1000));
		expect(envAmountCents(49.5)).toBeCloseTo(600 * Math.log2(1000));
		expect(keyTrackCents(99, 72)).toBe(1200);
		expect(keyTrackCents(0, 72)).toBe(0);
	});

	it('puts unity gain on the defaults: a new project’s level, each engine’s default volume', () => {
		expect(LEVEL_UNITY).toBeCloseTo((0x6000 / 0x7fff) * 99);
		expect(levelGain(LEVEL_UNITY)).toBe(1);
		expect(presetGain(44)).toBe(1);
		// the engines were measured at their default presets' volumes: those play at unity
		expect(presetGain((24901 / 32767) * 99, 'prism')).toBeCloseTo(1);
		expect(presetGain((10000 / 32767) * 99, 'axis')).toBeCloseTo(1);
		expect(presetGain(99, 'axis')).toBeGreaterThan(presetGain(99, 'prism'));
		expect(levelGain(0)).toBe(0);
		expect(presetGain(0)).toBe(0);
		expect(levelGain(99)).toBeCloseTo(Math.pow(10, 4 / 20));
		expect(presetGain(99)).toBeCloseTo(Math.pow(10, 6 / 20));
		expect(sendGain(0)).toBe(0);
		expect(sendGain(99)).toBe(1);
		expect(velocityGain(127)).toBe(1);
		expect(velocityGain(100)).toBeCloseTo(0.7, 1);
	});

	it('reads play mode, portamento and bend range', () => {
		expect([0, 1, 2, 7].map(playMode)).toEqual(['poly', 'mono', 'legato', 'legato']);
		expect(glideSeconds(0)).toBe(0);
		expect(glideSeconds(1)).toBeCloseTo(0.005);
		expect(glideSeconds(99)).toBeCloseTo(2.5);
		expect(bendCents(1, 2)).toBe(200);
		expect(bendCents(-0.5, 12)).toBe(-600);
		expect(bendCents(1, 0)).toBe(0);
	});

	it('turns sample start and end into a region of at least 5 ms', () => {
		expect(sampleRegion(0, 99, 2)).toEqual({ start: 0, end: 2 });
		expect(sampleRegion(49.5, 99, 2).start).toBeCloseTo(1);
		const tiny = sampleRegion(50, 50, 2);
		expect(tiny.end - tiny.start).toBeCloseTo(0.005);
		expect(noteHz(69)).toBe(440);
		expect(noteHz(81)).toBe(880);
	});
});

describe('mapping: the LFO', () => {
	it('syncs speed to the tempo in sixteenths, then runs free', () => {
		// "4" sixteenths per cycle at 120 BPM is one beat: 2 Hz
		expect(lfoHz(3, 120)).toBeCloseTo(2);
		expect(lfoHz(0, 120)).toBeCloseTo(8);
		// the random LFO counts triplet sixteenths
		expect(lfoHz(3, 120, true)).toBeCloseTo(3);
		expect(lfoHz(12, 120)).toBeCloseTo(0.05);
		expect(lfoHz(12 + 99, 120)).toBeCloseTo(25);
	});

	it('routes value and random to the engine or the filter, and knows which restart per note', () => {
		expect(lfoRoute(lfo({ amount: 0 }), 120).kind).toBe('none');
		expect(lfoRoute(lfo({ amount: 50, destination: 0, parameter: 2 }), 120)).toMatchObject({
			kind: 'engine',
			param: 2,
			retrigger: true,
			wave: 'sine'
		});
		// the filter page's free twin, cutoff
		expect(
			lfoRoute(lfo({ type: 'random', amount: -99, destination: 5, parameter: 0 }), 120)
		).toMatchObject({
			kind: 'cutoff',
			depth: -1,
			retrigger: false,
			wave: 'random'
		});
		expect(lfoRoute(lfo({ amount: 50, destination: 4, parameter: 1 }), 120).kind).toBe('resonance');
		// envelope amount, key tracking, the env and lfo pages: not modulated
		expect(lfoRoute(lfo({ amount: 50, destination: 4, parameter: 3 }), 120).kind).toBe('none');
		expect(lfoRoute(lfo({ amount: 50, destination: 2 }), 120).kind).toBe('none');
	});

	it('makes tremolo a vibrato and a volume wobble, and duck a dip on another track', () => {
		expect(lfoRoute(lfo({ type: 'tremolo', amount: 99, volume: -99 }), 120)).toMatchObject({
			kind: 'tremolo',
			vibrato: 50,
			volume: -1
		});
		expect(lfoRoute(lfo({ type: 'tremolo', amount: 0, volume: 0 }), 120).kind).toBe('none');
		expect(lfoRoute(lfo({ type: 'duck', amount: -99, source: 1 }), 120)).toMatchObject({
			kind: 'duck',
			source: 0,
			depth: 1
		});
		// the metronome ducks on every beat; an auxiliary track's notes make no sound here
		expect(lfoRoute(lfo({ type: 'duck', amount: 60, source: DUCK_METRONOME }), 120)).toMatchObject({
			kind: 'duck',
			source: DUCK_ON_BEAT
		});
		expect(lfoRoute(lfo({ type: 'duck', amount: 60, source: 12 }), 120)).toMatchObject({
			kind: 'duck',
			source: DUCK_ON_NOTHING
		});
	});

	it('runs element on the amp envelope only, per voice, and nothing when switched off', () => {
		const element = (patch: Partial<Lfo>) => lfoRoute(lfo({ type: 'element', ...patch }), 120);
		// the gyroscope and microphone are not ours to read
		expect(element({ amount: 99, sensor: 0 }).kind).toBe('none');
		expect(element({ amount: 99, sensor: 2, destination: 0, parameter: 1 })).toMatchObject({
			kind: 'element',
			target: 'engine',
			param: 1,
			depth: 1
		});
		expect(element({ amount: -99, sensor: 3, destination: 2, parameter: 0 })).toMatchObject({
			kind: 'element',
			target: 'cutoff',
			depth: -1
		});
		// the env and lfo pages: not modulated
		expect(element({ amount: 99, sensor: 2, destination: 1 }).kind).toBe('none');
		expect(lfoRoute(lfo({ type: 'tremolo', amount: 99, on: false }), 120).kind).toBe('none');
	});
});

describe('mapping: engine M1 parameters', () => {
	it("gives prism's default a thick octave-stacked saw-square", () => {
		const c = engineControls('prism', [80, 80, 80, 80]) as PrismControls;
		expect(c.shape).toBeCloseTo(2.42, 2);
		expect(c.ratio).toBe(2);
		expect(c.detune).toBeGreaterThan(15);
		expect(c.detune).toBeLessThan(25);
		expect((engineControls('prism', [0, 0, 0, 0]) as PrismControls).ratio).toBe(0.5);
		expect((engineControls('prism', [0, 20, 0, 0]) as PrismControls).ratio).toBe(1);
	});

	it("follows axis's ratio halves: 0–50 detune, 51–99 steps of a fifth", () => {
		const at = (ratio: number) =>
			(engineControls('axis', [80, ratio, 80, 80]) as AxisControls).interval;
		expect(at(0)).toBe(0);
		expect(at(50)).toBe(25);
		expect([51, 64, 80, 99].map(at)).toEqual([700, 1200, 1900, 2400]);
	});

	it('picks nine wavetables and five organ models across the dial', () => {
		const table = (v: number) => engineControls('wavetable', [v, 0, 0, 0]);
		expect(table(0)).toMatchObject({ table: 0 });
		expect(table(99)).toMatchObject({ table: 8 });
		expect(table(80)).toMatchObject({ table: 7 });
		const organ = (v: number) => engineControls('organ', [v, 0, 0, 0]);
		expect([0, 20, 40, 60, 80, 99].map((v) => (organ(v) as { model: number }).model)).toEqual([
			0, 1, 2, 3, 4, 4
		]);
	});

	it('lets samplers fall back to the soft tone; drums and midi are not synths', () => {
		expect(engineControls('sampler', [0, 0, 0, 0])).toEqual({ engine: 'soft' });
		expect(engineControls('multisampler', [0, 0, 0, 0])).toEqual({ engine: 'soft' });
		expect(engineControls('drum', [0, 0, 0, 0])).toBeNull();
		expect(engineControls('midi', [0, 0, 0, 0])).toBeNull();
	});

	it('keeps every synth engine inside sane ranges at both ends of every dial', () => {
		for (const engine of [
			'prism',
			'epiano',
			'organ',
			'wavetable',
			'axis',
			'dissolve',
			'hardsync',
			'simple'
		] as const) {
			for (const m1 of [
				[0, 0, 0, 0],
				[99, 99, 99, 99],
				[80, 80, 80, 80]
			] as [number, number, number, number][]) {
				const c = engineControls(engine, m1);
				expect(c?.engine).toBe(engine);
				for (const value of Object.values(c ?? {})) {
					if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
				}
			}
		}
		expect(engineControls('hardsync', [99, 0, 0, 99])).toMatchObject({ ratio: 6, lowcut: 800 });
		expect((engineControls('simple', [0, 99, 0, 0]) as { duty: number }).duty).toBeCloseTo(0.04);
	});
});

describe("mapping: the synth sampler's region", () => {
	it('places the points and the loop in seconds of the sample', () => {
		const play = regionSeconds(defaultRegion(), 2);
		expect(play.start).toBe(0);
		expect(play.end).toBe(2);
		expect(play.loop!.start).toBeCloseTo(0.4);
		expect(play.loop!.end).toBeCloseTo(1.6);
	});

	it('loops only while a loop is set: off, loop start at the end, or no length is none', () => {
		const region = (patch: Partial<Region>): Region => ({ ...defaultRegion(), ...patch });
		expect(regionSeconds(region({ loop: 'off' }), 2).loop).toBeNull();
		expect(regionSeconds(region({ loopStart: 1, loopEnd: 1 }), 2).loop).toBeNull();
		expect(regionSeconds(region({ loopStart: 0.5, loopEnd: 0.5 }), 2).loop).toBeNull();
		expect(regionSeconds(region({ loop: 'release' }), 2).loop).not.toBeNull();
	});

	it('mirrors the points when reversed, so the same stretch plays backwards', () => {
		const play = regionSeconds({ ...defaultRegion(), start: 0.1, end: 0.5, reverse: true }, 1);
		expect(play.start).toBeCloseTo(0.5);
		expect(play.end).toBeCloseTo(0.9);
		// the loop (20–80 %) clipped to the region, mirrored
		expect(play.loop!.start).toBeCloseTo(0.5);
		expect(play.loop!.end).toBeCloseTo(0.8);
	});

	it('never plays less than 5 ms', () => {
		const play = regionSeconds({ ...defaultRegion(), start: 1, end: 1 }, 1);
		expect(play.end - play.start).toBeCloseTo(0.005);
	});
});
