/**
 * The walkthrough in the eval's Node environment (the episodes eval, `episodes.ts`): the app's own
 * `ReplicaGuide` (`$lib/app/guide.svelte.ts`) on the eval's replica, reading the screen as the root
 * layout wires it (the simulator's frame, described). So a step counts as done exactly as it does in
 * the browser: when the replica's screen shows what the step leads to, after any input, the
 * furthest such step winning (a shortcut skips ahead) and a turn past the value waiting until it
 * comes back; and the step to do is lit with the same marks and turn hints. Nothing is copied from
 * it, so it cannot drift from what users get.
 *
 * Around it, what the eval reads: the card under the replica in words (what `GuideCard.svelte`
 * draws), and a log of the walkthroughs the agent started and how far the user's hands took them.
 */
import type { GuideHost } from '$lib/agent/tools';
import { ReplicaGuide, type GuideStep } from '$lib/app/guide.svelte';
import type { ReplicaState, Timers } from '$lib/replica';

/** Something that happened to a walkthrough. */
export interface WalkthroughEvent {
	/** started by the agent; a step (or several) done; all done; ended before the end. */
	readonly kind: 'start' | 'step' | 'done' | 'stop';
	readonly goal: string;
	/** The step to do next (the steps' count once all are done). */
	readonly index: number;
	readonly steps: number;
	/** Seconds since the host was made. */
	readonly at: number;
}

/** Options for {@link EvalWalkthrough}. */
export interface EvalWalkthroughOptions {
	readonly replica: ReplicaState;
	/** What the replica's screen shows now, in the simulator's words. */
	readonly read: () => string;
	/** The walkthrough's timers (the "done" card's linger); default: the global ones. */
	readonly timers?: Timers;
	/** Milliseconds clock for the log (default `performance.now`). */
	readonly now?: () => number;
}

const GLOBAL_TIMERS: Timers = {
	setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as Parameters<typeof clearTimeout>[0])
};

/** The walkthrough host for the eval's conductor: the app's walkthrough, with a card and a log. */
export class EvalWalkthrough implements GuideHost {
	/** The app's walkthrough itself. */
	readonly guide: ReplicaGuide;
	/** Every walkthrough started, each step the user got through, and how each ended. */
	readonly log: WalkthroughEvent[] = [];
	readonly #now: () => number;
	readonly #born: number;
	/** Where the walkthrough stood when the log last looked. */
	#seen: { index: number; status: ReplicaGuide['status'] } = { index: 0, status: 'idle' };

	constructor(options: EvalWalkthroughOptions) {
		this.guide = new ReplicaGuide({
			replica: options.replica,
			read: options.read,
			timers: options.timers ?? GLOBAL_TIMERS
		});
		this.#now = options.now ?? (() => performance.now());
		this.#born = this.#now();
	}

	start(goal: string, steps: readonly GuideStep[]): void {
		this.update();
		this.guide.start(goal, steps);
		this.#push('start', 0);
		// steps already done on screen are passed at once: logged as the user's first steps
		this.#seen = { index: 0, status: 'running' };
		this.update();
	}

	stop(): void {
		this.update();
		if (this.guide.status === 'running') this.#push('stop');
		this.guide.stop();
		this.#seen = { index: 0, status: 'idle' };
	}

	/**
	 * Logs how far the walkthrough moved since it last looked (steps done, or all of them); call it
	 * once the user's input has settled. Returns what it logged.
	 */
	update(): WalkthroughEvent[] {
		const { index, status } = this.guide;
		const logged: WalkthroughEvent[] = [];
		if (status === 'running' && index > this.#seen.index) logged.push(this.#push('step'));
		if (status === 'done' && this.#seen.status === 'running') logged.push(this.#push('done'));
		this.#seen = { index, status };
		return logged;
	}

	/** The card under the replica, in words, or null while no walkthrough shows. */
	card(): string | null {
		const g = this.guide;
		const step = g.current;
		if (g.status === 'running' && step) {
			const clicks = step.clicks ?? 0;
			const turn = clicks
				? `, ${Math.abs(clicks)} ${Math.abs(clicks) === 1 ? 'detent' : 'detents'} ${clicks > 0 ? 'clockwise' : 'counter-clockwise'}`
				: '';
			return `walkthrough card ${g.index + 1}/${g.steps.length}: ${step.keys}${turn} → the screen will show "${step.screen}"`;
		}
		if (g.status === 'done') return `walkthrough card: done: ${g.goal}`;
		return null;
	}

	#push(kind: WalkthroughEvent['kind'], index = this.guide.index): WalkthroughEvent {
		const g = this.guide;
		const event: WalkthroughEvent = {
			kind,
			goal: g.goal,
			index,
			steps: g.steps.length,
			at: Math.round(this.#now() - this.#born) / 1000
		};
		this.log.push(event);
		return event;
	}
}
