/**
 * dissolve: two sine carriers, a pure sine when everything is at zero, that noise eats away:
 * swarm wobbles their pitch and adds a band of noise around the note, AM and FM work at audio rate,
 * and detune spreads the two apart. Evidence and open questions:
 * `docs/research/57-synth-engines.md`, §3 (dissolve).
 *
 * Established [E]:
 * - all at zero is a pure sine;
 * - two sine carriers, spread by detune up to a little under a semitone;
 * - swarm brings in filtered noise and a soft random pitch wobble;
 * - AM and FM work at audio rate and brighten it: AM adds grit and highs, FM turns it saw-like, and
 *   FM 100 with detune makes a Reese-like bass;
 * - factory presets keep FM mostly within 30–90 and swarm at 37 or below.
 *
 * Our model [I]:
 * - carriers at note × 2^(±d/2400), with d up to {@link DETUNE_CENTS} on a squared curve;
 * - swarm s gives each carrier its own smooth random wobble, s × {@link WOBBLE_CENTS} deep at
 *   1 + {@link WOBBLE_RATE}·s hertz, and adds noise band-passed around the note (Q
 *   {@link SWARM_Q}) at {@link SWARM_NOISE} × s²;
 * - FM phase-modulates each carrier by a sine at its own frequency (1:1), index up to
 *   {@link FM_INDEX} × fm². The modulator runs a quarter cycle ahead (a cosine): that gives the
 *   saw-like 1 : ⅔ : ⅓ series at moderate index, where a sine-phase one hollows out the
 *   fundamental. Swarm also jitters the modulator's phase and depth, so the timbre dissolves as
 *   the pitch wobbles; with swarm at 0 FM stays periodic;
 * - a cosine-phase 1:1 modulator puts DC in the carrier, J₁(index)·sin(phase offset); it is
 *   subtracted exactly, so notes start without a thump;
 * - AM multiplies by 1 + a·m, with m narrow-band noise centred on the note (Q {@link AM_Q}),
 *   normalized and soft-limited to ±1, and divided by 1 + a·{@link AM_DEPTH}/2 so peaks stay put;
 * - the output is the carriers' average plus the noise, centred (mono);
 * - its peaks run far above its average: drifting apart (swarm, detune) halves the carriers'
 *   power, yet they still meet in phase now and then; with its DC removed, an FM carrier swings
 *   to 1 + J₁; AM by noise adds its own crest. Pitched for the target level, those rare
 *   coincidences ease into the soft ceiling of `guard.ts` instead of passing ±1.2.
 */
import { Svf, prewarp, softClip } from '../filters';
import { Noise, Wander } from '../noise';
import { ceiling } from './guard';
import type { EngineVoice } from './index';
import { Ramp, Smoothing } from './ramp';

// Calibration [I]: starting values, awaiting measurement on the owner's device (57 §6).
/** The carriers' spread at detune 1, in cents (squared curve). */
export const DETUNE_CENTS = 90;
/** Each carrier's pitch wobble at swarm 1, in cents. */
export const WOBBLE_CENTS = 30;
/** The wobble's rate is 1 + WOBBLE_RATE·swarm, in hertz. */
export const WOBBLE_RATE = 15;
/** Band-passed noise at swarm 1, as a peak level against the carriers' ±1. */
export const SWARM_NOISE = 0.5;
/** The swarm noise band's Q. */
export const SWARM_Q = 2;
/** FM index (radians of phase) at fm 1. */
export const FM_INDEX = 3;
/** How far swarm 1 jitters the modulator's phase (cycles) and its depth (fraction of the index). */
export const FM_PHASE_JITTER = 0.15;
export const FM_DEPTH_JITTER = 0.4;
/** AM depth at am 1: the gain swings 1 ± AM_DEPTH. */
export const AM_DEPTH = 1;
/** The AM noise band's Q. */
export const AM_Q = 8;
/**
 * Output level: RMS ≈ 0.23 at the default M1 (swarm 49, am 52, fm 90, detune 0). Pure FM (swarm and
 * AM at 0) is louder, its carriers in phase; its DC-free peak, 1 + J₁ ≤ 1.58, reaches only 7 %
 * past the ceiling's knee, so a periodic tone passes all but untouched.
 */
export const LEVEL = 0.68;

const TAU = 2 * Math.PI;
/** The highest carrier rate (cycles a sample). */
const TOP = 0.45;
/** RMS of the uniform white noise the bands filter. */
const WHITE_RMS = 1 / Math.sqrt(3);

/** J₁(x) by its power series (x here is an FM index, at most about 5). */
export function besselJ1(x: number): number {
	const h = x / 2;
	const h2 = h * h;
	let term = h;
	let sum = h;
	for (let m = 1; m < 40 && Math.abs(term) > 1e-12; m++) {
		term *= -h2 / (m * (m + 1));
		sum += term;
	}
	return sum;
}

/**
 * What makes white noise band-passed by an SVF (band output, Q `q`) at `hz` unit RMS: the band
 * output's power is σ²·π·hz·Q/sampleRate for white noise of power σ².
 */
function bandNorm(hz: number, q: number, sampleRate: number): number {
	return 1 / (WHITE_RMS * Math.sqrt((Math.PI * hz * q) / sampleRate));
}

/** One carrier with its FM modulator and its own randomness. */
class Carrier {
	phase = 0;
	dt = 0;
	/** FM index (radians) and the modulator's lead over the carrier (cycles). */
	readonly index = new Ramp();
	readonly lead = new Ramp(0.25);
	/** The DC the modulation puts in, at the end of the current block and before it. */
	dc = 0;
	dcFrom = 0;
	readonly wobble: Wander;
	readonly phaseJitter: Wander;
	readonly depthJitter: Wander;

	constructor(seed: number) {
		this.wobble = new Wander(seed);
		this.phaseJitter = new Wander(seed + 1);
		this.depthJitter = new Wander(seed + 2);
	}

	/** Goes straight to the current targets, DC included (a note's start). */
	settle(): void {
		this.index.jump(this.index.target);
		this.lead.jump(this.lead.target);
		this.dc = this.dcFrom = besselJ1(this.index.value) * Math.sin(TAU * this.lead.value);
	}
}

export class DissolveVoice implements EngineVoice {
	readonly #sampleRate: number;
	readonly #smoothing: Smoothing;
	readonly #noise: Noise;
	readonly #one: Carrier;
	readonly #two: Carrier;
	readonly #swarmBand = new Svf();
	readonly #amBand = new Svf();
	readonly #swarmLevel = new Ramp();
	readonly #am = new Ramp();
	/** The pitch and M1 of the last control update, used by the next block. */
	#hz = 0;
	readonly #params = new Float32Array(4);
	#swarmNorm = 1;
	#amNorm = 1;

	constructor(sampleRate: number, seed: number) {
		this.#sampleRate = sampleRate;
		this.#smoothing = new Smoothing(sampleRate);
		this.#noise = new Noise(seed);
		// distinct, reproducible streams for every random source of the voice
		this.#one = new Carrier(seed * 8 + 1);
		this.#two = new Carrier(seed * 8 + 5);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.control(hz, params);
		this.#one.phase = this.#two.phase = 0;
		this.#swarmBand.reset();
		this.#amBand.reset();
		// the note begins at its own settings: nothing glides in
		this.#update(0);
		this.#one.settle();
		this.#two.settle();
		this.#swarmLevel.jump(this.#swarmLevel.target);
		this.#am.jump(this.#am.target);
	}

	control(hz: number, params: Float32Array): void {
		this.#hz = hz;
		this.#params.set(params);
	}

	/** Per block (`seconds` long): the randomness moves on, and rates and targets follow. */
	#update(seconds: number): void {
		const params = this.#params;
		const swarm = params[0];
		const fm = params[2];
		const detune = params[3];
		const hz = this.#hz;
		const sr = this.#sampleRate;
		const spread = (DETUNE_CENTS * detune * detune) / 2;
		const index = FM_INDEX * fm * fm;
		this.#carrier(this.#one, -spread, index, swarm, seconds);
		this.#carrier(this.#two, spread, index, swarm, seconds);
		this.#swarmLevel.target = SWARM_NOISE * swarm * swarm;
		this.#am.target = params[1] * AM_DEPTH;
		const g = prewarp(hz, sr);
		this.#swarmBand.set(g, 1 / SWARM_Q);
		this.#amBand.set(g, 1 / AM_Q);
		this.#swarmNorm = bandNorm(hz, SWARM_Q, sr);
		this.#amNorm = bandNorm(hz, AM_Q, sr);
	}

	/** One carrier's rate and FM targets: `cents` of detune, and the swarm's wobble and jitter. */
	#carrier(c: Carrier, cents: number, index: number, swarm: number, seconds: number): void {
		const rate = 1 + WOBBLE_RATE * swarm;
		const wobble = swarm * WOBBLE_CENTS * c.wobble.next(seconds, rate);
		c.dt = Math.min((this.#hz / this.#sampleRate) * Math.pow(2, (cents + wobble) / 1200), TOP);
		c.index.target = index * (1 + swarm * FM_DEPTH_JITTER * c.depthJitter.next(seconds, rate));
		c.lead.target = 0.25 + swarm * FM_PHASE_JITTER * c.phaseJitter.next(seconds, rate);
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		this.#update(n / this.#sampleRate);
		const c = this.#smoothing.coef(n);
		const one = this.#one;
		const two = this.#two;
		let i1 = one.index.advance(c, n);
		let i2 = two.index.advance(c, n);
		let lead1 = one.lead.advance(c, n);
		let lead2 = two.lead.advance(c, n);
		const di1 = one.index.step;
		const di2 = two.index.step;
		const dLead1 = one.lead.step;
		const dLead2 = two.lead.step;
		// the DC to take off, exact at each block's end and linear across it
		one.dcFrom = one.dc;
		two.dcFrom = two.dc;
		one.dc = besselJ1(one.index.value) * Math.sin(TAU * one.lead.value);
		two.dc = besselJ1(two.index.value) * Math.sin(TAU * two.lead.value);
		let dc1 = one.dcFrom;
		let dc2 = two.dcFrom;
		const dDc1 = (one.dc - dc1) / n;
		const dDc2 = (two.dc - dc2) / n;
		const fm = !(one.index.idle && two.index.idle);

		let swarm = this.#swarmLevel.advance(c, n);
		let am = this.#am.advance(c, n);
		const dSwarm = this.#swarmLevel.step;
		const dAm = this.#am.step;
		// each band runs only while its level is up
		const withSwarm = !this.#swarmLevel.idle;
		const withAm = !this.#am.idle;
		// AM's peak-keeping 1 / (1 + am/2), exact at the block's ends and linear across it
		let keep = 1 / (1 + 0.5 * am);
		const dKeep = (1 / (1 + 0.5 * this.#am.value) - keep) / n;
		const swarmNorm = this.#swarmNorm;
		const amNorm = this.#amNorm;
		const white = this.#noise;
		const swarmBand = this.#swarmBand;
		const amBand = this.#amBand;

		let p1 = one.phase;
		let p2 = two.phase;
		const dt1 = one.dt;
		const dt2 = two.dt;
		for (let i = 0; i < n; i++) {
			p1 += dt1;
			if (p1 >= 1) p1 -= 1;
			p2 += dt2;
			if (p2 >= 1) p2 -= 1;
			let y: number;
			if (fm) {
				i1 += di1;
				i2 += di2;
				lead1 += dLead1;
				lead2 += dLead2;
				dc1 += dDc1;
				dc2 += dDc2;
				const c1 = Math.sin(TAU * p1 + i1 * Math.sin(TAU * (p1 + lead1))) - dc1;
				const c2 = Math.sin(TAU * p2 + i2 * Math.sin(TAU * (p2 + lead2))) - dc2;
				y = 0.5 * (c1 + c2);
			} else {
				y = 0.5 * (Math.sin(TAU * p1) + Math.sin(TAU * p2));
			}
			if (withAm || withSwarm) {
				const w = white.next();
				if (withAm) {
					am += dAm;
					keep += dKeep;
					amBand.process(w);
					y *= (1 + am * softClip(amBand.band * amNorm)) * keep;
				}
				if (withSwarm) {
					swarm += dSwarm;
					swarmBand.process(w);
					y += swarm * softClip(swarmBand.band * swarmNorm);
				}
			}
			left[i] = right[i] = ceiling(LEVEL * y);
		}
		one.phase = p1;
		two.phase = p2;
	}
}
