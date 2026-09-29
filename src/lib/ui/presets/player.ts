/**
 * The preset maker's preview player: every key heard as the OP-XY will play it, in Web Audio. A
 * sound is rendered with its edit (`renderEdit` with `preview`: fades, region, reverse and the
 * loop's crossfade written in), cached per sound object, and played at the key's pitch, level and
 * pan, looping as its loop mode says: forever (fading out on release), until release (then on to
 * the end), or once. Drum keys play one-shot, while held (gate), choking each other (the kit's one
 * mute group) or looped. The context starts on the first gesture (`unlock`), as browsers ask.
 */
import { renderEdit, type RenderedSound, type SoundEdit } from '$lib/core/presets';

/** A sound as the player takes it. */
export interface Playable {
	readonly audio: RenderedSound['audio'];
	readonly edit: SoundEdit;
}

/** How to play one note. */
export interface PlayOptions {
	/** Semitones from the sound's own pitch (a drum key's transpose, a zone's distance to its root). */
	readonly semitones: number;
	/** Drum keys play by their play mode; the samplers loop by their loop mode. */
	readonly drum: boolean;
	/** 0–1. */
	readonly velocity?: number;
	/** Context time to start (default now). */
	readonly when?: number;
	/** Hold for this long, then release (the beat's notes); default until `release`. */
	readonly hold?: number;
}

interface Sounding {
	readonly source: AudioBufferSourceNode;
	readonly gain: GainNode;
	readonly drum: boolean;
	readonly edit: SoundEdit;
	ended: boolean;
}

/** The release of a sampler note let go (s): about what the preset's amp release gives. */
const RELEASE = 0.25;

export class PreviewPlayer {
	#context: AudioContext | null = null;
	#out: GainNode | null = null;
	#rendered = new WeakMap<object, { rendered: RenderedSound; buffer: AudioBuffer }>();
	#sounding = new Map<string, Sounding>();
	readonly #create: () => AudioContext;

	constructor(create: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' })) {
		this.#create = create;
	}

	/** The context, once a gesture has started it. */
	get context(): AudioContext | null {
		return this.#context;
	}

	/** Starts (or resumes) audio. Call it from a gesture: a click, a key, a drop. */
	unlock(): AudioContext | null {
		try {
			if (!this.#context) {
				this.#context = this.#create();
				this.#out = this.#context.createGain();
				this.#out.gain.value = 0.8;
				// a beat stacks voices: a gentle compressor keeps their sum from clipping
				const glue = this.#context.createDynamicsCompressor();
				glue.threshold.value = -8;
				glue.knee.value = 6;
				glue.ratio.value = 4;
				glue.attack.value = 0.003;
				glue.release.value = 0.12;
				this.#out.connect(glue).connect(this.#context.destination);
			}
			// a context that may not resume yet (no gesture, or an offline one) stays as it is
			if (this.#context.state === 'suspended') this.#context.resume().catch(() => {});
		} catch {
			return null;
		}
		return this.#context;
	}

	/** The sound rendered as it plays, and its buffer (made once per sound object). */
	#prepare(sound: Playable, context: AudioContext) {
		let entry = this.#rendered.get(sound);
		if (!entry) {
			const rendered = renderEdit(sound.audio, sound.edit, { preview: true });
			const { channels, sampleRate } = rendered.audio;
			const buffer = context.createBuffer(
				channels.length,
				Math.max(1, channels[0].length),
				sampleRate
			);
			channels.forEach((c, i) => buffer.copyToChannel(new Float32Array(c), i));
			entry = { rendered, buffer };
			this.#rendered.set(sound, entry);
		}
		return entry;
	}

	/**
	 * Plays `sound` as voice `id` (a key); a voice already sounding on that id stops. Returns how
	 * long the note will ring at most (s), for the key's light, or 0 when nothing could play.
	 */
	play(id: string, sound: Playable, options: PlayOptions): number {
		const context = this.unlock();
		if (!context || !this.#out) return 0;
		const { rendered, buffer } = this.#prepare(sound, context);
		const when = Math.max(context.currentTime, options.when ?? context.currentTime);
		this.#stop(id, when, 0.006);
		const e = sound.edit;
		// the kit's one mute group: a key in it cuts off every other key in it
		if (options.drum && e.playmode === 'group') {
			for (const [other, voice] of this.#sounding) {
				if (voice.drum && voice.edit.playmode === 'group') this.#stop(other, when, 0.01);
			}
		}
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = 2 ** (options.semitones / 12);
		const gain = context.createGain();
		const level = 10 ** (e.gain / 20) * (0.35 + 0.65 * (options.velocity ?? 0.85));
		gain.gain.setValueAtTime(level, when);
		const pan = context.createStereoPanner();
		pan.pan.value = options.drum ? e.pan / 100 : 0;
		source.connect(gain).connect(pan).connect(this.#out);
		const rate = sound.audio.sampleRate;
		const start = rendered.start / rate;
		const end = rendered.end / rate;
		const loops = options.drum ? e.playmode === 'loop' : e.loop.mode !== 'off';
		if (loops) {
			source.loop = true;
			source.loopStart = options.drum ? start : rendered.loop.start / rate;
			source.loopEnd = options.drum ? end : rendered.loop.end / rate;
		}
		const voice: Sounding = { source, gain, drum: options.drum, edit: e, ended: false };
		source.onended = () => {
			voice.ended = true;
			if (this.#sounding.get(id) === voice) this.#sounding.delete(id);
		};
		if (loops) source.start(when, start);
		else source.start(when, start, end - start);
		this.#sounding.set(id, voice);
		const ring = (end - start) / source.playbackRate.value;
		if (options.hold !== undefined) this.release(id, when + options.hold);
		return loops ? (options.hold ?? Infinity) : ring;
	}

	/**
	 * Lets go of a key: a drum key in gate or loop mode stops; a sampler note fades out (loop
	 * forever, no loop) or plays on past its loop to the end (loop until release).
	 */
	release(id: string, when?: number): void {
		const voice = this.#sounding.get(id);
		const context = this.#context;
		if (!voice || !context || voice.ended) return;
		const at = Math.max(context.currentTime, when ?? context.currentTime);
		if (voice.drum) {
			if (voice.edit.playmode === 'gate' || voice.edit.playmode === 'loop')
				this.#stop(id, at, 0.012);
			return;
		}
		if (voice.edit.loop.mode === 'release') {
			// playing on past the loop's end, to the sound's end
			const delay = Math.max(0, (at - context.currentTime) * 1000);
			setTimeout(() => (voice.source.loop = false), delay);
			return;
		}
		this.#stop(id, at, RELEASE);
	}

	#stop(id: string, at: number, fade: number): void {
		const voice = this.#sounding.get(id);
		if (!voice || voice.ended) return;
		this.#sounding.delete(id);
		try {
			voice.gain.gain.cancelScheduledValues(at);
			voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
			voice.gain.gain.linearRampToValueAtTime(0, at + fade);
			voice.source.stop(at + fade + 0.01);
		} catch {
			// already stopped
		}
	}

	/** Silences everything at once. */
	stopAll(): void {
		const context = this.#context;
		if (!context) return;
		for (const id of [...this.#sounding.keys()]) this.#stop(id, context.currentTime, 0.02);
	}

	/** Closes the context (the page is leaving). */
	close(): void {
		this.stopAll();
		void this.#context?.close().catch(() => {});
		this.#context = null;
		this.#out = null;
	}
}
