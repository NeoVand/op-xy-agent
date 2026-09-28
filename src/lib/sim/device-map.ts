/**
 * The device map (Phase F4, with F3's screen descriptions): every page of the OP-XY the simulator
 * draws, as data, so the agent looks a page up instead of guessing a key combo. For each page it
 * records the keys that reach it from a new project (the navigator's plans, played on a copy), what
 * the screen says there (`describeFrame`: "what will I see?"), and each encoder on each layer
 * (turned, turned with shift, on the page's other view, clicked): its label as the page names it,
 * its range and display format (read while turning it end to end on a copy), what a click does,
 * the CC on its lane with what the owner's unit did with that CC on OS 1.1.33 (research 59 §3),
 * and the manual's note on it. Nothing here lists a page's encoders: each one is found by turning
 * it and watching the page, so the map keeps up with the simulator. `scripts/build-device-map.mjs`
 * writes `knowledge/opxy/device-map.json`, and a test fails while the committed file is stale.
 */
import manualText from '$knowledge/manual/build/manual.json?raw';
import {
	CcMapError,
	ENGINE_IDS,
	REFERENCE_FIRMWARE,
	getEngine,
	getTrack,
	resolveCc,
	type CcTarget,
	type Confidence,
	type EngineId,
	type LaneLayer
} from '$lib/core/opxy';
import { FX_TYPES, type FxType } from './areas/auxiliary/state';
import { lockTarget } from './areas/sequencer/locks';
import { activeRegion } from './areas/sample/m1';
import { NEW_PROJECT_TRACKS } from './defaults';
import { buildFrame } from './frames';
import {
	PARAMS,
	REGION_PARAMS,
	TEMPO_PARAMS,
	frameValues,
	pageValues,
	planPageValue,
	planParam,
	planPlace,
	plannable,
	playStep,
	type NavPlan,
	type PageValueGoal,
	type ParamGoal,
	type Place
} from './navigator';
import { OpxySim } from './opxy-sim.svelte';
import { LFO_TYPES, defaultState, type PageNumber, type SimState } from './params';
import type { PlayerType } from './sequencer';
import type { ScreenFrame } from './screen/frame';
import { describeFrame } from './screen/render';

/** Where the build writes the map (relative to the repository). */
export const DEVICE_MAP_FILE = 'knowledge/opxy/device-map.json';

/**
 * A layer of a page: its encoders turned, turned with shift held, turned on the page's other view
 * (M2's filter envelope, a click away), clicked, or clicked with shift held. The names are the
 * manual's parameter tables' (and the CC map's `alt`).
 */
export type MapLayer = 'base' | 'shift' | 'alt' | 'click' | 'shift-click';

/** One step from a new project, in the key grammar (`T3`, `shift + M4`, `turn E1`). */
export interface MapStep {
	readonly keys: string;
	/** A turn's detents: + clockwise, − counter-clockwise. */
	readonly clicks?: number;
}

/** A run of readings the page writes differently ("00" to "09" shows as "2:1"). */
export interface MapShows {
	readonly from: string;
	readonly to: string;
	readonly shows: string;
}

/** An encoder's range, read off the page while turning it from one end to the other. */
export interface MapRange {
	/** The reading at the counter-clockwise end, and at the clockwise end. */
	readonly first: string;
	readonly last: string;
	/** Detents from one end to the other. */
	readonly detents: number;
	/** Every reading in order, when it is a short list of choices. */
	readonly values?: readonly string[];
	/** The change a detent makes, when every detent makes the same one. */
	readonly step?: number;
	/** The change a detent makes with the encoder pushed in, where that is finer. */
	readonly fine?: number;
	/** Readings between the ends (and on both sides of a jump), for longer ranges. */
	readonly examples?: readonly string[];
	/** Where the screen writes something else than the reading (not just a unit after it). */
	readonly shows?: readonly MapShows[];
}

/** What the owner's unit did with a CC on OS 1.1.33: moved the page, ignored it, or not tried. */
export type MidiReach = 'answers' | 'ignores' | 'untested';

/** The CC on a control's lane. */
export interface MapMidi {
	readonly cc: number;
	/** `track`: the track's own channel (track N listens on channel N); `any`; or one channel. */
	readonly channel: 'track' | 'any' | number;
	/** Research 59 §3 (and the probe log for FX I's send). */
	readonly reach: MidiReach;
	/** The CC map's confidence in the lane, where it lists it for this track. */
	readonly confidence?: Confidence;
}

/** One encoder on one layer of a page. */
export interface MapControl {
	/** The gesture in the key grammar: `turn E1`, `shift + turn E2`, `click E4`. */
	readonly keys: string;
	readonly layer: MapLayer;
	readonly encoder: 1 | 2 | 3 | 4;
	/**
	 * What the page calls it (the navigator's words for instrument parameters); a click has one
	 * where the manual names it.
	 */
	readonly label?: string;
	/**
	 * What `plan_steps` takes to set it (tried on a copy): a parameter id for instrument and tempo
	 * values, the label on auxiliary, mixer and player pages. Absent: plan_steps cannot set it.
	 */
	readonly param?: string;
	/** The reading where the path leaves it (a new project's value there). */
	readonly value?: string;
	/** Turns: what it runs over. */
	readonly range?: MapRange;
	/** Clicks: what the click changes. */
	readonly does?: string;
	/** A gesture that has to come first for this one to move anything. */
	readonly needs?: string;
	readonly midi?: MapMidi;
	/** The manual's note on it. */
	readonly about?: string;
}

/** A module key, or shift and a module key, that opens another page from this one. */
export interface MapKey {
	readonly keys: string;
	/** What the screen shows after it. */
	readonly opens: string;
}

/** The part of the device a page belongs to. */
export type MapArea = 'instrument' | 'auxiliary' | 'mix' | 'tempo' | 'player' | 'project' | 'com';

/** One page. */
export interface MapPage {
	/** `instrument.m1.prism`, `instrument.m4.duck`, `auxiliary.tape.m1`, `mix.m2`, `tempo`… */
	readonly id: string;
	readonly name: string;
	readonly area: MapArea;
	/** The track the page is shown on: 1–8 instrument, 9–16 auxiliary. */
	readonly track?: number;
	/** The keys from a new project (none: a new project opens on it). */
	readonly path: readonly MapStep[];
	/** What the screen says there, as the replica's screen reader says it. */
	readonly screen: string;
	/** With shift held, where that changes the page. */
	readonly shiftScreen?: string;
	/** On the page's other view (M2: the filter envelope). */
	readonly altScreen?: string;
	/** The labels over M1–M4. */
	readonly soft?: readonly string[];
	/** Module keys that open another page from here. */
	readonly keys?: readonly MapKey[];
	readonly note?: string;
	/** Units of our manual about the page, the main one first. */
	readonly units?: readonly string[];
	/**
	 * The section of research note 59 on the device's own screen for this page (camera captures on
	 * OS 1.1.33, which the simulator's page was rebuilt from); absent where it was never captured.
	 */
	readonly captured?: string;
	readonly controls: readonly MapControl[];
}

/** The whole map. */
export interface DeviceMap {
	readonly about: string;
	readonly firmware: string;
	readonly layers: Readonly<Record<MapLayer, string>>;
	readonly pages: readonly MapPage[];
}

/** A page the map cannot build: the simulator no longer gets there or shows what it should. */
export class DeviceMapError extends Error {
	override name = 'DeviceMapError';
}

// ─────────────────────────────────────────────────────────────────────────── the simulator

/** A private copy of the simulator at `state`. */
function simAt(state: SimState): OpxySim {
	return new OpxySim({ state: JSON.parse(JSON.stringify(state)) as SimState, now: () => 0 });
}

const frameOf = (sim: OpxySim): ScreenFrame => buildFrame(sim.state);
const screenOf = (sim: OpxySim): string => describeFrame(frameOf(sim));

function turn(sim: OpxySim, e: number, detents: number, fine = false): void {
	sim.turn((e + 1) as 1 | 2 | 3 | 4, detents, fine);
}

/**
 * A state to take copies of the simulator from, serialised once: probing a page copies its state
 * hundreds of times, and a project's state is large.
 */
class Fork {
	readonly json: string;

	constructor(readonly state: SimState) {
		this.json = JSON.stringify(state);
	}

	/** A fresh copy of the simulator at the state. */
	sim(): OpxySim {
		return new OpxySim({ state: JSON.parse(this.json) as SimState, now: () => 0 });
	}

	/** A copy after `detents` of encoder `e`. */
	turned(e: number, detents: number): OpxySim {
		const sim = this.sim();
		turn(sim, e, detents);
		return sim;
	}

	/** A fork of what `play` leaves on a copy. */
	after(play: (sim: OpxySim) => void): Fork {
		const sim = this.sim();
		play(sim);
		return new Fork(sim.state);
	}
}

/** The page, and the page after a detent of one encoder each way (read, never played on). */
interface Trio {
	readonly before: OpxySim;
	readonly up: OpxySim;
	readonly down: OpxySim;
}

/**
 * Plays a map path on a simulator (the tests replay every page's path on a new project): the
 * navigator's steps, `shift + player → + player` (shift kept down while player is pressed again)
 * among them.
 */
export function playPath(sim: OpxySim, steps: readonly MapStep[]): void {
	for (const step of steps) playStep(sim, step);
}

/** Walks a copy of a new project to a page, keeping the steps. */
class Walk {
	readonly sim = simAt(defaultState());
	readonly steps: MapStep[] = [];

	constructor(readonly id: string) {}

	/** Follows the navigator's plan to a page. */
	place(place: Place): void {
		this.#follow(planPlace(this.sim.state, place));
	}

	/** Follows the navigator's plan that sets a parameter (an engine, a list pick). */
	param(goal: ParamGoal): void {
		this.#follow(planParam(this.sim.state, goal));
	}

	/** Follows the navigator's plan that sets a value a page shows (an FX track's effect). */
	value(goal: PageValueGoal): void {
		this.#follow(planPageValue(this.sim.state, goal));
	}

	#follow(plan: NavPlan): void {
		if (!plan.reached) {
			throw new DeviceMapError(`${this.id}: ${plan.note ?? 'the navigator does not get there'}`);
		}
		for (const step of plan.steps) this.keys(step.keys, step.clicks);
	}

	/** Plays a step of its own. */
	keys(keys: string, clicks?: number): void {
		const step = clicks === undefined ? { keys } : { keys, clicks };
		playPath(this.sim, [step]);
		this.steps.push(step);
	}
}

// ─────────────────────────────────────────────────────────────────────────── what the page reads

/** What the reading of a value the page does not show is ("no linked track"). */
const NONE = 'none';

/** How a control reads: its label, the parameter plan_steps may take, and its value now. */
interface Reader {
	readonly label: string;
	/** An instrument or tempo parameter id (checked with the navigator before it is kept). */
	readonly param?: string;
	read(sim: OpxySim): string | undefined;
	/** What the page writes for it, where that can differ from the reading. */
	shows?(sim: OpxySim): string | undefined;
}

/** A layer of a page being probed: its state (shift held for the shift layer). */
interface Probe {
	readonly spec: PageSpec;
	readonly fork: Fork;
	readonly layer: 'base' | 'shift' | 'alt';
}

const onOff = (on: boolean) => (on ? 'on' : 'off');

/**
 * What the page writes for encoder `e`'s value: an engine page's top-bar cell (a ratio, a table's
 * name), else the value the page's description gives under the label.
 */
function written(sim: OpxySim, e: number, label: string): string | undefined {
	const frame = frameOf(sim);
	if (frame.page === 'synth') {
		const cell = frame.header[e];
		return cell ? cell.value || cell.label : undefined;
	}
	return pageValues(describeFrame(frame)).get(label.toLowerCase());
}

/**
 * Instrument pages: the lock registry says which parameter an encoder turns there (it mirrors the
 * core's turns), with its label, range and format; plan_steps sets the same ids (a drum key's as
 * `key.tune`: the key selected, or the one plan_steps is given).
 */
function lockReader(p: Probe, e: number): Reader | null {
	const lock = lockTarget(p.fork.state, e);
	if (!lock) return null;
	const param = lock.id.replace(/^key\d+\./, 'key.');
	return {
		label: lock.label,
		...(plannable(param) ? { param } : {}),
		read: (sim) => lock.format(lock.get(sim.state.tracks[sim.state.track])),
		shows: (sim) => written(sim, e, lock.label)
	};
}

/** The synth sampler's and a multisampler zone's M1 values (the lock registry keeps drum keys'). */
function regionReader(p: Probe, e: number): Reader | null {
	const s = p.fork.state;
	if (s.mode !== 'instrument' || s.pages.instrument !== 1 || !activeRegion(s)) return null;
	if (buildFrame(s).page !== 'drum' || p.layer === 'alt') return null;
	const region = REGION_PARAMS.find((r) => r.encoder === e && r.shift === (p.layer === 'shift'));
	if (!region) return null;
	return {
		label: region.label,
		param: region.id,
		read: (sim) => {
			const r = activeRegion(sim.state);
			return r ? region.format(region.get(r)) : undefined;
		}
	};
}

/** The tempo page's four values, as the navigator sets them. */
function tempoReader(p: Probe, e: number): Reader | null {
	if (buildFrame(p.fork.state).page !== 'tempo') return null;
	const entry = Object.entries(TEMPO_PARAMS).find(([, t]) => t.encoder === e);
	if (!entry) return null;
	const [id, param] = entry;
	const label = PARAMS.find((q) => q.id === id)?.names[0] ?? id;
	return {
		label,
		param: id,
		read: (sim) => param.format(param.get(sim.state)),
		shows: (sim) => written(sim, e, label)
	};
}

/**
 * Values the page draws but its description leaves out or runs together (a list's boxed item, the
 * brain's mode and link box, a routing page's track boxes, CC slots, the LFO's speed card, the
 * player's cards), read off the frame as the navigator reads them, so plan_steps takes the same
 * names: the first a detent each way reads differently.
 */
function frameReader(_p: Probe, _e: number, trio: Trio): Reader | null {
	const values = (sim: OpxySim) => frameValues(frameOf(sim));
	const [before, up, down] = [values(trio.before), values(trio.up), values(trio.down)];
	const labels = new Set([...before.keys(), ...up.keys(), ...down.keys()]);
	const label = [...labels].find((l) => up.has(l) && down.has(l) && up.get(l) !== down.get(l));
	if (label === undefined) return null;
	return { label, read: (sim) => values(sim).get(label) };
}

/**
 * The value the page's description lists that a detent of `e` changes: a label a detent each way
 * reads differently (FX II's "size", the mixer's "fx i", which only its popup shows), else any
 * label a detent changes. The last such label wins: a description opens with its summary ("brain:
 * c major, …"), whose words move along with the value they sum up.
 */
function describedReader(_p: Probe, _e: number, trio: Trio): Reader | null {
	const values = (sim: OpxySim) => pageValues(screenOf(sim));
	const [before, up, down] = [values(trio.before), values(trio.up), values(trio.down)];
	const labels = [...new Set([...before.keys(), ...up.keys(), ...down.keys()])].reverse();
	const label =
		labels.find((l) => up.has(l) && down.has(l) && up.get(l) !== down.get(l)) ??
		labels.find((l) => up.get(l) !== down.get(l)) ??
		labels.find((l) => up.get(l) !== before.get(l) || down.get(l) !== before.get(l));
	if (label === undefined) return null;
	return { label, read: (sim) => values(sim).get(label) };
}

/** A frame's values by path (`speed.label`), long arrays (waveforms) left out. */
function leaves(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
	if (value === null || typeof value !== 'object') {
		const text =
			typeof value === 'boolean'
				? onOff(value)
				: typeof value === 'number'
					? String(Math.round(value * 1000) / 1000)
					: String(value);
		out.set(path, text);
		return out;
	}
	if (Array.isArray(value) && value.length > 32) return out;
	for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, out);
	return out;
}

/** A frame path in words: its last two parts, counted from 1 (`sampler.loop.type` → loop type). */
function pathLabel(path: string): string {
	return path
		.split('.')
		.slice(-2)
		.map((part) => (/^\d+$/.test(part) ? String(Number(part) + 1) : part))
		.join(' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase();
}

/**
 * The last resort: the first value of the frame a detent changes. A detent that only brings up
 * another page (a popup) changes no value.
 */
function diffReader(_p: Probe, _e: number, trio: Trio): Reader | null {
	const frames = [frameOf(trio.before), frameOf(trio.up), frameOf(trio.down)];
	if (frames.some((f) => f.page !== frames[0].page)) return null;
	const [before, up, down] = frames.map((f) => leaves(f));
	const path = [...before.keys()].find(
		(k) => up.get(k) !== down.get(k) || up.get(k) !== before.get(k) || down.get(k) !== before.get(k)
	);
	if (path === undefined) return null;
	return { label: pathLabel(path), read: (sim) => leaves(frameOf(sim)).get(path) };
}

/**
 * Whether a detent of `e` either way changes what `reader` reads. A value that only a popup shows
 * must read differently each way: an encoder that calls up the popup with nothing to change (an
 * auxiliary track's FX sends on mix M1, where it has none) does not count.
 */
function moves(trio: Trio, reader: Reader): boolean {
	const [before, up, down] = [trio.before, trio.up, trio.down].map((sim) => reader.read(sim));
	if (up !== down) return true;
	return before !== undefined && up !== undefined && up !== before;
}

/** Where readers come from, most exact first. */
const FINDERS: readonly ((p: Probe, e: number, trio: Trio) => Reader | null)[] = [
	lockReader,
	regionReader,
	tempoReader,
	frameReader,
	describedReader,
	diffReader
];

/** The first reader that moves with encoder `e`. */
function readerFor(p: Probe, e: number): Reader | null {
	const trio = { before: p.fork.sim(), up: p.fork.turned(e, 1), down: p.fork.turned(e, -1) };
	for (const find of FINDERS) {
		const reader = find(p, e, trio);
		if (reader && moves(trio, reader)) return reader;
	}
	return null;
}

// ─────────────────────────────────────────────────────────────────────────── ranges

/** Detents after which an unchanged reading means the end of the range. */
const STILL = 12;
/** The most detents a sweep turns (a sampler's tune runs 960 end to end). */
const LONGEST = 3000;

/** Turns `e` counter-clockwise until the reading stops changing. */
function toStart(sim: OpxySim, e: number, reader: Reader): void {
	let last = reader.read(sim);
	for (let still = 0, n = 0; still < STILL && n < LONGEST; n++) {
		turn(sim, e, -1);
		const now = reader.read(sim);
		still = now === last ? still + 1 : 0;
		last = now;
	}
}

/** The readings from end to end, the detents to each, and what the page writes at each. */
interface Sweep {
	readonly readings: readonly string[];
	readonly at: readonly number[];
	readonly written: readonly (string | undefined)[];
}

function sweep(fork: Fork, e: number, reader: Reader): Sweep {
	const sim = fork.sim();
	toStart(sim, e, reader);
	const readings = [reader.read(sim) ?? NONE];
	const at = [0];
	const written = [reader.shows?.(sim)];
	for (let still = 0, n = 1; still < STILL && n <= LONGEST; n++) {
		turn(sim, e, 1);
		const now = reader.read(sim) ?? NONE;
		if (now === readings[readings.length - 1]) {
			still++;
			continue;
		}
		still = 0;
		readings.push(now);
		at.push(n);
		written.push(reader.shows?.(sim));
	}
	return { readings, at, written };
}

/** A reading as a number ("+1.50", "–08", "x4", "12.5%"), or NaN. */
function numberOf(reading: string): number {
	const m = /^x?([+\-–−]?\d+(?:\.\d+)?)%?$/.exec(reading);
	return m ? Number(m[1].replace(/^[–−]/, '-').replace(/^\+/, '')) : NaN;
}

const rounded = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The change a detent makes with the encoder pushed in, where it differs from a plain detent: one
 * of each from the page (the other way at the top of the range).
 */
function fineStep(fork: Fork, e: number, reader: Reader): number | undefined {
	const from = numberOf(reader.read(fork.sim()) ?? '');
	for (const dir of [1, -1]) {
		const fine = fork.sim();
		turn(fine, e, dir, true);
		const a = numberOf(reader.read(fork.turned(e, dir)) ?? '') - from;
		const b = numberOf(reader.read(fine) ?? '') - from;
		if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
		if (a === 0 || b === 0) continue;
		return Math.abs(Math.abs(a) - Math.abs(b)) > 1e-9 ? rounded(Math.abs(b)) : undefined;
	}
	return undefined;
}

/**
 * Up to six readings spread between the ends, and those on both sides of a jump back (an LFO's
 * synced speeds running on into its free range).
 */
function examplesOf(readings: readonly string[], numbers: readonly number[]): string[] {
	const n = readings.length;
	const picks = new Set<number>();
	for (let k = 1; k <= 6; k++) picks.add(Math.round((k * (n - 1)) / 7));
	numbers.forEach((v, i) => {
		if (i > 0 && v < numbers[i - 1]) picks.add(i - 1).add(i);
	});
	picks.delete(0);
	picks.delete(n - 1);
	return [...picks].sort((a, b) => a - b).map((i) => readings[i]);
}

/**
 * Where the page writes something else than the reading, as runs of the same text. Only when
 * what it writes changes over the range (the tempo page's "metronome off" is its switch, not the
 * level), and not for a unit or a note after the reading ("120 bpm", "1 (audio)") or a reading
 * that says more than the page's words ("syn free" where the description says "syn").
 */
function showsOf(s: Sweep): MapShows[] | undefined {
	const texts = new Set(s.written.filter((t): t is string => t !== undefined));
	if (texts.size < 2) return undefined;
	const runs: { from: string; to: string; shows: string; at: number }[] = [];
	s.readings.forEach((reading, i) => {
		const text = s.written[i];
		if (text === undefined || text === reading) return;
		if (text.startsWith(`${reading} `) || reading.startsWith(`${text} `)) return;
		const last = runs[runs.length - 1];
		if (last && last.at === i - 1 && last.shows === text) {
			last.to = reading;
			last.at = i;
		} else runs.push({ from: reading, to: reading, shows: text, at: i });
	});
	if (runs.length === 0 || runs.length > 24) return undefined;
	return runs.map(({ from, to, shows }) => ({ from, to, shows }));
}

/**
 * Whether numbers move by the same step each detent. The last step may fall short where the range
 * stops (a sample's start, which stays a tenth of a percent before its end).
 */
function evenSteps(numbers: readonly number[]): boolean {
	const steps = numbers.slice(1).map((n, i) => n - numbers[i]);
	if (steps.length === 0 || !numbers.every(Number.isFinite)) return false;
	const [first, last] = [steps[0], steps[steps.length - 1]];
	const same = (d: number) => Math.abs(d - first) < 1e-9;
	const short = Math.sign(last) === Math.sign(first) && Math.abs(last) < Math.abs(first);
	return steps.slice(0, -1).every(same) && (same(last) || short);
}

function rangeOf(s: Sweep, fine: number | undefined): MapRange {
	const { readings } = s;
	const numbers = readings.map(numberOf);
	const steps = numbers.slice(1).map((n, i) => n - numbers[i]);
	const even = evenSteps(numbers);
	const shows = showsOf(s);
	const values = !even && readings.length <= 16 ? readings : undefined;
	return {
		first: readings[0],
		last: readings[readings.length - 1],
		detents: s.at[s.at.length - 1],
		...(values ? { values } : {}),
		...(even ? { step: rounded(steps[0]) } : {}),
		...(even && fine !== undefined ? { fine } : {}),
		...(!even && !values ? { examples: examplesOf(readings, numbers) } : {}),
		...(shows ? { shows } : {})
	};
}

// ─────────────────────────────────────────────────────────────────────────── MIDI

/** How the owner's unit treats a track's CCs, by what the track runs. */
export type ReachKind =
	| 'synth'
	| 'sampler'
	| 'midi-engine'
	| 'brain'
	| 'punch-in'
	| 'external-midi'
	| 'external-cv'
	| 'external-audio'
	| 'tape'
	| 'fx-i'
	| 'fx-ii';

const cc = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Level, mute and pan, which answered on instrument tracks (track 3; mute on track 1). */
const MIXER_CCS = [7, 9, 10];
/**
 * The instrument pages' lanes past M1: the envelopes, the filter, FX I's send and the LFO. Seen on
 * a synth track; research 59 counts every page as answering but the three samplers' M1.
 */
const TRACK_PAGE_CCS = [...cc(20, 27), ...cc(32, 35), 38, ...cc(40, 43)];

/**
 * What the owner's unit did with each track's CCs on OS 1.1.33 (research 59 §3, watched on its
 * screen; FX I's send CC38 from the probe log's first session): the CCs that moved the page and
 * the ones it ignored. A CC not listed was not tried. `set_sound` keeps to the same lanes.
 */
const MIDI_REACH: Readonly<
	Record<ReachKind, { readonly answers: readonly number[]; readonly ignores?: readonly number[] }>
> = {
	synth: { answers: [...MIXER_CCS, ...cc(12, 15), ...TRACK_PAGE_CCS] },
	sampler: { answers: [...MIXER_CCS, ...TRACK_PAGE_CCS], ignores: cc(12, 15) },
	'midi-engine': { answers: MIXER_CCS },
	brain: { answers: cc(12, 15), ignores: [32, 35] },
	'punch-in': { answers: [] },
	'external-midi': { answers: [...cc(12, 14), ...cc(40, 43)] },
	'external-cv': { answers: [], ignores: cc(12, 15) },
	'external-audio': { answers: [...cc(13, 15), 32, 35, ...cc(40, 43)] },
	tape: { answers: cc(12, 15) },
	'fx-i': { answers: cc(12, 15) },
	'fx-ii': { answers: [] }
};

/** What the unit did with `cc` on a track of this kind. */
export function midiReach(kind: ReachKind, cc: number): MidiReach {
	const reach = MIDI_REACH[kind];
	if (reach.answers.includes(cc)) return 'answers';
	return reach.ignores?.includes(cc) ? 'ignores' : 'untested';
}

/** The kinds of tracks {@link midiReach} knows. */
export const REACH_KINDS = Object.keys(MIDI_REACH) as ReachKind[];

/** The CC map's target as a control's MIDI, with the unit's reach. */
function midiOfTarget(target: CcTarget, kind: ReachKind, channel: MapMidi['channel']): MapMidi {
	return {
		cc: target.cc,
		channel,
		reach: midiReach(kind, target.cc),
		confidence: target.confidence
	};
}

/**
 * The CC on encoder `e`'s lane of a track's module page (the lane model: M1 12–15, M2 20–23 and
 * its filter envelope 24–27, …). A lane the CC map does not list for the track is only a
 * prediction, kept where the unit was seen answering or ignoring it.
 */
function laneMidi(
	track: number,
	kind: ReachKind,
	module: PageNumber,
	layer: LaneLayer,
	e: number
): MapMidi | undefined {
	let target: CcTarget;
	try {
		target = resolveCc({ track, lane: { module, layer, encoder: (e + 1) as 1 | 2 | 3 | 4 } });
	} catch (error) {
		// no lane on this layer (M4 has no shift lanes)
		if (error instanceof CcMapError) return undefined;
		throw error;
	}
	if (!target.param.startsWith('lane.')) return midiOfTarget(target, kind, 'track');
	const reach = midiReach(kind, target.cc);
	return reach === 'untested' ? undefined : { cc: target.cc, channel: 'track', reach };
}

/** A per-track CC by the CC map's name, on the track's channel. */
const trackCc = (track: number, param: string, kind: ReachKind) =>
	midiOfTarget(resolveCc({ track, param }), kind, 'track');

/** The mixer's strips: sends, pan, level and (click E4) mute on the strip's track's channel. */
function stripMidi(track: number, kind: ReachKind) {
	return (layer: MapLayer, e: number): MapMidi | undefined => {
		if (layer === 'click') return e === 3 ? trackCc(track, 'mute', kind) : undefined;
		if (layer !== 'base') return undefined;
		// FX I and II are the track's own sends (its M3 shift layer's lanes); auxiliary strips send
		// through their own pages
		if (e < 2)
			return kind === 'synth' ? trackCc(track, e === 0 ? 'send.fx1' : 'send.fx2', kind) : undefined;
		return trackCc(track, e === 2 ? 'pan' : 'level', kind);
	};
}

/** Mix M2: CC90 tilts one band per channel (1 low, 2 mid, 3 high); channel 4 (blend) did nothing. */
function eqMidi(layer: MapLayer, e: number): MapMidi | undefined {
	if (layer !== 'base') return undefined;
	const target = resolveCc({ param: `master.eq.${['low', 'mid', 'high', 'blend'][e]}` });
	return {
		cc: target.cc,
		channel: target.channel + 1,
		reach: e === 3 ? 'ignores' : 'answers',
		confidence: target.confidence
	};
}

/** The tempo page: CC80 sets the tempo, CC81 the groove amount (swing); both answered. */
function tempoMidi(layer: MapLayer, e: number): MapMidi | undefined {
	if (layer !== 'base' || (e !== 0 && e !== 2)) return undefined;
	const target = resolveCc({ param: e === 0 ? 'global.tempo' : 'global.groove' });
	return { cc: target.cc, channel: 'any', reach: 'answers', confidence: target.confidence };
}

// ─────────────────────────────────────────────────────────────────────────── the manual

interface ManualParameter {
	readonly screen: string;
	readonly encoder: string | null;
	readonly layer: string;
	readonly name: string;
	readonly note: string | null;
}

let manualUnits: ReadonlyMap<string, readonly ManualParameter[]> | undefined;

/** A unit's parameter table (the committed manual build). */
function manualParameters(id: string): readonly ManualParameter[] {
	manualUnits ??= new Map(
		(
			JSON.parse(manualText) as {
				units: { id: string; parameters: ManualParameter[] }[];
			}
		).units.map((unit) => [unit.id, unit.parameters])
	);
	const parameters = manualUnits.get(id);
	if (!parameters) throw new DeviceMapError(`the manual has no unit ${id}`);
	return parameters;
}

/** The manual's entry for encoder `e` on a layer of a page (its parameter tables' row). */
function manualEntry(spec: PageSpec, layer: MapLayer, e: number): ManualParameter | undefined {
	if (!spec.screen) return undefined;
	return (spec.units ?? [])
		.flatMap(manualParameters)
		.find((q) => q.screen === spec.screen && q.layer === layer && q.encoder === `E${e + 1}`);
}

// ─────────────────────────────────────────────────────────────────────────── probing a page

/** The page after `shift + turn e` one detent clockwise (a CC slot's number), or null. */
function afterShiftTurn(fork: Fork, e: number): Fork | null {
	const next = fork.after((sim) => {
		sim.input({ type: 'press', id: 'key.shift' });
		turn(sim, e, 1);
		sim.input({ type: 'release', id: 'key.shift' });
	});
	return next.json === fork.json ? null : next;
}

/** A reading of the range other than `now`, for trying the parameter with the navigator. */
function otherReading(range: MapRange, now: string | undefined): string {
	return range.last !== now ? range.last : range.first;
}

/**
 * What plan_steps takes to set the reader's value, tried on a copy from the page (`from`: after
 * the gesture it needs first, where it has one): the parameter id for instrument and tempo values
 * and list picks, the label for a value another page lists; null when the navigator does not get
 * there.
 */
function planned(
	p: Probe,
	reader: Reader,
	range: MapRange,
	now: string | undefined,
	from: SimState
): string | null {
	const spec = p.spec;
	const value = otherReading(range, now);
	const param = reader.param ?? spec.paramOf?.(reader.label);
	if (param) {
		const plan = planParam(from, { track: spec.track, param, value });
		return plan.reached ? param : null;
	}
	if (!spec.pageValue) return null;
	const plan = planPageValue(from, { ...spec.pageValue, label: reader.label, value });
	return plan.reached ? reader.label : null;
}

interface Found {
	readonly e: number;
	readonly reader: Reader;
	readonly control: MapControl;
}

/** The encoders that turn something on one layer of a page. */
function probeTurns(p: Probe): Found[] {
	const found: Found[] = [];
	for (let e = 0; e < 4; e++) {
		let fork = p.fork;
		let reader = readerFor(p, e);
		let needs: string | undefined;
		if (!reader && p.layer === 'base') {
			// a value that moves only once its shift layer has set something (a CC slot's number)
			const prepared = afterShiftTurn(p.fork, e);
			reader = prepared && readerFor({ ...p, fork: prepared }, e);
			if (prepared && reader) {
				fork = prepared;
				needs = `shift + turn E${e + 1} first`;
			}
		}
		if (!reader) continue;
		const s = sweep(fork, e, reader);
		// a finer step pushed in only means something on an even numeric range
		const range = rangeOf(
			s,
			evenSteps(s.readings.map(numberOf)) ? fineStep(fork, e, reader) : undefined
		);
		const value = reader.read(fork.sim());
		const param = planned(p, reader, range, value, needs ? fork.state : p.spec.home);
		const midi = p.spec.midi?.(p.layer, e);
		const about = manualEntry(p.spec, p.layer, e)?.note;
		found.push({
			e,
			reader,
			control: {
				keys: `${p.layer === 'shift' ? 'shift + ' : ''}turn E${e + 1}`,
				layer: p.layer,
				encoder: (e + 1) as 1 | 2 | 3 | 4,
				label: reader.label,
				...(param ? { param } : {}),
				...(value !== undefined ? { value } : {}),
				range,
				...(needs ? { needs } : {}),
				...(midi ? { midi } : {}),
				...(about ? { about } : {})
			}
		});
	}
	return found;
}

/**
 * A description's head and values: "amp envelope: attack 00, …" has a head; "tempo 120 bpm,
 * groove SH, …" is all values.
 */
function splitDescription(text: string): { head: string; parts: string[] } {
	const at = text.indexOf(':');
	const parts = text
		.slice(at + 1)
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	return { head: at < 0 ? '' : text.slice(0, at), parts };
}

/** `a → b`, the words they start with said once ("source 1 (audio) → (notes)"). */
function changeOf(a: string, b: string): string {
	const [x, y] = [a.split(' '), b.split(' ')];
	let same = 0;
	while (same < x.length - 1 && same < y.length - 1 && x[same] === y[same]) same++;
	const head = x.slice(0, same).join(' ');
	return `${head ? `${head} ` : ''}${x.slice(same).join(' ')} → ${y.slice(same).join(' ')}`;
}

/** A change in the page's description in few words: the page, or the values that changed. */
function describedChange(before: string, after: string): string {
	const a = splitDescription(before);
	const b = splitDescription(after);
	if (a.head !== b.head) return changeOf(a.head, b.head);
	const gone = a.parts.filter((part) => !b.parts.includes(part));
	const added = b.parts.filter((part) => !a.parts.includes(part));
	if (gone.length !== added.length) return [...gone.map((g) => `no ${g}`), ...added].join(', ');
	return gone.map((g, i) => changeOf(g, added[i])).join(', ');
}

/**
 * What clicking `e` does on a page: the page it opens, the values it changes, or (where a value
 * already sits at its default, so nothing seems to happen) what it puts back once the page's
 * encoders have been turned away.
 */
function clickEffect(fork: Fork, e: number, found: readonly Found[]): string | null {
	const before = fork.sim();
	const after = fork.sim();
	after.click((e + 1) as 1 | 2 | 3 | 4);
	const [fb, fa] = [frameOf(before), frameOf(after)];
	const [sb, sa] = [describeFrame(fb), describeFrame(fa)];
	if (fa.page !== fb.page) return `opens ${sa}`;
	// another view of the page (M2's filter envelope, the browser by category) before its values
	if (splitDescription(sb).head !== splitDescription(sa).head) return describedChange(sb, sa);
	// a value the other view does not show (a routing page's tracks 1–4 once 5–8 are on the
	// encoders) has not changed: the view has
	const changed = found.flatMap(({ reader }) => {
		const [x, y] = [reader.read(before), reader.read(after)];
		return x === y || y === undefined ? [] : [`${reader.label} ${x ?? NONE} → ${y}`];
	});
	if (changed.length > 0) return changed.join(', ');
	if (sa !== sb) return describedChange(sb, sa);
	const [lb, la] = [leaves(fb), leaves(fa)];
	const path = [...lb.keys()].find((k) => lb.get(k) !== la.get(k));
	if (path !== undefined) return `${pathLabel(path)} ${lb.get(path)} → ${la.get(path)}`;
	// turned away, then clicked: what came back
	const away = fork.sim();
	for (const { e: k, reader } of found) {
		const was = reader.read(away);
		turn(away, k, 3);
		if (reader.read(away) === was) turn(away, k, -6);
	}
	const clicked = simAt(away.state);
	clicked.click((e + 1) as 1 | 2 | 3 | 4);
	const back = found.filter(({ reader }) => {
		const start = reader.read(before);
		return reader.read(away) !== start && reader.read(clicked) === start;
	});
	if (back.length === 0) return null;
	return `resets ${back.map(({ reader }) => `${reader.label} to ${reader.read(before) ?? NONE}`).join(', ')}`;
}

/**
 * What a click of `e` leaves from `state`, with shift held for it or not; shift goes down and up
 * either way, so the two compare.
 */
function afterClick(fork: Fork, e: number, shift: boolean): string {
	const sim = fork.sim();
	sim.input({ type: 'press', id: 'key.shift' });
	if (!shift) sim.input({ type: 'release', id: 'key.shift' });
	sim.click((e + 1) as 1 | 2 | 3 | 4);
	if (shift) sim.input({ type: 'release', id: 'key.shift' });
	return JSON.stringify(sim.state);
}

/** The clicks that do something, with shift held (from `home`, the page without it) or not. */
function probeClicks(p: Probe, found: readonly Found[], home: Fork): MapControl[] {
	const layer: MapLayer = p.layer === 'shift' ? 'shift-click' : 'click';
	const controls: MapControl[] = [];
	for (let e = 0; e < 4; e++) {
		const does = clickEffect(p.fork, e, found);
		if (does === null) continue;
		// shift and a click that does what the click alone does is not a layer of its own
		if (layer === 'shift-click' && afterClick(home, e, true) === afterClick(home, e, false)) {
			continue;
		}
		const midi = p.spec.midi?.(layer, e);
		const entry = manualEntry(p.spec, layer, e);
		controls.push({
			keys: `${layer === 'shift-click' ? 'shift + ' : ''}click E${e + 1}`,
			layer,
			encoder: (e + 1) as 1 | 2 | 3 | 4,
			// a click is named where the manual names it ("mute", "loop type"); `does` says the rest
			...(entry ? { label: entry.name } : {}),
			does,
			...(midi ? { midi } : {}),
			...(entry?.note ? { about: entry.note } : {})
		});
	}
	return controls;
}

/** Module keys that open another page (the project, COM and preset pages' soft keys). */
function probeKeys(fork: Fork): MapKey[] {
	const keys: MapKey[] = [];
	const page = buildFrame(fork.state).page;
	for (const shift of [false, true]) {
		for (let n = 1; n <= 4; n++) {
			const sim = fork.sim();
			playStep(sim, { keys: `${shift ? 'shift + ' : ''}M${n}` });
			const frame = frameOf(sim);
			const opens = describeFrame(frame);
			if (frame.page === page || keys.some((k) => k.opens === opens)) continue;
			keys.push({ keys: `${shift ? 'shift + ' : ''}M${n}`, opens });
		}
	}
	return keys;
}

/** Whether the page shows its module switched off (dimmed under "off"). */
function isOff(frame: ScreenFrame): boolean {
	if ('off' in frame && frame.off === true) return true;
	return frame.page === 'player' && !frame.on && !frame.list;
}

/** The labels written over M1–M4, where the page has any. */
function softLabels(frame: ScreenFrame): string[] | undefined {
	if (!('soft' in frame) || !Array.isArray(frame.soft)) return undefined;
	const texts = (frame.soft as readonly ({ readonly text?: string } | null)[]).map(
		(label) => label?.text ?? ''
	);
	return texts.some(Boolean) ? texts : undefined;
}

const sameTurn = (a: MapControl, b: MapControl) =>
	a.encoder === b.encoder &&
	a.label === b.label &&
	JSON.stringify(a.range) === JSON.stringify(b.range);

function mapPage(spec: Omit<PageSpec, 'home'>): MapPage {
	const walk = new Walk(spec.id);
	spec.walk(walk);
	let note = spec.note;
	if (spec.on && isOff(frameOf(walk.sim))) {
		walk.keys(spec.on);
		note = [`off in a new project: ${spec.on} on this page switches it on and off`, note]
			.filter(Boolean)
			.join('; ');
	}
	const frame = frameOf(walk.sim);
	if (frame.page !== spec.frame) {
		throw new DeviceMapError(
			`${spec.id}: the path leads to the ${frame.page} page, not ${spec.frame}`
		);
	}
	const home = new Fork(walk.sim.state);
	const full: PageSpec = { ...spec, home: home.state };
	const base = probeTurns({ spec: full, fork: home, layer: 'base' });
	const held = home.after((sim) => sim.input({ type: 'press', id: 'key.shift' }));
	const shift = probeTurns({ spec: full, fork: held, layer: 'shift' }).filter(
		(f) => !base.some((b) => sameTurn(b.control, { ...f.control, layer: 'base' }))
	);
	let alt: Found[] = [];
	let altScreen: string | undefined;
	if (spec.alt) {
		const keys = spec.alt;
		const other = home.after((sim) => playStep(sim, { keys }));
		alt = probeTurns({ spec: full, fork: other, layer: 'alt' });
		altScreen = screenOf(other.sim());
	}
	const clicks = probeClicks({ spec: full, fork: home, layer: 'base' }, base, home);
	const shiftClicks = probeClicks(
		{ spec: full, fork: held, layer: 'shift' },
		[...shift, ...base.filter((b) => !shift.some((s) => s.e === b.e))],
		home
	);
	const screen = screenOf(home.sim());
	const shiftScreen = screenOf(held.sim());
	const soft = softLabels(frame);
	const keys = spec.keys ? probeKeys(home) : [];
	return {
		id: spec.id,
		name: spec.name,
		area: spec.area,
		...(spec.track !== undefined ? { track: spec.track } : {}),
		path: walk.steps,
		screen,
		...(shiftScreen !== screen ? { shiftScreen } : {}),
		...(altScreen !== undefined ? { altScreen } : {}),
		...(soft ? { soft } : {}),
		...(keys.length > 0 ? { keys } : {}),
		...(note ? { note } : {}),
		...(spec.units ? { units: spec.units } : {}),
		...(spec.captured ? { captured: spec.captured } : {}),
		controls: [...base, ...shift, ...alt].map((f) => f.control).concat(clicks, shiftClicks)
	};
}

// ─────────────────────────────────────────────────────────────────────────── the pages

/** A page to map: how to get there and what to check and link. */
interface PageSpec {
	readonly id: string;
	readonly name: string;
	readonly area: MapArea;
	/** 1–8 instrument, 9–16 auxiliary. */
	readonly track?: number;
	/** The frame the screen must show there (the build fails otherwise). */
	readonly frame: ScreenFrame['page'];
	/** Walks a new project there. */
	walk(w: Walk): void;
	/** The key that switches the page's module on when it shows off (M3, M4, player). */
	readonly on?: string;
	/** The key that shows the page's other view (M2: click E1, the filter envelope). */
	readonly alt?: string;
	/** Whether its module keys open pages of their own (project, COM, the preset browser). */
	readonly keys?: boolean;
	/** The CC of encoder `e` on a layer, and what the unit did with it. */
	readonly midi?: (layer: MapLayer, e: number) => MapMidi | undefined;
	/** The manual's name for the screen in its parameter tables (M1…M4, tempo, player, com). */
	readonly screen?: string;
	readonly units?: readonly string[];
	readonly captured?: string;
	readonly note?: string;
	/** Where plan_steps finds values by label (the pages whose values no parameter id names). */
	readonly pageValue?: Omit<PageValueGoal, 'label' | 'value'>;
	/** The plan_steps parameter a label on the page stands for (a list's type, the browser's). */
	readonly paramOf?: (label: string) => string | undefined;
	/** The page's state, once walked (the navigator plans from it). */
	readonly home: SimState;
}

type Spec = Omit<PageSpec, 'home'>;

/** The synth track the instrument pages are shown on (prism in a new project). */
const SYNTH_TRACK = 3;

/** The lanes of track `track`'s module page `module`, for a track of this kind. */
function lanes(track: number, kind: ReachKind, module: PageNumber) {
	return (layer: MapLayer, e: number): MapMidi | undefined => {
		if (layer === 'click' || layer === 'shift-click') return undefined;
		return laneMidi(track, kind, module, layer, e);
	};
}

const engineKind = (engine: EngineId): ReachKind => {
	const kind = getEngine(engine).kind;
	return kind === 'synth' ? 'synth' : kind === 'sampler' ? 'sampler' : 'midi-engine';
};

/** Each engine's M1: on the first track of a new project that runs it, else loaded onto track 3. */
function enginePage(engine: EngineId): Spec {
	const track = NEW_PROJECT_TRACKS.findIndex((t) => t.engine === engine) + 1 || SYNTH_TRACK;
	const kind = engineKind(engine);
	const units: Readonly<Record<string, readonly string[]>> = {
		drum: ['sampler.drum-key-settings', 'sampler.drum-sampler'],
		sampler: ['sampler.synth-sampler'],
		multisampler: ['sampler.multisampler', 'sampler.synth-sampler'],
		midi: ['instrument.engine-midi']
	};
	return {
		id: `instrument.m1.${engine}`,
		name: `${engine} engine (M1)`,
		area: 'instrument',
		track,
		frame: kind === 'synth' ? 'synth' : kind === 'sampler' ? 'drum' : 'midi',
		walk: (w) => {
			w.place({ area: 'instrument', track, page: 1 });
			w.param({ track, param: 'engine', value: engine });
		},
		midi: lanes(track, kind, 1),
		screen: 'M1',
		units: units[engine] ?? [`instrument.engine-${engine}`],
		// the midi engine's channel and bank are values its page shows, by name
		pageValue: { area: 'instrument', track, page: 1 },
		// the owner's unit never listed the midi engine (research 59 §2.6)
		...(engine === 'midi' ? {} : { captured: '59 §2.5' })
	};
}

/** Track 3's M2, M3 or M4 (with the LFO type picked). */
function instrumentPage(page: PageNumber, fields: Omit<Spec, 'area' | 'track' | 'walk'>): Spec {
	return {
		area: 'instrument',
		track: SYNTH_TRACK,
		walk: (w) => w.place({ area: 'instrument', track: SYNTH_TRACK, page }),
		midi: lanes(SYNTH_TRACK, 'synth', page),
		screen: `M${page}`,
		// values no parameter id names (a duck's source type) go by the page's names
		pageValue: { area: 'instrument', track: SYNTH_TRACK, page },
		...fields
	};
}

function lfoPage(type: (typeof LFO_TYPES)[number]): Spec {
	return {
		...instrumentPage(4, {
			id: `instrument.m4.${type}`,
			name: `${type} LFO (M4)`,
			frame: 'lfo',
			on: 'M4',
			units: [`instrument.lfo-${type}`, 'instrument.lfo'],
			captured: '59 §2.4'
		}),
		walk: (w) => {
			w.place({ area: 'instrument', track: SYNTH_TRACK, page: 4 });
			w.param({ track: SYNTH_TRACK, param: 'lfo type', value: type });
		}
	};
}

/** The midi engine's CC slot pages: M2 (slots 1–4) and M3 (5–8) of a track running it. */
function midiCcPage(page: 2 | 3): Spec {
	return {
		id: `instrument.m${page}.midi`,
		name: `midi engine CC slots ${page === 2 ? '1–4' : '5–8'} (M${page})`,
		area: 'instrument',
		track: SYNTH_TRACK,
		frame: 'midi-engine-cc',
		walk: (w) => {
			w.place({ area: 'instrument', track: SYNTH_TRACK, page: 1 });
			w.param({ track: SYNTH_TRACK, param: 'engine', value: 'midi' });
			w.keys(`M${page}`);
		},
		units: ['instrument.engine-midi'],
		pageValue: { area: 'instrument', track: SYNTH_TRACK, page }
	};
}

/** An auxiliary track (1–8 in its set, 9–16 as the device counts) and what it is. */
const AUX: readonly { readonly slot: number; readonly id: string; readonly kind: ReachKind }[] = [
	{ slot: 1, id: 'brain', kind: 'brain' },
	{ slot: 2, id: 'punch-in', kind: 'punch-in' },
	{ slot: 3, id: 'external-midi', kind: 'external-midi' },
	{ slot: 4, id: 'external-cv', kind: 'external-cv' },
	{ slot: 5, id: 'external-audio', kind: 'external-audio' },
	{ slot: 6, id: 'tape', kind: 'tape' },
	{ slot: 7, id: 'fx-i', kind: 'fx-i' },
	{ slot: 8, id: 'fx-ii', kind: 'fx-ii' }
];

function auxPage(
	slot: number,
	page: PageNumber,
	fields: Omit<Spec, 'id' | 'area' | 'track' | 'walk' | 'name'> & { readonly what: string }
): Spec {
	const aux = AUX[slot - 1];
	const track = 8 + slot;
	const { what, ...rest } = fields;
	return {
		id: `auxiliary.${aux.id}.m${page}`,
		name: `${getTrack(track).name} ${what} (M${page})`,
		area: 'auxiliary',
		track,
		walk: (w) => w.place({ area: 'auxiliary', track: slot, page }),
		midi: lanes(track, aux.kind, page),
		screen: `M${page}`,
		pageValue: { area: 'auxiliary', track: slot, page },
		...rest
	};
}

/** Routing (M2), filter with the sends on shift (M3) and LFO (M4): external audio, tape, FX. */
function routedPages(slot: number, captured?: string): Spec[] {
	const units = ['auxiliary.routing-filter-lfo'];
	const seen = captured ? { captured } : {};
	return [
		auxPage(slot, 2, { what: 'routing', frame: 'aux-route', units, ...seen }),
		auxPage(slot, 3, { what: 'filter', frame: 'aux-filter', on: 'M3', units, ...seen }),
		auxPage(slot, 4, { what: 'LFO', frame: 'aux-lfo', on: 'M4', units, ...seen })
	];
}

/** FX I's M1 with each effect: picked from the list shift + T7 opens (turn E4, click E4). */
function fxPage(type: FxType): Spec {
	const fx = auxPage(7, 1, {
		what: type,
		frame: 'aux-fx',
		units: [`fx.${type}`, 'fx.overview'],
		// lofi was never on camera: its labels are the guide's (research 59 §2.13)
		...(type === 'lofi' ? {} : { captured: '59 §2.13' })
	});
	return {
		...fx,
		id: `${fx.id}.${type}`,
		walk: (w) => {
			w.place({ area: 'auxiliary', track: 7, page: 1 });
			w.value({ area: 'auxiliary', track: 7, label: 'effect', value: type });
		}
	};
}

/**
 * A player page on track 3: arpeggio by default, the others moved to in the player list
 * (`shift + player → + player`, shift kept down).
 */
function playerPage(type: PlayerType): Spec {
	return {
		id: `player.${type}`,
		name: `${type} player`,
		area: 'player',
		track: SYNTH_TRACK,
		frame: 'player',
		walk: (w) => w.place({ area: 'player', track: SYNTH_TRACK, type }),
		on: 'player',
		screen: 'player',
		units: [`players.${type}`, 'players.overview'],
		pageValue: { area: 'player', track: SYNTH_TRACK },
		captured: '59 §2.7'
	};
}

/** Every page the map covers, in the order it lists them. */
const PAGES: readonly Spec[] = [
	...ENGINE_IDS.map(enginePage),
	instrumentPage(2, {
		id: 'instrument.m2',
		name: 'envelopes (M2; shift: play mode)',
		frame: 'envelope',
		alt: 'click E1',
		units: ['instrument.envelopes', 'instrument.play-mode'],
		captured: '59 §2.2'
	}),
	instrumentPage(3, {
		id: 'instrument.m3',
		name: 'filter (M3; shift: sends)',
		frame: 'filter',
		on: 'M3',
		units: ['instrument.filter', 'instrument.track-sends'],
		captured: '59 §2.3'
	}),
	...LFO_TYPES.map(lfoPage),
	midiCcPage(2),
	midiCcPage(3),
	{
		...instrumentPage(1, {
			id: 'instrument.presets',
			name: 'preset browser (shift + M1)',
			frame: 'system-presets',
			keys: true,
			screen: 'preset browser',
			units: ['instrument.preset-browser', 'instrument.preset-management', 'instrument.engine'],
			captured: '59 §2.6'
		}),
		midi: undefined,
		pageValue: undefined,
		// E1 picks the engine, which plan_steps loads; E2–E4 a preset, which it loads by name
		paramOf: (label) => (label === 'engine' || label === 'preset' ? label : undefined),
		walk: (w) => {
			w.place({ area: 'instrument', track: SYNTH_TRACK, page: 1 });
			w.keys('shift + M1');
		}
	},
	...(['filter', 'lfo'] as const).map((kind): Spec => ({
		...instrumentPage(kind === 'filter' ? 3 : 4, {
			id: `instrument.${kind}-types`,
			name: `${kind === 'filter' ? 'filter' : 'LFO'} types (shift + M${kind === 'filter' ? 3 : 4})`,
			frame: 'list',
			units: [kind === 'filter' ? 'instrument.filter' : 'instrument.lfo'],
			captured: '59 §2.3'
		}),
		// a list: no CC lanes, and the manual's tables are the page's under it
		midi: undefined,
		screen: undefined,
		pageValue: undefined,
		paramOf: (label) => (label === 'type' ? `${kind}.type` : undefined),
		walk: (w) => {
			const page = kind === 'filter' ? 3 : 4;
			w.place({ area: 'instrument', track: SYNTH_TRACK, page });
			w.keys(`shift + M${page}`);
		}
	})),
	auxPage(1, 1, {
		what: 'key and scale',
		frame: 'aux-brain',
		units: ['auxiliary.brain'],
		captured: '59 §2.13'
	}),
	auxPage(1, 2, {
		what: 'routing',
		frame: 'aux-route',
		units: ['auxiliary.brain'],
		captured: '59 §2.13'
	}),
	auxPage(2, 1, {
		what: 'effects',
		frame: 'aux-punch',
		units: ['auxiliary.punch-in-fx'],
		captured: '59 §2.13',
		note: 'the keyboard plays the effects (the lower octave on the percussion tracks, the upper on the melodic ones); shift + a key does it from any instrument track'
	}),
	auxPage(3, 1, {
		what: 'channel and program',
		frame: 'aux-midi',
		units: ['auxiliary.external-midi'],
		captured: '59 §2.13'
	}),
	auxPage(3, 2, {
		what: 'CC slots 1–4',
		frame: 'aux-cc',
		units: ['auxiliary.external-midi'],
		captured: '59 §2.13'
	}),
	auxPage(3, 3, {
		what: 'CC slots 5–8',
		frame: 'aux-cc',
		units: ['auxiliary.external-midi'],
		captured: '59 §2.13'
	}),
	auxPage(3, 4, {
		what: 'LFO',
		frame: 'aux-lfo',
		on: 'M4',
		units: ['auxiliary.external-midi', 'auxiliary.routing-filter-lfo'],
		captured: '59 §2.13'
	}),
	auxPage(4, 1, {
		what: 'voltmeter',
		frame: 'aux-cv',
		units: ['auxiliary.external-cv'],
		captured: '59 §2.13',
		note: 'no encoder does anything here; notes move the needle (pitch CV), and CC 12–15 did nothing on the owner’s unit'
	}),
	auxPage(5, 1, {
		what: 'input',
		frame: 'aux-audio',
		units: ['auxiliary.external-audio'],
		captured: '59 §2.13'
	}),
	...routedPages(5, '59 §2.13'),
	auxPage(6, 1, {
		what: 'loop',
		frame: 'aux-tape',
		units: ['auxiliary.tape'],
		captured: '59 §2.13'
	}),
	...routedPages(6),
	...FX_TYPES.map(fxPage),
	...routedPages(7),
	auxPage(8, 1, {
		what: 'reverb',
		frame: 'aux-fx',
		units: ['fx.reverb', 'fx.overview'],
		captured: '59 §2.13 (FX I’s layout)'
	}),
	...routedPages(8),
	{
		id: 'auxiliary.fx-types',
		name: 'effect list (shift + T7 or T8)',
		area: 'auxiliary',
		track: 15,
		frame: 'aux-fx-list',
		walk: (w) => {
			w.keys('auxiliary');
			w.keys('shift + T7');
		},
		units: ['fx.overview'],
		pageValue: { area: 'auxiliary', track: 7 },
		captured: '59 §2.13'
	},
	{
		id: 'mix.m1',
		name: 'mixer: levels, pans and sends (M1)',
		area: 'mix',
		frame: 'mix',
		walk: (w) => w.place({ area: 'mix', page: 1 }),
		midi: stripMidi(1, 'synth'),
		screen: 'M1',
		units: ['mix.levels-pans-sends', 'mix.mute-solo'],
		pageValue: { area: 'mix', page: 1 },
		captured: '59 §2.10',
		note: 'the values are the selected track’s (T1–T8 picks the strip); E1 and E2 show its FX sends in a popup while they turn'
	},
	{
		id: 'mix.m1.auxiliary',
		name: 'mixer: auxiliary tracks (M1, mix again)',
		area: 'mix',
		frame: 'mix',
		walk: (w) => {
			w.place({ area: 'mix', page: 1 });
			w.keys('mix');
		},
		midi: stripMidi(9, 'brain'),
		screen: 'M1',
		units: ['mix.levels-pans-sends'],
		pageValue: { area: 'mix', page: 1 },
		note: 'mix pressed again swaps the track keys to the auxiliary tracks; a track sends to FX I and II only where its own M3 shift layer has the send'
	},
	...([2, 3, 4] as const).map((page): Spec => ({
		id: `mix.m${page}`,
		name: `mixer: ${['master EQ', 'saturator', 'master'][page - 2]} (M${page})`,
		area: 'mix',
		frame: (['mix-eq', 'mix-saturator', 'mix-master'] as const)[page - 2],
		walk: (w) => w.place({ area: 'mix', page }),
		...(page === 2 ? { midi: eqMidi } : {}),
		screen: `M${page}`,
		units: [['mix.eq', 'mix.saturator', 'mix.master'][page - 2]],
		pageValue: { area: 'mix', page },
		captured: '59 §2.10'
	})),
	{
		id: 'tempo',
		name: 'tempo',
		area: 'tempo',
		frame: 'tempo',
		walk: (w) => w.place({ area: 'tempo' }),
		midi: tempoMidi,
		screen: 'tempo',
		units: ['tempo.tempo-screen', 'tempo.grooves'],
		captured: '59 §2.11',
		note: 'tempo pressed again on this page taps the tempo'
	},
	playerPage('arpeggio'),
	playerPage('hold'),
	playerPage('maestro'),
	{
		id: 'project',
		name: 'project',
		area: 'project',
		frame: 'project',
		walk: (w) => w.keys('project'),
		keys: true,
		units: ['project.project-view', 'project.projects-folder'],
		note: 'hold M1 for a new project (the one open is saved first); shift + project opens the projects folder'
	},
	{
		id: 'com',
		name: 'COM',
		area: 'com',
		frame: 'com',
		walk: (w) => w.place({ area: 'com' }),
		keys: true,
		screen: 'com',
		units: ['com.overview', 'com.bluetooth-midi', 'com.multi-out'],
		pageValue: { area: 'com' }
	}
];

// ─────────────────────────────────────────────────────────────────────────── the map

const ABOUT =
	'The OP-XY’s pages as OP-XY Agent’s simulator draws them, generated from it by scripts/build-device-map.mjs (src/lib/sim/device-map.ts); do not edit by hand. For each page: the keys from a new project, what the screen says there, and each encoder on each layer with its label, range and display format (found by turning it end to end on a copy), what a click does, the CC on its lane with what the owner’s unit did with that CC on OS 1.1.33 (answers: the page moved; ignores: it did not; untested), and the note of our manual. The values of a page are a new project’s on the track its path picks.';

const LAYERS: Readonly<Record<MapLayer, string>> = {
	base: 'turn the encoder',
	shift: 'hold shift and turn it',
	alt: 'turn it on the page’s other view (M2: a click shows the filter envelope)',
	click: 'push the encoder',
	'shift-click': 'hold shift and push it'
};

/** The map, built from the simulator (deterministic: the same simulator gives the same map). */
export function buildDeviceMap(): DeviceMap {
	return { about: ABOUT, firmware: REFERENCE_FIRMWARE, layers: LAYERS, pages: PAGES.map(mapPage) };
}

/** The map as the committed file holds it: tab-indented JSON and a final newline. */
export function formatDeviceMap(map: DeviceMap): string {
	return `${JSON.stringify(map, null, '\t')}\n`;
}
