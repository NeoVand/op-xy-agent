/**
 * The COM page (guide art com-004): a light card with the device seen from above (and the "adv"
 * badge while Bluetooth MIDI advertises), the multi-out selector (a column of radio rings with the
 * chosen mode's name), the charge state, and soft labels system / ctrl / devices / mtp.
 */
import type { ScreenCtx } from '../context';
import { disc, fillBox, line, softLabels, text } from '../draw';
import type { ComFrame, MultiOutMode } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/**
 * The selector's four stops. TE's art shows four rings with "sync" on the second, while the manual
 * lists six modes, so the three sync rates share that stop (our reading; the order of the others is
 * a guess until we see the real screen).
 */
export const MULTI_OUT_STOPS: readonly (readonly MultiOutMode[])[] = [
	['midi'],
	['sync8', 'sync16', 'sync24'],
	['cv/gate'],
	['audio']
];

/** Draws the COM page. */
export function drawCom(ctx: ScreenCtx, frame: ComFrame): void {
	drawIcon(ctx, 'com.device', 4, 4);
	if (frame.advertising) {
		drawIcon(ctx, 'com.badge', 18, 12);
		text(ctx, 'adv', 49.1, 31, 20, COLORS.black);
	}
	line(ctx, 310, 0, 310, 190, COLORS.card, 0.5);
	line(ctx, 350, 0, 350, 190, COLORS.card, 0.5);
	line(ctx, 204.8, 110, 310, 110, COLORS.card, 0.5);

	const selected = Math.max(
		0,
		MULTI_OUT_STOPS.findIndex((stop) => stop.includes(frame.multiOut))
	);
	MULTI_OUT_STOPS.forEach((_, i) => {
		const cy = 35 + 25 * i;
		disc(ctx, 330, cy, 10, i === selected ? COLORS.card : '#42444a');
		disc(ctx, 330, cy, 6, COLORS.black);
	});
	text(ctx, frame.multiOut, 361, 40 + 25 * selected, 20, '#afafaf');

	fillBox(ctx, 325, 145, 10, 30, frame.charging ? COLORS.card : '#42444a', 5);
	text(ctx, frame.charging ? 'charge on' : 'charge off', 361, 165, 20, '#afafaf');

	softLabels(ctx, [{ text: 'system' }, { text: 'ctrl' }, { text: 'devices' }, { text: 'mtp' }]);
}
