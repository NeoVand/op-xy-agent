/**
 * The sequencer's clock for the sound engine: a lookahead scheduler (the "two clocks" pattern). A
 * timer ticks every 25 ms; each tick looks about 100 ms ahead on the audio clock and schedules every
 * note and metronome click due in that window at its exact audio time, so timing is sample-accurate
 * however late the timer fires. Each tick reads the simulator's state (plain reactive data): every
 * instrument track's current pattern with its own length and scale, the notes' velocities, lengths
 * and micro-timing, the tempo page's groove, and the metronome while it is on.
 *
 * Its timeline is anchored on the audio clock when the transport starts, so steps follow the tempo
 * rather than the page's frames. It starts again from the simulator's position when that jumps back
 * (play pressed again, a device's Start), re-anchors when the tempo changes, follows the position
 * while a device's clock drives it, and ends the sequence's notes when the transport stops.
 *
 * What a step plays is one function, {@link StepEventsFn}: today the stored notes; once the sequencer
 * model has `stepEvents` (step components), that — see {@link sequencerStepEvents}.
 */
import type { SimState, TrackState } from '$lib/sim/params';
import * as sequencer from '$lib/sim/sequencer';
import { MAX_STEPS, currentPattern, type Pattern } from '$lib/sim/sequencer';
import { grooveJitter, grooveTime, grooveVelocity, maxEarlyShift, type Groove } from './groove';
import { metronomeGain } from './mapping';
import { seedOf } from './random';

/** A note a step plays on one pass: the stored note, or what step components make of it. */
export interface StepEvent {
	/** MIDI note (drum tracks: 53–76, one sound per key). */
	readonly note: number;
	/** 1–127. */
	readonly velocity: number;
	/** In steps. */
	readonly length: number;
	/** From the step's start, in steps (micro-timing, ratchets). */
	readonly offset: number;
}

/**
 * What step `stepIndex` of `pattern` plays on its `pass`-th visit (0 = the first time through since
 * play). The sequencer model is getting its own, `stepEvents(pattern, stepIndex, pass)` in
 * `$lib/sim/sequencer`, with the step components' meaning (pulse, multiply, ramps, skips…).
 */
export type StepEventsFn = (
	pattern: Pattern,
	stepIndex: number,
	pass: number
) => readonly Partial<StepEvent>[];

/** Until step components are modelled: the notes stored on the step, as they are. */
export const plainStepEvents: StepEventsFn = (pattern, stepIndex) =>
	pattern.steps[stepIndex]?.notes ?? [];

/**
 * The sequencer model's `stepEvents` once it exists (looked up by name, so this builds before and
 * after it lands), else null. The app passes `sequencerStepEvents() ?? plainStepEvents`.
 */
export function sequencerStepEvents(): StepEventsFn | null {
	const candidate: unknown = (sequencer as Record<string, unknown>)['stepEvents'];
	return typeof candidate === 'function' ? (candidate as StepEventsFn) : null;
}

/** A note to play. */
export interface NoteEvent {
	/** Instrument track 0–7. */
	readonly track: number;
	readonly note: number;
	readonly velocity: number;
	/** Audio time the note starts. */
	readonly time: number;
	/** Seconds until it is let go. */
	readonly duration: number;
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
	note(event: NoteEvent, track: TrackState): void;
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
	/** What a step plays (default {@link plainStepEvents}). */
	readonly stepEvents?: StepEventsFn;
	/** True while something outside sets the position (a device's clock): follow it. */
	readonly follow?: () => boolean;
}

/** How often the app ticks the scheduler (ms) and how far each tick looks ahead (s). */
export const TICK_MS = 25;
export const LOOKAHEAD = 0.1;

/** Notes due further than this before now are dropped rather than played late (a stalled timer). */
const LATE = 0.03;
/** The first notes after play land this far after the tick that starts them. */
const START_MARGIN = 0.01;
/** Following a device's clock, drifts beyond this many sixteenths re-anchor the timeline. */
const FOLLOW_TOLERANCE = 0.5;

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
 * The first step (of `size` sixteenths) to play when starting at `position`: the one under it when
 * less than `tolerance` has passed since it began (it plays at once), else the next.
 */
export function firstIndex(position: number, size: number, tolerance = size / 2): number {
	const n = Math.floor(position / size + 1e-9);
	return position - n * size > tolerance ? n + 1 : n;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Keeps the events that name a real note, with defaults for anything left out. */
export function toEvents(events: readonly Partial<StepEvent>[]): StepEvent[] {
	const out: StepEvent[] = [];
	for (const e of events) {
		if (typeof e.note !== 'number' || !Number.isFinite(e.note) || e.note < 0 || e.note > 127)
			continue;
		out.push({
			note: Math.round(e.note),
			velocity: clamp(Math.round(e.velocity ?? 100), 1, 127),
			length: Math.max(0.05, Number.isFinite(e.length) ? (e.length as number) : 1),
			offset: Number.isFinite(e.offset) ? (e.offset as number) : 0
		});
	}
	return out;
}

type Due =
	| { readonly kind: 'note'; readonly event: NoteEvent; readonly track: TrackState }
	| { readonly kind: 'click'; readonly event: ClickEvent };

/** Plays the simulator's patterns on the audio clock; call {@link tick} every {@link TICK_MS}. */
export class Scheduler {
	readonly #state: () => SimState;
	readonly #now: () => number;
	readonly #sink: SchedulerSink;
	readonly #lookahead: number;
	readonly #stepEvents: StepEventsFn;
	readonly #follow: () => boolean;
	#anchor: Anchor | null = null;
	/** Per track: the next step (counted from position 0) and the scale it was counted in. */
	#next: number[] = [];
	#scales: number[] = [];
	#nextClick = 0;
	#lastPosition = 0;

	constructor(options: SchedulerOptions) {
		this.#state = options.state;
		this.#now = options.now;
		this.#sink = options.sink;
		this.#lookahead = options.lookahead ?? LOOKAHEAD;
		this.#stepEvents = options.stepEvents ?? plainStepEvents;
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
			if (this.#anchor) {
				this.#anchor = null;
				this.#sink.stop(now);
			}
			return;
		}
		if (!this.#anchor) this.#start(state, now);
		else if (transport.position < this.#lastPosition - 1e-6) {
			// back to the start (play again) or wherever a device started: a new timeline
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
			if (item.kind === 'note') this.#sink.note(item.event, item.track);
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
		this.#scales = state.tracks.map((t) => scaleOf(currentPattern(t.sequence)));
		this.#next = this.#scales.map((scale) => firstIndex(position, scale));
		this.#nextClick = firstIndex(position, 4, 0.5);
		this.#lastPosition = position;
	}

	#notes(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const groove: Groove = { type: state.tempo.groove, amount: state.tempo.swing };
		const early = maxEarlyShift(groove);
		state.tracks.forEach((track, k) => {
			const pattern = currentPattern(track.sequence);
			const scale = scaleOf(pattern);
			if (this.#next[k] === undefined) {
				this.#next[k] = firstIndex(positionAt(anchor, now), scale);
				this.#scales[k] = scale;
			}
			if (scale !== this.#scales[k]) {
				// a new track scale: carry on from the same point in time
				this.#next[k] = Math.ceil((this.#next[k] * this.#scales[k]) / scale - 1e-9);
				this.#scales[k] = scale;
			}
			const length = clamp(Math.round(pattern.length), 1, MAX_STEPS);
			const lead = 0.5 * scale + early;
			const audible = !track.mix.muted && track.engine !== 'midi';
			while (this.#next[k] * scale - lead < until) {
				const n = this.#next[k]++;
				if (!audible) continue;
				const events = toEvents(this.#stepEvents(pattern, n % length, Math.floor(n / length)));
				const jitter = grooveJitter(seedOf(k, n), groove);
				for (const e of events) {
					const from = (n + e.offset) * scale;
					const to = from + e.length * scale;
					const start = timeAt(anchor, grooveTime(from, groove) + jitter.shift);
					const end = timeAt(anchor, grooveTime(to, groove) + jitter.shift);
					const time = Math.max(start, anchor.time);
					if (time < now - LATE) continue;
					const velocity = e.velocity * grooveVelocity(from, groove) * jitter.velocity;
					due.push({
						kind: 'note',
						track,
						event: {
							track: k,
							note: e.note,
							velocity: clamp(Math.round(velocity), 1, 127),
							time,
							duration: Math.max(0.01, end - time)
						}
					});
				}
			}
		});
		return due;
	}

	#clicks(state: SimState, anchor: Anchor, until: number, now: number): Due[] {
		const due: Due[] = [];
		const { on, level } = state.tempo.metronome;
		while (this.#nextClick * 4 < until) {
			const beat = this.#nextClick++;
			if (!on || level <= 0) continue;
			const time = Math.max(timeAt(anchor, beat * 4), anchor.time);
			if (time < now - LATE) continue;
			due.push({
				kind: 'click',
				event: { time, accent: beat % 4 === 0, gain: metronomeGain(level) }
			});
		}
		return due;
	}
}

/** Sixteenths per step (the track scale), never zero. */
const scaleOf = (pattern: Pattern) => (pattern.scale > 0 ? pattern.scale : 1);
