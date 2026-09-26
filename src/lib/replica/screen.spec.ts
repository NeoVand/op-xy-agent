import { describe, expect, it } from 'vitest';
import {
	SCREEN_COLORS,
	drawScreen,
	drawText,
	glyphFor,
	measureText,
	type ScreenContext
} from './screen';

/** A context that records filled rectangles per colour. */
function recordingContext() {
	const rects: { color: string; x: number; y: number; w: number; h: number }[] = [];
	const ctx: ScreenContext = {
		fillStyle: '#000000',
		fillRect(x, y, w, h) {
			rects.push({ color: String(this.fillStyle), x, y, w, h });
		}
	};
	return { ctx, rects };
}

const bounds = (rects: { x: number; y: number; w: number; h: number }[]) => ({
	x0: Math.min(...rects.map((r) => r.x)),
	y0: Math.min(...rects.map((r) => r.y)),
	x1: Math.max(...rects.map((r) => r.x + r.w)),
	y1: Math.max(...rects.map((r) => r.y + r.h))
});

describe('screen placeholder renderer', () => {
	it('measures and draws text cell by cell', () => {
		const { ctx, rects } = recordingContext();
		// "1" is 5 cells wide, a gap, then "." 2 cells: 8 cells
		expect(measureText('1.', 2)).toBe(16);
		const width = drawText(ctx, '1.', 10, 20, 2);
		expect(width).toBe(16);
		expect(bounds(rects)).toEqual({ x0: 12, y0: 20, x1: 26, y1: 34 });
		expect(glyphFor('A')).toEqual(glyphFor('a'));
		expect(glyphFor('€')).toEqual(glyphFor('?'));
	});

	it('draws "tempo" small top-left and "120.0" large and centred', () => {
		const { ctx, rects } = recordingContext();
		drawScreen(ctx, ['tempo', '120.0']);
		expect(rects[0]).toEqual({ color: SCREEN_COLORS.background, x: 0, y: 0, w: 480, h: 222 });
		const title = rects.filter((r) => r.color === SCREEN_COLORS.muted && r.y < 60);
		const main = rects.filter((r) => r.color === SCREEN_COLORS.text);
		expect(bounds(title).x0).toBeGreaterThanOrEqual(20);
		expect(bounds(title).y1).toBeLessThan(60);
		const m = bounds(main);
		expect(Math.abs((m.x0 + m.x1) / 2 - 240)).toBeLessThanOrEqual(8);
		expect(m.y1 - m.y0).toBeGreaterThan(90);
		for (const r of rects) {
			expect(r.x).toBeGreaterThanOrEqual(0);
			expect(r.y).toBeGreaterThanOrEqual(0);
			expect(r.x + r.w).toBeLessThanOrEqual(480);
			expect(r.y + r.h).toBeLessThanOrEqual(222);
		}
	});

	it('fits long values and leaves the glass black when there is nothing to show', () => {
		const long = recordingContext();
		drawScreen(long.ctx, ['a very long single line of text that must fit']);
		expect(bounds(long.rects.filter((r) => r.color === SCREEN_COLORS.text)).x1).toBeLessThanOrEqual(
			480
		);

		const empty = recordingContext();
		drawScreen(empty.ctx, ['', ' ']);
		expect(empty.rects).toEqual([{ color: SCREEN_COLORS.background, x: 0, y: 0, w: 480, h: 222 }]);
	});
});
