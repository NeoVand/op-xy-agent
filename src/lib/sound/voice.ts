/**
 * One sounding note: an engine's sources (`synths.ts`) through the track's filter and the amplitude
 * envelope into the track's channel. Every engine shares this part (manual: only M1 belongs to the
 * engine): the amp and filter envelopes from M2, filter type, cutoff, resonance, envelope amount and
 * key tracking from M3, portamento, pitch bend, and the LFO's reach into the filter, the pitch and
 * the engine's M1 parameters. A voice cleans up after itself: when its sources stop, every node is
 * disconnected.
 */
import type { VoiceSlot } from './allocator';
import { Envelope } from './envelope';
import type { Adsr, FilterDesign } from './mapping';
import type { SourceGraph } from './synths';

/** The track's filter as a voice plays it. */
export interface VoiceFilter {
	readonly design: FilterDesign;
	/** Resting cutoff, key tracking included (Hz). */
	readonly hz: number;
	/** Resonance as a biquad Q in dB. */
	readonly q: number;
	readonly envelope: Adsr;
	/** How far the filter envelope moves the cutoff, in cents (0 = not at all). */
	readonly depth: number;
}

/** Everything a voice needs to know when it starts. */
export interface VoiceSpec {
	readonly track: number;
	readonly note: number;
	readonly start: number;
	/** When the note is let go (Infinity while a key holds it). */
	readonly gate: number;
	/** The note's frequency, and where the pitch starts when it glides there. */
	readonly hz: number;
	readonly from: number;
	/** Portamento, in seconds. */
	readonly glide: number;
	readonly amp: Adsr;
	/** Amplitude at the top of the attack. */
	readonly peak: number;
	readonly filter: VoiceFilter;
	/** Pitch bend at the start, in cents. */
	readonly bend: number;
	/** A bend component's curve over the note (cents, spread across start → gate). */
	readonly curve?: Float32Array;
	/** Played from the replica's keys (with the key's id) or by the sequencer. */
	readonly source: 'live' | 'sequence';
	readonly key: string | null;
	/** A drum key in the mute group (another mute-group hit cuts it off). */
	readonly group?: boolean;
	/** The note's own place in the stereo field, −1…1 (an arpeggio's stereo spread); 0 = centre. */
	readonly pan?: number;
}

/** What the track's LFO offers voices, per destination (null = not routed there). */
export interface VoiceModulation {
	/** Cents, for the cutoff. */
	readonly cutoff: AudioNode | null;
	/** Decibels, for the resonance. */
	readonly resonance: AudioNode | null;
	/** The unscaled wave for one of the engine's M1 parameters. */
	readonly engine: { readonly param: number; readonly signal: AudioNode } | null;
	/** Cents, for vibrato. */
	readonly vibrato: AudioNode | null;
}

/** Fast fade for stolen and choked voices. */
export const STEAL_SECONDS = 0.008;
/** Sources keep running this long after the envelope's tail, for safety. */
const STOP_PAD = 0.02;
/** A stop time far enough away to mean "not yet" (stop() takes no Infinity). */
const FOREVER = 1e7;

const clampHz = (hz: number, sampleRate: number) =>
	Math.min(Math.max(hz, 16), 0.45 * sampleRate, 20000);

/** A note that is sounding, or scheduled to. */
export class Voice implements VoiceSlot {
	readonly track: number;
	readonly start: number;
	readonly source: 'live' | 'sequence';
	readonly group: boolean;
	note: number;
	key: string | null;
	/** Its current pitch (after glides). */
	hz: number;
	off: number;
	end: number;
	/** Fading out fast: its slot is as good as free. */
	killed = false;
	/** Called once when the voice has stopped and let go of its nodes. */
	onended: ((voice: Voice) => void) | null = null;

	readonly #context: BaseAudioContext;
	readonly #graph: SourceGraph;
	readonly #filters: BiquadFilterNode[];
	readonly #vca: GainNode;
	/** Only a note with a place of its own in the stereo field has one. */
	readonly #panner: StereoPannerNode | null;
	readonly #amp: Envelope;
	readonly #cutoff: Envelope[];
	/** Modulation wiring, undone on re-attach and at the end. */
	#wires: { from: AudioNode; to: AudioNode | AudioParam }[] = [];
	/** A bend component's curve, if the note has one. */
	#curve: ConstantSourceNode | null = null;
	#disposed = false;

	constructor(
		context: BaseAudioContext,
		graph: SourceGraph,
		destination: AudioNode,
		spec: VoiceSpec
	) {
		this.#context = context;
		this.#graph = graph;
		this.track = spec.track;
		this.note = spec.note;
		this.start = spec.start;
		this.source = spec.source;
		this.key = spec.key;
		this.group = spec.group ?? false;
		this.hz = spec.hz;
		const { start, gate } = spec;
		const rate = context.sampleRate;

		// the filter: one or two biquads, the resonance on the last
		const { design } = spec.filter;
		const rest = clampHz(spec.filter.hz, rate);
		this.#filters = Array.from({ length: design.stages }, (_, i) => {
			const f = context.createBiquadFilter();
			f.type = design.kind;
			f.frequency.value = rest;
			f.Q.value = i === design.stages - 1 ? spec.filter.q : -3;
			return f;
		});
		this.#vca = context.createGain();
		this.#vca.gain.value = 0;
		let chain: AudioNode = graph.output;
		for (const f of this.#filters) chain = chain.connect(f);
		chain = chain.connect(this.#vca);
		this.#panner = spec.pan ? context.createStereoPanner() : null;
		if (this.#panner) {
			this.#panner.pan.value = Math.max(-1, Math.min(1, spec.pan ?? 0));
			chain = chain.connect(this.#panner);
		}
		chain.connect(destination);

		this.#amp = new Envelope(start, spec.amp, { base: 0, peak: spec.peak, curve: 'linear' });
		this.#amp.schedule(this.#vca.gain, gate);
		const peakHz = clampHz(rest * Math.pow(2, spec.filter.depth / 1200), rate);
		this.#cutoff =
			spec.filter.depth === 0 || peakHz === rest
				? []
				: this.#filters.map((f) => {
						const env = new Envelope(start, spec.filter.envelope, {
							base: rest,
							peak: peakHz,
							curve: 'exponential'
						});
						env.schedule(f.frequency, gate);
						return env;
					});

		// pitch: glide from where the last note was, bend from where the strip is
		for (const p of graph.pitched) {
			p.param.setValueAtTime(spec.from * p.ratio, start);
			if (spec.from !== spec.hz) p.param.setTargetAtTime(spec.hz * p.ratio, start, spec.glide / 3);
		}
		graph.retune?.(spec.from, start, 0);
		if (spec.from !== spec.hz) graph.retune?.(spec.hz, start, spec.glide / 3);
		if (spec.bend !== 0) for (const d of graph.detune) d.setValueAtTime(spec.bend, start);
		if (spec.curve && Number.isFinite(gate) && gate > start) {
			// its own source, summed into detune, so the pitch strip's automation never collides;
			// it holds its last value through the release and goes with the voice
			const curve = context.createConstantSource();
			curve.offset.value = 0;
			curve.offset.setValueCurveAtTime(spec.curve, start, gate - start);
			for (const d of graph.detune) curve.connect(d);
			curve.start(start);
			this.#curve = curve;
		}

		graph.onended = () => this.#dispose();
		graph.start(start);
		this.off = this.#amp.gate;
		this.end = this.#amp.end;
		if (Number.isFinite(this.end)) graph.stop(this.end + STOP_PAD);
	}

	/** True once it has stopped and disconnected. */
	get disposed(): boolean {
		return this.#disposed;
	}

	/** Lets go at `time`, over the release (or `seconds`). */
	release(time: number, seconds?: number): void {
		if (this.#disposed || time >= this.off) return;
		this.#amp.release(this.#vca.gain, time, seconds);
		for (const [i, env] of this.#cutoff.entries())
			env.release(this.#filters[i].frequency, time, seconds);
		this.off = this.#amp.gate;
		this.end = this.#amp.end;
		this.#graph.stop(this.end + STOP_PAD);
	}

	/** Fades out fast at `time`: stolen for another note, or choked by a mute group. */
	kill(time: number): void {
		this.killed = true;
		this.release(time, STEAL_SECONDS);
	}

	/** Drops a note that has not started yet; one that has is let go. */
	cancel(time: number): void {
		if (this.start >= time) {
			this.#graph.stop(0);
			this.#dispose();
		} else this.release(time);
	}

	/** A legato note carries the voice on: its release moves to `gate`. */
	extend(gate: number): void {
		if (this.#disposed || gate <= this.off) return;
		this.#amp.extend(this.#vca.gain, gate);
		for (const [i, env] of this.#cutoff.entries()) env.extend(this.#filters[i].frequency, gate);
		this.off = this.#amp.gate;
		this.end = this.#amp.end;
		// held on by a key: push the scheduled stop out of the way until that key lets go
		this.#graph.stop(Number.isFinite(this.end) ? this.end + STOP_PAD : FOREVER);
	}

	/** Slides to `hz` from `time` over `seconds` (legato, or back to a still-held key). */
	glide(hz: number, time: number, seconds: number): void {
		const tau = Math.max(seconds, 0.003) / 3;
		for (const p of this.#graph.pitched) p.param.setTargetAtTime(hz * p.ratio, time, tau);
		this.#graph.retune?.(hz, time, tau);
		this.hz = hz;
	}

	/** Pitch bend, in cents. */
	bend(cents: number, time: number): void {
		for (const d of this.#graph.detune) d.setTargetAtTime(cents, time, 0.01);
	}

	/** Cutoff and resonance turned while the note sounds (the cutoff only when no envelope moves it). */
	setFilter(hz: number, q: number, time: number): void {
		if (this.#cutoff.length === 0) {
			const rest = clampHz(hz, this.#context.sampleRate);
			for (const f of this.#filters) f.frequency.setTargetAtTime(rest, time, 0.02);
		}
		this.#filters[this.#filters.length - 1].Q.setTargetAtTime(q, time, 0.02);
	}

	/** M1 turned while the note sounds. */
	update(controls: Parameters<NonNullable<SourceGraph['update']>>[0], time: number): void {
		this.#graph.update?.(controls, this.hz, time);
	}

	/** Wires the track's LFO into this voice, replacing earlier wiring. */
	attach(mod: VoiceModulation): void {
		this.#detach();
		if (this.#disposed) return;
		const wire = (from: AudioNode, to: AudioNode | AudioParam) => {
			if (to instanceof AudioParam) from.connect(to);
			else from.connect(to);
			this.#wires.push({ from, to });
		};
		if (mod.cutoff) for (const f of this.#filters) wire(mod.cutoff, f.detune);
		if (mod.resonance) wire(mod.resonance, this.#filters[this.#filters.length - 1].Q);
		if (mod.vibrato) for (const d of this.#graph.detune) wire(mod.vibrato, d);
		if (mod.engine) {
			for (const target of this.#graph.mods[mod.engine.param] ?? []) {
				// each target gets its own scale, fed from the track's shared wave
				const scale = this.#context.createGain();
				scale.gain.value = target.scale;
				wire(mod.engine.signal, scale);
				wire(scale, target.param);
			}
		}
	}

	#detach(): void {
		for (const { from, to } of this.#wires) {
			try {
				if (to instanceof AudioParam) from.disconnect(to);
				else from.disconnect(to);
			} catch {
				// the wire was already gone
			}
		}
		this.#wires = [];
	}

	#dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#detach();
		if (this.#curve) {
			try {
				this.#curve.stop();
			} catch {
				// not started yet or already stopped
			}
			this.#curve.disconnect();
		}
		this.#graph.dispose();
		for (const f of this.#filters) f.disconnect();
		this.#vca.disconnect();
		this.#panner?.disconnect();
		this.off = Math.min(this.off, this.#context.currentTime);
		this.end = Math.min(this.end, this.#context.currentTime);
		this.onended?.(this);
	}
}
