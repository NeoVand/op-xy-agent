/**
 * The step keys' and keyboard's LEDs (called by the core's `buildLeds` for every state). The step
 * keys show the bar on the keys of the addressed track's pattern, and what the gesture in progress
 * needs (manual units in brackets):
 *
 * - the clear gesture fills the row red [clear-and-undo]; armed or counting in, step 1 flashes red
 *   [live-recording];
 * - bar menu: the steps inside the length dim, notes white [bars-and-length];
 * - step recording: the cursor red, recorded steps white [step-recording];
 * - one-sound view: only that note's steps [single-sound];
 * - shift: notes without components dim, steps with components white, selected steps flash
 *   [step-components];
 * - recording live: steps with notes red, white again after stop [live-recording];
 * - otherwise notes white, held steps white, and the playhead chasing: an empty step lights, a step
 *   with notes dims.
 *
 * The keyboard lights the keys held, or with a player on the notes it sounds (hold's kept notes,
 * maestro's chord, the arpeggio's note of the moment while playing) [players]; the notes of a held
 * step [step-entry] or of step recording's cursor; with shift and steps selected, the components
 * on them (white keys) and the chosen one's digit (black key); with the bar menu up, the track
 * scale's black key. Flashing follows the simulator clock (the app's page clock, which always
 * runs); the clock is read only while something flashes.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import type { KeyLedState } from '$lib/replica/state.svelte';
import type { LedMap } from '../types';
import type { SimState } from '../../params';
import {
	STEPS_PER_BAR,
	digitForScale,
	getComponent,
	hasComponents,
	hasNotes,
	STEP_COMPONENTS
} from '../../sequencer';
import { NATURALS, accidentalKey, componentsActive, presence } from './components';
import {
	BLINK_MS,
	CLEAR_MS,
	activePattern,
	barDown,
	heldSteps,
	liveRecording,
	noteKey,
	playingStep,
	seq,
	shownBar
} from './model';
import { playerNotes } from './players';

/** Sets the step keys' and keyboard's LEDs of `leds` for this state. */
export function sequencerLeds(s: SimState, leds: LedMap): void {
	stepLeds(s, leds);
	keyboardLeds(s, leds);
}

/**
 * Whether an LED is flashing or filling now (armed, counting in, steps selected with shift, the
 * clear gesture): the LEDs move with the simulator's clock while this is true, playing or not.
 */
export function flashing(s: SimState): boolean {
	const st = seq(s);
	return st.armed || st.countIn || st.clearClock !== null || (s.shift && st.selection.length > 0);
}

function stepLeds(s: SimState, leds: LedMap): void {
	const st = seq(s);
	const pattern = activePattern(s);
	const first = shownBar(s) * STEPS_PER_BAR;
	const head = playingStep(s, pattern);
	// read the clock only when an LED flashes: a still row costs nothing as time passes
	const blink = () => Math.floor(st.clock / BLINK_MS) % 2 === 0;
	const held = new Set(heldSteps(s));
	const selected = new Set(st.selection);
	const shiftLayer =
		componentsActive(s) ||
		(s.shift && (s.mode === 'instrument' || s.mode === 'auxiliary') && !barDown(s));
	const live = liveRecording(s);
	const countingIn = st.countIn && s.transport.playing && s.transport.position < 0;
	const fill =
		st.clearClock === null
			? 0
			: Math.max(
					1,
					Math.min(
						STEPS_PER_BAR,
						Math.ceil(((st.clock - st.clearClock) / CLEAR_MS) * STEPS_PER_BAR)
					)
				);
	for (let i = 0; i < STEPS_PER_BAR; i++) {
		const id = `step.${i + 1}` as KeyId;
		const index = first + i;
		const inside = index < pattern.length;
		const step = pattern.steps[index];
		const notes = inside && hasNotes(step);
		let led: KeyLedState;
		if (st.clearSince !== null) led = i < fill ? 'red' : notes ? 'white' : 'off';
		else if (st.armed || countingIn)
			led = i === 0 ? (blink() ? 'red' : 'off') : notes ? 'white' : 'off';
		else if (barDown(s)) led = index === head ? 'white' : notes ? 'white' : inside ? 'dim' : 'off';
		else if (st.cursor !== null) led = index === st.cursor ? 'red' : notes ? 'white' : 'off';
		else if (st.single) {
			const has = inside && step.notes.some((n) => n.note === st.single?.note);
			led = index === head ? (has ? 'dim' : 'white') : has ? 'white' : 'off';
		} else if (shiftLayer) {
			if (selected.has(index)) led = blink() ? 'white' : 'off';
			else led = inside && hasComponents(step) ? 'white' : notes ? 'dim' : 'off';
		} else if (live) led = index === head ? 'white' : notes ? 'red' : 'off';
		else if (held.has(index)) led = 'white';
		else if (index === head) led = notes ? 'dim' : 'white';
		else led = notes ? 'white' : 'off';
		leds[id] = led;
	}
}

function keyboardLeds(s: SimState, leds: LedMap): void {
	const st = seq(s);
	const pattern = activePattern(s);
	const lit = new Set<number>(); // keyboard keys (0–23)
	const notes = (list: readonly number[]) => {
		for (const n of list) {
			const key = noteKey(s, n);
			if (key >= 0) lit.add(key);
		}
	};
	const heldSet = heldSteps(s);
	if (componentsActive(s)) {
		presence(s).forEach((p, i) => {
			if (p !== 'none') lit.add(NATURALS[i]);
		});
		if (st.component !== null) {
			const kind = STEP_COMPONENTS[st.component].kind;
			const digits = new Set(
				st.selection.flatMap((i) => {
					const c = getComponent(pattern.steps[i], kind);
					return c ? [c.value] : [];
				})
			);
			if (digits.size === 1) lit.add(accidentalKey([...digits][0]));
		}
	} else if (barDown(s)) {
		const digit = digitForScale(pattern.scale);
		if (digit !== null) lit.add(accidentalKey(digit));
	} else if (heldSet.length > 0) {
		notes(pattern.steps[heldSet[0]].notes.map((n) => n.note));
	} else {
		if (st.cursor !== null) notes(pattern.steps[st.cursor].notes.map((n) => n.note));
		// a player on shows the notes it sounds (the arpeggio's one at a time); else the keys held
		const sounding = playerNotes(s);
		if (sounding) notes(sounding);
		else {
			KEYBOARD_NOTE_NAMES.forEach((name, i) => {
				if (s.held.includes(`keyboard.${name}`)) lit.add(i);
			});
		}
	}
	KEYBOARD_NOTE_NAMES.forEach((name, i) => {
		leds[`keyboard.${name}` as KeyId] = lit.has(i) ? 'white' : 'off';
	});
}
