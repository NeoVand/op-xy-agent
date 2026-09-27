// axis against the device: four feedback operators of one waveform (three copies of the note at
// −9, −4 and +8 cents, op2 +4 cents off its ratio) at one level, tone's feedback and its band limit,
// shape's crossfade to y² feedback, the ratio law and op2's level steps, the 180 Hz highpass, the
// tremolo's dip, the device's level and its ringing at full tone, and the bounds every engine keeps.
// Played on its own at 48 kHz, block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { levelAt, powerSpectrum, rms } from '../analysis';
import { DEVICE_GAIN_DB } from './device';
import { BOUNDS, SR, clickRatios, grid, m1, play, throughCore, worstPeak } from './audition';
import {
	AxisVoice,
	COPIES,
	HIGHPASS_HZ,
	OP2_CENTS,
	OP2_DB,
	STEPS,
	TREMOLO,
	TREMOLO_DELAY,
	axisRatio
} from './axis';

const make = () => new AxisVoice(SR);
const DEFAULT = m1(49, 49, 0, 0);
const db = (x: number) => 20 * Math.log10(x);
const cents = (hz: number, c: number) => hz * Math.pow(2, c / 1200);
/** The one-pole highpass's gain at `hz`. */
const highpass = (hz: number) => hz / Math.hypot(hz, HIGHPASS_HZ);
/** The ratio knob's position for step `i` above the middle. */
const step = (i: number) => 0.5 + 0.05 * (i + 0.5);

/** Amplitude of what lies within ±`width` cents of `hz` (a cluster of close partials). */
function band(x: Float32Array, hz: number, width = 40): number {
	const { power, binHz } = powerSpectrum(x, SR, 'hann');
	let sum = 0;
	for (let i = Math.ceil(cents(hz, -width) / binHz); i <= cents(hz, width) / binHz; i++)
		sum += power[i];
	return Math.sqrt(2 * sum);
}

describe('axis', () => {
	it('plays three copies of the note at −9, −4 and +8 cents and op2 +4 cents off its ratio', () => {
		// tone 0: near-sines; ratio 25/127: op2 at 0.697 × the note, clear of the copies
		const hz = 880;
		const p = 25 / 127;
		const { left } = play(make(), hz, 2.5, [0, p, 0, 0]);
		const x = left.subarray(4800);
		const copies = COPIES.map((c) => levelAt(x, SR, cents(hz, c)));
		const op2 = levelAt(x, SR, cents(hz * axisRatio(p), OP2_CENTS));
		for (const level of copies) expect(db(level / copies[0])).toBeCloseTo(0, 0);
		// op2 at the copies' level, but for the highpass's tilt between their pitches
		expect(db(op2 / copies[0])).toBeCloseTo(db(highpass(hz * 0.697) / highpass(hz)), 0);
		// nothing at the note itself, between the copies
		expect(levelAt(x, SR, hz)).toBeLessThan(0.2 * copies[0]);
		expect(axisRatio(p)).toBeCloseTo(0.5 + p, 6);
	});

	it('maps ratio: 0.5–1 straight below the middle, then 1, 2, 3, 4, 6, 8, 12, 16, 24, 32', () => {
		expect(axisRatio(0)).toBe(0.5);
		expect(axisRatio(0.25)).toBe(0.75);
		expect(axisRatio(0.5)).toBe(1);
		expect(STEPS.map((_, i) => axisRatio(step(i)))).toEqual([1, 2, 3, 4, 6, 8, 12, 16, 24, 32]);
		// op2 plays each step at its measured level, against op2 in the lower half (the copies'
		// level): tone 0, so each is a near-sine, highpassed at its pitch. At ×1 and ×2 op2 sits too
		// close to the copies' partials to read on its own.
		const hz = 110;
		const op2 = (p: number) => {
			const x = play(make(), hz, 1, [0, p, 0, 0]).left.subarray(4800);
			const at = cents(hz * axisRatio(p), OP2_CENTS);
			return levelAt(x, SR, at) / highpass(at);
		};
		const lower = op2(0.25);
		for (let i = 2; i < STEPS.length; i++) {
			expect(db(op2(step(i)) / lower), `×${STEPS[i]}`).toBeCloseTo(OP2_DB[i], 0);
		}
	});

	it('matches the device’s harmonics at tone 64 on A3, op2 up at ×16', () => {
		// the capture's ratio.high=110 take (no glide into it, so the copies beat in the same phase
		// as ours): band powers within ±40 cents of each harmonic, 0.1 s to the note's end
		const hz = 220;
		const x = play(make(), hz, 1.21, [64 / 127, 110 / 127, 0, 0]).left;
		const window = x.subarray(Math.round(0.1 * SR), Math.round(1.19 * SR));
		const h = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => band(window, k * hz));
		const device = [-6.6, -13.3, -18.5, -22.9, -26.8, -30.3, -33.6];
		device.forEach((level, k) => {
			expect(db(h[k + 1] / h[0]), `h${k + 2}`).toBeCloseTo(level, 0);
		});
		// and its level there: −29.8 dBFS from 0.2 s
		expect(db(rms(x, Math.round(0.2 * SR), Math.round(1.19 * SR)))).toBeCloseTo(
			-29.8 + DEVICE_GAIN_DB,
			0
		);
	});

	it('darkens toward sines as tone falls, and brightens as it rises', () => {
		const second = (tone: number) => {
			const y = play(make(), 440, 1, [tone, step(7), 0, 0]).left.subarray(9600);
			return db(band(y, 880) / band(y, 440));
		};
		// the device's A4: −22.0 dB at tone 0, −7.9 dB at full
		expect(second(0)).toBeLessThan(-20);
		expect(second(64 / 127)).toBeGreaterThan(second(0) + 8);
		expect(second(1)).toBeGreaterThan(-9);
	});

	it('fades the feedback out with pitch: pure sines by 3.5 kHz', () => {
		const second = (hz: number) => {
			const y = play(make(), hz, 0.6, [1, step(7), 0, 0]).left.subarray(4800);
			return band(y, 2 * hz) / band(y, hz);
		};
		expect(second(3600)).toBeLessThan(0.01);
		expect(second(1760)).toBeLessThan(second(440) * 0.6);
	});

	it('crossfades the feedback to y² with shape: odd harmonics only at full', () => {
		const hz = 440;
		const harmonics = (shape: number) => {
			const y = play(make(), hz, 1.25, [64 / 127, 64 / 127, shape, 0]).left.subarray(21600);
			return [1, 2, 3, 4, 5].map((k) => band(y, k * hz));
		};
		const [h1, h2, h3, h4, h5] = harmonics(1);
		expect(h2 / h1).toBeLessThan(1e-3);
		expect(h4 / h1).toBeLessThan(1e-3);
		// the device: h3 −15.9 and h5 −24.7 dB at shape 127 (its note glided in, so its partials
		// beat in other phases than ours: within 2 dB)
		expect(Math.abs(db(h3 / h1) + 15.9)).toBeLessThan(2);
		expect(Math.abs(db(h5 / h1) + 24.7)).toBeLessThan(2);
		// halfway the even harmonics are falling, the odd ones holding
		const half = harmonics(64 / 127);
		const saw = harmonics(0);
		expect(half[1] / half[0]).toBeLessThan((saw[1] / saw[0]) * 0.7);
		expect(db(half[2] / half[0])).toBeGreaterThan(db(saw[2] / saw[0]) - 5);
	});

	it('highpasses the sum at 180 Hz, one pole: low notes play thinner', () => {
		// op2 in the lower half (0.75 × the note) as the probe: a near-sine at tone 0, clear of the
		// copies' partials, at the same level on every note
		const probe = (at: number) => {
			const hz = at / (0.75 * Math.pow(2, OP2_CENTS / 1200));
			const x = play(make(), hz, 1.5, [0, 0.25, 0, 0]).left.subarray(4800);
			return levelAt(x, SR, at);
		};
		const reference = probe(880);
		for (const at of [55, 110, 220]) {
			expect(db(probe(at) / reference), `${at} Hz`).toBeCloseTo(
				db(highpass(at) / highpass(880)),
				0
			);
		}
	});

	it('dips the level by half the tremolo’s depth at once, its swing arriving later', () => {
		const hz = 440;
		const base = play(make(), hz, 1.6, [64 / 127, step(7), 0, 0]).left;
		for (const cc of [25, 64, 127]) {
			const x = play(make(), hz, 1.6, [64 / 127, step(7), 0, cc / 127]).left;
			const i = [0, 13, 25, 38, 51, 64, 76, 89, 102, 114, 127].indexOf(cc);
			const depth = TREMOLO.depth[i];
			// before the swing: a steady 1 − depth/2
			const early =
				rms(x, 2400, Math.round(TREMOLO_DELAY * SR)) / rms(base, 2400, TREMOLO_DELAY * SR);
			expect(early, `CC ${cc}`).toBeCloseTo(1 - depth / 2, 2);
			// later, the gain window by window swings at the tremolo's rate
			const win = 240;
			const gains: number[] = [];
			for (let at = SR * 0.6; at + win <= SR * 1.6; at += win) {
				gains.push(rms(x, at, at + win) / rms(base, at, at + win));
			}
			const g = Float64Array.from(gains);
			const mean = g.reduce((s, v) => s + v, 0) / g.length;
			const ac = g.map((v) => v - mean);
			const rate = TREMOLO.hz[i];
			const at = levelAt(ac, SR / win, rate);
			expect(at, `CC ${cc}`).toBeGreaterThan(3 * levelAt(ac, SR / win, rate * 0.6));
			expect(Math.min(...g), `CC ${cc}`).toBeCloseTo(1 - depth, 1);
		}
	});

	it('plays each oscillator at the device’s level: −27.7 dBFS at tone 0', () => {
		// op2 in the lower half, clear of the copies: its sine, the highpass taken off
		const hz = 440;
		const x = play(make(), hz, 1.5, [0, 0.25, 0, 0]).left.subarray(4800);
		const at = cents(hz * 0.75, OP2_CENTS);
		expect(db(levelAt(x, SR, at) / highpass(at))).toBeCloseTo(-27.7 + DEVICE_GAIN_DB, 0);
	});

	it('rings at half the sample rate only near full tone, as the device does', () => {
		const nyquist = (tone: number) => {
			const x = play(make(), 440, 1, [tone, 64 / 127, 0, 0]).left.subarray(4800);
			const { power, binHz } = powerSpectrum(x, SR);
			let high = 0;
			let all = 0;
			power.forEach((p, i) => {
				all += p;
				if (i * binHz > 20000) high += p;
			});
			return 10 * Math.log10(high / all);
		};
		expect(nyquist(102 / 127)).toBeLessThan(-50);
		expect(nyquist(1)).toBeGreaterThan(-20);
	});

	it('plays through the synth core as it does on its own', () => {
		const x = throughCore('axis', [49, 49, 0, 0], 0.5);
		expect(x.every(Number.isFinite)).toBe(true);
		const alone = play(make(), 220, 0.5, m1(49, 49, 0, 0)).left;
		expect(rms(x, 4800) / rms(alone, 4800)).toBeCloseTo(1, 1);
	});

	it('never peaks past ±1.2, on any setting or note', { timeout: 60_000 }, () => {
		const { peak, at } = worstPeak(make, grid([0, 0.5, 1]), BOUNDS.notes);
		expect(peak, at).toBeLessThan(BOUNDS.peak);
	});

	it('moves every parameter without clicks', { timeout: 60_000 }, () => {
		for (let k = 0; k < 4; k++) {
			const { sweep, jump, back } = clickRatios(make, DEFAULT, k);
			expect(Math.max(sweep, jump, back), `p${k + 1}`).toBeLessThan(BOUNDS.click);
		}
	});

	it(
		'keeps what folds back past Nyquist below −45 dB on 1–2 kHz notes',
		{ timeout: 60_000 },
		() => {
			// the copies and op2 sit off the note's harmonics by design; aliasing is what lies away
			// from every one of their clusters
			let worst = -Infinity;
			let where = '';
			for (const hz of BOUNDS.highNotes) {
				for (const i of [0, 1, 3, 5, 9]) {
					for (const shape of [0, 1]) {
						const p = step(i);
						const x = play(make(), hz, (4096 + 16384) / SR, [0.7, p, shape, 0]).left.subarray(
							4096,
							4096 + 16384
						);
						const { power, binHz } = powerSpectrum(x, SR);
						const op2 = cents(hz * axisRatio(p), OP2_CENTS);
						let off = 0;
						let all = 0;
						for (let b = Math.ceil(20 / binHz); b < power.length; b++) {
							const f = b * binHz;
							all += power[b];
							const near = (f0: number) => {
								const k = Math.max(1, Math.round(f / f0));
								return Math.abs(f - k * f0) < 6 * binHz + k * f0 * 0.006;
							};
							if (!near(hz) && !near(op2)) off += power[b];
						}
						const level = 10 * Math.log10(off / all);
						if (level > worst) {
							worst = level;
							where = `×${STEPS[i]} shape ${shape} at ${hz} Hz`;
						}
					}
				}
			}
			expect(worst, where).toBeLessThan(BOUNDS.inharmonic);
		}
	);
});
