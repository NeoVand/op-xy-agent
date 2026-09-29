/**
 * What kind of drum sound a sample is, so a folder of one-shots dropped on the preset maker lands
 * where TE's factory kits keep each kind (docs/research/30-presets-samples.md §7.4: kicks on 53–54,
 * snares 55–56, rim 57, clap 58 … chi 76). The file name decides first ("BD_01", "Snare Rim",
 * "hh-open"); otherwise the sound does: how much of it is low, how long it rings, how bright and
 * how tonal it is, whether its pitch falls (a kick) and whether it comes in bursts (a clap), read
 * on the hit itself. Pure and deterministic, so the same files always land on the same keys.
 */
import { fft } from '../dsp/fft';
import { mono } from './audio';
import { DRUM_FIRST_KEY, DRUM_KEYS } from './patch';
import type { PcmAudio } from './wav';

/** The kinds of drum sound the preset maker tells apart (TE's factory layout names them all). */
export const DRUM_KINDS = [
	'kick',
	'snare',
	'rim',
	'clap',
	'tambourine',
	'shaker',
	'closed hat',
	'open hat',
	'clave',
	'tom',
	'ride',
	'crash',
	'triangle',
	'conga',
	'cowbell',
	'guiro',
	'metal',
	'fx',
	'perc'
] as const;
export type DrumKind = (typeof DRUM_KINDS)[number];

/**
 * TE's factory layout, key by key from 53 (note 30 §1.6): the kind each key holds. Toms and congas
 * repeat, low to high.
 */
export const TE_LAYOUT: readonly DrumKind[] = [
	'kick',
	'kick',
	'snare',
	'snare',
	'rim',
	'clap',
	'tambourine',
	'shaker',
	'closed hat',
	'closed hat',
	'open hat',
	'clave',
	'tom',
	'ride',
	'tom',
	'crash',
	'tom',
	'triangle',
	'conga',
	'conga',
	'cowbell',
	'guiro',
	'metal',
	'fx'
];

/** What a key is called in TE's layout (the toms and congas by their height). */
export const TE_SLOT_NAMES: readonly string[] = TE_LAYOUT.map((kind, i) =>
	kind === 'tom'
		? ['low tom', 'mid tom', 'high tom'][[12, 14, 16].indexOf(i)]
		: kind === 'conga'
			? i === 18
				? 'low conga'
				: 'high conga'
			: kind === 'fx'
				? 'chi'
				: kind
);

/**
 * Where a kind goes when its own keys are taken: the keys of its family, in order (slot indices
 * into {@link TE_LAYOUT}), before any other free key.
 */
const FAMILY: Readonly<Record<DrumKind, readonly number[]>> = {
	kick: [0, 1, 12, 14, 16],
	snare: [2, 3, 5, 4],
	rim: [4, 11, 2, 3],
	clap: [5, 3, 2],
	tambourine: [6, 7, 21],
	shaker: [7, 6, 21],
	'closed hat': [8, 9, 10, 7],
	'open hat': [10, 9, 8, 13],
	clave: [11, 4, 20],
	tom: [12, 14, 16, 18, 19],
	ride: [13, 15, 10],
	crash: [15, 13, 10],
	triangle: [17, 22, 23],
	conga: [18, 19, 16, 14, 12],
	cowbell: [20, 22, 11],
	guiro: [21, 7, 6],
	metal: [22, 20, 17, 23],
	fx: [23, 22, 21],
	perc: [22, 21, 20, 11, 23, 17, 19, 18]
};

/** Name → kind, most specific first ("snare rim" is a rim, "open hat" before any hat). */
const NAME_RULES: readonly { readonly kind: DrumKind; readonly words: RegExp }[] = [
	{ kind: 'open hat', words: /\b(open ?hat|open ?hh|ohh?|hh ?o(pen)?|hho|open)\b/ },
	{ kind: 'closed hat', words: /\b(closed ?hat|closed ?hh|chh?|hh ?c(losed|l)?|hhc|closed)\b/ },
	{ kind: 'closed hat', words: /\b(hi ?hats?|hats?|hh|hihat|pedal)\b/ },
	{ kind: 'rim', words: /\b(rims?|rimshot|rim ?shot|side ?stick|x ?stick|sticks?|rs)\b/ },
	{ kind: 'clap', words: /\b(claps?|clp|cp|hand ?clap|snaps?|finger ?snap)\b/ },
	{ kind: 'snare', words: /\b(snares?|snr|sd|sn|sna)\b/ },
	{ kind: 'kick', words: /\b(kicks?|kik|kck|bd|bass ?drum|bassdrum|kd)\b/ },
	{ kind: 'tom', words: /\b(toms?|floor ?tom|lt|mt|ht|ft)\b/ },
	{ kind: 'conga', words: /\b(congas?|bongos?|cga|tumba|quinto|djembe|timbales?)\b/ },
	{ kind: 'ride', words: /\b(rides?|rd|ride ?bell)\b/ },
	{ kind: 'crash', words: /\b(crash(es)?|cr|splash|china|cymbals?|cym)\b/ },
	{ kind: 'triangle', words: /\b(triangles?|triang|tri)\b/ },
	{ kind: 'cowbell', words: /\b(cow ?bells?|cb|agogo|bells?)\b/ },
	{ kind: 'clave', words: /\b(claves?|clv|wood ?block|block|wb)\b/ },
	{ kind: 'shaker', words: /\b(shakers?|shk|shkr|maracas?|cabasa|egg)\b/ },
	{ kind: 'tambourine', words: /\b(tambourines?|tamb|tambo|tamborine|tmb|jingle)\b/ },
	{ kind: 'guiro', words: /\b(guiro|gro|scrape|rasp)\b/ },
	{ kind: 'metal', words: /\b(metal|anvil|clank|tin|pipe)\b/ },
	{
		kind: 'fx',
		words: /\b(fx|sfx|chi|chime|zap|laser|sweep|noise|riser|impact|vox|vocal|blip|glitch)\b/
	},
	{ kind: 'perc', words: /\b(perc(ussion)?|hit)\b/ }
];

/** A file name as words: `SnareRoll_02.wav` → `snare roll 02`, `BD01` → `bd 01`. */
export function nameWords(fileName: string): string {
	return fileName
		.replace(/\.[a-z0-9]{2,5}$/i, '')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([a-zA-Z])(\d)/g, '$1 $2')
		.replace(/(\d)([a-zA-Z])/g, '$1 $2')
		.toLowerCase()
		.replace(/[^a-z0-9#]+/g, ' ')
		.trim();
}

/** The kind a file name gives, or null when it names none. */
export function kindFromName(fileName: string): DrumKind | null {
	const words = nameWords(fileName);
	for (const rule of NAME_RULES) if (rule.words.test(words)) return rule.kind;
	return null;
}

/** What {@link drumFeatures} measures on a hit. */
export interface DrumFeatures {
	/** Seconds from the peak until the sound has fallen 30 dB for good. */
	readonly decay: number;
	/** Seconds the hit takes to rise from a tenth of its peak energy to nine tenths. */
	readonly attack: number;
	/** Shares of the hit's energy below 150 Hz, below 1 kHz and above 5 kHz (0–1). */
	readonly low: number;
	readonly belowKHz: number;
	readonly high: number;
	/** The spectral centroid, Hz. */
	readonly centroid: number;
	/** How much of the energy sits in the three strongest partials (0 noise … 1 pure tones). */
	readonly tonal: number;
	/** The strongest partial, Hz. */
	readonly pitch: number;
	/** How far the pitch falls: the pitch just after the hit over the pitch later (1 = steady). */
	readonly sweep: number;
	/** Separate bursts in the first 60 ms (a clap's slaps). */
	readonly bursts: number;
	/** Separate bursts in the first half second, at least 12 ms apart (a guiro's scrapes). */
	readonly pulses: number;
}

/** The analysis window: about 93 ms at 44.1 kHz, so a 45 Hz kick is resolved. */
const FFT_SIZE = 4096;
/** The part of the hit whose spectrum counts (s). */
const SPECTRUM_SECONDS = 0.3;

/** Mean squares in `hop`-long steps over `win`-long windows. */
function energyEnvelope(x: Float32Array, hop: number, win: number): Float64Array {
	const sums = new Float64Array(x.length + 1);
	for (let i = 0; i < x.length; i++) sums[i + 1] = sums[i] + x[i] * x[i];
	const n = Math.max(1, Math.floor(x.length / hop));
	const out = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		const a = k * hop;
		const b = Math.min(x.length, a + win);
		out[k] = b > a ? (sums[b] - sums[a]) / (b - a) : 0;
	}
	return out;
}

/** Crossings per second of `x` over [from, to), after a gentle low-pass at `cutoff` Hz. */
function crossingRate(x: Float32Array, sr: number, from: number, to: number, cutoff: number) {
	// a two-pole low-pass (RBJ) so a click or the wires do not count as pitch
	const w = (2 * Math.PI * Math.min(cutoff, sr * 0.45)) / sr;
	const alpha = Math.sin(w) / (2 * 0.707);
	const cos = Math.cos(w);
	const a0 = 1 + alpha;
	const b0 = (1 - cos) / 2 / a0;
	const b1 = (1 - cos) / a0;
	const a1 = (-2 * cos) / a0;
	const a2 = (1 - alpha) / a0;
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	let crossings = 0;
	let previous = 0;
	const start = Math.max(0, from - Math.round(0.01 * sr));
	for (let i = start; i < Math.min(x.length, to); i++) {
		const y = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
		x2 = x1;
		x1 = x[i];
		y2 = y1;
		y1 = y;
		if (i >= from && previous < 0 !== y < 0) crossings++;
		previous = y;
	}
	const seconds = (Math.min(x.length, to) - from) / sr;
	return seconds > 0 ? crossings / 2 / seconds : 0;
}

/** Measures a hit (see {@link DrumFeatures}); silence gives zeros. */
export function drumFeatures(audio: PcmAudio): DrumFeatures {
	const x = mono(audio.channels);
	const sr = audio.sampleRate;
	let peakAbs = 0;
	for (const v of x) peakAbs = Math.max(peakAbs, Math.abs(v));
	const none: DrumFeatures = {
		decay: 0,
		attack: 0,
		low: 0,
		belowKHz: 0,
		high: 0,
		centroid: 0,
		tonal: 0,
		pitch: 0,
		sweep: 1,
		bursts: 0,
		pulses: 0
	};
	if (peakAbs < 1e-5) return none;

	// the hit starts where it first comes within 40 dB of its peak
	const floor = peakAbs * 0.01;
	let start = 0;
	while (start < x.length && Math.abs(x[start]) < floor) start++;

	// loudness in 1 ms steps: attack, decay and bursts
	const hop = Math.max(1, Math.round(sr / 1000));
	const env = energyEnvelope(x, hop, Math.max(hop, Math.round(0.004 * sr)));
	let peakAt = 0;
	for (let k = 1; k < env.length; k++) if (env[k] > env[peakAt]) peakAt = k;
	// the attack is the rise from a tenth of the peak's energy to half of it: a long noise's own
	// spikes, later on, do not stretch it
	let low10 = Math.floor(start / hop);
	while (low10 < peakAt && env[low10] < 0.1 * env[peakAt]) low10++;
	let high50 = low10;
	while (high50 < peakAt && env[high50] < 0.5 * env[peakAt]) high50++;
	const attack = ((high50 - low10) * hop) / sr;
	const quiet = env[peakAt] * 10 ** (-30 / 10);
	let last = peakAt;
	for (let k = env.length - 1; k > peakAt; k--) {
		if (env[k] > quiet) {
			last = k;
			break;
		}
	}
	const decay = ((last - peakAt) * hop) / sr;

	// bursts: peaks of the 1 ms loudness rising out of a dip, a clap's slaps within 60 ms of the
	// start, a guiro's scrapes over half a second
	const first = Math.floor(start / hop);
	const bursts = countBursts(env, first, 60, 4, 0.2 * env[peakAt]);
	// scrapes fade fast (a guiro loses 6 dB a scrape), so they count down to −25 dB
	const pulses = countBursts(env, first, 500, 12, 0.003 * env[peakAt]);

	// the hit's power spectrum over its first 0.3 s, frames weighted by their energy
	const n = FFT_SIZE;
	const power = new Float64Array(n / 2);
	const re = new Float64Array(n);
	const im = new Float64Array(n);
	const stop = Math.min(x.length, start + Math.round(SPECTRUM_SECONDS * sr));
	for (let at = start; at < stop; at += n / 2) {
		for (let i = 0; i < n; i++) {
			const v = at + i < x.length ? x[at + i] : 0;
			re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
			im[i] = 0;
		}
		fft(re, im);
		for (let k = 0; k < n / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
	}
	const binHz = sr / n;
	let total = 0;
	let low = 0;
	let belowKHz = 0;
	let high = 0;
	let weighted = 0;
	let magnitude = 0;
	// from 20 Hz: the rumble and DC of a recording say nothing about the drum
	const lowest = Math.ceil(20 / binHz);
	for (let k = lowest; k < n / 2; k++) {
		const f = k * binHz;
		const p = power[k];
		total += p;
		if (f < 150) low += p;
		if (f < 1000) belowKHz += p;
		if (f > 5000) high += p;
		const m = Math.sqrt(p);
		weighted += m * f;
		magnitude += m;
	}
	if (!(total > 0)) return { ...none, decay, attack };

	// the three strongest partials (±4 bins each) and their share of the energy
	const taken = new Uint8Array(n / 2);
	let tonalPower = 0;
	let pitchBin = 0;
	for (let p = 0; p < 3; p++) {
		let best = -1;
		for (let k = lowest; k < n / 2; k++)
			if (!taken[k] && (best < 0 || power[k] > power[best])) best = k;
		if (best < 0) break;
		if (p === 0) pitchBin = best;
		for (let k = Math.max(lowest, best - 4); k <= Math.min(n / 2 - 1, best + 4); k++) {
			if (!taken[k]) tonalPower += power[k];
			taken[k] = 1;
		}
	}
	// the strongest partial between bins, on a parabola through its log power
	let pitch = pitchBin * binHz;
	if (pitchBin > lowest && pitchBin < n / 2 - 1) {
		const [a, b, c] = [pitchBin - 1, pitchBin, pitchBin + 1].map((k) => Math.log(power[k] + 1e-20));
		const bend = a - 2 * b + c;
		if (bend < 0) pitch = (pitchBin + (0.5 * (a - c)) / bend) * binHz;
	}

	// a falling pitch: crossings just after the hit against later, below a few times the pitch
	const cutoff = Math.min(2000, Math.max(250, pitch * 4));
	const early = crossingRate(
		x,
		sr,
		start + Math.round(0.002 * sr),
		start + Math.round(0.02 * sr),
		cutoff
	);
	const later = crossingRate(
		x,
		sr,
		start + Math.round(0.06 * sr),
		start + Math.round(0.15 * sr),
		cutoff
	);
	const sweep = later > 0 && early > 0 ? early / later : 1;

	return {
		decay,
		attack,
		low: low / total,
		belowKHz: belowKHz / total,
		high: high / total,
		centroid: weighted / magnitude,
		tonal: tonalPower / total,
		pitch,
		sweep,
		bursts,
		pulses
	};
}

/**
 * Peaks of `env` (1 ms steps) in the `span` steps after `from`, each above `floor`, at least `gap`
 * steps after the last and rising out of a dip below 45 % of itself.
 */
function countBursts(env: Float64Array, from: number, span: number, gap: number, floor: number) {
	const end = Math.min(env.length - 1, from + span);
	let count = 0;
	let dip = Infinity;
	let last = -Infinity;
	for (let k = from + 1; k < end; k++) {
		dip = Math.min(dip, env[k]);
		const peak = env[k] >= env[k - 1] && env[k] > env[k + 1] && env[k] > floor;
		if (peak && (count === 0 || (dip < 0.45 * env[k] && k - last >= gap))) {
			count++;
			last = k;
			dip = Infinity;
		}
	}
	return count;
}

/** What a sound was taken for, and why. */
export interface DrumGuess {
	readonly kind: DrumKind;
	/** The file name said so, or the sound did. */
	readonly from: 'name' | 'sound';
	/** In a few words, for the key's tooltip: "low, short and falling". */
	readonly reason: string;
}

/** The kind the sound itself suggests (see {@link DrumFeatures}). */
export function kindFromSound(features: DrumFeatures): { kind: DrumKind; reason: string } {
	const f = features;
	const long = f.decay;
	// a pitch sweeping far (a zap, a laser)
	if (f.sweep > 3.5 && f.pitch > 60 && f.tonal > 0.2) {
		return { kind: 'fx', reason: 'a pitch that dives' };
	}
	// low and falling, or just very low: the kick
	if (f.low > 0.35 && (f.pitch < 72 || (f.pitch < 115 && f.sweep > 1.35))) {
		return { kind: 'kick', reason: f.sweep > 1.35 ? 'low and falling' : 'very low' };
	}
	if (f.tonal >= 0.45) {
		// a drum's pitch with bright noise over it: the snare's wires
		if (f.pitch >= 100 && f.pitch < 450 && f.high > 0.08) {
			return { kind: 'snare', reason: 'a body under noise' };
		}
		if (f.pitch < 200) return { kind: 'tom', reason: 'a low drum with a pitch' };
		if (f.pitch < 450) {
			return long < 0.3
				? { kind: 'conga', reason: 'a hand drum with a pitch' }
				: { kind: 'tom', reason: 'a drum with a pitch' };
		}
		if (f.pitch < 1300) {
			return long > 0.06
				? { kind: 'cowbell', reason: 'a ringing, metallic pitch' }
				: { kind: 'rim', reason: 'a short, hard click' };
		}
		if (f.pitch < 3500) {
			if (long < 0.12) {
				return f.pitch > 2000
					? { kind: 'clave', reason: 'a short, woody pitch' }
					: { kind: 'rim', reason: 'a short, hard click' };
			}
			return { kind: 'metal', reason: 'a high, ringing pitch' };
		}
		return long > 0.3
			? { kind: 'triangle', reason: 'a very high, long ring' }
			: { kind: 'metal', reason: 'a very high, short ring' };
	}
	// noise: a drum's body under it is a snare, quick slaps a clap, scrape after scrape a guiro
	if (f.pitch >= 100 && f.pitch < 400 && f.belowKHz >= 0.03 && f.low < 0.5 && long >= 0.06) {
		return { kind: 'snare', reason: 'a body under noise' };
	}
	if (f.bursts >= 2 && f.high < 0.2 && f.pulses <= 4) {
		return { kind: 'clap', reason: 'noise in quick bursts' };
	}
	if (f.pulses >= 5 && f.centroid > 1500) return { kind: 'guiro', reason: 'scrape after scrape' };
	// bright noise: hats, cymbals, shakers
	if (f.centroid > 5000 || f.high > 0.45) {
		if (f.attack > 0.0015) {
			return long > 0.075
				? { kind: 'tambourine', reason: 'bright, swelling and ringing' }
				: { kind: 'shaker', reason: 'bright and swelling' };
		}
		if (long < 0.085) return { kind: 'closed hat', reason: 'bright, noisy and short' };
		if (long < 0.35) return { kind: 'open hat', reason: 'bright, noisy and ringing' };
		return f.tonal > 0.3
			? { kind: 'ride', reason: 'bright, long and pinging' }
			: { kind: 'crash', reason: 'bright, noisy and long' };
	}
	if (f.low > 0.5) return { kind: 'kick', reason: 'mostly low' };
	if (long < 0.05 && f.centroid > 1000) return { kind: 'rim', reason: 'a short, hard click' };
	if (f.belowKHz > 0.08) return { kind: 'snare', reason: 'noise with some body' };
	return { kind: 'perc', reason: 'some percussion' };
}

/** What a sample is: its file name's word for it, else what its sound suggests. */
export function classifyDrum(fileName: string, audio: PcmAudio): DrumGuess {
	const named = kindFromName(fileName);
	if (named) return { kind: named, from: 'name', reason: `the name says ${named}` };
	const { kind, reason } = kindFromSound(drumFeatures(audio));
	return { kind, from: 'sound', reason };
}

/** A sound to place on the kit, by its kind (and pitch, to order toms and congas). */
export interface Placeable {
	readonly kind: DrumKind;
	/** The sound's pitch in Hz, when known: lower toms and congas go on lower keys. */
	readonly pitch?: number;
}

/**
 * The keys (53–76) each sound goes on: its kind's keys in TE's layout, then its family's, then any
 * free key; null when the kit is full. `taken` keys (already holding a sound) are skipped. Toms and
 * congas are placed low to high by pitch; everything else in order.
 */
export function placeDrums(
	sounds: readonly Placeable[],
	taken: Iterable<number> = []
): (number | null)[] {
	const used = new Set<number>();
	for (const key of taken) used.add(key - DRUM_FIRST_KEY);
	const order = sounds
		.map((s, i) => ({ s, i }))
		.sort((a, b) => {
			const pitched = (k: DrumKind) => k === 'tom' || k === 'conga';
			if (a.s.kind === b.s.kind && pitched(a.s.kind)) {
				return (a.s.pitch ?? Infinity) - (b.s.pitch ?? Infinity) || a.i - b.i;
			}
			return a.i - b.i;
		});
	const keys: (number | null)[] = sounds.map(() => null);
	for (const { s, i } of order) {
		const own = TE_LAYOUT.flatMap((kind, slot) => (kind === s.kind ? [slot] : []));
		const slot =
			[...own, ...FAMILY[s.kind]].find((k) => !used.has(k)) ??
			Array.from({ length: DRUM_KEYS }, (_, k) => k).find((k) => !used.has(k));
		if (slot === undefined) continue;
		used.add(slot);
		keys[i] = DRUM_FIRST_KEY + slot;
	}
	return keys;
}
