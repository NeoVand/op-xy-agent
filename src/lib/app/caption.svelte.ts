/**
 * The one hint the stage shows at a time, rate-limited so a curious user pressing every key gets
 * told once, not on every press: the newest hint replaces the current one, the same hint is not
 * shown again for a while (longer once the user dismissed it), repeating the hint that is up keeps
 * it up, and it goes away by itself unless the pointer or focus rests on it.
 */
import type { Clock, Timers } from '$lib/device';
import type { BridgeHint, HintKind } from './hints';

/** Options for {@link HintCaption}. */
export interface HintCaptionOptions {
	readonly clock: Clock;
	readonly timers: Timers;
	/** How long a hint stays up, in ms (default 7000). */
	readonly visibleMs?: number;
	/** After the user dismisses a hint, the same hint stays quiet this long, in ms (default 60 s). */
	readonly dismissedMs?: number;
	/** How long the same hint stays quiet after being shown, per kind, in ms. */
	readonly repeatMs?: Partial<Record<HintKind, number>>;
}

/** Default quiet time after a hint was shown, per kind (ms). */
export const HINT_REPEAT_MS: Readonly<Record<HintKind, number>> = {
	'not-remote': 10_000,
	combo: 6_000,
	offline: 30_000,
	'send-failed': 5_000
};

/** Reactive state of the stage's hint caption. */
export class HintCaption {
	/** The hint on show, or null. */
	current: BridgeHint | null = $state.raw(null);

	readonly #clock: Clock;
	readonly #timers: Timers;
	readonly #visibleMs: number;
	readonly #dismissedMs: number;
	readonly #repeatMs: Readonly<Record<HintKind, number>>;
	/** Hint key → the time before which it is not shown again (bookkeeping, never rendered). */
	readonly #quietUntil: Record<string, number> = Object.create(null);
	#timer: unknown = null;
	#held = false;

	constructor(options: HintCaptionOptions) {
		this.#clock = options.clock;
		this.#timers = options.timers;
		this.#visibleMs = options.visibleMs ?? 7000;
		this.#dismissedMs = options.dismissedMs ?? 60_000;
		this.#repeatMs = { ...HINT_REPEAT_MS, ...options.repeatMs };
	}

	/**
	 * Offers a hint. Returns true when it is now on show; false when the same hint was shown too
	 * recently (repeating the hint that is up keeps it up a little longer instead).
	 */
	show(hint: BridgeHint): boolean {
		if (this.current?.key === hint.key) {
			this.#arm();
			return false;
		}
		const now = this.#clock.now();
		const quiet = this.#quietUntil[hint.key];
		if (quiet !== undefined && now < quiet) return false;
		this.#quietUntil[hint.key] = now + this.#repeatMs[hint.kind];
		this.current = hint;
		this.#arm();
		return true;
	}

	/** The user closed the hint: hide it, and keep it quiet for longer. */
	dismiss(): void {
		const hint = this.current;
		if (!hint) return;
		this.#quietUntil[hint.key] = this.#clock.now() + this.#dismissedMs;
		this.#hide();
	}

	/**
	 * Pauses the auto-hide while the pointer or keyboard focus rests on the hint (true), and
	 * restarts it when they leave (false).
	 */
	hold(held: boolean): void {
		this.#held = held;
		if (held) this.#clear();
		else if (this.current) this.#arm();
	}

	/** Hides the hint and stops the timer (the page is going away). */
	dispose(): void {
		this.#hide();
	}

	#arm(): void {
		this.#clear();
		if (this.#held) return;
		this.#timer = this.#timers.setTimeout(() => {
			this.#timer = null;
			this.current = null;
		}, this.#visibleMs);
	}

	#hide(): void {
		this.#clear();
		this.current = null;
	}

	#clear(): void {
		if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
		this.#timer = null;
	}
}
