/**
 * The volume pot, as the replica plays it: the knob's travel (0–1) to an output gain. The middle is
 * the level the app plays at by default, the mix as the device makes it; the top half adds up to
 * 6 dB, which a soft guard after it keeps from clipping (see {@link guardCurve}), and the bottom half
 * fades evenly in decibels to silence, the last few degrees going to nothing.
 */
export function volumeGain(position: number): number {
	const v = Math.min(1, Math.max(0, position));
	if (v >= 0.5) return 10 ** ((((v - 0.5) / 0.5) * 6) / 20);
	if (v === 0) return 0;
	const db = -36 * ((0.5 - v) / 0.5) ** 1.3;
	return 10 ** (db / 20) * Math.min(1, v / 0.05);
}

/**
 * The guard after the volume stage: a WaveShaper curve for a signal scaled by ½ on its way in (so
 * the curve's −1…1 spans ±2, the most the top of the pot can reach). Level passes untouched up to
 * 0.9 and rounds off toward 1 above it, so a turned-up pot saturates rather than clips.
 */
export function guardCurve(points = 2049): Float32Array<ArrayBuffer> {
	const half = (points - 1) / 2;
	return Float32Array.from({ length: points }, (_, i) => {
		const x = (2 * (i - half)) / half;
		const a = Math.abs(x);
		return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
	});
}
