/**
 * The bar menu (manual: sequencer/bar-menu, bars-and-length, track-scale, clear-and-undo): shown
 * while `bar` is held, or pinned with `shift + bar` until `bar` is pressed again. Its encoders set
 * quantisation (click: on/off), the length of step-entered notes, the track's groove and the
 * smoothing between locks; with it up, `[+]` / `[-]` add and remove bars (`shift + [+]`
 * duplicates), a step key sets the length, a black key the track scale, and `M1` / `M2` / `M4`
 * clear notes, locks or both. Tapping `bar` moves the step keys to the next bar.
 */
import type { AreaContext } from '../types';
import { two, type SimState } from '../../params';
import {
	MAX_BARS,
	STEPS_PER_BAR,
	addBar,
	clearAll,
	clearLocks,
	clearNotes,
	duplicateBars,
	formatScale,
	removeBar,
	scaleForDigit,
	setLastBarLength,
	stepGroove,
	currentPattern
} from '../../sequencer';
import { accidentalDigit } from './components';
import type { BarCell, BarFrame } from './frames';
import {
	TAP_MS,
	activePattern,
	activeSequence,
	keyboardIndex,
	playingStep,
	remember,
	seq,
	shownBar
} from './model';

/** `bar` went down: the bar page comes up (pinned with shift); `bar` again unpins it. */
export function barPress(ctx: AreaContext): void {
	const s = ctx.state;
	const st = seq(s);
	if (s.overlay === 'bar' && st.barPinned) {
		st.barPinned = false;
		closeBar(s);
		st.barUsed = true;
		return;
	}
	if (s.overlay !== 'bar') st.barReturn = { overlay: s.overlay, sub: s.sub, picker: s.picker };
	// a step held meanwhile is part of another gesture now: its release must not clear or place
	for (const hold of Object.values(st.holds)) {
		hold.edited = true;
		hold.place = false;
	}
	s.overlay = 'bar';
	s.sub = null;
	s.picker = null;
	st.barSince = ctx.now();
	st.barUsed = false;
	if (s.shift) {
		st.barPinned = true;
		st.barUsed = true;
	}
}

/** `bar` came up: the page goes (unless pinned); a tap moves the step keys to the next bar. */
export function barRelease(ctx: AreaContext): void {
	const s = ctx.state;
	const st = seq(s);
	if (st.barPinned || s.overlay !== 'bar') return;
	const tap = !st.barUsed && ctx.now() - st.barSince < TAP_MS;
	closeBar(s);
	if (tap) switchBar(s);
}

/** Back to the page shown before `bar`. */
function closeBar(s: SimState): void {
	const st = seq(s);
	const back = st.barReturn;
	s.overlay = back?.overlay ?? null;
	s.sub = back?.sub ?? null;
	s.picker = back?.picker ?? null;
	st.barReturn = null;
}

/**
 * The step keys move on to the next bar; picked during playback, it stays on the keys instead of
 * following the playhead.
 */
export function switchBar(s: SimState): void {
	const sequence = activeSequence(s);
	const pattern = currentPattern(sequence);
	if (pattern.bars <= 1) return;
	sequence.page = (shownBar(s) + 1) % pattern.bars;
	if (s.transport.playing) seq(s).pagePinned = true;
}

/**
 * A key pressed while the bar page is up. Returns true when it is the bar menu's (the rest go on to
 * the core: track keys, mode keys, transport).
 */
export function barCombo(s: SimState, id: string): boolean {
	const st = seq(s);
	const sequence = activeSequence(s);
	const pattern = currentPattern(sequence);
	const done = () => {
		st.barUsed = true;
		sequence.page = Math.min(sequence.page, pattern.bars - 1);
		return true;
	};
	const step = /^step\.(\d+)$/.exec(id);
	if (step) {
		remember(s);
		setLastBarLength(pattern, Number(step[1]));
		return done();
	}
	switch (id) {
		case 'key.plus':
			remember(s);
			if (s.shift) duplicateBars(pattern, shownBar(s));
			else addBar(pattern);
			return done();
		case 'key.minus':
			remember(s);
			removeBar(pattern);
			return done();
		case 'key.m1':
			remember(s);
			clearNotes(pattern);
			return done();
		case 'key.m2':
			remember(s);
			clearLocks(pattern);
			return done();
		case 'key.m4':
			remember(s);
			clearAll(pattern);
			return done();
		case 'key.m3':
			return done();
	}
	if (id.startsWith('keyboard.')) {
		const digit = accidentalDigit(keyboardIndex(id.slice('keyboard.'.length)));
		if (digit !== null) {
			remember(s);
			pattern.scale = scaleForDigit(digit);
		}
		return done();
	}
	return false;
}

/** E1–E4 on the bar page: quantise, note length, groove, shape. */
export function barTurn(s: SimState, e: number, delta: number): void {
	const pattern = activePattern(s);
	seq(s).barUsed = true;
	const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
	switch (e) {
		case 0:
			pattern.quantise = clamp(pattern.quantise + delta, 0, 100);
			break;
		case 1:
			pattern.noteLength = clamp(Math.round(pattern.noteLength * 100) + delta, 1, 100) / 100;
			break;
		case 2:
			pattern.groove = stepGroove(pattern.groove, delta);
			break;
		default:
			pattern.smoothing = clamp(pattern.smoothing + delta, 0, 99);
	}
}

/** A click on the bar page: E1 switches quantisation on and off (OS 1.1.15; the encoder is assumed). */
export function barClick(s: SimState, e: number): void {
	seq(s).barUsed = true;
	if (e === 0) {
		const pattern = activePattern(s);
		pattern.quantiseOn = !pattern.quantiseOn;
	}
}

/** The groove as the header shows it ("00", "42", "–42"). */
const grooveText = (v: number) => (v < 0 ? `–${two(-v)}` : two(v));
/** The note length as the header shows it ("50", "100"). */
const lengthText = (v: number) => (v >= 100 ? '100' : two(v));

/** The bar page. */
export function barFrame(s: SimState): BarFrame {
	const pattern = activePattern(s);
	const head = playingStep(s, pattern);
	const cells: BarCell[][] = Array.from({ length: MAX_BARS }, (_, bar) =>
		Array.from({ length: STEPS_PER_BAR }, (_, i) => {
			const index = bar * STEPS_PER_BAR + i;
			if (bar >= pattern.bars) return 'none';
			if (index >= pattern.length) return 'trimmed';
			return pattern.steps[index].notes.length > 0 ? 'note' : 'empty';
		})
	);
	return {
		page: 'bar',
		header: [
			{ label: 'quantise', value: pattern.quantiseOn ? String(pattern.quantise) : 'off' },
			{ label: 'length', value: lengthText(Math.round(pattern.noteLength * 100)) },
			{ label: 'groove', value: grooveText(pattern.groove) },
			{ label: 'shape', value: two(pattern.smoothing) }
		],
		cells,
		shown: shownBar(s),
		playhead: head >= 0 ? head : null,
		bars: pattern.bars,
		length: pattern.length,
		scale: formatScale(pattern.scale),
		pinned: seq(s).barPinned,
		soft: [{ text: 'notes' }, { text: 'params' }, null, { text: 'all' }]
	};
}
