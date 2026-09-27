/**
 * Playback semantics of the simulator's sequencer (decision D10): what a pattern actually plays,
 * as pure functions a sound engine calls slot by slot. The model and its editing live in
 * `sequencer.ts`; this module reads it.
 *
 * - {@link stepEvents}: what one step sounds on one pass, after all 14 step components (manual:
 *   sequencer/step-component-reference): the notes with their timing inside the step, velocity,
 *   length, glide and bend; the locks that apply; and how the step bends the flow (pulse repeats,
 *   pulse hold, jump).
 * - {@link advancePlayhead}: the track's walk slot by slot (a slot lasts one step, `scale`
 *   sixteenths), counting passes per step and following pulse, pulse hold and jump.
 *   {@link playheadAt} replays that walk to find the step playing at a given slot.
 * - Players (manual: players/*): {@link arpeggio} / {@link arpEvent}, {@link maestroNotes} /
 *   {@link maestroEvents} and the hold player's {@link latchNotes}.
 *
 * Randomness always comes from an injected {@link Rng}, so a seeded run repeats exactly. Where TE
 * names a behaviour but not its numbers (bend curves, ramp spacing, random chances, "every Nth
 * pass"), the choice is ours and marked so. Groove (bar menu E3 with the tempo page's groove type)
 * is not applied here: TE's groove templates are unknown.
 */
import {
	ARP_PATTERNS,
	ARP_SPEEDS,
	ARP_STYLES,
	MAESTRO_PATTERNS,
	getComponent,
	stepAt,
	type ArpSettings,
	type MaestroSettings,
	type Pattern,
	type SeqStep,
	type StepComponentKind
} from './sequencer';

/** A random source returning 0 ≤ x < 1: `Math.random`, or {@link seededRng} for repeatable runs. */
export type Rng = () => number;

/** A repeatable random source (mulberry32). */
export function seededRng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The scale ramps, random and tonality move in: a root pitch class (0 = C) and the semitones of its
 * degrees within an octave. The manual suggests the brain's song scale; without one it is
 * chromatic.
 */
export interface MusicalScale {
	readonly root: number;
	readonly degrees: readonly number[];
}

/** All twelve semitones. */
export const CHROMATIC: MusicalScale = { root: 0, degrees: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };

/** The bend component's shapes, digits 1–9 then 0 (manual: sequencer/component-bend). */
export const BEND_SHAPES = [
	'down-up',
	'up-down',
	'bump down',
	'bump up',
	'spring out',
	'spring in',
	'fade down',
	'fade up',
	'random 1',
	'random 2'
] as const;
export type BendShape = (typeof BEND_SHAPES)[number];

/** The tonality component's settings, digits 1–9 then 0 (manual: sequencer/component-tonality). */
export const TONALITIES = [
	'ignore chords',
	'transpose only',
	'octave up',
	'fifth up',
	'third up',
	'semitone up',
	'semitone down',
	'quantise 33',
	'quantise 66',
	'quantise 100'
] as const;

/** Velocity component digits 1–9 (digit 0 picks at random; manual: component-velocity). */
export const COMPONENT_VELOCITIES = [4, 8, 16, 32, 64, 100, 112, 127, 0] as const;

/** A note as it sounds. */
export interface NoteEvent {
	readonly note: number;
	/** 0–127 (the velocity component's digit 9 forces 0). */
	readonly velocity: number;
	/** Start in steps from the step's own start: the offset after quantisation, ratchet hits. */
	readonly time: number;
	/** Length in steps. */
	readonly length: number;
	/** Glide into and out of the note, 0 (none) or 0.1–0.9 (portamento component). */
	readonly glide: number;
	/** A pitch-bend curve over the note ({@link bendCurve}); `random` feeds the random shapes. */
	readonly bend: { readonly shape: BendShape; readonly random: number } | null;
}

/** What a step plays on one pass. */
export interface StepPlay {
	/** The notes that sound, in time order. */
	readonly notes: readonly NoteEvent[];
	/** Parameter locks that apply on this pass (skip parameter lock may hold them back). */
	readonly locks: Readonly<Record<string, number>>;
	/** Extra times the step retriggers before the track moves on (pulse). */
	readonly repeats: number;
	/** Extra steps the track waits on the step with its notes held (pulse hold). */
	readonly hold: number;
	/** Where the playhead goes after the step: a step index, "align", or null for the next step. */
	readonly jump: number | 'align' | null;
	/** Whether the step's components acted on this pass (skip step component). */
	readonly components: boolean;
}

/** Options for {@link stepEvents}. */
export interface PlayOptions {
	/** The scale ramps, random and tonality follow (default chromatic). */
	readonly scale?: MusicalScale;
}

// ─────────────────────────────────────────────────────────────────────────── digit tables

/**
 * Whether a skip component lets its thing through on `pass` (the 1st, 2nd … time the playhead
 * reaches the step): 1 = every pass, 2–9 = every 2nd … 9th pass, counted literally (passes 2, 4, 6
 * for 2), 0 = at random, one pass in two. The counting and the chance are ours.
 */
export function playsOnPass(digit: number, pass: number, rng: Rng): boolean {
	if (digit === 1) return true;
	if (digit === 0) return rng() < 0.5;
	return pass % digit === 0;
}

/** A count from a digit: 1–9 as is, 0 a random 1…`max` (pulse, pulse hold, multiply). */
function countOf(digit: number, rng: Rng, max = 9): number {
	return digit === 0 ? 1 + Math.floor(rng() * max) : digit;
}

/**
 * Ramp up, ramp down and random share one table (manual: step-component-reference): digits 1–5
 * give 2–6 stages within an octave, 6–9 and 0 give 2–6 stages over three octaves.
 */
export function rampSpan(digit: number): { stages: number; octaves: number } {
	const d = digit === 0 ? 10 : digit;
	return d <= 5 ? { stages: d + 1, octaves: 1 } : { stages: d - 4, octaves: 3 };
}

/**
 * The scale degrees stage `stage` of a ramp climbs: the stages spread evenly from the note to
 * exactly `octaves` above it, ends included, so "2 stages, 1 octave" jumps between a note and its
 * octave (the spacing is ours).
 */
export function rampDegrees(
	stage: number,
	span: { stages: number; octaves: number },
	scale = CHROMATIC
) {
	const degrees = scale.degrees.length * span.octaves;
	return Math.round((stage * degrees) / Math.max(1, span.stages - 1));
}

/**
 * Where jump sends the playhead from step `index` (manual: sequencer/component-jump): 1–4 to step
 * 1, 5, 9 or 13 of the bar that plays; 5 one step ahead of the next (skipping one); 6 back to the
 * step before; 7 either at random; 8 stays; 9 realigns with the track's clock ("align"); 0 a random
 * step. Targets wrap at the pattern length.
 */
export function jumpTarget(
	digit: number,
	index: number,
	length: number,
	rng: Rng
): number | 'align' {
	const wrap = (i: number) => ((i % length) + length) % length;
	switch (digit) {
		case 1:
		case 2:
		case 3:
		case 4:
			return wrap(Math.floor(index / 16) * 16 + (digit - 1) * 4);
		case 5:
			return wrap(index + 2);
		case 6:
			return wrap(index - 1);
		case 7:
			return wrap(rng() < 0.5 ? index + 2 : index - 1);
		case 8:
			return wrap(index);
		case 9:
			return 'align';
		default:
			return Math.floor(rng() * length);
	}
}

// ─────────────────────────────────────────────────────────────────────────── scales

/** Moves `note` by `degrees` steps of `scale`; a note outside the scale first drops onto it. */
export function moveInScale(note: number, degrees: number, scale = CHROMATIC): number {
	if (degrees === 0) return note;
	const len = scale.degrees.length;
	const rel = (((note - scale.root) % 12) + 12) % 12;
	let d = 0;
	for (let i = 0; i < len; i++) if (scale.degrees[i] <= rel) d = i;
	const base = note - (rel - scale.degrees[d]);
	const total = d + degrees;
	const octave = Math.floor(total / len);
	const at = ((total % len) + len) % len;
	return base - scale.degrees[d] + octave * 12 + scale.degrees[at];
}

/** The nearest note of `scale` (ties go down). */
export function snapToScale(note: number, scale = CHROMATIC): number {
	for (let distance = 0; distance < 12; distance++) {
		for (const candidate of [note - distance, note + distance]) {
			const rel = (((candidate - scale.root) % 12) + 12) % 12;
			if (scale.degrees.includes(rel)) return candidate;
		}
	}
	return note;
}

/**
 * The tonality component (manual: sequencer/component-tonality): octave, fifth and third up move by
 * scale degrees (by 12, 7 and 4 semitones when the scale is chromatic), the semitone settings move
 * chromatically, and quantise 33/66/100 snaps the note onto the scale with that chance (ours). 1 and
 * 2 concern following the brain's chords and leave the note alone here.
 */
export function applyTonality(note: number, digit: number, scale: MusicalScale, rng: Rng): number {
	const chromatic = scale.degrees.length === 12;
	switch (TONALITIES[(digit + 9) % 10]) {
		case 'octave up':
			return note + 12;
		case 'fifth up':
			return chromatic ? note + 7 : moveInScale(note, 4, scale);
		case 'third up':
			return chromatic ? note + 4 : moveInScale(note, 2, scale);
		case 'semitone up':
			return note + 1;
		case 'semitone down':
			return note - 1;
		case 'quantise 33':
			return rng() < 0.33 ? snapToScale(note, scale) : note;
		case 'quantise 66':
			return rng() < 0.66 ? snapToScale(note, scale) : note;
		case 'quantise 100':
			return snapToScale(note, scale);
		default:
			return note;
	}
}

/**
 * A bend shape's pitch at `t` (0…1 through the note), −1…1 of the bend depth (the track's bend
 * range may set the depth; not confirmed). TE names the shapes only; these curves are ours: arcs,
 * a quick bump at the start, a decaying or growing wobble, straight fades, and for the random
 * shapes a held or a ramped random level.
 */
export function bendCurve(shape: BendShape, t: number, random = 0.5): number {
	const x = Math.max(0, Math.min(1, t));
	const level = random * 2 - 1;
	switch (shape) {
		case 'down-up':
			return -Math.sin(Math.PI * x);
		case 'up-down':
			return Math.sin(Math.PI * x);
		case 'bump down':
			return x < 0.25 ? -Math.sin(4 * Math.PI * x) : 0;
		case 'bump up':
			return x < 0.25 ? Math.sin(4 * Math.PI * x) : 0;
		case 'spring out':
			return Math.sin(6 * Math.PI * x) * (1 - x);
		case 'spring in':
			return Math.sin(6 * Math.PI * x) * x;
		case 'fade down':
			return -x;
		case 'fade up':
			return x;
		case 'random 1':
			return level;
		case 'random 2':
			return level * x;
	}
}

// ─────────────────────────────────────────────────────────────────────────── one step

/** The effective offset of a note after the pattern's quantisation. */
export function quantisedOffset(pattern: Pattern, offset: number): number {
	if (!pattern.quantiseOn) return offset;
	return offset * ((100 - Math.max(0, Math.min(100, pattern.quantise))) / 100);
}

const NO_LOCKS: Readonly<Record<string, number>> = Object.freeze({});

/**
 * What step `index` plays on its `pass`-th visit (1 = the first time the playhead reaches it),
 * after every step component. The skip components decide first: skip step component can switch
 * the others off for the pass, skip trigger silences the notes, skip parameter lock holds the locks
 * back. Then each note gets its quantised offset, velocity (velocity), pitch (ramp up, ramp down,
 * random, then tonality; clamped to 0–127), glide (portamento), bend, and length; multiply splits
 * it into equal hits inside the step; pulse hold stretches it over the steps the track waits.
 * Pulse, pulse hold and jump come back as `repeats`, `hold` and `jump` for {@link advancePlayhead}.
 */
export function stepEvents(
	pattern: Pattern,
	index: number,
	pass: number,
	rng: Rng = Math.random,
	options: PlayOptions = {}
): StepPlay {
	const step: SeqStep | undefined = pattern.steps[index];
	if (!step || index >= pattern.length) {
		return { notes: [], locks: NO_LOCKS, repeats: 0, hold: 0, jump: null, components: false };
	}
	const scale = options.scale ?? CHROMATIC;
	const skipComponents = getComponent(step, 'skip step component');
	const active = !skipComponents || playsOnPass(skipComponents.value, pass, rng);
	const component = (kind: StepComponentKind) => (active ? getComponent(step, kind) : undefined);

	const skipTrigger = component('skip trigger');
	const triggered = !skipTrigger || playsOnPass(skipTrigger.value, pass, rng);
	const skipLocks = component('skip parameter lock');
	const locked = !skipLocks || playsOnPass(skipLocks.value, pass, rng);

	const pulse = component('pulse');
	const pulseHold = component('pulse hold');
	const multiply = component('multiply');
	const velocity = component('velocity');
	const rampUp = component('ramp up');
	const rampDown = component('ramp down');
	const random = component('random');
	const portamento = component('portamento');
	const bend = component('bend');
	const tonality = component('tonality');
	const jump = component('jump');

	const repeats = pulse ? countOf(pulse.value, rng) : 0;
	const hold = pulseHold ? countOf(pulseHold.value, rng) : 0;
	const hits = multiply ? countOf(multiply.value, rng, 8) : 1;
	const glide = portamento
		? (portamento.value === 0 ? 1 + Math.floor(rng() * 9) : portamento.value) / 10
		: 0;

	const notes: NoteEvent[] = [];
	if (triggered) {
		for (const n of step.notes) {
			let note = n.note;
			if (rampUp) {
				const span = rampSpan(rampUp.value);
				note = moveInScale(note, rampDegrees((pass - 1) % span.stages, span, scale), scale);
			}
			if (rampDown) {
				const span = rampSpan(rampDown.value);
				note = moveInScale(note, -rampDegrees((pass - 1) % span.stages, span, scale), scale);
			}
			if (random) {
				const span = rampSpan(random.value);
				const stage = Math.floor(rng() * span.stages);
				note = moveInScale(note, rampDegrees(stage, span, scale), scale);
			}
			if (tonality) note = applyTonality(note, tonality.value, scale, rng);
			if (note < 0 || note > 127) continue;
			const vel = velocity
				? velocity.value === 0
					? 1 + Math.floor(rng() * 127)
					: COMPONENT_VELOCITIES[velocity.value - 1]
				: n.velocity;
			const bendOf = bend ? { shape: BEND_SHAPES[(bend.value + 9) % 10], random: rng() } : null;
			const time = quantisedOffset(pattern, n.offset);
			const length = pulseHold && hits === 1 ? 1 + hold : n.length / hits;
			for (let h = 0; h < hits; h++) {
				notes.push({
					note,
					velocity: vel,
					time: time + h / hits,
					length,
					glide,
					bend: bendOf
				});
			}
		}
		notes.sort((a, b) => a.time - b.time);
	}
	return {
		notes,
		locks: locked ? step.locks : NO_LOCKS,
		repeats,
		hold,
		jump: jump ? jumpTarget(jump.value, index, pattern.length, rng) : null,
		components: active && step.components.length > 0
	};
}

// ─────────────────────────────────────────────────────────────────────────── the walk

/** Where a track's playhead is while its pattern plays (plain data; {@link startPlayhead}). */
export interface Playhead {
	/** The step playing now (−1 before the first slot). */
	readonly step: number;
	/** The slot within the step's visit (0 = the visit's first; pulse and pulse hold add slots). */
	readonly slot: number;
	/** Slots the visit lasts: 1 + repeats + hold. */
	readonly slots: number;
	/** The visit's slots 1…repeats retrigger the step (pulse); later ones only hold (pulse hold). */
	readonly repeats: number;
	/** Where to go after the visit (the step's jump), or null for the next step. */
	readonly next: number | 'align' | null;
	/** How many times each step has been reached (its pass count). */
	readonly passes: readonly number[];
	/** Slots since the start (the first slot is 0). */
	readonly clock: number;
}

/** A playhead before the first slot. */
export function startPlayhead(): Playhead {
	return { step: -1, slot: 0, slots: 0, repeats: 0, next: null, passes: [], clock: -1 };
}

/** One slot of the walk: the new playhead, what plays (null while a held step waits). */
export interface Slot {
	readonly head: Playhead;
	readonly play: StepPlay | null;
	/** True for a pulse repeat (the same step again within its visit). */
	readonly retrigger: boolean;
}

/**
 * Moves the playhead one slot. Within a visit, pulse repeats play the step again (same pass) and
 * pulse hold waits; after it the playhead goes to the jump target, to where the track would be
 * without jumps ("align": the clock modulo the length), or to the next step, and counts a pass
 * there.
 */
export function advancePlayhead(
	pattern: Pattern,
	head: Playhead,
	rng: Rng = Math.random,
	options: PlayOptions = {}
): Slot {
	const clock = head.clock + 1;
	if (head.step >= 0 && head.slot + 1 < head.slots) {
		const slot = head.slot + 1;
		const next = { ...head, slot, clock };
		if (slot > head.repeats) return { head: next, play: null, retrigger: false };
		const again = stepEvents(pattern, head.step, head.passes[head.step] ?? 1, rng, options);
		return { head: next, play: again, retrigger: true };
	}
	const length = pattern.length;
	let step: number;
	if (head.step < 0) step = 0;
	else if (head.next === 'align') step = clock % length;
	else if (head.next !== null) step = head.next;
	else step = head.step + 1;
	step = ((step % length) + length) % length;
	const passes = [...head.passes];
	passes[step] = (passes[step] ?? 0) + 1;
	const play = stepEvents(pattern, step, passes[step], rng, options);
	return {
		head: {
			step,
			slot: 0,
			slots: 1 + play.repeats + play.hold,
			repeats: play.repeats,
			next: play.jump,
			passes,
			clock
		},
		play,
		retrigger: false
	};
}

/** Whether a pattern changes the playhead's walk (pulse, pulse hold or jump on a playing step). */
export function hasFlowComponents(pattern: Pattern): boolean {
	return pattern.steps
		.slice(0, pattern.length)
		.some((s) =>
			s.components.some((c) => c.kind === 'pulse' || c.kind === 'pulse hold' || c.kind === 'jump')
		);
}

/**
 * The step playing at `position` (sixteenths since play) for LEDs: plain `stepAt` unless pulse,
 * pulse hold or jump change the walk, which is then replayed from the start with a seeded random
 * source (so the answer is stable from frame to frame). Negative positions (a count-in) wrap.
 */
export function playheadAt(pattern: Pattern, position: number, seed = 1): number {
	if (position < 0 || !hasFlowComponents(pattern)) return stepAt(pattern, position);
	const slots = Math.floor(position / pattern.scale);
	const rng = seededRng(seed);
	let head = startPlayhead();
	for (let i = 0; i <= slots; i++) head = advancePlayhead(pattern, head, rng).head;
	return head.step;
}

// ─────────────────────────────────────────────────────────────────────────── players

/** A random order of `items` (Fisher–Yates). */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Outside-in: first, last, second, second to last … */
function converge<T>(items: readonly T[]): T[] {
	const out: T[] = [];
	for (let lo = 0, hi = items.length - 1; lo <= hi; lo++, hi--) {
		out.push(items[lo]);
		if (hi !== lo) out.push(items[hi]);
	}
	return out;
}

/**
 * One cycle of the arpeggio over the notes held (in the order they were pressed; manual:
 * players/arpeggio): spread over `range` octaves, ordered by the pattern (up, down, up/down
 * without repeating the ends, up/repeat/down with them, random, play order), then reordered by the
 * style (ours: straight, converge, diverge, pinky, thumb).
 */
export function arpeggio(
	held: readonly number[],
	arp: ArpSettings,
	rng: Rng = Math.random
): number[] {
	const played = [...new Set(held)];
	if (played.length === 0) return [];
	const octaves = Math.max(1, Math.min(4, arp.range));
	const ascending = [...played].sort((a, b) => a - b);
	const spread = (notes: readonly number[]) =>
		Array.from({ length: octaves }, (_, o) => notes.map((n) => n + 12 * o)).flat();
	const up = spread(ascending);
	let run: number[];
	switch (ARP_PATTERNS[arp.pattern] ?? 'up') {
		case 'down':
			run = [...up].reverse();
			break;
		case 'up/down':
			run = up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up;
			break;
		case 'up/repeat/down':
			run = [...up, ...[...up].reverse()];
			break;
		case 'random':
			run = shuffled(up, rng);
			break;
		case 'play order':
			run = spread(played);
			break;
		default:
			run = up;
	}
	const top = Math.max(...run);
	const bottom = Math.min(...run);
	switch (ARP_STYLES[arp.style] ?? 'straight') {
		case 'converge':
			run = converge(run);
			break;
		case 'diverge':
			run = converge(run).reverse();
			break;
		case 'pinky':
			run = run.filter((n) => n !== top).flatMap((n) => [n, top]);
			break;
		case 'thumb':
			run = run.filter((n) => n !== bottom).flatMap((n) => [bottom, n]);
			break;
	}
	return run.filter((n) => n >= 0 && n <= 127);
}

/** The arpeggio's step length in sequencer steps. */
export function arpStepLength(arp: ArpSettings): number {
	return ARP_SPEEDS[Math.max(0, Math.min(ARP_SPEEDS.length - 1, arp.speed))].steps;
}

/**
 * The `k`-th note of a running arpeggio (k = 0, 1, … counted in arpeggio steps): its note, start
 * (steps since the run began), length (the note length share of an arpeggio step), glide and pan
 * (successive notes alternate by the stereo amount; ours). A random pattern reshuffles every cycle
 * from `seed`. Null when nothing is held.
 */
export function arpEvent(
	held: readonly number[],
	arp: ArpSettings,
	k: number,
	seed = 1
): { note: number; time: number; length: number; glide: number; pan: number } | null {
	const probe = arpeggio(held, arp, seededRng(seed));
	if (probe.length === 0) return null;
	const cycle = Math.floor(k / probe.length);
	const run = arpeggio(held, arp, seededRng(seed + cycle));
	const stepLength = arpStepLength(arp);
	return {
		note: run[k % run.length],
		time: k * stepLength,
		length: (stepLength * Math.max(1, Math.min(99, arp.length))) / 100,
		glide: arp.glide / 99,
		pan: ((k % 2 === 0 ? -1 : 1) * arp.stereo) / 99
	};
}

/** The arpeggio's note sounding `time` steps after it started (for LEDs), or null. */
export function arpNoteAt(held: readonly number[], arp: ArpSettings, time: number, seed = 1) {
	if (time < 0) return null;
	return arpEvent(held, arp, Math.floor(time / arpStepLength(arp)), seed)?.note ?? null;
}

/**
 * Maestro (manual: players/maestro): the stored chord moved so its lowest note lands on `key`.
 * Notes pushed outside MIDI's range are left out.
 */
export function maestroNotes(chord: readonly number[], key: number): number[] {
	if (chord.length === 0) return [key];
	const root = Math.min(...chord);
	return [...new Set(chord.map((n) => n - root + key))]
		.sort((a, b) => a - b)
		.filter((n) => n >= 0 && n <= 127);
}

/**
 * The chord as maestro strums it on its `hit`-th press (0, 1, …): in the pattern's order (up,
 * down, up/down alternating from hit to hit, random), each note `roll` later than the one before
 * (roll 99 = a quarter of a step apart; the scale is ours).
 */
export function maestroEvents(
	chord: readonly number[],
	key: number,
	maestro: MaestroSettings,
	hit = 0,
	rng: Rng = Math.random
): { note: number; time: number }[] {
	const up = maestroNotes(chord, key);
	let order: number[];
	switch (MAESTRO_PATTERNS[maestro.pattern] ?? 'up') {
		case 'down':
			order = [...up].reverse();
			break;
		case 'up/down':
			order = hit % 2 === 0 ? up : [...up].reverse();
			break;
		case 'random':
			order = shuffled(up, rng);
			break;
		default:
			order = up;
	}
	const gap = (Math.max(0, Math.min(99, maestro.roll)) / 99) * 0.25;
	return order.map((note, i) => ({ note, time: i * gap }));
}

/**
 * The hold player's notes after a key press (manual: players/hold): a key pressed while no other
 * key is down starts a new set; keys added while others are held join it. Pressing a note that is
 * already held keeps it (OS 1.1.3). Letting go changes nothing; stop or switching the player off
 * empties it.
 */
export function latchNotes(
	latched: readonly number[],
	heldBefore: readonly number[],
	note: number
): number[] {
	if (heldBefore.length === 0) return [note];
	return latched.includes(note) ? [...latched] : [...latched, note];
}
