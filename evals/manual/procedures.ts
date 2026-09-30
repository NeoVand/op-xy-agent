/**
 * Plays our manual's procedures on the replica's simulator the way the app shows them (the truth
 * triangle, docs/AGENT-V2.md): each step's combo goes through `ReplicaState.animate`, whose events
 * drive an `OpxySim` as they do in the app (`src/lib/app/simulator.svelte.ts`), on a clock of our own
 * so a procedure runs in milliseconds. After each step it writes down what the replica showed: every
 * screen the step went through, where the device stands (mode, track, page), the LED windows and
 * what changed in the replica's model (the grounding diff). No model is called here: `verify.ts`
 * hands these records to the judge.
 *
 * A person following a step makes a few choices; here they are made the same way every time:
 * - placeholders (`Tn`, `step n`, `key`, `E1…E4`, `[-]/[+]`) are their first candidate, as the app's
 *   animation picks them (T1, step 1, the lowest key, E1, `[-]`);
 * - a turn is four detents clockwise, the animation's default, unless the step says more: a
 *   recipe's `set` turns until the navigator reads the value, "counter-clockwise" in the note turns
 *   the other way, and a note that names what to pick ("until cv shows") turns to the nearest
 *   position whose screen shows it;
 * - preconditions are set up where {@link PRECONDITIONS} knows how, and a recipe (a `howto` unit)
 *   is one sequence: each procedure after the first continues where the one before it left off.
 */
import {
	CONTROLS,
	formatKeys,
	getControl,
	parseKeys,
	targetIds,
	tryParseKeys,
	type ControlId,
	type KeyChord,
	type KeyGesture,
	type KeySequence,
	type KeyTerm
} from '$lib/core/opxy';
import type { VirtualOpxy } from '$lib/agent/virtual-opxy';
import { createVirtualOpxy } from '$lib/app/virtual';
import type { ManualProcedure, ManualUnit } from '$lib/manual';
import { ReplicaState, type AnimateOptions, type AnimationTiming, type Timers } from '$lib/replica';
import { buildFrame, buildLeds } from '$lib/sim/frames';
import { planParam, planPlace, playStep, reads, type NavPlan } from '$lib/sim/navigator';
import { OpxySim } from '$lib/sim/opxy-sim.svelte';
import { AUX_NAMES, type SimState } from '$lib/sim/params';
import { describeFrame } from '$lib/sim/screen/render';
import { currentPattern } from '$lib/sim/sequencer';
import { settingGoal } from '$lib/sim/settings';

// ─── the bench: a replica driving a simulator, on our clock ────────────────────────────────────

/** One animation frame, as the app's clock moves the simulator. */
const FRAME_MS = 16;
/** A moment after each step, as a person reads the screen (a boot finishes, a popup times out). */
const IDLE_MS = 1000;
/** A boot takes 2.4 s: after switching on, a person waits for it. */
const BOOT_WAIT_MS = 3000;

interface Timer {
	readonly at: number;
	readonly seq: number;
	readonly run: () => void;
}

/** The replica's timers and the simulator's time: one clock, moved only by {@link Clock.pass}. */
class Clock implements Timers {
	now = 0;
	readonly #timers: Timer[] = [];
	#seq = 0;

	constructor(private readonly frame: (ms: number) => void) {}

	setTimeout(callback: () => void, ms: number): unknown {
		const timer: Timer = { at: this.now + Math.max(0, ms), seq: this.#seq++, run: callback };
		this.#timers.push(timer);
		return timer;
	}

	clearTimeout(handle: unknown): void {
		const at = this.#timers.indexOf(handle as Timer);
		if (at >= 0) this.#timers.splice(at, 1);
	}

	/** Moves time forward frame by frame. */
	pass(ms: number): void {
		for (let left = ms; left > 0;) {
			const dt = Math.min(FRAME_MS, left);
			this.now += dt;
			left -= dt;
			this.frame(dt);
		}
	}

	/** Runs every pending timer in order, time passing between them. */
	settle(): void {
		while (this.#timers.length > 0) {
			const next = this.#timers.reduce((a, b) =>
				b.at < a.at || (b.at === a.at && b.seq < a.seq) ? b : a
			);
			if (next.at > this.now) this.pass(next.at - this.now);
			this.clearTimeout(next);
			next.run();
		}
	}
}

const cloneState = (state: SimState): SimState => JSON.parse(JSON.stringify(state)) as SimState;

/** What the screen says (its description for screen readers, as the agent reads it). */
export const screenOf = (state: SimState): string => describeFrame(buildFrame(state));

/**
 * The replica and its simulator, wired as in the app: every replica event, the teaching
 * animations' included, reaches the simulator; the page clock moves the simulator's timers.
 */
export class Bench {
	readonly clock: Clock;
	readonly sim: OpxySim;
	readonly replica: ReplicaState;
	readonly virtual: VirtualOpxy;
	/** Screens seen while something plays (null: not recording). */
	#seen: string[] | null = null;

	/** A new project, or a copy of another bench's simulator at its time (see {@link fork}). */
	constructor(from?: { readonly state: SimState; readonly now: number }) {
		this.clock = new Clock((ms) => {
			this.sim.advance(ms);
			this.#look();
		});
		if (from) this.clock.now = from.now;
		this.sim = new OpxySim({
			now: () => this.clock.now,
			...(from ? { state: cloneState(from.state) } : {})
		});
		this.replica = new ReplicaState({ timers: this.clock });
		this.replica.observe((event) => {
			this.sim.input(event);
			this.#look();
		});
		this.virtual = createVirtualOpxy({ sim: this.sim });
	}

	/** A bench of its own at this one's state and time, to try a step on first. */
	fork(): Bench {
		return new Bench({ state: this.sim.state, now: this.clock.now });
	}

	get state(): SimState {
		return this.sim.state;
	}

	get screen(): string {
		return screenOf(this.sim.state);
	}

	/** Whether a count-in ran since this was last cleared (a step's record says so). */
	countedIn = false;

	#look(): void {
		if (this.sim.state.areas.sequencer.countIn) this.countedIn = true;
		const seen = this.#seen;
		if (seen && seen[seen.length - 1] !== this.screen) seen.push(this.screen);
	}

	/** Runs `act`, returning every screen shown after the one it started on. */
	#recording(act: () => void): string[] {
		const seen = [this.screen];
		this.#seen = seen;
		try {
			act();
		} finally {
			this.#seen = null;
		}
		return seen.slice(1);
	}

	/** Plays a combo as the replica animates it (timers run to the end); returns the screens shown. */
	play(keys: KeySequence | string, options: AnimateOptions = {}): string[] {
		return this.#recording(() => {
			this.replica.animate(keys, options);
			this.clock.settle();
		});
	}

	/**
	 * Plays a combo straight into the simulator, as the navigator's steps do (for what the animation
	 * cannot operate: it only highlights the power switch); returns the screens shown.
	 */
	press(keys: string): string[] {
		return this.#recording(() => {
			playStep(this.sim, { keys });
			this.#look();
		});
	}

	/** Lets time pass (a person reading the screen; a boot running to its end). */
	wait(ms: number): string[] {
		return this.#recording(() => this.clock.pass(ms));
	}

	/** A private copy of the simulator as it stands (for trying turns before making one). */
	copy(): OpxySim {
		return new OpxySim({ state: cloneState(this.sim.state), now: () => this.clock.now });
	}

	/** Plays a navigator plan's steps through the replica, turns with their detents. */
	follow(plan: NavPlan): void {
		for (const step of plan.steps) {
			const clicks = step.clicks ?? 0;
			this.play(
				step.keys,
				clicks ? { turnSteps: Math.abs(clicks), direction: Math.sign(clicks) as 1 | -1 } : {}
			);
		}
	}
}

// ─── what a person sees: where the device stands, the LEDs ─────────────────────────────────────

/** The instrument or auxiliary track the keys address now, as the device numbers it (1–16). */
const selectedTrack = (s: SimState): number =>
	s.active === 'auxiliary' ? s.auxTrack + 9 : s.track + 1;

/** Where the device stands, in a few words: mode, track, page, what is open, the transport. */
export function contextOf(s: SimState): string {
	const sys = s.areas.system;
	if (!sys.power.on) return 'switched off';
	if (sys.power.booting) return 'booting';
	const track =
		s.active === 'auxiliary'
			? `aux T${s.auxTrack + 1} (${AUX_NAMES[s.auxTrack]})`
			: `T${s.track + 1} (${s.tracks[s.track].engine})`;
	const parts = [`${s.mode} mode`, track];
	if (s.mode === 'arrange') parts.push(`${s.areas.arrange.view} view`);
	else parts.push(`M${s.pages[s.mode]}`);
	if (s.overlay) parts.push(`${s.overlay} page open`);
	if (sys.page) parts.push(`${sys.page} open`);
	else if (s.sub) parts.push(`"${s.sub}" open`);
	if (s.picker) parts.push(`${s.picker.kind} type list open`);
	if (s.shift) parts.push('shift held');
	if (s.held.length > 0) parts.push(`held: ${s.held.join(' ')}`);
	if (s.areas.sequencer.countIn) parts.push('counting in');
	if (s.transport.recording) parts.push('recording');
	if (s.transport.playing) parts.push('playing');
	return parts.join(', ');
}

type Pattern = SimState['tracks'][number]['sequence']['patterns'][number];

/** What a pattern holds: notes, steps with locks, steps with components. */
function holds(p: Pattern | undefined): { notes: number; locked: number; components: number } {
	const steps = p?.steps ?? [];
	return {
		notes: steps.reduce((n, s) => n + s.notes.length, 0),
		locked: steps.filter((s) => Object.keys(s.locks).length > 0).length,
		components: steps.filter((s) => s.components.length > 0).length
	};
}

/** What the selected track's playing pattern holds, and the arrangement, in words. */
export function contentOf(s: SimState): string {
	const t = s.active === 'auxiliary' ? s.aux[s.auxTrack] : s.tracks[s.track];
	const h = holds(currentPattern(t.sequence));
	const a = s.areas.arrange;
	const scenes = a.scenes.filter((x) => x !== null).length;
	return `the selected track's pattern: ${h.notes} notes, ${h.locked} steps with locks, ${h.components} with step components; ${Math.max(1, scenes)} scene${scenes > 1 ? 's' : ''}; song ${a.song + 1} holds ${a.songs[a.song].order.length} entries`;
}

/** Step numbers (1-based) whose steps pass `test`, as "1 5 9", or "none". */
function stepsWhere(p: Pattern | undefined, test: (step: Pattern['steps'][number]) => boolean) {
	const steps = (p?.steps ?? []).flatMap((s, i) => (test(s) ? [i + 1] : []));
	return steps.length ? steps.join(' ') : 'none';
}

/** Distinct values of the pattern's notes, as "53 55", or "none". */
function noteValues(
	p: Pattern | undefined,
	of: (note: Pattern['steps'][number]['notes'][number]) => number
) {
	const values = [
		...new Set((p?.steps ?? []).flatMap((s) => s.notes.map((n) => Math.round(of(n) * 100) / 100)))
	];
	return values.length ? values.sort((a, b) => a - b).join(' ') : 'none';
}

/**
 * The patterns a step changed and how: notes, the steps they are on, their pitches, timing and
 * lengths, the steps with locks and with step components, the pattern's own settings (the
 * grounding diff only counts notes).
 */
export function patternChanges(before: SimState, after: SimState): string[] {
	const lines: string[] = [];
	const tracks = (s: SimState) => [...s.tracks, ...s.aux];
	const b = tracks(before);
	tracks(after).forEach((track, i) => {
		const label = i < 8 ? `T${i + 1}` : `aux T${i - 7}`;
		track.sequence.patterns.forEach((p, n) => {
			const was = b[i]?.sequence.patterns[n];
			if (JSON.stringify(was) === JSON.stringify(p)) return;
			const parts: string[] = [];
			const compare = (what: string, read: (q: Pattern | undefined) => string) => {
				const [x, y] = [read(was), read(p)];
				if (x !== y) parts.push(`${what} ${x} → ${y}`);
			};
			compare('notes', (q) => String(holds(q).notes));
			compare('notes on steps', (q) => stepsWhere(q, (s) => s.notes.length > 0));
			compare('pitches', (q) => noteValues(q, (note) => note.note));
			compare('timing offsets', (q) => noteValues(q, (note) => note.offset));
			compare('lengths', (q) => noteValues(q, (note) => note.length));
			compare('locks on steps', (q) => stepsWhere(q, (s) => Object.keys(s.locks).length > 0));
			compare('lock values', (q) =>
				JSON.stringify((q?.steps ?? []).map((s) => s.locks).filter((l) => Object.keys(l).length))
			);
			compare('components on steps', (q) => stepsWhere(q, (s) => s.components.length > 0));
			compare(
				'components',
				(q) =>
					(q?.steps ?? [])
						.flatMap((s) => s.components.map((c) => `${c.kind} ${c.value}`))
						.join(', ') || 'none'
			);
			const setting = (what: string, read: (q: Pattern) => string | number | boolean) =>
				compare(what, (q) => (q ? String(read(q)) : '—'));
			setting('bars', (q) => q.bars);
			setting('length', (q) => q.length);
			setting('track scale', (q) => q.scale);
			setting('quantisation', (q) => `${q.quantise}${q.quantiseOn ? '' : ' (off)'}`);
			setting('note length', (q) => Math.round(q.noteLength * 100));
			setting('groove', (q) => q.groove);
			setting('smoothing', (q) => q.smoothing);
			setting('player', (q) => q.player.type);
			lines.push(`${label} pattern ${n + 1}: ${parts.length ? parts.join('; ') : 'changed'}`);
		});
	});
	return lines;
}

const LED_CHAR = { off: '.', dim: 'd', white: 'w', red: 'r' } as const;

/** The LED windows in short: steps 1–16 and T1–T8 as `.`/`d`/`w`/`r`, then the other lit keys. */
export function ledsOf(s: SimState): string {
	const leds = buildLeds(s) as Record<string, keyof typeof LED_CHAR | undefined>;
	const row = (ids: string[]) => ids.map((id) => LED_CHAR[leds[id] ?? 'off']).join('');
	const steps = row(Array.from({ length: 16 }, (_, i) => `step.${i + 1}`));
	const tracks = row(Array.from({ length: 8 }, (_, i) => `track.${i + 1}`));
	const others = Object.entries(leds)
		.filter(([id, led]) => led && led !== 'off' && !/^(step|track)\./.test(id))
		.map(([id, led]) => `${getControl(id as ControlId).token ?? id} ${led}`);
	return `steps ${steps}, tracks ${tracks}${others.length ? `, lit: ${others.join(', ')}` : ''}`;
}

// ─── controls the simulator never reacts to ────────────────────────────────────────────────────

/** Places to try a control in: a new project, playing, the other modes, two overlays, song mode. */
const PROBES: readonly string[][] = [
	[],
	['play'],
	['auxiliary'],
	['arrange'],
	['mix'],
	['tempo'],
	['com'],
	['arrange', 'shift + arrange']
];

/** The model without what time and held keys touch, to tell whether an input did anything. */
const observable = (s: SimState) => JSON.stringify({ ...s, held: [], motion: null });

/** Whether any input the control takes changes the simulator in any of the probe places. */
function simReactsTo(id: ControlId): boolean {
	const { inputs, kind } = getControl(id);
	for (const probe of PROBES) {
		for (const shift of [false, true]) {
			const fresh = () => {
				const sim = new OpxySim({ now: () => 0 });
				for (const keys of probe) playStep(sim, { keys });
				if (shift) sim.input({ type: 'press', id: 'key.shift' });
				return sim;
			};
			const tries: ((sim: OpxySim) => void)[] = [];
			if (inputs.some((i) => i === 'press' || i === 'pressure' || i === 'toggle')) {
				tries.push((sim) => sim.input({ type: 'press', id }));
				tries.push((sim) => sim.press(id));
			}
			if (inputs.some((i) => i === 'turn' || i === 'rotate')) {
				tries.push((sim) => sim.input({ type: 'turn', id, delta: 1 }));
				tries.push((sim) => sim.input({ type: 'turn', id, delta: -1 }));
			}
			if (inputs.includes('click') && kind === 'encoder') {
				tries.push((sim) => sim.input({ type: 'click', id }));
			}
			if (id === 'strip.pitchbend') {
				tries.push((sim) => sim.input({ type: 'bend', id, value: 0.7 }));
			}
			for (const attempt of tries) {
				const sim = fresh();
				const before = observable(sim.state);
				attempt(sim);
				if (observable(sim.state) !== before) return true;
			}
		}
	}
	return false;
}

let deaf: ReadonlySet<ControlId> | undefined;

/**
 * Controls the key grammar can name but the simulator ignores wherever it is tried (found by
 * trying them, so the list keeps up with the simulator): the volume knob, the pitchbend strip.
 */
export function simIgnores(): ReadonlySet<ControlId> {
	deaf ??= new Set(CONTROLS.filter((c) => c.token !== null && !simReactsTo(c.id)).map((c) => c.id));
	return deaf;
}

/**
 * Whether the replica's animation can operate a control for a gesture: it pushes keys, encoders
 * and the pitchbend pad and turns encoders and the volume knob, but only highlights a switch.
 */
function animates(id: ControlId, gesture: KeyGesture): boolean {
	const { inputs } = getControl(id);
	if (gesture === 'turn') return inputs.includes('turn') || inputs.includes('rotate');
	return inputs.includes('press') || inputs.includes('click') || inputs.includes('pressure');
}

/** A control as the key grammar spells it. */
const token = (id: ControlId) => getControl(id).token ?? id;

/** A target as written: its placeholder, range or alternatives. */
function spelled(target: KeyTerm['target']): string {
	switch (target.kind) {
		case 'control':
			return token(target.id);
		case 'placeholder':
			return target.name;
		case 'range':
			return `${token(target.from.id)}…${token(target.to.id)}`;
		case 'alternatives':
			return target.options.map((o) => token(o.id)).join('/');
	}
}

const termKey = (chord: number, term: number) => `${chord}.${term}`;

/** The sequence with some terms' targets replaced by one control each. */
function concrete(sequence: KeySequence, chosen: ReadonlyMap<string, ControlId>): KeySequence {
	return {
		chords: sequence.chords.map((chord, c) => ({
			...chord,
			terms: chord.terms.map((term, t) => {
				const id = chosen.get(termKey(c, t));
				return id ? { ...term, target: { kind: 'control', id, spelling: 'token' } } : term;
			})
		}))
	};
}

/** Whether playing `sequence` on a fork of `bench` changes anything: the screen, the LEDs, the model. */
function changesAnything(bench: Bench, sequence: KeySequence): boolean {
	const fork = bench.fork();
	const before = { screen: fork.screen, context: contextOf(fork.state), leds: ledsOf(fork.state) };
	const state = cloneState(fork.state);
	const checkpoint = fork.virtual.checkpoint();
	try {
		fork.play(sequence);
	} catch {
		return false;
	}
	return (
		fork.screen !== before.screen ||
		contextOf(fork.state) !== before.context ||
		ledsOf(fork.state) !== before.leds ||
		fork.virtual.changesSince(checkpoint).length > 0 ||
		// what neither shows: links, clipboards, settings (not the hold every scene key sets)
		modelChanges(state, fork.state).some((line) => !PICK_IGNORES.test(line))
	);
}

/** Model changes that do not make a candidate key "do something": a scene key's hold of its scene. */
const PICK_IGNORES = /^areas\.arrange\.held:/;

/** Notes that ask for more than one member of a plural placeholder. */
const EVERY_OTHER = /\bevery other\b/i;
const BOTH = /\bboth\b/i;

type PlaceholderTarget = Extract<KeyTerm['target'], { kind: 'placeholder' }>;

/**
 * The members of a plural placeholder a step asks for: every other one or two where its note says
 * so, three when they are held together while another key is pressed (a chord: a major triad on
 * the keyboard); otherwise null, one member like a singular placeholder.
 */
function pluralMembers(
	target: PlaceholderTarget,
	held: boolean,
	note: string
): { ids: readonly ControlId[]; how: string } | null {
	if (EVERY_OTHER.test(note)) {
		return {
			ids: target.ids.filter((_, i) => i % 2 === 0),
			how: 'every other one, as the note asks'
		};
	}
	if (BOTH.test(note)) return { ids: target.ids.slice(0, 2), how: 'two, as the note asks' };
	if (!held) return null;
	const triad = target.name === 'keys' && target.ids.length > 7;
	return {
		ids: triad ? [0, 4, 7].map((i) => target.ids[i]) : target.ids.slice(0, 3),
		how: 'three held together, a chord'
	};
}

/**
 * Plural placeholders (`steps`, `keys` …) written out as the members the step asks for
 * ({@link pluralMembers}): held ones as that many held keys (`keys + step n` is `key F3 + key A3 +
 * key C4 + step 1`), a pressed one as that many presses in a row with the chord's held keys kept
 * down (`key + record → + steps` with "press every other step" is `… → + step 1 → + step 3 … → +
 * step 15`).
 */
export function expandPlural(
	sequence: KeySequence,
	note: string | null | undefined
): { sequence: KeySequence; why: string[] } {
	const why: string[] = [];
	const chords: KeyChord[] = [];
	const control = (term: KeyTerm, id: ControlId): KeyTerm => ({
		...term,
		target: { kind: 'control', id, spelling: 'token' }
	});
	for (const chord of sequence.chords) {
		const terms: KeyTerm[] = [];
		let after: KeyChord[] = [];
		chord.terms.forEach((term, t) => {
			const target = term.target;
			const last = t === chord.terms.length - 1;
			const members =
				target.kind === 'placeholder' && target.plural
					? pluralMembers(target, !last, note ?? '')
					: null;
			if (!members || target.kind !== 'placeholder') {
				terms.push(term);
				return;
			}
			why.push(`\`${target.name}\` as ${members.how}`);
			if (!last) {
				terms.push(...members.ids.map((id) => control(term, id)));
				return;
			}
			terms.push(control(term, members.ids[0]));
			after = members.ids.slice(1).map((id) => ({ keepHeld: true, terms: [control(term, id)] }));
		});
		chords.push({ ...chord, terms }, ...after);
	}
	return { sequence: why.length > 0 ? { chords } : sequence, why };
}

/** Candidates tried for one target. */
const MAX_TRIES = 8;

/** A note that asks for a key other than the one in use ("pick another track", "the target scene"). */
const ANOTHER = /\b(another|other|different|target|destination|next)\b/i;

/**
 * Placeholders for a key pressed for the moment (a note, a step, a scene's black key), unlike a
 * track key, whose choice the next steps carry on with.
 */
const MOMENTARY = /^(key|keys|natural|naturals|accidental|accidentals|step n|step m|steps)$/;

/**
 * Resolves every target that names several controls (placeholders, ranges, alternatives) the way
 * a person following the step would. Each is its first candidate (T1, step 1, the lowest key, E1,
 * the first alternative), as the app's animation plays it; but on a procedure's last step, whose
 * effect is the goal's, on a step whose note asks for another key, and for a key, step or scene
 * placeholder on any step, it is the first candidate that changes something (tried on a copy):
 * "choose the track" when T1 is already chosen is T2, "the target scene" is not the scene being
 * copied, "the scene to keep" is not the one already current. Placeholders of different names get
 * different keys and one name keeps its key, so `Tn + Tm` is two tracks and `hold step n → step m`
 * two steps.
 */
function resolveTargets(
	bench: Bench,
	sequence: KeySequence,
	step: ManualProcedure['steps'][number],
	last: boolean
): { sequence: KeySequence; why: string[] } {
	const wide: { key: string; term: KeyTerm; name: string | null; ids: readonly ControlId[] }[] = [];
	sequence.chords.forEach((chord, c) =>
		chord.terms.forEach((term, t) => {
			const ids = targetIds(term.target);
			const name = term.target.kind === 'placeholder' ? term.target.name : null;
			if (ids.length > 1) wide.push({ key: termKey(c, t), term, name, ids });
		})
	);
	const tryable = (w: (typeof wide)[number]) =>
		last || ANOTHER.test(step.note ?? '') || MOMENTARY.test(w.name ?? '');
	const chosen = new Map<string, ControlId>();
	const byName = new Map<string, ControlId>();
	// first candidates, a different one for each placeholder name
	for (const w of wide) {
		const known = w.name ? byName.get(w.name) : undefined;
		const taken = new Set(byName.values());
		const id = known ?? w.ids.find((x) => !w.name || !taken.has(x)) ?? w.ids[0];
		chosen.set(w.key, id);
		if (w.name && !known) byName.set(w.name, id);
	}
	const why: string[] = [];
	const tried = new Set<string>();
	for (const w of wide) {
		const group = w.name ?? w.key;
		if (tried.has(group) || !tryable(w)) continue;
		tried.add(group);
		const keys = wide.filter((x) => (w.name ? x.name === w.name : x.key === w.key));
		const others = new Set([...byName].filter(([n]) => n !== w.name).map(([, id]) => id));
		const first = chosen.get(w.key) as ControlId;
		for (const id of w.ids.filter((x) => !others.has(x)).slice(0, MAX_TRIES)) {
			const trial = new Map(chosen);
			for (const k of keys) trial.set(k.key, id);
			if (!changesAnything(bench, concrete(sequence, trial))) continue;
			for (const k of keys) chosen.set(k.key, id);
			if (w.name) byName.set(w.name, id);
			if (id !== first) {
				why.push(
					`\`${spelled(w.term.target)}\` as \`${token(first)}\` changed nothing here: played \`${token(id)}\``
				);
			}
			break;
		}
	}
	return { sequence: concrete(sequence, chosen), why };
}

// ─── what else changed in the model ────────────────────────────────────────────────────────────

/**
 * Leaf paths that move with time or held keys, undo buffers, and what a step's record shows
 * elsewhere (where the device stands, patterns, scenes and songs).
 */
const UNSEEN =
	/^(motion|held|taps|mode|track|auxTrack|active|pages|overlay|sub|picker|shift)(\.|$)|^transport\.position$|\.clock$|\.elapsed$|\.since$|\.(undo|holdUndo|redo)(\.|$)|^areas\.system\.(page|flash|notice|presetPopup)(\.|$)|^(tracks|aux)\.\d+\.sequence\.patterns(\.|$)|^areas\.arrange\.(scenes|songs|playing)(\.|$)|^areas\.sequencer\.(barUsed|barSince|lastLock)(\.|$)|^areas\.sample\.record\.level$|^areas\.auxiliary\.heartbeat\.|popup/i;

/** A value that appears where there was none, at its empty default: made on first use, not set. */
const madeOnFirstUse = (a: string | undefined, b: string | undefined) =>
	(a === undefined && ['0', 'false', 'null', '""', '[]'].includes(b ?? '')) ||
	(b === undefined && ['0', 'false', 'null', '""', '[]'].includes(a ?? ''));

function leaves(value: unknown, path: string, out: Map<string, string>): Map<string, string> {
	if (value === null || typeof value !== 'object') {
		if (!UNSEEN.test(path)) out.set(path, JSON.stringify(value) ?? 'undefined');
		return out;
	}
	if (UNSEEN.test(path) && path !== '') return out;
	for (const [key, item] of Object.entries(value)) {
		leaves(item, path ? `${path}.${key}` : key, out);
	}
	return out;
}

/**
 * Changes to the model that neither the screen nor the grounding diff shows, a few at most: one
 * value as `path: before → after`, several under one branch as `branch.* (n values)`.
 */
export function modelChanges(before: SimState, after: SimState, most = 6): string[] {
	const a = leaves(before, '', new Map());
	const b = leaves(after, '', new Map());
	const cut = (v: string | undefined) =>
		v === undefined ? '—' : v.length > 40 ? `${v.slice(0, 37)}…` : v;
	const branches = new Map<string, string[]>();
	for (const path of new Set([...a.keys(), ...b.keys()])) {
		if (a.get(path) === b.get(path) || madeOnFirstUse(a.get(path), b.get(path))) continue;
		const branch = path.split('.').slice(0, 4).join('.');
		branches.set(branch, [...(branches.get(branch) ?? []), path]);
	}
	const lines = [...branches].map(([branch, paths]) =>
		paths.length === 1
			? `${paths[0]}: ${cut(a.get(paths[0]))} → ${cut(b.get(paths[0]))}`
			: `${branch}.* (${paths.length} values)`
	);
	return lines.length <= most ? lines : [...lines.slice(0, most), `… ${lines.length - most} more`];
}

// ─── conditions in a step's note ───────────────────────────────────────────────────────────────

/** A condition a step's note puts on it ("press it again if the page shows off"). */
interface NoteCondition {
	readonly match: RegExp;
	/** Checked before the step (skip it) or after it (do more). */
	readonly when: 'before' | 'after';
	readonly test: (bench: Bench) => boolean;
	/** Keys to play when the test holds after the step; none: skip the step. */
	readonly keys?: string;
	readonly how: string;
}

/** Conditions the manual's notes use, followed as a person would. */
export const NOTE_CONDITIONS: readonly NoteCondition[] = [
	{
		match: /press it again if the page shows off/i,
		when: 'after',
		test: (b) => /^[\w-]+ (filter|lfo) off\b/.test(b.screen),
		keys: 'again',
		how: 'pressed it again: the page showed off'
	},
	{
		match: /click an encoder if the filter envelope is in front/i,
		when: 'after',
		test: (b) => b.screen.startsWith('filter envelope'),
		keys: 'click E1',
		how: 'clicked `E1`: the filter envelope was in front'
	},
	{
		match: /click an encoder until the filter envelope is in front/i,
		when: 'after',
		test: (b) => !b.screen.startsWith('filter envelope'),
		keys: 'click E1',
		how: 'clicked `E1`: the amp envelope was in front'
	},
	{
		match: /press `M4` if the page changed/i,
		when: 'after',
		test: (b) => !(inMode('instrument')(b.state) && b.state.pages.instrument === 4),
		keys: 'M4',
		how: 'pressed `M4`: the page had changed'
	},
	{
		match: /only if it lists categories/i,
		when: 'before',
		test: (b) => !/by category/.test(b.screen),
		how: 'skipped: the browser did not list categories'
	}
];

// ─── preconditions ─────────────────────────────────────────────────────────────────────────────

/** How a precondition was treated. */
export type PreconditionKind =
	/** set up on the replica before the first step */
	| 'set-up'
	/** already true where the procedure starts (a new project has T1 selected) */
	| 'already'
	/** about the world outside the replica (cables, computers, other gear): cannot be set */
	| 'outside'
	/** no rule for it: the procedure runs from where it starts */
	| 'not-set-up';

/** A precondition as the run treated it. */
export interface PreconditionRecord {
	readonly text: string;
	readonly kind: PreconditionKind;
	/** What the verifier did or why it did nothing. */
	readonly how: string;
	/** For `set-up` and `already`: whether it held once the procedure started. */
	readonly holds: boolean | null;
}

interface PreconditionRule {
	readonly match: RegExp;
	readonly kind: 'set-up' | 'already' | 'outside';
	readonly how: string;
	/** Makes it true (keys through the replica, or the virtual OP-XY's typed writes). */
	readonly setup?: (bench: Bench) => void;
	/** Whether it holds. */
	readonly holds?: (bench: Bench) => boolean;
}

const pressUnless = (bench: Bench, keys: string, done: (s: SimState) => boolean) => {
	if (!done(bench.state)) bench.play(keys);
};

const idle = (s: SimState) =>
	s.overlay === null && s.sub === null && s.picker === null && s.areas.system.page === null;

const inMode = (mode: SimState['mode']) => (s: SimState) => s.mode === mode && idle(s);

/** Shows the player page of the selected instrument track with `type` on it, switched on or not. */
function toPlayer(bench: Bench, type: 'arpeggio' | 'hold' | 'maestro', on: boolean): void {
	bench.follow(planPlace(bench.state, { area: 'player', track: bench.state.track + 1, type }));
	const frame = buildFrame(bench.state);
	if (on && frame.page === 'player' && !frame.on) bench.play('player');
}

const playerIs = (bench: Bench, type: string, on: boolean) => {
	const frame = buildFrame(bench.state);
	return frame.page === 'player' && frame.type === type && frame.on === on;
};

/** The selected track's current pattern's notes. */
const notesOnTrack = (s: SimState) =>
	currentPattern(s.tracks[s.track].sequence).steps.reduce((n, step) => n + step.notes.length, 0);

/** Scenes 1–3, each playing every track's first pattern. */
function writeScenes(bench: Bench, song: boolean): void {
	// scene 2 plays track 1's second pattern, so the scenes differ (a copy or a jump shows)
	const patterns = (scene: number) =>
		Array.from({ length: 16 }, (_, i) => ({
			track: i + 1,
			pattern: scene === 2 && i === 0 ? 2 : 1
		}));
	bench.virtual.writeArrangement({
		scenes: [1, 2, 3].map((scene) => ({ scene, patterns: patterns(scene) })),
		...(song ? { song: { order: [1, 2, 3], loop: true } } : {})
	});
}

/**
 * Preconditions the verifier knows how to set up, or knows it cannot (first match wins). Anything
 * else is `not-set-up`: the procedure runs from a new project (or where its recipe left off).
 */
export const PRECONDITIONS: readonly PreconditionRule[] = [
	{
		match: /^instrument( or auxiliary)? mode$/,
		kind: 'set-up',
		how: 'pressed `instrument`',
		setup: (b) => pressUnless(b, 'instrument', inMode('instrument')),
		holds: (b) => inMode('instrument')(b.state)
	},
	{
		match: /^arrange mode$/,
		kind: 'set-up',
		how: 'pressed `arrange`',
		setup: (b) => {
			pressUnless(b, 'arrange', inMode('arrange'));
			// arrange again leaves song mode for the patterns
			if (b.state.areas.arrange.view === 'song') b.play('arrange');
		},
		holds: (b) => inMode('arrange')(b.state) && b.state.areas.arrange.view === 'patterns'
	},
	{
		match: /^song mode$/,
		kind: 'set-up',
		how: 'pressed `arrange`, then `shift + arrange`',
		setup: (b) => {
			pressUnless(b, 'arrange', inMode('arrange'));
			if (b.state.areas.arrange.view !== 'song') b.play('shift + arrange');
		},
		holds: (b) => b.state.mode === 'arrange' && b.state.areas.arrange.view === 'song'
	},
	{
		match: /^mix mode$/,
		kind: 'set-up',
		how: 'pressed `mix`',
		setup: (b) => pressUnless(b, 'mix', inMode('mix')),
		holds: (b) => inMode('mix')(b.state)
	},
	...([1, 2, 3, 4] as const).map((page): PreconditionRule => ({
		match: new RegExp(`^\`?m${page}\`?( page| is open)?$`),
		kind: 'set-up',
		how: `pressed \`M${page}\``,
		setup: (b) => {
			const s = b.state;
			if (s.mode === 'arrange' || s.pages[s.mode] !== page || !idle(s)) b.play(`M${page}`);
		},
		holds: (b) => b.state.mode !== 'arrange' && b.state.pages[b.state.mode] === page
	})),
	{
		match: /^(the (pattern|song) is playing|playback is running|playing)$/,
		kind: 'set-up',
		how: 'pressed `play`',
		setup: (b) => pressUnless(b, 'play', (s) => s.transport.playing),
		holds: (b) => b.state.transport.playing
	},
	{
		match: /^(playback is stopped|stopped)$/,
		kind: 'set-up',
		how: 'pressed `stop` if it was playing',
		setup: (b) => pressUnless(b, 'stop', (s) => !s.transport.playing),
		holds: (b) => !b.state.transport.playing
	},
	{
		match: /^the track is selected$/,
		kind: 'already',
		how: 'the selected track (T1 in a new project)',
		holds: () => true
	},
	{
		match: /^the (pattern|scene)( to copy)? is selected$/,
		kind: 'already',
		how: 'the playing one (pattern 1, scene 1 in a new project)',
		holds: () => true
	},
	{
		match: /^the module page with the parameter is on screen$/,
		kind: 'already',
		how: 'the page on screen (a new project opens on `M1`)',
		holds: (b) => b.state.mode === 'instrument' && idle(b.state)
	},
	{
		match: /^the verse's patterns play in scene 1$/,
		kind: 'already',
		how: "scene 1 plays every track's pattern 1 in a new project",
		holds: (b) => b.state.areas.arrange.scene === 0
	},
	{
		match: /^the preset browser is open$/,
		kind: 'set-up',
		how: 'pressed `instrument`, then `shift + M1`',
		setup: (b) => {
			pressUnless(b, 'instrument', inMode('instrument'));
			b.play('shift + M1');
		},
		holds: (b) => buildFrame(b.state).page === 'system-presets'
	},
	{
		match: /^the arpeggio player is on for the selected track$/,
		kind: 'set-up',
		how: "the navigator's steps to the arpeggio page, then `player` to switch it on",
		setup: (b) => toPlayer(b, 'arpeggio', true),
		holds: (b) => playerIs(b, 'arpeggio', true)
	},
	{
		match: /^the maestro player is on for the selected track$/,
		kind: 'set-up',
		how: "the navigator's steps to the maestro page, then `player` to switch it on",
		setup: (b) => toPlayer(b, 'maestro', true),
		holds: (b) => playerIs(b, 'maestro', true)
	},
	{
		match: /^the player type of the selected track is hold$/,
		kind: 'set-up',
		how: "the navigator's steps to the hold player, then `instrument` to leave its page",
		setup: (b) => {
			toPlayer(b, 'hold', false);
			b.play('instrument');
		},
		holds: (b) =>
			currentPattern(b.state.tracks[b.state.track].sequence).player.type === 'hold' &&
			inMode('instrument')(b.state)
	},
	{
		match: /^`m4` shows the value lfo$/,
		kind: 'set-up',
		how: "the navigator's steps that pick the value LFO on `M4`",
		setup: (b) =>
			b.follow(planParam(b.state, { track: b.state.track + 1, param: 'lfo type', value: 'value' })),
		holds: (b) => {
			const t = b.state.tracks[b.state.track];
			return t.lfo.type === 'value' && t.lfo.on && b.state.pages.instrument === 4;
		}
	},
	{
		match: /^the track uses the drum sampler$/,
		kind: 'set-up',
		how: 'pressed `T1` (a drum sampler in a new project)',
		setup: (b) => b.play('T1'),
		holds: (b) => b.state.tracks[b.state.track].engine === 'drum'
	},
	{
		match: /^the track uses the multisampler$/,
		kind: 'set-up',
		how: 'pressed `T8` (the multisampler in a new project)',
		setup: (b) => b.play('T8'),
		holds: (b) => b.state.tracks[b.state.track].engine === 'multisampler'
	},
	{
		match: /^the selected track does not use a sampler engine$/,
		kind: 'set-up',
		how: 'pressed `T3` (prism in a new project)',
		setup: (b) => b.play('T3'),
		holds: (b) => !/sampler|drum/.test(b.state.tracks[b.state.track].engine)
	},
	{
		match: /^the midi section is open$/,
		kind: 'set-up',
		how: '`com`, `M1`, then `turn E1` to the midi section',
		setup: (b) => {
			b.play('com');
			b.play('M1');
			const turns = turnTo(b, 'turn E1', (sim) => /\bmidi\b/.test(screenOf(sim.state)));
			if (turns !== null) b.play('turn E1', timingFor(turns));
		},
		holds: (b) => /system settings: midi\b/.test(b.screen)
	},
	{
		match: /^the track's quantisation is below 100$/,
		kind: 'set-up',
		how: 'turned `bar + turn E1` twenty detents counter-clockwise',
		setup: (b) => b.play('bar + turn E1', timingFor(-20)),
		holds: (b) => currentPattern(b.state.tracks[b.state.track].sequence).quantise < 100
	},
	{
		match: /^the track already has notes in its sequence$/,
		kind: 'set-up',
		how: "four notes written on steps 1, 5, 9 and 13 of the selected track's pattern (typed, not keyed)",
		setup: (b) =>
			b.virtual.writePattern(b.state.track + 1, {
				pattern: 1,
				bars: 1,
				notes: [1, 5, 9, 13].map((step) => ({ step, note: 60, velocity: 100, length: 1 }))
			}),
		holds: (b) => notesOnTrack(b.state) > 0
	},
	{
		match: /^(a few scenes are ready|the scenes exist)$/,
		kind: 'set-up',
		how: "scenes 1–3 written, each playing every track's pattern 1 (typed, not keyed)",
		setup: (b) => writeScenes(b, false),
		holds: (b) => b.virtual.readArrangement().scenes.length >= 3
	},
	{
		match: /^a song with several scenes$/,
		kind: 'set-up',
		how: 'scenes 1–3 and a song that plays them in order, written (typed, not keyed)',
		setup: (b) => writeScenes(b, true),
		holds: (b) => b.virtual.readArrangement().song.order.length >= 3
	},
	{
		match: /^the unit is switched off$/,
		kind: 'set-up',
		how: 'switched `power` off (straight into the simulator: the animation only highlights it)',
		setup: (b) => {
			if (b.state.areas.system.power.on) b.press('power');
		},
		holds: (b) => !b.state.areas.system.power.on
	},
	{
		match:
			/\b(plugged|cable|splitter|connected|computer|field kit|mac|firmware file|backed up|copied to a computer|line in)\b/,
		kind: 'outside',
		how: 'outside the replica (cables, computers, other gear, audio coming in)'
	}
];

/** Normalises a precondition for matching: lower case, one space. */
const plain = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** The rule for a precondition, or null. */
export function preconditionRule(text: string): PreconditionRule | null {
	const t = plain(text);
	return PRECONDITIONS.find((rule) => rule.match.test(t)) ?? null;
}

/** Sets up what a procedure's preconditions ask for, where a rule knows how. */
function setUp(bench: Bench, preconditions: readonly string[]): PreconditionRecord[] {
	const rules = preconditions.map((text) => {
		const rule = preconditionRule(text);
		if (rule?.kind === 'set-up') rule.setup?.(bench);
		return { text, rule };
	});
	// checked once all are set up: a later one may undo an earlier one (`M2` after `mix mode`)
	return rules.map(({ text, rule }) =>
		rule
			? { text, kind: rule.kind, how: rule.how, holds: rule.holds ? rule.holds(bench) : null }
			: { text, kind: 'not-set-up', how: 'no rule: runs from where it starts', holds: null }
	);
}

// ─── turns ─────────────────────────────────────────────────────────────────────────────────────

/** The detents searched when a turn is aimed at a value or a word. */
const REACH = 128;
/** The app's animation: four detents clockwise. */
const DEFAULT_DETENTS = 4;

const timingFor = (detents: number): Partial<AnimationTiming> => ({
	turnSteps: Math.abs(detents),
	direction: Math.sign(detents) as 1 | -1
});

/** The encoder (1–4) a chord's last term turns, or null (not a turn, or the volume knob). */
function turnedEncoder(chord: KeyChord): 1 | 2 | 3 | 4 | null {
	const last = chord.terms[chord.terms.length - 1];
	if (last?.gesture !== 'turn') return null;
	const m = /^encoder\.([1-4])$/.exec(targetIds(last.target)[0]);
	return m ? (Number(m[1]) as 1 | 2 | 3 | 4) : null;
}

/**
 * The fewest detents (either way, clockwise first; `only` keeps to one way) after which `hit` is
 * true of a copy of the simulator that played `keys` with them, or null. A single chord is turned
 * one detent at a time on one copy; a longer one is replayed for each count.
 */
function turnTo(
	bench: Bench,
	keys: string,
	hit: (sim: OpxySim) => boolean,
	only?: 1 | -1
): number | null {
	const parsed = tryParseKeys(keys);
	if (!parsed.ok) return null;
	const chords = parsed.value.chords;
	const encoder = turnedEncoder(chords[chords.length - 1]);
	if (encoder === null) return null;
	const found: number[] = [];
	for (const dir of only ? [only] : ([1, -1] as const)) {
		if (chords.length === 1) {
			const sim = bench.copy();
			for (const term of chords[0].terms.slice(0, -1)) {
				sim.input({ type: 'press', id: targetIds(term.target)[0] });
			}
			for (let n = 1; n <= REACH; n++) {
				sim.turn(encoder, dir);
				if (hit(sim)) {
					found.push(dir * n);
					break;
				}
			}
		} else {
			for (let n = 1; n <= REACH / 4; n++) {
				const sim = bench.copy();
				playStep(sim, { keys, clicks: dir * n });
				if (hit(sim)) {
					found.push(dir * n);
					break;
				}
			}
		}
	}
	if (found.length === 0) return null;
	return found.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
}

/**
 * Words that say how to turn, not what to turn to. Nouns stay: a page's title words never count,
 * since only words that come and go as the encoder turns can name a position.
 */
const STOP = new Set(
	(
		'a an the to of on in at for and or it its is are be by with from then until shows show ' +
		'choose pick select set turn turns turning highlight scroll go move change one some any ' +
		'your you that this these which where when how up down left right clockwise counter ' +
		'anticlockwise around about such as like also works too only if so now again same way ' +
		'there here eg optional encoder encoders'
	).split(' ')
);

const NUMBER_WORDS: Readonly<Record<string, string>> = {
	two: '2',
	three: '3',
	four: '4',
	five: '5',
	six: '6',
	seven: '7',
	eight: '8',
	nine: '9',
	ten: '10',
	sixteen: '16',
	thirty: '30',
	sixty: '60'
};

/** A text's words, lower case, backticked keys left out. */
const rawWords = (text: string) =>
	text
		.toLowerCase()
		.replace(/`[^`]*`/g, ' ')
		.split(/[^a-z0-9#]+/)
		.filter((w) => w.length > 1 || /\d/.test(w));

/** A word as matching compares it: numbers as digits, plurals folded ("slices" → "slice"). */
const fold = (w: string) => {
	const n = NUMBER_WORDS[w] ?? w;
	return n.length > 3 && n.endsWith('s') && !n.endsWith('ss') ? n.slice(0, -1) : n;
};

/** A text's words for matching. */
export function wordsOf(text: string): Set<string> {
	return new Set(rawWords(text).map(fold));
}

/** How often each word occurs (a tab named like the page's title counts twice there). */
function wordCounts(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const w of rawWords(text).map(fold)) counts.set(w, (counts.get(w) ?? 0) + 1);
	return counts;
}

/** The words of a note that could name what to pick. */
export const targetWords = (note: string): string[] => [
	...new Set(
		rawWords(note)
			.filter((w) => !STOP.has(w))
			.map(fold)
	)
];

/** The way a note says to turn: the first "clockwise" it names wins; "to the left" is −. */
function directionOf(note: string): 1 | -1 {
	const m = /(counter-?|anti-?)?clockwise|to the left/i.exec(note);
	return m && (m[1] || /left/i.test(m[0])) ? -1 : 1;
}

/** How a step's turn was made. */
export interface TurnRecord {
	/** `E1`–`E4`. */
	readonly encoder: string;
	/** Detents turned: + clockwise, − counter-clockwise; 0 when it was left where it stood. */
	readonly detents: number;
	/** Why that many, in a few words. */
	readonly why: string;
	/** A recipe's setting (`set`) that no number of detents here reaches. */
	readonly missed?: string;
	/** When the note names nothing the turn can show: screens across the encoder's range, in order. */
	readonly offers?: readonly string[];
}

/** Up to `n` of a list, spread over it. */
function spread<T>(items: readonly T[], n: number): T[] {
	if (items.length <= n) return [...items];
	return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

/**
 * What a single chord's turn runs through: the screen with its held keys down before turning
 * (`now`), and every distinct screen from one end of the encoder's range to the other.
 */
function sweepScreens(bench: Bench, chord: KeyChord): { now: string; screens: string[] } {
	const encoder = turnedEncoder(chord);
	const held = () => {
		const sim = bench.copy();
		for (const term of chord.terms.slice(0, -1)) {
			sim.input({ type: 'press', id: targetIds(term.target)[0] });
		}
		return sim;
	};
	const now = screenOf(held().state);
	if (encoder === null) return { now, screens: [now] };
	const side = (dir: 1 | -1) => {
		const sim = held();
		const out: string[] = [];
		for (let n = 0, still = 0; n < REACH && still < 12; n++) {
			sim.turn(encoder, dir);
			const screen = screenOf(sim.state);
			if (out[out.length - 1] === screen) still++;
			else {
				still = 0;
				out.push(screen);
			}
		}
		return out;
	};
	const back = side(-1).reverse();
	return { now, screens: [...new Set([...back, now, ...side(1)])] };
}

const ALL_THE_WAY = /\bfully\b|all the way/i;

/**
 * How far to turn the last encoder of `keys` for this step: to the recipe's value (`set`), to what
 * the note names, the way the note says, or the app's four detents clockwise.
 */
function chooseTurn(
	bench: Bench,
	keys: string,
	step: ManualProcedure['steps'][number],
	aimAtSet: boolean
): TurnRecord | null {
	const parsed = tryParseKeys(keys);
	if (!parsed.ok) return null;
	const chords = parsed.value.chords;
	const encoder = turnedEncoder(chords[chords.length - 1]);
	if (encoder === null) return null;
	const name = `E${encoder}`;
	const note = step.note ?? '';
	const dir = directionOf(note);
	if (aimAtSet && step.set) {
		const goal = settingGoal(step.set, selectedTrack(bench.state));
		if (typeof goal === 'string') {
			return {
				encoder: name,
				detents: DEFAULT_DETENTS * dir,
				why: 'the default turn',
				missed: goal
			};
		}
		const what = `${step.set.param} ${step.set.value}`;
		if (reads(bench.state, goal)) return { encoder: name, detents: 0, why: `already at ${what}` };
		const detents = turnTo(bench, keys, (sim) => reads(sim.state, goal));
		if (detents !== null) return { encoder: name, detents, why: `until it reads ${what}` };
		return {
			encoder: name,
			detents: DEFAULT_DETENTS * dir,
			why: 'the default turn',
			missed: `no number of detents of ${name} here makes it read ${what}`
		};
	}
	if (ALL_THE_WAY.test(note)) {
		return { encoder: name, detents: REACH * dir, why: 'all the way, as the note says' };
	}
	const targets = targetWords(note);
	if (targets.length > 0 && chords.length === 1) {
		// only words that come and go as the encoder turns can name a position (not the page's title)
		const { now, screens } = sweepScreens(bench, chords[0]);
		const counts = screens.map(wordCounts);
		const count = (c: Map<string, number>, w: string) => c.get(w) ?? 0;
		const aimed = targets.filter((w) => counts.some((c) => count(c, w) !== count(counts[0], w)));
		if (aimed.length > 0) {
			const score = (screen: string) => {
				const c = wordCounts(screen);
				return aimed.reduce((n, w) => n + count(c, w), 0);
			};
			const here = score(now);
			const best = Math.max(here, ...screens.map(score));
			if (best > here) {
				const only = /(counter-?|anti-?)clockwise|to the left/i.test(note) ? dir : undefined;
				const detents = turnTo(bench, keys, (sim) => score(screenOf(sim.state)) === best, only);
				if (detents !== null) {
					return {
						encoder: name,
						detents,
						why: `to the nearest position showing "${aimed.join(' ')}"`
					};
				}
			} else if (here > 0) {
				return { encoder: name, detents: 0, why: `already shows "${aimed.join(' ')}"` };
			}
		}
		// nothing the note says names a position here: turn as the app does, and say what it offers
		return {
			encoder: name,
			detents: DEFAULT_DETENTS * dir,
			why: dir < 0 ? 'four detents counter-clockwise, as the note says' : 'the default turn',
			...(aimed.length === 0 && screens.length > 1 ? { offers: spread(screens, 8) } : {})
		};
	}
	return {
		encoder: name,
		detents: DEFAULT_DETENTS * dir,
		why: dir < 0 ? 'four detents counter-clockwise, as the note says' : 'the default turn'
	};
}

// ─── running a procedure ───────────────────────────────────────────────────────────────────────

/** Something that kept a step from being played as the app plays it. */
export interface StepError {
	/**
	 * `parse`: the combo is not in the key grammar; `unknown-control`: the simulator ignores a control
	 * it names; `not-animated`: the replica's animation cannot operate a control (it was played into
	 * the simulator directly); `exception`: something threw.
	 */
	readonly kind: 'parse' | 'unknown-control' | 'not-animated' | 'exception';
	readonly detail: string;
}

/** A recipe step's setting and whether the replica reads it once the step is done. */
export interface SetRecord {
	/** `param value`, as the step's `set` writes it. */
	readonly what: string;
	/** Null when the navigator cannot read the setting (it names no parameter it knows). */
	readonly reads: boolean | null;
	readonly note?: string;
}

/** Whether the replica reads a recipe step's setting now. */
function setRecord(
	bench: Bench,
	set: NonNullable<ManualProcedure['steps'][number]['set']>
): SetRecord {
	const what = `${set.param} ${set.value}`;
	const goal = settingGoal(set, selectedTrack(bench.state));
	if (typeof goal === 'string') return { what, reads: null, note: goal };
	try {
		return { what, reads: reads(bench.state, goal) };
	} catch (error) {
		return { what, reads: null, note: error instanceof Error ? error.message : String(error) };
	}
}

/** One step as it ran. */
export interface StepRecord {
	/** 1-based. */
	readonly index: number;
	readonly keys: string;
	/** The combo as played, when a placeholder, range or alternative stood for one key of several. */
	readonly played: string | null;
	/** Why a target was played as another candidate than its first. */
	readonly picked: readonly string[];
	readonly note: string | null;
	/** A recipe step's setting, and whether the replica reads it after the step. */
	readonly set: SetRecord | null;
	/** How each turn was made. */
	readonly turns: readonly TurnRecord[];
	/** Every screen the step showed, in order (the last one is where it ended). */
	readonly screens: readonly string[];
	readonly context: string;
	readonly leds: string;
	/** What changed in the replica's model during the step (the grounding diff). */
	readonly changes: readonly string[];
	/** The patterns that changed, with their notes, locks and step components counted. */
	readonly patterns: readonly string[];
	/** Other changes to the model that nothing above shows (paths in the simulator's state). */
	readonly model: readonly string[];
	/** Conditions in the note that were followed ("pressed it again: the page showed off"). */
	readonly followed: readonly string[];
	/** Whether anything changed: the screen, where it stands, the LEDs, the model. */
	readonly effect: boolean;
	readonly errors: readonly StepError[];
}

/** Where a procedure started. */
export interface StartRecord {
	/** The procedure whose end it continued from (recipes), or null for a new project. */
	readonly after: string | null;
	/** Whether the project was seeded with something to act on ({@link seedProject}). */
	readonly seeded: boolean;
	readonly screen: string;
	readonly context: string;
	readonly leds: string;
	/** What the selected track's pattern and the arrangement hold ({@link contentOf}). */
	readonly content: string;
}

/** A procedure as it ran on the replica. */
export interface ProcedureRun {
	/** `unit#procedure`. */
	readonly ref: string;
	readonly unit: string;
	readonly unitTitle: string;
	readonly procedure: string;
	readonly goal: string;
	readonly result: string | null;
	readonly source: string;
	readonly preconditions: readonly PreconditionRecord[];
	readonly start: StartRecord;
	readonly steps: readonly StepRecord[];
	/** What the procedure works on that the replica does not draw at all (then not judged), or null. */
	readonly outside: string | null;
}

/** Screens of the manual the replica does not draw: procedures on them cannot be checked here. */
const UNDRAWN: Partial<Record<ManualUnit['context']['screens'][number], string>> = {
	'te boot':
		'the TE boot menu, which the replica does not draw (holding com while switching on just starts the unit)'
};

/** A procedure's deterministic problems, for the report (the judge decides the rest). */
export function stepProblems(run: ProcedureRun): string[] {
	return run.steps.flatMap((step) => {
		const at = `step ${step.index} \`${step.keys}\``;
		return [
			...step.errors.map((e) => `${at}: ${e.kind}: ${e.detail}`),
			...step.turns.filter((t) => t.missed).map((t) => `${at}: ${t.missed}`),
			...(step.set?.reads === false
				? [`${at}: afterwards the replica does not read ${step.set.what}`]
				: [])
		];
	});
}

/** The combo in the pieces its keys come up between, each played as its own animation. */
function segments(sequence: KeySequence): KeySequence[] {
	const out: KeyChord[][] = [];
	for (const chord of sequence.chords) {
		if (chord.keepHeld && out.length > 0) out[out.length - 1].push(chord);
		else out.push([chord]);
	}
	return out.map((chords) => ({
		chords: chords.map((c, i) => (i === 0 ? { ...c, keepHeld: false } : c))
	}));
}

/** Most screens a step's record keeps (the first ones and the last ones). */
const MAX_SCREENS = 6;

/** What playing a step collects. */
interface Played {
	readonly turns: TurnRecord[];
	readonly screens: string[];
	readonly errors: StepError[];
	/** The combos as played, once placeholders and alternatives were resolved. */
	readonly combos: string[];
	/** Why a target was not its first candidate. */
	readonly picked: string[];
}

/** The control and gesture of every term (the sequence's targets are single controls). */
const termsOf = (sequence: KeySequence) =>
	sequence.chords.flatMap((chord) =>
		chord.terms.map((term) => ({ id: targetIds(term.target)[0], gesture: term.gesture }))
	);

/** Plays one step's combo: its targets resolved, each piece animated with its turn chosen. */
function playCombo(
	bench: Bench,
	written: KeySequence,
	step: ManualProcedure['steps'][number],
	last: boolean,
	out: Played
): void {
	const plural = expandPlural(written, step.note);
	const { sequence, why } = resolveTargets(bench, plural.sequence, step, last);
	out.picked.push(...plural.why, ...why);
	out.combos.push(formatKeys(sequence));
	const terms = termsOf(sequence);
	for (const id of new Set(terms.map((p) => p.id))) {
		if (simIgnores().has(id)) {
			out.errors.push({ kind: 'unknown-control', detail: `the simulator ignores ${token(id)}` });
		}
	}
	const stuck = terms.filter((p) => !animates(p.id, p.gesture));
	for (const { id } of stuck) {
		out.errors.push({
			kind: 'not-animated',
			detail: `the replica's animation only highlights ${token(id)}; the verifier played it into the simulator`
		});
	}
	const pieces = segments(sequence);
	const lastTurn = pieces.findLastIndex((p) => turnedEncoder(p.chords[p.chords.length - 1]));
	pieces.forEach((piece, i) => {
		const keys = formatKeys(piece);
		if (termsOf(piece).some((p) => stuck.some((s) => s.id === p.id))) {
			out.screens.push(...bench.press(keys));
			return;
		}
		const turn = chooseTurn(bench, keys, step, i === lastTurn);
		if (turn) out.turns.push(turn);
		// already where the step wants it: a person leaves the encoder alone
		if (turn?.detents === 0) return;
		out.screens.push(...bench.play(piece, turn ? timingFor(turn.detents) : {}));
	});
}

/** Plays one step: parsed, each piece animated, its note's conditions followed, and written down. */
function runStep(
	bench: Bench,
	step: ManualProcedure['steps'][number],
	index: number,
	last: boolean
): StepRecord {
	const out: Played = { turns: [], screens: [], errors: [], combos: [], picked: [] };
	const followed: string[] = [];
	const before = {
		screen: bench.screen,
		context: contextOf(bench.state),
		leds: ledsOf(bench.state),
		state: cloneState(bench.state),
		checkpoint: bench.virtual.checkpoint()
	};
	const recording = bench.state.transport.recording;
	bench.countedIn = false;
	const conditions = NOTE_CONDITIONS.filter((c) => c.match.test(step.note ?? ''));
	const skip = conditions.find((c) => c.when === 'before' && c.test(bench));
	const parsed = tryParseKeys(step.keys);
	if (!parsed.ok) {
		out.errors.push({ kind: 'parse', detail: parsed.error.message });
	} else if (skip) {
		followed.push(skip.how);
	} else {
		try {
			playCombo(bench, parsed.value, step, last, out);
			for (const c of conditions) {
				if (c.when !== 'after' || !c.keys || !c.test(bench)) continue;
				const more = c.keys === 'again' ? parsed.value : parseKeys(c.keys);
				playCombo(bench, more, step, last, out);
				followed.push(c.how);
			}
		} catch (error) {
			out.errors.push({
				kind: 'exception',
				detail: error instanceof Error ? error.message : String(error)
			});
		}
	}
	const screens = out.screens;
	screens.push(...bench.wait(IDLE_MS));
	if (bench.state.areas.system.power.booting) screens.push(...bench.wait(BOOT_WAIT_MS));
	const changes = bench.virtual.changesSince(before.checkpoint);
	const patterns = patternChanges(before.state, bench.state);
	const model = modelChanges(before.state, bench.state);
	const after = {
		screen: bench.screen,
		context: contextOf(bench.state),
		leds: ledsOf(bench.state)
	};
	// what "now" cannot say once it is over: whether the recording this step started counted in
	const began = !recording && bench.state.transport.recording;
	const counted = bench.countedIn ? 'after a count-in' : 'at once, with no count-in';
	let shown = screens.filter((s, i) => s !== screens[i - 1]);
	if (shown.length > MAX_SCREENS) {
		shown = [...shown.slice(0, MAX_SCREENS / 2), '…', ...shown.slice(-MAX_SCREENS / 2)];
	}
	const played = out.combos.join(' → ');
	return {
		index,
		keys: step.keys,
		played: played && played !== step.keys ? played : null,
		picked: out.picked,
		note: step.note,
		set: step.set ? setRecord(bench, step.set) : null,
		turns: out.turns,
		screens: shown.length > 0 ? shown : [after.screen],
		context: began ? `${after.context}; recording began ${counted}` : after.context,
		leds: after.leds,
		changes,
		patterns,
		model,
		followed,
		effect:
			shown.length > 0 ||
			after.screen !== before.screen ||
			after.context !== before.context ||
			after.leds !== before.leds ||
			changes.length > 0 ||
			model.length > 0,
		errors: out.errors.filter(
			(e, i) => out.errors.findIndex((f) => f.kind === e.kind && f.detail === e.detail) === i
		)
	};
}

/** What the seeded start adds to a new project, in words (the report and the judge read it). */
export const SEED =
	"track 1 given a second pattern and, in the one it plays, notes on steps 1, 5, 9 and 13 with a parameter lock and a step component on step 1; track 2 given notes on steps 3, 7, 11 and 15; track 1 panned to 30 in the mixer; the master EQ's low band at 20; scenes 2 and 3, scene 2 playing track 1's second pattern";

/**
 * A project with something to act on, for procedures that had nothing on a new project (rotate,
 * nudge, clear, copy a lock, remove a pattern, centre a pan …): {@link SEED}, written into the model
 * (typed, not keyed).
 */
export function seedProject(bench: Bench): void {
	const notes = [1, 5, 9, 13].map((step) => ({ step, note: 53, velocity: 100, length: 1 }));
	// written second to first, so the track plays pattern 1 and has a pattern 2 to step to
	bench.virtual.writePattern(1, { pattern: 2, bars: 1, notes: notes.slice(0, 2) });
	bench.virtual.writePattern(1, { pattern: 1, bars: 1, notes });
	const first = currentPattern(bench.state.tracks[0].sequence).steps[0];
	first.locks['key0.tune'] = 5;
	first.components.push({ kind: 'pulse', value: 3 });
	bench.virtual.writePattern(2, {
		pattern: 1,
		bars: 1,
		notes: [3, 7, 11, 15].map((step) => ({ step, note: 55, velocity: 100, length: 1 }))
	});
	bench.state.tracks[0].mix.pan = 30;
	bench.state.areas.mixer.eq.low = 20;
	writeScenes(bench, false);
}

/**
 * Runs one procedure on `bench`: its preconditions set up where a rule knows how, then every step.
 * @param after the procedure whose end state `bench` holds (recipes), or null for a new project
 * @param seeded whether `bench` holds the seeded project ({@link seedProject})
 */
export function runProcedure(
	bench: Bench,
	unit: ManualUnit,
	procedure: ManualProcedure,
	after: string | null = null,
	seeded = false
): ProcedureRun {
	const preconditions = setUp(bench, procedure.preconditions);
	const start: StartRecord = {
		after,
		seeded,
		screen: bench.screen,
		context: contextOf(bench.state),
		leds: ledsOf(bench.state),
		content: contentOf(bench.state)
	};
	const last = procedure.steps.length;
	const steps = procedure.steps.map((step, i) => runStep(bench, step, i + 1, i + 1 === last));
	return {
		ref: `${unit.id}#${procedure.id}`,
		unit: unit.id,
		unitTitle: unit.title,
		procedure: procedure.id,
		goal: procedure.goal,
		result: procedure.result,
		source: procedure.source,
		preconditions,
		start,
		steps,
		outside: unit.context.screens.map((screen) => UNDRAWN[screen]).find(Boolean) ?? null
	};
}

/**
 * Runs a unit's procedures, each on a new project (or the seeded one, for the refs in `seed`); a
 * recipe's (`howto`) run as one sequence, each continuing where the one before it ended.
 */
export function runUnit(unit: ManualUnit, seed: ReadonlySet<string> = new Set()): ProcedureRun[] {
	const recipe = unit.area === 'howto';
	let bench = new Bench();
	let previous: string | null = null;
	return unit.procedures.map((procedure) => {
		const ref = `${unit.id}#${procedure.id}`;
		const seeded = !recipe && seed.has(ref);
		if (!recipe) bench = new Bench();
		if (seeded) seedProject(bench);
		const run = runProcedure(bench, unit, procedure, recipe ? previous : null, seeded);
		previous = run.ref;
		return run;
	});
}
