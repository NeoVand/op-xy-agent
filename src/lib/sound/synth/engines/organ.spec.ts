// organ measured on its own at 48 kHz: every type's partials at the levels measured on the device
// (its high-pass included), type 2's partials sliding with bass, the tremolo's rate, depth and free
// phase, the device's loudness, and the bounds every engine keeps.
import { describe, expect, it } from 'vitest';
import { inharmonicDb, levelAt, rms } from '../analysis';
import { DEVICE_GAIN_DB } from './device';
import { SR, peak, playNote, roughness, throughCore } from './audition';
import { OrganVoice, TREMOLO_CURVE, TREMOLO_TOP_HZ, partialDb } from './organ';
import { ORGAN_HIGHPASS_HZ, ORGAN_REGISTRATIONS } from './organ-registrations';

const organ = () => new OrganVoice(SR);
/** type's M1 value, mid-zone. */
const typeAt = (t: number) => (t + 0.5) / 8;
const hzOf = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const db = (x: number) => 20 * Math.log10(x);

/** The tremolo's gain over a note: the RMS of every 5 ms, over the steady level. */
function gainEnvelope(left: Float32Array, from: number, steady: number): number[] {
	const out: number[] = [];
	for (let i = from; i + 240 <= left.length; i += 240) out.push(rms(left, i, i + 240) / steady);
	return out;
}

describe('organ', () => {
	it('plays every type at the levels measured on the device, its high-pass included', () => {
		for (let t = 0; t < ORGAN_REGISTRATIONS.length; t++) {
			const partials = ORGAN_REGISTRATIONS[t];
			for (const bass of [0, 64 / 127, 1]) {
				for (const note of [33, 57, 81]) {
					const hz = hzOf(note);
					const { left } = playNote(organ(), {
						hz,
						seconds: 1.6,
						params: [typeAt(t), bass, 0, 0]
					});
					const x = left.subarray(4800);
					const expected = partials.map((p) => {
						const f = (p.ratio + p.glide * bass) * hz;
						const gain = f / Math.hypot(f, ORGAN_HIGHPASS_HZ);
						return { f, db: partialDb(p, bass, note) + DEVICE_GAIN_DB + db(gain) };
					});
					const loudest = Math.max(...expected.map((e) => e.db));
					// the partials within 30 dB of the loudest, clear of every other (4 Hz, many bins)
					const audible = expected.filter((e) => e.db > loudest - 50);
					for (const e of audible) {
						if (e.db < loudest - 30 || e.f > 0.4 * SR) continue;
						if (audible.some((o) => o !== e && Math.abs(o.f - e.f) < 4)) continue;
						expect(db(levelAt(x, SR, e.f))).toBeCloseTo(e.db, 0);
					}
				}
			}
		}
	});

	it('slides type 2’s upper partials with bass, through inharmonic ratios', () => {
		const hz = 220;
		const { left } = playNote(organ(), { hz, seconds: 1, params: [typeAt(1), 0.25, 0, 0] });
		const x = left.subarray(4800);
		const at = (ratio: number) => levelAt(x, SR, ratio * hz);
		// a quarter of the way: 1.125 and 1.625 times the note, nothing left at 1 and 1.5
		expect(at(1.125)).toBeGreaterThan(0.05);
		expect(at(1.625)).toBeGreaterThan(0.03);
		expect(at(1)).toBeLessThan(1e-3);
		expect(at(1.5)).toBeLessThan(1e-3);
	});

	it('swings the level by amount × a sine at the speed’s rate', () => {
		// type 5 at bass 0 is the 8′, 4′ and 2⅔′ alone: at 400 Hz, every 5 ms window holds whole
		// periods of each, so the windows' RMS moves with the tremolo only
		const hz = 400;
		const still = rms(
			playNote(organ(), { hz, seconds: 1, params: [typeAt(4), 0, 0, 0] }).left,
			4800
		);
		for (const [amount, speed] of [
			[1, 1],
			[0.5, 0.5],
			[1, 0.25]
		]) {
			const rate = TREMOLO_TOP_HZ * Math.pow(speed, TREMOLO_CURVE);
			const { left } = playNote(organ(), {
				hz,
				seconds: 2.4,
				params: [typeAt(4), 0, amount, speed]
			});
			const env = gainEnvelope(left, 4800, still);
			// 1 ± amount, from each 5 ms window's RMS (a peak or trough spreads a little)
			expect(Math.max(...env)).toBeCloseTo(1 + amount, 1);
			expect(Math.min(...env)).toBeLessThan(1 - amount + 0.05);
			// the rate: the envelope's strongest slow component
			const mean = env.reduce((s, v) => s + v, 0) / env.length;
			const ac = env.map((v) => v - mean);
			const at = (f: number) => levelAt(ac, 200, f);
			expect(at(rate)).toBeGreaterThan(3 * at(rate * 0.7));
			expect(at(rate)).toBeGreaterThan(3 * at(rate * 1.4));
		}
	});

	it('runs the tremolo free on the core’s clock, so the notes of a chord pulse together', () => {
		const params = Float32Array.from([typeAt(0), 0, 1, 0.5]);
		const rate = TREMOLO_TOP_HZ * Math.pow(0.5, TREMOLO_CURVE);
		const note = (time: number) => {
			const voice = organ();
			voice.start(220, 100, params, time);
			const l = new Float32Array(16);
			const r = new Float32Array(16);
			const out = new Float32Array(9600);
			for (let i = 0; i < out.length; i += 16) {
				voice.control(220, params);
				voice.render(l, r, 16);
				out.set(l, i);
			}
			return out;
		};
		const gain = (x: Float32Array) => gainEnvelope(x, 0, 1);
		const first = gain(note(0));
		// a note a whole tremolo cycle later pulses in step; half a cycle later, against it
		const later = gain(note(1 / rate));
		const opposite = gain(note(0.5 / rate));
		for (let i = 2; i < first.length; i++) {
			expect(later[i]).toBeCloseTo(first[i], 2);
		}
		const mean = first.reduce((s, v) => s + v, 0) / first.length;
		let against = 0;
		for (let i = 2; i < first.length; i++) against += (first[i] - mean) * (opposite[i] - mean);
		expect(against).toBeLessThan(0);
	});

	it('plays at the device’s loudness at the default M1, through the core as on its own', () => {
		// default M1 (80s): type 7 near bass 64–127, where the device measures about −23 dBFS; the
		// tremolo at 80 adds about 1.2 dB
		const expected = Math.pow(10, (-22.9 + DEVICE_GAIN_DB + 1.2) / 20);
		const { left, right } = playNote(organ(), {
			hz: 220,
			seconds: 2,
			params: [80 / 99, 80 / 99, 80 / 99, 80 / 99]
		});
		for (const x of [left, right]) expect(rms(x, 4800) / expected).toBeCloseTo(1, 1);
		const core = throughCore('organ', [80, 80, 80, 80], 2);
		expect(core.every(Number.isFinite)).toBe(true);
		expect(rms(core, 4800) / expected).toBeCloseTo(1, 1);
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (let t = 0; t < ORGAN_REGISTRATIONS.length; t++) {
				for (const bass of [0, 0.5, 1]) {
					const params = [typeAt(t), bass, 1, 1];
					worst = Math.max(worst, peak(playNote(organ(), { hz, seconds: 0.3, params }).left));
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('leaves nothing off the harmonic series on the harmonic types at 1–2 kHz (no aliasing)', () => {
		// types 1, 3, 5 and 8 sit on the half-note grid; the others have ranks a few cents off it
		for (const hz of [1003, 1499, 2011]) {
			for (const t of [0, 2, 4, 7]) {
				for (const bass of [0, 1]) {
					const { left } = playNote(organ(), {
						hz,
						seconds: 0.45,
						params: [typeAt(t), bass, 0, 0]
					});
					expect(inharmonicDb(left.subarray(4096, 4096 + 16384), SR, hz / 2)).toBeLessThan(-45);
				}
			}
		}
	});

	it('crossfades type changes and glides the rest without clicks', () => {
		// Every parameter jumps between 0 and 1 every 50 ms: type crossfades over 20 ms, the rest
		// glide over 5 ms, through blends the static settings bracket, so the waveform's second
		// difference stays within theirs (a click would add its full jump on top). 25% covers the
		// in-between blends.
		const settings = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (let param = 0; param < 4; param++) {
			const at = (v: number) => [0.3, 0.5, 0.5, 0.5].map((x, i) => (i === param ? v : x));
			const still = Math.max(
				...settings.map((v) =>
					roughness(playNote(organ(), { hz: 220, seconds: 0.3, params: at(v) }).left)
				)
			);
			const jumping = playNote(organ(), {
				hz: 220,
				seconds: 0.6,
				params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? 0 : 1)
			}).left;
			expect(roughness(jumping)).toBeLessThan(still * 1.25);
		}
	});
});
