/**
 * Drum sounds made from numbers, for kits nobody recorded (M7, "generated sources"): classic drum
 * machine voices (a falling sine for the kick, tone plus noise for the snare, six square waves for
 * the hats and cymbals, as the analogue boxes build them), each shaped by a few parameters, and
 * kits of them in a few styles laid out on TE's factory key order. Everything is deterministic: the
 * same voice gives the same samples (noise comes from a seeded generator), so an agent can describe
 * a sound as typed parameters and this code renders it, never the model.
 */
import { DRUM_LAYOUT, type SampleInput } from './build';
import { PRESET_RATE } from './audio';
import type { PcmAudio } from './wav';

export const VOICE_TYPES = [
	'kick',
	'snare',
	'clap',
	'rim',
	'closed hat',
	'open hat',
	'cymbal',
	'tom',
	'conga',
	'cowbell',
	'clave',
	'shaker',
	'tambourine',
	'triangle',
	'guiro',
	'zap'
] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

/**
 * One drum sound. Every number is optional and 0–1 unless it says otherwise; each type reads the
 * ones that mean something to it.
 */
export interface Voice {
	readonly type: VoiceType;
	/** The body's pitch in Hz (kick 30–90, tom and conga 60–400, snare 120–300). */
	readonly pitch?: number;
	/** How long it rings, in seconds (to −60 dB). */
	readonly decay?: number;
	/** How far the pitch falls at the start (kick, tom, zap). */
	readonly sweep?: number;
	/** The attack's click (kick) or the snare wires' share (snare). */
	readonly snap?: number;
	/** Brighter or darker: moves the noise and metal filters. */
	readonly tone?: number;
	/** Saturation. */
	readonly drive?: number;
	/** Lo-fi: fewer bits and a lower rate. */
	readonly crush?: number;
	/** Output level, 0–1 (default 0.9 of full scale at the peak). */
	readonly level?: number;
	/** The noise's seed, for a different take of the same sound. */
	readonly seed?: number;
}

const SR = PRESET_RATE;
/** The six square oscillators of the classic analogue hat and cymbal (Hz). */
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** A seeded noise source in −1…1. */
function noise(seed: number) {
	let s = (seed * 2654435761) >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 2 ** 31 - 1;
	};
}

/** An exponential decay reaching −60 dB after `seconds`. */
const fall = (t: number, seconds: number) => Math.exp((-6.9078 * t) / Math.max(1e-3, seconds));

/** A biquad (RBJ cookbook), run over `x` in place. */
function biquad(x: Float32Array, type: 'lowpass' | 'highpass' | 'bandpass', f: number, q = 0.707) {
	const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
	const alpha = Math.sin(w) / (2 * q);
	const cos = Math.cos(w);
	let b0: number, b1: number, b2: number;
	if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
	else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
	else [b0, b1, b2] = [alpha, 0, -alpha];
	const a0 = 1 + alpha;
	const a1 = -2 * cos;
	const a2 = 1 - alpha;
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < x.length; i++) {
		const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
		x2 = x1;
		x1 = x[i];
		y2 = y1;
		y1 = y;
		x[i] = y;
	}
	return x;
}

/** The six-square metal cluster, `ratio` scaling every frequency. */
function metal(length: number, ratio: number): Float32Array {
	const out = new Float32Array(length);
	for (const f of METAL) {
		const period = SR / (f * ratio);
		for (let i = 0; i < length; i++) out[i] += (i % period) / period < 0.5 ? 1 : -1;
	}
	for (let i = 0; i < length; i++) out[i] /= METAL.length;
	return out;
}

/** A pitch in Hz, kept to 20 Hz – 2 kHz. */
const hz = (value: number | undefined, fallback: number) =>
	Math.min(2000, Math.max(20, value ?? fallback));

/** Renders one voice as mono audio at the preset rate, peaking at its level. */
export function renderVoice(voice: Voice): PcmAudio {
	const unit = (value: number | undefined, fallback: number) =>
		Math.min(1, Math.max(0, value ?? fallback));
	const v = {
		tone: unit(voice.tone, 0.5),
		drive: unit(voice.drive, 0),
		crush: unit(voice.crush, 0),
		snap: unit(voice.snap, 0.5),
		sweep: unit(voice.sweep, 0.5),
		level: unit(voice.level, 0.9),
		seed: voice.seed ?? 1
	};
	const decay = Math.min(MAX_DECAY, Math.max(0.01, voice.decay ?? DEFAULT_DECAY[voice.type]));
	const length = Math.ceil((decay + 0.01) * SR);
	const x = new Float32Array(length);
	const rand = noise(v.seed);
	const t = (i: number) => i / SR;
	switch (voice.type) {
		case 'kick': {
			const pitch = hz(voice.pitch, 50);
			let phase = 0;
			for (let i = 0; i < length; i++) {
				phase += (2 * Math.PI * pitch * (1 + 3 * v.sweep * Math.exp(-t(i) / 0.025))) / SR;
				x[i] = Math.sin(phase) * fall(t(i), decay);
			}
			// the beater: a few milliseconds of bright noise
			const click = Math.round(0.004 * SR);
			for (let i = 0; i < click; i++) x[i] += v.snap * 0.6 * rand() * (1 - i / click);
			break;
		}
		case 'snare': {
			const pitch = hz(voice.pitch, 185);
			const wires = new Float32Array(length);
			for (let i = 0; i < length; i++) wires[i] = rand() * fall(t(i), decay);
			biquad(wires, 'highpass', 1200 + 3000 * v.tone);
			for (let i = 0; i < length; i++) {
				const body =
					Math.sin(2 * Math.PI * pitch * t(i)) + 0.5 * Math.sin(2 * Math.PI * pitch * 1.62 * t(i));
				x[i] = (1 - v.snap) * body * fall(t(i), decay * 0.45) + v.snap * 1.6 * wires[i];
			}
			break;
		}
		case 'clap': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				// three quick slaps, then the room
				let envelope = 0;
				for (const at of [0, 0.011, 0.022]) if (time >= at) envelope += fall(time - at, 0.012);
				envelope += 0.5 * fall(Math.max(0, time - 0.022), decay);
				x[i] = rand() * envelope;
			}
			biquad(x, 'bandpass', 900 + 800 * v.tone, 1.4);
			break;
		}
		case 'rim': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				x[i] =
					(Math.sin(2 * Math.PI * 1700 * time) + 0.6 * Math.sin(2 * Math.PI * 480 * time)) *
					fall(time, decay);
			}
			break;
		}
		case 'closed hat':
		case 'open hat':
		case 'cymbal': {
			const cymbal = voice.type === 'cymbal';
			const m = metal(length, cymbal ? 0.9 : 1);
			for (let i = 0; i < length; i++) m[i] = (0.7 * m[i] + 0.3 * rand()) * fall(t(i), decay);
			biquad(m, 'bandpass', (cymbal ? 6000 : 9000) + 3000 * v.tone, 0.9);
			biquad(m, 'highpass', cymbal ? 3500 : 6500);
			x.set(m);
			break;
		}
		case 'tom':
		case 'conga': {
			const pitch = hz(voice.pitch, voice.type === 'tom' ? 120 : 260);
			const bend = voice.type === 'tom' ? 0.6 * v.sweep : 0.15 * v.sweep;
			let phase = 0;
			for (let i = 0; i < length; i++) {
				phase += (2 * Math.PI * pitch * (1 + bend * Math.exp(-t(i) / 0.04))) / SR;
				x[i] = Math.sin(phase) * fall(t(i), decay);
			}
			const skin = Math.round(0.003 * SR);
			for (let i = 0; i < skin; i++) x[i] += 0.3 * rand() * (1 - i / skin);
			break;
		}
		case 'cowbell': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				const square = (f: number) => (Math.sin(2 * Math.PI * f * time) >= 0 ? 1 : -1);
				// a quick drop, then a longer ring
				const envelope = 0.6 * fall(time, 0.05) + 0.4 * fall(time, decay);
				x[i] = 0.5 * (square(540) + square(800)) * envelope;
			}
			biquad(x, 'bandpass', 800 + 400 * v.tone, 2);
			break;
		}
		case 'clave': {
			for (let i = 0; i < length; i++)
				x[i] = Math.sin(2 * Math.PI * 2500 * t(i)) * fall(t(i), decay);
			break;
		}
		case 'shaker':
		case 'tambourine': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				const envelope = Math.min(1, time / 0.012) * fall(time, decay);
				x[i] = rand() * envelope;
			}
			biquad(x, 'highpass', 5000 + 3000 * v.tone);
			if (voice.type === 'tambourine') {
				const jingles = metal(length, 7);
				for (let i = 0; i < length; i++) x[i] += 0.5 * jingles[i] * fall(t(i), decay);
			}
			break;
		}
		case 'triangle': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				x[i] =
					(Math.sin(2 * Math.PI * 4200 * time) + 0.4 * Math.sin(2 * Math.PI * 8900 * time)) *
					fall(time, decay);
			}
			break;
		}
		case 'guiro': {
			for (let i = 0; i < length; i++) {
				const time = t(i);
				// scrapes at 40 per second, dying away
				const scrape = (time * 40) % 1 < 0.35 ? 1 : 0.1;
				x[i] = rand() * scrape * fall(time, decay);
			}
			biquad(x, 'bandpass', 2500 + 1500 * v.tone, 1.2);
			break;
		}
		case 'zap': {
			let phase = 0;
			for (let i = 0; i < length; i++) {
				const time = t(i);
				const f = 80 + 3000 * v.sweep * Math.exp(-time / 0.03);
				phase += (2 * Math.PI * f) / SR;
				x[i] = Math.sin(phase) * fall(time, decay);
			}
			break;
		}
	}
	shape(x, v.drive, v.crush);
	// a short fade at the end, then the level at the peak
	const tail = Math.min(length, Math.round(0.005 * SR));
	for (let i = 0; i < tail; i++) x[length - tail + i] *= 1 - (i + 1) / tail;
	const peak = x.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
	if (peak > 0) for (let i = 0; i < length; i++) x[i] *= v.level / peak;
	return { sampleRate: SR, channels: [x] };
}

/** Saturation and lo-fi: tanh drive, then fewer bits and a held, lower rate. */
function shape(x: Float32Array, drive: number, crush: number) {
	if (drive > 0) {
		const gain = 1 + 8 * drive;
		const norm = Math.tanh(gain);
		for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * gain) / norm;
	}
	if (crush > 0) {
		const steps = 2 ** Math.round(16 - 12 * crush);
		const hold = Math.max(1, Math.round(1 + 5 * crush));
		for (let i = 0; i < x.length; i++) {
			const held = x[i - (i % hold)];
			x[i] = Math.round(held * steps) / steps;
		}
	}
}

/** The longest a generated sound rings (s): drums, not pads. */
export const MAX_DECAY = 4;

/** How long each type rings by default (s). */
const DEFAULT_DECAY: Readonly<Record<VoiceType, number>> = {
	kick: 0.45,
	snare: 0.22,
	clap: 0.25,
	rim: 0.04,
	'closed hat': 0.06,
	'open hat': 0.45,
	cymbal: 1.4,
	tom: 0.35,
	conga: 0.2,
	cowbell: 0.3,
	clave: 0.06,
	shaker: 0.1,
	tambourine: 0.2,
	triangle: 1.2,
	guiro: 0.25,
	zap: 0.2
};

/** Kit styles: how each voice type is dialled in (the factory layout decides where it goes). */
export const KIT_STYLES = ['808', '909', 'lo-fi', 'tight', 'boom'] as const;
export type KitStyle = (typeof KIT_STYLES)[number];

const STYLE: Readonly<Record<KitStyle, Partial<Voice> & { kick: Partial<Voice> }>> = {
	'808': { kick: { pitch: 48, decay: 0.8, sweep: 0.35, snap: 0.2 } },
	'909': { kick: { pitch: 55, decay: 0.35, sweep: 0.6, snap: 0.7, drive: 0.3 }, tone: 0.7 },
	'lo-fi': { kick: { pitch: 50, decay: 0.5, sweep: 0.5 }, crush: 0.6, drive: 0.2, tone: 0.3 },
	tight: { kick: { pitch: 60, decay: 0.2, sweep: 0.7, snap: 0.8 }, tone: 0.6 },
	boom: { kick: { pitch: 40, decay: 1.4, sweep: 0.3, drive: 0.4 }, tone: 0.4 }
};

/** The voice type TE's layout expects on each slot (the drum-layout kinds, mapped to our voices). */
const SLOT_VOICE: Readonly<Record<string, VoiceType>> = {
	kick: 'kick',
	snare: 'snare',
	rim: 'rim',
	clap: 'clap',
	tamb: 'tambourine',
	shaker: 'shaker',
	'closed hat': 'closed hat',
	'open hat': 'open hat',
	clave: 'clave',
	'low tom': 'tom',
	ride: 'cymbal',
	'mid tom': 'tom',
	crash: 'cymbal',
	'high tom': 'tom',
	triangle: 'triangle',
	'low conga': 'conga',
	'high conga': 'conga',
	cowbell: 'cowbell',
	guiro: 'guiro',
	metal: 'cowbell',
	chi: 'zap'
};

/** The pitch or colour a slot takes where its type repeats (two kicks, three toms, two congas). */
const SLOT_TWEAK: Readonly<Record<number, Partial<Voice>>> = {
	1: { pitch: 58, decay: 0.3, snap: 0.9 },
	3: { pitch: 220, snap: 0.75, decay: 0.16 },
	9: { decay: 0.1, tone: 0.3 },
	12: { pitch: 95 },
	13: { decay: 0.9, tone: 0.8 },
	14: { pitch: 135 },
	16: { pitch: 180 },
	18: { pitch: 210 },
	19: { pitch: 310 },
	22: { tone: 0.9, decay: 0.12 }
};

/**
 * A whole kit in a style: a sound on each of the 24 keys where TE's factory kits keep that kind
 * (two kicks on 53 and 54, snares on 55 and 56 …), ready for `buildPreset({ kind: 'drum' })`.
 */
export function generateKit(style: KitStyle, seed = 1): SampleInput[] {
	const look = STYLE[style];
	return DRUM_LAYOUT.map((slot, i) => {
		const type = SLOT_VOICE[slot.kind] ?? 'zap';
		const shared: Partial<Voice> = Object.fromEntries(
			Object.entries({ tone: look.tone, drive: look.drive, crush: look.crush }).filter(
				([, value]) => value !== undefined
			)
		);
		const voice: Voice = {
			...shared,
			...(type === 'kick' ? look.kick : {}),
			...SLOT_TWEAK[i],
			type,
			seed: seed * 101 + i
		};
		return { name: `${style} ${slot.kind}`, audio: renderVoice(voice), key: 53 + i, voice };
	});
}

/** The sensible span of each voice number, for knobs, randomising and mutating. */
export const VOICE_RANGES = {
	pitch: { min: 20, max: 2000 },
	decay: { min: 0.01, max: MAX_DECAY },
	sweep: { min: 0, max: 1 },
	snap: { min: 0, max: 1 },
	tone: { min: 0, max: 1 },
	drive: { min: 0, max: 1 },
	crush: { min: 0, max: 1 },
	level: { min: 0, max: 1 }
} as const;

/** A voice number the knobs turn. */
export type VoiceParam = keyof typeof VOICE_RANGES;

/** The pitch each type sits at when a voice does not say (Hz), for knobs that start somewhere. */
export const DEFAULT_PITCH: Readonly<Partial<Record<VoiceType, number>>> = {
	kick: 50,
	snare: 185,
	tom: 120,
	conga: 260
};

/** A voice's number as it plays: its own, else the type's default. */
export function voiceValue(voice: Voice, param: VoiceParam): number {
	if (param === 'decay') return voice.decay ?? DEFAULT_DECAY[voice.type];
	if (param === 'pitch') return voice.pitch ?? DEFAULT_PITCH[voice.type] ?? 200;
	if (param === 'level') return voice.level ?? 0.9;
	const fallback = param === 'drive' || param === 'crush' ? 0 : 0.5;
	return voice[param] ?? fallback;
}

/** A seeded random source in [0, 1). */
function uniform(seed: number): () => number {
	const next = noise(seed);
	return () => (next() + 1) / 2;
}

/**
 * The voice nudged at random: every number moves by up to `amount` of its span (pitch and decay
 * by up to that share of themselves, so a kick stays a kick), and it gets a new seed.
 */
export function mutateVoice(voice: Voice, amount = 0.2, seed = 1): Voice {
	const rand = uniform(seed * 7919 + 13);
	const out: Record<string, unknown> = { ...voice };
	for (const param of Object.keys(VOICE_RANGES) as VoiceParam[]) {
		if (param === 'level') continue;
		const { min, max } = VOICE_RANGES[param];
		const value = voiceValue(voice, param);
		const step = (rand() * 2 - 1) * amount;
		const moved =
			param === 'pitch' || param === 'decay'
				? value * 2 ** (step * 1.5)
				: value + step * (max - min) * (param === 'drive' || param === 'crush' ? 0.5 : 1);
		out[param] = Math.min(max, Math.max(min, moved));
	}
	out.seed = Math.floor(rand() * 1e6) + 1;
	return out as unknown as Voice;
}

/**
 * A kit nobody has heard before: a style picked at random, every voice mutated a good deal, each
 * still on its key of TE's layout.
 */
export function randomKit(seed: number): SampleInput[] {
	const rand = uniform(seed);
	const style = KIT_STYLES[Math.floor(rand() * KIT_STYLES.length)];
	return generateKit(style, seed).map((sample, i) => {
		const voice = mutateVoice(sample.voice as Voice, 0.45, seed * 31 + i);
		return { ...sample, name: sample.name.replace(style, 'rnd'), audio: renderVoice(voice), voice };
	});
}
