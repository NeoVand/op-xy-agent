/**
 * The synth core as an AudioWorklet processor (`opxy-synth`): eight stereo outputs, one per
 * instrument track, and eight four-channel inputs carrying each track's LFO. Messages arrive from
 * `host.ts` in batches; the core answers when a voice has ended.
 */
import { PROCESSOR, SynthCore, type CoreMessage } from './core';

// the AudioWorklet global scope, which TypeScript's DOM library does not describe
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class SynthProcessor extends AudioWorkletProcessor {
	readonly #core: SynthCore;

	constructor() {
		super();
		this.#core = new SynthCore(sampleRate, (reply) => this.port.postMessage(reply));
		this.port.onmessage = (event: MessageEvent<readonly CoreMessage[]>) => {
			for (const message of event.data) this.#core.post(message);
		};
	}

	process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		for (const output of outputs) for (const channel of output) channel.fill(0);
		const n = outputs[0]?.[0]?.length ?? 128;
		this.#core.process(currentFrame, outputs, inputs, n);
		return true;
	}
}

registerProcessor(PROCESSOR, SynthProcessor);
