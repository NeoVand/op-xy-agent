/**
 * The part of `CanvasRenderingContext2D` the screen renderer uses. Everything draws through this
 * interface with plain path calls (no `Path2D`, no images), so a recording fake can stand in for a
 * canvas in Node tests (`recording.ts`) and snapshots stay readable.
 */
export interface ScreenCtx {
	fillStyle: string | CanvasGradient | CanvasPattern;
	strokeStyle: string | CanvasGradient | CanvasPattern;
	lineWidth: number;
	lineCap: CanvasLineCap;
	lineJoin: CanvasLineJoin;
	globalAlpha: number;
	font: string;
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
	save(): void;
	restore(): void;
	translate(x: number, y: number): void;
	scale(x: number, y: number): void;
	rotate(angle: number): void;
	beginPath(): void;
	closePath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
	quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
	arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
	rect(x: number, y: number, w: number, h: number): void;
	fill(fillRule?: CanvasFillRule): void;
	stroke(): void;
	clip(fillRule?: CanvasFillRule): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	strokeRect(x: number, y: number, w: number, h: number): void;
	setLineDash(segments: number[]): void;
	fillText(text: string, x: number, y: number): void;
}
