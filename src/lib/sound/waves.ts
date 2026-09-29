/**
 * Waveforms as Fourier series for Web Audio's PeriodicWave, which band-limits them for free: the
 * organ's registrations, the wavetable engine's nine tables, hard-sync spectra, the samplers' soft
 * sine and the random LFO's steps. Pure numbers; the engine turns them into PeriodicWaves and keeps
 * only a few, since each costs the browser about half a megabyte of tables.
 */
import { WAVETABLES, WAVETABLE_FRAMES, ORGAN_MODELS } from './mapping';
import { random, seedOf } from './random';

/** Cosine (`real`) and sine (`imag`) coefficients; index 0 (DC) stays 0. */
export interface Spectrum {
	readonly real: Float32Array;
	readonly imag: Float32Array;
}

/** Harmonics in every spectrum: enough for bright tones at the bottom of the keyboard. */
export const HARMONICS = 64;

/** A spectrum from sine-phase amplitudes per harmonic (1-based). */
function sines(amplitude: (n: number) => number, harmonics = HARMONICS): Spectrum {
	const real = new Float32Array(harmonics + 1);
	const imag = new Float32Array(harmonics + 1);
	for (let n = 1; n <= harmonics; n++) imag[n] = amplitude(n);
	return { real, imag };
}

/** A blend of two spectra (weight 0 = `a`, 1 = `b`). */
export function blend(a: Spectrum, b: Spectrum, weight: number): Spectrum {
	const mix = (x: Float32Array, y: Float32Array) =>
		x.map((v, i) => v * (1 - weight) + y[i] * weight);
	return { real: mix(a.real, b.real), imag: mix(a.imag, b.imag) };
}

const odd = (n: number) => n % 2 === 1;

/** The classic shapes. */
export const sineSpectrum = (): Spectrum => sines((n) => (n === 1 ? 1 : 0));
export const triangleSpectrum = (): Spectrum =>
	sines((n) =>
		odd(n) ? (8 / (Math.PI * Math.PI * n * n)) * (((n - 1) / 2) % 2 === 0 ? 1 : -1) : 0
	);
export const sawSpectrum = (): Spectrum => sines((n) => (2 / (Math.PI * n)) * (odd(n) ? 1 : -1));

/** A pulse high for `duty` of the cycle (0.5 is a square). */
export function pulseSpectrum(duty: number): Spectrum {
	const real = new Float32Array(HARMONICS + 1);
	const imag = new Float32Array(HARMONICS + 1);
	for (let n = 1; n <= HARMONICS; n++) {
		const a = 2 * Math.PI * n * duty;
		real[n] = (2 * Math.sin(a)) / (Math.PI * n);
		imag[n] = (2 * (1 - Math.cos(a))) / (Math.PI * n);
	}
	return { real, imag };
}

/**
 * A spectrum measured from one period of a waveform (a DFT of `samples` points), for shapes easier
 * to draw than to write as a series.
 */
export function measure(
	wave: (phase: number) => number,
	harmonics = HARMONICS,
	samples = 2048
): Spectrum {
	const x = Float32Array.from({ length: samples }, (_, i) => wave(i / samples));
	const real = new Float32Array(harmonics + 1);
	const imag = new Float32Array(harmonics + 1);
	for (let n = 1; n <= harmonics; n++) {
		let re = 0;
		let im = 0;
		const w = (2 * Math.PI * n) / samples;
		for (let i = 0; i < samples; i++) {
			re += x[i] * Math.cos(w * i);
			im += x[i] * Math.sin(w * i);
		}
		real[n] = (2 * re) / samples;
		imag[n] = (2 * im) / samples;
	}
	return { real, imag };
}

/**
 * Hard sync: a saw restarted by a master oscillator, running `ratio` times faster between restarts.
 * The result repeats at the master's pitch, so one period describes it (at ratio 1, a plain saw).
 */
export const syncSpectrum = (ratio: number): Spectrum =>
	measure((phase) => 2 * ((phase * ratio) % 1) - 1);

/** The samplers' stand-in tone: a sine with a whisper of second and third harmonic. */
export const softSpectrum = (): Spectrum => sines((n) => [0, 1, 0.12, 0.04][n] ?? 0);

/**
 * The multisampler's stand-in source: every harmonic nearly as loud as the next (a new project's
 * pad/bandpasser, past its filter, falls like a flat series through the preset's z lowpass), in
 * fixed scattered phases so the wave stays smooth rather than a click train.
 */
export function bandSpectrum(): Spectrum {
	const next = random(seedOf(11));
	const real = new Float32Array(HARMONICS + 1);
	const imag = new Float32Array(HARMONICS + 1);
	for (let n = 1; n <= HARMONICS; n++) {
		const amplitude = Math.pow(n, -0.15);
		const phase = 2 * Math.PI * next();
		real[n] = amplitude * Math.sin(phase);
		imag[n] = amplitude * Math.cos(phase);
	}
	return { real, imag };
}

/** The random LFO: sixteen held random levels, one after another (the wave runs at rate ÷ 16). */
export const RANDOM_STEPS = 16;
export function randomStepsSpectrum(seed = 3): Spectrum {
	const next = random(seedOf(seed));
	const levels = Array.from({ length: RANDOM_STEPS }, () => next() * 2 - 1);
	return measure((phase) => levels[Math.floor(phase * RANDOM_STEPS)], 48, 1024);
}

// ─────────────────────────────────────────────────────────── organ

/** A drawbar level (0–8) as an amplitude: each step down is 3 dB. */
const drawbar = (level: number) => (level <= 0 ? 0 : Math.pow(10, (-3 * (8 - level)) / 20));

/**
 * Drawbars above the 16′, as harmonics of the 16′ (the organ's main oscillator runs an octave below
 * the note so the 5⅓′ quint fits): 5⅓′, 8′, 4′, 2⅔′, 2′, 1⅗′, 1⅓′, 1′.
 */
const DRAWBAR_HARMONICS = [3, 2, 4, 6, 8, 10, 12, 16];

/** Registrations of the models that are drawbar organs. */
const REGISTRATIONS: Partial<Record<(typeof ORGAN_MODELS)[number], readonly number[]>> = {
	church: [0, 8, 7, 3, 6, 0, 3, 5],
	full: [8, 8, 8, 8, 8, 8, 8, 8],
	jazz: [8, 8, 0, 0, 0, 0, 0, 0]
};

/**
 * An organ model's main oscillator (the 16′ is a separate sine, the bass control). Transistor is a
 * bright square-ish combo organ, reed a nasal harmonium; the others are drawbar registrations.
 */
export function organSpectrum(model: number): Spectrum {
	const name = ORGAN_MODELS[Math.min(Math.max(0, Math.round(model)), ORGAN_MODELS.length - 1)];
	if (name === 'transistor') {
		// an 8′ and a softer 4′ square: odd multiples of harmonic 2 and of harmonic 4
		return sines((n) => {
			if (n % 2 !== 0) return 0;
			const k = n / 2;
			const eight = odd(k) ? 1 / Math.pow(k, 1.1) : 0;
			const four = n % 4 === 0 && odd(n / 4) ? 0.5 / Math.pow(n / 4, 1.1) : 0;
			return eight + four;
		});
	}
	if (name === 'reed') {
		// a saw on the 8′ with a nasal bump around its third to fifth harmonics
		return sines((n) => {
			if (n % 2 !== 0) return 0;
			const k = n / 2;
			return (1 / k) * (1 + 1.2 * Math.exp(-((k - 4) ** 2) / 3));
		});
	}
	const levels = REGISTRATIONS[name] ?? REGISTRATIONS.full!;
	return sines((n) => {
		const bar = DRAWBAR_HARMONICS.indexOf(n);
		return bar >= 0 ? drawbar(levels[bar]) : 0;
	});
}

// ─────────────────────────────────────────────────────────── wavetables

/** Vowel formants (Hz) for the vocal table: a, e, i, o, u. */
const VOWELS = [
	[800, 1150, 2900],
	[400, 1600, 2700],
	[350, 2300, 3000],
	[450, 800, 2830],
	[325, 700, 2530]
];

/** A voiced vowel at a 130 Hz reference: harmonics shaped by three formant peaks. */
function vowel(formants: readonly number[]): Spectrum {
	return sines((n) => {
		const f = n * 130;
		const gain = formants.reduce(
			(sum, centre, i) => sum + Math.exp(-(((f - centre) / (80 + 40 * i)) ** 2)) / (i + 1),
			0
		);
		return (gain + 0.02) / Math.sqrt(n);
	});
}

/**
 * One frame (0 … WAVETABLE_FRAMES − 1) of a wavetable. basic runs sine → pulse; bright opens up
 * harmonics; vocal walks the vowels; hollow fades out the even harmonics; bell and metal are sparse
 * digital spectra; sync sweeps hard-sync ratios; pulse narrows a pulse; organ pulls out drawbars.
 */
export function wavetableFrame(table: number, frame: number): Spectrum {
	const name = WAVETABLES[Math.min(Math.max(0, Math.round(table)), WAVETABLES.length - 1)];
	const k = Math.min(Math.max(0, Math.round(frame)), WAVETABLE_FRAMES - 1);
	switch (name) {
		case 'basic':
			return [
				sineSpectrum,
				triangleSpectrum,
				() => blend(triangleSpectrum(), sawSpectrum(), 0.5),
				sawSpectrum,
				() => pulseSpectrum(0.5),
				() => pulseSpectrum(0.3),
				() => pulseSpectrum(0.15),
				() => pulseSpectrum(0.07)
			][k]();
		case 'bright': {
			const top = 2 ** (k + 1);
			return sines(
				(n) => (1 / Math.pow(n, k < 6 ? 1 : 1 - 0.2 * (k - 5))) * Math.exp(-((n / top) ** 2))
			);
		}
		case 'vocal': {
			const at = (k / (WAVETABLE_FRAMES - 1)) * (VOWELS.length - 1);
			const from = Math.floor(at);
			const to = Math.min(VOWELS.length - 1, from + 1);
			const w = at - from;
			return vowel(VOWELS[from].map((f, i) => f * (1 - w) + VOWELS[to][i] * w));
		}
		case 'hollow':
			return sines((n) => (odd(n) ? 1 : 1 - k / (WAVETABLE_FRAMES - 1)) / n);
		case 'bell': {
			const partials = [1, 3 + k, 7 + 2 * k, 13 + 3 * k];
			return sines((n) => {
				const at = partials.indexOf(n);
				return at >= 0 ? [1, 0.6, 0.4, 0.25][at] : 0;
			});
		}
		case 'sync':
			return syncSpectrum([1, 1.5, 2, 2.5, 3, 3.5, 4, 5][k]);
		case 'pulse':
			return pulseSpectrum([0.5, 0.42, 0.34, 0.27, 0.2, 0.14, 0.09, 0.05][k]);
		case 'organ': {
			// 8′, 4′, 2⅔′, 2′, 1⅗′, 1⅓′, 1′ as harmonics of the note, pulled out one by one
			const bars = [1, 2, 3, 4, 5, 6, 8];
			return sines((n) => {
				const at = bars.indexOf(n);
				return at >= 0 && at <= k ? drawbar(8 - at * 0.5) : 0;
			});
		}
		case 'metal': {
			const next = random(seedOf(9, k));
			const density = 0.1 + 0.1 * k;
			return sines((n) => (n === 1 ? 1 : next() < density ? next() / Math.sqrt(n) : 0));
		}
	}
}
