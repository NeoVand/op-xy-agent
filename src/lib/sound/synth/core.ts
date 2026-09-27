/**
 * The synth core: every synth-engine voice of the eight instrument tracks, computed sample by
 * sample. It runs inside an AudioWorklet (`worklet.ts`) and, unchanged, in Node for tests. The main
 * thread's sound engine keeps deciding which notes sound, which voice to steal and when things are
 * let go; it sends those decisions here as {@link CoreMessage}s stamped with audio times, and hears
 * back when a voice has died away.
 *
 * A voice is its engine's sources (the part TE calls the engine, M1) through the track's filter
 * (M3) and amp envelope (M2), with the filter envelope, glide, pitch bend, a bend component's curve
 * and the track's LFO. The LFO itself stays in the main thread's channel strip; its signals arrive
 * as audio inputs, one set per track: cutoff (cents), resonance (dB), engine (−1…1 at depth) and
 * vibrato (cents). Pitch, filter and engine parameters move at a control rate of
 * {@link CONTROL} samples; oscillators, filters and envelopes run every sample.
 */
import type { FilterType } from '$lib/sim/screen/frame';
import { Adsr } from './adsr';
import { createEngine, type EngineVoice } from './engines';
import { Ladder, Svf, prewarp } from './filters';
import {
	CONTROL,
	MOD_CHANNELS,
	STEAL_SECONDS,
	type CoreMessage,
	type CoreReply,
	type VoiceStart
} from './protocol';

export * from './protocol';

// ───────────────────────────────────────────────────────────────── filters

/** The shape resonance takes per filter type: TPT state-variable, ladder, and the z pair. */
interface VoiceFilter {
	set(g: number, resonance: number, lfoDb: number): void;
	process(x: number): number;
}

/** svf: a gentle state-variable lowpass that never quite self-oscillates (Q up to ~17). */
class SvfLowpass implements VoiceFilter {
	readonly #f = new Svf();
	constructor(readonly highpass = false) {}
	set(g: number, resonance: number, lfoDb: number): void {
		const r = resonance / 99;
		const k = 2 * (1 - 0.97 * Math.pow(r, 0.8));
		this.#f.set(g, Math.max(0.01, k / Math.pow(10, lfoDb / 20)));
	}
	process(x: number): number {
		const low = this.#f.process(x);
		return this.highpass ? this.#f.high : low;
	}
}

/** z lowpass / z hipass: a sharper two-pole, Q 0.5 … 25 on an exponential curve. */
class ZFilter implements VoiceFilter {
	readonly #f = new Svf();
	constructor(readonly highpass: boolean) {}
	set(g: number, resonance: number, lfoDb: number): void {
		const q = 0.5 * Math.pow(50, resonance / 99) * Math.pow(10, lfoDb / 20);
		this.#f.set(g, 1 / Math.max(0.5, q));
	}
	process(x: number): number {
		const low = this.#f.process(x);
		return this.highpass ? this.#f.high : low;
	}
}

/** ladder: four poles, whistling into self-oscillation at the top of its resonance. */
class LadderLowpass implements VoiceFilter {
	readonly #f = new Ladder();
	set(g: number, resonance: number, lfoDb: number): void {
		this.#f.set(g, Math.min(1, Math.max(0, resonance / 99 + lfoDb / 24)));
	}
	process(x: number): number {
		return this.#f.process(x);
	}
}

function makeFilter(type: FilterType): VoiceFilter {
	switch (type) {
		case 'ladder':
			return new LadderLowpass();
		case 'z lowpass':
			return new ZFilter(false);
		case 'z hipass':
			return new ZFilter(true);
		default:
			return new SvfLowpass();
	}
}

// ───────────────────────────────────────────────────────────────── voices

class CoreVoice {
	readonly id: number;
	readonly track: number;
	/** Frame it starts at; before then it exists (and takes messages) but is silent. */
	readonly start: number;
	readonly #engine: EngineVoice;
	readonly #amp: Adsr;
	readonly #fenv: Adsr;
	readonly #filters: [VoiceFilter, VoiceFilter];
	#restHz: number;
	#resonance: number;
	readonly #depth: number;
	readonly #m1: number[];
	#lfoParam: number | null;
	readonly #peak: number;
	readonly #panL: number;
	readonly #panR: number;
	/** Frame it is let go at, and the release time to use then (else the envelope's own). */
	#gate: number;
	#releaseSeconds: number | undefined;
	#released = false;
	/** Pitch: where it is, where it glides to, and how fast (per control tick). */
	#hz: number;
	#target: number;
	#glideCoef: number;
	#bend: number;
	#bendTarget: number;
	readonly #bendCoef: number;
	readonly #curve: Float32Array | null;
	readonly #curveEnd: number;
	readonly #params = new Float32Array(4);
	readonly #l = new Float32Array(CONTROL);
	readonly #r = new Float32Array(CONTROL);
	/** Where in the current control block the next sample comes from. */
	#at = CONTROL;
	readonly #sr: number;
	done = false;

	constructor(v: VoiceStart, sampleRate: number) {
		this.id = v.id;
		this.track = v.track;
		this.#sr = sampleRate;
		this.#engine = createEngine(v.engine, sampleRate, v.id);
		this.#amp = new Adsr(sampleRate, v.amp);
		this.#fenv = new Adsr(sampleRate, v.filter.envelope);
		this.#filters = [makeFilter(v.filter.type), makeFilter(v.filter.type)];
		this.#restHz = v.filter.hz;
		this.#resonance = v.filter.resonance;
		this.#depth = v.filter.depth;
		this.#m1 = [...v.m1];
		this.#lfoParam = v.lfoParam;
		this.#peak = v.peak;
		// constant-power pan for a note with a place of its own; centre leaves both sides at 1
		const pan = Math.max(-1, Math.min(1, v.pan));
		this.#panL = pan === 0 ? 1 : Math.SQRT2 * Math.cos(((pan + 1) * Math.PI) / 4);
		this.#panR = pan === 0 ? 1 : Math.SQRT2 * Math.sin(((pan + 1) * Math.PI) / 4);
		this.start = Math.round(v.start * sampleRate);
		this.#gate = Number.isFinite(v.gate) ? Math.round(v.gate * sampleRate) : Infinity;
		this.#hz = v.from;
		this.#target = v.hz;
		this.#glideCoef = glideCoef(v.glide, sampleRate);
		this.#bend = v.bend;
		this.#bendTarget = v.bend;
		this.#bendCoef = 1 - Math.exp(-CONTROL / (0.01 * sampleRate));
		this.#curve = v.curve && v.curve.length > 0 && Number.isFinite(this.#gate) ? v.curve : null;
		this.#curveEnd = this.#gate;
		this.#amp.gateOn();
		this.#fenv.gateOn();
		this.#engine.start(v.from, v.velocity, this.#paramsNow(0));
	}

	/** M1 as 0–1, with the LFO's engine signal `lfo` (−1…1 at depth) on its parameter. */
	#paramsNow(lfo: number): Float32Array {
		for (let i = 0; i < 4; i++) {
			const moved = this.#lfoParam === i ? this.#m1[i] + lfo * 99 : this.#m1[i];
			this.#params[i] = Math.min(99, Math.max(0, moved)) / 99;
		}
		return this.#params;
	}

	/** Lets go at `frame` (over `seconds`, else the envelope's release); a later gate moves earlier. */
	release(frame: number, seconds?: number): void {
		if (this.#released || frame >= this.#gate) return;
		this.#gate = frame;
		this.#releaseSeconds = seconds;
	}

	/** Fades out fast from `frame`, even when it is already releasing (a stolen voice). */
	kill(frame: number): void {
		if (this.#released) this.#amp.setRelease(STEAL_SECONDS);
		else this.release(frame, STEAL_SECONDS);
	}

	extend(gate: number): void {
		if (!this.#released && gate > this.#gate) this.#gate = gate;
	}

	glide(hz: number, seconds: number): void {
		this.#target = hz;
		this.#glideCoef = glideCoef(Math.max(seconds, 0.003), this.#sr);
	}

	bend(cents: number): void {
		this.#bendTarget = cents;
	}

	filter(hz: number, resonance: number): void {
		this.#restHz = hz;
		this.#resonance = resonance;
	}

	m1(values: readonly number[]): void {
		for (let i = 0; i < 4; i++) this.#m1[i] = values[i] ?? this.#m1[i];
	}

	lfo(param: number | null): void {
		this.#lfoParam = param;
	}

	/** The control update at `frame`: pitch, engine parameters, filter coefficients. */
	#control(frame: number, input: readonly Float32Array[] | undefined, i: number): void {
		const lfo = input && input.length >= MOD_CHANNELS;
		const cutoffCents = lfo ? input[0][i] : 0;
		const resonanceDb = lfo ? input[1][i] : 0;
		const engine = lfo ? input[2][i] : 0;
		const vibrato = lfo ? input[3][i] : 0;
		this.#hz += (this.#target - this.#hz) * this.#glideCoef;
		this.#bend += (this.#bendTarget - this.#bend) * this.#bendCoef;
		let cents = this.#bend + vibrato;
		const curve = this.#curve;
		if (curve) {
			const x = Math.min(1, Math.max(0, (frame - this.start) / (this.#curveEnd - this.start)));
			const pos = x * (curve.length - 1);
			const k = Math.floor(pos);
			const next = curve[Math.min(curve.length - 1, k + 1)];
			cents += curve[k] + (next - curve[k]) * (pos - k);
		}
		this.#engine.control(this.#hz * Math.pow(2, cents / 1200), this.#paramsNow(engine));
		// the filter envelope over the coming block moves the cutoff in ratio, as the Web Audio one
		let env = 0;
		for (let k = 0; k < CONTROL; k++) env = this.#fenv.next();
		const cutoff = this.#restHz * Math.pow(2, (env * this.#depth + cutoffCents) / 1200);
		const g = prewarp(Math.min(cutoff, 20000), this.#sr);
		this.#filters[0].set(g, this.#resonance, resonanceDb);
		this.#filters[1].set(g, this.#resonance, resonanceDb);
	}

	/**
	 * Adds samples `offset`…`offset + n` of the block (the first at audio frame `frame`) into
	 * `outL`/`outR`, reading the track's LFO from `input`.
	 */
	render(
		outL: Float32Array,
		outR: Float32Array,
		offset: number,
		n: number,
		frame: number,
		input: readonly Float32Array[] | undefined
	): void {
		const skip = Math.min(n, Math.max(0, this.start - frame));
		const [fl, fr] = this.#filters;
		for (let i = offset + skip, f = frame + skip; i < offset + n; i++, f++) {
			if (!this.#released && f >= this.#gate) {
				this.#released = true;
				if (this.#releaseSeconds !== undefined) this.#amp.setRelease(this.#releaseSeconds);
				this.#amp.gateOff();
				this.#fenv.gateOff();
			}
			if (this.#at >= CONTROL) {
				this.#control(f, input, i);
				this.#engine.render(this.#l, this.#r, CONTROL);
				this.#at = 0;
			}
			const level = this.#amp.next() * this.#peak;
			outL[i] += fl.process(this.#l[this.#at]) * level * this.#panL;
			outR[i] += fr.process(this.#r[this.#at]) * level * this.#panR;
			this.#at++;
			if (!this.#amp.active) {
				this.done = true;
				return;
			}
		}
	}
}

/** Per-control-tick coefficient of an exponential glide over `seconds` (three time constants). */
function glideCoef(seconds: number, sampleRate: number): number {
	if (seconds <= 0) return 1;
	return 1 - Math.exp(-CONTROL / ((seconds / 3) * sampleRate));
}

// ───────────────────────────────────────────────────────────────── the core

/** A message waiting for its moment, in frames. */
interface Pending {
	readonly frame: number;
	readonly order: number;
	readonly message: CoreMessage;
}

/** When a message acts (audio seconds); 0 (at once) for those without a time. */
const messageTime = (m: CoreMessage): number => ('time' in m ? m.time : 0);

export class SynthCore {
	readonly sampleRate: number;
	readonly #reply: (reply: CoreReply) => void;
	#queue: Pending[] = [];
	#order = 0;
	/** Every voice from the moment it is scheduled until it has died away, by id. */
	readonly #voices = new Map<number, CoreVoice>();

	constructor(sampleRate: number, reply: (reply: CoreReply) => void = () => {}) {
		this.sampleRate = sampleRate;
		this.#reply = reply;
	}

	/** Voices scheduled or sounding (tests, meters). */
	get sounding(): number {
		return this.#voices.size;
	}

	/**
	 * Takes a message. A start makes its voice at once (silent until its time), so later messages
	 * for it are never lost; the others act at their time (the past means at once).
	 */
	post(message: CoreMessage): void {
		if (message.t === 'start') {
			this.#voices.set(message.voice.id, new CoreVoice(message.voice, this.sampleRate));
			return;
		}
		const pending = {
			frame: Math.round(messageTime(message) * this.sampleRate),
			order: this.#order++,
			message
		};
		// keep the queue in time order (messages mostly arrive in order: append, then move back)
		const q = this.#queue;
		let i = q.length;
		while (i > 0 && q[i - 1].frame > pending.frame) i--;
		q.splice(i, 0, pending);
	}

	/**
	 * Renders `n` samples starting at audio frame `frame` into `outputs[track] = [left, right]`
	 * (added to what is there), reading each track's LFO from `inputs[track]` (four channels, or
	 * none).
	 */
	process(
		frame: number,
		outputs: readonly (readonly Float32Array[])[],
		inputs: readonly (readonly Float32Array[])[],
		n: number
	): void {
		let done = 0;
		while (done < n) {
			const next = this.#queue[0];
			const until = next ? Math.min(n, Math.max(done, next.frame - frame)) : n;
			if (until > done) {
				this.#render(frame, outputs, inputs, done, until - done);
				done = until;
			}
			if (next && next.frame - frame <= done) {
				this.#queue.shift();
				this.#apply(next.message, frame + done);
			}
		}
	}

	#render(
		frame: number,
		outputs: readonly (readonly Float32Array[])[],
		inputs: readonly (readonly Float32Array[])[],
		offset: number,
		n: number
	): void {
		for (const voice of this.#voices.values()) {
			const out = outputs[voice.track];
			if (!out || out.length < 2) continue;
			voice.render(out[0], out[1], offset, n, frame + offset, inputs[voice.track]);
			if (voice.done) this.#end(voice.id);
		}
	}

	#end(id: number): void {
		this.#voices.delete(id);
		this.#reply({ t: 'ended', id });
	}

	#apply(m: CoreMessage, frame: number): void {
		if (m.t === 'silence') {
			for (const voice of [...this.#voices.values()]) {
				if (voice.start > frame) this.#end(voice.id);
				else voice.kill(frame);
			}
			return;
		}
		if (m.t === 'start') return; // starts never wait in the queue
		const voice = this.#voices.get(m.id);
		if (!voice) return;
		switch (m.t) {
			case 'release':
				voice.release(frame, m.seconds);
				break;
			case 'kill':
				voice.kill(frame);
				break;
			case 'cancel':
				// a note that has not begun is dropped; one that has is let go
				if (voice.start >= frame) this.#end(voice.id);
				else voice.release(frame);
				break;
			case 'extend':
				voice.extend(Number.isFinite(m.gate) ? Math.round(m.gate * this.sampleRate) : Infinity);
				break;
			case 'glide':
				voice.glide(m.hz, m.seconds);
				break;
			case 'bend':
				voice.bend(m.cents);
				break;
			case 'filter':
				voice.filter(m.hz, m.resonance);
				break;
			case 'm1':
				voice.m1(m.m1);
				break;
			case 'lfo':
				voice.lfo(m.param);
				break;
		}
	}
}
