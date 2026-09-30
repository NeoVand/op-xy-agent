/**
 * Lights on the replica what an answer changed (the list in its changes note, each change with the
 * keys that lead to it on the device): as the answer ends those keys breathe softly a few times,
 * then rest faintly lit a while; pointing at the changes note holds them lit. With the pointer on a
 * lit key the replica shows what changed there. A key the user presses goes out (they found it);
 * all of them go out when a new answer starts, when the turn is taken back, or after a while.
 */
import type { ControlId } from '$lib/core/opxy';
import type { ChangedControl, ChangeMark, InputSource, ReplicaState, Timers } from './state.svelte';

/** A change as the glow needs it: what it was, briefly, and the keys that lead to it. */
export interface GlowChange {
	readonly brief: string;
	readonly controls: readonly ControlId[];
}

export interface ChangeGlowOptions {
	/** What it lights (`setChanged`), and whose presses put a key out (`observe`). */
	readonly replica: Pick<ReplicaState, 'setChanged' | 'observe'>;
	readonly timers: Timers;
	/** How long the keys stay faintly lit once they have breathed, ms. */
	readonly rest?: number;
}

/** Key.svelte's keyframes: the light comes in, then breathes {@link BREATHS} times, ms. */
export const GLOW_IN_MS = 600;
export const BREATH_MS = 2600;
export const BREATHS = 3;
/** The most changes a key's note names; the rest are counted. */
const NOTE_LINES = 3;
/** Presses that are the user's own (on the replica, or on the OP-XY it mirrors). */
const USER: readonly InputSource[] = ['pointer', 'keyboard', 'device'];

const unique = <T>(items: readonly T[]) => items.filter((item, i) => items.indexOf(item) === i);

/** What a key's note says: a line per change there, the rest counted. */
function noteOf(briefs: readonly string[]): string {
	if (briefs.length <= NOTE_LINES) return briefs.join('\n');
	return [...briefs.slice(0, NOTE_LINES), `and ${briefs.length - NOTE_LINES} more`].join('\n');
}

export class ChangeGlow {
	readonly #replica: ChangeGlowOptions['replica'];
	readonly #timers: Timers;
	readonly #rest: number;
	/** The last answer's changes, while they are lit. */
	#changes: readonly GlowChange[] = [];
	/** The changes of the note being pointed at, if one is. */
	#pointed: readonly GlowChange[] | null = null;
	/** How the last answer's keys show now: breathing, then resting. */
	#mark: Exclude<ChangeMark, 'lit'> = 'breathe';
	/** Its keys the user has pressed since: they are out. */
	#found: ControlId[] = [];
	#timer: unknown = null;

	constructor(options: ChangeGlowOptions) {
		this.#replica = options.replica;
		this.#timers = options.timers;
		this.#rest = options.rest ?? 45_000;
	}

	/** Puts a key out when the user presses it. Returns `stop` (which puts every key out). */
	start(): () => void {
		const off = this.#replica.observe((event) => {
			if (event.type !== 'press' || !USER.includes(event.source)) return;
			if (!this.#changes.some((change) => change.controls.includes(event.id))) return;
			if (this.#found.includes(event.id)) return;
			this.#found = [...this.#found, event.id];
			this.#apply();
		});
		return () => {
			off();
			this.clear();
		};
	}

	/** An answer ended with these changes: their keys breathe, then rest lit a while. */
	show(changes: readonly GlowChange[]): void {
		this.#changes = changes.filter((change) => change.controls.length > 0);
		this.#found = [];
		this.#mark = 'breathe';
		this.#apply();
		this.#after(GLOW_IN_MS + BREATH_MS * BREATHS, () => {
			this.#mark = 'rest';
			this.#apply();
			this.#after(this.#rest, () => this.clear());
		});
	}

	/** A changes note is pointed at (its changes), or no longer is (null). */
	point(changes: readonly GlowChange[] | null): void {
		const pointed = changes?.filter((change) => change.controls.length > 0) ?? [];
		this.#pointed = pointed.length > 0 ? pointed : null;
		// once pointed at, the answer's keys only rest: they have been found
		if (this.#pointed) this.#mark = 'rest';
		this.#apply();
	}

	/** Puts every key out (a new answer starts, the turn was taken back). */
	clear(): void {
		this.#changes = [];
		this.#pointed = null;
		this.#found = [];
		this.#after(null);
		this.#replica.setChanged({});
	}

	#apply(): void {
		const pointing = this.#pointed !== null;
		const list = this.#pointed ?? this.#changes;
		const marks: Partial<Record<ControlId, ChangedControl>> = {};
		for (const id of unique(list.flatMap((change) => change.controls))) {
			if (!pointing && this.#found.includes(id)) continue;
			const briefs = list.filter((change) => change.controls.includes(id)).map((c) => c.brief);
			marks[id] = { mark: pointing ? 'lit' : this.#mark, note: noteOf(briefs) };
		}
		this.#replica.setChanged(marks);
	}

	/** Runs `then` after `ms` (replacing what was waiting), or only cancels that with null. */
	#after(ms: number | null, then?: () => void): void {
		if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
		this.#timer = null;
		if (ms === null || !then) return;
		this.#timer = this.#timers.setTimeout(() => {
			this.#timer = null;
			then();
		}, ms);
	}
}
