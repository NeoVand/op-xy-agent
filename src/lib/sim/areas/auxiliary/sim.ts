/**
 * Auxiliary tracks (T1–T8 with auxiliary): brain, punch-in FX, external MIDI, external CV,
 * external audio, tape, FX I and FX II, with their M1–M4 pages (guide art auxiliary-004 … 130;
 * manual: auxiliary/*, fx/*). The brain has a main page and routing; punch-in FX and external CV
 * have only their main page; external MIDI has CC slots on M2 and M3 and an LFO; external audio,
 * tape and the FX tracks have routing (M2), a filter with sends on its shift layer (M3) and an LFO
 * (M4). A track without a page keeps its main page on that key (ours: the manual lists no page).
 * Routing into external audio, tape and the FX tracks is the instrument tracks' own sends (the
 * community's project files store it there), so their M3 shift layer and mix M1 show the same
 * values. Aux tracks sequence like instrument tracks: brain notes transpose, punch-in notes fire
 * effects, tape notes play clips, and the CV needle follows the note playing. `shift + key` on an
 * instrument track fires punch-in effects from anywhere, so the area claims it.
 */
import { KEYBOARD_NOTE_NAMES, type KeyId } from '$lib/core/opxy';
import { LFO_SYNC_STEPS, clamp, two, type PageNumber, type SimState } from '../../params';
import type { ListFrame, LfoFrame, ScreenFrame } from '../../screen/frame';
import type { SoftLabel } from '../../screen/draw';
import type { SimInput } from '../../input';
import { currentPattern, stepAt, toggleNote } from '../../sequencer';
import type { AreaContext, SimArea } from '../types';
import type {
	AuxBrainFrame,
	AuxCcFrame,
	AuxFilterView,
	AuxFxFrame,
	AuxLfoFrame,
	AuxRouteFrame,
	AuxTapeFrame
} from './frames';
import {
	AUDIO_INPUTS,
	DELAY_SIZES,
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

/** Which instrument send (aux out, tape, FX I, FX II) each routing page sets; the brain has its own. */
const ROUTE_SEND: readonly (number | null)[] = [null, null, null, null, 0, 1, 2, 3];

/** What each routing page feeds. */
const ROUTE_TARGET = ['brain', '', '', '', 'aux out', 'tape', 'FX I', 'FX II'] as const;

/** The FX slots' names. */
const SLOT_NAMES = ['FX I', 'FX II'] as const;

/** External MIDI pages carry TE's soft labels (auxiliary-031); the other aux pages show none. */
const MIDI_SOFT: readonly SoftLabel[] = [
	{ text: 'main' },
	{ text: 'set I' },
	{ text: 'set II' },
	{ text: 'modulation' }
];

/** A module an aux LFO can reach and its parameters by encoder ('' where the page has none). */
interface Destination {
	readonly name: string;
	readonly params: readonly string[];
}

const FILTER_DESTINATION: Destination = {
	name: 'filter',
	params: ['high-pass', '', '', 'low-pass']
};

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

/** Notes on an aux track's step under the playhead while playing (none when stopped). */
function playingNotes(s: SimState, track: number): number[] {
	if (!s.transport.playing) return [];
	const pattern = currentPattern(s.aux[track].sequence);
	return pattern.steps[stepAt(pattern, s.transport.position)].notes.map((n) => n.note);
}

/** Keyboard keys (0–23) of notes, where they fall on the keyboard. */
const keysOf = (notes: readonly number[]) =>
	notes.map((n) => n - KEYBOARD_BASE).filter((k) => k >= 0 && k < KEYBOARD_NOTE_NAMES.length);

/** Sorted, without repeats. */
const unique = (keys: readonly number[]) => [...new Set(keys)].sort((a, b) => a - b);

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
 * The brain note in force: while playing, the latest note of the brain's pattern at or before the
 * playhead (the pattern loops, so a chord change holds until the next); else the last note played
 * on its keyboard. A chord transposes to its lowest note (ours).
 */
function brainNote(s: SimState): number | null {
	if (s.transport.playing) {
		const pattern = currentPattern(s.aux[0].sequence);
		const at = stepAt(pattern, s.transport.position);
		for (let back = 0; back < pattern.length; back++) {
			const notes = pattern.steps[(at - back + pattern.length) % pattern.length].notes;
			if (notes.length > 0) return Math.min(...notes.map((n) => n.note));
		}
	}
	return s.areas.auxiliary.brain.note;
}

/** The settings of the pattern the brain track plays. */
const currentBrain = (s: SimState) => brainSettings(s.areas.auxiliary, s.aux[0].sequence.current);

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
		title: `${KEYS[root]} ${SCALES[scale].name}`,
		auto: b.auto,
		root: KEYS[key],
		scale: SCALES[scale].name,
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
			return { routed: v > 0, amount: v / 99, value: two(v) };
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
	sends[send] = clamp(sends[send] + delta, 0, 99);
}

// ───────────────────────────────────────────────────────────── external midi and cv

/** A slot's name: its CC number when on. */
function slotLabel(aux: AuxiliaryState, slot: number): string {
	const cc = aux.midi.slots[slot].cc;
	return cc === null ? `slot ${slot + 1}` : `cc ${cc}`;
}

function ccFrame(s: SimState, set: 'I' | 'II'): AuxCcFrame {
	const aux = s.areas.auxiliary;
	const first = set === 'I' ? 0 : 4;
	return {
		page: 'aux-cc',
		set,
		shift: s.shift,
		slots: aux.midi.slots.slice(first, first + 4).map((slot, i) => {
			if (s.shift)
				return { label: `slot ${first + i + 1}`, value: slot.cc === null ? null : String(slot.cc) };
			return {
				label: slotLabel(aux, first + i),
				value: slot.cc === null ? null : String(slot.value)
			};
		}),
		soft: MIDI_SOFT
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
 * The CV track's pitch voltage: the note playing (while playing) or the last one played, at one
 * volt per octave with C4 at 0 V (ours: the manual gives no scaling), within the meter's ±5 V.
 */
function cvVolts(s: SimState): number {
	const playing = playingNotes(s, 3);
	const note = playing.length > 0 ? Math.min(...playing) : s.aux[3].sequence.lastNote;
	return clamp((note - 60) / 12, -5, 5);
}

// ───────────────────────────────────────────────────────── external audio, tape, fx

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
		pitch: `X${tape.pitch}`,
		speed: String(tape.speed),
		length: String(tape.length),
		mix: two(tape.mix),
		hits: unique(hits),
		head: (s.transport.position % loop) / loop,
		keys: unique([...heldKeys(s), ...keysOf(playingNotes(s, 5))]),
		clip: tape.clip === null ? '' : String(tape.clip + 1)
	};
}

function fxFrame(s: SimState, slot: 0 | 1): AuxFxFrame {
	const fx = s.areas.auxiliary.fx[slot];
	return {
		page: 'aux-fx',
		slot: SLOT_NAMES[slot],
		type: fx.type,
		params: FX_PARAMS[fx.type].map((label, i) => {
			const v = fx.params[i];
			if (fx.type === 'delay' && i === 0) {
				return { label, value: DELAY_SIZES[v], level: v / (DELAY_SIZES.length - 1) };
			}
			return { label, value: two(v), level: v / 99 };
		})
	};
}

/** The main pages' encoders (manual: auxiliary/external-audio, tape; fx/*). */
function turnMain(s: SimState, kind: Kind, e: number, delta: number): void {
	const aux = s.areas.auxiliary;
	const step = (v: number, min: number, max: number) => clamp(v + delta, min, max);
	if (kind === 'audio') {
		const a = aux.audio;
		if (e === 0) a.input = step(a.input, 0, AUDIO_INPUTS.length - 1);
		else if (e === 1) a.drive = step(a.drive, 0, 99);
		else if (e === 2) a.level = step(a.level, 0, 99);
		else a.mix = step(a.mix, 0, 99);
	} else if (kind === 'tape') {
		const t = aux.tape;
		if (e === 0) t.pitch = step(t.pitch, 1, 10);
		else if (e === 1) t.speed = step(t.speed, 50, 200);
		else if (e === 2) t.length = step(t.length, 1, 10);
		else t.mix = step(t.mix, 0, 99);
	} else if (kind === 'fx') {
		const fx = aux.fx[s.auxTrack === 6 ? 0 : 1];
		const max = fx.type === 'delay' && e === 0 ? DELAY_SIZES.length - 1 : 99;
		fx.params[e] = step(fx.params[e], 0, max);
	}
}

// ─────────────────────────────────────────────────────────────── filter, sends, lfo

function filterView(s: SimState): AuxFilterView {
	const p = s.areas.auxiliary.pages[s.auxTrack];
	return { highpass: p.highpass / 99, lowpass: p.lowpass / 99 };
}

/** The modules an aux track's LFO can reach (ours past the manual's "the track's own pages"). */
function destinations(s: SimState, track: number): readonly Destination[] {
	const aux = s.areas.auxiliary;
	switch (track) {
		case 2: {
			// the community's project files show three stops: off and the two CC sets
			const set = (first: number) => [0, 1, 2, 3].map((i) => slotLabel(aux, first + i));
			return [
				{ name: 'off', params: [] },
				{ name: 'set I', params: set(0) },
				{ name: 'set II', params: set(4) }
			];
		}
		case 4:
			return [{ name: 'audio', params: ['input', 'drive', 'level', 'mix'] }, FILTER_DESTINATION];
		case 5:
			return [{ name: 'tape', params: ['pitch', 'speed', 'length', 'mix'] }, FILTER_DESTINATION];
		default:
			return [
				{ name: 'fx', params: FX_PARAMS[aux.fx[track === 6 ? 0 : 1].type] },
				FILTER_DESTINATION
			];
	}
}

/** Encoders of a destination that have a parameter. */
const usable = (d: Destination) =>
	d.params.flatMap((name, i) => (name ? [i] : [])) as readonly number[];

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
		speed: lfoSpeed(l.speed),
		amount: (l.amount * 100) / 99,
		destinations: list.map((d) => d.name),
		destination: at,
		parameterName: list[at].params[l.parameter] ?? '',
		parameter: l.parameter,
		soft: track === 2 ? MIDI_SOFT : []
	};
}

/** E1 speed, E2 amount, E3 destination, E4 parameter (manual: auxiliary/routing-filter-lfo). */
function turnLfo(s: SimState, e: number, delta: number): void {
	const l = s.areas.auxiliary.pages[s.auxTrack].lfo;
	const list = destinations(s, s.auxTrack);
	if (e === 0) l.speed = clamp(l.speed + delta, 0, LFO_SYNC_STEPS.length + 99);
	else if (e === 1) l.amount = clamp(l.amount + delta, -99, 99);
	else if (e === 2) {
		l.destination = clamp(l.destination + delta, 0, list.length - 1);
		// a new module starts on its first parameter
		l.parameter = usable(list[l.destination])[0] ?? 0;
	} else {
		const params = usable(list[clamp(l.destination, 0, list.length - 1)]);
		const at = Math.max(0, params.indexOf(l.parameter));
		l.parameter = params[clamp(at + delta, 0, params.length - 1)] ?? 0;
	}
}

/** M3: E1 high-pass, E4 low-pass; with shift, the track's sends. */
function turnFilter(s: SimState, kind: Kind, e: number, delta: number): void {
	const p = s.areas.auxiliary.pages[s.auxTrack];
	if (kind === 'sends') {
		if (SENDS[s.auxTrack].includes(e)) p.sends[e] = clamp(p.sends[e] + delta, 0, 99);
	} else if (e === 0) p.highpass = clamp(p.highpass + delta, 0, 99);
	else if (e === 3) p.lowpass = clamp(p.lowpass + delta, 0, 99);
}

// ────────────────────────────────────────────────────────────────── the effect list

/** The list shift + T7 / T8 opens (manual: fx/overview), drawn like the core's pickers. */
function pickerFrame(s: SimState): ListFrame {
	const picker = s.areas.auxiliary.picker ?? { slot: 0, index: 0 };
	return {
		page: 'list',
		columns: [
			{
				items: [String(7 + picker.slot), 'fx'],
				selected: null,
				style: 'outline',
				x: 5,
				width: 100
			},
			{ items: FX_TYPES, selected: picker.index, style: 'white', x: 120, width: 170 }
		],
		soft: []
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
		case 'punch':
			return {
				page: 'aux-punch',
				active: unique([...heldKeys(s), ...keysOf(playingNotes(s, 1))])
			};
		case 'midi': {
			const m = aux.midi;
			return {
				page: 'aux-midi',
				channel: String(m.channel),
				bank: m.bank === null ? null : String(m.bank),
				program: m.program === null ? null : String(m.program),
				soft: MIDI_SOFT
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
				drive: two(a.drive),
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
			return { page: 'aux-filter', ...filterView(s) };
		case 'sends': {
			const sends = aux.pages[track].sends;
			return {
				page: 'aux-sends',
				filter: filterView(s),
				values: sends.map((v, i) => (SENDS[track].includes(i) ? two(v) : null))
			};
		}
		case 'lfo':
			return lfoFrame(s, track);
	}
}

/**
 * The punch-in shortcut (manual: auxiliary/punch-in-fx): on an instrument track `shift + key` fires
 * that key's effect instead of playing a note (the lower octave on the track, the upper on its
 * group), and a live recording writes it to the punch-in track at the playhead. Not on a midi
 * engine track (our reading of OS 1.0.32's "not while external MIDI is in use"). Areas asked
 * earlier (a player that takes shift + keys for its chord) win.
 */
function punchShortcut(s: SimState, input: SimInput): boolean {
	if (input.type !== 'press' || !s.shift || s.mode !== 'instrument') return false;
	if (s.overlay !== null || s.sub !== null || s.picker !== null) return false;
	if (s.tracks[s.track].engine === 'midi') return false;
	const key = keyboardIndex(input.id);
	if (key === null || stepHeld(s)) return false;
	if (s.transport.recording && s.transport.playing) {
		const pattern = currentPattern(s.aux[1].sequence);
		const at = stepAt(pattern, s.transport.position);
		const note = KEYBOARD_BASE + key;
		if (!pattern.steps[at].notes.some((n) => n.note === note)) toggleNote(pattern, at, note);
	}
	return true;
}

export const auxiliary: SimArea = {
	id: 'auxiliary',
	owns: (s) => s.overlay === null && s.sub === null && s.mode === 'auxiliary',
	frame: auxFrame,

	claim: (ctx: AreaContext, input: SimInput) => punchShortcut(ctx.state, input),

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
			// the keyboard auditions while choosing; any other key leaves the list and does its job
			if (id.startsWith('keyboard.')) return false;
			if (!(fxKey && s.shift)) aux.picker = null;
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
			// the brain's keyboard transposes; the tape's plays clips (manual: brain, tape)
			if (s.auxTrack === 0) aux.brain.note = KEYBOARD_BASE + key;
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
				// E4 steps through the destination's parameters, as on instrument tracks (ours)
				if (e !== 3) return;
				const l = aux.pages[s.auxTrack].lfo;
				const list = destinations(s, s.auxTrack);
				const params = usable(list[clamp(l.destination, 0, list.length - 1)]);
				if (params.length === 0) return;
				l.parameter = params[(Math.max(0, params.indexOf(l.parameter)) + 1) % params.length];
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
		for (const k of keysOf(playingNotes(s, track))) {
			leds[`keyboard.${KEYBOARD_NOTE_NAMES[k]}` as KeyId] = 'white';
		}
	}
};
