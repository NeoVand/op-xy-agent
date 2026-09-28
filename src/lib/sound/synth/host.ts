/**
 * The main thread's side of the synth core: the AudioWorklet node, and {@link WorkletVoice} — a
 * voice with the same surface as the Web Audio {@link Voice} (`../voice.ts`), so the sound engine
 * keeps deciding play modes, glides, steals and releases exactly as before while the sound itself
 * is computed in the worklet. The worklet's module is loaded by whoever creates the host (the app),
 * so this file stays importable anywhere.
 */
import { Envelope, type ParamLike } from '../envelope';
import type { VoiceModulation } from '../voice';
import {
	MOD_CHANNELS,
	PROCESSOR,
	STEAL_SECONDS,
	TRACK_OUTPUTS,
	type CoreMessage,
	type CoreReply,
	type VoiceStart
} from './protocol';

/** Records nothing: WorkletVoice uses {@link Envelope} only for its timing arithmetic. */
const NO_PARAM: ParamLike = {
	setValueAtTime: () => {},
	linearRampToValueAtTime: () => {},
	exponentialRampToValueAtTime: () => {},
	setTargetAtTime: () => {},
	cancelScheduledValues: () => {},
	cancelAndHoldAtTime: () => {}
};

/** The worklet node and the wiring around it. */
export class SynthHost {
	readonly node: AudioWorkletNode;
	readonly #context: BaseAudioContext;
	readonly #ended = new Map<number, () => void>();
	#batch: CoreMessage[] = [];
	#flushing = false;
	#nextId = 1;
	#failed = false;
	/** Each track's LFO input, and what is wired into it. */
	readonly #mods: { merger: ChannelMergerNode; wired: (AudioNode | null)[] }[];

	private constructor(context: BaseAudioContext) {
		this.#context = context;
		this.node = new AudioWorkletNode(context, PROCESSOR, {
			numberOfInputs: TRACK_OUTPUTS,
			numberOfOutputs: TRACK_OUTPUTS,
			outputChannelCount: Array.from({ length: TRACK_OUTPUTS }, () => 2),
			channelCount: MOD_CHANNELS,
			channelCountMode: 'explicit',
			channelInterpretation: 'discrete'
		});
		this.node.port.onmessage = (event: MessageEvent<CoreReply>) => {
			const done = this.#ended.get(event.data.id);
			this.#ended.delete(event.data.id);
			done?.();
		};
		// a processor that throws is silenced for good: its voices end here, and new notes go back
		// to the Web Audio voices (the engine checks `failed`)
		this.node.onprocessorerror = () => {
			this.#failed = true;
			console.error('the synth core stopped; the first engines take over');
			const ended = [...this.#ended.values()];
			this.#ended.clear();
			for (const done of ended) done();
		};
		this.#mods = Array.from({ length: TRACK_OUTPUTS }, (_, k) => {
			const merger = context.createChannelMerger(MOD_CHANNELS);
			merger.connect(this.node, 0, k);
			return { merger, wired: [null, null, null, null] };
		});
	}

	/**
	 * Loads the worklet module from `moduleUrl` and makes the node; null where the context has no
	 * AudioWorklet (or loading fails), and the Web Audio voices carry on.
	 */
	static async create(context: BaseAudioContext, moduleUrl: string): Promise<SynthHost | null> {
		if (!context.audioWorklet) return null;
		try {
			await context.audioWorklet.addModule(moduleUrl);
			return new SynthHost(context);
		} catch {
			return null;
		}
	}

	get context(): BaseAudioContext {
		return this.#context;
	}

	/** True once the processor has thrown: it makes no more sound. */
	get failed(): boolean {
		return this.#failed;
	}

	/** Sends track `k`'s sound to `destination` (its channel strip's input). */
	connect(k: number, destination: AudioNode): void {
		this.node.connect(destination, k, 0);
	}

	/** Wires track `k`'s LFO signals into the worklet (replacing what was there). */
	modulate(k: number, mod: VoiceModulation): void {
		const slot = this.#mods[k];
		if (!slot) return;
		const signals = [mod.cutoff, mod.resonance, mod.engine?.signal ?? null, mod.vibrato];
		signals.forEach((signal, channel) => {
			const old = slot.wired[channel];
			if (old === signal) return;
			if (old) {
				try {
					old.disconnect(slot.merger, 0, channel);
				} catch {
					// already gone
				}
			}
			if (signal) signal.connect(slot.merger, 0, channel);
			slot.wired[channel] = signal;
		});
	}

	/** A new voice id, and a callback for when the core says it has ended. */
	register(ended: () => void): number {
		const id = this.#nextId++;
		this.#ended.set(id, ended);
		return id;
	}

	/** Queues a message; everything queued in one task goes to the worklet together. */
	send(message: CoreMessage): void {
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

	/** Stops everything at once (sound switched off). */
	silence(): void {
		this.send({ t: 'silence' });
	}

	dispose(): void {
		this.silence();
		this.node.disconnect();
		for (const { merger } of this.#mods) merger.disconnect();
	}
}

/** How the engine knows a worklet voice: its note, the key holding it, and what played it. */
export interface WorkletVoiceMeta {
	readonly note: number;
	readonly key: string | null;
	readonly source: 'live' | 'sequence';
}

/**
 * A synth voice computed in the worklet, with the Web Audio {@link Voice}'s surface: the engine
 * tracks its gate and end the same way (the same envelope arithmetic), and each call becomes a
 * message for the core.
 */
export class WorkletVoice {
	readonly id: number;
	readonly track: number;
	readonly start: number;
	readonly source: 'live' | 'sequence';
	readonly group = false;
	note: number;
	key: string | null;
	hz: number;
	off: number;
	end: number;
	killed = false;
	onended: ((voice: WorkletVoice) => void) | null = null;
	readonly #host: SynthHost;
	readonly #amp: Envelope;
	#disposed = false;

	constructor(host: SynthHost, spec: Omit<VoiceStart, 'id'>, meta: WorkletVoiceMeta) {
		this.#host = host;
		this.id = host.register(() => this.#dispose());
		this.track = spec.track;
		this.start = spec.start;
		this.note = meta.note;
		this.key = meta.key;
		this.source = meta.source;
		this.hz = spec.hz;
		this.#amp = new Envelope(spec.start, spec.amp, { base: 0, peak: 1, curve: 'linear' });
		this.#amp.schedule(NO_PARAM, spec.gate);
		this.off = this.#amp.gate;
		this.end = this.#amp.end;
		host.send({ t: 'start', voice: { ...spec, id: this.id } });
	}

	get disposed(): boolean {
		return this.#disposed;
	}

	/** Lets go at `time`, over the release (or `seconds`). */
	release(time: number, seconds?: number): void {
		if (this.#disposed || time >= this.off) return;
		this.#amp.release(NO_PARAM, time, seconds);
		this.#times();
		this.#host.send({ t: 'release', id: this.id, time, seconds });
	}

	/** Fades out fast at `time`, releasing or not (stolen for another note). */
	kill(time: number): void {
		this.killed = true;
		if (this.#disposed) return;
		this.#host.send({ t: 'kill', id: this.id, time });
		if (time < this.off) {
			this.#amp.release(NO_PARAM, time, STEAL_SECONDS);
			this.#times();
		} else this.end = Math.min(this.end, time + 2 * STEAL_SECONDS);
	}

	/** Drops a note that has not started yet; one that has is let go. */
	cancel(time: number): void {
		if (this.#disposed) return;
		this.#host.send({ t: 'cancel', id: this.id, time });
		if (this.start < time && time < this.off) {
			this.#amp.release(NO_PARAM, time);
			this.#times();
		}
	}

	/** A legato note carries the voice on: its release moves to `gate`. */
	extend(gate: number): void {
		if (this.#disposed || gate <= this.off) return;
		this.#amp.extend(NO_PARAM, gate);
		this.#times();
		this.#host.send({ t: 'extend', id: this.id, gate });
	}

	glide(hz: number, time: number, seconds: number): void {
		this.hz = hz;
		this.#host.send({ t: 'glide', id: this.id, time, hz, seconds });
	}

	bend(cents: number, time: number): void {
		this.#host.send({ t: 'bend', id: this.id, time, cents });
	}

	/** Cutoff (Hz, key tracking included) and resonance (0–99) turned while the note sounds. */
	setFilter(hz: number, resonance: number, time: number): void {
		this.#host.send({ t: 'filter', id: this.id, time, hz, resonance });
	}

	/** M1 turned while the note sounds (0–99 each). */
	update(m1: readonly number[], time: number): void {
		this.#host.send({ t: 'm1', id: this.id, time, m1: [...m1] });
	}

	/** The track's LFO: its signals are wired per track; this voice learns which M1 it moves. */
	attach(mod: VoiceModulation): void {
		this.#host.modulate(this.track, mod);
		this.#host.send({
			t: 'lfo',
			id: this.id,
			param: mod.engine?.param ?? null,
			element: mod.element
		});
	}

	#times(): void {
		this.off = this.#amp.gate;
		this.end = this.#amp.end;
	}

	#dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		const now = this.#host.context.currentTime;
		this.off = Math.min(this.off, now);
		this.end = Math.min(this.end, now);
		this.onended?.(this);
	}
}
