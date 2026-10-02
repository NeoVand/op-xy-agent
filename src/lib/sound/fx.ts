/**
 * The two send effects, FX I and FX II (aux T7 and T8). Each slot runs the effect the simulator
 * holds (`areas.auxiliary.fx`, chosen with shift + T7 / T8) and follows its four M1 values (0–99,
 * E1–E4 in the order `FX_PARAMS` labels them) and the tempo, gliding to each new value so nothing
 * zippers or clicks. Choosing another effect crossfades to it over a few tens of milliseconds; the
 * old one's tail is cut.
 *
 * - **delay**: a tempo-synced ping-pong whose repeats darken as they fade. Size is the FX page's
 *   note value, fine moves the spacing, feedback sets how many repeats come back.
 * - **reverb**: convolution on a synthesized hall impulse (`kit.ts`) whose decay follows size. Tone
 *   darkens or thins what goes in, mod adds a slow chorus to the tail.
 * - **chorus**: two modulated delays (rate, depth, feedback), from mono to wide as stereo rises.
 * - **distortion**: lo cut and hi cut shape what reaches the drive, then a soft clipper, turning
 *   hard as clip rises; the level is matched so drive adds grit more than loudness.
 * - **lofi**: sample and hold at a lower rate, in whole samples (a delay read along a looping ramp
 *   gives exact holds, with no worklet), then fewer bits. Quality filters the aliasing away, drift
 *   sets the two channels' clocks apart.
 * - **phaser**: twelve allpass sections swept by an LFO (TE's twelve notches). It returns only the
 *   phase-shifted copy, so the notches form against each track's own sound. Its feedback runs
 *   through one render quantum, Web Audio's shortest loop, so it also rings as a sweeping comb.
 *
 * Every law here is ours, to be fitted in Session 2 (docs/research/67-verification-plan.md). A new
 * project's delay (1/8 dotted) and reverb (a 2.2 s hall) are anchored on the values the project
 * stores, so they sound as they did when they were tuned by ear.
 *
 * Dry, the delay's and the reverb's E4, is how much of what the tracks send stays in the mix
 * untreated. All of it stays at 99, where a new project has it: a send, and the FX track returns
 * the effect alone. None stays at 0: an insert, where a track sent at 99 is heard only through the
 * effect (the guide: "only the repeats with none of the initial sound"). The slot takes that share
 * back out of the mix through {@link EffectSlot.bypass}, which goes round the FX track's strip.
 * This reading is ours too, to be settled in Session 2. It keeps a new project's tracks at the
 * levels they were matched to (62 §3), where a dry signal added on top would double them. The other
 * four effects have no dry control and return their effect alone.
 *
 * Not here: FX I → FX II, the FX tracks' filters (M3) and LFOs (M4), parameter locks on the FX
 * values, and an effect per pattern (65 §2.15).
 */
import { newProjectFile, type FxEngineId } from '$lib/core/opxy';
import { fromQ15 } from '$lib/sim/defaults';
import { sweep, unit } from './mapping';
import type { Resources } from './resources';

/** An FX slot as the simulator holds it: the effect and its four values, 0–99. */
export interface EffectSettings {
	readonly type: FxEngineId;
	readonly params: readonly number[];
}

/** A send effect built for one context: the sends feed `input`, `output` returns to the mix. */
export interface SendEffect {
	readonly kind: FxEngineId;
	/** Where the sends arrive. */
	readonly input: AudioNode;
	/** What the effect returns, into the FX track's strip. */
	readonly output: AudioNode;
	/** Seconds it rings on after its input stops, at its values now. */
	readonly tail: number;
	/** Takes the slot's four values and the tempo at `time`, gliding there. */
	set(params: readonly number[], bpm: number, time: number): void;
	/** Work held back to spare the main thread (the reverb's next room), done once it is due. */
	tick(time: number): void;
	/** Stops its clocks and LFOs at `time` (the slot lets go of its nodes after). */
	stop(time: number): void;
}

/** What a new project stores on FX I and FX II: the anchors of the delay's and reverb's laws. */
const STORED = newProjectFile.effects;

/** Glide for value changes (time constant, s). */
const SMOOTH = 0.02;
/**
 * The crossfade when a slot's effect changes (time constant, s); the old one goes after 12 of them.
 */
const FADE = 0.015;

const clamp99 = (v: number) => Math.min(99, Math.max(0, v));

// ───────────────────────────────────────────── the laws: ours, to be fitted in Session 2

/**
 * The delay's size zones as note values in sixteenths, in the order the FX page names them
 * (`DELAY_SIZES`: 1/32 … 1/2).
 */
export const DELAY_NOTES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 8] as const;

/** The longest repeat spacing, s: a 1/2 at 40 bpm, fine all the way up. */
const MAX_DELAY = 4;

/** Which of the eight size zones a value is in, as the FX page reads it. */
export const delayZone = (size: number): number =>
	Math.min(DELAY_NOTES.length - 1, Math.floor(unit(size) * DELAY_NOTES.length));

/** Fine's middle: a new project's value, where it moves nothing. */
const FINE_MIDDLE = fromQ15(STORED.fx1.params[1]);

/**
 * Fine as a factor on the size's spacing: ×3/4 at 0 … ×4/3 at 99, none at its middle (ours, to be
 * fitted in Session 2).
 */
export const delayFine = (fine: number): number =>
	Math.pow(4 / 3, (clamp99(fine) - FINE_MIDDLE) / (99 - FINE_MIDDLE));

/** The delay's repeat spacing in seconds: size's note value at `bpm`, moved by fine. */
export const delaySeconds = (size: number, fine: number, bpm: number): number =>
	Math.min(MAX_DELAY, (DELAY_NOTES[delayZone(size)] * 15 * delayFine(fine)) / Math.max(1, bpm));

/**
 * The loop's two filters (the corners the default delay was tuned with, at BiquadFilterNode's own
 * Q of 1 dB) each lift a little near their corner: at most this much a pass, together.
 */
export const DELAY_LOOP_PEAK = 1.26;
/** The feedback a new project's delay was tuned to by ear, and the most it reaches. */
const FEEDBACK_STORED = 0.38;
const FEEDBACK_MAX = 0.75;
const FEEDBACK_CURVE =
	Math.log(FEEDBACK_STORED / FEEDBACK_MAX) / Math.log(fromQ15(STORED.fx1.params[2]) / 99);

/**
 * How much of each ping-pong pass comes back: none at 0 (one repeat a side), 0.38 at a new
 * project's value, 0.75 at 99, where the loop's peak still loses a little each pass, so the
 * repeats ring long but never run away (ours, to be fitted in Session 2).
 */
export const delayFeedback = (feedback: number): number =>
	FEEDBACK_MAX * Math.pow(unit(feedback), FEEDBACK_CURVE);

/**
 * Seconds until the repeats are 60 dB down, at most a minute: each pass (left, then right) takes
 * the feedback, lifted by the loop's peak (what rings longest).
 */
export function delayTail(seconds: number, feedback: number): number {
	const loop = Math.min(0.999, feedback * DELAY_LOOP_PEAK);
	const passes = loop > 0.001 ? Math.log(0.001) / Math.log(loop) : 0;
	return Math.min(60, 2 * seconds * (1 + passes));
}

/** The hall a new project's reverb was tuned to by ear, and the smallest room. */
const HALL = 2.2;
const ROOM = 0.3;
const HALL_SIZE = fromQ15(STORED.fx2.params[0]);
/** The impulse runs on this long after its RT60 (the hall's 2.6 s for 2.2). */
const IMPULSE_PAD = 0.4;

/**
 * The reverb's RT60 in seconds: a 0.3 s room at 0, the 2.2 s hall at a new project's size, about
 * 5.2 s at 99; every detent the same ratio (ours, to be fitted in Session 2).
 */
export const reverbSeconds = (size: number): number =>
	ROOM * Math.pow(HALL / ROOM, clamp99(size) / HALL_SIZE);

/** The lowpass a new project's reverb takes its input through (the softer, less splashy tail). */
const TONE_HZ = 7000;
const TONE_STORED = fromQ15(STORED.fx2.params[2]);
/** Tone 0's lowpass, and the values over which tone opens an octave. */
const TONE_DARKEST = 800;
const TONE_OCTAVE = TONE_STORED / Math.log2(TONE_HZ / TONE_DARKEST);
/** Above this tone thins: a highpass rises from 10 Hz to 1 kHz at 99. */
const TONE_THIN = 55;

/**
 * The reverb's tone as the corners of what goes in: below the middle a lowpass closes, from wide
 * open down to 800 Hz at 0 (7 kHz at a new project's value); above it a highpass rises to 1 kHz at
 * 99 (ours, to be fitted in Session 2; the guide: "filtering out high or low frequencies").
 */
export function reverbTone(tone: number): { lowpass: number; highpass: number } {
	const t = clamp99(tone);
	const lowpass = Math.min(20000, TONE_HZ * Math.pow(2, (t - TONE_STORED) / TONE_OCTAVE));
	const highpass = t <= TONE_THIN ? 10 : 10 * Math.pow(100, (t - TONE_THIN) / (99 - TONE_THIN));
	return { lowpass, highpass };
}

/**
 * The reverb's mod: a slow chorus on the tail, the two sides swinging opposite ways (ours, to be
 * fitted in Session 2).
 */
const MOD_RATE = 0.3;
const MOD_DELAY = 0.012;
const MOD_DEPTH = 0.004;

/** The chorus's voices sit this late, swinging up to {@link CHORUS_DEPTH} either way. */
const CHORUS_DELAY = 0.015;
const CHORUS_DEPTH = 0.007;

/**
 * The chorus's LFO in hertz: 0.1 Hz at 0, about 1 Hz at the middle, 10 Hz at 99 (ours, to be fitted
 * in Session 2).
 */
export const chorusRate = (rate: number): number => sweep(rate, 0.1, 10);
/**
 * How far the chorus's delays swing, s: nothing at 0, 7 ms at 99, finer near 0 (ours, to be fitted
 * in Session 2).
 */
export const chorusDepth = (depth: number): number => CHORUS_DEPTH * Math.pow(unit(depth), 1.5);
/**
 * How much of each voice comes back into it: none at 0, 0.85 at 99 (ours, to be fitted in
 * Session 2).
 */
export const chorusFeedback = (feedback: number): number => 0.85 * Math.pow(unit(feedback), 1.5);
/**
 * The right voice's LFO against the left's, radians: together at 0 (mono), opposite at 99 (ours,
 * to be fitted in Session 2).
 */
export const chorusSpread = (stereo: number): number => Math.PI * unit(stereo);

/** The drive's range in dB, and the clipper's input range (the curves span ±this). */
const DRIVE_DB = 36;
const CLIP_RANGE = 8;

/** The gain into the clipper: 1 at 0, 63 (+36 dB) at 99 (ours, to be fitted in Session 2). */
export const distortionDrive = (drive: number): number =>
	Math.pow(10, (DRIVE_DB * unit(drive)) / 20);
/**
 * The highpass in front of the clipper, Hz: 20 at 0, 2 kHz at 99 (ours, to be fitted in Session 2).
 */
export const distortionLowCut = (lowCut: number): number => sweep(lowCut, 20, 2000);
/**
 * The lowpass in front of the clipper, Hz: 20 kHz at 0, 400 at 99 (ours, to be fitted in
 * Session 2).
 */
export const distortionHighCut = (highCut: number): number => sweep(highCut, 20000, 400);

/** The lofi's slowest clock, Hz. */
const LOFI_SLOWEST = 250;
/** How far drift moves the right channel's clock against the left's at 99, as a share of a hold. */
const DRIFT_MAX = 0.5;
/**
 * The lofi lifts what it crushes by this much first (and lowers it after), so quiet sends survive.
 */
const LOFI_BOOST = 2;

/**
 * The lofi's clock in hertz as rate asks: 250 at 0, the context's own rate at 99 (ours, to be
 * fitted in Session 2).
 */
export const lofiRate = (rate: number, sampleRate: number): number =>
	sweep(rate, LOFI_SLOWEST, sampleRate);
/**
 * How many samples the lofi holds each value: the context's rate over the clock, in whole samples,
 * as a digital divider does (1 at 99: nothing held). The clock it runs is the rate over this (ours,
 * to be fitted in Session 2).
 */
export const lofiHold = (rate: number, sampleRate: number): number =>
	Math.max(1, Math.round(sampleRate / lofiRate(rate, sampleRate)));
/**
 * How many samples the right channel's clock ticks after the left's: none at 0, half a hold at 99
 * (ours, to be fitted in Session 2).
 */
export const lofiDrift = (drift: number, hold: number): number =>
	Math.floor(DRIFT_MAX * unit(drift) * hold);
/** The lofi's bit depth: 2 bits at 0, 12 at 99 (ours, to be fitted in Session 2). */
export const lofiBits = (bits: number): number => 2 + 10 * unit(bits);
/**
 * The corner of the lowpasses around the lofi's clock, Hz: the context's Nyquist at quality 0,
 * where a lowpass passes everything (every step and all the aliasing), just under the clock's
 * Nyquist at 99 (a clean, dull lower rate) (ours, to be fitted in Session 2).
 */
export function lofiCorner(quality: number, rate: number, sampleRate: number): number {
	const top = sampleRate / 2;
	return top * Math.pow(Math.min(top, 0.45 * rate) / top, unit(quality));
}

/** The phaser's sections: twelve second-order allpasses, twelve notches (the guide). */
const PHASER_STAGES = 12;
const PHASER_Q = 0.6;

/**
 * The phaser's centre, Hz: 60 at 0, about 600 at the middle, 6 kHz at 99 (ours, to be fitted in
 * Session 2).
 */
export const phaserFrequency = (frequency: number): number => sweep(frequency, 60, 6000);
/**
 * How far the phaser sweeps either way, cents: nothing at 0, three octaves at 99 (ours, to be
 * fitted in Session 2).
 */
export const phaserDepth = (depth: number): number => 3600 * unit(depth);
/**
 * The phaser's LFO, Hz: 0.02 at 0, about 0.4 at the middle, 8 at 99 (ours, to be fitted in
 * Session 2).
 */
export const phaserRate = (rate: number): number => sweep(rate, 0.02, 8);
/**
 * How much of the phaser's output goes round again: none at 0, 0.7 at 99 (ours, to be fitted in
 * Session 2).
 */
export const phaserFeedback = (feedback: number): number => 0.7 * unit(feedback);

/**
 * The share of what the tracks send that stays in the mix untreated (see the module's comment):
 * the delay's and the reverb's dry (E4) over 99; all of it for the other effects.
 */
export const keptDry = (kind: FxEngineId, params: readonly number[]): number =>
	kind === 'delay' || kind === 'reverb' ? unit(params[3] ?? 99) : 1;

// ───────────────────────────────────────────────────────────────────────── building blocks

/** Moves `param` to `value` at `time`: at once while building (`now`), else gliding there. */
function move(param: AudioParam, value: number, time: number, now: boolean, tau = SMOOTH): void {
	if (now) param.setValueAtTime(value, time);
	else param.setTargetAtTime(value, time, tau);
}

function gain(context: BaseAudioContext, value = 1): GainNode {
	const node = context.createGain();
	node.gain.value = value;
	return node;
}

/** A gain that takes what arrives as `channels` channels (mono sums, stereo up-mixes). */
function channels(context: BaseAudioContext, count: 1 | 2): GainNode {
	const node = gain(context);
	node.channelCount = count;
	node.channelCountMode = 'explicit';
	node.channelInterpretation = 'speakers';
	return node;
}

/**
 * A lowpass's or highpass's Q in Web Audio is its resonance in dB: this one has none (Butterworth).
 * BiquadFilterNode's own default, 1 dB, lifts about 2 dB at the corner.
 */
const FLAT = -3.0103;
/** The resonance the default delay and reverb were tuned with: BiquadFilterNode's default. */
const TUNED = 1;

function filter(context: BaseAudioContext, type: BiquadFilterType, hz: number, q = FLAT) {
	const node = context.createBiquadFilter();
	node.type = type;
	node.frequency.value = hz;
	node.Q.value = q;
	return node;
}

/** A sine LFO and its cosine, started together so they stay a quarter turn apart. */
function quadrature(context: BaseAudioContext, hz: number) {
	const sine = context.createOscillator();
	const cosine = context.createOscillator();
	cosine.setPeriodicWave(
		context.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]))
	);
	for (const osc of [sine, cosine]) {
		osc.frequency.value = hz;
		osc.start();
	}
	return { sine, cosine };
}

/** Stops sources at `time`, quietly if they already have. */
function halt(sources: readonly AudioScheduledSourceNode[], time: number): void {
	for (const source of sources) {
		try {
			source.stop(time);
		} catch {
			// never started or already stopped
		}
	}
}

/**
 * Calls `done` once the context's clock passes `time`: an ended source keeps the time an offline
 * render keeps too. It feeds `keep` silence, so it is processed wherever `keep` is heard.
 */
function at(context: BaseAudioContext, time: number, keep: AudioNode, done: () => void): void {
	const clock = context.createConstantSource();
	clock.offset.value = 0;
	clock.connect(keep);
	clock.onended = () => {
		clock.disconnect();
		done();
	};
	clock.start();
	clock.stop(Math.max(time, context.currentTime));
}

/** A curve for a WaveShaperNode, `points` long (odd, so 0 maps exactly to the middle point). */
function curve(points: number, shape: (x: number) => number): Float32Array<ArrayBuffer> {
	const out = new Float32Array(points);
	for (let i = 0; i < points; i++) out[i] = shape((2 * i) / (points - 1) - 1);
	return out;
}

/**
 * The distortion's soft and hard clippers over ±{@link CLIP_RANGE}, made once (nodes copy them).
 */
let clippers: { soft: Float32Array<ArrayBuffer>; hard: Float32Array<ArrayBuffer> } | null = null;

/** The lofi's quantiser: `bits` over ±1, rounding to the nearest step (silence stays silent). */
function staircase(bits: number): Float32Array<ArrayBuffer> {
	const step = 2 / Math.pow(2, bits);
	return curve(32769, (x) => Math.max(-1, Math.min(1, Math.round(x / step) * step)));
}

// ─────────────────────────────────────────────────────────────────────────────── effects

/** The ping-pong delay: left, then right, then left again, each pass a little darker. */
function delay(context: BaseAudioContext, params: readonly number[], bpm: number): SendEffect {
	// everything sent is summed to mono first, so the repeats bounce evenly
	const input = channels(context, 1);
	const left = context.createDelay(MAX_DELAY);
	const right = context.createDelay(MAX_DELAY);
	const feedback = gain(context, 0);
	const lowCut = filter(context, 'highpass', 180, TUNED);
	const highCut = filter(context, 'lowpass', 3200, TUNED);
	const merge = context.createChannelMerger(2);
	const output = gain(context, 0.7);
	input.connect(left);
	left.connect(merge, 0, 0);
	left.connect(right);
	right.connect(merge, 0, 1);
	right.connect(feedback);
	feedback.connect(lowCut).connect(highCut).connect(left);
	merge.connect(output);
	let seconds = 0;
	let loop = 0;
	const apply = (p: readonly number[], tempo: number, time: number, now: boolean) => {
		seconds = delaySeconds(p[0], p[1], tempo);
		loop = delayFeedback(p[2]);
		// a short glide, like tape: the repeats bend into a new spacing instead of clicking
		for (const d of [left, right]) move(d.delayTime, seconds, time, now, 0.05);
		move(feedback.gain, loop, time, now);
	};
	apply(params, bpm, context.currentTime, true);
	return {
		kind: 'delay',
		input,
		output,
		get tail() {
			return delayTail(seconds, loop);
		},
		set: (p, tempo, time) => apply(p, tempo, time, false),
		tick() {},
		stop() {}
	};
}

/** Rooms of the reverb left ringing at once while size moves; an older one is cut. */
const ROOMS = 3;
/** A new room at most this often (s of audio time): each one renders an impulse. */
const ROOM_EVERY = 0.12;

/**
 * The convolution reverb. A new size is a new room: the next impulse takes the input over while
 * the last rings out, so turning size never clicks or cuts a tail.
 */
function reverb(
	context: BaseAudioContext,
	resources: Resources,
	params: readonly number[]
): SendEffect {
	const input = channels(context, 2);
	const lowpass = filter(context, 'lowpass', TONE_HZ, TUNED);
	const highpass = filter(context, 'highpass', 10);
	const wet = gain(context);
	const plain = gain(context);
	const swirl = gain(context, 0);
	const output = gain(context, 0.9);
	input.connect(lowpass).connect(highpass);
	wet.connect(plain).connect(output);
	// mod: a slow chorus on the tail
	const split = context.createChannelSplitter(2);
	const join = context.createChannelMerger(2);
	const lfo = context.createOscillator();
	lfo.frequency.value = MOD_RATE;
	const swings = [1, -1].map((sign, side) => {
		const late = context.createDelay(0.05);
		late.delayTime.value = MOD_DELAY;
		const depth = gain(context, 0);
		lfo.connect(depth).connect(late.delayTime);
		split.connect(late, side).connect(join, 0, side);
		return { depth, sign };
	});
	wet.connect(split);
	join.connect(swirl).connect(output);
	lfo.start();

	interface Room {
		readonly size: number;
		readonly input: GainNode;
		readonly output: GainNode;
		readonly tail: number;
		gone: boolean;
	}
	const live: Room[] = [];
	const drop = (room: Room) => {
		if (room.gone) return;
		room.gone = true;
		highpass.disconnect(room.input);
		room.output.disconnect();
		const i = live.indexOf(room);
		if (i >= 0) live.splice(i, 1);
	};
	const open = (size: number, time: number, now: boolean) => {
		const rt60 = reverbSeconds(size);
		const convolver = context.createConvolver();
		convolver.buffer = resources.room(rt60);
		const room: Room = {
			size,
			input: gain(context, now ? 1 : 0),
			output: gain(context),
			tail: rt60 + IMPULSE_PAD,
			gone: false
		};
		highpass.connect(room.input).connect(convolver).connect(room.output).connect(wet);
		const last = live.at(-1);
		if (!now) room.input.gain.setTargetAtTime(1, time, SMOOTH);
		if (last) {
			// the last room hears nothing new and rings out
			last.input.gain.setTargetAtTime(0, time, SMOOTH);
			at(context, time + last.tail + 0.1, last.output, () => drop(last));
		}
		live.push(room);
		while (live.length > ROOMS) {
			const oldest = live.shift() as Room;
			oldest.output.gain.setTargetAtTime(0, time, SMOOTH);
			at(context, time + 12 * SMOOTH, oldest.output, () => drop(oldest));
		}
	};
	let size = params[0];
	let pending: number | null = null;
	let opened = -Infinity;
	const resize = (next: number, time: number) => {
		pending = null;
		if (next === live.at(-1)?.size) return;
		if (time < opened + ROOM_EVERY) {
			pending = next;
			return;
		}
		opened = time;
		open(next, time, false);
	};
	const apply = (p: readonly number[], time: number, now: boolean) => {
		size = p[0];
		if (!now) resize(size, time);
		const tone = reverbTone(p[2]);
		move(lowpass.frequency, tone.lowpass, time, now);
		move(highpass.frequency, tone.highpass, time, now);
		const mod = unit(p[1]);
		move(plain.gain, 1 - mod / 2, time, now);
		move(swirl.gain, mod / 2, time, now);
		for (const s of swings) move(s.depth.gain, s.sign * MOD_DEPTH * mod, time, now);
	};
	open(size, context.currentTime, true);
	apply(params, context.currentTime, true);
	return {
		kind: 'reverb',
		input,
		output,
		get tail() {
			return reverbSeconds(size) + IMPULSE_PAD + MOD_DELAY + MOD_DEPTH;
		},
		set: (p, _tempo, time) => apply(p, time, false),
		tick(time) {
			if (pending !== null) resize(pending, time);
		},
		stop: (time) => halt([lfo], time)
	};
}

/** The chorus: two voices late by a swinging few milliseconds, one each side. */
function chorus(context: BaseAudioContext, params: readonly number[]): SendEffect {
	const input = channels(context, 1);
	const merge = context.createChannelMerger(2);
	const output = gain(context, 0.8);
	const { sine, cosine } = quadrature(context, chorusRate(params[0]));
	const voices = [0, 1].map((side) => {
		const late = context.createDelay(0.05);
		late.delayTime.value = CHORUS_DELAY;
		const back = gain(context, 0);
		input.connect(late);
		late.connect(back).connect(late);
		late.connect(merge, 0, side);
		return { late, back };
	});
	// the left voice swings with the sine; the right with sin(ωt + spread), built of both
	const left = gain(context, 0);
	const rightSine = gain(context, 0);
	const rightCosine = gain(context, 0);
	sine.connect(left).connect(voices[0].late.delayTime);
	sine.connect(rightSine).connect(voices[1].late.delayTime);
	cosine.connect(rightCosine).connect(voices[1].late.delayTime);
	merge.connect(output);
	let loop = 0;
	const apply = (p: readonly number[], time: number, now: boolean) => {
		for (const osc of [sine, cosine]) move(osc.frequency, chorusRate(p[0]), time, now);
		const depth = chorusDepth(p[1]);
		const spread = chorusSpread(p[3]);
		move(left.gain, depth, time, now);
		move(rightSine.gain, depth * Math.cos(spread), time, now);
		move(rightCosine.gain, depth * Math.sin(spread), time, now);
		loop = chorusFeedback(p[2]);
		for (const v of voices) move(v.back.gain, loop, time, now);
		// the voices ring louder as they feed back: take some of it off
		move(output.gain, 0.8 * (1 - 0.5 * loop), time, now);
	};
	apply(params, context.currentTime, true);
	return {
		kind: 'chorus',
		input,
		output,
		get tail() {
			const passes = loop > 0.001 ? Math.log(0.001) / Math.log(loop) : 0;
			return (CHORUS_DELAY + CHORUS_DEPTH) * (1 + passes) + 0.05;
		},
		set: (p, _tempo, time) => apply(p, time, false),
		tick() {},
		stop: (time) => halt([sine, cosine], time)
	};
}

/**
 * The distortion: cuts into a drive, a soft and a hard clipper crossfaded by clip, level matched.
 */
function distortion(context: BaseAudioContext, params: readonly number[]): SendEffect {
	clippers ??= {
		soft: curve(8193, (x) => Math.tanh(CLIP_RANGE * x)),
		hard: curve(8193, (x) => Math.max(-1, Math.min(1, CLIP_RANGE * x)))
	};
	const input = channels(context, 2);
	const lowCut = filter(context, 'highpass', 20);
	const highCut = filter(context, 'lowpass', 20000);
	const drive = gain(context, 1 / CLIP_RANGE);
	const shapers = [clippers.soft, clippers.hard].map((c) => {
		const shaper = context.createWaveShaper();
		shaper.curve = c;
		shaper.oversample = '4x';
		return shaper;
	});
	const soft = gain(context);
	const hard = gain(context, 0);
	const makeup = gain(context);
	// the clipped edges' fizz, softened
	const smooth = filter(context, 'lowpass', 9000);
	const output = gain(context);
	input.connect(lowCut).connect(highCut).connect(drive);
	drive.connect(shapers[0]).connect(soft).connect(makeup);
	drive.connect(shapers[1]).connect(hard).connect(makeup);
	makeup.connect(smooth).connect(output);
	const apply = (p: readonly number[], time: number, now: boolean) => {
		const d = distortionDrive(p[0]);
		move(drive.gain, d / CLIP_RANGE, time, now);
		// louder the harder it is driven, but by far less than the drive
		move(makeup.gain, 0.5 / Math.sqrt(d), time, now);
		const c = unit(p[1]);
		move(soft.gain, 1 - c, time, now);
		move(hard.gain, c, time, now);
		move(lowCut.frequency, distortionLowCut(p[2]), time, now);
		move(highCut.frequency, distortionHighCut(p[3]), time, now);
	};
	apply(params, context.currentTime, true);
	return {
		kind: 'distortion',
		input,
		output,
		tail: 0.05,
		set: (p, _tempo, time) => apply(p, time, false),
		tick() {},
		stop() {}
	};
}

/**
 * The lofi. Each channel is held by a delay whose time a looping ramp drives: it grows a sample a
 * sample from 0 and jumps back at the loop's end, so the delay reads the same input sample until
 * the next jump, the clock's tick. Holds are whole samples: a looping buffer is interpolated across
 * its loop's end, which a fractional loop would leave as one stray sample a hold. A new rate or
 * drift starts new clocks on the sample at `time` (so a change keeps its place); the output stays a
 * held copy of the input throughout, so nothing clicks.
 */
function lofi(context: BaseAudioContext, params: readonly number[]): SendEffect {
	const rate = context.sampleRate;
	const input = channels(context, 2);
	const pre = filter(context, 'lowpass', rate / 2);
	const split = context.createChannelSplitter(2);
	const join = context.createChannelMerger(2);
	const longest = Math.ceil(rate / LOFI_SLOWEST) + 8;
	const ramp = context.createBuffer(1, longest, rate);
	const seconds = ramp.getChannelData(0);
	for (let i = 0; i < longest; i++) seconds[i] = i / rate;
	const holds = [0, 1].map((side) => {
		const hold = context.createDelay(longest / rate);
		hold.delayTime.value = 0;
		split.connect(hold, side).connect(join, 0, side);
		return hold;
	});
	let clocks: AudioBufferSourceNode[] = [];
	let running = '';
	const clock = (hold: number, lag: number, time: number) => {
		const key = `${hold}|${lag}`;
		if (key === running) return;
		running = key;
		// on a sample, so the ramp is read at whole samples
		const from = Math.ceil(Math.max(time, context.currentTime) * rate - 1e-6) / rate;
		halt(clocks, from);
		clocks = holds.map((delay, side) => {
			const source = context.createBufferSource();
			source.buffer = ramp;
			source.loop = true;
			source.loopStart = 0;
			source.loopEnd = hold / rate;
			source.connect(delay.delayTime);
			source.onended = () => source.disconnect();
			source.start(from, side === 0 ? 0 : ((hold - lag) % hold) / rate);
			return source;
		});
	};
	const boost = gain(context, LOFI_BOOST);
	const crush = context.createWaveShaper();
	const post = filter(context, 'lowpass', rate / 2);
	const output = gain(context, 1 / LOFI_BOOST);
	input.connect(pre).connect(split);
	join.connect(boost).connect(crush).connect(post).connect(output);
	let bits = -1;
	const apply = (p: readonly number[], time: number, now: boolean) => {
		const hold = lofiHold(p[0], rate);
		clock(hold, lofiDrift(p[3], hold), time);
		// a new depth swaps the curve at once: the output moves by at most a step, as it does
		// every time the input crosses one
		const depth = lofiBits(p[1]);
		if (depth !== bits) {
			bits = depth;
			crush.curve = staircase(depth);
		}
		const corner = lofiCorner(p[2], rate / hold, rate);
		move(pre.frequency, corner, time, now);
		move(post.frequency, corner, time, now);
	};
	apply(params, context.currentTime, true);
	return {
		kind: 'lofi',
		input,
		output,
		tail: 0.05,
		set: (p, _tempo, time) => apply(p, time, false),
		tick() {},
		stop: (time) => halt(clocks, time)
	};
}

/**
 * The phaser: each channel through twelve allpass sections at the centre frequency, swept in
 * cents by an LFO (the right channel's a quarter turn on). Its output is only the phase-shifted
 * copy: against the tracks' own sound it carves the notches, deepest when sent at 99.
 */
function phaser(context: BaseAudioContext, params: readonly number[]): SendEffect {
	const input = channels(context, 2);
	const split = context.createChannelSplitter(2);
	const join = context.createChannelMerger(2);
	const output = gain(context);
	const { sine, cosine } = quadrature(context, phaserRate(params[2]));
	const sweeps = [gain(context, 0), gain(context, 0)];
	sine.connect(sweeps[0]);
	cosine.connect(sweeps[1]);
	const chains = [0, 1].map((side) => {
		const sum = gain(context);
		split.connect(sum, side);
		let node: AudioNode = sum;
		const stages = Array.from({ length: PHASER_STAGES }, () => {
			const stage = filter(context, 'allpass', 600, PHASER_Q);
			// the LFO is slow: new coefficients each render quantum are plenty, and far cheaper
			for (const param of [stage.frequency, stage.detune]) {
				try {
					param.automationRate = 'k-rate';
				} catch {
					// a browser that keeps them a-rate
				}
			}
			sweeps[side].connect(stage.detune);
			node = node.connect(stage);
			return stage;
		});
		const back = gain(context, 0);
		const loop = context.createDelay(0.01);
		loop.delayTime.value = 128 / context.sampleRate;
		node.connect(back).connect(loop).connect(sum);
		node.connect(join, 0, side);
		return { stages, back };
	});
	input.connect(split);
	join.connect(output);
	const apply = (p: readonly number[], time: number, now: boolean) => {
		const centre = phaserFrequency(p[0]);
		for (const chain of chains) {
			for (const stage of chain.stages) move(stage.frequency, centre, time, now);
		}
		for (const s of sweeps) move(s.gain, phaserDepth(p[1]), time, now);
		for (const osc of [sine, cosine]) move(osc.frequency, phaserRate(p[2]), time, now);
		const loop = phaserFeedback(p[3]);
		for (const chain of chains) move(chain.back.gain, loop, time, now);
		move(output.gain, 1 - 0.5 * loop, time, now);
	};
	apply(params, context.currentTime, true);
	return {
		kind: 'phaser',
		input,
		output,
		tail: 0.1,
		set: (p, _tempo, time) => apply(p, time, false),
		tick() {},
		stop: (time) => halt([sine, cosine], time)
	};
}

/** Builds effect `kind` with its four values and the tempo. */
export function createEffect(
	kind: FxEngineId,
	context: BaseAudioContext,
	resources: Resources,
	params: readonly number[],
	bpm: number
): SendEffect {
	switch (kind) {
		case 'chorus':
			return chorus(context, params);
		case 'delay':
			return delay(context, params, bpm);
		case 'distortion':
			return distortion(context, params);
		case 'lofi':
			return lofi(context, params);
		case 'phaser':
			return phaser(context, params);
		case 'reverb':
			return reverb(context, resources, params);
	}
}

/**
 * One FX slot: the sends arrive at `input`, the effect it holds returns through `output` (the FX
 * track's strip), and `bypass` goes straight into the mix with the share of the sends that dry
 * takes out (see the module's comment). {@link apply} follows the slot's effect, values and tempo.
 */
export class EffectSlot {
	readonly input: GainNode;
	readonly output: GainNode;
	readonly bypass: GainNode;
	readonly #context: BaseAudioContext;
	readonly #resources: Resources;
	#effect: SendEffect;
	#gate: GainNode;
	#type: FxEngineId;
	#params: number[];
	#applied: string;

	constructor(
		context: BaseAudioContext,
		resources: Resources,
		settings: EffectSettings,
		bpm: number
	) {
		this.#context = context;
		this.#resources = resources;
		this.input = channels(context, 2);
		this.output = gain(context);
		this.bypass = gain(context, keptDry(settings.type, settings.params) - 1);
		this.input.connect(this.bypass);
		this.#type = settings.type;
		this.#params = [...settings.params];
		this.#applied = EffectSlot.#key(this.#type, this.#params, bpm);
		this.#effect = createEffect(settings.type, context, resources, this.#params, bpm);
		this.#gate = gain(context);
		this.input.connect(this.#effect.input);
		this.#effect.output.connect(this.#gate).connect(this.output);
	}

	static #key(type: FxEngineId, params: readonly number[], bpm: number): string {
		return `${type}|${params.join(',')}|${bpm}`;
	}

	/** The effect it runs. */
	get kind(): FxEngineId {
		return this.#effect.kind;
	}

	/** Seconds the effect rings on after the sends stop. */
	get tail(): number {
		return this.#effect.tail;
	}

	/**
	 * Takes the slot as the simulator holds it (null keeps the effect and values it has) and the
	 * tempo at `time`: another effect crossfades in, new values glide. Cheap when nothing changed.
	 */
	apply(settings: EffectSettings | null, bpm: number, time: number): void {
		const type = settings?.type ?? this.#type;
		const params = settings?.params ?? this.#params;
		const key = EffectSlot.#key(type, params, bpm);
		if (key === this.#applied) {
			this.#effect.tick(time);
			return;
		}
		this.#applied = key;
		this.#params = [...params];
		if (type !== this.#type) {
			this.#type = type;
			this.#swap(createEffect(type, this.#context, this.#resources, this.#params, bpm), time);
		} else this.#effect.set(this.#params, bpm, time);
		this.bypass.gain.setTargetAtTime(keptDry(type, this.#params) - 1, time, SMOOTH);
	}

	/** Stops the effect's clocks and LFOs and leaves the mix. */
	dispose(time = this.#context.currentTime): void {
		this.#effect.stop(time);
		this.output.disconnect();
		this.bypass.disconnect();
	}

	/** The new effect fades in as the old one fades out; the old one's nodes go once silent. */
	#swap(next: SendEffect, time: number): void {
		const old = this.#effect;
		const oldGate = this.#gate;
		const gate = gain(this.#context, 0);
		this.input.connect(next.input);
		next.output.connect(gate).connect(this.output);
		gate.gain.setTargetAtTime(1, time, FADE);
		oldGate.gain.setTargetAtTime(0, time, FADE);
		const gone = time + 12 * FADE;
		old.stop(gone);
		at(this.#context, gone, oldGate, () => {
			this.input.disconnect(old.input);
			oldGate.disconnect();
		});
		this.#effect = next;
		this.#gate = gate;
	}
}
