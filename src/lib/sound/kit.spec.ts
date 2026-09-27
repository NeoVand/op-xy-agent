import { describe, expect, it } from 'vitest';
import { Biquad, CEILING, Oscillator, ceiling, finish, loudness, peak, render, rms } from './dsp';
import { DRUM_SOUNDS, renderClick, renderDrum, renderImpulse } from './kit';

const SR = 44100;

/** Zero crossings per second: a rough brightness measure. */
function crossings(samples: Float32Array): number {
	let n = 0;
	for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 !== samples[i] < 0) n++;
	return (n * SR) / samples.length;
}

describe('dsp', () => {
	it('filters: a lowpass passes bass and stops treble, a highpass the reverse', () => {
		const tone = (hz: number, filter: Biquad) => {
			const osc = new Oscillator('sine', SR);
			const out = render(SR, 0.2, () => filter.process(osc.next(hz)));
			return rms(out, out.length / 2);
		};
		expect(tone(100, new Biquad('lowpass', 1000, 0.707, SR))).toBeGreaterThan(0.68);
		expect(tone(8000, new Biquad('lowpass', 1000, 0.707, SR))).toBeLessThan(0.02);
		expect(tone(8000, new Biquad('highpass', 1000, 0.707, SR))).toBeGreaterThan(0.68);
		expect(tone(1000, new Biquad('bandpass', 1000, 2, SR))).toBeGreaterThan(0.68);
	});

	it('finishes a sound to a loudness under a smooth ceiling', () => {
		const osc = new Oscillator('sine', SR);
		const tone = finish(
			render(SR, 0.2, () => osc.next(440)),
			-10,
			SR
		);
		expect(20 * Math.log10(loudness(tone, SR))).toBeCloseTo(-10, 1);
		const loud = finish(
			render(SR, 0.2, () => osc.next(440)),
			0,
			SR
		);
		expect(peak(loud)).toBeLessThanOrEqual(CEILING);
		// the ceiling is continuous: straight below the knee, rounding off above
		expect(ceiling(0.5)).toBe(0.5);
		expect(ceiling(0.6001)).toBeCloseTo(0.6001, 3);
		expect(ceiling(5)).toBeLessThan(CEILING);
		expect(ceiling(-5)).toBeGreaterThan(-CEILING);
	});

	it('makes band-limited oscillators that stay within full scale', () => {
		for (const shape of ['sine', 'square', 'saw', 'triangle'] as const) {
			const osc = new Oscillator(shape, SR);
			const out = render(SR, 0.05, () => osc.next(440));
			expect(peak(out)).toBeLessThanOrEqual(1.3);
			expect(rms(out)).toBeGreaterThan(0.4);
		}
	});
});

describe('the synthesized kit (TE factory layout, notes 53–76)', () => {
	it('has 24 sounds in the factory order', () => {
		expect(DRUM_SOUNDS).toHaveLength(24);
		expect(DRUM_SOUNDS.slice(0, 6)).toEqual(['kick', 'kick 2', 'snare', 'snare 2', 'rim', 'clap']);
		expect(DRUM_SOUNDS[8]).toBe('closed hat');
		expect(DRUM_SOUNDS[23]).toBe('chi');
		expect(() => renderDrum(24, SR)).toThrow(RangeError);
	});

	it('renders every sound audible, under the ceiling, and fading to silence', () => {
		for (let i = 0; i < DRUM_SOUNDS.length; i++) {
			const s = renderDrum(i, SR);
			expect(s.length, DRUM_SOUNDS[i]).toBeGreaterThan(SR * 0.1);
			expect(peak(s), DRUM_SOUNDS[i]).toBeLessThanOrEqual(CEILING);
			// balanced by loudness: the quietest (ride, shaker) at −17 dBFS, kicks at −4.5
			const level = 20 * Math.log10(loudness(s, SR));
			expect(level, DRUM_SOUNDS[i]).toBeGreaterThan(-17.6);
			expect(level, DRUM_SOUNDS[i]).toBeLessThan(-4);
			expect(Math.abs(s[0]), DRUM_SOUNDS[i]).toBeLessThan(1e-6);
			expect(Math.abs(s[s.length - 1]), DRUM_SOUNDS[i]).toBeLessThan(1e-3);
			expect(s.every(Number.isFinite), DRUM_SOUNDS[i]).toBe(true);
		}
	});

	it('balances the kit like a drum machine: kick first, snare a little under, hats well under', () => {
		const level = (i: number) => 20 * Math.log10(loudness(renderDrum(i, SR), SR));
		const kick = level(0);
		expect(level(2) - kick).toBeCloseTo(-4.5, 0);
		expect(level(8) - kick).toBeCloseTo(-11.5, 0);
		expect(level(12) - kick).toBeCloseTo(-1.5, 0);
	});

	it('is reproducible and sounds like its names: kicks low, hats high', () => {
		expect(renderDrum(2, SR)).toEqual(renderDrum(2, SR));
		const kick = crossings(renderDrum(0, SR).subarray(0, SR * 0.2));
		const hat = crossings(renderDrum(8, SR).subarray(0, SR * 0.05));
		const snare = crossings(renderDrum(2, SR).subarray(0, SR * 0.1));
		expect(kick).toBeLessThan(300);
		expect(hat).toBeGreaterThan(8000);
		expect(snare).toBeGreaterThan(kick);
		expect(snare).toBeLessThan(hat);
		// the open hat rings far longer than the closed one
		const tail = (s: Float32Array) => rms(s, Math.round(SR * 0.1), Math.round(SR * 0.15));
		expect(tail(renderDrum(10, SR))).toBeGreaterThan(10 * tail(renderDrum(8, SR)));
	});

	it('clicks the metronome louder and higher on the bar', () => {
		const accent = renderClick(true, SR);
		const beat = renderClick(false, SR);
		expect(peak(accent)).toBeGreaterThan(peak(beat));
		expect(crossings(accent)).toBeGreaterThan(crossings(beat));
	});

	it('makes a decorrelated stereo impulse that dies away', () => {
		const [left, right] = renderImpulse(SR);
		expect(left.length).toBe(right.length);
		expect(left).not.toEqual(right);
		const early = rms(left, Math.round(SR * 0.05), Math.round(SR * 0.3));
		const late = rms(left, Math.round(SR * 2), Math.round(SR * 2.4));
		expect(early).toBeGreaterThan(20 * late);
		// silent before the pre-delay
		expect(peak(left.subarray(0, Math.round(SR * 0.01)))).toBe(0);
	});
});
