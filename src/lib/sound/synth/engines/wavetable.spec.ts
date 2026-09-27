// The wavetable engine measured on its own at 48 kHz: a sine with everything at 0, each table's
// first frame in its family, position moving the spectrum smoothly, warp as PWM on any shape,
// drift inert without warp and harmonic again at the top, and the bounds every engine keeps:
// level at the default M1, peaks, aliasing and no clicks as parameters move.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, rms } from '../analysis';
import { SR, peak, playNote, roughness, throughCore } from './audition';
import { TABLES, WavetableVoice } from './wavetable';

const DEFAULT = [80 / 99, 80 / 99, 80 / 99, 80 / 99];
const wavetable = () => new WavetableVoice(SR);
/** table's M1 value for table `t`, mid-zone. */
const tableAt = (t: number) => (t + 0.5) / TABLES.length;
const named = (name: string) => tableAt(TABLES.findIndex((t) => t.name === name));
/** A steady stretch of a note, 16384 samples from 50 ms in. */
const steady = (params: number[], hz = 220) =>
	playNote(wavetable(), { hz, seconds: 0.45, params }).left.subarray(2400, 2400 + 16384);
/** Harmonics 1…count relative to the fundamental. */
const relative = (x: Float32Array, count: number, hz = 220) => {
	const levels = harmonicLevels(x, SR, hz, count);
	return levels.map((v) => v / levels[0]);
};

describe('wavetable', () => {
	it('is a pure sine with every parameter at 0', () => {
		const x = steady([0, 0, 0, 0]);
		const [h1, ...rest] = harmonicLevels(x, SR, 220, 8);
		expect(h1).toBeGreaterThan(0.3);
		for (const h of rest) expect(h / h1).toBeLessThan(1e-3);
		expect(inharmonicDb(x, SR, 220)).toBeLessThan(-80);
	});

	it('starts each table on its family’s wave', () => {
		const first = (name: string, count = 8) => relative(steady([named(name), 0, 0, 0]), count);
		// saws: 1/n
		for (const name of ['buzz', 'zap']) {
			first(name).forEach((h, i) => expect(h).toBeCloseTo(1 / (i + 1), 1));
		}
		// a triangle: odd harmonics at 1/n²
		const tri = first('basic');
		expect(tri[1]).toBeLessThan(1e-3);
		expect(tri[2]).toBeCloseTo(1 / 9, 2);
		expect(tri[4]).toBeCloseTo(1 / 25, 2);
		// sines
		for (const name of ['formant', 'geometric', 'fibonacci']) {
			for (const h of first(name).slice(1)) expect(h).toBeLessThan(1e-3);
		}
		// saws made of saws: a saw's odd harmonics, extra in the octaves
		const fractal = first('fractal');
		expect(fractal[2]).toBeCloseTo(1 / 3, 1);
		expect(fractal[1]).toBeGreaterThan(0.6);
		expect(fractal[3]).toBeGreaterThan(0.35);
		// a sine held at 16 steps: nothing low but the fundamental, the steps' images at 15 and 17
		const crush = first('crush', 17);
		for (const h of crush.slice(1, 12)) expect(h).toBeLessThan(0.01);
		expect(crush[14]).toBeGreaterThan(0.03);
		expect(crush[16]).toBeGreaterThan(0.03);
		// drawbars: 8′, 4′ and 2⅔′, nothing above yet
		const organ = first('drawbars', 6);
		expect(organ[1]).toBeGreaterThan(0.3);
		expect(organ[2]).toBeGreaterThan(0.1);
		expect(organ[3]).toBeLessThan(1e-3);
		expect(organ[4]).toBeLessThan(1e-3);
	});

	it('moves the spectrum smoothly with position: between frames it blends them', () => {
		// harmonics 1…40, relative to the frame's RMS
		const spectrum = (t: number, position: number) => {
			const x = steady([tableAt(t), position, 0, 0]).subarray(0, 8192);
			const scale = rms(x) * Math.SQRT2;
			return harmonicLevels(x, SR, 220, 40).map((v) => v / scale);
		};
		const distance = (a: number[], b: number[]) =>
			Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
		for (let t = 0; t < TABLES.length; t++) {
			for (const frame of [3, 8, 14]) {
				// across a stored frame, a sixteenth of a frame moves the spectrum a sixteenth of the
				// way (a table that stepped instead of blending would jump the whole way right there)
				const at = frame / 15;
				const small = distance(spectrum(t, at - 1 / 480), spectrum(t, at + 1 / 480));
				const whole = distance(spectrum(t, at - 1 / 30), spectrum(t, at + 1 / 30));
				expect(small).toBeLessThan(0.2 * whole + 0.005);
			}
			expect(distance(spectrum(t, 0), spectrum(t, 1))).toBeGreaterThan(0.1);
		}
	});

	it('ignores drift while warp is at 0', () => {
		for (const t of [0, 1, 3, 7]) {
			for (const position of [0, 0.6]) {
				const still = playNote(wavetable(), {
					hz: 220,
					seconds: 0.2,
					params: [tableAt(t), position, 0, 0]
				});
				for (const drift of [0.3, 1]) {
					const drifting = playNote(wavetable(), {
						hz: 220,
						seconds: 0.2,
						params: [tableAt(t), position, 0, drift]
					});
					let most = 0;
					for (let i = 0; i < still.left.length; i++) {
						most = Math.max(most, Math.abs(still.left[i] - drifting.left[i]));
					}
					expect(most).toBeLessThan(1e-6);
				}
			}
		}
	});

	it('warps like PWM: even harmonics from any shape, a square into a knee-wide pulse', () => {
		// basic's square sits at position ½; the knee lands at 0.25 at warp (0.5 − 0.25) / 0.41
		const square = relative(steady([named('basic'), 0.5, 0, 0]), 8);
		expect(square[1]).toBeLessThan(1e-3);
		// a 25% pulse: harmonics as |sin(πn/4)|/n, none at 4 and 8 (PD's rounded corners, a few
		// samples wide, leave a trace)
		const pulse = relative(steady([named('basic'), 0.5, 0.25 / 0.41, 0]), 8);
		expect(pulse[1]).toBeCloseTo(Math.SQRT1_2, 1);
		expect(pulse[2]).toBeCloseTo(1 / 3, 1);
		expect(pulse[3]).toBeLessThan(0.05);
		expect(pulse[7]).toBeLessThan(0.06);
		const sine = relative(steady([0, 0, 0.6, 0]), 4);
		expect(sine[1]).toBeGreaterThan(0.1);
	});

	it('drifts: a slow sweep low down, a clang in the middle, harmonic again at the top', () => {
		// drift 0.2: the knee slides round the wave about twice a second
		const slow = playNote(wavetable(), {
			hz: 220,
			seconds: 0.5,
			params: [named('basic'), 0.5, 0.5, 0.2]
		}).left;
		const second = (from: number) => relative(slow.subarray(from, from + 2048), 2)[1];
		expect(Math.abs(second(2400) - second(2400 + 480))).toBeLessThan(0.05);
		expect(Math.abs(second(2400) - second(14400))).toBeGreaterThan(0.1);
		const clang = steady([named('basic'), 0.5, 0.6, 0.5]);
		expect(inharmonicDb(clang, SR, 220)).toBeGreaterThan(-20);
		const top = steady([named('basic'), 0.5, 0.6, 1]);
		expect(inharmonicDb(top, SR, 220)).toBeLessThan(-60);
	});

	it('plays through the synth core at the same level', () => {
		const x = throughCore('wavetable', [80, 80, 80, 80]);
		expect(x.every(Number.isFinite)).toBe(true);
		expect(rms(x, 2400)).toBeGreaterThan(0.2);
		expect(rms(x, 2400)).toBeLessThan(0.35);
	});

	it('sits at the level every engine shares at the default M1 (0.2–0.35 RMS per channel)', () => {
		const { left, right } = playNote(wavetable(), { hz: 220, seconds: 1.05, params: DEFAULT });
		for (const x of [left, right]) {
			expect(rms(x, 2400)).toBeGreaterThan(0.2);
			expect(rms(x, 2400)).toBeLessThan(0.35);
		}
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (let t = 0; t < TABLES.length; t++) {
				for (const position of [0, 0.5, 1]) {
					for (const warp of [0, 0.7, 1]) {
						const params = [tableAt(t), position, warp, 0.5];
						worst = Math.max(
							worst,
							peak(playNote(wavetable(), { hz, seconds: 0.15, params }).left)
						);
					}
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('keeps aliasing below −50 dB at 1–2 kHz, warped or not, wherever it is periodic', () => {
		// periodic: no drift, or drift 1 (the warp at twice the note)
		const settings = [
			[0, 0],
			[0.6, 0],
			[1, 0],
			[0.6, 1],
			[1, 1]
		];
		for (const hz of [1003, 1499, 2011]) {
			for (let t = 0; t < TABLES.length; t++) {
				for (const position of [0, 0.5, 1]) {
					for (const [warp, drift] of settings) {
						const x = steady([tableAt(t), position, warp, drift], hz);
						expect(inharmonicDb(x, SR, hz)).toBeLessThan(-50);
					}
				}
			}
		}
	});

	it('crossfades table changes and glides the rest without clicks', () => {
		// Every parameter jumps between 0 and 1 every 50 ms: the table crossfades over 20 ms, the
		// rest glide over 5 ms, through shapes the static settings bracket, so the waveform's
		// second difference stays within theirs; a click would add its full jump on top. 25% covers
		// the in-between shapes. Drift stays at 0 but for its own test, so the static renders see
		// the knee where the moving one does.
		const settings = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (let param = 0; param < 4; param++) {
			const base = [0.4, 0.5, param === 3 ? 0.5 : 0.3, 0];
			const at = (v: number) => base.map((x, i) => (i === param ? v : x));
			const still = Math.max(
				...settings.map((v) =>
					roughness(playNote(wavetable(), { hz: 220, seconds: 0.6, params: at(v) }).left)
				)
			);
			const jumping = playNote(wavetable(), {
				hz: 220,
				seconds: 0.6,
				params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? 0 : 1)
			}).left;
			expect(roughness(jumping)).toBeLessThan(still * 1.25);
		}
	});
});
