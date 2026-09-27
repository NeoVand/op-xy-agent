/**
 * Mix M1 (guide art mix-003): eight 60 px strips running the grey ramp, one per track. A bar marks
 * each track's level (its thickness follows the output), a muted track is hatched, and the selected
 * track shows its number on top and its pan as a dot at the foot.
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, hatch, text } from '../draw';
import type { MixFrame } from '../frame';
import { COLORS, RAMP } from '../palette';

/** Top and bottom of the level travel. */
const HIGH = 25;
const LOW = 205;

/** Draws the mix page. */
export function drawMix(ctx: ScreenCtx, frame: MixFrame): void {
	frame.strips.slice(0, 8).forEach((strip, i) => {
		const x = i * 60;
		fillBox(ctx, x, 0, 60, 220, RAMP[i]);
		const ink = i < 2 ? COLORS.white : COLORS.black;
		if (strip.muted) hatch(ctx, x, HIGH, 60, 220 - HIGH, COLORS.ink, 7.5, 0.5);
		const y = LOW - (LOW - HIGH) * Math.max(0, Math.min(1, strip.level));
		const thickness = 0.56 + 12.8 * Math.max(0, Math.min(1, strip.meter));
		fillBox(ctx, x, y - thickness / 2, 60, thickness, ink);
		if (i === frame.selected) {
			const label = i < 4 ? COLORS.white : COLORS.black;
			text(ctx, String(i + 1), x + 30, 20, 20, label, 'center');
			disc(ctx, x + 30 + Math.max(-1, Math.min(1, strip.pan)) * 22, 211, 5, label);
		}
	});
}
