/**
 * axis: FM strings, two operators and a resonant lowpass. The evidence and its sources are in
 * `docs/research/57-synth-engines.md`; what TE, the device's screen or several reviewers establish
 * is marked [E], our inference [I].
 *
 * - [E] TE: an FM engine for lush strings. Tone makes it brighter or darker (TE staff: a built-in
 *   filter); ratio sets one oscillator's pitch, detuning over 0–50 and stepping up in fifths over
 *   51–100; shape sets the oscillators' waveform; tremolo adds movement. axis and epiano presets
 *   alone share the same hidden values after P1–P4: one FM core under both, we think.
 * - [E] An oscilloscope review hears two operators; tone as a lowpass with an unusual resonance;
 *   ratio from an octave below, sweeping smoothly to unison at 50, then about five octaves in
 *   alternating fifths and fourths; shape morphing saw ↔ triangle. Another review: tremolo speeds
 *   up as it deepens, and shape goes from saw towards square by ear. The guide's early screen
 *   drawing called P4 vibrato.
 * - [I] op2 runs at r × the note. Its sine phase-modulates op1 (the note) at a fixed index, and its
 *   own waveform is mixed in beside op1's (less of it as the ratio climbs), so detune beats audibly
 *   and the fifths stack like an organ even with tone dark. The FM depth stays fixed, as the
 *   evidence gives tone to the filter; it shrinks only where its sidebands would pass Nyquist.
 * - [I] Ratio: 0–50 glides r from 0.5 to 1 on a curve that spends most of its travel near unison,
 *   where op1 and op2 beat slowly (the chorus); 51–100 steps r through 1, 1.5, 2, 3, 4, 6, 8, 12,
 *   16, 24, 32. Steps glide over a few milliseconds, so they never click.
 * - [I] Shape: both operators are a triangle whose rise takes a share of the cycle, from all of it
 *   (a saw, shape 0; both reviews put the saw at the bottom) to half (a triangle, shape 1): the
 *   edges soften as it rises. Band-limited tables, phase-modulated at a band limit that follows the
 *   modulation.
 * - [I] Tone: a state-variable lowpass inside the engine, TONE_LOW → TONE_HIGH exponentially, more
 *   resonant as it darkens (Q_BRIGHT → Q_DARK): a resonant hump at low tone, its peak met halfway
 *   by a 1/√Q gain so a note sitting on it stays within bounds.
 * - [I] Tremolo: gain 1 − D·(½ + ½·sin 2πRt), depth D and rate R both rising with the knob, with a
 *   touch of pitch vibrato from the same LFO (strings' vibrato moves both).
 */
import { Svf, prewarp } from '../filters';
import { Noise } from '../noise';
import { sin2pi } from '../sine';
import { WaveTable } from '../wavetable';
import type { EngineVoice } from './index';

// Calibration: our estimates until the owner's device is measured (57-synth-engines.md).
/** op2's phase modulation of op1, in radians. */
const INDEX = 1.3;
/** How far below unison the detune half starts (semitones) and its curve (0 = linear). */
const DETUNE_RANGE = 12;
const DETUNE_CURVE = 2.5;
/** The ratio steps above 50: fifths and fourths up five octaves. */
const RATIO_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
/** op2's own level in the mix at ratios up to 2; above, it falls as √(2/r). */
const OP2_LEVEL = 0.5;
/**
 * Tone's cutoff range (Hz) and its resonance (Q) at the dark and bright ends; Q falls with the
 * cube of tone, so the hump belongs to the dark end and brightness rises all the way up.
 */
const TONE_LOW = 100;
const TONE_HIGH = 16000;
const Q_DARK = 2.5;
const Q_BRIGHT = Math.SQRT1_2;
/** Tremolo depth at full, and its rate (Hz) at the bottom and top of the knob. */
const TREMOLO_DEPTH = 0.6;
const TREMOLO_SLOW = 0.5;
const TREMOLO_FAST = 10;
/** The vibrato that comes with a full tremolo, in cents. */
const VIBRATO_CENTS = 6;
/** Output gain: about 0.26 RMS at the default M1 (80s) on a 220 Hz note. */
const LEVEL = 0.5;

// Design constants.
/** Smoothing of every continuous parameter, ratio included (seconds). */
const SMOOTH_SECONDS = 0.005;
/**
 * The share of Nyquist op1's sidebands may reach before the index and op1's band limit give way.
 * Harmonic h of op1, modulated at index h·I by op2 at r × the note, has sidebands r apart out to
 * the last order k with |J_k(h·I)| above −50 dB: one order below an index of FIRST_ORDER, else
 * about 2 + 1.7·h·I (fitted to Bessel tables). At high ratios even the second order lands far out.
 */
const BANDWIDTH = 0.8;
const FIRST_ORDER = 0.1;
/** Shape's stored waveforms: the rise's share of the cycle from 1 (saw) to ½ (triangle). */
const SHAPE_FRAMES = 9;
/** Samples per drawn waveform before it is band-limited. */
const CYCLE = 4096;

/** The operators' waveforms across shape: a triangle rising for `1 − w` of the cycle. */
function buildShapes(): WaveTable {
	const cycles: Float32Array[] = [];
	for (let f = 0; f < SHAPE_FRAMES; f++) {
		const w = (0.5 * f) / (SHAPE_FRAMES - 1);
		const cycle = new Float32Array(CYCLE);
		for (let i = 0; i < CYCLE; i++) {
			const x = i / CYCLE;
			cycle[i] = x < 1 - w ? -1 + (2 * x) / (1 - w) : 1 - (2 * (x - (1 - w))) / w;
		}
		cycles.push(cycle);
	}
	return WaveTable.fromCycles(cycles);
}

/**
 * The largest index (radians) whose sidebands on op1's fundamental all fit below `room` harmonics
 * of the note, with op2 at ratio `r`.
 */
function indexRoom(r: number, room: number): number {
	const full = ((room - 1) / r - 2) / 1.7;
	if (full >= FIRST_ORDER) return full;
	// only the first order fits: stay below where the second matters, and fade out as the first
	// order itself nears the limit
	return FIRST_ORDER * Math.min(1, Math.max(0, (room - 1 - r) / 2));
}

/** How many of op1's harmonics may sound under index `index` (radians) at ratio `r`. */
function harmonicRoom(index: number, r: number, room: number): number {
	if (index <= 0) return room;
	// harmonics whose own index is below FIRST_ORDER need room for one order, the rest for all
	const firstOnly = Math.min(room - r, FIRST_ORDER / index);
	const all = (room - 2 * r) / (1 + 1.7 * index * r);
	return Math.max(1, firstOnly, all);
}

let shapeTable: WaveTable | null = null;

/** The shared operator waveforms (built on first use). */
function shapes(): WaveTable {
	shapeTable ??= buildShapes();
	return shapeTable;
}

/** op2's frequency ratio for ratio `p` (0–1). */
export function axisRatio(p: number): number {
	if (p <= 0.5) {
		// most of the travel near unison: the semitones below it grow exponentially towards 0
		const u = 1 - p / 0.5;
		const semitones = (DETUNE_RANGE * Math.expm1(DETUNE_CURVE * u)) / Math.expm1(DETUNE_CURVE);
		return Math.pow(2, -semitones / 12);
	}
	const step = Math.floor(((p - 0.5) / 0.5) * RATIO_STEPS.length);
	return RATIO_STEPS[Math.min(RATIO_STEPS.length - 1, step)];
}

export class AxisVoice implements EngineVoice {
	readonly #sr: number;
	readonly #table = shapes();
	readonly #filter = new Svf();
	readonly #smooth: number;
	#dt = 0;
	#p1 = 0;
	#p2 = 0;
	#lfo = 0;
	/** Smoothed parameters and their targets: ratio, index (cycles), op2's level, shape frame. */
	#ratio = 1;
	#ratioTarget = 1;
	#index = 0;
	#indexTarget = 0;
	#mix2 = 0;
	#mix2Target = 0;
	#shape = 0;
	#shapeTarget = 0;
	/** Tremolo depth and rate (cycles per sample), vibrato depth (pitch ratio per unit of LFO). */
	#depth = 0;
	#depthTarget = 0;
	#rate = 0;
	#rateTarget = 0;
	#vibrato = 0;
	#vibratoTarget = 0;
	/** Tone's cutoff (log2 Hz) and its target; the filter is set once per block. */
	#cutoff = 0;
	#cutoffTarget = 0;

	constructor(sampleRate: number, seed: number) {
		this.#sr = sampleRate;
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		// each voice's tremolo starts somewhere of its own, like players in a section
		this.#lfo = 0.5 + 0.5 * new Noise(seed).next();
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#p1 = 0;
		this.#p2 = 0;
		this.#filter.reset();
		// a note starts where its parameters are, not gliding in from the last note's
		this.#ratio = axisRatio(clamp01(params[1]));
		this.control(hz, params);
		this.#index = this.#indexTarget;
		this.#mix2 = this.#mix2Target;
		this.#shape = this.#shapeTarget;
		this.#depth = this.#depthTarget;
		this.#rate = this.#rateTarget;
		this.#vibrato = this.#vibratoTarget;
		this.#cutoff = this.#cutoffTarget;
	}

	control(hz: number, params: Float32Array): void {
		const dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		this.#dt = dt;
		const tone = clamp01(params[0]);
		const tremolo = clamp01(params[3]);
		this.#ratioTarget = axisRatio(clamp01(params[1]));
		this.#shapeTarget = clamp01(params[2]) * (SHAPE_FRAMES - 1);
		// while the ratio glides down from a high step, the limits hold for where it still is
		const r = Math.max(this.#ratio, this.#ratioTarget);
		const room = (BANDWIDTH * 0.5) / dt;
		this.#indexTarget = Math.min(INDEX, indexRoom(r, room)) / (2 * Math.PI);
		// op2 fades out before its own fundamental could reach Nyquist
		const guard = Math.min(1, Math.max(0, (0.45 - r * dt) / 0.05));
		this.#mix2Target = OP2_LEVEL * Math.min(1, Math.sqrt(2 / this.#ratioTarget)) * guard;
		this.#cutoffTarget = Math.log2(TONE_LOW) + tone * Math.log2(TONE_HIGH / TONE_LOW);
		this.#depthTarget = TREMOLO_DEPTH * tremolo;
		this.#rateTarget = (TREMOLO_SLOW * Math.pow(TREMOLO_FAST / TREMOLO_SLOW, tremolo)) / this.#sr;
		this.#vibratoTarget = (VIBRATO_CENTS * tremolo * tremolo * Math.LN2) / 1200;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const table = this.#table;
		const filter = this.#filter;
		const k = this.#smooth;
		const dt = this.#dt;
		// the filter follows tone's smoothed cutoff, block by block, its resonance with it
		const settle = Math.pow(1 - k, n);
		this.#cutoff = this.#cutoffTarget + (this.#cutoff - this.#cutoffTarget) * settle;
		const dark = 1 - (this.#cutoff - Math.log2(TONE_LOW)) / Math.log2(TONE_HIGH / TONE_LOW);
		const q = Q_BRIGHT + (Q_DARK - Q_BRIGHT) * dark * dark * dark;
		filter.set(prewarp(Math.pow(2, this.#cutoff), this.#sr), 1 / q);
		// the resonant peak lifts what sits at the cutoff by about Q: meet it halfway
		const gain = LEVEL / Math.sqrt(q);
		// op1's band limit for the modulation it may have over this block
		const r = Math.max(this.#ratio, this.#ratioTarget);
		const index = 2 * Math.PI * Math.max(this.#index, this.#indexTarget);
		const limit = 0.5 / harmonicRoom(index, r, (BANDWIDTH * 0.5) / dt);
		let p1 = this.#p1;
		let p2 = this.#p2;
		let lfo = this.#lfo;
		let ratio = this.#ratio;
		let idx = this.#index;
		let mix2 = this.#mix2;
		let shape = this.#shape;
		let depth = this.#depth;
		let rate = this.#rate;
		let vibrato = this.#vibrato;
		const ratioTarget = this.#ratioTarget;
		const indexTarget = this.#indexTarget;
		const mix2Target = this.#mix2Target;
		const shapeTarget = this.#shapeTarget;
		const depthTarget = this.#depthTarget;
		const rateTarget = this.#rateTarget;
		const vibratoTarget = this.#vibratoTarget;
		for (let i = 0; i < n; i++) {
			ratio += (ratioTarget - ratio) * k;
			idx += (indexTarget - idx) * k;
			mix2 += (mix2Target - mix2) * k;
			shape += (shapeTarget - shape) * k;
			depth += (depthTarget - depth) * k;
			rate += (rateTarget - rate) * k;
			vibrato += (vibratoTarget - vibrato) * k;
			const wobble = sin2pi(lfo);
			lfo += rate;
			if (lfo >= 1) lfo -= 1;
			// vibrato a quarter cycle ahead of the tremolo: pitch and level move in turn
			const step = dt * (1 + vibrato * sin2pi(lfo + 0.25));
			const step2 = step * ratio;
			const mod = sin2pi(p2);
			const op2 = table.read(shape, p2, step2);
			const op1 = table.read(shape, p1 + idx * mod, limit);
			// op2 inverted: at ratio 0 its fundamental then adds to op1's lower sideband, which sits
			// on it in opposite phase, instead of cancelling it
			const y = filter.process(op1 - mix2 * op2) * gain * (1 - depth * (0.5 + 0.5 * wobble));
			left[i] = y;
			right[i] = y;
			p1 += step;
			if (p1 >= 1) p1 -= 1;
			p2 += step2;
			if (p2 >= 1) p2 -= Math.floor(p2);
		}
		this.#p1 = p1;
		this.#p2 = p2;
		this.#lfo = lfo;
		this.#ratio = ratio;
		this.#index = idx;
		this.#mix2 = mix2;
		this.#shape = shape;
		this.#depth = depth;
		this.#rate = rate;
		this.#vibrato = vibrato;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
