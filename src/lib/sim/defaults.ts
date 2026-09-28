/**
 * A new project's sounds as the OP-XY makes them: the presets stored in
 * `knowledge/presets/new-project.json` (read from a blank project on the owner's OS 1.1.33 unit),
 * turned from the device's q15 lanes into the simulator's model. Unsigned lanes keep their exact
 * value on the 0–99 scale, unrounded, so the engines get what the device plays and the screen shows
 * what the device shows (it floors); signed lanes centre on 16384; choices split the range into
 * equal steps. `params.ts` builds the new project from these.
 */
import { newProjectFile, type EngineId, type NewProjectTrack } from '$lib/core/opxy';
import type { PresetSettings } from './areas/system/state';
import type { Lfo, TrackState } from './params';

const MAX = 32767;

/**
 * A sound as the device stores it, in q15 lanes: a new project's (`new-project.json`) or any
 * pattern's in a project file (`$lib/sim/xy`).
 */
export type StoredSound = Pick<
	NewProjectTrack,
	| 'engine'
	| 'params'
	| 'amp'
	| 'filterEnv'
	| 'playMode'
	| 'portamento'
	| 'bend'
	| 'volume'
	| 'filter'
	| 'sends'
	| 'lfo'
	| 'velocity'
	| 'width'
	| 'highpass'
	| 'tuning'
	| 'modulation'
	| 'mix'
>;

/** An unsigned lane (0–32767) on our 0–99 scale, unrounded. */
export const fromQ15 = (raw: number): number => (raw / MAX) * 99;

/** A signed lane (16384 = 0) on −99…99. */
export const fromSignedQ15 = (raw: number): number => ((raw - 16384) / 16383) * 99;

/** A lane read as one of `count` equal steps. */
export const stepOf = (raw: number, count: number): number =>
	Math.min(count - 1, Math.floor((raw / 32768) * count));

/**
 * LFO speed: our dial runs `synced` tempo steps, then the free range 0–99. The lane is taken as
 * linear over those positions, one detent a step (an assumption: the stored defaults then land at
 * 0.5–5 Hz, where vibrato and tremolo live).
 */
export const lfoSpeedOf = (raw: number, synced: number): number => (raw / MAX) * (synced + 99);

const PLAY_MODE_INDEX = { poly: 0, mono: 1, legato: 2 } as const;

/**
 * The bend ranges the device steps through, in semitones: off, 1–7, an octave (midi.guide's list
 * for CC 30). The stored lane is read as nine equal steps, which puts TE's usual 8191 on 2 (the
 * thresholds are not measured).
 */
export const BEND_RANGES = [0, 1, 2, 3, 4, 5, 6, 7, 12] as const;

/** The bend range `delta` detents from `semitones` (a value off the list starts from its nearest). */
export function nextBendRange(semitones: number, delta: number): number {
	let at = 0;
	BEND_RANGES.forEach((v, i) => {
		if (Math.abs(v - semitones) < Math.abs(BEND_RANGES[at] - semitones)) at = i;
	});
	return BEND_RANGES[Math.max(0, Math.min(BEND_RANGES.length - 1, at + Math.trunc(delta)))];
}

/** A bend range as the play mode page names it. */
export const bendLabel = (semitones: number): string =>
	semitones === 0
		? 'off'
		: semitones === 12
			? 'octave'
			: `${semitones} semitone${semitones === 1 ? '' : 's'}`;

/** An envelope's four lanes. */
function envelopeOf([attack, decay, sustain, release]: readonly number[]) {
	return {
		attack: fromQ15(attack),
		decay: fromQ15(decay),
		sustain: fromQ15(sustain),
		release: fromQ15(release)
	};
}

/** The LFO a stored sound carries, over `base` for the fields its type does not store. */
function lfoOf(stored: StoredSound['lfo'], base: Lfo, synced: number): Lfo {
	const [p0, p1, p2, p3, , , , p7] = stored.params;
	const lfo: Lfo = { ...base, type: stored.type, on: stored.on };
	switch (stored.type) {
		case 'tremolo':
			return {
				...lfo,
				speed: lfoSpeedOf(p0, synced),
				amount: fromSignedQ15(p1),
				volume: fromSignedQ15(p2),
				envelope: fromSignedQ15(p3),
				shape: fromQ15(p7)
			};
		case 'element':
			// sources, destinations and parameters: gyroscope / microphone / amp envelope / sum,
			// syn / env / filter / amp (the device's list, research 59 §2.4), E1–E4
			return {
				...lfo,
				sensor: stepOf(p0, 4),
				amount: fromSignedQ15(p1),
				destination: stepOf(p2, 4),
				parameter: stepOf(p3, 4)
			};
		case 'value':
		case 'random':
			// syn, env and filter, each twice (normal, free): the device's six (research 59 §2.4)
			return {
				...lfo,
				speed: lfoSpeedOf(p0, synced),
				amount: fromSignedQ15(p1),
				destination: stepOf(p2, 6),
				parameter: stepOf(p3, 4),
				envelope: stored.type === 'random' ? fromSignedQ15(p7) : base.envelope
			};
		default:
			return lfo;
	}
}

/**
 * A stored sound laid over `base` (a fresh track of the same engine): everything the device stores
 * for the preset, the rest of `base` left alone. `synced` is the LFO dial's count of tempo steps.
 */
export function soundOf(stored: StoredSound, base: TrackState, synced: number): TrackState {
	const [cutoff, resonance, envAmount, keyTracking] = stored.filter.params;
	const [aux, tape, fx1, fx2] = stored.sends;
	return {
		...base,
		engine: stored.engine,
		m1: stored.params.map(fromQ15) as TrackState['m1'],
		amp: envelopeOf(stored.amp),
		filterEnv: envelopeOf(stored.filterEnv),
		playMode: {
			mode: PLAY_MODE_INDEX[stored.playMode],
			portamento: fromQ15(stored.portamento.amount),
			bend: BEND_RANGES[stepOf(stored.bend, BEND_RANGES.length)],
			volume: fromQ15(stored.volume)
		},
		filter: {
			type: stored.filter.type,
			on: stored.filter.on,
			cutoff: fromQ15(cutoff),
			resonance: fromQ15(resonance),
			envAmount: fromQ15(envAmount),
			keyTracking: fromQ15(keyTracking)
		},
		sends: [fromQ15(aux), fromQ15(tape), fromQ15(fx1), fromQ15(fx2)],
		lfo: lfoOf(stored.lfo, base.lfo, synced),
		mix: {
			...base.mix,
			level: fromQ15(stored.mix.level),
			pan: ((stored.mix.pan - 16384) / 16383) * 100
		}
	};
}

/** A stored sound's preset settings, over `base` for what we do not decode (tunings, mod targets). */
export function presetSettingsOf(stored: StoredSound, base: PresetSettings): PresetSettings {
	return {
		...base,
		highPass: fromQ15(stored.highpass),
		velocity: fromQ15(stored.velocity.sensitivity),
		// the curve: 0 linear, full exponential
		portamento: stored.portamento.type >= 16384 ? 1 : 0,
		width: fromQ15(stored.width)
	};
}

/** The eight stored sounds of a new project, track 1 first. */
export const NEW_PROJECT_TRACKS: readonly NewProjectTrack[] = newProjectFile.tracks;

/** The preset each track of a new project starts with (`folder/name`, as the screen shows it). */
export const NEW_PROJECT_PRESETS: readonly string[] = NEW_PROJECT_TRACKS.map((t) => t.preset);

/** A new project's keyboard octave per instrument track (0–7), where it is not 0. */
export const NEW_PROJECT_OCTAVES: Readonly<Record<number, number>> = Object.fromEntries(
	NEW_PROJECT_TRACKS.flatMap((t, i) => (t.octave === 0 ? [] : [[i, t.octave]]))
);

/**
 * An engine's M1 when picked with no preset (OS 1.1.4 captures), on our 0–99 scale; null for an
 * engine the captures do not cover.
 */
export function engineInitM1(engine: EngineId): TrackState['m1'] | null {
	const raw = newProjectFile.engineInit.params[engine];
	return raw ? (raw.map(fromQ15) as TrackState['m1']) : null;
}
