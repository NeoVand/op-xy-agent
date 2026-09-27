/**
 * Smaller pages: the midi engine (guide art synth-engines-034), three-column lists (instrument-103,
 * com-014, project-019) and a plain text page for screens we have not drawn yet.
 */
import type { ScreenCtx } from '../context';
import { fillBox, listColumn, softLabels, text } from '../draw';
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

/** A three-column list page with soft labels. */
export function drawList(ctx: ScreenCtx, frame: ListFrame): void {
	for (const column of frame.columns) {
		listColumn(ctx, column.items, column.x, column.width, 30.6, column.selected, column.style);
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
