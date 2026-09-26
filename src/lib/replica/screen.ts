/**
 * Placeholder renderer for the replica's 480 × 222 display: a small pixel font and a layout of a
 * title plus one big value ("tempo" / "120.0"). Pure drawing onto any canvas-like context, in
 * logical pixels; the real page renderers (§3 of docs/research/50-hardware-ui.md) replace it later.
 */

/** The part of CanvasRenderingContext2D the renderer uses (a fake one works in tests). */
export interface ScreenContext {
	fillStyle: string | CanvasGradient | CanvasPattern;
	fillRect(x: number, y: number, w: number, h: number): void;
}

/** The screen's palette (TE's firmware tones as drawn in the guide). */
export const SCREEN_COLORS = {
	background: '#000000',
	text: '#f7f5f5',
	muted: '#96969b',
	ramp: ['#16161e', '#2f2f37', '#484850', '#616169', '#7a7a82', '#96969b', '#afafb4', '#f7f5f5']
} as const;

/** Rows of a glyph, 5 bits wide (bit 4 = left column); rows 0–6 sit on the baseline, row 7 below. */
type Glyph = readonly [number, number, number, number, number, number, number, number];

const GLYPH_ROWS = 8;
/** Rows above the baseline. */
const CAP_ROWS = 7;

const GLYPHS: Readonly<Record<string, Glyph>> = {
	' ': [0, 0, 0, 0, 0, 0, 0, 0],
	'0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110, 0],
	'1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
	'2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111, 0],
	'3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110, 0],
	'4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010, 0],
	'5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110, 0],
	'6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110, 0],
	'7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0],
	'8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110, 0],
	'9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100, 0],
	a: [0, 0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111, 0],
	b: [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b11110, 0],
	c: [0, 0, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110, 0],
	d: [0b00001, 0b00001, 0b01101, 0b10011, 0b10001, 0b10001, 0b01111, 0],
	e: [0, 0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110, 0],
	f: [0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0],
	g: [0, 0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
	h: [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001, 0],
	i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
	j: [0b00010, 0, 0b00110, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
	k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0],
	l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
	m: [0, 0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101, 0],
	n: [0, 0, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001, 0],
	o: [0, 0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
	p: [0, 0, 0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000],
	q: [0, 0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001],
	r: [0, 0, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000, 0],
	s: [0, 0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110, 0],
	t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110, 0],
	u: [0, 0, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101, 0],
	v: [0, 0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0],
	w: [0, 0, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010, 0],
	x: [0, 0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
	y: [0, 0, 0b10001, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
	z: [0, 0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111, 0],
	'.': [0, 0, 0, 0, 0, 0b01100, 0b01100, 0],
	',': [0, 0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
	':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0, 0],
	'-': [0, 0, 0, 0b01110, 0, 0, 0, 0],
	'+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0, 0],
	'/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000, 0],
	'%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011, 0],
	'#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010, 0],
	'(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010, 0],
	')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000, 0],
	'!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100, 0],
	'?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100, 0],
	'=': [0, 0, 0b11111, 0, 0b11111, 0, 0, 0],
	"'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0, 0],
	_: [0, 0, 0, 0, 0, 0, 0, 0b11111],
	'→': [0, 0b00100, 0b00010, 0b11111, 0b00010, 0b00100, 0, 0],
	'←': [0, 0b00100, 0b01000, 0b11111, 0b01000, 0b00100, 0, 0],
	'♩': [0b00100, 0b00100, 0b00100, 0b00100, 0b01100, 0b11100, 0b01000, 0]
};

/** The glyph drawn for a character: letters fold to lower case (TE writes lower case). */
export function glyphFor(ch: string): Glyph {
	return GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()] ?? GLYPHS['?'];
}

/** Columns a glyph occupies: digits are fixed-width (values must not jitter), the rest is tight. */
function columns(ch: string, glyph: Glyph): { first: number; width: number } {
	if (ch === ' ') return { first: 0, width: 3 };
	if (/[0-9]/.test(ch)) return { first: 0, width: 5 };
	const used = glyph.reduce((bits, row) => bits | row, 0);
	if (used === 0) return { first: 0, width: 3 };
	let first = 0;
	while (!(used & (0b10000 >> first))) first++;
	let last = 4;
	while (!(used & (0b10000 >> last))) last--;
	return { first, width: last - first + 1 };
}

/** Width in logical pixels of `text` at `scale` pixels per font cell. */
export function measureText(text: string, scale: number): number {
	let cells = 0;
	for (const ch of text) cells += columns(ch, glyphFor(ch)).width + 1;
	return Math.max(0, cells - 1) * scale;
}

/** Draws `text` with its top-left corner at (x, y); returns the width drawn. */
export function drawText(
	ctx: ScreenContext,
	text: string,
	x: number,
	y: number,
	scale: number
): number {
	let cx = x;
	for (const ch of text) {
		const glyph = glyphFor(ch);
		const { first, width } = columns(ch, glyph);
		for (let row = 0; row < GLYPH_ROWS; row++) {
			const bits = glyph[row];
			if (!bits) continue;
			for (let col = 0; col < width; col++) {
				if (bits & (0b10000 >> (first + col))) {
					ctx.fillRect(cx + col * scale, y + row * scale, scale, scale);
				}
			}
		}
		cx += (width + 1) * scale;
	}
	return cx - x - scale;
}

/** Largest whole scale at which `text` fits `maxWidth`, capped at `max`. */
function fitScale(text: string, maxWidth: number, max: number): number {
	let scale = max;
	while (scale > 1 && measureText(text, scale) > maxWidth) scale--;
	return scale;
}

/**
 * Draws the placeholder page: black glass, an optional small title (first of several lines), the
 * main value large and centred, and further lines small underneath.
 */
export function drawScreen(
	ctx: ScreenContext,
	lines: readonly string[],
	size: { width: number; height: number } = { width: 480, height: 222 }
): void {
	const { width, height } = size;
	const margin = Math.round(width / 20);
	ctx.fillStyle = SCREEN_COLORS.background;
	ctx.fillRect(0, 0, width, height);

	const text = lines.map((line) => line.trim());
	if (text.length === 0 || text.every((line) => line === '')) return;
	const [title, main, ...rest] = text.length === 1 ? ['', text[0]] : text;
	const small = Math.max(2, Math.round(height / 74));

	if (title) {
		ctx.fillStyle = SCREEN_COLORS.muted;
		drawText(ctx, title, margin, margin, small);
	}
	const top = title ? margin + small * GLYPH_ROWS + small * 2 : margin;
	const bottom = height - margin - rest.length * small * (GLYPH_ROWS + 2);
	const big = fitScale(
		main,
		width - 2 * margin,
		Math.max(small, Math.floor((bottom - top) / GLYPH_ROWS))
	);
	const mainHeight = big * CAP_ROWS;
	const mainY = Math.round(top + (bottom - top - mainHeight) / 2);
	ctx.fillStyle = SCREEN_COLORS.text;
	drawText(ctx, main, Math.round((width - measureText(main, big)) / 2), mainY, big);

	ctx.fillStyle = SCREEN_COLORS.muted;
	rest.forEach((line, i) => {
		const y = bottom + small * 2 + i * small * (GLYPH_ROWS + 2);
		drawText(ctx, line, Math.round((width - measureText(line, small)) / 2), y, small);
	});
}
