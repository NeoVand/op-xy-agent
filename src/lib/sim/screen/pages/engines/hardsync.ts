/**
 * hardsync's M1 picture as the device draws it (camera, OS 1.1.33: the CC sweeps steps-266…306 and
 * the 10 fps recording of the session; docs/research/59-screen-profiling.md §2.5): TE's hair dryer
 * from the guide, blowing a row of blocks, two dots for the sub and the lowcut's S-curve.
 *
 * - freq (E1) narrows the blocks: 99.5 px wide at 0, 35 at full (99.5 − 64.4·freq², within 1 px);
 * - sub (E2) fills the lower dot's ring from black to white;
 * - noise (E3) scatters the blocks up and down, over 18 px at full;
 * - lowcut (E4) slides the S-curve's rise right, 225 px over the range.
 *
 * The blocks stand still until notes sound; then they blow away from the dryer, fast at each note
 * and slower as it holds (about 890 px/s falling to 200, measured at 10 fps), each keeping its grey
 * and height, and new ones come out of the nozzle.
 */
import type { ScreenCtx } from '../../context';
import { disc, fillBox, line, ring } from '../../draw';
import type { SynthFrame } from '../../frame';
import { icon } from '../../icons';
import { compiled, tracePath } from '../../paths';
import { COLORS, RAMP } from '../../palette';
import { hash, motionOf, unit, type Motion } from './common';

/** The measured layout (design px). */
export const HARDSYNC = {
	/** The blocks: where the row starts, their top and height, width at freq 0 and its shrink. */
	blocks: { x: 213.5, top: 49.6, height: 35.6, width: 99.5, shrink: 64.4, scatter: 18, lift: 7 },
	/** Their speed (px per ms of sounding; `motion.ts` weighs each note's start more). */
	speed: 0.89,
	/** The sub's dots: the upper one grey, the lower one a ring filled by the sub. */
	dots: { x: 145.5, upper: 125.5, lower: 145.3, r: 5.6, ring: 1.5 },
	/** The S-curve: its ends, bottom and top, the rise's middle at lowcut 0 and its travel, half-width. */
	curve: {
		left: 144.3,
		right: 460.2,
		bottom: 190,
		top: 132.5,
		rise: 204.6,
		travel: 225.2,
		half: 30,
		corner: 4
	}
} as const;

/** The blocks' width for a freq lane. */
export const blockWidth = (freq: number): number =>
	HARDSYNC.blocks.width - HARDSYNC.blocks.shrink * unit(freq) ** 2;

/** The S-curve's rise (its middle, x) for a lowcut lane. */
export const riseX = (lowcut: number): number =>
	HARDSYNC.curve.rise + HARDSYNC.curve.travel * unit(lowcut);

/** The lower dot's fill for a sub lane: black to white, white from about 0.76 (fitted by eye to the camera). */
export function subFill(sub: number): number {
	return Math.round(247 * Math.min(1, unit(sub) / 0.76) ** 1.5);
}

const grey = (v: number) => {
	const h = Math.max(0, Math.min(255, Math.round(v)))
		.toString(16)
		.padStart(2, '0');
	return `#${h}${h}${h}`;
};

/** One visible block: its box and grey. */
export interface Block {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly color: string;
}

/** The blocks for freq and noise lanes, pushed along by `travel` (ms of sounding). */
export function hardsyncBlocks(freq: number, noise: number, travel: number): Block[] {
	const b = HARDSYNC.blocks;
	const w = blockWidth(freq);
	const shift = HARDSYNC.speed * travel;
	const first = Math.floor(-shift / w) - 1;
	const out: Block[] = [];
	for (let k = first; ; k++) {
		const x = b.x + shift + k * w;
		if (x >= 480) break;
		if (x + w <= b.x) continue;
		// each block keeps its own grey and height as it goes (the device's are random)
		const y = b.top + unit(noise) * (b.scatter * hash(k, 7) - b.lift);
		const color = RAMP[1 + Math.floor(hash(k, 3) * 7)];
		const left = Math.max(x, b.x);
		out.push({ x: left, y, w: x + w - left, color });
	}
	return out;
}

/**
 * TE's dryer from the guide art (its body, switch, nozzle, grille and cord), 10 px higher than the
 * guide's page places it. The device draws no fan blades: its air holes are three rings of grey
 * dots (12, 18 and 24 of them) round (95.2, 85.9), and the two dots on the handle are grey too.
 */
const DRYER = {
	shapes: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
	x: -1,
	y: 10.5,
	holes: {
		x: 95.2,
		y: 85.9,
		r: 1.4,
		rings: [
			[8.9, 12],
			[14.75, 18],
			[20.55, 24]
		]
	},
	handle: { y: 120.9, xs: [86.1, 102.3], r: 2.2 }
} as const;

function drawDryer(ctx: ScreenCtx): void {
	const shapes = icon('engine.hardsync').shapes;
	for (const index of DRYER.shapes) {
		const s = shapes[index];
		if (!s) continue;
		ctx.beginPath();
		tracePath(ctx, compiled(s.d), DRYER.x, DRYER.y, 1);
		if (s.fill) {
			ctx.fillStyle = s.fill;
			ctx.fill();
		}
		if (s.stroke) {
			ctx.strokeStyle = s.stroke;
			ctx.lineWidth = s.width ?? 1;
			ctx.lineCap = (s.cap as CanvasLineCap | undefined) ?? 'butt';
			ctx.stroke();
		}
	}
	const h = DRYER.holes;
	for (const [radius, count] of h.rings) {
		for (let i = 0; i < count; i++) {
			const a = (2 * Math.PI * i) / count;
			disc(ctx, h.x + radius * Math.cos(a), h.y + radius * Math.sin(a), h.r, COLORS.grey3);
		}
	}
	for (const x of DRYER.handle.xs) disc(ctx, x, DRYER.handle.y, DRYER.handle.r, COLORS.grey3);
}

function drawCurve(ctx: ScreenCtx, lowcut: number): void {
	const c = HARDSYNC.curve;
	const mid = riseX(lowcut);
	const x0 = mid - c.half;
	const x3 = Math.min(mid + c.half, c.right - c.corner);
	// the baseline under it, from end to end
	line(ctx, c.left, c.bottom, c.right, c.bottom, COLORS.grey2, 1);
	ctx.strokeStyle = COLORS.light;
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(c.left, c.bottom);
	ctx.lineTo(x0, c.bottom);
	ctx.bezierCurveTo(mid, c.bottom, mid, c.top, x3, c.top);
	ctx.lineTo(c.right - c.corner, c.top);
	ctx.quadraticCurveTo(c.right, c.top, c.right, c.top + c.corner);
	ctx.lineTo(c.right, c.bottom);
	ctx.stroke();
	for (const x of [c.left, c.right])
		fillBox(ctx, x - 2.75, c.bottom - 2.75, 5.5, 5.5, COLORS.light, 1.5);
}

function drawDots(ctx: ScreenCtx, sub: number): void {
	const d = HARDSYNC.dots;
	disc(ctx, d.x, d.upper, d.r, COLORS.grey4);
	disc(ctx, d.x, d.lower, d.r - d.ring, grey(subFill(sub)));
	ring(ctx, d.x, d.lower, d.r - d.ring / 2, COLORS.white, d.ring);
}

function drawBlocks(ctx: ScreenCtx, params: readonly number[], motion: Motion): void {
	const [freq, , noise] = params.map(unit);
	for (const b of hardsyncBlocks(freq, noise, motion.travel)) {
		fillBox(ctx, b.x, b.y, b.w, HARDSYNC.blocks.height, b.color);
	}
}

/** Draws hardsync's picture under the header. */
export function drawHardsync(ctx: ScreenCtx, frame: SynthFrame, tick = 0): void {
	const [, sub, , lowcut] = frame.params.map(unit);
	drawBlocks(ctx, frame.params, motionOf(frame, tick));
	drawDryer(ctx);
	drawDots(ctx, sub);
	drawCurve(ctx, lowcut);
}
