/**
 * The simulator's sequencer model (decision D10): each track holds up to 16 patterns, a pattern up
 * to four bars of 16 steps and at most 120 notes, and a step holds notes (a chord), step components
 * and parameter locks. Limits and defaults are the manual's (sequencer: overview, bars and length,
 * step entry, step components, bar menu; arrange: patterns; players: overview) and the decoded
 * project files of research note 10. Plain, serialisable data and pure functions that edit it, so
 * the frame builder, the gestures, the sound engine and tests share them.
 *
 * What a pattern actually plays (step components on each pass, the playhead's walk, players) is in
 * the sibling module `sequencer-playback.ts`.
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

/** The white key of a component: 0 (`natural 1`, F3) … 13 (`natural 14`, E5). */
export function componentIndex(kind: StepComponentKind): number {
	return STEP_COMPONENTS.findIndex((c) => c.kind === kind);
}

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
	/**
	 * The note keeps a length of its own (recorded live, extended, or written whole): the bar menu's
	 * length leaves it alone (manual: sequencer/bar-menu). Step-entered notes follow it.
	 */
	ownLength?: boolean;
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
	/**
	 * Parameter locks: a module parameter id → its stored value. Ids name the parameter, not the
	 * encoder, so a page can show a step's locked values: "m1.1" … "m1.4" (engine parameters),
	 * "amp.attack", "filter.cutoff", "sends.fx1", "lfo.amount", "key3.tune" (a sampler key) … The
	 * table is `areas/sequencer/locks.ts`.
	 */
	locks: Record<string, number>;
}

/**
 * Track scales by accidental digit (`bar + accidental`, manual: sequencer/track-scale): keys 1–8
 * give 1–8 sixteenths per step, 9 gives 16 and 0 a thirty-second (1/2). TE ties only the key
 * marked 4 to a value; the rest is our reading of the guide's list (1, 2, 3, 4, 6, 8, 16, 1/2) plus
 * the odd scales 5 and 7 of OS 1.1.25, which make exactly ten.
 */
export const TRACK_SCALES = [1, 2, 3, 4, 5, 6, 7, 8, 16, 0.5] as const;

/** The track scale of an accidental digit (1–9, 0). */
export function scaleForDigit(digit: number): number {
	return TRACK_SCALES[(((digit - 1) % 10) + 10) % 10];
}

/** The accidental digit (1–9, 0) of a track scale, or null for one the keys cannot set. */
export function digitForScale(scale: number): number | null {
	const at = TRACK_SCALES.indexOf(scale as (typeof TRACK_SCALES)[number]);
	return at < 0 ? null : (at + 1) % 10;
}

/** A track scale as the bar page shows it: "1", "16", "1/2". */
export function formatScale(scale: number): string {
	if (scale >= 1) return String(scale);
	return `1/${Math.round(1 / scale)}`;
}

// ─────────────────────────────────────────────────────────────────────────── players

/** Player types, in the order `shift + player` steps through them (manual: players/overview). */
export const PLAYER_TYPES = ['arpeggio', 'maestro', 'hold'] as const;
export type PlayerType = (typeof PLAYER_TYPES)[number];

/**
 * Arpeggio speeds (E1): a note value and its length in steps. The guide names no values; these are
 * ours, with triplets between the straight values.
 */
export const ARP_SPEEDS = [
	{ label: '1/32', steps: 0.5 },
	{ label: '1/16t', steps: 2 / 3 },
	{ label: '1/16', steps: 1 },
	{ label: '1/8t', steps: 4 / 3 },
	{ label: '1/8', steps: 2 },
	{ label: '1/4t', steps: 8 / 3 },
	{ label: '1/4', steps: 4 },
	{ label: '1/2', steps: 8 },
	{ label: '1/1', steps: 16 }
] as const;

/** Arpeggio patterns (E2; manual: players/arpeggio). */
export const ARP_PATTERNS = [
	'up',
	'down',
	'up/down',
	'up/repeat/down',
	'random',
	'play order'
] as const;

/**
 * Arpeggio styles (shift + E2). The guide says only that style also changes the note order; these
 * five are ours: as the pattern, outside-in, inside-out, and each note alternating with the top
 * (pinky) or the bottom (thumb) note.
 */
export const ARP_STYLES = ['straight', 'converge', 'diverge', 'pinky', 'thumb'] as const;

/** Maestro strum orders (E2; manual: players/maestro). */
export const MAESTRO_PATTERNS = ['up', 'down', 'up/down', 'random'] as const;

/** The arpeggio's settings: indexes into the tables above, and 0–99 amounts. */
export interface ArpSettings {
	/** Index into ARP_SPEEDS. */
	speed: number;
	/** Index into ARP_PATTERNS. */
	pattern: number;
	/** Octaves the run spans, 1–4. */
	range: number;
	/** Keeps running after the keys are let go (E4). */
	hold: boolean;
	/** Note length, 1–99 % of the arpeggio's step (shift + E1). */
	length: number;
	/** Index into ARP_STYLES (shift + E2). */
	style: number;
	/** Glide between notes, 0–99 (shift + E3). */
	glide: number;
	/** Stereo spread of successive notes, 0–99 (shift + E4). */
	stereo: number;
}

/** Maestro: the stored chord and how it is strummed. */
export interface MaestroSettings {
	/** 0 (block chord) … 99 (slow strum). */
	roll: number;
	/** Index into MAESTRO_PATTERNS. */
	pattern: number;
	hold: boolean;
	/** The chord as entered with shift held (MIDI notes, ascending); played relative to its lowest. */
	chord: number[];
}

/** A pattern's player. */
export interface PlayerSettings {
	type: PlayerType;
	/** Switched on with the second press of `player`. */
	on: boolean;
	arp: ArpSettings;
	maestro: MaestroSettings;
}

/** A player as a new pattern has it: arpeggio, off, sixteenths up over one octave. */
export function defaultPlayer(): PlayerSettings {
	return {
		type: 'arpeggio',
		on: false,
		arp: { speed: 2, pattern: 0, range: 1, hold: false, length: 50, style: 0, glide: 0, stereo: 0 },
		maestro: { roll: 0, pattern: 0, hold: false, chord: [] }
	};
}

// ─────────────────────────────────────────────────────────────────────────── patterns

/** One pattern and the settings the bar menu edits (manual: sequencer/bar-menu). */
export interface Pattern {
	/** Always MAX_STEPS long; only the first `length` play. */
	steps: SeqStep[];
	/** 1–4 bars (bar + [+] / [-]). */
	bars: number;
	/** Steps that play, 1–64 (bar + step n trims the last bar). */
	length: number;
	/** How long a step lasts in sixteenths (track scale, bar + accidental: 1/2, 1, 2 … 16). */
	scale: number;
	/**
	 * Bar menu E1: quantisation 0–100, pulling live-recorded notes onto the steps (a new project
	 * reads 100, research note 10). Nudging needs it below 100.
	 */
	quantise: number;
	/** Quantisation switched on (E1 click, OS 1.1.15; off plays recorded timing as it is). */
	quantiseOn: boolean;
	/** Bar menu E2: the length of step-entered notes in steps, 0.01–1 (shown ×100: 50 = half). */
	noteLength: number;
	/** Bar menu E3: this track's groove −99…99 on the device's detents (GROOVE_VALUES); 0 = none. */
	groove: number;
	/** Bar menu E4: smoothing between parameter locks, 0 (stepped, the default) … 99. */
	smoothing: number;
	/** The pattern's player (OS 1.1.25 hints the player type belongs to the pattern). */
	player: PlayerSettings;
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

/** A new one-bar pattern (quantisation 100 and note length 50, as decoded project files show). */
export function emptyPattern(): Pattern {
	return {
		steps: Array.from({ length: MAX_STEPS }, emptyStep),
		bars: 1,
		length: STEPS_PER_BAR,
		scale: 1,
		quantise: 100,
		quantiseOn: true,
		noteLength: 0.5,
		groove: 0,
		smoothing: 0,
		player: defaultPlayer()
	};
}

/**
 * A pattern added next to `previous` (for the arrange pages): empty, but with the player type that
 * is selected at that moment (OS 1.1.25, manual: players/overview).
 */
export function newPatternLike(previous: Pattern): Pattern {
	const pattern = emptyPattern();
	pattern.player.type = previous.player.type;
	return pattern;
}

/** A track's sequence in a new project: one empty pattern; `lastNote` starts at `note`. */
export function emptySequence(note = 60): Sequence {
	return { patterns: [emptyPattern()], current: 0, page: 0, lastNote: note };
}

/** A deep copy of plain sequencer data (also of reactive proxies, which `structuredClone` refuses). */
function copy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** A deep copy of a step. */
export const cloneStep = (step: SeqStep): SeqStep => copy(step);
/** A deep copy of a pattern. */
export const clonePattern = (pattern: Pattern): Pattern => copy(pattern);
/** A deep copy of a sequence (the undo snapshot). */
export const cloneSequence = (sequence: Sequence): Sequence => copy(sequence);

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

/** Whether a step carries step components. */
export const hasComponents = (step: SeqStep) => step.components.length > 0;

/** Whether a step carries parameter locks. */
export const hasLocks = (step: SeqStep) => Object.keys(step.locks).length > 0;

/** Whether a step holds nothing at all: no notes, components or locks. */
export const isEmptyStep = (step: SeqStep) =>
	!hasNotes(step) && !hasComponents(step) && !hasLocks(step);

// ─────────────────────────────────────────────────────────────────────────── step entry

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
 * Pastes a copied step (notes, step components and locks) onto a step (manual:
 * sequencer/copy-step). Returns false, changing nothing, when the notes would pass 120.
 */
export function pasteStep(pattern: Pattern, index: number, source: SeqStep): boolean {
	const step = pattern.steps[index];
	if (!step) return false;
	if (noteCount(pattern) - step.notes.length + source.notes.length > MAX_NOTES) return false;
	const copied = cloneStep(source);
	step.notes = copied.notes;
	step.components = copied.components;
	step.locks = copied.locks;
	return true;
}

/** How far "overlap" runs past the end step (manual: sequencer/extend-notes; the amount is ours). */
export const OVERLAP = 0.25;

/**
 * Stretches the notes of step `from` until step `to` (hold a step, press a later one; manual:
 * sequencer/extend-notes). The first press ends them with the end step ("full step"); pressing the
 * same end step again lets them run a little into the next one ("overlap"), and so on. Returns the
 * ending, or null when nothing changed (no notes, or `to` is not later).
 */
export function extendNotes(pattern: Pattern, from: number, to: number): 'full' | 'overlap' | null {
	const step = pattern.steps[from];
	if (!step || !hasNotes(step) || to <= from || to >= pattern.length) return null;
	const full = to - from + 1;
	const ending = step.notes.every((n) => n.length === full) ? 'overlap' : 'full';
	for (const n of step.notes) {
		n.length = ending === 'full' ? full : full + OVERLAP;
		n.ownLength = true;
	}
	return ending;
}

/**
 * Gives the pattern's step-entered notes its note length (the bar menu's E2; manual:
 * sequencer/bar-menu): notes recorded live, extended or written whole keep their own.
 */
export function applyNoteLength(pattern: Pattern): void {
	for (const step of pattern.steps) {
		for (const n of step.notes) if (!n.ownLength) n.length = pattern.noteLength;
	}
}

/** One nudge press moves notes by this much of a step: 20 of the sequencer's 480 ticks (ours). */
export const NUDGE = 20 / 480;

/** Whether notes can be nudged: quantisation below 100 or switched off (manual: sequencer/nudge). */
export function canNudge(pattern: Pattern): boolean {
	return !pattern.quantiseOn || pattern.quantise < 100;
}

/**
 * Moves a step's notes earlier (−1) or later (+1) by one nudge, within half a step either way
 * (hold a step, press [-] / [+]; manual: sequencer/nudge). Returns false when not allowed.
 */
export function nudgeStep(pattern: Pattern, index: number, direction: -1 | 1): boolean {
	const step = pattern.steps[index];
	if (!step || !hasNotes(step) || !canNudge(pattern)) return false;
	for (const n of step.notes) {
		const ticks = Math.round((n.offset + direction * NUDGE) * 480);
		n.offset = Math.max(-240, Math.min(240, ticks)) / 480;
	}
	return true;
}

/**
 * Slides the whole pattern by `by` steps, wrapping at its length; notes, step components and locks
 * travel together (hold a track key, press [-] / [+]; manual: sequencer/rotate, OS 1.1.21).
 */
export function rotatePattern(pattern: Pattern, by: number): void {
	const n = pattern.length;
	const shift = ((by % n) + n) % n;
	if (shift === 0) return;
	const played = pattern.steps.slice(0, n);
	for (let i = 0; i < n; i++) pattern.steps[(i + shift) % n] = played[i];
}

/**
 * Moves every note of the pattern by `semitones` (shift + [-] / [+]: an octave on synth and sampler
 * tracks, a semitone on drum tracks; manual: sequencer/transpose-sequence). Returns false, changing
 * nothing, when a note would leave MIDI's 0–127.
 */
export function transposePattern(pattern: Pattern, semitones: number): boolean {
	const notes = pattern.steps.flatMap((s) => s.notes);
	if (notes.some((n) => n.note + semitones < 0 || n.note + semitones > 127)) return false;
	for (const n of notes) n.note += semitones;
	return true;
}

/**
 * Records a live note (manual: sequencer/live-recording): `position` is where the playhead is, in
 * steps since the pattern started (it may run past the length; takes wrap round). The note lands on
 * the nearest step with the rest as its offset; quantisation is applied when the step plays, so it
 * can be changed afterwards. A note already on that step is replaced. Returns where it went, or
 * null when the pattern is full.
 */
export function recordNote(
	pattern: Pattern,
	position: number,
	note: number,
	velocity = 100,
	length = pattern.noteLength
): { index: number; offset: number } | null {
	const nearest = Math.round(position);
	const index = ((nearest % pattern.length) + pattern.length) % pattern.length;
	const offset = Math.round((position - nearest) * 480) / 480;
	const step = pattern.steps[index];
	const existing = step.notes.find((n) => n.note === note);
	if (existing) {
		Object.assign(existing, { velocity, length, offset, ownLength: true });
		return { index, offset };
	}
	if (noteCount(pattern) >= MAX_NOTES) return null;
	step.notes.push({ note, velocity, length, offset, ownLength: true });
	return { index, offset };
}

// ─────────────────────────────────────────────────────────────────────────── bars and length

/**
 * Adds an empty bar at the end (bar + [+]; four at most) and makes the pattern play all of its bars
 * (manual: sequencer/bars-and-length). Returns false at four bars.
 */
export function addBar(pattern: Pattern): boolean {
	if (pattern.bars >= MAX_BARS) return false;
	pattern.bars += 1;
	pattern.length = pattern.bars * STEPS_PER_BAR;
	return true;
}

/**
 * Removes the last bar and what was on it (bar + [-]); the length shrinks with it. Returns false
 * at one bar.
 */
export function removeBar(pattern: Pattern): boolean {
	if (pattern.bars <= 1) return false;
	pattern.bars -= 1;
	for (let i = pattern.bars * STEPS_PER_BAR; i < MAX_STEPS; i++) pattern.steps[i] = emptyStep();
	pattern.length = Math.min(pattern.length, pattern.bars * STEPS_PER_BAR);
	return true;
}

/**
 * Duplicates (bar + shift + [+], manual: sequencer/bars-and-length): while the pattern can double,
 * its bars are copied after themselves (bar 1 → 2; bars 1–2 → 3–4); a three-bar pattern gets a copy
 * of the bar shown as its fourth. Notes, components and locks come along (OS 1.1.3). Returns false,
 * changing nothing, at four bars or when the copy would pass 120 notes.
 */
export function duplicateBars(pattern: Pattern, shown: number): boolean {
	const bars = pattern.bars;
	if (bars >= MAX_BARS) return false;
	const sources = bars * 2 <= MAX_BARS ? [...Array(bars).keys()] : [shown];
	const added = sources.reduce(
		(sum, bar) =>
			sum +
			pattern.steps
				.slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
				.reduce((n, s) => n + s.notes.length, 0),
		0
	);
	if (noteCount(pattern) + added > MAX_NOTES) return false;
	sources.forEach((bar, i) => {
		for (let s = 0; s < STEPS_PER_BAR; s++) {
			pattern.steps[(bars + i) * STEPS_PER_BAR + s] = cloneStep(
				pattern.steps[bar * STEPS_PER_BAR + s]
			);
		}
	});
	pattern.bars = bars + sources.length;
	pattern.length = pattern.bars * STEPS_PER_BAR;
	return true;
}

/**
 * Sets how many steps the last bar plays (bar + step n; the other bars stay whole; manual:
 * sequencer/bars-and-length).
 */
export function setLastBarLength(pattern: Pattern, steps: number): void {
	const n = Math.max(1, Math.min(STEPS_PER_BAR, Math.round(steps)));
	pattern.length = (pattern.bars - 1) * STEPS_PER_BAR + n;
}

// ─────────────────────────────────────────────────────────────────────────── clearing

/** Deletes the notes, and the step components that went with them, keeping the locks (bar + M1). */
export function clearNotes(pattern: Pattern): void {
	for (const step of pattern.steps) {
		step.notes = [];
		step.components = [];
	}
}

/** Deletes every parameter lock, keeping the notes (bar + M2). */
export function clearLocks(pattern: Pattern): void {
	for (const step of pattern.steps) step.locks = {};
}

/** Deletes notes, components and locks (bar + M4, record + hold stop). */
export function clearAll(pattern: Pattern): void {
	for (let i = 0; i < pattern.steps.length; i++) pattern.steps[i] = emptyStep();
}

// ─────────────────────────────────────────────────────────────────────────── step components

/** A step's component of a kind, if it has one. */
export function getComponent(step: SeqStep, kind: StepComponentKind): StepComponent | undefined {
	return step.components.find((c) => c.kind === kind);
}

/**
 * A white key while steps are selected with shift held (manual: sequencer/step-components): when
 * every selected step already has the component it comes off them all, otherwise the steps without
 * it get it at its default digit.
 */
export function toggleComponent(
	pattern: Pattern,
	indices: readonly number[],
	kind: StepComponentKind
): 'added' | 'removed' | null {
	const steps = indices.map((i) => pattern.steps[i]).filter((s): s is SeqStep => !!s);
	if (steps.length === 0) return null;
	if (steps.every((s) => getComponent(s, kind))) {
		for (const s of steps) s.components = s.components.filter((c) => c.kind !== kind);
		return 'removed';
	}
	const value = STEP_COMPONENTS[componentIndex(kind)].defaultValue;
	for (const s of steps) if (!getComponent(s, kind)) s.components.push({ kind, value });
	return 'added';
}

/** A black key after the white key: sets the component's digit (0–9) on the selected steps. */
export function setComponentValue(
	pattern: Pattern,
	indices: readonly number[],
	kind: StepComponentKind,
	digit: number
): void {
	const value = ((Math.round(digit) % 10) + 10) % 10;
	for (const i of indices) {
		const step = pattern.steps[i];
		if (!step) continue;
		const existing = getComponent(step, kind);
		if (existing) existing.value = value;
		else step.components.push({ kind, value });
	}
}

// ─────────────────────────────────────────────────────────────────────────── locks

/** Stores a parameter lock on a step (hold a step, turn an encoder; manual: parameter-locks). */
export function setLock(pattern: Pattern, index: number, id: string, value: number): void {
	const step = pattern.steps[index];
	if (step) step.locks[id] = value;
}

/** Locks in a pattern. */
export function lockCount(pattern: Pattern): number {
	return pattern.steps.reduce((sum, step) => sum + Object.keys(step.locks).length, 0);
}

// ─────────────────────────────────────────────────────────────────────────── bar menu values

/**
 * The track groove's detents (bar + E3): 0 and 43 values each way up to ±99, as the device steps
 * through them. Ported from kmorrill/xy-format (MIT) xy/bar_menu_inspection.py,
 * TRACK_GROOVE_UI_SEQUENCE.
 */
const GROOVE_DETENTS = [
	2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28, 30, 32, 35, 37, 39, 42, 44, 46, 49, 51, 53, 56, 58,
	60, 63, 65, 67, 70, 72, 75, 77, 79, 82, 84, 86, 89, 91, 93, 96, 98, 99
] as const;

/** Every groove value in order, −99 … 0 … 99. */
export const GROOVE_VALUES: readonly number[] = [
	...[...GROOVE_DETENTS].reverse().map((v) => -v),
	0,
	...GROOVE_DETENTS
];

/** The groove `delta` detents away from `value`. */
export function stepGroove(value: number, delta: number): number {
	let at = 0;
	GROOVE_VALUES.forEach((v, i) => {
		if (Math.abs(v - value) < Math.abs(GROOVE_VALUES[at] - value)) at = i;
	});
	return GROOVE_VALUES[Math.max(0, Math.min(GROOVE_VALUES.length - 1, at + delta))];
}

// ─────────────────────────────────────────────────────────────────────────── time

/**
 * Where a track's playhead is without step components: `position` counts sixteenths since play;
 * each track moves one step per `scale` sixteenths and wraps at its pattern's length (a count-in's
 * negative positions wrap too). `sequencer-playback.ts` walks pulse, pulse hold and jump.
 */
export function stepAt(pattern: Pattern, position: number): number {
	const n = pattern.length;
	return ((Math.floor(position / pattern.scale) % n) + n) % n;
}
