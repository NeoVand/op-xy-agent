/**
 * A fake {@link ScreenCtx} that records every call instead of drawing, for Node tests: assert on
 * what was painted (fills per colour, text runs via glyph fills, icon paths) and snapshot a compact
 * log. Coordinates are rounded to 0.01 px so snapshots stay stable.
 */
import type { ScreenCtx } from './context';

/** One recorded operation. */
export interface RecordedOp {
	readonly op: string;
	readonly args: readonly (number | string | boolean)[];
	/** Paint state at the time of a fill/stroke. */
	readonly style?: string;
	readonly alpha?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A recording context plus helpers. */
export class RecordingContext implements ScreenCtx {
	fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
	strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
	lineWidth = 1;
	lineCap: CanvasLineCap = 'butt';
	lineJoin: CanvasLineJoin = 'miter';
	globalAlpha = 1;
	font = '10px sans-serif';
	textAlign: CanvasTextAlign = 'start';
	textBaseline: CanvasTextBaseline = 'alphabetic';
	readonly ops: RecordedOp[] = [];
	#stack: { fill: unknown; stroke: unknown; alpha: number; width: number }[] = [];
	/** Points of the current path (for bounding boxes of fills). */
	#path: [number, number][] = [];
	/** Bounding boxes of every fill: colour, alpha and box. */
	readonly fills: {
		color: string;
		alpha: number;
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	}[] = [];

	#log(op: string, ...args: (number | string | boolean)[]): void {
		this.ops.push({ op, args: args.map((a) => (typeof a === 'number' ? r2(a) : a)) });
	}

	save(): void {
		this.#stack.push({
			fill: this.fillStyle,
			stroke: this.strokeStyle,
			alpha: this.globalAlpha,
			width: this.lineWidth
		});
		this.#log('save');
	}
	restore(): void {
		const s = this.#stack.pop();
		if (s) {
			this.fillStyle = s.fill as string;
			this.strokeStyle = s.stroke as string;
			this.globalAlpha = s.alpha;
			this.lineWidth = s.width;
		}
		this.#log('restore');
	}
	translate(x: number, y: number): void {
		this.#log('translate', x, y);
	}
	scale(x: number, y: number): void {
		this.#log('scale', x, y);
	}
	rotate(a: number): void {
		this.#log('rotate', a);
	}
	beginPath(): void {
		this.#path = [];
		this.#log('beginPath');
	}
	closePath(): void {
		this.#log('closePath');
	}
	moveTo(x: number, y: number): void {
		this.#path.push([x, y]);
		this.#log('moveTo', x, y);
	}
	lineTo(x: number, y: number): void {
		this.#path.push([x, y]);
		this.#log('lineTo', x, y);
	}
	bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void {
		this.#path.push([x, y]);
		this.#log('bezierCurveTo', a, b, c, d, x, y);
	}
	quadraticCurveTo(a: number, b: number, x: number, y: number): void {
		this.#path.push([x, y]);
		this.#log('quadraticCurveTo', a, b, x, y);
	}
	arc(x: number, y: number, r: number, s: number, e: number, ccw = false): void {
		this.#path.push([x - r, y - r], [x + r, y + r]);
		this.#log('arc', x, y, r, s, e, ccw);
	}
	rect(x: number, y: number, w: number, h: number): void {
		this.#path.push([x, y], [x + w, y + h]);
		this.#log('rect', x, y, w, h);
	}
	fill(rule: CanvasFillRule = 'nonzero'): void {
		this.#recordFill();
		this.ops.push({
			op: 'fill',
			args: [rule],
			style: String(this.fillStyle),
			alpha: this.globalAlpha
		});
	}
	stroke(): void {
		this.ops.push({
			op: 'stroke',
			args: [r2(this.lineWidth)],
			style: String(this.strokeStyle),
			alpha: this.globalAlpha
		});
	}
	clip(rule: CanvasFillRule = 'nonzero'): void {
		this.#log('clip', rule);
	}
	fillRect(x: number, y: number, w: number, h: number): void {
		this.fills.push({
			color: String(this.fillStyle),
			alpha: this.globalAlpha,
			x0: r2(x),
			y0: r2(y),
			x1: r2(x + w),
			y1: r2(y + h)
		});
		this.ops.push({
			op: 'fillRect',
			args: [x, y, w, h].map(r2),
			style: String(this.fillStyle),
			alpha: this.globalAlpha
		});
	}
	strokeRect(x: number, y: number, w: number, h: number): void {
		this.ops.push({
			op: 'strokeRect',
			args: [x, y, w, h].map(r2),
			style: String(this.strokeStyle)
		});
	}
	setLineDash(segments: number[]): void {
		this.#log('setLineDash', segments.join(','));
	}
	fillText(text: string, x: number, y: number): void {
		this.ops.push({ op: 'fillText', args: [text, r2(x), r2(y)], style: String(this.fillStyle) });
	}

	#recordFill(): void {
		if (this.#path.length === 0) return;
		const xs = this.#path.map((p) => p[0]);
		const ys = this.#path.map((p) => p[1]);
		this.fills.push({
			color: String(this.fillStyle),
			alpha: this.globalAlpha,
			x0: r2(Math.min(...xs)),
			y0: r2(Math.min(...ys)),
			x1: r2(Math.max(...xs)),
			y1: r2(Math.max(...ys))
		});
	}

	/** Every fill (fillRect or fill) of one colour. */
	fillsOf(color: string) {
		return this.fills.filter((f) => f.color.toLowerCase() === color.toLowerCase());
	}

	/** Count of each operation, e.g. `{ fill: 120, stroke: 14 }`. */
	summary(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const op of this.ops) out[op.op] = (out[op.op] ?? 0) + 1;
		return out;
	}
}
