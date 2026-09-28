/**
 * Test support for the engines: plays an engine the way the core does (`start`, then a `control`
 * update and a 16-sample `render` per block), with M1 fixed or moving over time — on its own
 * ({@link play}, {@link playNote}, which also moves the pitch and takes a velocity) or through the
 * synth core ({@link throughCore}) — and the measurements the engine specs share: level, peaks, the
 * largest sample-to-sample step and second difference (for clicks), left/right correlation (for
 * stereo), and the bounds every engine keeps.
 */
import type { EngineId } from '$lib/core/opxy';
import { inharmonicDb } from '../analysis';
import { SynthCore, TRACK_OUTPUTS } from '../core';
import type { EngineVoice } from './index';

export const SR = 48000;
/** The core's control block (`CONTROL` in the core). */
export const BLOCK = 16;

/**
 * The bounds every engine keeps:
 * - level: RMS per channel within 0.2–0.35 at the engine's default M1 on a 220 Hz note;
 * - peak: never past ±1.2, at any setting and on any note from 30 Hz to 4 kHz (`notes`);
 * - click: a parameter swept over 0.5 s, or jumped at once, makes no sample-to-sample step more
 *   than 25 % larger than the engine's own largest step at rest along the way
 *   ({@link clickRatios}). A smooth change only passes through waveforms the engine makes at rest,
 *   so its steps stay within theirs; the 25 % covers settings between the nine checkpoints and
 *   noise's rarer draws. A level or blend applied without smoothing moves the whole waveform
 *   between two samples, a step added on top of the waveform's own that this catches;
 * - inharmonic: periodic settings keep what lies off the harmonic series below −45 dB on 1–2 kHz
 *   notes (`highNotes`, which do not divide the sample rate, so aliases fall between harmonics).
 */
export const BOUNDS = {
	level: [0.2, 0.35],
	peak: 1.2,
	notes: [30, 110, 440, 1000, 2000, 4000],
	click: 1.25,
	inharmonic: -45,
	highNotes: [1003, 1250, 1499, 1733, 1987]
} as const;

/** M1 as the device shows it (0–99 per parameter), as engines take it (0–1). */
export const m1 = (...values: number[]): Float32Array => Float32Array.from(values, (v) => v / 99);

/** What an engine played: each channel. */
export interface Played {
	readonly left: Float32Array;
	readonly right: Float32Array;
}

/** M1 over the note: fixed, or a function of the time in seconds (0–1 per parameter). */
export type Params = ArrayLike<number> | ((seconds: number) => ArrayLike<number>);

/** Plays `engine` at `hz` for `seconds`, with M1 from `params`, block by block like the core. */
export function play(engine: EngineVoice, hz: number, seconds: number, params: Params): Played {
	const total = Math.ceil((seconds * SR) / BLOCK) * BLOCK;
	const left = new Float32Array(total);
	const right = new Float32Array(total);
	const now = new Float32Array(4);
	const at = (t: number): Float32Array => {
		const p = typeof params === 'function' ? params(t) : params;
		for (let k = 0; k < 4; k++) now[k] = Math.min(1, Math.max(0, p[k]));
		return now;
	};
	const l = new Float32Array(BLOCK);
	const r = new Float32Array(BLOCK);
	engine.start(hz, 100, at(0));
	for (let i = 0; i < total; i += BLOCK) {
		engine.control(hz, at(i / SR));
		engine.render(l, r, BLOCK);
		left.set(l, i);
		right.set(r, i);
	}
	return { left, right };
}

/**
 * M1 at `base`, with parameter `k` moving from `from` to `to`: linearly over `seconds` (a sweep),
 * or at once at `seconds` when `jump` is set.
 */
export function moving(
	base: ArrayLike<number>,
	k: number,
	from: number,
	to: number,
	seconds: number,
	jump = false
): (t: number) => Float32Array {
	const p = Float32Array.from(base);
	return (t) => {
		const x = jump ? (t >= seconds ? 1 : 0) : Math.min(1, t / seconds);
		p[k] = from + (to - from) * x;
		return p;
	};
}

/** The largest absolute sample. */
export function peak(x: ArrayLike<number>): number {
	let m = 0;
	for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
	return m;
}

/** The largest change from one sample to the next (a click is a step the sound cannot make). */
export function largestStep(x: ArrayLike<number>, from = 1): number {
	let m = 0;
	for (let i = Math.max(1, from); i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
	return m;
}

/** Pearson correlation of two channels: 1 for identical, near 0 for unrelated. */
export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let ab = 0;
	let aa = 0;
	let bb = 0;
	let ma = 0;
	let mb = 0;
	for (let i = 0; i < a.length; i++) {
		ma += a[i];
		mb += b[i];
	}
	ma /= a.length;
	mb /= b.length;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] - ma;
		const y = b[i] - mb;
		ab += x * y;
		aa += x * x;
		bb += y * y;
	}
	return ab / Math.sqrt(aa * bb);
}

/** Every combination of `values` for the four parameters (for peak checks). */
export function grid(values: readonly number[]): number[][] {
	const out: number[][] = [];
	for (const a of values)
		for (const b of values) for (const c of values) for (const d of values) out.push([a, b, c, d]);
	return out;
}

/** A new voice of the engine under test, with its randomness seeded by `seed`. */
export type Make = (seed: number) => EngineVoice;

/** The loudest sample over every setting and note (each its own seed), and where it was. */
export function worstPeak(
	make: Make,
	settings: readonly ArrayLike<number>[],
	notes: readonly number[],
	seconds = 0.25
): { peak: number; at: string } {
	let worst = { peak: 0, at: '' };
	let seed = 1;
	for (const p of settings) {
		for (const hz of notes) {
			const { left, right } = play(make(seed++), hz, seconds, p);
			const loudest = Math.max(peak(left), peak(right));
			if (loudest > worst.peak) worst = { peak: loudest, at: `${Array.from(p)} at ${hz} Hz` };
		}
	}
	return worst;
}

/** The largest step in either channel. */
const stepOf = ({ left, right }: Played): number => Math.max(largestStep(left), largestStep(right));

/**
 * How parameter `k` moves, as the largest sample-to-sample step while it sweeps 0 → 1 over 0.5 s
 * and while it jumps 0 → 1 and 1 → 0 at once, each over the largest step the engine makes at rest
 * at nine settings along the way (three seeds and 0.3 s each, so noise shows its own extremes).
 * Near 1 means the change added no step the sound does not make by itself.
 */
export function clickRatios(
	make: Make,
	base: ArrayLike<number>,
	k: number,
	hz = 220
): { sweep: number; jump: number; back: number } {
	let rest = 0;
	for (let j = 0; j <= 8; j++) {
		const p = Float32Array.from(base);
		p[k] = j / 8;
		for (const seed of [3, 4, 5]) rest = Math.max(rest, stepOf(play(make(seed), hz, 0.3, p)));
	}
	return {
		sweep: stepOf(play(make(3), hz, 0.6, moving(base, k, 0, 1, 0.5))) / rest,
		jump: stepOf(play(make(3), hz, 0.4, moving(base, k, 0, 1, 0.2, true))) / rest,
		back: stepOf(play(make(3), hz, 0.4, moving(base, k, 1, 0, 0.2, true))) / rest
	};
}

/**
 * The worst energy off the harmonic series (dB, {@link inharmonicDb}) over settings and notes,
 * measured on 16384 samples after the first 4096. `f0` gives the series' fundamental (a ratio of
 * 2:3 makes it half the note).
 */
export function worstInharmonic(
	make: Make,
	settings: readonly ArrayLike<number>[],
	notes: readonly number[],
	f0: (p: ArrayLike<number>, hz: number) => number = (_p, hz) => hz
): { db: number; at: string } {
	let worst = { db: -Infinity, at: '' };
	for (const p of settings) {
		for (const hz of notes) {
			const { left } = play(make(1), hz, (4096 + 16384) / SR, p);
			const db = inharmonicDb(left.subarray(4096, 4096 + 16384), SR, f0(p, hz));
			if (db > worst.db) worst = { db, at: `${Array.from(p)} at ${hz} Hz` };
		}
	}
	return worst;
}

/** Plays `engine` for `seconds` at `hz` (or a pitch that moves with time), at `velocity`. */
export function playNote(
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
): Played {
	const total = Math.round(seconds * SR);
	const left = new Float32Array(total);
	const right = new Float32Array(total);
	const l = new Float32Array(BLOCK);
	const r = new Float32Array(BLOCK);
	const m1 = new Float32Array(4);
	const at = (t: number) => {
		const values = typeof params === 'function' ? params(t) : params;
		for (let i = 0; i < 4; i++) m1[i] = values[i];
		return m1;
	};
	const pitch = (t: number) => (typeof hz === 'function' ? hz(t) : hz);
	engine.start(pitch(0), velocity, at(0));
	for (let i = 0; i < total; i += BLOCK) {
		engine.control(pitch(i / SR), at(i / SR));
		engine.render(l, r, BLOCK);
		const n = Math.min(BLOCK, total - i);
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
			// switched off, as it was on the device for every capture
			filter: { type: 'svf', on: false, hz: 20000, resonance: 0, envelope: flat, depth: 0 },
			bend: 0,
			curve: null,
			pan: 0,
			lfoParam: null,
			element: null
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
