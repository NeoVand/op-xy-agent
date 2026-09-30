/**
 * The pump: the level falling just after each beat and swelling back before the next, as a duck
 * (sidechain) makes it. The take's level is folded onto one beat, sixteen slices of it, averaged
 * over every beat; a pump reads as its lowest point early in the beat and a gradual rise from there
 * to the beat's end. Notes on the offbeat, a gated part (whose level comes back in one jump), or
 * anything that rises and falls again within the beat, are not one. Without a beat grid (a held pad has no onsets) the fold uses the set tempo and puts the
 * beat where the level drops most steeply, which is where a duck bites.
 */
import { filter, lowpass } from './filters';
import { mono } from './onsets';

/** A pump heard. */
export interface PumpStats {
	/** How far the level falls after the beat and swells back before the next, dB. */
	readonly depthDb: number;
	/** Where in the beat the level is lowest, 0–1. */
	readonly lowAt: number;
}

/** Slices of a beat the level is folded onto. */
const SLICES = 16;
/** A pump this shallow is not reported, dB. */
const MIN_DEPTH_DB = 3;
/** How much the level may dip again on its way back up, dB (noise, a note's attack). */
const SWELL_SLACK_DB = 1.5;
/** The most of the swell one slice may hold: more is a note arriving, not a level coming back. */
const MAX_RISE_SHARE = 0.6;
/** Where the low end the pump is also looked for in stops, Hz. */
const LOW_HZ = 200;
/** Level frames, seconds. */
const HOP_SECONDS = 0.005;
/** Beats a take needs for a fold worth reading. */
const MIN_BEATS = 4;

const db = (power: number) => 10 * Math.log10(power + 1e-12);

/** The level of `x` folded onto one beat of `beat` seconds from `phase`, in dB per slice. */
function fold(power: Float64Array, hop: number, beat: number, phase: number): number[] {
	const sums = new Float64Array(SLICES);
	const counts = new Float64Array(SLICES);
	for (let i = 0; i < power.length; i++) {
		const t = i * hop - phase;
		const position = (((t / beat) % 1) + 1) % 1;
		const slice = Math.min(SLICES - 1, Math.floor(position * SLICES));
		sums[slice] += power[i];
		counts[slice]++;
	}
	return Array.from(sums, (sum, s) => db(counts[s] > 0 ? sum / counts[s] : 0));
}

/**
 * The pump in `channels` at `bpm`, or null when the level does not fall and swell back with the
 * beat. It is looked for in the whole sound and in its low end (under 200 Hz), where a ducked bass
 * sits and a mix's hats and chords do not break its swell. `phase` is where the first beat falls
 * (seconds); null finds it from the level.
 */
export function pumpStats(
	channels: readonly ArrayLike<number>[],
	sampleRate: number,
	bpm: number,
	phase: number | null
): PumpStats | null {
	if (!(bpm > 0)) return null;
	const x = mono(channels);
	const beat = 60 / bpm;
	if (x.length < MIN_BEATS * beat * sampleRate) return null;
	const whole = pumpIn(x, sampleRate, beat, phase);
	const low = pumpIn(filter(x, lowpass(LOW_HZ, sampleRate)), sampleRate, beat, phase);
	if (!whole) return low;
	if (!low) return whole;
	return whole.depthDb >= low.depthDb ? whole : low;
}

/** The pump in one signal: its level folded onto the beat, checked for a bite and a swell. */
function pumpIn(
	x: ArrayLike<number>,
	sampleRate: number,
	beat: number,
	phase: number | null
): PumpStats | null {
	const hop = Math.max(1, Math.round(HOP_SECONDS * sampleRate));
	const frames = Math.floor(x.length / hop);
	const power = new Float64Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		for (let i = f * hop; i < (f + 1) * hop; i++) sum += x[i] * x[i];
		power[f] = sum / hop;
	}
	let profile = fold(power, hop / sampleRate, beat, phase ?? 0);
	if (phase === null) {
		// the beat starts where the level drops most steeply; a bite that falls between two slices
		// drops over both, and starts in the first
		const dropInto = (s: number) => profile[(s + SLICES - 1) % SLICES] - profile[s];
		let start = 0;
		for (let s = 1; s < SLICES; s++) if (dropInto(s) > dropInto(start)) start = s;
		if (dropInto((start + SLICES - 1) % SLICES) > SWELL_SLACK_DB)
			start = (start + SLICES - 1) % SLICES;
		profile = [...profile.slice(start), ...profile.slice(0, start)];
	}
	// lowest in the first half of the beat, then (nearly) always rising to its loudest near the end;
	// the last slice may hold the next bite already, when the beat falls inside it
	let low = 0;
	for (let s = 1; s < SLICES / 2; s++) if (profile[s] < profile[low]) low = s;
	let peak = low;
	let high = profile[low];
	for (let s = low + 1; s < SLICES - 1; s++) {
		if (profile[s] < high - SWELL_SLACK_DB) return null;
		if (profile[s] >= high) {
			high = profile[s];
			peak = s;
		}
	}
	const depthDb = high - profile[low];
	if (peak < (SLICES * 5) / 8 || depthDb < MIN_DEPTH_DB) return null;
	// a duck swells back; a note arrives at once (a gated or offbeat part jumps in one slice)
	let steepestRise = 0;
	for (let s = low; s < peak; s++)
		steepestRise = Math.max(steepestRise, profile[s + 1] - profile[s]);
	if (steepestRise > MAX_RISE_SHARE * depthDb) return null;
	return { depthDb: Math.round(depthDb * 10) / 10, lowAt: low / SLICES };
}
