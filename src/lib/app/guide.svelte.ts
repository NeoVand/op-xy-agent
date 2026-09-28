/**
 * A walkthrough on the replica (Phase F4): the agent plans the steps to a page or a value
 * (`plan_steps` with `guide`) and the replica lights one step at a time, with a turn arrow for
 * encoders, until the user has done it. A step counts as done when the replica's screen shows
 * what that step leads to, so any way of getting there works (a shortcut skips ahead) and a turn
 * past the value waits until it comes back. Nothing is sent anywhere: the user's own presses on
 * the replica move its simulator, as always.
 */
import { createContext } from 'svelte';
import { tryParseKeys } from '$lib/core/opxy';
import { planAnimation, type ReplicaState, type Timers, type TurnableId } from '$lib/replica';

/** One step of a walkthrough: a key combo, the detents of a turn, and the screen it leads to. */
export interface GuideStep {
	readonly keys: string;
	/** For a turn: detents, + clockwise, − counter-clockwise. */
	readonly clicks?: number;
	/** What the replica's screen shows once the step is done (the simulator's description). */
	readonly screen: string;
}

export type GuideStatus = 'idle' | 'running' | 'done';

export interface ReplicaGuideOptions {
	readonly replica: ReplicaState;
	/** What the replica's screen shows now, in the simulator's words. */
	readonly read: () => string;
	readonly timers: Timers;
}

/** How long "done" stays up before the walkthrough goes away. */
export const GUIDE_DONE_MS = 2500;

export class ReplicaGuide {
	/** What the walkthrough leads to, in a few words ("track 3 cutoff 40"). */
	goal = $state('');
	steps: readonly GuideStep[] = $state.raw([]);
	/** The step to do now (steps.length once all are done). */
	index = $state(0);
	status: GuideStatus = $state('idle');

	readonly #replica: ReplicaState;
	readonly #read: () => string;
	readonly #timers: Timers;
	#stopObserving: (() => void) | null = null;
	#doneTimer: unknown = null;

	constructor(options: ReplicaGuideOptions) {
		this.#replica = options.replica;
		this.#read = options.read;
		this.#timers = options.timers;
	}

	/** The step to do now, or null. */
	get current(): GuideStep | null {
		return this.status === 'running' ? (this.steps[this.index] ?? null) : null;
	}

	/** Starts a walkthrough (ending any other); steps already done on screen are passed at once. */
	start(goal: string, steps: readonly GuideStep[]): void {
		this.stop();
		this.#replica.cancelAnimation();
		this.goal = goal;
		this.steps = steps;
		this.index = 0;
		this.status = 'running';
		// after every input, once the simulator (another observer) has taken it
		this.#stopObserving = this.#replica.observe(() => queueMicrotask(() => this.#check()));
		this.#check();
	}

	/** Passes over the current step (one the user cannot do on the replica, say). */
	skip(): void {
		if (this.status !== 'running') return;
		this.#advanceTo(this.index + 1);
	}

	/** Ends the walkthrough and clears the replica's marks. */
	stop(): void {
		this.#stopObserving?.();
		this.#stopObserving = null;
		if (this.#doneTimer !== null) this.#timers.clearTimeout(this.#doneTimer);
		this.#doneTimer = null;
		if (this.status !== 'idle') this.#replica.clearHighlights();
		this.status = 'idle';
		this.steps = [];
		this.index = 0;
	}

	/** Moves past every step whose screen is showing (the furthest one wins: a shortcut counts). */
	#check(): void {
		if (this.status !== 'running') return;
		const shows = this.#read();
		for (let i = this.steps.length - 1; i >= this.index; i--) {
			if (this.steps[i].screen === shows) {
				this.#advanceTo(i + 1);
				return;
			}
		}
		if (this.index === 0) this.#mark();
	}

	#advanceTo(index: number): void {
		this.index = Math.min(index, this.steps.length);
		if (this.index < this.steps.length) {
			this.#mark();
			return;
		}
		this.#stopObserving?.();
		this.#stopObserving = null;
		this.#replica.clearHighlights();
		this.status = 'done';
		this.#doneTimer = this.#timers.setTimeout(() => {
			this.#doneTimer = null;
			this.stop();
		}, GUIDE_DONE_MS);
	}

	/** Lights the current step's controls as the agent's demonstration would, without playing it. */
	#mark(): void {
		this.#replica.clearHighlights();
		const step = this.current;
		if (!step) return;
		const parsed = tryParseKeys(step.keys);
		if (!parsed.ok) return;
		const direction = (step.clicks ?? 0) < 0 ? -1 : 1;
		const plan = planAnimation(parsed.value, { direction, turnSteps: 1 });
		for (const s of plan.steps) {
			if (s.kind === 'highlight') this.#replica.setHighlight(s.id, s.highlight);
			else if (s.kind === 'hint' && s.direction !== 0) {
				this.#replica.setTurnHint(s.id as TurnableId, s.direction);
			}
		}
	}
}

const [getGuide, setGuide] = createContext<ReplicaGuide>();

/** Makes the walkthrough available to every component below (root layout). */
export function setReplicaGuide(guide: ReplicaGuide): ReplicaGuide {
	return setGuide(guide);
}

/** The app's walkthrough, or null outside the app shell. */
export function getReplicaGuide(): ReplicaGuide | null {
	try {
		return getGuide();
	} catch {
		return null;
	}
}
