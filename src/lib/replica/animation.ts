/**
 * Plans how the replica *shows* a key combo ("shift + M1", "step 5 + turn E2", "record + play →
 * play"): which controls light up, go down, turn and come back up, and when. A pure function of
 * the combo parsed by `core/opxy` `parseKeys` and some timing; `ReplicaState.animate` plays the
 * plan. Nothing here emits events, touches the DOM or starts timers.
 */
import {
	getControl,
	targetIds,
	type ControlId,
	type KeySequence,
	type KeyTerm
} from '$lib/core/opxy';

/** How a control is marked while a combo is shown. */
export type HighlightKind = 'hold' | 'press' | 'turn' | 'candidate';

/** Which highlight wins when a control gets two. */
export const HIGHLIGHT_PRIORITY: Readonly<Record<HighlightKind, number>> = {
	candidate: 0,
	press: 1,
	turn: 2,
	hold: 3
};

/** One timed change to the replica, `at` milliseconds after the start. */
export type PlanStep =
	| {
			readonly at: number;
			readonly kind: 'highlight';
			readonly id: ControlId;
			readonly highlight: HighlightKind;
	  }
	| { readonly at: number; readonly kind: 'press'; readonly id: ControlId }
	| { readonly at: number; readonly kind: 'release'; readonly id: ControlId }
	| { readonly at: number; readonly kind: 'turn'; readonly id: ControlId; readonly delta: 1 | -1 }
	| {
			readonly at: number;
			readonly kind: 'hint';
			readonly id: ControlId;
			readonly direction: 1 | -1 | 0;
	  }
	| { readonly at: number; readonly kind: 'clear' };

/** Timing of a shown combo, in milliseconds. */
export interface AnimationTiming {
	/** How long a tapped key stays down. */
	readonly pressMs: number;
	/** How long a key written `hold …` stays down. */
	readonly holdMs: number;
	/** After pressing a key that stays held, before the next key of the chord. */
	readonly staggerMs: number;
	/** Detents shown for `turn …`. */
	readonly turnSteps: number;
	/** Time per detent. */
	readonly turnStepMs: number;
	/** After a chord's last action, before its held keys come up. */
	readonly releaseMs: number;
	/** Between chords (`→`). */
	readonly gapMs: number;
	/** How long highlights stay after the last key comes up. */
	readonly lingerMs: number;
	/** Direction of `turn …`: 1 clockwise, -1 counter-clockwise. */
	readonly direction: 1 | -1;
}

/** Unhurried enough to follow, quick enough not to bore. */
export const DEFAULT_TIMING: AnimationTiming = {
	pressMs: 280,
	holdMs: 1000,
	staggerMs: 320,
	turnSteps: 4,
	turnStepMs: 140,
	releaseMs: 160,
	gapMs: 420,
	lingerMs: 900,
	direction: 1
};

/** The timeline for one combo. */
export interface AnimationPlan {
	readonly steps: readonly PlanStep[];
	/** Time of the last step (the final `clear`). */
	readonly duration: number;
	/** Every control the combo touches, in order of first use (for callouts). */
	readonly ids: readonly ControlId[];
}

/**
 * Picks the control that stands in for a placeholder, range or set of alternatives while the
 * combo is shown ("step n" → step 1); the other candidates are only highlighted.
 */
export type PickControl = (candidates: readonly ControlId[], term: KeyTerm) => ControlId;

const firstCandidate: PickControl = (candidates) => candidates[0];

/** Controls the replica can push down (keys and encoder clicks) or press (the pitch-bend pad). */
function isPushable(id: ControlId): boolean {
	const { inputs } = getControl(id);
	return inputs.includes('press') || inputs.includes('click') || inputs.includes('pressure');
}

/**
 * Plans a key combo. Every term but a chord's last is held down (with a short stagger); the last
 * one is tapped, held, clicked or turned; the held keys come up after it unless the next chord
 * keeps them (`→ + …`). Highlights stay until the end so the whole gesture can be read.
 */
export function planAnimation(
	sequence: KeySequence,
	timing: Partial<AnimationTiming> = {},
	pick: PickControl = firstCandidate
): AnimationPlan {
	const T: AnimationTiming = { ...DEFAULT_TIMING, ...timing };
	for (const [name, value] of Object.entries(T)) {
		if (name !== 'direction' && (!Number.isFinite(value) || value < 0)) {
			throw new RangeError(`animation timing ${name} must be a finite number >= 0, got ${value}`);
		}
	}
	if (!Number.isInteger(T.turnSteps) || T.turnSteps < 1) {
		throw new RangeError(
			`animation timing turnSteps must be a positive integer, got ${T.turnSteps}`
		);
	}

	const steps: PlanStep[] = [];
	const ids: ControlId[] = [];
	const use = (id: ControlId) => {
		if (!ids.includes(id)) ids.push(id);
	};
	let t = 0;
	let held: ControlId[] = [];

	sequence.chords.forEach((chord, index) => {
		if (!chord.keepHeld) held = [];
		const chosen = chord.terms.map((term) => {
			const candidates = targetIds(term.target);
			const id = pick(candidates, term);
			if (!candidates.includes(id)) {
				throw new RangeError(`pick returned ${id}, which is not one of ${candidates.join(', ')}`);
			}
			if (candidates.length > 1) {
				for (const other of candidates) {
					if (other !== id)
						steps.push({ at: t, kind: 'highlight', id: other, highlight: 'candidate' });
				}
			}
			return id;
		});

		chord.terms.forEach((term, i) => {
			const id = chosen[i];
			use(id);
			const last = i === chord.terms.length - 1;
			if (!last) {
				// A leading term is held while the rest of the chord happens.
				steps.push({ at: t, kind: 'highlight', id, highlight: 'hold' });
				if (isPushable(id)) {
					steps.push({ at: t, kind: 'press', id });
					held.push(id);
				}
				t += T.staggerMs;
				return;
			}
			switch (term.gesture) {
				case 'turn': {
					steps.push({ at: t, kind: 'highlight', id, highlight: 'turn' });
					steps.push({ at: t, kind: 'hint', id, direction: T.direction });
					for (let s = 1; s <= T.turnSteps; s++) {
						steps.push({ at: t + s * T.turnStepMs, kind: 'turn', id, delta: T.direction });
					}
					t += T.turnSteps * T.turnStepMs;
					steps.push({ at: t + T.releaseMs, kind: 'hint', id, direction: 0 });
					break;
				}
				case 'hold':
				case 'press':
				case 'click': {
					const down = term.gesture === 'hold' ? T.holdMs : T.pressMs;
					steps.push({
						at: t,
						kind: 'highlight',
						id,
						highlight: term.gesture === 'hold' ? 'hold' : 'press'
					});
					if (isPushable(id)) {
						steps.push({ at: t, kind: 'press', id });
						steps.push({ at: t + down, kind: 'release', id });
					}
					t += down;
					break;
				}
			}
		});

		const next = sequence.chords[index + 1];
		if (!next?.keepHeld && held.length > 0) {
			t += T.releaseMs;
			for (const id of [...held].reverse()) steps.push({ at: t, kind: 'release', id });
			held = [];
		}
		if (next) t += T.gapMs;
	});

	t += T.lingerMs;
	steps.push({ at: t, kind: 'clear' });
	// Stable sort: steps at the same time keep their authored order.
	const ordered = steps
		.map((step, k) => ({ step, k }))
		.sort((a, b) => a.step.at - b.step.at || a.k - b.k);
	return { steps: ordered.map((o) => o.step), duration: t, ids };
}
