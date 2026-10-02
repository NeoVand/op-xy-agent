/**
 * The master bus's soft ceiling: straight up to 0.8, then rounding off so nothing passes 0.96 (the
 * engine's limiter curve, a static wave shaper). The lab applies it where it joins separately
 * rendered parts of a song, as the one master limiter would (a part's tail summed onto the next
 * part's crash read as clipping the unit would not make).
 */

/** Where the curve leaves a straight line. */
const KNEE = 0.8;

/** The ceiling's value at `x` (full scale and beyond: its top, about 0.952). */
export function softLimit(x: number): number {
	const a = Math.min(1, Math.abs(x));
	return a <= KNEE
		? Math.sign(x) * a
		: Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
}

/** The curve as a wave shaper takes it, over −1…1. */
export function softLimitCurve(points = 2049): Float32Array<ArrayBuffer> {
	const half = (points - 1) / 2;
	return Float32Array.from({ length: points }, (_, i) => softLimit((i - half) / half));
}
