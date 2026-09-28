// The wavetable engine measured on its own at 48 kHz against what the owner's device plays
// (docs/research/57-synth-engines.md §3): each table's defining frames, the crossfade between
// frames, the tables' levels and the output's rolloff, warp as frequency modulation by a sine and
// drift sliding that sine down to half the note; and the bounds every engine keeps: level at the
// default M1, peaks, aliasing and no clicks as parameters move.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, rms } from '../analysis';
import { SR, peak, playNote, roughness, throughCore } from './audition';
import { DEVICE_GAIN_DB } from './device';
import { TABLES, WavetableVoice } from './wavetable';

const DEFAULT = [80 / 99, 80 / 99, 80 / 99, 80 / 99];
const wavetable = (seed = 1) => new WavetableVoice(SR, seed);
/** The table M1 value for table `t`, mid-zone. */
const tableAt = (t: number) => (t + 0.5) / TABLES.length;
const index = (name: string) => TABLES.findIndex((t) => t.name === name);
const named = (name: string) => tableAt(index(name));
/** A steady stretch of a note, 16384 samples from 50 ms in. */
const steady = (params: number[], hz = 220) =>
	playNote(wavetable(), { hz, seconds: 0.45, params }).left.subarray(2400, 2400 + 16384);
/** Harmonics 1…count relative to the fundamental. */
const relative = (x: Float32Array, count: number, hz = 220) => {
	const levels = harmonicLevels(x, SR, hz, count);
	return levels.map((v) => v / levels[0]);
};
/** Harmonics 1…count of table `name` at `position`, relative to the fundamental. */
const frame = (name: string, position: number, count: number, hz = 220) =>
	relative(steady([named(name), position, 0, 0], hz), count, hz);
const db = (x: number) => 20 * Math.log10(x);
/** Bessel functions of the first kind, orders 0 and 1 (series; fine for x < 3). */
const bessel = (order: 0 | 1, x: number) => {
	let sum = 0;
	let term = order === 0 ? 1 : x / 2;
	for (let k = 0; k < 20; k++) {
		sum += term;
		term *= -(x * x) / 4 / ((k + 1) * (k + 1 + order));
	}
	return sum;
};

describe('wavetable', () => {
	it('starts on basic’s triangle with every parameter at 0', () => {
		const tri = relative(steady([0, 0, 0, 0]), 8);
		expect(tri[1]).toBeLessThan(1e-3);
		expect(tri[2]).toBeCloseTo(1 / 9, 2);
		expect(tri[4]).toBeCloseTo(1 / 25, 2);
		expect(tri[6]).toBeCloseTo(1 / 49, 2);
	});

	it('plays the device’s tables: each one’s defining frames', () => {
		// basic in thirds: a square at ⅓, a falling saw at ⅔, a sine at 1
		const square = frame('basic', 1 / 3, 5);
		expect(square[1]).toBeLessThan(0.01);
		expect(square[2]).toBeCloseTo(1 / 3, 1);
		const saw = frame('basic', 2 / 3, 4);
		expect(saw[1]).toBeCloseTo(1 / 2, 1);
		expect(saw[2]).toBeCloseTo(1 / 3, 1);
		for (const h of frame('basic', 1, 6).slice(1)) expect(h).toBeLessThan(1e-3);
		// saws at 0
		for (const name of ['buzz', 'fractal', 'zap']) {
			frame(name, 0, 8).forEach((h, i) => expect(h).toBeCloseTo(1 / (i + 1), 1));
		}
		// crush ends on three levels, a narrow pulse each half-cycle (the device's h3, h5, h7)
		const pulse = frame('crush', 1, 7);
		expect(db(pulse[2])).toBeCloseTo(-3.0, 0);
		expect(db(pulse[4])).toBeCloseTo(-11.3, 0);
		expect(db(pulse[6])).toBeCloseTo(-21.3, 0);
		// drawbars: the 8′ bar 5.6 dB under the 16′ at 0; the 1′ bar 20.9 dB over it at 1 (less
		// the rolloff's 0.6 dB at 3.5 kHz)
		expect(db(frame('drawbars', 0, 2)[1])).toBeCloseTo(-5.6, 0);
		expect(db(frame('drawbars', 1, 16)[15])).toBeCloseTo(20.3, 0);
		// fibonacci and primes at 1: their partials at 1/(j + 1) and 1/p, nothing between
		const fib = frame('fibonacci', 1, 13);
		[2, 3, 5, 8, 13].forEach((h, j) => expect(fib[h - 1]).toBeCloseTo(1 / (j + 2), 1));
		for (const h of [4, 6, 7]) expect(fib[h - 1]).toBeLessThan(0.01);
		const primes = frame('primes', 1, 7);
		for (const p of [2, 3, 5, 7]) expect(primes[p - 1]).toBeCloseTo(1 / p, 1);
		expect(primes[3]).toBeLessThan(0.01);
		// geometric: a soft saw (1/h²) at 0; the note, 6 and 36 times it at 1, ½ and ⅓ at 1
		const soft = frame('geometric', 0, 3);
		expect(soft[1]).toBeCloseTo(1 / 4, 1);
		expect(soft[2]).toBeCloseTo(1 / 9, 2);
		const powers = frame('geometric', 1, 36, 110);
		expect(powers[5]).toBeCloseTo(1 / 2, 1);
		expect(powers[35]).toBeCloseTo(1 / 3, 1);
		expect(powers[1]).toBeLessThan(0.01);
	});

	it('crossfades neighbouring frames: zap’s half-turned harmonics cancel between them', () => {
		// on A1, halfway between two of zap's 32 frames the 74th, 127th and 168th harmonics are a
		// half-turn apart and cancel, as on the device; at a frame they are a saw's
		const at = (position: number) => {
			const x = steady([named('zap'), position, 0, 0], 55);
			return [74, 127, 168].map((h) => levelAt(x, SR, 55 * h) / levelAt(x, SR, 55));
		};
		const onFrame = at(15 / 31);
		const between = at(15.5 / 31);
		onFrame.forEach((level, i) => {
			expect(level * [74, 127, 168][i]).toBeGreaterThan(0.6);
			expect(between[i]).toBeLessThan(0.15 * level);
		});
	});

	it('plays each table at the device’s level on A1', () => {
		for (const { name, db: level, shared } of TABLES) {
			const target = typeof level === 'number' ? level : level[0];
			const x = steady([named(name), 0, 0, 0], 55);
			expect(db(rms(x) * Math.SQRT2 * Math.SQRT1_2) - DEVICE_GAIN_DB).toBeCloseTo(target, 0);
			if (typeof level !== 'number' || shared) continue;
			const end = steady([named(name), 1, 0, 0], 55);
			expect(db(rms(end)) - DEVICE_GAIN_DB).toBeCloseTo(level, 0);
		}
		// buzz's noise frames take their level from the mix: 5 dB down at the end, as measured
		const buzz = steady([named('buzz'), 1, 0, 0], 55);
		const start = steady([named('buzz'), 0, 0, 0], 55);
		expect(db(rms(buzz) / rms(start))).toBeGreaterThan(-6.5);
		expect(db(rms(buzz) / rms(start))).toBeLessThan(-3.5);
	});

	it('rolls off its top as the device does: 3 dB down at 8.3 kHz', () => {
		// zap's first frame is a plain saw: on A1 its 151st harmonic (8.3 kHz) against 1/151
		const x = steady([named('zap'), 0, 0, 0], 55);
		const at = (h: number) => (levelAt(x, SR, 55 * h) * h) / levelAt(x, SR, 55);
		expect(db(at(151))).toBeCloseTo(-3, 0);
		expect(db(at(20))).toBeGreaterThan(-0.2);
	});

	it('warps by frequency modulation: the first sideband at J₁/J₀ of the note', () => {
		// basic's sine (position 1) on A2, warp ½, drift ½: the sine at ¾ of the note swings the
		// read by 0.15·½/¾ of a cycle, so the component at 110 + 82.5 Hz is J₁(β)/J₀(β) of 110's
		const x = steady([named('basic'), 1, 0.5, 0.5], 110);
		const beta = (2 * Math.PI * 0.15 * 0.5) / 0.75;
		const ratio = levelAt(x, SR, 110 + 82.5) / levelAt(x, SR, 110);
		expect(ratio).toBeCloseTo(bessel(1, beta) / bessel(0, beta), 1);
		// the device's measured −9.4 dB (on the triangle's fundamental) for the same setting
		expect(db(ratio)).toBeCloseTo(-9.4, 0);
	});

	it('drifts the warp down to half the note: harmonic at 0, a subharmonic at 1', () => {
		const tone = (drift: number) => steady([named('basic'), 1, 1, drift], 110);
		const still = tone(0);
		expect(inharmonicDb(still, SR, 110)).toBeLessThan(-60);
		expect(levelAt(still, SR, 55) / levelAt(still, SR, 110)).toBeLessThan(1e-3);
		const top = tone(1);
		expect(inharmonicDb(top, SR, 55)).toBeLessThan(-60);
		expect(levelAt(top, SR, 55) / levelAt(top, SR, 110)).toBeGreaterThan(0.3);
		// in between the sine's rate follows the S-curve: at 0.4 it runs 14 % under the note
		const low = tone(0.4);
		const fw = 110 * (1 - 0.25 * Math.pow(0.8, 2.6));
		expect(levelAt(low, SR, 110 + fw) / levelAt(low, SR, 110)).toBeGreaterThan(0.3);
		expect(levelAt(low, SR, 220) / levelAt(low, SR, 110)).toBeLessThan(0.05);
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

	it('meets the warp at a new phase every note, at the same level', () => {
		const note = (seed: number) =>
			playNote(wavetable(seed), {
				hz: 110,
				seconds: 0.3,
				params: [named('crush'), 0.5, 1, 0]
			}).left.subarray(2400);
		const [a, b] = [note(1), note(2)];
		let most = 0;
		for (let i = 0; i < a.length; i++) most = Math.max(most, Math.abs(a[i] - b[i]));
		expect(most).toBeGreaterThan(0.05);
		expect(Math.abs(db(rms(a) / rms(b)))).toBeLessThan(1);
	});

	it(
		'moves the spectrum smoothly with position: between frames it blends them',
		{ timeout: 60_000 },
		() => {
			// harmonics 1…40, relative to the frame's RMS
			const spectrum = (t: number, position: number) => {
				const x = steady([tableAt(t), position, 0, 0]).subarray(0, 8192);
				const scale = rms(x) * Math.SQRT2;
				return harmonicLevels(x, SR, 220, 40).map((v) => v / scale);
			};
			const distance = (a: number[], b: number[]) =>
				Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
			for (let t = 0; t < TABLES.length; t++) {
				if (TABLES[t].name === 'buzz') continue; // its noise changes frame by frame by design
				const steps = (TABLES[t].frames ?? 32) - 1;
				for (const f of [3, 8, 14]) {
					// across a stored frame, a sixteenth of a frame moves the spectrum a sixteenth of the
					// way (a table that stepped instead of blending would jump the whole way right there)
					const at = f / steps;
					const small = distance(
						spectrum(t, at - 1 / (32 * steps)),
						spectrum(t, at + 1 / (32 * steps))
					);
					const whole = distance(
						spectrum(t, at - 1 / (2 * steps)),
						spectrum(t, at + 1 / (2 * steps))
					);
					expect(small).toBeLessThan(0.2 * whole + 0.005);
				}
				// (zap only turns its harmonics' phases: its magnitudes stay a saw's)
				if (TABLES[t].name !== 'zap') {
					expect(distance(spectrum(t, 0), spectrum(t, 1))).toBeGreaterThan(0.1);
				}
			}
		}
	);

	it('plays through the synth core at the same level', () => {
		const x = throughCore('wavetable', [80, 80, 80, 80]);
		expect(x.every(Number.isFinite)).toBe(true);
		expect(rms(x, 2400)).toBeGreaterThan(0.2);
		expect(rms(x, 2400)).toBeLessThan(0.36);
	});

	it('sits near the level every engine shares at the default M1', () => {
		// the default table is primes, which the device plays at −15.2 dBFS on A1: 0.355 RMS here,
		// a hair over the shared 0.35
		const { left, right } = playNote(wavetable(), { hz: 220, seconds: 1.05, params: DEFAULT });
		for (const x of [left, right]) {
			expect(rms(x, 2400)).toBeGreaterThan(0.2);
			expect(rms(x, 2400)).toBeLessThan(0.36);
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
		// periodic: no drift (the warp at the note) or drift 1 (at half of it: periodic at f/2)
		const settings = [
			[0, 0],
			[0.6, 0],
			[1, 0],
			[0.6, 1],
			[1, 1]
		];
		for (const hz of [1003, 1499, 2011]) {
			for (let t = 0; t < TABLES.length; t++) {
				if (TABLES[t].name === 'buzz') continue; // noise: its partials fill every harmonic
				for (const position of [0, 0.5, 1]) {
					for (const [warp, drift] of settings) {
						const x = steady([tableAt(t), position, warp, drift], hz);
						expect(inharmonicDb(x, SR, drift === 1 ? hz / 2 : hz)).toBeLessThan(-50);
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
		// the warp where the moving one does.
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
