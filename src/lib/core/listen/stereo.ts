/**
 * The stereo picture: correlation (+1 mono, 0 two unrelated channels, −1 one channel's polarity
 * flipped), width as the side's level against the mid's, the balance between left and right, the
 * same correlation below 150 Hz (a mix's low end usually wants to be close to mono), and how much
 * level folding down to mono loses (0 dB for mono, −3 dB for unrelated channels, a lot for
 * cancelling ones).
 */
import { filter, lowpass } from './filters';

/** Where the low-end correlation looks, hertz. */
export const LOW_END_HZ = 150;

/** Balances beyond this read as this (one side silent), dB. */
const BALANCE_LIMIT = 60;
/** Widths beyond this read as this (the channels cancel), so results stay JSON. */
const WIDTH_LIMIT = 10;

/** Stereo measures; a mono recording reads as centred mono. */
export interface StereoStats {
	/** Σ L·R / √(Σ L²·Σ R²): 1 mono, 0 unrelated, −1 opposite; null when a side is silent. */
	readonly correlation: number | null;
	/** RMS of the side (L − R)/2 over the mid (L + R)/2: 0 mono, about 1 unrelated channels, 10 at most. */
	readonly width: number;
	/** Left over right RMS, dB (positive: louder on the left), ±60 when one side is silent. */
	readonly balanceDb: number;
	/** The correlation below {@link LOW_END_HZ}; null when nothing is down there. */
	readonly lowCorrelation: number | null;
	/** Level of the mono fold-down against the stereo channels, dB (0 mono, −3 unrelated). */
	readonly monoLossDb: number;
}

function correlate(left: ArrayLike<number>, right: ArrayLike<number>): number | null {
	let lr = 0;
	let ll = 0;
	let rr = 0;
	for (let i = 0; i < left.length; i++) {
		lr += left[i] * right[i];
		ll += left[i] * left[i];
		rr += right[i] * right[i];
	}
	return ll > 1e-18 && rr > 1e-18 ? Math.max(-1, Math.min(1, lr / Math.sqrt(ll * rr))) : null;
}

/** The stereo measures of `channels` (one or two). */
export function stereoStats(
	channels: readonly ArrayLike<number>[],
	sampleRate: number
): StereoStats {
	if (channels.length < 2) {
		return { correlation: 1, width: 0, balanceDb: 0, lowCorrelation: 1, monoLossDb: 0 };
	}
	const [left, right] = channels;
	let ll = 0;
	let rr = 0;
	let mid = 0;
	let side = 0;
	for (let i = 0; i < left.length; i++) {
		const l = left[i];
		const r = right[i];
		ll += l * l;
		rr += r * r;
		mid += ((l + r) / 2) ** 2;
		side += ((l - r) / 2) ** 2;
	}
	const balance =
		ll > 0 && rr > 0
			? 10 * Math.log10(ll / rr)
			: ll > 0
				? BALANCE_LIMIT
				: rr > 0
					? -BALANCE_LIMIT
					: 0;
	const f = lowpass(LOW_END_HZ, sampleRate);
	const lowLeft = filter(filter(left, f), f);
	const lowRight = filter(filter(right, f), f);
	// the low end counts only when it holds something (a thousandth of the energy, −30 dB)
	let low = 0;
	for (let i = 0; i < lowLeft.length; i++) low += lowLeft[i] ** 2 + lowRight[i] ** 2;
	const fold = ll + rr > 0 ? (2 * mid) / (ll + rr) : 1;
	return {
		correlation: correlate(left, right),
		width: mid > 0 ? Math.min(WIDTH_LIMIT, Math.sqrt(side / mid)) : side > 0 ? WIDTH_LIMIT : 0,
		balanceDb: Math.max(-BALANCE_LIMIT, Math.min(BALANCE_LIMIT, balance)),
		lowCorrelation: low > 1e-3 * (ll + rr) ? correlate(lowLeft, lowRight) : null,
		monoLossDb: fold > 0 ? Math.max(-BALANCE_LIMIT, 10 * Math.log10(fold)) : -BALANCE_LIMIT
	};
}
