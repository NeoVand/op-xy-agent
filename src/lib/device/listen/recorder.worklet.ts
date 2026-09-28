/**
 * The listening recorder as an AudioWorklet processor (`opxy-recorder`): it copies what reaches its
 * input into chunks of CHUNK_FRAMES frames per channel and posts them to the main thread (the
 * buffers are transferred, not copied) with each chunk's peak, until it has the frames it was
 * asked for. The node's options make every input stereo (a mono source is heard in both channels);
 * with nothing connected it records silence. Its output stays silent.
 */
import { CHUNK_FRAMES, RECORDER, type RecorderCommand, type RecorderReply } from './protocol';

// the AudioWorklet global scope, which TypeScript's DOM library does not describe
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class Recorder extends AudioWorkletProcessor {
	#remaining = 0;
	#recorded = 0;
	#chunk: [Float32Array, Float32Array] | null = null;
	#filled = 0;
	#peak = 0;
	#finished = false;

	constructor() {
		super();
		this.port.onmessage = (event: MessageEvent<RecorderCommand>) => {
			const command = event.data;
			if (command.type === 'start') {
				this.#remaining = Math.max(0, Math.floor(command.frames));
				if (this.#remaining === 0) this.#finish();
			} else {
				this.#finish();
			}
		};
	}

	process(inputs: Float32Array[][]): boolean {
		if (this.#finished) return false;
		if (this.#remaining <= 0) return true;
		const input = inputs[0] ?? [];
		const quantum = input[0]?.length ?? 128;
		const n = Math.min(quantum, this.#remaining);
		let offset = 0;
		while (offset < n) {
			this.#chunk ??= [new Float32Array(CHUNK_FRAMES), new Float32Array(CHUNK_FRAMES)];
			const take = Math.min(n - offset, CHUNK_FRAMES - this.#filled);
			for (let c = 0; c < 2; c++) {
				const source = input[Math.min(c, input.length - 1)];
				if (!source) continue;
				const target = this.#chunk[c];
				for (let i = 0; i < take; i++) {
					const v = source[offset + i];
					target[this.#filled + i] = v;
					const a = v < 0 ? -v : v;
					if (a > this.#peak) this.#peak = a;
				}
			}
			this.#filled += take;
			offset += take;
			if (this.#filled === CHUNK_FRAMES) this.#flush();
		}
		this.#remaining -= n;
		this.#recorded += n;
		if (this.#remaining <= 0) {
			this.#finish();
			return false;
		}
		return true;
	}

	/** Posts the chunk being filled (trimmed to what it holds). */
	#flush(): void {
		const chunk = this.#chunk;
		if (!chunk || this.#filled === 0) return;
		const channels =
			this.#filled === CHUNK_FRAMES ? chunk : chunk.map((c) => c.slice(0, this.#filled));
		const reply: RecorderReply = { type: 'chunk', channels, peak: this.#peak };
		this.port.postMessage(
			reply,
			channels.map((c) => c.buffer)
		);
		this.#chunk = null;
		this.#filled = 0;
		this.#peak = 0;
	}

	#finish(): void {
		if (this.#finished) return;
		this.#flush();
		this.#finished = true;
		this.#remaining = 0;
		const reply: RecorderReply = { type: 'done', frames: this.#recorded };
		this.port.postMessage(reply);
	}
}

registerProcessor(RECORDER, Recorder);
