/**
 * Drawing the sequencer area's frames on the 480 × 220 screen (see `../../screen/areas.ts`): one entry per
 * frame page, with a short spoken description for screen readers.
 *
 * TE's guide shows none of these pages. The player pages (`player-draw.ts`), the bar card
 * (`bar-draw.ts`) and the step and octave popups (`popup-draw.ts`) are drawn as the device draws
 * them, measured by camera (research 59 §2.7, §2.8, §2.12). The step components page is still
 * ours, built from the pieces of the pages the guide does show (research 55 §5): list selection
 * styles (a white fill for on, an outline for off), 10 px labels over 20 px values, and TE's key
 * icons for the step components.
 */
import type { AreaDrawers } from '../../screen/areas';
import type { ScreenCtx } from '../../screen/context';
import { card, fillBox, strokeBox, text } from '../../screen/draw';
import { screenFont } from '../../screen/font';
import { drawIcon } from '../../screen/icons';
import { COLORS } from '../../screen/palette';
import { describeFrame, renderFrame } from '../../screen/render';
import { drawBar } from './bar-draw';
import { COMPONENT_ICONS, COMPONENT_NAMES } from './components';
import { drawPlayer } from './player-draw';
import { drawCopied, drawOctave, drawStepBox, octaveText } from './popup-draw';
import type { ComponentsFrame, LockFrame, PopupFrame, SequencerFrame } from './frames';

// ─────────────────────────────────────────────────────────────────────────── step components

/** A component's pictogram (TE's key icon, a 40 px box) at `size` px, top-left at (x, y). */
function componentIcon(
	ctx: ScreenCtx,
	index: number,
	x: number,
	y: number,
	size: number,
	color: string
): void {
	drawIcon(ctx, COMPONENT_ICONS[index], x, y, { scale: size / 40, tint: color });
}

/**
 * The step components: the selected steps; the chosen component's key icon on a white card with
 * its name, what its digit does and the ten digits (the black keys, the chosen digit filled); and
 * along the bottom the fourteen components as on the white keys, carded when the selected steps
 * carry them (white: all of them, grey: some).
 */
function drawComponents(ctx: ScreenCtx, frame: ComponentsFrame): void {
	text(ctx, 'steps', 5, 15, 10, COLORS.light);
	const steps = frame.steps.length > 0 ? frame.steps.join(' ') : 'none selected';
	text(ctx, steps, 40, 20, screenFont.fit(steps, 430, 20, 10), COLORS.white);

	const chosen = frame.chosen;
	card(ctx, 20, 35, 110, 110, chosen ? COLORS.white : COLORS.dark);
	if (chosen) {
		componentIcon(ctx, chosen.index, 30, 45, 90, COLORS.ink);
		text(ctx, chosen.name, 150, 55, 20, COLORS.light);
		text(ctx, chosen.value, 150, 100, screenFont.fit(chosen.value, 320, 40, 20), COLORS.white);
		for (let i = 0; i < 10; i++) {
			const digit = (i + 1) % 10;
			const x = 150 + 30 * i;
			const on = chosen.digit === digit;
			if (on) fillBox(ctx, x, 115, 25, 25, COLORS.white, 2.5);
			else strokeBox(ctx, x + 0.5, 115.5, 24, 24, COLORS.grey1, 1, 2.5);
			text(ctx, String(digit), x + 12.5, 134, 20, on ? COLORS.black : COLORS.light, 'center');
		}
	} else {
		text(ctx, 'choose a component', 150, 80, 20, COLORS.light);
		text(ctx, 'then its value', 150, 105, 20, COLORS.dim);
	}

	frame.present.forEach((present, i) => {
		const x = 10.5 + 33 * i;
		const y = 165;
		if (present !== 'none')
			card(ctx, x, y, 30, 30, present === 'all' ? COLORS.white : COLORS.grey4);
		componentIcon(ctx, i, x + 3, y + 3, 24, present === 'none' ? COLORS.grey2 : COLORS.ink);
		if (chosen?.index === i) fillBox(ctx, x, y + 34, 30, 2, COLORS.white);
	});
}

// ─────────────────────────────────────────────────────────────────────────── locks, popups

/** A held step's page: the page itself (its values the step's), and the step's number over it. */
function drawLock(ctx: ScreenCtx, frame: LockFrame, tick: number): void {
	renderFrame(ctx, frame.base, { tick });
	drawStepBox(ctx, frame.step, frame.locking);
}

/** The popups over the page under them. */
function drawPopup(ctx: ScreenCtx, frame: PopupFrame, tick: number): void {
	renderFrame(ctx, frame.base, { tick });
	if (frame.copied) drawCopied(ctx, frame.copied.alpha);
	if (frame.octave) drawOctave(ctx, frame.octave.value, frame.octave.alpha);
}

/** The popups in words, then the page under them. */
function describePopup(frame: PopupFrame): string {
	const popups = [
		frame.octave ? `octave ${octaveText(frame.octave.value)}` : null,
		frame.copied ? 'copied' : null
	].filter(Boolean);
	return `${popups.join(', ')}: ${describeFrame(frame.base)}`;
}

export const drawers: AreaDrawers<SequencerFrame> = {
	bar: {
		draw: (ctx, frame, options) => drawBar(ctx, frame, options.tick ?? 0),
		describe: (f) =>
			`bar menu: ${f.header.map((c) => `${c.label} ${c.value}`).join(', ')}; bar ${f.shown + 1} of ${f.bars}, ${f.length} steps, track scale ${f.scale}; ${f.notes.length} note${f.notes.length === 1 ? '' : 's'} in the bar`
	},
	components: {
		draw: (ctx, frame) => drawComponents(ctx, frame),
		describe: (f) =>
			`step components on steps ${f.steps.join(', ') || 'none'}${f.chosen ? `: ${f.chosen.name} ${f.chosen.value}` : ''}; on them: ${
				f.present
					.map((p, i) => (p === 'none' ? '' : COMPONENT_NAMES[i]))
					.filter(Boolean)
					.join(', ') || 'nothing'
			}`
	},
	player: {
		draw: (ctx, frame) => drawPlayer(ctx, frame),
		describe: (f) => {
			if (f.list)
				return `player list for track ${f.list.track}: arpeggio, hold, maestro; ${f.type} chosen`;
			const cards = f.cards
				.filter((c) => c.label)
				.map((c) => `${c.label} ${c.value}`)
				.join(', ');
			const chord = f.maestro
				? f.maestro.root
					? `; chord of ${f.maestro.notes} note${f.maestro.notes === 1 ? '' : 's'} from ${f.maestro.root}`
					: '; no chord stored'
				: '';
			return `${f.type} player ${f.on ? 'on' : 'off'}${cards ? `: ${cards}` : ''}${chord}`;
		}
	},
	lock: {
		draw: (ctx, frame, options) => drawLock(ctx, frame, options.tick ?? 0),
		describe: (f) =>
			`step ${f.step} held, ${f.locks} lock${f.locks === 1 ? '' : 's'}${f.last ? `, ${f.last.label} ${f.last.value}` : ''}: ${describeFrame(f.base)}`
	},
	popup: {
		draw: (ctx, frame, options) => drawPopup(ctx, frame, options.tick ?? 0),
		describe: describePopup
	}
};
