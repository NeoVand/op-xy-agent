/**
 * The simulator's sequencer model (decision D10): each track holds up to 16 patterns, a pattern up
 * to four bars of 16 steps and at most 120 notes, and a step holds notes (a chord), step components
 * and parameter locks. Limits and defaults are the manual's (sequencer: overview, bars and length,
 * step entry, step components; arrange: patterns). Plain, serialisable data and pure functions, so
 * the frame builder, the sound engine and tests share them.
 */

/** Steps in a bar, bars in a pattern, steps in a pattern, notes in a pattern, patterns per track. */
export const STEPS_PER_BAR = 16;
export const MAX_BARS = 4;
export const MAX_STEPS = STEPS_PER_BAR * MAX_BARS;
export const MAX_NOTES = 120;
export const MAX_PATTERNS = 16;

/**
 * Step components by white key, `natural 1` … `natural 14` (manual:
 * sequencer/step-component-reference), with the value a component keeps when added without a digit.
 */
export const STEP_COMPONENTS = [
	{ kind: 'pulse', defaultValue: 4 },
	{ kind: 'pulse hold', defaultValue: 4 },
	{ kind: 'multiply', defaultValue: 2 },
	{ kind: 'velocity', defaultValue: 5 },
	{ kind: 'ramp up', defaultValue: 4 },
	{ kind: 'ramp down', defaultValue: 4 },
	{ kind: 'random', defaultValue: 4 },
	{ kind: 'portamento', defaultValue: 4 },
	{ kind: 'bend', defaultValue: 1 },
	{ kind: 'tonality', defaultValue: 4 },
	{ kind: 'jump', defaultValue: 4 },
	{ kind: 'skip parameter lock', defaultValue: 2 },
	{ kind: 'skip step component', defaultValue: 2 },
	{ kind: 'skip trigger', defaultValue: 2 }
] as const;

export type StepComponentKind = (typeof STEP_COMPONENTS)[number]['kind'];

/** A note on a step. */
export interface SeqNote {
	/** MIDI note (60 = C4; drum tracks 53–76, one sound per keyboard key). */
	note: number;
	/** 1–127. */
	velocity: number;
	/** In steps; notes placed by pressing a step take the pattern's note length. */
	length: number;
	/** Micro-timing, −0.5…0.5 of a step (live recording, nudge). */
	offset: number;
}

/** A component on a step: its kind and its digit (0–9; 0 means random for most). */
export interface StepComponent {
	kind: StepComponentKind;
	value: number;
}

/** One step. */
export interface SeqStep {
	notes: SeqNote[];
	components: StepComponent[];
	/** Parameter locks: a module parameter id ("m1.1", "m3.cutoff", …) → its stored value. */
	locks: Record<string, number>;
}

/** One pattern and the settings the bar menu edits (manual: sequencer/bar-menu). */
export interface Pattern {
	/** Always MAX_STEPS long; only the first `length` play. */
	steps: SeqStep[];
	/** 1–4 bars (bar + [+] / [-]). */
	bars: number;
	/** Steps that play, 1–64 (bar + step n trims the last bar). */
	length: number;
	/** How long a step lasts in sixteenths (track scale, bar + accidental: 1/2, 1, 2 … 4). */
	scale: number;
	/** Bar menu encoders: quantise (0–99), note length in steps, groove (0–99), lock smoothing (0–99). */
	quantise: number;
	noteLength: number;
	groove: number;
	smoothing: number;
}

/** A track's patterns: which one plays, and which bar the step keys show. */
export interface Sequence {
	patterns: Pattern[];
	/** Index of the pattern that plays (0–15). */
	current: number;
	/** The bar the step keys show (0–3; tapping bar moves on). */
	page: number;
	/** The last note played on the keyboard: what pressing a step stores (manual: step entry). */
	lastNote: number;
}

/** An empty step. */
export function emptyStep(): SeqStep {
	return { notes: [], components: [], locks: {} };
}

/** A new one-bar pattern. */
export function emptyPattern(): Pattern {
	return {
		steps: Array.from({ length: MAX_STEPS }, emptyStep),
		bars: 1,
		length: STEPS_PER_BAR,
		scale: 1,
		quantise: 0,
		noteLength: 1,
		groove: 0,
		smoothing: 0
	};
}

/** A track's sequence in a new project: one empty pattern; `lastNote` starts at `note`. */
export function emptySequence(note = 60): Sequence {
	return { patterns: [emptyPattern()], current: 0, page: 0, lastNote: note };
}

/** The pattern that plays. */
export function currentPattern(sequence: Sequence): Pattern {
	return sequence.patterns[Math.min(sequence.current, sequence.patterns.length - 1)];
}

/** Notes in a pattern (the 120-note limit counts these). */
export function noteCount(pattern: Pattern): number {
	return pattern.steps.reduce((sum, step) => sum + step.notes.length, 0);
}

/** Whether a step holds notes. */
export const hasNotes = (step: SeqStep) => step.notes.length > 0;

/**
 * Presses a step (manual: step entry): an empty step stores `notes` (the last note played, or a
 * held chord) at the pattern's note length; a step with notes is cleared. Returns false when the
 * pattern is full (120 notes) and nothing changed.
 */
export function toggleStep(
	pattern: Pattern,
	index: number,
	notes: readonly number[],
	velocity = 100
): boolean {
	const step = pattern.steps[index];
	if (!step) return false;
	if (hasNotes(step)) {
		step.notes = [];
		return true;
	}
	const unique = [...new Set(notes)];
	if (unique.length === 0 || noteCount(pattern) + unique.length > MAX_NOTES) return false;
	step.notes = unique.map((note) => ({ note, velocity, length: pattern.noteLength, offset: 0 }));
	return true;
}

/**
 * With a step held, a key toggles that note on the step (manual: step entry). Returns false when
 * adding would pass 120 notes.
 */
export function toggleNote(pattern: Pattern, index: number, note: number, velocity = 100): boolean {
	const step = pattern.steps[index];
	if (!step) return false;
	const at = step.notes.findIndex((n) => n.note === note);
	if (at >= 0) {
		step.notes.splice(at, 1);
		return true;
	}
	if (noteCount(pattern) >= MAX_NOTES) return false;
	step.notes.push({ note, velocity, length: pattern.noteLength, offset: 0 });
	return true;
}

/**
 * Where a track's playhead is: `position` counts sixteenths since play; each track moves one step
 * per `scale` sixteenths and wraps at its pattern's length.
 */
export function stepAt(pattern: Pattern, position: number): number {
	return Math.floor(position / pattern.scale) % pattern.length;
}
