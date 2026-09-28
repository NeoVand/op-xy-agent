/**
 * The punch-in effects that act on the sequencer's notes, for the scheduler (research 60 §6: drums
 * a computer played in were left alone by these, while the device's own patterns were not): the
 * repeats, octave, follow, the drum fills, the ramps and random. Slot by slot the scheduler asks
 * what a track plays under them (`replay`), what becomes of each note (`expand`) and what the fills
 * add (`fills`). This keeps what that takes between ticks: the punch-in track's walk, where each
 * held key began, the slots a repeat loops over, and how far a ramp has climbed.
 */
import type { SimState, TrackState } from '$lib/sim/params';
import { currentPattern, type Pattern } from '$lib/sim/sequencer';
import type { StepPlay } from '$lib/sim/sequencer-playback';
import { random, seedOf } from '../random';
import {
	OCTAVE_SEMITONES,
	PUNCH_FIRST_NOTE,
	PUNCH_GLIDE,
	PUNCH_KEYS,
	RAMPS,
	RANDOM_INTERVALS,
	REPEAT_STEPS,
	effectOf,
	fillAt,
	groupOf,
	punchTracks,
	type PunchEffect
} from './effects';
import { PUNCH_TRACK, heldTriggers } from './held';
import type { PunchTrigger } from './state';

/** A note as the scheduler emits it (the fields the punch-ins touch). */
export interface PunchedNote {
	readonly track: number;
	readonly note: number;
	readonly velocity: number;
	/** Semitones on a drum key's tune (octave on the percussion group). */
	readonly tune?: number;
	/** Seconds to glide in from the last note. */
	readonly glide?: number;
}

/** A punch-in note of the punch-in track's pattern, in transport sixteenths. */
export interface PatternPunch {
	readonly trigger: PunchTrigger;
	readonly from: number;
	readonly to: number;
}

/** An effect holding on a track, the transport position it began at, and the press it came from. */
interface Holding {
	readonly effect: PunchEffect;
	readonly since: number;
	readonly source: string;
}

/** Slots of history kept per track beyond what a repeat needs. */
const HISTORY = 16;

const clampNote = (n: number) => Math.min(127, Math.max(0, n));

/** The sequencer's side of the punch-ins. */
export class PunchSequencer {
	#tracks: readonly TrackState[] = [];
	/** Keys held now, and the transport position each was first seen at. */
	#live: { trigger: PunchTrigger; since: number }[] = [];
	#pattern: PatternPunch[] = [];
	/** The punch-in track's next slot, and its pattern's step length (sixteenths). */
	#slot = 0;
	#scale = 1;
	#history: Map<number, StepPlay | null>[] = [];
	#ramps: ({ since: number; last: number; count: number } | null)[] = [];

	/** The transport starts (or starts over) at `position`: the walk begins at the slot there. */
	start(state: SimState, position: number): void {
		const pattern = this.#punchPattern(state);
		this.#scale = pattern && pattern.scale > 0 ? pattern.scale : 1;
		this.#slot = Math.max(0, Math.ceil(position / this.#scale - 1e-9));
		this.#pattern = [];
		this.#history = [];
		this.#ramps = [];
		this.#live = [];
	}

	/** Forgets everything (the transport stopped). */
	reset(): void {
		this.#pattern = [];
		this.#history = [];
		this.#ramps = [];
		this.#live = [];
	}

	/**
	 * A tick: the keys held now (at transport position `now`) and the punch-in track's notes up to
	 * `until` (sixteenths). Returns the pattern's new punch-ins, for the sound engine.
	 */
	update(state: SimState, now: number, until: number): PatternPunch[] {
		this.#tracks = state.tracks;
		const held = heldTriggers(state);
		const same = (a: PunchTrigger, b: PunchTrigger) => a.key === b.key && a.from === b.from;
		this.#live = held.map((trigger) => {
			const before = this.#live.find((l) => same(l.trigger, trigger));
			return { trigger, since: before ? before.since : now };
		});
		this.#pattern = this.#pattern.filter((p) => p.to > now - 1);
		const added: PatternPunch[] = [];
		const pattern = this.#punchPattern(state);
		const scale = pattern && pattern.scale > 0 ? pattern.scale : 1;
		if (scale !== this.#scale) {
			this.#scale = scale;
			this.#slot = Math.max(0, Math.ceil(now / scale - 1e-9));
		}
		const muted = state.aux[PUNCH_TRACK]?.mix.muted ?? true;
		// a note may start half a step early (micro-timing): look that far ahead
		while ((this.#slot - 0.5) * scale < until) {
			const slot = this.#slot++;
			if (!pattern || muted || pattern.length <= 0) continue;
			const step = pattern.steps[slot % pattern.length];
			for (const n of step?.notes ?? []) {
				const key = n.note - PUNCH_FIRST_NOTE;
				if (key < 0 || key >= PUNCH_KEYS || n.length <= 0) continue;
				const from = (slot + n.offset) * scale;
				const trigger = { key, from: null, tracks: punchTracks(state.tracks, { key, from: null }) };
				const punch = { trigger, from, to: from + n.length * scale };
				this.#pattern.push(punch);
				added.push(punch);
			}
		}
		return added;
	}

	/** The effects holding on track `k` at transport position `position`. */
	effects(k: number, position: number): Holding[] {
		const track = this.#tracks[k];
		const group = track ? groupOf(track.engine) : null;
		if (!group) return [];
		const out: Holding[] = [];
		for (const { trigger, since } of this.#live) {
			if (!trigger.tracks.includes(k)) continue;
			const source = `live ${trigger.key} ${trigger.from}`;
			out.push({ effect: effectOf(trigger.key, group), since, source });
		}
		for (const p of this.#pattern) {
			if (p.from <= position + 1e-9 && position < p.to - 1e-9 && p.trigger.tracks.includes(k)) {
				const source = `pattern ${p.trigger.key} ${p.from}`;
				out.push({ effect: effectOf(p.trigger.key, group), since: p.from, source });
			}
		}
		return out;
	}

	/**
	 * What track `k` plays in slot `slot` (steps of `scale` sixteenths), given what its walk plays
	 * there: under a repeat, the slots from the one the key went down in, over and over; the walk
	 * goes on underneath, so the pattern carries on in place when the key is let go.
	 */
	replay(k: number, slot: number, scale: number, play: StepPlay | null): StepPlay | null {
		const history = (this.#history[k] ??= new Map());
		history.set(slot, play);
		const repeat = this.effects(k, slot * scale)
			.filter((h) => REPEAT_STEPS[h.effect] !== undefined)
			.sort((a, b) => b.since - a.since)[0];
		const first = repeat ? Math.floor(repeat.since / scale + 1e-9) : slot;
		for (const old of history.keys())
			if (old < Math.min(first, slot - HISTORY)) history.delete(old);
		if (!repeat) return play;
		const length = REPEAT_STEPS[repeat.effect] ?? 1;
		if (slot < first + length) return play;
		return history.get(first + ((slot - first) % length)) ?? null;
	}

	/**
	 * What becomes of a note of track `k` at transport position `position` (a step lasting
	 * `stepSeconds`): octave, random and the ramps change it; follow plays it on the group's other
	 * tracks too. Each comes back with the settings it plays with.
	 */
	expand<N extends PunchedNote>(
		note: N,
		settings: TrackState,
		position: number,
		stepSeconds: number
	): { note: N; settings: TrackState }[] {
		const k = note.track;
		const group = groupOf(settings.engine);
		const holding = this.effects(k, position);
		if (!group || holding.length === 0) return [{ note, settings }];
		const has = (effect: PunchEffect) => holding.some((h) => h.effect === effect);
		let out: N = note;
		if (has('octave')) {
			out =
				group === 'percussion'
					? { ...out, tune: (out.tune ?? 0) + OCTAVE_SEMITONES.percussion }
					: { ...out, note: clampNote(out.note + OCTAVE_SEMITONES.melodic) };
		}
		if (has('random')) {
			const next = random(seedOf(k, Math.round(position * 96), note.note));
			out =
				group === 'percussion'
					? { ...out, note: PUNCH_FIRST_NOTE + Math.floor(next() * PUNCH_KEYS) }
					: {
							...out,
							note: clampNote(
								out.note + RANDOM_INTERVALS[Math.floor(next() * RANDOM_INTERVALS.length)]
							),
							glide: PUNCH_GLIDE * stepSeconds
						};
		}
		const ramp = holding.find((h) => RAMPS[h.effect] !== undefined);
		if (ramp && group === 'melodic') {
			const ladder = RAMPS[ramp.effect]!;
			let r = this.#ramps[k];
			if (!r || r.since !== ramp.since) r = { since: ramp.since, last: position, count: 0 };
			else if (position > r.last + 1e-6) r = { ...r, last: position, count: r.count + 1 };
			this.#ramps[k] = r;
			out = {
				...out,
				note: clampNote(out.note + ladder[r.count % ladder.length]),
				glide: PUNCH_GLIDE * stepSeconds
			};
		}
		const played = [{ note: out, settings }];
		if (!has('follow')) return played;
		// follow: the group's other tracks play the note too, each with its own sound
		this.#tracks.forEach((t, j) => {
			if (j === k || groupOf(t.engine) !== group || t.mix.muted) return;
			played.push({ note: { ...out, track: j }, settings: t });
		});
		return played;
	}

	/**
	 * What the drum fills add on transport sixteenth `sixteenth`: each fill held plays once, on the
	 * first percussion track it acts on (ours: two kits need not play it twice), on that track's kit.
	 */
	fills(sixteenth: number): PunchedNote[] {
		const notes: PunchedNote[] = [];
		const played = new Set<string>();
		this.#tracks.forEach((t, k) => {
			if (t.engine !== 'drum' || t.mix.muted) return;
			for (const { effect, source } of this.effects(k, sixteenth)) {
				const hits = fillAt(effect, sixteenth);
				if (hits.length === 0 || played.has(source)) continue;
				played.add(source);
				for (const hit of hits) {
					notes.push({ track: k, note: PUNCH_FIRST_NOTE + hit.key, velocity: hit.velocity });
				}
			}
		});
		return notes;
	}

	#punchPattern(state: SimState): Pattern | null {
		const track = state.aux[PUNCH_TRACK];
		return track ? currentPattern(track.sequence) : null;
	}
}
