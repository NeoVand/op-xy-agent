/**
 * Smaller pages: the midi engine (guide art synth-engines-034), the pickers' lists (as the device
 * draws them) and a plain text page for screens we have not drawn yet.
 */
import type { ScreenCtx } from '../context';
import { fillBox, softLabels, strokeBox, text } from '../draw';
import type { ListFrame, MidiFrame, TextFrame } from '../frame';
import { drawIcon } from '../icons';
import { COLORS } from '../palette';

/** The midi engine's M1 page: DIN card, channel, bank (crossed out when none), program. */
export function drawMidi(ctx: ScreenCtx, frame: MidiFrame): void {
	text(ctx, 'midi', 240, 45, 20, COLORS.white, 'center');
	drawIcon(ctx, 'midi.arrow', 136, 60);
	drawIcon(ctx, 'midi.din', 108, 78);
	drawIcon(ctx, 'midi.arrow', 136, 148.5, { tint: COLORS.grey1 });
	text(ctx, 'channel', 180, 75, 10, COLORS.white);
	text(ctx, 'bank', 245.5, 75, 10, COLORS.white);
	text(ctx, 'program', 310.5, 75, 10, COLORS.white);
	text(ctx, frame.channel, 207.5, 125, 40, COLORS.white, 'center');
	if (frame.bank === null) drawIcon(ctx, 'midi.none', 214, 69);
	else {
		fillBox(ctx, 240, 80, 65, 65, COLORS.dark);
		text(ctx, frame.bank, 272.5, 125, 40, COLORS.white, 'center');
	}
	fillBox(ctx, 305, 80, 65, 65, COLORS.grey4);
	text(ctx, frame.program, 337.5, 125, 40, COLORS.black, 'center');
}

/**
 * The pickers' lists (shift + M1 / M3 / M4) as the device draws them (camera, OS 1.1.33: the filter
 * and LFO types b1-2998, b1-3190 and the preset browser's engines b1-1500, which agree; research 59
 * §2.3, §2.6): 20 px text in the heavier weight on rows 20 px apart from baseline 25.3, the current
 * item boxed by a 1.5 px outline 20.9 px tall from 16.85 px above the baseline, 3.9 px left of the
 * text. The player list is drawn the same way.
 */
const LIST = {
	first: 25.3,
	pitch: 20,
	/** The device's heavier words run about 0.02 em tighter than our bold (multisampler, dissolve). */
	tracking: -0.02,
	box: { dx: -3.9, top: -16.85, h: 20.9, line: 1.5, r: 2.5 }
} as const;

/** A list page: its columns, the current item of each marked in the column's style, soft labels. */
export function drawList(ctx: ScreenCtx, frame: ListFrame): void {
	for (const column of frame.columns) {
		column.items.forEach((item, i) => {
			const baseline = LIST.first + LIST.pitch * i;
			let ink: string = COLORS.white;
			if (i === column.selected) {
				const { dx, top, h, line, r } = LIST.box;
				const [x, y] = [column.x + dx, baseline + top];
				if (column.style === 'outline')
					strokeBox(ctx, x, y, column.width, h, COLORS.white, line, r);
				else {
					// TE's filled highlights (settings pages), over the outline's extent
					const fill = column.style === 'dark' ? COLORS.dark : COLORS.white;
					fillBox(ctx, x - line / 2, y - line / 2, column.width + line, h + line, fill, r);
					if (column.style === 'white') ink = COLORS.black;
				}
			}
			text(ctx, item, column.x, baseline, 20, ink, 'left', LIST.tracking, true);
		});
	}
	softLabels(ctx, frame.soft);
}

/** A page we have not drawn yet: its name small, its values as lines. */
export function drawText(ctx: ScreenCtx, frame: TextFrame): void {
	text(ctx, frame.title, 5, 15, 10, COLORS.light);
	frame.lines.slice(0, 7).forEach((line, i) => {
		text(ctx, line, 5, 50 + 25 * i, 20, COLORS.white);
	});
}
