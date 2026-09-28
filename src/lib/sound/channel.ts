/**
 * An instrument track's strip: voices in, then tremolo, duck, preset volume (M2 + shift), the mixer's
 * level and pan, and post-fader sends to FX I and FX II (M3 + shift, or mix M1). It also runs the
 * track's LFO (M4) — a wave the voices wire into their filter, pitch or M1 parameters, or that
 * wobbles the level (tremolo) — the engine's own tremolo (organ, axis), and the duck that dips the
 * level when another track plays. Settings arrive as the simulator's track state; only what changed
 * is applied, gliding over 10 ms so nothing zippers.
 *
 * A mute is not here: it stops the track's notes, not its audio (manual: mix/mute-solo), so the
 * scheduler leaves the sequence's notes out while what already sounds rings on, and keys still play.
 */
import type { TrackState } from '$lib/sim/params';
import {
	LFO_CUTOFF_CENTS,
	LFO_RESONANCE_DB,
	engineControls,
	levelGain,
	lfoRoute,
	panValue,
	presetGain,
	sendGain,
	type LfoRoute
} from './mapping';
import type { Resources } from './resources';
import type { VoiceModulation } from './voice';
import { RANDOM_STEPS, randomStepsSpectrum } from './waves';

/** Glide for mixer moves, in seconds (time constant). */
const SMOOTH = 0.01;

/** The running LFO: its oscillator and what it feeds. */
interface Lfo {
	osc: OscillatorNode;
	readonly wave: 'sine' | 'random';
	/** The wave at its depth (±1 × depth): what engine targets scale. */
	readonly unit: GainNode;
	/** Cents for the cutoff, decibels for the resonance, cents of vibrato. */
	readonly cutoff: GainNode;
	readonly resonance: GainNode;
	readonly vibrato: GainNode;
	/** Into the tremolo stage's gain. */
	readonly volume: GainNode;
}

/** An instrument track's channel strip. */
export class Channel {
	/** Where the track's voices connect. */
	readonly input: GainNode;
	/** Bumped whenever voices must re-wire to the LFO (it was routed elsewhere). */
	version = 0;
	/** Pitch bend on this track, in cents. */
	bend = 0;

	readonly #context: BaseAudioContext;
	readonly #resources: Resources;
	readonly #tremolo: GainNode;
	readonly #duck: GainNode;
	readonly #preset: GainNode;
	readonly #level: GainNode;
	readonly #pan: StereoPannerNode;
	readonly #sends: [GainNode, GainNode];
	#route: LfoRoute = { kind: 'none' };
	#lfo: Lfo | null = null;
	#engineTremolo: { osc: OscillatorNode; depth: GainNode; amount: number } | null = null;
	#lfoVolume = 0;
	#applied = new Map<string, number | string>();

	constructor(
		context: BaseAudioContext,
		resources: Resources,
		destination: AudioNode,
		fx: readonly [AudioNode, AudioNode]
	) {
		this.#context = context;
		this.#resources = resources;
		const gain = (value = 1) => {
			const node = context.createGain();
			node.gain.value = value;
			return node;
		};
		this.input = gain();
		this.#tremolo = gain();
		this.#duck = gain();
		this.#preset = gain();
		this.#level = gain();
		this.#pan = context.createStereoPanner();
		this.#sends = [gain(0), gain(0)];
		this.input
			.connect(this.#tremolo)
			.connect(this.#duck)
			.connect(this.#preset)
			.connect(this.#level)
			.connect(this.#pan)
			.connect(destination);
		this.#sends.forEach((send, i) => {
			this.#pan.connect(send);
			send.connect(fx[i]);
		});
	}

	/** Where the LFO goes now. */
	get route(): LfoRoute {
		return this.#route;
	}

	/**
	 * Applies a track's mixer strip, sends, preset volume, LFO and engine tremolo at `time`; `gain`
	 * is what the mixer adds on top (its group level, 0 while another track is soloed). The engine
	 * tremolo is for the Web Audio voices only: on the synth core, organ and axis make their own
	 * (`tremolo` false). Returns true when voices must re-wire to the LFO.
	 */
	apply(track: TrackState, bpm: number, time: number, gain = 1, tremolo = true): boolean {
		const level = levelGain(track.mix.level) * gain;
		this.#set('level', level, this.#level.gain, time);
		this.#set('pan', panValue(track.mix.pan), this.#pan.pan, time);
		this.#set('preset', presetGain(track.playMode.volume, track.engine), this.#preset.gain, time);
		this.#set('fx1', sendGain(track.sends[2]), this.#sends[0].gain, time);
		this.#set('fx2', sendGain(track.sends[3]), this.#sends[1].gain, time);
		const controls = tremolo ? engineControls(track.engine, track.m1) : null;
		const wobble =
			controls && (controls.engine === 'organ' || controls.engine === 'axis')
				? { amount: controls.tremolo, speed: controls.speed }
				: { amount: 0, speed: 0 };
		this.#applyEngineTremolo(wobble.amount, wobble.speed, time);
		return this.#applyLfo(lfoRoute(track.lfo, bpm), time);
	}

	/** What voices of this track wire to (see {@link Voice.attach}). */
	modulation(): VoiceModulation {
		const lfo = this.#lfo;
		const route = this.#route;
		return {
			cutoff: lfo && route.kind === 'cutoff' ? lfo.cutoff : null,
			resonance: lfo && route.kind === 'resonance' ? lfo.resonance : null,
			engine: lfo && route.kind === 'engine' ? { param: route.param, signal: lfo.unit } : null,
			vibrato: lfo && route.kind === 'tremolo' && route.vibrato !== 0 ? lfo.vibrato : null,
			element:
				route.kind === 'element'
					? { target: route.target, param: route.param, depth: route.depth }
					: null
		};
	}

	/** A note starts at `time`: the LFO starts its wave again when routed to a normal destination. */
	retrigger(time: number): void {
		const lfo = this.#lfo;
		const route = this.#route;
		if (!lfo || !('retrigger' in route) || !route.retrigger) return;
		const next = this.#oscillator(lfo.wave, lfo.osc.frequency.value);
		this.#wire(next, lfo);
		next.start(time);
		const old = lfo.osc;
		old.stop(time);
		old.onended = () => old.disconnect();
		lfo.osc = next;
	}

	/** This track's level dips at `time` because its duck source played. */
	duck(time: number, depth: number, hold: number, release: number): void {
		const g = this.#duck.gain;
		g.cancelScheduledValues(time);
		g.setTargetAtTime(1 - depth, time, 0.004);
		g.setTargetAtTime(1, time + 0.012 + hold, release / 4);
	}

	/** Sets a parameter when its value changed since last time. */
	#set(key: string, value: number, param: AudioParam, time: number): void {
		if (this.#applied.get(key) === value) return;
		const first = !this.#applied.has(key);
		this.#applied.set(key, value);
		if (first) param.setValueAtTime(value, time);
		else param.setTargetAtTime(value, time, SMOOTH);
	}

	#applyEngineTremolo(amount: number, speed: number, time: number): void {
		const current = this.#engineTremolo;
		if (amount <= 0) {
			if (current) {
				current.osc.stop(time);
				current.osc.onended = () => current.osc.disconnect();
				this.#engineTremolo = null;
				this.#tremoloBase(time);
			}
			return;
		}
		if (!current) {
			const osc = this.#context.createOscillator();
			const depth = this.#context.createGain();
			osc.frequency.value = speed;
			depth.gain.value = amount / 2;
			osc.connect(depth).connect(this.#tremolo.gain);
			osc.start(time);
			this.#engineTremolo = { osc, depth, amount };
		} else {
			current.osc.frequency.setTargetAtTime(speed, time, SMOOTH);
			current.depth.gain.setTargetAtTime(amount / 2, time, SMOOTH);
			current.amount = amount;
		}
		this.#tremoloBase(time);
	}

	/** The tremolo stage rests low enough that both wobbles stay between silence and unity. */
	#tremoloBase(time: number): void {
		const depth = (this.#engineTremolo?.amount ?? 0) / 2 + Math.abs(this.#lfoVolume) / 2;
		this.#tremolo.gain.setTargetAtTime(1 - depth, time, SMOOTH);
	}

	#oscillator(wave: 'sine' | 'random', hz: number): OscillatorNode {
		const osc = this.#context.createOscillator();
		if (wave === 'random') {
			osc.setPeriodicWave(this.#resources.wave('lfo:random', () => randomStepsSpectrum()));
		}
		osc.frequency.value = hz;
		return osc;
	}

	#wire(osc: OscillatorNode, lfo: Lfo): void {
		osc.connect(lfo.unit);
		osc.connect(lfo.vibrato);
		osc.connect(lfo.volume);
	}

	#applyLfo(route: LfoRoute, time: number): boolean {
		const before = this.#route;
		this.#route = route;
		// element runs in each voice on its own envelope: no oscillator on the strip
		if (route.kind === 'none' || route.kind === 'duck' || route.kind === 'element') {
			const had = this.#lfo !== null;
			if (this.#lfo) {
				const { osc, volume } = this.#lfo;
				osc.stop(time);
				osc.onended = () => osc.disconnect();
				volume.disconnect();
				this.#lfo = null;
			}
			this.#lfoVolume = 0;
			this.#tremoloBase(time);
			// the voices run an element themselves, so any change to it reaches them
			const same =
				before.kind === route.kind &&
				(route.kind !== 'element' ||
					(before.kind === 'element' &&
						before.target === route.target &&
						before.param === route.param &&
						before.depth === route.depth));
			const rewire = had || !same;
			if (rewire) this.version++;
			return rewire;
		}
		const wave = route.kind === 'tremolo' ? 'sine' : route.wave;
		// the random wave holds sixteen steps per cycle, so it runs sixteen times slower
		const hz = wave === 'random' ? route.hz / RANDOM_STEPS : route.hz;
		let lfo = this.#lfo;
		if (lfo && lfo.wave !== wave) {
			const old = lfo.osc;
			old.stop(time);
			old.onended = () => old.disconnect();
			lfo.volume.disconnect();
			lfo = null;
		}
		const created = !lfo;
		if (!lfo) {
			const gain = (value = 1) => {
				const node = this.#context.createGain();
				node.gain.value = value;
				return node;
			};
			lfo = {
				osc: this.#oscillator(wave, hz),
				wave,
				unit: gain(0),
				cutoff: gain(LFO_CUTOFF_CENTS),
				resonance: gain(LFO_RESONANCE_DB),
				vibrato: gain(0),
				volume: gain(0)
			};
			lfo.unit.connect(lfo.cutoff);
			lfo.unit.connect(lfo.resonance);
			lfo.volume.connect(this.#tremolo.gain);
			this.#wire(lfo.osc, lfo);
			lfo.osc.start(time);
			this.#lfo = lfo;
		} else lfo.osc.frequency.setTargetAtTime(hz, time, SMOOTH);
		const depth = 'depth' in route ? route.depth : 0;
		lfo.unit.gain.setTargetAtTime(depth, time, SMOOTH);
		lfo.vibrato.gain.setTargetAtTime(route.kind === 'tremolo' ? route.vibrato : 0, time, SMOOTH);
		this.#lfoVolume = route.kind === 'tremolo' ? route.volume : 0;
		lfo.volume.gain.setTargetAtTime(this.#lfoVolume / 2, time, SMOOTH);
		this.#tremoloBase(time);
		const rewire =
			created ||
			before.kind !== route.kind ||
			('param' in before && 'param' in route && before.param !== route.param) ||
			(route.kind === 'tremolo' &&
				before.kind === 'tremolo' &&
				(before.vibrato === 0) !== (route.vibrato === 0));
		if (rewire) this.version++;
		return rewire;
	}
}
