/**
 * The OP-XY's `patch.json` for sample presets (docs/research/30-presets-samples.md §2): drum kits,
 * the synth sampler and the multisampler. Every preset has the same top level (engine, envelope,
 * fx — the M3 filter —, lfo, octave, platform, regions, type, version 4); the device writes it on
 * one line with keys sorted alphabetically, and so does {@link serializePatch}. The defaults below
 * follow the factory content and device-saved presets: a neutral engine block, the filter and LFO
 * off, a gate-like envelope for drums and a moderate release for instruments.
 */

/** A value on the device's q15 scale (0–32767). */
type Q15 = number;

export type PresetKind = 'drum' | 'sampler' | 'multisampler';

/** How a drum key plays: `gate` while held (the device's "key"), one-shot, in its mute group, or looped. */
export type DrumPlayMode = 'gate' | 'oneshot' | 'group' | 'loop';

/** How a sampler region loops: forever (∞, the device's default after sampling), until release, off. */
export type LoopMode = 'forever' | 'release' | 'off';

export interface DrumRegion {
	'fade.in': number;
	'fade.out': number;
	framecount: number;
	gain: number;
	hikey: number;
	lokey: number;
	pan: number;
	'pitch.keycenter': number;
	playmode: DrumPlayMode;
	reverse: boolean;
	sample: string;
	'sample.end': number;
	transpose: number;
	tune: number;
}

export interface SamplerRegion {
	framecount: number;
	gain?: number;
	hikey: number;
	lokey?: number;
	'loop.crossfade': number;
	'loop.enabled'?: boolean;
	'loop.end': number;
	'loop.onrelease'?: boolean;
	'loop.start': number;
	'pitch.keycenter': number;
	reverse: boolean;
	sample: string;
	'sample.end': number;
	tune: number;
}

export interface Patch {
	engine: Record<string, unknown>;
	envelope: {
		amp: { attack: Q15; decay: Q15; release: Q15; sustain: Q15 };
		filter: { attack: Q15; decay: Q15; release: Q15; sustain: Q15 };
	};
	fx: { active: boolean; params: Q15[]; type: 'ladder' | 'svf' | 'z lowpass' | 'z hipass' };
	lfo: { active: boolean; params: Q15[]; type: 'tremolo' | 'value' | 'random' | 'element' };
	octave: number;
	platform: 'OP-XY';
	regions: (DrumRegion | SamplerRegion)[];
	type: PresetKind;
	version: 4;
}

/** The first of the drum sampler's 24 keys (F3 … E5 on the two-octave keyboard). */
export const DRUM_FIRST_KEY = 53;
export const DRUM_KEYS = 24;
export const MAX_ZONES = 24;

const neutralModulation = { amount: 16383, target: 0 };

/** The engine block of a sample preset: all eight params at 16384 (the samplers ignore them). */
function engine(playmode: 'poly' | 'mono'): Record<string, unknown> {
	return {
		bendrange: 8191,
		highpass: 0,
		modulation: {
			aftertouch: { ...neutralModulation },
			modwheel: { ...neutralModulation },
			pitchbend: { ...neutralModulation },
			velocity: { ...neutralModulation }
		},
		params: Array(8).fill(16384),
		playmode,
		'portamento.amount': 0,
		'portamento.type': 32767,
		transpose: 0,
		'tuning.root': 0,
		'tuning.scale': 0,
		'velocity.sensitivity': 19660,
		volume: 24900,
		width: 0
	};
}

/** A preset's shell around its regions. */
export function patch(kind: PresetKind, regions: Patch['regions']): Patch {
	const drum = kind === 'drum';
	return {
		engine: engine('poly'),
		envelope: drum
			? {
					amp: { attack: 0, decay: 0, release: 0, sustain: 32767 },
					filter: { attack: 0, decay: 0, release: 0, sustain: 0 }
				}
			: {
					// release is the handle's position (higher is shorter): half way halves in ~0.3 s
					amp: { attack: 0, decay: 0, release: 16384, sustain: 32767 },
					filter: { attack: 0, decay: 0, release: 0, sustain: 32767 }
				},
		fx: { active: false, params: [32767, 0, 0, 0, 0, 32767, 0, 0], type: 'svf' },
		lfo: { active: false, params: [16384, 16384, 0, 0, 0, 0, 0, 0], type: 'tremolo' },
		octave: 0,
		platform: 'OP-XY',
		regions,
		type: kind,
		version: 4
	};
}

/** A drum key's region: the sample on one key, played one-shot, at its own pitch. */
export function drumRegion(key: number, sample: string, frames: number): DrumRegion {
	return {
		'fade.in': 0,
		'fade.out': 0,
		framecount: frames,
		gain: 0,
		hikey: key,
		lokey: key,
		pan: 0,
		'pitch.keycenter': 60,
		playmode: 'oneshot',
		reverse: false,
		sample,
		'sample.end': frames,
		transpose: 0,
		tune: 0
	};
}

/** A sampler or multisampler region; `hikey` is the top of its zone (zones fill down). */
export function samplerRegion(
	sample: string,
	frames: number,
	root: number,
	hikey: number,
	loop: LoopMode,
	points: { start: number; end: number; crossfade: number } | null
): SamplerRegion {
	const start = points?.start ?? Math.floor(0.2 * frames);
	const end = points?.end ?? Math.floor(0.8 * frames);
	const region: SamplerRegion = {
		framecount: frames,
		hikey,
		'loop.crossfade': points?.crossfade ?? 0,
		'loop.end': end,
		'loop.start': start,
		'pitch.keycenter': root,
		reverse: false,
		sample,
		'sample.end': frames,
		tune: 0
	};
	// forever: onrelease true; off: enabled false; until release: neither (research 30 §2.6)
	if (loop === 'forever') region['loop.onrelease'] = true;
	if (loop === 'off') region['loop.enabled'] = false;
	return region;
}

/** Sorts an object's keys alphabetically, all the way down, as the device writes them. */
function sorted(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sorted);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((k) => [k, sorted((value as Record<string, unknown>)[k])])
		);
	}
	return value;
}

/** `patch.json` as the device writes it: one line, keys sorted. */
export const serializePatch = (p: Patch): string => JSON.stringify(sorted(p));
