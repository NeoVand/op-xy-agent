/**
 * The virtual OP-XY's sound (Web Audio): eight instrument-track channels into a master bus with a
 * gentle limiter; two send effects (a new project's delay on FX I and reverb on FX II), returning
 * through the auxiliary mixer strips T7 and T8; a metronome click; and the voices — 24 shared by all
 * tracks and stolen when needed, as on the device. Notes arrive live from the replica's keys or
 * scheduled ahead by the sequencer (`scheduler.ts`); the simulator's state arrives through `sync`,
 * called often, which applies only what changed. It runs on any BaseAudioContext, so the tests
 * render it offline.
 *
 * Play modes (M2 + shift): poly gives every note a voice; mono gives the track one voice at a time,
 * gliding from the last note when portamento is up; legato slides a held voice to the next
 * overlapping note without restarting its envelopes, and falls back to a key still held when the
 * newest one lets go.
 */
import { TRACKS, type EngineId } from '$lib/core/opxy';
import { soloed } from '$lib/sim/areas/mixer/meters';
import { zoneOf } from '$lib/sim/areas/sample/m1';
import type { Region as SampleRegion, SampleState } from '$lib/sim/areas/sample/state';
import { defaultDrumKey, type SimState, type TrackState } from '$lib/sim/params';
import { VOICE_LIMIT, victim } from './allocator';
import { Channel } from './channel';
import { createEffect, type SendEffect } from './fx';
import { FIRST_DRUM_NOTE, kitSound } from './kit';
import {
	EQ_BANDS,
	bendCents,
	cutoffHz,
	dbGain,
	engineControls,
	envAmountCents,
	envelopeSeconds,
	eqGainDb,
	fadeSeconds,
	filterDesign,
	glideSeconds,
	groupGain,
	keyTrackCents,
	levelGain,
	noteHz,
	panValue,
	playMode,
	presetGain,
	regionSeconds,
	resonanceQ,
	sampleRegion,
	tuneRate,
	velocityGain,
	type Adsr,
	type PlayMode
} from './mapping';
import { Resources } from './resources';
import type { SampleRegistry, SampleSource } from './samples';
import type { ClickEvent, SchedulerSink } from './scheduler';
import { WorkletVoice, type SynthHost } from './synth/host';
import { CORE_ENGINES } from './synth/protocol';
import { ONESHOT_RELEASE, bufferSource, oneshotAmp, synthSource, type SourceGraph } from './synths';
import { Voice, type VoiceFilter } from './voice';

/** A sounding note: a Web Audio voice, or one the synth core computes in its worklet. */
type AnyVoice = Voice | WorkletVoice;

/** A note to play. */
export interface NoteRequest {
	/** Instrument track 0–7. */
	readonly track: number;
	/** The track's settings as the note starts. */
	readonly settings: TrackState;
	readonly note: number;
	/** 1–127. */
	readonly velocity: number;
	/** Audio time it starts (the past means now). */
	readonly time: number;
	/** Seconds until it is let go; leave out for a key held until {@link SoundEngine.noteOff}. */
	readonly duration?: number;
	/** The replica key playing it (live notes). */
	readonly key?: string;
	/** Seconds to glide in from the last note, whatever the track's portamento (the component). */
	readonly glide?: number;
	/** A pitch curve over the note, in cents (the bend component). */
	readonly bend?: Float32Array;
	/** The note's own place in the stereo field, −1…1, on top of the strip's pan (arpeggio stereo). */
	readonly pan?: number;
}

/** Options for {@link SoundEngine}. */
export interface SoundEngineOptions {
	readonly context: BaseAudioContext;
	/**
	 * The audio of the simulator's sample files, by id (else a drum key plays the synthesized kit
	 * and the synth samplers a soft tone).
	 */
	readonly samples?: SampleRegistry | null;
	/** Where the master goes (default the context's destination). */
	readonly destination?: AudioNode;
	/** Polyphony (default 24, the device's). */
	readonly voices?: number;
}

/** Levels: synth voices before velocity, drums, samples, the master bus. */
const VOICE_GAIN = 0.45;
/**
 * The synth core's voices before velocity: its engines come out about as loud as each other
 * (RMS ≈ 0.28); this brings them level with the Web Audio voices on average (measured in
 * `synth/host.svelte.spec.ts`; the device session will set each engine's own).
 */
const CORE_GAIN = 0.5;
const DRUM_GAIN = 0.6;
const SAMPLE_GAIN = 0.6;
const MASTER_GAIN = 0.85;
/**
 * A recording's attack at 0: instant (a couple of hundred microseconds), since its transient is the
 * sound. Synth voices keep 1.5 ms so an oscillator never starts with a click.
 */
const SAMPLE_ATTACK = 0.0002;

/** The amp envelope for a buffer voice: M2's, with attack 0 meaning instant. */
function bufferAmp(settings: TrackState) {
	const amp = envelopeSeconds(settings.amp);
	return settings.amp.attack <= 0 ? { ...amp, attack: SAMPLE_ATTACK } : amp;
}
/** How long the send effects ring on after the last note (for idle detection). */
const FX_TAIL = 3.5;

/** A soft ceiling: straight up to 0.8, then rounding off so nothing passes 0.96. */
function softClip(): Float32Array<ArrayBuffer> {
	return Float32Array.from({ length: 2049 }, (_, i) => {
		const x = (i - 1024) / 1024;
		const a = Math.abs(x);
		return a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
	});
}

/** Held keys of a mono or legato track, newest last. */
interface MonoTrack {
	voice: AnyVoice | null;
	held: { key: string; note: number; velocity: number }[];
}

/** The sound engine. One per audio context. */
export class SoundEngine {
	readonly context: BaseAudioContext;
	readonly resources: Resources;
	readonly samples: SampleRegistry | null;
	/** Where the scheduler sends its notes, clicks and stops. */
	readonly sink: SchedulerSink;

	readonly #bus: GainNode;
	readonly #out: GainNode;
	readonly #analyser: AnalyserNode;
	readonly #meter: Float32Array<ArrayBuffer>;
	readonly #effects: SendEffect[];
	readonly #returns: { level: GainNode; pan: StereoPannerNode }[];
	readonly #channels: Channel[];
	readonly #limit: number;
	#voices: AnyVoice[] = [];
	/** The synth core in its worklet, once the app has loaded it, and the engines it plays. */
	#synth: SynthHost | null = null;
	#coreEngines: ReadonlySet<EngineId> = CORE_ENGINES;
	#clicks: { source: AudioBufferSourceNode; time: number }[] = [];
	readonly #mono: MonoTrack[];
	/** The last note's pitch per track, where portamento glides from. */
	readonly #last: (number | null)[];
	/** Each track's settings as last seen (for live note-offs and bends). */
	readonly #settings: (TrackState | null)[];
	/** Each track's settings as the mixer strip has them (without a step's locks). */
	readonly #base: (TrackState | null)[];
	/** What was last applied to sounding voices, per track. */
	readonly #shown: { filter: string; m1: string }[];
	/** The master EQ's low shelf, mid bell and high shelf, and the master level after them. */
	readonly #eq: BiquadFilterNode[];
	readonly #master: GainNode;
	/** Master values last applied. */
	readonly #applied = new Map<string, number>();
	/** What the simulator's sampler engines hold (from the last sync): which file plays where. */
	#sampleArea: SampleState | null = null;
	#bpm = 0;
	#quiet = 0;

	constructor(options: SoundEngineOptions) {
		const context = options.context;
		this.context = context;
		this.resources = new Resources(context);
		this.samples = options.samples ?? null;
		this.#limit = options.voices ?? VOICE_LIMIT;

		// master: bus → EQ (mix M2) → master level (mix M4) → soft-knee limiter → out, with a tap for
		// the level meter. The limiter is a static curve rather than a DynamicsCompressorNode:
		// Chrome's compressor starts with its gain pulled down ~13 dB and takes a good 100 ms to let
		// go, which would swallow the first note played after the context starts (on that very key
		// press). Single sounds stay well under the knee; only dense moments round off.
		this.#bus = context.createGain();
		this.#bus.gain.value = MASTER_GAIN;
		this.#eq = (['lowshelf', 'peaking', 'highshelf'] as const).map((type, i) => {
			const band = context.createBiquadFilter();
			band.type = type;
			band.frequency.value = [EQ_BANDS.low, EQ_BANDS.mid, EQ_BANDS.high][i];
			band.Q.value = type === 'peaking' ? 0.9 : 0.707;
			band.gain.value = 0;
			return band;
		});
		this.#master = context.createGain();
		const limiter = context.createWaveShaper();
		limiter.curve = softClip();
		limiter.oversample = '2x';
		this.#out = context.createGain();
		this.#analyser = context.createAnalyser();
		this.#analyser.fftSize = 1024;
		this.#meter = new Float32Array(this.#analyser.fftSize);
		let chain: AudioNode = this.#bus;
		for (const node of [...this.#eq, this.#master, limiter, this.#out]) chain = chain.connect(node);
		limiter.connect(this.#analyser);
		this.#out.connect(options.destination ?? context.destination);

		// FX I and FX II, returning through the auxiliary mixer strips T7 and T8
		const slots = [TRACKS[14]?.defaultEffect ?? 'delay', TRACKS[15]?.defaultEffect ?? 'reverb'];
		this.#effects = slots.map((kind) => createEffect(kind, context, this.resources, 120));
		this.#returns = this.#effects.map((fx) => {
			const level = context.createGain();
			const pan = context.createStereoPanner();
			fx.output.connect(level).connect(pan).connect(this.#bus);
			return { level, pan };
		});
		const sends = [this.#effects[0].input, this.#effects[1].input] as const;
		this.#channels = Array.from(
			{ length: 8 },
			() => new Channel(context, this.resources, this.#bus, sends)
		);
		this.#mono = this.#channels.map(() => ({ voice: null, held: [] }));
		this.#last = this.#channels.map(() => null);
		this.#settings = this.#channels.map(() => null);
		this.#base = this.#channels.map(() => null);
		this.#shown = this.#channels.map(() => ({ filter: '', m1: '' }));
		this.sink = {
			note: (event, settings) =>
				this.noteOn({
					track: event.track,
					settings,
					note: event.note,
					velocity: event.velocity,
					time: event.time,
					duration: event.duration,
					glide: event.glide,
					bend: event.bend,
					pan: event.pan
				}),
			click: (event) => this.click(event),
			stop: (time) => this.stopSequence(time)
		};
	}

	/**
	 * Hands the voices of `engines` to the synth core in `host` (the app calls this once the worklet
	 * has loaded; null goes back to the Web Audio voices for new notes).
	 */
	useSynth(host: SynthHost | null, engines: ReadonlySet<EngineId> = CORE_ENGINES): void {
		this.#synth = host;
		this.#coreEngines = engines;
		if (host) this.#channels.forEach((channel, k) => host.connect(k, channel.input));
	}

	/** Voices sounding or scheduled. */
	get voices(): number {
		return this.#voices.length;
	}

	/**
	 * When everything will have died away (voices, clicks and the effects' tails); Infinity while a
	 * key holds a note.
	 */
	get quietAt(): number {
		let end = this.#quiet;
		for (const v of this.#voices) end = Math.max(end, v.end);
		return end + FX_TAIL;
	}

	/** Peak level of what is playing right now, 0–1. */
	level(): number {
		this.#analyser.getFloatTimeDomainData(this.#meter);
		let peak = 0;
		for (const v of this.#meter) peak = Math.max(peak, Math.abs(v));
		return peak;
	}

	/**
	 * Takes the simulator's state: mixer strips (with solo and the mix page's group levels), sends,
	 * FX returns, the master EQ and level, preset volume, LFOs and tempo, and the filter and M1 of
	 * notes already sounding. Cheap when nothing changed; call it every tick.
	 */
	sync(state: SimState, time = this.context.currentTime): void {
		const { bpm } = state.tempo;
		if (bpm !== this.#bpm) {
			this.#bpm = bpm;
			for (const fx of this.#effects) fx.setTempo(bpm, time);
		}
		this.#sampleArea = state.areas?.sample ?? null;
		const mixer = state.areas?.mixer;
		if (mixer) {
			const { eq, master } = mixer;
			[eq.low, eq.mid, eq.high].forEach((band, i) => {
				this.#set(`eq${i}`, eqGainDb(band, eq.blend), this.#eq[i].gain, time);
			});
			this.#set('master', groupGain(master.level), this.#master.gain, time);
		}
		// solo: tracks held in mix mode (instrument set) are the only ones heard
		const solo = state.banks?.mix === 'instrument' ? soloed(state) : [];
		this.#returns.forEach((strip, i) => {
			const aux = state.aux[6 + i];
			if (!aux) return;
			// an effect's track has no notes to stop: its mute cuts the return (ours)
			const level = aux.mix.muted ? 0 : levelGain(aux.mix.level);
			if (strip.level.gain.value !== level) strip.level.gain.setTargetAtTime(level, time, 0.01);
			const pan = panValue(aux.mix.pan);
			if (strip.pan.pan.value !== pan) strip.pan.pan.setTargetAtTime(pan, time, 0.01);
		});
		state.tracks.forEach((track, k) => {
			const channel = this.#channels[k];
			if (!channel) return;
			this.#settings[k] = track;
			this.#base[k] = track;
			const group = mixer
				? groupGain(track.engine === 'drum' ? mixer.master.percussion : mixer.master.melodic)
				: 1;
			const heard = solo.length === 0 || solo.includes(k) ? 1 : 0;
			const rewire = channel.apply(track, bpm, time, group * heard);
			const voices = this.#voices.filter((v) => v.track === k);
			if (rewire) {
				const mod = channel.modulation();
				for (const v of voices) v.attach(mod);
			}
			const shown = this.#shown[k];
			const filter = `${track.filter.cutoff}|${track.filter.resonance}|${track.filter.keyTracking}`;
			if (filter !== shown.filter) {
				shown.filter = filter;
				for (const v of voices) {
					const f = this.#filter(track, v.note);
					if (v instanceof WorkletVoice) v.setFilter(f.hz, track.filter.resonance, time);
					else v.setFilter(f.hz, f.q, time);
				}
			}
			const m1 = `${track.engine}|${track.m1.join(',')}`;
			if (m1 !== shown.m1) {
				shown.m1 = m1;
				const controls = engineControls(track.engine, track.m1);
				for (const v of voices) {
					if (v instanceof WorkletVoice) v.update(track.m1, time);
					else if (controls) v.update(controls, time);
				}
			}
		});
	}

	/** Sets a master parameter when its value changed since last time. */
	#set(key: string, value: number, param: AudioParam, time: number): void {
		if (this.#applied.get(key) === value) return;
		this.#applied.set(key, value);
		param.setTargetAtTime(value, time, 0.01);
	}

	/** Plays a note: live (held until {@link noteOff}) or sequenced (with its duration). */
	noteOn(request: NoteRequest): void {
		const { track: k, settings } = request;
		const channel = this.#channels[k];
		if (!channel || settings.engine === 'midi') return;
		this.#settings[k] = settings;
		const time = Math.max(request.time, this.context.currentTime);
		const gate =
			request.duration === undefined ? Infinity : time + Math.max(request.duration, 0.005);
		this.#duckFrom(k, time);
		channel.retrigger(time);
		if (settings.engine === 'drum') {
			this.#drum(request, time, gate);
			return;
		}
		const mode = playMode(settings.playMode.mode);
		// a portamento component glides this note in whatever the track's portamento says
		const glide = request.glide ?? glideSeconds(settings.playMode.portamento);
		const hz = noteHz(request.note);
		if (mode === 'poly') {
			// the same note again on this track lets the one before go
			for (const v of this.#voices) {
				if (v.track === k && v.note === request.note && v.off > time) v.release(time);
			}
			const from = glide > 0 ? (this.#last[k] ?? hz) : hz;
			this.#spawn(request, time, gate, hz, from, glide);
			return;
		}
		this.#monoOn(request, time, gate, hz, mode, glide);
	}

	/** A replica key came up. */
	noteOff(track: number, key: string, time = this.context.currentTime): void {
		const at = Math.max(time, this.context.currentTime);
		const mono = this.#mono[track];
		const settings = this.#settings[track];
		if (!mono) return;
		mono.held = mono.held.filter((h) => h.key !== key);
		const voice = mono.voice;
		const mode = settings ? playMode(settings.playMode.mode) : 'poly';
		const back = mono.held.at(-1);
		if (voice && !voice.disposed && voice.key === key && back && settings && mode !== 'poly') {
			// back to the key still held
			const glide = glideSeconds(settings.playMode.portamento);
			const hz = noteHz(back.note);
			if (mode === 'legato') {
				voice.glide(hz, at, glide);
				voice.note = back.note;
				voice.key = back.key;
				this.#last[track] = hz;
			} else {
				voice.kill(at);
				const request = {
					track,
					settings,
					note: back.note,
					velocity: back.velocity,
					time: at,
					key: back.key
				};
				mono.voice = this.#spawn(request, at, Infinity, hz, glide > 0 ? voice.hz : hz, glide);
			}
			return;
		}
		for (const v of this.#voices) if (v.track === track && v.key === key) v.release(at);
	}

	/** Bends a track's notes: −1…1 of its bend range (M2 + shift, E3). */
	bend(track: number, value: number, time = this.context.currentTime): void {
		const channel = this.#channels[track];
		if (!channel) return;
		const range = this.#settings[track]?.playMode.bend ?? 2;
		channel.bend = bendCents(value, range);
		for (const v of this.#voices) if (v.track === track) v.bend(channel.bend, time);
	}

	/** A metronome click. */
	click(event: ClickEvent): void {
		const source = this.context.createBufferSource();
		source.buffer = this.resources.click(event.accent);
		const level = this.context.createGain();
		level.gain.value = event.gain;
		source.connect(level).connect(this.#bus);
		const time = Math.max(event.time, this.context.currentTime);
		source.start(time);
		const entry = { source, time };
		this.#clicks.push(entry);
		source.onended = () => {
			source.disconnect();
			level.disconnect();
			this.#clicks = this.#clicks.filter((c) => c !== entry);
		};
		this.#quiet = Math.max(this.#quiet, time + source.buffer.duration);
	}

	/**
	 * The transport stopped (or jumped) at `time`: sequenced notes that have started are let go,
	 * the ones scheduled after are dropped, and so are later clicks.
	 */
	stopSequence(time = this.context.currentTime): void {
		const at = Math.max(time, this.context.currentTime);
		for (const v of [...this.#voices]) if (v.source === 'sequence') v.cancel(at);
		for (const c of this.#clicks) {
			if (c.time > at) {
				try {
					c.source.stop(0);
				} catch {
					// already stopped
				}
			}
		}
		for (const mono of this.#mono) if (mono.voice?.source === 'sequence') mono.voice = null;
	}

	/** Everything stops, quickly: sound switched off, or a device took over. */
	silence(time = this.context.currentTime): void {
		const at = Math.max(time, this.context.currentTime);
		for (const v of [...this.#voices]) {
			if (v.start >= at) v.cancel(at);
			else v.kill(at);
		}
		for (const c of this.#clicks) {
			try {
				c.source.stop(0);
			} catch {
				// already stopped
			}
		}
		for (const mono of this.#mono) {
			mono.voice = null;
			mono.held = [];
		}
	}

	/** Disconnects the whole engine (the synth core's worklet with it). */
	dispose(): void {
		this.silence();
		this.#synth?.dispose();
		this.#synth = null;
		this.#out.disconnect();
	}

	// ─────────────────────────────────────────────────────────── voices

	#monoOn(
		request: NoteRequest,
		time: number,
		gate: number,
		hz: number,
		mode: PlayMode,
		glide: number
	): void {
		const k = request.track;
		const mono = this.#mono[k];
		const current = mono.voice && !mono.voice.disposed && mono.voice.end > time ? mono.voice : null;
		const overlapping = current !== null && current.off > time;
		if (request.key) {
			mono.held = mono.held.filter((h) => h.key !== request.key);
			mono.held.push({ key: request.key, note: request.note, velocity: request.velocity });
		}
		if (current && overlapping && mode === 'legato') {
			current.glide(hz, time, glide);
			current.note = request.note;
			current.key = request.key ?? null;
			current.extend(gate);
			this.#last[k] = hz;
			return;
		}
		// mono (or a fresh legato phrase): one new voice, the old one makes way
		const from =
			glide > 0 && (mode === 'mono' || overlapping) ? (current?.hz ?? this.#last[k] ?? hz) : hz;
		current?.kill(time);
		mono.voice = this.#spawn(request, time, gate, hz, from, glide);
	}

	#spawn(
		request: NoteRequest,
		time: number,
		gate: number,
		hz: number,
		from: number,
		glide: number
	): AnyVoice | null {
		const { settings, track } = request;
		if (this.#synth && !this.#synth.failed && this.#coreEngines.has(settings.engine)) {
			return this.#spawnCore(this.#synth, request, time, gate, hz, from, glide);
		}
		const source = this.#source(request, hz, time, gate);
		if (!source) return null;
		this.#steal(time, track);
		const voice = new Voice(this.context, source.graph, this.#channels[track].input, {
			track,
			note: request.note,
			start: time,
			gate: source.gate,
			hz,
			from,
			glide,
			amp: source.amp ?? envelopeSeconds(settings.amp),
			peak:
				velocityGain(request.velocity) *
				source.graph.level *
				source.gain *
				this.#lockedVolume(track, settings),
			filter: this.#filter(settings, request.note),
			bend: this.#channels[track].bend,
			curve: request.bend,
			source: request.key ? 'live' : 'sequence',
			key: request.key ?? null,
			pan: request.pan
		});
		this.#adopt(voice);
		this.#last[track] = hz;
		return voice;
	}

	/** A synth voice the core computes: the same decisions, sent to the worklet. */
	#spawnCore(
		host: SynthHost,
		request: NoteRequest,
		time: number,
		gate: number,
		hz: number,
		from: number,
		glide: number
	): WorkletVoice {
		const { settings, track } = request;
		this.#steal(time, track);
		const filter = this.#filter(settings, request.note);
		const voice = new WorkletVoice(
			host,
			{
				track,
				engine: settings.engine,
				m1: [...settings.m1],
				velocity: request.velocity,
				start: time,
				gate,
				hz,
				from,
				glide,
				amp: envelopeSeconds(settings.amp),
				peak: velocityGain(request.velocity) * CORE_GAIN * this.#lockedVolume(track, settings),
				filter: {
					type: settings.filter.type,
					hz: filter.hz,
					resonance: settings.filter.resonance,
					envelope: filter.envelope,
					depth: filter.depth
				},
				bend: this.#channels[track].bend,
				curve: request.bend ?? null,
				pan: request.pan ?? 0,
				lfoParam: null
			},
			{ note: request.note, key: request.key ?? null, source: request.key ? 'live' : 'sequence' }
		);
		this.#adopt(voice);
		this.#last[track] = hz;
		return voice;
	}

	/**
	 * A step's locked preset volume against the one the track's strip already applies: the note
	 * plays that much louder or softer.
	 */
	#lockedVolume(track: number, settings: TrackState): number {
		const base = this.#base[track];
		if (!base || base.playMode.volume === settings.playMode.volume) return 1;
		return Math.min(
			4,
			presetGain(settings.playMode.volume) / Math.max(presetGain(base.playMode.volume), 1e-3)
		);
	}

	/**
	 * What a synth sampler plays for `note` (manual: synth-sampler, multisampler): the simulator's
	 * sample on the track, or the zone covering the note, with its root and region, when that file
	 * has audio in the registry.
	 */
	#loaded(
		track: number,
		settings: TrackState,
		note: number
	): { source: SampleSource; root: number; region: SampleRegion } | null {
		const held = this.#sampleArea?.tracks[track];
		if (!held || !this.samples) return null;
		if (settings.engine === 'sampler') {
			const source = held.synth.file ? this.samples.file(held.synth.file.id) : null;
			return source ? { source, root: held.synth.root, region: held.synth.region } : null;
		}
		const zone = zoneOf(held.zones, note)?.zone;
		const source = zone ? this.samples.file(zone.file.id) : null;
		// a zone sounds unpitched on the note it was sampled on, its top key
		return zone && source ? { source, root: zone.note, region: zone.region } : null;
	}

	/** A synth's sources, or a sampler's recording when its file has audio. */
	#source(
		request: NoteRequest,
		hz: number,
		time: number,
		gate: number
	): { graph: SourceGraph; gate: number; gain: number; amp?: Adsr } | null {
		const { settings, track, note } = request;
		if (settings.engine === 'sampler' || settings.engine === 'multisampler') {
			const loaded = this.#loaded(track, settings, note);
			if (loaded) {
				// the region is what the synth samplers' M1 page edits: points, loop, direction, tune, gain
				const { region } = loaded;
				const buffer = this.resources.sample(loaded.source, region.reverse);
				const play = regionSeconds(region, buffer.duration);
				const rate = tuneRate(note - loaded.root + region.tune);
				const graph = bufferSource(
					this.context,
					this.resources,
					{
						buffer,
						rate,
						region: play,
						loop: play.loop,
						pan: 0,
						fade: 0,
						glides: true,
						gain: dbGain(region.gain)
					},
					hz,
					time
				);
				const end = play.loop ? Infinity : time + (play.end - play.start) / rate;
				return { graph, gate: Math.min(gate, end), gain: SAMPLE_GAIN, amp: bufferAmp(settings) };
			}
		}
		const controls = engineControls(settings.engine, settings.m1);
		if (!controls) return null;
		return {
			graph: synthSource(this.context, this.resources, controls, hz, time),
			gate,
			gain: VOICE_GAIN
		};
	}

	/**
	 * A drum key: its sample file's audio, or while it has none the kit sound its name stands for;
	 * tuned, trimmed, panned, in its play mode. An empty key is silent.
	 */
	#drum(request: NoteRequest, time: number, gate: number): void {
		const { track, settings } = request;
		const index = request.note - FIRST_DRUM_NOTE;
		if (index < 0 || index >= 24) return;
		const key = settings.drumKeys[index] ?? defaultDrumKey();
		const keys = this.#sampleArea?.tracks[track]?.keys;
		const file = keys ? (keys[index] ?? null) : undefined;
		if (file === null) return;
		const recording = file ? this.samples?.file(file.id) : null;
		const buffer = recording
			? this.resources.sample(recording, key.reverse)
			: this.resources.drum(kitSound(file?.name ?? null, index), key.reverse);
		const region = sampleRegion(key.start, key.end, buffer.duration);
		const rate = tuneRate(key.tune);
		const looping = key.playMode === 'loop';
		const held = key.playMode === 'key' || looping;
		const end = time + (region.end - region.start) / rate;
		// one sound per key at a time; a mute-group hit cuts the whole group
		for (const v of this.#voices) {
			if (v.track !== track || v.off <= time) continue;
			if (v.note === request.note || (key.playMode === 'mute group' && v.group)) v.kill(time);
		}
		const graph = bufferSource(
			this.context,
			this.resources,
			{
				buffer,
				rate,
				region,
				loop: looping ? region : null,
				pan: Math.max(-1, Math.min(1, panValue(key.pan) + (request.pan ?? 0))),
				fade: fadeSeconds(key.fade, region.end - region.start),
				glides: false,
				gain: dbGain(key.gain)
			},
			noteHz(request.note),
			time
		);
		this.#steal(time, track);
		const amp = bufferAmp(settings);
		const hz = noteHz(request.note);
		const voice = new Voice(this.context, graph, this.#channels[track].input, {
			track,
			note: request.note,
			start: time,
			gate: looping ? gate : held ? Math.min(gate, end - ONESHOT_RELEASE) : end - ONESHOT_RELEASE,
			hz,
			from: hz,
			glide: 0,
			amp: held ? amp : oneshotAmp(amp),
			peak: velocityGain(request.velocity) * DRUM_GAIN * this.#lockedVolume(track, settings),
			filter: this.#filter(settings, request.note),
			bend: this.#channels[track].bend,
			curve: request.bend,
			source: request.key ? 'live' : 'sequence',
			// a oneshot plays to its end whatever the key does
			key: held ? (request.key ?? null) : null,
			group: key.playMode === 'mute group'
		});
		this.#adopt(voice);
	}

	/** Makes room for a note at `time` on `track`. */
	#steal(time: number, track: number): void {
		const candidates = this.#voices.filter((v) => !v.killed);
		victim(candidates, time, track, this.#limit)?.kill(time);
	}

	#adopt(voice: AnyVoice): void {
		voice.attach(this.#channels[voice.track].modulation());
		voice.onended = (done: AnyVoice) => {
			this.#voices = this.#voices.filter((v) => v !== done);
			const mono = this.#mono[done.track];
			if (mono?.voice === done) mono.voice = null;
		};
		if (!voice.disposed) this.#voices.push(voice);
	}

	/** The track's filter for a note (key tracking moves the cutoff with the note). */
	#filter(settings: TrackState, note: number): VoiceFilter {
		const f = settings.filter;
		return {
			design: filterDesign(f.type),
			hz: cutoffHz(f.cutoff) * Math.pow(2, keyTrackCents(f.keyTracking, note) / 1200),
			q: resonanceQ(f.resonance, f.type),
			envelope: envelopeSeconds(settings.filterEnv),
			depth: envAmountCents(f.envAmount)
		};
	}

	/** A note on track `source` dips every track whose LFO ducks on it. */
	#duckFrom(source: number, time: number): void {
		this.#channels.forEach((channel, k) => {
			const route = channel.route;
			if (k !== source && route.kind === 'duck' && route.source === source) {
				channel.duck(time, route.depth, route.hold, route.release);
			}
		});
	}
}
