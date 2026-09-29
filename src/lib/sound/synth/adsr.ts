/**
 * The amp and filter envelopes, one sample at a time: the same curve as the Web Audio voices'
 * (`../envelope.ts`), as the owner's unit measured it (docs/research/60-sound-session.md §3): the
 * attack an RC charge toward twice the peak that stops at the peak, then decay and release falling
 * exponentially over four time constants per "time", a decay to 0 cutting out at about −41 dB. The
 * decay falls as if toward silence and stops where it meets the sustain, not easing into it (the
 * unit's saw at sustain 32, 64 and 96 within 0.1 dB). A restarted envelope attacks from where it is,
 * so nothing clicks.
 *
 * Times arrive in seconds, on the measured laws (`envelopeSeconds` in `../mapping.ts`).
 */

import { TAUS_PER_TIME } from '../envelope';
import { ATTACK_TARGET, DECAY_CUT } from './laws';
import type { AdsrSettings } from './protocol';

export type { AdsrSettings };

/** Envelope stages. */
export type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

export class Adsr {
	stage: Stage = 'idle';
	value = 0;
	#attackCoef = 1;
	#decayCoef = 0;
	#releaseCoef = 0;
	#sustain = 1;
	readonly #sampleRate: number;

	constructor(sampleRate: number, settings?: AdsrSettings) {
		this.#sampleRate = sampleRate;
		if (settings) this.set(settings);
	}

	/** New times and sustain; a stage under way continues at the new rate. */
	set({ attack, decay, sustain, release }: AdsrSettings): void {
		const sr = this.#sampleRate;
		// the charge reaches the peak, half way to its target, after `attack` seconds
		this.#attackCoef = 1 - Math.exp(-Math.LN2 / Math.max(1, attack * sr));
		this.#decayCoef = 1 - Math.exp(-TAUS_PER_TIME / Math.max(1, decay * sr));
		this.#releaseCoef = 1 - Math.exp(-TAUS_PER_TIME / Math.max(1, release * sr));
		this.#sustain = Math.min(Math.max(sustain, 0), 1);
	}

	/** A new release time, for a release under way or to come (a stolen voice fades fast). */
	setRelease(seconds: number): void {
		this.#releaseCoef = 1 - Math.exp(-TAUS_PER_TIME / Math.max(1, seconds * this.#sampleRate));
	}

	/** Starts (or restarts, from the present level) the attack. */
	gateOn(): void {
		this.stage = 'attack';
	}

	/** Lets go: the release runs from the present level. */
	gateOff(): void {
		if (this.stage !== 'idle') this.stage = 'release';
	}

	/** Silences at once (a stolen voice after its fade). */
	reset(): void {
		this.stage = 'idle';
		this.value = 0;
	}

	/** Whether the envelope still makes anything (not idle). */
	get active(): boolean {
		return this.stage !== 'idle';
	}

	/** The next sample's level. */
	next(): number {
		switch (this.stage) {
			case 'attack':
				this.value += (ATTACK_TARGET - this.value) * this.#attackCoef;
				if (this.value >= 1) {
					this.value = 1;
					this.stage = 'decay';
				}
				break;
			case 'decay':
				if (this.value <= this.#sustain) {
					// a sustain raised above the decay: the sustain stage glides up to it
					this.stage = 'sustain';
					break;
				}
				// toward silence, held where it meets the sustain
				this.value -= this.value * this.#decayCoef;
				if (this.#sustain === 0 && this.value < DECAY_CUT) {
					this.value = 0;
					this.stage = 'sustain';
				} else if (this.value <= this.#sustain) {
					this.value = this.#sustain;
					this.stage = 'sustain';
				}
				break;
			case 'sustain':
				// a sustain turned while the note holds glides there at the decay's pace
				this.value += (this.#sustain - this.value) * this.#decayCoef;
				break;
			case 'release':
				this.value -= this.value * this.#releaseCoef;
				// −66 dB, where the owner's unit ends a release (about 11 half-lives, research 60 §3)
				if (this.value < 5e-4) this.reset();
				break;
		}
		return this.value;
	}
}
