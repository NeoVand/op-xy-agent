/**
 * ADSR envelopes on Web Audio parameters, with the same curve worked out in plain maths. A
 * sequenced note's length is known when it is scheduled, so its whole envelope goes on at once and
 * nothing has to be cancelled. Held notes (live keys), steals and the transport stopping release
 * from wherever the curve is: through `cancelAndHoldAtTime` where the browser has it, else by
 * setting the level the maths says the curve has reached. The attack in level (amplitude) is an RC
 * charge toward twice the peak that stops at the peak, as the owner's unit measured it
 * (docs/research/60-sound-session.md §3); in ratio (frequency) it ramps evenly. The decay falls
 * toward the base, as if heading for silence, and stops where it meets the sustain (the unit's
 * saw at sustain 32, 64 and 96 follows that within 0.1 dB, research 60 §3).
 */
import type { Adsr } from './mapping';
import { ATTACK_TARGET } from './synth/laws';

/** The part of AudioParam an envelope uses (a recording fake in tests). */
export interface ParamLike {
	setValueAtTime(value: number, time: number): unknown;
	linearRampToValueAtTime(value: number, time: number): unknown;
	exponentialRampToValueAtTime(value: number, time: number): unknown;
	setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
	cancelScheduledValues(time: number): unknown;
	cancelAndHoldAtTime?(time: number): unknown;
}

/**
 * A decay or release "time" is four time constants: a setTarget curve has covered 98% of the way
 * by then.
 */
export const TAUS_PER_TIME = 4;

/** A released voice may stop seven time constants after its gate (−61 dB). */
export const TAIL_TAUS = 7;

/** Where an envelope moves a parameter. */
export interface EnvelopeRange {
	/** Level before the note and after the release (0 for amplitude, the resting cutoff). */
	readonly base: number;
	/** Level at the top of the attack. */
	readonly peak: number;
	/** `linear` ramps the attack in level (amplitude), `exponential` in ratio (frequency). */
	readonly curve: 'linear' | 'exponential';
}

/** One note's envelope on one parameter. */
export class Envelope {
	/** When the attack starts. */
	readonly start: number;
	readonly shape: Adsr;
	readonly range: EnvelopeRange;
	/** When the note is let go (Infinity while held). */
	gate = Infinity;
	#releaseTau: number;

	constructor(start: number, shape: Adsr, range: EnvelopeRange) {
		if (range.curve === 'exponential' && !(range.base > 0 && range.peak > 0)) {
			throw new RangeError('an exponential envelope needs positive levels');
		}
		this.start = start;
		this.shape = shape;
		this.range = range;
		this.#releaseTau = shape.release / TAUS_PER_TIME;
	}

	/** The level the decay settles on. */
	get sustainLevel(): number {
		const { base, peak, curve } = this.range;
		const s = this.shape.sustain;
		return curve === 'linear' ? base + (peak - base) * s : base * Math.pow(peak / base, s);
	}

	/** When the curve has faded out (and the voice may stop). */
	get end(): number {
		return this.gate + TAIL_TAUS * this.#releaseTau;
	}

	/** The level at `time`: exactly the curve the scheduled parameter follows. */
	valueAt(time: number): number {
		if (time <= this.start) return this.range.base;
		if (time <= this.gate) return this.#held(time);
		const { base } = this.range;
		return base + (this.#held(this.gate) - base) * Math.exp(-(time - this.gate) / this.#releaseTau);
	}

	/** The curve as if the key were never let go. */
	#held(time: number): number {
		const { base, peak, curve } = this.range;
		const t = time - this.start;
		const { attack } = this.shape;
		if (t < attack) {
			if (curve === 'exponential') return base * Math.pow(peak / base, t / attack);
			return base + (peak - base) * ATTACK_TARGET * (1 - Math.exp((-t * Math.LN2) / attack));
		}
		if (t >= attack + this.#decayLength) return this.sustainLevel;
		return base + (peak - base) * Math.exp(-(t - attack) / this.#decayTau);
	}

	get #decayTau(): number {
		return this.shape.decay / TAUS_PER_TIME;
	}

	/** How long the decay falls before it meets the sustain (Infinity at sustain 0). */
	get #decayLength(): number {
		const { base, peak } = this.range;
		const over = (this.sustainLevel - base) / (peak - base);
		if (over >= 1) return 0;
		if (over <= 0) return Infinity;
		return -this.#decayTau * Math.log(over);
	}

	/** The decay from the top of the attack: toward the base, held at the sustain where it meets it. */
	#decay(param: ParamLike, top: number): void {
		const meets = top + this.#decayLength;
		if (meets <= top) {
			param.setValueAtTime(this.sustainLevel, top);
			return;
		}
		param.setTargetAtTime(this.range.base, top, this.#decayTau);
		if (Number.isFinite(meets) && meets < this.gate) param.setValueAtTime(this.sustainLevel, meets);
	}

	/** The attack from the start up to `until` (the peak, or a gate that cuts it short). */
	#attack(param: ParamLike, until: number): void {
		const { base, peak, curve } = this.range;
		if (curve === 'exponential') {
			param.exponentialRampToValueAtTime(this.#held(until), until);
			return;
		}
		const attack = this.shape.attack;
		if (attack > 0) {
			param.setTargetAtTime(base + (peak - base) * ATTACK_TARGET, this.start, attack / Math.LN2);
		}
		// the charge has reached the peak (or the gate's level) by then: pin it there
		param.setValueAtTime(until >= this.start + attack ? peak : this.#held(until), until);
	}

	/** Puts the curve on `param`: attack, decay and sustain, and the release when the gate is known. */
	schedule(param: ParamLike, gate = Infinity): void {
		this.gate = Math.max(gate, this.start);
		const { base } = this.range;
		const top = this.start + this.shape.attack;
		param.setValueAtTime(base, this.start);
		if (this.gate < top) {
			// let go during the attack: only as far as it gets, then release
			this.#attack(param, this.gate);
			param.setTargetAtTime(base, this.gate, this.#releaseTau);
			return;
		}
		this.#attack(param, top);
		this.#decay(param, top);
		if (Number.isFinite(this.gate)) param.setTargetAtTime(base, this.gate, this.#releaseTau);
	}

	/**
	 * Lets go at `at`, over `seconds` (default: the envelope's release; a stolen voice goes faster).
	 * Nothing happens when the note is already let go by then.
	 */
	release(param: ParamLike, at: number, seconds = this.shape.release): void {
		const time = Math.max(at, this.start);
		if (time >= this.gate) return;
		const level = this.valueAt(time);
		if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
		else {
			param.cancelScheduledValues(time);
			param.setValueAtTime(level, time);
		}
		this.gate = time;
		this.#releaseTau = Math.max(seconds, 0.001) / TAUS_PER_TIME;
		param.setTargetAtTime(this.range.base, time, this.#releaseTau);
	}

	/** Moves a scheduled release later: a legato note carries the voice on to its own end. */
	extend(param: ParamLike, gate: number): void {
		if (gate <= this.gate) return;
		if (this.gate < this.start + this.shape.attack) {
			// the old release cut the attack short: lay the curve down again
			param.cancelScheduledValues(this.start);
			this.schedule(param, gate);
			return;
		}
		param.cancelScheduledValues(this.gate);
		// the decay may have been due to meet the sustain after the old release: hold it there again
		const meets = this.start + this.shape.attack + this.#decayLength;
		if (Number.isFinite(meets) && meets >= this.gate && meets < gate) {
			param.setValueAtTime(this.sustainLevel, meets);
		}
		this.gate = gate;
		if (Number.isFinite(gate)) param.setTargetAtTime(this.range.base, gate, this.#releaseTau);
	}
}
