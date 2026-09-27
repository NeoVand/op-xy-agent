/**
 * organ: eight registrations measured on the owner's OP-XY, each played as a bank of sine partials,
 * with the device's tremolo. How they were measured and fitted: `docs/research/57-synth-engines.md`
 * (organ) and `docs/research/90-device-probe.md` (2026-09-27, OS 1.1.33).
 *
 * What the device does [measured]:
 * - every type is a set of sine partials that start together, in sine phase, with the note. Most
 *   sit on the half-note grid (the 16′ is half the note), like drawbars; some types add ranks a few
 *   cents off it (a sub 11 cents flat, a pair of 2′ ranks 17 and 26 cents sharp, a 16′ and a 5⅓′
 *   5–6 cents sharp) that beat slowly against the rest;
 * - bass reshapes each type its own way: it brightens some ranks (more of their harmonics), or
 *   trades the 16′ and 8′ for the 4′; on type 2 it slides two partials from the 8′ and 5⅓′ up to
 *   the 5⅓′ and 4′, through inharmonic ratios on the way;
 * - higher notes are darker (upper partials fall off more steeply), and the whole engine sits
 *   behind a one-pole high-pass near 54 Hz ({@link ORGAN_HIGHPASS_HZ});
 * - the tremolo moves the level by amount × a sine: at full amount the level swings between
 *   silence and twice the steady level. Speed sets its rate from still (0) to 10.9 Hz, nearly in
 *   proportion; its phase runs free, not restarting with the note.
 *
 * Our model:
 * - {@link ORGAN_REGISTRATIONS} holds every partial's level at bass 0, ½ and 1 on A1–A5; a voice
 *   reads them in dB, linearly between the measured settings and notes (held beyond A1 and A5);
 * - each partial is a sine oscillator (a rotating phasor, renormalized every block) whose level
 *   and phase carry the high-pass's response at its frequency; partials fade out between 0.4 and
 *   0.45 of the sample rate;
 * - the tremolo's phase is the core's clock times its rate, so the notes of a chord pulse together;
 * - a type change crossfades over 20 ms; bass and the tremolo glide over 5 ms.
 */
import { sin2pi } from '../sine';
import { DEVICE_GAIN_DB } from './device';
import type { EngineVoice } from './index';
import {
	ORGAN_BASS_POINTS,
	ORGAN_HIGHPASS_HZ,
	ORGAN_NOTE_POINTS,
	ORGAN_REGISTRATIONS,
	type OrganPartial
} from './organ-registrations';

// Measured on the owner's device (2026-09-27): the tremolo's rate at speed 32, 64, 96 and 127.
/** The tremolo's rate at full speed (Hz), and the curve to it: rate = top × speed^curve. */
export const TREMOLO_TOP_HZ = 10.93;
export const TREMOLO_CURVE = 0.93;

// Design constants.
/** Smoothing of bass and the tremolo (seconds). */
const SMOOTH_SECONDS = 0.005;
/** A type change crossfades over this long (and waits for the last one to finish). */
const FADE_SECONDS = 0.02;
/** Partials fade out from this share of the sample rate to the next. */
const EDGE = 0.4;
const TOP = 0.45;
/** Pitch moves smaller than this (semitones) and bass moves smaller than this leave levels be. */
const STILL_NOTE = 0.001;
const STILL_BASS = 1e-4;
/** The most partials a type has. */
const CAPACITY = Math.max(...ORGAN_REGISTRATIONS.map((t) => t.length));

/** Where `x` falls among `points`: the index below it and the fraction of the way to the next. */
function locate(points: readonly number[], x: number): [number, number] {
	const last = points.length - 1;
	if (x <= points[0]) return [0, 0];
	if (x >= points[last]) return [last - 1, 1];
	let i = 0;
	while (x > points[i + 1]) i++;
	return [i, (x - points[i]) / (points[i + 1] - points[i])];
}

/** A partial's level (dB) at `bass` (0–1) on `note` (MIDI), from its measured grid. */
export function partialDb(partial: OrganPartial, bass: number, note: number): number {
	const [b, bf] = locate(ORGAN_BASS_POINTS, bass);
	const [n, nf] = locate(ORGAN_NOTE_POINTS, note);
	const cols = ORGAN_NOTE_POINTS.length;
	const db = partial.db;
	const low = db[b * cols + n] + (db[b * cols + n + 1] - db[b * cols + n]) * nf;
	const high = db[(b + 1) * cols + n] + (db[(b + 1) * cols + n + 1] - db[(b + 1) * cols + n]) * nf;
	return low + (high - low) * bf;
}

/** The high-pass's gain at `hz`. */
const highpassGain = (hz: number) => hz / Math.hypot(hz, ORGAN_HIGHPASS_HZ);

/** One type's partials for one voice: a sine oscillator each. */
class Bank {
	readonly #sr: number;
	#partials: readonly OrganPartial[] = [];
	/** Each partial's phasor, its turn per sample, and its level now and where it is going. */
	readonly #re = new Float64Array(CAPACITY);
	readonly #im = new Float64Array(CAPACITY);
	readonly #cr = new Float64Array(CAPACITY);
	readonly #ci = new Float64Array(CAPACITY);
	readonly #amp = new Float64Array(CAPACITY);
	readonly #target = new Float64Array(CAPACITY);
	#hz = 0;
	#bass = -1;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
	}

	/** Loads `partials` and starts them all in sine phase at `hz` (as the high-pass shifts them). */
	begin(partials: readonly OrganPartial[], hz: number, bass: number): void {
		this.#partials = partials;
		this.#hz = 0;
		this.#bass = -1;
		this.tune(hz, bass);
		for (let k = 0; k < partials.length; k++) {
			const f = (partials[k].ratio + partials[k].glide * bass) * hz;
			const shift = Math.atan2(ORGAN_HIGHPASS_HZ, f) / (2 * Math.PI);
			this.#re[k] = sin2pi(shift + 0.25);
			this.#im[k] = sin2pi(shift);
			this.#amp[k] = this.#target[k];
		}
	}

	/** Retunes to `hz` and re-reads the levels for `bass`, when either has moved. */
	tune(hz: number, bass: number): void {
		const moved = Math.abs(12 * Math.log2(hz / this.#hz)) > STILL_NOTE;
		if (!moved && Math.abs(bass - this.#bass) < STILL_BASS) return;
		if (moved) this.#hz = hz;
		this.#bass = bass;
		const note = 69 + 12 * Math.log2(this.#hz / 440);
		const partials = this.#partials;
		for (let k = 0; k < partials.length; k++) {
			const p = partials[k];
			const f = (p.ratio + p.glide * bass) * hz;
			const turn = f / this.#sr;
			this.#cr[k] = sin2pi(turn + 0.25);
			this.#ci[k] = sin2pi(turn);
			const fade = turn <= EDGE ? 1 : turn >= TOP ? 0 : (TOP - turn) / (TOP - EDGE);
			const db = partialDb(p, bass, note) + DEVICE_GAIN_DB;
			this.#target[k] = fade * highpassGain(f) * Math.pow(10, db / 20);
		}
	}

	/** Adds the next `n` samples into `out`, times a weight from `weight` moving by `dWeight` a sample. */
	render(out: Float32Array, n: number, weight: number, dWeight: number): void {
		const re = this.#re;
		const im = this.#im;
		for (let k = 0; k < this.#partials.length; k++) {
			let a = this.#amp[k];
			const target = this.#target[k];
			if (a === 0 && target === 0) continue;
			const step = (target - a) / n;
			const cr = this.#cr[k];
			const ci = this.#ci[k];
			let x = re[k];
			let y = im[k];
			let w = weight;
			for (let i = 0; i < n; i++) {
				a += step;
				w += dWeight;
				out[i] += w * a * y;
				const t = x * cr - y * ci;
				y = x * ci + y * cr;
				x = t;
			}
			// the phasor keeps its length: rounding would otherwise grow or shrink it
			const g = 1.5 - 0.5 * (x * x + y * y);
			re[k] = x * g;
			im[k] = y * g;
			this.#amp[k] = target;
		}
	}
}

export class OrganVoice implements EngineVoice {
	readonly #sr: number;
	readonly #smooth: number;
	readonly #fadeStep: number;
	/** The type sounding and the one fading out, and how far the fade has come (1 = done). */
	#bank: Bank;
	#old: Bank;
	#type = 0;
	#typeTarget = 0;
	#fade = 1;
	#hz = 0;
	/** Bass (0–1), tremolo depth and rate (cycles per sample): smoothed; the tremolo's phase. */
	#bass = 0;
	#bassTarget = 0;
	#depth = 0;
	#depthTarget = 0;
	#rate = 0;
	#rateTarget = 0;
	#lfo = 0;
	readonly #mix = new Float32Array(128);

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#fadeStep = 1 / (FADE_SECONDS * sampleRate);
		this.#bank = new Bank(sampleRate);
		this.#old = new Bank(sampleRate);
	}

	start(hz: number, _velocity: number, params: Float32Array, time = 0): void {
		this.#read(params);
		this.#hz = hz;
		this.#type = this.#typeTarget;
		this.#fade = 1;
		this.#bass = this.#bassTarget;
		this.#depth = this.#depthTarget;
		this.#rate = this.#rateTarget;
		// the tremolo runs free: where it is now on the core's clock
		const cycles = this.#rate * this.#sr * time;
		this.#lfo = cycles - Math.floor(cycles);
		this.#bank.begin(ORGAN_REGISTRATIONS[this.#type], hz, this.#bass);
	}

	control(hz: number, params: Float32Array): void {
		this.#read(params);
		this.#hz = hz;
		// a new type waits until the last crossfade has finished
		if (this.#typeTarget !== this.#type && this.#fade >= 1) {
			[this.#old, this.#bank] = [this.#bank, this.#old];
			this.#type = this.#typeTarget;
			this.#fade = 0;
			this.#bank.begin(ORGAN_REGISTRATIONS[this.#type], hz, this.#bass);
		}
	}

	/** The targets M1 `params` set. */
	#read(params: Float32Array): void {
		this.#typeTarget = Math.min(ORGAN_REGISTRATIONS.length - 1, Math.floor(clamp01(params[0]) * 8));
		this.#bassTarget = clamp01(params[1]);
		this.#depthTarget = clamp01(params[2]);
		const speed = clamp01(params[3]);
		this.#rateTarget = (TREMOLO_TOP_HZ * Math.pow(speed, TREMOLO_CURVE)) / this.#sr;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		// bass moves per block (5 ms smoothing is many blocks), each partial's level ramping across it
		const k = 1 - Math.pow(1 - this.#smooth, n);
		this.#bass += (this.#bassTarget - this.#bass) * k;
		this.#bank.tune(this.#hz, this.#bass);
		const mix = this.#mix.length >= n ? this.#mix : new Float32Array(n);
		mix.fill(0, 0, n);
		if (this.#fade < 1) {
			// a straight crossfade, sample by sample
			const from = this.#fade;
			const end = Math.min(1, from + n * this.#fadeStep);
			const step = (end - from) / n;
			this.#old.tune(this.#hz, this.#bass);
			this.#old.render(mix, n, 1 - from, -step);
			this.#bank.render(mix, n, from, step);
			this.#fade = end;
		} else {
			this.#bank.render(mix, n, 1, 0);
		}
		const s = this.#smooth;
		let depth = this.#depth;
		let rate = this.#rate;
		let lfo = this.#lfo;
		const depthTarget = this.#depthTarget;
		const rateTarget = this.#rateTarget;
		for (let i = 0; i < n; i++) {
			depth += (depthTarget - depth) * s;
			rate += (rateTarget - rate) * s;
			const out = mix[i] * (1 + depth * sin2pi(lfo));
			left[i] = out;
			right[i] = out;
			lfo += rate;
			if (lfo >= 1) lfo -= 1;
		}
		this.#depth = depth;
		this.#rate = rate;
		this.#lfo = lfo;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
