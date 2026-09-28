/**
 * Grooves (manual: tempo/grooves): how the tempo page's groove type and amount move sequenced notes
 * in time and change their velocity. Right of centre (swing) pushes the off-beats late, left of
 * centre (shuffle) pulls them early. Each type is a time warp over a repeating stretch of the
 * sixteenth grid — piecewise linear, so notes between grid points and note ends move smoothly and
 * never swap order — plus accents and, as the manual says every groove does, a little seeded
 * randomness so the feel is not mechanical. The shapes are ours; TE describes the types only loosely.
 */
import { GROOVES } from '$lib/sim/params';
import { random } from './random';

/** The tempo page's groove: type (index into GROOVES) and amount (−99 shuffle … 99 swing). */
export interface Groove {
	readonly type: number;
	readonly amount: number;
}

type GrooveName = (typeof GROOVES)[number];

/** A warp: the cycle length in sixteenths and where grid points inside it move, as `d` (−1…1) scales. */
interface Warp {
	readonly cycle: number;
	/** [grid position, shift per unit of d] */
	readonly points: readonly (readonly [number, number])[];
}

/**
 * Per type: the warp, the random timing spread (sixteenths at full amount) and the accents. Shuffle
 * delays every second sixteenth by up to half a sixteenth (a 3:1 feel at 99); half shuffle half as
 * far; danish lays every off-beat back a little, loosely; bombora drags beats 2 and 4; wobbly swings
 * a little and wanders a lot; gaussian only jitters; accents leans on the beats; island nod lays
 * back the off-beat of each beat; disfunk swings the sixteenths either side of each eighth (its
 * disco-to-funk turn is the amount's two directions); roll over drags a lazy hip-hop beat; prophetic
 * is an odd two-beat lilt of our own.
 */
const TYPES: Readonly<Record<GrooveName, { warp: Warp; spread: number; gaussian?: true }>> = {
	shuffle: { warp: { cycle: 2, points: [[1, 0.5]] }, spread: 0.02 },
	'half shuffle': { warp: { cycle: 2, points: [[1, 0.25]] }, spread: 0.02 },
	bombora: { warp: { cycle: 8, points: [[4, 0.75]] }, spread: 0.03 },
	wobbly: { warp: { cycle: 2, points: [[1, 0.3]] }, spread: 0.18 },
	gaussian: { warp: { cycle: 1, points: [] }, spread: 0.1, gaussian: true },
	danish: { warp: { cycle: 2, points: [[1, 0.35]] }, spread: 0.05 },
	accents: { warp: { cycle: 2, points: [[1, 0.15]] }, spread: 0.02 },
	'island nod': {
		warp: {
			cycle: 4,
			points: [
				[2, 0.6],
				[3, 0.3]
			]
		},
		spread: 0.03
	},
	disfunk: {
		warp: {
			cycle: 4,
			points: [
				[1, 0.45],
				[2, 0.1],
				[3, 0.45]
			]
		},
		spread: 0.03
	},
	'roll over': {
		warp: {
			cycle: 4,
			points: [
				[1, 0.6],
				[2, 0.25],
				[3, 0.8]
			]
		},
		spread: 0.05
	},
	prophetic: {
		warp: {
			cycle: 8,
			points: [
				[2, 0.3],
				[3, 0.6],
				[5, -0.2],
				[6, 0.4]
			]
		},
		spread: 0.04
	}
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function typeOf(groove: Groove) {
	const name = GROOVES[clamp(Math.round(groove.type), 0, GROOVES.length - 1)];
	return TYPES[name];
}

/** The amount as −1…1. */
const amountOf = (groove: Groove) => clamp(groove.amount, -99, 99) / 99;

/**
 * Where a position on the sixteenth grid (counted from the start of play) lands under the groove,
 * in sixteenths. At amount 0 every position stays put.
 */
export function grooveTime(position: number, groove: Groove): number {
	const d = amountOf(groove);
	const { warp } = typeOf(groove);
	if (d === 0 || warp.points.length === 0) return position;
	const base = Math.floor(position / warp.cycle) * warp.cycle;
	const u = position - base;
	let fromX = 0;
	let fromY = 0;
	for (const [x, shift] of [...warp.points, [warp.cycle, 0] as const]) {
		const y = x + shift * d;
		if (u <= x) return base + fromY + ((u - fromX) * (y - fromY)) / (x - fromX);
		fromX = x;
		fromY = y;
	}
	return position;
}

/**
 * Velocity factor at a grid position: accents leans on the beats and softens the off-beats (the
 * other way round when shuffled), bombora and island nod lift the notes they move; others stay 1.
 */
export function grooveVelocity(position: number, groove: Groove): number {
	const d = amountOf(groove);
	if (d === 0) return 1;
	const a = Math.abs(d);
	const name = GROOVES[clamp(Math.round(groove.type), 0, GROOVES.length - 1)];
	const inBeat = ((Math.round(position) % 4) + 4) % 4;
	switch (name) {
		case 'accents': {
			const strong = d > 0 ? inBeat === 0 : inBeat === 2;
			if (strong) return 1 + 0.2 * a;
			return inBeat % 2 === 1 ? 1 - 0.3 * a : 1;
		}
		case 'island nod':
			return inBeat === 2 ? 1 + 0.15 * a : 1;
		case 'danish':
			return inBeat % 2 === 1 ? 1 - 0.1 * a : 1;
		case 'disfunk':
			return inBeat === 2 ? 1 + 0.2 * a : 1;
		case 'bombora':
			return ((Math.round(position) % 8) + 8) % 8 === 4 ? 1 + 0.15 * a : 1;
		default:
			return 1;
	}
}

/**
 * The seeded randomness every groove adds: a timing nudge (sixteenths) and a velocity factor for one
 * note. `seed` should differ per track, step and pass, so a wobbly groove changes on every pass and
 * the same pass always sounds the same.
 */
export function grooveJitter(seed: number, groove: Groove): { shift: number; velocity: number } {
	const a = Math.abs(amountOf(groove));
	if (a === 0) return { shift: 0, velocity: 1 };
	const type = typeOf(groove);
	const next = random(seed);
	let shift: number;
	if (type.gaussian) {
		// Box–Muller, clamped to three deviations
		const g = Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
		shift = clamp(g, -3, 3) * type.spread * a;
	} else {
		shift = (next() * 2 - 1) * type.spread * a;
	}
	return { shift, velocity: 1 + (next() * 2 - 1) * 0.05 * a };
}

/**
 * The furthest a note can move early under the groove, in sixteenths: how much sooner than its grid
 * position the scheduler must look at a step.
 */
export function maxEarlyShift(groove: Groove): number {
	const d = amountOf(groove);
	if (d === 0) return 0;
	const type = typeOf(groove);
	const warped = Math.max(0, ...type.warp.points.map(([, shift]) => -shift * d));
	return warped + type.spread * Math.abs(d) * (type.gaussian ? 3 : 1);
}
