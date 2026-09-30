/**
 * The replica's live state: which controls are down, what every LED shows, how far each encoder
 * has turned, the volume, the pitch bend, the level meter and the screen. Components render it;
 * input on the replica changes it and emits outbound events (`on(type, …)` per event name,
 * `subscribe(…)` for all of them) that the device bridge maps to MIDI; `animate("shift + M1")`
 * shows a procedure on the replica (the agent's "look, press this") without emitting anything.
 *
 * Reactivity is per control (SvelteSet/SvelteMap), so pressing one key re-renders one key.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
	getControl,
	isControlId,
	parseKeys,
	type ControlId,
	type EncoderId,
	type KeyId,
	type KeySequence
} from '$lib/core/opxy';
import {
	HIGHLIGHT_PRIORITY,
	planAnimation,
	type AnimationPlan,
	type AnimationTiming,
	type HighlightKind,
	type PickControl,
	type PlanStep
} from './animation';

/**
 * Where a change came from. Outbound events are emitted for `pointer`, `keyboard` and `program`
 * (someone operating the replica); never for `device` (mirroring the real unit, which would echo)
 * or `demo` (a teaching animation, which must not touch the device).
 */
export type InputSource = 'pointer' | 'keyboard' | 'program' | 'device' | 'demo';

const EMITTING: readonly InputSource[] = ['pointer', 'keyboard', 'program'];

/** Controls that go down and come up: the 68 keys and the four encoder pushes. */
export type PressableId = KeyId | EncoderId;
/** Controls that turn. */
export type TurnableId = EncoderId | 'knob.volume';
/** States of a key's LED window. */
export type KeyLedState = 'off' | 'dim' | 'white' | 'red';

/**
 * A key the app points out under its LED (a scale's notes on the keyboard): shown dim where the
 * device lights nothing, the root with a faint ring. Never sent anywhere; the device's own lights
 * always win.
 */
export type GuideMark = 'note' | 'root';

/** A key or encoder push went down or came up. */
export interface PressEvent {
	readonly type: 'press' | 'release';
	readonly id: PressableId;
	readonly source: InputSource;
}

/**
 * An encoder turned by `delta` detents (value = detents since start), or the volume pot moved by
 * `delta` (value = position 0–1). `fine` marks a turn with the encoder's click held.
 */
export interface TurnEvent {
	readonly type: 'turn';
	readonly id: TurnableId;
	readonly delta: number;
	readonly value: number;
	readonly fine: boolean;
	readonly source: InputSource;
}

/** An encoder was clicked (pushed and released without turning). */
export interface ClickEvent {
	readonly type: 'click';
	readonly id: EncoderId;
	readonly source: InputSource;
}

/** The pitch-bend pad moved: -1 (left, down) … 0 … +1 (right, up). */
export interface BendEvent {
	readonly type: 'bend';
	readonly id: 'strip.pitchbend';
	readonly value: number;
	readonly source: InputSource;
}

/** Everything the replica reports outward. */
export type ReplicaEvent = PressEvent | TurnEvent | ClickEvent | BendEvent;
/** Event names. */
export type ReplicaEventType = 'press' | 'release' | 'turn' | 'click' | 'bend';
/** The event for a name. */
export type ReplicaEventOf<T extends ReplicaEventType> = T extends 'press' | 'release'
	? PressEvent
	: Extract<ReplicaEvent, { type: T }>;
/** A listener for every outbound event (see {@link ReplicaState.subscribe}). */
export type ReplicaListener = (event: ReplicaEvent) => void;

/** Timer functions, injectable for tests; default to the global ones at call time. */
export interface Timers {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** What the screen shows: lines of text (the first is a small title when there are several). */
export interface ScreenContent {
	readonly lines: readonly string[];
}

/** The most recent turn of a control: its direction and a counter that grows with every turn. */
export interface LastTurn {
	readonly direction: 1 | -1;
	readonly count: number;
}

/** Options for {@link ReplicaState}. */
export interface ReplicaStateOptions {
	onPress?: (event: PressEvent) => void;
	onRelease?: (event: PressEvent) => void;
	onTurn?: (event: TurnEvent) => void;
	onClick?: (event: ClickEvent) => void;
	onBend?: (event: BendEvent) => void;
	timers?: Timers;
	/** Encoder detents per revolution, for drawing the knurl (unverified on hardware). */
	detentsPerTurn?: number;
	/** Initial screen. */
	screen?: string | readonly string[];
}

/** Options for {@link ReplicaState.animate}: timing overrides plus how to pick placeholders. */
export interface AnimateOptions extends Partial<AnimationTiming> {
	pick?: PickControl;
}

/** A running animation. */
export interface AnimationHandle {
	readonly plan: AnimationPlan;
	/** Resolves when the animation ends or is cancelled. */
	readonly done: Promise<'finished' | 'cancelled'>;
	cancel(): void;
}

/** The global timers, looked up when used (never at import time). */
const GLOBAL_TIMERS: Timers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as Parameters<typeof clearTimeout>[0])
};

/** Bookkeeping of the running animation. */
interface AnimationRun {
	readonly timers: unknown[];
	/** Controls the animation pressed, to put back up when it ends. */
	readonly demo: PressableId[];
	/** True once the animation bent the pitch-bend pad. */
	bent: boolean;
	readonly finish: (result: 'finished' | 'cancelled') => void;
}

/** Invalid use of the replica API (unknown control, value out of range). */
export class ReplicaError extends Error {
	name = 'ReplicaError';
}

/** Bend applied while the pitch-bend pad is shown pressed in an animation. */
const DEMO_BEND = 0.7;
/** Volume change per detent when an animation turns the volume knob. */
const DEMO_VOLUME_STEP = 0.06;
/** Travel of the volume pot in degrees (unverified; 300° is typical). */
export const VOLUME_TRAVEL = 300;

/**
 * Where the volume pot starts: the middle, its pointer straight up, the level the app plays at by
 * default (TE's drawing has it near the bottom of its travel, at the dimple's drawn angle).
 */
export const DEFAULT_VOLUME = 0.5;

/** Removes one occurrence of `item` from `list`, if present. */
function removeFrom<T>(list: T[], item: T): void {
	const index = list.indexOf(item);
	if (index >= 0) list.splice(index, 1);
}

function assertUnit(name: string, value: number, min: number, max: number): void {
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new ReplicaError(`${name} must be between ${min} and ${max}, got ${value}`);
	}
}

/** The replica's live state. Create one per replica and pass it in: `<Replica {replica} />`. */
export class ReplicaState {
	readonly #pressed = new SvelteSet<PressableId>();
	readonly #latched = new SvelteSet<PressableId>();
	readonly #leds = new SvelteMap<KeyId, KeyLedState>();
	readonly #blinking = new SvelteSet<KeyId>();
	readonly #turns = new SvelteMap<EncoderId, number>();
	readonly #highlights = new SvelteMap<ControlId, HighlightKind>();
	readonly #guide = new SvelteMap<KeyId, GuideMark>();
	readonly #hints = new SvelteMap<TurnableId, 1 | -1>();
	readonly #lastTurn = new SvelteMap<TurnableId, LastTurn>();
	#volume = $state(DEFAULT_VOLUME);
	#bend = $state(0);
	#meter = $state(0);
	// black until the simulator's first frame (a placeholder page would flash while it loads)
	#screen = $state.raw<ScreenContent>({ lines: [] });
	#animating = $state(false);

	/** Outbound listeners by event name (plain arrays: listeners are not reactive state). */
	readonly #listeners: Record<ReplicaEventType, ((event: ReplicaEvent) => void)[]> = {
		press: [],
		release: [],
		turn: [],
		click: [],
		bend: []
	};
	/** Listeners for every outbound event, called after the per-name ones. */
	readonly #subscribers: ReplicaListener[] = [];
	readonly #observers: ReplicaListener[] = [];
	readonly #timers: Timers;
	/** Encoder detents per revolution (for the knurl angle). */
	readonly detentsPerTurn: number;

	#run: AnimationRun | null = null;

	constructor(options: ReplicaStateOptions = {}) {
		this.#timers = options.timers ?? GLOBAL_TIMERS;
		this.detentsPerTurn = options.detentsPerTurn ?? 24;
		if (!Number.isInteger(this.detentsPerTurn) || this.detentsPerTurn < 1) {
			throw new ReplicaError(
				`detentsPerTurn must be a positive integer, got ${this.detentsPerTurn}`
			);
		}
		if (options.screen !== undefined) this.setScreen(options.screen);
		const wire = <T extends ReplicaEventType>(
			type: T,
			handler?: (e: ReplicaEventOf<T>) => void
		) => {
			if (handler) this.on(type, handler);
		};
		wire('press', options.onPress);
		wire('release', options.onRelease);
		wire('turn', options.onTurn);
		wire('click', options.onClick);
		wire('bend', options.onBend);
	}

	// ─────────────────────────────────────────────────────────────── reading

	/** True while the control is down. */
	isPressed(id: PressableId): boolean {
		return this.#pressed.has(id);
	}

	/** True while the control is latched down (sticky press). */
	isLatched(id: PressableId): boolean {
		return this.#latched.has(id);
	}

	/** Every control that is down, in the order it went down. */
	get pressed(): PressableId[] {
		return [...this.#pressed];
	}

	/** True while shift is held. */
	get shift(): boolean {
		return this.#pressed.has('key.shift');
	}

	/** What a key's LED window shows. */
	led(id: KeyId): KeyLedState {
		return this.#leds.get(id) ?? 'off';
	}

	/** What a key's LED window shows on screen: the device's light, else a guide mark's dim one. */
	shownLed(id: KeyId): KeyLedState {
		const lit = this.#leds.get(id);
		if (lit) return lit;
		return this.#guide.has(id) ? 'dim' : 'off';
	}

	/** How the app points a key out under its LED, if it does. */
	guide(id: KeyId): GuideMark | undefined {
		return this.#guide.get(id);
	}

	/** True while a key's LED blinks. */
	isBlinking(id: KeyId): boolean {
		return this.#blinking.has(id);
	}

	/** Detents an encoder has turned since start (positive = clockwise). */
	turns(id: EncoderId): number {
		return this.#turns.get(id) ?? 0;
	}

	/** Knurl angle of an encoder in degrees (the real encoder has no pointer). */
	angle(id: EncoderId): number {
		return (this.turns(id) * 360) / this.detentsPerTurn;
	}

	/** Volume pot position, 0–1. */
	get volume(): number {
		return this.#volume;
	}

	/** Pitch bend, -1–1. */
	get bend(): number {
		return this.#bend;
	}

	/** Level meter, 0–1. */
	get meter(): number {
		return this.#meter;
	}

	/** What the screen shows. */
	get screen(): ScreenContent {
		return this.#screen;
	}

	/** How a control is marked by the running animation, if at all. */
	highlight(id: ControlId): HighlightKind | undefined {
		return this.#highlights.get(id);
	}

	/** The latest turn of an encoder or the volume pot (for a brief motion cue), if any. */
	lastTurn(id: TurnableId): LastTurn | undefined {
		return this.#lastTurn.get(id);
	}

	#recordTurn(id: TurnableId, delta: number): void {
		this.#lastTurn.set(id, {
			direction: delta > 0 ? 1 : -1,
			count: (this.#lastTurn.get(id)?.count ?? 0) + 1
		});
	}

	/** Direction an animation is turning a control, if any. */
	turnHint(id: TurnableId): 1 | -1 | undefined {
		return this.#hints.get(id);
	}

	/** True while an animation plays. */
	get animating(): boolean {
		return this.#animating;
	}

	// ─────────────────────────────────────────────────────────────── events

	/**
	 * Listens to outbound events of one name; returns a function that stops listening. Any number
	 * of listeners may listen, each gets every event.
	 * @example replica.on('press', (e) => device.pressKey(e.id))
	 */
	on<T extends ReplicaEventType>(type: T, handler: (event: ReplicaEventOf<T>) => void): () => void {
		const listener = handler as (event: ReplicaEvent) => void;
		this.#listeners[type].push(listener);
		return () => removeFrom(this.#listeners[type], listener);
	}

	/**
	 * Listens to every outbound event (press, release, turn, click, bend) in the order they happen;
	 * returns a function that stops listening. Several consumers (the device bridge, the agent) can
	 * subscribe side by side. Like {@link on}, it hears only someone operating the replica
	 * (`pointer`, `keyboard`, `program`), never mirroring (`device`) or teaching animations (`demo`).
	 * Subscribers run after the per-name listeners of the same event.
	 * @example const stop = replica.subscribe((e) => log(e.type, e.id))
	 */
	subscribe(listener: ReplicaListener): () => void {
		this.#subscribers.push(listener);
		return () => removeFrom(this.#subscribers, listener);
	}

	/**
	 * Hears every event from every source, teaching animations (`demo`) and mirroring (`device`)
	 * included; returns a function that stops listening. For models of the device, such as the UI
	 * simulator, which should show the page a demonstrated combo leads to. Nothing that sends to
	 * the device may observe: use {@link subscribe}.
	 */
	observe(listener: ReplicaListener): () => void {
		this.#observers.push(listener);
		return () => removeFrom(this.#observers, listener);
	}

	#emit(event: ReplicaEvent): void {
		for (const observer of [...this.#observers]) {
			try {
				observer(event);
			} catch (error) {
				queueMicrotask(() => {
					throw error;
				});
			}
		}
		if (!EMITTING.includes(event.source)) return;
		for (const listener of [...this.#listeners[event.type], ...this.#subscribers]) {
			try {
				listener(event);
			} catch (error) {
				// A failing listener must not leave the replica half-updated; surface it async.
				queueMicrotask(() => {
					throw error;
				});
			}
		}
	}

	// ─────────────────────────────────────────────────────────────── input

	#assertPressable(id: string): asserts id is PressableId {
		if (!isControlId(id)) throw new ReplicaError(`unknown control "${id}"`);
		const kind = getControl(id).kind;
		if (kind !== 'key' && kind !== 'encoder') {
			throw new ReplicaError(`${id} cannot be pressed (it is a ${kind})`);
		}
	}

	/** Puts a key (or an encoder's push) down. Pressing a control that is down does nothing. */
	press(id: PressableId, source: InputSource = 'program'): void {
		this.#assertPressable(id);
		if (this.#pressed.has(id)) return;
		this.#pressed.add(id);
		this.#emit({ type: 'press', id, source });
	}

	/** Lets a control come up (and unlatches it). Releasing a control that is up does nothing. */
	release(id: PressableId, source: InputSource = 'program'): void {
		this.#assertPressable(id);
		this.#latched.delete(id);
		if (!this.#pressed.delete(id)) return;
		this.#emit({ type: 'release', id, source });
	}

	/**
	 * Sticky press, for single-pointer users holding a modifier: latches the control down, or
	 * releases it when it is latched. Returns true when the control is now latched.
	 */
	toggleLatch(id: PressableId, source: InputSource = 'program'): boolean {
		if (this.#latched.has(id)) {
			this.release(id, source);
			return false;
		}
		this.press(id, source);
		this.#latched.add(id);
		return true;
	}

	/** Releases every control that is down. */
	releaseAll(source: InputSource = 'program'): void {
		for (const id of [...this.#pressed]) this.release(id, source);
	}

	/** Turns an encoder by whole detents (positive = clockwise). */
	turn(
		id: EncoderId,
		detents: number,
		options: { source?: InputSource; fine?: boolean } = {}
	): void {
		if (!isControlId(id) || getControl(id).kind !== 'encoder') {
			throw new ReplicaError(`${id} is not an encoder`);
		}
		if (!Number.isInteger(detents) || detents === 0) {
			throw new ReplicaError(`an encoder turns by whole non-zero detents, got ${detents}`);
		}
		const value = this.turns(id) + detents;
		this.#turns.set(id, value);
		this.#recordTurn(id, detents);
		this.#emit({
			type: 'turn',
			id,
			delta: detents,
			value,
			fine: options.fine ?? this.#pressed.has(id),
			source: options.source ?? 'program'
		});
	}

	/** Reports an encoder click (a push released without turning). */
	click(id: EncoderId, source: InputSource = 'program'): void {
		if (!isControlId(id) || getControl(id).kind !== 'encoder') {
			throw new ReplicaError(`${id} is not an encoder`);
		}
		this.#emit({ type: 'click', id, source });
	}

	/** Moves the volume pot to a position 0–1. */
	setVolume(value: number, source: InputSource = 'program'): void {
		assertUnit('volume', value, 0, 1);
		const delta = value - this.#volume;
		if (delta === 0) return;
		this.#volume = value;
		this.#recordTurn('knob.volume', delta);
		this.#emit({ type: 'turn', id: 'knob.volume', delta, value, fine: false, source });
	}

	/** Bends the pitch-bend pad: -1 (left, down) … 0 … +1 (right, up). */
	setBend(value: number, source: InputSource = 'program'): void {
		assertUnit('bend', value, -1, 1);
		if (value === this.#bend) return;
		this.#bend = value;
		this.#emit({ type: 'bend', id: 'strip.pitchbend', value, source });
	}

	// ─────────────────────────────────────────────────────────────── output

	/** Sets a key's LED window; `blink` makes it flash. */
	setLed(id: KeyId, state: KeyLedState, options: { blink?: boolean } = {}): void {
		if (!isControlId(id) || getControl(id).kind !== 'key' || getControl(id).led === null) {
			throw new ReplicaError(`${id} has no LED window`);
		}
		if (!['off', 'dim', 'white', 'red'].includes(state)) {
			throw new ReplicaError(`unknown LED state "${state}"`);
		}
		if (state === 'off') this.#leds.delete(id);
		else this.#leds.set(id, state);
		if (options.blink && state !== 'off') this.#blinking.add(id);
		else this.#blinking.delete(id);
	}

	/** Sets several LEDs at once; keys not listed keep their state. */
	setLeds(states: Partial<Record<KeyId, KeyLedState>>): void {
		for (const [id, state] of Object.entries(states) as [KeyId, KeyLedState | undefined][]) {
			if (state !== undefined) this.setLed(id, state);
		}
	}

	/** Turns every LED off. */
	clearLeds(): void {
		this.#leds.clear();
		this.#blinking.clear();
	}

	/**
	 * Points keys out under their LEDs (`marks` replaces every mark there was; an empty object
	 * clears them): the app's guide layer, e.g. a scale lit on the keyboard.
	 */
	setGuide(marks: Partial<Record<KeyId, GuideMark>>): void {
		for (const id of [...this.#guide.keys()]) if (!(id in marks)) this.#guide.delete(id);
		for (const [id, mark] of Object.entries(marks) as [KeyId, GuideMark | undefined][]) {
			if (!mark) continue;
			if (!isControlId(id) || getControl(id).kind !== 'key' || getControl(id).led === null) {
				throw new ReplicaError(`${id} has no LED window`);
			}
			if (this.#guide.get(id) !== mark) this.#guide.set(id, mark);
		}
	}

	/** Sets the level meter, 0–1. */
	setMeter(level: number): void {
		assertUnit('meter level', level, 0, 1);
		this.#meter = level;
	}

	/** Sets the screen text: one string (newlines split lines) or a list of lines. */
	setScreen(content: string | readonly string[]): void {
		const lines = typeof content === 'string' ? content.split('\n') : [...content];
		this.#screen = { lines };
	}

	/** Marks a control for teaching (`null` clears the mark). */
	setHighlight(id: ControlId, kind: HighlightKind | null): void {
		if (!isControlId(id)) throw new ReplicaError(`unknown control "${id}"`);
		if (kind === null) this.#highlights.delete(id);
		else this.#highlights.set(id, kind);
	}

	/** Shows which way to turn a control for teaching (`null` clears it). */
	setTurnHint(id: TurnableId, direction: 1 | -1 | null): void {
		if (direction === null) this.#hints.delete(id);
		else this.#hints.set(id, direction);
	}

	/** Clears every teaching mark. */
	clearHighlights(): void {
		this.#highlights.clear();
		this.#hints.clear();
	}

	// ─────────────────────────────────────────────────────────────── animation

	/**
	 * Shows a key combo on the replica: highlights the controls and plays the gesture (keys go
	 * down and up, encoders turn). Emits no outbound events. Starting another animation cancels
	 * this one.
	 * @param keys a combo in the grammar of `core/opxy` keys.ts, or an already parsed one
	 * @throws {KeyParseError} for a combo that does not parse
	 */
	animate(keys: string | KeySequence, options: AnimateOptions = {}): AnimationHandle {
		const sequence = typeof keys === 'string' ? parseKeys(keys) : keys;
		const { pick, ...timing } = options;
		const plan = planAnimation(sequence, timing, pick);
		this.cancelAnimation();

		let finish!: (result: 'finished' | 'cancelled') => void;
		const done = new Promise<'finished' | 'cancelled'>((resolve) => (finish = resolve));
		const run: AnimationRun = { timers: [], demo: [], bent: false, finish };
		this.#run = run;
		this.#animating = true;
		this.clearHighlights();

		for (const step of plan.steps) {
			run.timers.push(
				this.#timers.setTimeout(() => {
					if (this.#run !== run) return;
					this.#apply(step, run);
					if (step.kind === 'clear') this.#end(run, 'finished');
				}, step.at)
			);
		}
		return {
			plan,
			done,
			cancel: () => {
				if (this.#run === run) this.#end(run, 'cancelled');
			}
		};
	}

	/** Stops the running animation (if any) and puts every shown key back up. */
	cancelAnimation(): void {
		if (this.#run) this.#end(this.#run, 'cancelled');
	}

	#end(run: AnimationRun, result: 'finished' | 'cancelled'): void {
		for (const handle of run.timers) this.#timers.clearTimeout(handle);
		for (const id of run.demo) this.release(id, 'demo');
		if (run.bent) this.setBend(0, 'demo');
		this.clearHighlights();
		this.#run = null;
		this.#animating = false;
		run.finish(result);
	}

	#apply(step: PlanStep, run: AnimationRun): void {
		const { demo } = run;
		switch (step.kind) {
			case 'highlight': {
				const current = this.#highlights.get(step.id);
				if (!current || HIGHLIGHT_PRIORITY[step.highlight] >= HIGHLIGHT_PRIORITY[current]) {
					this.#highlights.set(step.id, step.highlight);
				}
				break;
			}
			case 'press':
			case 'release': {
				if (step.id === 'strip.pitchbend') {
					run.bent = step.kind === 'press';
					this.setBend(step.kind === 'press' ? DEMO_BEND : 0, 'demo');
					break;
				}
				const kind = getControl(step.id).kind;
				if (kind !== 'key' && kind !== 'encoder') break;
				const id = step.id as PressableId;
				if (step.kind === 'press') {
					if (!this.#pressed.has(id) && !demo.includes(id)) demo.push(id);
					this.press(id, 'demo');
				} else if (demo.includes(id)) {
					demo.splice(demo.indexOf(id), 1);
					this.release(id, 'demo');
				}
				break;
			}
			case 'click':
				if (getControl(step.id).kind === 'encoder') this.click(step.id as EncoderId, 'demo');
				break;
			case 'turn': {
				if (step.id === 'knob.volume') {
					const next = Math.min(1, Math.max(0, this.#volume + step.delta * DEMO_VOLUME_STEP));
					this.setVolume(next, 'demo');
				} else if (getControl(step.id).kind === 'encoder') {
					this.turn(step.id as EncoderId, step.delta, { source: 'demo' });
				}
				break;
			}
			case 'hint': {
				const id = step.id as TurnableId;
				if (step.direction === 0) this.#hints.delete(id);
				else this.#hints.set(id, step.direction);
				break;
			}
			case 'clear':
				break;
		}
	}
}
