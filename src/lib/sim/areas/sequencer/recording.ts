/**
 * Recording (manual: sequencer/live-recording, step-recording, single-sound, clear-and-undo):
 *
 * - live: `record + play` while stopped arms recording (step 1 flashes red) and the first note
 *   starts playback and recording together; `record + play → play` counts in a bar first; during
 *   playback, holding `record` records until it comes up and `record + play` latches it. Notes land
 *   on the nearest step with the rest as their offset, last as long as their key was held, and turn
 *   their steps red until stop; encoder turns store locks on the step that plays (automation).
 * - step recording: `record` held with playback stopped puts a red cursor on the first step of the
 *   bar shown; each key (or chord) fills the cursor step, which moves on when the keys come up;
 *   `record + [+]` / `[-]` move it, `record + step` clears a step.
 * - `key + record`: the step keys show only that note's steps while the key stays down.
 * - `record + hold stop`: the step row fills red and the track's pattern is cleared.
 * - `shift + record`: undo (one level).
 */
import type { AreaContext } from '../types';
import type { SimState } from '../../params';
import { clearAll, recordNote, setLock, STEPS_PER_BAR, type Pattern } from '../../sequencer';
import { auxLockTarget } from '../auxiliary/sim';
import { lockTarget, turnedValue } from './locks';
import {
	activeBank,
	activePattern,
	activeSequence,
	activeTrack,
	CLEAR_MS,
	heldKeys,
	keyboardIndex,
	keyNote,
	liveRecording,
	playingStep,
	remember,
	seq,
	shownBar,
	undo
} from './model';
import { releasePlayers } from './players';

/** Steps of the count-in before a take (one bar of four beats, in sixteenths; ours). */
export const COUNT_IN = 16;

/** Where the playhead is in steps of `pattern` (sixteenths over the track scale). */
const playhead = (s: SimState, pattern: Pattern) => s.transport.position / pattern.scale;

/** Gives the notes still being recorded the length they have reached. */
export function finishTakes(s: SimState): void {
	const st = seq(s);
	const pattern = activePattern(s);
	const now = playhead(s, pattern);
	for (const take of Object.values(st.takes)) {
		const n = pattern.steps[take.index]?.notes.find((x) => x.note === take.note);
		if (n) n.length = Math.max(0.05, Math.round((now - take.start) * 100) / 100);
	}
	st.takes = {};
}

/** Every recording state ends (stop, or the transport stopped under us). */
export function endRecording(s: SimState): void {
	const st = seq(s);
	finishTakes(s);
	st.recLatch = false;
	st.armed = false;
	st.countIn = false;
}

/** `record + stop` held long enough clears the pattern (checked whenever something happens). */
export function checkClear(ctx: AreaContext): void {
	const st = seq(ctx.state);
	if (st.clearSince === null || ctx.now() - st.clearSince < CLEAR_MS) return;
	clearTrack(ctx.state);
}

/** Clears the addressed track's pattern: notes, components and locks (manual: clear-and-undo). */
export function clearTrack(s: SimState): void {
	const st = seq(s);
	remember(s);
	clearAll(activePattern(s));
	st.clearSince = null;
	st.clearClock = null;
}

/** `record` went down. Returns true when it is the sequencer's. */
export function recordPress(ctx: AreaContext): boolean {
	const s = ctx.state;
	const st = seq(s);
	if (s.shift) {
		undo(s);
		return true;
	}
	if (st.armed) {
		st.armed = false;
		return true;
	}
	const keys = heldKeys(s);
	if (keys.length > 0 && !liveRecording(s)) {
		// a key held, then record: the one-sound view
		const key = keys[keys.length - 1];
		st.single = { note: keyNote(s, keyboardIndex(key.slice('keyboard.'.length))), key };
		return true;
	}
	if (s.transport.playing) {
		if (st.recLatch) {
			// a tap while latched stops recording (ours)
			finishTakes(s);
			st.recLatch = false;
		} else remember(s);
		return true;
	}
	remember(s);
	st.cursor = shownBar(s) * STEPS_PER_BAR;
	st.cursorFilled = false;
	return true;
}

/** `record` came up: overdubbing and step recording end; so does a clear not held long enough. */
export function recordRelease(ctx: AreaContext): void {
	const s = ctx.state;
	const st = seq(s);
	checkClear(ctx);
	st.clearSince = null;
	st.clearClock = null;
	st.cursor = null;
	st.cursorFilled = false;
	if (!st.recLatch && !st.countIn) finishTakes(s);
}

/** Starts the count-in: playback runs a bar ahead of the pattern, then records. */
function startCountIn(s: SimState): void {
	const st = seq(s);
	remember(s);
	st.armed = false;
	st.cursor = null;
	st.countIn = true;
	s.transport.playing = true;
	s.transport.position = -COUNT_IN;
}

/** `play` went down. Returns true when it is a recording gesture (else the core plays). */
export function playPress(ctx: AreaContext): boolean {
	const s = ctx.state;
	const st = seq(s);
	if (s.held.includes('key.record')) {
		if (s.transport.playing) {
			if (!st.recLatch) remember(s);
			st.recLatch = true;
		} else if (st.armed) startCountIn(s);
		else {
			st.armed = true;
			st.cursor = null;
		}
		return true;
	}
	if (st.armed) {
		startCountIn(s);
		return true;
	}
	return false;
}

/** `stop` went down: with `record` held it starts the clear gesture, else recording ends. */
export function stopPress(ctx: AreaContext, sequencing: boolean): boolean {
	const s = ctx.state;
	const st = seq(s);
	if (sequencing && s.held.includes('key.record')) {
		st.clearSince = ctx.now();
		st.clearClock = st.clock;
		return true;
	}
	endRecording(s);
	st.pagePinned = false;
	releasePlayers(s);
	return false;
}

/** `stop` came up: the clear gesture ends (clearing when it was held long enough). */
export function stopRelease(ctx: AreaContext): void {
	const st = seq(ctx.state);
	checkClear(ctx);
	st.clearSince = null;
	st.clearClock = null;
}

/**
 * A keyboard key while recording: step recording fills the cursor step (a new note replaces what
 * was there, more keys held add to it); armed, the first note starts playback; live, the note goes
 * on the nearest step. Never consumes the key: the core still takes it as the last note played.
 */
export function recordKey(s: SimState, id: string, key: number): void {
	const st = seq(s);
	const note = keyNote(s, key);
	const pattern = activePattern(s);
	if (st.cursor !== null) {
		const step = pattern.steps[st.cursor];
		if (!st.cursorFilled) step.notes = [];
		if (!step.notes.some((n) => n.note === note)) {
			step.notes.push({ note, velocity: 100, length: pattern.noteLength, offset: 0 });
		}
		st.cursorFilled = true;
		return;
	}
	if (st.armed) {
		st.armed = false;
		st.recLatch = true;
		remember(s);
		s.transport.playing = true;
		s.transport.position = 0;
	}
	if (!liveRecording(s)) return;
	const start = playhead(s, pattern);
	const at = recordNote(pattern, start, note, 100, pattern.noteLength);
	if (at) st.takes[id] = { index: at.index, note, start };
}

/** A keyboard key came up: its take gets its length; step recording's cursor moves on. */
export function recordKeyRelease(s: SimState, id: string): void {
	const st = seq(s);
	const pattern = activePattern(s);
	const take = st.takes[id];
	if (take) {
		const n = pattern.steps[take.index]?.notes.find((x) => x.note === take.note);
		if (n) n.length = Math.max(0.05, Math.round((playhead(s, pattern) - take.start) * 100) / 100);
		delete st.takes[id];
	}
	if (st.cursor !== null && st.cursorFilled && heldKeys(s).length === 0) {
		st.cursor = (st.cursor + 1) % pattern.length;
		st.cursorFilled = false;
		activeSequence(s).page = Math.floor(st.cursor / STEPS_PER_BAR);
	}
	if (st.single?.key === id) st.single = null;
}

/** `record + [+]` / `[-]` while step recording: the cursor moves (a rest, or back one). */
export function moveCursor(s: SimState, direction: -1 | 1): void {
	const st = seq(s);
	if (st.cursor === null) return;
	const length = activePattern(s).length;
	st.cursor = (st.cursor + direction + length) % length;
	st.cursorFilled = false;
	activeSequence(s).page = Math.floor(st.cursor / STEPS_PER_BAR);
}

/** `record + step` while step recording: the step is cleared (manual: "tap it to remove it"). */
export function clearRecordedStep(s: SimState, index: number): void {
	const pattern = activePattern(s);
	if (index >= pattern.length) return;
	pattern.steps[index].notes = [];
}

/**
 * An encoder turned while recording live: the step that plays stores the new value as a lock (the
 * core still turns the track's own value; manual: live-recording "automation").
 */
export function recordTurn(s: SimState, e: number, delta: number, fine: boolean): void {
	const pattern = activePattern(s);
	const index = playingStep(s, pattern);
	if (index < 0) return;
	if (activeBank(s) === 'auxiliary') {
		// the aux page turns as usual; the playing step keeps where the value lands
		const aux = auxLockTarget(s, e);
		if (aux)
			setLock(pattern, index, aux.id, Math.min(aux.max, Math.max(aux.min, aux.get(s) + delta)));
		return;
	}
	const target = lockTarget(s, e);
	const track = activeTrack(s);
	if (!target || !track) return;
	setLock(pattern, index, target.id, turnedValue(target, track, {}, delta, fine));
}
