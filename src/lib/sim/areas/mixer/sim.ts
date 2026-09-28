/**
 * The mixer area (decision D10; research 55 §6): mix mode's master pages — M2 EQ, M3 saturator, M4
 * group levels, compressor and master level (manual: mix/overview, mix/eq, mix/saturator,
 * mix/master) — and the midi engine's CC pages, M2 and M3 of an instrument track that runs the midi
 * engine (manual: instrument/engine-midi). Mixer M1 stays in the core, except for the second after
 * E1 or E2 turns there: the area then shows the selected track's FX sends over the core's strips as
 * the device does (docs/research/59-screen-profiling.md §2.10). Behaviour follows the manual; where
 * it is silent the choice is marked "ours". The pages are drawn in `draw.ts`.
 */
import { buildFrame } from '../../frames';
import type { SimInput } from '../../input';
import { clamp, detent, two, type SimState } from '../../params';
import type { ScreenFrame } from '../../screen/frame';
import { auxSends } from '../auxiliary/sim';
import type { AreaContext, SimArea } from '../types';
import { eqTilts, knobTravel } from './eq';
import type { MidiCcFrame, MixEqFrame, MixMasterFrame, MixSaturatorFrame } from './frames';
import { soloed, trackMeter } from './meters';
import { CC_MAX, EQ_BAND_RANGE, SEND_POPUP_MS, TONE_RANGE, defaultEq } from './state';

/** The EQ's bands in encoder order (E1–E3; E4 is blend). */
const EQ_BANDS = ['low', 'mid', 'high'] as const;

/**
 * A bipolar value as the header shows it: a sign and two digits like the device's other values,
 * with TE's en dash for minus ("+12", "–08"); "00" at the centre (ours: no art shows one).
 */
export function signed(v: number): string {
	const r = Math.round(v);
	if (r === 0) return '00';
	return `${r < 0 ? '–' : '+'}${String(Math.abs(r)).padStart(2, '0')}`;
}

/** The midi engine's CC page (2 or 3) the screen shows, or null. */
export function midiCcPage(s: SimState): 2 | 3 | null {
	if (s.mode !== 'instrument' || s.overlay !== null || s.sub !== null || s.picker !== null) {
		return null;
	}
	if (s.tracks[s.track].engine !== 'midi') return null;
	const page = s.pages.instrument;
	return page === 2 || page === 3 ? page : null;
}

/** The mix page (2–4) the screen shows, or null (M1 is the core's). */
export function mixPage(s: SimState): 2 | 3 | 4 | null {
	if (s.mode !== 'mix' || s.overlay !== null || s.sub !== null) return null;
	const page = s.pages.mix;
	return page === 1 ? null : page;
}

/** Whether the screen is on mix M1 (the core's strips), nothing open over it. */
export function mixStrips(s: SimState): boolean {
	return (
		s.mode === 'mix' &&
		s.pages.mix === 1 &&
		s.overlay === null &&
		s.sub === null &&
		s.picker === null
	);
}

/** Whether mix M1 shows the selected track's FX sends now (for a second after E1 or E2 turned). */
export function sendsShowing(s: SimState): boolean {
	return s.areas.mixer.sendPopup > 0 && mixStrips(s);
}

const encoderIndex = (id: string) => {
	const m = /^encoder\.([1-4])$/.exec(id);
	return m ? Number(m[1]) - 1 : -1;
};

// ─────────────────────────────────────────────────────────────────────────── frames

/**
 * Mix M1 with the sends up: the strips as the core builds them (from the state with the popup gone,
 * so the core answers), and FX I and FX II of the track the column belongs to. An auxiliary track
 * shows the sends its own M3 shift layer keeps (0 where it has none).
 */
function sendsFrame(s: SimState): ScreenFrame {
	const mixer = { ...s.areas.mixer, sendPopup: 0 };
	const base = buildFrame({ ...s, areas: { ...s.areas, mixer } });
	if (base.page !== 'mix') return base;
	const [, , fx1, fx2] =
		s.banks.mix === 'instrument'
			? s.tracks[s.track].sends
			: s.areas.auxiliary.pages[s.auxTrack].sends;
	return { page: 'mix-sends', base, sends: [fx1 / 99, fx2 / 99] };
}

/**
 * How far E4 has bent the EQ picture (0–1). The device's knob rests at its "N" end in a new project
 * (the 1.1.4 probes: E4 at its minimum leaves a new project's file untouched; the 1.1.33 captures:
 * the knob at "N", every band flat), while our blend starts at half, a new project file's fourth
 * EQ word, which those probes show E4 does not write. So the knob counts from half (ours).
 */
export function eqMorph(blend: number): number {
	return Math.max(0, Math.min(1, (blend - 50) / 49));
}

function eqFrame(s: SimState): MixEqFrame {
	const { low, mid, high, blend } = s.areas.mixer.eq;
	const bands: [number, number, number] = [
		low / EQ_BAND_RANGE,
		mid / EQ_BAND_RANGE,
		high / EQ_BAND_RANGE
	];
	const morph = eqMorph(blend);
	return {
		page: 'mix-eq',
		header: [
			{ label: 'low', value: signed(low) },
			{ label: 'mid', value: signed(mid) },
			{ label: 'high', value: signed(high) },
			{ label: 'blend', value: two(blend) }
		],
		bands,
		blend: blend / 99,
		tilts: eqTilts(bands, morph),
		knob: knobTravel(bands, morph)
	};
}

function saturatorFrame(s: SimState): MixSaturatorFrame {
	const { gain, clip, tone, mix } = s.areas.mixer.saturator;
	return {
		page: 'mix-saturator',
		header: [
			{ label: 'gain', value: two(gain) },
			{ label: 'clip', value: two(clip) },
			{ label: 'tone', value: signed(tone) },
			{ label: 'mix', value: two(mix) }
		],
		gain: gain / 99,
		clip: clip / 99,
		tone: tone / TONE_RANGE,
		mix: mix / 99
	};
}

/**
 * Mix M4. Engines join a group by themselves (manual: mix/master): the drum sampler the percussion
 * group, the synth engines and samplers the melodic group; the midi engine makes no sound. A group's
 * bar thickens with the loudest of its tracks, the master's with the louder group (ours: a group or
 * master level at its default, half, passes the signal at unity).
 */
function masterFrame(s: SimState): MixMasterFrame {
	const m = s.areas.mixer.master;
	const solo = soloed(s);
	// held keys solo the set the mixer shows: soloing auxiliary tracks leaves every instrument out
	const instrumentSolo = s.banks.mix === 'instrument' || solo.length === 0 ? solo : [-1];
	const meters: [number[], number[]] = [[], []];
	const members: [number[], number[]] = [[], []];
	s.tracks.forEach((t, i) => {
		if (t.engine === 'midi') return;
		const group = t.engine === 'drum' ? 0 : 1;
		members[group].push(i + 1);
		meters[group].push(trackMeter(s, t, i, instrumentSolo));
	});
	const through = (meter: number, level: number) => Math.min(1, (meter * level) / 50);
	const percussion = through(Math.max(0, ...meters[0]), m.percussion);
	const melodic = through(Math.max(0, ...meters[1]), m.melodic);
	return {
		page: 'mix-master',
		header: [
			{ label: 'percussion', value: two(m.percussion) },
			{ label: 'melodic', value: two(m.melodic) },
			{ label: 'compressor', value: two(m.compressor) },
			{ label: 'master', value: two(m.level) }
		],
		values: [m.percussion / 99, m.melodic / 99, m.compressor / 99, m.level / 99],
		meters: [percussion, melodic, through(Math.max(percussion, melodic), m.level)],
		groups: [members[0].join(' '), members[1].join(' ')]
	};
}

/**
 * The midi engine's M2 (slots 1–4) or M3 (slots 5–8). An off slot shows TE's crossed "none" box;
 * with shift held the boxes show the CC numbers, which shift + turn edits (ours: the manual names the
 * layers but not what the screen shows).
 */
function midiCcFrame(s: SimState, page: 2 | 3): MidiCcFrame {
	const first = (page - 2) * 4;
	const slots = s.areas.mixer.midiCc[s.track].slice(first, first + 4);
	return {
		page: 'midi-engine-cc',
		set: page === 2 ? 1 : 2,
		shift: s.shift,
		slots: slots.map((slot) => {
			if (slot.cc === null) return { label: 'off', value: null };
			if (s.shift) return { label: 'cc', value: String(slot.cc) };
			return { label: `cc ${slot.cc}`, value: String(slot.value) };
		})
	};
}

function frame(s: SimState): ScreenFrame {
	if (sendsShowing(s)) return sendsFrame(s);
	const cc = midiCcPage(s);
	if (cc !== null) return midiCcFrame(s, cc);
	switch (mixPage(s)) {
		case 3:
			return saturatorFrame(s);
		case 4:
			return masterFrame(s);
		default:
			return eqFrame(s);
	}
}

// ─────────────────────────────────────────────────────────────────────────── encoders

/**
 * Mix M1 with the sends up: E1 and E2 send the selected track to FX I and FX II as on the core's
 * strips (the same values as the track's M3 shift layer); an auxiliary track sends only where its
 * own layer has the send (external audio, tape, FX I into FX II).
 */
function turnSend(s: SimState, e: number, delta: number): void {
	const send = e + 2;
	if (s.banks.mix === 'instrument') {
		const sends = s.tracks[s.track].sends;
		sends[send] = detent(sends[send], delta, 0, 99);
	} else if (auxSends(s.auxTrack).includes(send)) {
		const sends = s.areas.auxiliary.pages[s.auxTrack].sends;
		sends[send] = detent(sends[send], delta, 0, 99);
	}
}

/**
 * The FX send popup (camera frames b1-069…096): a turn of E1 or E2 on mix M1 brings it up or keeps
 * it up; E3 or E4 (pan, level), an encoder push or any key press puts the strips back at once (ours:
 * the captures only show it snapping back once the turning stops).
 */
function sendPopup(s: SimState, input: SimInput): void {
	const m = s.areas.mixer;
	if (input.type === 'turn') {
		const e = encoderIndex(input.id);
		if (e === 0 || e === 1) {
			if (Math.trunc(input.delta) !== 0 && mixStrips(s)) m.sendPopup = SEND_POPUP_MS;
		} else if (e >= 0) m.sendPopup = 0;
	} else if (input.type === 'press' || input.type === 'click') m.sendPopup = 0;
}

/** Mix M2: E1–E3 cut or boost their band, E4 sets blend (manual: mix/eq). */
function turnEq(s: SimState, e: number, delta: number): void {
	const eq = s.areas.mixer.eq;
	if (e < 3) {
		const band = EQ_BANDS[e];
		eq[band] = clamp(eq[band] + delta, -EQ_BAND_RANGE, EQ_BAND_RANGE);
	} else eq.blend = clamp(eq.blend + delta, 0, 99);
}

/** Mix M3: gain, clip, tone (either side of neutral) and mix (manual: mix/saturator). */
function turnSaturator(s: SimState, e: number, delta: number): void {
	const sat = s.areas.mixer.saturator;
	if (e === 0) sat.gain = clamp(sat.gain + delta, 0, 99);
	else if (e === 1) sat.clip = clamp(sat.clip + delta, 0, 99);
	else if (e === 2) sat.tone = clamp(sat.tone + delta, -TONE_RANGE, TONE_RANGE);
	else sat.mix = clamp(sat.mix + delta, 0, 99);
}

/** Mix M4: percussion, melodic, compressor and master level (manual: mix/master). */
function turnMaster(s: SimState, e: number, delta: number): void {
	const m = s.areas.mixer.master;
	const field = (['percussion', 'melodic', 'compressor', 'level'] as const)[e];
	m[field] = clamp(m[field] + delta, 0, 99);
}

/**
 * A midi-engine CC slot (manual: instrument/engine-midi): turning sets its value, shift + turning
 * switches it on and picks its CC number. The number runs off, 0…127, the 129 steps the external
 * midi track's probes found (docs/research/10-xy-format.md §3.5); an off slot has no value to turn
 * (the same probes could not set one without switching the slot on first).
 */
function turnCc(s: SimState, page: 2 | 3, e: number, delta: number): void {
	const slot = s.areas.mixer.midiCc[s.track][(page - 2) * 4 + e];
	if (s.shift) {
		const next = (slot.cc ?? -1) + delta;
		slot.cc = next < 0 ? null : Math.min(CC_MAX, next);
	} else if (slot.cc !== null) slot.value = clamp(slot.value + delta, 0, CC_MAX);
}

// ─────────────────────────────────────────────────────────────────────────── the area

export const mixer: SimArea = {
	id: 'mixer',
	owns: (s) => midiCcPage(s) !== null || mixPage(s) !== null || sendsShowing(s),
	frame,
	claim(ctx: AreaContext, input: SimInput): boolean {
		sendPopup(ctx.state, input);
		return false;
	},
	press(ctx: AreaContext, id: string): boolean {
		const s = ctx.state;
		if (midiCcPage(s) === null) return false;
		// the midi engine has no filter: shift + M3 goes to the second CC page rather than opening
		// the filter types (ours; shift + M1 still brings up the preset browser, shift + M4 the LFO
		// types)
		const m = /^key\.m([23])$/.exec(id);
		if (!m) return false;
		s.pages.instrument = m[1] === '2' ? 2 : 3;
		return true;
	},
	turn(ctx: AreaContext, e: number, delta: number): void {
		const s = ctx.state;
		if (sendsShowing(s)) {
			// only E1 and E2 get here: any other turn took the popup down first (`sendPopup`)
			turnSend(s, e, delta);
			return;
		}
		const cc = midiCcPage(s);
		if (cc !== null) {
			turnCc(s, cc, e, delta);
			return;
		}
		const page = mixPage(s);
		if (page === 2) turnEq(s, e, delta);
		else if (page === 3) turnSaturator(s, e, delta);
		else if (page === 4) turnMaster(s, e, delta);
	},
	click(ctx: AreaContext, e: number): void {
		// mix M2: E1–E3 reset their band, E4 resets the whole EQ (manual: mix/eq, OS 1.1.15); the
		// manual gives the other pages' clicks nothing to do
		const s = ctx.state;
		if (mixPage(s) !== 2) return;
		const eq = s.areas.mixer.eq;
		if (e === 3) Object.assign(eq, defaultEq());
		else if (e >= 0 && e < 3) eq[EQ_BANDS[e]] = 0;
	},
	advance(s: SimState, ms: number): void {
		const m = s.areas.mixer;
		if (m.sendPopup > 0) m.sendPopup = Math.max(0, m.sendPopup - ms);
	}
};
