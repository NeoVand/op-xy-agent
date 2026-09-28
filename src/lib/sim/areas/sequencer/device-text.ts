/**
 * Figures as the device sets them. The screen font's figures are tabular, as TE's guide art draws
 * them (`../../screen/font.ts`), but on the device's own screen the 1 is proportional: "13", "100"
 * and "+16" come out tighter than the art's figures would, and a lone 1 starts where the other
 * digits start (camera frames b1-499, 538…549, 633, 268…279; research 59 §2.8, §2.12). Measured
 * against the font: the 1's ink begins about 65 units after the pen instead of 138, and it
 * advances about 394 units instead of 545 (1000 to the em). Everything else is set as the font
 * sets it.
 */
import type { ScreenCtx } from '../../screen/context';
import { text } from '../../screen/draw';
import { screenFont, type TextAlign } from '../../screen/font';

/** The device's 1: shifted left of the font's, and narrower. In font units. */
const ONE = { shift: -73, advance: 394 } as const;

/** Where each character of a run goes (pen x from the run's start) and the run's width, in px. */
export function figuresLayout(
	s: string,
	size: number
): {
	readonly glyphs: readonly { readonly ch: string; readonly x: number }[];
	readonly width: number;
} {
	const k = size / screenFont.data.unitsPerEm;
	const chars = [...s];
	const glyphs: { ch: string; x: number }[] = [];
	let pen = 0;
	chars.forEach((ch, i) => {
		const next = chars[i + 1];
		if (ch === '1') {
			glyphs.push({ ch, x: pen + ONE.shift * k });
			pen += ONE.advance * k;
			return;
		}
		glyphs.push({ ch, x: pen });
		// the font's advance and its kerning with the next character (none next to a 1)
		pen +=
			next !== undefined && next !== '1'
				? screenFont.measure(ch + next, size) - screenFont.measure(next, size)
				: screenFont.measure(ch, size);
	});
	return { glyphs, width: pen };
}

/** Draws a run with the device's 1, `x` its left edge, centre or right edge. Returns its width. */
export function figures(
	ctx: ScreenCtx,
	s: string,
	x: number,
	y: number,
	size: number,
	color: string,
	align: TextAlign = 'left'
): number {
	const { glyphs, width } = figuresLayout(s, size);
	const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
	for (const g of glyphs) {
		if (g.ch !== ' ') text(ctx, g.ch, x0 + g.x, y, size, color);
	}
	return width;
}
