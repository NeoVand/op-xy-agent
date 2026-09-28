/**
 * A synth engine's M1 page (guide art synth-engines-007 … 084): the eight-cell header with the four
 * parameters, and below it the engine's picture: prism and lenses, cube cluster, stacked pianos,
 * hair-dryer, slinky, waveform, dissolve's noise field and organ's drawbars are TE's drawings.
 */
import type { ScreenCtx } from '../context';
import { header, text } from '../draw';
import type { SynthFrame } from '../frame';
import { ICONS, PATTERNS, drawIcon, drawPattern } from '../icons';
import { COLORS } from '../palette';

/**
 * Dissolve's noise field: TE's 48 × 20 grid of 10 px cells under the header. The page shows TE's
 * picture as drawn; with a non-zero `seed` (animation) the field drifts a column per step, as the
 * swarm moves, and more swarm lights more of the grey cells white.
 */
function drawDissolve(ctx: ScreenCtx, params: readonly number[], seed: number): void {
	const swarm = params[0] ?? 0.5;
	const pattern = PATTERNS['engine.dissolve'];
	if (!pattern) return;
	if (seed === 0) {
		drawPattern(ctx, 'engine.dissolve');
		return;
	}
	const cols = pattern.grid[0]?.length ?? 48;
	drawPattern(ctx, 'engine.dissolve', (col, row) => {
		const line = pattern.grid[row] ?? '';
		const from = line.charCodeAt((((col - seed) % cols) + cols) % cols) - 48;
		if (from <= 0) return null;
		return from > 1 && swarm > 0.75 ? 1 : from;
	});
}

/**
 * Organ (synth-engines-057): four drawbars, each a pair of rails with the stops 8…1, ending in a chip
 * in its encoder's tone with the parameter's pictogram. TE draws only the labels in the top row, no
 * values; the picture is TE's, the stops are set in the screen font.
 */
function drawOrgan(ctx: ScreenCtx, frame: SynthFrame): void {
	drawIcon(ctx, 'engine.organ', 30, 0);
	for (let i = 0; i < 4; i++) {
		const cx = 60 + 120 * i;
		for (let n = 8; n >= 1; n--)
			text(ctx, String(n), cx, 20 + (8 - n) * 20, 20, COLORS.light, 'center');
		const cell = frame.header[i];
		if (cell) text(ctx, cell.label, 120 * i + 5, 10, 10, COLORS.white);
	}
}

/** Draws a synth engine's M1 page. */
export function drawSynth(ctx: ScreenCtx, frame: SynthFrame, seed = 0): void {
	const art = `engine.${frame.engine}`;
	if (frame.engine === 'organ') {
		drawOrgan(ctx, frame);
		return;
	}
	if (frame.engine === 'dissolve') drawDissolve(ctx, frame.params, seed);
	else if (art in ICONS) drawIcon(ctx, art, -1, 20.5);
	header(ctx, frame.header, PLAIN_HEADERS.has(frame.engine) ? 'plain' : 'ramp');
}

/** Engines whose top bar the device draws without the grey cells (research 59 §2.5). */
const PLAIN_HEADERS: ReadonlySet<string> = new Set(['simple', 'axis']);
