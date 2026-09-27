/**
 * Waveforms for the sampler pages. The simulator has no audio, so every sample carries a seed and
 * a deterministic stand-in envelope is generated from it, drawn in the vocabulary of TE's guide
 * art (sample-003 … 140): columns whose half-heights step in sixteenths, TE's drum roll and single
 * hits for phrases, a decay for one-shots. A real recording or a loaded file replaces the stand-in
 * with measured peaks ({@link peaksFromChannels}); every page reads both the same way
 * ({@link waveColumns}), so a future sound engine only has to attach peaks to a sample.
 *
 * Pages receive a waveform as a {@link Wave} string: one base-36 digit (0–g) per column, the
 * column's half-height in sixteenths of the page's maximum. It is plain data, compact in
 * snapshots, and says exactly what the screen draws.
 */

/** A measured peak envelope: 0–1 per point and channel, `rate` points per second. */
export interface Peaks {
	readonly rate: number;
	/** One array per channel (mono has one; the right lane then repeats the left). */
	readonly channels: readonly (readonly number[])[];
}

/** What a waveform is drawn from: the sample's length, its seed, and measured peaks if any. */
export interface WaveSource {
	readonly seconds: number;
	readonly seed: number;
	readonly peaks?: Peaks | null;
}

/** A waveform as a page draws it: one base-36 digit per column, 0–16 (sixteenths). */
export type Wave = string;

/** Steps of a column's half-height (TE draws 1.25 px steps up to 20 px, 16 of them). */
export const WAVE_LEVELS = 16;

/**
 * Seconds per point of a phrase stand-in: a 20 s sample (the recording limit) has one point per
 * 2.07 px column of the M1 lanes, the pitch TE's art uses everywhere.
 */
export const UNIT_SECONDS = 20 / 232;

/** Samples shorter than this are one-shots (a single decaying hit). */
export const ONE_SHOT_SECONDS = 2.5;

/** Points of a one-shot stand-in, whatever its length (one per lane column). */
const ONE_SHOT_POINTS = 232;

/** TE's drum roll (sample-025, lane columns 0–28), in sixteenths. */
const ROLL = [
	1, 1, 1, 1, 2, 9, 16, 1, 2, 9, 16, 1, 2, 9, 16, 1, 2, 3, 4, 3, 2, 1, 1, 2, 3, 4, 3, 2, 1
];
/** TE's single hit (sample-025, lane columns 38–46): a flam into the spike, then a short tail. */
const HIT = [1, 2, 9, 16, 1, 2, 3, 4, 3];

/**
 * The seed whose stand-in is the waveform TE drew in the guide ("ch mart b.wav": the roll, then
 * hits at 3.3, 5.6 and 10.2 s). The stand-in input of the record page plays it too, so a take
 * recorded in the simulator looks like TE's picture.
 */
export const DEMO_SEED = 411112;

/** 0–1 pseudo-random numbers from an integer (mulberry32). */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A small stable hash of a string (FNV-1a), for seeds derived from names. */
export function hashSeed(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * A phrase: TE's roll (or a single hit) at the start, then one to four hits at seeded gaps, in
 * sixteenths per {@link UNIT_SECONDS}.
 */
function phrase(next: () => number, points: number): number[] {
	const out = new Array<number>(points).fill(0);
	const put = (at: number, shape: readonly number[]) =>
		shape.forEach((v, i) => {
			if (at + i < points) out[at + i] = Math.max(out[at + i], v);
		});
	const start = next() < 0.5 ? ROLL : HIT;
	put(0, start);
	let at = start.length;
	let gap = 4 + Math.floor(next() * 12);
	const count = 1 + Math.floor(next() * 4);
	for (let k = 0; k < count && at + gap < points; k++) {
		put(at + gap, HIT);
		at += gap + HIT.length;
		gap = 10 + Math.floor(next() * 40);
	}
	return out;
}

/** A one-shot: a two-point attack, then a jittered exponential decay that dies out in the sample. */
function oneShot(next: () => number): number[] {
	const tau = ONE_SHOT_POINTS * (0.03 + 0.17 * next());
	return Array.from({ length: ONE_SHOT_POINTS }, (_, i) => {
		if (i === 0) return 9;
		const v = WAVE_LEVELS * Math.exp(-(i - 1) / tau) * (0.85 + 0.3 * next()) - 0.4;
		return Math.max(0, Math.min(WAVE_LEVELS, Math.round(v)));
	});
}

/**
 * The stand-in envelope of a sample: sixteenths per point and its point rate (the points span the
 * sample exactly, so a view with one column per point draws them one to one).
 */
export function standIn(seed: number, seconds: number): { rate: number; levels: number[] } {
	const next = random(seed);
	const length = Math.max(seconds, 0.01);
	if (seconds < ONE_SHOT_SECONDS) {
		return { rate: ONE_SHOT_POINTS / length, levels: oneShot(next) };
	}
	const points = Math.max(1, Math.round(seconds / UNIT_SECONDS));
	return { rate: points / length, levels: phrase(next, points) };
}

/** The stand-in as measured-style peaks (0–1), e.g. to store a simulated recording. */
export function standInPeaks(seed: number, seconds: number): Peaks {
	const { rate, levels } = standIn(seed, seconds);
	return { rate, channels: [levels.map((v) => v / WAVE_LEVELS)] };
}

/**
 * Column heights (0–1) of a waveform over `[from, to]` seconds in `columns` columns: each column
 * takes the loudest point whose centre it covers (zoomed out, so no peak is lost and one point per
 * column maps one to one), or the point under its centre (zoomed in: TE's blocky look). Time
 * outside the sample is silent. `channel` 1 is the right lane (mono repeats the left).
 */
export function waveColumns(
	source: WaveSource,
	from: number,
	to: number,
	columns: number,
	channel = 0
): number[] {
	let rate: number;
	let points: readonly number[];
	if (source.peaks && source.peaks.channels.length > 0) {
		rate = source.peaks.rate;
		const channels = source.peaks.channels;
		points = channels[Math.min(channel, channels.length - 1)];
	} else {
		const s = standIn(source.seed, source.seconds);
		rate = s.rate;
		points = s.levels.map((v) => v / WAVE_LEVELS);
	}
	const out = new Array<number>(Math.max(0, columns)).fill(0);
	if (columns <= 0 || to <= from || points.length === 0) return out;
	const step = (to - from) / columns;
	for (let c = 0; c < columns; c++) {
		// the column's span in points; point i covers [i, i + 1) and is centred on i + 0.5
		const a = (from + c * step) * rate;
		const b = (from + (c + 1) * step) * rate;
		let i0 = Math.ceil(a - 0.5);
		let i1 = Math.ceil(b - 0.5) - 1;
		if (i1 < i0) i0 = i1 = Math.floor((a + b) / 2);
		let peak = 0;
		for (let i = Math.max(0, i0); i <= Math.min(points.length - 1, i1); i++) {
			peak = Math.max(peak, points[i]);
		}
		out[c] = peak;
	}
	return out;
}

/** Encodes column heights (0–1) as a {@link Wave} string. */
export function encodeWave(columns: readonly number[]): Wave {
	return columns
		.map((v) => Math.max(0, Math.min(WAVE_LEVELS, Math.round(v * WAVE_LEVELS))).toString(36))
		.join('');
}

/** Decodes a {@link Wave} string into sixteenths per column. */
export function decodeWave(wave: Wave): number[] {
	return [...wave].map((ch) => {
		const v = parseInt(ch, 36);
		return Number.isNaN(v) ? 0 : Math.min(WAVE_LEVELS, v);
	});
}

/** The {@link Wave} of a source over `[from, to]` seconds. */
export function wave(
	source: WaveSource,
	from: number,
	to: number,
	columns: number,
	channel = 0
): Wave {
	return encodeWave(waveColumns(source, from, to, columns, channel));
}

/**
 * Peaks measured from audio (the sound engine's hook): the loudest absolute sample of each block
 * of `sampleRate / rate` frames, per channel.
 */
export function peaksFromChannels(
	channels: readonly ArrayLike<number>[],
	sampleRate: number,
	rate = 200
): Peaks {
	const block = Math.max(1, Math.round(sampleRate / rate));
	return {
		rate: sampleRate / block,
		channels: channels.map((data) => {
			const out: number[] = [];
			for (let start = 0; start < data.length; start += block) {
				let peak = 0;
				const end = Math.min(data.length, start + block);
				for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
				out.push(Math.min(1, Math.round(peak * 1000) / 1000));
			}
			return out;
		})
	};
}
