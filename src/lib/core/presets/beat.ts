/**
 * Something to play through a preset while you build it: a groove through a drum kit (kick,
 * snare or clap, hats and a percussion part found on the keys that hold them), a sliced loop put
 * back together (or shuffled), and for the melodic presets a run up the keys or an arpeggio. Plain
 * data: events in seconds from the start of a loop, which the preview player schedules.
 */
import type { DrumKind } from './classify';
import { DRUM_FIRST_KEY } from './patch';

/** One note of a pattern. */
export interface BeatEvent {
	/** Seconds from the start of the loop. */
	readonly time: number;
	/** The key (MIDI note) it plays. */
	readonly key: number;
	/** 0–1. */
	readonly velocity: number;
	/** Seconds the key is held (gate, loop and the samplers stop at its end). */
	readonly length: number;
}

/** A loop of events. */
export interface BeatPattern {
	/** Seconds until it starts over. */
	readonly length: number;
	readonly events: readonly BeatEvent[];
}

/** The grooves the kit can play. */
export const GROOVES = ['house', 'boom bap', 'break', 'electro'] as const;
export type Groove = (typeof GROOVES)[number];

/** Each groove's tempo when nobody says otherwise. */
export const GROOVE_BPM: Readonly<Record<Groove, number>> = {
	house: 122,
	'boom bap': 90,
	break: 104,
	electro: 118
};

/** The parts a groove plays, each a line of 16 steps: digits are velocities 1–9, `.` is a rest. */
type Part = 'kick' | 'snare' | 'hat' | 'open' | 'perc';
const LINES: Readonly<Record<Groove, Partial<Record<Part, string>>>> = {
	house: {
		kick: '9...9...9...9...',
		snare: '....8.......8...',
		hat: '5.3.5.3.5.3.5.3.',
		open: '..7...7...7...7.',
		perc: '...........4..3.'
	},
	'boom bap': {
		kick: '9......6..8.....',
		snare: '....9.......9..3',
		hat: '6.4.6.4.6.4.6.45',
		perc: '.......3.......4'
	},
	break: {
		kick: '9.6.......87....',
		snare: '....9..4.6..9..5',
		hat: '6.5.6.5.6.5.6.5.',
		open: '..............6.'
	},
	electro: {
		kick: '9.....8...9.....',
		snare: '....9.......9...',
		hat: '6363636363636363',
		perc: '...5.......5..4.'
	}
};

/** The kinds that can play each part, best first. */
const PART_KINDS: Readonly<Record<Part, readonly DrumKind[]>> = {
	kick: ['kick', 'tom'],
	snare: ['snare', 'clap', 'rim'],
	hat: ['closed hat', 'shaker', 'tambourine', 'open hat', 'ride'],
	open: ['open hat', 'ride', 'tambourine'],
	perc: ['rim', 'clave', 'cowbell', 'conga', 'perc', 'metal', 'tom']
};

/**
 * The key that plays each part on this kit: the first key holding a kind that fits the part,
 * `kinds[i]` being what key 53 + i holds (null when empty). With a kit that says nothing about its
 * sounds, TE's own layout is assumed (kick 53, snare 55, closed hat 61, open hat 63, rim 57).
 */
export function partKeys(kinds: readonly (DrumKind | null)[]): Partial<Record<Part, number>> {
	const out: Partial<Record<Part, number>> = {};
	const used = new Set<number>();
	for (const part of ['kick', 'snare', 'hat', 'open', 'perc'] as const) {
		for (const kind of PART_KINDS[part]) {
			const at = kinds.findIndex((k, i) => k === kind && !used.has(i));
			if (at >= 0) {
				out[part] = DRUM_FIRST_KEY + at;
				used.add(at);
				break;
			}
		}
	}
	return out;
}

/** A groove at `bpm` through the keys that play its parts: one bar of sixteenths. */
export function groovePattern(
	groove: Groove,
	keys: Partial<Record<Part, number>>,
	bpm = GROOVE_BPM[groove]
): BeatPattern {
	const step = 60 / bpm / 4;
	const events: BeatEvent[] = [];
	for (const [part, line] of Object.entries(LINES[groove]) as [Part, string][]) {
		const key = keys[part];
		if (key === undefined) continue;
		for (let i = 0; i < 16; i++) {
			const v = line[i];
			if (v === '.') continue;
			events.push({ time: i * step, key, velocity: Number(v) / 9, length: step * 0.9 });
		}
	}
	events.sort((a, b) => a.time - b.time || a.key - b.key);
	return { length: 16 * step, events };
}

/**
 * A sliced loop played back from its slices, each where it was cut (`starts` in frames at `rate`),
 * so it sounds like the loop; `shuffle` swaps slices around at random (seeded), for new ideas.
 */
export function slicePattern(
	starts: readonly number[],
	frames: number,
	rate: number,
	shuffle = 0
): BeatPattern {
	const order = starts.map((_, i) => i);
	if (shuffle > 0) {
		let s = shuffle >>> 0 || 1;
		const rand = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
	}
	const events = starts.map((start, i) => {
		const end = i + 1 < starts.length ? starts[i + 1] : frames;
		return {
			time: start / rate,
			key: DRUM_FIRST_KEY + order[i],
			velocity: 0.9,
			length: (end - start) / rate
		};
	});
	return { length: frames / rate, events };
}

/** The melodic patterns: a run up every key, or a minor-seventh arpeggio round the middle. */
export const MELODIES = ['run', 'arpeggio'] as const;
export type Melody = (typeof MELODIES)[number];

/** A melodic pattern over `keys` (ascending MIDI notes), in sixteenths at `bpm`. */
export function melodyPattern(melody: Melody, keys: readonly number[], bpm = 110): BeatPattern {
	const step = 60 / bpm / 4;
	if (keys.length === 0) return { length: 16 * step, events: [] };
	let notes: number[];
	if (melody === 'run') {
		notes = [...keys, ...[...keys].reverse().slice(1, -1)];
	} else {
		// a minor seventh, then the major seventh a third below it (Cm7, then A♭maj7)
		const root = keys[Math.floor(keys.length / 2)] - 12;
		const minor = [0, 3, 7, 10, 12, 15, 19, 15, 12, 10, 7, 3];
		const major = [-4, 0, 3, 7, 8, 12, 15, 12, 8, 7, 3, 0];
		notes = [...minor, ...major].map((n) => root + n);
	}
	const events = notes.map((key, i) => ({
		time: i * step,
		key,
		velocity: i % 4 === 0 ? 0.9 : 0.7,
		length: step * 1.6
	}));
	return { length: notes.length * step, events };
}
