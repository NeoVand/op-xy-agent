/**
 * organ: eight registrations of fixed partials, from transistor to church, each crossfading
 * between two by bass, with a tremolo. The evidence and its sources are in
 * `docs/research/57-synth-engines.md`; what TE, the device's screen or several reviewers establish
 * is marked [E], our inference [I].
 *
 * - [E] TE: from transistor to church; bass adds or removes bass; the tremolo moves the volume.
 * - [E] Eight types: a review counts eight, and the screen draws drawbar rails with eight stops.
 *   Brightness rises roughly with the type. Reviewers hear something FM-like, and TE's OP-Z organ
 *   was eight FM algorithms with a "tweak" control.
 * - [E] Bass depends on the type: in some it adds a sub, in others highs or detune. A review finds
 *   the most bass at 0. TE mentions no percussion or key click; most factory presets add the
 *   ladder filter.
 * - [I] Until recordings of the device exist, each type is two frames of drawbar-style partials
 *   (the note × 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8 and a few more for the reedy and church types), one
 *   frame at bass 0 and one at bass 1, crossfaded. The table plays an octave below the note so the
 *   16′ (× 0.5) and 5⅓′ (× 1.5) fit as harmonics; every harmonic keeps one phase in every frame, so
 *   crossfades never cancel, and every frame has the same RMS.
 * - [I] Bass runs the way the review heard it: 0 is the most bass (the frame with the 16′); towards
 *   1 the sub gives way to nothing (transistor, combo, reed), to the 4′ (jazz), to highs (fm,
 *   gospel, church) or to a celeste rank tuned a few cents sharp (theatre), the one type that
 *   beats. TE's "adds or removes bass" fits a bass knob that works backwards as well as forwards.
 * - [I] The types, darkest first (the order the evidence gives brightness): transistor (a soft
 *   square, odd partials), jazz (16′ 5⅓′ 8′ ↔ 8′ 4′), theatre (tibia ranks, celeste), combo (a
 *   bright square with a 4′), fm (a 1:1 FM spectrum, the FM colour reviewers hear), reed (a
 *   harmonium's full row), gospel (16′ 5⅓′ 8′ 4′ ↔ 8′ 4′ and softer 2′ 1′) and church (a
 *   principal chorus, mixtures at bass 1). Between the two frames the level holds: their blend is
 *   lifted by how much the two share.
 * - [I] Tremolo: gain 1 − d·(½ − ½·cos 2πft), f from TREMOLO_SLOW to TREMOLO_FAST exponentially
 *   (speed), d up to TREMOLO_DEPTH (amount). Type is ⌊type × 8⌋; changing it crossfades.
 */
import { partialsOf, WaveTable } from '../wavetable';
import { cos2pi } from '../sine';
import type { EngineVoice } from './index';

// Calibration: our estimates until the owner's device is measured (57-synth-engines.md).
/** Tremolo depth at full amount, and its speed (Hz) at the two ends of the knob. */
const TREMOLO_DEPTH = 0.6;
const TREMOLO_SLOW = 0.5;
const TREMOLO_FAST = 15;
/** How sharp the theatre type's celeste rank is (cents), and its level at full bass. */
const CELESTE_CENTS = 7;
const CELESTE_LEVEL = 0.6;
/** Output gain: about 0.24 RMS at the default M1 (80s, its tremolo included) on a 220 Hz note. */
const LEVEL = 0.6;

// Design constants.
/** Smoothing of every continuous parameter (seconds). */
const SMOOTH_SECONDS = 0.005;
/** A type change crossfades over this long (and waits for the last one to finish). */
const FADE_SECONDS = 0.02;
/** Every frame's RMS before LEVEL (a unit sine's is 0.707). */
const FRAME_RMS = 0.5;

/** One rank: a multiple of the note (0.5 is the 16′) and its amplitude (a full drawbar is 1). */
type Rank = readonly [multiple: number, amplitude: number];

/** A type: its partials at bass 0 and at bass 1. */
interface Registration {
	readonly name: string;
	readonly low: readonly Rank[];
	readonly high: readonly Rank[];
}

/** A soft square's odd partials (1/n^`slope`) up to `top`, `level` at the fundamental. */
function odd(top: number, slope: number, level = 1): Rank[] {
	const ranks: Rank[] = [];
	for (let n = 1; n <= top; n += 2) ranks.push([n, level / n ** slope]);
	return ranks;
}

/** The harmonics of sin(θ + β·sin θ), 1:1 FM, up to `top`. */
function fm(beta: number, top: number): Rank[] {
	const cycle = Float32Array.from({ length: 1024 }, (_, i) => {
		const theta = (2 * Math.PI * i) / 1024;
		return Math.sin(theta + beta * Math.sin(theta));
	});
	const { amp } = partialsOf(cycle, top);
	return Array.from(amp, (a, i): Rank => [i + 1, a]);
}

/** A harmonium's reeds: every partial, fading by the 12th; `nasal` lifts the 4th to 8th. */
const REED = [1, 0.6, 0.5, 0.42, 0.32, 0.22, 0.15, 0.1, 0.065, 0.04, 0.025, 0.015];
const reed = (nasal: number): Rank[] =>
	REED.map((a, i): Rank => [i + 1, i >= 3 && i <= 7 ? a * nasal : a]);

/** The eight types, darkest first. */
export const ORGAN_TYPES: readonly Registration[] = [
	{
		name: 'transistor',
		low: [[0.5, 0.7], ...odd(9, 2.2)],
		high: odd(9, 2.2)
	},
	{
		name: 'jazz',
		low: [
			[0.5, 1],
			[1.5, 1],
			[1, 1]
		],
		high: [
			[1, 1],
			[2, 0.8]
		]
	},
	{
		name: 'theatre',
		low: [
			[0.5, 0.8],
			[1, 1],
			[2, 0.5],
			[3, 0.3],
			[4, 0.3]
		],
		high: [
			[1, 1],
			[2, 0.6],
			[3, 0.4],
			[4, 0.4],
			[6, 0.15]
		]
	},
	{
		name: 'combo',
		low: [[0.5, 0.5], [2, 0.35], ...odd(15, 1)],
		high: [[2, 0.35], [4, 0.2], ...odd(15, 1)]
	},
	{
		name: 'fm',
		low: [[0.5, 0.6], ...fm(1, 8)],
		high: fm(2, 12)
	},
	{
		name: 'reed',
		low: [[0.5, 0.5], ...reed(1)],
		high: reed(1.25)
	},
	{
		name: 'gospel',
		low: [
			[0.5, 1],
			[1.5, 1],
			[1, 1],
			[2, 1]
		],
		high: [
			[1, 1],
			[2, 0.9],
			[4, 0.7],
			[8, 0.55]
		]
	},
	{
		name: 'church',
		low: [
			[0.5, 0.7],
			[1, 1],
			[2, 0.8],
			[3, 0.5],
			[4, 0.6],
			[5, 0.15],
			[6, 0.35],
			[8, 0.35],
			[10, 0.1]
		],
		high: [
			[1, 1],
			[2, 0.8],
			[3, 0.55],
			[4, 0.6],
			[5, 0.2],
			[6, 0.45],
			[8, 0.4],
			[10, 0.15],
			[12, 0.22],
			[16, 0.15],
			[20, 0.06],
			[24, 0.06]
		]
	}
];

/** The type whose bass brings in a celeste rank instead of highs or nothing. */
const CELESTE_TYPE = 2;
/** The celeste rank: a flute 8′ and 4′. */
const CELESTE: readonly Rank[] = [
	[1, 1],
	[2, 0.5]
];
/** Harmonics of the table (half the note) that the ranks can reach. */
const TABLE_HARMONICS = 48;

/**
 * One harmonic's phase in every frame, spread quadratically (Schroeder's rule) so stacked ranks
 * do not all peak together.
 */
const phaseOf = (h: number) => (Math.PI * h * h) / TABLE_HARMONICS;

/** A frame from ranks, at {@link FRAME_RMS}. */
function frame(ranks: readonly Rank[]) {
	const amp = new Float32Array(TABLE_HARMONICS);
	const phase = Float32Array.from({ length: TABLE_HARMONICS }, (_, i) => phaseOf(i + 1));
	for (const [multiple, a] of ranks) amp[Math.round(multiple * 2) - 1] += a;
	let power = 0;
	for (const a of amp) power += (a * a) / 2;
	const gain = FRAME_RMS / Math.sqrt(power);
	for (let i = 0; i < amp.length; i++) amp[i] *= gain;
	return { amp, phase };
}

/** The registrations, band-limited, and how alike each type's two frames are. */
interface Registrations {
	/** Frames 2t and 2t + 1: type t at bass 0 and 1; the last frame is the celeste rank. */
	readonly table: WaveTable;
	/** Per type, the correlation of its two frames (1 = the same, 0 = no partial shared). */
	readonly alike: Float32Array;
}

/** Band-limits every type's two frames and the celeste rank, and measures each pair's likeness. */
function build(): Registrations {
	const pairs = ORGAN_TYPES.map((t) => [frame(t.low), frame(t.high)]);
	const alike = Float32Array.from(pairs, ([low, high]) => {
		let dot = 0;
		for (let i = 0; i < TABLE_HARMONICS; i++) dot += (low.amp[i] * high.amp[i]) / 2;
		return dot / (FRAME_RMS * FRAME_RMS);
	});
	const frames = pairs.flat();
	frames.push(frame(CELESTE));
	return { table: WaveTable.fromPartials(frames), alike };
}

let organTables: Registrations | null = null;

/** The shared registrations (built on first use). */
function registrations(): Registrations {
	organTables ??= build();
	return organTables;
}

/** The lift that keeps a blend of two frames at their RMS: `b` of one, 1 − b of the other. */
function blendLift(b: number, alike: number): number {
	return 1 / Math.sqrt(1 - 2 * b * (1 - b) * (1 - alike));
}

const CELESTE_FRAME = 2 * ORGAN_TYPES.length;

export class OrganVoice implements EngineVoice {
	readonly #sr: number;
	readonly #table: WaveTable;
	readonly #alike: Float32Array;
	readonly #smooth: number;
	readonly #fadeStep: number;
	readonly #celesteRatio = Math.pow(2, CELESTE_CENTS / 1200);
	#dt = 0;
	/** Phases of the table (half the note) and of the celeste rank, and of the tremolo. */
	#phase = 0;
	#celestePhase = 0;
	#lfo = 0;
	/** The type sounding, the one fading out, and how far the fade has come (1 = done). */
	#type = 0;
	#from = 0;
	#fade = 1;
	#typeTarget = 0;
	/** Bass (0–1), celeste level, tremolo depth and rate (cycles per sample): smoothed. */
	#bass = 0;
	#bassTarget = 0;
	#celeste = 0;
	#celesteTarget = 0;
	#depth = 0;
	#depthTarget = 0;
	#rate = 0;
	#rateTarget = 0;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		({ table: this.#table, alike: this.#alike } = registrations());
		this.#smooth = 1 - Math.exp(-1 / (SMOOTH_SECONDS * sampleRate));
		this.#fadeStep = 1 / (FADE_SECONDS * sampleRate);
	}

	start(hz: number, _velocity: number, params: Float32Array): void {
		this.#phase = 0;
		this.#celestePhase = 0;
		this.#lfo = 0;
		this.control(hz, params);
		// a note starts where its parameters are, not fading in from the last note's
		this.#type = this.#from = this.#typeTarget;
		this.#fade = 1;
		this.#bass = this.#bassTarget;
		this.#celeste = this.#celesteTarget;
		this.#depth = this.#depthTarget;
		this.#rate = this.#rateTarget;
	}

	control(hz: number, params: Float32Array): void {
		this.#dt = Math.min(Math.max(hz, 1), 0.45 * this.#sr) / this.#sr;
		const bass = clamp01(params[1]);
		this.#typeTarget = Math.min(ORGAN_TYPES.length - 1, Math.floor(clamp01(params[0]) * 8));
		this.#bassTarget = bass;
		this.#celesteTarget = CELESTE_LEVEL * bass;
		this.#depthTarget = TREMOLO_DEPTH * clamp01(params[2]);
		const speed = clamp01(params[3]);
		this.#rateTarget = (TREMOLO_SLOW * Math.pow(TREMOLO_FAST / TREMOLO_SLOW, speed)) / this.#sr;
		// a new type waits until the last crossfade has finished
		if (this.#typeTarget !== this.#type && this.#fade >= 1) {
			this.#from = this.#type;
			this.#type = this.#typeTarget;
			this.#fade = 0;
		}
	}

	render(left: Float32Array, right: Float32Array, n: number): void {
		const table = this.#table;
		const alike = this.#alike;
		const k = this.#smooth;
		const half = 0.5 * this.#dt;
		const celesteHalf = half * this.#celesteRatio;
		const limit = half;
		const celesteLimit = celesteHalf;
		const type = this.#type;
		const from = this.#from;
		const fadeStep = this.#fadeStep;
		let fade = this.#fade;
		let phase = this.#phase;
		let celestePhase = this.#celestePhase;
		let lfo = this.#lfo;
		let bass = this.#bass;
		let celeste = this.#celeste;
		let depth = this.#depth;
		let rate = this.#rate;
		const bassTarget = this.#bassTarget;
		const celesteTarget = this.#celesteTarget;
		const depthTarget = this.#depthTarget;
		const rateTarget = this.#rateTarget;
		for (let i = 0; i < n; i++) {
			bass += (bassTarget - bass) * k;
			celeste += (celesteTarget - celeste) * k;
			depth += (depthTarget - depth) * k;
			rate += (rateTarget - rate) * k;
			let y = table.read(2 * type + bass, phase, limit) * blendLift(bass, alike[type]);
			// the celeste rank sounds as far as the theatre type does
			let beat = type === CELESTE_TYPE ? 1 : 0;
			if (fade < 1) {
				// a straight crossfade: every frame keeps each harmonic's phase, so they add up
				const old = table.read(2 * from + bass, phase, limit) * blendLift(bass, alike[from]);
				y = y * fade + old * (1 - fade);
				beat = beat * fade + (from === CELESTE_TYPE ? 1 - fade : 0);
				fade += fadeStep;
			}
			if (beat > 0 && celeste > 1e-4) {
				y += beat * celeste * table.read(CELESTE_FRAME, celestePhase, celesteLimit);
			}
			const gain = 1 - depth * (0.5 - 0.5 * cos2pi(lfo));
			const out = LEVEL * gain * y;
			left[i] = out;
			right[i] = out;
			phase += half;
			if (phase >= 1) phase -= 1;
			celestePhase += celesteHalf;
			if (celestePhase >= 1) celestePhase -= 1;
			lfo += rate;
			if (lfo >= 1) lfo -= 1;
		}
		this.#fade = Math.min(fade, 1);
		this.#phase = phase;
		this.#celestePhase = celestePhase;
		this.#lfo = lfo;
		this.#bass = bass;
		this.#celeste = celeste;
		this.#depth = depth;
		this.#rate = rate;
	}
}

function clamp01(x: number): number {
	return x < 0 ? 0 : x > 1 ? 1 : x;
}
