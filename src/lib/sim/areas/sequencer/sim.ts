/**
 * The sequencer area (manual sequencer/*, players/*): the bar menu while `bar` is held or pinned,
 * the player page, the step component page while shift is held with steps selected, and a held
 * step's values on the instrument pages (parameter locks). Its `claim` sees every input first and
 * takes the gestures that start anywhere: `bar`, `player`, the bar menu's combinations, shift +
 * steps and keys, recording (`record`, `play`, `stop`), `[-]` / `[+]`, and encoder turns with a
 * step held or while recording. Plain step and keyboard presses stay with the core, which calls
 * `steps.ts`; the LEDs are `leds.ts`, called by the core's `buildLeds`.
 */
import type { AreaContext, SimArea } from '../types';
import type { SimInput } from '../../input';
import type { SimState } from '../../params';
import { buildFrame } from '../../frames';
import { barClick, barCombo, barFrame, barPress, barRelease, barTurn } from './bar';
import {
	componentKey,
	componentsActive,
	componentsFrame,
	endComponents,
	selectStep
} from './components';
import type { LockFrame } from './frames';
import { lockLabel, lockParam, lockedTrack } from './locks';
import {
	CLEAR_MS,
	activeBank,
	activePattern,
	barDown,
	heldKeys,
	heldSteps,
	keyNote,
	keyboardIndex,
	liveRecording,
	recordingAny,
	seq,
	sequencing,
	stepIndex,
	syncRecordingFlag
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
import { lockTurn, plusMinus } from './steps';

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

/** The instrument page as it plays on the held step, and the tag naming the step. */
function lockFrame(s: SimState): LockFrame {
	const st = seq(s);
	const index = heldSteps(s)[0];
	const step = activePattern(s).steps[index];
	const track = s.tracks[s.track];
	const view: SimState = {
		...s,
		held: s.held.filter((id) => !id.startsWith('step.')),
		tracks: s.tracks.map((t, i) => (i === s.track ? lockedTrack(t, step.locks) : t))
	};
	const last = st.lastLock?.step === index ? lockParam(st.lastLock.id) : null;
	return {
		page: 'lock',
		base: buildFrame(view),
		step: index + 1,
		locks: Object.keys(step.locks).length,
		last:
			last && step.locks[last.id] !== undefined
				? { label: lockLabel(last.id, track), value: last.format(step.locks[last.id]) }
				: null
	};
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
		recordKey(s, id, key);
		return false;
	}
	// another track: a copied step stays with the one it came from
	if (/^track\.[1-8]$/.test(id)) st.clipboard = null;
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
	owns: (s) => s.overlay === 'bar' || s.overlay === 'players' || componentsActive(s) || lockView(s),
	frame: (s) => {
		if (s.overlay === 'bar') return barFrame(s);
		if (s.overlay === 'players') return playerFrame(s);
		if (componentsActive(s)) return componentsFrame(s);
		return lockFrame(s);
	},
	claim(ctx: AreaContext, input: SimInput): boolean {
		const s = ctx.state;
		const st = seq(s);
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
		if (st.clearClock !== null && st.clock - st.clearClock >= CLEAR_MS) clearTrack(s);
		if (recordingAny(s) || s.transport.recording) syncRecordingFlag(s);
	}
};
