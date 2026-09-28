// epiano against the device: a pure sine at 0 at the device's level (lower up the keyboard), tone's
// 1:1 FM index and its cap, punch's straight-line decays, tine's 4:1 sidebands rising and fading,
// texture's clipper blended with the sine at an unchanged level, and the bounds every engine keeps.
// Played on its own at 48 kHz, block by block as the core plays it.
import { describe, expect, it } from 'vitest';
import { harmonicLevels, inharmonicDb, levelAt, rms } from '../analysis';
import { DEVICE_GAIN_DB } from './device';
import { SR, peak, playNote, roughness, throughCore } from './audition';
import {
	DRIVE,
	EpianoVoice,
	INDEX_MAX,
	LEVEL_PER_OCTAVE,
	TINE_DECAY,
	SINE_DB,
	PUNCH,
	PUNCH_BREAK,
	TONE_INDEX
} from './epiano';

const epiano = () => new EpianoVoice(SR);
const db = (x: number) => 20 * Math.log10(x);

/** Harmonics 1…`count` of sin(θ + a·sin θ + b·sin 4θ) blended as the engine's carrier. */
function reference(a: number, b = 0, count = 8, g = 0, wet = 0): number[] {
	const n = 4096;
	const out = new Array<number>(count).fill(0);
	const norm = g > 0 ? Math.atan(g) : 1;
	for (let k = 1; k <= count; k++) {
		let re = 0;
		let im = 0;
		for (let i = 0; i < n; i++) {
			const t = (2 * Math.PI * i) / n;
			const s = Math.sin(t + a * Math.sin(t) + b * Math.sin(4 * t));
			const y = g > 0 ? (1 - wet) * s + (wet * Math.atan(g * s)) / norm : s;
			re += y * Math.cos(k * t);
			im += y * Math.sin(k * t);
		}
		out[k - 1] = (2 * Math.hypot(re, im)) / n;
	}
	return out;
}

describe('epiano', () => {
	it('is a pure sine with every parameter at 0, at the device’s level, lower up the keyboard', () => {
		const a2 = playNote(epiano(), { hz: 110, seconds: 0.5, params: [0, 0, 0, 0] }).left;
		const x = a2.subarray(4800, 4800 + 16384);
		const [h1, ...rest] = harmonicLevels(x, SR, 110, 8);
		for (const h of rest) expect(h / h1).toBeLessThan(1e-3);
		expect(inharmonicDb(x, SR, 110)).toBeLessThan(-80);
		expect(db(rms(x))).toBeCloseTo(SINE_DB + DEVICE_GAIN_DB, 1);
		const a4 = playNote(epiano(), { hz: 440, seconds: 0.5, params: [0, 0, 0, 0] }).left;
		expect(db(rms(a4.subarray(4800)) / rms(x))).toBeCloseTo(2 * LEVEL_PER_OCTAVE, 1);
	});

	it('turns tone into a 1:1 FM index, 5.88 × tone on A2, capped at 3.05', () => {
		for (const tone of [0.1, 0.3, 0.45]) {
			const { left } = playNote(epiano(), { hz: 110, seconds: 0.6, params: [tone, 0, 0, 0] });
			const h = harmonicLevels(left.subarray(4800, 4800 + 16384), SR, 110, 6);
			const r = reference(TONE_INDEX * tone, 0, 6);
			for (let k = 1; k < 6; k++) {
				if (r[k] / r[0] < 1e-3) continue;
				expect(db(h[k] / h[0]), `tone ${tone} h${k + 1}`).toBeCloseTo(db(r[k] / r[0]), 0);
			}
		}
		// past the cap, the spectrum stays
		const at = (tone: number) =>
			harmonicLevels(
				playNote(epiano(), { hz: 110, seconds: 0.6, params: [tone, 0, 0, 0] }).left.subarray(4800),
				SR,
				110,
				6
			);
		const capped = reference(INDEX_MAX, 0, 6);
		const [full, high] = [at(1), at(0.8)];
		for (let k = 1; k < 6; k++) {
			expect(high[k] / high[0]).toBeCloseTo(full[k] / full[0], 3);
			expect(db(full[k] / full[0])).toBeCloseTo(db(capped[k] / capped[0]), 0);
		}
	});

	it('decays the index along punch’s two straight lines, to a pure sine', () => {
		// punch 1 on A2 at tone 0.5: the index falls to PUNCH_BREAK within ~60 ms, then to 0 by ~0.8 s
		const { left } = playNote(epiano(), { hz: 110, seconds: 1.2, params: [0.5, 0, 0, 1] });
		const fast = PUNCH.fast[PUNCH.fast.length - 1];
		const slow = PUNCH.slow[PUNCH.slow.length - 1];
		const gone = (1 - PUNCH_BREAK) / fast + PUNCH_BREAK / slow;
		const window = (from: number) =>
			left.subarray(Math.round(from * SR), Math.round(from * SR) + 2400);
		const h2 = (x: Float32Array) => levelAt(x, SR, 220) / levelAt(x, SR, 110);
		expect(h2(window(gone + 0.1))).toBeLessThan(0.01);
		// halfway down the slow line the index is about half the break's: h2/h1 ≈ I/2 for small I
		const mid = (1 - PUNCH_BREAK) / fast + (PUNCH_BREAK * 0.5) / slow;
		const index = TONE_INDEX * 0.5 * PUNCH_BREAK * 0.5;
		const r = reference(index, 0, 2);
		expect(h2(window(mid - 0.025))).toBeCloseTo(r[1] / r[0], 1);
		// punch 0 holds the index
		const held = playNote(epiano(), { hz: 110, seconds: 1.2, params: [0.5, 0, 0, 0] }).left;
		const early = held.subarray(4800, 7200);
		const late = held.subarray(SR, SR + 2400);
		expect(h2(late)).toBeCloseTo(h2(early), 2);
	});

	it('adds tine as 4:1 sidebands in equal pairs, rising fast and fading on its own', () => {
		const { left } = playNote(epiano(), { hz: 110, seconds: 1.3, params: [0, 0, 1, 0] });
		const at = (from: number) => left.subarray(Math.round(from * SR), Math.round(from * SR) + 4800);
		const early = at(0.1);
		const [h1, h2, h3, h4, h5] = harmonicLevels(early, SR, 110, 5);
		expect(h3 / h5).toBeCloseTo(1, 1);
		expect(h2 / h1).toBeLessThan(1e-3);
		expect(h4 / h1).toBeLessThan(1e-3);
		// on the device h3 passes h1 at the start (an index near 1.7) and falls by ~5 dB over a second
		expect(h3 / h1).toBeGreaterThan(1);
		const late = harmonicLevels(at(1.1), SR, 110, 3);
		expect(db(h3 / h1) - db(late[2] / late[0])).toBeGreaterThan(4);
		expect(TINE_DECAY).toBeGreaterThan(1);
	});

	it('blends texture’s clipper into the sine at an unchanged level, with less drive up high', () => {
		const note = (hz: number, texture: number) =>
			playNote(epiano(), { hz, seconds: 0.6, params: [0, texture, 0, 0] }).left.subarray(4800);
		const plain = rms(note(110, 0));
		for (const i of [2, 5, 7]) {
			const texture = DRIVE.at[i];
			const x = note(110, texture);
			expect(db(rms(x) / plain)).toBeCloseTo(0, 1);
			const h = harmonicLevels(x, SR, 110, 7);
			const r = reference(0, 0, 7, DRIVE.a2[i], DRIVE.wetA2[i]);
			for (const k of [2, 4, 6]) {
				expect(db(h[k] / h[0]), `CC ${Math.round(texture * 127)} h${k + 1}`).toBeCloseTo(
					db(r[k] / r[0]),
					0
				);
			}
		}
		// the same texture on A4 drives far less: a much weaker third harmonic
		const third = (hz: number) => {
			const h = harmonicLevels(note(hz, 1), SR, hz, 3);
			return h[2] / h[0];
		};
		expect(third(440)).toBeLessThan(third(110) * 0.5);
	});

	it('plays through the synth core as it does on its own', () => {
		const x = throughCore('epiano', [0, 0, 0, 0], 0.5);
		expect(x.every(Number.isFinite)).toBe(true);
		const alone = playNote(epiano(), { hz: 220, seconds: 0.5, params: [0, 0, 0, 0] }).left;
		expect(rms(x, 4800) / rms(alone, 4800)).toBeCloseTo(1, 1);
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (const tone of [0, 0.6, 1]) {
				for (const texture of [0, 0.8, 1]) {
					const params = [tone, texture, 1, 0];
					const { left } = playNote(epiano(), { hz, seconds: 0.2, params, velocity: 127 });
					worst = Math.max(worst, peak(left));
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('keeps aliasing below −50 dB at 1–2 kHz, key scaling the index where FM would fold', () => {
		for (const hz of [1003, 1499, 2011]) {
			for (const tone of [0.25, 0.5, 1]) {
				for (const texture of [0, 0.5, 1]) {
					const { left } = playNote(epiano(), { hz, seconds: 0.45, params: [tone, texture, 1, 0] });
					expect(inharmonicDb(left.subarray(4800, 4800 + 16384), SR, hz)).toBeLessThan(-50);
				}
			}
		}
	});

	it('glides through parameter jumps without clicks', () => {
		// Every parameter jumps between two settings every 50 ms. Smoothing turns each jump into a
		// 5 ms glide through shapes the static settings also make, so the waveform's second
		// difference stays within those settings' own. 25% covers the glides' in-between shapes.
		for (const [low, high] of [
			[0, 1],
			[0, 0.75]
		]) {
			const settings = [0, 0.25, 0.5, 0.75, 0.9, 1].filter((v) => v >= low && v <= high);
			for (let param = 0; param < 3; param++) {
				const at = (v: number) => [0.4, 0.4, 0.4, 0].map((x, i) => (i === param ? v : x));
				const still = Math.max(
					...settings.map((v) =>
						roughness(playNote(epiano(), { hz: 220, seconds: 0.3, params: at(v) }).left)
					)
				);
				const jumping = playNote(epiano(), {
					hz: 220,
					seconds: 0.6,
					params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? low : high)
				}).left;
				expect(roughness(jumping)).toBeLessThan(still * 1.25);
			}
		}
		// punch only changes a decay's speed: jumps in it change nothing at once
		const punch = playNote(epiano(), {
			hz: 220,
			seconds: 0.6,
			params: (t) => [0.8, 0.5, 0, Math.floor(t / 0.05) % 2 === 0 ? 0 : 1]
		}).left;
		const still = roughness(
			playNote(epiano(), { hz: 220, seconds: 0.6, params: [0.8, 0.5, 0, 0] }).left
		);
		expect(roughness(punch)).toBeLessThan(still * 1.25);
	});
});
