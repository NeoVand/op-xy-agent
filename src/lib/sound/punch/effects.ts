/**
 * Punch-in FX (aux T2, and `shift + key` on an instrument track): which of the 24 keys does what,
 * to which tracks, and the settings each effect runs with. Worked out from the owner's unit
 * (research 60 §6): twelve effects, repeated in both octaves; the lower octave acts on the
 * percussion group, the upper on the melodic group, and each effect takes the shape of the group
 * it acts on (a stutter chops drums but restarts synths). They work at three levels, as the
 * recordings showed (drums played in from a computer took some effects and not others):
 *
 * - the sound (`audio`): mute, stutter and the melodic pan sweep, in the punch-in processor on each
 *   track's channel (`core.ts`);
 * - every note as it starts (`voice`, live keys too): short, soft and the percussion pan;
 * - the sequencer's own notes (`sequence`): the repeats, octave, follow, the fills and ramps, and
 *   random, which the scheduler applies (`scheduler.ts`), leaving live keys alone.
 *
 * TE never published the effects' names: these are ours.
 */
import type { EngineId } from '$lib/core/opxy';
import type { TrackState } from '$lib/sim/params';

/** The two groups the mixer's master page balances (manual: mix/master). */
export type PunchGroup = 'percussion' | 'melodic';

/** An effect, as one group hears it. */
export type PunchEffect =
	| 'mute'
	| 'stutter'
	| 'repeat2'
	| 'pan'
	| 'repeat3'
	| 'octave'
	| 'follow'
	| 'fill'
	| 'rise'
	| 'short'
	| 'hats'
	| 'fall'
	| 'soft'
	| 'random';

/** The twelve effects by key within an octave (F, F♯ … E), as each group hears them. */
export const PUNCH_EFFECTS: Readonly<Record<PunchGroup, readonly PunchEffect[]>> = {
	percussion: [
		'mute',
		'stutter',
		'repeat2',
		'pan',
		'repeat3',
		'octave',
		'follow',
		'fill',
		'short',
		'hats',
		'soft',
		'random'
	],
	melodic: [
		'mute',
		'stutter',
		'repeat2',
		'pan',
		'repeat3',
		'octave',
		'follow',
		'rise',
		'short',
		'fall',
		'soft',
		'random'
	]
};

/** Our names for the effects (the device shows only a picture of each). */
export const PUNCH_NAMES: Readonly<Record<PunchEffect, string>> = {
	mute: 'mute',
	stutter: 'stutter',
	repeat2: 'repeat 1/8',
	pan: 'pan',
	repeat3: 'repeat 3/16',
	octave: 'octave',
	follow: 'follow',
	fill: 'kick and snare fill',
	rise: 'ramp up',
	short: 'short',
	hats: 'hat fill',
	fall: 'ramp down',
	soft: 'soft attack',
	random: 'random'
};

/** Where an effect acts: on the sound, on every note, or on the sequencer's notes. */
export type PunchLevel = 'audio' | 'voice' | 'sequence';

/** The level of `effect` on `group` (the pan sweeps the melodic sound but places each drum hit). */
export function punchLevel(effect: PunchEffect, group: PunchGroup): PunchLevel {
	switch (effect) {
		case 'mute':
		case 'stutter':
			return 'audio';
		case 'pan':
			return group === 'melodic' ? 'audio' : 'voice';
		case 'short':
		case 'soft':
			return 'voice';
		default:
			return 'sequence';
	}
}

/** The punch-in keys: notes 53–76 (F3–E5), on the keyboard and on channel 10. */
export const PUNCH_FIRST_NOTE = 53;
export const PUNCH_KEYS = 24;

/** The group a track's engine feeds; the midi engine makes no sound here, so none. */
export function groupOf(engine: EngineId): PunchGroup | null {
	if (engine === 'midi') return null;
	return engine === 'drum' ? 'percussion' : 'melodic';
}

/** The effect key `key` (0–23) plays on a track of `group`. */
export const effectOf = (key: number, group: PunchGroup): PunchEffect =>
	PUNCH_EFFECTS[group][((key % 12) + 12) % 12];

/**
 * A punch-in key held (or played by the punch-in track's pattern): its key (0–23, F3…E5) and, for
 * the `shift + key` shortcut, the instrument track it was played from (null on the punch-in track).
 */
export interface PunchPress {
	readonly key: number;
	readonly from: number | null;
}

/**
 * The instrument tracks a press acts on (manual: auxiliary/punch-in-fx): on the punch-in track the
 * lower octave takes the percussion tracks and the upper the melodic ones; from an instrument track
 * the lower octave takes that track alone and the upper its whole group.
 */
export function punchTracks(tracks: readonly Pick<TrackState, 'engine'>[], press: PunchPress) {
	const lower = press.key < 12;
	if (press.from !== null) {
		const own = tracks[press.from];
		const group = own ? groupOf(own.engine) : null;
		if (!group) return [];
		if (lower) return [press.from];
		return tracks.flatMap((t, k) => (groupOf(t.engine) === group ? [k] : []));
	}
	const group: PunchGroup = lower ? 'percussion' : 'melodic';
	return tracks.flatMap((t, k) => (groupOf(t.engine) === group ? [k] : []));
}

// ─────────────────────────────────────────────────────────────── what each effect does (research 60 §6)

/**
 * Stutter on the melodic group: each sixteenth's sound starts over at these shares of the step
 * (the recording's clicks sit at 0, 1/12, 1/6, 1/3 and 1/2 of every step) and falls silent from
 * {@link STUTTER_GATE} to the next step (about 20 dB down there on the device).
 */
export const STUTTER_RESTARTS: readonly number[] = [1 / 12, 2 / 12, 4 / 12, 6 / 12];
export const STUTTER_GATE = 7 / 12;

/**
 * Stutter on the percussion group: the drums come through for this long from each sixteenth, in
 * mono (the kick keeps its click and loses its body; hats shorten and narrow).
 */
export const CHOP_SECONDS = 0.03;

/** Short: every note lets go this long after it starts (drum hits and synth notes alike). */
export const SHORT_SECONDS = 0.025;

/**
 * Soft: the attack every synth note gets at least (the recording's notes took about 50 ms to come
 * within 3 dB of their peak), and the linear fade-in of every drum hit (a fade this long takes the
 * 7.5 dB off the recorded hats' peaks that the device did).
 */
export const SOFT_SECONDS = 0.06;
export const SOFT_DRUM_SECONDS = 0.035;

/** Repeat: how many steps loop, from the step the key went down in. */
export const REPEAT_STEPS: Readonly<Partial<Record<PunchEffect, number>>> = {
	repeat2: 2,
	repeat3: 3
};

/** Octave: semitones the sequencer's notes move (drums play their samples an octave up). */
export const OCTAVE_SEMITONES: Readonly<Record<PunchGroup, number>> = {
	percussion: 12,
	melodic: -12
};

/**
 * Pan on the percussion group: where the hits of each sixteenth of a bar sit, −1 left … 1 right.
 * The recording placed them about 10 dB to one side (0.6) by step; steps it did not hear (1, 7, 9,
 * 13, 15) alternate (ours).
 */
export const DRUM_PANS: readonly number[] = [
	-0.6, 0.6, 0.6, -0.6, 0.6, 0.6, 0.6, -0.6, 0.6, -0.6, 0.6, 0.6, -0.6, 0.6, 0.6, -0.6
];

/**
 * Pan on the melodic group: a sweep across the stereo field. The device steers it with the unit's
 * tilt (the accelerometer); a browser has none, so it moves by itself, as if the unit were rocked
 * slowly: starting leftwards (the recording went left first), `depth` wide, a cycle every `beats`.
 */
export const PAN_SWEEP = { depth: 0.8, beats: 8 } as const;

/** A note the fills add: its sixteenth and the drum key (0–23) it plays, at a velocity. */
export interface FillHit {
	readonly key: number;
	readonly velocity: number;
}

/** The kit's keys the fills play: F (kick), G (snare), C♯ (closed hat), D♯ (open hat). */
const KICK = 0;
const SNARE = 2;
const CLOSED_HAT = 8;
const OPEN_HAT = 10;

/**
 * Kick and snare fill: snares on sixteenths 1, 3, 6, 9, 11 and 14 of every bar and kicks that change
 * from bar to bar (3, 5, 15 then 2, 7, 10), as the recording added them.
 */
function fillHits(sixteenth: number): FillHit[] {
	const step = ((sixteenth % 32) + 32) % 32;
	const inBar = step % 16;
	const hits: FillHit[] = [];
	if ([1, 3, 6, 9, 11, 14].includes(inBar)) hits.push({ key: SNARE, velocity: 100 });
	if ((step < 16 ? [3, 5, 15] : [2, 7, 10]).includes(inBar))
		hits.push({ key: KICK, velocity: 110 });
	return hits;
}

/** Hat fill: a closed hat on every sixteenth, the open hat on the off-beat eighths (2, 6, 10, 14). */
function hatHits(sixteenth: number): FillHit[] {
	const inBar = ((sixteenth % 16) + 16) % 16;
	return inBar % 4 === 2 ? [{ key: OPEN_HAT, velocity: 100 }] : [{ key: CLOSED_HAT, velocity: 90 }];
}

/** What a drum fill adds on transport sixteenth `sixteenth` (none for other effects). */
export function fillAt(effect: PunchEffect, sixteenth: number): FillHit[] {
	if (effect === 'fill') return fillHits(sixteenth);
	if (effect === 'hats') return hatHits(sixteenth);
	return [];
}

/**
 * Ramps on the melodic group: the semitones added to each successive step's notes, climbing (or
 * falling) an octave and starting over. The recording's notes stepped up a third, then a fifth,
 * gliding between; the ladders are ours.
 */
export const RAMPS: Readonly<Partial<Record<PunchEffect, readonly number[]>>> = {
	rise: [0, 2, 4, 5, 7, 9, 11, 12],
	fall: [0, -1, -3, -5, -7, -8, -10, -12]
};

/** Random on the melodic group: the intervals a note may move by (ours: octaves, fourths, fifths). */
export const RANDOM_INTERVALS: readonly number[] = [-12, -7, -5, 0, 5, 7, 12];

/** Ramped and random notes glide in over this share of a step, as the recording's did. */
export const PUNCH_GLIDE = 0.3;
