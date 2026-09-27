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
 * locks, which reach the voice through the track settings the note starts with. On top come the
 * tempo page's groove (or the track's own groove from the bar menu) and the metronome, which also
 * counts in a recording.
 *
 * Each track's walk runs on a random source seeded like the LEDs' walk (`playheadAt`), and is laid
 * down again from the start whenever what it depends on changes (the scale, the length, the flow
 * components, another pattern), as the LEDs do, so what sounds is what lights unless the walk itself
 * is random. The timeline is anchored on the audio clock when the transport starts; it starts again
 * from the simulator's position when that jumps back (play again, a scene or a device starting over),
 * re-anchors when the tempo changes, follows the position while a device's clock drives it, and
 * ends the sequence's notes when the transport stops.
 */
import { lockParam } from '$lib/sim/areas/sequencer/locks';
import type { SimState, TrackState } from '$lib/sim/params';
import {
	advancePlayhead,
	bendCurve,
	seededRng,
	startPlayhead,
	type Playhead,
	type Rng,
	type StepPlay
} from '$lib/sim/sequencer-playback';
import { currentPattern, type Pattern } from '$lib/sim/sequencer';
import { grooveJitter, grooveTime, grooveVelocity, maxEarlyShift, type Groove } from './groove';
import { bendCents, metronomeGain } from './mapping';
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
	/** The transport stopped or jumped at `time`: end the sequence's notes, drop what comes later. */
	stop(time: number): void;
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

/** The seed of every track's walk: the LEDs' (`playheadAt`'s default). */
export const WALK_SEED = 1;

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

/** One track's walk through its pattern. */
interface Walk {
	key: string;
	head: Playhead;
	rng: Rng;
	/** The next slot to schedule (slot j starts at j × scale sixteenths). */
	slot: number;
	scale: number;
}

type Due =
	| { readonly kind: 'note'; readonly event: ScheduledNote; readonly settings: TrackState }
	| { readonly kind: 'click'; readonly event: ClickEvent };

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

	/** The step each track's walk is on (for tests and diagnostics). */
	get steps(): number[] {
		return this.#walks.map((w) => w.head.step);
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
			if (this.#anchor) {
				this.#anchor = null;
				this.#sink.stop(now);
			}
			return;
		}
		if (!this.#anchor) this.#start(state, now);
		else if (transport.position < this.#lastPosition - 1e-6) {
			// back to the start (play again), a scene's start, a device starting over: a new timeline
			this.#sink.stop(now);
			this.#start(state, now);
		} else if (
			this.#follow() &&
			Math.abs(transport.position - positionAt(this.#anchor, now)) > FOLLOW_TOLERANCE
		) {
			this.#anchor = { position: transport.position, time: now, bpm: tempo.bpm };
		} else if (tempo.bpm !== this.#anchor.bpm) {
			this.#anchor = { position: positionAt(this.#anchor, now), time: now, bpm: tempo.bpm };
		}
		this.#lastPosition = transport.position;
		const anchor = this.#anchor as Anchor;
		const until = positionAt(anchor, now + lookahead);
		const due = [
			...this.#notes(state, anchor, until, now),
			...this.#clicks(state, anchor, until, now)
		];
		due.sort((a, b) => a.event.time - b.event.time);
		for (const item of due) {
			if (item.kind === 'note') this.#sink.note(item.event, item.settings);
			else this.#sink.click(item.event);
		}
	}

	/** Forgets the timeline (sound switched off); the next tick starts again from the position. */
	reset(): void {
		this.#anchor = null;
	}

	#start(state: SimState, now: number): void {
		const position = state.transport.position;
		this.#anchor = { position, time: now + START_MARGIN, bpm: state.tempo.bpm };
		this.#walks = state.tracks.map((track) => {
			const pattern = currentPattern(track.sequence);
			const scale = scaleOf(pattern);
			// a count-in's bar goes by before the first slot
			return this.#walk(track, pattern, position < 0 ? 0 : firstIndex(position, scale));
		});
		this.#nextClick = firstIndex(position, 4, 0.5);
		this.#lastPosition = position;
	}

	/** A walk from the start, replayed up to slot `slot` without sounding (as the LEDs replay it). */
	#walk(track: TrackState, pattern: Pattern, slot: number): Walk {
		let head = startPlayhead();
		const rng = seededRng(WALK_SEED);
		const target = Math.max(0, slot);
		for (let i = 0; i < Math.min(target, REPLAY_LIMIT); i++) {
			head = advancePlayhead(pattern, head, rng).head;
		}
		return { key: walkKey(track, pattern), head, rng, slot: target, scale: scaleOf(pattern) };
	}

	#notes(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		state.tracks.forEach((track, k) => {
			const pattern = currentPattern(track.sequence);
			const scale = scaleOf(pattern);
			let walk = this.#walks[k];
			const key = walkKey(track, pattern);
			if (!walk || walk.key !== key) {
				// the pattern changed under the walk: lay it down again from where time has got to
				const reached = walk ? walk.slot * walk.scale : Math.max(0, positionAt(anchor, now));
				walk = this.#walk(track, pattern, Math.ceil(reached / scale - 1e-9));
				this.#walks[k] = walk;
			}
			const groove = trackGroove(state, pattern);
			const lead = 0.5 * scale + maxEarlyShift(groove);
			const audible = !track.mix.muted && track.engine !== 'midi';
			while (walk.slot * scale - lead < until) {
				const slot = walk.slot++;
				const next = advancePlayhead(pattern, walk.head, walk.rng);
				walk.head = next.head;
				if (!audible || !next.play) continue;
				this.#play(due, k, track, next.play, slot * scale, scale, groove, anchor, now);
			}
		});
		return due;
	}

	/** Turns what one slot plays into notes on the audio clock. */
	#play(
		due: Due[],
		k: number,
		track: TrackState,
		play: StepPlay,
		start: number,
		scale: number,
		groove: Groove,
		anchor: Anchor,
		now: number
	): void {
		if (play.notes.length === 0) return;
		const settings = lockedSettings(track, play.locks);
		const stepSeconds = scale * sixteenthSeconds(anchor.bpm);
		const jitter = grooveJitter(seedOf(k, Math.round(start * 8)), groove);
		const depth = bendCents(1, settings.playMode.bend);
		for (const n of play.notes) {
			if (n.velocity <= 0) continue;
			const from = start + n.time * scale;
			const to = from + n.length * scale;
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
			due.push({
				kind: 'note',
				settings,
				event: {
					track: k,
					note: n.note,
					velocity: clamp(Math.round(velocity), 1, 127),
					time,
					duration: Math.max(0.01, end - time),
					glide: n.glide > 0 ? n.glide * stepSeconds : undefined,
					bend
				}
			});
		}
	}

	#clicks(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const { on, level } = state.tempo.metronome;
		while (this.#nextClick * 4 < until) {
			const beat = this.#nextClick++;
			// the metronome while it is on, and always through a recording's count-in bar
			if (level <= 0 || (!on && beat >= 0)) continue;
			const time = Math.max(timeAt(anchor, beat * 4), anchor.time);
			if (time < now - LATE) continue;
			due.push({
				kind: 'click',
				event: { time, accent: ((beat % 4) + 4) % 4 === 0, gain: metronomeGain(level) }
			});
		}
		return due;
	}
}
