/**
 * The sound sources of a voice, one builder per engine: oscillators, FM, noise and buffers wired in
 * Web Audio. Each returns a {@link SourceGraph} — what the voice needs to start, stop, glide, bend
 * and modulate it — and the voice adds the envelopes and filter every engine shares. These are
 * tasteful approximations of TE's engines as the manual describes them (instrument/engine-*),
 * synthesized from scratch:
 *
 * - prism: a detuned, stereo-spread pair plus a third oscillator at a musical ratio;
 * - epiano: two-operator FM (1:1) with a 14:1 tine strike and optional saturation;
 * - organ: drawbar registrations on one oscillator an octave down, a separate 16′ sine, percussion;
 * - wavetable: crossfaded neighbouring frames, bent by phase modulation (warp) at a drifting ratio;
 * - axis: two FM operator pairs a detune or a fifth-stack apart, their brightness bowed in;
 * - dissolve: triangle oscillators shaken by noise, AM and FM, with a noise band on the note;
 * - hardsync: the spectrum of a synced saw (per ratio), noise and a low cut over a sub oscillator;
 * - simple: sine to pulse (saw minus a delayed saw, so the width moves smoothly), noise, a double;
 * - soft: the samplers' stand-in, a rounded sine.
 */
import type { Adsr, EngineControls, Region } from './mapping';
import { ORGAN_MODELS, WAVETABLE_FRAMES } from './mapping';
import type { Resources } from './resources';
import {
	blend,
	organSpectrum,
	pulseSpectrum,
	sawSpectrum,
	sineSpectrum,
	bandSpectrum,
	softSpectrum,
	syncSpectrum,
	triangleSpectrum,
	wavetableFrame,
	type Spectrum
} from './waves';

/** A parameter that follows the note: its value is the note's frequency × `ratio`. */
export interface Pitched {
	readonly param: AudioParam;
	ratio: number;
}

/** An M1 parameter's reach for the LFO: the AudioParam it moves and how far at full depth. */
export interface ModTarget {
	readonly param: AudioParam;
	readonly scale: number;
}

/** A voice's sources, ready to play. */
export interface SourceGraph {
	/** Where the sound comes out (mono or stereo). */
	readonly output: AudioNode;
	readonly pitched: readonly Pitched[];
	/** Detune parameters (cents), for pitch bend and vibrato. */
	readonly detune: readonly AudioParam[];
	/** Per M1 parameter (0–3), what the LFO can move. */
	readonly mods: Readonly<Partial<Record<number, readonly ModTarget[]>>>;
	/** Level the engine sits at before velocity, so engines match in loudness. */
	readonly level: number;
	start(time: number): void;
	/** Stops every source at `time`; a later call replaces an earlier one. */
	stop(time: number): void;
	/** Called once, when the sources have stopped. */
	onended: (() => void) | null;
	/** Disconnects everything. */
	dispose(): void;
	/** Re-tunes what does not scale with pitch (a pulse's delay) to `hz`. */
	retune?(hz: number, time: number, tau: number): void;
	/**
	 * The key lets go at `time` (Infinity: held on after all, a legato note carrying it): a loop that
	 * lasts until release plays on from there to its region's end. A later call replaces an earlier.
	 */
	leave?(time: number): void;
	/** Live M1 changes on a sounding note, where the engine can take them. */
	update?(controls: EngineControls, hz: number, time: number): void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Cents as a frequency ratio. */
export const cents = (c: number): number => Math.pow(2, c / 1200);

/** The multisampler's stand-in ({@link band}): its band's centre on C2 and how it climbs. */
const BAND_ROOT = 65.41;
const BAND_HZ = 260;
const BAND_Q = 0.9;
/** The highs let back up above the band: a shelf (Hz, dB). */
const BAND_AIR_HZ = 2500;
const BAND_AIR_DB = 8;
/** Cents each copy sits off the note. */
const BAND_DETUNE = 9;
/** The octave below, against the band's peak (−10 dB). */
const BAND_SUB = 0.1;
/** Where the swell starts (−10 dB) and its time constant (s): the unit's pad grows 10 dB in 3 s. */
const BAND_SWELL = 0.32;
const BAND_SWELL_SECONDS = 1.9;
/** Its level on C3, set against the unit's T8 (−37 dBFS in the sustain at velocity 100), and how
 * much louder it plays an octave up (dB). */
const BAND_C3 = 130.81;
const BAND_LEVEL = 0.74;
const BAND_PER_OCTAVE = 4.6;

/** The oscillator's own waveforms. */
type BuiltInWave = 'sine' | 'triangle' | 'sawtooth' | 'square';
const isBuiltIn = (wave: BuiltInWave | PeriodicWave): wave is BuiltInWave =>
	typeof wave === 'string';

/** Collects a voice's nodes as a builder wires them. */
export class Graph {
	readonly nodes: AudioNode[] = [];
	readonly pitched: Pitched[] = [];
	readonly detune: AudioParam[] = [];
	readonly mods: Record<number, ModTarget[]> = {};
	readonly #sources: { node: AudioScheduledSourceNode; offset?: number; duration?: number }[] = [];

	constructor(
		readonly context: BaseAudioContext,
		readonly resources: Resources,
		/** The note's frequency. */
		readonly hz: number,
		/** When the voice starts (for automation the builder lays down). */
		readonly start: number
	) {}

	gain(value: number): GainNode {
		const node = this.context.createGain();
		node.gain.value = value;
		this.nodes.push(node);
		return node;
	}

	/** An oscillator at the note × `ratio`, bent with the others. */
	osc(wave: BuiltInWave | PeriodicWave, ratio = 1): OscillatorNode {
		const node = this.context.createOscillator();
		if (isBuiltIn(wave)) node.type = wave;
		else node.setPeriodicWave(wave);
		this.follow(node.frequency, ratio);
		this.detune.push(node.detune);
		this.#sources.push({ node });
		this.nodes.push(node);
		return node;
	}

	/** Makes a parameter follow the note (a filter tuned to it, an FM depth in hertz). */
	follow(param: AudioParam, ratio: number): Pitched {
		param.value = this.hz * ratio;
		const entry = { param, ratio };
		this.pitched.push(entry);
		return entry;
	}

	/** Changes a followed parameter's ratio on a sounding note. */
	retarget(entry: Pitched, ratio: number, hz: number, time: number): void {
		entry.ratio = ratio;
		entry.param.setTargetAtTime(hz * ratio, time, 0.02);
	}

	/** Looping white noise, from a random point so voices do not share it. */
	noise(): AudioBufferSourceNode {
		const node = this.context.createBufferSource();
		node.buffer = this.resources.noise;
		node.loop = true;
		this.#sources.push({ node, offset: Math.random() * node.buffer.duration });
		this.nodes.push(node);
		return node;
	}

	/** A buffer played from `offset` for `duration` seconds of the buffer (to the end if omitted). */
	buffer(node: AudioBufferSourceNode, offset: number, duration?: number): void {
		this.#sources.push({ node, offset, duration });
		this.nodes.push(node);
		this.detune.push(node.detune);
	}

	filter(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
		const node = this.context.createBiquadFilter();
		node.type = type;
		node.frequency.value = frequency;
		node.Q.value = q;
		this.nodes.push(node);
		return node;
	}

	panner(pan: number): StereoPannerNode {
		const node = this.context.createStereoPanner();
		node.pan.value = clamp(pan, -1, 1);
		this.nodes.push(node);
		return node;
	}

	delay(max: number): DelayNode {
		const node = this.context.createDelay(max);
		this.nodes.push(node);
		return node;
	}

	/** A tanh saturator. */
	shaper(drive: number): WaveShaperNode {
		const node = this.context.createWaveShaper();
		node.curve = tanhCurve(drive);
		this.nodes.push(node);
		return node;
	}

	/** Lets the LFO reach `param` through M1 parameter `index`. */
	mod(index: number, param: AudioParam, scale: number): void {
		(this.mods[index] ??= []).push({ param, scale });
	}

	/** The finished graph. */
	finish(
		output: AudioNode,
		level: number,
		extra: Pick<SourceGraph, 'retune' | 'update'> = {}
	): SourceGraph {
		const sources = this.#sources;
		const nodes = this.nodes;
		const graph: SourceGraph = {
			output,
			pitched: this.pitched,
			detune: this.detune,
			mods: this.mods,
			level,
			onended: null,
			start(time) {
				for (const s of sources) {
					if (s.offset === undefined) s.node.start(time);
					else (s.node as AudioBufferSourceNode).start(time, s.offset, s.duration);
				}
			},
			stop(time) {
				for (const s of sources) {
					try {
						s.node.stop(time);
					} catch {
						// already stopped: nothing to change
					}
				}
			},
			dispose() {
				for (const node of nodes) node.disconnect();
			},
			...extra
		};
		const first = sources[0]?.node;
		if (first) first.onended = () => graph.onended?.();
		return graph;
	}
}

/** Saturation curves by drive (a handful of values ever get used). */
const CURVES = new Map<number, Float32Array<ArrayBuffer>>();

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
	const key = Math.round(drive * 20) / 20;
	let curve = CURVES.get(key);
	if (!curve) {
		const norm = Math.tanh(key);
		curve = Float32Array.from(
			{ length: 1025 },
			(_, i) => Math.tanh(((i - 512) / 512) * key) / norm
		);
		CURVES.set(key, curve);
	}
	return curve;
}

/** The classic shapes the prism, axis and simple engines morph through. */
const SHAPES: readonly (() => Spectrum)[] = [
	sineSpectrum,
	triangleSpectrum,
	sawSpectrum,
	() => pulseSpectrum(0.5)
];

/**
 * A waveform between the classic shapes (0 sine, 1 triangle, 2 saw, 3 square), in quarter steps so
 * only a few ever need building.
 */
function shapeWave(resources: Resources, position: number): PeriodicWave {
	const q = Math.round(clamp(position, 0, 3) * 4) / 4;
	return resources.wave(`shape:${q}`, () => {
		const i = Math.min(2, Math.floor(q));
		const x = q - i;
		return x === 0 ? SHAPES[i]() : blend(SHAPES[i](), SHAPES[i + 1](), x);
	});
}

const organWave = (resources: Resources, model: number) =>
	resources.wave(`organ:${model}`, () => organSpectrum(model));

const syncWave = (resources: Resources, ratio: number) =>
	resources.wave(`sync:${ratio.toFixed(3)}`, () => syncSpectrum(ratio));

const frameWave = (resources: Resources, table: number, frame: number) =>
	resources.wave(`table:${table}:${frame}`, () => wavetableFrame(table, frame));

/** The two frames around a wavetable position and the weight of the second. */
function frames(position: number): [number, number, number] {
	const first = clamp(Math.floor(position), 0, WAVETABLE_FRAMES - 1);
	const second = Math.min(WAVETABLE_FRAMES - 1, first + 1);
	return [first, second, clamp(position - first, 0, 1)];
}

// ─────────────────────────────────────────────────────────── engines

function prism(g: Graph, c: Extract<EngineControls, { engine: 'prism' }>): SourceGraph {
	const wave = shapeWave(g.resources, c.shape);
	const out = g.gain(1);
	const pair = [-1, 1].map((side) => {
		const osc = g.osc(wave, cents((side * c.detune) / 2));
		const level = g.gain(0.5);
		const pan = g.panner(side * c.spread);
		osc.connect(level).connect(pan).connect(out);
		g.mod(2, osc.detune, side * 15);
		g.mod(3, pan.pan, side * 0.45);
		return { osc, pan, pitched: g.pitched[g.pitched.length - 1] };
	});
	const third = g.osc(wave, c.ratio);
	const thirdPitch = g.pitched[g.pitched.length - 1];
	third.connect(g.gain(0.35)).connect(out);
	g.mod(1, third.detune, 1200);
	return g.finish(out, 0.55, {
		update(next, hz, time) {
			if (next.engine !== 'prism') return;
			const w = shapeWave(g.resources, next.shape);
			for (const o of [pair[0].osc, pair[1].osc, third]) o.setPeriodicWave(w);
			pair.forEach(({ pan, pitched }, i) => {
				const side = i === 0 ? -1 : 1;
				g.retarget(pitched, cents((side * next.detune) / 2), hz, time);
				pan.pan.setTargetAtTime(side * next.spread, time, 0.02);
			});
			g.retarget(thirdPitch, next.ratio, hz, time);
		}
	});
}

function epiano(g: Graph, c: Extract<EngineControls, { engine: 'epiano' }>): SourceGraph {
	const { hz, start } = g;
	const carrier = g.osc('sine');
	// the body: a 1:1 modulator whose brightness barks at the strike and settles
	const body = g.osc('sine', 1);
	const bodyDepth = g.gain(0);
	bodyDepth.gain.setValueAtTime(hz * c.index * (1 + 3 * c.punch), start);
	bodyDepth.gain.setTargetAtTime(hz * c.index, start, 0.12 + 0.3 * (1 - c.punch));
	body.connect(bodyDepth).connect(carrier.frequency);
	// the tine: a 14:1 modulator that clangs for a few tens of milliseconds
	const tine = g.osc('sine', 14);
	const tineDepth = g.gain(0);
	tineDepth.gain.setValueAtTime(hz * 14 * c.tine, start);
	tineDepth.gain.setTargetAtTime(0, start, 0.025);
	tine.connect(tineDepth).connect(carrier.frequency);
	const bark = g.gain(1);
	bark.gain.setValueAtTime(1 + 0.5 * c.punch, start);
	bark.gain.setTargetAtTime(1, start, 0.06);
	let last: AudioNode = carrier;
	if (c.drive > 1.05) last = last.connect(g.shaper(c.drive));
	last.connect(bark);
	g.mod(0, bodyDepth.gain, hz * 0.8);
	return g.finish(bark, 0.45, {
		update(next, noteHz, time) {
			if (next.engine === 'epiano') bodyDepth.gain.setTargetAtTime(noteHz * next.index, time, 0.03);
		}
	});
}

function organ(g: Graph, c: Extract<EngineControls, { engine: 'organ' }>): SourceGraph {
	const out = g.gain(1);
	// everything above the 16′ on one oscillator an octave down (so the 5⅓′ quint fits)
	const main = g.osc(organWave(g.resources, c.model), 0.5);
	main.connect(out);
	const bass = g.osc('sine', 0.5);
	const bassLevel = g.gain(c.bass);
	bass.connect(bassLevel).connect(out);
	g.mod(1, bassLevel.gain, 0.4);
	if (ORGAN_MODELS[c.model] === 'jazz') {
		// second-harmonic-of-the-quint percussion (2⅔′), decaying like the real thing
		const percussion = g.osc('sine', 3);
		const level = g.gain(0);
		level.gain.setValueAtTime(0.45, g.start);
		level.gain.setTargetAtTime(0, g.start, 0.22);
		percussion.connect(level).connect(out);
	}
	let model = c.model;
	return g.finish(out, 0.4, {
		update(next, _hz, time) {
			if (next.engine !== 'organ') return;
			bassLevel.gain.setTargetAtTime(next.bass, time, 0.02);
			if (next.model !== model) main.setPeriodicWave(organWave(g.resources, (model = next.model)));
		}
	});
}

function wavetable(g: Graph, c: Extract<EngineControls, { engine: 'wavetable' }>): SourceGraph {
	const [f0, f1, x] = frames(c.position);
	const a = g.osc(frameWave(g.resources, c.table, f0));
	const b = g.osc(frameWave(g.resources, c.table, f1));
	const levelA = g.gain(1 - x);
	const levelB = g.gain(x);
	const out = g.gain(1);
	a.connect(levelA).connect(out);
	b.connect(levelB).connect(out);
	// warp: phase modulation from a sine at the drift ratio (1 = on the note, more = inharmonic)
	const modulator = g.osc('sine', c.drift);
	const modPitch = g.pitched[g.pitched.length - 1];
	const depth = g.gain(0);
	const depthPitch = g.follow(depth.gain, c.warp * c.drift);
	modulator.connect(depth);
	depth.connect(a.frequency);
	depth.connect(b.frequency);
	g.mod(1, levelA.gain, -0.5);
	g.mod(1, levelB.gain, 0.5);
	g.mod(2, depth.gain, g.hz * c.drift);
	g.mod(3, modulator.detune, 700);
	let shown = `${c.table}:${f0}:${f1}`;
	return g.finish(out, 0.72, {
		update(next, hz, time) {
			if (next.engine !== 'wavetable') return;
			const [n0, n1, nx] = frames(next.position);
			if (`${next.table}:${n0}:${n1}` !== shown) {
				shown = `${next.table}:${n0}:${n1}`;
				a.setPeriodicWave(frameWave(g.resources, next.table, n0));
				b.setPeriodicWave(frameWave(g.resources, next.table, n1));
			}
			levelA.gain.setTargetAtTime(1 - nx, time, 0.02);
			levelB.gain.setTargetAtTime(nx, time, 0.02);
			g.retarget(modPitch, next.drift, hz, time);
			g.retarget(depthPitch, next.warp * next.drift, hz, time);
		}
	});
}

function axis(g: Graph, c: Extract<EngineControls, { engine: 'axis' }>): SourceGraph {
	const { hz, start } = g;
	const wave = shapeWave(g.resources, c.shape);
	const out = g.gain(1);
	const ratio = cents(c.interval);
	const pairs = [1, ratio].map((r) => {
		const carrier = g.osc(wave, r);
		const carrierPitch = g.pitched[g.pitched.length - 1];
		const modulator = g.osc('sine', r);
		const modPitch = g.pitched[g.pitched.length - 1];
		const depth = g.gain(0);
		// the bow: brightness swells in instead of striking
		depth.gain.setValueAtTime(hz * r * c.index * 0.3, start);
		depth.gain.setTargetAtTime(hz * r * c.index, start, 0.09);
		modulator.connect(depth).connect(carrier.frequency);
		carrier.connect(g.gain(0.5)).connect(out);
		g.mod(0, depth.gain, hz * r * 0.6);
		return { carrier, depth, carrierPitch, modPitch };
	});
	g.mod(1, pairs[1].carrier.detune, 100);
	return g.finish(out, 0.55, {
		update(next, noteHz, time) {
			if (next.engine !== 'axis') return;
			const w = shapeWave(g.resources, next.shape);
			const r = cents(next.interval);
			pairs.forEach((p, i) => {
				const pr = i === 0 ? 1 : r;
				p.carrier.setPeriodicWave(w);
				g.retarget(p.carrierPitch, pr, noteHz, time);
				g.retarget(p.modPitch, pr, noteHz, time);
				p.depth.gain.setTargetAtTime(noteHz * pr * next.index, time, 0.03);
			});
		}
	});
}

function dissolve(g: Graph, c: Extract<EngineControls, { engine: 'dissolve' }>): SourceGraph {
	const out = g.gain(1);
	const grit = g.gain(1 - c.am * 0.5);
	const carriers = [g.osc('triangle')];
	if (c.detune > 0.5) carriers.push(g.osc('triangle', cents(c.detune)));
	for (const osc of carriers) osc.connect(g.gain(1 / carriers.length)).connect(grit);
	// FM at twice the pitch: tonal colour
	const fmOsc = g.osc('sine', 2);
	const fm = g.gain(0);
	const fmPitch = g.follow(fm.gain, 2 * c.fm);
	fmOsc.connect(fm);
	// swarm: noise shaking the pitch; air: noise tuned to the note
	const noise = g.noise();
	const smooth = g.filter('lowpass', 0, 0);
	g.follow(smooth.frequency, 2);
	const swarm = g.gain(0);
	const swarmPitch = g.follow(swarm.gain, c.swarm);
	noise.connect(smooth).connect(swarm);
	for (const osc of carriers) {
		fm.connect(osc.frequency);
		swarm.connect(osc.frequency);
	}
	const band = g.filter('bandpass', 0, 8);
	g.follow(band.frequency, 1);
	const air = g.gain(c.air * 10);
	noise.connect(band).connect(air).connect(out);
	// AM at 1.5 × the pitch: sidebands off the harmonic series, for grit
	const amOsc = g.osc('sine', 1.5);
	const am = g.gain(c.am * 0.5);
	amOsc.connect(am).connect(grit.gain);
	grit.connect(out);
	g.mod(0, swarm.gain, g.hz * 0.8);
	g.mod(1, am.gain, 0.4);
	g.mod(2, fm.gain, g.hz * 2);
	if (carriers[1]) g.mod(3, carriers[1].detune, 30);
	return g.finish(out, 0.62, {
		update(next, hz, time) {
			if (next.engine !== 'dissolve') return;
			g.retarget(fmPitch, 2 * next.fm, hz, time);
			g.retarget(swarmPitch, next.swarm, hz, time);
			air.gain.setTargetAtTime(next.air * 10, time, 0.02);
			am.gain.setTargetAtTime(next.am * 0.5, time, 0.02);
			grit.gain.setTargetAtTime(1 - next.am * 0.5, time, 0.02);
		}
	});
}

function hardsync(g: Graph, c: Extract<EngineControls, { engine: 'hardsync' }>): SourceGraph {
	const out = g.gain(1);
	const main = g.osc(syncWave(g.resources, c.ratio));
	const lowcut = g.filter('highpass', c.lowcut, 0);
	main.connect(lowcut);
	const noise = g.noise();
	const bright = g.filter('highpass', 2000, 0);
	const noiseLevel = g.gain(c.noise);
	noise.connect(bright).connect(noiseLevel).connect(lowcut);
	lowcut.connect(out);
	// the sub stays under the low cut, so a thin sync tone can still sit on a solid bottom
	const sub = g.osc('triangle', 0.5);
	const subLevel = g.gain(c.sub);
	sub.connect(subLevel).connect(out);
	g.mod(1, subLevel.gain, 0.4);
	g.mod(2, noiseLevel.gain, 0.3);
	g.mod(3, lowcut.detune, 2400);
	let ratio = c.ratio;
	return g.finish(out, 0.5, {
		update(next, _hz, time) {
			if (next.engine !== 'hardsync') return;
			if (next.ratio !== ratio) main.setPeriodicWave(syncWave(g.resources, (ratio = next.ratio)));
			subLevel.gain.setTargetAtTime(next.sub, time, 0.02);
			noiseLevel.gain.setTargetAtTime(next.noise, time, 0.02);
			lowcut.frequency.setTargetAtTime(next.lowcut, time, 0.02);
		}
	});
}

function simple(g: Graph, c: Extract<EngineControls, { engine: 'simple' }>): SourceGraph {
	const out = g.gain(1);
	const sides = c.spread > 0.01 ? [-1, 1] : [0];
	const delays: { node: DelayNode; ratio: number }[] = [];
	const pans: StereoPannerNode[] = [];
	for (const side of sides) {
		// the double sits a few cents away, panned apart
		const ratio = cents(side * 6 * c.spread);
		const pan = g.panner(side * 0.8 * c.spread);
		const level = g.gain(1 / sides.length);
		if (c.shape <= 2) g.osc(shapeWave(g.resources, c.shape), ratio).connect(level);
		else {
			// towards pulse: a saw minus the same saw a duty-cycle later
			const saw = g.osc('sawtooth', ratio);
			const late = g.delay(0.1);
			late.delayTime.value = c.duty / (g.hz * ratio);
			delays.push({ node: late, ratio });
			saw.connect(level);
			saw
				.connect(late)
				.connect(g.gain(-(c.shape - 2)))
				.connect(level);
			g.mod(1, late.delayTime, 0.4 / (g.hz * ratio));
		}
		level.connect(pan).connect(out);
		pans.push(pan);
	}
	const noise = g.noise();
	const noiseLevel = g.gain(c.noise);
	noise.connect(noiseLevel).connect(out);
	g.mod(2, noiseLevel.gain, 0.3);
	pans.forEach((pan, i) => g.mod(3, pan.pan, sides[i] * 0.4));
	let duty = c.duty;
	return g.finish(out, 0.55, {
		retune(hz, time, tau) {
			for (const d of delays) {
				if (tau > 0) d.node.delayTime.setTargetAtTime(duty / (hz * d.ratio), time, tau);
				else d.node.delayTime.setValueAtTime(duty / (hz * d.ratio), time);
			}
		},
		update(next, hz, time) {
			if (next.engine !== 'simple') return;
			duty = next.duty;
			for (const d of delays) d.node.delayTime.setTargetAtTime(duty / (hz * d.ratio), time, 0.02);
			noiseLevel.gain.setTargetAtTime(next.noise, time, 0.02);
		}
	});
}

function soft(g: Graph): SourceGraph {
	const osc = g.osc(g.resources.wave('soft', softSpectrum));
	return g.finish(osc, 0.45);
}

/**
 * The multisampler's stand-in, modelled on a new project's pad/bandpasser as the owner's unit plays
 * it (2026-09-29): a flat harmonic series in two copies detuned apart and panned hard left and
 * right, through a band that climbs half an octave per octave (260 Hz on C2, 520 Hz on C4) with the
 * highs let back up past 2.5 kHz; an octave below, 10 dB down and kept to its first harmonics
 * outside the band; louder up the keyboard, swelling in by 10 dB over its first three seconds. Our
 * own synthesis, not TE's samples.
 */
function band(g: Graph): SourceGraph {
	const wave = g.resources.wave('band', bandSpectrum);
	const out = g.gain(1);
	const swell = g.gain(BAND_SWELL);
	swell.gain.setTargetAtTime(1, g.start, BAND_SWELL_SECONDS);
	swell.connect(out);
	const filter = g.filter('bandpass', 0, BAND_Q);
	g.follow(filter.frequency, (BAND_HZ / BAND_ROOT) * Math.sqrt(BAND_ROOT / g.hz));
	const air = g.filter('highshelf', BAND_AIR_HZ, 0);
	air.gain.value = BAND_AIR_DB;
	filter.connect(air).connect(swell);
	for (const side of [-1, 1]) {
		const osc = g.osc(wave);
		osc.detune.value = side * BAND_DETUNE;
		const pan = g.panner(side);
		osc.connect(pan).connect(filter);
	}
	const sub = g.osc(wave, 0.5);
	const subTone = g.filter('lowpass', 0, 0.7);
	g.follow(subTone.frequency, 1);
	const subLevel = g.gain(BAND_SUB);
	sub.connect(subTone).connect(subLevel).connect(swell);
	return g.finish(out, BAND_LEVEL * Math.pow(g.hz / BAND_C3, BAND_PER_OCTAVE / 6.02));
}

/** Builds the sources of a synth voice at `hz`, starting at `start`. */
export function synthSource(
	context: BaseAudioContext,
	resources: Resources,
	controls: EngineControls,
	hz: number,
	start: number
): SourceGraph {
	const g = new Graph(context, resources, hz, start);
	switch (controls.engine) {
		case 'prism':
			return prism(g, controls);
		case 'epiano':
			return epiano(g, controls);
		case 'organ':
			return organ(g, controls);
		case 'wavetable':
			return wavetable(g, controls);
		case 'axis':
			return axis(g, controls);
		case 'dissolve':
			return dissolve(g, controls);
		case 'hardsync':
			return hardsync(g, controls);
		case 'simple':
			return simple(g, controls);
		case 'soft':
			return soft(g);
		case 'band':
			return band(g);
	}
}

/** How a buffer plays (a drum key or a sampler note). */
export interface BufferPlay {
	readonly buffer: AudioBuffer;
	/** Playback rate at the note. */
	readonly rate: number;
	/** The stretch of the buffer that plays. */
	readonly region: Region;
	/** Where it repeats while held (null plays through once). */
	readonly loop: Region | null;
	/** −1…1 (drum key pan). */
	readonly pan: number;
	/** Seconds the sound fades in over from its start (drum key fade, research 60 §5). */
	readonly fade: number;
	/** Seconds of the loop's end crossfaded into what precedes its start (synth sampler). */
	readonly crossfade?: number;
	/** The loop ends when the key lets go, and the region plays on to its end (synth sampler). */
	readonly untilRelease?: boolean;
	/** Follows portamento (samplers) or keeps its tune (drums). */
	readonly glides: boolean;
	/** Level of the recording (drum key gain). */
	readonly gain: number;
}

/** The sources of a voice that plays a buffer. */
export function bufferSource(
	context: BaseAudioContext,
	resources: Resources,
	play: BufferPlay,
	hz: number,
	start: number
): SourceGraph {
	const g = new Graph(context, resources, hz, start);
	const source = context.createBufferSource();
	source.buffer =
		play.loop && play.crossfade
			? resources.crossfaded(play.buffer, play.loop.start, play.loop.end, play.crossfade)
			: play.buffer;
	source.playbackRate.value = play.rate;
	const length = play.region.end - play.region.start;
	if (play.loop) {
		source.loop = true;
		source.loopStart = play.loop.start;
		source.loopEnd = play.loop.end;
	}
	g.buffer(source, play.region.start, play.loop ? undefined : length);
	if (play.glides) g.pitched.push({ param: source.playbackRate, ratio: play.rate / hz });
	const level = g.gain(play.gain);
	// a loop until release goes through a gain of its own, which hands over to the tail at release
	const looped = play.loop && play.untilRelease ? g.gain(1) : null;
	if (looped) source.connect(looped).connect(level);
	else source.connect(level);
	if (play.fade > 0) {
		// a linear fade-in of a fixed time from the start marker, as the device plays it
		level.gain.setValueAtTime(0, start);
		level.gain.linearRampToValueAtTime(play.gain, start + play.fade);
	}
	let out: AudioNode = level;
	if (play.pan !== 0) out = level.connect(g.panner(play.pan));
	const graph = g.finish(out, 1);
	return looped && play.loop
		? untilRelease(graph, context, source, looped, level, { ...play, loop: play.loop }, start)
		: graph;
}

/** The crossfade (s) from a loop until release to the rest of its region. */
const LEAVE_FADE = 0.004;

/**
 * Where a buffer started at `start` from `region.start` stands at `time`, looping over `loop`
 * (seconds of the buffer, at `rate`).
 */
export function loopPosition(
	play: { readonly region: Region; readonly loop: Region; readonly rate: number },
	start: number,
	time: number
): number {
	const at = play.region.start + Math.max(0, time - start) * play.rate;
	const span = play.loop.end - play.loop.start;
	if (at < play.loop.end || span <= 0) return at;
	return play.loop.start + ((at - play.loop.end) % span);
}

/**
 * A loop until release: when the key lets go, a second source plays on from where the loop stands
 * to the region's end, faded in over a few milliseconds while the loop fades out. The voice ends
 * with that tail (or its release, whichever is first).
 */
function untilRelease(
	graph: SourceGraph,
	context: BaseAudioContext,
	source: AudioBufferSourceNode,
	looped: GainNode,
	level: GainNode,
	play: BufferPlay & { readonly loop: Region },
	start: number
): SourceGraph {
	let tail: { node: AudioBufferSourceNode; fade: GainNode; at: number } | null = null;
	let stopAt = Infinity;
	const ended = () => graph.onended?.();
	const drop = () => {
		if (!tail) return;
		try {
			// not started yet: it never sounds
			tail.node.stop(tail.at);
		} catch {
			// already stopped
		}
		tail.node.onended = null;
		tail = null;
	};
	const base = { stop: graph.stop, dispose: graph.dispose };
	const leaving: SourceGraph = {
		...graph,
		start: (time) => graph.start(time),
		stop(time) {
			stopAt = time;
			base.stop(time);
			if (tail) tail.node.stop(Math.max(time, tail.at));
		},
		dispose() {
			base.dispose();
			if (tail) {
				tail.node.disconnect();
				tail.fade.disconnect();
			}
		},
		leave(time) {
			drop();
			looped.gain.cancelScheduledValues(0);
			looped.gain.setValueAtTime(1, start);
			if (!Number.isFinite(time)) {
				// held on after all: the loop sounds on, and its own end ends the voice
				source.onended = ended;
				return;
			}
			const at = Math.max(time, start);
			const from = loopPosition(play, start, at);
			const node = context.createBufferSource();
			node.buffer = source.buffer;
			node.playbackRate.value = play.rate;
			const fade = context.createGain();
			fade.gain.setValueAtTime(0, at);
			fade.gain.linearRampToValueAtTime(1, at + LEAVE_FADE);
			node.connect(fade).connect(level);
			node.start(at, from, Math.max(0.001, play.region.end - from));
			if (Number.isFinite(stopAt)) node.stop(Math.max(stopAt, at));
			looped.gain.setValueAtTime(1, at);
			looped.gain.linearRampToValueAtTime(0, at + LEAVE_FADE);
			source.onended = null;
			source.stop(at + LEAVE_FADE);
			node.onended = ended;
			tail = { node, fade, at };
		}
	};
	return leaving;
}

/** An envelope shape for voices whose sound ends with their buffer: no sustain to speak of. */
export const ONESHOT_RELEASE = 0.004;

/** Voice-level ADSR where a buffer's end is the end (keeps attack, decay and sustain). */
export const oneshotAmp = (amp: Adsr): Adsr => ({ ...amp, release: ONESHOT_RELEASE });
