/**
 * Silence and dropouts.
 *
 * - **Silence:** 10 ms frames whose RMS (the louder channel's) stays under −60 dBFS: how much there
 *   is, how much at the start and at the end, and the longest stretch between sounds.
 * - **Dropouts:** digital silence 0.2–20 ms long cut into sound, which is what a USB or audio
 *   buffer glitch leaves: the sound 2–20 ms either side is above −40 dBFS and within 6 dB of the
 *   other side, and the last and first 2 ms at the cut are as loud as that (nothing faded). A note
 *   that ends with a release, or starts after a rest, is not one; two notes cut hard with a gap of
 *   under 20 ms between them would look like one, so the summary calls these possible dropouts.
 */

/** A frame quieter than this is silent, dBFS. */
export const SILENCE_DB = -60;

/** Samples this small (all channels) are digital silence (−120 dBFS). */
const ZERO = 1e-6;
/** Dropout lengths, seconds. */
const MIN_DROPOUT = 0.0002;
const MAX_DROPOUT = 0.02;
/** The edge and the context either side of a dropout, seconds. */
const EDGE = 0.002;
const CONTEXT = 0.02;
/** The context must be this loud (amplitude, −40 dBFS). */
const LOUD = 0.01;
/** Dropouts listed (all are counted). */
const LISTED = 20;

/** A dropout. */
export interface Dropout {
	/** Where it starts, seconds. */
	readonly time: number;
	/** How long, ms. */
	readonly ms: number;
}

/** Silence and dropouts of a recording. */
export interface SilenceStats {
	/** Nothing anywhere above {@link SILENCE_DB}. */
	readonly silent: boolean;
	readonly silentSeconds: number;
	readonly leadingSeconds: number;
	readonly trailingSeconds: number;
	/** The longest silent stretch between sounds, seconds. */
	readonly longestGapSeconds: number;
	/** The first dropouts found. */
	readonly dropouts: readonly Dropout[];
	readonly dropoutCount: number;
}

/** RMS of samples [from, to) of every channel together. */
function rms(channels: readonly ArrayLike<number>[], from: number, to: number): number {
	let sum = 0;
	let n = 0;
	for (const channel of channels) {
		for (let i = Math.max(0, from); i < Math.min(channel.length, to); i++) {
			sum += channel[i] * channel[i];
			n++;
		}
	}
	return n > 0 ? Math.sqrt(sum / n) : 0;
}

/** Silence and dropouts in `channels` at `sampleRate`. */
export function silenceStats(
	channels: readonly ArrayLike<number>[],
	sampleRate: number
): SilenceStats {
	const n = channels[0]?.length ?? 0;
	const frame = Math.max(1, Math.round(0.01 * sampleRate));
	const frames = Math.ceil(n / frame);
	const floor = 10 ** (SILENCE_DB / 20);
	const quiet: boolean[] = [];
	for (let f = 0; f < frames; f++) {
		const from = f * frame;
		const to = Math.min(n, from + frame);
		let loudest = 0;
		for (const channel of channels) {
			let sum = 0;
			for (let i = from; i < to; i++) sum += channel[i] * channel[i];
			loudest = Math.max(loudest, Math.sqrt(sum / Math.max(1, to - from)));
		}
		quiet.push(loudest < floor);
	}
	const seconds = (count: number) => Math.min(n, count * frame) / sampleRate;
	const first = quiet.indexOf(false);
	const silent = first === -1;
	const last = silent ? -1 : quiet.lastIndexOf(false);
	let longest = 0;
	let run = 0;
	for (let f = first + 1; f < last; f++) {
		run = quiet[f] ? run + 1 : 0;
		longest = Math.max(longest, run);
	}

	const dropouts: Dropout[] = [];
	let count = 0;
	const edge = Math.max(1, Math.round(EDGE * sampleRate));
	const context = Math.round(CONTEXT * sampleRate);
	const minRun = Math.max(2, Math.round(MIN_DROPOUT * sampleRate));
	const maxRun = Math.round(MAX_DROPOUT * sampleRate);
	let start = -1;
	for (let i = 0; i <= n; i++) {
		const zero = i < n && channels.every((c) => Math.abs(c[i]) <= ZERO);
		if (zero) {
			if (start < 0) start = i;
			continue;
		}
		if (start < 0) continue;
		const length = i - start;
		const [a, b] = [start, i];
		start = -1;
		if (length < minRun || length > maxRun || a < context || b + context > n) continue;
		const before = rms(channels, a - context, a - edge);
		const after = rms(channels, b + edge, b + context);
		if (before < LOUD || after < LOUD) continue;
		if (Math.abs(20 * Math.log10(before / after)) > 6) continue;
		if (rms(channels, a - edge, a) < 0.5 * before || rms(channels, b, b + edge) < 0.5 * after)
			continue;
		count++;
		if (dropouts.length < LISTED)
			dropouts.push({ time: a / sampleRate, ms: (length / sampleRate) * 1000 });
	}

	return {
		silent,
		silentSeconds: seconds(quiet.filter(Boolean).length),
		leadingSeconds: silent ? n / sampleRate : seconds(first),
		trailingSeconds: silent ? n / sampleRate : (n - Math.min(n, (last + 1) * frame)) / sampleRate,
		longestGapSeconds: seconds(longest),
		dropouts,
		dropoutCount: count
	};
}
