/**
 * Loosening a pattern as a player would: each note a little off the grid and a little louder or
 * softer, the beats drifting half as far so the groove stays put. Agents asked to humanize robotic
 * hats could only vary velocities by hand, note by note, and had no way to move a note off the grid.
 * Deterministic: the same notes loosen the same way, so a test (or a retry) reads the same.
 */

/** How loose: the most a note drifts, in part of a step, and the most its velocity moves. */
export interface Humanize {
	/** Up to 0.4 of a step either way (0.05 a touch, 0.1 loose, 0.2 sloppy). */
	readonly timing?: number;
	/** Up to this much up or down, 1–127 kept. */
	readonly velocity?: number;
	/**
	 * A steady lean on top, in part of a step: positive behind the beat (a snare laid back),
	 * negative ahead of it (hats pushing), −0.3 … 0.3.
	 */
	readonly late?: number;
}

interface Loosened {
	readonly step: number;
	readonly velocity: number;
	readonly offset?: number;
}

/** A small seeded random source (mulberry32): the same seed, the same run. */
function seeded(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A seed from the notes themselves (step, note, velocity), so the same pattern loosens alike. */
export function seedOf(notes: readonly { step: number; note: number; velocity: number }[]): number {
	let h = 2166136261;
	for (const n of notes) {
		for (const x of [n.step, n.note, n.velocity]) {
			h ^= x;
			h = Math.imul(h, 16777619);
		}
	}
	return h >>> 0;
}

/**
 * The notes `pick` chooses, loosened by `amount`; the others as they were. A note on a beat (steps
 * 1, 5, 9 …) drifts half as far, and none plays before the pattern's first step.
 */
export function humanizeNotes<T extends Loosened>(
	notes: readonly T[],
	amount: Humanize,
	pick: (note: T) => boolean,
	seed: number
): T[] {
	const random = seeded(seed);
	const timing = Math.max(0, Math.min(0.4, amount.timing ?? 0));
	const spread = Math.max(0, Math.round(amount.velocity ?? 0));
	const late = Math.max(-0.3, Math.min(0.3, amount.late ?? 0));
	return notes.map((n) => {
		if (!pick(n)) return n;
		const onBeat = (n.step - 1) % 4 === 0;
		const reach = onBeat ? timing / 2 : timing;
		const moved = timing > 0 || late !== 0;
		// a lean alone moves the notes as they sit, their drift kept (a second call leaning the
		// snares late set every one to the lean, and the first call's looseness was gone)
		const drift = moved
			? Math.max(
					-0.5,
					Math.min(0.5, (timing > 0 ? (random() * 2 - 1) * reach : (n.offset ?? 0)) + late)
				)
			: (n.offset ?? 0);
		// three decimals of a step (the sequencer's ticks are finer than that)
		const offset = Math.round((n.step === 1 ? Math.max(0, drift) : drift) * 1000) / 1000;
		const velocity =
			spread > 0
				? Math.max(1, Math.min(127, n.velocity + Math.round((random() * 2 - 1) * spread)))
				: n.velocity;
		const out: Record<string, unknown> = { ...(n as object), velocity };
		if (offset) out.offset = offset;
		else delete out.offset;
		return out as unknown as T;
	});
}
