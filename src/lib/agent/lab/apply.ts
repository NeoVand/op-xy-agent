/**
 * A lab's commits onto a state: a three-way merge of project content. What the committed fork
 * changed from the project it started from lands; what it left alone stays as the target has it,
 * so the replica keeps playing and anything the user did meanwhile stays. The merge walks objects
 * key by key and fixed-length arrays (a pattern's 64 steps, the 99 scenes) index by index, takes the
 * fork's value where it changed a leaf or an array's length, and writes only what differs, in place
 * (the replica's state is reactive: untouched parts keep their identity). Session fields (gestures,
 * clipboards, a playing song's position; `sim/session.ts`) never travel.
 *
 * Undo points keep a commit's project before and after, so it can be undone the same way: merging
 * from after back to before touches only what the commit changed.
 */
import type { ProjectContent } from '$lib/sim/areas/system/projects';
import { snapshot } from '$lib/sim/areas/system/projects';
import type { SimState } from '$lib/sim/params';
import { SESSION_FIELDS } from '$lib/sim/session';

type Json = unknown;
type Container = Record<string | number, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep equality of plain JSON values. */
function same(a: Json, b: Json): boolean {
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

/**
 * Merges what changed from `base` to `next` into `parent[key]`, in place. Returns whether anything
 * was written.
 */
function mergeInto(parent: Container, key: string | number, base: Json, next: Json): boolean {
	if (same(base, next)) return false;
	const live = parent[key];
	if (isRecord(base) && isRecord(next) && isRecord(live)) {
		let changed = false;
		for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
			if (!(k in next)) {
				if (k in live) {
					delete live[k];
					changed = true;
				}
			} else changed = mergeInto(live, k, base[k], next[k]) || changed;
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
			changed = mergeInto(live as unknown as Container, i, base[i], next[i]) || changed;
		}
		return changed;
	}
	if (same(live, next)) return false;
	parent[key] = next;
	return true;
}

/**
 * Merges the project change `base` → `next` (both `snapshot` JSON) into `state`: what changed in
 * between lands; everything else, and every session field, stays. Returns whether `state` changed.
 */
export function applyProject(state: SimState, base: string, next: string): boolean {
	const b = JSON.parse(base) as ProjectContent;
	const n = JSON.parse(next) as ProjectContent;
	const s = state as unknown as Container;
	let changed = false;
	for (const key of ['tracks', 'aux', 'tempo'] as const) {
		changed = mergeInto(s, key, b[key], n[key]) || changed;
	}
	const areas = state.areas as unknown as Record<string, Container>;
	const baseAreas = b.areas as unknown as Record<string, Container | undefined>;
	const nextAreas = n.areas as unknown as Record<string, Container | undefined>;
	for (const area of Object.keys(nextAreas)) {
		const skip = SESSION_FIELDS[area as keyof typeof SESSION_FIELDS];
		if (skip === 'all' || area === 'system' || !areas[area]) continue;
		const from = baseAreas[area] ?? {};
		const to = nextAreas[area] ?? {};
		for (const field of new Set([...Object.keys(from), ...Object.keys(to)])) {
			if ((skip as readonly string[] | undefined)?.includes(field) || !(field in to)) continue;
			changed = mergeInto(areas[area], field, from[field], to[field]) || changed;
		}
	}
	const system = state.areas.system as unknown as Container;
	changed = mergeInto(system, 'projectSettings', b.settings, n.settings) || changed;
	changed = mergeInto(system, 'trackPresets', b.trackPresets, n.trackPresets) || changed;
	changed = mergeInto(system, 'presetSettings', b.presetSettings, n.presetSettings) || changed;
	return changed;
}

/** A commit's project before and after it landed. */
interface UndoPoint {
	readonly before: string;
	readonly after: string;
}

/** What landing a project (or undoing one) did. */
export interface Landed {
	/** The undo point that takes it back. */
	readonly point: string;
}

/**
 * Commits landed on one state, each kept as an undo point. Points live in memory (undo is offered
 * only in the page session that made the change), the newest `limit` of them.
 */
export class UndoPoints {
	readonly #points = new Map<string, UndoPoint>();
	readonly #limit: number;
	readonly #prefix: string;
	#count = 0;

	constructor(options: { readonly limit?: number; readonly prefix?: string } = {}) {
		this.#limit = options.limit ?? 24;
		this.#prefix = options.prefix ?? 'lab';
	}

	/**
	 * Lands the project change `base` → `next` on `state`; returns the undo point, or null when
	 * nothing changed.
	 */
	land(state: SimState, base: string, next: string): Landed | null {
		const before = snapshot(state);
		if (!applyProject(state, base, next)) return null;
		return { point: this.#keep({ before, after: snapshot(state) }) };
	}

	/**
	 * Takes an undo point's change back (only what it changed; later changes elsewhere stay), and
	 * keeps a point for the way forward again. Null when the point is unknown or too old.
	 */
	revert(state: SimState, point: string): Landed | null {
		const kept = this.#points.get(point);
		if (!kept) return null;
		const before = snapshot(state);
		applyProject(state, kept.after, kept.before);
		return { point: this.#keep({ before, after: snapshot(state) }) };
	}

	/** Whether a point can still be taken back. */
	has(point: string): boolean {
		return this.#points.has(point);
	}

	#keep(point: UndoPoint): string {
		const id = `${this.#prefix}-${++this.#count}`;
		this.#points.set(id, point);
		for (const old of this.#points.keys()) {
			if (this.#points.size <= this.#limit) break;
			this.#points.delete(old);
		}
		return id;
	}
}
