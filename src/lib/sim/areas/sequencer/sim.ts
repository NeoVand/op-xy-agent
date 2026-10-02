/**
 * The sequencer area (manual sequencer/*, players/*): the bar menu while `bar` is held or pinned,
 * the player page, the step component page while shift is held with steps selected, a held
 * step's values on the instrument pages (parameter locks), and the popups that come and go over
 * any page (the octave after [-] / [+], "copied"; research 59 §2.8, §2.12). Its `claim` sees
 * every input first and takes the gestures that start anywhere: `bar`, `player`, the bar menu's
 * combinations, shift + steps and keys, recording (`record`, `play`, `stop`), `[-]` / `[+]`, and
 * encoder turns with a step held or while recording. Plain step and keyboard presses stay with
 * the core, which calls `steps.ts`; the LEDs are `leds.ts`, called by the core's `buildLeds`.
 */
import type { AreaContext, SimArea } from '../types';
import type { SimInput } from '../../input';
import type { SimState } from '../../params';
import { buildFrame } from '../../frames';
import { barClick, barCombo, barFading, barFrame, barPress, barRelease, barTurn } from './bar';
import {
	componentKey,
	componentsActive,
	componentsFrame,
	endComponents,
	selectStep
} from './components';
import type { LockFrame, PopupFrame } from './frames';
import { lockLabel, lockParam, lockedSample, lockedTrack } from './locks';
import {
	CLEAR_MS,
	POPUP_FADE_MS,
	activeBank,
	activePattern,
	barDown,
	editHolds,
	heldKeys,
	heldSteps,
	keyNote,
	keyboardIndex,
	liveRecording,
	recordingAny,
	seq,
	sequencing,
	stepIndex,
	syncRecordingFlag,
	trackOctave
} from './model';
import { playerClick, playerFrame, playerKey, playerPress, playerTurn } from './players';
import {
	checkClear,
	clearRecordedStep,
	clearTrack,
	endRecording,
	playPress,
	recordKey,
	recordKeyRelease,
	recordPress,
	recordRelease,
	recordTurn,
	stopPress,
	stopRelease
} from './recording';
import { copyHeldSteps, lockTurn, plusMinus, repeatNudge } from './steps';

const encoderIndex = (id: string) => {
	const m = /^encoder\.([1-4])$/.exec(id);
	return m ? Number(m[1]) - 1 : -1;
};

/** Whether a held step's values are on screen: a step held on an instrument track's page. */
export function lockView(s: SimState): boolean {
	return (
		s.mode === 'instrument' &&
		activeBank(s) === 'instrument' &&
		s.overlay === null &&
		s.sub === null &&
		s.picker === null &&
		heldSteps(s).length > 0 &&
		!componentsActive(s)
	);
}

/** The instrument page as it plays on the held step, and the step's number over it. */
function lockFrame(s: SimState): LockFrame {
	const st = seq(s);
	const index = heldSteps(s)[0];
	const step = activePattern(s).steps[index];
	const track = s.tracks[s.track];
	const view: SimState = {
		...s,
		held: s.held.filter((id) => !id.startsWith('step.')),
		tracks: s.tracks.map((t, i) => (i === s.track ? lockedTrack(t, step.locks) : t)),
		// the synth sampler's region is the sample area's
		areas: { ...s.areas, sample: lockedSample(s.areas.sample, s.track, step.locks) }
	};
	const last = st.lastLock?.step === index ? lockParam(st.lastLock.id) : null;
	return {
		page: 'lock',
		base: buildFrame(view),
		step: index + 1,
		locking: st.locking > 0,
		locks: Object.keys(step.locks).length,
		last:
			last && step.locks[last.id] !== undefined
				? { label: lockLabel(last.id, track), value: last.format(step.locks[last.id]) }
				: null
	};
}

/** Whether a popup is up (the octave after [-] / [+], or "copied"). */
export function popupShowing(s: SimState): boolean {
	const st = seq(s);
	return st.octavePopup > 0 || st.copiedPopup > 0;
}

/** The popups over the page under them, each fading out over its last moments. */
function popupFrame(s: SimState): PopupFrame {
	const st = seq(s);
	const quiet: SimState = {
		...s,
		areas: { ...s.areas, sequencer: { ...st, octavePopup: 0, copiedPopup: 0 } }
	};
	const alpha = (left: number) => Math.min(1, left / POPUP_FADE_MS);
	return {
		page: 'popup',
		base: buildFrame(quiet),
		octave: st.octavePopup > 0 ? { value: trackOctave(s), alpha: alpha(st.octavePopup) } : null,
		copied: st.copiedPopup > 0 ? { alpha: alpha(st.copiedPopup) } : null
	};
}

/**
 * The popups and the fading bar card go as soon as anything else happens (ours: the captures show
 * them only timing out), so the page under them takes the input: any turn, click or press but
 * [-] / [+] (which bring the octave up again). Releases leave them.
 */
function endPassing(s: SimState, input: SimInput): void {
	const keep =
		input.type === 'release' ||
		input.type === 'bend' ||
		(input.type === 'press' && (input.id === 'key.plus' || input.id === 'key.minus'));
	if (keep) return;
	const st = seq(s);
	st.octavePopup = 0;
	st.copiedPopup = 0;
	st.barFade = 0;
}

/** The core's encoder clicks on instrument pages, while a held step's values are on screen. */
function lockClick(s: SimState, e: number): void {
	const t = s.tracks[s.track];
	if (s.pages.instrument === 2 && !s.shift) t.envelope = t.envelope === 'amp' ? 'filter' : 'amp';
	else if (s.pages.instrument === 4) {
		if (t.lfo.type === 'duck' && e === 0) t.lfo.sourceAudio = !t.lfo.sourceAudio;
		else if (e === 3 && t.lfo.type !== 'tremolo' && t.lfo.type !== 'duck') {
			t.lfo.parameter = (t.lfo.parameter + 1) % 4;
		}
	}
}

function claimPress(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	const st = seq(s);
	if (id === 'key.bar') {
		barPress(ctx);
		return true;
	}
	if (id === 'key.player') {
		playerPress(s);
		return true;
	}
	if (id === 'key.shift') {
		st.chordFresh = true;
		// a step held first then shift: a lock on the shift layer, never a tap
		editHolds(s);
		if (!barDown(s)) endComponents(s);
		return false;
	}
	if (barDown(s) && barCombo(s, id)) return true;
	const inside = sequencing(s);
	if (id === 'key.stop') return stopPress(ctx, inside);
	if (!inside) return false;
	switch (id) {
		case 'key.record':
			return recordPress(ctx);
		case 'key.play':
			return playPress(ctx);
		case 'key.minus':
		case 'key.plus':
			return plusMinus(s, id === 'key.plus' ? 1 : -1);
	}
	const step = /^step\.(\d+)$/.exec(id);
	if (step) {
		const index = stepIndex(s, Number(step[1]) - 1);
		if (s.shift) {
			selectStep(s, index);
			return true;
		}
		if (s.held.includes('key.record') && !s.transport.playing) {
			clearRecordedStep(s, index);
			return true;
		}
		return false;
	}
	if (id.startsWith('keyboard.')) {
		const key = keyboardIndex(id.slice('keyboard.'.length));
		if (key < 0) return false;
		if (componentsActive(s)) {
			componentKey(s, key);
			return true;
		}
		const before = heldKeys(s)
			.filter((other) => other !== id)
			.map((other) => keyNote(s, keyboardIndex(other.slice('keyboard.'.length))));
		if (playerKey(s, keyNote(s, key), before)) return true;
		// a key with shift held is never a note: a component, maestro's chord, the punch-in shortcut
		if (!s.shift) recordKey(s, id, key);
		return false;
	}
	// another track: a copied step stays with the one it came from, and so do a player's kept
	// notes (ours; a held arpeggio's also go when its pattern changes, OS 1.1.21: arrange's
	// playPattern); steps held belong to the track they were pressed on
	if (/^track\.[1-8]$/.test(id)) {
		st.clipboard = null;
		st.sustained = [];
		editHolds(s);
	}
	return false;
}

function claimRelease(ctx: AreaContext, id: string): boolean {
	const s = ctx.state;
	switch (id) {
		case 'key.bar':
			barRelease(ctx);
			return true;
		case 'key.player':
			return true;
		case 'key.shift':
			seq(s).chordFresh = true;
			seq(s).playerList = false;
			endComponents(s);
			return false;
		case 'key.record':
			recordRelease(ctx);
			return false;
		case 'key.stop':
			stopRelease(ctx);
			return false;
	}
	if (id.startsWith('keyboard.')) recordKeyRelease(s, id);
	return false;
}

function claimTurn(ctx: AreaContext, id: string, raw: number, fine: boolean): boolean {
	const s = ctx.state;
	const e = encoderIndex(id);
	const delta = Math.trunc(raw);
	if (e < 0 || delta === 0 || s.overlay === 'bar' || s.overlay === 'players') return false;
	if (heldSteps(s).length > 0 && !componentsActive(s)) return lockTurn(s, e, delta, fine);
	if (liveRecording(s)) recordTurn(s, e, delta, fine);
	return false;
}

export const sequencer: SimArea = {
	id: 'sequencer',
	owns: (s) =>
		s.overlay === 'bar' ||
		s.overlay === 'players' ||
		componentsActive(s) ||
		lockView(s) ||
		barFading(s) ||
		popupShowing(s),
	frame: (s) => {
		if (popupShowing(s)) return popupFrame(s);
		if (s.overlay === 'bar' || barFading(s)) return barFrame(s);
		if (s.overlay === 'players') return playerFrame(s);
		if (componentsActive(s)) return componentsFrame(s);
		return lockFrame(s);
	},
	claim(ctx: AreaContext, input: SimInput): boolean {
		const s = ctx.state;
		const st = seq(s);
		endPassing(s, input);
		// tidy up what other keys or a following device changed under the gestures
		if (st.barPinned && s.overlay !== 'bar') st.barPinned = false;
		if (!s.transport.playing && (st.recLatch || st.countIn)) endRecording(s);
		checkClear(ctx);
		let consumed = false;
		if (input.type === 'press') consumed = claimPress(ctx, input.id);
		else if (input.type === 'release') consumed = claimRelease(ctx, input.id);
		else if (input.type === 'turn') consumed = claimTurn(ctx, input.id, input.delta, !!input.fine);
		if (sequencing(s) || recordingAny(s) || s.transport.recording) syncRecordingFlag(s);
		return consumed;
	},
	turn(ctx: AreaContext, e: number, delta: number): void {
		const s = ctx.state;
		if (s.overlay === 'bar') barTurn(s, e, delta);
		else if (s.overlay === 'players') playerTurn(s, e, delta);
	},
	click(ctx: AreaContext, e: number): void {
		const s = ctx.state;
		if (s.overlay === 'bar') barClick(s, e);
		else if (s.overlay === 'players') playerClick(s, e);
		else if (lockView(s)) lockClick(s, e);
	},
	advance(s: SimState, ms: number): void {
		const st = seq(s);
		st.clock += ms;
		// the screen's passing parts run down (a save from before them has none: `> 0` is false)
		if (st.octavePopup > 0) st.octavePopup = Math.max(0, st.octavePopup - ms);
		if (st.copiedPopup > 0) st.copiedPopup = Math.max(0, st.copiedPopup - ms);
		if (st.barFade > 0) st.barFade = Math.max(0, st.barFade - ms);
		if (st.barSlide > 0) st.barSlide = Math.max(0, st.barSlide - ms);
		if (st.locking > 0) st.locking = Math.max(0, st.locking - ms);
		copyHeldSteps(s);
		repeatNudge(s);
		if (st.clearClock !== null && st.clock - st.clearClock >= CLEAR_MS) clearTrack(s);
		if (recordingAny(s) || s.transport.recording) syncRecordingFlag(s);
	}
};
