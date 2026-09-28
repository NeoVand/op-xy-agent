// Onsets on signals whose onsets are known: impulse and noise-burst click tracks land within a
// fraction of a millisecond, note changes are found, steady tones, silence and a noise floor give
// none, quiet hats between loud kicks still count, and the bands tell kicks from hats.
import { describe, expect, it } from 'vitest';
import { detectOnsets, mono } from './onsets';
import {
	chord,
	clickTrack,
	concat,
	drumLoop,
	gain,
	mix,
	noise,
	noteHz,
	progression,
	silence,
	sine
} from './signals';

const SR = 44100;

/** For each expected time, the distance to the nearest detected one, in ms. */
function misses(detected: readonly number[], expected: readonly number[]): number[] {
	return expected.map((t) => Math.min(...detected.map((d) => Math.abs(d - t))) * 1000);
}

describe('detectOnsets', () => {
	it('places impulse clicks to the sample', () => {
		const { samples, times } = clickTrack({
			bpm: 120,
			seconds: 6,
			sampleRate: SR,
			impulses: true
		});
		const a = detectOnsets([samples, samples], SR);
		expect(a.onsets.length).toBe(times.length);
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					times
				)
			)
		).toBeLessThan(0.1);
		expect(a.frameRate).toBeCloseTo(SR / 256, 6);
	});

	it('finds every sixteenth of a click track, quiet off-beats included, within a millisecond', () => {
		const { samples, times } = clickTrack({
			bpm: 132,
			seconds: 6,
			sampleRate: SR,
			perBeat: 4,
			offbeatLevel: 0.25
		});
		const a = detectOnsets([samples], SR);
		expect(a.onsets.length).toBe(times.length);
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					times
				)
			)
		).toBeLessThan(1);
		// the beats are the strongest
		const strongest = [...a.onsets].sort((x, y) => y.strength - x.strength).slice(0, 5);
		for (const o of strongest)
			expect(
				misses(
					times.filter((_, i) => i % 4 === 0),
					[o.time]
				)
			);
	});

	it('finds note changes in a melody', () => {
		const notes = [['C4'], ['E4'], ['G4'], ['C5'], ['A3']];
		const x = concat(
			silence(0.3, SR),
			...notes.map((n) => chord(n, 0.6, SR, { amplitude: 0.3 })),
			silence(0.3, SR)
		);
		const a = detectOnsets([x], SR);
		const expected = notes.map((_, i) => 0.3 + i * 0.6);
		expect(a.onsets.length).toBe(notes.length);
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					expected
				)
			)
		).toBeLessThan(10);
	});

	it('finds legato note changes at the same loudness', () => {
		// one sine gliding nowhere: its pitch steps every half second, its level never moves
		const hz = ['C4', 'E4', 'G4', 'C5', 'A4'].map(noteHz);
		let phase = 0;
		const x = Float32Array.from({ length: Math.round(2.5 * SR) }, (_, i) => {
			phase += (2 * Math.PI * hz[Math.min(4, Math.floor(i / (0.5 * SR)))]) / SR;
			return 0.3 * Math.sin(phase);
		});
		const a = detectOnsets([x], SR);
		const changes = [0.5, 1, 1.5, 2];
		expect(a.onsets.length).toBe(changes.length);
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					changes
				)
			)
		).toBeLessThan(5);
	});

	it('places onsets within about 3 ms from the flux peak alone', () => {
		const clicks = clickTrack({ bpm: 120, seconds: 4, sampleRate: SR });
		const drums = drumLoop({
			bpm: 100,
			bars: 1,
			sampleRate: SR,
			pattern: { kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14] }
		});
		for (const [samples, times] of [
			[clicks.samples, clicks.times],
			[drums.samples, [...drums.times.kick, ...drums.times.snare, ...drums.times.hat]]
		] as const) {
			const a = detectOnsets([samples], SR, { refine: false });
			expect(a.onsets.length).toBe(times.length);
			expect(
				Math.max(
					...misses(
						a.onsets.map((o) => o.time),
						times
					)
				)
			).toBeLessThan(3);
		}
	});

	it('does not take a note’s end for an onset (short gated notes, as a sequencer plays them)', () => {
		// sixteenths at 120 bpm held for half a step, with 5 ms fades: 16 starts and 16 ends
		const step = 0.125;
		const notes = ['C4', 'G4', 'E4', 'C5'];
		const x = concat(
			silence(0.2, SR),
			...Array.from({ length: 16 }, (_, i) =>
				concat(
					chord([notes[i % 4]], step / 2, SR, { amplitude: 0.3, wave: 'saw', fade: 0.005 }),
					silence(step / 2, SR)
				)
			)
		);
		const a = detectOnsets([x], SR);
		const starts = Array.from({ length: 16 }, (_, i) => 0.2 + i * step);
		expect(a.onsets.length).toBe(16);
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					starts
				)
			)
		).toBeLessThan(5);
	});

	it('finds nothing in a steady tone after it starts, in silence or in a noise floor', () => {
		const tone = detectOnsets([sine(440, 4, SR, 0.3)], SR);
		expect(tone.onsets.filter((o) => o.time > 0.05)).toEqual([]);
		const quiet = detectOnsets([silence(3, SR)], SR);
		expect(quiet.onsets).toEqual([]);
		expect(quiet.envelope.every((v) => v === 0)).toBe(true);
		expect(detectOnsets([noise('white', 3, SR, { rms: 1e-4 })], SR).onsets).toEqual([]);
		expect(detectOnsets([new Float32Array(0)], SR).onsets).toEqual([]);
	});

	it('still hears hats 10 dB under the kicks, between them', () => {
		const loop = drumLoop({
			bpm: 110,
			bars: 2,
			sampleRate: SR,
			pattern: { kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }
		});
		const kicks = drumLoop({ bpm: 110, bars: 2, sampleRate: SR, pattern: { kick: [0, 4, 8, 12] } });
		const hats = drumLoop({ bpm: 110, bars: 2, sampleRate: SR, pattern: { hat: [2, 6, 10, 14] } });
		const x = mix(kicks.samples, gain(hats.samples, 0.3));
		const a = detectOnsets([x], SR);
		const all = [...loop.times.kick, ...loop.times.hat].sort((p, q) => p - q);
		expect(a.onsets.length).toBe(all.length);
		// a hat under a kick's tail does not rise out of silence: it is placed at its flux peak
		expect(
			Math.max(
				...misses(
					a.onsets.map((o) => o.time),
					all
				)
			)
		).toBeLessThan(3);
	});

	it('hears no onsets in a held low saw, whose harmonics beat inside every bin', () => {
		const bass = progression([['A1'], ['A1']], 4, SR, { wave: 'saw', amplitude: 0.25 });
		const a = detectOnsets([bass], SR);
		// its start, and nothing while it holds
		expect(a.onsets.filter((o) => o.time > 0.05)).toEqual([]);
	});

	it('finds kicks under a loud saw bass, most within 6 ms', () => {
		const n = 8 * SR;
		const loop = drumLoop({
			bpm: 120,
			bars: 5,
			sampleRate: SR,
			offset: 0.05,
			pattern: { kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }
		});
		const bassLine = progression([['A1'], ['F1'], ['C2'], ['G1']], 2, SR, {
			wave: 'saw',
			amplitude: 0.25
		});
		const x = mix(gain(loop.samples.subarray(0, n), 0.6), bassLine);
		const a = detectOnsets([x], SR);
		const kicks = loop.times.kick.filter((t) => t < 8);
		const off = misses(
			a.onsets.map((o) => o.time),
			kicks
		);
		expect(off.filter((ms) => ms <= 6).length).toBeGreaterThanOrEqual(10);
		expect(Math.max(...off)).toBeLessThan(35);
		const hats = loop.times.hat.filter((t) => t < 8);
		expect(Math.max(...misses(a.bands.high, hats))).toBeLessThan(4);
	});

	it('tells kicks (low band) from hats (high band)', () => {
		const { samples, times } = drumLoop({
			bpm: 100,
			bars: 2,
			sampleRate: SR,
			pattern: { kick: [0, 7, 8], snare: [4, 12], hat: [2, 6, 10, 14] }
		});
		const a = detectOnsets([samples, samples], SR);
		expect(Math.max(...misses(a.bands.low, times.kick))).toBeLessThan(3);
		expect(Math.max(...misses(a.bands.high, times.hat))).toBeLessThan(3);
		// the low band has no hats, the high band no kicks
		expect(Math.min(...misses(a.bands.low, times.hat))).toBeGreaterThan(20);
		expect(Math.min(...misses(a.bands.high, times.kick))).toBeGreaterThan(20);
		// the snares sit in the mid band
		expect(Math.max(...misses(a.bands.mid, times.snare))).toBeLessThan(3);
	});
});

describe('mono', () => {
	it('averages the channels', () => {
		expect([...mono([Float32Array.of(1, 0), Float32Array.of(0, 1)])]).toEqual([0.5, 0.5]);
		expect([...mono([[0.25, -0.5]])]).toEqual([0.25, -0.5]);
		expect(mono([]).length).toBe(0);
	});
});
