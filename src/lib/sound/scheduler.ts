/**
 * The sequencer's clock for the sound engine: a lookahead scheduler (the "two clocks" pattern). A
 * timer ticks every 25 ms; each tick looks about 100 ms ahead on the audio clock and schedules every
 * note and metronome click due in that window at its exact audio time, so timing is sample-accurate
 * however late the timer fires.
 *
 * What plays is the sequencer's own playback (`$lib/sim/sequencer-playback`): each instrument track
 * walks its current pattern slot by slot (`advancePlayhead`, one slot per track-scale sixteenths),
 * with every step component — pulse repeats and holds, multiply, velocity, ramps, random, tonality,
 * jump, the skips — its notes' quantised timing, lengths, glides and bends, and the step's parameter
 * locks, which reach the voice through the track settings the note starts with, and the notes
 * already sounding from the step's start (a lock on an empty step and recorded automation are
 * heard; the bar menu's shape smooths the move). Tracks routed into the brain move their ramps,
 * random and tonality in its key and follow its transposition (manual: auxiliary/brain; the
 * brain's pattern holds each chord change until the next). On top come the tempo page's groove (or
 * the track's own groove from the bar menu) and the metronome, which also counts in a recording. A pattern's player works on its sequenced notes here (manual: players/*):
 * the arpeggio runs over them while they last, with the active track's held keys joining in, on
 * the same clock; maestro plays its chord from each note; hold sustains each until the next.
 * The punch-in effects that act on the sequencer's notes (the repeats, octave, follow, the drum
 * fills and ramps, random; `punch/sequence.ts`) apply here too, from the punch-in keys held and the
 * punch-in track's pattern, whose notes also go to the sink for the effects on the sound.
 *
 * Each track's walk runs on a random source seeded like the LEDs' walk (`playheadAt`), and is laid
 * down again from the start whenever what it depends on changes (the scale, the length, the flow
 * components, another pattern), as the LEDs do, so what sounds is what lights unless the walk itself
 * is random. The timeline is anchored on the audio clock when the transport starts; it starts again
 * from the simulator's position when that jumps back for a new run (play again, a device starting
 * over), re-anchors when the tempo changes, follows the position while a device's clock drives it,
 * and ends the sequence's notes when the transport stops.
 *
 * A scene's start (the song moving on, or its one scene again) also takes the simulator's position
 * back to 0, but it is the same run: where every track plays on what it played and would be back at
 * its first step there anyway, the timeline goes on across the join, only counted from further on;
 * elsewhere it is laid down again with each track's random source and passes carried over from
 * where the scene ended. Either way random, the ramps and the skips go on changing from pass to
 * pass, as on the device, instead of playing the first pass again every time the scene comes round.
 */
import { brainInfluence, brainShift } from '$lib/sim/areas/auxiliary/sim';
import { lockParam } from '$lib/sim/areas/sequencer/locks';
import { sceneLength } from '$lib/sim/areas/arrange/model';
import { activeTrack, heldNotes, seq } from '$lib/sim/areas/sequencer/model';
import { playerOf } from '$lib/sim/areas/sequencer/players';
import type { SimState, TrackState } from '$lib/sim/params';
import {
	advancePlayhead,
	arpEvent,
	arpStepLength,
	bendCurve,
	hasFlowComponents,
	maestroEvents,
	seededRng,
	startPlayhead,
	type Playhead,
	type Rng,
	type StepPlay
} from '$lib/sim/sequencer-playback';
import {
	currentPattern,
	hasNotes,
	type ArpSettings,
	type Pattern,
	type PlayerSettings
} from '$lib/sim/sequencer';
import { grooveJitter, grooveTime, grooveVelocity, maxEarlyShift, type Groove } from './groove';
import { bendCents, metronomeGain } from './mapping';
import { PunchSequencer } from './punch/sequence';
import { seedOf } from './random';

/** A note to play. */
export interface ScheduledNote {
	/** Instrument track 0–7. */
	readonly track: number;
	readonly note: number;
	/** 1–127. */
	readonly velocity: number;
	/** Audio time the note starts. */
	readonly time: number;
	/** Seconds until it is let go. */
	readonly duration: number;
	/** The portamento component: seconds to glide in from the last note (else the track's). */
	readonly glide?: number;
	/** The bend component: pitch over the note in cents, spread evenly across its duration. */
	readonly bend?: Float32Array;
	/** Its own place in the stereo field, −1…1 (the arpeggio's stereo spread). */
	readonly pan?: number;
	/** Semitones on top of a drum key's tune (the punch-in octave on the percussion group). */
	readonly tune?: number;
}

/**
 * A note of the punch-in track's pattern (aux T2): its key (0–23) and the tracks it acts on, from
 * `start` to `end` (audio time).
 */
export interface PunchEvent {
	readonly key: number;
	readonly tracks: readonly number[];
	readonly start: number;
	readonly end: number;
}

/** A metronome click. */
export interface ClickEvent {
	readonly time: number;
	/** The first beat of a bar. */
	readonly accent: boolean;
	readonly gain: number;
}

/** Where the scheduler's events go (the sound engine, or a recorder in tests). */
export interface SchedulerSink {
	/** A note, with the track's settings as it starts (the step's locks applied). */
	note(event: ScheduledNote, settings: TrackState): void;
	click(event: ClickEvent): void;
	/**
	 * Every beat while the sequence plays, heard or not, with its transport position (sixteenths):
	 * what follows the metronome (a duck LFO with the metronome as its source) and the tempo's grid.
	 */
	beat?(time: number, position: number): void;
	/** A punch-in note the punch-in track's pattern plays (research 60 §6). */
	punch?(event: PunchEvent): void;
	/** The transport stopped or jumped at `time`: end the sequence's notes, drop what comes later. */
	stop(time: number): void;
	/**
	 * A step's parameter locks for the notes already sounding on `track`, from `time` (a lock on an
	 * empty step, recorded automation); null when a step without locks follows, taking each note
	 * back to the settings it started with.
	 */
	automate?(track: number, locks: Readonly<Record<string, number>> | null, time: number): void;
}

/** Options for {@link Scheduler}. */
export interface SchedulerOptions {
	/** The simulator's state, read every tick. */
	readonly state: () => SimState;
	/** The audio clock, in seconds. */
	readonly now: () => number;
	readonly sink: SchedulerSink;
	/** How far each tick looks ahead, in seconds (default {@link LOOKAHEAD}). */
	readonly lookahead?: number;
	/** True while something outside sets the position (a device's clock): follow it. */
	readonly follow?: () => boolean;
}

/** How often the app ticks the scheduler (ms) and how far each tick looks ahead (s). */
export const TICK_MS = 25;
export const LOOKAHEAD = 0.1;

/** The seed of every track's walk: the LEDs' (`playheadAt`'s default), and the arpeggio's. */
export const WALK_SEED = 1;
/** The replica keyboard's velocity, for the notes the arpeggio makes of its keys. */
export const KEY_VELOCITY = 100;

/** Notes due further than this before now are dropped rather than played late (a stalled timer). */
const LATE = 0.03;
/** The first notes after play land this far after the tick that starts them. */
const START_MARGIN = 0.01;
/** Following a device's clock, drifts beyond this many sixteenths re-anchor the timeline. */
const FOLLOW_TOLERANCE = 0.5;
/** A walk laid down again replays at most this many slots (about 40 minutes of sixteenths). */
const REPLAY_LIMIT = 40000;
/** Points a bend curve is drawn with. */
const BEND_POINTS = 32;
/** Points a smoothed move between two steps' locks is drawn with (the bar menu's shape). */
const SHAPE_POINTS = 8;
/**
 * How far ahead the arpeggio is scheduled (s): less than the patterns, so keys pressed and let go
 * reach it at once. Only while the page is hidden does it look as far as they do.
 */
const ARP_LOOKAHEAD = 0.05;
/** An arpeggio note with less than this left to sound when it comes up is skipped (s). */
const ARP_SHORTEST = 0.02;

/** Where the timeline was pinned: a transport position (sixteenths) at an audio time and tempo. */
export interface Anchor {
	readonly position: number;
	readonly time: number;
	readonly bpm: number;
}

/** Seconds per sixteenth at a tempo. */
export const sixteenthSeconds = (bpm: number): number => 15 / bpm;

/** The transport position sounding at audio time `time`. */
export const positionAt = (anchor: Anchor, time: number): number =>
	anchor.position + (time - anchor.time) / sixteenthSeconds(anchor.bpm);

/** The audio time a transport position sounds. */
export const timeAt = (anchor: Anchor, position: number): number =>
	anchor.time + (position - anchor.position) * sixteenthSeconds(anchor.bpm);

/**
 * The first slot (of `size` sixteenths) to play when starting at `position`: the one under it when
 * less than `tolerance` has passed since it began (it plays at once), else the next.
 */
export function firstIndex(position: number, size: number, tolerance = size / 2): number {
	const n = Math.floor(position / size + 1e-9);
	return position - n * size > tolerance ? n + 1 : n;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * The settings a step's notes start with: the track's, with the step's parameter locks applied
 * through the sequencer's own table (`lockParam(id).set`). Only what a voice reads is copied; the
 * patterns are shared, untouched.
 */
export function lockedSettings(
	track: TrackState,
	locks: Readonly<Record<string, number>>
): TrackState {
	const ids = Object.keys(locks);
	if (ids.length === 0) return track;
	const copy: TrackState = {
		...track,
		m1: [...track.m1],
		amp: { ...track.amp },
		filterEnv: { ...track.filterEnv },
		filter: { ...track.filter },
		playMode: { ...track.playMode },
		sends: [...track.sends],
		lfo: { ...track.lfo },
		mix: { ...track.mix },
		drumKeys: track.drumKeys.map((key) => ({ ...key }))
	};
	for (const id of ids) lockParam(id)?.set(copy, locks[id]);
	return copy;
}

/** The groove a track plays with: the tempo page's type, the track's amount or else the swing. */
export function trackGroove(state: SimState, pattern: Pattern): Groove {
	return { type: state.tempo.groove, amount: pattern.groove || state.tempo.swing };
}

/** What a track's walk depends on: laid down again from the start when it changes. */
function walkKey(track: TrackState, pattern: Pattern): string {
	let key = `${track.sequence.current}/${pattern.scale}/${pattern.length}`;
	for (let i = 0; i < pattern.length; i++) {
		for (const c of pattern.steps[i].components) {
			if (c.kind === 'pulse' || c.kind === 'pulse hold' || c.kind === 'jump') {
				key += `/${i}.${c.kind}.${c.value}`;
			} else if (c.kind === 'skip step component') key += `/${i}.skip.${c.value}`;
		}
	}
	return key;
}

/** What the active track's arpeggio plays over, from {@link arpeggioInput}. */
export interface ArpeggioInput {
	readonly track: number;
	readonly arp: ArpSettings;
	/** The notes, in the order they were played. */
	readonly notes: readonly number[];
}

/**
 * What the active instrument track's arpeggio runs over now (manual: players/arpeggio): the keys
 * held, else the notes its hold kept. Null while it does not run: another player or none, nothing
 * to play, an auxiliary track, the silent midi engine. A mute leaves it alone (OS 1.1.0: held
 * arpeggio notes still sound on a muted track).
 */
export function arpeggioInput(state: SimState): ArpeggioInput | null {
	const track = activeTrack(state);
	if (!track || track.engine === 'midi') return null;
	const player = playerOf(state);
	if (!player.on || player.type !== 'arpeggio') return null;
	const held = heldNotes(state);
	const notes = held.length > 0 ? held : player.arp.hold ? seq(state).sustained : [];
	return notes.length > 0 ? { track: state.track, arp: player.arp, notes } : null;
}

/** A running arpeggio: how many sixteenths a step lasts, the next step to schedule. */
interface ArpRun {
	readonly length: number;
	/** Step k starts k × length sixteenths into the transport (as its LEDs count). */
	step: number;
}

/** A sequenced note an arpeggio plays over while it lasts (transport sixteenths). */
interface Held {
	readonly from: number;
	readonly to: number;
	readonly note: number;
	readonly velocity: number;
	/** The settings of its step (its locks applied). */
	readonly settings: TrackState;
}

/**
 * Steps from step `index` to the next step of `pattern` with notes (a whole pattern when there is
 * no other): how long the hold player keeps a step's notes sounding.
 */
function stepsToNextNotes(pattern: Pattern, index: number): number {
	for (let d = 1; d < pattern.length; d++) {
		if (hasNotes(pattern.steps[(index + d) % pattern.length])) return d;
	}
	return pattern.length;
}

/** One track's walk through its pattern. */
interface Walk {
	key: string;
	head: Playhead;
	rng: Rng;
	/** The next slot to schedule (slot j starts at origin + j × scale sixteenths). */
	slot: number;
	scale: number;
	/** Where its slot 0 is on the timeline: the start of the scene it was laid down in. */
	origin: number;
	/** The walk as the scene ended (before its first slot past the end), for a new timeline. */
	join?: Playhead;
	/** The locks the last step played sent to the sounding notes. */
	locks: Readonly<Record<string, number>>;
	/** Chords maestro has strummed (its up/down pattern alternates). */
	hits: number;
}

/** A move of the sounding notes' parameters, for {@link SchedulerSink.automate}. */
interface Automation {
	readonly track: number;
	readonly locks: Readonly<Record<string, number>> | null;
	readonly time: number;
}

type Due =
	| { readonly kind: 'note'; readonly event: ScheduledNote; readonly settings: TrackState }
	| { readonly kind: 'click'; readonly event: ClickEvent }
	| { readonly kind: 'beat'; readonly event: { readonly time: number; readonly position: number } }
	| { readonly kind: 'automate'; readonly event: Automation };

/** Whether two steps' locks hold the same values. */
function sameLocks(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
	const ids = Object.keys(a);
	return ids.length === Object.keys(b).length && ids.every((id) => b[id] === a[id]);
}

/** Sixteenths per step (the track scale), never zero. */
const scaleOf = (pattern: Pattern) => (pattern.scale > 0 ? pattern.scale : 1);

/** Plays the simulator's patterns on the audio clock; call {@link tick} every {@link TICK_MS}. */
export class Scheduler {
	readonly #state: () => SimState;
	readonly #now: () => number;
	readonly #sink: SchedulerSink;
	readonly #lookahead: number;
	readonly #follow: () => boolean;
	#anchor: Anchor | null = null;
	#walks: Walk[] = [];
	#nextClick = 0;
	#lastPosition = 0;
	/** The simulator's play starts when the timeline began (a new run when they change). */
	#starts = 0;
	/** Where the current scene began on the timeline (sixteenths the position counts behind it). */
	#offset = 0;
	/** Where the current scene ends on the timeline. */
	#sceneEnd = Infinity;
	/** Walks laid down fresh in this run since it began (each on a source of its own). */
	#fresh = 0;
	/** Each track's running arpeggio, and the sequenced notes it plays over. */
	#arps = new Map<number, ArpRun>();
	#held: Held[][] = [];
	/** The punch-in effects on the sequencer's notes, and the next sixteenth the fills look at. */
	readonly #punch = new PunchSequencer();
	#nextFill = 0;

	constructor(options: SchedulerOptions) {
		this.#state = options.state;
		this.#now = options.now;
		this.#sink = options.sink;
		this.#lookahead = options.lookahead ?? LOOKAHEAD;
		this.#follow = options.follow ?? (() => false);
	}

	/** The timeline while the transport plays, else null. */
	get anchor(): Anchor | null {
		return this.#anchor;
	}

	/**
	 * Schedules everything due before now + `lookahead` (default the option's; look further while
	 * the page is hidden and timers are throttled).
	 */
	tick(lookahead = this.#lookahead): void {
		const state = this.#state();
		const now = this.#now();
		const { transport, tempo } = state;
		if (!transport.playing) {
			this.#arps.clear();
			this.#held = [];
			this.#punch.reset();
			if (this.#anchor) {
				this.#anchor = null;
				this.#sink.stop(now);
			}
			return;
		}
		if (!this.#anchor) this.#start(state, now);
		else if (transport.position < this.#lastPosition - 1e-6) {
			// back to 0: a scene's start in the same run carries on where it can; play again, a
			// device starting over, or a scene the walks cannot carry on into, is a new timeline
			const run = (transport.starts ?? 0) === this.#starts;
			if (!run || !this.#carryOn(state)) {
				this.#sink.stop(now);
				this.#start(state, now, run);
			}
		} else if (
			this.#follow() &&
			Math.abs(transport.position + this.#offset - positionAt(this.#anchor, now)) > FOLLOW_TOLERANCE
		) {
			this.#anchor = { position: transport.position + this.#offset, time: now, bpm: tempo.bpm };
		} else if (tempo.bpm !== this.#anchor.bpm) {
			this.#anchor = { position: positionAt(this.#anchor, now), time: now, bpm: tempo.bpm };
		}
		this.#lastPosition = transport.position;
		this.#sceneEnd = this.#offset + sceneLength(state);
		const anchor = this.#anchor as Anchor;
		const until = positionAt(anchor, now + lookahead);
		const arpAhead = lookahead > this.#lookahead ? lookahead : Math.min(lookahead, ARP_LOOKAHEAD);
		// the punch-in track's notes first: what they do to the sound reaches the engine before the
		// notes they act on
		for (const p of this.#punch.update(state, positionAt(anchor, now), until)) {
			const end = timeAt(anchor, p.to);
			if (end <= now) continue;
			const start = Math.max(timeAt(anchor, p.from), now);
			this.#sink.punch?.({ key: p.trigger.key, tracks: p.trigger.tracks, start, end });
		}
		const due = [
			...this.#notes(state, anchor, until, now),
			...this.#arpeggios(state, anchor, positionAt(anchor, now + arpAhead), now),
			...this.#fills(state, anchor, until, now),
			...this.#clicks(state, anchor, until, now)
		];
		due.sort((a, b) => a.event.time - b.event.time);
		for (const item of due) {
			if (item.kind === 'note') this.#sink.note(item.event, item.settings);
			else if (item.kind === 'click') this.#sink.click(item.event);
			else if (item.kind === 'beat') this.#sink.beat?.(item.event.time, item.event.position);
			else this.#sink.automate?.(item.event.track, item.event.locks, item.event.time);
		}
	}

	/** Forgets the timeline (sound switched off); the next tick starts again from the position. */
	reset(): void {
		this.#anchor = null;
	}

	/**
	 * A scene's start while the transport plays on (the song moving on, or its one scene again),
	 * where the simulator counts from 0 again. When the scene that ended was whole bars and every
	 * track plays on what it played, back at its first step there anyway (its loop divides the
	 * scene; no pulse, pulse hold or jump in its walk; no arpeggio, whose steps count from the
	 * scene's start), the timeline goes on across the join: nothing is cut or laid down again, and
	 * each walk keeps its random source and passes. Returns false when it cannot.
	 */
	#carryOn(state: SimState): boolean {
		const length = this.#sceneEnd - this.#offset;
		if (
			!(length > 0) ||
			!Number.isFinite(length) ||
			Math.abs(length / 16 - Math.round(length / 16)) > 1e-6
		) {
			return false;
		}
		const fits = state.tracks.every((track, k) => {
			const walk = this.#walks[k];
			const pattern = currentPattern(track.sequence);
			if (!walk || walk.key !== walkKey(track, pattern)) return false;
			if (pattern.player.on && pattern.player.type === 'arpeggio') return false;
			if (hasFlowComponents(pattern)) return false;
			const slots = (this.#sceneEnd - walk.origin) / walk.scale;
			const whole = Math.round(slots);
			return Math.abs(slots - whole) < 1e-6 && whole % pattern.length === 0;
		});
		// the auxiliary tracks (the brain, punch-in) are read on the timeline: each that plays notes
		// must be back at its first step at the join too
		const aux = state.aux.every((track) => {
			const pattern = currentPattern(track.sequence);
			if (!pattern.steps.slice(0, pattern.length).some(hasNotes)) return true;
			const slots = this.#sceneEnd / scaleOf(pattern);
			const whole = Math.round(slots);
			return Math.abs(slots - whole) < 1e-6 && whole % pattern.length === 0;
		});
		if (!fits || !aux) return false;
		this.#offset = this.#sceneEnd;
		for (const walk of this.#walks) walk.join = undefined;
		return true;
	}

	/**
	 * A new timeline from the simulator's position. Within the same run (a scene the walks could not
	 * carry on into) each track that plays on its pattern keeps its random source and its passes as
	 * they were when the scene ended; the others start afresh.
	 */
	#start(state: SimState, now: number, run = false): void {
		const position = state.transport.position;
		const was = run ? this.#walks : [];
		if (!run) this.#fresh = 0;
		this.#anchor = { position, time: now + START_MARGIN, bpm: state.tempo.bpm };
		this.#offset = 0;
		this.#starts = state.transport.starts ?? 0;
		this.#walks = state.tracks.map((track, k) => {
			const pattern = currentPattern(track.sequence);
			const scale = scaleOf(pattern);
			const old = was[k];
			const from =
				old && old.key === walkKey(track, pattern)
					? { rng: old.rng, passes: (old.join ?? old.head).passes }
					: run
						? { rng: seededRng(WALK_SEED + ++this.#fresh), passes: [] }
						: undefined;
			// a count-in's bar goes by before the first slot
			return this.#walk(track, pattern, position < 0 ? 0 : firstIndex(position, scale), from);
		});
		this.#nextClick = firstIndex(position, 4, 0.5);
		this.#lastPosition = position;
		this.#arps.clear();
		this.#held = [];
		this.#punch.start(state, Math.max(0, position));
		this.#nextFill = firstIndex(Math.max(0, position), 1, 0.5);
	}

	/**
	 * A walk from the start of the scene it is laid down in (`origin` on the timeline), replayed up
	 * to slot `slot` without sounding (as the LEDs replay it): on the LEDs' random source, or on the
	 * source and passes it carries on `from`.
	 */
	#walk(
		track: TrackState,
		pattern: Pattern,
		slot: number,
		from?: { readonly rng: Rng; readonly passes: readonly number[] },
		origin = 0
	): Walk {
		let head: Playhead = from ? { ...startPlayhead(), passes: [...from.passes] } : startPlayhead();
		const rng = from?.rng ?? seededRng(WALK_SEED);
		const target = Math.max(0, slot);
		for (let i = 0; i < Math.min(target, REPLAY_LIMIT); i++) {
			head = advancePlayhead(pattern, head, rng).head;
		}
		return {
			key: walkKey(track, pattern),
			head,
			rng,
			slot: target,
			scale: scaleOf(pattern),
			origin,
			locks: {},
			hits: 0
		};
	}

	#notes(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const brain = brainInfluence(state);
		state.tracks.forEach((track, k) => {
			// a track routed into the brain moves in its key and follows its transposition
			const routed = brain !== null && brain.routes[k] === true;
			const options = routed ? { scale: brain.scale } : {};
			const pattern = currentPattern(track.sequence);
			const scale = scaleOf(pattern);
			let walk = this.#walks[k];
			const key = walkKey(track, pattern);
			if (!walk || walk.key !== key) {
				// the pattern changed under the walk: lay it down again from the scene's start, up to
				// where time has got to
				const reached = walk
					? walk.origin + walk.slot * walk.scale
					: Math.max(0, positionAt(anchor, now));
				const origin = this.#offset;
				walk = this.#walk(
					track,
					pattern,
					Math.ceil((reached - origin) / scale - 1e-9),
					undefined,
					origin
				);
				this.#walks[k] = walk;
			}
			const groove = trackGroove(state, pattern);
			const lead = 0.5 * scale + maxEarlyShift(groove);
			const audible = !track.mix.muted && track.engine !== 'midi';
			while (walk.origin + walk.slot * scale - lead < until) {
				const slot = walk.slot++;
				const at = walk.origin + slot * scale;
				// the walk as the scene ends, in case the next one lays the walks down again
				if (walk.join === undefined && at >= this.#sceneEnd - 1e-9) walk.join = walk.head;
				const next = advancePlayhead(pattern, walk.head, walk.rng, options);
				walk.head = next.head;
				// a punch-in repeat plays the slots it holds instead (the walk goes on underneath)
				const play = this.#punch.replay(k, slot, scale, next.play);
				if (!audible || !play) continue;
				this.#automate(due, k, track, pattern, walk, play.locks, at, anchor, now);
				const shift = routed ? brainShift(state, brain.key, at) : 0;
				const player = pattern.player.on ? pattern.player : null;
				const played = { walk, pattern, player, shift };
				this.#play(due, k, track, play, at, scale, groove, anchor, now, played);
			}
		});
		return due;
	}

	/**
	 * A step's locks for the notes already sounding (manual: sequencer/parameter-locks): sent when
	 * they differ from the last step's, at the step's start on the grid; with the bar menu's shape up,
	 * the values move there over that share of the step instead of jumping (its curve is ours).
	 */
	#automate(
		due: Due[],
		k: number,
		track: TrackState,
		pattern: Pattern,
		walk: Walk,
		locks: Readonly<Record<string, number>>,
		start: number,
		anchor: Anchor,
		now: number
	): void {
		const from = walk.locks;
		walk.locks = locks;
		if (sameLocks(from, locks)) return;
		const time = Math.max(timeAt(anchor, start), anchor.time);
		if (time < now - LATE) return;
		const target = Object.keys(locks).length > 0 ? locks : null;
		const span = (pattern.smoothing / 99) * scaleOf(pattern) * sixteenthSeconds(anchor.bpm);
		if (span <= 0) {
			due.push({ kind: 'automate', event: { track: k, locks: target, time } });
			return;
		}
		// a parameter without a lock on one side moves from or to the track's own value
		const ids = [...new Set([...Object.keys(from), ...Object.keys(locks)])];
		const own = (id: string) => lockParam(id)?.get(track) ?? 0;
		for (let i = 1; i <= SHAPE_POINTS; i++) {
			const u = i / SHAPE_POINTS;
			const moved: Record<string, number> = {};
			for (const id of ids) {
				const a = from[id] ?? own(id);
				moved[id] = a + ((locks[id] ?? own(id)) - a) * u;
			}
			const at = time + (span * (i - 1)) / SHAPE_POINTS;
			due.push({
				kind: 'automate',
				event: { track: k, locks: i === SHAPE_POINTS ? target : moved, time: at }
			});
		}
	}

	/**
	 * Turns what one slot plays into notes on the audio clock, `shift` semitones transposed, through
	 * the pattern's player when it is on (manual: players/*, "variations on existing sequences"):
	 * the arpeggio takes the notes as held keys for as long as they last ({@link #arpeggios}),
	 * maestro plays its chord from each note, strummed, and hold keeps them sounding until the
	 * pattern's next notes.
	 */
	#play(
		due: Due[],
		k: number,
		track: TrackState,
		play: StepPlay,
		start: number,
		scale: number,
		groove: Groove,
		anchor: Anchor,
		now: number,
		played: { walk: Walk; pattern: Pattern; player: PlayerSettings | null; shift: number }
	): void {
		if (play.notes.length === 0) return;
		const { walk, pattern, player, shift } = played;
		const settings = lockedSettings(track, play.locks);
		if (player?.type === 'arpeggio') {
			const held = (this.#held[k] ??= []);
			for (const n of play.notes) {
				if (n.velocity <= 0) continue;
				const from = start + n.time * scale;
				const note = clamp(n.note + shift, 0, 127);
				held.push({ from, to: from + n.length * scale, note, velocity: n.velocity, settings });
			}
			return;
		}
		const holdTo =
			player?.type === 'hold' ? start + stepsToNextNotes(pattern, walk.head.step) * scale : null;
		const stepSeconds = scale * sixteenthSeconds(anchor.bpm);
		const jitter = grooveJitter(seedOf(k, Math.round(start * 8)), groove);
		const depth = bendCents(1, settings.playMode.bend);
		for (const n of play.notes) {
			if (n.velocity <= 0) continue;
			const from = start + n.time * scale;
			const to = holdTo ?? from + n.length * scale;
			const begin = timeAt(anchor, grooveTime(from, groove) + jitter.shift);
			const end = timeAt(anchor, grooveTime(to, groove) + jitter.shift);
			const time = Math.max(begin, anchor.time);
			if (time < now - LATE) continue;
			const velocity = n.velocity * grooveVelocity(from, groove) * jitter.velocity;
			const bend =
				n.bend && depth !== 0
					? Float32Array.from(
							{ length: BEND_POINTS },
							(_, i) => bendCurve(n.bend!.shape, i / (BEND_POINTS - 1), n.bend!.random) * depth
						)
					: undefined;
			const note = clamp(n.note + shift, 0, 127);
			// maestro's random order has a source of its own, so the walk stays the LEDs' walk
			const hit = player?.type === 'maestro' ? walk.hits++ : 0;
			const chord =
				player?.type === 'maestro'
					? maestroEvents(
							player.maestro.chord,
							note,
							player.maestro,
							hit,
							seededRng(seedOf(k, hit))
						)
					: [{ note, time: 0 }];
			for (const hit of chord) {
				const at = Math.max(time, timeAt(anchor, grooveTime(from + hit.time * scale, groove)));
				const event = {
					track: k,
					note: hit.note,
					velocity: clamp(Math.round(velocity), 1, 127),
					time: at,
					duration: Math.max(0.01, end - at),
					glide: n.glide > 0 ? n.glide * stepSeconds : undefined,
					bend
				};
				this.#emit(due, event, settings, from + hit.time * scale, stepSeconds);
			}
		}
	}

	/**
	 * Every track's arpeggio up to `until` (manual: players/arpeggio), with the sequencer's own notes
	 * (`arpEvent`: order, range, style, note length, glide, stereo). It runs over the track's
	 * sequenced notes while they last and, on the active track, the keys held (or its hold's); its
	 * steps count from the transport's start, as its LEDs do, and a run that starts or changes speed
	 * begins with the step under the playhead, for what is left of it. Keys play at the keyboard's
	 * velocity, sequenced notes at the loudest of theirs.
	 */
	#arpeggios(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const live = arpeggioInput(state);
		const position = Math.max(0, positionAt(anchor, now));
		const sixteenth = sixteenthSeconds(anchor.bpm);
		const due: Due[] = [];
		state.tracks.forEach((track, k) => {
			const player = currentPattern(track.sequence).player;
			const keys = live?.track === k ? live.notes : [];
			// notes that have ended are forgotten
			const held = (this.#held[k] ?? []).filter((h) => h.to > position);
			this.#held[k] = held;
			const on = player.on && player.type === 'arpeggio' && track.engine !== 'midi';
			if ((!on && keys.length === 0) || (keys.length === 0 && held.length === 0)) {
				this.#arps.delete(k);
				return;
			}
			const arp = live?.track === k ? live.arp : player.arp;
			const length = arpStepLength(arp);
			const under = Math.floor(position / length + 1e-9);
			let run = this.#arps.get(k);
			if (!run || run.length !== length) {
				run = { length, step: under };
				this.#arps.set(k, run);
			}
			// the timer stalled or the timeline moved on: what went by is not played late
			run.step = Math.max(run.step, under);
			while (run.step * length < until) {
				const step = run.step++;
				const at = step * length;
				const sounding = held
					.filter((h) => h.from <= at + 1e-9 && at < h.to - 1e-9)
					.sort((a, b) => a.from - b.from || a.note - b.note);
				const notes = [...new Set([...sounding.map((h) => h.note), ...keys])];
				const event = notes.length > 0 ? arpEvent(notes, arp, step, WALK_SEED) : null;
				if (!event) continue;
				const begin = timeAt(anchor, event.time);
				const end = begin + event.length * sixteenth;
				const time = Math.max(begin, now, anchor.time);
				if (end - time < ARP_SHORTEST) continue;
				const velocity =
					keys.length > 0 ? KEY_VELOCITY : Math.max(...sounding.map((h) => h.velocity));
				const note = {
					track: k,
					note: event.note,
					velocity: clamp(Math.round(velocity), 1, 127),
					time,
					duration: end - time,
					glide: event.glide > 0 ? event.glide * length * sixteenth : undefined,
					pan: event.pan !== 0 ? event.pan : undefined
				};
				const settings = sounding.at(-1)?.settings ?? track;
				this.#emit(due, note, settings, event.time, length * sixteenth);
			}
		});
		return due;
	}

	/**
	 * A sequenced note at transport position `position`, through the punch-in effects that act on
	 * the sequencer's notes (octave, random, the ramps; follow adds the group's other tracks).
	 */
	#emit(
		due: Due[],
		event: ScheduledNote,
		settings: TrackState,
		position: number,
		stepSeconds: number
	): void {
		for (const played of this.#punch.expand(event, settings, position, stepSeconds)) {
			due.push({ kind: 'note', settings: played.settings, event: played.note });
		}
	}

	/** The punch-in drum fills up to `until`: their hits, on each track's own groove. */
	#fills(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const sixteenth = sixteenthSeconds(anchor.bpm);
		while (this.#nextFill < until) {
			const j = this.#nextFill++;
			for (const hit of this.#punch.fills(j)) {
				const track = state.tracks[hit.track];
				if (!track) continue;
				const groove = trackGroove(state, currentPattern(track.sequence));
				const time = Math.max(timeAt(anchor, grooveTime(j, groove)), anchor.time);
				if (time < now - LATE) continue;
				const event = { ...hit, time, duration: sixteenth };
				this.#emit(due, event, track, j, sixteenth);
			}
		}
		return due;
	}

	#clicks(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const { on, level } = state.tempo.metronome;
		while (this.#nextClick * 4 < until) {
			const beat = this.#nextClick++;
			const time = Math.max(timeAt(anchor, beat * 4), anchor.time);
			if (time < now - LATE) continue;
			// every beat of the sequence itself, not a count-in's, whether the metronome is heard or not
			if (beat >= 0) due.push({ kind: 'beat', event: { time, position: beat * 4 } });
			// the metronome while it is on, and always through a recording's count-in bar
			if (level <= 0 || (!on && beat >= 0)) continue;
			due.push({
				kind: 'click',
				event: { time, accent: ((beat % 4) + 4) % 4 === 0, gain: metronomeGain(level) }
			});
		}
		return due;
	}
}
