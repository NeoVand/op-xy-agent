// The synth core's four filter types against the owner's OP-XY (docs/research/60-sound-session.md
// §2): each type's response at CC 64 (and resonance 96) measured with white noise, in dB against
// the unfiltered noise on sixth-octave bands, next to ours from the impulse response. Bands the
// device put below −40 dB are left out (its noise floor and the fits' tolerance).
import { describe, expect, it } from 'vitest';
import type { FilterType } from '$lib/sim/screen/frame';
import { cutoffHz } from '../mapping';
import { makeFilter } from './core';
import { prewarp } from './filters';

const SR = 44100;
const BANDS = [252, 504, 1008, 2016, 4032, 8064];

/** Measured on the owner's unit: [type, cutoff CC, resonance CC, dB at each band]. */
const DEVICE: [FilterType, number, number, number[]][] = [
	['ladder', 64, 0, [-2.6, 0.7, -3.7, -13.1, -28.5, -48.6]],
	['ladder', 64, 96, [-8.3, -3.9, -3.4, 2.8, -22.9, -44.0]],
	['svf', 64, 0, [0.4, 1.4, 0.7, -2.0, -12.1, -32.5]],
	['svf', 64, 96, [-3.0, -0.4, 1.5, 7.7, -19.4, -45.5]],
	['svf', 32, 0, [-1.5, -6.1, -26.7, -50.7, -74.4, -84.7]],
	['z lowpass', 64, 0, [-3.8, -6.1, -13.1, -20.2, -26.9, -38.3]],
	['z lowpass', 64, 96, [-4.5, -1.5, 13.0, -14.5, -28.3, -42.2]],
	['z hipass', 64, 0, [-21.5, -12.9, -7.4, -4.4, -1.7, -0.2]],
	['z hipass', 64, 96, [-16.1, 4.3, -1.9, -4.6, -4.2, -4.5]]
];

/** Our filter's gain (dB) over each sixth-octave band, from a quiet impulse (the ladder saturates). */
function ours(type: FilterType, cutoffCc: number, resonanceCc: number): number[] {
	const filter = makeFilter(type);
	filter.set(prewarp(cutoffHz((cutoffCc * 99) / 127, type), SR), (resonanceCc * 99) / 127, 0);
	const n = 32768;
	const h = new Float64Array(n);
	const amp = 1e-3;
	for (let i = 0; i < n; i++) h[i] = filter.process(i === 0 ? amp : 0) / amp;
	return BANDS.map((band) => {
		let power = 0;
		const steps = 9;
		for (let s = 0; s < steps; s++) {
			const f = band * Math.pow(2, (s / (steps - 1) - 0.5) / 6);
			let re = 0;
			let im = 0;
			for (let i = 0; i < n; i++) {
				const w = (2 * Math.PI * f * i) / SR;
				re += h[i] * Math.cos(w);
				im -= h[i] * Math.sin(w);
			}
			power += re * re + im * im;
		}
		return 10 * Math.log10(power / steps);
	});
}

describe('the synth core’s filters against the owner’s unit (research 60 §2)', () => {
	it.each(DEVICE)('%s at cutoff %i, resonance %i', (type, cutoff, resonance, device) => {
		const mine = ours(type, cutoff, resonance);
		const off = device
			.map((d, i) => ({ band: BANDS[i], device: d, ours: +mine[i].toFixed(1) }))
			.filter((b) => b.device > -40 && Math.abs(b.ours - b.device) > 3.5);
		expect(off).toEqual([]);
	});
});
