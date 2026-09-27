// axis measured on its own at 48 kHz: slow beating just below unison, the octave below at ratio
// 0, sidebands where the ratio steps put them, tone darkening, tremolo at its rate, and the bounds
// every engine keeps: level at the default M1, peaks, aliasing and no clicks as parameters move.
import { describe, expect, it } from 'vitest';
import { centroid, inharmonicDb, levelAt, rms } from '../analysis';
import { SR, peak, play, roughness, throughCore } from './audition';
import { AxisVoice, axisRatio } from './axis';

const DEFAULT = [80 / 99, 80 / 99, 80 / 99, 80 / 99];
const axis = () => new AxisVoice(SR, 7);
/** A note whose period is exactly 256 samples, so level windows can hold whole periods. */
const EVEN = SR / 256;
/** RMS over consecutive windows of `periods` periods of {@link EVEN}: the level's envelope. */
function envelope(x: Float32Array, periods: number): number[] {
	const n = 256 * periods;
	const out: number[] = [];
	for (let i = 0; i + n <= x.length; i += n) out.push(rms(x, i, i + n));
	return out;
}

describe('axis', () => {
	it('maps ratio: an octave below at 0, unison at 50, fifths and fourths up five octaves', () => {
		expect(axisRatio(0)).toBeCloseTo(0.5, 6);
		expect(axisRatio(49 / 99)).toBeGreaterThan(0.995);
		expect(axisRatio(49 / 99)).toBeLessThan(1);
		// most of the detune half sits near unison: 45 is still within a third of a semitone
		expect(axisRatio(45 / 99)).toBeGreaterThan(Math.pow(2, -1 / 36));
		expect([50, 55, 60, 64, 69, 73, 78, 82, 87, 91, 99].map((m) => axisRatio(m / 99))).toEqual([
			1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32
		]);
	});

	it('beats slowly just below 50 and holds steady at unison', () => {
		const at = (m: number, seconds: number) =>
			envelope(play(axis(), { hz: EVEN, seconds, params: [1, m / 99, 0.5, 0] }).left, 4).slice(5);
		const depth = (e: number[]) => Math.max(...e) / Math.min(...e);
		// 45: a few beats a second (the chorus), 49: one every few seconds
		const chorus = at(45, 1.5);
		expect(depth(chorus)).toBeGreaterThan(1.5);
		const slow = at(49, 4);
		expect(depth(slow)).toBeGreaterThan(1.3);
		let step = 0;
		for (let i = 1; i < slow.length; i++)
			step = Math.max(step, Math.abs(slow[i] / slow[i - 1] - 1));
		expect(step).toBeLessThan(0.03);
		expect(depth(at(50, 1.5))).toBeLessThan(1.05);
	});

	it('has the octave below at ratio 0, and none at unison', () => {
		const sub = (m: number) => {
			const { left } = play(axis(), { hz: 220, seconds: 0.5, params: [1, m / 99, 0.5, 0] });
			const x = left.subarray(4800, 4800 + 16384);
			return { below: levelAt(x, SR, 110), note: levelAt(x, SR, 220) };
		};
		const zero = sub(0);
		expect(zero.below).toBeGreaterThan(0.1);
		expect(zero.below).toBeGreaterThan(zero.note * 0.5);
		expect(sub(50).below).toBeLessThan(1e-3);
	});

	it('puts sidebands where the ratio steps say', () => {
		// triangles (shape 1) have odd harmonics only: sidebands r apart keep that parity at r = 2,
		// break it at r = 3, and fall halfway between harmonics at r = 1.5
		const spectrum = (m: number) => {
			const { left } = play(axis(), { hz: 220, seconds: 0.5, params: [1, m / 99, 1, 0] });
			const x = left.subarray(4800, 4800 + 16384);
			return (multiple: number) => levelAt(x, SR, 220 * multiple);
		};
		const two = spectrum(60);
		expect(two(2)).toBeGreaterThan(0.05); // op2 itself (its triangle adds 6, 10, …)
		expect(two(4)).toBeLessThan(1e-3);
		expect(two(8)).toBeLessThan(1e-3);
		const three = spectrum(64);
		expect(three(3)).toBeGreaterThan(0.05);
		expect(three(2)).toBeGreaterThan(0.02);
		expect(three(4)).toBeGreaterThan(0.02);
		const fifth = spectrum(55);
		expect(fifth(1.5)).toBeGreaterThan(0.05);
		expect(fifth(0.5)).toBeGreaterThan(0.02);
		expect(fifth(2.5)).toBeGreaterThan(0.02);
	});

	it('darkens as tone falls', () => {
		const brightness = [0.2, 0.5, 1].map((tone) => {
			const { left } = play(axis(), { hz: 220, seconds: 0.5, params: [tone, 0.6, 0, 0] });
			return centroid(left.subarray(4800), SR);
		});
		expect(brightness[0]).toBeLessThan(brightness[1] * 0.8);
		expect(brightness[1]).toBeLessThan(brightness[2]);
	});

	it('tremolo moves the level at its rate and depth, both rising with the knob', () => {
		const tremolo = (amount: number, rate: number, depth: number) => {
			const { left } = play(axis(), { hz: EVEN, seconds: 2.2, params: [1, 0.52, 0.5, amount] });
			// two-period windows: the envelope sampled at EVEN / 2
			const e = Float64Array.from(envelope(left, 2).slice(20));
			const mean = e.reduce((s, v) => s + v, 0) / e.length;
			const ac = e.map((v) => v - mean);
			const at = levelAt(ac, EVEN / 2, rate);
			expect(at).toBeGreaterThan(3 * levelAt(ac, EVEN / 2, rate * 0.6));
			expect(at).toBeGreaterThan(3 * levelAt(ac, EVEN / 2, rate * 1.6));
			// gain from 1 down to 1 − D: the envelope's swing
			expect(Math.min(...e) / Math.max(...e)).toBeCloseTo(1 - depth, 1);
		};
		tremolo(0.5, 0.5 * Math.sqrt(20), 0.3);
		tremolo(1, 10, 0.6);
		const still = envelope(
			play(axis(), { hz: EVEN, seconds: 1, params: [1, 0.52, 0.5, 0] }).left,
			2
		);
		expect(Math.max(...still.slice(5)) / Math.min(...still.slice(5))).toBeLessThan(1.02);
	});

	it('plays through the synth core at the same level', () => {
		const x = throughCore('axis', [80, 80, 80, 80]);
		expect(x.every(Number.isFinite)).toBe(true);
		expect(rms(x, 2400)).toBeGreaterThan(0.2);
		expect(rms(x, 2400)).toBeLessThan(0.35);
	});

	it('sits at the level every engine shares at the default M1 (0.2–0.35 RMS per channel)', () => {
		const { left, right } = play(axis(), { hz: 220, seconds: 1.05, params: DEFAULT });
		for (const x of [left, right]) {
			expect(rms(x, 2400)).toBeGreaterThan(0.2);
			expect(rms(x, 2400)).toBeLessThan(0.35);
		}
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (const tone of [0, 0.15, 0.3, 1]) {
				for (const ratio of [0, 0.45, 0.52, 0.6, 1]) {
					for (const shape of [0, 1]) {
						const params = [tone, ratio, shape, 1];
						worst = Math.max(worst, peak(play(axis(), { hz, seconds: 0.25, params }).left));
					}
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('keeps aliasing below −50 dB at 1–2 kHz on every ratio step', () => {
		for (const hz of [1003, 1499, 2011]) {
			for (let step = 0; step < 11; step++) {
				const p = 0.5 + (step + 0.5) / 22;
				// the fifth's sidebands fall halfway between harmonics: its period is two cycles
				const f0 = axisRatio(p) === 1.5 ? hz / 2 : hz;
				for (const shape of [0, 1]) {
					const { left } = play(axis(), { hz, seconds: 0.45, params: [1, p, shape, 0] });
					expect(inharmonicDb(left.subarray(4096, 4096 + 16384), SR, f0)).toBeLessThan(-50);
				}
			}
		}
	});

	it('glides through parameter jumps without clicks', () => {
		// Every parameter jumps between 0 and 1 every 50 ms. Smoothing turns each jump into a 5 ms
		// glide (ratio steps included: op2 slides to its new pitch), through shapes the static
		// settings also make, so the waveform's second difference stays within theirs; a click would
		// add its full jump, a hundredth or more, on top. 25% covers the glides' in-between shapes.
		const settings = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (let param = 0; param < 4; param++) {
			const at = (v: number) => [0.6, 0.6, 0.5, 0.3].map((x, i) => (i === param ? v : x));
			const still = Math.max(
				...settings.map((v) =>
					roughness(play(axis(), { hz: 220, seconds: 0.3, params: at(v) }).left)
				)
			);
			const jumping = play(axis(), {
				hz: 220,
				seconds: 0.6,
				params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? 0 : 1)
			}).left;
			expect(roughness(jumping)).toBeLessThan(still * 1.25);
		}
	});
});
