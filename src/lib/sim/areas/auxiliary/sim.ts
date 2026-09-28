/**
 * Auxiliary tracks (T1–T8 with auxiliary): brain, punch-in FX, external MIDI, external CV,
 * external audio, tape, FX I and FX II, with their M1–M4 pages (guide art auxiliary-004 … 130;
 * manual: auxiliary/*, fx/*), as the owner's device shows them on OS 1.1.33
 * (docs/research/59-screen-profiling.md §2.13). The brain has a main page and routing; punch-in FX
 * and external CV have only their main page; external MIDI has CC slots on M2 and M3 and an LFO;
 * external audio, tape and the FX tracks have routing (M2), a filter with sends on its shift layer
 * (M3) and an LFO (M4). A track without a page keeps its main page on that key (ours: the manual
 * lists no page). The filters and LFOs start switched off, as on the device, and M3 or M4 pressed
 * on its own page switches them, as on the instrument tracks. Routing into external audio, tape and
 * the FX tracks is the instrument tracks' own sends (the community's project files store it there),
 * so their M3 shift layer and mix M1 show the same values. Aux tracks sequence like instrument
 * tracks: brain notes transpose until the next one, punch-in notes fire effects and tape notes play
 * clips for as long as they last, and the CV needle holds the last note until the next.
 * `shift + key` on an instrument track fires punch-in effects from anywhere, so the area claims it.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import {
	LFO_SYNC_STEPS,
	clamp,
	detent,
	shown,
	two,
	type PageNumber,
	type SimState
} from '../../params';
import type { LfoFrame, ScreenFrame } from '../../screen/frame';
import type { SimInput } from '../../input';
import { currentPattern, recordNote, stepAt, type Pattern } from '../../sequencer';
import type { MusicalScale } from '../../sequencer-playback';
import type { AreaContext, SimArea } from '../types';
import type {
	AuxBrainFrame,
	AuxCcFrame,
	AuxFilterView,
	AuxFxFrame,
	AuxFxListFrame,
	AuxLfoDestination,
	AuxLfoFrame,
	AuxPunchFrame,
	AuxRouteFrame,
	AuxTapeFrame
} from './frames';
import {
	AUDIO_INPUTS,
	DELAY_SIZES,
	FX_NAMES,
	FX_PARAMS,
	FX_TYPES,
	KEYS,
	SCALES,
	brainSettings,
	defaultFx,
	editBrain,
	type AuxiliaryState,
	type BrainSettings
} from './state';

/** The first keyboard key's note (F3). */
const KEYBOARD_BASE = 53;

/** The pages an aux track can show. */
type Kind =
	| 'brain'
	| 'punch'
	| 'midi'
	| 'cc'
	| 'cv'
	| 'audio'
	| 'tape'
	| 'fx'
	| 'route'
	| 'filter'
	| 'sends'
	| 'lfo';

/**
 * What M1–M4 show on each aux track (manual: auxiliary/overview, routing-filter-lfo): the brain has
 * its page and routing, punch-in FX and external CV only their picture.
 */
const PAGES: readonly (readonly [Kind, Kind, Kind, Kind])[] = [
	['brain', 'route', 'brain', 'brain'],
	['punch', 'punch', 'punch', 'punch'],
	['midi', 'cc', 'cc', 'lfo'],
	['cv', 'cv', 'cv', 'cv'],
	['audio', 'route', 'filter', 'lfo'],
	['tape', 'route', 'filter', 'lfo'],
	['fx', 'route', 'filter', 'lfo'],
	['fx', 'route', 'filter', 'lfo']
];

/**
 * The M3 shift layer's sends by track, as encoders (1 tape, 2 FX I, 3 FX II): external audio sends
 * to all three, tape to the FX tracks, FX I on into FX II (manual: auxiliary/routing-filter-lfo).
 */
const SENDS: readonly (readonly number[])[] = [[], [], [], [], [1, 2, 3], [2, 3], [3], []];

/** The sends (1 tape, 2 FX I, 3 FX II) auxiliary track `track` (0–7) has on its M3 shift layer. */
export const auxSends = (track: number): readonly number[] => SENDS[track] ?? [];

/** Which instrument send (aux out, tape, FX I, FX II) each routing page sets; the brain has its own. */
const ROUTE_SEND: readonly (number | null)[] = [null, null, null, null, 0, 1, 2, 3];

/** What each routing page feeds. */
const ROUTE_TARGET = ['brain', '', '', '', 'aux out', 'tape', 'FX I', 'FX II'] as const;

/** The FX slots' names. */
const SLOT_NAMES = ['FX I', 'FX II'] as const;

/** A module an aux LFO can reach and its parameters by encoder ('' where the page has none). */
interface Destination {
	readonly name: AuxLfoDestination;
	readonly params: readonly string[];
}

/**
 * The LFO of external audio (and, ours, of tape and the FX tracks) reaches the track's own page,
 * its filter and its amp, as the device lists them: syn, filter, amp (steps-904…953). It names the
 * track's own parameters param1…; "param1", "hi pass", "volume" and "pan" were seen, the rest is
 * ours after them.
 */
const TRACK_DESTINATIONS: readonly Destination[] = [
	{ name: 'syn', params: ['param1', 'param2', 'param3', 'param4'] },
	{ name: 'filter', params: ['hi pass', '', '', 'lo pass'] },
	{ name: 'amp', params: ['volume', 'pan', '', ''] }
];

/** What the external MIDI LFO's parameter card reads when it reaches no CC. */
const NO_CC = 'no cc set';

const pitchClass = (note: number) => ((note % 12) + 12) % 12;

/** Keyboard key (0–23) of a control id, or null. */
function keyboardIndex(id: string): number | null {
	if (!id.startsWith('keyboard.')) return null;
	const i = (KEYBOARD_NOTE_NAMES as readonly string[]).indexOf(id.slice('keyboard.'.length));
	return i >= 0 ? i : null;
}

/** Keyboard keys held now. */
function heldKeys(s: SimState): number[] {
	return s.held.flatMap((id) => {
		const i = keyboardIndex(id);
		return i === null ? [] : [i];
	});
}

/** Whether a step key is held (keyboard keys then edit the step instead of playing). */
const stepHeld = (s: SimState) => s.held.some((id) => id.startsWith('step.'));

/**
 * Notes of an aux track's pattern sounding now: each from its step (micro-timing included) for as
 * long as it lasts, so an effect held over four steps plays for four. None when stopped or while
 * counting in.
 */
function soundingNotes(s: SimState, track: number): number[] {
	const t = s.transport;
	if (!t.playing || t.position < 0) return [];
	const pattern = currentPattern(s.aux[track].sequence);
	const n = pattern.length;
	const at = t.position / pattern.scale;
	return pattern.steps.slice(0, n).flatMap((step, i) =>
		step.notes.flatMap((note) => {
			const since = (((at - i - note.offset) % n) + n) % n;
			return since < note.length ? [note.note] : [];
		})
	);
}

/**
 * The note an aux track's pattern started last at or before transport `position`: the pattern
 * loops, so it holds until the next one. A chord gives its lowest note (ours). Null with an empty
 * pattern.
 */
function noteAt(s: SimState, track: number, position: number): number | null {
	const pattern = currentPattern(s.aux[track].sequence);
	const at = stepAt(pattern, position);
	for (let back = 0; back < pattern.length; back++) {
		const notes = pattern.steps[(at - back + pattern.length) % pattern.length].notes;
		if (notes.length > 0) return Math.min(...notes.map((n) => n.note));
	}
	return null;
}

/**
 * The note an aux track's pattern started last, at or before the playhead ({@link noteAt}); null
 * when stopped or counting in.
 */
function latestNote(s: SimState, track: number): number | null {
	const t = s.transport;
	if (!t.playing || t.position < 0) return null;
	return noteAt(s, track, t.position);
}

/** Keyboard keys (0–23) of notes, where they fall on the keyboard. */
const keysOf = (notes: readonly number[]) =>
	notes.map((n) => n - KEYBOARD_BASE).filter((k) => k >= 0 && k < KEYBOARD_NOTE_NAMES.length);

/** Sorted, without repeats. */
const unique = (keys: readonly number[]) => [...new Set(keys)].sort((a, b) => a - b);

/** Effects playing on the punch-in track now: keys held, and the pattern's notes while playing. */
const punchActive = (s: SimState) => unique([...heldKeys(s), ...keysOf(soundingNotes(s, 1))]);

/**
 * The punch-in page's heartbeat (research 59 §2.13; the recordings punch-white and punch-black):
 * one lit dot runs along row 8 at 15.2 columns a second and comes back to the left edge every
 * 2.78 s (the 40 columns take 2.63 s; the rest of the loop it is off the screen).
 */
const HEARTBEAT = { row: 8, speed: 15.2, loop: 2780 } as const;

/** Its spike, rows by column: a row down, up to row 4, down past the line and back (an ECG's). */
const HEARTBEAT_SPIKE: Readonly<Record<number, number>> = {
	17: 9,
	18: 7,
	19: 6,
	20: 4,
	21: 7,
	22: 9
};

/** The heartbeat dot's column `ms` into its loop (40 and past: off the screen). */
const heartbeatColumn = (ms: number) =>
	Math.floor(((ms % HEARTBEAT.loop) / 1000) * HEARTBEAT.speed);

/** The heartbeat's dot in column `col`, or null off the screen. */
function heartbeatDot(col: number): AuxPunchFrame['beat'] {
	return col >= 0 && col < 40 ? { col, row: HEARTBEAT_SPIKE[col] ?? HEARTBEAT.row } : null;
}

/** The page the screen shows (shift on a filter with sends shows the send cards). */
function kindOf(s: SimState): Kind {
	const kind = PAGES[s.auxTrack][s.pages.auxiliary - 1];
	return kind === 'filter' && s.shift && SENDS[s.auxTrack].length > 0 ? 'sends' : kind;
}

// ─────────────────────────────────────────────────────────────── brain (manual: auxiliary/brain)

/** Tie-break between scales sharing a pitch set (ours): major, then minor, then the modes. */
const PREFERENCE = [6, 4, 1, 2, 3, 5, 0];

/** Whether score `a` beats `b`, comparing entry by entry. */
function beats(a: readonly number[], b: readonly number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return false;
}

/**
 * The key and scale that best hold `notes` (our stand-in for the brain's detection): the most notes
 * inside the scale, then the most weight on its root, then major and minor over the other modes,
 * then the lowest root. Null without notes.
 */
export function detectKey(notes: readonly number[]): { key: number; scale: number } | null {
	if (notes.length === 0) return null;
	const weight = new Array<number>(12).fill(0);
	for (const n of notes) weight[pitchClass(n)] += 1;
	let best = { key: 0, scale: 0, score: [-1] };
	for (let scale = 0; scale < SCALES.length; scale++) {
		const steps: readonly number[] = SCALES[scale].steps;
		for (let key = 0; key < 12; key++) {
			const inside = steps.reduce((sum, step) => sum + weight[(key + step) % 12], 0);
			const score = [inside, weight[key], PREFERENCE[scale], -key];
			if (beats(score, best.score)) best = { key, scale, score };
		}
	}
	return { key: best.key, scale: best.scale };
}

/** Notes of the routed tracks' patterns: what the brain listens to. */
function routedNotes(s: SimState, b: BrainSettings): number[] {
	return s.tracks.flatMap((t, i) => {
		if (!b.routes[i]) return [];
		const pattern = currentPattern(t.sequence);
		return pattern.steps.slice(0, pattern.length).flatMap((step) => step.notes.map((n) => n.note));
	});
}

/** The brain's key and scale: detected from the routed notes when automatic and there are any. */
function brainKey(s: SimState, b: BrainSettings): { key: number; scale: number } {
	return (b.auto ? detectKey(routedNotes(s, b)) : null) ?? { key: b.key, scale: b.scale };
}

/**
 * The brain note in force: while playing, the latest note of the brain's pattern (a chord change
 * holds until the next); else the last note played on its keyboard. A chord transposes to its
 * lowest note (ours).
 */
function brainNote(s: SimState): number | null {
	return latestNote(s, 0) ?? s.areas.auxiliary.brain.note;
}

/** The settings of the pattern the brain track plays. */
const currentBrain = (s: SimState) => brainSettings(s.areas.auxiliary, s.aux[0].sequence.current);

/** What the brain does to the tracks routed into it, from {@link brainInfluence}. */
export interface BrainInfluence {
	/** Instrument tracks 0–7 routed in: the only ones it acts on. */
	readonly routes: readonly boolean[];
	/** The key it detected or was set to (0–11), which transpositions are measured from. */
	readonly key: number;
	/** That key and its scale: what ramps, random and tonality move in ("the current scale"). */
	readonly scale: MusicalScale;
}

/**
 * What the brain does now to the tracks routed into it (manual: auxiliary/brain; step components'
 * "current scale"): their step components move in its key and scale, and their notes follow its
 * transposition ({@link brainShift}). Null while the brain track is muted (ours).
 */
export function brainInfluence(s: SimState): BrainInfluence | null {
	if (s.aux[0].mix.muted) return null;
	const b = currentBrain(s);
	const { key, scale } = brainKey(s, b);
	return { routes: b.routes, key, scale: { root: key, degrees: SCALES[scale].steps } };
}

/**
 * The transposition in force at transport `position`, in semitones: the brain pattern's latest note
 * then (a chord change holds until the next), else the last note played on its keyboard, taken
 * from `key` to that note's pitch class the short way round (−5…+6; ours). 0 without either.
 */
export function brainShift(s: SimState, key: number, position: number): number {
	const note = noteAt(s, 0, position) ?? s.areas.auxiliary.brain.note;
	if (note === null) return 0;
	const up = (((note - key) % 12) + 12) % 12;
	return up > 6 ? up - 12 : up;
}

/**
 * Brain page: the title is the key the routed tracks play in now (the root moved to the brain note
 * in force, keeping the scale, as TE's art reads "c lydian" over root c#); the octave dots mark that
 * scale's notes, the ones that fit (ours: the art's dots follow no scale).
 */
function brainFrame(s: SimState): AuxBrainFrame {
	const b = currentBrain(s);
	const { key, scale } = brainKey(s, b);
	const note = brainNote(s);
	const root = note === null ? key : pitchClass(note);
	const steps: readonly number[] = SCALES[scale].steps;
	return {
		page: 'aux-brain',
		title: `${KEYS[root]} ${SCALES[scale].label}`,
		auto: b.auto,
		root: KEYS[key],
		scale: SCALES[scale].label,
		link: b.link === null ? null : two(b.link + 1),
		notes: Array.from({ length: 12 }, (_, pc) => steps.includes((pc - root + 12) % 12))
	};
}

/**
 * E1 manual / auto, E2 key, E3 scale, E4 link (manual: auxiliary/brain). Leaving auto keeps the
 * key in force, and setting the key or scale by hand leaves auto (ours: detection would undo it);
 * either clears the keyboard's transposition.
 */
function turnBrain(s: SimState, e: number, delta: number): void {
	const aux = s.areas.auxiliary;
	const b = editBrain(aux, s.aux[0].sequence.current);
	const toManual = () => {
		if (!b.auto) return;
		Object.assign(b, brainKey(s, b), { auto: false });
	};
	if (e === 0) {
		if (delta > 0) b.auto = true;
		else toManual();
	} else if (e === 1 || e === 2) {
		toManual();
		if (e === 1) b.key = clamp(b.key + delta, 0, KEYS.length - 1);
		else b.scale = clamp(b.scale + delta, 0, SCALES.length - 1);
		aux.brain.note = null;
	} else {
		const link = clamp((b.link ?? -1) + delta, -1, 7);
		b.link = link < 0 ? null : link;
	}
}

// ─────────────────────────────────────────────────────── routing (manual: routing-filter-lfo)

function routeFrame(s: SimState, track: number): AuxRouteFrame {
	const send = ROUTE_SEND[track];
	const routes = currentBrain(s).routes;
	return {
		page: 'aux-route',
		target: ROUTE_TARGET[track],
		tracks: s.tracks.map((t, i) => {
			if (send === null) return { routed: routes[i], amount: routes[i] ? 1 : 0, value: '' };
			const v = t.sends[send];
			return { routed: v > 0, amount: v / 99, value: String(shown(v)) };
		}),
		half: s.areas.auxiliary.pages[track].half
	};
}

/**
 * Each encoder addresses one of four instrument tracks (a click swaps 1–4 and 5–8): turning adds or
 * removes it from the brain, or sets how much it sends into audio out, tape or an FX track.
 */
function turnRoute(s: SimState, track: number, e: number, delta: number): void {
	const target = s.areas.auxiliary.pages[track].half * 4 + e;
	const send = ROUTE_SEND[track];
	if (send === null) {
		editBrain(s.areas.auxiliary, s.aux[0].sequence.current).routes[target] = delta > 0;
		return;
	}
	const sends = s.tracks[target].sends;
	sends[send] = detent(sends[send], delta, 0, 99);
}

// ───────────────────────────────────────────────────────────── external midi and cv

/** A slot's CC as the LFO's parameter card names it: "cc 74", or none. */
function slotLabel(aux: AuxiliaryState, slot: number): string {
	const cc = aux.midi.slots[slot].cc;
	return cc === null ? NO_CC : `cc ${cc}`;
}

/**
 * External MIDI M2 / M3 as the device draws them (b1-4103…4159): four slots, each its value in
 * the box and its CC under it, or crossed and "off". Shift + turn changes the CC under the box.
 */
function ccFrame(s: SimState, set: 'I' | 'II'): AuxCcFrame {
	const first = set === 'I' ? 0 : 4;
	return {
		page: 'aux-cc',
		set,
		slots: s.areas.auxiliary.midi.slots
			.slice(first, first + 4)
			.map((slot) => ({ cc: slot.cc, value: String(slot.value) }))
	};
}

/** M1 channel, bank, program; M2 / M3 slot values, and with shift their CC numbers (off below 0). */
function turnMidi(s: SimState, kind: Kind, e: number, delta: number): void {
	const m = s.areas.auxiliary.midi;
	const optional = (v: number | null) => {
		const next = (v ?? 0) + delta;
		return next < 1 ? null : Math.min(128, next);
	};
	if (kind === 'midi') {
		if (e === 0) m.channel = clamp(m.channel + delta, 1, 16);
		else if (e === 1) m.bank = optional(m.bank);
		else if (e === 2) m.program = optional(m.program);
		return;
	}
	const slot = m.slots[(s.pages.auxiliary === 3 ? 4 : 0) + e];
	if (s.shift) {
		const cc = (slot.cc ?? -1) + delta;
		slot.cc = cc < 0 ? null : Math.min(127, cc);
	} else if (slot.cc !== null) slot.value = clamp(slot.value + delta, 0, 127);
}

/**
 * The CV track's pitch voltage, at one volt per octave with C4 at 0 V (ours: the manual gives no
 * scaling), within the meter's ±5 V. Pitch CV holds between notes (the gate carries on and off):
 * a key held plays live; else, while playing, the pattern's last note holds until the next; else
 * the last note played.
 */
function cvVolts(s: SimState): number {
	const live = heldKeys(s).length > 0;
	const note = (live ? null : latestNote(s, 3)) ?? s.aux[3].sequence.lastNote;
	return clamp((note - 60) / 12, -5, 5);
}

// ───────────────────────────────────────────────────────── external audio, tape, fx

/**
 * Tape M1 as the device writes it (CC sweeps, research 59 §2.13): pitch x1–x10, speed 50–200 %,
 * length 1–16 and mix 00–99.
 */
function tapeFrame(s: SimState): AuxTapeFrame {
	const tape = s.areas.auxiliary.tape;
	// the loop runs `length` beats (ours); routed tracks' notes land on it where they fall in the
	// loop, micro-timing included
	const loop = tape.length * 4;
	const hits = s.tracks.flatMap((t) => {
		if (t.sends[1] <= 0) return [];
		const pattern = currentPattern(t.sequence);
		return pattern.steps.slice(0, pattern.length).flatMap((step, i) =>
			step.notes.map((n) => {
				const at = ((i + n.offset) * pattern.scale) % loop;
				return (at < 0 ? at + loop : at) / loop;
			})
		);
	});
	return {
		page: 'aux-tape',
		pitch: `x${tape.pitch}`,
		speed: String(tape.speed),
		length: String(tape.length),
		mix: two(tape.mix),
		hits: unique(hits),
		// nothing moves on the tape while counting in
		head: (Math.max(0, s.transport.position) % loop) / loop,
		keys: unique([...heldKeys(s), ...keysOf(soundingNotes(s, 5))])
	};
}

/** Which of `count` equal zones a 0–99 lane is in (as the engines' stepped labels). */
const zone = (v: number, count: number) =>
	Math.min(count - 1, Math.floor((clamp(v, 0, 99) / 99) * count));

/**
 * FX M1 as the device writes it (research 59 §2.13): each column's label, its value (two digits;
 * the delay's size a note value) and the marker's height, which follows the lane even where the
 * value is a note value.
 */
function fxFrame(s: SimState, slot: 0 | 1): AuxFxFrame {
	const fx = s.areas.auxiliary.fx[slot];
	return {
		page: 'aux-fx',
		slot: SLOT_NAMES[slot],
		type: FX_NAMES[fx.type],
		params: FX_PARAMS[fx.type].map((label, i) => {
			const v = fx.params[i];
			const size = fx.type === 'delay' && i === 0;
			const value = size ? DELAY_SIZES[zone(v, DELAY_SIZES.length)] : two(v);
			return { label, value, level: clamp(v, 0, 99) / 99 };
		})
	};
}

/** The main pages' encoders (manual: auxiliary/external-audio, tape; fx/*). */
function turnMain(s: SimState, kind: Kind, e: number, delta: number): void {
	const aux = s.areas.auxiliary;
	const step = (v: number, min: number, max: number) => detent(v, delta, min, max);
	if (kind === 'audio') {
		const a = aux.audio;
		if (e === 0) a.input = step(a.input, 0, AUDIO_INPUTS.length - 1);
		else if (e === 1) a.drive = step(a.drive, 0, 20);
		else if (e === 2) a.level = step(a.level, 0, 99);
		else a.mix = step(a.mix, 0, 99);
	} else if (kind === 'tape') {
		const t = aux.tape;
		if (e === 0) t.pitch = step(t.pitch, 1, 10);
		else if (e === 1) t.speed = step(t.speed, 50, 200);
		else if (e === 2) t.length = step(t.length, 1, 16);
		else t.mix = step(t.mix, 0, 99);
	} else if (kind === 'fx') {
		const fx = aux.fx[s.auxTrack === 6 ? 0 : 1];
		// the delay's size moves a note value a detent: an eighth of its lane (the device's marker
		// lands on k/8 as E1 turns, b1-4583…4596)
		if (fx.type === 'delay' && e === 0) {
			fx.params[0] = clamp(fx.params[0] + (delta * 99) / DELAY_SIZES.length, 0, 99);
		} else fx.params[e] = step(fx.params[e], 0, 99);
	}
}

// ─────────────────────────────────────────────────────────────── filter, sends, lfo

function filterView(s: SimState): AuxFilterView {
	const p = s.areas.auxiliary.pages[s.auxTrack];
	return { highpass: p.highpass / 99, lowpass: p.lowpass / 99 };
}

/**
 * The modules an aux track's LFO can reach. External MIDI's reach its two CC sets, "cc1" and
 * "cc2" after "off" (the device's column, steps-788…828; the community's project files show the
 * same three stops), each naming the chosen slot by its CC; the other tracks' reach their own
 * page, filter and amp ({@link TRACK_DESTINATIONS}).
 */
function destinations(s: SimState, track: number): readonly Destination[] {
	if (track !== 2) return TRACK_DESTINATIONS;
	const set = (first: number) => [0, 1, 2, 3].map((i) => slotLabel(s.areas.auxiliary, first + i));
	return [
		{ name: 'off', params: [] },
		{ name: 'cc1', params: set(0) },
		{ name: 'cc2', params: set(4) }
	];
}

/** The LFO speed's card: synced steps first, then the free range (as the instrument LFO). */
function lfoSpeed(speed: number): LfoFrame['speed'] {
	const n = LFO_SYNC_STEPS.length;
	if (speed < n) return { synced: true, label: LFO_SYNC_STEPS[speed], position: speed / (n + 99) };
	return { synced: false, label: '', position: (speed - n) / 99 };
}

function lfoFrame(s: SimState, track: number): AuxLfoFrame {
	const l = s.areas.auxiliary.pages[track].lfo;
	const list = destinations(s, track);
	const at = clamp(l.destination, 0, list.length - 1);
	return {
		page: 'aux-lfo',
		off: !l.on,
		speed: lfoSpeed(l.speed),
		amount: (l.amount * 100) / 99,
		destinations: list.map((d) => d.name),
		destination: at,
		// an encoder with nothing to move reads "-" (the amp's E3 and E4, steps-936…940)
		parameterName: list[at].params[l.parameter] || (track === 2 ? NO_CC : '-'),
		parameter: l.parameter
	};
}

/**
 * E1 speed, E2 amount, E3 destination, E4 parameter (manual: auxiliary/routing-filter-lfo). The
 * parameter is an encoder of the destination page, E1 … E4, whether or not it moves anything
 * there (the device's CC43 sweep: volume, pan, then "-" twice on amp); a new destination starts
 * on E1.
 */
function turnLfo(s: SimState, e: number, delta: number): void {
	const l = s.areas.auxiliary.pages[s.auxTrack].lfo;
	const list = destinations(s, s.auxTrack);
	if (e === 0) l.speed = clamp(l.speed + delta, 0, LFO_SYNC_STEPS.length + 99);
	else if (e === 1) l.amount = clamp(l.amount + delta, -99, 99);
	else if (e === 2) {
		l.destination = clamp(l.destination + delta, 0, list.length - 1);
		l.parameter = 0;
	} else l.parameter = clamp(l.parameter + delta, 0, 3);
}

/** M3: E1 high-pass, E4 low-pass; with shift, the track's sends. */
function turnFilter(s: SimState, kind: Kind, e: number, delta: number): void {
	const p = s.areas.auxiliary.pages[s.auxTrack];
	if (kind === 'sends') {
		if (SENDS[s.auxTrack].includes(e)) p.sends[e] = detent(p.sends[e], delta, 0, 99);
	} else if (e === 0) p.highpass = detent(p.highpass, delta, 0, 99);
	else if (e === 3) p.lowpass = detent(p.lowpass, delta, 0, 99);
}

// ─────────────────────────────────────────────────────────────── parameter locks

/** A parameter an aux page's encoder turns, as a step can lock it (manual: parameter-locks). */
export interface AuxLock {
	/** The id a step's lock stores it under ("aux.cc.3", "aux.tape.pitch" …). */
	readonly id: string;
	readonly min: number;
	readonly max: number;
	/** The track's own value. */
	get(s: SimState): number;
}

/**
 * The parameter encoder `e` (0–3) turns on the aux page on screen, or null when it locks nothing:
 * the external MIDI track's CC values (the guide: its CCs are sequenced and recorded), the audio,
 * tape and FX tracks' main values, filters, sends and LFO speed and amount. Settings stay unlocked
 * (ours): the MIDI channel, bank and program, CC numbers (shift), the audio input, the brain, the
 * routing and the LFO's destination. Mirrors the aux turns above.
 */
export function auxLockTarget(s: SimState, e: number): AuxLock | null {
	if (s.mode !== 'auxiliary' || s.overlay !== null || s.sub !== null || s.picker !== null) {
		return null;
	}
	const aux = s.areas.auxiliary;
	if (aux.picker) return null;
	const lock = (id: string, min: number, max: number, get: (s: SimState) => number): AuxLock => ({
		id: `aux.${id}`,
		min,
		max,
		get
	});
	const track = s.auxTrack;
	switch (kindOf(s)) {
		case 'cc': {
			const index = (s.pages.auxiliary === 3 ? 4 : 0) + e;
			if (s.shift || aux.midi.slots[index]?.cc === null) return null;
			return lock(`cc.${index + 1}`, 0, 127, (st) => st.areas.auxiliary.midi.slots[index].value);
		}
		case 'audio': {
			const field = (['drive', 'level', 'mix'] as const)[e - 1];
			if (!field) return null;
			const max = field === 'drive' ? 20 : 99;
			return lock(`audio.${field}`, 0, max, (st) => st.areas.auxiliary.audio[field]);
		}
		case 'tape': {
			const [field, min, max] = (
				[
					['pitch', 1, 10],
					['speed', 50, 200],
					['length', 1, 16],
					['mix', 0, 99]
				] as const
			)[e];
			return lock(`tape.${field}`, min, max, (st) => st.areas.auxiliary.tape[field]);
		}
		case 'fx': {
			const slot = track === 6 ? 0 : 1;
			return lock(`fx.${e + 1}`, 0, 99, (st) => st.areas.auxiliary.fx[slot].params[e]);
		}
		case 'filter':
			if (e === 0)
				return lock('filter.highpass', 0, 99, (st) => st.areas.auxiliary.pages[track].highpass);
			if (e === 3)
				return lock('filter.lowpass', 0, 99, (st) => st.areas.auxiliary.pages[track].lowpass);
			return null;
		case 'sends':
			return SENDS[track].includes(e)
				? lock(`sends.${e + 1}`, 0, 99, (st) => st.areas.auxiliary.pages[track].sends[e])
				: null;
		case 'lfo':
			if (e === 0) {
				const max = LFO_SYNC_STEPS.length + 99;
				return lock('lfo.speed', 0, max, (st) => st.areas.auxiliary.pages[track].lfo.speed);
			}
			if (e === 1)
				return lock('lfo.amount', -99, 99, (st) => st.areas.auxiliary.pages[track].lfo.amount);
			return null;
		default:
			return null;
	}
}

// ────────────────────────────────────────────────────────────────── the effect list

/**
 * The list shift + T7 / T8 opens (manual: fx/overview): the FX track's number as the device counts
 * tracks (15, 16) and the six effects by the names the list writes.
 */
function pickerFrame(s: SimState): AuxFxListFrame {
	const picker = s.areas.auxiliary.picker ?? { slot: 0, index: 0 };
	return {
		page: 'aux-fx-list',
		track: String(15 + picker.slot),
		items: FX_TYPES.map((type) => FX_NAMES[type]),
		selected: picker.index
	};
}

/** Loads the highlighted effect (a new one starts from its defaults) and closes the list. */
function confirmPicker(s: SimState): void {
	const aux = s.areas.auxiliary;
	const picker = aux.picker;
	if (!picker) return;
	const type = FX_TYPES[picker.index];
	if (aux.fx[picker.slot].type !== type) aux.fx[picker.slot] = defaultFx(type);
	aux.picker = null;
}

// ─────────────────────────────────────────────────────────────────────────── the area

/** What the screen shows in auxiliary mode. */
function auxFrame(s: SimState): ScreenFrame {
	const aux = s.areas.auxiliary;
	if (aux.picker) return pickerFrame(s);
	const track = s.auxTrack;
	switch (kindOf(s)) {
		case 'brain':
			return brainFrame(s);
		case 'punch': {
			const active = punchActive(s);
			// the key pressed last shows its effect's picture, else the pattern's highest (ours)
			const held = heldKeys(s);
			return {
				page: 'aux-punch',
				active,
				picture: held.length > 0 ? held[held.length - 1] : (active[active.length - 1] ?? null),
				beat: active.length > 0 ? null : heartbeatDot(aux.heartbeat.col)
			};
		}
		case 'midi': {
			const m = aux.midi;
			return {
				page: 'aux-midi',
				channel: String(m.channel).padStart(2, '0'),
				bank: m.bank === null ? null : String(m.bank),
				program: m.program === null ? null : String(m.program)
			};
		}
		case 'cc':
			return ccFrame(s, s.pages.auxiliary === 3 ? 'II' : 'I');
		case 'cv':
			return { page: 'aux-cv', volts: cvVolts(s) };
		case 'audio': {
			const a = aux.audio;
			return {
				page: 'aux-audio',
				input: AUDIO_INPUTS[a.input],
				on: a.on,
				drive: String(clamp(Math.round(a.drive), 0, 20)).padStart(2, '0'),
				level: two(a.level),
				mix: two(a.mix)
			};
		}
		case 'tape':
			return tapeFrame(s);
		case 'fx':
			return fxFrame(s, track === 6 ? 0 : 1);
		case 'route':
			return routeFrame(s, track);
		case 'filter':
			return { page: 'aux-filter', off: !aux.pages[track].filterOn, ...filterView(s) };
		case 'sends': {
			const sends = aux.pages[track].sends;
			return {
				page: 'aux-sends',
				filter: filterView(s),
				// two digits, as the instrument's sends frame (the page writes "no send" at 00)
				values: sends.map((v, i) => (SENDS[track].includes(i) ? two(v) : null))
			};
		}
		case 'lfo':
			return lfoFrame(s, track);
	}
}

/** Where the playhead is in steps of the punch-in pattern (sixteenths over its track scale). */
const punchPlayhead = (s: SimState, pattern: Pattern) => s.transport.position / pattern.scale;

/**
 * The punch-in shortcut (manual: auxiliary/punch-in-fx): on an instrument track `shift + key` fires
 * that key's effect instead of playing a note (the lower octave on the track, the upper on its
 * group). A live recording writes it to the punch-in track as a live note is written: on the
 * nearest step, the rest as its offset, lasting as long as the key is held (see
 * {@link endPunchTake}). Not on a midi engine track (our reading of OS 1.0.32's "not while
 * external MIDI is in use"). Areas asked earlier (a player that takes shift + keys for its chord)
 * win.
 */
function punchShortcut(s: SimState, input: SimInput): boolean {
	if (input.type !== 'press' || !s.shift || s.mode !== 'instrument') return false;
	if (s.overlay !== null || s.sub !== null || s.picker !== null) return false;
	if (s.tracks[s.track].engine === 'midi') return false;
	const key = keyboardIndex(input.id);
	if (key === null || stepHeld(s)) return false;
	const t = s.transport;
	if (t.recording && t.playing && t.position >= 0) {
		const pattern = currentPattern(s.aux[1].sequence);
		const start = punchPlayhead(s, pattern);
		const note = KEYBOARD_BASE + key;
		const at = recordNote(pattern, start, note);
		if (at) s.areas.auxiliary.punchTakes[input.id] = { index: at.index, note, start };
	}
	return true;
}

/** A recorded shortcut effect's key came up (or playback stopped): it gets the length reached. */
function endPunchTake(s: SimState, id: string): void {
	const takes = s.areas.auxiliary.punchTakes;
	const take = takes[id];
	if (!take) return;
	delete takes[id];
	if (!s.transport.playing) return;
	const pattern = currentPattern(s.aux[1].sequence);
	const note = pattern.steps[take.index]?.notes.find((n) => n.note === take.note);
	const held = punchPlayhead(s, pattern) - take.start;
	if (note) note.length = Math.max(0.05, Math.round(held * 100) / 100);
}

export const auxiliary: SimArea = {
	id: 'auxiliary',
	owns: (s) => s.overlay === null && s.sub === null && s.mode === 'auxiliary',
	frame: auxFrame,

	claim(ctx: AreaContext, input: SimInput): boolean {
		const s = ctx.state;
		if (input.type === 'release') endPunchTake(s, input.id);
		else if (input.type === 'press' && input.id === 'key.stop') {
			for (const id of Object.keys(s.areas.auxiliary.punchTakes)) endPunchTake(s, id);
		}
		return punchShortcut(s, input);
	},

	press(ctx: AreaContext, id: string): boolean {
		const s = ctx.state;
		const aux = s.areas.auxiliary;
		const fxKey = id === 'track.7' || id === 'track.8';
		const muting = ctx.isHeld('key.auxiliary') || ctx.isHeld('key.instrument');
		if (aux.picker) {
			const m = /^key\.m([1-4])$/.exec(id);
			if (m) {
				// M1 confirms like an E4 click; the other module keys leave the list unchanged
				if (m[1] === '1') confirmPicker(s);
				aux.picker = null;
				s.pages.auxiliary = Number(m[1]) as PageNumber;
				return true;
			}
			// the keyboard auditions while choosing, and an encoder's push is the start of its click
			// (which confirms) or of a push-turn; any other key leaves the list and does its job
			if (id.startsWith('keyboard.') || id.startsWith('encoder.')) return false;
			if (!(fxKey && s.shift)) aux.picker = null;
		}
		// pressed on its own page, M3 switches the filter on or off and M4 the LFO, as on the
		// instrument tracks: the device shows both dimmed under "off" in a new project (research 59
		// §2.13: external audio's filter, external MIDI's and external audio's LFO)
		const module = /^key\.m([34])$/.exec(id);
		if (module && !s.shift && s.pages.auxiliary === Number(module[1])) {
			const p = aux.pages[s.auxTrack];
			const kind = PAGES[s.auxTrack][s.pages.auxiliary - 1];
			if (kind === 'filter') p.filterOn = !p.filterOn;
			else if (kind === 'lfo') p.lfo.on = !p.lfo.on;
			if (kind === 'filter' || kind === 'lfo') return true;
		}
		if (fxKey && s.shift && !muting) {
			// shift + T7 / T8 opens that slot's effect list (manual: fx/overview)
			const slot = id === 'track.7' ? 0 : 1;
			s.auxTrack = 6 + slot;
			s.active = 'auxiliary';
			aux.picker = { slot, index: Math.max(0, FX_TYPES.indexOf(aux.fx[slot].type)) };
			return true;
		}
		const key = keyboardIndex(id);
		if (key !== null && !stepHeld(s)) {
			// the brain's keyboard transposes, a chord to its lowest key as a sequenced chord does
			// (ours); the tape's plays clips (manual: brain, tape)
			if (s.auxTrack === 0) aux.brain.note = KEYBOARD_BASE + Math.min(...heldKeys(s));
			else if (s.auxTrack === 5) aux.tape.clip = key;
		}
		return false;
	},

	turn(ctx: AreaContext, e: number, delta: number): void {
		const s = ctx.state;
		const picker = s.areas.auxiliary.picker;
		if (picker) {
			// the white encoder scrolls the effect list (manual: fx/overview)
			if (e === 3) picker.index = clamp(picker.index + delta, 0, FX_TYPES.length - 1);
			return;
		}
		const kind = kindOf(s);
		switch (kind) {
			case 'brain':
				return turnBrain(s, e, delta);
			case 'route':
				return turnRoute(s, s.auxTrack, e, delta);
			case 'midi':
			case 'cc':
				return turnMidi(s, kind, e, delta);
			case 'audio':
			case 'tape':
			case 'fx':
				return turnMain(s, kind, e, delta);
			case 'filter':
			case 'sends':
				return turnFilter(s, kind, e, delta);
			case 'lfo':
				return turnLfo(s, e, delta);
			default:
				// punch-in FX and external CV have no settings (manual: punch-in-fx, external-cv)
				return;
		}
	},

	click(ctx: AreaContext, e: number): void {
		const s = ctx.state;
		const aux = s.areas.auxiliary;
		if (aux.picker) {
			if (e === 3) confirmPicker(s);
			return;
		}
		switch (kindOf(s)) {
			case 'route': {
				// any encoder click swaps tracks 1–4 and 5–8 (manual: routing-filter-lfo)
				const p = aux.pages[s.auxTrack];
				p.half = p.half === 0 ? 1 : 0;
				return;
			}
			case 'audio':
				// E1 switches the chosen input on or off (manual: external-audio)
				if (e === 0) aux.audio.on = !aux.audio.on;
				return;
			case 'brain':
				// E1 flips manual / auto like a turn (ours)
				if (e === 0) turnBrain(s, 0, currentBrain(s).auto ? -1 : 1);
				return;
			case 'lfo': {
				// E4 steps on through the destination page's encoders, as on instrument tracks (ours)
				if (e !== 3) return;
				const l = aux.pages[s.auxTrack].lfo;
				l.parameter = (l.parameter + 1) % 4;
				return;
			}
			default:
				return;
		}
	},

	/**
	 * On the tracks whose keys mean something of their own (brain transpositions, punch-in effects,
	 * tape clips) the pattern's notes light their keys as they play, like keys held by the
	 * sequencer (ours).
	 */
	leds(s: SimState, leds): void {
		const track = s.auxTrack;
		if ((track !== 0 && track !== 1 && track !== 5) || stepHeld(s)) return;
		for (const k of keysOf(soundingNotes(s, track))) {
			leds[`keyboard.${KEYBOARD_NOTE_NAMES[k]}` as KeyId] = 'white';
		}
	},

	/**
	 * The punch-in page's heartbeat runs while the page shows with no effect playing and waits at
	 * the left edge otherwise: it starts there as an effect ends (the device) or the page opens
	 * (ours).
	 */
	advance(s: SimState, ms: number): void {
		const aux = s.areas.auxiliary;
		const idle =
			auxiliary.owns(s) && !aux.picker && kindOf(s) === 'punch' && punchActive(s).length === 0;
		const beat = aux.heartbeat;
		beat.ms = idle ? (beat.ms + ms) % HEARTBEAT.loop : 0;
		// the screen reads only the column, so it redraws as the dot moves rather than every frame
		beat.col = heartbeatColumn(beat.ms);
	}
};
