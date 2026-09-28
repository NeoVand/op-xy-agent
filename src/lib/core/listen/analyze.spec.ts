// The whole analysis on a small synthetic song (a drum loop under a chord progression, the way a
// fresh OP-XY project lays out tracks): the set tempo is confirmed, the grid is tight, the kicks
// sit on the beat, the chords come out in order; silence stops early; the result is plain JSON;
// bad input is refused; and 30 s of stereo is quick.
import { describe, expect, it } from 'vitest';
import { analyzeAudio } from './analyze';
import { ListenError } from './errors';
import { drumLoop, gain, mix, progression, sine } from './signals';

const SR = 44100;

/** Four bars at 120 BPM: kick on the beat, snare on 2 and 4, hats on the "and"; Am F C G on saws. */
function song(sampleRate = SR) {
	const drums = drumLoop({
		bpm: 120,
		bars: 4,
		sampleRate,
		offset: 0,
		pattern: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }
	});
	const chords = progression(
		[
			['A3', 'C4', 'E4'],
			['F3', 'A3', 'C4'],
			['C4', 'E4', 'G4'],
			['G3', 'B3', 'D4']
		],
		2,
		sampleRate,
		{ wave: 'saw', amplitude: 0.05 }
	);
	const kit = gain(drums.samples, 0.5);
	const left = mix(kit, chords);
	const right = mix(kit, gain(chords, 0.8));
	return { left: left.subarray(0, 8 * sampleRate), right: right.subarray(0, 8 * sampleRate) };
}

describe('analyzeAudio', () => {
	it('hears a small song', () => {
		const { left, right } = song();
		const a = analyzeAudio([left, right], SR, { expectedBpm: 120 });
		expect(a.seconds).toBeCloseTo(8, 6);
		expect(a.channels).toBe(2);
		expect(a.silence.silent).toBe(false);
		expect(a.level.loudness.integrated).toBeGreaterThan(-30);
		expect(a.level.clipRuns).toBe(0);
		const r = a.rhythm!;
		expect(r.tempo!.bpm).toBeCloseTo(120, 0);
		expect(r.tempo!.expected).toMatchObject({ bpm: 120, relation: 'same' });
		expect(r.grid!.tightnessMs).toBeLessThan(5);
		expect(r.drums!.low.beat).toBeGreaterThan(0.9);
		expect(r.drums!.high.and).toBeGreaterThan(0.6);
		const chords = a.harmony!.chords.map((c) => c.chord).filter((c) => c !== 'N');
		expect(chords).toEqual(['Am', 'F', 'C', 'G']);
		expect(['A minor', 'C major']).toContain(a.harmony!.key!.key);
		expect(a.stereo!.correlation!).toBeGreaterThan(0.9);
		expect(a.stereo!.balanceDb).toBeGreaterThan(0);
		expect(a.spectrum!.bands).toHaveLength(5);
	});

	it('uses the heard tempo for the grid when nothing is set', () => {
		const { left } = song(22050);
		const a = analyzeAudio([left], 22050);
		expect(a.rhythm!.tempo!.expected).toBeNull();
		expect(a.rhythm!.grid!.bpm).toBeCloseTo(120, 0);
		expect(a.stereo).toMatchObject({ correlation: 1, width: 0 });
	});

	it('stops at silence', () => {
		const quiet = new Float32Array(SR * 2);
		const a = analyzeAudio([quiet, quiet], SR);
		expect(a.silence.silent).toBe(true);
		expect([a.spectrum, a.stereo, a.rhythm, a.harmony]).toEqual([null, null, null, null]);
	});

	it('returns plain JSON', () => {
		const { left, right } = song(22050);
		const a = analyzeAudio([left, right], 22050, { expectedBpm: 120 });
		expect(JSON.parse(JSON.stringify(a))).toEqual(a);
		const tone = analyzeAudio([sine(440, 1, SR, 0.5)], SR);
		expect(JSON.parse(JSON.stringify(tone))).toEqual(tone);
	});

	it('refuses what it cannot hear', () => {
		const x = new Float32Array(100);
		expect(() => analyzeAudio([], SR)).toThrow(ListenError);
		expect(() => analyzeAudio([x, x, x], SR)).toThrow(/one or two channels/);
		expect(() => analyzeAudio([x, new Float32Array(99)], SR)).toThrow(/differ in length/);
		expect(() => analyzeAudio([x], 1000)).toThrow(/sample rate/);
		expect(() => analyzeAudio([Float32Array.of(0, NaN)], SR)).toThrow(/not a number/);
	});

	it('hears 30 s of stereo at 48 kHz in well under a few seconds', () => {
		const drums = drumLoop({
			bpm: 128,
			bars: 16,
			sampleRate: 48000,
			pattern: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }
		});
		const x = drums.samples.subarray(0, 30 * 48000);
		const started = performance.now();
		const a = analyzeAudio([x, x], 48000, { expectedBpm: 128 });
		expect(performance.now() - started).toBeLessThan(4000);
		expect(a.rhythm!.tempo!.expected!.relation).toBe('same');
	});
});
