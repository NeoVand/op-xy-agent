/**
 * The stereo control of simple and prism, as measured on the owner's OP-XY (2026-09-27, OS 1.1.33;
 * `docs/research/57-synth-engines.md` §3, `research/device/stereo_fit.py`): the dry sound in both
 * channels, plus in each a copy through a delay that a slow triangle sweeps, so the copy sits a few
 * cents off the note, up in one channel while down in the other, the two trading places at every
 * turn of the triangle. The copy is high-passed, so the bass stays in the middle.
 *
 * Measured, the same on both engines (the dry sound keeps its level throughout):
 * - up to 64 of 127, stereo raises the copy's level (0.0135 a step: 0.86 at 64);
 * - above it the level holds (0.89) while the offset widens and the triangle quickens: 6.9 cents
 *   and a half period of 3.05 s up to 64, then 8.7, 10.7, 12.9 and 15.2 cents and 2.8, 2.6, 2.35
 *   and 2.2 s at 80, 96, 112 and 127;
 * - the copy's high-pass, one pole: about 815 Hz up to 64, then 730, 650, 565 and 490 Hz;
 * - the triangle runs free: its turns fall on one clock across notes.
 *
 * Our model: the dry sound goes into a delay line; each channel reads it τ₀ ± D·tri behind (cubic
 * interpolation), where a triangle of period P sweeping D = δ·P/4 either way moves the copy by δ
 * (the offset as a ratio). The triangle's phase comes from the core's clock, so the notes of a
 * chord move together. Everything glides over {@link GLIDE_SECONDS}.
 */

/** Stereo past this (of 1) widens the offset instead of raising the level (CC 64 of 127). */
const KNEE = 64 / 127;
/** The copy's level at the knee and at the top. */
const LEVEL_KNEE = 0.86;
const LEVEL_TOP = 0.89;
/** The copy's offset (cents) up to the knee and at the top. */
const CENTS_KNEE = 6.9;
const CENTS_TOP = 15.2;
/** The triangle's half period (seconds) up to the knee and at the top. */
const HALF_KNEE = 3.05;
const HALF_TOP = 2.2;
/** The copy's high-pass corner (Hz) up to the knee and at the top. */
const CORNER_KNEE = 815;
const CORNER_TOP = 490;

// Design constants.
/** The delay's centre (seconds): past the deepest sweep (9.7 ms), so it never reads ahead. */
const CENTRE = 0.012;
/** How long the delay line holds (seconds). */
const HOLD = 0.03;
/** Every setting glides over this long (seconds): a sweep's depth changing at once would jump. */
const GLIDE_SECONDS = 0.03;

/** Where `s` (0–1) sits past the knee (0 up to it, 1 at the top). */
const past = (s: number) => Math.max(0, (s - KNEE) / (1 - KNEE));

/** The copy's level at stereo `s` (0–1). */
export function copyLevel(s: number): number {
	return s <= KNEE ? (LEVEL_KNEE * s) / KNEE : LEVEL_KNEE + (LEVEL_TOP - LEVEL_KNEE) * past(s);
}

/** The copy's offset from the note (cents) at stereo `s`. */
export const offsetCents = (s: number) => CENTS_KNEE + (CENTS_TOP - CENTS_KNEE) * past(s);

/** The triangle's half period (seconds) at stereo `s`. */
export const halfPeriod = (s: number) => HALF_KNEE + (HALF_TOP - HALF_KNEE) * past(s);

/** The copy's high-pass corner (Hz) at stereo `s`. */
export const copyCorner = (s: number) => CORNER_KNEE + (CORNER_TOP - CORNER_KNEE) * past(s);

/** A one-pole high-pass (TPT), its gain set per block. */
class Highpass {
	#s = 0;
	#G = 0;

	set(g: number): void {
		this.#G = g / (1 + g);
	}

	process(x: number): number {
		const v = (x - this.#s) * this.#G;
		const low = v + this.#s;
		this.#s = low + v;
		return x - low;
	}
}

export class StereoCopy {
	readonly #sr: number;
	readonly #buffer: Float32Array;
	readonly #mask: number;
	#write = 0;
	readonly #glide: number;
	readonly #highL = new Highpass();
	readonly #highR = new Highpass();
	/** The triangle's phase (cycles) and the settings now and where they are going. */
	#phase = 0;
	#level = 0;
	#levelTarget = 0;
	#depth = 0;
	#depthTarget = 0;
	#rate = 0;
	#rateTarget = 0;
	#corner = CORNER_KNEE;
	#cornerTarget = CORNER_KNEE;

	constructor(sampleRate: number) {
		this.#sr = sampleRate;
		let size = 1;
		while (size < HOLD * sampleRate) size *= 2;
		this.#buffer = new Float32Array(size);
		this.#mask = size - 1;
		this.#glide = 1 - Math.exp(-1 / (GLIDE_SECONDS * sampleRate));
	}

	/** A new note at `time` on the core's clock, at stereo `s`: settings jump there. */
	start(s: number, time: number): void {
		this.#buffer.fill(0);
		this.#write = 0;
		this.set(s);
		this.#level = this.#levelTarget;
		this.#depth = this.#depthTarget;
		this.#rate = this.#rateTarget;
		this.#corner = this.#cornerTarget;
		// the triangle runs free: where it is now on the clock
		const cycles = this.#rate * this.#sr * time;
		this.#phase = cycles - Math.floor(cycles);
	}

	/** Targets for stereo `s` (0–1). */
	set(s: number): void {
		const half = halfPeriod(s);
		const ratio = Math.pow(2, offsetCents(s) / 1200) - 1;
		this.#levelTarget = copyLevel(s);
		// a sweep of D either way over half a period moves the read by 2D / (P/2) = the ratio
		this.#depthTarget = (ratio * half) / 2;
		this.#rateTarget = 1 / (2 * half * this.#sr);
		this.#cornerTarget = copyCorner(s);
	}

	/**
	 * Writes `n` samples: `dry` (mono) into both channels, plus each channel's copy. `left` may be
	 * `dry` itself.
	 */
	process(dry: Float32Array, left: Float32Array, right: Float32Array, n: number): void {
		const buffer = this.#buffer;
		const mask = this.#mask;
		const sr = this.#sr;
		const k = 1 - Math.pow(1 - this.#glide, n);
		this.#corner += (this.#cornerTarget - this.#corner) * k;
		const g = Math.tan((Math.PI * this.#corner) / sr);
		this.#highL.set(g);
		this.#highR.set(g);
		const glide = this.#glide;
		let level = this.#level;
		let depth = this.#depth;
		let rate = this.#rate;
		let phase = this.#phase;
		let write = this.#write;
		const levelTarget = this.#levelTarget;
		const depthTarget = this.#depthTarget;
		const rateTarget = this.#rateTarget;
		const quiet = level < 1e-5 && levelTarget < 1e-5;
		for (let i = 0; i < n; i++) {
			const x = dry[i];
			buffer[write] = x;
			level += (levelTarget - level) * glide;
			depth += (depthTarget - depth) * glide;
			rate += (rateTarget - rate) * glide;
			phase += rate;
			if (phase >= 1) phase -= 1;
			if (quiet) {
				left[i] = x;
				right[i] = x;
			} else {
				// a triangle from −1 to 1 and back; the two channels read on opposite sides of the centre
				const tri = 4 * Math.abs(phase - 0.5) - 1;
				const swing = depth * tri * sr;
				const centre = CENTRE * sr;
				const copyL = read(buffer, mask, write - centre - swing);
				const copyR = read(buffer, mask, write - centre + swing);
				left[i] = x + level * this.#highL.process(copyL);
				right[i] = x + level * this.#highR.process(copyR);
			}
			write = (write + 1) & mask;
		}
		this.#level = level;
		this.#depth = depth;
		this.#rate = rate;
		this.#phase = phase;
		this.#write = write;
	}
}

/** The delay line at a fractional position (samples, any sign: it wraps), by cubic Hermite. */
function read(buffer: Float32Array, mask: number, at: number): number {
	const i = Math.floor(at);
	const t = at - i;
	const y0 = buffer[(i - 1) & mask];
	const y1 = buffer[i & mask];
	const y2 = buffer[(i + 1) & mask];
	const y3 = buffer[(i + 2) & mask];
	const c1 = 0.5 * (y2 - y0);
	const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
	const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
	return ((c3 * t + c2) * t + c1) * t + y1;
}
