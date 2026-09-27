/**
 * A {@link ScreenCtx} that writes SVG instead of pixels: `frameToSvg(frame)` gives a standalone
 * 480 × 220 SVG of any screen, for visual checks against TE's art outside a browser, for docs, and
 * for anything that wants a vector snapshot of the screen (the agent, golden files).
 */
import type { ScreenCtx } from './context';
import type { ScreenFrame } from './frame';
import { FALLBACK_FAMILY } from './font';
import { SCREEN } from './palette';
import { renderFrame, type RenderOptions } from './render';

type Matrix = [number, number, number, number, number, number];

interface State {
	fill: string;
	stroke: string;
	width: number;
	alpha: number;
	cap: CanvasLineCap;
	join: CanvasLineJoin;
	font: string;
	m: Matrix;
	clips: string[];
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const escape = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Draws into an SVG document. */
export class SvgContext implements ScreenCtx {
	fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
	strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
	lineWidth = 1;
	lineCap: CanvasLineCap = 'butt';
	lineJoin: CanvasLineJoin = 'miter';
	globalAlpha = 1;
	font = '10px sans-serif';
	textAlign: CanvasTextAlign = 'start';
	textBaseline: CanvasTextBaseline = 'alphabetic';
	#m: Matrix = [1, 0, 0, 1, 0, 0];
	#clips: string[] = [];
	#stack: State[] = [];
	#d = '';
	#cx = 0;
	#cy = 0;
	#defs: string[] = [];
	#body: string[] = [];
	#nextClip = 0;

	#pt(x: number, y: number): [number, number] {
		const [a, b, c, d, e, f] = this.#m;
		return [a * x + c * y + e, b * x + d * y + f];
	}

	save(): void {
		this.#stack.push({
			fill: String(this.fillStyle),
			stroke: String(this.strokeStyle),
			width: this.lineWidth,
			alpha: this.globalAlpha,
			cap: this.lineCap,
			join: this.lineJoin,
			font: this.font,
			m: [...this.#m],
			clips: [...this.#clips]
		});
	}
	restore(): void {
		const s = this.#stack.pop();
		if (!s) return;
		this.fillStyle = s.fill;
		this.strokeStyle = s.stroke;
		this.lineWidth = s.width;
		this.globalAlpha = s.alpha;
		this.lineCap = s.cap;
		this.lineJoin = s.join;
		this.font = s.font;
		this.#m = s.m;
		this.#clips = s.clips;
	}
	#multiply(o: Matrix): void {
		const [a, b, c, d, e, f] = this.#m;
		this.#m = [
			a * o[0] + c * o[1],
			b * o[0] + d * o[1],
			a * o[2] + c * o[3],
			b * o[2] + d * o[3],
			a * o[4] + c * o[5] + e,
			b * o[4] + d * o[5] + f
		];
	}
	translate(x: number, y: number): void {
		this.#multiply([1, 0, 0, 1, x, y]);
	}
	scale(x: number, y: number): void {
		this.#multiply([x, 0, 0, y, 0, 0]);
	}
	rotate(a: number): void {
		this.#multiply([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
	}
	beginPath(): void {
		this.#d = '';
	}
	closePath(): void {
		this.#d += 'Z';
	}
	moveTo(x: number, y: number): void {
		const [px, py] = this.#pt(x, y);
		this.#d += `M${n(px)} ${n(py)}`;
		this.#cx = x;
		this.#cy = y;
	}
	lineTo(x: number, y: number): void {
		const [px, py] = this.#pt(x, y);
		this.#d += `L${n(px)} ${n(py)}`;
		this.#cx = x;
		this.#cy = y;
	}
	bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void {
		const p1 = this.#pt(a, b);
		const p2 = this.#pt(c, d);
		const p3 = this.#pt(x, y);
		this.#d += `C${[...p1, ...p2, ...p3].map(n).join(' ')}`;
		this.#cx = x;
		this.#cy = y;
	}
	quadraticCurveTo(a: number, b: number, x: number, y: number): void {
		const c1x = this.#cx + (2 / 3) * (a - this.#cx);
		const c1y = this.#cy + (2 / 3) * (b - this.#cy);
		const c2x = x + (2 / 3) * (a - x);
		const c2y = y + (2 / 3) * (b - y);
		this.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
	}
	arc(x: number, y: number, r: number, start: number, end: number, ccw = false): void {
		let sweep = end - start;
		if (!ccw && sweep < 0) sweep += Math.PI * 2;
		if (ccw && sweep > 0) sweep -= Math.PI * 2;
		const full = Math.abs(sweep) >= Math.PI * 2 - 1e-9;
		if (full) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
		const segments = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
		const step = sweep / segments;
		const k = (4 / 3) * Math.tan(step / 4);
		let a0 = start;
		const sx = x + r * Math.cos(a0);
		const sy = y + r * Math.sin(a0);
		if (this.#d === '' || full) this.moveTo(sx, sy);
		else this.lineTo(sx, sy);
		for (let i = 0; i < segments; i++) {
			const a1 = a0 + step;
			const [c0, s0, c1, s1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
			this.bezierCurveTo(
				x + r * (c0 - k * s0),
				y + r * (s0 + k * c0),
				x + r * (c1 + k * s1),
				y + r * (s1 - k * c1),
				x + r * c1,
				y + r * s1
			);
			a0 = a1;
		}
	}
	rect(x: number, y: number, w: number, h: number): void {
		this.moveTo(x, y);
		this.lineTo(x + w, y);
		this.lineTo(x + w, y + h);
		this.lineTo(x, y + h);
		this.closePath();
	}
	#emit(element: string): void {
		let out = element;
		for (const id of [...this.#clips].reverse()) out = `<g clip-path="url(#${id})">${out}</g>`;
		this.#body.push(out);
	}
	#opacity(): string {
		return this.globalAlpha < 1 ? ` opacity="${n(this.globalAlpha)}"` : '';
	}
	#scaleFactor(): number {
		const [a, b, c, d] = this.#m;
		return Math.sqrt(Math.abs(a * d - b * c));
	}
	fill(rule: CanvasFillRule = 'nonzero'): void {
		if (!this.#d) return;
		const r = rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
		this.#emit(`<path d="${this.#d}" fill="${String(this.fillStyle)}"${r}${this.#opacity()}/>`);
	}
	stroke(): void {
		if (!this.#d) return;
		const w = this.lineWidth * this.#scaleFactor();
		const cap = this.lineCap !== 'butt' ? ` stroke-linecap="${this.lineCap}"` : '';
		const join = this.lineJoin !== 'miter' ? ` stroke-linejoin="${this.lineJoin}"` : '';
		this.#emit(
			`<path d="${this.#d}" fill="none" stroke="${String(this.strokeStyle)}" stroke-width="${n(w)}"${cap}${join}${this.#opacity()}/>`
		);
	}
	clip(rule: CanvasFillRule = 'nonzero'): void {
		const id = `c${this.#nextClip++}`;
		const r = rule === 'evenodd' ? ' clip-rule="evenodd"' : '';
		this.#defs.push(`<clipPath id="${id}"><path d="${this.#d}"${r}/></clipPath>`);
		this.#clips = [...this.#clips, id];
	}
	fillRect(x: number, y: number, w: number, h: number): void {
		const saved = this.#d;
		this.beginPath();
		this.rect(x, y, w, h);
		this.fill();
		this.#d = saved;
	}
	strokeRect(x: number, y: number, w: number, h: number): void {
		const saved = this.#d;
		this.beginPath();
		this.rect(x, y, w, h);
		this.stroke();
		this.#d = saved;
	}
	setLineDash(): void {
		// dashes are not used by the screen pages
	}
	fillText(text: string, x: number, y: number): void {
		const [px, py] = this.#pt(x, y);
		const size = /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '10';
		this.#emit(
			`<text x="${n(px)}" y="${n(py)}" font-size="${size}" font-weight="300" font-family="${escape(FALLBACK_FAMILY)}" fill="${String(this.fillStyle)}"${this.#opacity()}>${escape(text)}</text>`
		);
	}

	/** The SVG document so far, `width` × `height` user units, optionally scaled. */
	toSvg(width: number = SCREEN.width, height: number = SCREEN.height, scale = 1): string {
		return (
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">` +
			`<defs>${this.#defs.join('')}</defs>${this.#body.join('')}</svg>`
		);
	}
}

/** A standalone SVG of a frame (480 × 220 design pixels, drawn at `scale`). */
export function frameToSvg(frame: ScreenFrame, scale = 1, options: RenderOptions = {}): string {
	const ctx = new SvgContext();
	renderFrame(ctx, frame, options);
	return ctx.toSvg(SCREEN.width, SCREEN.height, scale);
}
