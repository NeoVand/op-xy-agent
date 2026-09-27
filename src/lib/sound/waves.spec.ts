import { describe, expect, it } from 'vitest';
import { ORGAN_MODELS, WAVETABLES, WAVETABLE_FRAMES } from './mapping';
import {
	HARMONICS,
	measure,
	organSpectrum,
	pulseSpectrum,
	randomStepsSpectrum,
	sawSpectrum,
	syncSpectrum,
	wavetableFrame,
	type Spectrum
} from './waves';

/** Amplitude of harmonic n. */
const amp = (s: Spectrum, n: number) => Math.hypot(s.real[n], s.imag[n]);

describe('waveform spectra', () => {
	it('writes the classic shapes as their series', () => {
		const saw = sawSpectrum();
		expect(amp(saw, 1)).toBeCloseTo(2 / Math.PI);
		expect(amp(saw, 2)).toBeCloseTo(1 / Math.PI);
		const square = pulseSpectrum(0.5);
		expect(amp(square, 1)).toBeCloseTo(4 / Math.PI);
		expect(amp(square, 2)).toBeCloseTo(0);
		expect(amp(pulseSpectrum(0.1), 2)).toBeGreaterThan(0.1);
		expect(saw.real[0]).toBe(0);
		expect(saw.imag).toHaveLength(HARMONICS + 1);
	});

	it('measures a drawn period: hard sync at ratio 1 is a plain saw, higher ratios move energy up', () => {
		const measured = measure((p) => 2 * p - 1);
		const saw = sawSpectrum();
		for (const n of [1, 2, 5]) expect(amp(measured, n)).toBeCloseTo(amp(saw, n), 2);
		const synced = syncSpectrum(4.5);
		expect(amp(synced, 4) + amp(synced, 5)).toBeGreaterThan(amp(synced, 1));
	});

	it("builds the organ's models on a base an octave down, leaving the 16′ to the bass control", () => {
		for (let m = 0; m < ORGAN_MODELS.length; m++) {
			const s = organSpectrum(m);
			expect(amp(s, 1), ORGAN_MODELS[m]).toBe(0);
			expect(amp(s, 2), ORGAN_MODELS[m]).toBeGreaterThan(0.3);
		}
		const jazz = organSpectrum(ORGAN_MODELS.indexOf('jazz'));
		// 888 000 000: 16′ (the bass), 5⅓′ (harmonic 3) and 8′ (harmonic 2) only
		expect(amp(jazz, 3)).toBeCloseTo(1);
		expect(amp(jazz, 4)).toBe(0);
		expect(amp(organSpectrum(ORGAN_MODELS.indexOf('full')), 16)).toBeCloseTo(1);
	});

	it('fills nine wavetables of eight frames that change as the position moves', () => {
		for (let t = 0; t < WAVETABLES.length; t++) {
			const first = wavetableFrame(t, 0);
			const last = wavetableFrame(t, WAVETABLE_FRAMES - 1);
			expect(
				first.imag.some((v, n) => n > 0 && v !== 0),
				WAVETABLES[t]
			).toBe(true);
			expect(Array.from(last.imag).concat(Array.from(last.real)), WAVETABLES[t]).not.toEqual(
				Array.from(first.imag).concat(Array.from(first.real))
			);
			for (const v of [...first.imag, ...last.imag, ...last.real])
				expect(Number.isFinite(v)).toBe(true);
		}
		// the bright table opens up: more energy in the upper harmonics at the end
		const high = (s: Spectrum) =>
			Array.from({ length: 32 }, (_, i) => amp(s, 32 + i)).reduce((a, b) => a + b);
		expect(high(wavetableFrame(1, 7))).toBeGreaterThan(10 * high(wavetableFrame(1, 0)));
	});

	it('gives the random LFO a fixed stepped pattern', () => {
		expect(randomStepsSpectrum()).toEqual(randomStepsSpectrum());
		expect(amp(randomStepsSpectrum(), 1)).toBeGreaterThan(0);
	});
});
