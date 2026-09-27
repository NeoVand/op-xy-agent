/**
 * Screen pictograms extracted from TE's guide screen illustrations by
 * `scripts/extract-screen-font.mjs` (knowledge/opxy/screen-icons.json; decisions D9/D10, credited
 * in NOTICE.md): the metronome, pen nib, engine illustrations, card icons and so on, as filled or
 * stroked paths in screen pixels with their original colours.
 */
import iconsJson from '$knowledge/opxy/screen-icons.json';
import type { ScreenCtx } from './context';
import { compiled, tracePath } from './paths';

/** One shape of an icon. */
export interface IconShape {
	readonly d: string;
	readonly fill?: string;
	readonly stroke?: string;
	readonly width?: number;
	readonly cap?: string;
	readonly join?: string;
	readonly alpha?: number;
	readonly evenodd?: boolean;
	/** Clip path (TE's masks), in the icon's coordinates. */
	readonly clip?: string;
}

/** An icon: its box size and shapes (coordinates relative to the box's top-left). */
export interface IconData {
	readonly w: number;
	readonly h: number;
	readonly shapes: readonly IconShape[];
}

/**
 * A picture TE drew as a grid of equal squares (dissolve's noise field): one string per row, `.` for
 * an unlit cell and 1…n for `colors[n − 1]`; the grid's top-left is at (x, y).
 */
export interface CellPattern {
	readonly cell: number;
	readonly x: number;
	readonly y: number;
	readonly colors: readonly string[];
	readonly grid: readonly string[];
}

interface IconsFile {
	readonly format: number;
	readonly icons: Readonly<Record<string, IconData>>;
	readonly patterns?: Readonly<Record<string, CellPattern>>;
}

const file = iconsJson as IconsFile;
if (file.format !== 1) throw new Error(`unsupported screen icons format ${file.format}`);

/** Every icon by name. */
export const ICONS: Readonly<Record<string, IconData>> = file.icons;

/** Every cell pattern by name. */
export const PATTERNS: Readonly<Record<string, CellPattern>> = file.patterns ?? {};

/**
 * Draws a cell pattern. `map` may move or recolour each lit cell (return null to leave it unlit),
 * which is how pages animate a pattern without redrawing TE's picture from scratch.
 */
export function drawPattern(
	ctx: ScreenCtx,
	name: string,
	map?: (col: number, row: number, level: number) => number | null
): void {
	const pattern = PATTERNS[name];
	if (!pattern) throw new Error(`unknown screen pattern "${name}"`);
	pattern.grid.forEach((line, row) => {
		for (let col = 0; col < line.length; col++) {
			const raw = line.charCodeAt(col) - 48; // '1' → 1; '.' → negative
			const level = map ? map(col, row, raw > 0 ? raw : 0) : raw;
			if (level === null || level <= 0) continue;
			const color = pattern.colors[level - 1];
			if (!color) continue;
			ctx.fillStyle = color;
			ctx.fillRect(
				pattern.x + col * pattern.cell,
				pattern.y + row * pattern.cell,
				pattern.cell,
				pattern.cell
			);
		}
	});
}

/** Name of an extracted icon. */
export type IconName = keyof typeof iconsJson.icons;

/** Options for {@link drawIcon}. */
export interface IconOptions {
	/** Uniform scale (1 = the size TE drew it). */
	readonly scale?: number;
	/** Multiplies every shape's opacity. */
	readonly alpha?: number;
	/** Replaces colours: `{ '#000000': '#f7f5f5' }`. */
	readonly colors?: Readonly<Record<string, string>>;
	/** Paints every shape in one colour (for monochrome pictograms). */
	readonly tint?: string;
}

/** The icon's data. @throws {Error} for an unknown name */
export function icon(name: IconName | string): IconData {
	const data = ICONS[name];
	if (!data) throw new Error(`unknown screen icon "${name}"`);
	return data;
}

/** Draws an icon with its box's top-left at (x, y). */
export function drawIcon(
	ctx: ScreenCtx,
	name: IconName | string,
	x: number,
	y: number,
	options: IconOptions = {}
): void {
	const { scale = 1, alpha = 1, colors, tint } = options;
	const color = (c: string) => tint ?? colors?.[c] ?? c;
	for (const shape of icon(name).shapes) {
		ctx.save();
		ctx.globalAlpha = alpha * (shape.alpha ?? 1);
		if (shape.clip) {
			ctx.beginPath();
			tracePath(ctx, compiled(shape.clip), x, y, scale);
			ctx.clip();
		}
		ctx.beginPath();
		tracePath(ctx, compiled(shape.d), x, y, scale);
		if (shape.fill) {
			ctx.fillStyle = color(shape.fill);
			ctx.fill(shape.evenodd ? 'evenodd' : 'nonzero');
		}
		if (shape.stroke) {
			ctx.strokeStyle = color(shape.stroke);
			ctx.lineWidth = (shape.width ?? 1) * scale;
			ctx.lineCap = (shape.cap as CanvasLineCap | undefined) ?? 'butt';
			ctx.lineJoin = (shape.join as CanvasLineJoin | undefined) ?? 'miter';
			ctx.stroke();
		}
		ctx.restore();
	}
}
