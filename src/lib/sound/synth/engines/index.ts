/**
 * The synth engines (M1) as the core plays them: each engine makes a voice's raw sound, in stereo,
 * from its four parameters; the core adds the filter, envelopes and everything else every engine
 * shares. One module per engine; `docs/research/57-synth-engines.md` says what each is modelled on.
 */
import type { EngineId } from '$lib/core/opxy';
import { ShapeOscillator, type ShapeMix } from '../oscillators';
import { AxisVoice } from './axis';
import { EpianoVoice } from './epiano';
import { OrganVoice } from './organ';
import { WavetableVoice } from './wavetable';

/** One note's engine. */
export interface EngineVoice {
	/** The note begins at `hz` with `velocity` (1–127) and M1 `params` (0–1 each). */
	start(hz: number, velocity: number, params: Float32Array): void;
	/** A control update: the pitch now (glide, bend and vibrato included) and M1 (LFO included). */
	control(hz: number, params: Float32Array): void;
	/** The next `n` samples, written (not added) into `left` and `right`. */
	render(left: Float32Array, right: Float32Array, n: number): void;
}

/** Until an engine has its own model: a plain band-limited saw. */
class Placeholder implements EngineVoice {
	readonly #osc = new ShapeOscillator();
	readonly #mix: ShapeMix = { sine: 0, triangle: 0, saw: 0.5, pulse: 0, width: 0.5 };
	#dt = 0;

	constructor(readonly sampleRate: number) {}

	start(hz: number): void {
		this.#dt = hz / this.sampleRate;
	}

	control(hz: number): void {
		this.#dt = hz / this.sampleRate;
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		for (let i = 0; i < n; i++) left[i] = right[i] = this.#osc.next(this.#dt, this.#mix);
	}
}

/** A new voice of `engine`; `seed` makes its randomness (drift, noise) differ note by note. */
export function createEngine(engine: EngineId, sampleRate: number, seed: number): EngineVoice {
	switch (engine) {
		case 'axis':
			return new AxisVoice(sampleRate, seed);
		case 'epiano':
			return new EpianoVoice(sampleRate);
		case 'organ':
			return new OrganVoice(sampleRate);
		case 'wavetable':
			return new WavetableVoice(sampleRate);
		default:
			return new Placeholder(sampleRate);
	}
}
