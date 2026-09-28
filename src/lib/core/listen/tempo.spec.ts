// Tempo and grid on click tracks and drum loops at known tempi: every tempo across the OP-XY's
// 40–220 BPM range reads exactly (no half- or double-time slips on a plain click), drum patterns
// read at their beat, the set tempo is compared honestly (same, double, 3:2, different), and the
// grid recovers swing, timing spread and where each drum sits in the beat.
import { describe, expect, it } from 'vitest';
import { detectOnsets } from './onsets';
import { clickTrack, drumLoop, noise } from './signals';
import { TEMPO_RANGE, beatGrid, beatPositions, estimateTempo, tempoRelation } from './tempo';

const SR = 22050;

function tempoOf(samples: Float32Array, expectedBpm?: number) {
	const a = detectOnsets([samples], SR);
	return estimateTempo(a.pulse, a.frameRate, { expectedBpm });
}

describe('estimateTempo', () => {
	it.each([42, 60, 90, 120, 128, 150, 174, 200, 218])(
		'reads a click track at %i BPM when the set tempo is known',
		(bpm) => {
			const { samples } = clickTrack({ bpm, seconds: 12, sampleRate: SR });
			const t = tempoOf(samples, bpm)!;
			expect(Math.abs(t.bpm - bpm)).toBeLessThanOrEqual(0.5);
			expect(t.expected).toMatchObject({ bpm, relation: 'same' });
			expect(t.expected!.support).toBeGreaterThan(0.95);
			expect(t.confidence).toBeGreaterThan(0.6);
		}
	);

	it.each([42, 60, 90, 120, 150])('reads a click track at %i BPM unaided', (bpm) => {
		const { samples } = clickTrack({ bpm, seconds: 12, sampleRate: SR });
		const t = tempoOf(samples)!;
		expect(Math.abs(t.bpm - bpm)).toBeLessThanOrEqual(0.5);
		expect(t.expected).toBeNull();
	});

	it('reads a very fast click unaided as a listener would tap it, naming the fast reading', () => {
		for (const bpm of [174, 200, 218]) {
			const t = tempoOf(clickTrack({ bpm, seconds: 12, sampleRate: SR }).samples)!;
			expect(Math.abs(t.bpm - bpm / 2), `${bpm}`).toBeLessThanOrEqual(0.5);
			expect(t.alternatives.some((a) => Math.abs(a - bpm) <= 0.5)).toBe(true);
		}
	});

	it('reads drum patterns at their beat, not their hats or their bar', () => {
		const patterns: [number, Parameters<typeof drumLoop>[0]['pattern']][] = [
			[124, { kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }],
			[128, { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }],
			[90, { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }],
			[120, { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }],
			[95, { kick: [0, 3, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }],
			[70, { kick: [0, 8], snare: [4, 12], hat: Array.from({ length: 16 }, (_, i) => i) }]
		];
		for (const [bpm, pattern] of patterns) {
			const loop = drumLoop({ bpm, bars: 6, sampleRate: SR, pattern });
			// sixteenth hats at 70 are as easily tapped at 140: only the set tempo settles that one
			if (bpm !== 70) expect(tempoOf(loop.samples)!.bpm, `${bpm} unaided`).toBeCloseTo(bpm, 0);
			const known = tempoOf(loop.samples, bpm)!;
			expect(known.expected!.relation, `${bpm} known`).toBe('same');
			expect(known.expected!.support).toBeGreaterThan(0.85);
		}
		// drum and bass at 174: the set tempo reads it as 174
		const dnb = drumLoop({
			bpm: 174,
			bars: 6,
			sampleRate: SR,
			pattern: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
		});
		expect(tempoOf(dnb.samples, 174)!.bpm).toBeCloseTo(174, 0);
	});

	it('compares with the set tempo', () => {
		const { samples } = clickTrack({ bpm: 120, seconds: 10, sampleRate: SR });
		const same = tempoOf(samples, 120)!.expected!;
		expect(same).toMatchObject({ bpm: 120, relation: 'same' });
		expect(same.support).toBeGreaterThan(0.95);
		expect(Math.abs(same.offBy!)).toBeLessThanOrEqual(0.5);
		// every other click is a beat at 60, so a set tempo of 60 is read as 60
		const slow = tempoOf(samples, 60)!;
		expect(slow.bpm).toBeCloseTo(60, 0);
		expect(slow.expected!.support).toBeGreaterThan(0.9);
		// 80 and 100 do not fit
		for (const set of [80, 100]) {
			const other = tempoOf(samples, set)!.expected!;
			expect(other.relation, `${set}`).toBe('different');
			expect(other.support).toBeLessThan(0.6);
		}
		// notes at half the set tempo (a track scale of 2, say): heard at 70 against a set 140
		const halved = clickTrack({ bpm: 70, seconds: 12, sampleRate: SR });
		const felt = tempoOf(halved.samples, 140)!;
		expect(felt.bpm).toBeCloseTo(70, 0);
		expect(felt.expected).toMatchObject({ relation: 'half', offBy: null });
		expect(felt.expected!.support).toBeLessThan(0.6);
		// a half-time groove (snare on 3) set to 140 fits 140 well enough to read it there
		const halftime = drumLoop({
			bpm: 140,
			bars: 6,
			sampleRate: SR,
			pattern: { kick: [0, 3, 10], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
		});
		const groove = tempoOf(halftime.samples, 140)!;
		expect(groove.bpm).toBeCloseTo(140, 0);
		expect(groove.alternatives).toContain(70);
	});

	it('names half and double time as alternatives', () => {
		const { samples } = clickTrack({ bpm: 150, seconds: 12, sampleRate: SR });
		const t = tempoOf(samples)!;
		expect(t.bpm).toBeCloseTo(150, 0);
		expect(t.alternatives).toContain(75);
	});

	it('finds no pulse in noise, and nothing in silence or a short take', () => {
		const n = tempoOf(noise('white', 8, SR, { seed: 4 }));
		expect(n === null || n.confidence < 0.3).toBe(true);
		expect(estimateTempo(new Float32Array(1000), 172)).toBeNull();
		expect(estimateTempo(new Float32Array(100).fill(1), 172)).toBeNull();
	});

	it('relates tempi', () => {
		expect(tempoRelation(120, 120)).toBe('same');
		expect(tempoRelation(121.5, 120)).toBe('same');
		expect(tempoRelation(240, 120)).toBe('double');
		expect(tempoRelation(60, 120)).toBe('half');
		expect(tempoRelation(180, 120)).toBe('three-halves');
		expect(tempoRelation(80, 120)).toBe('two-thirds');
		expect(tempoRelation(100, 120)).toBe('different');
		expect(TEMPO_RANGE).toEqual({ min: 40, max: 220 });
	});
});

describe('beatGrid', () => {
	const grid = (options: Parameters<typeof clickTrack>[0]) => {
		const { samples } = clickTrack(options);
		return beatGrid(detectOnsets([samples], SR).onsets, options.bpm)!;
	};

	it('finds straight sixteenths tight and unswung', () => {
		const g = grid({ bpm: 100, seconds: 8, sampleRate: SR, perBeat: 4 });
		expect(g.swing!).toBeCloseTo(50, 0);
		expect(g.swingEighth!).toBeCloseTo(50, 0);
		expect(g.tightnessMs).toBeLessThan(1);
		expect(g.bpm).toBeCloseTo(100, 1);
		expect(g.positions.beat).toBeCloseTo(0.25, 1);
		// the first beat falls a quarter second in (the click track's offset)
		expect(g.phase).toBeCloseTo(0.25, 2);
	});

	it.each([56, 58, 62, 66.7, 70])('measures %s % swing', (swing) => {
		const g = grid({ bpm: 96, seconds: 10, sampleRate: SR, perBeat: 4, swing });
		expect(Math.abs(g.swing! - swing)).toBeLessThan(1);
		expect(g.tightnessMs).toBeLessThan(1.5);
	});

	it('measures a shuffle that pulls the off-sixteenths early', () => {
		const g = grid({ bpm: 110, seconds: 10, sampleRate: SR, perBeat: 4, swing: 42 });
		expect(Math.abs(g.swing! - 42)).toBeLessThan(1);
	});

	it('measures timing spread as tightness', () => {
		const loose = grid({ bpm: 110, seconds: 12, sampleRate: SR, perBeat: 4, jitterMs: 8 });
		expect(loose.tightnessMs).toBeGreaterThan(5.5);
		expect(loose.tightnessMs).toBeLessThan(10);
		const tight = grid({ bpm: 110, seconds: 12, sampleRate: SR, perBeat: 4, jitterMs: 2 });
		expect(tight.tightnessMs).toBeLessThan(3);
	});

	it('has no swing to measure without off-sixteenths', () => {
		const g = grid({ bpm: 120, seconds: 8, sampleRate: SR, perBeat: 2 });
		expect(g.swing).toBeNull();
		expect(g.positions.and).toBeCloseTo(0.5, 1);
		expect(beatGrid([], 120)).toBeNull();
	});

	it('says where each drum sits in the beat', () => {
		const { samples, times } = drumLoop({
			bpm: 124,
			bars: 4,
			sampleRate: SR,
			pattern: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }
		});
		const a = detectOnsets([samples], SR);
		const g = beatGrid(a.onsets, 124)!;
		expect(Math.abs(g.phase - times.kick[0])).toBeLessThan(0.004);
		const kicks = beatPositions(a.bands.low, g.bpm, g.phase);
		const hats = beatPositions(a.bands.high, g.bpm, g.phase);
		expect(kicks.beat).toBe(1);
		expect(hats.and).toBeGreaterThan(0.6);
		expect(kicks.count).toBe(16);
	});
});
