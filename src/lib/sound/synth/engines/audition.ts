/**
 * Playing one engine on its own, for the engine specs: a note driven the way the core drives it
 * (start, then a control update before every block of 16 samples) with M1 held or moving, and the
 * measures every engine is held to: level, peaks, and how rough the waveform gets while parameters
 * move (a click is a jump, which shows as a spike in the second difference).
 */
import type { EngineId } from '$lib/core/opxy';
import { SynthCore, TRACK_OUTPUTS } from '../core';
import type { EngineVoice } from './index';

/** The sample rate the specs render at. */
export const SR = 48000;
/** Samples per control update, as the core runs them. */
export const TICK = 16;

/** M1 as the engine sees it (0–1 each), fixed or as a function of time in seconds. */
export type Params = readonly number[] | ((seconds: number) => readonly number[]);

/** One rendered note. */
export interface Take {
	readonly left: Float32Array;
	readonly right: Float32Array;
}

/** Plays `engine` for `seconds` at `hz` (or a pitch that moves with time). */
export function play(
	engine: EngineVoice,
	{
		hz,
		seconds,
		params,
		velocity = 100
	}: {
		hz: number | ((seconds: number) => number);
		seconds: number;
		params: Params;
		velocity?: number;
	}
): Take {
	const total = Math.round(seconds * SR);
	const left = new Float32Array(total);
	const right = new Float32Array(total);
	const l = new Float32Array(TICK);
	const r = new Float32Array(TICK);
	const m1 = new Float32Array(4);
	const at = (t: number) => {
		const values = typeof params === 'function' ? params(t) : params;
		for (let i = 0; i < 4; i++) m1[i] = values[i];
		return m1;
	};
	const pitch = (t: number) => (typeof hz === 'function' ? hz(t) : hz);
	engine.start(pitch(0), velocity, at(0));
	for (let i = 0; i < total; i += TICK) {
		engine.control(pitch(i / SR), at(i / SR));
		engine.render(l, r, TICK);
		const n = Math.min(TICK, total - i);
		left.set(l.subarray(0, n), i);
		right.set(r.subarray(0, n), i);
	}
	return { left, right };
}

/**
 * One note of `engine` played through the synth core, 128 samples at a time as the worklet runs
 * it, with an open filter and a flat envelope: the left channel of its track.
 */
export function throughCore(engine: EngineId, m1: readonly number[], seconds = 0.3): Float32Array {
	const core = new SynthCore(SR);
	const flat = { attack: 0.002, decay: 0.1, sustain: 1, release: 0.05 };
	core.post({
		t: 'start',
		voice: {
			id: 1,
			track: 0,
			engine,
			m1,
			velocity: 100,
			start: 0,
			gate: Infinity,
			hz: 220,
			from: 220,
			glide: 0,
			amp: flat,
			peak: 1,
			filter: { type: 'svf', hz: 20000, resonance: 0, envelope: flat, depth: 0 },
			bend: 0,
			curve: null,
			pan: 0,
			lfoParam: null
		}
	});
	const total = Math.round(seconds * SR);
	const out = new Float32Array(total);
	for (let at = 0; at < total; at += 128) {
		const n = Math.min(128, total - at);
		const outputs = Array.from({ length: TRACK_OUTPUTS }, () => [
			new Float32Array(n),
			new Float32Array(n)
		]);
		core.process(at, outputs, [], n);
		out.set(outputs[0][0], at);
	}
	return out;
}

/** The largest absolute sample. */
export function peak(x: ArrayLike<number>): number {
	let p = 0;
	for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
	return p;
}

/**
 * The largest second difference |x[n] − 2x[n−1] + x[n−2]| over [from, to): how far a sample strays
 * from the straight line through the two before it. A band-limited tone of amplitude A keeps it
 * near A·(2πf/sr)² per partial; a jump of J shows as J at once, whatever the tone.
 */
export function roughness(x: ArrayLike<number>, from = 2, to = x.length): number {
	let worst = 0;
	for (let i = Math.max(2, from); i < to; i++) {
		worst = Math.max(worst, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]));
	}
	return worst;
}
