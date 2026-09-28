/**
 * The punch-in processor's sound work for one track's channel, in plain TypeScript (it runs in Node
 * for the tests and in the worklet, `worklet.ts`): the effects that act on the sound itself rather
 * than on notes (research 60 §6):
 *
 * - `mute`: the track falls silent;
 * - `stutter` (melodic): every sixteenth starts over at 1/12, 1/6, 1/3 and 1/2 of the step, replaying
 *   the step from its start, and falls silent from 7/12 of the step to the next;
 * - `chop` (percussion): every sixteenth lets its first {@link CHOP_SECONDS} through, in mono;
 * - `sweep` (melodic pan): the sound swings across the stereo field.
 *
 * Effects hold over spans of frames (from … to, the end open while a key is held), so the sequencer
 * can schedule them ahead and a key let go early simply ends its span. Every change glides a few
 * milliseconds so nothing clicks: gates and the mute ramp, a restart crossfades from where it was.
 */
import { CHOP_SECONDS, PAN_SWEEP, STUTTER_GATE, STUTTER_RESTARTS } from './effects';

/** What the core can do. */
export type CoreEffect = 'mute' | 'stutter' | 'chop' | 'sweep';

/** An effect holding from frame `from` until frame `to` (Infinity while its key is held). */
export interface CoreSpan {
	readonly id: number;
	readonly effect: CoreEffect;
	readonly from: number;
	readonly to: number;
}

/** The sequencer's sixteenths: the frame one starts at, and how many frames each lasts. */
export interface CoreGrid {
	readonly origin: number;
	readonly step: number;
}

/** Seconds the stutter's and the chop's gates ramp over. */
const GATE_SECONDS = 0.003;
/** Seconds the mute ramps over. */
const MUTE_SECONDS = 0.005;
/** Seconds a restart crossfades over (from the old reading position to the step's start). */
const FADE_SECONDS = 0.003;
/** Time constant of the sweep's depth as it comes in and goes (s). */
const SWEEP_SECONDS = 0.03;
/** Seconds of sound kept for restarts: half a step at 20 BPM, with room to spare. */
const RING_SECONDS = 1;

/** Which effects hold over a stretch of frames. */
interface Holding {
	mute: boolean;
	stutter: boolean;
	chop: boolean;
	sweep: boolean;
}

/** One track's punch-in sound effects. */
export class PunchCore {
	readonly sampleRate: number;
	readonly #ringL: Float32Array;
	readonly #ringR: Float32Array;
	#spans: CoreSpan[] = [];
	#grids: (CoreGrid & { readonly at: number })[] = [];
	#grid: CoreGrid;
	/** The stutter's restarts, in frames into the step (for the grid in force). */
	#restarts: number[] = [];
	/** Where the gate, the mute, the mono blend and the sweep's depth are now. */
	#gate = 1;
	#mute = 1;
	#mono = 0;
	#depth = 0;
	/** How far behind the input the output reads (frames), the reading it fades from, and how far. */
	#tap = 0;
	#from = 0;
	#fade = 0;
	readonly #gateStep: number;
	readonly #muteStep: number;
	readonly #fadeStep: number;
	readonly #sweepCoef: number;
	readonly #chop: number;

	constructor(sampleRate: number) {
		this.sampleRate = sampleRate;
		const size = Math.ceil(RING_SECONDS * sampleRate);
		this.#ringL = new Float32Array(size);
		this.#ringR = new Float32Array(size);
		this.#gateStep = 1 / Math.max(1, GATE_SECONDS * sampleRate);
		this.#muteStep = 1 / Math.max(1, MUTE_SECONDS * sampleRate);
		this.#fadeStep = 1 / Math.max(1, FADE_SECONDS * sampleRate);
		this.#sweepCoef = 1 - Math.exp(-1 / (SWEEP_SECONDS * sampleRate));
		this.#chop = CHOP_SECONDS * sampleRate;
		// until the sequencer says otherwise: sixteenths at 120 BPM from frame 0
		this.#grid = { origin: 0, step: 0.125 * sampleRate };
		this.#restarts = this.#restartsFor(this.#grid.step);
	}

	/** Adds an effect span (the sequencer's, ahead of time, or a key's, open-ended). */
	add(span: CoreSpan): void {
		this.#spans.push(span);
	}

	/** Ends span `id` at frame `at` (a key let go, the transport stopped). */
	end(id: number, at: number): void {
		this.#spans = this.#spans.map((s) => (s.id === id ? { ...s, to: Math.min(s.to, at) } : s));
	}

	/** Every effect stops (sound switched off); what sounds glides back as usual. */
	clear(): void {
		this.#spans = [];
	}

	/** From frame `at` the sixteenths start at `grid.origin`, `grid.step` frames apart. */
	setGrid(at: number, grid: CoreGrid): void {
		if (!(grid.step > 0)) return;
		this.#grids.push({ origin: grid.origin, step: grid.step, at });
		this.#grids.sort((a, b) => a.at - b.at);
	}

	/** Effect spans still to finish (for tests and bookkeeping). */
	get spans(): number {
		return this.#spans.length;
	}

	/**
	 * Processes `n` frames starting at frame `start`: `inL`/`inR` in, `outL`/`outR` out (the same
	 * arrays will do).
	 */
	process(
		inL: Float32Array,
		inR: Float32Array,
		outL: Float32Array,
		outR: Float32Array,
		start: number,
		n: number
	): void {
		this.#spans = this.#spans.filter((s) => s.to > start);
		let i = 0;
		while (i < n) {
			const frame = start + i;
			while (this.#grids.length > 0 && this.#grids[0].at <= frame) {
				const g = this.#grids.shift()!;
				this.#grid = { origin: g.origin, step: g.step };
				this.#restarts = this.#restartsFor(g.step);
			}
			// the effects holding now, and the next frame where that may change
			const on: Holding = { mute: false, stutter: false, chop: false, sweep: false };
			let until = start + n;
			for (const s of this.#spans) {
				if (s.from > frame) until = Math.min(until, s.from);
				else if (s.to > frame) {
					until = Math.min(until, s.to);
					on[s.effect] = true;
				}
			}
			if (this.#grids.length > 0) until = Math.min(until, this.#grids[0].at);
			const end = Math.min(n, Math.max(i + 1, Math.ceil(until - start)));
			if (this.#resting(on)) this.#pass(inL, inR, outL, outR, start, i, end);
			else this.#run(inL, inR, outL, outR, start, i, end, on);
			i = end;
		}
	}

	#restartsFor(step: number): number[] {
		return STUTTER_RESTARTS.map((r) => Math.round(r * step));
	}

	/** Nothing holds and nothing is still gliding back: the sound passes as it is. */
	#resting(on: Holding): boolean {
		return (
			!on.mute &&
			!on.stutter &&
			!on.chop &&
			!on.sweep &&
			this.#gate === 1 &&
			this.#mute === 1 &&
			this.#mono === 0 &&
			this.#depth === 0 &&
			this.#tap === 0 &&
			this.#fade === 0
		);
	}

	/** Keeps the ring filled (a stutter may start mid-step) and passes the sound through. */
	#pass(
		inL: Float32Array,
		inR: Float32Array,
		outL: Float32Array,
		outR: Float32Array,
		start: number,
		from: number,
		to: number
	): void {
		const size = this.#ringL.length;
		for (let j = from; j < to; j++) {
			const w = (start + j) % size;
			this.#ringL[w] = inL[j];
			this.#ringR[w] = inR[j];
			outL[j] = inL[j];
			outR[j] = inR[j];
		}
	}

	#run(
		inL: Float32Array,
		inR: Float32Array,
		outL: Float32Array,
		outR: Float32Array,
		start: number,
		from: number,
		to: number,
		on: Holding
	): void {
		const ringL = this.#ringL;
		const ringR = this.#ringR;
		const size = ringL.length;
		const { origin, step } = this.#grid;
		const gateAt = STUTTER_GATE * step;
		const restarts = this.#restarts;
		// a restart reaches back no further than the ring holds
		const reach = size - 2;
		const period = PAN_SWEEP.beats * 4 * step;
		const depthTarget = on.sweep ? PAN_SWEEP.depth : 0;
		const monoTarget = on.chop ? 1 : 0;
		const muteTarget = on.mute ? 0 : 1;
		for (let j = from; j < to; j++) {
			const frame = start + j;
			const w = frame % size;
			ringL[w] = inL[j];
			ringR[w] = inR[j];
			// where this frame falls in its sixteenth
			const pos = frame - origin;
			const u = ((pos % step) + step) % step;
			let tap = 0;
			let gate = 1;
			if (on.stutter) {
				// read from the latest restart the step has passed: the step's start again
				for (const r of restarts) if (u >= r) tap = r;
				if (u >= gateAt) gate = 0;
			} else if (on.chop && u >= this.#chop) gate = 0;
			if (tap > reach) tap = reach;
			if (tap !== this.#tap) {
				this.#from = this.#tap;
				this.#tap = tap;
				this.#fade = 1;
			}
			this.#gate = toward(this.#gate, gate, this.#gateStep);
			this.#mono = toward(this.#mono, monoTarget, this.#gateStep);
			this.#mute = toward(this.#mute, muteTarget, this.#muteStep);
			this.#depth += (depthTarget - this.#depth) * this.#sweepCoef;
			if (depthTarget === 0 && this.#depth < 1e-5) this.#depth = 0;
			let l: number;
			let r: number;
			if (this.#tap === 0 && this.#fade === 0) {
				l = inL[j];
				r = inR[j];
			} else {
				const a = (frame - this.#tap + 2 * size) % size;
				l = ringL[a];
				r = ringR[a];
				if (this.#fade > 0) {
					const b = (frame - this.#from + 2 * size) % size;
					const f = this.#fade;
					l = l * (1 - f) + ringL[b] * f;
					r = r * (1 - f) + ringR[b] * f;
					this.#fade = Math.max(0, f - this.#fadeStep);
				}
			}
			if (this.#mono > 0) {
				const m = (l + r) / 2;
				l += (m - l) * this.#mono;
				r += (m - r) * this.#mono;
			}
			if (this.#depth > 0) {
				// leftwards first, with the stereo pan law of Web Audio's StereoPannerNode
				const p = -this.#depth * Math.sin((2 * Math.PI * pos) / period);
				if (p <= 0) {
					const x = ((p + 1) * Math.PI) / 2;
					const left = l + r * Math.cos(x);
					r *= Math.sin(x);
					l = left;
				} else {
					const x = (p * Math.PI) / 2;
					const right = r + l * Math.sin(x);
					l *= Math.cos(x);
					r = right;
				}
			}
			const g = this.#gate * this.#mute;
			outL[j] = l * g;
			outR[j] = r * g;
		}
	}
}

/** `value` moved toward `target` by at most `step`. */
const toward = (value: number, target: number, step: number): number =>
	value < target ? Math.min(target, value + step) : Math.max(target, value - step);
