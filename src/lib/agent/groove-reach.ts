/**
 * How much of a pattern a groove moves, in words, when it is little or nothing: a groove shifts
 * only some steps (shuffle the even sixteenths), so a beat whose hits sit on the eighths plays
 * straight however the groove is set. Agents swung such beats, measured no swing, and could not
 * tell whether the render had ignored the groove.
 */
import { GROOVES } from '$lib/sim/params';
import { grooveTime } from '$lib/sound/groove';
import type { VirtualOpxy, VirtualPattern } from './virtual-opxy';

/** Below this share of its notes moved, a groove is said to hardly reach a pattern. */
const FEW = 0.25;

/** Where a groove of `type` pushes notes, for the sentence. */
const where = (type: string) =>
	/shuffle/.test(type)
		? 'shuffle moves the even sixteenths (steps 2, 4, 6…)'
		: 'they sit where it does not push';

/**
 * A sentence when the groove (`type`, `amount`) moves none or few of `pattern`'s notes; null when
 * it moves enough, or there is no groove.
 */
export function grooveReach(
	pattern: Pick<VirtualPattern, 'track' | 'notes' | 'scale'>,
	type: string,
	amount: number,
	/** Say what it moves even when that is enough (a groove just set, confirmed). */
	always = false
): string | null {
	if (amount === 0 || pattern.notes.length === 0) return null;
	const g = { type: Math.max(0, GROOVES.indexOf(type as never)), amount };
	const moves = (n: { step: number }) => {
		const at = (n.step - 1) * pattern.scale;
		return Math.abs(grooveTime(at, g) - at) > 0.02;
	};
	const moved = pattern.notes.filter(moves).length;
	// which steps it moves (an agent told "10 of 16 move" could not tell whether its hats did)
	const steps = [...new Set(pattern.notes.filter(moves).map((n) => n.step))].sort((a, b) => a - b);
	const on = steps.length
		? ` (on step${steps.length === 1 ? '' : 's'} ${steps.slice(0, 16).join(', ')}${steps.length > 16 ? ', …' : ''})`
		: '';
	const label = `The groove (${type}, ${amount > 0 ? '+' : ''}${amount})`;
	// on a drum track, which sounds it moves and which it leaves (an agent said its hats swung when
	// the groove moved a few kicks and snares, the hats all on the eighths)
	const bySound = new Map<string, { all: number; moved: number }>();
	for (const n of pattern.notes) {
		if (!('sound' in n) || !n.sound) continue;
		const c = bySound.get(n.sound) ?? { all: 0, moved: 0 };
		bySound.set(n.sound, { all: c.all + 1, moved: c.moved + (moves(n) ? 1 : 0) });
	}
	const swung = [...bySound].filter(([, c]) => c.moved > 0);
	const straight = [...bySound].filter(([, c]) => c.moved === 0);
	// each sound's moved steps, all of them (an agent asked which hits a roll over moved got one
	// list of steps cut at 16, and guessed the kicks and snares past it)
	const stepsOf = (sound: string) => {
		const at = [
			...new Set(pattern.notes.filter((n) => n.sound === sound && moves(n)).map((n) => n.step))
		].sort((a, b) => a - b);
		return `step${at.length === 1 ? '' : 's'} ${at.slice(0, 24).join(' ')}${at.length > 24 ? ' …' : ''}`;
	};
	const drums = bySound.size > 1 && moved > 0;
	const sounds = drums
		? `: ${swung.map(([name, c]) => `${name} ${c.moved} of ${c.all} (${stepsOf(name)})`).join(', ')}${straight.length ? `; none of ${straight.map(([name, c]) => `${name}'s ${c.all}`).join(', ')}, which ${straight.length === 1 ? 'plays' : 'play'} straight: ${where(type)}` : ''}`
		: '';
	const across = drums ? '' : on;
	// what to do about it, before the answer (agents told the user the swing would not be heard
	// instead of making it heard)
	const fix =
		'If the swing is meant to be heard, put hits there before you answer (hats or ghost snares between the eighths, written with merge).';
	if (moved === 0) {
		return `${label} moves none of T${pattern.track}'s notes, so it plays straight: ${where(type)}. ${fix}`;
	}
	// a few swung hits a bar are a swing (ghost hats between eighth-note kicks and snares)
	if (moved < 4 && moved / pattern.notes.length < FEW) {
		return `${label} moves only ${moved} of T${pattern.track}'s ${pattern.notes.length} notes${on}, so it hardly swings: ${where(type)}. ${fix}`;
	}
	// the sound with the most notes left straight: said even when enough moves overall
	const busiest = [...bySound].sort((a, b) => b[1].all - a[1].all)[0];
	if (straight.length && sounds && busiest && busiest[1].moved === 0) {
		return `${label} moves ${moved} of T${pattern.track}'s ${pattern.notes.length} notes${across}${sounds}. Say only what swings; ${fix.charAt(0).toLowerCase()}${fix.slice(1)}`;
	}
	return always
		? `${label} moves ${moved} of T${pattern.track}'s ${pattern.notes.length} notes${across}${sounds}.`
		: null;
}

/**
 * The groove's reach on every instrument track with notes, each as its pattern sets it (its own
 * amount, the bar menu's, else the tempo page's); `always` confirms what it moves on each.
 */
export function grooveReachAll(virtual: VirtualOpxy, always = false): string[] {
	const status = virtual.status();
	const groove = status.groove;
	if (!groove) return [];
	return status.tracks.flatMap((t) => {
		if (t.track > 8 || t.notes === 0) return [];
		const p = virtual.readPattern(t.track);
		const own = p.groove ? `, pattern ${p.pattern}'s own` : '';
		const line = grooveReach(p, groove.type, p.groove || groove.amount, always);
		return line ? [line.replace(/^The groove \(([^)]*)\)/, `The groove ($1${own})`)] : [];
	});
}
