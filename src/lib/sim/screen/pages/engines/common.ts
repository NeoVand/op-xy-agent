/**
 * What every engine picture shares: the parameters as 0–1 lanes, the motion clock, and small
 * helpers (easing, a repeatable hash for pictures that scatter, a line fading along its length).
 * Measured geometry lives with each engine (`prism.ts`, `organ.ts` …); the dispatcher is
 * `../synth.ts`. Research: docs/research/59-screen-profiling.md §2.5.
 */
import type { ScreenCtx } from '../../context';
import type { SynthFrame } from '../../frame';

/** A lane as 0–1, whatever the frame carried. */
export const unit = (v: number | undefined): number => Math.max(0, Math.min(1, v ?? 0));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth in and out over 0–1 (no hard steps: the owner's rule for motion). */
export const ease = (t: number): number => {
	const u = unit(t);
	return u * u * (3 - 2 * u);
};

/**
 * What moves a picture: the clock (ms) and the notes sounding on the track (`../../../motion.ts`).
 * The screen's own animation step stands in for the clock when the frame carries none (a step is
 * 125 ms at 120 BPM).
 */
export interface Motion {
	/** Milliseconds, for smooth motion. */
	readonly time: number;
	/** Notes sounding on the track now. */
	readonly notes: number;
	/** Milliseconds since the latest note began, or null when unknown. */
	readonly onset: number | null;
	/** Milliseconds since the last note stopped (while none sounds), or null when long past. */
	readonly release: number | null;
	/** Milliseconds of sounding: what the sound pushes along moves with this. */
	readonly travel: number;
}

/** Milliseconds per animation step when only the render tick is known. */
export const TICK_MS = 125;

/** The motion a frame carries (or the tick's, for callers that give only that). */
export function motionOf(frame: SynthFrame, tick = 0): Motion {
	const time = frame.time ?? tick * TICK_MS;
	return {
		time,
		notes: frame.notes ?? 0,
		onset: frame.onset ?? null,
		release: frame.release ?? null,
		travel: frame.travel ?? time
	};
}

/** A repeatable pseudo-random value in [0, 1) for integer coordinates (pictures that scatter). */
export function hash(a: number, b = 0, c = 0): number {
	let h =
		Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** A polyline stroked in one go. */
export function polyline(
	ctx: ScreenCtx,
	points: readonly (readonly [number, number])[],
	color: string,
	width: number,
	cap: CanvasLineCap = 'butt',
	join: CanvasLineJoin = 'miter'
): void {
	if (points.length < 2) return;
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = cap;
	ctx.lineJoin = join;
	ctx.beginPath();
	ctx.moveTo(points[0][0], points[0][1]);
	for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
	ctx.stroke();
}

/**
 * A straight line whose opacity falls from 1 to 0 between `fadeFrom` and `fadeTo` along x, drawn
 * in short pieces (the screen context has no gradients).
 */
export function fadingLine(
	ctx: ScreenCtx,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	fadeFrom: number,
	fadeTo: number,
	color: string,
	width: number,
	pieces = 8
): void {
	const at = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
	const solidEnd = Math.min(x1, fadeFrom);
	if (solidEnd > x0)
		polyline(ctx, [[x0, y0] as const, [solidEnd, at(solidEnd)] as const], color, width);
	const from = Math.max(x0, fadeFrom);
	const to = Math.min(x1, fadeTo);
	if (to <= from) return;
	const step = (to - from) / pieces;
	ctx.save();
	const alpha = ctx.globalAlpha;
	for (let i = 0; i < pieces; i++) {
		const a = from + step * i;
		const b = a + step;
		ctx.globalAlpha = alpha * (1 - (i + 0.5) / pieces);
		polyline(ctx, [[a, at(a)] as const, [b, at(b)] as const], color, width);
	}
	ctx.restore();
}
