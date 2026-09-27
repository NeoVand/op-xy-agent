// organ measured on its own at 48 kHz: every type periodic with its partials where its
// registration puts them, brightness rising with the type, bass trading the 16′ for the other
// frame, the celeste's beating, the tremolo's rate and depth, and the bounds every engine keeps.
import { describe, expect, it } from 'vitest';
import { centroid, harmonicLevels, inharmonicDb, levelAt, rms } from '../analysis';
import { SR, peak, play, roughness, throughCore } from './audition';
import { ORGAN_TYPES, OrganVoice } from './organ';

const DEFAULT = [80 / 99, 80 / 99, 80 / 99, 80 / 99];
const organ = () => new OrganVoice(SR);
/** type's M1 value, mid-zone. */
const typeAt = (t: number) => (t + 0.5) / 8;
/** A note whose period is exactly 256 samples, so level windows can hold whole periods. */
const EVEN = SR / 256;

describe('organ', () => {
	it('plays each registration as designed: periodic, its partials in proportion', () => {
		for (let t = 0; t < ORGAN_TYPES.length; t++) {
			for (const [bass, ranks] of [
				[0, ORGAN_TYPES[t].low],
				[1, ORGAN_TYPES[t].high]
			] as const) {
				// the theatre type's celeste sounds from bass up: its bass 1 is not periodic
				if (t === 2 && bass === 1) continue;
				const { left } = play(organ(), { hz: 220, seconds: 0.5, params: [typeAt(t), bass, 0, 0] });
				const x = left.subarray(4800, 4800 + 16384);
				// the shared table's linear interpolation leaves faint images of the brightest ranks
				expect(inharmonicDb(x, SR, 110)).toBeLessThan(-55);
				// each rank's amplitude against the strongest, as measured at half-note multiples
				const levels = harmonicLevels(x, SR, 110, 48);
				const designed = new Float64Array(48);
				for (const [multiple, a] of ranks) designed[Math.round(multiple * 2) - 1] += a;
				const top = Math.max(...designed);
				const measured = Math.max(...levels);
				for (let h = 0; h < 48; h++) {
					expect(levels[h] / measured).toBeCloseTo(designed[h] / top, 1);
				}
			}
		}
	});

	it('brightens roughly with the type', () => {
		const brightness = (bass: number) =>
			ORGAN_TYPES.map((_, t) => {
				const { left } = play(organ(), { hz: 220, seconds: 0.4, params: [typeAt(t), bass, 0, 0] });
				return centroid(left.subarray(2400), SR);
			});
		for (const bass of [0.8, 1]) {
			const c = brightness(bass);
			let falls = 0;
			for (let t = 1; t < c.length; t++) if (c[t] < c[t - 1]) falls++;
			expect(falls).toBeLessThanOrEqual(1);
			expect(c[7]).toBeGreaterThan(2.5 * c[0]);
		}
	});

	it('has the most bass at bass 0: the 16′ fades out towards 1', () => {
		for (const t of [0, 1, 3, 4, 5, 6, 7]) {
			const sub = (bass: number) => {
				const { left } = play(organ(), { hz: 220, seconds: 0.4, params: [typeAt(t), bass, 0, 0] });
				return levelAt(left.subarray(4800), SR, 110);
			};
			expect(sub(0)).toBeGreaterThan(0.05);
			expect(sub(1)).toBeLessThan(1e-3);
			expect(sub(0.5)).toBeLessThan(sub(0));
			expect(sub(0.5)).toBeGreaterThan(sub(1));
		}
	});

	it('keeps its level across the bass crossfade', () => {
		for (let t = 0; t < ORGAN_TYPES.length; t++) {
			if (t === 2) continue; // the celeste adds a rank as bass rises
			const level = (bass: number) =>
				rms(play(organ(), { hz: 220, seconds: 0.3, params: [typeAt(t), bass, 0, 0] }).left, 2400);
			expect(level(0.5) / level(0)).toBeCloseTo(1, 1);
			expect(level(1) / level(0)).toBeCloseTo(1, 1);
		}
	});

	it('beats in the theatre type as bass brings in its celeste rank', () => {
		const envelope = (bass: number) => {
			const { left } = play(organ(), { hz: EVEN, seconds: 2, params: [typeAt(2), bass, 0, 0] });
			const out: number[] = [];
			for (let i = 4096; i + 1024 <= left.length; i += 1024) out.push(rms(left, i, i + 1024));
			return Math.max(...out) / Math.min(...out);
		};
		expect(envelope(1)).toBeGreaterThan(1.2);
		expect(envelope(0)).toBeLessThan(1.01);
	});

	it('moves the level with the tremolo at its speed and to its depth', () => {
		const tremolo = (amount: number, speed: number, rate: number, depth: number) => {
			const { left } = play(organ(), {
				hz: EVEN,
				seconds: 2.2,
				params: [typeAt(1), 0.5, amount, speed]
			});
			const e: number[] = [];
			for (let i = 0; i + 512 <= left.length; i += 512) e.push(rms(left, i, i + 512));
			const env = Float64Array.from(e.slice(10));
			const mean = env.reduce((s, v) => s + v, 0) / env.length;
			const ac = env.map((v) => v - mean);
			const at = levelAt(ac, EVEN / 2, rate);
			expect(at).toBeGreaterThan(3 * levelAt(ac, EVEN / 2, rate * 0.6));
			expect(at).toBeGreaterThan(3 * levelAt(ac, EVEN / 2, rate * 1.6));
			expect(Math.min(...env) / Math.max(...env)).toBeCloseTo(1 - depth, 1);
		};
		tremolo(0.5, 0.4, 0.5 * Math.pow(30, 0.4), 0.3);
		tremolo(1, 0.5, 0.5 * Math.sqrt(30), 0.6);
		tremolo(0.25, 1, 15, 0.15);
	});

	it('plays through the synth core at the same level', () => {
		const x = throughCore('organ', [80, 80, 80, 80]);
		expect(x.every(Number.isFinite)).toBe(true);
		expect(rms(x, 2400)).toBeGreaterThan(0.2);
		expect(rms(x, 2400)).toBeLessThan(0.35);
	});

	it('sits at the level every engine shares at the default M1 (0.2–0.35 RMS per channel)', () => {
		const { left, right } = play(organ(), { hz: 220, seconds: 1.05, params: DEFAULT });
		for (const x of [left, right]) {
			expect(rms(x, 2400)).toBeGreaterThan(0.2);
			expect(rms(x, 2400)).toBeLessThan(0.35);
		}
	});

	it('keeps its peaks within ±1.2 at any setting from 30 Hz to 4 kHz', () => {
		let worst = 0;
		for (const hz of [30, 55, 110, 220, 440, 880, 1760, 3520, 4000]) {
			for (let t = 0; t < ORGAN_TYPES.length; t++) {
				for (const bass of [0, 0.5, 1]) {
					const params = [typeAt(t), bass, 0, 0];
					worst = Math.max(worst, peak(play(organ(), { hz, seconds: 0.2, params }).left));
				}
			}
		}
		expect(worst).toBeLessThan(1.2);
	});

	it('keeps aliasing below −45 dB at 1–2 kHz', () => {
		// The worst are the full 1′ and the mixtures: the table plays an octave down (for the 16′),
		// so they sit high in its stored levels, where linear interpolation leaves images near
		// −50 dB. Everything else stays below −54 dB.
		for (const hz of [1003, 1499, 2011]) {
			for (let t = 0; t < ORGAN_TYPES.length; t++) {
				for (const bass of [0, 1]) {
					if (t === 2 && bass === 1) continue;
					const { left } = play(organ(), { hz, seconds: 0.45, params: [typeAt(t), bass, 0, 0] });
					expect(inharmonicDb(left.subarray(4096, 4096 + 16384), SR, hz / 2)).toBeLessThan(-45);
				}
			}
		}
	});

	it('crossfades type changes and glides the rest without clicks', () => {
		// Every parameter jumps between 0 and 1 every 50 ms: type crossfades over 20 ms, the rest
		// glide over 5 ms, through blends the static settings bracket, so the waveform's second
		// difference stays within theirs (a click would add its full jump on top: a hundredth or
		// more, against a few thousandths here). 25% covers the in-between blends.
		const settings = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (let param = 0; param < 4; param++) {
			const at = (v: number) => [0.3, 0.5, 0.5, 0.5].map((x, i) => (i === param ? v : x));
			const still = Math.max(
				...settings.map((v) =>
					roughness(play(organ(), { hz: 220, seconds: 0.3, params: at(v) }).left)
				)
			);
			const jumping = play(organ(), {
				hz: 220,
				seconds: 0.6,
				params: (t) => at(Math.floor(t / 0.05) % 2 === 0 ? 0 : 1)
			}).left;
			expect(roughness(jumping)).toBeLessThan(still * 1.25);
		}
	});
});
