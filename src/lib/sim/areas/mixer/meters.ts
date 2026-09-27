/**
 * Output meters of the mixer pages: the thickness of mix M1's level bars (guide art mix-003 shows
 * them thick while tracks play) and of the group and master bars on mix M4. The device's meter
 * ballistics are unknown, so these are ours: a track's meter jumps when one of its steps with notes
 * starts (scaled by the loudest velocity and the track's level) and falls away over the following
 * steps. It reads 0 while the transport is stopped, on a muted track (mutes stop notes) and on a
 * track that a solo leaves out (manual: mix/mute-solo).
 */
import type { SimState } from '../../params';
import { currentPattern, hasNotes, type Sequence } from '../../sequencer';

/** Steps a hit takes to fall to about a third (1/e). */
const DECAY_STEPS = 1.5;

/** A track as the meters see it (instrument and auxiliary tracks alike). */
export interface MeteredTrack {
	readonly mix: { readonly level: number; readonly muted: boolean };
	readonly sequence: Sequence;
}

/**
 * The latest step with notes at or before `position` (sixteenths since play): how many of the
 * track's steps ago it started and its loudest velocity (0–1). Looks back one pattern length, never
 * before the start of playback; null when nothing has played yet.
 */
export function lastHit(
	sequence: Sequence,
	position: number
): { elapsed: number; velocity: number } | null {
	const pattern = currentPattern(sequence);
	const at = Math.max(0, position) / pattern.scale;
	const now = Math.floor(at);
	for (let back = 0; back < pattern.length && now - back >= 0; back++) {
		const step = pattern.steps[(now - back) % pattern.length];
		if (!hasNotes(step)) continue;
		const velocity = Math.max(...step.notes.map((n) => n.velocity)) / 127;
		return { elapsed: at - (now - back), velocity };
	}
	return null;
}

/**
 * Tracks soloed by holding their keys in mix mode (manual: mix/mute-solo), as indices 0–7 of the
 * set the mixer shows. Keys held with shift, instrument or auxiliary are mutes, not solos.
 */
export function soloed(s: SimState): number[] {
	if (s.mode !== 'mix' || s.shift) return [];
	if (s.held.includes('key.instrument') || s.held.includes('key.auxiliary')) return [];
	return s.held.flatMap((id) => {
		const m = /^track\.([1-8])$/.exec(id);
		return m ? [Number(m[1]) - 1] : [];
	});
}

/** A track's meter, 0–1 (`index` in its set, `solo` from {@link soloed}). */
export function trackMeter(
	s: SimState,
	track: MeteredTrack,
	index: number,
	solo: readonly number[]
): number {
	if (!s.transport.playing || track.mix.muted) return 0;
	if (solo.length > 0 && !solo.includes(index)) return 0;
	const hit = lastHit(track.sequence, s.transport.position);
	if (!hit) return 0;
	const level = Math.max(0, Math.min(1, track.mix.level / 99));
	return level * hit.velocity * Math.exp(-hit.elapsed / DECAY_STEPS);
}
