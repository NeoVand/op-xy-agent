/**
 * The main thread's side of the punch-in processor: the AudioWorklet node (one stereo input and
 * output per instrument track, `worklet.ts`), and the messages that switch its effects on and off at
 * audio times. Whoever creates it loads the worklet's module (the app); this file stays importable
 * anywhere.
 */
import type { CoreEffect } from './core';
import { PUNCH_PROCESSOR, PUNCH_TRACKS, type PunchMessage } from './protocol';

/** The punch-in processor's node. */
export class PunchHost {
	readonly node: AudioWorkletNode;
	readonly #context: BaseAudioContext;
	#batch: PunchMessage[] = [];
	#flushing = false;
	#failed = false;

	private constructor(context: BaseAudioContext) {
		this.#context = context;
		this.node = new AudioWorkletNode(context, PUNCH_PROCESSOR, {
			numberOfInputs: PUNCH_TRACKS,
			numberOfOutputs: PUNCH_TRACKS,
			outputChannelCount: Array.from({ length: PUNCH_TRACKS }, () => 2),
			channelCount: 2,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		// a processor that throws outputs silence from then on: the engine takes the channels back
		this.node.onprocessorerror = () => {
			this.#failed = true;
			console.error('the punch-in processor stopped');
		};
	}

	/**
	 * Loads the worklet module from `moduleUrl` and makes the node; null where the context has no
	 * AudioWorklet (or loading fails): the effects on notes still work, the ones on sound do not.
	 */
	static async create(context: BaseAudioContext, moduleUrl: string): Promise<PunchHost | null> {
		if (!context.audioWorklet) return null;
		try {
			await context.audioWorklet.addModule(moduleUrl);
			return new PunchHost(context);
		} catch {
			return null;
		}
	}

	get context(): BaseAudioContext {
		return this.#context;
	}

	/** True once the processor has thrown. */
	get failed(): boolean {
		return this.#failed;
	}

	/** An effect on track `track` from `from` to `to` (audio time; Infinity while held). */
	add(track: number, id: number, effect: CoreEffect, from: number, to: number): void {
		this.#send({ t: 'add', track, id, effect, from: this.#frame(from), to: this.#frame(to) });
	}

	/** Ends effect `id` on track `track` at `at` (audio time). */
	end(track: number, id: number, at: number): void {
		this.#send({ t: 'end', track, id, at: this.#frame(at) });
	}

	/** From `at` on, the sixteenths start at `origin` and last `step` seconds (the tempo's grid). */
	grid(at: number, origin: number, step: number): void {
		const rate = this.#context.sampleRate;
		this.#send({ t: 'grid', at: this.#frame(at), origin: origin * rate, step: step * rate });
	}

	/** Every effect stops. */
	clear(): void {
		this.#send({ t: 'clear' });
	}

	dispose(): void {
		this.clear();
		this.node.disconnect();
	}

	#frame(time: number): number {
		return time === Infinity ? Infinity : Math.round(time * this.#context.sampleRate);
	}

	/** Queues a message; everything queued in one task goes to the worklet together. */
	#send(message: PunchMessage): void {
		this.#batch.push(message);
		if (this.#flushing) return;
		this.#flushing = true;
		queueMicrotask(() => {
			this.#flushing = false;
			const batch = this.#batch;
			this.#batch = [];
			this.node.port.postMessage(batch);
		});
	}
}
