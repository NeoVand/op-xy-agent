/**
 * Three-way merges of the simulator's state, in place: what changed from `base` to `next` lands
 * on a live state, key by key and fixed-length arrays index by index, and only what differs is
 * written (the state is reactive: untouched parts keep their identity). A lab's commits land this
 * way (`agent/lab/apply.ts`), and a demonstration is taken back this way once it has been seen.
 */
import type { SimState } from './params';

export type Json = unknown;
export type Container = Record<string | number, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep equality of plain JSON values. */
export function same(a: Json, b: Json): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
		return true;
	}
	if (Array.isArray(b)) return false;
	const x = a as Record<string, unknown>;
	const y = b as Record<string, unknown>;
	const keys = Object.keys(x);
	if (keys.length !== Object.keys(y).length) return false;
	for (const key of keys) if (!(key in y) || !same(x[key], y[key])) return false;
	return true;
}

/** How a merge treats a value the state has changed too: `next` wins, or the state's is kept. */
export type Conflicts = 'take' | 'keep';

/**
 * Merges what changed from `base` to `next` into `parent[key]`, in place. Returns whether anything
 * was written.
 */
export function mergeInto(
	parent: Container,
	key: string | number,
	base: Json,
	next: Json,
	conflicts: Conflicts
): boolean {
	if (same(base, next)) return false;
	const live = parent[key];
	if (isRecord(base) && isRecord(next) && isRecord(live)) {
		let changed = false;
		for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
			if (!(k in next)) {
				if (k in live && (conflicts === 'take' || same(live[k], base[k]))) {
					delete live[k];
					changed = true;
				}
			} else changed = mergeInto(live, k, base[k], next[k], conflicts) || changed;
		}
		return changed;
	}
	if (
		Array.isArray(base) &&
		Array.isArray(next) &&
		Array.isArray(live) &&
		base.length === next.length &&
		live.length === base.length
	) {
		let changed = false;
		for (let i = 0; i < next.length; i++) {
			changed = mergeInto(live as unknown as Container, i, base[i], next[i], conflicts) || changed;
		}
		return changed;
	}
	if (same(live, next)) return false;
	// changed here since `base`: an undo leaves it be
	if (conflicts === 'keep' && !same(live, base)) return false;
	parent[key] = next;
	return true;
}

/** What a take-back leaves as it is: the transport (playback is the player's), held keys, the clock. */
const LIVE_FIELDS: ReadonlySet<string> = new Set(['transport', 'held', 'taps', 'motion']);

/**
 * Takes back what changed from `before` to `after` (JSON of the whole state): the mode, the pages
 * and the selected track as much as the sounds, notes and mutes, but not the transport. Only where
 * `state` still reads as `after`; a value changed since stays. Returns whether anything changed.
 */
export function takeBack(state: SimState, before: string, after: string): boolean {
	const was = JSON.parse(before) as Record<string, Json>;
	const now = JSON.parse(after) as Record<string, Json>;
	const live = state as unknown as Container;
	let changed = false;
	for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
		if (LIVE_FIELDS.has(key) || !(key in was)) continue;
		changed = mergeInto(live, key, now[key], was[key], 'keep') || changed;
	}
	return changed;
}
