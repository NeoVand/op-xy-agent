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
	const moved = pattern.notes.filter((n) => {
		const at = (n.step - 1) * pattern.scale;
		return Math.abs(grooveTime(at, g) - at) > 0.02;
	}).length;
	const label = `The groove (${type}, ${amount > 0 ? '+' : ''}${amount})`;
	// what to do about it, before the answer (agents told the user the swing would not be heard
	// instead of making it heard)
	const fix =
		'If the swing is meant to be heard, put hits there before you answer (hats or ghost snares between the eighths, written with merge).';
	if (moved === 0) {
		return `${label} moves none of T${pattern.track}'s notes, so it plays straight: ${where(type)}. ${fix}`;
	}
	if (moved / pattern.notes.length < FEW) {
		return `${label} moves only ${moved} of T${pattern.track}'s ${pattern.notes.length} notes, so it hardly swings: ${where(type)}. ${fix}`;
	}
	return always
		? `${label} moves ${moved} of T${pattern.track}'s ${pattern.notes.length} notes.`
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
