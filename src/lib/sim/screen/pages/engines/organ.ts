/**
 * organ's M1 page as the device draws it (camera, OS 1.1.33: the CC sweeps steps-142…183 and
 * b1-1661…1767; docs/research/59-screen-profiling.md §2.5). There is no top bar: four drawbars
 * hang from the top edge, one per encoder, each a slot of two rails, a bar with the stops 8…1 and a
 * cap in its encoder's shade carrying the parameter's pictogram (TE's, from the guide's organ art).
 * A drawbar is pulled down as far as its value:
 *
 * - type (E1) stops at its eight types, one stop (20 px) per type, the first already one stop out;
 * - bass, tremolo amount and tremolo speed (E2–E4) slide continuously over the eight stops, the cap
 *   160 px lower at full than at 0 (within 0.3 px on amount and speed; bass was caught creeping,
 *   see the note in 59 §2.5).
 */
import type { ScreenCtx } from '../../context';
import { fillBox, line, roundRectPath, text } from '../../draw';
import type { SynthFrame } from '../../frame';
import { icon } from '../../icons';
import { compiled, tracePath } from '../../paths';
import { COLORS } from '../../palette';
import { unit } from './common';

/** The measured layout (design px). */
export const ORGAN = {
	/** The drawbars' middles. */
	columns: [60, 180, 300, 420],
	/** The cap: size, radius; its top at 0 and how far it travels to full. */
	cap: { w: 50, h: 35, r: 5, top: 4.6, travel: 160 },
	/** type's cap stands one stop out at the first type and moves a stop per type. */
	stop: 20,
	types: 8,
	/** Stop digits: size, and the lowest one's baseline above the cap's top. */
	digits: { size: 20, above: 5 },
	/** The slot's rails and the bar's edges, either side of the middle. */
	rails: { slot: 12.5, bar: 10 }
} as const;

/** Where each drawbar's cap top sits for the four lanes. */
export function organCaps(params: readonly number[]): number[] {
	const c = ORGAN.cap;
	return ORGAN.columns.map((_, i) => {
		const v = unit(params[i]);
		if (i > 0) return c.top + c.travel * v;
		const type = Math.min(ORGAN.types - 1, Math.floor(v * ORGAN.types));
		return c.top + ORGAN.stop * (type + 1);
	});
}

/** Each cap's fill (the encoder's shade: the first is hollow) and the colour drawn on it. */
const CAP_FILL = [COLORS.black, COLORS.grey1, COLORS.grey4, COLORS.white] as const;
const CAP_INK = [COLORS.white, COLORS.white, COLORS.ink, COLORS.ink] as const;

/**
 * TE's pictograms from the guide's organ art (`engine.organ`), by cap: the shapes, drawn relative
 * to that art's own cap (its top at y 165, the art placed 30 px in).
 */
const PICTOGRAMS: readonly (readonly number[])[] = [
	[31, 32],
	[19, 20, 21],
	[22, 23, 24, 25, 26, 27, 28],
	[29]
];
const ART = { x: 30, capTop: 165 } as const;

function pictogram(ctx: ScreenCtx, cap: number, top: number): void {
	const shapes = icon('engine.organ').shapes;
	const color = CAP_INK[cap];
	for (const index of PICTOGRAMS[cap]) {
		const shape = shapes[index];
		if (!shape) continue;
		ctx.beginPath();
		tracePath(ctx, compiled(shape.d), ART.x, top - ART.capTop, 1);
		if (shape.fill) {
			ctx.fillStyle = color;
			ctx.fill();
		}
		// the art's hairline outlines around filled glyphs are dropped; its strokes are kept
		if (shape.stroke && (!shape.fill || (shape.width ?? 1) > 0.3)) {
			ctx.strokeStyle = color;
			ctx.lineWidth = shape.width ?? 1;
			ctx.lineCap = (shape.cap as CanvasLineCap | undefined) ?? 'butt';
			ctx.stroke();
		}
	}
}

/** One drawbar: rails and bar down to the cap, the stops above it, the cap. */
function drawbar(ctx: ScreenCtx, i: number, top: number): void {
	const x = ORGAN.columns[i];
	const { slot, bar } = ORGAN.rails;
	// fine lines, as TE drew them, but bright: the slot's pair white, the bar's edges light grey
	// (camera peaks 157 and 129 against 254 for white areas)
	line(ctx, x - slot, 0, x - slot, top, COLORS.white, 0.75);
	line(ctx, x + slot, 0, x + slot, top, COLORS.white, 0.75);
	line(ctx, x - bar, 0, x - bar, top, COLORS.light, 0.75);
	line(ctx, x + bar, 0, x + bar, top, COLORS.light, 0.75);
	const d = ORGAN.digits;
	for (let n = 1; n <= 8; n++) {
		const baseline = top - d.above - ORGAN.stop * (n - 1);
		if (baseline < 0) break;
		text(ctx, String(n), x, baseline, d.size, COLORS.white, 'center');
	}
	const c = ORGAN.cap;
	fillBox(ctx, x - c.w / 2, top, c.w, c.h, CAP_FILL[i], c.r);
	if (i === 0) {
		ctx.strokeStyle = COLORS.light;
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		roundRectPath(ctx, x - c.w / 2 + 0.75, top + 0.75, c.w - 1.5, c.h - 1.5, c.r - 0.75);
		ctx.stroke();
	}
	pictogram(ctx, i, top);
}

/** Draws organ's page (it has no top bar): the drawbars where they are on their way to the values. */
export function drawOrgan(ctx: ScreenCtx, frame: SynthFrame): void {
	organCaps(frame.shown ?? frame.params).forEach((top, i) => drawbar(ctx, i, top));
}
