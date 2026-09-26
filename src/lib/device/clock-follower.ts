/**
 * Estimates tempo from incoming MIDI clock (F8, 24 per quarter note).
 *
 * With COM → clock set to "both", the OP-XY sends F8 continuously, even while stopped
 * (docs/research/90-device-probe.md: 960 ticks in 20 s = 120.0 BPM). Browsers deliver MIDI events
 * with accurate timestamps but occasionally in bursts, so instead of averaging neighbouring
 * intervals (which a single late event skews) this fits a least-squares line through the last
 * `window` tick times: the slope is milliseconds per tick (the approach stem-extractor uses,
 * docs/research/20-midi-control.md §5). A gap longer than `gapMs` means the clock stopped; the
 * estimate starts over.
 */

/** MIDI clock ticks per quarter note. */
export const CLOCK_PPQN = 24;

/** Options for `ClockFollower`. */
export interface ClockFollowerOptions {
	/** Intervals in the fit (default 48: two beats). */
	readonly window?: number;
	/** Intervals needed before reporting a tempo (default 12: half a beat). */
	readonly minIntervals?: number;
	/** A longer pause resets the estimate (default 250 ms; 40 BPM ticks every 62.5 ms). */
	readonly gapMs?: number;
}

/** Follows an F8 stream; plain state, time passed in. */
export class ClockFollower {
	readonly window: number;
	readonly minIntervals: number;
	readonly gapMs: number;
	#times: number[] = [];

	constructor(options: ClockFollowerOptions = {}) {
		this.window = options.window ?? 48;
		this.minIntervals = options.minIntervals ?? 12;
		this.gapMs = options.gapMs ?? 250;
	}

	/** Records one F8 received at `time` (ms). */
	tick(time: number): void {
		const last = this.#times[this.#times.length - 1];
		if (last !== undefined && (time - last > this.gapMs || time < last)) this.#times = [];
		this.#times.push(time);
		if (this.#times.length > this.window + 1) this.#times.shift();
	}

	/** Estimated BPM, or null until enough ticks arrived. */
	get bpm(): number | null {
		const n = this.#times.length;
		if (n - 1 < this.minIntervals) return null;
		const meanX = (n - 1) / 2;
		let meanY = 0;
		for (const t of this.#times) meanY += t;
		meanY /= n;
		let num = 0;
		let den = 0;
		for (let i = 0; i < n; i++) {
			const dx = i - meanX;
			num += dx * (this.#times[i] - meanY);
			den += dx * dx;
		}
		const msPerTick = num / den;
		return msPerTick > 0 ? 60_000 / (msPerTick * CLOCK_PPQN) : null;
	}

	/** Ticks currently in the window. */
	get samples(): number {
		return this.#times.length;
	}

	/** Forgets the stream. */
	reset(): void {
		this.#times = [];
	}
}
