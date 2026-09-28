/**
 * The bar menu (manual: sequencer/bar-menu, bars-and-length, track-scale, clear-and-undo): shown
 * while `bar` is held, or pinned with `shift + bar` until `bar` is pressed again. Its encoders set
 * quantisation (click: on/off), the length of step-entered notes, the track's groove and the
 * smoothing between locks; with it up, `[+]` / `[-]` add and remove bars (`shift + [+]`
 * duplicates), a step key sets the length, a black key the track scale, and `M1` / `M2` / `M4`
 * clear notes, locks or both. Tapping `bar` moves the step keys to the next bar.
 *
 * The device shows it as a card over the page it covers (research 59 §2.8): the card appears at
 * once, its clear labels slide up from below, and when it goes it fades out over the page.
 */
import type { AreaContext } from '../types';
import { two, type SimState } from '../../params';
import { buildFrame } from '../../frames';
import {
	STEPS_PER_BAR,
	addBar,
	applyNoteLength,
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
import type { BarFrame, RollNote } from './frames';
import {
	BAR_FADE_MS,
	BAR_SLIDE_MS,
	TAP_MS,
	activePattern,
	activeSequence,
	editHolds,
	keyboardIndex,
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
	if (s.overlay !== 'bar') {
		st.barReturn = { overlay: s.overlay, sub: s.sub, picker: s.picker };
		st.barSlide = BAR_SLIDE_MS;
	}
	st.barFade = 0;
	// a step held meanwhile is part of another gesture now: its release must not clear or place
	editHolds(s);
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

/** Back to the page shown before `bar`, with the card fading out over it. */
function closeBar(s: SimState): void {
	const st = seq(s);
	const back = st.barReturn;
	s.overlay = back?.overlay ?? null;
	s.sub = back?.sub ?? null;
	s.picker = back?.picker ?? null;
	st.barReturn = null;
	st.barSlide = 0;
	st.barFade = BAR_FADE_MS;
}

/** Whether the bar card is fading out over the page after it went. */
export const barFading = (s: SimState) => s.overlay !== 'bar' && seq(s).barFade > 0;

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
			// the step-entered notes already there take the new length too
			pattern.noteLength = clamp(Math.round(pattern.noteLength * 100) + delta, 1, 100) / 100;
			applyNoteLength(pattern);
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

/**
 * The groove as the card shows it: "-" for none, then signed ("+16", as seen; "-16" going the other
 * way is ours).
 */
const grooveText = (v: number) => (v === 0 ? '-' : `${v < 0 ? '-' : '+'}${two(Math.abs(v))}`);
/** Quantise and note length as the card shows them ("96", "50", "100"). */
const percentText = (v: number) => (v >= 100 ? '100' : two(v));

/**
 * The page under the card: the one `bar` covered while the card is up, the page now while it
 * fades; the sequencer's own passing popups left out.
 */
function coveredPage(s: SimState): SimState {
	const st = seq(s);
	const back = s.overlay === 'bar' ? st.barReturn : null;
	return {
		...s,
		overlay: s.overlay === 'bar' ? (back?.overlay ?? null) : s.overlay,
		sub: s.overlay === 'bar' ? (back?.sub ?? null) : s.sub,
		picker: s.overlay === 'bar' ? (back?.picker ?? null) : s.picker,
		areas: {
			...s.areas,
			sequencer: { ...st, barFade: 0, barSlide: 0, octavePopup: 0, copiedPopup: 0 }
		}
	};
}

/**
 * The bar card (research 59 §2.8), up or, after it went, fading out: the notes of the bar the step
 * keys show go in its piano roll, those of steps that play (ours: a trimmed bar's silent steps are
 * left out).
 */
export function barFrame(s: SimState): BarFrame {
	const st = seq(s);
	const pattern = activePattern(s);
	const shown = shownBar(s);
	const notes: RollNote[] = [];
	for (let i = 0; i < STEPS_PER_BAR; i++) {
		const index = shown * STEPS_PER_BAR + i;
		if (index >= pattern.length) break;
		for (const n of pattern.steps[index].notes) {
			notes.push({ at: i + n.offset, length: n.length, note: n.note });
		}
	}
	return {
		page: 'bar',
		base: buildFrame(coveredPage(s)),
		header: [
			{ label: 'quant', value: pattern.quantiseOn ? percentText(pattern.quantise) : 'off' },
			{ label: 'length', value: percentText(Math.round(pattern.noteLength * 100)) },
			{ label: 'groove', value: grooveText(pattern.groove) },
			{ label: 'shape', value: two(pattern.smoothing) }
		],
		smoothing: pattern.smoothing / 99,
		bars: pattern.bars,
		shown,
		notes,
		length: pattern.length,
		scale: formatScale(pattern.scale),
		pinned: st.barPinned,
		soft: [{ text: 'clr notes' }, { text: 'clr params' }, null, { text: 'clr all' }],
		slide: 1 - Math.min(1, Math.max(0, st.barSlide / BAR_SLIDE_MS)),
		going: s.overlay !== 'bar',
		fade: s.overlay === 'bar' ? 1 : Math.min(1, Math.max(0, st.barFade / BAR_FADE_MS))
	};
}
