/**
 * Laws measured on the owner's OP-XY (docs/research/60-sound-session.md) that both the synth core
 * (in the audio worklet) and the Web Audio voices use. Pure numbers, no imports, so the worklet
 * bundle stays small.
 */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** A 0–99 screen value as the lane's CC 0–127, the scale the device was measured on. */
export const toCc = (v: number): number => (clamp(v, 0, 99) * 127) / 99;

/** Interpolates `ys` over `xs` (ascending) at `x`, in log space (for times and Q). */
export function logTable(xs: readonly number[], ys: readonly number[], x: number): number {
	if (x <= xs[0]) return ys[0];
	let i = 1;
	while (i < xs.length - 1 && xs[i] < x) i++;
	const t = Math.min(1, (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
	return Math.exp(Math.log(ys[i - 1]) * (1 - t) + Math.log(ys[i]) * t);
}

// ───────────────────────────────────────────────────────────────── envelopes

/** Where the attack's curve heads: an RC charge toward twice the peak, stopping at the peak. */
export const ATTACK_TARGET = 2;

/** A decay to sustain 0 cuts to silence here (about −41 dB). */
export const DECAY_CUT = 0.009;

// ───────────────────────────────────────────────────────────────── filters

/** The z pair's Q at resonance CC 0, 32, 64, 96, 112 and 127. */
const Z_RESONANCE_CC = [0, 32, 64, 96, 112, 127] as const;
const Z_LOWPASS_Q = [0.2, 0.63, 1.08, 8.9, 25, 40] as const;
const Z_HIPASS_Q = [0.2, 0.63, 1.07, 3.0, 3.9, 4.1] as const;

/** The z lowpass's (or z hipass's) Q at resonance 0–99: 0.2 (very soft) up to 40, or to 4. */
export const zQ = (v: number, highpass: boolean): number =>
	logTable(Z_RESONANCE_CC, highpass ? Z_HIPASS_Q : Z_LOWPASS_Q, toCc(v));

/** The z pair lose level as the resonance rises: 7.2 dB at the top. */
export const zLevelDb = (v: number): number => -7.2 * Math.pow(clamp(v, 0, 99) / 99, 1.35);

/** The svf sections' damping (1/Q) at resonance 0–99: 1.39 (a soft knee) down to 0.14. */
export const svfDamping = (v: number): number => 1.39 - 1.25 * Math.pow(clamp(v, 0, 99) / 99, 1.6);

/** How far the svf's resonance lowers its frequency, in octaves (up to 0.62). */
export const svfShift = (v: number): number => -0.62 * Math.pow(clamp(v, 0, 99) / 99, 0.75);

/** The level the svf loses at resonance 0–99 (9 dB at the top). */
export const svfLevelDb = (v: number): number => -9 * Math.pow(clamp(v, 0, 99) / 99, 4);

/**
 * The ladder's feedback at resonance 0–1, fitted per setting (1.17, 2.13, 3.0 at a quarter, half
 * and three quarters): sharply peaked at the top (3.65) without quite running away (4 would).
 */
export const ladderFeedback = (r: number): number => {
	const x = clamp(r, 0, 1);
	return 4.95 * x - 1.3 * x * x;
};

/** How much of the bass the ladder's input gain gives back as the feedback rises. */
export const LADDER_COMPENSATION = 0.32;
