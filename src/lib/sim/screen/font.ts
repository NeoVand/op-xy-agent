/**
 * The OP-XY screen font: glyph outlines extracted from TE's guide screen illustrations by
 * `scripts/extract-screen-font.mjs` (knowledge/opxy/screen-font.json; decisions D9/D10, credited in
 * NOTICE.md). A light grotesque at one weight, drawn at whole-pixel sizes (10 px labels, 20 px body,
 * 40–50 px readouts). Figures are tabular so values never jitter; `ff`, `fi` and `ffl` are
 * ligatures, as in TE's art. Characters the art never showed fall back to the app's UI face.
 */
import fontJson from '$knowledge/opxy/screen-font.json';
import type { ScreenCtx } from './context';
import { compiled, tracePath } from './paths';

/** One glyph as stored: advance and bbox in font units (y down, origin on the baseline). */
export interface GlyphData {
	readonly advance: number;
	readonly bbox: readonly number[];
	readonly samples: number;
	readonly d: string;
}

/** The font file's shape. */
export interface ScreenFontData {
	readonly format: number;
	readonly unitsPerEm: number;
	readonly ascender: number;
	readonly capHeight: number;
	readonly xHeight: number;
	readonly descender: number;
	readonly space: number;
	readonly figureAdvance: number;
	readonly sizes: Readonly<Record<string, number>>;
	readonly ligatures: readonly string[];
	readonly kerning: Readonly<Record<string, number>>;
	readonly missing: string;
	readonly glyphs: Readonly<Record<string, GlyphData>>;
}

/** Horizontal alignment of a text run relative to its x. */
export type TextAlign = 'left' | 'center' | 'right';

/** How to draw a run of text. */
export interface TextOptions {
	/** Size in pixels per em (the device uses 10, 20, 40, 50). */
	readonly size: number;
	readonly color?: string;
	readonly align?: TextAlign;
	/** Extra space after each glyph in em (TE's styles run from about −0.07 to +0.05). */
	readonly tracking?: number;
	/**
	 * The heavier weight the device uses for some labels (the envelope names): the light outlines
	 * stroked in their own colour, 0.9 px at 20 px, with a little more tracking.
	 */
	readonly bold?: boolean;
}

/** A glyph placed on a line: `x` is its pen position in pixels from the run's start. */
export interface PlacedGlyph {
	readonly name: string;
	readonly x: number;
	/** False when the extracted font lacks it and the fallback face draws it. */
	readonly known: boolean;
}

/** A laid-out run. */
export interface TextLayout {
	readonly glyphs: readonly PlacedGlyph[];
	/** Advance width in pixels. */
	readonly width: number;
	readonly size: number;
}

/** The face used for characters the guide art never showed. */
export const FALLBACK_FAMILY = '"Work Sans Variable", "Work Sans", system-ui, sans-serif';

/** Rough advances (em) of fallback characters, so layout needs no canvas to measure. */
function fallbackAdvance(ch: string): number {
	if (/[A-Z]/.test(ch))
		return ch === 'M' || ch === 'W' ? 0.82 : ch === 'I' || ch === 'J' ? 0.3 : 0.66;
	if (/[,;:.!'|]/.test(ch)) return 0.26;
	if (/[()[\]{}]/.test(ch)) return 0.3;
	if (ch === '%' || ch === '@') return 0.86;
	if (ch === '&') return 0.68;
	if (ch === '?') return 0.5;
	return 0.56;
}

/** The screen font, ready to lay out and draw. */
export class ScreenFont {
	readonly data: ScreenFontData;
	readonly #upm: number;
	/** Ligatures, longest first, restricted to the ones the font has. */
	readonly #ligatures: readonly string[];

	constructor(data: ScreenFontData) {
		if (data.format !== 1) throw new Error(`unsupported screen font format ${data.format}`);
		this.data = data;
		this.#upm = data.unitsPerEm;
		this.#ligatures = [...data.ligatures]
			.filter((l) => data.glyphs[l])
			.sort((a, b) => b.length - a.length);
	}

	/** Vertical metrics in em. */
	get metrics() {
		const u = this.#upm;
		return {
			ascender: this.data.ascender / u,
			capHeight: this.data.capHeight / u,
			xHeight: this.data.xHeight / u,
			descender: this.data.descender / u
		};
	}

	/** True when the font has an outline for this glyph name (a character or a ligature). */
	has(name: string): boolean {
		return name in this.data.glyphs;
	}

	/** Splits text into glyph names, applying ligatures (`ffl`, `ff`, `fi`). */
	glyphNames(text: string): string[] {
		const names: string[] = [];
		const chars = [...text];
		for (let i = 0; i < chars.length;) {
			const lig = this.#ligatures.find((l) => chars.slice(i, i + l.length).join('') === l);
			if (lig) {
				names.push(lig);
				i += lig.length;
			} else {
				names.push(chars[i]);
				i += 1;
			}
		}
		return names;
	}

	/** Lays out a run at `size` px with `tracking` em between glyphs. */
	layout(text: string, size: number, tracking = 0): TextLayout {
		const k = size / this.#upm;
		const names = this.glyphNames(text);
		const glyphs: PlacedGlyph[] = [];
		let pen = 0;
		names.forEach((name, i) => {
			const glyph = this.data.glyphs[name];
			const known = glyph !== undefined;
			glyphs.push({ name, x: pen, known });
			let advance: number;
			if (name === ' ') advance = this.data.space * k;
			else if (glyph) advance = glyph.advance * k;
			else advance = fallbackAdvance(name) * size;
			const next = names[i + 1];
			if (next !== undefined) {
				advance += (this.data.kerning[name + next] ?? 0) * k + tracking * size;
			}
			pen += advance;
		});
		return { glyphs, width: pen, size };
	}

	/** Advance width of a run in pixels. */
	measure(text: string, size: number, tracking = 0): number {
		return this.layout(text, size, tracking).width;
	}

	/** The largest size ≤ `size` (down to `min`) at which the run fits `maxWidth`. */
	fit(text: string, maxWidth: number, size: number, min = 8): number {
		let s = size;
		while (s > min && this.measure(text, s) > maxWidth) s -= 1;
		return s;
	}

	/**
	 * Draws a run with its baseline at `y`; `x` is its left edge, centre or right edge per `align`.
	 * Returns the advance width drawn.
	 */
	draw(ctx: ScreenCtx, text: string, x: number, y: number, options: TextOptions): number {
		const { size, color, align = 'left', bold = false } = options;
		const tracking = (options.tracking ?? 0) + (bold ? 0.03 : 0);
		const run = this.layout(text, size, tracking);
		const x0 = align === 'center' ? x - run.width / 2 : align === 'right' ? x - run.width : x;
		const k = size / this.#upm;
		if (color) ctx.fillStyle = color;
		for (const g of run.glyphs) {
			if (g.name === ' ') continue;
			const glyph = this.data.glyphs[g.name];
			if (glyph) {
				ctx.beginPath();
				tracePath(ctx, compiled(glyph.d), x0 + g.x, y, k);
				ctx.fill();
				if (bold) {
					ctx.lineWidth = (0.9 * size) / 20;
					ctx.lineJoin = 'round';
					if (color) ctx.strokeStyle = color;
					ctx.stroke();
				}
			} else {
				ctx.font = `${bold ? 500 : 300} ${size}px ${FALLBACK_FAMILY}`;
				ctx.textAlign = 'left';
				ctx.textBaseline = 'alphabetic';
				ctx.fillText(g.name, x0 + g.x, y);
			}
		}
		return run.width;
	}
}

/** The OP-XY screen font from knowledge/opxy/screen-font.json. */
export const screenFont = new ScreenFont(fontJson as ScreenFontData);
