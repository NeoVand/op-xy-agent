import { describe, expect, it } from 'vitest';
import { PunchCore, type CoreEffect } from './core';
import { CHOP_SECONDS, STUTTER_GATE } from './effects';

const SR = 48000;
/** Sixteenths at 125 BPM: 0.12 s, 5760 frames (divisible by 12). */
const STEP = 5760;

/** Runs `seconds` of `signal` (per channel, by frame) through a core in 128-frame blocks. */
function run(
	core: PunchCore,
	seconds: number,
	signal: (frame: number) => [number, number] = (f) => [Math.sin(f * 0.05), Math.cos(f * 0.031)]
) {
	const n = Math.round(seconds * SR);
	const inL = new Float32Array(n);
	const inR = new Float32Array(n);
	for (let f = 0; f < n; f++) [inL[f], inR[f]] = signal(f);
	const outL = new Float32Array(n);
	const outR = new Float32Array(n);
	for (let start = 0; start < n; start += 128) {
		const m = Math.min(128, n - start);
		core.process(
			inL.subarray(start, start + m),
			inR.subarray(start, start + m),
			outL.subarray(start, start + m),
			outR.subarray(start, start + m),
			start,
			m
		);
	}
	return { inL, inR, outL, outR };
}

/** A core on the test grid, with `effect` holding over `from`…`to` frames. */
function coreWith(effect: CoreEffect | null, from = 0, to = Infinity) {
	const core = new PunchCore(SR);
	core.setGrid(0, { origin: 0, step: STEP });
	if (effect) core.add({ id: 1, effect, from, to });
	return core;
}

/** The largest jump between neighbouring samples of `a` over `from`…`to`. */
function maxJump(a: Float32Array, from = 1, to = a.length): number {
	let max = 0;
	for (let i = Math.max(1, from); i < to; i++) max = Math.max(max, Math.abs(a[i] - a[i - 1]));
	return max;
}

/** The root mean square of `a` over frames `from`…`to` (rounded to whole frames). */
const rms = (a: Float32Array, from: number, to: number) => {
	const [i0, i1] = [Math.round(from), Math.min(a.length, Math.round(to))];
	let sum = 0;
	for (let i = i0; i < i1; i++) sum += a[i] * a[i];
	return Math.sqrt(sum / Math.max(1, i1 - i0));
};

describe('the punch-in processor core', () => {
	it('passes the sound untouched while nothing holds', () => {
		const { inL, inR, outL, outR } = run(coreWith(null), 0.2);
		expect(Array.from(outL)).toEqual(Array.from(inL));
		expect(Array.from(outR)).toEqual(Array.from(inR));
	});

	it('mutes within a few milliseconds, without a click, and comes back when the span ends', () => {
		const on = 0.05 * SR;
		const off = 0.15 * SR;
		const { inL, outL } = run(coreWith('mute', on, off), 0.25);
		expect(rms(outL, 0, on)).toBeCloseTo(rms(inL, 0, on), 5);
		// silent from 6 ms after the span begins until it ends
		expect(rms(outL, on + 0.006 * SR, off)).toBe(0);
		// back to the plain sound 6 ms after it ends
		for (let f = off + 0.006 * SR; f < outL.length; f += 997)
			expect(outL[f]).toBeCloseTo(inL[f], 6);
		// the ramps are gentle: no step larger than the signal's own
		expect(maxJump(outL)).toBeLessThanOrEqual(maxJump(inL) + 1e-3);
	});

	it('stutters a melodic track: each sixteenth starts over at its restarts and falls silent at 7/12', () => {
		// a rising ramp per step makes "which part of the step plays" readable
		const ramp = (f: number): [number, number] => [f / 1e6, f / 1e6];
		const { outL } = run(coreWith('stutter'), 0.5, ramp);
		const s = 2; // the third sixteenth (the core has seen two whole steps)
		const start = s * STEP;
		const at = (share: number) => start + Math.round(share * STEP);
		// the first twelfth plays as it comes
		expect(outL[at(0.5 / 12)]).toBeCloseTo((start + (0.5 / 12) * STEP) / 1e6, 6);
		// after a restart (and its 3 ms crossfade) the step's beginning plays again
		const fade = Math.ceil(0.003 * SR) + 1;
		for (const [restart, share] of [
			[1 / 12, 1.9 / 12],
			[2 / 12, 3.9 / 12],
			[4 / 12, 5.9 / 12],
			[6 / 12, 6.9 / 12]
		]) {
			const f = at(share);
			expect(f - at(restart)).toBeGreaterThan(fade);
			expect(outL[f]).toBeCloseTo((start + (f - at(restart))) / 1e6, 5);
		}
		// silent from 7/12 (after the gate's ramp) to the step's end
		expect(rms(outL, at(STUTTER_GATE) + 0.004 * SR, start + STEP)).toBe(0);
	});

	it('stutters without clicks', () => {
		const { inL, outL } = run(coreWith('stutter'), 0.6);
		// a sine's steepest step is its amplitude × its rate; a restart without a crossfade would jump
		// by up to twice the amplitude
		expect(maxJump(outL)).toBeLessThan(maxJump(inL) * 3);
	});

	it('chops a percussion track: each sixteenth lets its first 30 ms through, in mono', () => {
		const { outL, outR } = run(coreWith('chop'), 0.5);
		const start = 2 * STEP;
		const open = Math.round(CHOP_SECONDS * SR);
		// mono while open
		for (let f = start + 200; f < start + open - 200; f += 101)
			expect(outL[f]).toBeCloseTo(outR[f], 6);
		expect(rms(outL, start + 200, start + open - 200)).toBeGreaterThan(0.3);
		// closed from 30 ms (after the ramp) until the next sixteenth
		expect(rms(outL, start + open + 0.004 * SR, start + STEP)).toBe(0);
	});

	it('sweeps a melodic track across the stereo field and settles back when let go', () => {
		// a sound on the right alone: the sweep (leftwards first) pulls it over to the left
		const right = (): [number, number] => [0, 0.5];
		const core = coreWith('sweep', 0, 2.2 * SR);
		const { outL, outR } = run(core, 3, right);
		// eight beats per cycle at 125 BPM: 3.84 s; a quarter in (0.96 s) it leans furthest left
		const q = Math.round(0.96 * SR);
		expect(rms(outL, q - 500, q + 500)).toBeGreaterThan(0.3);
		expect(rms(outR, q - 500, q + 500)).toBeLessThan(0.3);
		// let go, it glides home: the right-hand sound on the right again
		expect(rms(outL, 2.7 * SR, 3 * SR)).toBeLessThan(1e-3);
		expect(rms(outR, 2.7 * SR, 3 * SR)).toBeCloseTo(0.5, 2);
		expect(maxJump(outL)).toBeLessThan(0.01);
	});

	it('ends a held span when told, and follows a new grid from its frame', () => {
		const core = coreWith('chop');
		const { outL } = run(core, 0.2);
		expect(rms(outL, STEP * 0.5, STEP)).toBe(0);
		core.end(1, 0);
		expect(core.spans).toBe(1);
		const after = run(core, 0.1);
		// the span is gone once processing passes its end
		expect(core.spans).toBe(0);
		expect(rms(after.outL, 0.01 * SR, 0.1 * SR)).toBeGreaterThan(0.3);
		core.setGrid(0, { origin: 100, step: 2 * STEP });
		core.add({ id: 2, effect: 'chop', from: 0, to: Infinity });
		const regridded = run(core, 0.3);
		// the step now starts at frame 100 and lasts twice as long: closed well into it
		expect(rms(regridded.outL, 100 + STEP, 100 + 2 * STEP)).toBe(0);
	});
});
