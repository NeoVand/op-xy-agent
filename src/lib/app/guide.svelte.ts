/**
 * A walkthrough on the replica (Phase F4): the agent plans the steps to a page or a value
 * (`plan_steps` with `guide`), or rehearses any key sequence (`show_on_replica` with `guide`:
 * a drum key, then the steps it goes on), and the replica lights one step at a time, with a turn
 * arrow for encoders, until the user has done it. A step counts as done when the replica's screen
 * shows what that step leads to, and its music too where the step says so (a press on a step key
 * changes the pattern, not the screen), so any way of getting there works (a shortcut skips
 * ahead) and a turn past the value waits until it comes back. Nothing is sent anywhere: the
 * user's own presses on the replica move its simulator, as always.
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
	/** The replica's music once the step is done (`musicMark`), where the screen alone cannot tell. */
	readonly music?: string;
	/** Done once the screen no longer reads this (a turn with no value to reach: any change). */
	readonly leave?: string;
}

export type GuideStatus = 'idle' | 'running' | 'done';

export interface ReplicaGuideOptions {
	readonly replica: ReplicaState;
	/** What the replica's screen shows now, in the simulator's words. */
	readonly read: () => string;
	/** The replica's music now (`musicMark`), for steps that change it. */
	readonly music?: () => string;
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
	readonly #music: (() => string) | null;
	readonly #timers: Timers;
	#stopObserving: (() => void) | null = null;
	#doneTimer: unknown = null;
	/** Who hears that a walkthrough is done (the agent follows up). */
	#doneListeners: ((goal: string, screen: string) => void)[] = [];

	constructor(options: ReplicaGuideOptions) {
		this.#replica = options.replica;
		this.#read = options.read;
		this.#music = options.music ?? null;
		this.#timers = options.timers;
	}

	/** The step to do now, or null. */
	get current(): GuideStep | null {
		return this.status === 'running' ? (this.steps[this.index] ?? null) : null;
	}

	/** Where the walkthrough stands, for the agent (it once could not tell how far the user got). */
	progress(): { goal: string; done: string[]; total: number; next: string | null } | null {
		if (this.status !== 'running') return null;
		return {
			goal: this.goal,
			done: this.steps.slice(0, this.index).map((s) => s.keys),
			total: this.steps.length,
			next: this.steps[this.index]?.keys ?? null
		};
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

	/**
	 * Calls `listener` whenever the user reaches a walkthrough's last step, with its goal and what
	 * the screen shows then. Returns the unsubscribe function.
	 */
	onDone(listener: (goal: string, screen: string) => void): () => void {
		this.#doneListeners.push(listener);
		return () => {
			this.#doneListeners = this.#doneListeners.filter((l) => l !== listener);
		};
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
		const music = this.#music?.() ?? null;
		const done = (step: GuideStep) =>
			step.screen === shows && (step.music === undefined || music === null || step.music === music);
		for (let i = this.steps.length - 1; i >= this.index; i--) {
			const step = this.steps[i];
			// a step done by leaving a reading counts only once it is the one to do
			if (step.leave !== undefined) {
				if (i === this.index && shows !== step.leave) {
					this.#advanceTo(i + 1);
					return;
				}
				continue;
			}
			if (done(step)) {
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
		const screen = this.#read();
		for (const listener of this.#doneListeners) listener(this.goal, screen);
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
