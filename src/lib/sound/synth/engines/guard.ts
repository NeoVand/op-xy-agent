/**
 * A soft ceiling for engines whose peaks run far above their average (a synced saw's aligned
 * harmonics under full sub and noise; two drifting carriers meeting in phase under AM). Pitched
 * for the target level, such an engine would pass ±1.2 in rare corners of its settings; the
 * ceiling leaves everything up to {@link KNEE} untouched and eases the rest towards
 * {@link CEILING}, joining without a corner so the rounding adds few harmonics.
 */
import { softClip } from '../filters';

/** Output is exactly linear up to here. */
export const KNEE = 1;
/** Output never passes this. */
export const CEILING = 1.18;

const ROOM = CEILING - KNEE;

/** `x`, with anything past ±{@link KNEE} eased towards ±{@link CEILING} (tanh-like, same slope). */
export function ceiling(x: number): number {
	if (x > KNEE) return KNEE + ROOM * softClip((x - KNEE) / ROOM);
	if (x < -KNEE) return -KNEE - ROOM * softClip((-x - KNEE) / ROOM);
	return x;
}
