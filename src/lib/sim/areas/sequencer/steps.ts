/**
 * The step keys and the keyboard (manual: sequencer/step-entry, extend-notes, copy-step, nudge,
 * single-sound, parameter-locks, rotate, transpose-sequence). The core's `#stepKey`,
 * `#stepReleased` and `#keyboardKey` call these:
 *
 * - An empty step gets the last note played when it comes up: or the copied step, or nothing when
 *   keys were played or a lock was turned while it was down (so locks can sit on empty steps, OS
 *   1.1.33). With keys held it gets their chord at once.
 * - A step with notes is cleared by a tap; held longer it is copied, and the next empty step
 *   pressed receives it.
 * - With a step held: keys add or take off notes, a later step stretches its notes ("full step",
 *   then "overlap"), `[-]` / `[+]` nudge them, encoders lock parameters.
 * - With keys held, a step with notes gets them added or taken off, and the step keys show where
 *   that note is (the one-sound view).
 * - `Tn + [-] / [+]` rotates the track, `shift + [-] / [+]` transposes it, plain `[-] / [+]` move the
 *   keyboard an octave.
 */
import type { AreaContext } from '../types';
import type { SimState } from '../../params';
import {
	canNudge,
	cloneStep,
	extendNotes,
	hasNotes,
	nudgeStep,
	pasteStep,
	rotatePattern,
	setLock,
	toggleNote,
	toggleStep,
	transposePattern
} from '../../sequencer';
import { auxLockTarget } from '../auxiliary/sim';
import { lockTarget, turnedValue } from './locks';
import {
	activeBank,
	activeIndex,
	activePattern,
	activeSequence,
	activeTrack,
	COPIED_POPUP_MS,
	COPY_MS,
	editHolds,
	fixedKeys,
	heldKeys,
	heldNotes,
	heldSteps,
	heldTrackKey,
	isDrumTrack,
	keyNote,
	LOCKING_MS,
	OCTAVE_POPUP_MS,
	octaveKey,
	OCTAVES,
	remember,
	seq,
	stepIndex,
	trackOctave
} from './model';
import { moveCursor } from './recording';
import type { StepHold } from './state';

/**
 * Remembers the sequence for undo at the first edit made while steps are held, so one undo takes
 * back the whole gesture (keys toggled, locks turned, nudges, extends).
 */
function rememberOnce(s: SimState): void {
	const st = seq(s);
	if (st.holdUndo) return;
	remember(s);
	st.holdUndo = true;
}

/** A step key (0–15) went down. */
export function stepPress(ctx: AreaContext, key: number): void {
	const s = ctx.state;
	const st = seq(s);
	const id = `step.${key + 1}`;
	const pattern = activePattern(s);
	const index = stepIndex(s, key);
	if (index >= pattern.length) return;
	const now = ctx.now();
	const hold = (notes: boolean, place: boolean, edited: boolean): StepHold => ({
		index,
		since: now,
		notes,
		place,
		edited,
		at: st.clock,
		copied: false
	});
	if (Object.keys(st.holds).length === 0) st.holdUndo = false;

	// a later step pressed while a step with notes is held: stretch its notes to here
	const from = Object.entries(st.holds)
		.filter(([other, h]) => other !== id && h.index < index && hasNotes(pattern.steps[h.index]))
		.map(([, h]) => h)
		.pop();
	if (from) {
		rememberOnce(s);
		extendNotes(pattern, from.index, index);
		from.edited = true;
		st.holds[id] = hold(false, false, true);
		return;
	}
	// a step with notes held while another goes down is being edited, not tapped
	for (const hold of Object.values(st.holds)) if (hold.notes) hold.edited = true;

	const step = pattern.steps[index];
	const keys = heldNotes(s);
	if (keys.length > 0) {
		rememberOnce(s);
		if (hasNotes(step)) for (const note of keys) toggleNote(pattern, index, note);
		else toggleStep(pattern, index, keys);
		if (keys.length === 1) st.single = { note: keys[0], key: heldKeys(s)[0] };
		st.holds[id] = hold(false, false, true);
		return;
	}
	const notes = hasNotes(step);
	st.holds[id] = hold(notes, !notes, false);
}

/**
 * A step with notes held past {@link COPY_MS} on the simulator's clock is copied there and then,
 * and the screen says "copied" while it is still down (research 59 §2.8: b1-633, 678, 708); called
 * as time passes. The release still copies a hold that long by the gesture clock.
 */
export function copyHeldSteps(s: SimState): void {
	const st = seq(s);
	const pattern = activePattern(s);
	for (const hold of Object.values(st.holds)) {
		if (hold.copied || !hold.notes || hold.edited || st.clock - hold.at < COPY_MS) continue;
		const step = pattern.steps[hold.index];
		if (!step || !hasNotes(step)) continue;
		hold.copied = true;
		st.clipboard = cloneStep(step);
		sayCopied(s);
	}
}

/**
 * "copied" over the top bar, on an instrument track's pages (ours: the auxiliary tracks' pages
 * show no step popups yet).
 */
function sayCopied(s: SimState): void {
	if (activeBank(s) === 'instrument') seq(s).copiedPopup = COPIED_POPUP_MS;
}

/** A step key (0–15) came up: a tap clears, a hold copies, an empty step gets its note. */
export function stepRelease(ctx: AreaContext, key: number): void {
	const s = ctx.state;
	const st = seq(s);
	const id = `step.${key + 1}`;
	const hold = st.holds[id];
	if (!hold) return;
	delete st.holds[id];
	if (hold.edited) return;
	const pattern = activePattern(s);
	const step = pattern.steps[hold.index];
	if (!step) return;
	if (hold.notes) {
		if (hold.copied) return;
		if (ctx.now() - hold.since >= COPY_MS) {
			st.clipboard = cloneStep(step);
			sayCopied(s);
			return;
		}
		remember(s);
		step.notes = [];
		return;
	}
	// notes that arrived meanwhile (a live take) stay: placing toggles, it would clear them
	if (hold.place && !hasNotes(step)) {
		remember(s);
		if (st.clipboard) pasteStep(pattern, hold.index, st.clipboard);
		else toggleStep(pattern, hold.index, [activeSequence(s).lastNote]);
	}
}

/**
 * A keyboard key (0–23) went down: with steps held it toggles its note on them; otherwise it is the
 * last note played (what the next step pressed gets), and a copied step is forgotten.
 */
export function keyboardPress(s: SimState, key: number): void {
	const note = keyNote(s, key);
	const held = heldSteps(s);
	if (held.length > 0) {
		const pattern = activePattern(s);
		rememberOnce(s);
		for (const index of held) toggleNote(pattern, index, note);
		editHolds(s);
		return;
	}
	activeSequence(s).lastNote = note;
	seq(s).clipboard = null;
}

/**
 * An encoder turned with steps held: each held step stores the parameter under that encoder as a
 * lock, starting from its own lock or the track's value (auxiliary tracks' pages included). Returns
 * false when the encoder locks nothing here (the turn then goes on as usual); either way the held
 * steps count as edited.
 */
export function lockTurn(s: SimState, e: number, delta: number, fine: boolean): boolean {
	const indexes = heldSteps(s);
	if (indexes.length === 0) return false;
	// a turn with steps held edits them: letting go of them neither clears nor places a note
	editHolds(s);
	const pattern = activePattern(s);
	if (activeBank(s) === 'auxiliary') {
		const aux = auxLockTarget(s, e);
		if (!aux) return false;
		rememberOnce(s);
		for (const index of indexes) {
			const from = pattern.steps[index].locks[aux.id] ?? aux.get(s);
			setLock(pattern, index, aux.id, Math.min(aux.max, Math.max(aux.min, from + delta)));
		}
		seq(s).lastLock = { step: indexes[0], id: aux.id };
		seq(s).locking = LOCKING_MS;
		return true;
	}
	const target = lockTarget(s, e);
	const track = activeTrack(s);
	if (!target || !track) return false;
	rememberOnce(s);
	for (const index of indexes) {
		const locks = pattern.steps[index].locks;
		setLock(pattern, index, target.id, turnedValue(target, track, locks, delta, fine));
	}
	seq(s).lastLock = { step: indexes[0], id: target.id };
	// the held step's box turns orange while the lock is being written (research 59 §2.8)
	seq(s).locking = LOCKING_MS;
	return true;
}

/** A nudge key held this long starts repeating (ms; ours). */
export const NUDGE_REPEAT_MS = 400;
/** The repeats start this far apart and close in to the second (ms; ours). */
const NUDGE_SLOW_MS = 80;
const NUDGE_FAST_MS = 20;

/**
 * Repeats a nudge while its [-] / [+] and the steps stay down, faster the longer they are held
 * (manual: sequencer/nudge); called as time passes.
 */
export function repeatNudge(s: SimState): void {
	const st = seq(s);
	const n = st.nudge;
	if (!n) return;
	const held = heldSteps(s);
	const pattern = activePattern(s);
	if (!s.held.includes(n.direction > 0 ? 'key.plus' : 'key.minus') || held.length === 0) {
		st.nudge = null;
		return;
	}
	while (st.clock >= n.next && canNudge(pattern)) {
		for (const index of held) nudgeStep(pattern, index, n.direction);
		n.repeats++;
		n.next += Math.max(NUDGE_FAST_MS, NUDGE_SLOW_MS - 10 * n.repeats);
	}
}

/**
 * `[-]` / `[+]` (bar menu aside): step recording's cursor, a nudge of the held steps, a rotation of
 * the held track, a transposition with shift (instrument tracks: an octave, or a semitone on drums),
 * or the keyboard's octave. Returns true when handled.
 */
export function plusMinus(s: SimState, direction: -1 | 1): boolean {
	const st = seq(s);
	if (s.held.includes('key.record') && st.cursor !== null) {
		moveCursor(s, direction);
		return true;
	}
	const pattern = activePattern(s);
	const held = heldSteps(s);
	if (held.length > 0) {
		if (canNudge(pattern)) {
			rememberOnce(s);
			for (const index of held) nudgeStep(pattern, index, direction);
			st.nudge = { direction, next: st.clock + NUDGE_REPEAT_MS, repeats: 0 };
		}
		editHolds(s);
		return true;
	}
	if (heldTrackKey(s)) {
		remember(s);
		rotatePattern(pattern, direction);
		return true;
	}
	if (s.shift) {
		if (s.mode !== 'instrument') return false;
		remember(s);
		transposePattern(pattern, direction * (isDrumTrack(s) ? 1 : 12));
		return true;
	}
	const key = octaveKey(activeBank(s), activeIndex(s));
	st.octaves[key] = Math.max(OCTAVES.min, Math.min(OCTAVES.max, trackOctave(s) + direction));
	// the octave popup (research 59 §2.12), at the ends of the range too (ours). Seen over an
	// instrument page; the drum and punch-in keys do not move (ours: no popup), and the auxiliary
	// tracks put it in their own pages (the external CV page's meter card; not drawn yet)
	if (activeBank(s) === 'instrument' && !fixedKeys(s)) st.octavePopup = OCTAVE_POPUP_MS;
	return true;
}
