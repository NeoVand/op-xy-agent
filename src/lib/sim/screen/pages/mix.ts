/**
 * Mix M1: eight 60 px strips running the grey ramp, one per track. A bar marks each track's level
 * and thickens with it, as the device draws it even while stopped (camera, OS 1.1.33; research 59
 * §2.10); a muted track is hatched; the selected track shows its number on top and its pan as a dot
 * at the foot, in the strip's ink (white on the two dark strips, black on the rest).
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, hatch, text } from '../draw';
import type { MixFrame } from '../frame';
import { COLORS, RAMP } from '../palette';

/** Where the muted hatch starts. */
const HIGH = 25;

/**
 * The level bar's edges for a level 0–1 (measured on the CC7 sweep): 4 px at the foot at 0, 20.5 px
 * high up at full.
 */
const barTop = (level: number) => 215 - 186.6 * level;
const barBottom = (level: number) => 219.1 - 170.2 * level;

/** How much the output thickens the bar while playing (ours: the captures were all stopped). */
const METER_PX = 8;

/** Draws the mix page. */
export function drawMix(ctx: ScreenCtx, frame: MixFrame): void {
	frame.strips.slice(0, 8).forEach((strip, i) => {
		const x = i * 60;
		fillBox(ctx, x, 0, 60, 220, RAMP[i]);
		const ink = i < 2 ? COLORS.white : COLORS.black;
		if (strip.muted) hatch(ctx, x, HIGH, 60, 220 - HIGH, COLORS.ink, 7.5, 0.5);
		const level = Math.max(0, Math.min(1, strip.level));
		const swell = (METER_PX * Math.max(0, Math.min(1, strip.meter))) / 2;
		const top = barTop(level) - swell;
		fillBox(ctx, x, top, 60, barBottom(level) + swell - top, ink);
		if (i === frame.selected) {
			text(ctx, String(i + 1), x + 30, 20, 20, ink, 'center');
			// the pan dot: ±24 px about the strip's middle (the CC10 sweep)
			disc(ctx, x + 30 + Math.max(-1, Math.min(1, strip.pan)) * 24, 209.4, 4.5, ink);
		}
	});
}
