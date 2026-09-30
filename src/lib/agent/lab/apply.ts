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
 * from after back to before touches only what the commit changed, and only where the state still
 * reads as the commit left it (a later change to the same value, the user's or another run's, is
 * kept rather than undone with it).
 */
import type { ProjectContent } from '$lib/sim/areas/system/projects';
import { snapshot } from '$lib/sim/areas/system/projects';
import type { SimState } from '$lib/sim/params';
import { mergeInto, type Conflicts, type Container, type Json } from '$lib/sim/merge';
import { SESSION_FIELDS } from '$lib/sim/session';

/**
 * Merges the project change `base` → `next` (both `snapshot` JSON) into `state`: what changed in
 * between lands; everything else, and every session field, stays. Where the state has changed a
 * value too, `next`'s wins, unless `conflicts` is `keep` (an undo). Returns whether `state` changed.
 */
export function applyProject(
	state: SimState,
	base: string,
	next: string,
	conflicts: Conflicts = 'take'
): boolean {
	const b = JSON.parse(base) as ProjectContent;
	const n = JSON.parse(next) as ProjectContent;
	const s = state as unknown as Container;
	let changed = false;
	const merge = (parent: Container, key: string, from: Json, to: Json) => {
		changed = mergeInto(parent, key, from, to, conflicts) || changed;
	};
	for (const key of ['tracks', 'aux', 'tempo'] as const) merge(s, key, b[key], n[key]);
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
			merge(areas[area], field, from[field], to[field]);
		}
	}
	const system = state.areas.system as unknown as Container;
	merge(system, 'projectSettings', b.settings, n.settings);
	merge(system, 'trackPresets', b.trackPresets, n.trackPresets);
	merge(system, 'presetSettings', b.presetSettings, n.presetSettings);
	return changed;
}

/** A take a run offered: its label, and the project change keeping it lands. */
export interface ShelvedTake {
	readonly label: string;
	readonly base: string;
	readonly project: string;
}

/**
 * The takes runs offered (`lab.offer`), each set heard one take at a time on the replica: hearing
 * one lands it as an undo point (the one heard before goes back first), none puts the replica back,
 * keeping leaves the take on and closes the set. Only in the page session that made them.
 */
export class TakeShelf {
	readonly #points: UndoPoints;
	readonly #prefix: string;
	readonly #offers = new Map<
		string,
		{ readonly takes: readonly ShelvedTake[]; on: { index: number; point: string } | null }
	>();
	#count = 0;

	constructor(points: UndoPoints, prefix = 'takes') {
		this.#points = points;
		this.#prefix = prefix;
	}

	/** Keeps a run's takes; returns the id the chat names them by. */
	shelve(takes: readonly ShelvedTake[]): string {
		const id = `${this.#prefix}-${++this.#count}`;
		this.#offers.set(id, { takes, on: null });
		return id;
	}

	/** The take on the replica now (its index), or null. */
	on(offer: string): number | null {
		return this.#offers.get(offer)?.on?.index ?? null;
	}

	/**
	 * Puts take `index` on the replica (the one on before goes back first), or none (null). False
	 * when the set is unknown (kept already, too old, from before a reload).
	 */
	hear(state: SimState, offer: string, index: number | null): boolean {
		const set = this.#offers.get(offer);
		if (!set || (index !== null && !set.takes[index])) return false;
		if (set.on) {
			this.#points.revert(state, set.on.point);
			set.on = null;
		}
		if (index === null) return true;
		const take = set.takes[index];
		const landed = this.#points.land(state, take.base, take.project);
		if (landed) set.on = { index, point: landed.point };
		return true;
	}

	/** The take on the replica stays, as one change that can be undone; the set closes. */
	keep(offer: string): { readonly index: number; readonly landed: Landed } | null {
		const set = this.#offers.get(offer);
		if (!set?.on) return null;
		this.#offers.delete(offer);
		return { index: set.on.index, landed: { point: set.on.point } };
	}
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
	 * Takes an undo point's change back (only what it changed, and only where nothing changed it
	 * since), and keeps a point for the way forward again. Null when the point is unknown or too old.
	 */
	revert(state: SimState, point: string): Landed | null {
		const kept = this.#points.get(point);
		if (!kept) return null;
		const before = snapshot(state);
		applyProject(state, kept.after, kept.before, 'keep');
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
