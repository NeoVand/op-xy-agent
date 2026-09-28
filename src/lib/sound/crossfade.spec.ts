// The synth sampler's loop crossfade (docs/research/60-sound-session.md §5), baked into the buffer:
// the loop's end fades into what precedes its start, so the jump back is seamless.
import { describe, expect, it } from 'vitest';
import { crossfadeLoop } from './dsp';

const SR = 1000;

/** A 7 Hz sine, so a loop of 0.30 s wraps mid-cycle and clicks without a crossfade. */
const sine = () =>
	Float32Array.from({ length: SR }, (_, i) => Math.sin((2 * Math.PI * 7 * i) / SR));

describe('the loop crossfade', () => {
	it('lands the end of the loop on the sample just before its start', () => {
		const [input] = [sine()];
		const s = 500;
		const e = 800;
		// without it the jump from e − 1 to s is a step
		expect(Math.abs(input[e - 1] - input[s])).toBeGreaterThan(0.5);
		const [out] = crossfadeLoop([input], SR, s / SR, e / SR, 0.1);
		// with it the last sample before the end is (nearly) the one before the start, whose
		// neighbour is the start: the wrap continues the waveform
		expect(Math.abs(out[e - 1] - input[s - 1])).toBeLessThan(0.02);
		expect(Math.abs(out[e - 1] - input[s])).toBeLessThan(0.1);
		// before the crossfade nothing changes, nor does the input
		expect(Array.from(out.slice(0, e - 100))).toEqual(Array.from(input.slice(0, e - 100)));
		expect(input).toEqual(sine());
	});

	it('reaches back no further than the buffer’s start or the loop’s length, and does nothing at 0', () => {
		const input = sine();
		// a loop starting at 50 ms can only fade over its first 50 samples' worth
		const [short] = crossfadeLoop([input], SR, 0.05, 0.5, 0.3);
		expect(Array.from(short.slice(0, 450))).toEqual(Array.from(input.slice(0, 450)));
		expect(short[499]).not.toBe(input[499]);
		const [none] = crossfadeLoop([input], SR, 0.5, 0.8, 0);
		expect(none).toBe(input);
	});
});
