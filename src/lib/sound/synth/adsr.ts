/**
 * The amp and filter envelopes, one sample at a time: the same curve as the Web Audio voices'
 * (`../envelope.ts`): a linear attack, then decay and release falling exponentially over four time
 * constants per "time", as TE's envelope art shows. A restarted envelope attacks from where it is,
 * so nothing clicks.
 *
 * Times follow the community's measurement of the OP-XY's attack (op-forums t/31132, two fits
 * agreeing): exponential in the encoder, about 2 s at 50 and minutes at 99. We assume decay and
 * release follow the same law until the owner's device is measured (docs/research/57-synth-engines.md).
 */

import { TAUS_PER_TIME } from '../envelope';
import type { AdsrSettings } from './protocol';

export type { AdsrSettings };

/** Envelope stages. */
export type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

/**
 * Seconds for an envelope encoder value 0–99: 0.0111·(e^(10.386·x) − 1) + 1 ms, x = value/99 (the
 * measured law, with a 1 ms floor at 0 where the fit overestimates).
 */
export function envelopeTime(value: number): number {
	const x = Math.min(Math.max(value, 0), 99) / 99;
	return 0.0111 * (Math.exp(10.386 * x) - 1) + 0.001;
}

export class Adsr {
	stage: Stage = 'idle';
	value = 0;
	#attackStep = 1;
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
		this.#attackStep = 1 / Math.max(1, attack * sr);
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
				this.value += this.#attackStep;
				if (this.value >= 1) {
					this.value = 1;
					this.stage = 'decay';
				}
				break;
			case 'decay':
				this.value += (this.#sustain - this.value) * this.#decayCoef;
				if (Math.abs(this.value - this.#sustain) < 1e-5) {
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
				// −80 dB: past the Web Audio voices' −61 dB stop, well below hearing
				if (this.value < 1e-4) this.reset();
				break;
		}
		return this.value;
	}
}
