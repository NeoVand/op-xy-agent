/**
 * The drum sampler's kit, synthesized: 24 sounds on keyboard keys F3–E5 (notes 53–76) in the layout
 * TE's factory kits share (manual: sampler/drum-sampler). Each sound is rendered once into a buffer
 * and then played like a sample, so every drum key setting (tune, start, end, play mode, direction,
 * pan, fade, gain) works on it exactly as on a recording. Nothing here is sampled from TE or anyone
 * else: every sound is built from oscillators, noise and filters (808-style metal for the hats and
 * cymbals, pitch-swept sines for kicks and toms, filtered noise bursts for snares and claps). Also
 * the metronome's click and the reverb's impulse response.
 */
import { Biquad, Oscillator, decay, finish, normalize, render, saturate } from './dsp';
import { random, seedOf } from './random';

/** The kit, left to right on the keyboard. */
export const DRUM_SOUNDS = [
	'kick',
	'kick 2',
	'snare',
	'snare 2',
	'rim',
	'clap',
	'tambourine',
	'shaker',
	'closed hat',
	'closed hat 2',
	'open hat',
	'clave',
	'low tom',
	'ride',
	'mid tom',
	'crash',
	'high tom',
	'triangle',
	'low conga',
	'high conga',
	'cowbell',
	'guiro',
	'metal',
	'chi'
] as const;

export type DrumSound = (typeof DRUM_SOUNDS)[number];

/** Keyboard note of the first drum key (F3). */
export const FIRST_DRUM_NOTE = 53;

/** A sound: rendered at a sample rate, from a noise source in −1…1. */
type Recipe = (sampleRate: number, noise: () => number) => Float32Array;

/** A short linear fade-in (a few samples) so a sound starting mid-waveform does not click. */
const onset = (t: number, seconds: number) => (t < seconds ? t / seconds : 1);

/** The TR-808's six square oscillators: the metallic core of its hats and cymbals. */
const METAL_HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** The six squares summed, optionally transposed (cymbals sit higher than hats). */
function metal(sampleRate: number, scale = 1): () => number {
	const oscillators = METAL_HZ.map((_, i) => new Oscillator('square', sampleRate, i * 0.17));
	return () => oscillators.reduce((sum, osc, i) => sum + osc.next(METAL_HZ[i] * scale), 0) / 6;
}

/** A tom or a conga: a sine whose pitch drops as it is struck, with a little stick noise. */
function drum(base: number, tau: number, drop: number, stick: number, bite: number): Recipe {
	return (sr, noise) => {
		const body = new Oscillator('sine', sr);
		const overtone = new Oscillator('sine', sr, 0.1);
		const hit = new Biquad('bandpass', base * 8, 1.2, sr);
		const out = render(sr, tau * 3.5, (_, t) => {
			const f = base * (1 + drop * decay(t, 0.04));
			const tone = (body.next(f) + 0.22 * overtone.next(f * 1.58)) * decay(t, tau);
			return saturate(tone + hit.process(noise()) * decay(t, stick) * bite, 1.3);
		});
		return out;
	};
}

const RECIPES: Readonly<Record<DrumSound, Recipe>> = {
	kick: (sr, noise) => {
		const body = new Oscillator('sine', sr);
		const click = new Biquad('bandpass', 3500, 0.8, sr);
		const out = render(sr, 1.1, (_, t) => {
			const f = 46 + 110 * decay(t, 0.03) + 30 * decay(t, 0.004);
			const boom = body.next(f) * decay(t, 0.42);
			return saturate(boom + click.process(noise()) * decay(t, 0.004) * 0.45, 1.4);
		});
		return out;
	},
	'kick 2': (sr, noise) => {
		const body = new Oscillator('sine', sr);
		const click = new Biquad('highpass', 2000, 0.7, sr);
		const out = render(sr, 0.55, (_, t) => {
			const f = 52 + 180 * decay(t, 0.018) + 400 * decay(t, 0.002);
			const thump = body.next(f) * decay(t, 0.2);
			return saturate(thump + click.process(noise()) * decay(t, 0.003) * 0.5, 2.2);
		});
		return out;
	},
	snare: (sr, noise) => {
		const low = new Oscillator('sine', sr);
		const high = new Oscillator('sine', sr, 0.25);
		const cut = new Biquad('highpass', 1200, 0.7, sr);
		const sizzle = new Biquad('peaking', 4500, 1, sr, 6);
		const out = render(sr, 0.45, (_, t) => {
			const bend = 1 + 0.35 * decay(t, 0.012);
			const body = (low.next(185 * bend) * 0.55 + high.next(330 * bend) * 0.3) * decay(t, 0.075);
			const wires = sizzle.process(cut.process(noise()));
			return body + wires * (decay(t, 0.14) * 0.5 + decay(t, 0.012) * 0.25);
		});
		return out;
	},
	'snare 2': (sr, noise) => {
		const body = new Oscillator('sine', sr);
		const band = new Biquad('bandpass', 5000, 0.7, sr);
		const out = render(sr, 0.3, (_, t) => {
			const tone = body.next(238 * (1 + 0.5 * decay(t, 0.008))) * decay(t, 0.05) * 0.6;
			return tone + band.process(noise()) * decay(t, 0.075) * 0.9;
		});
		return out;
	},
	rim: (sr, noise) => {
		const knock = new Oscillator('triangle', sr);
		const wood = new Oscillator('sine', sr);
		const cut = new Biquad('highpass', 400, 0.7, sr);
		const out = render(sr, 0.12, (_, t) =>
			cut.process(
				(knock.next(1720) * 0.6 + wood.next(480) * 0.5) * decay(t, 0.011) +
					noise() * decay(t, 0.002) * 0.3
			)
		);
		return out;
	},
	clap: (sr, noise) => {
		const band = new Biquad('bandpass', 1150, 1.3, sr);
		const cut = new Biquad('highpass', 500, 0.7, sr);
		// four hands a few milliseconds apart, then the room
		const hands = [0, 0.0095, 0.019, 0.029];
		const out = render(sr, 0.5, (_, t) => {
			let env = 0.55 * decay(t - hands[3], 0.11);
			for (const [k, at] of hands.entries()) {
				env = Math.max(env, decay(t - at, 0.0055) * (k === 3 ? 1 : 0.8));
			}
			return cut.process(band.process(noise())) * env;
		});
		return out;
	},
	tambourine: (sr, noise) => {
		const low = new Biquad('bandpass', 7200, 2.2, sr);
		const high = new Biquad('bandpass', 10200, 3, sr);
		const cut = new Biquad('highpass', 5000, 0.7, sr);
		const jingles = [5320, 6890, 8440].map((f, i) => ({
			f,
			osc: new Oscillator('square', sr, i * 0.31)
		}));
		const out = render(sr, 0.45, (_, t) => {
			const shake = decay(t, 0.09) + 0.35 * decay(t - 0.035, 0.06);
			const rattle = 0.7 + 0.3 * Math.sin(2 * Math.PI * 31 * t);
			const zing = jingles.reduce((sum, j) => sum + j.osc.next(j.f), 0) / 3;
			const n = low.process(noise()) + high.process(noise()) * 0.8;
			return cut.process(n * 0.9 + zing * 0.25) * shake * rattle;
		});
		return out;
	},
	shaker: (sr, noise) => {
		const cut = new Biquad('highpass', 4800, 0.7, sr);
		const band = new Biquad('bandpass', 8000, 0.8, sr);
		const out = render(sr, 0.2, (_, t) => {
			const env = t < 0.014 ? t / 0.014 : decay(t - 0.014, 0.045);
			return band.process(cut.process(noise())) * env;
		});
		return out;
	},
	'closed hat': (sr, noise) => {
		const core = metal(sr);
		const band = new Biquad('bandpass', 10000, 0.9, sr);
		const cut = new Biquad('highpass', 7500, 0.7, sr);
		const out = render(
			sr,
			0.16,
			(_, t) => cut.process(band.process(core() + noise() * 0.25)) * decay(t, 0.02)
		);
		return out;
	},
	'closed hat 2': (sr, noise) => {
		const cut = new Biquad('highpass', 8500, 0.7, sr);
		const air = new Biquad('peaking', 11000, 1.2, sr, 5);
		const out = render(
			sr,
			0.22,
			(_, t) => air.process(cut.process(noise())) * (decay(t, 0.035) + 0.2 * decay(t, 0.004))
		);
		return out;
	},
	'open hat': (sr, noise) => {
		const core = metal(sr);
		const band = new Biquad('bandpass', 9500, 0.8, sr);
		const cut = new Biquad('highpass', 7000, 0.7, sr);
		const out = render(
			sr,
			1.1,
			(_, t) => cut.process(band.process(core() + noise() * 0.3)) * onset(t, 0.003) * decay(t, 0.3)
		);
		return out;
	},
	clave: (sr) => {
		const wood = new Oscillator('sine', sr);
		const ring = new Biquad('bandpass', 2500, 5, sr);
		const out = render(sr, 0.15, (_, t) => {
			const x = wood.next(2500 * (1 + 0.03 * decay(t, 0.004))) * decay(t, 0.024);
			return x + ring.process(x) * 0.3;
		});
		return out;
	},
	'low tom': drum(92, 0.3, 0.55, 0.018, 0.35),
	ride: (sr, noise) => {
		const core = metal(sr, 1.9);
		const band = new Biquad('bandpass', 5200, 0.9, sr);
		const cut = new Biquad('highpass', 3200, 0.7, sr);
		const bells = [3130, 4870, 6250].map((f) => ({ f, osc: new Oscillator('sine', sr) }));
		const out = render(sr, 2.4, (_, t) => {
			const wash = cut.process(band.process(core() * 0.6 + noise() * 0.25)) * decay(t, 0.9);
			const bell = (bells.reduce((sum, b) => sum + b.osc.next(b.f), 0) / 3) * decay(t, 0.45);
			return (wash + bell * 0.35) * onset(t, 0.001);
		});
		return out;
	},
	'mid tom': drum(132, 0.26, 0.55, 0.016, 0.35),
	crash: (sr, noise) => {
		const core = metal(sr, 1.3);
		const band = new Biquad('bandpass', 6500, 0.5, sr);
		const cut = new Biquad('highpass', 3600, 0.7, sr);
		const soften = new Biquad('lowpass', 12000, 0.7, sr);
		const out = render(sr, 2.6, (_, t) => {
			const env = onset(t, 0.002) * (decay(t, 0.85) * 0.9 + decay(t, 0.05) * 0.3);
			return soften.process(cut.process(band.process(noise() * 0.8 + core() * 0.5))) * env;
		});
		return out;
	},
	'high tom': drum(188, 0.22, 0.5, 0.014, 0.35),
	triangle: (sr) => {
		// the modes of a struck steel bar: inharmonic, the high ones dying first
		const modes = [
			[1, 1, 1.1],
			[2.76, 0.5, 0.7],
			[5.4, 0.3, 0.45],
			[8.93, 0.2, 0.3]
		].map(([ratio, level, tau]) => ({ ratio, level, tau, osc: new Oscillator('sine', sr) }));
		const out = render(sr, 2, (_, t) =>
			modes.reduce((sum, m) => sum + m.osc.next(1180 * m.ratio) * m.level * decay(t, m.tau), 0)
		);
		return out;
	},
	'low conga': drum(196, 0.17, 0.28, 0.008, 0.3),
	'high conga': drum(288, 0.12, 0.28, 0.008, 0.3),
	cowbell: (sr) => {
		const a = new Oscillator('square', sr);
		const b = new Oscillator('square', sr, 0.37);
		const band = new Biquad('bandpass', 1600, 0.9, sr);
		const out = render(
			sr,
			0.6,
			(_, t) =>
				band.process(a.next(540) * 0.5 + b.next(800) * 0.5) *
				(0.65 * decay(t, 0.012) + 0.35 * decay(t, 0.16))
		);
		return out;
	},
	guiro: (sr, noise) => {
		const band = new Biquad('bandpass', 3200, 2, sr);
		const cut = new Biquad('highpass', 1500, 0.7, sr);
		const length = 0.22;
		const ridges = 22;
		const out = render(sr, 0.3, (_, t) => {
			const u = Math.min(1, t / length);
			// the stick speeds up a little along the ridges
			const at = ((u + 0.25 * u * u) * ridges) % 1;
			const tick = decay(at * (length / ridges), 0.0025);
			const swell = Math.sqrt(Math.sin(u * Math.PI));
			return cut.process(band.process(noise())) * tick * swell;
		});
		return out;
	},
	metal: (sr, noise) => {
		const partials = [
			[431, 1, 0.9],
			[1087, 0.7, 0.6],
			[1602, 0.5, 0.5],
			[2381, 0.45, 0.35],
			[3417, 0.3, 0.25]
		].map(([f, level, tau]) => ({ f, level, tau, osc: new Oscillator('sine', sr) }));
		const strike = new Biquad('bandpass', 2500, 1, sr);
		const out = render(
			sr,
			1.5,
			(_, t) =>
				partials.reduce((sum, p) => sum + p.osc.next(p.f) * p.level * decay(t, p.tau), 0) +
				strike.process(noise()) * decay(t, 0.01) * 0.3
		);
		return out;
	},
	chi: (sr, noise) => {
		// a china cymbal: trashy, bright, quick to die
		const core = metal(sr, 1.6);
		const band = new Biquad('bandpass', 4200, 0.7, sr);
		const cut = new Biquad('highpass', 2000, 0.7, sr);
		const out = render(sr, 1.6, (_, t) => {
			const env = onset(t, 0.002) * (decay(t, 0.4) + 0.4 * decay(t, 0.03));
			return saturate(cut.process(band.process(noise() * 0.7 + core() * 0.8)) * env, 1.8);
		});
		return out;
	}
};

/**
 * How loud each sound's loudest 30 ms are (dBFS): the kit's balance, in the proportions of a drum
 * machine's factory mix — kicks up front, toms and congas close behind, snare and clap a few dB
 * under, the metal and small percussion well under that.
 */
const LOUDNESS: Readonly<Record<DrumSound, number>> = {
	kick: -4.5,
	'kick 2': -4.5,
	snare: -9,
	'snare 2': -10,
	rim: -14,
	clap: -10,
	tambourine: -15,
	shaker: -17,
	'closed hat': -16,
	'closed hat 2': -16,
	'open hat': -15,
	clave: -14,
	'low tom': -6,
	ride: -17,
	'mid tom': -6,
	crash: -14,
	'high tom': -6,
	triangle: -16,
	'low conga': -7,
	'high conga': -7,
	cowbell: -14,
	guiro: -15,
	metal: -14,
	chi: -14
};

/** Renders drum key `index` (0 = F3 … 23 = E5) as mono samples. */
export function renderDrum(index: number, sampleRate: number): Float32Array {
	const sound = DRUM_SOUNDS[index];
	if (!sound) throw new RangeError(`drum keys are 0–23, got ${index}`);
	const next = random(seedOf(1, index));
	return finish(
		RECIPES[sound](sampleRate, () => next() * 2 - 1),
		LOUDNESS[sound],
		sampleRate
	);
}

/** The metronome: a short woodblock-like blip, higher and louder on the first beat of a bar. */
export function renderClick(accent: boolean, sampleRate: number): Float32Array {
	const tone = new Oscillator('sine', sampleRate);
	const edge = new Oscillator('sine', sampleRate, 0.2);
	const f = accent ? 1760 : 1320;
	const out = render(
		sampleRate,
		0.05,
		(_, t) => (tone.next(f) + 0.35 * edge.next(f * 2.01)) * decay(t, 0.009) * onset(t, 0.0006)
	);
	return finish(out, accent ? -7 : -10, sampleRate);
}

/**
 * A stereo reverb impulse response: a short pre-delay, a few early reflections, then decorrelated
 * noise decaying over `rt60` seconds, darkening as it goes like air and walls do.
 */
export function renderImpulse(
	sampleRate: number,
	seconds = 2.6,
	rt60 = 2.2,
	seed = 7
): [Float32Array, Float32Array] {
	const tau = rt60 / 6.91;
	const preDelay = 0.012;
	const reflections = [
		[0.017, 0.5],
		[0.023, 0.42],
		[0.031, 0.35],
		[0.043, 0.3],
		[0.057, 0.22]
	];
	const channel = (side: number) => {
		const next = random(seedOf(seed, side));
		let dark = 0;
		const out = render(sampleRate, seconds, (_, t) => {
			const u = t - preDelay;
			if (u < 0) return 0;
			const x = (next() * 2 - 1) * decay(u, tau);
			// a one-pole lowpass that closes over time
			dark += (0.08 + 0.9 * decay(u, 1.2)) * (x - dark);
			return dark * onset(u, 0.004);
		});
		for (const [k, [at, gain]] of reflections.entries()) {
			const i = Math.round((preDelay + at + side * 0.0013 * (k + 1)) * sampleRate);
			if (i < out.length) out[i] += gain * (next() < 0.5 ? -1 : 1);
		}
		// the convolver normalises its loudness; the peak only has to be sane
		return normalize(out, 0.9, sampleRate);
	};
	return [channel(0), channel(1)];
}
