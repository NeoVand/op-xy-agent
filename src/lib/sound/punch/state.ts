/**
 * Which punch-in effects hold, on which tracks, and when (plain TypeScript, for the sound engine):
 * the keys held now (open-ended until let go) and the punch-in track's notes the sequencer plays
 * (with their times, ahead). A note asks what it gets as it starts (`at`); the effects that act on
 * the sound come out as spans for the punch-in processor, and as ends when a key is let go early
 * or the transport stops.
 */
import type { EngineId } from '$lib/core/opxy';
import type { CoreEffect } from './core';
import { effectOf, groupOf, type PunchEffect, type PunchGroup } from './effects';

/** A press held (or scheduled): its key (0–23), what it came from, and the tracks it acts on. */
export interface PunchTrigger {
	readonly key: number;
	/** The instrument track of a `shift + key` shortcut; null for the punch-in track. */
	readonly from: number | null;
	readonly tracks: readonly number[];
}

/** An effect on the sound of one track, from … to (seconds; Infinity while held). */
export interface SoundSpan {
	readonly id: number;
	readonly track: number;
	readonly effect: CoreEffect;
	readonly from: number;
	readonly to: number;
}

/** What the punch-in processor must hear about. */
export type SoundChange =
	| { readonly kind: 'add'; readonly span: SoundSpan }
	| { readonly kind: 'end'; readonly id: number; readonly track: number; readonly at: number };

interface Span {
	readonly id: number;
	readonly key: number;
	readonly from: number | null;
	readonly source: 'live' | 'pattern';
	/** The tracks it acts on, each with the group it had when the span began. */
	readonly targets: readonly { readonly track: number; readonly group: PunchGroup }[];
	readonly start: number;
	end: number;
}

/** The sound effect a track's effect needs (none for the effects that act on notes). */
function soundEffect(effect: PunchEffect, group: PunchGroup): CoreEffect | null {
	if (effect === 'mute') return 'mute';
	if (effect === 'stutter') return group === 'percussion' ? 'chop' : 'stutter';
	if (effect === 'pan' && group === 'melodic') return 'sweep';
	return null;
}

/** Tracks per span id (a span's sound ids are its id × 8 + the track). */
const TRACKS = 8;

/** The punch-in effects over time. */
export class PunchState {
	#spans: Span[] = [];
	#next = 1;

	/**
	 * The keys held now (live presses), at `time`: new ones begin, ones no longer held end.
	 * `engines` are the tracks' engines now (which group each track feeds).
	 */
	live(
		triggers: readonly PunchTrigger[],
		time: number,
		engines: readonly EngineId[]
	): SoundChange[] {
		const changes: SoundChange[] = [];
		const same = (s: Span, t: PunchTrigger) => s.key === t.key && s.from === t.from;
		for (const s of this.#spans) {
			if (s.source !== 'live' || s.end <= time) continue;
			if (!triggers.some((t) => same(s, t))) changes.push(...this.#end(s, time));
		}
		for (const t of triggers) {
			const held = this.#spans.some((s) => s.source === 'live' && s.end > time && same(s, t));
			if (!held) changes.push(...this.#begin(t, 'live', time, Infinity, engines));
		}
		return changes;
	}

	/** A punch-in note the sequencer plays: `trigger` from `start` to `end` (seconds). */
	pattern(
		trigger: PunchTrigger,
		start: number,
		end: number,
		engines: readonly EngineId[]
	): SoundChange[] {
		if (!(end > start)) return [];
		return this.#begin(trigger, 'pattern', start, end, engines);
	}

	/** The transport stopped at `time`: the sequencer's punch-ins end there. */
	stop(time: number): SoundChange[] {
		const changes: SoundChange[] = [];
		for (const s of this.#spans) {
			if (s.source === 'pattern' && s.end > time) changes.push(...this.#end(s, time));
		}
		return changes;
	}

	/** Forgets every effect (sound switched off). */
	clear(): void {
		this.#spans = [];
	}

	/** Drops what ended before `time`. */
	prune(time: number): void {
		this.#spans = this.#spans.filter((s) => s.end > time);
	}

	/** Spans still to finish (for tests and bookkeeping). */
	get size(): number {
		return this.#spans.length;
	}

	/** The effects on the sound still to end after `time` (for a processor that arrives late). */
	sounding(time: number): SoundSpan[] {
		return this.#spans.flatMap((s) => {
			if (s.end <= time) return [];
			return s.targets.flatMap(({ track, group }) => {
				const effect = soundEffect(effectOf(s.key, group), group);
				return effect
					? [{ id: s.id * TRACKS + track, track, effect, from: s.start, to: s.end }]
					: [];
			});
		});
	}

	/** The effects that hold on `track` at `time`, as its group hears them. */
	at(track: number, time: number): PunchEffect[] {
		const out: PunchEffect[] = [];
		for (const s of this.#spans) {
			if (s.start > time || s.end <= time) continue;
			const target = s.targets.find((t) => t.track === track);
			if (target) out.push(effectOf(s.key, target.group));
		}
		return out;
	}

	#begin(
		t: PunchTrigger,
		source: Span['source'],
		start: number,
		end: number,
		engines: readonly EngineId[]
	): SoundChange[] {
		const targets = t.tracks.flatMap((track) => {
			const engine = engines[track];
			const group = engine ? groupOf(engine) : null;
			return group && track >= 0 && track < TRACKS ? [{ track, group }] : [];
		});
		if (targets.length === 0) return [];
		const span: Span = { id: this.#next++, key: t.key, from: t.from, source, targets, start, end };
		this.#spans.push(span);
		return targets.flatMap(({ track, group }) => {
			const effect = soundEffect(effectOf(t.key, group), group);
			if (!effect) return [];
			return [
				{
					kind: 'add' as const,
					span: { id: span.id * TRACKS + track, track, effect, from: start, to: end }
				}
			];
		});
	}

	#end(s: Span, time: number): SoundChange[] {
		s.end = Math.max(s.start, time);
		return s.targets.flatMap(({ track, group }) =>
			soundEffect(effectOf(s.key, group), group)
				? [{ kind: 'end' as const, id: s.id * TRACKS + track, track, at: s.end }]
				: []
		);
	}
}
