/**
 * The punch-in processor as an AudioWorklet (`opxy-punch`): eight stereo inputs and outputs, one per
 * instrument track's channel, each through its own {@link PunchCore}. Messages arrive from
 * `host.ts` in batches.
 */
import { PunchCore } from './core';
import { PUNCH_PROCESSOR, PUNCH_TRACKS, type PunchMessage } from './protocol';

// the AudioWorklet global scope, which TypeScript's DOM library does not describe
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class PunchProcessor extends AudioWorkletProcessor {
	readonly #cores: PunchCore[];
	#silence = new Float32Array(128);

	constructor() {
		super();
		this.#cores = Array.from({ length: PUNCH_TRACKS }, () => new PunchCore(sampleRate));
		this.port.onmessage = (event: MessageEvent<readonly PunchMessage[]>) => {
			for (const m of event.data) this.#take(m);
		};
	}

	#take(m: PunchMessage): void {
		switch (m.t) {
			case 'add':
				this.#cores[m.track]?.add({ id: m.id, effect: m.effect, from: m.from, to: m.to });
				return;
			case 'end':
				this.#cores[m.track]?.end(m.id, m.at);
				return;
			case 'grid':
				for (const core of this.#cores) core.setGrid(m.at, { origin: m.origin, step: m.step });
				return;
			case 'clear':
				for (const core of this.#cores) core.clear();
		}
	}

	process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		for (let k = 0; k < PUNCH_TRACKS; k++) {
			const output = outputs[k];
			if (!output || output.length === 0) continue;
			const n = output[0].length;
			if (this.#silence.length < n) this.#silence = new Float32Array(n);
			const input = inputs[k] ?? [];
			// an unconnected input has no channels; a mono one feeds both sides
			const inL = input[0] ?? this.#silence;
			const inR = input[1] ?? inL;
			const outL = output[0];
			const outR = output[1] ?? output[0];
			this.#cores[k].process(inL, inR, outL, outR, currentFrame, n);
		}
		return true;
	}
}

registerProcessor(PUNCH_PROCESSOR, PunchProcessor);
